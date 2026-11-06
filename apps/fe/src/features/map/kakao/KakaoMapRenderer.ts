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
import { MAP_COLORS, colorForCount } from "../colors";
import {
  ISLAND_MARKERS,
  KOREA_BOUNDS,
  SEA_FEATURES,
  isLevelCached,
  loadLevelFeatures,
  loadTopology,
  regionsObjectOf,
} from "../geo";
import type { IslandMarker, MapFeature, MapLevel, MapZoom } from "../types";
import type { KakaoMapsApi } from "./loadKakaoSdk";

/** 렌더러가 바깥(React)으로 알려 주는 일들 */
export interface KakaoRendererCallbacks {
  onSelect: (region: MapFeature | IslandMarker) => void;
  onLevelChange: (level: MapLevel) => void;
  onLoadingChange: (loading: boolean) => void;
  /** 확대 정도가 바뀌었을 때 (zoom_changed) */
  onZoomChange: (zoom: MapZoom) => void;
}

/** 카카오 지도 레벨 범위. 13이 전국, 2가 동네 */
const KAKAO_MAX_LEVEL = 13;
const KAKAO_MIN_LEVEL = 2;

/**
 * 대한민국 밖을 덮는 마스크. 반투명한 검정으로 주변국 위성 사진을 어둡게 눌러 한반도만 도드라지게 한다
 * (2026-11-06, 크림색 #f5ead8·0.97 에서 바꿈 — 사용자가 고른 안).
 */
const OUTSIDE_MASK_COLOR = "#0b0f14";
const OUTSIDE_MASK_OPACITY = 0.62;
/**
 * 마스크 바깥 사각형 [서, 남, 동, 북]. 가장 축소(레벨 13)한 넓은 화면보다 넉넉해야 가장자리에 밝은 위성 사진이
 * 드러나지 않는다 (예전 118~140°E 는 1904px 폭 화면의 117.6~139.4°E 를 다 덮지 못했다).
 */
const OUTSIDE_MASK_EXTENT = [95, 15, 165, 55] as const;

/**
 * 첫 화면과 [전국] 버튼의 확대 정도(화면 숫자). 모바일은 전국이 다 보이게 1, PC 는 한 단계 확대한 2 (사용자 결정, 2026-11-06).
 * 카카오 레벨로는 1 = 13, 2 = 12 이다 (homeKakaoLevel).
 */
const HOME_ZOOM_VALUE = { mobile: 1, desktop: 2 };
/** 첫 화면과 [전국] 버튼의 지도 중심 [위도, 경도] (남한 내륙 가운데) */
const HOME_CENTER: [number, number] = [36.35, 127.9];

/** 지도를 옮길 목표: 이 좌표가 화면의 anchor 자리에 오도록, 이 레벨로 */
interface FocusTarget {
  center: KakaoMapsApi;
  level: number;
  anchor: { x: number; y: number };
}

/**
 * 카카오 레벨을 화면에 보여 줄 확대 정도로 바꾼다. 카카오 레벨은 숫자가 작을수록 확대라 헷갈리므로
 * 1(전국, 레벨 13) ~ 12(가장 확대, 레벨 2)로 뒤집는다.
 * @param kakaoLevel 카카오 지도 레벨
 * @returns 확대 정도
 */
function zoomOfKakaoLevel(kakaoLevel: number): MapZoom {
  return {
    value: KAKAO_MAX_LEVEL - kakaoLevel + 1,
    min: 1,
    max: KAKAO_MAX_LEVEL - KAKAO_MIN_LEVEL + 1,
  };
}

/** 단계별 카카오 지도 레벨 범위 [가까이, 멀리] */
const KAKAO_LEVEL_RANGE: Record<MapLevel, [number, number]> = {
  sido: [11, 13],
  sigungu: [8, 10],
  emd: [KAKAO_MIN_LEVEL, 7],
};

/** 지역으로 이동할 때 마지막 확대·축소(최대 2레벨) 애니메이션 시간(ms) */
const FOCUS_ZOOM_DURATION = 300;
/** 확대·축소 애니메이션이 시작(zoom_changed)될 때까지 기다리는 최대 시간(ms). 타일 로딩에 따라 0.3~1초 걸린다 */
const ZOOM_START_TIMEOUT = 1500;
/** 카카오 setLevel 애니메이션은 레벨 차이가 2 이하일 때만 동작한다 (SDK 문서) */
const MAX_ANIMATED_LEVEL_STEP = 2;
/**
 * panBy 뒤 idle 을 기다리는 최대 시간(ms). 이동 애니메이션은 약 0.3~0.4초이고 idle 도 그때 온다.
 * idle 은 타일을 다 받을 때까지 늦게 오기도 해서(스카이뷰는 1초 넘게) 그 이상은 기다리지 않는다.
 */
const PAN_WAIT_TIMEOUT = 500;
/** 확대·축소 애니메이션이 끝난 뒤 단계 전환까지 두는 여유(ms) */
const ZOOM_SETTLE = 60;
/** 이 폭 이하는 모바일로 보고 오른쪽 목록 패널 여백을 두지 않는다 (fe CLAUDE.md 검증 기준 768px) */
const MOBILE_MAX_WIDTH = 768;
/** 지역을 화면에 맞출 때 남기는 여백(px). PC 는 오른쪽 목록 패널(약 440px)을 피한다 */
const FOCUS_PADDING = { top: 40, bottom: 40, left: 40, right: 440, mobileRight: 40 };

/** 단계별 경계선 굵기 */
const LINE_WIDTH: Record<MapLevel, number> = { sido: 1.4, sigungu: 0.8, emd: 0.8 };
const SELECTED_LINE_WIDTH: Record<MapLevel, number> = { sido: 3.1, sigungu: 2.2, emd: 1.6 };

/** 육지 폴리곤 불투명도. 어두운 스카이뷰 위에서도 기사 수 색 단계가 구분되면서 지형이 살짝 비치도록 둔다 */
const LAND_FILL_OPACITY = 0.7;

/** 시군구·읍면동 단계에서 한 번에 그리는 최대 폴리곤 수 */
const MAX_VISIBLE_FEATURES = 260;
/** 한 화면에 붙이는 지역 이름 라벨의 최대 개수 (CustomOverlay 가 많으면 느려진다) */
const MAX_LABELED_FEATURES = 46;
/** 라벨 상자 크기 추정값(px). .map-label 글자 크기 11.5px 기준. 겹침 판정에만 쓴다 */
const LABEL_CHAR_WIDTH = 11.5;
const LABEL_PADDING_WIDTH = 10;
const LABEL_HEIGHT = 16;
/** 겹칠 때 위아래로 옮겨 볼 거리(px). 앞에서부터 차례로 시도한다 */
const LABEL_TRY_OFFSETS = [0, -16, 16, -30, 30];
/**
 * 폴리곤 겹침 순서. 바다 폴리곤은 해안선과 겹치는 대략적인 다각형이라
 * 육지(행정구역)가 항상 위에 와야 해안 지역·제주도·울릉군을 클릭할 수 있다.
 */
const SEA_Z_INDEX = 1;
const LAND_Z_INDEX = 2;

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
  /** 범례 구간 시작값 (API meta.legend). 육지 색을 기사 수로 고를 때 쓴다 */
  private legend: number[] = [];
  private selectedCode: string | null = null;
  private destroyed = false;
  /** handleIdle 호출 번호. 경계를 불러오는 동안 더 새로운 idle 이 오면 오래된 결과를 버린다 */
  private idleSequence = 0;
  /** focusOn 호출 번호. 이동 중에 다른 지역을 고르면 이전 이동은 그 자리에서 멈춘다 */
  private focusSequence = 0;
  /** 지역으로 이동하는 애니메이션 중이면 true. 중간 레벨에서 단계 전환(경계 교체·선택 해제)을 하지 않는다 */
  private isFocusing = false;
  /** 진행 중인 이동. 새 이동은 이게 지금 단계를 마치고 멈출 때까지 기다린다(움직이는 중에 좌표를 재면 틀어진다) */
  private currentFocus: Promise<void> = Promise.resolve();
  /**
   * 줄 서 있는 이동이 결국 도착할 카카오 레벨. 없으면 null.
   * [+]·[-] 를 빠르게 여러 번 눌러도 누른 만큼 쌓이게, 다음 단계는 지금 레벨이 아니라 이 값에서 센다.
   */
  private intendedLevel: number | null = null;

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
   * 2) 대한민국 밖을 반투명한 검정으로 어둡게 누르는 마스크 그리기
   * 3) 줌·이동이 끝날 때(idle)마다 단계 확인 후 다시 그리기
   */
  async start(): Promise<void> {
    const maps = this.maps;
    this.levelFeatures = await loadLevelFeatures("sido");
    const sidoTopology = await loadTopology("sido");
    if (this.destroyed) return;

    // 1) 지도 생성
    // 스카이뷰(위성) 지도를 쓴다. 일반 지도(ROADMAP)는 지명·행정경계가 그려져 있어 우리 라벨·경계와
    // 겹쳐 보이는데, 카카오 웹 SDK 에는 그것만 끄는 옵션이 없다. 스카이뷰에는 지명·경계가 없다.
    // 첫 화면은 [전국] 버튼과 같은 확대 정도(모바일 1, PC 2)로 남한 가운데에서 시작한다
    this.map = new maps.Map(this.container, {
      center: new maps.LatLng(...HOME_CENTER),
      level: this.homeKakaoLevel(),
      mapTypeId: maps.MapTypeId.SKYVIEW,
    });
    this.map.setMaxLevel(KAKAO_MAX_LEVEL); // 전국보다 더 넓게 축소 불가
    this.map.setMinLevel(KAKAO_MIN_LEVEL);
    this.koreaBounds = new maps.LatLngBounds(
      new maps.LatLng(KOREA_BOUNDS.south, KOREA_BOUNDS.west),
      new maps.LatLng(KOREA_BOUNDS.north, KOREA_BOUNDS.east),
    );

    // 지도 중심을 한반도 범위(KOREA_BOUNDS) 밖으로 끌고 나가면, 범위 안의 가장 가까운 지점으로 되돌린다
    // (주변국 노출 최소화). 예전엔 LatLngBounds 에 없는 getCenter() 를 불러 오류가 나고 지도가 그 자리에 멈췄다
    this.listenMap("dragend", () => {
      const center = this.map.getCenter();
      if (this.koreaBounds.contain(center)) return;
      const clampedLat = Math.min(KOREA_BOUNDS.north, Math.max(KOREA_BOUNDS.south, center.getLat()));
      const clampedLng = Math.min(KOREA_BOUNDS.east, Math.max(KOREA_BOUNDS.west, center.getLng()));
      this.map.panTo(new maps.LatLng(clampedLat, clampedLng));
    });

    // 2) 마스크: 바깥 큰 사각형에서 대한민국 모양만 구멍으로 뚫는다
    // topojson merge: 여러 시도 도형을 이어 붙여 대한민국 전체 모양 하나로 만든다
    const sidoShapes = regionsObjectOf(sidoTopology).geometries as Array<TopoPolygon | TopoMultiPolygon>;
    const koreaShape: MultiPolygon = merge(sidoTopology, sidoShapes);
    const [maskWest, maskSouth, maskEast, maskNorth] = OUTSIDE_MASK_EXTENT;
    const outerRing = [
      [maskWest, maskSouth],
      [maskEast, maskSouth],
      [maskEast, maskNorth],
      [maskWest, maskNorth],
      [maskWest, maskSouth],
    ].map(([lng, lat]) => new maps.LatLng(lat, lng));
    const holes = koreaShape.coordinates.map((polygon) =>
      thinOutRing(polygon[0], 3).map(([lng, lat]) => new maps.LatLng(lat, lng)),
    );
    new maps.Polygon({
      map: this.map,
      path: [outerRing, ...holes],
      strokeWeight: 0,
      fillColor: OUTSIDE_MASK_COLOR,
      fillOpacity: OUTSIDE_MASK_OPACITY,
    });

    // 3) 줌·이동이 끝날 때마다
    this.listenMap("idle", () => {
      void this.handleIdle();
    });
    // 4) 확대 정도 숫자 (애니메이션이 시작될 때 이미 목표 레벨이 된다)
    this.listenMap("zoom_changed", () => this.callbacks.onZoomChange(zoomOfKakaoLevel(this.map.getLevel())));
    this.callbacks.onZoomChange(zoomOfKakaoLevel(this.map.getLevel()));
    this.draw();
  }

  /**
   * 지역 통계가 바뀌었을 때 다시 그린다.
   * @param stats 지역 코드 → 통계
   * @param legend 범례 구간
   */
  setStats(stats: Map<string, RegionStat>, legend: number[]): void {
    this.stats = stats;
    this.legend = legend;
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
    this.zoomStep(-1);
  }

  /** 한 단계 축소 */
  zoomOut(): void {
    this.zoomStep(1);
  }

  /**
   * 화면 가운데를 기준으로 한 단계 확대·축소한다.
   * 카카오는 확대 애니메이션이 타일을 기다리는 동안 들어온 setLevel 을 무시해서, [+] 를 빠르게 누르면 클릭이
   * 사라졌다. 그래서 지역 이동과 같은 줄(enqueueFocus)에 세우고, 다음 단계는 도착할 레벨(intendedLevel)에서 센다.
   * @param delta 카카오 레벨 변화 (확대 -1, 축소 +1)
   */
  private zoomStep(delta: number): void {
    if (!this.map) return;
    const base = this.intendedLevel ?? this.map.getLevel();
    const level = Math.min(KAKAO_MAX_LEVEL, Math.max(KAKAO_MIN_LEVEL, base + delta));
    if (level === base) return;
    this.intendedLevel = level;
    this.enqueueFocus(() => {
      const center = this.map.getCenter();
      // 지금 중심을 지금 자리에 둔 채(이동 없이) 레벨만 바꾼다
      const point = this.map.getProjection().containerPointFromCoords(center);
      return { center, level, anchor: { x: point.x, y: point.y } };
    }, level);
  }

  /** 전국 보기로 되돌린다 */
  resetView(): void {
    if (!this.map) return;
    // 첫 화면과 같은 중심·확대 정도(모바일 1, PC 2)로 부드럽게 돌아간다. 선택이 풀려 목록 패널이 닫히므로 화면 가운데 기준이다
    this.enqueueFocus(() => {
      const { width, height } = this.container.getBoundingClientRect();
      return {
        center: new this.maps.LatLng(...HOME_CENTER),
        level: this.homeKakaoLevel(),
        anchor: { x: width / 2, y: height / 2 },
      };
    });
  }

  /**
   * 지역이 보이도록 부드럽게 이동·확대한다. PC 는 오른쪽 목록 패널(440px)을 피해서 맞춘다.
   * 확대 정도는 그 지역 단계의 레벨 범위 안으로 맞춘다. 섬·바다는 이동하지 않는다.
   * 실제 애니메이션은 animateTo 가 한다(기다리는 동안 다른 지역을 고르면 이전 이동은 멈춘다).
   * @param region 이동할 지역
   */
  focusOn(region: MapFeature | IslandMarker): void {
    if (!this.map || !("properties" in region) || region.kind !== "admin") return;
    this.enqueueFocus(() => {
      const [[west, south], [east, north]] = region.bounds;
      return {
        center: new this.maps.LatLng((south + north) / 2, (west + east) / 2),
        level: this.fitLevelFor(region),
        anchor: this.focusAnchorPoint(),
      };
    });
  }

  /**
   * 지도 이동을 줄 세운다. 앞의 이동은 sequence 가 바뀐 걸 보고 지금 단계(애니메이션 한 번)만 마치고 멈추고,
   * 이 이동은 그 뒤에 시작한다. 목표는 시작하는 순간 계산한다(움직이는 중에 좌표를 재면 틀어진다).
   * @param targetOf 시작할 때 부를 목표 계산 함수
   * @param intendedLevel 이 이동이 도착할 레벨을 미리 알면 넘긴다 (확대·축소 버튼)
   */
  private enqueueFocus(targetOf: () => FocusTarget, intendedLevel: number | null = null): void {
    // 확대·축소 버튼은 도착할 레벨을 미리 알려 준다. 지역 이동·[전국] 은 시작할 때 정해지므로 일단 비운다
    this.intendedLevel = intendedLevel;
    const sequence = ++this.focusSequence;
    const previous = this.currentFocus;
    this.currentFocus = previous
      .then(() => this.animateTo(targetOf, sequence))
      .catch((error) => console.error("지도를 이동하지 못했습니다", error)); // 실패해도 다음 이동은 막지 않는다
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
   * 목표 중심·레벨로 부드럽게 이동한다 (지역 선택·[전국] 버튼). setBounds 는 애니메이션이 없어 직접 단계를 밟는다.
   * 1) 지금 레벨에서 지역 중심이 화면 기준점(패널을 뺀 가운데)에 오도록 panBy 로 미끄러지듯 옮긴다
   * 2) 목표 레벨로 확대·축소한다. 기준점(anchor)을 지역 중심으로 두어 지역이 화면 같은 자리에 머문다.
   *    카카오 애니메이션은 레벨 차이 2 이하만 되고, 새 레벨 타일이 준비될 때까지 시작이 늦어져
   *    (0.3~1초) 그 사이 다음 setLevel 은 무시된다. 그래서 2레벨씩 여러 번 하지 않고, 목표 2레벨 앞까지는
   *    한 번에 맞춘 뒤 마지막 2레벨만 애니메이션한다
   * 3) 다 끝나면 단계 전환(handleIdle)을 한 번만 한다. 중간 레벨에서 전환하면 읍면동을 고를 때
   *    중간의 시군구 레벨에서 선택이 풀린다
   * @param targetOf 목표(중심·레벨·화면 기준점)를 계산하는 함수. 앞 이동이 멈춘 뒤 시작할 때 부른다
   * @param sequence 이동 호출 번호(enqueueFocus). 더 새로운 호출이 오면 여기서 멈춘다
   */
  private async animateTo(targetOf: () => FocusTarget, sequence: number): Promise<void> {
    const isStale = () => this.destroyed || !this.map || sequence !== this.focusSequence;
    // 기다리는 사이 더 새로운 이동이 들어왔으면 시작하지 않는다
    if (isStale()) return;
    const { center, level: targetLevel, anchor } = targetOf();
    this.intendedLevel = targetLevel;

    this.isFocusing = true;
    try {
      // 1) 이동
      const point = this.map.getProjection().containerPointFromCoords(center);
      const moveX = point.x - anchor.x;
      const moveY = point.y - anchor.y;
      if (Math.abs(moveX) > 1 || Math.abs(moveY) > 1) {
        await this.runAndWaitForIdle(() => this.map.panBy(moveX, moveY), PAN_WAIT_TIMEOUT);
        if (isStale()) return;
      }

      // 2) 확대·축소. 레벨 차이가 크면 목표 2레벨 앞까지는 애니메이션 없이 맞추고, 마지막 2레벨만 애니메이션한다
      const current = this.map.getLevel();
      if (Math.abs(targetLevel - current) > MAX_ANIMATED_LEVEL_STEP) {
        const direction = targetLevel > current ? 1 : -1;
        this.map.setLevel(targetLevel - direction * MAX_ANIMATED_LEVEL_STEP, { anchor: center });
      }
      if (this.map.getLevel() !== targetLevel) {
        // 애니메이션은 새 레벨 타일이 준비된 뒤 시작하므로(zoom_changed) 그때부터 애니메이션 길이만큼 기다린다
        await this.runAndWaitForEvent(
          "zoom_changed",
          () => this.map.setLevel(targetLevel, { animate: { duration: FOCUS_ZOOM_DURATION }, anchor: center }),
          ZOOM_START_TIMEOUT,
        );
        if (isStale()) return;
        await new Promise((resolve) => setTimeout(resolve, FOCUS_ZOOM_DURATION + ZOOM_SETTLE));
        if (isStale()) return;
        // 카카오가 애니메이션 호출을 무시했으면(타일 대기 중 겹침 등) 애니메이션 없이 목표 레벨로 맞춘다
        if (this.map.getLevel() !== targetLevel) this.map.setLevel(targetLevel, { anchor: center });
      }
    } finally {
      // 3) 이 이동이 마지막 호출일 때만 단계 전환 (더 새로운 이동이 있으면 그쪽이 끝낸다)
      if (sequence === this.focusSequence && !this.destroyed && this.map) {
        this.isFocusing = false;
        this.intendedLevel = null;
        void this.handleIdle();
      }
    }
  }

  /**
   * 첫 화면·[전국] 버튼의 카카오 레벨. 지도 요소 폭으로 모바일인지 본다(부를 때마다 재므로 창 크기를 바꾼 뒤에도 맞다).
   * @returns 카카오 레벨 (모바일 13, PC 12)
   */
  private homeKakaoLevel(): number {
    const isMobile = this.container.getBoundingClientRect().width <= MOBILE_MAX_WIDTH;
    const zoomValue = isMobile ? HOME_ZOOM_VALUE.mobile : HOME_ZOOM_VALUE.desktop;
    return KAKAO_MAX_LEVEL - zoomValue + 1;
  }

  /**
   * 지역을 맞출 화면 기준점(px). 여백을 뺀 영역의 가운데다.
   * @returns 지도 요소 왼쪽 위 기준 좌표
   */
  private focusAnchorPoint(): { x: number; y: number } {
    const { width, height } = this.container.getBoundingClientRect();
    const right = width <= MOBILE_MAX_WIDTH ? FOCUS_PADDING.mobileRight : FOCUS_PADDING.right;
    return {
      x: FOCUS_PADDING.left + (width - FOCUS_PADDING.left - right) / 2,
      y: FOCUS_PADDING.top + (height - FOCUS_PADDING.top - FOCUS_PADDING.bottom) / 2,
    };
  }

  /**
   * 지역이 여백 안에 꼭 맞게 들어가는 카카오 레벨을 계산한다 (setBounds 와 같은 결과를 애니메이션 없이 미리 구함).
   * 1) 지금 레벨에서 지역 경계 상자가 화면에서 몇 px 인지 잰다
   * 2) 카카오 레벨은 1 오를 때마다 화면 크기가 절반이 되므로 log2(필요 배율)만큼 레벨을 옮긴다
   * 3) 그 지역 단계의 레벨 범위(KAKAO_LEVEL_RANGE) 안으로 맞춘다
   * @param region 지역
   * @returns 목표 카카오 레벨
   */
  private fitLevelFor(region: MapFeature): number {
    const maps = this.maps;
    const [[west, south], [east, north]] = region.bounds;
    const projection = this.map.getProjection();
    const topLeft = projection.containerPointFromCoords(new maps.LatLng(north, west));
    const bottomRight = projection.containerPointFromCoords(new maps.LatLng(south, east));
    const boxWidth = Math.max(1, Math.abs(bottomRight.x - topLeft.x));
    const boxHeight = Math.max(1, Math.abs(bottomRight.y - topLeft.y));

    const { width, height } = this.container.getBoundingClientRect();
    const right = width <= MOBILE_MAX_WIDTH ? FOCUS_PADDING.mobileRight : FOCUS_PADDING.right;
    const availableWidth = Math.max(1, width - FOCUS_PADDING.left - right);
    const availableHeight = Math.max(1, height - FOCUS_PADDING.top - FOCUS_PADDING.bottom);
    const neededScale = Math.max(boxWidth / availableWidth, boxHeight / availableHeight);
    const fittedLevel = this.map.getLevel() + Math.ceil(Math.log2(neededScale));

    const [nearest, farthest] = KAKAO_LEVEL_RANGE[region.regionLevel as MapLevel];
    return Math.min(farthest, Math.max(nearest, fittedLevel));
  }

  /**
   * 지도를 움직이는 함수를 실행하고, 움직임이 끝난 idle 까지 기다린다.
   * 카카오는 애니메이션이 없으면 idle 을 동기적으로 부르기도 해서, 리스너를 먼저 붙인 뒤 실행한다.
   * idle 이 늦거나 오지 않으면(움직일 거리가 없음, 타일 로딩 중 등) timeout 뒤에 그냥 넘어간다.
   * @param action 지도를 움직이는 함수 (panBy …)
   * @param timeout 최대로 기다릴 시간(ms)
   * @returns 움직임이 끝나면 끝나는 Promise
   */
  private runAndWaitForIdle(action: () => void, timeout: number): Promise<void> {
    return this.runAndWaitForEvent("idle", action, timeout);
  }

  /**
   * 지도를 움직이는 함수를 실행하고, 지도 이벤트가 한 번 올 때까지 기다린다.
   * 이벤트가 동기적으로 오는 경우도 있어 리스너를 먼저 붙인 뒤 실행한다. 오지 않으면 timeout 뒤에 넘어간다.
   * @param eventType 기다릴 카카오 지도 이벤트 (idle, zoom_changed …)
   * @param action 지도를 움직이는 함수
   * @param timeout 최대로 기다릴 시간(ms)
   * @returns 이벤트가 오거나 timeout 이 지나면 끝나는 Promise
   */
  private runAndWaitForEvent(eventType: string, action: () => void, timeout: number): Promise<void> {
    return new Promise((resolve) => {
      const maps = this.maps;
      const map = this.map;
      // finish 는 아래 action() 이후에만 불리므로(idle 도 그때 온다) 그 시점엔 timer 가 이미 있다
      const finish = () => {
        clearTimeout(timer);
        maps.event.removeListener(map, eventType, finish);
        resolve();
      };
      maps.event.addListener(map, eventType, finish);
      const timer = setTimeout(finish, timeout);
      action();
    });
  }

  /**
   * 지도에 이벤트를 붙이고, 나중에 떼어 낼 수 있게 기록해 둔다.
   * @param type 이벤트 이름 (idle, dragend …)
   * @param handler 실행할 함수
   */
  private listenMap(type: string, handler: () => void): void {
    this.maps.event.addListener(this.map, type, handler);
    this.mapListeners.push({ type, handler });
  }

  /**
   * 줌·이동이 끝났을 때: 단계가 바뀌었으면 경계를 불러오고, 화면에 보이는 폴리곤을 다시 그린다.
   *
   * 카카오는 setBounds()·setLevel() 안에서 idle 을 바로(동기적으로) 부른다. 그래서 focusOn() 이
   * setBounds() 로 잠깐 시군구 레벨까지 들어갔다가 setLevel() 로 시도 레벨로 되돌리면, 시군구 경계를
   * 기다리던 첫 호출이 나중에 끝나며 단계를 시군구로 바꾸고 선택을 풀어 버린다(제주 선택이 풀리던 원인).
   * 경계를 기다린 뒤 더 새로운 호출이 있었으면 이 호출의 결과는 버린다.
   */
  private async handleIdle(): Promise<void> {
    // 지역으로 이동하는 애니메이션 중간의 idle 은 무시한다. 이동이 끝나면 animateTo 가 다시 부른다
    if (this.isFocusing) return;
    const sequence = ++this.idleSequence;
    const wantedLevel = levelForKakao(this.map.getLevel());
    if (wantedLevel !== this.level) {
      const needsLoading = !isLevelCached(wantedLevel);
      if (needsLoading) this.callbacks.onLoadingChange(true);
      const features = await loadLevelFeatures(wantedLevel);
      if (needsLoading) this.callbacks.onLoadingChange(false);
      if (this.destroyed || sequence !== this.idleSequence) return;
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
   * 육지는 SVG 지도처럼 기사 수에 따라 범례 색(colorForCount)으로 칠한다.
   * @param shape 폴리곤
   * @returns 카카오 Polygon 옵션
   */
  private styleOf(shape: MapFeature): Record<string, string | number> {
    const isSelected = shape.id === this.selectedCode;
    const isSea = shape.kind === "sea";
    const landColor = colorForCount(this.countOf(shape.id), this.legend);
    return {
      fillColor: isSelected ? MAP_COLORS.selected : isSea ? MAP_COLORS.sea : landColor,
      fillOpacity: isSelected ? 0.55 : isSea ? 0.45 : LAND_FILL_OPACITY,
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

    // 1) 바다를 먼저, 육지를 나중에 그린다. 겹치는 곳은 zIndex 로도 육지가 위에 오게 한다
    for (const sea of SEA_FEATURES) this.addPolygon(sea, 1, SEA_Z_INDEX);
    for (const shape of visible) this.addPolygon(shape, thinStep, LAND_Z_INDEX);
    // 2) 섬은 폴리곤 위에 클릭 가능한 라벨로 올린다
    for (const island of ISLAND_MARKERS) this.addIsland(island);

    // 3) 라벨은 겹치지 않는 것만 골라 붙인다 (폴리곤이 많은 배율에서도 큰 지역 이름은 보이게)
    for (const { shape, offsetY } of this.placeLabels([...SEA_FEATURES, ...visible])) this.addLabel(shape, offsetY);
  }

  /**
   * 라벨을 붙일 지역을 고른다. SVG 엔진(SvgMapRenderer.drawLabels)과 같은 규칙이다.
   * 1) 우선순위를 매긴다: 선택한 지역 > 바다 > 광역시·특별시 > 넓은 지역
   * 2) 우선순위가 높은 것부터 자리를 잡되, 이미 놓인 라벨과 겹치면 위아래로 조금씩 옮겨 본다
   *    (예: 경기도 중심은 서울과 거의 같아서 서울 라벨 아래로 비켜 놓는다)
   * 3) 화면 밖이거나 끝내 자리가 없으면 생략하고, 최대 MAX_LABELED_FEATURES 개까지만 놓는다
   * @param shapes 라벨 후보 폴리곤 (바다 포함)
   * @returns 라벨을 붙일 폴리곤과 세로로 옮길 거리(px)
   */
  private placeLabels(shapes: MapFeature[]): Array<{ shape: MapFeature; offsetY: number }> {
    const projection = this.map.getProjection();
    const mapSize = this.container.getBoundingClientRect();

    // 1) 후보마다 화면 위치·상자 크기·우선순위를 계산한다
    const candidates = shapes.map((shape) => {
      const point = projection.containerPointFromCoords(new this.maps.LatLng(shape.center[1], shape.center[0]));
      const text = `${shape.properties.name} · ${this.countOf(shape.id)}`;
      const [[west, south], [east, north]] = shape.bounds;
      let priority = (east - west) * (north - south);
      if (/광역시|특별시/.test(shape.properties.name)) priority = 1e3;
      if (shape.kind === "sea") priority = 1e4;
      if (shape.id === this.selectedCode) priority = 1e9;
      return {
        shape,
        x: point.x as number,
        y: point.y as number,
        width: text.length * LABEL_CHAR_WIDTH + LABEL_PADDING_WIDTH,
        priority,
        offsetY: 0,
      };
    });
    candidates.sort((a, b) => b.priority - a.priority);

    // 2) 겹치지 않는 자리를 찾는다
    const placed: typeof candidates = [];
    for (const candidate of candidates) {
      if (placed.length >= MAX_LABELED_FEATURES) break;
      const isOffScreen =
        candidate.x < 0 || candidate.y < 0 || candidate.x > mapSize.width || candidate.y > mapSize.height;
      if (isOffScreen) continue;

      for (const offsetY of LABEL_TRY_OFFSETS) {
        const overlaps = placed.some(
          (other) =>
            Math.abs(other.x - candidate.x) < (other.width + candidate.width) / 2 &&
            Math.abs(other.y + other.offsetY - (candidate.y + offsetY)) < LABEL_HEIGHT,
        );
        if (!overlaps) {
          candidate.offsetY = offsetY;
          placed.push(candidate);
          break;
        }
      }
    }
    return placed.map(({ shape, offsetY }) => ({ shape, offsetY }));
  }

  /**
   * 폴리곤 하나를 지도에 올리고 클릭·호버 이벤트를 붙인다.
   * @param shape 폴리곤
   * @param thinStep 꼭짓점 줄이기 간격
   * @param zIndex 겹침 순서 (SEA_Z_INDEX 또는 LAND_Z_INDEX)
   */
  private addPolygon(shape: MapFeature, thinStep: number, zIndex: number): void {
    const maps = this.maps;
    const geometry = shape.geometry;
    const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
    // 행정구역은 바깥 테두리(첫 번째 링)만 쓴다(구멍이 거의 없고 꼭짓점이 많아서).
    // 바다는 육지를 잘라낸 모양이라 섬이 구멍(안쪽 링)이다. 구멍을 빼면 섬 위에 바다 색이 덮이므로 모든 링을 쓴다
    const rings = shape.kind === "sea" ? polygons.flat() : polygons.map((polygon) => polygon[0]);
    const path = rings.map((ring) => thinOutRing(ring, thinStep).map(([lng, lat]) => new maps.LatLng(lat, lng)));

    const polygon = new maps.Polygon({ map: this.map, path, zIndex, ...this.styleOf(shape) });
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
   * @param offsetY 다른 라벨과 겹치지 않게 세로로 옮길 거리(px, 기본 0)
   */
  private addLabel(shape: MapFeature, offsetY = 0): void {
    const name = escapeHtml(shape.properties.name);
    const count = this.countOf(shape.id);
    // .map-label/.map-pill 의 transform(가운데 정렬)을 건드리지 않도록 세로 이동은 margin 으로 준다
    const shift = offsetY === 0 ? "" : ` style="margin-top:${offsetY}px"`;
    const content =
      shape.id === this.selectedCode
        ? `<div class="map-pill"${shift}>${name}<span class="count">${count}</span></div>`
        : `<div class="map-label"${shift}>${name} · ${count}</div>`;
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
   * 섬 라벨을 올리고, 라벨 자체가 클릭을 받게 한다.
   * 섬은 화면에서 너무 작아 폴리곤 대신 보이는 라벨을 클릭 영역으로 쓴다.
   * @param island 섬
   */
  private addIsland(island: IslandMarker): void {
    const maps = this.maps;
    const position = new maps.LatLng(island.center[1], island.center[0]);
    const name = escapeHtml(island.name);
    const count = this.countOf(island.code);

    // 1) 라벨 요소를 직접 만든다. .map-label/.map-pill 은 pointer-events: none 이라 섬 라벨만 클릭을 켠다
    const content = document.createElement("div");
    content.className = island.code === this.selectedCode ? "map-pill map-island" : "map-label map-island";
    content.innerHTML =
      island.code === this.selectedCode ? `${name}<span class="count">${count}</span>` : `${name} · ${count}`;
    content.addEventListener("click", () => this.callbacks.onSelect(island));

    // 2) clickable: true 로 라벨 클릭이 아래 바다 폴리곤·지도로 넘어가지 않게 막는다
    this.shapes.push(new maps.CustomOverlay({ map: this.map, position, content, clickable: true, zIndex: 6 }));
  }
}
