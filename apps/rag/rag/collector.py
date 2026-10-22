"""피드를 가져와 `seen_rss_links` 대비 신규 항목만 추려낸다.

중복 체크는 (아직 디코딩하지 않은) 원본 피드 링크로 한다 — google_news_search 타입의
구글 리다이렉트 링크를 매번 디코딩하는 건 네트워크 호출이 드는 일이라, 이미 본 적
있는 항목이면 디코딩 자체를 하지 않는다. 실제 URL 디코딩은 신규 항목으로 확인된
뒤 파이프라인에서 한다.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

import feedparser
import requests

from rag import google_news, repository
from rag.config import FeedConfig, FeedsFile

USER_AGENT = "Mozilla/5.0 (compatible; newsmap-rag/0.1; +https://github.com/iamone6/newsmap)"
REQUEST_TIMEOUT = 15


@dataclass(frozen=True)
class CollectedItem:
    feed_key: str
    rss_link: str
    title: str
    published_parsed: time.struct_time | None
    created_parsed: time.struct_time | None
    updated_parsed: time.struct_time | None
    publisher_name: str | None  # direct 타입은 feed 설정값, google_news_search 는 아래 source_name
    source_host: str | None = None
    source_name: str | None = None


def _fetch_entries(rss_url: str) -> list[dict]:
    response = requests.get(rss_url, headers={"User-Agent": USER_AGENT}, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    return feedparser.parse(response.content).entries


def fetch_new_items(
    conn,
    feed: FeedConfig,
    feeds_file: FeedsFile,
) -> list[CollectedItem]:
    entries = _fetch_entries(feed.rss_url)
    items: list[CollectedItem] = []

    for entry in entries:
        link = entry.get("link")
        if not link:
            continue

        if feed.type == "google_news_search":
            if google_news.is_excluded(entry, feeds_file.exclude_sources):
                continue
            publisher_name = None
            source_host = google_news.source_host(entry)
            source_name = google_news.source_name(entry)
        else:
            publisher_name = feed.publisher_name
            source_host = None
            source_name = None

        if repository.find_seen_article_id(conn, feed_key=feed.feed_key, rss_link=link) is not None:
            continue

        items.append(
            CollectedItem(
                feed_key=feed.feed_key,
                rss_link=link,
                title=entry.get("title", ""),
                published_parsed=entry.get("published_parsed"),
                created_parsed=entry.get("created_parsed"),
                updated_parsed=entry.get("updated_parsed"),
                publisher_name=publisher_name,
                source_host=source_host,
                source_name=source_name,
            )
        )

    return items
