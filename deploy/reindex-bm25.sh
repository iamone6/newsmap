#!/usr/bin/env bash
# 운영 서버 cron 이 하루 한 번 부른다. article_chunks 의 BM25(pg_search) 인덱스를 다시 만든다.
# rag 재적재와 보존 기간 삭제가 쌓이면 인덱스에 삭제 문서와 잘게 쪼개진 세그먼트가 남아, 일반 VACUUM 으로는
# 안 줄고 검색에 고정비(약 160ms)가 붙는다(2026-11-07 측정). 재색인하면 사라진다(약 8초, 청크 2.7만 건 기준).
# 재색인 중에는 이 인덱스를 쓰는 검색이 잠깐 기다리므로 purge-old-articles.sh 직후 새벽에 돌린다. 인자 없음.
set -euo pipefail

cd "$(dirname "$0")/.."

docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T db \
    sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "REINDEX INDEX article_chunks_bm25_idx;"'
