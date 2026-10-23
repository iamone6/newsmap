"""실행 중 쓴 LLM/임베딩 토큰 수를 누적한다. 비용을 대략 가늠하기 위한 용도라 DB에는 저장하지 않는다."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class UsageTotals:
    llm_input_tokens: int = 0
    llm_output_tokens: int = 0
    embedding_tokens: int = 0
    llm_calls: int = 0
    embedding_calls: int = 0


_totals = UsageTotals()


def reset() -> None:
    global _totals
    _totals = UsageTotals()


def record_llm(input_tokens: int, output_tokens: int) -> None:
    _totals.llm_input_tokens += input_tokens
    _totals.llm_output_tokens += output_tokens
    _totals.llm_calls += 1


def record_embedding(tokens: int) -> None:
    _totals.embedding_tokens += tokens
    _totals.embedding_calls += 1


def totals() -> UsageTotals:
    return _totals
