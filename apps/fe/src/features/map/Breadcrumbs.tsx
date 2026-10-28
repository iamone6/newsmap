import { Fragment } from "react";

/** 브레드크럼 한 칸. code 가 있으면 눌러서 그 지역으로 이동할 수 있다 */
export interface Crumb {
  label: string;
  code: string | null;
}

/**
 * 지도 위쪽의 "서울특별시 › 강남구 › 역삼1동" 경로 표시.
 * 마지막 칸(지금 선택한 지역)은 강조하고, 앞쪽 상위 지역은 누르면 그 지역을 선택한다.
 * @param props.items 경로 (위 → 아래 순서). 비어 있으면 숨긴다
 * @param props.onSelectCode 상위 지역을 눌렀을 때
 * @returns 브레드크럼
 */
export function Breadcrumbs({ items, onSelectCode }: { items: Crumb[]; onSelectCode: (code: string) => void }) {
  if (items.length === 0) return null;

  return (
    <nav className="absolute top-3 left-[313px] z-[700] flex max-w-[52%] flex-wrap items-center gap-1.5 rounded-full bg-bg/92 px-2.5 py-2 shadow-sm backdrop-blur-md max-md:top-[78px] max-md:left-2.5 max-md:max-w-[70%]">
      {items.map((item, index) => {
        const isCurrent = index === items.length - 1;
        const canClick = !isCurrent && item.code !== null;
        return (
          <Fragment key={`${item.label}-${index}`}>
            {index > 0 && <span className="text-[11px] opacity-40">›</span>}
            <button
              type="button"
              disabled={!canClick}
              onClick={() => item.code && onSelectCode(item.code)}
              className={`rounded-full px-3 py-1 text-[12.5px] ${
                isCurrent ? "bg-accent text-bg" : canClick ? "cursor-pointer hover:bg-ink/8" : "cursor-default"
              }`}
            >
              {item.label}
            </button>
          </Fragment>
        );
      })}
    </nav>
  );
}
