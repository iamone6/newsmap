# TODO

앞으로 해야 할 일을 기록한다. 끝낸 항목은 지운다.

- [ ] github CI/CD to Vultr - be 기초 작성 후 진행
- [ ] 조회수: `articles.view_count`(또는 별도 집계 테이블) 추가 → API `view_count`, `sort=popular` 활성화. 그 전까지 fe 의 "인기순" 옵션을 숨길지 결정
- [ ] 썸네일 크기: rag 가 이미지 width/height 를 수집해 `article_images` 에 저장 → API `thumbnail` 을 다시 채움
- [ ] 지역 중심 좌표: `regions` 에 좌표 추가 여부 결정 → `/regions` 의 `center`
- [ ] 바다·섬(`SEA_*`, `ISL_*`): rag 분류 규칙과 저장 방식 결정 → `/stats/regions`, `/regions/{code}/articles`
- [ ] 관심 지역: `favorite_regions` 테이블(schema.sql) + `/me/favorite-regions` 구현
- [ ] `GET /articles/{id}`: `author`(publisher_name·reporters 매핑)와 `body_html`(본문이 HTML 제거된 텍스트) 형식 결정
- [ ] 사용자 생성 방법: 회원가입 API 를 둘지, 운영자가 만들지 결정 (`/auth/login` 은 v1 구현)
- [ ] fe 실제 API 연결: 경로를 `/articles`, 필드를 `total_articles`·`today_articles`·`article_count` 로 바꾸고(`newsApi.ts`·types·mock), v1 응답에서 빠진 `view_count`·nullable `thumbnail` 에 맞게 `apps/fe/src/lib/api/types.ts` 점검
