-- =============================================================================
-- 20261106: seen_rss_links 에 "건너뛴 항목" 기록 추가
--
-- 지역 코드(시도·시군구·읍면동)가 하나도 없는 기사는 저장하지 않고 건너뛴다(2026-11-05 결정,
-- prompts/postgre-schema,RAG.decisions.md 4·5장). 건너뛴 링크도 다시 열지 않도록
-- article_id 를 NULL 로 두고 skip_reason 에 사유를 남길 수 있게 한다.
--
-- contracts/schema.sql 은 이미 이 모양으로 바뀌었다. 이 파일은 그 전에 만든 DB(로컬·운영)에 한 번 적용한다.
-- 기존 행은 모두 article_id 가 있고 skip_reason 은 NULL 이라 새 제약을 바로 만족한다(데이터 변경 없음).
--
-- 적용 (레포 루트):
--   로컬: docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < apps/db/migrations/20261106_seen_rss_links_skip_reason.sql
--   운영: apps/db/CLAUDE.md "마이그레이션" 절차 (백업 후, 새 rag 코드 배포 전에 적용)
-- =============================================================================
BEGIN;

ALTER TABLE seen_rss_links ALTER COLUMN article_id DROP NOT NULL;

ALTER TABLE seen_rss_links ADD COLUMN skip_reason text
    CHECK (skip_reason IN ('no region', 'not match region'));

-- 저장(또는 기존 기사 연결)한 항목은 article_id 만, 건너뛴 항목은 skip_reason 만 값을 가진다
ALTER TABLE seen_rss_links ADD CONSTRAINT seen_rss_links_article_or_skip
    CHECK ((article_id IS NULL) = (skip_reason IS NOT NULL));

COMMENT ON TABLE  seen_rss_links             IS '이미 검사한 RSS 항목. 기사 페이지를 열기 전 중복 필터 (canonical_url 중복으로 버린 항목, 지역이 없어 건너뛴 항목 포함)';
COMMENT ON COLUMN seen_rss_links.article_id  IS '연결된 기사 ID (canonical_url 이 같은 기존 기사일 수 있음). 건너뛴 항목은 NULL';
COMMENT ON COLUMN seen_rss_links.skip_reason IS '저장하지 않고 건너뛴 사유. no region = LLM 이 지역과 무관하다고 판단, not match region = 지역명은 있으나 시도·시군구·읍면동 코드 매칭이 모두 실패';

COMMIT;
