# TODO

앞으로 해야 할 일을 기록한다. 끝낸 항목은 지운다. 위에 있을수록 먼저 한다.

- [ ] **[최우선, 2026-11-06 착수]** rag: 지역 코드가 하나도 없는 기사는 저장하지 않고 건너뛰기 (2026-11-05 결정, 규칙은 decisions 문서 4장 지역·5장, README "수집 워커가 지켜야 할 규칙")
    - [x] (2026-11-06, 로컬·운영 적용 `apps/db/migrations/20261106_seen_rss_links_skip_reason.sql`) `contracts/schema.sql`: `seen_rss_links.article_id` NULL 허용, `skip_reason text` 추가(`CHECK (skip_reason IN ('no region', 'not match region'))`, `CHECK ((article_id IS NULL) = (skip_reason IS NOT NULL))`). 운영·로컬 DB 용 `ALTER` 문도 따로 작성(스키마 파일은 재실행 안 됨)
    - [x] (2026-11-06, `repository.is_seen` 으로 교체) `repository.find_seen_article_id`: 지금은 article_id 가 있어야 "본 것"이다. 행이 있으면 본 것으로(건너뛴 행 포함) 바꾸고, `rss_updated_at` 갱신은 article_id 가 있을 때만
    - [x] (2026-11-06) `pipeline._process_item`: LLM 판단·지역 매칭 직후, 코드(시도·시군구·읍면동)가 모두 NULL 이면 청킹·임베딩 전에 `seen_rss_links` 에 건너뛴 행만 기록하고 끝낸다. `sido_name` null → `'no region'`, 이름은 있는데 매칭 실패 → `'not match region'`. `RunResult` 에 건너뛴 수 추가(실패로 세지 않음), `rag.log` 요약에도 표시
    - [x] (2026-11-06) `deploy/purge-old-articles.sh`: `seen_rss_links` 의 건너뛴 행(article_id NULL) 중 1년 지난 것도 삭제
    - [ ] (로컬 2026-11-06 완료: 2,951건 삭제·seen 2,953행 전환, `apps/db/migrations/20261106_delete_articles_without_region.sql`. 운영 남음) 기존 지역 없는 기사 삭제: 로컬 기준 14,278건 중 2,951건(약 21%, 전부 `article_regions` 행 없음). 지우면 연결된 `seen_rss_links` 행도 CASCADE 로 지워져 피드에 남은 링크를 다시 처리하게 되므로, 먼저 그 행들을 `article_id = NULL, skip_reason = 'no region'` 으로 바꾼 뒤 기사를 지운다. 운영은 백업(pg_dump) 후 실행
    - [x] (2026-11-06, `tests/test_pipeline_region_skip.py` 13개) 테스트: 건너뛰기 두 경우·일부 매칭(저장)·건너뛴 링크 재수집 안 함
- [ ] rag: 이미 본 링크의 `rss_updated_at` 갱신이 구현돼 있지 않다. decisions 문서 5장·README 는 RSS `updated_at` 이 바뀌면 `articles.rss_updated_at` 만 갱신한다고 정했지만, `collector` 는 본 링크를 그냥 건너뛴다. 구현하거나 문서에서 뺄지 결정
- [ ] Vultr 첫 배포 (절차는 README "운영(prod) 배포"). 도메인 `newsmap.duckdns.org`, 배포 사용자 `deploy`
    - [x] 1단계 서버 준비 (2026-11-04): Ubuntu 24.04 LTS·Asia/Seoul, Docker·compose, deploy 사용자(docker 그룹)·`/srv/newsmap`·`/data/postgres`, 배포 전용 SSH 키(PC `~/.ssh/newsmap_deploy`), 비밀번호 SSH 로그인 차단, ufw 22·80·443/tcp, deploy 의 GHCR 로그인(read:packages PAT), DuckDNS A 레코드
    - [ ] (선택) `sudo ufw allow 443/udp` (HTTP/3)
    - [x] 2단계 GitHub 등록 (2026-11-04): Secrets `VULTR_HOST`(도메인)·`VULTR_USER`·`VULTR_SSH_KEY`·`VULTR_SSH_FINGERPRINT`(ED25519. 첫 배포에서 mismatch 나면 ECDSA `SHA256:z8Bb9fb3BE8Y5qheleknaNVNUVtWVD9rIleQ7gVgzu8` 로)·`FE_KAKAO_MAP_JS_KEY`, Variable `PROD_DOMAIN`
    - [x] 3단계 서버에 prod `.env` 3개 작성 (2026-11-04): 로컬 값 기반, 새 `POSTGRES_PASSWORD`·`APP_KEY`, `chmod 600`
    - [x] 4단계 카카오 Developers 에 `https://newsmap.duckdns.org` 등록 (2026-11-04)
    - [x] 5단계 첫 배포 `sha-9871b5a` (2026-11-04): 지문은 ECDSA 로 교체, 로컬 DB 복원(기사 14,278·청크 34,241·행정동 9,612, users 제외), API·하이브리드 검색 응답 확인
    - [x] 서버 crontab 등록 (2026-11-04): rag 매일 00:00 하루 1회, 보존 기간 삭제 04:10
    - [x] 첫 cron 실행 확인 (2026-11-05 00:00~00:07): 34개 피드, 신규 247건, 실패 1, 예상 비용 $0.042
    - [ ] README 로컬 DB 이전 명령 수정: Windows 에서 `pg_dump ... > newsmap.dump` 파이프가 바이너리를 깨뜨린다(175MB → 167MB). 컨테이너 안 `-f /tmp/x.dump` 후 `docker compose cp` 로 꺼내도록
    - [ ] 화면 확인: 카카오맵 로드(`domain mismatched` 없는지)·기사 수 색칠·썸네일
- [ ] rag 하루 1회 수집량: 첫 실행에서 `imaeil`·`ulsanpress` 가 `MAX_ITEMS_PER_BATCH`(50) 상한에 걸렸다(`ksilbo` 44). 며칠 지켜보고 밀리면 상한을 올리거나 해당 피드만 더 자주 돌린다
- [ ] rag 로그 시각이 UTC 로 찍힌다: 컨테이너에 `TZ=Asia/Seoul` 은 있지만 이미지에 tzdata 가 없어 `date`·`logging` 이 UTC(저장 데이터는 timezone-aware 라 정상). `rag.dockerfile` 에 tzdata 설치(fe.dockerfile 처럼)
- [ ] rag: `www.tbs.seoul.kr` 기사 수집이 SSL 인증서 검증 실패(`unable to get local issuer certificate`, 중간 인증서 누락으로 보임)로 매번 실패한다(`google_news_seoul`). 해당 호스트 제외 또는 중간 인증서 보강 결정
- [ ] fe: 지역을 클릭하면 그 지역으로 부드럽게 이동(줌·이동 애니메이션). 지금은 카카오 `focusOn()` 의 `setBounds()`·`setLevel()` 로 바로 바뀐다. SVG 엔진(d3 zoom transition)과 동작을 맞춘다
- [ ] fe: 모바일 화면에서 기사 목록 패널을 띄웠다 닫으면 간헐적으로 지도가 비정상 출력된다. 재현 조건(엔진·브라우저·패널 열고 닫는 횟수)부터 확인한다(패널로 지도 크기가 바뀐 뒤 카카오 `relayout()` 이나 SVG 크기 재계산이 빠지는지 의심)
- [ ] 운영 DB 백업: 정기 `pg_dump`(서버 밖 보관) 또는 Vultr 자동 스냅샷 결정
- [ ] 조회수: `articles.view_count`(또는 별도 집계 테이블) 추가 → API `view_count`, `sort=popular` 활성화 → fe 의 "인기순" 옵션 숨김 해제(`RegionArticlesPanel.tsx`)와 `ArticleListItem.view_count` 복원
- [ ] 지역 중심 좌표: `regions` 에 좌표 추가 여부 결정 → `/regions` 의 `center`
- [ ] 바다·섬(`SEA_*`, `ISL_*`): rag 분류 규칙과 저장 방식 결정 → `/stats/regions`, `/regions/{code}/articles`
- [ ] 관심 지역: `favorite_regions` 테이블(schema.sql) + `/me/favorite-regions` 구현
- [ ] `GET /articles/{id}`: `author`(publisher_name·reporters 매핑)와 `body_html`(본문이 HTML 제거된 텍스트) 형식 결정
- [ ] 회원가입 API 를 둘지 결정 (v1 은 로그인만. 로컬 테스트 계정은 `TestUserSeeder`)
- [ ] fe: `robots.txt` 추가 (Next.js `src/app/robots.ts`. `/api/` 는 크롤링 제외. Caddy 가 `/robots.txt` 를 fe 로 넘기므로 be 쪽 설정은 필요 없음)
- [ ] fe: SEO 작업 (메타데이터 title·description·Open Graph·canonical, `sitemap.xml`(`src/app/sitemap.ts`), JSON-LD 구조화 데이터(`WebSite`+`SearchAction`, 기사 목록은 `ItemList`/`NewsArticle`). 지도·목록이 클라이언트 렌더링이라 크롤러에 보일 서버 렌더링 범위도 함께 정한다)
