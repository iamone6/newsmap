# apps/be: Laravel API + FrankenPHP(Octane worker). FrankenPHP 의 Caddy 가 앞단이 되어
# /api/*, /up 은 Laravel 이 처리하고 나머지 요청은 fe 컨테이너로 프록시한다 (apps/be/Caddyfile).
# 버전은 모두 고정한다. 올릴 때는 아래 ARG 와 apps/be/composer.json 의 php 요구사항을 함께 확인한다.
ARG FRANKENPHP_VERSION=1.13.4
ARG PHP_VERSION=8.5.12
ARG COMPOSER_VERSION=2.10.3

# COPY --from 은 변수 치환을 지원하지 않아서, composer 이미지를 이름 있는 스테이지로 먼저 분리한다.
FROM composer:${COMPOSER_VERSION} AS composer

# ---- 공통: PHP 확장과 시간대 ----
FROM dunglas/frankenphp:${FRANKENPHP_VERSION}-php${PHP_VERSION}-trixie AS base

ENV TZ=Asia/Seoul

SHELL ["/bin/bash", "-o", "pipefail", "-e", "-c"]

# pdo_pgsql: PostgreSQL, pcntl: Octane 워커 제어, intl·zip: Laravel/composer 패키지가 흔히 요구, opcache: 성능.
RUN install-php-extensions pdo_pgsql pcntl intl zip opcache \
    && printf 'date.timezone = Asia/Seoul\n' > "$PHP_INI_DIR/conf.d/zz-newsmap.ini"

COPY --from=composer /usr/bin/composer /usr/local/bin/composer

WORKDIR /app

# ---- 로컬 개발: 소스는 docker-compose.override.yml 에서 bind mount 하고, 파일이 바뀌면 워커를 다시 띄운다 ----
FROM base AS dev

RUN cp "$PHP_INI_DIR/php.ini-development" "$PHP_INI_DIR/php.ini"

# Windows Docker 의 bind mount(9p) 는 inotify 이벤트가 오지 않아 octane --watch(FrankenPHP 기본 watcher)가 동작하지 않는다.
# 그래서 2초마다 소스 폴더의 변경 파일을 찾아 octane:reload 로 워커를 다시 띄우는 스크립트로 서버를 실행한다.
COPY <<'EOF' /usr/local/bin/dev-server
#!/bin/bash
set -u

php artisan octane:frankenphp --caddyfile=Caddyfile &
server_pid=$!

# docker compose stop 신호를 서버에 넘겨 바로 종료되게 한다
trap 'kill -TERM "$server_pid"; wait "$server_pid"; exit 0' TERM INT

# 파일 목록 + 수정 시각의 해시를 비교한다. 호스트와 컨테이너 시계가 달라도 놓치지 않도록 "이전 값과 다른지"만 본다.
snapshot() {
    find app bootstrap/app.php bootstrap/providers.php config routes database -type f -printf '%T@ %p\n' 2> /dev/null | md5sum
}

last_snapshot=$(snapshot)
while kill -0 "$server_pid" 2> /dev/null; do
    sleep 1
    current_snapshot=$(snapshot)
    if [ "$current_snapshot" != "$last_snapshot" ]; then
        last_snapshot=$current_snapshot
        echo "[dev-server] 소스 변경 감지 → 워커 재시작"
        # php artisan octane:reload 와 같은 일이지만, artisan 부팅이 9p 마운트에서 수 초 걸려 admin API 를 직접 부른다
        curl -fsS -X POST http://localhost:2019/frankenphp/workers/restart > /dev/null \
            || echo "[dev-server] 워커 재시작 실패"
    fi
done
EOF
RUN sed -i 's/\r$//' /usr/local/bin/dev-server && chmod +x /usr/local/bin/dev-server

CMD ["dev-server"]

# ---- 운영: 소스와 의존성을 이미지에 굽는다 (기본 타깃) ----
FROM base AS prod

RUN cp "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini"

# 의존성만 먼저 설치해 레이어 캐시를 살린다 (composer.json/lock 변경 없으면 이 레이어는 재사용됨).
COPY composer.json composer.lock ./
RUN --mount=type=cache,target=/root/.composer/cache \
    composer install --no-dev --no-scripts --no-autoloader --prefer-dist --no-interaction

COPY . .
RUN composer dump-autoload --no-dev --optimize --no-interaction \
    && php artisan package:discover

# 비루트 사용자로 실행한다. 80/443 바인딩 권한만 frankenphp 바이너리에 따로 준다.
RUN useradd --create-home --uid 1000 app \
    && setcap CAP_NET_BIND_SERVICE=+eip /usr/local/bin/frankenphp \
    && chown -R app:app /app/storage /app/bootstrap/cache /data/caddy /config/caddy
USER app

# config 캐시는 런타임 .env(env_file)가 있어야 만들 수 있어서 빌드가 아니라 기동 때 만든다.
CMD ["sh", "-c", "php artisan optimize && exec php artisan octane:frankenphp --caddyfile=Caddyfile"]
