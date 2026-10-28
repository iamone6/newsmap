# NewsMap fe

지도에서 지역을 골라 그 지역 언론 기사를 모아 보는 화면. Next.js(App Router) + TypeScript + Tailwind.

## 시작하기
```bash
cp .env.example .env   # 값 채우기 (mock 으로 시작하려면 NEXT_PUBLIC_USE_MOCK_API=true)
npm install
npm run dev -- --port 4000
```
자세한 구조·규칙은 `CLAUDE.md`, API 계약은 `../../contracts/API.md`.

## 경계 데이터 출처
`public/geo/*.topo.json`은 [vuski/admdongkor](https://github.com/vuski/admdongkor)의 행정동 경계(통계청 SGIS 경계 + 행정안전부 행정동 코드)를 `npm run build:geo`로 변환한 파일이다.
