import time

import pytest

from rag import config, pipeline


@pytest.fixture(autouse=True)
def isolated_run_all(monkeypatch: pytest.MonkeyPatch) -> None:
    """run_all() 이 .env 와 토크나이저 없이 돌도록 설정 로딩과 토크나이저 예열을 대체한다.

    CI 에는 apps/rag/.env 가 없고, 토크나이저를 처음 받는 시간이 동시성 측정에 섞이면 안 된다.
    피드 목록(feeds.yaml)은 실제 파일을 그대로 쓴다.

    Args:
        monkeypatch: pytest 의 monkeypatch 픽스처.
    """
    settings = config.Settings(
        db_host="unused",
        db_port=5432,
        db_database="unused",
        db_username="unused",
        db_password="unused",
        deepinfra_api_key="unused",
        deepinfra_base_url="unused",
        embedding_model="unused",
        embedding_dimensions=1024,
        llm_model="unused",
        chunk_max_tokens=500,
        chunk_overlap_ratio=0.1,
        max_items_per_batch=50,
        max_concurrent_feeds=4,
    )
    monkeypatch.setattr(config, "load_settings", lambda: settings)
    monkeypatch.setattr(pipeline.chunker, "count_tokens", lambda text: 0)


def test_run_all_processes_feeds_concurrently(monkeypatch):
    # MAX_CONCURRENT_FEEDS 로 피드를 동시에 처리하는지 확인한다. 완전 순차라면
    # feed_keys 개수 * 0.2초가 걸리므로, 그보다 뚜렷하게 빠르면 병렬로 처리된 것이다.
    feeds_file = config.load_feeds()
    feed_keys = list(feeds_file.feeds.keys())
    assert len(feed_keys) >= 4, "동시성을 확인하려면 feeds.yaml 에 피드가 최소 4개는 있어야 한다"

    def fake_run(feed_key: str) -> pipeline.RunResult:
        time.sleep(0.2)
        return pipeline.RunResult(total_new=0, processed=0, failed=0, skipped_duplicate_canonical=0)

    monkeypatch.setattr(pipeline, "run", fake_run)

    started = time.monotonic()
    pipeline.run_all()
    elapsed = time.monotonic() - started

    sequential_estimate = len(feed_keys) * 0.2
    assert elapsed < sequential_estimate * 0.7, (
        f"피드가 동시에 처리되지 않는 것으로 보인다: elapsed={elapsed:.2f}s, "
        f"완전 순차였다면 {sequential_estimate:.2f}s 걸렸을 것"
    )


def test_run_all_iterates_every_feed_key_and_isolates_failures(monkeypatch):
    feeds_file = config.load_feeds()
    feed_keys = list(feeds_file.feeds.keys())
    assert len(feed_keys) >= 2, "feeds.yaml 에 피드가 최소 2개는 있어야 이 테스트가 의미 있다"

    failing_key = feed_keys[0]

    def fake_run(feed_key: str) -> pipeline.RunResult:
        if feed_key == failing_key:
            raise RuntimeError("일부러 실패")
        return pipeline.RunResult(total_new=1, processed=1, failed=0, skipped_duplicate_canonical=0)

    monkeypatch.setattr(pipeline, "run", fake_run)

    results = pipeline.run_all()

    assert set(results.keys()) == set(feed_keys)
    assert results[failing_key].failed == 1
    other_keys = [k for k in feed_keys if k != failing_key]
    assert all(results[k].failed == 0 for k in other_keys)
