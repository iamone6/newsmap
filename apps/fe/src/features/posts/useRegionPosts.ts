import { useEffect, useState } from "react";
import { newsApi } from "@/lib/api/newsApi";
import type { PaginatedResponse, PostListItem, PostSort } from "@/lib/api/types";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

/** 한 페이지에 보여 줄 기사 수 */
export const POSTS_PER_PAGE = 5;
/** 검색어 입력이 이 시간(ms) 동안 멈추면 검색한다 */
const SEARCH_DELAY_MS = 300;

/** 요청 한 번의 결과. requestKey 로 "어떤 조건의 결과인지" 기억한다 */
interface FetchResult {
  requestKey: string;
  response: PaginatedResponse<PostListItem> | null;
  errorMessage: string | null;
}

/**
 * 지역 기사 목록과 그 목록의 정렬·검색·페이지 상태를 관리하는 훅.
 *
 * 지역이 바뀌면 상태를 처음부터 다시 시작해야 하므로,
 * 이 훅을 쓰는 컴포넌트에 key={지역코드} 를 주어 새로 만들게 한다.
 * @param regionCode 목록을 볼 지역 코드
 * @returns 목록 데이터, 로딩/에러 상태, 상태를 바꾸는 함수들
 */
export function useRegionPosts(regionCode: string) {
  const [sort, setSort] = useState<PostSort>("latest");
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<FetchResult | null>(null);

  const query = useDebouncedValue(searchText.trim(), SEARCH_DELAY_MS);
  const requestKey = [regionCode, sort, query, page].join("|");

  useEffect(() => {
    // 응답이 늦게 와서 그 사이 조건이 바뀌었다면 그 응답은 버린다
    let isStale = false;
    newsApi
      .getRegionPosts(regionCode, { sort, q: query, page, perPage: POSTS_PER_PAGE })
      .then((response) => {
        if (!isStale) setResult({ requestKey, response, errorMessage: null });
      })
      .catch((error: Error) => {
        if (!isStale) setResult({ requestKey, response: null, errorMessage: error.message });
      });
    return () => {
      isStale = true;
    };
  }, [regionCode, sort, query, page, requestKey]);

  return {
    /** 마지막으로 받은 응답 (새 조건으로 불러오는 동안에도 이전 목록을 보여 준다) */
    response: result?.response ?? null,
    errorMessage: result?.errorMessage ?? null,
    /** 지금 조건의 응답이 아직 오지 않았으면 true */
    isLoading: result?.requestKey !== requestKey,
    sort,
    searchText,
    page,
    /** 정렬을 바꾸면 1페이지로 돌아간다 */
    changeSort(nextSort: PostSort) {
      setSort(nextSort);
      setPage(1);
    },
    /** 검색어를 바꾸면 1페이지로 돌아간다 */
    changeSearchText(text: string) {
      setSearchText(text);
      setPage(1);
    },
    changePage: setPage,
  };
}
