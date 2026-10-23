from rag import config, pipeline


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
