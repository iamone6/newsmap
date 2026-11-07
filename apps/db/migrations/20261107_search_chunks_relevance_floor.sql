-- 2026-11-07: search_chunks() 에 관련도 하한(벡터 거리 상한·BM25 최대 점수 대비 비율)을 추가한다.
-- 파라미터 3개와 반환 컬럼 2개(text_score, vector_distance)가 늘어 CREATE OR REPLACE 로는 바꿀 수 없어
-- 기존 함수를 지우고 다시 만든다. 새 파라미터는 기본 NULL(거르지 않음)이라 이전 be 호출도 그대로 동작한다.
-- 적용: apps/db/CLAUDE.md "마이그레이션". prod 는 be 배포보다 먼저 적용한다.
BEGIN;

DROP FUNCTION IF EXISTS search_chunks(text, halfvec, varchar[], smallint[], timestamptz, timestamptz, boolean, integer, integer, integer, double precision, double precision);
DROP FUNCTION IF EXISTS search_chunks(text, halfvec, varchar[], smallint[], timestamptz, timestamptz, boolean, integer, integer, integer, double precision, double precision, double precision, double precision, double precision);

-- -----------------------------------------------------------------------------
-- 하이브리드 검색: BM25 + 벡터를 RRF 로 결합하고, 관련도 하한 아래 청크는 뺀다
--   p_query_text      : 사용자 질의 원문 (빈 문자열이면 BM25 결과 없음)
--   p_query_embedding : 같은 질의를 Qwen3-Embedding-0.6B 로 임베딩한 값 (query 용 instruction 적용)
--   필터 파라미터는 NULL 이면 적용하지 않는다. p_region_codes / p_section_ids 는 하나라도 겹치면 통과.
--   p_exclude_wire    : true 면 통신사 기사 청크 제외. 서비스에서 호출할 때마다 지정 가능.
--   관련도 하한 (2026-11-07). RRF 점수는 순위만 본 상대값이라 하한 기준이 못 되므로,
--   결합된 청크마다 코사인 거리와 BM25 점수를 따로 보고 아래 둘 중 하나를 만족해야 남긴다.
--     1) 벡터 매칭    : 거리 <= p_max_vector_distance
--     2) BM25 강매칭  : BM25 점수 >= p_min_text_score_ratio * (이번 검색의 BM25 최대 점수)
--                       그리고 거리 <= p_max_hybrid_distance
--   세 값이 모두 NULL 이면 거르지 않는다(이전 동작). 하나만 주면 그 조건만 본다.
-- -----------------------------------------------------------------------------
CREATE FUNCTION search_chunks(
    p_query_text      text,
    p_query_embedding halfvec(1024),
    p_region_codes    varchar(10)[]  DEFAULT NULL,
    p_section_ids     smallint[]     DEFAULT NULL,
    p_from            timestamptz    DEFAULT NULL,
    p_to              timestamptz    DEFAULT NULL,
    p_exclude_wire    boolean        DEFAULT true,
    p_limit           integer        DEFAULT 10,
    p_candidates      integer        DEFAULT 100,
    p_rrf_k           integer        DEFAULT 60,
    p_text_weight     double precision DEFAULT 1.0,
    p_vector_weight   double precision DEFAULT 1.0,
    p_max_vector_distance  double precision DEFAULT NULL,
    p_max_hybrid_distance  double precision DEFAULT NULL,
    p_min_text_score_ratio double precision DEFAULT NULL
)
RETURNS TABLE (
    chunk_id        bigint,
    article_id      bigint,
    chunk_index     integer,
    content         text,
    published_at    timestamptz,
    score           double precision,
    text_rank       bigint,
    vector_rank     bigint,
    text_score      double precision,
    vector_distance double precision
)
LANGUAGE sql
STABLE
-- 필터와 함께 HNSW 를 쓸 때 후보가 모자라지 않도록 iterative scan 을 켠다.
SET hnsw.iterative_scan = 'relaxed_order'
SET hnsw.ef_search = 200
-- PG18 은 SQL 함수의 실행 계획도 캐시해, 한 연결에서 5번 부른 뒤부터 generic plan 을 쓴다.
-- pg_search(0.25.11)는 그 generic plan 에서 "Unsupported query shape" 로 실패하므로(2026-11-07 확인,
-- be 처럼 연결을 오래 쓰는 쪽은 6번째 검색부터 깨진다) 매번 값에 맞춘 계획을 세운다.
SET plan_cache_mode = 'force_custom_plan'
AS $$
    -- BM25 후보는 MATERIALIZED 로 먼저 뽑고 순위는 바깥에서 매긴다. pdb.score 를 아래 하한 조건에서
    -- 다시 참조하는 모양이 BM25 스캔 안으로 풀려 들어가면 pg_search 가 "Unsupported query shape" 를 낸다.
    WITH text_candidates AS MATERIALIZED (
        SELECT c.id,
               pdb.score(c.id)::double precision AS text_score
        FROM article_chunks c
        WHERE coalesce(btrim(p_query_text), '') <> ''
          AND c.embed_text ||| p_query_text
          AND (p_region_codes IS NULL OR c.region_codes && p_region_codes)
          AND (p_section_ids  IS NULL OR c.section_ids  && p_section_ids)
          AND (p_from IS NULL OR c.published_at >= p_from)
          AND (p_to   IS NULL OR c.published_at <  p_to)
          AND (NOT p_exclude_wire OR NOT c.is_wire)
        ORDER BY pdb.score(c.id) DESC, c.id
        LIMIT p_candidates
    ),
    text_hits AS (
        SELECT id, text_score, row_number() OVER (ORDER BY text_score DESC, id) AS rank
        FROM text_candidates
    ),
    vector_candidates AS MATERIALIZED (
        SELECT c.id,
               c.embedding <=> p_query_embedding AS distance
        FROM article_chunks c
        WHERE (p_region_codes IS NULL OR c.region_codes && p_region_codes)
          AND (p_section_ids  IS NULL OR c.section_ids  && p_section_ids)
          AND (p_from IS NULL OR c.published_at >= p_from)
          AND (p_to   IS NULL OR c.published_at <  p_to)
          AND (NOT p_exclude_wire OR NOT c.is_wire)
        ORDER BY c.embedding <=> p_query_embedding
        LIMIT p_candidates
    ),
    vector_hits AS (
        -- relaxed_order 는 순서가 살짝 어긋날 수 있어 다시 정렬한다.
        SELECT id, row_number() OVER (ORDER BY distance, id) AS rank
        FROM vector_candidates
    ),
    fused AS (
        SELECT coalesce(t.id, v.id) AS id,
               coalesce(p_text_weight   / (p_rrf_k + t.rank), 0)
             + coalesce(p_vector_weight / (p_rrf_k + v.rank), 0) AS score,
               t.rank AS text_rank,
               v.rank AS vector_rank,
               t.text_score,
               max(t.text_score) OVER () AS max_text_score
        FROM text_hits t
        FULL OUTER JOIN vector_hits v ON v.id = t.id
    ),
    scored AS (
        -- BM25 로만 들어온 청크는 벡터 후보 밖이라 거리를 여기서 다시 잰다(결합 결과 최대 2 * p_candidates 개).
        SELECT f.*, (c.embedding <=> p_query_embedding)::double precision AS vector_distance
        FROM fused f
        JOIN article_chunks c ON c.id = f.id
    )
    SELECT c.id, c.article_id, c.chunk_index, c.content, c.published_at,
           s.score, s.text_rank, s.vector_rank, s.text_score, s.vector_distance
    FROM scored s
    JOIN article_chunks c ON c.id = s.id
    WHERE (p_max_vector_distance IS NULL AND p_max_hybrid_distance IS NULL AND p_min_text_score_ratio IS NULL)
       OR (p_max_vector_distance IS NOT NULL AND s.vector_distance <= p_max_vector_distance)
       OR (    (p_max_hybrid_distance IS NOT NULL OR p_min_text_score_ratio IS NOT NULL)
           AND s.text_score IS NOT NULL
           AND (p_min_text_score_ratio IS NULL OR s.text_score >= p_min_text_score_ratio * s.max_text_score)
           AND (p_max_hybrid_distance  IS NULL OR s.vector_distance <= p_max_hybrid_distance))
    ORDER BY s.score DESC, c.id
    LIMIT p_limit;
$$;

COMMENT ON FUNCTION search_chunks(text, halfvec, varchar[], smallint[], timestamptz, timestamptz, boolean, integer, integer, integer, double precision, double precision, double precision, double precision, double precision)
    IS '하이브리드 검색: BM25(한국어 Lindera) 와 벡터(HNSW 코사인) 결과를 RRF 로 결합. 지역·섹션·기간·통신사 제외 필터, 벡터 거리·BM25 비율 관련도 하한 지원';

COMMIT;
