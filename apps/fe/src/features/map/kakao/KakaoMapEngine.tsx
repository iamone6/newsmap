"use client";

import { useEffect, useEffectEvent, useImperativeHandle, useRef, useState } from "react";
import { findRegion, toRegionRef } from "../geo";
import { MapLoadingBadge } from "../MapLoadingBadge";
import type { IslandMarker, MapEngineProps, MapFeature } from "../types";
import { KakaoMapRenderer } from "./KakaoMapRenderer";
import type { KakaoMapsApi } from "./loadKakaoSdk";

interface KakaoMapEngineProps extends MapEngineProps {
  /** loadKakaoSdk 로 불러온 kakao.maps */
  maps: KakaoMapsApi;
}

/**
 * 카카오맵 엔진 컴포넌트.
 * 실제 그리기는 KakaoMapRenderer 클래스가 하고, 이 컴포넌트는 React 값과 렌더러를 이어 준다.
 * (카카오맵은 마우스 툴팁을 띄우지 않으므로 onHover 는 쓰지 않는다)
 * @param props KakaoMapEngineProps 참고
 * @returns 지도를 담는 div
 */
export function KakaoMapEngine({ maps, statsByCode, selectedCode, onSelect, onLevelChange, ref }: KakaoMapEngineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<KakaoMapRenderer | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  /**
   * 지역을 선택하고 그쪽으로 이동한다. 지도 클릭과 selectByCode 가 같이 쓴다.
   * @param region 선택한 폴리곤 또는 섬
   */
  const selectRegion = (region: MapFeature | IslandMarker) => {
    rendererRef.current?.focusOn(region);
    onSelect(toRegionRef(region));
  };

  // useEffectEvent: 렌더러가 불러도 항상 최신 props 를 보게 해 주는 React 19 훅
  const handleMapSelect = useEffectEvent(selectRegion);
  const notifyLevelChange = useEffectEvent(onLevelChange);
  const applyCurrentState = useEffectEvent((renderer: KakaoMapRenderer) => {
    renderer.setStats(statsByCode);
    renderer.setSelected(selectedCode);
  });

  // 1) 렌더러 만들기 (카카오맵은 창 크기 변화를 스스로 처리한다)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new KakaoMapRenderer(
      container,
      {
        onSelect: (region) => handleMapSelect(region),
        onLevelChange: (level) => notifyLevelChange(level),
        onLoadingChange: setIsLoading,
      },
      maps,
    );
    rendererRef.current = renderer;
    notifyLevelChange("sido");
    renderer
      .start()
      .then(() => applyCurrentState(renderer))
      .catch((error) => console.error("카카오맵을 그리지 못했습니다", error));

    return () => {
      renderer.destroy();
      rendererRef.current = null;
    };
  }, [maps]);

  // 2) 통계·선택이 바뀌면 렌더러에 알려 주기
  useEffect(() => {
    rendererRef.current?.setStats(statsByCode);
  }, [statsByCode]);

  useEffect(() => {
    rendererRef.current?.setSelected(selectedCode);
  }, [selectedCode]);

  // 3) 바깥에서 쓸 조작 함수 열어 주기
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
    <div className="absolute inset-0">
      {/* 카카오 SDK 가 이 div 안을 직접 채우므로 React 자식은 형제 요소로 둔다 */}
      <div ref={containerRef} className="absolute inset-0" />
      {isLoading && <MapLoadingBadge />}
    </div>
  );
}
