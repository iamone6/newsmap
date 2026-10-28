/**
 * 카카오맵 JavaScript SDK 를 페이지에 한 번만 불러오는 함수.
 *
 * SDK 는 <script> 태그로 넣어야 하고, autoload=false 로 넣은 뒤 kakao.maps.load() 를 불러야
 * 지도 기능을 쓸 수 있다. 여러 번 불려도 한 번만 로드하도록 Promise 를 저장해 둔다.
 */

/**
 * 카카오 SDK 의 타입.
 * 공식 TypeScript 타입이 없어서 any 로 둔다. 쓰는 기능은 KakaoMapRenderer.ts 에 주석으로 설명한다.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type KakaoMapsApi = any;

declare global {
  interface Window {
    kakao?: { maps: KakaoMapsApi };
  }
}

/** SDK 가 이 시간(ms) 안에 응답하지 않으면 실패로 본다 (키 오류·도메인 미등록 등) */
const LOAD_TIMEOUT_MS = 9000;

let loadingPromise: Promise<KakaoMapsApi> | null = null;

/**
 * 카카오맵 SDK 를 불러온다.
 * @param appKey 카카오 JavaScript 키 (.env 의 NEXT_PUBLIC_KAKAO_MAP_JS_KEY)
 * @returns kakao.maps 객체
 * @throws Error 스크립트 로드 실패 또는 시간 초과
 */
export function loadKakaoSdk(appKey: string): Promise<KakaoMapsApi> {
  if (loadingPromise) return loadingPromise;

  loadingPromise = new Promise<KakaoMapsApi>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("SDK 응답 없음 — 키와 도메인 등록을 확인해 주세요.")),
      LOAD_TIMEOUT_MS,
    );

    const script = document.createElement("script");
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&autoload=false`;
    script.async = true;
    script.onload = () => {
      const kakao = window.kakao;
      if (!kakao) {
        clearTimeout(timeout);
        reject(new Error("SDK 를 불러왔지만 kakao 객체가 없습니다."));
        return;
      }
      // autoload=false 이므로 직접 load 를 불러 지도 모듈을 준비시킨다
      kakao.maps.load(() => {
        clearTimeout(timeout);
        resolve(kakao.maps);
      });
    };
    script.onerror = () => {
      clearTimeout(timeout);
      reject(new Error("SDK 로드 실패 — 키 또는 도메인 등록을 확인해 주세요."));
    };
    document.head.appendChild(script);
  });

  // 실패하면 다음에 다시 시도할 수 있게 저장한 Promise 를 비운다
  loadingPromise.catch(() => {
    loadingPromise = null;
  });
  return loadingPromise;
}
