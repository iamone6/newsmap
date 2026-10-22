"""feed_key 하나를 받아 신규 기사를 끝까지(파싱→LLM 판단→청킹→임베딩→저장) 처리한다."""

from __future__ import annotations

import calendar
import logging
import time
from dataclasses import dataclass
from datetime import datetime, timezone

from rag import chunker, collector, config, embedder, google_news, llm_judge, page_parser, regions, repository, wire_agencies
from rag.collector import CollectedItem
from rag.config import FeedConfig, Settings

log = logging.getLogger(__name__)


@dataclass
class RunResult:
    total_new: int
    processed: int
    failed: int
    skipped_duplicate_canonical: int


def _struct_to_datetime(struct: time.struct_time | None) -> datetime | None:
    if struct is None:
        return None
    return datetime.fromtimestamp(calendar.timegm(struct), tz=timezone.utc)


def _resolve_published_at(item: CollectedItem) -> tuple[datetime, str]:
    published = _struct_to_datetime(item.published_parsed)
    if published is not None:
        return published, "rss_published"
    created = _struct_to_datetime(item.created_parsed)
    if created is not None:
        return created, "rss_created"
    return datetime.now(timezone.utc), "collected"


def _region_label(sido: str | None, sigungu: str | None, emd: str | None) -> str:
    parts = [p for p in (sido, sigungu, emd) if p]
    return " ".join(parts) if parts else "전국"


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
    rss_created_at = _struct_to_datetime(item.created_parsed)
    rss_updated_at = _struct_to_datetime(item.updated_parsed)

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

    judgment_by_index = {j.index: j for j in judgment.images}
    images_to_save: list[repository.ImageToSave] = []
    thumbnail_matched = False
    for image in parsed.images:
        image_judgment = judgment_by_index.get(image.position)
        credit_raw = image_judgment.credit_raw if image_judgment else None
        license_agency_id = wire_agencies.match_wire_agency(conn, image_judgment.wire_agency_name) if image_judgment else None
        is_thumbnail = bool(parsed.thumbnail_url) and image.image_url == parsed.thumbnail_url
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
    if parsed.thumbnail_url and not thumbnail_matched:
        images_to_save.append(
            repository.ImageToSave(
                position=len(images_to_save),
                image_url=parsed.thumbnail_url,
                caption=None,
                credit_raw=None,
                license_agency_id=None,
                is_thumbnail=True,
            )
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
        items = collector.fetch_new_items(conn, feed, feeds_file)
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
