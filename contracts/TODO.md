# TODO

앞으로 해야 할 일을 기록한다. 끝낸 항목은 지운다. 위에 있을수록 먼저 한다.

- [ ] Vultr 첫 배포 (절차는 README "운영(prod) 배포"). 도메인 `newsmap.duckdns.org`, 배포 사용자 `deploy`
    - [x] 1단계 서버 준비 (2026-11-04): Ubuntu 24.04 LTS·Asia/Seoul, Docker·compose, deploy 사용자(docker 그룹)·`/srv/newsmap`·`/data/postgres`, 배포 전용 SSH 키(PC `~/.ssh/newsmap_deploy`), 비밀번호 SSH 로그인 차단, ufw 22·80·443/tcp, deploy 의 GHCR 로그인(read:packages PAT), DuckDNS A 레코드
    - [ ] (선택) `sudo ufw allow 443/udp` (HTTP/3)
    - [x] 2단계 GitHub 등록 (2026-11-04): Secrets `VULTR_HOST`(도메인)·`VULTR_USER`·`VULTR_SSH_KEY`·`VULTR_SSH_FINGERPRINT`(ED25519. 첫 배포에서 mismatch 나면 ECDSA `SHA256:z8Bb9fb3BE8Y5qheleknaNVNUVtWVD9rIleQ7gVgzu8` 로)·`FE_KAKAO_MAP_JS_KEY`, Variable `PROD_DOMAIN`
    - [x] 3단계 서버에 prod `.env` 3개 작성 (2026-11-04): 로컬 값 기반, 새 `POSTGRES_PASSWORD`·`APP_KEY`, `chmod 600`
    - [ ] 4단계 카카오 Developers Web 도메인에 `https://newsmap.duckdns.org` 추가
    - [ ] 5단계 로컬 DB 덤프 → 서버 복원 → master push(또는 workflow_dispatch)로 첫 배포 → `crontab deploy/crontab`
    - [ ] 확인: `https://newsmap.duckdns.org/up`, 지도·썸네일, 카카오맵 기사 수 색칠 화면
- [ ] 운영 DB 백업: 정기 `pg_dump`(서버 밖 보관) 또는 Vultr 자동 스냅샷 결정
- [ ] 조회수: `articles.view_count`(또는 별도 집계 테이블) 추가 → API `view_count`, `sort=popular` 활성화 → fe 의 "인기순" 옵션 숨김 해제(`RegionArticlesPanel.tsx`)와 `ArticleListItem.view_count` 복원
- [ ] 지역 중심 좌표: `regions` 에 좌표 추가 여부 결정 → `/regions` 의 `center`
- [ ] 바다·섬(`SEA_*`, `ISL_*`): rag 분류 규칙과 저장 방식 결정 → `/stats/regions`, `/regions/{code}/articles`
- [ ] 관심 지역: `favorite_regions` 테이블(schema.sql) + `/me/favorite-regions` 구현
- [ ] `GET /articles/{id}`: `author`(publisher_name·reporters 매핑)와 `body_html`(본문이 HTML 제거된 텍스트) 형식 결정
- [ ] 회원가입 API 를 둘지 결정 (v1 은 로그인만. 로컬 테스트 계정은 `TestUserSeeder`)
- [ ] fe: `robots.txt` 추가 (Next.js `src/app/robots.ts`. `/api/` 는 크롤링 제외. Caddy 가 `/robots.txt` 를 fe 로 넘기므로 be 쪽 설정은 필요 없음)
- [ ] fe: SEO 작업 (메타데이터 title·description·Open Graph·canonical, `sitemap.xml`(`src/app/sitemap.ts`), JSON-LD 구조화 데이터(`WebSite`+`SearchAction`, 기사 목록은 `ItemList`/`NewsArticle`). 지도·목록이 클라이언트 렌더링이라 크롤러에 보일 서버 렌더링 범위도 함께 정한다)
