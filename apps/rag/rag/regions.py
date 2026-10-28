"""LLM 이 돌려준 지역명을 `regions` 테이블 코드로 매칭하고, 상위 지역까지 코드를 펼친다.

`regions` 는 레벨별로 자기 레벨까지 이름이 전부 채워진 비정규화 테이블이라
(예: 읍면동 행은 sido_name/sigungu_name/emd_name 전부 채워짐), 가장 구체적인
조합부터 시도하고 매칭이 안 되면 한 단계씩 상위로 올라간다. 매칭 실패시 코드는
NULL로 두고 LLM 원문 이름은 그대로 보관한다(결정문서).

행정구역 개편 대응:
- 매칭은 현행 코드(`valid_to IS NULL`)만 대상으로 한다. 말소된 옛 코드는 기존 기사 FK 때문에
  남아 있을 뿐 새로 매칭하지 않는다.
- 시도명은 `region_aliases.yaml` 별칭으로 현행 이름으로 바꾼 뒤 매칭한다
  (예: 광주광역시·전라남도 → 전남광주통합특별시).
- 시군구가 1:N 으로 쪼개져 이름이 사라진 경우(예: 인천 중구 → 제물포구/영종구)는 별칭으로
  표현할 수 없으므로, 시군구 매칭이 실패하면 "시도 + 읍면동명"이 현행 읍면동 하나로만
  정해질 때 그 읍면동으로 매칭한다.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from functools import cache

import psycopg

from rag import config


@dataclass(frozen=True)
class RegionMatch:
    sido_code: str | None
    sigungu_code: str | None
    emd_code: str | None


@cache
def _sido_aliases() -> dict[str, str]:
    """시도 별칭 표를 한 번만 읽어 둔다. 키는 비교용으로 소문자화한다."""
    aliases = config.load_region_aliases().sido
    return {old.lower(): new for old, new in aliases.items()}


def normalize_sido_name(sido_name: str) -> str:
    """옛 시도명/줄임말이면 현행 시도명으로 바꾼다. 별칭에 없으면 그대로 돌려준다."""
    return _sido_aliases().get(sido_name.lower(), sido_name)


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

    normalized = normalize_sido_name(sido_name)
    match = _match_names(conn, normalized, sigungu_name, emd_name)
    if match == RegionMatch(None, None, None) and normalized != sido_name:
        # 별칭 대상(예: 전남광주통합특별시)이 아직 마스터에 없으면 원래 이름으로 한 번 더 시도한다.
        # 최신 마스터 적재 전에 수집이 돌아도 기존처럼 옛 코드로라도 매칭되게 하기 위해서다.
        match = _match_names(conn, sido_name, sigungu_name, emd_name)
    return match


def _match_names(
    conn: psycopg.Connection, sido_name: str, sigungu_name: str | None, emd_name: str | None
) -> RegionMatch:
    """이름 조합을 가장 구체적인 단위부터 현행 코드에 매칭한다."""
    with conn.cursor() as cur:
        # 1) 시도 + 시군구 + 읍면동이 모두 일치하는 읍면동
        if sigungu_name and emd_name:
            cur.execute(
                "SELECT code FROM regions WHERE level = 3 AND valid_to IS NULL"
                " AND lower(sido_name) = lower(%s) AND lower(sigungu_name) = lower(%s)"
                " AND lower(emd_name) = lower(%s) LIMIT 1",
                (sido_name, sigungu_name, emd_name),
            )
            row = cur.fetchone()
            if row:
                return _match_from_emd(conn, row[0])

        # 2) 시도 + 시군구가 일치하는 시군구
        if sigungu_name:
            cur.execute(
                "SELECT code FROM regions WHERE level = 2 AND valid_to IS NULL"
                " AND lower(sido_name) = lower(%s) AND lower(sigungu_name) = lower(%s) LIMIT 1",
                (sido_name, sigungu_name),
            )
            row = cur.fetchone()
            if row:
                sigungu_code = row[0]
                _, sido_code = _parent_codes(conn, sigungu_code)
                return RegionMatch(sido_code, sigungu_code, None)

        # 3) 시군구가 개편돼 이름이 안 맞을 때 (예: 인천 중구 → 제물포구/영종구)
        if emd_name:
            # 3-1) 시도 + 읍면동명이 하나로만 정해지면 그 읍면동
            cur.execute(
                "SELECT code FROM regions WHERE level = 3 AND valid_to IS NULL"
                " AND lower(sido_name) = lower(%s) AND lower(emd_name) = lower(%s) LIMIT 2",
                (sido_name, emd_name),
            )
            rows = cur.fetchall()
            if len(rows) == 1:
                return _match_from_emd(conn, rows[0][0])

            # 3-2) 읍면동이 번호 동으로 나뉜 경우(운서동 → 운서1동·운서2동): 후보가 모두 같은
            #      시군구에 속하면 시군구까지만 매칭한다
            sigungu_code = _common_sigungu_of_split_emd(cur, sido_name, emd_name)
            if sigungu_code:
                _, sido_code = _parent_codes(conn, sigungu_code)
                return RegionMatch(sido_code, sigungu_code, None)

        # 4) 시도만
        cur.execute(
            "SELECT code FROM regions WHERE level = 1 AND valid_to IS NULL"
            " AND lower(sido_name) = lower(%s) LIMIT 1",
            (sido_name,),
        )
        row = cur.fetchone()
        if row:
            return RegionMatch(row[0], None, None)

    return RegionMatch(None, None, None)


def _common_sigungu_of_split_emd(cur: psycopg.Cursor, sido_name: str, emd_name: str) -> str | None:
    """'운서동' 같은 이름이 현행 '운서1동'·'운서2동'으로 나뉘었을 때, 후보들이 모두 같은
    시군구에 속하면 그 시군구 코드를 돌려준다. 후보가 없거나 시군구가 여러 개면 None."""
    if not emd_name.endswith("동"):
        return None
    base = emd_name[:-1]
    cur.execute(
        "SELECT DISTINCT parent_code FROM regions WHERE level = 3 AND valid_to IS NULL"
        " AND lower(sido_name) = lower(%s) AND emd_name ~ %s",
        (sido_name, f"^{re.escape(base)}[0-9]+동$"),
    )
    parents = [row[0] for row in cur.fetchall()]
    return parents[0] if len(parents) == 1 and parents[0] else None


def _match_from_emd(conn: psycopg.Connection, emd_code: str) -> RegionMatch:
    """읍면동 코드에서 상위 시군구·시도 코드를 채운 매칭 결과를 만든다."""
    sigungu_code, sido_code = _parent_codes(conn, emd_code)
    return RegionMatch(sido_code, sigungu_code, emd_code)


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
