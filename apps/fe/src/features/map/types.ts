import type { Ref } from "react";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import type { RegionRef, RegionStat } from "@/lib/api/types";

/**
 * 지도에 그리는 행정구역 단계. 줌을 당길수록 sido → sigungu → emd 로 바뀐다.
 */
export type MapLevel = "sido" | "sigungu" | "emd";

/** 경계 TopoJSON(public/geo/*.topo.json)에 들어 있는 속성 */
export interface RegionShapeProperties {
  code: string;
  name: string;
  /** 시군구·읍면동에만 있다 */
  sido_code?: string;
  /** 읍면동에만 있다 */
  sigungu_code?: string;
}

/** [경도, 위도] */
export type LngLat = [number, number];

/**
 * 지도에 그리는 폴리곤 하나 (행정구역 또는 바다).
 * GeoJSON Feature 에 화면 계산용 값(중심점, 경계 상자)을 미리 붙여 둔다.
 */
export interface MapFeature extends Feature<Polygon | MultiPolygon, RegionShapeProperties> {
  /** 지역 코드와 같다 */
  id: string;
  /** admin: 행정구역, sea: 바다 */
  kind: "admin" | "sea";
  /** API 기준 지역 단위 (바다는 "sea") */
  regionLevel: RegionRef["level"];
  /** 라벨을 놓을 중심점 */
  center: LngLat;
  /** 경계 상자 [[서쪽 경도, 남쪽 위도], [동쪽 경도, 북쪽 위도]] */
  bounds: [LngLat, LngLat];
}

/**
 * 폴리곤이 너무 작아 원(동그라미)으로 따로 그리는 섬 (울릉도·독도).
 */
export interface IslandMarker {
  code: string;
  name: string;
  center: LngLat;
  /** SVG 지도에서 그릴 원의 반지름(px) */
  radius: number;
}

/** 지도 위에서 마우스가 올라가 있는 지역 (툴팁용) */
export interface MapHover {
  code: string;
  name: string;
  /** 화면 기준 마우스 좌표 */
  clientX: number;
  clientY: number;
}

/**
 * 지도 엔진(SVG/카카오)이 바깥에 열어 주는 조작 함수들.
 * 줌 버튼·티커·브레드크럼이 엔진 종류를 몰라도 지도를 움직일 수 있게 해 준다.
 */
export interface MapEngineHandle {
  /** 한 단계 확대 */
  zoomIn(): void;
  /** 한 단계 축소 */
  zoomOut(): void;
  /** 전국 보기로 되돌리기 */
  resetView(): void;
  /**
   * 코드로 지역을 찾아 그쪽으로 이동하고 선택한다.
   * @param code 지역 코드 (2/5/10자리, SEA_*, ISL_*)
   */
  selectByCode(code: string): Promise<void>;
}

/** 두 지도 엔진이 똑같이 받는 props */
export interface MapEngineProps {
  /** 지역 코드 → 통계(기사 수 등). 지도 색칠과 라벨 숫자에 쓴다 */
  statsByCode: Map<string, RegionStat>;
  /** 범례 구간 시작값들 (API meta.legend) */
  legend: number[];
  /** 지금 선택된 지역 코드. 없으면 null */
  selectedCode: string | null;
  /** 사용자가 지도에서 지역을 골랐을 때 */
  onSelect: (region: RegionRef) => void;
  /** 줌이 바뀌어 행정구역 단계가 달라졌을 때 */
  onLevelChange: (level: MapLevel) => void;
  /** 마우스가 지역 위에 올라가거나(값) 벗어날 때(null) */
  onHover: (hover: MapHover | null) => void;
  /** 바깥에서 지도를 조작하기 위한 ref (React 19 부터 ref 를 일반 prop 으로 받는다) */
  ref?: Ref<MapEngineHandle>;
}
