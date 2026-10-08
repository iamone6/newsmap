# CLAUDE.md (apps/rag)

이 파일은 `apps/rag` 안에서 작업할 때 적용되는 가이드다. 모노레포 전체 구조·DB 스택 등은 저장소 루트의 `CLAUDE.md`를 따른다.

## 프로젝트 개요

`apps/rag`는 지역 뉴스 RSS를 수집해 기사별로 [페이지 파싱 → LLM 판단 → 청킹 → 임베딩 → DB 저장]까지 진행하는 Python 워커다. 수집·크롤링·LLM 판단·청킹·임베딩이 이 프로젝트의 역할이고, 조회·검색은 `apps/be`(Laravel)가 맡는다. cron이나 수동 실행으로 스크립트를 돌리면 설정된 모든 피드를 순회하며 신규 기사를 끝까지 처리한다.

## 작업 시작 전에 읽을 것

1. `contracts/schema.sql` — 이 워커가 쓰는 테이블·컬럼·제약의 계약. 코드는 이 스키마에 맞춘다. 스키마를 고쳐야 할 것 같으면 직접 고치지 말고 이유와 제안 diff를 보고한다.
2. `prompts/postgre-schema,RAG.decisions.md` — 수집 규칙의 근거. 특히 3(역할 분담)~8(임베딩)장. 패키지 관리(uv, Python 3.14, langchain) 결정도 3장에 있다.
3. `apps/rag/feeds.yaml` — 수집 대상 피드 설정. `direct`(언론사 고정)와 `google_news_search`(언론사가 기사마다 다름, `exclude_sources`로 전국지·포털 제외) 두 타입이 있다.
4. `apps/rag/.env.example` — 워커가 읽는 환경변수 목록. 새 설정이 필요하면 여기에 주석과 함께 추가한다.
5. `apps/rag/` 의 기존 코드 — 이미 있는 구조와 관례를 따른다.

## 패키지 관리

- `uv`로 관리한다. `apps/rag/pyproject.toml` + `uv.lock` + `.python-version`(`3.14`)은 커밋하고, 가상환경(`apps/rag/.venv`, `apps/rag`에서 `uv sync`로 생성)은 커밋하지 않는다.
- 실행은 `uv run …`, 의존성 추가는 `uv add …`. pip을 직접 쓰지 않는다.
- 수집 파이프라인은 langchain(stable 1.4.x 계열)을 쓴다. 청킹은 `langchain_text_splitters.RecursiveCharacterTextSplitter`를 쓰고 토큰 길이 계산은 Qwen3 토크나이저로 넘긴다. LLM 판단·임베딩을 langchain 모델 추상화로 감쌀지, DeepInfra 호출을 직접 할지는 구현하면서 정하고 정한 내용을 decisions 문서에 남긴다.
- 테스트는 pytest를 쓴다.

## 파이프라인 (기사 1건 기준)

1. `feeds.yaml`에서 `feed_key`, `publisher_name`(`direct`만), RSS URL을 읽는다. `google_news_search` 타입은 언론사명을 설정에 넣지 않고 item의 `<source>` 태그에서 읽으며, `<link>`는 구글 내부 리다이렉트 ID라 실제 기사 URL로 디코딩하는 과정이 필요하다. `exclude_sources`에 걸리는 도메인의 기사는 처리하지 않는다.
2. RSS 항목마다 `seen_rss_links (feed_key, rss_link)` 조회.
   - 있으면 페이지를 열지 않는다. RSS `updated_at`이 다르면 `articles.rss_updated_at`만 갱신하고 끝.
3. 기사 페이지에서 제목, 부제목, 본문, canonical URL, 썸네일, 이미지 URL+캡션을 추출한다. 제목·부제목·본문·캡션은 HTML 태그와 특수문자를 제거한다. 원본 HTML은 저장하지 않는다.
   - `canonical_url`이 이미 있으면 새 기사를 만들지 않고, 기존 기사 id로 `seen_rss_links`에만 기록하고 끝.
4. LLM 판단 (모델은 `LLM_MODEL`): 지역(시도/시군구/읍면동, 행정동 코드와 매칭될 이름), 기자명(이메일 제외), 통신사 전재 여부(`wire_agencies` 별칭으로 정규화, 원문은 `wire_source_raw`), 이미지 캡션의 라이선스 출처, 섹션(6개 중 되도록 1개).
   - 지역 이름 → `regions` 코드 매칭. 실패하면 코드 NULL, 이름은 보관. 지역 무관이면 `article_regions` 행을 만들지 않는다.
   - `article_regions`의 코드는 `regions` FK라서, 행정동 마스터(`apps/db/scripts/load_regions.py`)가 수집 전에 먼저 적재돼 있어야 한다. 적재가 안 돼 있으면 모든 지역 매칭이 NULL로 빠진다.
5. `published_at` = RSS 발행일 → RSS 생성일 → 수집 시각, 사용한 출처를 `published_at_source`에 기록.
6. 청킹: 문단 우선 `RecursiveCharacterTextSplitter`, Qwen3 토크나이저로 오버랩 포함 최대 `CHUNK_MAX_TOKENS`, 앞뒤 `CHUNK_OVERLAP_RATIO`. `token_count`, `chunk_index`(0부터) 저장.
7. `embed_text` = `[지역: … | 날짜: YYYY-MM-DD | 제목: …]` 헤더 + 청크 본문. DeepInfra OpenAI 호환 API로 문서용 임베딩(쿼리 instruction은 붙이지 않음), `EMBEDDING_DIMENSIONS`와 응답 차원이 다르면 실패 처리. 차원을 바꾸는 건 `schema.sql`의 `halfvec(1024)`와 `search_chunks()` 파라미터 타입을 함께 바꾸고 전체를 다시 임베딩해야 하는 큰 변경이라, 직접 하지 말고 질문으로 보고한다. 모델을 바꾸면 README 표에 기록한다.
8. 청크 필터 컬럼: `region_codes`(기사 지역 코드를 `regions.parent_code`로 시도까지 펼친 합집합), `section_ids`, `published_at`, `is_wire`(= `wire_agency_id IS NOT NULL`).
9. 기사·지역·섹션·이미지·청크·`seen_rss_links`를 **한 트랜잭션**으로 저장. LLM·임베딩 호출은 트랜잭션 밖에서 미리 끝낸다. 실패 시 아무것도 저장하지 않고 다음 cron에 맡긴다(상태/재시도 컬럼 없음).
10. 수집(RSS fetch)과 정제·청킹·임베딩·적재는 별도 프로세스/cron으로 분리하지 않는다 — `seen_rss_links.article_id`가 `NOT NULL` FK라 기사 행이 만들어지기 전엔 "이미 봤다"는 상태를 영속화할 수 없기 때문이다. 코드 모듈(수집/파싱/LLM 판단/청킹/임베딩/저장)은 기능별로 나누되 실행 단위는 cron 1개로 둔다.

## 지켜야 할 것

- 기사 하나의 실패가 같은 실행의 다른 기사 처리를 막지 않게 한다. 실패는 로그로만 남긴다.
- `is_primary`(지역·섹션), `is_thumbnail`은 기사당 최대 1개. 부분 유니크 인덱스에 걸리지 않게 저장 전에 보장한다.
- 시각은 `Asia/Seoul` 기준 timezone-aware 값으로 다룬다.
- `DEEPINFRA_API_KEY` 등 비밀값은 `.env`에서만 읽고 로그·예외 메시지에 찍지 않는다. `.env` 파일은 만들거나 커밋하지 않는다.
- 결정 문서에 없는 정책을 처음 정해야 하면, 합리적인 기본안으로 구현하되 최종 보고에 "새로 정한 것"으로 따로 명시한다. 되돌리기 어려운 선택(스키마 변경, 저장 정책 변경)은 구현하지 말고 질문으로 보고한다.
- 라이브러리 API는 추측하지 말고 문서를 확인한다(WebFetch/WebSearch).
- 실제 언론사 사이트를 대량으로 긁는 테스트는 하지 않는다. 파서 테스트는 저장한 샘플이나 고정 fixture로 한다.

## 테스트·검증

- 가능한 범위에서 단위 테스트를 작성·실행한다(파서, 청킹, `published_at` 결정, 지역 코드 펼치기, 중복 판정, Google News 링크 디코딩).
- edge case 가 유닛테스트에 포함되어야 한다.
- 로컬 DB(`127.0.0.1:5432`)가 떠 있으면 저장 경로를 실제로 실행해 트랜잭션·제약 위반이 없는지 확인한다. 떠 있지 않으면 DB가 없어 확인하지 못했다고 보고한다.
