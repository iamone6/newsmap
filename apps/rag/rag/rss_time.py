"""RSS 항목의 시각(feedparser 의 time.struct_time)을 timezone-aware datetime 으로 바꾼다.

collector(이미 본 기사의 rss_updated_at 갱신)와 pipeline(신규 기사 저장)이 같이 쓴다.
pipeline 이 collector 를 import 하므로, 둘 다 쓰는 이 함수는 따로 둔다(순환 import 방지).
"""

from __future__ import annotations

import calendar
import time
from datetime import datetime, timedelta, timezone

# imaeil RSS의 <pubDate>는 시간대 표기가 없는 KST 시각인데, feedparser는 시간대가 없으면
# UTC로 간주해버려서 실제보다 9시간 앞선 시각이 저장된다(2026-10-23 실데이터로 확인:
# canonical_url의 발행시각 슬러그와 대조해 +9시간 오차를 검증함). 피드 자체를 고칠 수 없으니
# 이 feed_key 에 대해서만 결과값에서 9시간을 빼는 예외 처리를 둔다.
FEEDS_WITH_NAIVE_KST_PUBDATE = {"imaeil"}


def struct_to_datetime(struct: time.struct_time | None, *, feed_key: str | None = None) -> datetime | None:
    """feedparser 가 UTC 로 해석한 struct_time 을 UTC datetime 으로 바꾼다.

    Args:
        struct: feedparser 의 *_parsed 값. 없으면 None.
        feed_key: 피드 식별자. FEEDS_WITH_NAIVE_KST_PUBDATE 에 있으면 9시간을 뺀다.

    Returns:
        timezone-aware datetime. struct 가 None 이면 None.
    """
    if struct is None:
        return None
    dt = datetime.fromtimestamp(calendar.timegm(struct), tz=timezone.utc)
    if feed_key in FEEDS_WITH_NAIVE_KST_PUBDATE:
        dt -= timedelta(hours=9)
    return dt
