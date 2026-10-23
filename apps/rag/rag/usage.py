"""실행 중 쓴 LLM/임베딩 토큰 수를 누적한다. 비용을 대략 가늠하기 위한 용도라 DB에는 저장하지 않는다."""

from __future__ import annotations

import threading
from dataclasses import dataclass, replace


@dataclass
class UsageTotals:
    llm_input_tokens: int = 0
    llm_output_tokens: int = 0
    embedding_tokens: int = 0
    llm_calls: int = 0
    embedding_calls: int = 0


_totals = UsageTotals()
# 피드를 여러 스레드에서 동시에 처리하면 record_llm/record_embedding 이 같은 전역 카운터를
# 동시에 += 하므로 락으로 보호한다.
_lock = threading.Lock()


def reset() -> None:
    global _totals
    with _lock:
        _totals = UsageTotals()


def record_llm(input_tokens: int, output_tokens: int) -> None:
    with _lock:
        _totals.llm_input_tokens += input_tokens
        _totals.llm_output_tokens += output_tokens
        _totals.llm_calls += 1


def record_embedding(tokens: int) -> None:
    with _lock:
        _totals.embedding_tokens += tokens
        _totals.embedding_calls += 1


def totals() -> UsageTotals:
    with _lock:
        return replace(_totals)
