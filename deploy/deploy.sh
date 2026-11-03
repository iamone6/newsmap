#!/usr/bin/env bash
# 운영 서버에서 새 이미지로 교체한다. GitHub Actions(deploy.yml)가 SSH 로 부르고, 롤백할 때는 사람이 직접 부른다.
#   deploy/deploy.sh sha-1a2b3c4     # 해당 태그로 배포 (롤백도 같은 방법)
#   deploy/deploy.sh                 # latest
# 인자: $1 이미지 태그 (생략하면 latest)
# 전제: /srv/newsmap 에 compose 파일과 apps/{db,rag,be}/.env 가 있고, ghcr.io 에 로그인되어 있다 (README "운영 배포").
set -euo pipefail

cd "$(dirname "$0")/.."

export IMAGE_TAG="${1:-latest}"
compose=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)

echo "[deploy] IMAGE_TAG=${IMAGE_TAG} 이미지 받는 중"
"${compose[@]}" pull

echo "[deploy] 컨테이너 교체"
"${compose[@]}" up -d --remove-orphans

# be 의 healthcheck(/up)가 healthy 가 될 때까지 최대 2분 기다린다
echo "[deploy] be 상태 확인"
for _ in $(seq 1 24); do
    status=$(docker inspect --format '{{.State.Health.Status}}' "$("${compose[@]}" ps -q be)")
    if [ "$status" = "healthy" ]; then
        echo "[deploy] be healthy"
        # 다음 배포·롤백에 쓰도록 현재 태그를 남긴다
        echo "$IMAGE_TAG" > deploy/.current-tag
        # 쓰지 않는 이미지 중 1주일 넘은 것만 지운다 (최근 태그는 롤백용으로 남긴다)
        docker image prune -af --filter "until=168h" > /dev/null
        exit 0
    fi
    sleep 5
done

echo "[deploy] be 가 healthy 가 되지 않았다. 'docker compose logs be' 를 확인하고, 이전 태그($(cat deploy/.current-tag 2> /dev/null || echo 없음))로 되돌린다" >&2
exit 1
