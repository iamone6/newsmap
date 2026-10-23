# apps/rag: RSS 수집 -> 페이지 파싱 -> LLM 판단 -> 청킹 -> 임베딩 -> DB 적재 Python 워커.
# 버전은 모두 고정한다. 올릴 때는 아래 ARG 와 apps/rag/.python-version 을 함께 확인한다.
ARG UV_VERSION=0.13.1

# COPY --from 은 변수 치환을 지원하지 않아서, uv 이미지를 이름 있는 스테이지로 먼저 분리한다.
FROM ghcr.io/astral-sh/uv:${UV_VERSION} AS uv

FROM ubuntu:26.04

ENV TZ=Asia/Seoul \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

SHELL ["/bin/bash", "-o", "pipefail", "-e", "-c"]

# uv 바이너리만 복사한다. Python 설치·의존성 관리는 전부 uv 가 맡는다 (apt python 안 씀).
COPY --from=uv /uv /uvx /usr/local/bin/

# uv/파이썬이 HTTPS 로 받을 때 필요한 루트 인증서.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 의존성만 먼저 설치해 레이어 캐시를 살린다 (pyproject.toml/uv.lock 변경 없으면 이 레이어는 재사용됨).
COPY pyproject.toml uv.lock .python-version ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-install-project

# 소스를 복사한다. pyproject.toml 의 tool.uv.package=false 라 애플리케이션 자체는 패키지로 빌드하지 않고,
# 이 sync 는 소스 변경 후에도 의존성이 lock 과 여전히 맞는지만 다시 확인한다.
COPY . .
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked

ENV PATH="/app/.venv/bin:${PATH}"

# 컨테이너는 계속 떠 있기만 하고, 실제 실행은 그때그때 docker compose exec 로 넣는다
# (예: docker compose exec rag uv run python -m rag.cli --feed-key joongboo).
# rag.cli 가 --feed-key 를 필수로 받아 커맨드 하나로 고정할 수 없어서 이 방식을 쓴다.
CMD ["sleep", "infinity"]
