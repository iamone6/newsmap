/**
 * 지도에서 쓰는 색 모음과 "기사 수 → 색" 변환 규칙.
 * SVG 엔진과 카카오 엔진, 좌측 범례가 같은 값을 쓴다.
 */

/** 지도 기본 색 */
export const MAP_COLORS = {
  land: "#ccdbb2",
  landHover: "#aebf92",
  landStroke: "#5f6f46",
  selected: "#c67139",
  selectedStroke: "#8c491a",
  sea: "#dbe6ec",
  seaHover: "#c4d6e0",
  seaSelected: "#ffc6a5",
  seaStroke: "#8fa073",
  ink: "#2e2b25",
  background: "#f5ead8",
  /** 지도 뒤 배경 (바다색에 가까운 회청색) */
  stage: "#dbe6ec",
};

/** 기사 수가 적은 쪽(왼쪽)부터 많은 쪽(오른쪽)까지의 색 단계 */
export const COUNT_RAMP = ["#eef5e0", "#e1eecc", "#ccdbb2", "#aebf92", "#8fa073", "#728157"];

/** API 가 범례를 주지 않을 때 쓰는 기본 구간 */
export const DEFAULT_LEGEND = [0, 1, 5, 15, 30];

/**
 * 기사 수에 맞는 지역 색을 고른다.
 * 1) 범례(legend) 구간 중 몇 번째 구간에 속하는지 찾고
 * 2) 그 구간 번호를 COUNT_RAMP 색 단계에 비례해서 맞춘다.
 * @param count 기사 수
 * @param legend 구간 시작값들. 예) [0, 1, 5, 15, 30]
 * @returns 색상 코드
 */
export function colorForCount(count: number, legend: number[]): string {
  const thresholds = legend.length > 1 ? legend : DEFAULT_LEGEND;

  // 1) count 이하인 구간 시작값이 몇 개인지 세면 구간 번호가 된다
  const passed = thresholds.filter((start) => count >= start).length;
  const bucket = Math.max(0, passed - 1);

  // 2) 구간 번호(0 ~ 구간수-1)를 색 단계(0 ~ 색수-1)로 늘린다
  const lastBucket = thresholds.length - 1;
  const rampIndex = Math.round((bucket / lastBucket) * (COUNT_RAMP.length - 1));
  return COUNT_RAMP[rampIndex];
}
