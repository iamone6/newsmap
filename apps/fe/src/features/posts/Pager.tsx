/** 한 번에 보여 줄 페이지 번호 버튼 수 */
const VISIBLE_PAGE_COUNT = 5;

interface PagerProps {
  currentPage: number;
  lastPage: number;
  onChange: (page: number) => void;
}

/**
 * 보여 줄 페이지 번호 목록을 만든다. 현재 페이지가 가운데 오도록 최대 5개.
 * @param currentPage 현재 페이지
 * @param lastPage 마지막 페이지
 * @returns 예) [3, 4, 5, 6, 7]
 */
function visiblePages(currentPage: number, lastPage: number): number[] {
  const half = Math.floor(VISIBLE_PAGE_COUNT / 2);
  const start = Math.max(1, Math.min(currentPage - half, lastPage - VISIBLE_PAGE_COUNT + 1));
  const end = Math.min(lastPage, start + VISIBLE_PAGE_COUNT - 1);
  const pages: number[] = [];
  for (let page = start; page <= end; page++) pages.push(page);
  return pages;
}

/**
 * 목록 아래의 ← 1 2 3 → 페이지 이동 버튼.
 * @param props 현재/마지막 페이지와 바꿀 때 부를 함수
 * @returns 페이지 버튼 묶음
 */
export function Pager({ currentPage, lastPage, onChange }: PagerProps) {
  const buttonClass =
    "flex h-7 min-w-7 cursor-pointer items-center justify-center rounded-full text-xs hover:bg-ink/8 disabled:cursor-not-allowed disabled:opacity-30";

  return (
    <div className="flex items-center justify-center gap-1.5 p-3">
      <button type="button" className={buttonClass} disabled={currentPage <= 1} onClick={() => onChange(currentPage - 1)}>
        ←
      </button>
      {visiblePages(currentPage, lastPage).map((page) => (
        <button
          key={page}
          type="button"
          className={`${buttonClass} ${page === currentPage ? "bg-ink text-bg hover:bg-ink" : ""}`}
          onClick={() => onChange(page)}
        >
          {page}
        </button>
      ))}
      <button
        type="button"
        className={buttonClass}
        disabled={currentPage >= lastPage}
        onClick={() => onChange(currentPage + 1)}
      >
        →
      </button>
    </div>
  );
}
