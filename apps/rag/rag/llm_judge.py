"""LLM 한 번의 호출로 지역/기자/통신사/섹션/이미지 라이선스를 판단한다."""

from __future__ import annotations

from typing import Literal

from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field

from rag import usage
from rag.retry import call_with_retry

SectionCode = Literal["politics", "economy", "society", "culture", "sports", "science"]

# contracts/schema.sql 의 sections 시드 데이터와 동일 (고정 6개).
SECTION_CODE_TO_ID: dict[str, int] = {
    "politics": 1,
    "economy": 2,
    "society": 3,
    "culture": 4,
    "sports": 5,
    "science": 6,
}


class ImageJudgment(BaseModel):
    index: int = Field(description="입력으로 받은 이미지 목록의 순번(0부터)과 동일해야 한다")
    credit_raw: str | None = Field(None, description="캡션에서 찾은 출처/라이선스 원문. 없으면 null")
    wire_agency_name: str | None = Field(
        None, description="캡션에 통신사/타 언론사 라이선스 표시가 있으면 그 원문 명칭. 자사 또는 표시 없으면 null"
    )


class ArticleJudgment(BaseModel):
    sido_name: str | None = Field(None, description="시도명 (예: 경기도). 지역과 무관하면 null")
    sigungu_name: str | None = Field(None, description="시군구명 (예: 수원시 영통구). 판단 어려우면 null")
    emd_name: str | None = Field(None, description="읍면동명 (예: 매탄1동). 판단 어려우면 null")
    reporters: list[str] = Field(default_factory=list, description="기자 이름 목록. 이메일은 절대 포함하지 않는다")
    wire_agency_name: str | None = Field(
        None, description="본문이 연합뉴스/뉴시스 등 통신사 전재 기사로 보이면 그 원문 표기. 자사 생산/판단 불가면 null"
    )
    section_code: SectionCode | None = Field(None, description="6개 섹션 중 가장 알맞은 하나. 애매하면 null")
    images: list[ImageJudgment] = Field(default_factory=list)


_PROMPT = """\
너는 한국 지역 뉴스 기사를 분석하는 보조원이다. 아래 기사를 읽고 구조화된 판단을 해라.

- 지역은 행정동 기준으로, 행정구역 코드에 매칭될 수 있는 정식 명칭으로 답해라(줄임말/별칭 대신 "수원시 영통구" 같은 정식 표기).
- 시군구·읍면동을 판단하기 어려우면 그 필드만 null로 두고, 기사 자체가 특정 지역과 무관하면 시도부터 전부 null로 둬라.
- 기자 이름은 본문에 실제로 등장하는 사람 이름만 포함하고, 이메일 주소는 절대 reporters 에 넣지 마라.
- wire_agency_name 은 본문이 연합뉴스/뉴시스 등 통신사가 작성해 전재된 기사로 보일 때만 그 통신사의 원문 표기를 넣고, 자사 기자가 쓴 기사거나 판단이 안 되면 null로 둬라.
- 이미지 캡션에 "OOO 제공", "OOO/연합뉴스" 같은 출처 표시가 있으면 credit_raw 에 원문을 넣고, 그게 통신사/타 언론사 라이선스로 보이면 wire_agency_name 에도 넣어라. 자사 촬영이거나 표시가 없으면 둘 다 null.

# 제목
{title}

# 본문
{body}

# 이미지 캡션 목록 (index: 캡션)
{images}
"""


def _format_images(captions: list[str | None]) -> str:
    if not captions:
        return "(이미지 없음)"
    return "\n".join(f"{i}: {caption or '(캡션 없음)'}" for i, caption in enumerate(captions))


def _invoke_once(structured, prompt: str) -> ArticleJudgment:
    result = structured.invoke(prompt)
    token_usage = getattr(result["raw"], "usage_metadata", None) or {}
    usage.record_llm(token_usage.get("input_tokens", 0), token_usage.get("output_tokens", 0))
    if result["parsing_error"] is not None:
        raise ValueError(f"LLM 구조화 출력 파싱 실패: {result['parsing_error']}")
    return result["parsed"]


def judge_article(
    *,
    title: str,
    body: str,
    image_captions: list[str | None],
    base_url: str,
    api_key: str,
    model: str,
) -> ArticleJudgment:
    llm = ChatOpenAI(base_url=base_url, api_key=api_key, model=model, temperature=0)
    structured = llm.with_structured_output(ArticleJudgment, method="function_calling", include_raw=True)
    prompt = _PROMPT.format(title=title, body=body, images=_format_images(image_captions))
    # 호출/파싱 둘 다 재시도 대상에 포함한다 - 재시도마다 실제 과금되는 호출이라 매 시도마다
    # usage.record_llm 이 불려야 비용 집계가 정확하다.
    return call_with_retry(lambda: _invoke_once(structured, prompt), description="LLM 판단 호출")
