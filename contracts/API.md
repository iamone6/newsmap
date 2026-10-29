# NewsMap REST API v1

Base URL: `/api/v1` · JSON only · 인증: Laravel Sanctum Bearer 토큰 (`Authorization: Bearer {token}`)
날짜: ISO 8601 (`2026-10-28T09:12:00+09:00`) · 목록은 Laravel `JsonResource::collection($paginator)` 기본 포맷

## v1 구현 범위
아래 항목은 `contracts/schema.sql` 에 데이터가 없어 v1 에서 빼거나 고정값으로 응답한다. 채우는 작업은 `contracts/TODO.md` 에 있다.

| 항목 | v1 동작 |
|---|---|
| `view_count`, `sort=popular` | `view_count` 는 응답에서 뺀다. `sort=popular` 은 받되 `latest` 와 같게 정렬한다 |
| 목록의 `thumbnail` | 이미지 크기(width/height)가 없어 `null` 로 응답한다 |
| `/regions` 의 `center` | 응답에서 뺀다(fe 는 TopoJSON 에서 중심을 계산한다) |
| 바다(`SEA_*`)·섬(`ISL_*`) | `/stats/regions` 응답에 넣지 않는다. 지역 코드로 받으면 404 |
| `GET /articles/{id}` | 구현하지 않는다(fe 미사용) |
| `/me/favorite-regions`, `/me` 의 `favorite_region_count` | 구현하지 않는다 |
| `q` 검색 페이지네이션 | `search_chunks()` 결과(청크)를 기사 단위로 묶은 뒤 be 가 페이지를 자른다. `total` 은 묶인 기사 수 |

## 지역 코드 규칙

| level | 코드 | 예 |
|---|---|---|
| sido | 2자리 | `11` 서울특별시 |
| sigungu | 5자리 | `11680` 강남구 |
| emd | 10자리(행정동) | `1168064000` 역삼1동 |
| sea | `SEA_W`, `SEA_S`, `SEA_E` | 서해 / 남해 / 동해 |
| island | `ISL_JEJU`, `ISL_ULLEUNG`, `ISL_DOKDO` | 지도에서 별도 클릭 영역 |

`island`는 실제 행정코드(`50`, `37430` 등)와 `admin_code`로 연결 — 기사 집계 시 하위 지역 포함 여부는 `include_children` 파라미터로 제어.

### API 코드 ↔ DB 코드 변환 (be 책임)
DB(`contracts/schema.sql`의 `regions.code`)와 rag는 행정안전부 행정동 코드(KIKcd_H)를 **항상 10자리**로 저장한다. API는 사람이 읽기 쉬운 2/5/10자리를 쓰고, 변환은 be만 한다(fe·rag는 각자 형식 그대로).

| level | API | DB (10자리) | 규칙 |
|---|---|---|---|
| sido | `12` | `1200000000` | 뒤 8자리 `0` 채움 / DB `XX00000000` → 앞 2자리 |
| sigungu | `12240` | `1224000000` | 뒤 5자리 `0` 채움 / DB `XXXXX00000` → 앞 5자리 |
| emd | `1224061000` | `1224061000` | 그대로 |

- depth 판정: API는 길이(2/5/10), DB는 뒷자리 0 패턴(`apps/db/scripts/load_regions.py`와 같은 규칙).
- 시군구에는 일반구도 있다(예: `41117` 수원시 영통구, 상위 시는 `41110` 수원시). 둘 다 sigungu 코드로 검색할 수 있다.
- 행정구역은 **최신 행정동 마스터**를 따른다. 예) 광주·전남은 `12` 전남광주통합특별시. 개편으로 말소된 코드(옛 `29` 광주광역시, `46` 전라남도 등)는 API에서 쓰지 않는다.
- 지도 경계(`apps/fe/public/geo/*.topo.json`)의 기준일은 DB 마스터 기준일과 맞춘다.

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
    "total_articles": 221,
    "today_articles": 11,
    "active_regions": 22,
    "updated_at": "2026-10-28T09:12:00+09:00"
  }
}
```
`active_regions` = 최근 N일(기본 7) 기사이 있는 지역 수. 캐시 60초 권장.

### GET /stats/regions?level=sido
지도 색칠(지역색 = 기사 수)용. `parent` 주면 해당 지역 하위만.
```json
{
  "data": [
    { "code": "11", "name": "서울특별시", "article_count": 48, "latest_title": "강남역 일대 보행로 정비 공사 내달 착공" },
    { "code": "26", "name": "부산광역시", "article_count": 17, "latest_title": "도시철도 연장 기본계획 용역 결과 공개" },
    { "code": "SEA_W", "name": "서해", "article_count": 4, "latest_title": "해상 풍랑주의보, 여객선 운항 일부 통제" },
    { "code": "ISL_DOKDO", "name": "독도", "article_count": 0, "latest_title": null }
  ],
  "meta": { "level": "sido", "max": 48, "legend": [0, 1, 5, 15, 30] }
}
```
- `latest_title`: 해당 지역의 가장 최근 기사 제목. 기사가 없으면 `null`. 지도 호버 툴팁("최신 · 제목")용.
- `level=sido` 응답에는 바다(`SEA_*`)·섬(`ISL_*`)도 함께 넣는다. 프론트는 줌 단계와 관계없이 바다·섬 색칠에 sido 응답을 쓴다.
- `parent`를 생략하면 그 단계의 전국 지역을 모두 준다(프론트는 화면에 보이는 영역을 그리기 위해 생략해서 호출한다).

---

## 4. 기사

### GET /regions/{code}/articles
| 파라미터 | 값 | 기본 |
|---|---|---|
| `sort` | `latest` \| `popular` | `latest` |
| `q` | 검색어(제목+본문) | – |
| `page` | 1~ | 1 |
| `per_page` | 1~50 | 10 |
| `include_children` | `1` \| `0` | `1` (시도 선택 시 하위 시군구 기사 포함) |

`{code}`는 시도(2)·시군구(5)·읍면동(10) 중 어느 depth든 된다. be 처리:
- `{code}`를 10자리로 변환한다(위 "API 코드 ↔ DB 코드 변환").
- `include_children=1`: `article_chunks.region_codes && ARRAY[변환코드]`로 거른다(= `search_chunks()`의 `p_region_codes`). `region_codes`는 기사 지역을 상위 단위까지 펼쳐 저장하므로, 시도로 물으면 그 아래 시군구·읍면동 기사까지 잡힌다.
- `include_children=0`: `article_regions`에서 해당 depth 컬럼(`sido_code`/`sigungu_code`/`emd_code`)이 정확히 일치하고 그보다 아래 depth는 NULL인 기사만 고른다(그 depth로만 판정된 기사).
- `q`가 있으면 `search_chunks()`(BM25+벡터 RRF)를 쓰고, 없으면 `published_at`/`view_count` 정렬 목록을 쓴다.

```json
{
  "data": [
    {
      "id": 1042,
      "title": "강남역 일대 보행로 정비 공사 내달 착공",
      "excerpt": "서울 강남구는 강남역 11번 출구부터 역삼역까지 약 800m 구간의 보행로 정비 공사를 다음 달 3일부터…",
      "thumbnail": {
        "url": "https://cdn.newsmap.kr/articles/1042/thumb.jpg",
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
    "first": "https://api.newsmap.kr/api/v1/regions/11680/articles?page=1",
    "last":  "https://api.newsmap.kr/api/v1/regions/11680/articles?page=4",
    "prev": null,
    "next":  "https://api.newsmap.kr/api/v1/regions/11680/articles?page=2"
  },
  "meta": {
    "current_page": 1, "from": 1, "to": 10, "last_page": 4,
    "per_page": 10, "total": 37,
    "path": "https://api.newsmap.kr/api/v1/regions/11680/articles",
    "region": { "code": "11680", "name": "강남구", "level": "sigungu" }
  }
}
```
- `thumbnail.width/height` 필수 — 프론트가 이 값으로 가로 40% 제한 / 세로 1:2 초과 축소를 레이아웃 시프트 없이 계산.
- `thumbnail`이 없으면 `null`.
- `excerpt`는 서버에서 HTML 제거 후 120자 자르기 (PC만 표시).
- `meta.region` 은 목록 헤더("강남구 · 37건")용 커스텀 필드 → `->additional(['meta' => [...]])`.
- `source_url` 필수 — 원문 기사 주소. 프론트는 기사 클릭 시 이 주소를 새 창(탭)으로 연다.

### GET /articles/latest?limit=16
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

### GET /articles/{id}
```json
{
  "data": {
    "id": 1042,
    "title": "강남역 일대 보행로 정비 공사 내달 착공",
    "body_html": "<p>서울 강남구는…</p>",
    "thumbnail": { "url": "https://cdn.newsmap.kr/articles/1042/thumb.jpg", "width": 1200, "height": 675 },
    "images": [
      { "url": "https://cdn.newsmap.kr/articles/1042/1.jpg", "width": 1600, "height": 900, "caption": "강남역 11번 출구" }
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
      "path_label": "서울특별시 강남구", "article_count_7d": 12, "created_at": "2026-10-20T14:02:00+09:00" }
  ]
}
```

### POST /me/favorite-regions
```json
// request
{ "region_code": "11680" }
// 201
{ "data": { "code": "11680", "name": "강남구", "level": "sigungu", "path_label": "서울특별시 강남구", "article_count_7d": 12, "created_at": "2026-10-28T09:20:00+09:00" } }
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
- 페이지 로드: `GET /stats/summary`, `GET /stats/regions?level=sido`, `GET /articles/latest?limit=16`, `GET /me`(토큰 있을 때)
- 줌 단계 변경(시군구/읍면동): `GET /stats/regions?level=sigungu` (단계별 한 번만 호출하고 캐시)
- 지역 클릭: `GET /regions/{code}/articles?sort=latest&page=1&per_page=5`
- 정렬·검색·페이지 이동: 같은 엔드포인트에 `sort`, `q`, `page`
- 기사 클릭: 목록 항목의 `source_url`을 새 창으로 연다 (API 호출 없음). `GET /articles/{id}`는 현재 프론트에서 쓰지 않는다.
- 티커 항목 클릭: 해당 `region.code`를 지도에서 선택 → 지역 클릭과 같은 흐름
- Config → 관심 지역: `/me/favorite-regions` CRUD, 로그인/로그아웃: `/auth/*`
