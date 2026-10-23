"""DeepInfra 공개 모델 목록에서 가격을 가져와 이번 실행의 예상 비용을 계산한다.

비용 확인용 기능이라 실패해도(네트워크 문제 등) 파이프라인 자체에는 영향 없게 호출부에서 감싼다.
"""

from __future__ import annotations

from dataclasses import dataclass

import requests

from rag.usage import UsageTotals

MODELS_LIST_URL = "https://api.deepinfra.com/models/list"


@dataclass(frozen=True)
class CostEstimate:
    llm_cost_usd: float
    embedding_cost_usd: float

    @property
    def total_usd(self) -> float:
        return self.llm_cost_usd + self.embedding_cost_usd


def _fetch_pricing(model_name: str) -> dict | None:
    response = requests.get(MODELS_LIST_URL, timeout=15)
    response.raise_for_status()
    for model in response.json():
        if model.get("model_name") == model_name:
            return model.get("pricing")
    return None


def estimate_cost(totals: UsageTotals, *, llm_model: str, embedding_model: str) -> CostEstimate:
    llm_pricing = _fetch_pricing(llm_model) or {}
    embedding_pricing = _fetch_pricing(embedding_model) or {}

    llm_cents = totals.llm_input_tokens * (llm_pricing.get("cents_per_input_token") or 0) + totals.llm_output_tokens * (
        llm_pricing.get("cents_per_output_token") or 0
    )
    embedding_cents = totals.embedding_tokens * (embedding_pricing.get("cents_per_input_token") or 0)

    return CostEstimate(llm_cost_usd=llm_cents / 100, embedding_cost_usd=embedding_cents / 100)
