import type { RegionStat } from "@/lib/api/types";
import type { MapHover } from "./types";

/** 툴팁의 대략적인 크기. 화면 밖으로 나가지 않게 위치를 잡을 때 쓴다 */
const TOOLTIP_WIDTH = 240;
const TOOLTIP_HEIGHT = 64;

/**
 * 지도 위 지역에 마우스를 올렸을 때 뜨는 작은 설명 상자.
 * 지역 이름, 기사 수, 가장 최근 기사 제목을 보여 준다.
 * @param props.hover 마우스가 올라간 지역과 좌표. null 이면 숨긴다
 * @param props.stat 그 지역의 통계 (없을 수 있음)
 * @returns 툴팁
 */
export function MapTooltip({ hover, stat }: { hover: MapHover | null; stat: RegionStat | undefined }) {
  if (!hover) return null;

  // 오른쪽 끝·위쪽 끝을 넘지 않도록 위치를 조정한다
  const left = Math.min(window.innerWidth - TOOLTIP_WIDTH - 12, hover.clientX + 14);
  const top = Math.max(8, hover.clientY - TOOLTIP_HEIGHT - 8);

  return (
    <div
      className="pointer-events-none fixed z-[770] max-w-[230px] rounded-[16px] bg-ink px-3 py-2.5 text-bg shadow-lg"
      style={{ left, top }}
    >
      <div className="flex items-center gap-2 text-[13px] font-bold">
        {hover.name}
        <em className="rounded-full bg-accent px-2 py-px text-[11px] not-italic">{stat?.post_count ?? 0}</em>
      </div>
      {stat?.latest_title && <div className="mt-1 text-[11px] opacity-75">최신 · {stat.latest_title}</div>}
    </div>
  );
}
