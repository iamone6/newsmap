# NewsMap REST API v1

Base URL: `/api/v1` · JSON only · 인증: Laravel Sanctum Bearer 토큰 (`Authorization: Bearer {token}`)
날짜: ISO 8601 (`2026-10-28T09:12:00+09:00`) · 목록은 Laravel `JsonResource::collection($paginator)` 기본 포맷

## 지역 코드 규칙

| level | 코드 | 예 |
|---|---|---|
| sido | 2자리 | `11` 서울특별시 |
| sigungu | 5자리 | `11680` 강남구 |
| emd | 7자리 이상(행정동) | `1168064000` 역삼1동 |
| sea | `SEA_W`, `SEA_S`, `SEA_E` | 서해 / 남해 / 동해 |
| island | `ISL_JEJU`, `ISL_ULLEUNG`, `ISL_DOKDO` | 지도에서 별도 클릭 영역 |

`island`는 실제 행정코드(`50`, `37430` 등)와 `admin_code`로 연결 — 게시물 집계 시 하위 지역 포함 여부는 `include_children` 파라미터로 제어.


---

## 1. 인증

### POST /auth/login
```json
// request
{ "email": "kim@example.com", "password": "secret", "device_name": "web" }
// 200
{
  "token": "12|Xb9Kq2...",
  "user": { "id": 7, "name": "김민지", "email": "kim@example.com" }
}
// 422
{ "message": "이메일 또는 비밀번호가 올바르지 않습니다.", "errors": { "email": ["이메일 또는 비밀번호가 올바르지 않습니다."] } }
```

### POST /auth/logout → `204 No Content`

### GET /me
```json
{ "data": { "id": 7, "name": "김민지", "email": "kim@example.com", "favorite_region_count": 3 } }
```
비로그인 → `401 { "message": "Unauthenticated." }` → 프론트는 `Guest` 표시.

---

## 2. 지역

### GET /regions?level=sigungu&parent=11
```json
{
  "data": [
    { "code": "11110", "name": "종로구", "level": "sigungu", "parent_code": "11",
      "center": { "lat": 37.5735, "lng": 126.9790 } },
    { "code": "11680", "name": "강남구", "level": "sigungu", "parent_code": "11",
      "center": { "lat": 37.5172, "lng": 127.0473 } }
  ]
}
```
경계(GeoJSON)는 용량 때문에 API로 주지 않고 정적 파일(CDN/`public/geo/*.json`)로 제공 권장.

### GET /regions/{code}
```json
{
  "data": {
    "code": "1168064000", "name": "역삼1동", "level": "emd", "parent_code": "11680",
    "center": { "lat": 37.4955, "lng": 127.0330 },
    "path": [
      { "code": "11", "name": "서울특별시", "level": "sido" },
      { "code": "11680", "name": "강남구", "level": "sigungu" },
      { "code": "1168064000", "name": "역삼1동", "level": "emd" }
    ]
  }
}
```

### GET /regions/{code}/children → `/regions?parent={code}`와 동일 포맷

---

## 3. 통계

### GET /stats/summary
```json
{
  "data": {
    "total_posts": 221,
    "today_posts": 11,
    "active_regions": 22,
    "updated_at": "2026-10-28T09:12:00+09:00"
  }
}
```
`active_regions` = 최근 N일(기본 7) 게시물이 있는 지역 수. 캐시 60초 권장.

### GET /stats/regions?level=sido
지도 색칠(지역색 = 게시물 수)용. `parent` 주면 해당 지역 하위만.
```json
{
  "data": [
    { "code": "11", "name": "서울특별시", "post_count": 48, "latest_title": "강남역 일대 보행로 정비 공사 내달 착공" },
    { "code": "26", "name": "부산광역시", "post_count": 17, "latest_title": "도시철도 연장 기본계획 용역 결과 공개" },
    { "code": "SEA_W", "name": "서해", "post_count": 4, "latest_title": "해상 풍랑주의보, 여객선 운항 일부 통제" },
    { "code": "ISL_DOKDO", "name": "독도", "post_count": 0, "latest_title": null }
  ],
  "meta": { "level": "sido", "max": 48, "legend": [0, 1, 5, 15, 30] }
}
```
- `latest_title`: 해당 지역의 가장 최근 기사 제목. 기사가 없으면 `null`. 지도 호버 툴팁("최신 · 제목")용.
- `level=sido` 응답에는 바다(`SEA_*`)·섬(`ISL_*`)도 함께 넣는다. 프론트는 줌 단계와 관계없이 바다·섬 색칠에 sido 응답을 쓴다.
- `parent`를 생략하면 그 단계의 전국 지역을 모두 준다(프론트는 화면에 보이는 영역을 그리기 위해 생략해서 호출한다).

---

## 4. 게시물

### GET /regions/{code}/posts
| 파라미터 | 값 | 기본 |
|---|---|---|
| `sort` | `latest` \| `popular` | `latest` |
| `q` | 검색어(제목+본문) | – |
| `page` | 1~ | 1 |
| `per_page` | 1~50 | 10 |
| `include_children` | `1` \| `0` | `1` (시도 선택 시 하위 시군구 게시물 포함) |

```json
{
  "data": [
    {
      "id": 1042,
      "title": "강남역 일대 보행로 정비 공사 내달 착공",
      "excerpt": "서울 강남구는 강남역 11번 출구부터 역삼역까지 약 800m 구간의 보행로 정비 공사를 다음 달 3일부터…",
      "thumbnail": {
        "url": "https://cdn.newsmap.kr/posts/1042/thumb.jpg",
        "width": 1200,
        "height": 675
      },
      "region": { "code": "1168064000", "name": "역삼1동", "level": "emd" },
      "source_url": "https://example-news.kr/article/88213",
      "view_count": 312,
      "published_at": "2026-10-28T08:40:00+09:00"
    }
  ],
  "links": {
    "first": "https://api.newsmap.kr/api/v1/regions/11680/posts?page=1",
    "last":  "https://api.newsmap.kr/api/v1/regions/11680/posts?page=4",
    "prev": null,
    "next":  "https://api.newsmap.kr/api/v1/regions/11680/posts?page=2"
  },
  "meta": {
    "current_page": 1, "from": 1, "to": 10, "last_page": 4,
    "per_page": 10, "total": 37,
    "path": "https://api.newsmap.kr/api/v1/regions/11680/posts",
    "region": { "code": "11680", "name": "강남구", "level": "sigungu" }
  }
}
```
- `thumbnail.width/height` 필수 — 프론트가 이 값으로 가로 40% 제한 / 세로 1:2 초과 축소를 레이아웃 시프트 없이 계산.
- `thumbnail`이 없으면 `null`.
- `excerpt`는 서버에서 HTML 제거 후 120자 자르기 (PC만 표시).
- `meta.region` 은 목록 헤더("강남구 · 37건")용 커스텀 필드 → `->additional(['meta' => [...]])`.
- `source_url` 필수 — 원문 기사 주소. 프론트는 기사 클릭 시 이 주소를 새 창(탭)으로 연다.

### GET /posts/latest?limit=16
전국 최신 기사. 하단 "방금 등록" 티커용. `limit` 1~50, 기본 16.
```json
{
  "data": [
    {
      "id": 1042,
      "title": "강남역 일대 보행로 정비 공사 내달 착공",
      "source_url": "https://example-news.kr/article/88213",
      "region": { "code": "1168064000", "name": "역삼1동", "level": "emd" },
      "published_at": "2026-10-28T08:40:00+09:00"
    }
  ]
}
```
- `region`은 기사의 대표 지역. 프론트는 티커 항목을 누르면 이 지역을 지도에서 선택한다.

### GET /posts/{id}
```json
{
  "data": {
    "id": 1042,
    "title": "강남역 일대 보행로 정비 공사 내달 착공",
    "body_html": "<p>서울 강남구는…</p>",
    "thumbnail": { "url": "https://cdn.newsmap.kr/posts/1042/thumb.jpg", "width": 1200, "height": 675 },
    "images": [
      { "url": "https://cdn.newsmap.kr/posts/1042/1.jpg", "width": 1600, "height": 900, "caption": "강남역 11번 출구" }
    ],
    "region": {
      "code": "1168064000", "name": "역삼1동", "level": "emd",
      "path": [
        { "code": "11", "name": "서울특별시" },
        { "code": "11680", "name": "강남구" },
        { "code": "1168064000", "name": "역삼1동" }
      ]
    },
    "author": { "id": 3, "name": "NewsMap 편집국" },
    "source_url": "https://example-news.kr/article/88213",
    "view_count": 313,
    "published_at": "2026-10-28T08:40:00+09:00",
    "updated_at": "2026-10-28T09:05:00+09:00"
  }
}
```

---

## 5. 내 관심 지역 (로그인 필요)

### GET /me/favorite-regions
```json
{
  "data": [
    { "code": "11680", "name": "강남구", "level": "sigungu",
      "path_label": "서울특별시 강남구", "post_count_7d": 12, "created_at": "2026-10-20T14:02:00+09:00" }
  ]
}
```

### POST /me/favorite-regions
```json
// request
{ "region_code": "11680" }
// 201
{ "data": { "code": "11680", "name": "강남구", "level": "sigungu", "path_label": "서울특별시 강남구", "post_count_7d": 12, "created_at": "2026-10-28T09:20:00+09:00" } }
// 409 (이미 등록)
{ "message": "이미 관심 지역으로 등록되어 있습니다." }
```

### DELETE /me/favorite-regions/{code} → `204 No Content`

---

## 공통 에러 포맷 (Laravel 기본)
```json
// 404
{ "message": "지역을 찾을 수 없습니다." }
// 422
{ "message": "per_page 값은 50 이하여야 합니다.", "errors": { "per_page": ["per_page 값은 50 이하여야 합니다."] } }
// 429
{ "message": "Too Many Attempts." }
```

## 프론트 화면 ↔ API 매핑
- 페이지 로드: `GET /stats/summary`, `GET /stats/regions?level=sido`, `GET /posts/latest?limit=16`, `GET /me`(토큰 있을 때)
- 줌 단계 변경(시군구/읍면동): `GET /stats/regions?level=sigungu` (단계별 한 번만 호출하고 캐시)
- 지역 클릭: `GET /regions/{code}/posts?sort=latest&page=1&per_page=5`
- 정렬·검색·페이지 이동: 같은 엔드포인트에 `sort`, `q`, `page`
- 게시물 클릭: 목록 항목의 `source_url`을 새 창으로 연다 (API 호출 없음). `GET /posts/{id}`는 현재 프론트에서 쓰지 않는다.
- 티커 항목 클릭: 해당 `region.code`를 지도에서 선택 → 지역 클릭과 같은 흐름
- Config → 관심 지역: `/me/favorite-regions` CRUD, 로그인/로그아웃: `/auth/*`
