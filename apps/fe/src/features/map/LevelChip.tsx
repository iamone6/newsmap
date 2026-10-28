import { LEVEL_LABELS, LEVEL_ORDER } from "./geo";
import type { MapLevel } from "./types";

/**
 * 지금 지도가 어떤 단계(시도/시군구/읍면동)를 보여 주는지 알려 주는 칩.
 * 점 3개 중 현재 단계까지 색이 칠해진다.
 * @param props.level 현재 단계
 * @returns 단계 칩
 */
export function LevelChip({ level }: { level: MapLevel }) {
  const currentIndex = LEVEL_ORDER.indexOf(level);

  return (
    <div className="absolute bottom-14 left-[313px] z-[700] flex items-center gap-2 rounded-full bg-bg/92 px-2.5 py-1.5 text-[11.5px] shadow-sm max-md:bottom-3 max-md:left-3">
      <span className="flex gap-1">
        {LEVEL_ORDER.map((step, index) => (
          <span
            key={step}
            className={`size-[7px] rounded-full ${index <= currentIndex ? "bg-accent" : "bg-neutral-300"}`}
          />
        ))}
      </span>
      <span>{LEVEL_LABELS[level]}</span>
    </div>
  );
}
