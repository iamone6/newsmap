/**
 * 환경변수를 한곳에서 읽어 두는 설정 모듈.
 *
 * - 값은 apps/fe/.env 에 넣는다 (키 목록은 .env.example 참고).
 * - 브라우저에서 쓰는 값이라 모두 NEXT_PUBLIC_ 접두사가 붙는다.
 *   Next.js 는 빌드할 때 이 값들을 자바스크립트 코드에 직접 박아 넣으므로,
 *   값을 바꾸면 dev 서버를 다시 띄우거나 다시 빌드해야 한다.
 * - process.env.이름 형태로 "직접" 써야 값이 들어간다. (process.env[변수] 처럼 쓰면 안 됨)
 */
export const config = {
  /**
   * 카카오맵 JavaScript 키. 비어 있으면 카카오맵 대신 SVG 지도를 쓴다.
   * Kakao Developers → 내 애플리케이션 → 플랫폼 > Web 에 접속 도메인(예: http://localhost:3000)을 등록해야 한다.
   */
  kakaoJsKey: process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY ?? "",

  /** be API 주소. 예) http://localhost:8000/api/v1 */
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "",

  /** true 면 be 대신 가짜(mock) 데이터를 쓴다. be 가 준비되기 전 개발용 */
  useMockApi: process.env.NEXT_PUBLIC_USE_MOCK_API === "true",
};
