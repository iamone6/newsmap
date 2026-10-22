from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import feedparser
import pytest

from rag import collector, repository
from rag.config import FeedConfig, FeedsFile

FIXTURE = Path(__file__).parent / "fixtures" / "sample_feed.xml"
TEST_FEED_KEY = "__test_joongboo__"


@pytest.fixture
def feed() -> FeedConfig:
    return FeedConfig(feed_key=TEST_FEED_KEY, type="direct", rss_url="https://example.invalid/rss", publisher_name="테스트일보")


@pytest.fixture
def feeds_file() -> FeedsFile:
    return FeedsFile(feeds={}, exclude_sources=[])


def _entries():
    return feedparser.parse(FIXTURE.read_bytes()).entries


def test_fetch_new_items_returns_all_when_nothing_seen(monkeypatch, db_conn, feed, feeds_file):
    monkeypatch.setattr(collector, "_fetch_entries", lambda url: _entries())
    # seen_rss_links 는 article_id FK 라 이 테스트 전용 feed_key 로는 아무것도 없다고 보장된다.
    items = collector.fetch_new_items(db_conn, feed, feeds_file)
    assert len(items) == len(_entries())
    assert all(item.feed_key == TEST_FEED_KEY for item in items)


def test_fetch_new_items_skips_seen_link(monkeypatch, db_conn, feed, feeds_file):
    monkeypatch.setattr(collector, "_fetch_entries", lambda url: _entries())
    first_link = _entries()[0]["link"]

    canonical_url = f"https://example.invalid/test-article-{TEST_FEED_KEY}"
    with db_conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO articles (
                feed_key, publisher_name, rss_link, canonical_url, title, body,
                published_at, published_at_source
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,'collected')
            RETURNING id
            """,
            (TEST_FEED_KEY, "테스트일보", first_link, canonical_url, "테스트 기사", "본문", datetime.now(timezone.utc)),
        )
        article_id = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO seen_rss_links (feed_key, rss_link, article_id) VALUES (%s,%s,%s)",
            (TEST_FEED_KEY, first_link, article_id),
        )

    try:
        items = collector.fetch_new_items(db_conn, feed, feeds_file)
        assert all(item.rss_link != first_link for item in items)
        assert len(items) == len(_entries()) - 1
    finally:
        with db_conn.cursor() as cur:
            cur.execute("DELETE FROM articles WHERE feed_key = %s", (TEST_FEED_KEY,))
