#!/usr/bin/env bash
# 운영 서버 cron 이 주기적으로 부른다. feeds.yaml 전체 피드를 수집~적재한다 (apps/rag/CLAUDE.md).
# 이전 실행이 아직 돌고 있으면 flock 으로 이번 실행을 건너뛴다.
# 인자 없음. 로그는 rag 컨테이너가 apps/rag/logs 에 남긴다.
set -euo pipefail

cd "$(dirname "$0")/.."

exec flock --nonblock /tmp/newsmap-rag.lock \
    docker compose -f docker-compose.yml -f docker-compose.prod.yml \
    exec -T rag uv run python -m rag.cli --feed-key ALL
