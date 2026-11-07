# newsmap

지역 뉴스 RSS를 모아서 시도/ 시군구/ 읍면동 단위로 하이브리드 검색(BM25 + 벡터)하는 RAG 프로젝트입니다.

## 디렉터리 구성

```
├─ docker-compose.yml          # db, rag, fe, be 서비스
├─ docker-compose.prod.yml     # 운영 서버용 (GHCR 이미지 사용, 서버에서 빌드 안 함)
├─ .github/workflows/          # ci.yml (lint·테스트), deploy.yml (master push → GHCR → Vultr)
├─ deploy/                     # 운영 서버 스크립트 (배포·롤백, rag 주기 실행, 보존 기간 삭제, crontab)
├─ dockerfiles/db.dockerfile   # PostgreSQL + 확장
├─ dockerfiles/rag.dockerfile  # Python 워커 (상시 기동, exec 로 실행)
├─ dockerfiles/fe.dockerfile   # Next.js standalone (be 뒤에서만 접근)
├─ dockerfiles/be.dockerfile   # Laravel + FrankenPHP Octane. 서비스 앞단 (prod 80/443)
├─ contracts/schema.sql        # DB 스키마 (직접 적용)
└─ apps/
   ├─ db/.env.example          # db 컨테이너와 DB 스크립트용 POSTGRES_*
   ├─ db/scripts/              # DB 기준 데이터 적재 스크립트 (행정동 코드)
   ├─ be/                      # Laravel API (조회·검색). 상세는 apps/be/CLAUDE.md
   ├─ fe/.env.example          # Next.js 지도 화면 (NEXT_PUBLIC_* 는 빌드 때 박힘)
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
| `seen_rss_links` | 검사를 마친 RSS 링크. 기사 페이지를 열기 전에 `(feed_key, rss_link)`로 중복을 거름. 지역이 없어 건너뛴 링크는 `article_id` NULL + `skip_reason` |
| `article_regions` | 기사와 지역의 N:M 관계 (코드 + LLM 원문 이름, 대표 지역은 `is_primary`) |
| `article_sections` | 기사와 섹션의 N:M 관계 (대표 섹션은 `is_primary`) |
| `article_images` | 이미지와 썸네일 (캡션, 출처 원문, 라이선스 통신사) |
| `article_chunks` | 청크 원문 + 임베딩용 텍스트 + `halfvec(1024)` + 필터용 비정규화 컬럼 |

### 수집 워커가 지켜야 할 규칙

- `seen_rss_links`에 이미 있는 `(feed_key, rss_link)`는 기사 페이지를 열지 않습니다(건너뛴 링크 포함). 저장된 기사이고 RSS의 `updated_at`만 달라졌으면 `articles.rss_updated_at`만 갱신합니다.
- 페이지를 파싱한 뒤 `canonical_url`이 이미 있으면 새 기사를 만들지 않습니다. 대신 기존 기사 id로 `seen_rss_links`에만 기록합니다.
- 지역 코드(시도·시군구·읍면동)가 하나도 없는 기사는 저장하지 않습니다. LLM 판단 직후 건너뛰고 `seen_rss_links`에 `article_id` NULL로 기록합니다. 사유는 `skip_reason`에 남깁니다: LLM이 지역과 무관하다고 본 기사는 `'no region'`, 지역명은 있지만 코드 매칭이 모두 실패한 기사는 `'not match region'`. 일부 단위만 매칭되면 그대로 저장합니다.
- 기사, 지역, 섹션, 이미지, 청크, `seen_rss_links`는 모든 처리(LLM 판단, 임베딩)가 끝난 뒤 **한 트랜잭션**으로 저장합니다. 중간에 실패하면 아무것도 저장되지 않고 다음 cron에서 다시 시도됩니다.
- `published_at`은 RSS 발행일, 없으면 RSS 생성일, 그것도 없으면 수집 시각으로 채웁니다. 어떤 값을 썼는지는 `published_at_source`에 기록합니다.
- `article_chunks`의 `region_codes`(`regions.parent_code`를 따라 상위 지역까지 펼친 코드. 예: 매탄1동 → 영통구 → 수원시 → 경기도), `section_ids`, `published_at`, `is_wire`는 기사 값을 복사해서 채웁니다.
- 보존 기간(최대 1년)이 지난 기사는 `DELETE FROM articles WHERE created_at < now() - interval '1 year'`로 지웁니다. 하위 테이블은 `ON DELETE CASCADE`로 같이 지워집니다. 건너뛴 `seen_rss_links` 행(`article_id` NULL)은 기사와 연결이 없으므로 `created_at` 기준으로 따로 지웁니다.

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
- `--retire-missing`: 이번 파일에 없는 현행 코드를 파일 기준일(파일명의 YYYYMMDD, 또는 `--as-of`)로 말소 처리합니다. 행은 지우지 않습니다.

### 행정구역 개편 반영 (마스터 갱신)
행정구역은 항상 최신 마스터를 따릅니다(예: 광주·전남 → 전남광주통합특별시). 개편이 있으면 아래 순서로 갱신합니다.

```bash
uv run apps/db/scripts/load_regions.py KIKcd_H.YYYYMMDD.xlsx --retire-missing --dry-run   # 건수 확인
uv run apps/db/scripts/load_regions.py KIKcd_H.YYYYMMDD.xlsx --retire-missing
cd apps/rag && uv run python -m rag.remap_regions --dry-run   # 기존 기사 재매핑 건수 확인
cd apps/rag && uv run python -m rag.remap_regions
```

지도 경계(`apps/fe/scripts/build-geo.mjs`의 `SOURCE_VERSION`)도 같은 기준일 근처 버전으로 맞춥니다.

**동작 방식**
- 코드를 기준으로 upsert합니다. 새 파일을 받을 때마다 다시 실행하면 됩니다. 기존 행은 지우지 않고, 폐지된 코드는 말소일자가 `valid_to`에 들어갑니다.
- `level`은 코드 모양으로 판단합니다. `XX00000000`은 시도, `XXXXX00000`은 시군구, 나머지는 읍면동입니다.
- `parent_code` 연결 규칙:
  - 읍면동 → 소속 시군구
  - 일반구(예: `수원시 영통구`) → 시(`수원시`)
  - 시군구 → 시도

`article_regions`의 코드 컬럼은 `regions`를 FK로 참조합니다. 그래서 지역 코드까지 저장하려면 수집을 시작하기 전에 이 적재를 먼저 해야 합니다.

## 운영(prod) 배포

master 에 push 하면 GitHub Actions 가 배포합니다(`.github/workflows/deploy.yml`).

1. `ci.yml`: fe lint·빌드, be 테스트·pint, rag pytest
2. 이미지 4개(db·rag·fe·be)를 빌드해 `ghcr.io/iamone6/newsmap-<서비스>:sha-<커밋 7자리>` 와 `:latest` 로 push
3. compose 파일과 `deploy/` 를 서버 `/srv/newsmap` 에 복사하고 `deploy/deploy.sh sha-xxxxxxx` 실행 (pull → up → be healthy 확인)
4. `https://<도메인>/up` 확인

서버에는 소스가 없고 compose 파일·운영 스크립트·`apps/{db,rag,be}/.env` 만 있습니다. 환경값은 서버에서만 관리하고 CI 는 건드리지 않습니다. fe 의 `NEXT_PUBLIC_*` 는 빌드 때 번들에 박히므로 GitHub Secrets 에서 넣습니다.

### GitHub 설정

| 종류 | 이름 | 값 |
|---|---|---|
| Secret | `VULTR_HOST` | 서버 IP |
| Secret | `VULTR_USER` | 배포 사용자 (예: `deploy`) |
| Secret | `VULTR_SSH_KEY` | 배포 사용자의 SSH 개인키 (배포 전용으로 새로 만든다) |
| Secret | `VULTR_SSH_FINGERPRINT` | 서버 호스트키 SHA256 지문 (`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` 의 `SHA256:...` 부분) |
| Secret | `FE_KAKAO_MAP_JS_KEY` | 카카오맵 JS 키 (비우면 SVG 지도) |
| Variable | `PROD_DOMAIN` | 서비스 도메인 (예: `newsmap.example.com`) |

### 서버 최초 준비 (1회)

```bash
# Ubuntu LTS 기준. Docker Engine + compose plugin 설치 후
sudo timedatectl set-timezone Asia/Seoul
sudo adduser --disabled-password deploy && sudo usermod -aG docker deploy   # SSH 공개키를 ~deploy/.ssh/authorized_keys 에 등록
sudo mkdir -p /srv/newsmap/apps/{db,rag,be} /data/postgres && sudo chown -R deploy: /srv/newsmap
# 방화벽: 22, 80/tcp, 443/tcp, 443/udp(HTTP/3) 만 연다. DNS A 레코드가 서버를 가리켜야 Caddy 가 인증서를 발급한다.

# deploy 사용자로: GHCR 패키지가 private 이면 read:packages 권한 PAT 로 한 번 로그인해 둔다 (~/.docker/config.json 에 저장됨)
docker login ghcr.io -u iamone6
```

prod `.env` 는 `.env.example` 을 참고해 서버에서 직접 만들고 `chmod 600` 으로 둡니다. 로컬 값과 다르게 둘 것:

- `apps/db/.env`: 새 `POSTGRES_PASSWORD`
- `apps/be/.env`: `APP_ENV=production`, `APP_DEBUG=false`, `APP_URL=https://<도메인>`, `SERVER_NAME=<도메인>`, `FE_UPSTREAM=fe:3000`, `LOG_CHANNEL=stderr`, `LOG_LEVEL=warning`, 새 `APP_KEY`, `DB_PASSWORD`(db 와 같게)
- `apps/rag/.env`: `DB_PASSWORD`, `DEEPINFRA_API_KEY`

카카오 Developers 의 Web 플랫폼 도메인에 `https://<도메인>` 을 추가합니다. 그 다음 deploy.yml 을 Actions 에서 수동 실행(workflow_dispatch)하거나 master 에 push 합니다.

### 로컬 DB 이전 (최초 1회)

로그인 계정(`users`, `personal_access_tokens`)은 데이터를 빼고 옮깁니다(로컬 테스트 계정이 운영에 들어가지 않게).

서버에는 첫 배포 전까지 compose 파일·이미지가 없으므로, **첫 배포를 먼저 하고**(DB 는 빈 상태로 뜬다) 빈 DB 에 복원합니다. db 이미지에는 스키마 초기화 스크립트가 없고 be 도 기동 때 마이그레이션을 하지 않아 빈 DB 에 그대로 복원할 수 있습니다.

```bash
# 로컬: 컨테이너 안에서 파일로 덤프한 뒤 docker compose cp 로 꺼낸다.
# (Windows 에서 `... > newsmap.dump` 처럼 파이프로 받으면 바이너리가 깨진다: 175MB → 167MB, pg_restore 실패)
docker compose exec -T db sh -c 'pg_dump -Fc -U "$POSTGRES_USER" --exclude-table-data=users --exclude-table-data=personal_access_tokens -f /tmp/newsmap.dump "$POSTGRES_DB"'
docker compose cp db:/tmp/newsmap.dump newsmap.dump
docker compose exec -T db rm /tmp/newsmap.dump
scp newsmap.dump deploy@<서버>:/srv/newsmap/

# 서버 (/srv/newsmap). 첫 배포가 끝나 컨테이너가 떠 있는 상태에서. rag cron 은 복원 뒤에 등록한다
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T db sh -c 'pg_restore --no-owner --exit-on-error -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < newsmap.dump
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T be php artisan cache:clear   # 빈 DB 때 캐시된 통계를 비운다
rm newsmap.dump
```

덤프에 스키마·확장(vector, pg_search)·인덱스가 들어 있으므로 `contracts/schema.sql` 은 따로 적용하지 않습니다. 복원 전에 로컬의 새 DB(`CREATE DATABASE …`)에 한 번 `pg_restore` 해 보면 덤프가 정상인지 미리 확인할 수 있습니다.

### 주기 작업 (cron)

```bash
crontab /srv/newsmap/deploy/crontab   # deploy 사용자로
```

- 매일 00:00 `deploy/run-rag.sh`(`--feed-key ALL`, 하루 1회). 이전 실행이 안 끝났으면 `flock` 으로 건너뜁니다. 한 번 실행은 최대 3시간이며 넘기면 강제로 끝냅니다(lock 이 계속 잡히지 않게).
- 매일 04:10 `deploy/purge-old-articles.sh`(보존 기간 1년 지난 기사 삭제).
- 출력은 `deploy/cron.log`, rag 자체 로그는 `apps/rag/logs`.

### 롤백

```bash
cat /srv/newsmap/deploy/.current-tag        # 지금 배포된 태그
/srv/newsmap/deploy/deploy.sh sha-<이전 커밋 7자리>
```

1주일 넘게 쓰지 않은 이미지는 배포 때 정리되므로, 그보다 오래된 태그는 다시 pull 합니다(GHCR 에는 남아 있음).
