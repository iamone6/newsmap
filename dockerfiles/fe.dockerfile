# apps/fe: Next.js 지도 프론트엔드. next build 의 standalone 출력을 node 로 서빙한다.
# 버전은 모두 고정한다. 올릴 때는 아래 ARG 와 apps/fe/package.json 의 next 버전 요구사항을 함께 확인한다.
ARG NODE_VERSION=24.22.1-alpine3.24

# ---- 의존성 설치 (package.json/package-lock.json 변경 없으면 이 레이어는 재사용됨) ----
FROM node:${NODE_VERSION} AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# ---- 빌드 ----
FROM node:${NODE_VERSION} AS build

ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* 값은 빌드 시점에 JS 번들로 박힌다. 그래서 apps/fe/.env 를 compose build secret 으로 빌드 때만 마운트한다.
# 값을 바꾸면 이미지를 다시 빌드해야 한다.
# standalone 출력은 프로젝트의 .env 를 그대로 복사해 가므로, 이미지에 남지 않도록 빌드 직후 지운다.
RUN --mount=type=secret,id=fe_env,target=/app/.env \
    npm run build \
    && rm -f .next/standalone/.env

# ---- 실행 ----
FROM node:${NODE_VERSION} AS runner

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    TZ=Asia/Seoul \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# alpine 에는 시간대 데이터가 없어 TZ 가 적용되지 않으므로 tzdata 를 설치한다.
RUN apk add --no-cache tzdata

WORKDIR /app

# standalone 출력에는 static·public 이 빠져 있어 따로 복사한다.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

USER node

EXPOSE 3000

CMD ["node", "server.js"]
