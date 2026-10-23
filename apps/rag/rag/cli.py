"""`uv run python -m rag.cli --feed-key <key>` 로 피드 1개, `--feed-key ALL` 로 전체 피드를 처리한다."""

from __future__ import annotations

import argparse
import logging
import sys

from rag import config, pipeline, pricing, usage

ALL_FEEDS = "ALL"


def _print_result(feed_key: str, result: pipeline.RunResult) -> None:
    print(
        f"feed_key={feed_key} 신규={result.total_new} 저장={result.processed} "
        f"중복(canonical)={result.skipped_duplicate_canonical} 실패={result.failed}"
    )


def _print_cost_estimate(settings: config.Settings) -> None:
    totals = usage.totals()
    print(
        f"토큰 사용량: LLM 입력={totals.llm_input_tokens} 출력={totals.llm_output_tokens}"
        f"({totals.llm_calls}회), 임베딩={totals.embedding_tokens}({totals.embedding_calls}회)"
    )
    try:
        cost = pricing.estimate_cost(totals, llm_model=settings.llm_model, embedding_model=settings.embedding_model)
    except Exception as exc:  # noqa: BLE001 - 비용 조회 실패는 본 작업 실패로 치지 않는다
        print(f"예상 비용 조회 실패(파이프라인 결과에는 영향 없음): {exc}")
        return
    print(
        f"예상 비용: LLM ${cost.llm_cost_usd:.6f} + 임베딩 ${cost.embedding_cost_usd:.6f} "
        f"= 총 ${cost.total_usd:.6f}"
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="feed_key 하나 또는 전체(ALL)를 수집부터 DB 적재까지 처리한다.")
    parser.add_argument(
        "--feed-key", required=True, help=f"apps/rag/feeds.yaml 의 feed_key, 또는 전체 피드를 순회하는 {ALL_FEEDS}"
    )
    parser.add_argument("--verbose", action="store_true", help="디버그 로그 출력")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    usage.reset()
    settings = config.load_settings()

    if args.feed_key == ALL_FEEDS:
        results = pipeline.run_all()
        total_failed = 0
        for feed_key, result in results.items():
            _print_result(feed_key, result)
            total_failed += result.failed
        print(f"=== 전체 {len(results)}개 피드 처리 완료, 총 실패={total_failed} ===")
        _print_cost_estimate(settings)
        return 1 if total_failed else 0

    result = pipeline.run(args.feed_key)
    _print_result(args.feed_key, result)
    _print_cost_estimate(settings)
    return 1 if result.failed else 0


if __name__ == "__main__":
    sys.exit(main())
