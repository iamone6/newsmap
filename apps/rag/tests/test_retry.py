import pytest

from rag import retry


@pytest.fixture(autouse=True)
def no_real_sleep(monkeypatch):
    # 테스트가 실제로 1초씩 기다리지 않게 time.sleep 을 무력화한다.
    monkeypatch.setattr(retry.time, "sleep", lambda _seconds: None)


def test_succeeds_on_first_try_without_retry():
    calls = []

    def func():
        calls.append(1)
        return "ok"

    assert retry.call_with_retry(func, description="test") == "ok"
    assert len(calls) == 1


def test_succeeds_after_some_failures_within_retry_budget():
    calls = []

    def func():
        calls.append(1)
        if len(calls) < 3:
            raise ValueError("일시적 실패")
        return "ok"

    assert retry.call_with_retry(func, description="test") == "ok"
    assert len(calls) == 3


def test_raises_last_exception_after_exhausting_all_retries():
    calls = []

    def func():
        calls.append(1)
        raise ValueError(f"실패 {len(calls)}")

    with pytest.raises(ValueError, match="실패 4"):
        retry.call_with_retry(func, description="test")

    # 최초 1회 + 재시도 3회 = 최대 4회 시도.
    assert len(calls) == 4
