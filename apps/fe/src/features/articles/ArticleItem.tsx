"use client";

import Image from "next/image";
import { useState } from "react";
import { Tag } from "@/components/ui/Tag";
import type { ArticleListItem, Thumbnail } from "@/lib/api/types";
import { formatDate } from "@/lib/format";

/**
 * 기사 썸네일. 항목 폭의 40%, 16:9 상자에 잘라서(cover) 보여 준다.
 * 원본 크기가 기사마다 달라도 목록 모양이 같도록 상자 크기를 고정한다.
 * 이미지는 next/image 가 서버(/_next/image)에서 줄이고 캐시한다 (next.config.ts 의 images).
 * 이미지를 불러오지 못하면 썸네일 자리를 숨긴다.
 * @param props.thumbnail 썸네일 정보 (width/height 는 쓰지 않는다)
 * @returns 썸네일. 불러오기에 실패하면 null
 */
function ArticleThumbnail({ thumbnail }: { thumbnail: Thumbnail }) {
  const [hasFailed, setHasFailed] = useState(false);
  if (hasFailed) return null;

  return (
    <div className="washed relative aspect-video w-[40%] flex-none overflow-hidden rounded-[12px] bg-neutral-200">
      <Image
        src={thumbnail.url}
        alt=""
        fill
        // 패널 폭: PC 400px(항목 안쪽 약 350px → 40% ≈ 140px), 모바일 화면의 90%(→ 약 36vw)
        sizes="(max-width: 768px) 36vw, 145px"
        onError={() => setHasFailed(true)}
        className="object-cover"
      />
    </div>
  );
}

/**
 * 기사 목록의 항목 하나. 누르면 원문 기사를 새 창(탭)으로 연다.
 * @param props.article 기사
 * @returns 기사 링크
 */
export function ArticleItem({ article }: { article: ArticleListItem }) {
  return (
    <a
      href={article.source_url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-3 px-4 py-3 hover:bg-accent/8 [&+&]:border-t [&+&]:border-ink/8"
    >
      {article.thumbnail && <ArticleThumbnail thumbnail={article.thumbnail} />}
      <div className="min-w-0 flex-1">
        <h5 className="m-0 text-[13.5px] leading-snug font-bold text-pretty">{article.title}</h5>
        <div className="mt-1.5 flex items-center gap-2 text-[10.5px] text-ink/50">
          {article.region && <Tag>{article.region.name}</Tag>}
          <span>{formatDate(article.published_at)}</span>
        </div>
        {/* 요약문은 PC 에서만 두 줄까지 보여 준다 */}
        <p className="mt-2 line-clamp-2 text-xs leading-normal opacity-75 max-md:hidden">{article.excerpt}</p>
      </div>
    </a>
  );
}
