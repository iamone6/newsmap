# TODO

앞으로 해야 할 일을 기록한다. 끝낸 항목은 지운다. 위에 있을수록 먼저 한다.

- [ ] 검색: 하이브리드 검색에 관련도 하한이 없어 전혀 관계없는 기사도 결과에 섞인다(2026-11-07 사용자 지적). 지금 유사도 필터링·순위 제어를 살펴보고 대안을 제시한 뒤 구현한다
    - 지금 구조(살펴본 출발점): `search_chunks()`(`contracts/schema.sql`)는 BM25 상위 `p_candidates` 개와 벡터 상위 `p_candidates` 개를 순위만으로 RRF(k=60) 결합한다. **벡터 쪽은 거리 상한 없이 가장 가까운 N개를 항상 채워 오므로**, 검색어와 상관없는 청크도 후보가 되고 RRF 점수(1/(k+rank))는 절대 관련도가 아니라 하한을 걸 기준이 못 된다. be(`SearchRegionArticlesAction`)는 `p_limit`·`p_candidates` 를 모두 300(`ArticleConsts::SEARCH_CHUNK_LIMIT`)으로 넘기고, 받은 청크를 기사 단위로 묶어 페이지를 자를 뿐 점수로 거르지 않는다. BM25 만 쓰는 대체 경로도 하한이 없다
    - 검토할 대안 예: 벡터 거리 상한(코사인 거리 임계값)·BM25 점수 하한, 양쪽 모두에 걸린 청크 가중, 정규화 점수(최대값 대비 비율) 컷, 결과 수 상한 축소. 실제 검색어 몇 개로 거리·점수 분포를 재 보고 임계값을 정한다
- [ ] Vultr 첫 배포 (절차는 README "운영(prod) 배포"). 도메인 `newsmap.duckdns.org`, 배포 사용자 `deploy`
    - [x] 1단계 서버 준비 (2026-11-04): Ubuntu 24.04 LTS·Asia/Seoul, Docker·compose, deploy 사용자(docker 그룹)·`/srv/newsmap`·`/data/postgres`, 배포 전용 SSH 키(PC `~/.ssh/newsmap_deploy`), 비밀번호 SSH 로그인 차단, ufw 22·80·443/tcp, deploy 의 GHCR 로그인(read:packages PAT), DuckDNS A 레코드
    - [ ] (선택) `sudo ufw allow 443/udp` (HTTP/3)
    - [x] 2단계 GitHub 등록 (2026-11-04): Secrets `VULTR_HOST`(도메인)·`VULTR_USER`·`VULTR_SSH_KEY`·`VULTR_SSH_FINGERPRINT`(ED25519. 첫 배포에서 mismatch 나면 ECDSA `SHA256:z8Bb9fb3BE8Y5qheleknaNVNUVtWVD9rIleQ7gVgzu8` 로)·`FE_KAKAO_MAP_JS_KEY`, Variable `PROD_DOMAIN`
    - [x] 3단계 서버에 prod `.env` 3개 작성 (2026-11-04): 로컬 값 기반, 새 `POSTGRES_PASSWORD`·`APP_KEY`, `chmod 600`
    - [x] 4단계 카카오 Developers 에 `https://newsmap.duckdns.org` 등록 (2026-11-04)
    - [x] 5단계 첫 배포 `sha-9871b5a` (2026-11-04): 지문은 ECDSA 로 교체, 로컬 DB 복원(기사 14,278·청크 34,241·행정동 9,612, users 제외), API·하이브리드 검색 응답 확인
    - [x] 서버 crontab 등록 (2026-11-04): rag 매일 00:00 하루 1회, 보존 기간 삭제 04:10
    - [x] 첫 cron 실행 확인 (2026-11-05 00:00~00:07): 34개 피드, 신규 247건, 실패 1, 예상 비용 $0.042
- [ ] 조회수: `articles.view_count`(또는 별도 집계 테이블) 추가 → API `view_count`, `sort=popular` 활성화 → fe 의 "인기순" 옵션 숨김 해제(`RegionArticlesPanel.tsx`)와 `ArticleListItem.view_count` 복원
- [ ] 지역 중심 좌표: `regions` 에 좌표 추가 여부 결정 → `/regions` 의 `center`
- [ ] 바다·섬(`SEA_*`, `ISL_*`): rag 분류 규칙과 저장 방식 결정 → `/stats/regions`, `/regions/{code}/articles`
- [ ] 관심 지역: `favorite_regions` 테이블(schema.sql) + `/me/favorite-regions` 구현
- [ ] `GET /articles/{id}`: `author`(publisher_name·reporters 매핑)와 `body_html`(본문이 HTML 제거된 텍스트) 형식 결정
- [ ] 회원가입 API 를 둘지 결정 (v1 은 로그인만. 로컬 테스트 계정은 `TestUserSeeder`)
- [ ] fe: `robots.txt` 추가 (Next.js `src/app/robots.ts`. `/api/` 는 크롤링 제외. Caddy 가 `/robots.txt` 를 fe 로 넘기므로 be 쪽 설정은 필요 없음)
- [ ] fe: SEO 작업 (메타데이터 title·description·Open Graph·canonical, `sitemap.xml`(`src/app/sitemap.ts`), JSON-LD 구조화 데이터(`WebSite`+`SearchAction`, 기사 목록은 `ItemList`/`NewsArticle`). 지도·목록이 클라이언트 렌더링이라 크롤러에 보일 서버 렌더링 범위도 함께 정한다)
