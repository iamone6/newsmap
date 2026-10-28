"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { config } from "@/lib/config";
import { KakaoMapEngine } from "./kakao/KakaoMapEngine";
import { type KakaoMapsApi, loadKakaoSdk } from "./kakao/loadKakaoSdk";
import { SvgMapEngine } from "./svg/SvgMapEngine";
import type { MapEngineProps } from "./types";

/**
 * 카카오 SDK 상태
 * - disabled: .env 에 키가 없음 → SVG 만 쓴다
 * - loading: SDK 불러오는 중
 * - ready: 카카오맵 사용 가능
 * - failed: 키 오류·도메인 미등록 등으로 실패 → SVG 로 대체
 */
type KakaoStatus =
  | { state: "disabled" }
  | { state: "loading" }
  | { state: "ready"; maps: KakaoMapsApi }
  | { state: "failed"; message: string };

/**
 * 지도 엔진을 골라서 보여 주는 컴포넌트.
 * 카카오 키가 있으면 카카오맵이 기본이고, 없거나 실패하면 SVG(d3) 지도를 쓴다.
 * 오른쪽 아래에 지금 엔진 상태와 엔진 전환 버튼을 띄운다.
 * @param props 지도 엔진에 그대로 넘길 props
 * @returns 지도 영역
 */
export function MapStage(props: MapEngineProps) {
  const hasKakaoKey = config.kakaoJsKey !== "";
  const [kakaoStatus, setKakaoStatus] = useState<KakaoStatus>(
    hasKakaoKey ? { state: "loading" } : { state: "disabled" },
  );
  /** 사용자가 SVG 지도로 바꿔 보고 싶을 때 false */
  const [preferKakao, setPreferKakao] = useState(true);

  // 키가 있으면 페이지가 열릴 때 SDK 를 한 번 불러온다
  useEffect(() => {
    if (!hasKakaoKey) return;
    loadKakaoSdk(config.kakaoJsKey)
      .then((maps) => setKakaoStatus({ state: "ready", maps }))
      .catch((error: Error) => {
        console.warn(error);
        setKakaoStatus({ state: "failed", message: error.message });
      });
  }, [hasKakaoKey]);

  const showKakao = kakaoStatus.state === "ready" && preferKakao;

  return (
    <>
      <div className="absolute inset-0 bg-[#dbe6ec]">
        {kakaoStatus.state === "loading" ? null : showKakao ? (
          <KakaoMapEngine maps={kakaoStatus.maps} {...props} />
        ) : (
          <SvgMapEngine {...props} />
        )}
      </div>

      <div className="absolute right-3 bottom-14 z-[700] flex flex-col items-end gap-1.5 max-md:hidden">
        <span className="rounded-full bg-bg/92 px-3 py-1.5 text-[11px] text-ink/65 shadow-sm">
          {engineNote(kakaoStatus, showKakao)}
        </span>
        {kakaoStatus.state === "ready" && (
          <Button className="bg-bg/92" onClick={() => setPreferKakao(!preferKakao)}>
            {showKakao ? "폴리곤 모드로 보기" : "카카오맵으로 보기"}
          </Button>
        )}
      </div>
    </>
  );
}

/**
 * 오른쪽 아래 안내 문구를 만든다.
 * @param status 카카오 SDK 상태
 * @param showKakao 지금 카카오맵을 보여 주는지
 * @returns 안내 문구
 */
function engineNote(status: KakaoStatus, showKakao: boolean): string {
  switch (status.state) {
    case "disabled":
      return "폴리곤 모드 (카카오 키 없음)";
    case "loading":
      return "카카오맵 불러오는 중…";
    case "failed":
      return `카카오맵 실패: ${status.message}`;
    case "ready":
      return showKakao ? "카카오맵 타일 + 폴리곤" : "폴리곤 모드";
  }
}
