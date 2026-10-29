import type { LatestArticle } from "@/lib/api/types";
import { formatDate } from "@/lib/format";

/**
 * 화면 맨 아래에서 옆으로 흘러가는 "방금 등록" 최신 기사 띠. (모바일에서는 숨긴다)
 * 목록을 두 번 이어 붙이고 절반만큼 이동하는 애니메이션을 반복해서 끊김 없이 흐르게 한다.
 * 마우스를 올리면 멈추고, 항목을 누르면 그 기사의 지역을 지도에서 선택한다.
 * 대표 지역이 없는 기사(region 이 null)는 지역 대신 원문을 새 창으로 연다.
 * @param props.articles 최신 기사 목록
 * @param props.onSelectRegion 항목을 눌렀을 때 (지역 코드)
 * @returns 티커
 */
export function LatestTicker({
  articles,
  onSelectRegion,
}: {
  articles: LatestArticle[];
  onSelectRegion: (code: string) => void;
}) {
  const loopedArticles = [...articles, ...articles];

  return (
    <div className="group absolute inset-x-0 bottom-0 z-[690] flex h-11 items-center gap-3 overflow-hidden bg-bg/94 pl-[318px] shadow-[0_-1px_0_color-mix(in_srgb,var(--color-ink)_8%,transparent)] backdrop-blur-md max-md:hidden">
      <span className="flex-none rounded-full bg-accent px-3 py-1.5 text-[10px] tracking-[.1em] text-bg uppercase">
        방금 등록
      </span>
      <div className="flex-1 overflow-hidden">
        <div className="flex animate-ticker gap-6 whitespace-nowrap group-hover:[animation-play-state:paused]">
          {loopedArticles.map((article, index) => {
            const key = `${article.id}-${index}`;
            const content = (
              <>
                {article.region && <b className="font-bold">{article.region.name}</b>}
                {article.title}
                <span className="text-[11px] text-ink/50">{formatDate(article.published_at)}</span>
              </>
            );
            const itemClass = "flex cursor-pointer items-center gap-2 text-xs";

            // 지역이 있으면 지도에서 그 지역을 고르고, 없으면 원문 링크로 둔다
            const region = article.region;
            return region ? (
              <button key={key} type="button" className={itemClass} onClick={() => onSelectRegion(region.code)}>
                {content}
              </button>
            ) : (
              <a key={key} href={article.source_url} target="_blank" rel="noopener noreferrer" className={itemClass}>
                {content}
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
