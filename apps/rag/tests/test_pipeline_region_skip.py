"""지역 코드가 하나도 없는 기사를 저장하지 않고 건너뛰는 규칙 (decisions 문서 4·5장, 2026-11-05).

- `_skip_reason_for` 는 DB 없이 판단 규칙만 확인한다.
- `_process_item`·`collector` 테스트는 로컬 DB(행정동 마스터 적재 필요)를 쓰고, 없으면 conftest 가 스킵한다.
  페이지 수집·LLM·임베딩 호출은 가짜로 바꿔 외부 API 를 부르지 않는다.
"""

from __future__ import annotations

from pathlib import Path

import feedparser
import pytest

from rag import collector, config, embedder, llm_judge, page_parser, pipeline, repository
from rag.collector import CollectedItem
from rag.config import FeedConfig, FeedsFile
from rag.llm_judge import ArticleJudgment
from rag.page_parser import ParsedArticle
from rag.regions import RegionMatch

TEST_FEED_KEY = "__test_region_skip__"
FIXTURE = Path(__file__).parent / "fixtures" / "sample_feed.xml"


# ── 판단 규칙 (DB 없음) ──────────────────────────────────────────────


@pytest.mark.parametrize("sido_name", [None, "", "   "])
def test_no_sido_name_means_no_region(sido_name):
    reason = pipeline._skip_reason_for(sido_name, RegionMatch(None, None, None))
    assert reason == repository.SKIP_NO_REGION


def test_names_without_any_code_means_not_match_region():
    reason = pipeline._skip_reason_for("없는도", RegionMatch(None, None, None))
    assert reason == repository.SKIP_NOT_MATCH_REGION


@pytest.mark.parametrize(
    "region_match",
    [
        RegionMatch("4100000000", None, None),  # 시도만 매칭 (시군구·읍면동 실패) → 저장
        RegionMatch(None, "4111700000", None),
        RegionMatch(None, None, "4111760000"),
        RegionMatch("4100000000", "4111700000", "4111760000"),
    ],
)
def test_any_matched_code_means_save(region_match):
    assert pipeline._skip_reason_for("경기도", region_match) is None


# ── _process_item (로컬 DB) ─────────────────────────────────────────


@pytest.fixture
def settings() -> config.Settings:
    return config.Settings(
        db_host="unused",
        db_port=5432,
        db_database="unused",
        db_username="unused",
        db_password="unused",
        deepinfra_api_key="unused",
        deepinfra_base_url="unused",
        embedding_model="unused",
        embedding_dimensions=1024,
        llm_model="unused",
        chunk_max_tokens=500,
        chunk_overlap_ratio=0.1,
        max_items_per_batch=50,
        max_concurrent_feeds=1,
    )


@pytest.fixture
def feed() -> FeedConfig:
    return FeedConfig(feed_key=TEST_FEED_KEY, type="direct", rss_url="https://example.invalid/rss", publisher_name="테스트일보")


@pytest.fixture
def cleanup(db_conn):
    """테스트가 만든 기사·seen 행을 지운다 (건너뛴 seen 행은 기사 CASCADE 로 안 지워지므로 따로)."""
    yield
    with db_conn.cursor() as cur:
        cur.execute("DELETE FROM articles WHERE feed_key = %s", (TEST_FEED_KEY,))
        cur.execute("DELETE FROM seen_rss_links WHERE feed_key = %s", (TEST_FEED_KEY,))


def _item(link: str) -> CollectedItem:
    return CollectedItem(
        feed_key=TEST_FEED_KEY,
        rss_link=link,
        title="테스트 기사",
        published_parsed=None,
        created_parsed=None,
        updated_parsed=None,
        publisher_name="테스트일보",
    )


def _fake_page_and_llm(monkeypatch, *, link: str, judgment: ArticleJudgment) -> None:
    """페이지 수집·파싱·LLM 판단·임베딩을 가짜로 바꾼다. 임베딩이 불리면 저장 경로까지 간 것이다."""
    parsed = ParsedArticle(
        title="테스트 기사",
        subtitle=None,
        body="첫 문단입니다.\n\n두 번째 문단입니다.",
        canonical_url=f"{link}#canonical",
        thumbnail_url=None,
        images=[],
    )
    monkeypatch.setattr(page_parser, "fetch", lambda url: ("<html></html>", url))
    monkeypatch.setattr(page_parser, "parse", lambda html, fetched_url, publisher_name: parsed)
    monkeypatch.setattr(llm_judge, "judge_article", lambda **kwargs: judgment)
    monkeypatch.setattr(
        embedder, "embed_documents", lambda texts, **kwargs: [[0.01] * 1024 for _ in texts]
    )


def _seen_row(db_conn, link: str):
    with db_conn.cursor() as cur:
        cur.execute(
            "SELECT article_id, skip_reason FROM seen_rss_links WHERE feed_key = %s AND rss_link = %s",
            (TEST_FEED_KEY, link),
        )
        return cur.fetchone()


def _article_count(db_conn) -> int:
    with db_conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM articles WHERE feed_key = %s", (TEST_FEED_KEY,))
        return cur.fetchone()[0]


def test_article_without_region_is_skipped_and_recorded(monkeypatch, db_conn, cleanup, settings, feed):
    link = "https://example.invalid/no-region"
    _fake_page_and_llm(monkeypatch, link=link, judgment=ArticleJudgment(sido_name=None))

    outcome = pipeline._process_item(db_conn, settings, feed, _item(link))

    assert outcome == pipeline.ItemOutcome.SKIPPED_NO_REGION
    assert _seen_row(db_conn, link) == (None, repository.SKIP_NO_REGION)
    assert _article_count(db_conn) == 0


def test_article_whose_region_does_not_match_is_skipped(monkeypatch, db_conn, cleanup, settings, feed):
    link = "https://example.invalid/not-match"
    judgment = ArticleJudgment(sido_name="존재하지않는도", sigungu_name="가상시", emd_name="가상동")
    _fake_page_and_llm(monkeypatch, link=link, judgment=judgment)

    outcome = pipeline._process_item(db_conn, settings, feed, _item(link))

    assert outcome == pipeline.ItemOutcome.SKIPPED_NOT_MATCH_REGION
    assert _seen_row(db_conn, link) == (None, repository.SKIP_NOT_MATCH_REGION)
    assert _article_count(db_conn) == 0


def test_article_with_only_sido_matched_is_saved(monkeypatch, db_conn, cleanup, settings, feed):
    # 시군구·읍면동은 매칭에 실패해도 시도 코드가 있으면 저장한다 (실패한 단위만 NULL, 이름은 보관)
    link = "https://example.invalid/sido-only"
    judgment = ArticleJudgment(sido_name="경기도", sigungu_name="가상시", emd_name=None)
    _fake_page_and_llm(monkeypatch, link=link, judgment=judgment)

    outcome = pipeline._process_item(db_conn, settings, feed, _item(link))

    assert outcome == pipeline.ItemOutcome.SAVED
    article_id, skip_reason = _seen_row(db_conn, link)
    assert article_id is not None and skip_reason is None
    with db_conn.cursor() as cur:
        cur.execute(
            "SELECT sido_code, sigungu_code, sigungu_name FROM article_regions WHERE article_id = %s", (article_id,)
        )
        assert cur.fetchone() == ("4100000000", None, "가상시")


# ── collector: 건너뛴 링크는 다시 고르지 않는다 ─────────────────────────


def test_collector_does_not_pick_skipped_link_again(monkeypatch, db_conn, cleanup, feed):
    entries = feedparser.parse(FIXTURE.read_bytes()).entries
    monkeypatch.setattr(collector, "_fetch_entries", lambda url: entries)
    skipped_link = entries[0]["link"]
    repository.mark_skipped(db_conn, feed_key=TEST_FEED_KEY, rss_link=skipped_link, skip_reason=repository.SKIP_NO_REGION)

    items = collector.fetch_new_items(db_conn, feed, FeedsFile(feeds={}, exclude_sources=[]))

    assert all(item.rss_link != skipped_link for item in items)
    assert len(items) == len(entries) - 1


def test_mark_skipped_twice_keeps_one_row(db_conn, cleanup):
    link = "https://example.invalid/twice"
    repository.mark_skipped(db_conn, feed_key=TEST_FEED_KEY, rss_link=link, skip_reason=repository.SKIP_NO_REGION)
    repository.mark_skipped(db_conn, feed_key=TEST_FEED_KEY, rss_link=link, skip_reason=repository.SKIP_NO_REGION)
    with db_conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM seen_rss_links WHERE feed_key = %s", (TEST_FEED_KEY,))
        assert cur.fetchone()[0] == 1
