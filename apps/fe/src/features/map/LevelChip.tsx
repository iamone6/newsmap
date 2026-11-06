import { LEVEL_LABELS, LEVEL_ORDER } from "./geo";
import type { MapLevel, MapZoom } from "./types";

interface LevelChipProps {
  /** 현재 단계 (시도/시군구/읍면동) */
  level: MapLevel;
  /** 현재 확대 정도. 지도가 아직 준비되지 않았으면 null */
  zoom: MapZoom | null;
  /** [ + ] 버튼: 한 단계 확대 */
  onZoomIn: () => void;
  /** [ - ] 버튼: 한 단계 축소 */
  onZoomOut: () => void;
  /** [전국] 버튼: 선택을 풀고 전국 보기로 */
  onReset: () => void;
}

/** 칩 안에 들어가는 작은 원형 확대·축소 버튼 스타일 */
const STEP_BUTTON_CLASSES =
  "inline-flex size-6 cursor-pointer items-center justify-center rounded-full bg-neutral-100 text-[13px] leading-none text-ink hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40 max-md:hidden";

/**
 * 지금 지도가 어떤 단계(시도/시군구/읍면동)를 보여 주는지와 확대 정도를 알려 주는 칩.
 * - 점 3개 중 현재 단계까지 색이 칠해진다.
 * - 오른쪽의 [ - ] 숫자 [ + ] 로 확대 정도를 보고 바꾸고, [전국] 으로 전국 보기로 돌아간다.
 *   숫자는 1 이 전국이고 확대할수록 커진다.
 *   모바일에서는 손가락으로 확대하므로 버튼은 숨기고 숫자만 보여 준다(예전 아래쪽 가운데 줌 버튼과 같은 규칙).
 * @param props LevelChipProps 참고
 * @returns 단계 칩
 */
export function LevelChip({ level, zoom, onZoomIn, onZoomOut, onReset }: LevelChipProps) {
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

      {zoom && (
        <span className="ml-1 flex items-center gap-1.5 border-l border-neutral-300 pl-2.5">
          <button
            type="button"
            aria-label="축소"
            className={STEP_BUTTON_CLASSES}
            disabled={zoom.value <= zoom.min}
            onClick={onZoomOut}
          >
            －
          </button>
          <span className="min-w-[2.2em] text-center font-semibold tabular-nums" aria-label={`확대 ${zoom.value} / ${zoom.max}`}>
            {zoom.value}
          </span>
          <button
            type="button"
            aria-label="확대"
            className={STEP_BUTTON_CLASSES}
            disabled={zoom.value >= zoom.max}
            onClick={onZoomIn}
          >
            ＋
          </button>
          <button
            type="button"
            className="ml-1 cursor-pointer rounded-full px-2 py-0.5 font-heading text-[12px] text-ink hover:bg-neutral-100 max-md:hidden"
            onClick={onReset}
          >
            전국
          </button>
        </span>
      )}
    </div>
  );
}
