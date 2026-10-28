import { Tag } from "@/components/ui/Tag";
import type { PostListItem, Thumbnail } from "@/lib/api/types";
import { formatDate } from "@/lib/format";

/** 썸네일 기본 폭 (목록 항목 폭의 %) */
const THUMBNAIL_WIDTH_PERCENT = 40;
/** 세로/가로 비율이 이 값을 넘으면(1:2 보다 길쭉하면) 썸네일을 더 줄인다 */
const MAX_PORTRAIT_RATIO = 2;

/**
 * 썸네일 폭(%)을 계산한다.
 * 기본은 40%. 세로로 아주 긴 사진은 높이가 너무 커지지 않게 비율만큼 폭을 줄인다.
 * @param thumbnail 썸네일 정보 (width/height 필수)
 * @returns 폭(%)
 */
function thumbnailWidthPercent(thumbnail: Thumbnail): number {
  const ratio = thumbnail.height / thumbnail.width;
  if (ratio <= MAX_PORTRAIT_RATIO) return THUMBNAIL_WIDTH_PERCENT;
  return (THUMBNAIL_WIDTH_PERCENT * MAX_PORTRAIT_RATIO) / ratio;
}

/**
 * 기사 목록의 항목 하나. 누르면 원문 기사를 새 창(탭)으로 연다.
 * @param props.post 기사
 * @returns 기사 링크
 */
export function PostItem({ post }: { post: PostListItem }) {
  return (
    <a
      href={post.source_url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-3 px-4 py-3 hover:bg-accent/8 [&+&]:border-t [&+&]:border-ink/8"
    >
      {post.thumbnail && (
        <div
          className="washed flex-none overflow-hidden rounded-[16px] bg-neutral-200"
          style={{ width: `${thumbnailWidthPercent(post.thumbnail)}%` }}
        >
          {/* 언론사마다 이미지 주소가 달라 next/image 대신 일반 img 를 쓴다.
              width/height 를 주면 이미지가 오기 전에도 자리를 잡아 화면이 덜컹거리지 않는다. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.thumbnail.url}
            width={post.thumbnail.width}
            height={post.thumbnail.height}
            alt=""
            loading="lazy"
            className="h-auto w-full"
          />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h5 className="m-0 text-[13.5px] leading-snug font-bold text-pretty">{post.title}</h5>
        <div className="mt-1.5 flex items-center gap-2 text-[10.5px] text-ink/50">
          <Tag>{post.region.name}</Tag>
          <span>{formatDate(post.published_at)}</span>
        </div>
        {/* 요약문은 PC 에서만 두 줄까지 보여 준다 */}
        <p className="mt-2 line-clamp-2 text-xs leading-normal opacity-75 max-md:hidden">{post.excerpt}</p>
      </div>
    </a>
  );
}
