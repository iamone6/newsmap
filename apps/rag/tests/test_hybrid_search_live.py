"""실제 DB에 적재된 데이터로 하이브리드 검색(`search_chunks()`, BM25+벡터 RRF)이 동작하는지 확인한다.

다른 테스트와 달리 모킹하지 않고 실제 DeepInfra 임베딩 API 1회 호출 + 실제 DB 조회를 한다
(쿼리 1건 임베딩이라 비용은 무시할 수준). 로컬 DB가 없거나, API 키가 없거나, 데이터가
비어 있으면 스킵한다.
"""

from __future__ import annotations

import pytest
from pgvector import HalfVector

from rag import config, embedder

# 실제 적재된 기사 제목("오세훈, '명태균 의혹' 2심서 무죄…")을 겨냥한 질의. BM25는 키워드
# 일치로, 벡터는 의미 유사도로 같은 기사를 찾아낼 수 있는지 함께 검증한다.
QUERY_TEXT = "오세훈 명태균 의혹 2심 무죄"
EXPECTED_TITLE_KEYWORD = "오세훈"


@pytest.fixture
def settings():
    try:
        return config.load_settings()
    except RuntimeError as exc:
        pytest.skip(f"환경변수가 준비되지 않아 스킵: {exc}")


def test_search_chunks_hybrid_search_finds_relevant_article(db_conn, settings):
    with db_conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM article_chunks")
        (chunk_count,) = cur.fetchone()
    if chunk_count == 0:
        pytest.skip("article_chunks 가 비어 있어 검색 결과를 검증할 수 없다")

    query_embedding = embedder.embed_query(
        QUERY_TEXT,
        base_url=settings.deepinfra_base_url,
        api_key=settings.deepinfra_api_key,
        model=settings.embedding_model,
        expected_dimensions=settings.embedding_dimensions,
    )

    with db_conn.cursor() as cur:
        cur.execute(
            """
            SELECT chunk_id, article_id, score, text_rank, vector_rank
            FROM search_chunks(%s, %s, p_limit => 5)
            """,
            (QUERY_TEXT, HalfVector(query_embedding)),
        )
        rows = cur.fetchall()

    assert rows, "하이브리드 검색이 결과를 하나도 반환하지 않았다"
    # text_rank/vector_rank 둘 중 하나라도 있어야 RRF 융합이 실제로 일어났다고 볼 수 있다.
    assert any(r[3] is not None for r in rows) or any(r[4] is not None for r in rows)

    article_ids = [r[1] for r in rows]
    with db_conn.cursor() as cur:
        cur.execute("SELECT id, title FROM articles WHERE id = ANY(%s)", (article_ids,))
        titles = dict(cur.fetchall())

    assert any(EXPECTED_TITLE_KEYWORD in titles.get(aid, "") for aid in article_ids), (
        f"기대한 기사가 상위 {len(rows)}건에 없다: "
        f"{[(aid, titles.get(aid)) for aid in article_ids]}"
    )
