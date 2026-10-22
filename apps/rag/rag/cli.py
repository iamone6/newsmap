"""`uv run python -m rag.cli --feed-key <key>` 로 피드 1개를 수집~적재까지 처리한다."""

from __future__ import annotations

import argparse
import logging
import sys

from rag import pipeline


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="feed_key 하나를 수집부터 DB 적재까지 처리한다.")
    parser.add_argument("--feed-key", required=True, help="apps/rag/feeds.yaml 의 feed_key")
    parser.add_argument("--verbose", action="store_true", help="디버그 로그 출력")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    result = pipeline.run(args.feed_key)
    print(
        f"feed_key={args.feed_key} 신규={result.total_new} 저장={result.processed} "
        f"중복(canonical)={result.skipped_duplicate_canonical} 실패={result.failed}"
    )
    return 1 if result.failed else 0


if __name__ == "__main__":
    sys.exit(main())
