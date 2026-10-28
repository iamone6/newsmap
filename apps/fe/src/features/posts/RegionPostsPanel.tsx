"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import type { PostSort, RegionRef } from "@/lib/api/types";
import { formatNumber } from "@/lib/format";
import { Pager } from "./Pager";
import { PostItem } from "./PostItem";
import { useRegionPosts } from "./useRegionPosts";

interface RegionPostsPanelProps {
  /** 목록을 볼 지역. null 이면 패널을 닫는다 */
  region: RegionRef | null;
  /** 상위 지역 이름들 (예: ["서울특별시", "강남구"]) */
  parentNames: string[];
  onClose: () => void;
}

/**
 * 지역을 고르면 오른쪽에서 밀려 나오는 기사 목록 패널.
 * PC 는 오른쪽 400px, 모바일은 지도를 왼쪽 10%만 남기고 덮는다.
 * @param props RegionPostsPanelProps 참고
 * @returns 패널
 */
export function RegionPostsPanel({ region, parentNames, onClose }: RegionPostsPanelProps) {
  const isOpen = region !== null;

  return (
    <section
      aria-hidden={!isOpen}
      className={`absolute top-[150px] right-3 bottom-14 z-[750] flex w-[400px] flex-col overflow-hidden rounded-[32px] bg-bg shadow-lg transition-[transform,opacity] duration-300 ease-[cubic-bezier(.22,.7,.25,1)] max-md:inset-y-0 max-md:right-0 max-md:left-[10%] max-md:z-[850] max-md:w-[90%] max-md:rounded-r-none ${
        isOpen ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-[calc(100%+28px)] opacity-0"
      }`}
    >
      {/* key 를 지역 코드로 주면 지역이 바뀔 때 검색어·정렬·페이지가 처음 상태로 돌아간다 */}
      {region && <PanelContent key={region.code} region={region} parentNames={parentNames} onClose={onClose} />}
    </section>
  );
}

/**
 * 패널 안쪽 내용 (헤더, 검색·정렬, 건수, 목록, 페이지).
 * @param props 지역 정보와 닫기 함수
 * @returns 패널 내용
 */
function PanelContent({ region, parentNames, onClose }: RegionPostsPanelProps & { region: RegionRef }) {
  const posts = useRegionPosts(region.code);
  const meta = posts.response?.meta;
  const items = posts.response?.data ?? [];
  const listRef = useRef<HTMLDivElement>(null);

  /**
   * 페이지를 바꾸고 목록을 맨 위로 올린다.
   * @param page 이동할 페이지
   */
  const goToPage = (page: number) => {
    posts.changePage(page);
    listRef.current?.scrollTo({ top: 0 });
  };

  return (
    <>
      <header className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-2.5">
          <div>
            <h4 className="m-0 font-heading text-[22px]">{region.name}</h4>
            {parentNames.length > 0 && <div className="mt-0.5 text-[11.5px] text-ink/55">{parentNames.join("  ›  ")}</div>}
          </div>
          <Button iconOnly aria-label="닫기" onClick={onClose}>
            ✕
          </Button>
        </div>
        <div className="mt-3 flex gap-2">
          <TextInput
            type="search"
            placeholder="이 지역 기사 검색"
            className="min-h-8 text-[12.5px]"
            value={posts.searchText}
            onChange={(event) => posts.changeSearchText(event.target.value)}
          />
          <select
            className="flex-none cursor-pointer rounded-full bg-surface px-3 py-1.5 text-xs"
            value={posts.sort}
            onChange={(event) => posts.changeSort(event.target.value as PostSort)}
          >
            <option value="latest">최신순</option>
            <option value="popular">인기순</option>
          </select>
        </div>
      </header>

      <div className="flex items-center justify-between gap-2 bg-surface px-4 py-2 text-[11.5px] text-ink/65">
        <span>
          기사 <b className="text-ink">{formatNumber(meta?.total ?? 0)}</b>건
          {posts.searchText.trim() && ` · "${posts.searchText.trim()}"`}
        </span>
        <span>{meta ? `${meta.current_page} / ${meta.last_page}` : ""}</span>
      </div>

      <div ref={listRef} className={`flex-1 overflow-auto py-2 transition-opacity ${posts.isLoading ? "opacity-50" : ""}`}>
        {posts.errorMessage ? (
          <EmptyMessage text={`목록을 불러오지 못했습니다. (${posts.errorMessage})`} />
        ) : items.length > 0 ? (
          items.map((post) => <PostItem key={post.id} post={post} />)
        ) : (
          !posts.isLoading && <EmptyMessage text="조건에 맞는 기사가 없습니다." />
        )}
      </div>

      {meta && meta.last_page > 1 && (
        <Pager currentPage={meta.current_page} lastPage={meta.last_page} onChange={goToPage} />
      )}
    </>
  );
}

/**
 * 목록이 비었을 때 가운데에 보여 주는 안내 문구.
 * @param props.text 안내 문구
 * @returns 안내
 */
function EmptyMessage({ text }: { text: string }) {
  return <div className="px-4 py-9 text-center text-[13px] text-ink/55">{text}</div>;
}
