"use client";

import { useEffect, useRef, useState } from "react";
import { Breadcrumbs, type Crumb } from "@/features/map/Breadcrumbs";
import { regionPathOf } from "@/features/map/geo";
import { LevelChip } from "@/features/map/LevelChip";
import { MapStage } from "@/features/map/MapStage";
import { MapTooltip } from "@/features/map/MapTooltip";
import type { MapEngineHandle, MapHover, MapLevel } from "@/features/map/types";
import { ZoomControls } from "@/features/map/ZoomControls";
import { RegionPostsPanel } from "@/features/posts/RegionPostsPanel";
import { LatestTicker } from "@/features/stats/LatestTicker";
import { SummaryRail } from "@/features/stats/SummaryRail";
import { useRegionStats, useSummaryStats } from "@/features/stats/useStats";
import type { RegionRef } from "@/lib/api/types";

/**
 * 행정구역(시도·시군구·읍면동)인지 확인한다.
 * @param region 확인할 지역
 * @returns 행정구역이면 true, 바다·섬이면 false
 */
function isAdminRegion(region: RegionRef): boolean {
  return region.level === "sido" || region.level === "sigungu" || region.level === "emd";
}

/**
 * NewsMap 화면 전체를 조립하는 최상위 컴포넌트.
 *
 * 여러 부분이 함께 쓰는 상태를 여기서 관리하고 props 로 내려 준다.
 *   - level: 지금 지도 단계 (지도 → 여기 → 레벨 칩·통계)
 *   - selectedRegion: 선택한 지역 (지도·티커·브레드크럼 → 여기 → 지도 강조·목록 패널)
 *   - hover: 마우스가 올라간 지역 (지도 → 여기 → 툴팁)
 * 지도를 직접 움직여야 할 때(줌 버튼, 티커 클릭)는 mapRef 로 지도 엔진의 함수를 부른다.
 * @returns 화면 전체
 */
export function NewsMapApp() {
  const mapRef = useRef<MapEngineHandle>(null);
  const [level, setLevel] = useState<MapLevel>("sido");
  const [selectedRegion, setSelectedRegion] = useState<RegionRef | null>(null);
  const [hover, setHover] = useState<MapHover | null>(null);
  /** 선택한 지역의 경로. 어떤 지역의 경로인지 code 와 함께 보관한다 */
  const [regionPath, setRegionPath] = useState<{ code: string; items: Crumb[] } | null>(null);

  const { summary, latestPosts } = useSummaryStats();
  const { statsByCode, legend } = useRegionStats(level);

  // 지역이 선택되면 상위 지역 이름을 찾아 경로를 만든다 (경계 파일을 읽어야 해서 비동기)
  useEffect(() => {
    if (!selectedRegion) return;
    let isStale = false;
    regionPathOf(selectedRegion).then((items) => {
      if (!isStale) setRegionPath({ code: selectedRegion.code, items });
    });
    return () => {
      isStale = true;
    };
  }, [selectedRegion]);

  const crumbs = selectedRegion && regionPath?.code === selectedRegion.code ? regionPath.items : [];
  const parentNames = crumbs.slice(0, -1).map((crumb) => crumb.label);

  /**
   * 지도 단계가 바뀌었을 때.
   * 다른 단계의 행정구역이 선택되어 있었다면 선택을 푼다 (그 폴리곤이 더는 지도에 없으므로).
   * @param nextLevel 새 단계
   */
  const handleLevelChange = (nextLevel: MapLevel) => {
    setLevel(nextLevel);
    setSelectedRegion((current) =>
      current && isAdminRegion(current) && current.level !== nextLevel ? null : current,
    );
  };

  /**
   * 코드로 지역을 선택한다 (티커·브레드크럼에서). 지도 엔진이 이동시킨 뒤 onSelect 로 알려 준다.
   * @param code 지역 코드
   */
  const selectByCode = (code: string) => {
    void mapRef.current?.selectByCode(code);
  };

  /** "전국" 버튼: 선택을 풀고 전국 보기로 */
  const resetToNation = () => {
    setSelectedRegion(null);
    mapRef.current?.resetView();
  };

  return (
    <div className="relative h-full w-full overflow-hidden">
      <MapStage
        ref={mapRef}
        statsByCode={statsByCode}
        legend={legend}
        selectedCode={selectedRegion?.code ?? null}
        onSelect={setSelectedRegion}
        onLevelChange={handleLevelChange}
        onHover={setHover}
      />

      <Breadcrumbs items={crumbs} onSelectCode={selectByCode} />
      <LevelChip level={level} />
      <ZoomControls
        onZoomIn={() => mapRef.current?.zoomIn()}
        onZoomOut={() => mapRef.current?.zoomOut()}
        onReset={resetToNation}
      />

      <SummaryRail summary={summary} />
      <LatestTicker posts={latestPosts} onSelectRegion={selectByCode} />
      <MapTooltip hover={hover} stat={hover ? statsByCode.get(hover.code) : undefined} />

      <RegionPostsPanel region={selectedRegion} parentNames={parentNames} onClose={() => setSelectedRegion(null)} />
    </div>
  );
}
