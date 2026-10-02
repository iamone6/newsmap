# newsmap

지역 뉴스 RSS를 모아서 지역 단위로 하이브리드 검색(BM25 + 벡터)하는 RAG 프로젝트입니다.

## 디렉터리 구성

```
├─ docker-compose.yml          # 지금은 db 서비스만 있음
├─ dockerfiles/db.dockerfile   # PostgreSQL + 확장
├─ contracts/schema.sql        # DB 스키마 (직접 적용)
└─ apps/
   ├─ db/.env.example          # db 컨테이너와 DB 스크립트용 POSTGRES_*
   ├─ db/scripts/              # DB 기준 데이터 적재 스크립트 (행정동 코드)
   ├─ be/.env.example          # Laravel (조회·검색)
   └─ rag/.env.example         # Python 워커 (수집·청킹·임베딩)
```

각 앱은 자기 `.env`를 따로 가집니다. 저장소에는 `.env.example`만 커밋합니다.

Python(`apps/rag`)은 [uv](https://docs.astral.sh/uv/)로 관리합니다. `apps/rag`에서 `uv sync`를 실행하면 `apps/rag/.venv`가 만들어집니다. `pyproject.toml`과 `uv.lock`은 커밋하고 `.venv`는 커밋하지 않습니다.

## DB 버전

| 구성 요소 | 버전 | 설치 방법 |
|---|---|---|
| PostgreSQL | 18.6 | `postgres:18.6-trixie` 이미지 |
| pgvector | 0.8.6 (`0.8.6-1.pgdg13+2`) | PGDG archive apt 저장소 |
| pg_search (ParadeDB) | 0.25.11 | GitHub 릴리스 `.deb` (sha256 검증) |

- 시간대: `Asia/Seoul`. 모든 시각 컬럼은 `timestamptz(0)`이라 초 단위까지만 저장됩니다.
- 버전을 올릴 때는 `dockerfiles/db.dockerfile`의 `ARG` 값과 이 표를 같이 고칩니다.

## DB 띄우기 (Ubuntu)

```bash
sudo mkdir -p /data/postgres
cp apps/db/.env.example apps/db/.env   # 비밀번호를 바꿔서 사용
docker compose up -d --build db
```

- 데이터는 호스트의 `/data/postgres`에 bind mount됩니다. PostgreSQL 18 이미지부터 마운트 지점이 `/var/lib/postgresql`이고, 실제 데이터는 그 아래 `18/docker`에 쌓입니다.
- 포트는 `127.0.0.1:5432`로만 열려 있어서 같은 호스트 안에서만 접속할 수 있습니다.

## 스키마 적용 (직접 실행, 최초 1회)

```bash
docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < contracts/schema.sql
```

## 데이터 모델 요약

| 테이블 | 내용 |
|---|---|
| `regions` | 행정동 코드 마스터 (시도·시군구·읍면동, 폐지된 코드도 `valid_to`로 보존) |
| `wire_agencies` | 통신사 정규화 (이름 + 별칭 배열) |
| `sections` | 섹션 대분류 6개 (정치, 경제, 사회, 문화, 스포츠, 과학) |
| `articles` | 기사. `canonical_url`은 전역 유일. `wire_agency_id`가 NULL이면 자사 생산이거나 판단 불가 |
| `seen_rss_links` | 기사 페이지를 열기 전에 `(feed_key, rss_link)`로 중복을 거름 |
| `article_regions` | 기사와 지역의 N:M 관계 (코드 + LLM 원문 이름, 대표 지역은 `is_primary`) |
| `article_sections` | 기사와 섹션의 N:M 관계 (대표 섹션은 `is_primary`) |
| `article_images` | 이미지와 썸네일 (캡션, 출처 원문, 라이선스 통신사) |
| `article_chunks` | 청크 원문 + 임베딩용 텍스트 + `halfvec(1024)` + 필터용 비정규화 컬럼 |

### 수집 워커가 지켜야 할 규칙

- `seen_rss_links`에 이미 있는 `(feed_key, rss_link)`는 기사 페이지를 열지 않습니다. RSS의 `updated_at`만 달라졌으면 `articles.rss_updated_at`만 갱신합니다.
- 페이지를 파싱한 뒤 `canonical_url`이 이미 있으면 새 기사를 만들지 않습니다. 대신 기존 기사 id로 `seen_rss_links`에만 기록합니다.
- 기사, 지역, 섹션, 이미지, 청크, `seen_rss_links`는 모든 처리(LLM 판단, 임베딩)가 끝난 뒤 **한 트랜잭션**으로 저장합니다. 중간에 실패하면 아무것도 저장되지 않고 다음 cron에서 다시 시도됩니다.
- `published_at`은 RSS 발행일, 없으면 RSS 생성일, 그것도 없으면 수집 시각으로 채웁니다. 어떤 값을 썼는지는 `published_at_source`에 기록합니다.
- `article_chunks`의 `region_codes`(`regions.parent_code`를 따라 상위 지역까지 펼친 코드. 예: 매탄1동 → 영통구 → 수원시 → 경기도), `section_ids`, `published_at`, `is_wire`는 기사 값을 복사해서 채웁니다.
- 보존 기간(최대 1년)이 지난 기사는 `DELETE FROM articles WHERE created_at < now() - interval '1 year'`로 지웁니다. 하위 테이블은 `ON DELETE CASCADE`로 같이 지워집니다.

## 청킹과 임베딩

| 항목 | 값 |
|---|---|
| 분할 방식 | Recursive Character Splitter, 문단(줄바꿈) 우선 |
| 청크 크기 | 오버랩 포함 최대 500 토큰 (Qwen3 토크나이저 기준), 앞뒤 각 10% 오버랩 |
| `embed_text` | `[지역: … \| 날짜: YYYY-MM-DD \| 제목: …]` 헤더 + 청크 본문 |
| 임베딩 모델 | DeepInfra `Qwen/Qwen3-Embedding-0.6B` (OpenAI 호환 API, `https://api.deepinfra.com/v1/openai`) |
| 차원 | 1024, `halfvec`로 저장 |
| 벡터 인덱스 | HNSW, 코사인 거리 (`m=16`, `ef_construction=64`) |
| 키워드 인덱스 | pg_search BM25, `pdb.lindera(korean)` (KoDic 사전) |

- 모델명과 차원은 `apps/rag/.env`에서 관리합니다. 차원을 바꾸려면 `contracts/schema.sql`의 `halfvec(1024)`와 `search_chunks()`의 파라미터 타입도 같이 바꾸고, 전체를 다시 임베딩해야 합니다.
- 모델을 바꾸면 이 표에 기록을 남깁니다.

## 검색

```sql
SELECT * FROM search_chunks(
    p_query_text      => '수원 매탄동 재개발',
    p_query_embedding => '[...]'::halfvec(1024),
    p_region_codes    => ARRAY['4111700000'],  -- 선택
    p_from            => now() - interval '30 days',
    p_exclude_wire    => true,                 -- 서비스 설정에 따라 호출마다 지정
    p_limit           => 10
);
```

BM25 결과와 벡터 결과를 각각 `p_candidates`(기본 100)개씩 뽑은 뒤, RRF(`k = p_rrf_k`, 기본 60)로 합칩니다.

## 행정동 마스터 적재

1. [주민등록 행정동 코드](https://jumin.mois.go.kr/)에서 행정기관 코드 파일을 받아, 압축 안의 `KIKcd_H.YYYYMMDD.xlsx`를 꺼냅니다.
   - 컬럼: `행정동코드, 시도명, 시군구명, 읍면동명, 생성일자, 말소일자`
   - 엑셀에서 CSV(UTF-8 또는 CP949)로 저장한 파일도 그대로 넣을 수 있습니다.
2. `apps/db/.env`의 `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`로 `127.0.0.1:5432`에 접속해서 적재합니다. DB를 띄운 호스트에서 실행하면 됩니다.

```bash
uv run apps/db/scripts/load_regions.py KIKcd_H.20260101.xlsx
```

`uv`가 없다면 `pip install "psycopg[binary]" openpyxl python-dotenv`로 필요한 패키지를 설치한 뒤 `python`으로 실행하면 됩니다. Python 3.11 이상이 필요합니다.

- `--dry-run`: 적재한 뒤 롤백해서 건수만 확인합니다.
- `--env`: 다른 `.env` 파일을 지정합니다.
- `--host`, `--port`: 접속할 DB 주소를 바꿉니다.

**동작 방식**
- 코드를 기준으로 upsert합니다. 새 파일을 받을 때마다 다시 실행하면 됩니다. 기존 행은 지우지 않고, 폐지된 코드는 말소일자가 `valid_to`에 들어갑니다.
- `level`은 코드 모양으로 판단합니다. `XX00000000`은 시도, `XXXXX00000`은 시군구, 나머지는 읍면동입니다.
- `parent_code` 연결 규칙:
  - 읍면동 → 소속 시군구
  - 일반구(예: `수원시 영통구`) → 시(`수원시`)
  - 시군구 → 시도

`article_regions`의 코드 컬럼은 `regions`를 FK로 참조합니다. 그래서 지역 코드까지 저장하려면 수집을 시작하기 전에 이 적재를 먼저 해야 합니다.
