"""통신사 원문 표기를 `wire_agencies` 테이블에 매칭한다."""

from __future__ import annotations

import psycopg


def match_wire_agency(conn: psycopg.Connection, raw_text: str | None) -> int | None:
    """raw_text(LLM 이 찾은 원문 표기)가 wire_agencies.aliases 중 하나와 (대소문자 무시) 일치하면 id 를 돌려준다.

    목록에 없으면 None(자사 또는 판단 불가 — wire_source_raw 에는 원문을 그대로 저장).
    """
    raw_text = (raw_text or "").strip()
    if not raw_text:
        return None

    with conn.cursor() as cur:
        # raw_text 가 "연합뉴스 제공"처럼 alias 를 포함하는 문장일 수 있어 부분일치로 찾는다.
        cur.execute(
            "SELECT id FROM wire_agencies"
            " WHERE EXISTS (SELECT 1 FROM unnest(aliases) a WHERE %s ILIKE '%%' || a || '%%')"
            " LIMIT 1",
            (raw_text,),
        )
        row = cur.fetchone()
        return row[0] if row else None
