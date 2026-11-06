"""이미 저장한 기사의 RSS updated 시각이 바뀌면 articles.rss_updated_at 만 갱신한다 (decisions 문서 5장).

- `_refresh_rss_updated_at` 은 DB 없이 갱신 조건만 확인한다(갱신 함수는 가짜로 바꾼다).
- 마지막 테스트는 로컬 DB 로 fetch_new_items 전체 경로를 확인한다(없으면 conftest 가 스킵).
"""

from __future__ import annotations

import time
from datetime import datetime, timezone

import pytest

from rag import collector, repository
from rag.config import FeedConfig, FeedsFile
from rag.repository import SeenLink

TEST_FEED_KEY = "__test_rss_updated__"
OLD = datetime(2026, 11, 1, 9, 0, tzinfo=timezone.utc)
NEW_STRUCT = time.strptime("2026-11-02 10:30:00", "%Y-%m-%d %H:%M:%S")
NEW = datetime(2026, 11, 2, 10, 30, tzinfo=timezone.utc)


@pytest.fixture
def feed() -> FeedConfig:
    return FeedConfig(feed_key=TEST_FEED_KEY, type="direct", rss_url="https://example.invalid/rss", publisher_name="테스트일보")


@pytest.fixture
def updates(monkeypatch) -> list[tuple[int, datetime]]:
    """repository.update_rss_updated_at 호출을 기록만 한다."""
    calls: list[tuple[int, datetime]] = []
    monkeypatch.setattr(
        repository, "update_rss_updated_at", lambda conn, *, article_id, rss_updated_at: calls.append((article_id, rss_updated_at))
    )
    return calls


# ── 갱신 조건 (DB 없음) ──────────────────────────────────────────────


def test_changed_updated_time_is_saved(feed, updates):
    seen = SeenLink(article_id=7, article_feed_key=TEST_FEED_KEY, rss_updated_at=OLD)
    assert collector._refresh_rss_updated_at(None, feed, seen, {"updated_parsed": NEW_STRUCT}) is True
    assert updates == [(7, NEW)]


def test_same_updated_time_is_not_saved_again(feed, updates):
    seen = SeenLink(article_id=7, article_feed_key=TEST_FEED_KEY, rss_updated_at=NEW)
    assert collector._refresh_rss_updated_at(None, feed, seen, {"updated_parsed": NEW_STRUCT}) is False
    assert updates == []


def test_missing_updated_time_keeps_existing_value(feed, updates):
    seen = SeenLink(article_id=7, article_feed_key=TEST_FEED_KEY, rss_updated_at=OLD)
    assert collector._refresh_rss_updated_at(None, feed, seen, {}) is False
    assert updates == []


def test_first_updated_time_fills_empty_value(feed, updates):
    seen = SeenLink(article_id=7, article_feed_key=TEST_FEED_KEY, rss_updated_at=None)
    assert collector._refresh_rss_updated_at(None, feed, seen, {"updated_parsed": NEW_STRUCT}) is True
    assert updates == [(7, NEW)]


def test_skipped_link_has_no_article_to_update(feed, updates):
    seen = SeenLink(article_id=None, article_feed_key=None, rss_updated_at=None)
    assert collector._refresh_rss_updated_at(None, feed, seen, {"updated_parsed": NEW_STRUCT}) is False
    assert updates == []


def test_article_saved_by_another_feed_is_not_updated(feed, updates):
    # canonical_url 중복으로 다른 피드의 기사에 연결된 링크: 처음 저장한 피드의 값만 따른다
    seen = SeenLink(article_id=7, article_feed_key="other_feed", rss_updated_at=OLD)
    assert collector._refresh_rss_updated_at(None, feed, seen, {"updated_parsed": NEW_STRUCT}) is False
    assert updates == []


def test_naive_kst_feed_is_corrected_before_compare(updates):
    # imaeil 은 시간대 없는 KST 라 9시간을 빼서 비교·저장한다 (rss_time.FEEDS_WITH_NAIVE_KST_PUBDATE)
    imaeil = FeedConfig(feed_key="imaeil", type="direct", rss_url="https://example.invalid/rss", publisher_name="매일신문")
    corrected = datetime(2026, 11, 2, 1, 30, tzinfo=timezone.utc)
    seen = SeenLink(article_id=7, article_feed_key="imaeil", rss_updated_at=corrected)
    assert collector._refresh_rss_updated_at(None, imaeil, seen, {"updated_parsed": NEW_STRUCT}) is False
    assert updates == []


# ── fetch_new_items 전체 경로 (로컬 DB) ───────────────────────────────


def test_fetch_new_items_updates_seen_article_and_counts_it(monkeypatch, db_conn, feed):
    link = "https://example.invalid/rss-updated-article"
    entries = [{"link": link, "title": "기사", "updated_parsed": NEW_STRUCT}]
    monkeypatch.setattr(collector, "_fetch_entries", lambda url: entries)
    with db_conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO articles (feed_key, publisher_name, rss_link, canonical_url, title, body,
                                  published_at, published_at_source, rss_updated_at)
            VALUES (%s, '테스트일보', %s, %s, '기사', '본문', %s, 'collected', %s) RETURNING id
            """,
            (TEST_FEED_KEY, link, f"{link}#canonical", OLD, OLD),
        )
        article_id = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO seen_rss_links (feed_key, rss_link, article_id) VALUES (%s, %s, %s)",
            (TEST_FEED_KEY, link, article_id),
        )
    try:
        first = collector.fetch_new_items(db_conn, feed, FeedsFile(feeds={}, exclude_sources=[]))
        second = collector.fetch_new_items(db_conn, feed, FeedsFile(feeds={}, exclude_sources=[]))
        with db_conn.cursor() as cur:
            cur.execute("SELECT rss_updated_at FROM articles WHERE id = %s", (article_id,))
            saved = cur.fetchone()[0]

        assert first.items == [] and first.rss_updated == 1
        assert second.rss_updated == 0  # 이미 같은 값이면 다시 갱신하지 않는다
        assert saved == NEW
    finally:
        with db_conn.cursor() as cur:
            cur.execute("DELETE FROM articles WHERE feed_key = %s", (TEST_FEED_KEY,))
