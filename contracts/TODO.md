# TODO

앞으로 해야 할 일을 기록한다. 끝낸 항목은 지운다. 위에 있을수록 먼저 한다.

- [ ] github CI/CD to Vultr - be 기초 작성 후 진행
- [ ] 조회수: `articles.view_count`(또는 별도 집계 테이블) 추가 → API `view_count`, `sort=popular` 활성화 → fe 의 "인기순" 옵션 숨김 해제(`RegionArticlesPanel.tsx`)와 `ArticleListItem.view_count` 복원
- [ ] 썸네일 이미지 캐시 보존: fe 컨테이너의 `/_next/image` 디스크 캐시(`.next/cache/images`)는 컨테이너를 다시 만들면 사라진다. prod 에서 볼륨으로 둘지 결정
- [ ] 지역 중심 좌표: `regions` 에 좌표 추가 여부 결정 → `/regions` 의 `center`
- [ ] 바다·섬(`SEA_*`, `ISL_*`): rag 분류 규칙과 저장 방식 결정 → `/stats/regions`, `/regions/{code}/articles`
- [ ] 관심 지역: `favorite_regions` 테이블(schema.sql) + `/me/favorite-regions` 구현
- [ ] `GET /articles/{id}`: `author`(publisher_name·reporters 매핑)와 `body_html`(본문이 HTML 제거된 텍스트) 형식 결정
- [ ] 회원가입 API 를 둘지 결정 (v1 은 로그인만. 로컬 테스트 계정은 `TestUserSeeder`)
- [ ] 지도 범례: be `StatsConsts::LEGEND` 가 `[0, 1, 5, 15, 30]` 고정이라 실제 데이터(시도 230~789건)에서는 모든 시도가 같은 색이다. 단계별로 분포(예: 분위수)에 맞춘 `meta.legend` 를 계산할지 결정
- [ ] fe: `robots.txt` 추가 (Next.js `src/app/robots.ts`. `/api/` 는 크롤링 제외. Caddy 가 `/robots.txt` 를 fe 로 넘기므로 be 쪽 설정은 필요 없음)
- [ ] fe: SEO 작업 (메타데이터 title·description·Open Graph·canonical, `sitemap.xml`(`src/app/sitemap.ts`), JSON-LD 구조화 데이터(`WebSite`+`SearchAction`, 기사 목록은 `ItemList`/`NewsArticle`). 지도·목록이 클라이언트 렌더링이라 크롤러에 보일 서버 렌더링 범위도 함께 정한다)
