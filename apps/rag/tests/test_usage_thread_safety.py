import threading

from rag import usage

THREAD_COUNT = 8
CALLS_PER_THREAD = 200


def test_record_llm_totals_are_exact_under_concurrent_calls():
    # 락이 없으면 += 가 서로 끼어들어 합계가 기대값보다 작게 나올 수 있다(회귀 테스트).
    usage.reset()

    def worker():
        for _ in range(CALLS_PER_THREAD):
            usage.record_llm(input_tokens=10, output_tokens=1)

    threads = [threading.Thread(target=worker) for _ in range(THREAD_COUNT)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    totals = usage.totals()
    assert totals.llm_input_tokens == THREAD_COUNT * CALLS_PER_THREAD * 10
    assert totals.llm_output_tokens == THREAD_COUNT * CALLS_PER_THREAD * 1
    assert totals.llm_calls == THREAD_COUNT * CALLS_PER_THREAD


def test_record_embedding_totals_are_exact_under_concurrent_calls():
    usage.reset()

    def worker():
        for _ in range(CALLS_PER_THREAD):
            usage.record_embedding(tokens=5)

    threads = [threading.Thread(target=worker) for _ in range(THREAD_COUNT)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    totals = usage.totals()
    assert totals.embedding_tokens == THREAD_COUNT * CALLS_PER_THREAD * 5
    assert totals.embedding_calls == THREAD_COUNT * CALLS_PER_THREAD
