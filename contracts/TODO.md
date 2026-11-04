# TODO

앞으로 해야 할 일을 기록한다. 끝낸 항목은 지운다. 위에 있을수록 먼저 한다.

- [ ] Vultr 첫 배포 (절차는 README "운영(prod) 배포"). 도메인 `newsmap.duckdns.org`, 배포 사용자 `deploy`
    - [x] 1단계 서버 준비 (2026-11-04): Ubuntu 24.04 LTS·Asia/Seoul, Docker·compose, deploy 사용자(docker 그룹)·`/srv/newsmap`·`/data/postgres`, 배포 전용 SSH 키(PC `~/.ssh/newsmap_deploy`), 비밀번호 SSH 로그인 차단, ufw 22·80·443/tcp, deploy 의 GHCR 로그인(read:packages PAT), DuckDNS A 레코드
    - [ ] (선택) `sudo ufw allow 443/udp` (HTTP/3)
    - [x] 2단계 GitHub 등록 (2026-11-04): Secrets `VULTR_HOST`(도메인)·`VULTR_USER`·`VULTR_SSH_KEY`·`VULTR_SSH_FINGERPRINT`(ED25519. 첫 배포에서 mismatch 나면 ECDSA `SHA256:z8Bb9fb3BE8Y5qheleknaNVNUVtWVD9rIleQ7gVgzu8` 로)·`FE_KAKAO_MAP_JS_KEY`, Variable `PROD_DOMAIN`
    - [x] 3단계 서버에 prod `.env` 3개 작성 (2026-11-04): 로컬 값 기반, 새 `POSTGRES_PASSWORD`·`APP_KEY`, `chmod 600`
    - [x] 4단계 카카오 Developers 에 `https://newsmap.duckdns.org` 등록 (2026-11-04)
    - [x] 5단계 첫 배포 `sha-9871b5a` (2026-11-04): 지문은 ECDSA 로 교체, 로컬 DB 복원(기사 14,278·청크 34,241·행정동 9,612, users 제외), API·하이브리드 검색 응답 확인
    - [ ] 서버 deploy 사용자로 `crontab /srv/newsmap/deploy/crontab` (rag 30분 주기·보존 기간 삭제). 등록 후 30분 뒤 `deploy/cron.log`·`apps/rag/logs/rag.log` 확인
    - [ ] README 로컬 DB 이전 명령 수정: Windows 에서 `pg_dump ... > newsmap.dump` 파이프가 바이너리를 깨뜨린다(175MB → 167MB). 컨테이너 안 `-f /tmp/x.dump` 후 `docker compose cp` 로 꺼내도록
    - [ ] 화면 확인: 카카오맵 로드(`domain mismatched` 없는지)·기사 수 색칠·썸네일
- [ ] be CI 경고 정리: `.env` 없는 환경(CI)에서 `php artisan test` 가 기능 테스트마다 `file_get_contents(/app/.env)` 경고를 낸다(25건, 실패 아님). `vendor/bin/phpunit` 로는 안 나므로 artisan test 쪽(Pest/Collision·dev 패키지)이 원인으로 보임
- [ ] 운영 DB 백업: 정기 `pg_dump`(서버 밖 보관) 또는 Vultr 자동 스냅샷 결정
- [ ] 조회수: `articles.view_count`(또는 별도 집계 테이블) 추가 → API `view_count`, `sort=popular` 활성화 → fe 의 "인기순" 옵션 숨김 해제(`RegionArticlesPanel.tsx`)와 `ArticleListItem.view_count` 복원
- [ ] 지역 중심 좌표: `regions` 에 좌표 추가 여부 결정 → `/regions` 의 `center`
- [ ] 바다·섬(`SEA_*`, `ISL_*`): rag 분류 규칙과 저장 방식 결정 → `/stats/regions`, `/regions/{code}/articles`
- [ ] 관심 지역: `favorite_regions` 테이블(schema.sql) + `/me/favorite-regions` 구현
- [ ] `GET /articles/{id}`: `author`(publisher_name·reporters 매핑)와 `body_html`(본문이 HTML 제거된 텍스트) 형식 결정
- [ ] 회원가입 API 를 둘지 결정 (v1 은 로그인만. 로컬 테스트 계정은 `TestUserSeeder`)
- [ ] fe: `robots.txt` 추가 (Next.js `src/app/robots.ts`. `/api/` 는 크롤링 제외. Caddy 가 `/robots.txt` 를 fe 로 넘기므로 be 쪽 설정은 필요 없음)
- [ ] fe: SEO 작업 (메타데이터 title·description·Open Graph·canonical, `sitemap.xml`(`src/app/sitemap.ts`), JSON-LD 구조화 데이터(`WebSite`+`SearchAction`, 기사 목록은 `ItemList`/`NewsArticle`). 지도·목록이 클라이언트 렌더링이라 크롤러에 보일 서버 렌더링 범위도 함께 정한다)
