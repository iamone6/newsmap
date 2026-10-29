/**
 * 카카오맵 위에 행정구역 폴리곤과 라벨을 그리는 클래스.
 *
 * SvgMapRenderer 와 같은 역할을 카카오맵 API 로 한다.
 * 쓰는 카카오 API:
 *   - maps.Map: 지도 / maps.LatLng: 좌표 / maps.LatLngBounds: 영역
 *   - maps.Polygon: 다각형 / maps.CustomOverlay: HTML 라벨 / maps.Marker: 클릭 받는 투명 마커
 *   - maps.event.addListener / removeListener: 이벤트 연결·해제
 * 카카오 지도 레벨은 숫자가 작을수록 확대된 상태다 (1이 가장 가까이).
 */
import { merge } from "topojson-client";
import type { MultiPolygon, Position } from "geojson";
import type { MultiPolygon as TopoMultiPolygon, Polygon as TopoPolygon } from "topojson-specification";
import type { RegionStat } from "@/lib/api/types";
import { MAP_COLORS } from "../colors";
import {
  ISLAND_MARKERS,
  KOREA_BOUNDS,
  SEA_FEATURES,
  isLevelCached,
  loadLevelFeatures,
  loadTopology,
  regionsObjectOf,
} from "../geo";
import type { IslandMarker, MapFeature, MapLevel } from "../types";
import type { KakaoMapsApi } from "./loadKakaoSdk";

/** 렌더러가 바깥(React)으로 알려 주는 일들 */
export interface KakaoRendererCallbacks {
  onSelect: (region: MapFeature | IslandMarker) => void;
  onLevelChange: (level: MapLevel) => void;
  onLoadingChange: (loading: boolean) => void;
}

/** 카카오 지도 레벨 범위. 13이 전국, 2가 동네 */
const KAKAO_MAX_LEVEL = 13;
const KAKAO_MIN_LEVEL = 2;

/** 단계별 카카오 지도 레벨 범위 [가까이, 멀리] */
const KAKAO_LEVEL_RANGE: Record<MapLevel, [number, number]> = {
  sido: [11, 13],
  sigungu: [8, 10],
  emd: [KAKAO_MIN_LEVEL, 7],
};

/** 단계별 경계선 굵기 */
const LINE_WIDTH: Record<MapLevel, number> = { sido: 1.4, sigungu: 0.8, emd: 0.8 };
const SELECTED_LINE_WIDTH: Record<MapLevel, number> = { sido: 3.1, sigungu: 2.2, emd: 1.6 };

/** 시군구·읍면동 단계에서 한 번에 그리는 최대 폴리곤 수 */
const MAX_VISIBLE_FEATURES = 260;
/** 폴리곤이 이 개수 이하일 때만 이름 라벨을 붙인다 (너무 많으면 글자가 겹친다) */
const MAX_LABELED_FEATURES = 46;

/**
 * 카카오 지도 레벨에 맞는 지도 단계를 고른다.
 * @param kakaoLevel 카카오 지도 레벨 (1~14)
 * @returns 단계
 */
function levelForKakao(kakaoLevel: number): MapLevel {
  if (kakaoLevel >= 11) return "sido";
  if (kakaoLevel >= 8) return "sigungu";
  return "emd";
}

/**
 * 꼭짓점을 몇 개 건너뛰며 줄인다. 카카오 폴리곤은 꼭짓점이 많으면 느려지기 때문이다.
 * @param ring 꼭짓점 목록
 * @param step 몇 개마다 하나씩 남길지 (1이면 그대로)
 * @returns 줄인 꼭짓점 목록 (마지막 점은 항상 남긴다)
 */
function thinOutRing(ring: Position[], step: number): Position[] {
  if (step <= 1 || ring.length <= 12) return ring;
  const thinned = ring.filter((_point, index) => index % step === 0);
  if (thinned[thinned.length - 1] !== ring[ring.length - 1]) thinned.push(ring[ring.length - 1]);
  return thinned;
}

/**
 * HTML 에 넣을 문자열의 특수문자를 바꾼다. (CustomOverlay 는 HTML 문자열을 받는다)
 * @param text 원래 문자열
 * @returns 안전한 문자열
 */
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export class KakaoMapRenderer {
  private readonly container: HTMLElement;
  private readonly callbacks: KakaoRendererCallbacks;
  private readonly maps: KakaoMapsApi;

  private map: KakaoMapsApi = null;
  private koreaBounds: KakaoMapsApi = null;
  /** 지도에서 지우기 위해 모아 두는 폴리곤·마커·오버레이 */
  private shapes: KakaoMapsApi[] = [];
  /** 지도 자체에 붙인 이벤트 (destroy 때 해제) */
  private mapListeners: { type: string; handler: () => void }[] = [];

  private level: MapLevel = "sido";
  private levelFeatures: MapFeature[] = [];
  private stats = new Map<string, RegionStat>();
  private selectedCode: string | null = null;
  private destroyed = false;

  /**
   * @param container 지도를 넣을 DOM 요소
   * @param callbacks 바깥으로 알릴 함수들
   * @param maps loadKakaoSdk 가 돌려준 kakao.maps
   */
  constructor(container: HTMLElement, callbacks: KakaoRendererCallbacks, maps: KakaoMapsApi) {
    this.container = container;
    this.callbacks = callbacks;
    this.maps = maps;
  }

  /**
   * 지도를 만들고 첫 화면을 그린다.
   * 1) 지도 생성 + 전국 범위로 맞추기
   * 2) 대한민국 밖을 크림색으로 덮는 마스크 그리기
   * 3) 줌·이동이 끝날 때(idle)마다 단계 확인 후 다시 그리기
   */
  async start(): Promise<void> {
    const maps = this.maps;
    this.levelFeatures = await loadLevelFeatures("sido");
    const sidoTopology = await loadTopology("sido");
    if (this.destroyed) return;

    // 1) 지도 생성
    this.map = new maps.Map(this.container, { center: new maps.LatLng(36.35, 127.9), level: KAKAO_MAX_LEVEL });
    this.map.setMaxLevel(KAKAO_MAX_LEVEL); // 전국보다 더 넓게 축소 불가
    this.map.setMinLevel(KAKAO_MIN_LEVEL);
    this.koreaBounds = new maps.LatLngBounds(
      new maps.LatLng(KOREA_BOUNDS.south, KOREA_BOUNDS.west),
      new maps.LatLng(KOREA_BOUNDS.north, KOREA_BOUNDS.east),
    );
    this.map.setBounds(this.koreaBounds);

    // 한반도 밖으로 끌고 나가면 다시 가운데로 데려온다 (주변국 노출 최소화)
    this.listenMap("dragend", () => {
      if (!this.koreaBounds.contain(this.map.getCenter())) this.map.panTo(this.koreaBounds.getCenter());
    });

    // 2) 마스크: 바깥 큰 사각형에서 대한민국 모양만 구멍으로 뚫는다
    // topojson merge: 여러 시도 도형을 이어 붙여 대한민국 전체 모양 하나로 만든다
    const sidoShapes = regionsObjectOf(sidoTopology).geometries as Array<TopoPolygon | TopoMultiPolygon>;
    const koreaShape: MultiPolygon = merge(sidoTopology, sidoShapes);
    const outerRing = [[118, 29], [140, 29], [140, 45], [118, 45], [118, 29]].map(([lng, lat]) => new maps.LatLng(lat, lng));
    const holes = koreaShape.coordinates.map((polygon) =>
      thinOutRing(polygon[0], 3).map(([lng, lat]) => new maps.LatLng(lat, lng)),
    );
    new maps.Polygon({
      map: this.map,
      path: [outerRing, ...holes],
      strokeWeight: 0,
      fillColor: MAP_COLORS.background,
      fillOpacity: 0.97,
    });

    // 3) 줌·이동이 끝날 때마다
    this.listenMap("idle", () => {
      void this.handleIdle();
    });
    this.draw();
  }

  /**
   * 지역 통계가 바뀌었을 때 다시 그린다.
   * @param stats 지역 코드 → 통계
   */
  setStats(stats: Map<string, RegionStat>): void {
    this.stats = stats;
    this.draw();
  }

  /**
   * 선택된 지역을 바꾼다.
   * @param code 선택한 지역 코드. 선택 해제는 null
   */
  setSelected(code: string | null): void {
    this.selectedCode = code;
    this.draw();
  }

  /** 한 단계 확대 */
  zoomIn(): void {
    this.map?.setLevel(this.map.getLevel() - 1, { animate: true });
  }

  /** 한 단계 축소 */
  zoomOut(): void {
    this.map?.setLevel(Math.min(KAKAO_MAX_LEVEL, this.map.getLevel() + 1), { animate: true });
  }

  /** 전국 보기로 되돌린다 */
  resetView(): void {
    this.map?.setBounds(this.koreaBounds);
  }

  /**
   * 지역이 보이도록 이동·확대한다. 오른쪽 목록 패널(440px)을 피해서 맞춘다.
   * 확대 정도는 그 지역 단계의 레벨 범위 안으로 맞춘다. 섬·바다는 이동하지 않는다.
   * @param region 이동할 지역
   */
  focusOn(region: MapFeature | IslandMarker): void {
    if (!this.map || !("properties" in region) || region.kind !== "admin") return;
    const maps = this.maps;
    const [[west, south], [east, north]] = region.bounds;
    const bounds = new maps.LatLngBounds(new maps.LatLng(south, west), new maps.LatLng(north, east));
    // setBounds(영역, 위, 오른쪽, 아래, 왼쪽 여백)
    this.map.setBounds(bounds, 40, 440, 40, 40);

    const [nearest, farthest] = KAKAO_LEVEL_RANGE[region.regionLevel as MapLevel];
    const current = this.map.getLevel();
    if (current < nearest || current > farthest) {
      this.map.setLevel(Math.min(farthest, Math.max(nearest, current)));
    }
  }

  /** 지도와 이벤트를 모두 정리한다. 컴포넌트가 사라질 때 부른다 */
  destroy(): void {
    this.destroyed = true;
    this.clearShapes();
    for (const listener of this.mapListeners) {
      this.maps.event.removeListener(this.map, listener.type, listener.handler);
    }
    this.mapListeners = [];
    this.container.innerHTML = "";
    this.map = null;
  }

  // ── 내부 동작 ─────────────────────────────────────────────────────

  /**
   * 지도에 이벤트를 붙이고, 나중에 떼어 낼 수 있게 기록해 둔다.
   * @param type 이벤트 이름 (idle, dragend …)
   * @param handler 실행할 함수
   */
  private listenMap(type: string, handler: () => void): void {
    this.maps.event.addListener(this.map, type, handler);
    this.mapListeners.push({ type, handler });
  }

  /** 줌·이동이 끝났을 때: 단계가 바뀌었으면 경계를 불러오고, 화면에 보이는 폴리곤을 다시 그린다 */
  private async handleIdle(): Promise<void> {
    const wantedLevel = levelForKakao(this.map.getLevel());
    if (wantedLevel !== this.level) {
      const needsLoading = !isLevelCached(wantedLevel);
      if (needsLoading) this.callbacks.onLoadingChange(true);
      const features = await loadLevelFeatures(wantedLevel);
      if (needsLoading) this.callbacks.onLoadingChange(false);
      if (this.destroyed) return;
      this.level = wantedLevel;
      this.levelFeatures = features;
      this.callbacks.onLevelChange(wantedLevel);
    }
    this.draw();
  }

  /** 지금 그려 둔 폴리곤·라벨을 모두 지운다 */
  private clearShapes(): void {
    for (const shape of this.shapes) shape.setMap(null);
    this.shapes = [];
  }

  /**
   * 폴리곤이 지금 보이는 지도 영역에 걸치는지 확인한다.
   * @param shape 확인할 폴리곤
   * @returns 보이면 true
   */
  private isInView(shape: MapFeature): boolean {
    const visible = this.map.getBounds();
    const southWest = visible.getSouthWest();
    const northEast = visible.getNorthEast();
    const [[west, south], [east, north]] = shape.bounds;
    return !(
      east < southWest.getLng() ||
      west > northEast.getLng() ||
      north < southWest.getLat() ||
      south > northEast.getLat()
    );
  }

  /**
   * 폴리곤 스타일(색·투명도·선)을 정한다.
   * @param shape 폴리곤
   * @returns 카카오 Polygon 옵션
   */
  private styleOf(shape: MapFeature): Record<string, string | number> {
    const isSelected = shape.id === this.selectedCode;
    const isSea = shape.kind === "sea";
    return {
      fillColor: isSelected ? MAP_COLORS.selected : isSea ? MAP_COLORS.sea : MAP_COLORS.land,
      fillOpacity: isSelected ? 0.55 : isSea ? 0.45 : 0.34,
      strokeColor: isSelected ? MAP_COLORS.selectedStroke : MAP_COLORS.landStroke,
      strokeWeight: isSelected ? SELECTED_LINE_WIDTH[this.level] : LINE_WIDTH[this.level],
      strokeOpacity: 0.95,
    };
  }

  /**
   * 기사 수를 꺼낸다.
   * @param code 지역 코드
   * @returns 기사 수 (통계가 없으면 0)
   */
  private countOf(code: string): number {
    return this.stats.get(code)?.article_count ?? 0;
  }

  /** 현재 상태대로 폴리곤·섬·라벨을 처음부터 다시 그린다 */
  private draw(): void {
    if (!this.map || this.destroyed) return;
    this.clearShapes();

    const visible =
      this.level === "sido"
        ? this.levelFeatures
        : this.levelFeatures.filter((shape) => this.isInView(shape)).slice(0, MAX_VISIBLE_FEATURES);
    // 시도 단계는 꼭짓점을 반으로 줄여도 충분히 매끄럽다
    const thinStep = this.level === "sido" ? 2 : 1;

    for (const shape of visible) this.addPolygon(shape, thinStep);
    for (const sea of SEA_FEATURES) this.addPolygon(sea, 1);
    for (const island of ISLAND_MARKERS) this.addIsland(island);

    if (visible.length <= MAX_LABELED_FEATURES) {
      for (const shape of visible) this.addLabel(shape);
    }
    for (const sea of SEA_FEATURES) this.addLabel(sea);
  }

  /**
   * 폴리곤 하나를 지도에 올리고 클릭·호버 이벤트를 붙인다.
   * @param shape 폴리곤
   * @param thinStep 꼭짓점 줄이기 간격
   */
  private addPolygon(shape: MapFeature, thinStep: number): void {
    const maps = this.maps;
    const geometry = shape.geometry;
    const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
    // 각 다각형의 바깥 테두리(첫 번째 링)만 쓴다
    const path = polygons.map((polygon) =>
      thinOutRing(polygon[0], thinStep).map(([lng, lat]) => new maps.LatLng(lat, lng)),
    );

    const polygon = new maps.Polygon({ map: this.map, path, ...this.styleOf(shape) });
    maps.event.addListener(polygon, "click", () => this.callbacks.onSelect(shape));
    maps.event.addListener(polygon, "mouseover", () => {
      if (shape.id === this.selectedCode) return;
      polygon.setOptions({
        fillColor: shape.kind === "sea" ? MAP_COLORS.seaHover : MAP_COLORS.landHover,
        fillOpacity: 0.5,
      });
    });
    maps.event.addListener(polygon, "mouseout", () => polygon.setOptions(this.styleOf(shape)));
    this.shapes.push(polygon);
  }

  /**
   * 지역 이름 라벨을 올린다. 선택된 지역은 숫자가 붙은 알약 모양으로 보여 준다.
   * @param shape 폴리곤
   */
  private addLabel(shape: MapFeature): void {
    const name = escapeHtml(shape.properties.name);
    const count = this.countOf(shape.id);
    const content =
      shape.id === this.selectedCode
        ? `<div class="map-pill">${name}<span class="count">${count}</span></div>`
        : `<div class="map-label">${name} · ${count}</div>`;
    const overlay = new this.maps.CustomOverlay({
      map: this.map,
      position: new this.maps.LatLng(shape.center[1], shape.center[0]),
      content,
      clickable: false,
      zIndex: 5,
    });
    this.shapes.push(overlay);
  }

  /**
   * 섬 라벨과, 클릭을 받을 투명 마커를 올린다.
   * (CustomOverlay 는 보이기만 하고 클릭은 투명 마커가 받는다)
   * @param island 섬
   */
  private addIsland(island: IslandMarker): void {
    const maps = this.maps;
    const position = new maps.LatLng(island.center[1], island.center[0]);
    const name = escapeHtml(island.name);
    const count = this.countOf(island.code);
    const content =
      island.code === this.selectedCode
        ? `<div class="map-pill">${name}<span class="count">${count}</span></div>`
        : `<div class="map-label">${name} · ${count}</div>`;

    this.shapes.push(new maps.CustomOverlay({ map: this.map, position, content, zIndex: 6 }));

    const marker = new maps.Marker({ map: this.map, position, opacity: 0.001 });
    maps.event.addListener(marker, "click", () => this.callbacks.onSelect(island));
    this.shapes.push(marker);
  }
}
