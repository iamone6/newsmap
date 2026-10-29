"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { COUNT_RAMP } from "@/features/map/colors";
import type { StatsSummary } from "@/lib/api/types";
import { formatNumber } from "@/lib/format";

/**
 * 화면 왼쪽의 요약 레일.
 * 브랜드, 로그인 상태(지금은 Guest 고정), 설정 팝업, 전국 현황 숫자, 지도 색 범례를 보여 준다.
 * 모바일에서는 전국 총계와 범례를 숨긴다.
 * @param props.summary 전국 현황 (불러오기 전에는 null)
 * @returns 레일
 */
export function SummaryRail({ summary }: { summary: StatsSummary | null }) {
  const show = (value: number | undefined) => (value === undefined ? "—" : formatNumber(value));

  return (
    <aside className="absolute top-3 bottom-16 left-3 z-[700] flex w-40 flex-col gap-2 overflow-auto rounded-[32px] bg-bg/93 p-4 shadow-md backdrop-blur-[10px] max-md:bottom-auto max-md:z-[800] max-md:max-w-[66vw] max-md:overflow-visible max-md:px-2.5 max-md:py-2.5">
      <header className="flex flex-col items-start gap-2 pb-2 shadow-[0_1px_0_color-mix(in_srgb,var(--color-ink)_10%,transparent)] max-md:pb-0 max-md:shadow-none">
        <div className="font-heading text-2xl max-md:text-[19px]">
          News<span className="text-accent">Map</span>
        </div>
        <div className="relative flex w-full items-center justify-between gap-2">
          <div className="text-xs text-ink/60">
            signed in as <b className="font-bold text-ink">Guest</b>
          </div>
          <SettingsMenu />
        </div>
      </header>

      <div className="flex flex-col gap-1.5 max-md:hidden">
        <div className="text-[10px] tracking-[.1em] text-accent-700 uppercase">전국 현황</div>
        <div className="flex items-baseline gap-2">
          <span className="text-[22px] leading-none font-bold">{show(summary?.total_articles)}</span>
          <span className="text-[10px] text-ink/55">건</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <StatBox value={show(summary?.today_articles)} label="오늘 등록" />
        <StatBox value={show(summary?.active_regions)} label="활성 지역" />
      </div>

      <div className="flex flex-col gap-1.5 max-md:hidden">
        <h5 className="m-0 mb-2 text-xs">지역 색 = 기사 수</h5>
        <div className="flex gap-0.5">
          {COUNT_RAMP.map((color) => (
            <span key={color} className="h-2 flex-1 rounded-full" style={{ background: color }} />
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[9px] text-ink/55">
          <span>적음</span>
          <span>많음</span>
        </div>
      </div>
    </aside>
  );
}

/**
 * 숫자 하나와 설명을 담은 작은 상자.
 * @param props.value 표시할 숫자 문자열
 * @param props.label 설명
 * @returns 상자
 */
function StatBox({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex-1 rounded-[16px] bg-surface px-2 py-1.5">
      <div className="text-base leading-none font-bold">{value}</div>
      <div className="mt-px text-[9px] text-ink/55">{label}</div>
    </div>
  );
}

/**
 * 톱니바퀴 버튼과 설정 팝업. 로그인·관심 지역은 아직 화면만 있다.
 * 팝업 바깥을 누르면 닫힌다.
 * @returns 버튼과 팝업
 */
function SettingsMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("click", closeOnOutsideClick);
    return () => document.removeEventListener("click", closeOnOutsideClick);
  }, [isOpen]);

  const itemClass =
    "flex cursor-pointer justify-between gap-2.5 rounded-full px-3 py-2 text-left text-[13px] hover:bg-accent/12";

  return (
    <div ref={menuRef}>
      <Button iconOnly aria-label="설정" title="설정" onClick={() => setIsOpen(!isOpen)}>
        <GearIcon />
      </Button>
      {isOpen && (
        <div className="absolute top-full left-0 z-20 mt-1.5 flex w-[210px] flex-col rounded-[16px] bg-bg p-1.5 shadow-lg">
          <button type="button" className={itemClass}>
            로그인 <span className="text-[11px] text-ink/50">Guest</span>
          </button>
          <button type="button" className={itemClass}>
            내 관심 지역 <span className="text-[11px] text-ink/50">준비 중</span>
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * 설정 톱니바퀴 아이콘.
 * @returns svg 아이콘
 */
function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
