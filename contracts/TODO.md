# TODO

앞으로 해야 할 일을 기록한다. 끝낸 항목은 지운다. 위에 있을수록 먼저 한다.

- [ ] **(최우선)** fe 실제 API 연결 계획 세우기 — 아래 "fe 실제 API 연결" 항목의 범위·순서·mock 유지 여부를 정한다
- [ ] github CI/CD to Vultr - be 기초 작성 후 진행
- [ ] 조회수: `articles.view_count`(또는 별도 집계 테이블) 추가 → API `view_count`, `sort=popular` 활성화. 그 전까지 fe 의 "인기순" 옵션을 숨길지 결정
- [ ] 썸네일 크기: rag 가 이미지 width/height 를 수집해 `article_images` 에 저장 → API `thumbnail` 을 다시 채움
- [ ] 지역 중심 좌표: `regions` 에 좌표 추가 여부 결정 → `/regions` 의 `center`
- [ ] 바다·섬(`SEA_*`, `ISL_*`): rag 분류 규칙과 저장 방식 결정 → `/stats/regions`, `/regions/{code}/articles`
- [ ] 관심 지역: `favorite_regions` 테이블(schema.sql) + `/me/favorite-regions` 구현
- [ ] `GET /articles/{id}`: `author`(publisher_name·reporters 매핑)와 `body_html`(본문이 HTML 제거된 텍스트) 형식 결정
- [ ] 회원가입 API 를 둘지 결정 (v1 은 로그인만. 로컬 테스트 계정은 `TestUserSeeder`)
- [ ] fe 실제 API 연결: 경로를 `/articles`, 필드를 `total_articles`·`today_articles`·`article_count` 로 바꾸고(`newsApi.ts`·types·mock), v1 응답에서 빠진 `view_count`·nullable `thumbnail`·nullable `region`·검색 시 `meta.search_type` 에 맞게 `apps/fe/src/lib/api/types.ts` 점검
- [ ] fe: `robots.txt` 추가 (Next.js `src/app/robots.ts`. `/api/` 는 크롤링 제외. Caddy 가 `/robots.txt` 를 fe 로 넘기므로 be 쪽 설정은 필요 없음)
- [ ] fe: SEO 작업 (메타데이터 title·description·Open Graph·canonical, `sitemap.xml`(`src/app/sitemap.ts`), JSON-LD 구조화 데이터(`WebSite`+`SearchAction`, 기사 목록은 `ItemList`/`NewsArticle`). 지도·목록이 클라이언트 렌더링이라 크롤러에 보일 서버 렌더링 범위도 함께 정한다)
