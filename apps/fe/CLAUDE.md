@AGENTS.md

# fe CLAUDE.md

지도 기반 지역 기사 탐색 화면. 루트 `CLAUDE.md`의 공통 원칙을 따르고, 여기에는 fe 고유의 구현·검증 방법만 적는다.

## 기술 스택
| 구분 | 사용 | 버전 |
|---|---|---|
| 프레임워크 | Next.js (App Router, Turbopack, `cacheComponents`) | 16.4.3 |
| UI | React | 19.3.0 |
| 언어 | TypeScript | 5.9 |
| 스타일 | Tailwind CSS (`@theme` 토큰, `@tailwindcss/turbopack`) | 4.3 |
| 지도(SVG) | d3 (geo 투영·zoom·selection) | 7.9 |
| 지도(타일) | 카카오맵 JavaScript SDK v2 (동적 로드, `autoload=false`) | – |
| 경계 | topojson-client (TopoJSON → GeoJSON, merge) | 3.1 |
| 경계 변환(dev) | mapshaper (dissolve·simplify, `scripts/build-geo.mjs`) | 0.7 |
| 글꼴 | next/font/google: Caprasimo(제목), Figtree(본문) | – |
| 패키지 | npm (Node 25) | – |

- 상태 관리 라이브러리·데이터 페칭 라이브러리는 쓰지 않는다 (useState + 작은 훅). 초보자도 읽을 수 있게 유지한다.
- Next 16 은 이전 버전과 API·규칙이 다르다. 코드를 쓰기 전에 `node_modules/next/dist/docs/`를 확인한다(`AGENTS.md`).

## 명령
이 PC는 Windows가 3000번대 포트를 예약해 둬서 로컬은 4000 을 쓴다. dev 서버와 fe 컨테이너는 둘 다 4000 이라 동시에 띄우지 않는다.

```bash
# 로컬 테스트 (hot reload). apps/fe 에서 실행
npm run dev -- --port 4000

# 빌드 (타입 검사 포함). apps/fe 에서 실행
npm run build
npm run lint
npm run build:geo            # public/geo/*.topo.json 재생성 (원본은 .cache/ 에 내려받음)

# 빌드 결과 로컬 실행. standalone 경고가 뜨지만 동작한다 (컨테이너와 같은 방식은 node .next/standalone/server.js)
npm run start -- --port 4000

# 도커 빌드 + 실행 (레포 루트에서). 로컬 http://localhost:4000, prod :80
docker compose build fe
docker compose up -d fe      # 빌드까지 한 번에: docker compose up -d --build fe
docker compose logs -f fe
docker compose stop fe       # dev 서버로 돌아갈 때 4000 포트를 비운다
```
- 도커 이미지는 `dockerfiles/fe.dockerfile`(`output: "standalone"`)로 만든다. prod 는 80, 로컬은 `docker-compose.override.yml` 의 `ports: !override` 로 4000 만 연다.
- 이미지에는 `.env` 를 남기지 않는다(빌드 때 compose secret 으로만 마운트, standalone 이 복사한 `.env` 는 삭제). `NEXT_PUBLIC_*` 를 바꾸면 다시 빌드한다.

## 환경변수 (`.env`, 키 목록은 `.env.example`)
| 키 | 설명 |
|---|---|
| `NEXT_PUBLIC_KAKAO_MAP_JS_KEY` | 카카오 JavaScript 키. 비우면 SVG 지도. Kakao Developers 플랫폼 > Web 에 접속 도메인(예: `http://localhost:4000`, prod 도메인) 등록 필요. 미등록이면 SDK 가 401 `domain mismatched` 로 실패하고 SVG 로 대체된다 |
| `NEXT_PUBLIC_API_BASE_URL` | be API 주소 (예: `http://localhost:8000/api/v1`) |
| `NEXT_PUBLIC_USE_MOCK_API` | `true` 면 be 대신 `src/lib/api/mock/` 가짜 데이터 사용 |

`NEXT_PUBLIC_` 값은 빌드 시점에 코드에 박히므로, 바꾸면 dev 서버를 재시작한다(도커는 `--build` 로 다시 빌드). 환경변수는 `src/lib/config.ts`에서만 읽는다.

## API 계약
- fe ↔ be API 는 `contracts/API.md`를 따른다. 응답 타입은 `src/lib/api/types.ts`에 1:1 로 둔다.
- 화면 코드는 `newsApi`(`src/lib/api/newsApi.ts`)만 호출한다. mock 은 같은 인터페이스(`NewsApi`)를 구현하고 응답 모양도 계약과 같게 만든다.
- 계약에 없는 필드가 필요하면 코드보다 `contracts/API.md`를 먼저 고친다.

## 구조 (`src/`)
- `app/` 레이아웃·페이지·전역 CSS(`@theme` 디자인 토큰)
- `lib/` 설정, 포맷, API 클라이언트·mock
- `features/map/` 경계 데이터(`geo.ts`), 지도 엔진 2종(`svg/`, `kakao/`), 지도 위 UI
  - 엔진은 "React 컴포넌트(…Engine.tsx) + DOM 을 직접 그리는 클래스(…Renderer.ts)"로 나눈다. 두 엔진은 `MapEngineProps`/`MapEngineHandle`을 똑같이 맞춘다.
  - 카카오 키가 있으면 카카오맵이 기본이고, 없거나 SDK 로드에 실패하면 SVG 로 대체한다(`MapStage.tsx`).
- `features/posts/` 오른쪽 기사 목록 패널. 기사 클릭은 `source_url`을 새 창으로 연다.
- `features/stats/` 왼쪽 요약 레일, 하단 티커, 통계 훅
- `features/app/NewsMapApp.tsx` 화면 조립과 공유 상태(단계·선택 지역·호버)
- `components/ui/` 디자인 시스템 기본 요소(Button, Tag, TextInput)
- `mockup/` 변환 전 원본 HTML 목업 (참고용, 서빙되지 않음)

## 지역 코드와 경계
- 경계: vuski/admdongkor 의 행정동 GeoJSON(`adm_cd2`)을 `scripts/build-geo.mjs`로 시도(2자리)·시군구(5자리)·읍면동(10자리) TopoJSON 으로 변환. 버전은 스크립트의 `SOURCE_VERSION`.
- 경계 버전은 DB 행정동 마스터(KIKcd_H) 기준일과 맞춘다. 행정구역은 항상 최신을 따른다(예: 광주·전남 → `12` 전남광주통합특별시). 코드 체계·마스터 관리는 `apps/db/CLAUDE.md`.
- 현재 경계는 `ver20261001`이다. DB 마스터(20261012)와 비교하면 평택시 고덕동(2026-10-12에 고덕1·2동으로 나뉨) 하나만 다르다.
- 바다(`SEA_W/S/E`)·섬(`ISL_ULLEUNG`, `ISL_DOKDO`)은 `features/map/geo.ts`에 직접 정의한다.
- 줌 단계: SVG 배율 <2.4 시도, <7 시군구, 그 이상 읍면동 / 카카오 레벨 ≥11 시도, ≥8 시군구, 그 아래 읍면동.

## 작업 이력과 결정 (2026-10-28)
목업 `mockup/index.html`(HTML+JS+CSS 단일 파일)을 Next.js 로 옮겼다. 그때 정한 것:
- **데이터**: `contracts/API.md` 응답과 같은 모양의 mock(`src/lib/api/mock/`)을 두고 `NEXT_PUBLIC_USE_MOCK_API`로 실제 be 와 전환한다. be 가 아직 없다.
- **기사 클릭**: 목업의 상세 패널은 없애고 `source_url`을 새 창(`<a target="_blank" rel="noopener noreferrer">`)으로 연다. `GET /posts/{id}`는 쓰지 않는다.
- **지도 엔진**: 카카오 키가 있으면 카카오맵이 기본, 없거나 실패하면 SVG. 목업의 키 입력 다이얼로그는 `.env`로 대체했다.
- **로그인·관심 지역**: 설정 팝업 화면만 있다(Guest 고정). 기능은 다음 단계.
- **목업에서 뺀 것**: 숨겨져 있던 카테고리 칩, 상세 패널. 페이지 번호는 최대 5개만 보인다.
- **경계 데이터**: 목업의 통계청 2018 경계(코드 체계가 DB 와 다름)를 행정동 경계(admdongkor `adm_cd2`)로 교체했다. 코드가 DB·API 와 같은 체계라 그대로 API 에 넘긴다.
- **API 계약에 추가한 것**: 목록 항목 `source_url`, `/stats/regions`의 `latest_title`(툴팁), `GET /posts/latest`(티커). 계약 상세는 `contracts/API.md`.
- **mock 규칙**: 지역 코드를 씨앗으로 한 단순 LCG 난수라 새로고침해도 같은 데이터가 나온다. 비트 연산은 쓰지 않는다.
- **설정 메모**
  - `next.config.ts`의 `turbopack.root`: 홈 디렉터리의 다른 `package-lock.json`을 루트로 오인하는 경고를 막는다.
  - `<html suppressHydrationWarning>`: 브라우저 확장(HWP 뷰어)이 `<html>`에 속성을 붙여서 나던 hydration 경고 대응.
  - `.gitignore`: `.env*` 무시 + `!.env.example`, `/.cache/`(경계 원본) 무시. `public/geo/*.topo.json`은 커밋한다.

### 주요 파일
| 파일 | 역할 |
|---|---|
| `src/features/app/NewsMapApp.tsx` | 화면 조립, 공유 상태 |
| `src/features/map/MapStage.tsx` | 엔진 선택(카카오/SVG), 엔진 상태 표시 |
| `src/features/map/svg/SvgMapRenderer.ts` | d3 지도: 투영, 줌·단계 전환, 라벨 겹침 배치 |
| `src/features/map/kakao/KakaoMapRenderer.ts` | 카카오 지도: 국외 마스크, 폴리곤·오버레이 |
| `src/features/map/kakao/loadKakaoSdk.ts` | SDK 1회 로드(9초 타임아웃) |
| `src/features/map/geo.ts` | TopoJSON 로드·캐시, 바다·섬, 코드 → 단위·경로 |
| `src/features/map/colors.ts` | 지도 색, 기사 수 → 색 (API `meta.legend` 구간) |
| `src/features/posts/RegionPostsPanel.tsx`, `useRegionPosts.ts` | 목록 패널, 정렬·검색(300ms 디바운스)·페이지 |
| `src/features/stats/useStats.ts` | 요약·티커·지역 통계(단계별 1회 호출 후 캐시) |
| `src/lib/api/newsApi.ts`, `types.ts`, `httpClient.ts` | API 함수·타입·fetch 래퍼 |
| `scripts/build-geo.mjs` | 경계 TopoJSON 생성 |

## 코드 작성
- 모든 컴포넌트·훅·함수·클래스 위에 한국어 JSDoc(역할, `@param`, `@returns`)을 쉬운 말로 단다.
- d3·카카오처럼 어려운 로직은 단계별 번호 주석을 단다. 축약 변수명을 쓰지 않는다.
- 스타일은 Tailwind 유틸리티로 쓰고, 색·그림자·글꼴은 `globals.css`의 `@theme` 토큰을 쓴다. 카카오 오버레이처럼 HTML 문자열로 들어가는 것만 일반 CSS 클래스(`.map-label`, `.map-pill`)를 쓴다.

## 검증
1. `npm run lint`, `npm run build` 통과
2. mock 모드로 dev 서버를 띄워 브라우저 확인: 지도 색칠·툴팁·지역 클릭 → 패널·검색/정렬/페이지·기사 링크(새 창)·줌 단계 전환·티커 클릭
3. 모바일(폭 ≤768px): 레일 축소, 티커·줌·엔진 버튼 숨김, 패널 90% 폭. 창 크기 조절이 안 되면 390px iframe 에 페이지를 넣어 확인한다.
