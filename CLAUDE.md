# CLAUDE.md

이 레포지토리는 be, fe, rag 세 개의 프로젝트로 구성된 monorepo 이다.
세 개의 프로젝트는 프로젝트 루트마다 각각의 CLAUDE.md 를 가진다.
목표는 rag 가 수집하고 저장한 기사를 be 가 api 로 목록, 검색을 제공하고 fe 가 사용자 계층을 맡아서, 지도 인터페이스를 기반으로 한 선택된 지역의 기사 목록을 보여주고, 기사 선택시 새창으로 해당 페이지로 이동시키는 것이다.
루트 CLAUDE.md는 모노레포 공통 원칙을 정의한다. 각 프로젝트의 CLAUDE.md는 해당 프로젝트의 구체적인 구현·검증 방법을 정의하며, 공통 원칙과 충돌하지 않는 범위에서 적용한다.

## 각 프로젝트 개요와 역할
- **fe/**
    - 프론트엔드 (기술스택 미정). 지도 기반의 UI.
- **be/**
    - 백엔드 API. PHP/Laravel/FrankenPHP 기반. 지역기사 목록 및 하이브리드 검색(BM25+Vector) 수행
- **rag/**
    - 지역언론 RSS 수집 -> 전처리 및 메타데이터 추출, 행정동 단위 분류 -> 청킹 -> 임베딩 -> DB적재. 백엔드의 하이브리드 검색(BM25+Vector)및 지역별 기사 목록 출력을 위한 데이터 저장
    - Python/Langchain 기반
- **Database**
    -  PostgreSQL 18.6 + pgvector 0.8.6 + pg_search(ParadeDB) 0.25.11. 버전을 올릴 때는 `dockerfiles/db.dockerfile`의 `ARG`(pg_search sha256 포함)와 README 버전 표를 함께 고친다. pg_search는 `shared_preload_libraries` 등록이 필요해 `postgresql.conf.sample`을 수정하는 방식이므로, 이미 initdb된 데이터 디렉터리에는 반영되지 않는다.
    - 모든 시각은 `timestamptz(0)`, 시간대 `Asia/Seoul`. 보존 기간 1년, `articles` 삭제 시 하위 테이블은 `ON DELETE CASCADE`.
    - cron은 앱 쪽에서 돌리고 DB(pg_cron)에는 넣지 않는다. 각 앱은 자기 `.env`를 따로 가지며 DB 접속값은 `apps/db/.env`의 `POSTGRES_*`와 맞춘다. 피드·언론사 목록은 DB가 아니라 설정 파일로 관리하고 DB에는 `feed_key`, `publisher_name`만 저장한다.

## 프로젝트 공통 규칙
- 문서·주석·커밋 메시지는 한국어로 쓴다.
- 각 클래스 및 메소드는 각자의 역할을 쉽게 이해할 수 있도록 상단에 주석을 기재하고, 파라메터와 리턴 타입을 명시한다. 해당 언어에서 권장하는 방식을 따른다.
- 각 프로젝트별로 환경 파일을 따로 둔다. `.env` 이 파일들은 .gitignore 에 포함되어야 한다. 
- 코드 작성시 human easy-readable 하게 작성하고, 문법은 최신 문법을 선호한다. 과도한 축약이나 비트 연산 등 코드 독해에 방해되는 요소는 배제한다.
- 도메인 별로 서비스를 구분한다. Pragmatic DDD 를 선호하지만, 애그리거트는 구현한다.

## 설계 문서의 위치와 우선순위
- `README.md`: 운영 방법과 데이터 모델·청킹·검색 요약.
- `prompts/<주제>.prompt.txt`: 원본 요구사항. `prompts/<주제>.decisions.md`: 그 요구사항에서 확정한 결정 사항과 남은 확인 사항. 설계 의도를 확인할 때는 decisions 문서를 먼저 본다.
- `contracts/schema.sql`: DB의 단일 진실 공급원. be/rag 양쪽이 이 스키마를 계약으로 공유한다. 스키마 변경시 be/rag 의 영향과 함께 이 파일도 점검한다.

## 자주 쓰는 명령

- (프로젝트 구성하면서 계속 업데이트 예정)

```bash
# DB 이미지 빌드 + 기동 (apps/db/.env 필요, 호스트 /data/postgres 에 bind mount)
docker compose up -d --build db

# 스키마 적용 (최초 1회, 마이그레이션 도구 없음)
docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < contracts/schema.sql

# 행정동 마스터 적재 (PEP 723 인라인 의존성, Python 3.11+). --dry-run 은 적재 후 롤백
uv run apps/db/scripts/load_regions.py KIKcd_H.20260101.xlsx --dry-run
```

- 로컬 전용 compose 설정은 `docker-compose.override.yml`(gitignore 대상)에 둔다.
- 스키마는 `BEGIN; … COMMIT;` 한 덩어리로 처음부터 만드는 형태라 재실행되지 않는다. 바꿀 때는 DB를 새로 만들거나 별도 ALTER를 직접 작성한다.

## 아키텍처의 핵심

**역할 분담**: 수집·크롤링·LLM 판단·청킹·임베딩은 `apps/rag`, 조회·검색은 `apps/be`. 


<!-- BE CLAUDE.md 로 이동예정 -->
**검색**: DB 함수 `search_chunks()`가 BM25(`pdb.lindera(korean)`, `|||` 연산자)와 HNSW 코사인 결과를 각각 `p_candidates`개 뽑아 RRF(k=60)로 결합한다. 필터(지역·섹션·기간·`p_exclude_wire`)는 NULL이면 미적용. 쿼리 임베딩에는 Qwen3의 query instruction을 적용해야 한다. 지역·섹션 배열 필터는 pg_search 인덱스 안에서 처리되지 않아 BM25 쪽이 느려질 수 있다(PoC 규모에선 허용).
