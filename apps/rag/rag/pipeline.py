"""feed_key 하나를 받아 신규 기사를 끝까지(파싱→LLM 판단→청킹→임베딩→저장) 처리한다."""

from __future__ import annotations

import calendar
import concurrent.futures
import logging
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from rag import chunker, collector, config, embedder, google_news, llm_judge, page_parser, regions, repository, usage, wire_agencies
from rag.collector import CollectedItem
from rag.config import FeedConfig, Settings

log = logging.getLogger(__name__)

# imaeil RSS의 <pubDate>는 시간대 표기가 없는 KST 시각인데, feedparser는 시간대가 없으면
# UTC로 간주해버려서 실제보다 9시간 앞선 시각이 저장된다(2026-10-23 실데이터로 확인:
# canonical_url의 발행시각 슬러그와 대조해 +9시간 오차를 검증함). 피드 자체를 고칠 수 없으니
# 이 feed_key 에 대해서만 결과값에서 9시간을 빼는 예외 처리를 둔다.
FEEDS_WITH_NAIVE_KST_PUBDATE = {"imaeil"}


@dataclass
class RunResult:
    total_new: int
    processed: int
    failed: int
    skipped_duplicate_canonical: int


def _struct_to_datetime(struct: time.struct_time | None, *, feed_key: str | None = None) -> datetime | None:
    if struct is None:
        return None
    dt = datetime.fromtimestamp(calendar.timegm(struct), tz=timezone.utc)
    if feed_key in FEEDS_WITH_NAIVE_KST_PUBDATE:
        dt -= timedelta(hours=9)
    return dt


def _resolve_published_at(item: CollectedItem) -> tuple[datetime, str]:
    published = _struct_to_datetime(item.published_parsed, feed_key=item.feed_key)
    if published is not None:
        return published, "rss_published"
    created = _struct_to_datetime(item.created_parsed, feed_key=item.feed_key)
    if created is not None:
        return created, "rss_created"
    return datetime.now(timezone.utc), "collected"


def _region_label(sido: str | None, sigungu: str | None, emd: str | None) -> str:
    parts = [p for p in (sido, sigungu, emd) if p]
    return " ".join(parts) if parts else "전국"


def _build_images_to_save(
    parsed_images: list[page_parser.ParsedImage],
    judgment_images: list[llm_judge.ImageJudgment],
    thumbnail_url: str | None,
    resolve_wire_agency_id,
) -> list[repository.ImageToSave]:
    """파싱된 이미지 목록과 LLM 판단을 합쳐 저장용 이미지 목록을 만든다.

    본문에 썸네일과 같은 URL의 이미지가 중복으로 등장해도(예: jnilbo) is_thumbnail=True는
    최초 1건에만 붙인다. 그렇지 않으면 article_images_one_thumbnail_idx 부분 유니크
    인덱스를 위반해 기사 저장 전체가 실패한다.
    """
    judgment_by_index = {j.index: j for j in judgment_images}
    images_to_save: list[repository.ImageToSave] = []
    thumbnail_matched = False
    for image in parsed_images:
        image_judgment = judgment_by_index.get(image.position)
        credit_raw = image_judgment.credit_raw if image_judgment else None
        license_agency_id = resolve_wire_agency_id(image_judgment.wire_agency_name) if image_judgment else None
        is_thumbnail = bool(thumbnail_url) and not thumbnail_matched and image.image_url == thumbnail_url
        thumbnail_matched = thumbnail_matched or is_thumbnail
        images_to_save.append(
            repository.ImageToSave(
                position=image.position,
                image_url=image.image_url,
                caption=image.caption,
                credit_raw=credit_raw,
                license_agency_id=license_agency_id,
                is_thumbnail=is_thumbnail,
            )
        )
    if thumbnail_url and not thumbnail_matched:
        images_to_save.append(
            repository.ImageToSave(
                position=len(images_to_save),
                image_url=thumbnail_url,
                caption=None,
                credit_raw=None,
                license_agency_id=None,
                is_thumbnail=True,
            )
        )
    return images_to_save


def _process_item(conn, settings: Settings, feed: FeedConfig, item: CollectedItem) -> bool:
    """신규 기사 하나를 처리한다. canonical_url 중복이면 False(새 기사 아님), 저장했으면 True."""
    article_url = item.rss_link
    if feed.type == "google_news_search":
        article_url = google_news.decode_real_url(item.rss_link)

    html_text, final_url = page_parser.fetch(article_url)
    publisher_name = item.publisher_name or item.source_name or feed.publisher_name
    parsed = page_parser.parse(html_text, fetched_url=final_url, publisher_name=publisher_name)

    existing_id = repository.find_article_id_by_canonical_url(conn, parsed.canonical_url)
    if existing_id is not None:
        repository.mark_seen(conn, feed_key=item.feed_key, rss_link=item.rss_link, article_id=existing_id)
        return False

    published_at, published_at_source = _resolve_published_at(item)
    rss_created_at = _struct_to_datetime(item.created_parsed, feed_key=item.feed_key)
    rss_updated_at = _struct_to_datetime(item.updated_parsed, feed_key=item.feed_key)

    judgment = llm_judge.judge_article(
        title=parsed.title,
        body=parsed.body,
        image_captions=[img.caption for img in parsed.images],
        base_url=settings.deepinfra_base_url,
        api_key=settings.deepinfra_api_key,
        model=settings.llm_model,
    )

    region_match = regions.match_region(
        conn, sido_name=judgment.sido_name, sigungu_name=judgment.sigungu_name, emd_name=judgment.emd_name
    )
    region_to_save = None
    region_codes: list[str] = []
    if judgment.sido_name:
        region_to_save = repository.RegionToSave(
            sido_code=region_match.sido_code,
            sigungu_code=region_match.sigungu_code,
            emd_code=region_match.emd_code,
            sido_name=judgment.sido_name,
            sigungu_name=judgment.sigungu_name,
            emd_name=judgment.emd_name,
        )
        matched_codes = [c for c in (region_match.emd_code, region_match.sigungu_code, region_match.sido_code) if c]
        region_codes = regions.expand_region_codes(conn, matched_codes)

    section_id = llm_judge.SECTION_CODE_TO_ID.get(judgment.section_code) if judgment.section_code else None
    wire_agency_id = wire_agencies.match_wire_agency(conn, judgment.wire_agency_name)

    images_to_save = _build_images_to_save(
        parsed.images,
        judgment.images,
        parsed.thumbnail_url,
        lambda name: wire_agencies.match_wire_agency(conn, name),
    )

    region_label = _region_label(judgment.sido_name, judgment.sigungu_name, judgment.emd_name)
    chunks_raw = chunker.chunk_article(
        body=parsed.body,
        title=parsed.title,
        region_label=region_label,
        published_at=published_at,
        chunk_max_tokens=settings.chunk_max_tokens,
        chunk_overlap_ratio=settings.chunk_overlap_ratio,
    )
    embeddings = embedder.embed_documents(
        [c.embed_text for c in chunks_raw],
        base_url=settings.deepinfra_base_url,
        api_key=settings.deepinfra_api_key,
        model=settings.embedding_model,
        expected_dimensions=settings.embedding_dimensions,
    )
    # 임베딩은 토큰 사용량을 API 응답에서 안 받아오므로, 보낸 텍스트의 Qwen3 토큰 수(이미 계산해둔
    # chunk.token_count, embed_text 헤더만큼은 약간 과소추정)로 대신한다 — 비용 가늠용이라 근사치면 충분.
    usage.record_embedding(sum(c.token_count for c in chunks_raw))
    chunks_to_save = [
        repository.ChunkToSave(
            chunk_index=c.chunk_index,
            content=c.content,
            embed_text=c.embed_text,
            token_count=c.token_count,
            embedding=vector,
        )
        for c, vector in zip(chunks_raw, embeddings)
    ]

    article = repository.ArticleToSave(
        feed_key=item.feed_key,
        publisher_name=publisher_name,
        rss_link=item.rss_link,
        canonical_url=parsed.canonical_url,
        title=parsed.title,
        subtitle=parsed.subtitle,
        body=parsed.body,
        reporters=judgment.reporters,
        wire_agency_id=wire_agency_id,
        wire_source_raw=judgment.wire_agency_name,
        published_at=published_at,
        published_at_source=published_at_source,
        rss_created_at=rss_created_at,
        rss_updated_at=rss_updated_at,
        region=region_to_save,
        section_id=section_id,
        images=images_to_save,
        chunks=chunks_to_save,
        region_codes=region_codes,
    )
    repository.save_article(conn, article)
    return True


def run(feed_key: str) -> RunResult:
    threading.current_thread().name = feed_key  # run_all() 에서 병렬 실행 시 로그에서 피드를 구분하기 위함
    settings = config.load_settings()
    feeds_file = config.load_feeds()
    feed = feeds_file.feeds.get(feed_key)
    if feed is None:
        raise RuntimeError(f"feeds.yaml 에 feed_key={feed_key!r} 가 없다.")

    conn = repository.connect(
        host=settings.db_host,
        port=settings.db_port,
        dbname=settings.db_database,
        user=settings.db_username,
        password=settings.db_password,
    )
    try:
        items = collector.fetch_new_items(conn, feed, feeds_file, max_items=settings.max_items_per_batch)
        processed = failed = skipped_duplicate = 0
        for item in items:
            try:
                saved = _process_item(conn, settings, feed, item)
                if saved:
                    processed += 1
                else:
                    skipped_duplicate += 1
            except Exception:
                log.exception("기사 처리 실패: feed_key=%s rss_link=%s", feed_key, item.rss_link)
                failed += 1
        return RunResult(
            total_new=len(items), processed=processed, failed=failed, skipped_duplicate_canonical=skipped_duplicate
        )
    finally:
        conn.close()


def run_all() -> dict[str, RunResult]:
    """feeds.yaml 의 모든 feed_key 를 `MAX_CONCURRENT_FEEDS` 개씩 동시에 처리한다.

    피드별 처리는 각자 자기 DB 커넥션을 열고 닫는 자기완결적인 `run()` 호출이라 스레드로
    동시에 돌려도 안전하다. 피드 하나가 실패해도 나머지는 계속 처리한다.
    """
    settings = config.load_settings()
    feeds_file = config.load_feeds()
    chunker.count_tokens("")  # Qwen3 토크나이저를 메인 스레드에서 먼저 1회 빌드해 캐시 레이스를 없앤다.

    results: dict[str, RunResult] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=settings.max_concurrent_feeds) as executor:
        future_to_key = {executor.submit(run, feed_key): feed_key for feed_key in feeds_file.feeds}
        for future in concurrent.futures.as_completed(future_to_key):
            feed_key = future_to_key[future]
            try:
                results[feed_key] = future.result()
            except Exception:
                log.exception("피드 처리 실패: feed_key=%s", feed_key)
                results[feed_key] = RunResult(total_new=0, processed=0, failed=1, skipped_duplicate_canonical=0)
    return results
