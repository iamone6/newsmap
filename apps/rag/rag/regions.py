"""LLM 이 돌려준 지역명을 `regions` 테이블 코드로 매칭하고, 상위 지역까지 코드를 펼친다.

`regions` 는 레벨별로 자기 레벨까지 이름이 전부 채워진 비정규화 테이블이라
(예: 읍면동 행은 sido_name/sigungu_name/emd_name 전부 채워짐), 가장 구체적인
조합부터 시도하고 매칭이 안 되면 한 단계씩 상위로 올라간다. 매칭 실패시 코드는
NULL로 두고 LLM 원문 이름은 그대로 보관한다(결정문서).
"""

from __future__ import annotations

from dataclasses import dataclass

import psycopg


@dataclass(frozen=True)
class RegionMatch:
    sido_code: str | None
    sigungu_code: str | None
    emd_code: str | None


def match_region(
    conn: psycopg.Connection,
    *,
    sido_name: str | None,
    sigungu_name: str | None,
    emd_name: str | None,
) -> RegionMatch:
    sido_name = (sido_name or "").strip() or None
    sigungu_name = (sigungu_name or "").strip() or None
    emd_name = (emd_name or "").strip() or None

    if sido_name is None:
        return RegionMatch(None, None, None)

    with conn.cursor() as cur:
        if sido_name and sigungu_name and emd_name:
            cur.execute(
                "SELECT code FROM regions WHERE level = 3"
                " AND lower(sido_name) = lower(%s) AND lower(sigungu_name) = lower(%s)"
                " AND lower(emd_name) = lower(%s) LIMIT 1",
                (sido_name, sigungu_name, emd_name),
            )
            row = cur.fetchone()
            if row:
                emd_code = row[0]
                sigungu_code, sido_code = _parent_codes(conn, emd_code)
                return RegionMatch(sido_code, sigungu_code, emd_code)

        if sido_name and sigungu_name:
            cur.execute(
                "SELECT code FROM regions WHERE level = 2"
                " AND lower(sido_name) = lower(%s) AND lower(sigungu_name) = lower(%s) LIMIT 1",
                (sido_name, sigungu_name),
            )
            row = cur.fetchone()
            if row:
                sigungu_code = row[0]
                _, sido_code = _parent_codes(conn, sigungu_code)
                return RegionMatch(sido_code, sigungu_code, None)

        cur.execute(
            "SELECT code FROM regions WHERE level = 1 AND lower(sido_name) = lower(%s) LIMIT 1",
            (sido_name,),
        )
        row = cur.fetchone()
        if row:
            return RegionMatch(row[0], None, None)

    return RegionMatch(None, None, None)


def _parent_codes(conn: psycopg.Connection, code: str) -> tuple[str | None, str | None]:
    """code 의 (시군구 코드, 시도 코드) 를 parent_code 체인을 따라 구한다."""
    sigungu_code: str | None = None
    sido_code: str | None = None
    current = code
    with conn.cursor() as cur:
        while current:
            cur.execute("SELECT level, parent_code FROM regions WHERE code = %s", (current,))
            row = cur.fetchone()
            if not row:
                break
            level, parent_code = row
            if level == 2 and sigungu_code is None:
                # 일반구(예: 영통구)는 level=2 이면서 parent 가 또 다른 level=2(수원시)라, 체인에서
                # 처음 만나는 level=2 만 시군구 코드로 쓰고 그 뒤에 또 나오는 level=2 는 무시한다.
                sigungu_code = current
            elif level == 1:
                sido_code = current
                break
            current = parent_code
    return sigungu_code, sido_code


def expand_region_codes(conn: psycopg.Connection, codes: list[str]) -> list[str]:
    """매칭된 코드들을 parent_code 를 따라 상위 지역까지 펼친 합집합을 돌려준다."""
    expanded: set[str] = set()
    with conn.cursor() as cur:
        for code in codes:
            current = code
            while current and current not in expanded:
                expanded.add(current)
                cur.execute("SELECT parent_code FROM regions WHERE code = %s", (current,))
                row = cur.fetchone()
                current = row[0] if row else None
    return sorted(expanded)
