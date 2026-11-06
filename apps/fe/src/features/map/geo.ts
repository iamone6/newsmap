/**
 * 지도 경계 데이터를 불러오고 다루는 모듈.
 *
 * - 행정구역 경계: public/geo/{sido,sigungu,emd}.topo.json (scripts/build-geo.mjs 로 생성)
 * - 바다(서해·남해·동해)와 섬(울릉도·독도)은 행정경계가 없어서 이 파일에서 직접 정의한다.
 * - 한 번 불러온 데이터는 메모리에 저장(캐시)해 두고 다시 쓴다.
 * - 일반구가 있는 시(수원·포항 등)는 시군구 단계에서 시 하나다. 구 코드는 districtToCity.json 으로 시 코드로 바꾼다.
 */
import { geoArea, geoBounds, geoCentroid } from "d3";
import { feature as topoFeature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { RegionRef } from "@/lib/api/types";
import districtToCity from "./districtToCity.json";
import seaAreasEmd from "./seaAreas.emd.json";
import seaAreasSido from "./seaAreas.sido.json";
import seaAreasSigungu from "./seaAreas.sigungu.json";
import type { IslandMarker, LngLat, MapFeature, MapLevel, RegionShapeProperties } from "./types";

/** 일반구 코드(5자리) → 시 코드(5자리). scripts/build-geo.mjs 가 경계와 함께 만든다 (예: 47111 → 47110) */
const DISTRICT_TO_CITY: Record<string, string> = districtToCity;

/** TopoJSON 파일 안의 오브젝트 이름 (build-geo.mjs 에서 "regions" 로 저장) */
const TOPO_OBJECT_NAME = "regions";

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

/** seaAreas.{단계}.json 의 바다 한 개 (build-geo.mjs 가 그 단계 육지를 잘라내 만든 GeoJSON Feature) */
type SeaAreaFeature = Feature<Polygon | MultiPolygon, { code: string; name: string; label_lng: number; label_lat: number }>;

/**
 * 폴리곤의 모든 링(바깥 링과 구멍) 꼭짓점 순서를 뒤집는다.
 * @param geometry Polygon 또는 MultiPolygon
 * @returns 순서를 뒤집은 새 geometry
 */
function reverseRings(geometry: Polygon | MultiPolygon): Polygon | MultiPolygon {
  if (geometry.type === "Polygon") {
    return { type: "Polygon", coordinates: geometry.coordinates.map((ring) => [...ring].reverse()) };
  }
  return {
    type: "MultiPolygon",
    coordinates: geometry.coordinates.map((polygon) => polygon.map((ring) => [...ring].reverse())),
  };
}

/**
 * 바다 폴리곤을 만든다. 바다는 행정경계가 없어 scripts/sea-areas.json 에 대략적인 꼭짓점으로 정의하고,
 * build-geo.mjs 가 단계별 육지 경계를 잘라낸 모양(seaAreas.{단계}.json)을 쓴다. 그래서 육지와 겹치지 않아
 * 반투명한 육지 색 사이로 바다가 비치지 않는다. 섬은 바다의 구멍(안쪽 링)이다.
 * @param sea 육지를 잘라낸 바다 Feature
 * @returns 바다 폴리곤
 */
function makeSea(sea: SeaAreaFeature): MapFeature {
  const { code, name, label_lng: labelLng, label_lat: labelLat } = sea.properties;
  const shape = { type: "Feature" as const, properties: { code, name }, geometry: sea.geometry };
  // d3 는 꼭짓점 순서(시계/반시계)로 안쪽을 판단한다. mapshaper 출력은 d3 와 반대 순서라
  // 넓이가 지구 절반을 넘게 계산되면 모든 링(바깥 링·섬 구멍)의 순서를 뒤집는다.
  if (geoArea(shape) > 2 * Math.PI) {
    shape.geometry = reverseRings(shape.geometry);
  }
  return {
    ...shape,
    id: code,
    kind: "sea",
    regionLevel: "sea",
    center: [labelLng, labelLat],
    bounds: geoBounds(shape) as [LngLat, LngLat],
  };
}

/**
 * GeoJSON FeatureCollection 의 바다들을 지도 폴리곤으로 바꾼다.
 * @param collection build-geo.mjs 가 만든 seaAreas.{단계}.json
 * @returns 서해·남해·동해
 */
function seasOf(collection: unknown): MapFeature[] {
  return (collection as FeatureCollection<Polygon | MultiPolygon>).features.map((sea) => makeSea(sea as SeaAreaFeature));
}

/**
 * 단계별 바다. 그 단계 육지 경계로 잘라낸 모양이라 그 단계에서 그리는 육지와 해안선이 똑같다(틈·겹침 없음).
 * 한 단계 것만 쓰면 단순화 정도가 다른 다른 단계에서 해안에 틈이 생겨, 마스크·위성 사진이 비쳤다.
 */
const SEA_FEATURES_BY_LEVEL: Record<MapLevel, MapFeature[]> = {
  sido: seasOf(seaAreasSido),
  sigungu: seasOf(seaAreasSigungu),
  emd: seasOf(seaAreasEmd),
};

/** 서해·남해·동해 (가장 정밀한 읍면동 단계 모양). 코드로 찾기·라벨 위치·경계 상자처럼 단계와 상관없는 곳에 쓴다 */
export const SEA_FEATURES: MapFeature[] = SEA_FEATURES_BY_LEVEL.emd;

/**
 * 그 단계에서 그릴 바다를 돌려준다.
 * @param level 지금 지도 단계
 * @returns 그 단계 육지로 잘라낸 서해·남해·동해
 */
export function seaFeaturesFor(level: MapLevel): MapFeature[] {
  return SEA_FEATURES_BY_LEVEL[level];
}

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
 * 행정구역 단위(시도·시군구·읍면동)인지 확인한다.
 * v1 be 는 바다·섬 기사를 아직 다루지 않으므로, 목록 API 를 부를 수 있는지 판단할 때도 쓴다.
 * @param level 지역 단위
 * @returns 행정구역이면 true, 바다·섬이면 false
 */
export function isAdminLevel(level: RegionRef["level"]): level is MapLevel {
  return level === "sido" || level === "sigungu" || level === "emd";
}

/**
 * 지도 경계에 있는 코드로 바꾼다. 일반구 코드는 그 시 코드가 된다(시군구 단계에 구 경계가 없으므로).
 * API·DB 는 일반구 코드(예: 41117 수원시 영통구)를 그대로 쓰므로, 지도에서 찾기 전에 이 함수를 거친다.
 * @param code 지역 코드
 * @returns 지도 경계 코드 (일반구가 아니면 그대로)
 */
export function toMapCode(code: string): string {
  return DISTRICT_TO_CITY[code] ?? code;
}

/**
 * 코드로 지도 위 지역(폴리곤 또는 섬)을 찾는다. 필요한 단계 경계를 자동으로 불러온다.
 * 일반구 코드는 그 시를 돌려준다 (예: 47111 포항시남구 → 47110 포항시).
 * @param code 지역 코드
 * @returns 찾은 폴리곤/섬. 없으면 null
 */
export async function findRegion(code: string): Promise<MapFeature | IslandMarker | null> {
  const level = levelOfCode(code);
  if (level === "sea") return SEA_FEATURES.find((sea) => sea.id === code) ?? null;
  if (level === "island") return ISLAND_MARKERS.find((island) => island.code === code) ?? null;
  const features = await loadLevelFeatures(level);
  const mapCode = toMapCode(code);
  return features.find((shape) => shape.id === mapCode) ?? null;
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
    // 읍면동 코드 앞 5자리는 일반구일 수 있어(예: 41117 영통구) 시 코드로 바꿔서 찾는다
    const sigunguCode = toMapCode(region.code.slice(0, 5));
    const sigungu = await findRegion(sigunguCode);
    if (sigungu) path.push({ label: nameOf(sigungu), code: sigunguCode });
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
