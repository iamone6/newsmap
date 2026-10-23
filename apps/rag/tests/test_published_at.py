import time

from rag.collector import CollectedItem
from rag.pipeline import _resolve_published_at


def _item(**kwargs) -> CollectedItem:
    base = dict(
        feed_key="f",
        rss_link="https://example.com/1",
        title="t",
        published_parsed=None,
        created_parsed=None,
        updated_parsed=None,
        publisher_name="언론사",
    )
    base.update(kwargs)
    return CollectedItem(**base)


def test_prefers_published_over_created():
    published = time.strptime("2026-10-20 10:00:00", "%Y-%m-%d %H:%M:%S")
    created = time.strptime("2026-10-19 10:00:00", "%Y-%m-%d %H:%M:%S")
    dt, source = _resolve_published_at(_item(published_parsed=published, created_parsed=created))
    assert source == "rss_published"
    assert dt.year == 2026 and dt.month == 10 and dt.day == 20


def test_falls_back_to_created_when_no_published():
    created = time.strptime("2026-10-19 10:00:00", "%Y-%m-%d %H:%M:%S")
    dt, source = _resolve_published_at(_item(created_parsed=created))
    assert source == "rss_created"
    assert dt.day == 19


def test_falls_back_to_collected_time_when_neither_present():
    dt, source = _resolve_published_at(_item())
    assert source == "collected"
    assert dt.tzinfo is not None


def test_imaeil_naive_pubdate_is_corrected_by_9_hours():
    # imaeil RSS 는 시간대 표기가 없는 KST 시각을 내려주는데, feedparser 가 이를 UTC로 간주해
    # 9시간 앞선 시각으로 파싱한다. feed_key="imaeil" 이면 그 오차를 빼서 보정해야 한다.
    naive_as_utc = time.strptime("2026-10-23 19:15:48", "%Y-%m-%d %H:%M:%S")
    dt, source = _resolve_published_at(_item(feed_key="imaeil", published_parsed=naive_as_utc))
    assert source == "rss_published"
    assert dt.hour == 10 and dt.minute == 15 and dt.day == 23


def test_other_feeds_are_not_affected_by_imaeil_correction():
    published = time.strptime("2026-10-23 19:15:48", "%Y-%m-%d %H:%M:%S")
    dt, _ = _resolve_published_at(_item(feed_key="other_feed", published_parsed=published))
    assert dt.hour == 19
