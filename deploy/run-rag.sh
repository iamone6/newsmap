#!/usr/bin/env bash
# 운영 서버 cron 이 주기적으로 부른다. feeds.yaml 전체 피드를 수집~적재한다 (apps/rag/CLAUDE.md).
# 이전 실행이 아직 돌고 있으면 flock 으로 이번 실행을 건너뛴다.
# 인자 없음. 로그는 rag 컨테이너가 apps/rag/logs 에 남긴다.
#
# 한 번 실행은 최대 3시간(보통 10~20분). 넘기면 컨테이너 안에서 timeout 이 끝내 flock 을 풀어
# 다음 실행이 막히지 않게 한다. 2026-11-07 prod 에서 DeepInfra 응답 대기가 무한으로 멈춰
# 12시간 넘게 lock 을 잡은 적이 있다(원인인 호출 타임아웃은 rag/retry.py 에서 따로 고쳤다).
# 호스트 쪽 docker compose exec 를 죽여도 컨테이너 안 프로세스는 남으므로 timeout 은 컨테이너 안에서 건다.
set -euo pipefail

cd "$(dirname "$0")/.."

exec flock --nonblock /tmp/newsmap-rag.lock \
    docker compose -f docker-compose.yml -f docker-compose.prod.yml \
    exec -T rag timeout --kill-after=5m 3h uv run python -m rag.cli --feed-key ALL
