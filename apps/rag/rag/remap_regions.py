"""행정구역 개편 후, 이미 저장된 기사의 지역 코드를 현행 코드로 다시 매핑하는 일회성 스크립트.

순서: 최신 행정동 마스터 적재(apps/db/scripts/load_regions.py --retire-missing) → 이 스크립트.

동작:
  1) article_regions 의 보관된 LLM 원문 이름(sido_name/sigungu_name/emd_name)으로
     regions.match_region 을 다시 돌려(현행 코드 + 시도 별칭) 코드 3개를 갱신한다.
  2) 코드가 바뀐 기사는 article_chunks.region_codes 를 상위 지역까지 다시 펼쳐 갱신한다
     (pipeline 과 같은 규칙: emd → sigungu → sido 매칭 코드를 expand_region_codes).
  3) 전체를 한 트랜잭션으로 처리한다. --dry-run 이면 결과만 보여 주고 롤백한다.
  주의: rag 컨테이너 이미지에 이 파일이 들어가려면 이미지를 다시 빌드해야 한다.
        호스트에서 apps/rag 기준으로 실행해도 된다 (.env 의 DB_HOST=127.0.0.1).

사용:
  uv run python -m rag.remap_regions --dry-run
  uv run python -m rag.remap_regions
"""

from __future__ import annotations

import argparse
import sys
from collections import Counter

import psycopg

from rag import config, regions, repository


def _connect() -> psycopg.Connection:
    """rag .env 의 DB 접속 정보로 연결한다."""
    settings = config.load_settings()
    return repository.connect(
        host=settings.db_host,
        port=settings.db_port,
        dbname=settings.db_database,
        user=settings.db_username,
        password=settings.db_password,
    )


def missing_alias_targets(conn: psycopg.Connection) -> list[str]:
    """region_aliases.yaml 의 별칭 대상 시도 중 현행 마스터에 없는 이름을 돌려준다.

    없다면 최신 KIKcd_H 가 아직 적재되지 않은 것이다. 이 상태로 재매핑하면 옛 코드가
    새 코드로 바뀌지 못하고 오히려 매칭이 흔들리므로 실행을 막는다.
    """
    targets = sorted(set(config.load_region_aliases().sido.values()))
    with conn.cursor() as cur:
        cur.execute(
            "SELECT sido_name FROM regions WHERE level = 1 AND valid_to IS NULL AND sido_name = ANY(%s)",
            (targets,),
        )
        found = {row[0] for row in cur.fetchall()}
    return [name for name in targets if name not in found]


def remap(conn: psycopg.Connection) -> dict[str, int]:
    """article_regions 코드와 article_chunks.region_codes 를 현행 코드로 갱신하고 건수를 돌려준다."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, article_id, sido_code, sigungu_code, emd_code, sido_name, sigungu_name, emd_name"
            " FROM article_regions ORDER BY id"
        )
        rows = cur.fetchall()

    stats: Counter[str] = Counter(total=len(rows))
    changed_articles: set[int] = set()

    # 1) article_regions 코드 다시 매칭
    with conn.cursor() as cur:
        for row_id, article_id, old_sido, old_sigungu, old_emd, sido_name, sigungu_name, emd_name in rows:
            match = regions.match_region(conn, sido_name=sido_name, sigungu_name=sigungu_name, emd_name=emd_name)
            new_codes = (match.sido_code, match.sigungu_code, match.emd_code)
            if new_codes == (old_sido, old_sigungu, old_emd):
                continue
            cur.execute(
                "UPDATE article_regions SET sido_code = %s, sigungu_code = %s, emd_code = %s WHERE id = %s",
                (*new_codes, row_id),
            )
            stats["changed_rows"] += 1
            changed_articles.add(article_id)

    # 2) 바뀐 기사의 청크 region_codes 다시 펼치기
    with conn.cursor() as cur:
        for article_id in sorted(changed_articles):
            cur.execute(
                "SELECT emd_code, sigungu_code, sido_code FROM article_regions WHERE article_id = %s",
                (article_id,),
            )
            matched = [code for region_row in cur.fetchall() for code in region_row if code]
            region_codes = regions.expand_region_codes(conn, matched)
            cur.execute("UPDATE article_chunks SET region_codes = %s WHERE article_id = %s", (region_codes, article_id))
            stats["updated_chunks"] += cur.rowcount
    stats["changed_articles"] = len(changed_articles)

    # 결과 점검용 집계
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT count(*) FILTER (WHERE ar.sido_name IS NOT NULL AND ar.sido_code IS NULL),
                   count(*) FILTER (WHERE r.valid_to IS NOT NULL)
            FROM article_regions ar
            LEFT JOIN regions r ON r.code = coalesce(ar.emd_code, ar.sigungu_code, ar.sido_code)
            """
        )
        stats["unmatched_rows"], stats["retired_code_rows"] = cur.fetchone()
    return dict(stats)


def main() -> int:
    parser = argparse.ArgumentParser(description="기존 기사 지역 코드를 현행 행정동 코드로 재매핑")
    parser.add_argument("--dry-run", action="store_true", help="결과만 보여 주고 롤백")
    args = parser.parse_args()

    # repository.connect 는 autocommit 이므로, 전체를 명시적 트랜잭션 하나로 묶는다.
    # --dry-run 이면 psycopg.Rollback 을 던져 블록 안의 변경을 모두 되돌린다.
    with _connect() as conn:
        missing = missing_alias_targets(conn)
        if missing:
            print(
                f"중단: 별칭 대상 시도 {missing} 가 현행 행정동 마스터에 없습니다. "
                "최신 KIKcd_H 를 load_regions.py --retire-missing 으로 먼저 적재하세요."
            )
            return 1
        with conn.transaction():
            stats = remap(conn)
            print(
                f"article_regions {stats['total']}행 중 코드 변경 {stats.get('changed_rows', 0)}행 "
                f"(기사 {stats['changed_articles']}건, 청크 {stats.get('updated_chunks', 0)}개 region_codes 갱신)"
            )
            print(f"시도명은 있는데 코드 매칭 실패: {stats['unmatched_rows']}행")
            print(f"아직 말소 코드를 가리키는 행: {stats['retired_code_rows']}행")
            if args.dry_run:
                print("--dry-run: 롤백했습니다.")
                raise psycopg.Rollback()
    return 0


if __name__ == "__main__":
    sys.exit(main())
