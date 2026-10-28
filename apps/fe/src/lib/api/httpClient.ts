import { config } from "@/lib/config";

/**
 * API 호출이 실패했을 때 던지는 에러.
 * Laravel 에러 응답의 message 와 HTTP 상태 코드를 담는다.
 */
export class ApiError extends Error {
  /** HTTP 상태 코드 (예: 404, 422) */
  readonly status: number;

  /**
   * @param status HTTP 상태 코드
   * @param message 사용자에게 보여줄 수 있는 에러 문구
   */
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** 쿼리 문자열로 붙일 값. undefined 나 빈 문자열은 빠진다 */
type QueryParams = Record<string, string | number | undefined>;

/**
 * be API 에 GET 요청을 보내고 JSON 응답을 돌려준다.
 * @param path API 경로. 예) "/stats/summary"
 * @param params 쿼리 파라미터. 예) { level: "sido" }
 * @returns 응답 JSON (호출하는 쪽에서 타입을 지정)
 * @throws ApiError 응답 코드가 200번대가 아닐 때
 */
export async function getJson<Response>(path: string, params: QueryParams = {}): Promise<Response> {
  const url = new URL(config.apiBaseUrl + path);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    // Laravel 은 에러 때도 { "message": "..." } 형태의 JSON 을 준다
    const body = await response.json().catch(() => ({}));
    throw new ApiError(response.status, body.message ?? `요청 실패 (HTTP ${response.status})`);
  }
  return response.json() as Promise<Response>;
}
