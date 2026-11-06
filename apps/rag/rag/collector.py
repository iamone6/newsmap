"""피드를 가져와 `seen_rss_links` 대비 신규 항목만 추려낸다.

이미 본 항목은 페이지를 열지 않는다. 다만 저장한 기사라면 RSS 의 updated 시각이 바뀌었을 때
`articles.rss_updated_at` 만 갱신한다(decisions 문서 5장). 본문은 다시 파싱하지 않는다.

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

from rag import google_news, repository, rss_time
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


@dataclass(frozen=True)
class FetchResult:
    """피드 한 번 수집 결과"""

    items: list[CollectedItem]
    """처리할 신규 항목 (최대 max_items 개)"""
    rss_updated: int
    """이미 저장한 기사 중 rss_updated_at 을 갱신한 수"""


def _fetch_entries(rss_url: str) -> list[dict]:
    response = requests.get(rss_url, headers={"User-Agent": USER_AGENT}, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    return feedparser.parse(response.content).entries


def _refresh_rss_updated_at(conn, feed: FeedConfig, seen: repository.SeenLink, entry: dict) -> bool:
    """이미 저장한 기사의 RSS updated 시각이 바뀌었으면 articles.rss_updated_at 만 갱신한다.

    - 지역이 없어 건너뛴 링크(article_id 없음)는 갱신할 기사가 없다.
    - canonical_url 중복으로 다른 피드의 기사에 연결된 링크는 갱신하지 않는다. 피드마다 updated 값이
      달라 실행마다 값이 왔다 갔다 하지 않게, 기사를 처음 저장한 피드의 RSS 값만 따른다.
    - RSS 에 시각이 없으면(None) 기존 값을 지우지 않는다.
    - updated_parsed 는 신규 저장 때(pipeline)와 같은 방식으로 읽는다. feedparser 는 <updated> 가 없으면
      published_parsed 를 대신 돌려주므로, 저장 때와 같은 값끼리 비교해야 쓸데없는 갱신이 없다.

    Args:
        conn: DB 커넥션.
        feed: 피드 설정.
        seen: 이미 본 링크 정보.
        entry: feedparser 항목.

    Returns:
        갱신했으면 True.
    """
    if seen.article_id is None or seen.article_feed_key != feed.feed_key:
        return False
    new_value = rss_time.struct_to_datetime(entry.get("updated_parsed"), feed_key=feed.feed_key)
    if new_value is None or new_value == seen.rss_updated_at:
        return False
    repository.update_rss_updated_at(conn, article_id=seen.article_id, rss_updated_at=new_value)
    return True


def fetch_new_items(
    conn,
    feed: FeedConfig,
    feeds_file: FeedsFile,
    max_items: int = 50,
) -> FetchResult:
    """신규 항목을 최대 `max_items`개까지만 반환한다. 피드 순서(보통 최신순)대로 앞에서부터 채우고,
    상한을 넘는 나머지 항목은 아직 '본 적 없음' 상태로 남아 다음 실행에서 이어 처리된다.
    지나가며 만난 이미 본 항목은 rss_updated_at 갱신만 한다(`_refresh_rss_updated_at`).

    Args:
        conn: DB 커넥션.
        feed: 피드 설정.
        feeds_file: 전체 피드 설정 (exclude_sources).
        max_items: 신규 항목 상한.

    Returns:
        신규 항목과 rss_updated_at 갱신 수.
    """
    entries = _fetch_entries(feed.rss_url)
    items: list[CollectedItem] = []
    rss_updated = 0

    for entry in entries:
        if len(items) >= max_items:
            break

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

        # 저장한 기사뿐 아니라 지역이 없어 건너뛴 링크도 다시 열지 않는다
        seen = repository.find_seen_link(conn, feed_key=feed.feed_key, rss_link=link)
        if seen is not None:
            if _refresh_rss_updated_at(conn, feed, seen, entry):
                rss_updated += 1
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

    return FetchResult(items=items, rss_updated=rss_updated)
