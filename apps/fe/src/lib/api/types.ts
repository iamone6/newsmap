/**
 * be API 의 요청·응답 타입.
 * 계약 문서 contracts/API.md 와 1:1 로 맞춘다. 계약이 바뀌면 이 파일부터 고친다.
 */

/**
 * 지역 단위.
 * - sido: 시도(2자리), sigungu: 시군구(5자리), emd: 읍면동(10자리)
 * - sea: 바다(SEA_W 등), island: 섬(ISL_DOKDO 등)
 */
export type RegionLevel = "sido" | "sigungu" | "emd" | "sea" | "island";

/** 다른 응답 안에 들어가는 짧은 지역 정보 */
export interface RegionRef {
  code: string;
  name: string;
  level: RegionLevel;
}

/** GET /stats/summary 의 data */
export interface StatsSummary {
  total_posts: number;
  today_posts: number;
  active_regions: number;
  updated_at: string;
}

/** GET /stats/regions 의 data 항목 하나 (지도 색칠용) */
export interface RegionStat {
  code: string;
  name: string;
  post_count: number;
  /** 가장 최근 기사 제목. 기사가 없으면 null (지도 툴팁용) */
  latest_title: string | null;
}

/** GET /stats/regions 응답 전체 */
export interface RegionStatsResponse {
  data: RegionStat[];
  meta: {
    level: RegionLevel;
    max: number;
    /** 범례 구간의 시작값들. 예) [0, 1, 5, 15, 30] */
    legend: number[];
  };
}

/** 기사 썸네일. width/height 는 레이아웃 계산에 꼭 필요하다 */
export interface Thumbnail {
  url: string;
  width: number;
  height: number;
}

/** GET /regions/{code}/posts 의 목록 항목 하나 */
export interface PostListItem {
  id: number;
  title: string;
  excerpt: string;
  thumbnail: Thumbnail | null;
  region: RegionRef;
  /** 원문 기사 주소. 클릭하면 새 창으로 연다 */
  source_url: string;
  view_count: number;
  published_at: string;
}

/** GET /posts/latest 의 항목 하나 (하단 티커용) */
export interface LatestPost {
  id: number;
  title: string;
  source_url: string;
  region: RegionRef;
  published_at: string;
}

/** Laravel 페이지네이션 응답 형식 */
export interface PaginatedResponse<Item> {
  data: Item[];
  links: {
    first: string | null;
    last: string | null;
    prev: string | null;
    next: string | null;
  };
  meta: {
    current_page: number;
    from: number | null;
    to: number | null;
    last_page: number;
    per_page: number;
    total: number;
    path: string;
    /** 목록 헤더에 보여줄 지역 정보 (API.md 커스텀 필드) */
    region: RegionRef;
  };
}

/** 목록 정렬 방식 */
export type PostSort = "latest" | "popular";

/** GET /regions/{code}/posts 의 쿼리 파라미터 */
export interface RegionPostsQuery {
  sort: PostSort;
  /** 검색어 (제목+본문). 빈 문자열이면 보내지 않는다 */
  q: string;
  page: number;
  perPage: number;
}
