-- =============================================================================
-- 20261106: 지역 코드가 하나도 없는 기존 기사 삭제 (1회성 데이터 정리)
--
-- 2026-11-05 결정으로 지역 코드(시도·시군구·읍면동)가 하나도 없는 기사는 저장하지 않는다
-- (prompts/postgre-schema,RAG.decisions.md 4장). 그 전에 저장된 기사를 지운다.
--
-- 먼저 적용해야 하는 것: 20261106_seen_rss_links_skip_reason.sql (article_id NULL·skip_reason 허용)
--
-- 1) 대상: article_regions 에 코드가 하나라도 있는 행이 없는 기사 (행이 아예 없거나, 있어도 코드가 전부 NULL)
-- 2) 대상 기사에 연결된 seen_rss_links 행을 "건너뛴 행"으로 바꾼다 (article_id NULL + skip_reason).
--    그냥 지우면 CASCADE 로 seen 행도 사라져, 피드에 아직 남아 있는 링크를 다음 수집에서 다시 파싱·LLM 판단한다.
--    사유: 지역명도 없으면 'no region', 지역명은 있는데 코드가 없으면 'not match region' (새 rag 규칙과 같다).
-- 3) 대상 기사를 지운다. 지역·섹션·이미지·청크는 ON DELETE CASCADE 로 같이 지워진다.
--
-- 한 트랜잭션이다. 다시 실행해도 대상이 0건이라 아무것도 바뀌지 않는다.
-- 건수만 보려면 마지막 COMMIT 을 ROLLBACK 으로 바꿔 실행한다.
-- =============================================================================
BEGIN;

CREATE TEMP TABLE articles_without_region ON COMMIT DROP AS
SELECT
    a.id,
    CASE
        WHEN EXISTS (
            SELECT 1 FROM article_regions r
            WHERE r.article_id = a.id
              AND coalesce(r.sido_name, r.sigungu_name, r.emd_name) IS NOT NULL
        ) THEN 'not match region'
        ELSE 'no region'
    END AS skip_reason
FROM articles a
WHERE NOT EXISTS (
    SELECT 1 FROM article_regions r
    WHERE r.article_id = a.id
      AND coalesce(r.sido_code, r.sigungu_code, r.emd_code) IS NOT NULL
);

-- 지울 기사 수 (사유별)
SELECT skip_reason, count(*) AS articles FROM articles_without_region GROUP BY skip_reason ORDER BY skip_reason;

-- 2) 연결된 seen 행을 건너뛴 행으로 바꾼다 (article_id 와 skip_reason 을 한 번에 바꿔 CHECK 제약을 만족)
UPDATE seen_rss_links s
SET article_id = NULL, skip_reason = target.skip_reason
FROM articles_without_region target
WHERE s.article_id = target.id;

-- 3) 기사 삭제
DELETE FROM articles a
USING articles_without_region target
WHERE a.id = target.id;

-- 결과: 남은 기사 수, 지역 코드 없는 기사 수(0 이어야 함), 건너뛴 seen 행 수
SELECT
    (SELECT count(*) FROM articles) AS articles_left,
    (SELECT count(*) FROM articles a
      WHERE NOT EXISTS (SELECT 1 FROM article_regions r
                        WHERE r.article_id = a.id
                          AND coalesce(r.sido_code, r.sigungu_code, r.emd_code) IS NOT NULL)) AS articles_without_region_left,
    (SELECT count(*) FROM seen_rss_links WHERE article_id IS NULL) AS skipped_seen_rows;

COMMIT;
