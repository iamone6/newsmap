import type { LatestPost } from "@/lib/api/types";
import { formatDate } from "@/lib/format";

/**
 * 화면 맨 아래에서 옆으로 흘러가는 "방금 등록" 최신 기사 띠. (모바일에서는 숨긴다)
 * 목록을 두 번 이어 붙이고 절반만큼 이동하는 애니메이션을 반복해서 끊김 없이 흐르게 한다.
 * 마우스를 올리면 멈추고, 항목을 누르면 그 기사의 지역을 지도에서 선택한다.
 * @param props.posts 최신 기사 목록
 * @param props.onSelectRegion 항목을 눌렀을 때 (지역 코드)
 * @returns 티커
 */
export function LatestTicker({ posts, onSelectRegion }: { posts: LatestPost[]; onSelectRegion: (code: string) => void }) {
  const loopedPosts = [...posts, ...posts];

  return (
    <div className="group absolute inset-x-0 bottom-0 z-[690] flex h-11 items-center gap-3 overflow-hidden bg-bg/94 pl-[318px] shadow-[0_-1px_0_color-mix(in_srgb,var(--color-ink)_8%,transparent)] backdrop-blur-md max-md:hidden">
      <span className="flex-none rounded-full bg-accent px-3 py-1.5 text-[10px] tracking-[.1em] text-bg uppercase">
        방금 등록
      </span>
      <div className="flex-1 overflow-hidden">
        <div className="flex animate-ticker gap-6 whitespace-nowrap group-hover:[animation-play-state:paused]">
          {loopedPosts.map((post, index) => (
            <button
              key={`${post.id}-${index}`}
              type="button"
              className="flex cursor-pointer items-center gap-2 text-xs"
              onClick={() => onSelectRegion(post.region.code)}
            >
              <b className="font-bold">{post.region.name}</b>
              {post.title}
              <span className="text-[11px] text-ink/50">{formatDate(post.published_at)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
