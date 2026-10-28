/**
 * 화면에 보여줄 값의 형식을 맞추는 작은 함수들.
 */

/**
 * ISO 8601 날짜 문자열을 "2026.10.28" 형식으로 바꾼다.
 * @param isoDate 예) "2026-10-28T09:12:00+09:00"
 * @returns 예) "2026.10.28"
 */
export function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

/**
 * 숫자에 천 단위 쉼표를 넣는다.
 * @param value 예) 12345
 * @returns 예) "12,345"
 */
export function formatNumber(value: number): string {
  return value.toLocaleString("ko-KR");
}
