"""LLM 한 번의 호출로 지역/기자/통신사/섹션/이미지 라이선스를 판단한다."""

from __future__ import annotations

import logging
from typing import Any, Literal

from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field, field_validator

from rag import usage
from rag.retry import call_with_retry

log = logging.getLogger(__name__)

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

    @field_validator("images", mode="before")
    @classmethod
    def _normalize_images(cls, value: Any) -> Any:
        """모델이 images 를 리스트가 아닌 모양으로 돌려줄 때 리스트로 바로잡는다.

        function_calling 방식은 스키마를 강제하지 않아서, 가끔(2026-10-30 01:35 무렵 집중 발생)
        아래 모양이 HTTP 200 으로 돌아온다. images 는 캡션 출처 정도의 부가 정보라 형식이 깨졌다고
        기사 전체를 버리지 않는다.
        - {"items": [...]}: 리스트를 한 번 더 감싼 경우 → 안쪽 리스트
        - {"items": {"0": {...}, "1": {...}}} 또는 {"0": {...}}: 순번을 키로 한 dict → 값 리스트
        - {"items": {"properties": ..., "type": "object"}, "type": "array"}: 값 대신 스키마를 베낀 경우 → []
        그 밖의 모양은 그대로 넘겨 pydantic 검증 실패(→ 재시도)에 맡긴다.

        :param value: 모델이 반환한 images 원본 값
        :return: 바로잡은 값(리스트) 또는 손대지 않은 원본
        """
        if not isinstance(value, dict):
            return value

        # 실제 값이 들어 있는 리스트를 먼저 꺼낸다. {"items": [...], "type": "array"} 처럼
        # 스키마 키가 섞여 있어도 값이 있으면 버리지 않는다.
        inner = value.get("items", value)
        if isinstance(inner, list):
            log.warning("LLM 이 images 리스트를 {'items': ...} 로 감싸 반환해 풀었다")
            return inner
        if not isinstance(inner, dict):
            return value

        if _looks_like_json_schema(value) or _looks_like_json_schema(inner):
            log.warning("LLM 이 images 값 대신 스키마를 반환해 이미지 판단을 비웠다")
            return []
        if inner and all(str(key).isdigit() for key in inner):
            log.warning("LLM 이 images 리스트를 순번 키 dict 로 반환해 리스트로 바꿨다")
            return [inner[key] for key in sorted(inner, key=int)]
        return value


def _looks_like_json_schema(value: dict) -> bool:
    """dict 가 실제 값이 아니라 JSON Schema 정의(type/properties 키)처럼 보이는지 판단한다.

    :param value: 검사할 dict
    :return: 스키마 정의로 보이면 True
    """
    return "properties" in value or value.get("type") in {"array", "object"}


_PROMPT = """\
너는 한국 지역 뉴스 기사를 분석하는 보조원이다. 아래 기사를 읽고 구조화된 판단을 해라.

- 지역은 행정동 기준으로, 행정구역 코드에 매칭될 수 있는 정식 명칭으로 답해라(줄임말/별칭 대신 "수원시 영통구" 같은 정식 표기).
- 행정구역명은 기사에 옛 이름이 쓰였더라도 현행 이름으로 답해라. 예: 광주광역시·전라남도 → "전남광주통합특별시"(광주 자치구는 "전남광주통합특별시 서구"처럼), 인천 중구·동구 일대 → 현행 구 이름.
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
    if result["parsed"] is None:
        # 모델이 도구 호출 없이 일반 텍스트로만 답한 경우. 그대로 넘기면 pipeline 에서
        # AttributeError 가 나고 재시도도 안 되므로 여기서 예외로 바꿔 재시도 대상에 넣는다.
        raise ValueError("LLM 구조화 출력 없음: 모델이 도구 호출 없이 응답했다")
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
