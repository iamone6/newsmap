"""DeepInfra 호출이 일시적으로 실패할 때(예: engine_overloaded 429) 쓰는 고정 간격 재시도.

LLM 판단·임베딩 호출에서만 쓴다. RSS/페이지 수집처럼 실패해도 다음 실행에 재시도되는
단계에는 쓰지 않는다(이미 "실패는 로그로만 남기고 다음 cron에 맡긴다" 원칙으로 충분).
"""

from __future__ import annotations

import logging
import time
from collections.abc import Callable
from typing import TypeVar

T = TypeVar("T")

log = logging.getLogger(__name__)

RETRY_DELAY_SECONDS = 1
MAX_RETRIES = 3


def call_with_retry(func: Callable[[], T], *, description: str) -> T:
    """func() 를 호출하다 예외가 나면 RETRY_DELAY_SECONDS 초 후 재시도, 최대 MAX_RETRIES 번까지
    (최초 1회 + 재시도 3회 = 최대 4회 시도). 마지막 시도까지 실패하면 그 예외를 그대로 올린다."""
    last_exc: Exception
    for attempt in range(1, MAX_RETRIES + 2):
        try:
            return func()
        except Exception as exc:  # noqa: BLE001 - 외부 API 호출 실패는 종류를 가리지 않고 재시도한다
            last_exc = exc
            if attempt > MAX_RETRIES:
                break
            log.warning(
                "%s 실패(%d/%d번째 시도), %d초 후 재시도: %s",
                description,
                attempt,
                MAX_RETRIES + 1,
                RETRY_DELAY_SECONDS,
                exc,
            )
            time.sleep(RETRY_DELAY_SECONDS)
    raise last_exc
