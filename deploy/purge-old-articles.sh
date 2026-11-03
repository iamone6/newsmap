#!/usr/bin/env bash
# 운영 서버 cron 이 하루 한 번 부른다. 보존 기간(1년)이 지난 기사를 지운다.
# 하위 테이블(지역·섹션·이미지·청크·seen_rss_links)은 ON DELETE CASCADE 로 같이 지워진다 (README "데이터 모델").
# 인자 없음.
set -euo pipefail

cd "$(dirname "$0")/.."

docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T db \
    sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DELETE FROM articles WHERE created_at < now() - interval '\''1 year'\''"'
