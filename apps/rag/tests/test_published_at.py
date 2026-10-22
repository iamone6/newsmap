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
