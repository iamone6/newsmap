#!/usr/bin/env bash
# 운영 서버 cron 이 하루 한 번 부른다. 보존 기간(1년)이 지난 기사와 건너뛴 RSS 링크 기록을 지운다.
# 1) 기사: 하위 테이블(지역·섹션·이미지·청크·seen_rss_links)은 ON DELETE CASCADE 로 같이 지워진다 (README "데이터 모델").
# 2) 지역이 없어 건너뛴 seen_rss_links 행(article_id NULL)은 기사와 연결이 없어 CASCADE 로 안 지워지므로 created_at 으로 따로 지운다.
# 두 삭제는 한 트랜잭션으로 처리한다. 인자 없음.
set -euo pipefail

cd "$(dirname "$0")/.."

docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T db \
    sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
BEGIN;
DELETE FROM articles WHERE created_at < now() - interval '1 year';
DELETE FROM seen_rss_links WHERE article_id IS NULL AND created_at < now() - interval '1 year';
COMMIT;
SQL
