# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

지역 뉴스 RSS를 수집해 지역(행정동) 단위로 하이브리드 검색(BM25 + 벡터)하는 RAG 프로젝트. 현재는 PoC 초기 단계로 **DB(스키마·이미지·기준 데이터 적재)만 구현**되어 있고, `apps/be`(Laravel, 조회·검색)와 `apps/rag`(Python 워커, 수집·LLM 판단·청킹·임베딩)는 `.env.example`만 있다. 빌드·린트·테스트 설정은 아직 없다.

문서·주석·커밋 메시지는 한국어로 쓴다.

## 설계 문서의 위치와 우선순위

- `README.md`: 운영 방법과 데이터 모델·청킹·검색 요약.
- `prompts/<주제>.prompt.txt`: 원본 요구사항. `prompts/<주제>.decisions.md`: 그 요구사항에서 확정한 결정 사항과 남은 확인 사항. 설계 의도를 확인할 때는 decisions 문서를 먼저 본다.
- `contracts/schema.sql`: DB의 단일 진실 공급원. be/rag 양쪽이 이 스키마를 계약으로 공유한다.

## 자주 쓰는 명령

```bash
# DB 이미지 빌드 + 기동 (apps/db/.env 필요, 호스트 /data/postgres 에 bind mount)
docker compose up -d --build db

# 스키마 적용 (최초 1회, 마이그레이션 도구 없음)
docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < contracts/schema.sql

# 행정동 마스터 적재 (PEP 723 인라인 의존성, Python 3.11+). --dry-run 은 적재 후 롤백
uv run apps/db/scripts/load_regions.py KIKcd_H.20260101.xlsx --dry-run
```

- Python 은 uv 로 관리한다. `apps/rag` 는 `pyproject.toml` + `uv.lock` + `.python-version`(`3.14`) 을 커밋하고, `apps/rag` 에서 `uv sync` 로 만든 `apps/rag/.venv`(커밋 안 함)를 쓴다. 실행은 `uv run …`, 의존성 추가는 `uv add …`(pip 직접 사용 금지). `apps/db/scripts` 는 PEP 723 인라인 의존성으로 rag 환경과 분리한다.
- 로컬 전용 compose 설정은 `docker-compose.override.yml`(gitignore 대상)에 둔다.
- 스키마는 `BEGIN; … COMMIT;` 한 덩어리로 처음부터 만드는 형태라 재실행되지 않는다. 바꿀 때는 DB를 새로 만들거나 별도 ALTER를 직접 작성한다.

## 아키텍처의 핵심

**역할 분담**: 수집·크롤링·LLM 판단·청킹·임베딩은 `apps/rag`, 조회·검색은 `apps/be`. cron은 앱 쪽에서 돌리고 DB(pg_cron)에는 넣지 않는다. 각 앱은 자기 `.env`를 따로 가지며 DB 접속값은 `apps/db/.env`의 `POSTGRES_*`와 맞춘다. 피드·언론사 목록은 DB가 아니라 설정 파일로 관리하고 DB에는 `feed_key`, `publisher_name`만 저장한다.

**DB 스택 (버전 고정)**: PostgreSQL 18.6 + pgvector 0.8.6 + pg_search(ParadeDB) 0.25.11. 버전을 올릴 때는 `dockerfiles/db.dockerfile`의 `ARG`(pg_search sha256 포함)와 README 버전 표를 함께 고친다. pg_search는 `shared_preload_libraries` 등록이 필요해 `postgresql.conf.sample`을 수정하는 방식이므로, 이미 initdb된 데이터 디렉터리에는 반영되지 않는다.

**수집 워커가 지켜야 할 불변식** (스키마만으로는 강제되지 않음):
- 중복 방지 2단계: `seen_rss_links (feed_key, rss_link)`에 있으면 페이지를 열지 않고 `rss_updated_at`만 갱신 → 파싱 후 `canonical_url`(전역 UNIQUE)이 이미 있으면 기존 기사 id로 `seen_rss_links`에만 기록.
- 기사·지역·섹션·이미지·청크·`seen_rss_links`는 LLM 판단과 임베딩이 모두 끝난 뒤 **한 트랜잭션**으로 저장. 상태/재시도 컬럼은 없고, 실패하면 다음 cron이 다시 처리한다.
- `article_chunks`의 `region_codes`·`section_ids`·`published_at`·`is_wire`는 기사 값을 복사한 비정규화 컬럼. `region_codes`는 `regions.parent_code`를 따라 상위 지역까지 펼친다(읍면동 → 일반구 → 시 → 시도). 일반구의 부모가 시(예: 영통구 → 수원시)인 것은 `load_regions.py`가 연결한다.
- `article_regions`의 코드는 `regions` FK라서 수집 전에 행정동 마스터 적재가 선행돼야 한다. 매칭 실패 시 코드는 NULL, LLM 원문 이름은 보관. 행정동 개편 후에도 기존 기사 코드는 바꾸지 않는다.
- `wire_agency_id`/`license_agency_id`가 NULL이면 "자사 또는 판단 불가"(둘을 구분하지 않음).
- `is_primary`(지역·섹션)와 `is_thumbnail`은 기사당 최대 1개(부분 유니크 인덱스). 검색 필터는 대표 여부와 무관하게 모든 지역·섹션을 쓴다.
- 모든 시각은 `timestamptz(0)`, 시간대 `Asia/Seoul`. 보존 기간 1년, `articles` 삭제 시 하위 테이블은 `ON DELETE CASCADE`.

**청킹·임베딩**: Recursive Character Splitter(문단 우선), Qwen3 토크나이저 기준 오버랩 포함 최대 500 토큰(앞뒤 10%). `content`(원문)와 `embed_text`(`[지역: … | 날짜: YYYY-MM-DD | 제목: …]` 헤더 + 본문, 임베딩·BM25 대상)를 분리한다. 임베딩은 DeepInfra OpenAI 호환 API의 `Qwen/Qwen3-Embedding-0.6B`, 1024차원 `halfvec`. 차원을 바꾸려면 `schema.sql`의 `halfvec(1024)`와 `search_chunks()` 파라미터 타입을 함께 바꾸고 전체 재임베딩해야 한다. 모델을 바꾸면 README 표에 기록한다.

**검색**: DB 함수 `search_chunks()`가 BM25(`pdb.lindera(korean)`, `|||` 연산자)와 HNSW 코사인 결과를 각각 `p_candidates`개 뽑아 RRF(k=60)로 결합한다. 필터(지역·섹션·기간·`p_exclude_wire`)는 NULL이면 미적용. 쿼리 임베딩에는 Qwen3의 query instruction을 적용해야 한다. 지역·섹션 배열 필터는 pg_search 인덱스 안에서 처리되지 않아 BM25 쪽이 느려질 수 있다(PoC 규모에선 허용).
