# newsmap DB: PostgreSQL 18 + pgvector(벡터 검색) + pg_search(BM25, 한국어 Lindera/KoDic)
# 버전은 모두 고정한다. 올릴 때는 아래 ARG 와 README 의 버전 표를 함께 수정한다.
FROM postgres:18.6-trixie

ARG PGVECTOR_VERSION=0.8.6-1.pgdg13+2
ARG PG_SEARCH_VERSION=0.25.11
ARG PG_SEARCH_SHA256_AMD64=d72b47140e169ac0b6edff3397e3f9b7d2a9c7041af3caf178da097184f93f02
ARG PG_SEARCH_SHA256_ARM64=767b91ac23d242deab6d24456d456452fc7ecfe68b27c33f985838f076e6fd63

ENV TZ=Asia/Seoul

SHELL ["/bin/bash", "-o", "pipefail", "-e", "-c"]

# pgvector: PGDG 본 저장소는 최신 버전만 유지하므로, 고정 버전을 계속 받을 수 있도록 PGDG archive 저장소를 사용한다.
# pg_search 가 pgvector 에 의존하므로 pgvector 를 먼저 설치한다.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && echo "deb [ signed-by=/usr/local/share/keyrings/postgres.gpg.asc ] https://apt-archive.postgresql.org/pub/repos/apt trixie-pgdg-archive main" \
        > /etc/apt/sources.list.d/pgdg-archive.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends "postgresql-${PG_MAJOR}-pgvector=${PGVECTOR_VERSION}" \
    && arch="$(dpkg --print-architecture)" \
    && case "$arch" in \
        amd64) checksum="${PG_SEARCH_SHA256_AMD64}" ;; \
        arm64) checksum="${PG_SEARCH_SHA256_ARM64}" ;; \
        *) echo "unsupported architecture: $arch" >&2; exit 1 ;; \
    esac \
    && curl -fsSL -o /tmp/pg_search.deb \
        "https://github.com/paradedb/paradedb/releases/download/v${PG_SEARCH_VERSION}/postgresql-${PG_MAJOR}-pg-search_${PG_SEARCH_VERSION}-1PARADEDB-trixie_${arch}.deb" \
    && echo "${checksum}  /tmp/pg_search.deb" | sha256sum -c - \
    && apt-get install -y --no-install-recommends /tmp/pg_search.deb \
    && rm /tmp/pg_search.deb /etc/apt/sources.list.d/pgdg-archive.list \
    && rm -rf /var/lib/apt/lists/*

# pg_search 는 shared_preload_libraries 등록이 필요하다.
# postgresql.conf 는 최초 initdb 때 이 sample 로부터 만들어지므로 sample 을 수정한다.
RUN sed -i "s/^#shared_preload_libraries = ''/shared_preload_libraries = 'pg_search'/" /usr/share/postgresql/postgresql.conf.sample \
    && grep -q "^shared_preload_libraries = 'pg_search'" /usr/share/postgresql/postgresql.conf.sample \
    && echo "timezone = 'Asia/Seoul'" >> /usr/share/postgresql/postgresql.conf.sample \
    && echo "log_timezone = 'Asia/Seoul'" >> /usr/share/postgresql/postgresql.conf.sample
