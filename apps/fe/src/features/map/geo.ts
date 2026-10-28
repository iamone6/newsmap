/**
 * 지도 경계 데이터를 불러오고 다루는 모듈.
 *
 * - 행정구역 경계: public/geo/{sido,sigungu,emd}.topo.json (scripts/build-geo.mjs 로 생성)
 * - 바다(서해·남해·동해)와 섬(울릉도·독도)은 행정경계가 없어서 이 파일에서 직접 정의한다.
 * - 한 번 불러온 데이터는 메모리에 저장(캐시)해 두고 다시 쓴다.
 */
import { geoArea, geoBounds, geoCentroid } from "d3";
import { feature as topoFeature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import type { Polygon } from "geojson";
import type { RegionRef } from "@/lib/api/types";
import type { IslandMarker, LngLat, MapFeature, MapLevel, RegionShapeProperties } from "./types";

/** TopoJSON 파일 안의 오브젝트 이름 (build-geo.mjs 에서 "regions" 로 저장) */
const TOPO_OBJECT_NAME = "regions";

/** 지도에 보여줄 수 있는 대한민국 범위. 이 밖으로는 이동하지 못하게 막는다 */
export const KOREA_BOUNDS = {
  west: 123.3,
  east: 132.2,
  south: 32.9,
  north: 38.75,
};

/** 단계 이름 (화면 표시용) */
export const LEVEL_LABELS: Record<MapLevel, string> = {
  sido: "시 · 도",
  sigungu: "시 · 군 · 구",
  emd: "읍 · 면 · 동",
};

/** 단계 순서. 레벨 칩의 점 개수와 순서에 쓴다 */
export const LEVEL_ORDER: MapLevel[] = ["sido", "sigungu", "emd"];

// ── 캐시 ────────────────────────────────────────────────────────────
const topologyCache = new Map<MapLevel, Promise<Topology>>();
const featureCache = new Map<MapLevel, Promise<MapFeature[]>>();

/**
 * 단계별 TopoJSON 원본을 불러온다. (카카오맵의 바깥 마스크를 만들 때 원본이 필요하다)
 * @param level 불러올 단계
 * @returns TopoJSON 객체
 */
export function loadTopology(level: MapLevel): Promise<Topology> {
  let cached = topologyCache.get(level);
  if (!cached) {
    cached = fetch(`/geo/${level}.topo.json`).then((response) => {
      if (!response.ok) {
        throw new Error(`경계 파일을 불러오지 못했습니다: ${level} (HTTP ${response.status})`);
      }
      return response.json() as Promise<Topology>;
    });
    topologyCache.set(level, cached);
  }
  return cached;
}

/**
 * TopoJSON 안의 "regions" 오브젝트를 꺼낸다.
 * @param topology loadTopology 결과
 * @returns 지역 도형 모음
 */
export function regionsObjectOf(topology: Topology): GeometryCollection<RegionShapeProperties> {
  return topology.objects[TOPO_OBJECT_NAME] as GeometryCollection<RegionShapeProperties>;
}

/**
 * 단계별 행정구역 폴리곤 목록을 불러온다.
 * TopoJSON → GeoJSON 으로 바꾼 뒤 중심점·경계 상자를 미리 계산해 둔다.
 * @param level 불러올 단계
 * @returns 폴리곤 목록
 */
export function loadLevelFeatures(level: MapLevel): Promise<MapFeature[]> {
  let cached = featureCache.get(level);
  if (!cached) {
    cached = loadTopology(level).then((topology) => {
      const collection = topoFeature(topology, regionsObjectOf(topology));
      return collection.features.map((shape) => ({
        ...shape,
        id: shape.properties.code,
        kind: "admin" as const,
        regionLevel: level,
        center: geoCentroid(shape) as LngLat,
        bounds: geoBounds(shape) as [LngLat, LngLat],
      })) as MapFeature[];
    });
    featureCache.set(level, cached);
  }
  return cached;
}

/**
 * 해당 단계 데이터가 이미 캐시에 있는지 알려 준다. (로딩 문구를 띄울지 판단용)
 * @param level 확인할 단계
 * @returns 캐시에 있으면 true
 */
export function isLevelCached(level: MapLevel): boolean {
  return featureCache.has(level);
}

// ── 바다와 섬 ───────────────────────────────────────────────────────

/**
 * 바다 폴리곤을 만든다. 행정경계가 없는 개념적 영역이라 대략적인 꼭짓점으로 정의한다.
 * @param code 바다 코드 (SEA_W 등)
 * @param name 이름
 * @param ring 외곽선 꼭짓점 목록 [경도, 위도]
 * @param labelAt 라벨 위치 (안 주면 무게중심)
 * @returns 바다 폴리곤
 */
function makeSea(code: string, name: string, ring: LngLat[], labelAt: LngLat): MapFeature {
  const geometry: Polygon = { type: "Polygon", coordinates: [ring] };
  const shape = { type: "Feature" as const, properties: { code, name }, geometry };
  // d3 는 꼭짓점 순서(시계/반시계)로 안쪽을 판단한다.
  // 넓이가 지구 절반 이상으로 계산되면 순서가 거꾸로 된 것이므로 뒤집는다.
  if (geoArea(shape) > 1) {
    geometry.coordinates = [[...ring].reverse()];
  }
  return {
    ...shape,
    id: code,
    kind: "sea",
    regionLevel: "sea",
    center: labelAt,
    bounds: geoBounds(shape) as [LngLat, LngLat],
  };
}

/** 서해·남해·동해. 육지 아래에 깔리도록 먼저 그린다 */
export const SEA_FEATURES: MapFeature[] = [
  makeSea(
    "SEA_W",
    "서해",
    [[123.2, 38.7], [126.6, 38.2], [126.95, 36.0], [126.6, 34.4], [125.4, 33.6], [123.4, 34.6], [123.2, 38.7]],
    [124.55, 36.4],
  ),
  makeSea(
    "SEA_S",
    "남해",
    [[125.6, 34.95], [127.6, 34.95], [129.6, 34.95], [129.95, 32.95], [127.0, 32.9], [125.6, 33.4], [125.6, 34.95]],
    [128.35, 33.35],
  ),
  makeSea(
    "SEA_E",
    "동해",
    [[129.2, 38.75], [132.2, 38.75], [132.2, 35.0], [129.9, 34.9], [129.2, 36.4], [129.2, 38.75]],
    [131.0, 36.7],
  ),
];

/** 화면에서 너무 작아 따로 클릭 영역을 주는 섬 */
export const ISLAND_MARKERS: IslandMarker[] = [
  { code: "ISL_ULLEUNG", name: "울릉도", center: [130.865, 37.5], radius: 9 },
  { code: "ISL_DOKDO", name: "독도", center: [131.869, 37.241], radius: 7 },
];

// ── 코드 다루기 ─────────────────────────────────────────────────────

/**
 * 지역 코드만 보고 단위를 알아낸다. (contracts/API.md 의 지역 코드 규칙)
 * @param code 예) "11", "11680", "1168064000", "SEA_W", "ISL_DOKDO"
 * @returns 지역 단위
 */
export function levelOfCode(code: string): RegionRef["level"] {
  if (code.startsWith("SEA_")) return "sea";
  if (code.startsWith("ISL_")) return "island";
  if (code.length === 2) return "sido";
  if (code.length === 5) return "sigungu";
  return "emd";
}

/**
 * 코드로 지도 위 지역(폴리곤 또는 섬)을 찾는다. 필요한 단계 경계를 자동으로 불러온다.
 * @param code 지역 코드
 * @returns 찾은 폴리곤/섬. 없으면 null
 */
export async function findRegion(code: string): Promise<MapFeature | IslandMarker | null> {
  const level = levelOfCode(code);
  if (level === "sea") return SEA_FEATURES.find((sea) => sea.id === code) ?? null;
  if (level === "island") return ISLAND_MARKERS.find((island) => island.code === code) ?? null;
  const features = await loadLevelFeatures(level);
  return features.find((shape) => shape.id === code) ?? null;
}

/**
 * 지역의 상위 지역까지 포함한 경로를 만든다. (브레드크럼·목록 헤더용)
 * 예) 역삼1동 → [서울특별시, 강남구, 역삼1동]
 * @param region 선택한 지역
 * @returns 위에서 아래 순서의 경로. 바다·섬은 [구분, 자기 자신]
 */
export async function regionPathOf(region: RegionRef): Promise<{ label: string; code: string | null }[]> {
  if (region.level === "sea") return [{ label: "해역", code: null }, { label: region.name, code: region.code }];
  if (region.level === "island") return [{ label: "도서", code: null }, { label: region.name, code: region.code }];

  const path: { label: string; code: string | null }[] = [];
  if (region.level === "sigungu" || region.level === "emd") {
    const sido = await findRegion(region.code.slice(0, 2));
    if (sido) path.push({ label: nameOf(sido), code: region.code.slice(0, 2) });
  }
  if (region.level === "emd") {
    const sigungu = await findRegion(region.code.slice(0, 5));
    if (sigungu) path.push({ label: nameOf(sigungu), code: region.code.slice(0, 5) });
  }
  path.push({ label: region.name, code: region.code });
  return path;
}

/**
 * 폴리곤/섬 어느 쪽이든 이름을 꺼낸다.
 * @param region 폴리곤 또는 섬
 * @returns 이름
 */
export function nameOf(region: MapFeature | IslandMarker): string {
  return "properties" in region ? region.properties.name : region.name;
}

/**
 * 폴리곤/섬을 API 에서 쓰는 짧은 지역 정보로 바꾼다.
 * @param region 폴리곤 또는 섬
 * @returns { code, name, level }
 */
export function toRegionRef(region: MapFeature | IslandMarker): RegionRef {
  if ("properties" in region) {
    return { code: region.id, name: region.properties.name, level: region.regionLevel };
  }
  return { code: region.code, name: region.name, level: "island" };
}
