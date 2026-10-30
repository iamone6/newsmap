"""llm_judge 의 방어 코드 테스트: 모델이 images 를 잘못된 모양으로 돌려줄 때의 정규화와
도구 호출 없이 응답했을 때(parsed=None)의 처리. 실제 LLM 호출은 하지 않는다."""

from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from rag import llm_judge
from rag.llm_judge import ArticleJudgment

IMAGE_0 = {"index": 0, "credit_raw": "정읍시 제공", "wire_agency_name": None}
IMAGE_1 = {"index": 1, "credit_raw": None, "wire_agency_name": "연합뉴스"}


def _judge(images):
    return ArticleJudgment.model_validate({"sido_name": "전북특별자치도", "images": images})


def test_plain_list_is_kept_as_is():
    judgment = _judge([IMAGE_0, IMAGE_1])
    assert [image.index for image in judgment.images] == [0, 1]
    assert judgment.images[0].credit_raw == "정읍시 제공"


def test_missing_images_defaults_to_empty_list():
    assert ArticleJudgment.model_validate({}).images == []


def test_list_wrapped_in_items_is_unwrapped():
    # 2026-10-30 실제 로그: input_value={'items': [{'index': 0, ...}]}
    judgment = _judge({"items": [IMAGE_0, IMAGE_1]})
    assert [image.index for image in judgment.images] == [0, 1]
    assert judgment.images[1].wire_agency_name == "연합뉴스"


def test_list_wrapped_with_schema_keys_keeps_real_values():
    judgment = _judge({"items": [IMAGE_0], "type": "array"})
    assert len(judgment.images) == 1
    assert judgment.images[0].credit_raw == "정읍시 제공"


def test_empty_list_wrapped_in_items_becomes_empty():
    assert _judge({"items": []}).images == []


def test_index_keyed_dict_in_items_becomes_ordered_list():
    # 2026-10-30 실제 로그: input_value={'items': {'0': {'index': ...}}}
    judgment = _judge({"items": {"1": IMAGE_1, "0": IMAGE_0}})
    assert [image.index for image in judgment.images] == [0, 1]


def test_index_keyed_dict_without_items_becomes_list():
    judgment = _judge({"0": IMAGE_0, "10": {"index": 10}, "2": {"index": 2}})
    # 문자열 정렬("10" < "2")이 아니라 숫자 순서여야 한다
    assert [image.index for image in judgment.images] == [0, 2, 10]


def test_echoed_schema_becomes_empty_list():
    # 2026-10-30 실제 로그: input_value={'items': {'properties': ..., 'type': 'object'}, 'type': 'array'}
    echoed = {
        "items": {
            "properties": {"index": {"type": "integer"}, "credit_raw": {"anyOf": [{"type": "string"}]}},
            "required": ["index"],
            "type": "object",
        },
        "type": "array",
    }
    judgment = _judge(echoed)
    assert judgment.images == []
    assert judgment.sido_name == "전북특별자치도"  # 나머지 판단은 그대로 살린다


def test_echoed_item_schema_without_outer_type_becomes_empty_list():
    assert _judge({"items": {"properties": {"index": {"type": "integer"}}, "type": "object"}}).images == []


@pytest.mark.parametrize(
    "bad_images",
    [
        "이미지 없음",  # 문자열
        {"foo": "bar"},  # 알 수 없는 dict
        {"items": "bar"},  # items 가 리스트/dict 가 아님
        {"items": [{"credit_raw": "index 누락"}]},  # 리스트 안 원소가 잘못됨
    ],
)
def test_unrecognized_shapes_still_fail_validation(bad_images):
    # 바로잡을 수 없는 모양은 검증 실패로 두어 재시도에 맡긴다
    with pytest.raises(ValidationError):
        _judge(bad_images)


def _fake_structured(result):
    return SimpleNamespace(invoke=lambda _prompt: result)


def _raw_message():
    return SimpleNamespace(usage_metadata={"input_tokens": 10, "output_tokens": 5})


def test_invoke_once_returns_parsed_judgment():
    judgment = _judge([IMAGE_0])
    result = {"raw": _raw_message(), "parsed": judgment, "parsing_error": None}
    assert llm_judge._invoke_once(_fake_structured(result), "prompt") is judgment


def test_invoke_once_raises_when_model_returned_no_tool_call():
    # 도구 호출 없이 텍스트로만 답하면 parsed=None, parsing_error=None 으로 온다
    result = {"raw": _raw_message(), "parsed": None, "parsing_error": None}
    with pytest.raises(ValueError, match="구조화 출력 없음"):
        llm_judge._invoke_once(_fake_structured(result), "prompt")


def test_invoke_once_raises_on_parsing_error():
    result = {"raw": _raw_message(), "parsed": None, "parsing_error": "1 validation error"}
    with pytest.raises(ValueError, match="파싱 실패"):
        llm_judge._invoke_once(_fake_structured(result), "prompt")
