"use client";

import { useEffect, useEffectEvent, useImperativeHandle, useRef, useState } from "react";
import { findRegion, toRegionRef } from "../geo";
import { MapLoadingBadge } from "../MapLoadingBadge";
import type { IslandMarker, MapEngineProps, MapFeature } from "../types";
import { SvgMapRenderer } from "./SvgMapRenderer";

/** 창 폭이 이만큼 이상 바뀌면 지도를 새로 만든다 (모바일 주소창 높이 변화는 무시) */
const RESIZE_THRESHOLD_PX = 40;

/**
 * SVG(d3) 지도 엔진 컴포넌트.
 * 실제 그리기는 SvgMapRenderer 클래스가 하고, 이 컴포넌트는 React 값과 렌더러를 이어 준다.
 * @param props MapEngineProps 참고
 * @returns 지도를 담는 div
 */
export function SvgMapEngine({ statsByCode, legend, selectedCode, onSelect, onLevelChange, onHover, ref }: MapEngineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<SvgMapRenderer | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  /** 값이 바뀌면 지도를 새로 만든다 (창 크기 변경 시) */
  const [rebuildKey, setRebuildKey] = useState(0);

  /**
   * 지역을 선택하고 그쪽으로 이동한다. 지도 클릭과 selectByCode 가 같이 쓴다.
   * @param region 선택한 폴리곤 또는 섬
   */
  const selectRegion = (region: MapFeature | IslandMarker) => {
    rendererRef.current?.focusOn(region);
    onSelect(toRegionRef(region));
  };

  // useEffectEvent: 렌더러(effect 안에서 만든 객체)가 불러도 항상 최신 props 를 보게 해 주는 React 19 훅
  const handleMapSelect = useEffectEvent(selectRegion);
  const notifyLevelChange = useEffectEvent(onLevelChange);
  const notifyHover = useEffectEvent(onHover);
  const applyCurrentState = useEffectEvent((renderer: SvgMapRenderer) => {
    renderer.setStats(statsByCode, legend);
    renderer.setSelected(selectedCode);
  });

  // 1) 렌더러 만들기 (처음 한 번 + 창 크기가 크게 바뀔 때)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new SvgMapRenderer(container, {
      onSelect: (region) => handleMapSelect(region),
      onLevelChange: (level) => notifyLevelChange(level),
      onHover: (hover) => notifyHover(hover),
      onLoadingChange: setIsLoading,
    });
    rendererRef.current = renderer;
    applyCurrentState(renderer);
    notifyLevelChange("sido");
    renderer.start().catch((error) => console.error("SVG 지도를 그리지 못했습니다", error));

    return () => {
      renderer.destroy();
      rendererRef.current = null;
    };
  }, [rebuildKey]);

  // 2) 창 폭이 크게 바뀌면 다시 만들기
  useEffect(() => {
    let lastWidth = window.innerWidth;
    const handleResize = () => {
      if (Math.abs(window.innerWidth - lastWidth) < RESIZE_THRESHOLD_PX) return;
      lastWidth = window.innerWidth;
      setRebuildKey((key) => key + 1);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // 3) 통계·선택이 바뀌면 렌더러에 알려 주기
  useEffect(() => {
    rendererRef.current?.setStats(statsByCode, legend);
  }, [statsByCode, legend]);

  useEffect(() => {
    rendererRef.current?.setSelected(selectedCode);
  }, [selectedCode]);

  // 4) 바깥(줌 버튼·티커·브레드크럼)에서 쓸 조작 함수 열어 주기
  useImperativeHandle(ref, () => ({
    zoomIn: () => rendererRef.current?.zoomIn(),
    zoomOut: () => rendererRef.current?.zoomOut(),
    resetView: () => rendererRef.current?.resetView(),
    selectByCode: async (code) => {
      const region = await findRegion(code);
      if (region) selectRegion(region);
    },
  }));

  return (
    <div className="absolute inset-0 bg-[#dbe6ec]">
      {/* d3 가 이 div 안에 <svg> 를 직접 넣으므로 React 자식은 형제 요소로 둔다 */}
      <div ref={containerRef} className="absolute inset-0" />
      {isLoading && <MapLoadingBadge />}
    </div>
  );
}
