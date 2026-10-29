/**
 * d3 로 SVG 폴리곤 지도를 그리는 클래스. (카카오 키가 없을 때 쓰는 지도)
 *
 * React 컴포넌트(SvgMapEngine)가 이 클래스를 만들고, 바뀐 값(통계, 선택 지역)을 메서드로 알려 준다.
 * 그리기와 줌 처리는 모두 d3 가 직접 DOM 을 다루므로 React 의 렌더링과 분리해 두었다.
 *
 * 그리는 순서(아래에서 위로): 바다 → 육지 폴리곤 → 섬 동그라미 → 지역 이름 라벨
 */
import {
  type GeoPath,
  type GeoProjection,
  type Selection,
  type ZoomBehavior,
  type ZoomTransform,
  geoArea,
  geoMercator,
  geoPath,
  select,
  zoom,
  zoomIdentity,
  zoomTransform,
} from "d3";
import type { RegionStat } from "@/lib/api/types";
import { MAP_COLORS, colorForCount } from "../colors";
import { ISLAND_MARKERS, SEA_FEATURES, isLevelCached, loadLevelFeatures } from "../geo";
import type { IslandMarker, LngLat, MapFeature, MapHover, MapLevel } from "../types";

/** 렌더러가 바깥(React)으로 알려 주는 일들 */
export interface SvgRendererCallbacks {
  onSelect: (region: MapFeature | IslandMarker) => void;
  onLevelChange: (level: MapLevel) => void;
  onHover: (hover: MapHover | null) => void;
  /** 경계 파일을 불러오는 중인지 (화면 상단 "불러오는 중" 표시용) */
  onLoadingChange: (loading: boolean) => void;
}

/** 이 폭 이하이면 모바일 화면으로 본다 */
export const MOBILE_MAX_WIDTH = 768;

/** 줌 배율 범위 */
const MIN_ZOOM = 1;
const MAX_ZOOM = 26;

/**
 * 단계별 줌 배율 범위. 배율이 이 범위에 들어오면 해당 단계 경계를 그린다.
 * 지역을 선택해 이동할 때도 그 지역 단계의 범위 안에서만 확대한다.
 */
const ZOOM_RANGE: Record<MapLevel, [number, number]> = {
  sido: [1, 2.3],
  sigungu: [2.4, 6.8],
  emd: [7, MAX_ZOOM],
};

/** 단계별 경계선 굵기(px). 줌과 관계없이 화면에서 같은 굵기로 보인다 */
const LINE_WIDTH: Record<MapLevel, number> = { sido: 1, sigungu: 0.6, emd: 0.4 };
const SELECTED_LINE_WIDTH: Record<MapLevel, number> = { sido: 2.6, sigungu: 1.8, emd: 1.4 };

/** 시군구·읍면동 단계에서 한 번에 그리는 최대 폴리곤 수 (너무 많으면 느려진다) */
const MAX_VISIBLE_FEATURES = 500;
/** 단계 전환을 잠깐 미루는 시간(ms). 줌을 빠르게 돌릴 때 여러 번 바뀌지 않도록 */
const LEVEL_SWITCH_DELAY_MS = 140;

/** 라벨 배치 후보 */
interface LabelCandidate {
  key: string;
  text: string;
  center: LngLat;
  isSea: boolean;
  isSelected: boolean;
  /** 화면 좌표 */
  x: number;
  y: number;
  /** 대략적인 라벨 크기 */
  width: number;
  height: number;
  /** 클수록 먼저 자리를 차지한다 */
  priority: number;
  /** 겹침을 피해 위아래로 옮긴 거리 */
  offsetY: number;
}

type GroupSelection = Selection<SVGGElement, unknown, null, undefined>;

/**
 * 줌 배율에 맞는 지도 단계를 고른다.
 * @param zoomScale 현재 줌 배율
 * @returns 단계
 */
function levelForZoom(zoomScale: number): MapLevel {
  if (zoomScale < 2.4) return "sido";
  if (zoomScale < 7) return "sigungu";
  return "emd";
}

export class SvgMapRenderer {
  private readonly container: HTMLElement;
  private readonly callbacks: SvgRendererCallbacks;
  private readonly width: number;
  private readonly height: number;
  /** PC 에서 왼쪽 요약 레일이 차지하는 폭 (모바일은 0) */
  private readonly railWidth: number;
  private readonly isMobile: boolean;

  private readonly svg: Selection<SVGSVGElement, unknown, null, undefined>;
  private readonly seaLayer: GroupSelection;
  private readonly landLayer: GroupSelection;
  private readonly islandLayer: GroupSelection;
  private readonly labelLayer: GroupSelection;
  private readonly zoomBehavior: ZoomBehavior<SVGSVGElement, unknown>;

  private projection: GeoProjection = geoMercator();
  private pathOf: GeoPath = geoPath(this.projection);

  private level: MapLevel = "sido";
  /** 현재 단계의 전체 폴리곤 */
  private levelFeatures: MapFeature[] = [];
  /** 그중 지금 화면에 그린 폴리곤 */
  private visibleFeatures: MapFeature[] = [];
  private stats = new Map<string, RegionStat>();
  private legend: number[] = [];
  private selectedCode: string | null = null;
  private zoomScale = 1;
  private levelSwitchTimer: ReturnType<typeof setTimeout> | undefined;
  private destroyed = false;

  /**
   * SVG 를 만들고 레이어와 줌 동작을 준비한다. 실제 그리기는 start() 에서 한다.
   * @param container 지도를 넣을 DOM 요소
   * @param callbacks 바깥으로 알릴 함수들
   */
  constructor(container: HTMLElement, callbacks: SvgRendererCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.width = container.clientWidth;
    this.height = container.clientHeight;
    this.isMobile = window.innerWidth <= MOBILE_MAX_WIDTH;
    this.railWidth = this.isMobile ? 0 : 160;

    this.svg = select(container)
      .append("svg")
      .attr("viewBox", `0 0 ${this.width} ${this.height}`)
      .attr("class", "block h-full w-full cursor-grab active:cursor-grabbing");
    const root = this.svg.append("g");
    this.seaLayer = root.append("g");
    this.landLayer = root.append("g");
    this.islandLayer = root.append("g");
    this.labelLayer = root.append("g");

    this.zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([MIN_ZOOM, MAX_ZOOM])
      .translateExtent([
        [0, 0],
        [this.width, this.height],
      ])
      // 줌을 시작하면 툴팁을 지운다 (다시 그리는 동안 mouseout 이 오지 않아 툴팁이 남는 것을 막는다)
      .on("start", () => this.callbacks.onHover(null))
      .on("zoom", (event: { transform: ZoomTransform }) => {
        root.attr("transform", event.transform.toString());
        this.zoomScale = event.transform.k;
        this.handleZoom();
      })
      // 줌·이동이 끝나면 화면에 새로 들어온 폴리곤을 그린다
      .on("end", () => this.drawAll());
    this.svg.call(this.zoomBehavior);
  }

  /**
   * 시도 경계를 불러와 첫 화면을 그린다.
   * @returns 그리기가 끝나면 끝나는 Promise
   */
  async start(): Promise<void> {
    this.levelFeatures = await loadLevelFeatures("sido");
    if (this.destroyed) return;
    this.fitProjection(this.levelFeatures);
    this.drawAll();

    // 처음에는 한 단계 살짝 확대해서 시작한다 (화면 중심 기준 1.35배)
    const initialScale = 1.35;
    const centerX = this.width / 2;
    const centerY = this.height / 2;
    this.svg.call(
      this.zoomBehavior.transform,
      zoomIdentity.translate(centerX - initialScale * centerX, centerY - initialScale * centerY).scale(initialScale),
    );
  }

  /**
   * 지역 통계가 바뀌었을 때 색과 라벨을 다시 칠한다.
   * @param stats 지역 코드 → 통계
   * @param legend 범례 구간
   */
  setStats(stats: Map<string, RegionStat>, legend: number[]): void {
    this.stats = stats;
    this.legend = legend;
    this.drawAll();
  }

  /**
   * 선택된 지역을 바꾼다. (강조 색만 바꾸고 이동은 하지 않는다)
   * @param code 선택한 지역 코드. 선택 해제는 null
   */
  setSelected(code: string | null): void {
    this.selectedCode = code;
    this.drawAll();
  }

  /** 한 단계(1.7배) 확대 */
  zoomIn(): void {
    this.svg.transition().duration(250).call(this.zoomBehavior.scaleBy, 1.7);
  }

  /** 한 단계 축소 */
  zoomOut(): void {
    this.svg.transition().duration(250).call(this.zoomBehavior.scaleBy, 1 / 1.7);
  }

  /** 전국 보기로 되돌린다 */
  resetView(): void {
    this.svg.transition().duration(500).call(this.zoomBehavior.transform, zoomIdentity);
  }

  /**
   * 지역이 화면에 잘 보이도록 이동·확대한다.
   * 1) 지역의 경계 상자를 화면 좌표로 바꾸고
   * 2) 목록 패널을 피한 빈 공간에 맞는 배율을 계산한 뒤
   * 3) 그 지역 단계의 줌 범위 안으로 배율을 맞춘다.
   * 섬은 이동하지 않는다.
   * @param region 이동할 지역
   */
  focusOn(region: MapFeature | IslandMarker): void {
    if (!("properties" in region) || region.kind !== "admin") return;
    const level = region.regionLevel as MapLevel;

    // 1) 경계 상자 → 화면 좌표 (왼쪽 위, 오른쪽 아래)
    const [[west, south], [east, north]] = region.bounds;
    const [left, top] = this.projection([west, north]) ?? [0, 0];
    const [right, bottom] = this.projection([east, south]) ?? [0, 0];
    const boxWidth = Math.max(24, right - left);
    const boxHeight = Math.max(24, bottom - top);

    // 2) PC 는 오른쪽 목록 패널(약 440px)을 빼고, 모바일은 화면 전체를 기준으로 한다
    const panelWidth = this.isMobile ? 0 : 440;
    const availableWidth = this.isMobile ? this.width - 40 : this.width - this.railWidth - panelWidth;
    const fitScale = 0.72 * Math.min(availableWidth / boxWidth, (this.height - 100) / boxHeight);

    // 3) 단계 범위 안으로
    const [minScale, maxScale] = ZOOM_RANGE[level];
    const scale = Math.min(maxScale, Math.max(minScale, fitScale));

    const boxCenterX = (left + right) / 2;
    const boxCenterY = (top + bottom) / 2;
    const anchorX = this.isMobile ? this.width / 2 : (this.width + this.railWidth - panelWidth) / 2;
    const anchorY = (this.height - 44) / 2;
    this.svg
      .transition()
      .duration(600)
      .call(
        this.zoomBehavior.transform,
        zoomIdentity.translate(anchorX - scale * boxCenterX, anchorY - scale * boxCenterY).scale(scale),
      );
  }

  /** 지도를 지우고 타이머를 정리한다. 컴포넌트가 사라질 때 부른다 */
  destroy(): void {
    this.destroyed = true;
    clearTimeout(this.levelSwitchTimer);
    this.svg.on(".zoom", null);
    this.svg.remove();
  }

  // ── 내부 동작 ─────────────────────────────────────────────────────

  /**
   * 투영법(위경도 → 화면 좌표 변환)을 화면 크기에 맞춘다.
   * 시도와 바다가 모두 들어오도록, 왼쪽 레일과 아래 티커 자리는 비워 둔다.
   * @param sidoFeatures 시도 폴리곤 목록
   */
  private fitProjection(sidoFeatures: MapFeature[]): void {
    const padding = 34;
    const corners = [...sidoFeatures, ...SEA_FEATURES].flatMap((shape) => shape.bounds);
    this.projection = geoMercator().fitExtent(
      [
        [padding + this.railWidth, padding + 8],
        [this.width - (this.railWidth ? 196 : padding), this.height - padding - 56],
      ],
      { type: "MultiPoint", coordinates: corners },
    );
    this.pathOf = geoPath(this.projection);
  }

  /**
   * 줌 중에 계속 불린다. 단계가 바뀌어야 하면 잠깐 기다렸다가 바꾸고, 아니면 라벨만 다시 놓는다.
   */
  private handleZoom(): void {
    const wantedLevel = levelForZoom(this.zoomScale);
    if (wantedLevel === this.level) {
      clearTimeout(this.levelSwitchTimer);
      this.drawIslands();
      this.drawLabels();
      return;
    }
    clearTimeout(this.levelSwitchTimer);
    this.levelSwitchTimer = setTimeout(() => this.switchLevel(wantedLevel), LEVEL_SWITCH_DELAY_MS);
  }

  /**
   * 다른 단계의 경계를 불러와 다시 그린다.
   * @param level 바꿀 단계
   */
  private async switchLevel(level: MapLevel): Promise<void> {
    const needsLoading = !isLevelCached(level);
    if (needsLoading) this.callbacks.onLoadingChange(true);
    const features = await loadLevelFeatures(level);
    if (needsLoading) this.callbacks.onLoadingChange(false);
    if (this.destroyed) return;

    this.level = level;
    this.levelFeatures = features;
    this.callbacks.onLevelChange(level);
    this.drawAll();
  }

  /** 지금 화면에 보이는 영역을 지도 좌표(투영 후 좌표)로 돌려준다 */
  private visibleBox(): { x0: number; y0: number; x1: number; y1: number } {
    const transform = zoomTransform(this.svg.node()!);
    return {
      x0: transform.invertX(0),
      y0: transform.invertY(0),
      x1: transform.invertX(this.width),
      y1: transform.invertY(this.height),
    };
  }

  /**
   * 폴리곤이 화면 안에 조금이라도 걸치는지 확인한다.
   * @param shape 확인할 폴리곤
   * @returns 보이면 true
   */
  private isInView(shape: MapFeature): boolean {
    const box = this.visibleBox();
    const [[west, south], [east, north]] = shape.bounds;
    const topLeft = this.projection([west, north]);
    const bottomRight = this.projection([east, south]);
    if (!topLeft || !bottomRight) return false;
    return !(bottomRight[0] < box.x0 || topLeft[0] > box.x1 || bottomRight[1] < box.y0 || topLeft[1] > box.y1);
  }

  /**
   * 지역의 기사 수를 꺼낸다.
   * @param code 지역 코드
   * @returns 기사 수 (통계가 없으면 0)
   */
  private countOf(code: string): number {
    return this.stats.get(code)?.article_count ?? 0;
  }

  /**
   * 폴리곤의 채우기 색을 정한다. 선택 > 바다 > 기사 수 순서.
   * @param shape 폴리곤
   * @returns 색상 코드
   */
  private fillOf(shape: MapFeature): string {
    const isSelected = shape.id === this.selectedCode;
    if (shape.kind === "sea") return isSelected ? MAP_COLORS.seaSelected : MAP_COLORS.sea;
    if (isSelected) return MAP_COLORS.selected;
    return colorForCount(this.countOf(shape.id), this.legend);
  }

  /**
   * 마우스 이벤트(호버·클릭)를 연결한다. 바다와 육지가 같이 쓴다.
   * @param paths 이벤트를 붙일 path 들
   * @param hoverColor 마우스를 올렸을 때 색
   */
  private bindPointerEvents(
    paths: Selection<SVGPathElement, MapFeature, SVGGElement, unknown>,
    hoverColor: string,
  ): void {
    paths
      .on("mouseover", (event: MouseEvent, shape) => {
        if (shape.id !== this.selectedCode) select(event.currentTarget as SVGPathElement).attr("fill", hoverColor);
        this.emitHover(event, shape);
      })
      .on("mousemove", (event: MouseEvent, shape) => this.emitHover(event, shape))
      .on("mouseout", (event: MouseEvent, shape) => {
        select(event.currentTarget as SVGPathElement).attr("fill", this.fillOf(shape));
        this.callbacks.onHover(null);
      })
      .on("click", (_event: MouseEvent, shape) => this.callbacks.onSelect(shape));
  }

  /**
   * 툴팁에 쓸 호버 정보를 바깥으로 알린다.
   * @param event 마우스 이벤트
   * @param shape 마우스가 올라간 폴리곤
   */
  private emitHover(event: MouseEvent, shape: MapFeature): void {
    this.callbacks.onHover({
      code: shape.id,
      name: shape.properties.name,
      clientX: event.clientX,
      clientY: event.clientY,
    });
  }

  /** 바다·육지·섬·라벨을 모두 다시 그린다 */
  private drawAll(): void {
    if (this.destroyed) return;
    this.visibleFeatures =
      this.level === "sido"
        ? this.levelFeatures
        : this.levelFeatures.filter((shape) => this.isInView(shape)).slice(0, MAX_VISIBLE_FEATURES);

    this.drawSeas();
    this.drawLand();
    this.drawIslands();
    this.drawLabels();
  }

  /** 바다 폴리곤 (점선 테두리) */
  private drawSeas(): void {
    const paths = this.seaLayer
      .selectAll<SVGPathElement, MapFeature>("path")
      .data(SEA_FEATURES, (shape) => shape.id)
      .join((enter) => {
        const created = enter.append("path").attr("class", "cursor-pointer").attr("d", this.pathOf);
        this.bindPointerEvents(created, MAP_COLORS.seaHover);
        return created;
      });

    paths
      .attr("fill", (shape) => this.fillOf(shape))
      .attr("vector-effect", "non-scaling-stroke")
      .attr("stroke-width", 1.2)
      .attr("stroke", (shape) => (shape.id === this.selectedCode ? MAP_COLORS.selectedStroke : MAP_COLORS.seaStroke))
      .attr("stroke-dasharray", (shape) => (shape.id === this.selectedCode ? null : "4 5"));
  }

  /** 육지(행정구역) 폴리곤 */
  private drawLand(): void {
    const paths = this.landLayer
      .selectAll<SVGPathElement, MapFeature>("path")
      .data(this.visibleFeatures, (shape) => shape.id)
      .join((enter) => {
        const created = enter.append("path").attr("class", "cursor-pointer").attr("d", this.pathOf);
        this.bindPointerEvents(created, MAP_COLORS.landHover);
        return created;
      });

    paths
      .attr("fill", (shape) => this.fillOf(shape))
      .attr("vector-effect", "non-scaling-stroke")
      .attr("stroke", (shape) => (shape.id === this.selectedCode ? MAP_COLORS.selectedStroke : MAP_COLORS.landStroke))
      .attr("stroke-width", (shape) =>
        shape.id === this.selectedCode ? SELECTED_LINE_WIDTH[this.level] : LINE_WIDTH[this.level],
      );

    // 선택한 폴리곤의 굵은 테두리가 이웃에 가려지지 않도록 맨 위로 올린다
    paths.filter((shape) => shape.id === this.selectedCode).raise();
  }

  /** 섬 동그라미와 이름. 줌을 당겨도 화면에서 같은 크기로 보이게 1/배율 로 줄인다 */
  private drawIslands(): void {
    const groups = this.islandLayer
      .selectAll<SVGGElement, IslandMarker>("g")
      .data(ISLAND_MARKERS, (island) => island.code)
      .join((enter) => {
        const group = enter
          .append("g")
          .attr("class", "cursor-pointer")
          .on("click", (_event: MouseEvent, island) => this.callbacks.onSelect(island));
        group.append("circle");
        group
          .append("text")
          .attr("text-anchor", "middle")
          .attr("font-size", 10.5)
          .attr("font-weight", 600)
          .attr("paint-order", "stroke")
          .attr("stroke", MAP_COLORS.background)
          .attr("stroke-width", 2.5)
          .attr("fill", MAP_COLORS.ink);
        return group;
      });

    groups.attr("transform", (island) => {
      const [x, y] = this.projection(island.center) ?? [0, 0];
      return `translate(${x},${y}) scale(${1 / this.zoomScale})`;
    });
    groups
      .select("circle")
      .attr("r", (island) => island.radius)
      .attr("stroke", MAP_COLORS.landStroke)
      .attr("stroke-width", 1.8)
      .attr("fill", (island) =>
        island.code === this.selectedCode ? MAP_COLORS.selected : colorForCount(this.countOf(island.code), this.legend),
      );
    groups
      .select("text")
      .attr("y", (island) => island.radius + 13)
      .text((island) => `${island.name} · ${this.countOf(island.code)}`);
  }

  /**
   * 지역 이름 라벨을 겹치지 않게 놓는다.
   * 1) 후보마다 우선순위를 매기고 (선택 > 바다 > 광역·특별시 > 넓은 지역)
   * 2) 우선순위가 높은 것부터 자리를 잡되, 이미 놓인 라벨과 겹치면 위아래로 조금씩 옮겨 본다
   * 3) 끝내 자리가 없으면 그 라벨은 생략한다
   */
  private drawLabels(): void {
    const transform = zoomTransform(this.svg.node()!);

    // 1) 후보 만들기
    const candidates: LabelCandidate[] = [...this.visibleFeatures, ...SEA_FEATURES].map((shape) => {
      const [projectedX, projectedY] = this.projection(shape.center) ?? [0, 0];
      const text = shape.properties.name;
      const isSelected = shape.id === this.selectedCode;
      let priority = geoArea(shape) * 1e5;
      if (/광역시|특별시/.test(text)) priority = 8e5;
      if (shape.kind === "sea") priority = 1e6;
      if (isSelected) priority = 1e9;
      return {
        key: shape.id,
        text,
        center: shape.center,
        isSea: shape.kind === "sea",
        isSelected,
        x: transform.applyX(projectedX),
        y: transform.applyY(projectedY),
        width: text.length * 11 + 6,
        height: 15,
        priority,
        offsetY: 0,
      };
    });
    candidates.sort((a, b) => b.priority - a.priority);

    // 2) 자리 잡기
    const placed: LabelCandidate[] = [];
    const tryOffsets = [0, -15, 15, -28, 28, -40, 40];
    for (const candidate of candidates.slice(0, 260)) {
      const isOffScreen =
        candidate.x < -40 || candidate.y < -20 || candidate.x > this.width + 40 || candidate.y > this.height + 20;
      if (isOffScreen) continue;

      for (const offsetY of tryOffsets) {
        const overlaps = placed.some(
          (other) =>
            Math.abs(other.x - candidate.x) < (other.width + candidate.width) / 2 &&
            Math.abs(other.y + other.offsetY - (candidate.y + offsetY)) < candidate.height,
        );
        if (!overlaps) {
          candidate.offsetY = offsetY;
          placed.push(candidate);
          break;
        }
      }
    }

    // 3) 그리기 (라벨은 1/배율 로 줄여서 줌과 관계없이 같은 글자 크기로 보이게 한다)
    const labels = this.labelLayer
      .selectAll<SVGTextElement, LabelCandidate>("text")
      .data(placed, (label) => label.key)
      .join((enter) =>
        enter
          .append("text")
          .attr("text-anchor", "middle")
          .attr("paint-order", "stroke")
          .attr("font-size", 12.5)
          .attr("font-weight", 700)
          .style("pointer-events", "none"),
      );

    labels
      .attr("transform", (label) => {
        const [x, y] = this.projection(label.center) ?? [0, 0];
        return `translate(${x},${y}) scale(${1 / this.zoomScale}) translate(0,${label.offsetY})`;
      })
      .attr("stroke", MAP_COLORS.background)
      .attr("stroke-width", (label) => (label.isSelected && !label.isSea ? 0 : 2.6))
      .attr("fill", (label) => {
        if (label.isSelected) return label.isSea ? MAP_COLORS.selectedStroke : MAP_COLORS.background;
        return label.isSea ? "#56633f" : MAP_COLORS.ink;
      })
      .text((label) => label.text);
  }
}
