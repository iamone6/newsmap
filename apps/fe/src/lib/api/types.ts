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
  total_articles: number;
  today_articles: number;
  active_regions: number;
  updated_at: string;
}

/** GET /stats/regions 의 data 항목 하나 (지도 색칠용) */
export interface RegionStat {
  code: string;
  name: string;
  article_count: number;
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

/**
 * 기사 썸네일. 화면은 원본 크기와 관계없이 목록 폭 40%·16:9 상자에 잘라서 보여 준다.
 * v1 은 이미지 크기를 저장하지 않아 width/height 가 null 이다.
 */
export interface Thumbnail {
  url: string;
  width: number | null;
  height: number | null;
}

/**
 * GET /regions/{code}/articles 의 목록 항목 하나.
 * v1 에는 view_count 가 없고 thumbnail 의 width/height 는 null 이다 (API.md "v1 구현 범위").
 */
export interface ArticleListItem {
  id: number;
  title: string;
  excerpt: string;
  thumbnail: Thumbnail | null;
  /** 기사의 대표 지역. 지역이 판정되지 않은 기사는 null */
  region: RegionRef | null;
  /** 원문 기사 주소. 클릭하면 새 창으로 연다 */
  source_url: string;
  published_at: string;
}

/** GET /articles/latest 의 항목 하나 (하단 티커용) */
export interface LatestArticle {
  id: number;
  title: string;
  source_url: string;
  /** 기사의 대표 지역. 지역이 판정되지 않은 기사는 null */
  region: RegionRef | null;
  published_at: string;
}

/**
 * 검색 방식. q 가 있을 때만 응답 meta 에 들어 있다.
 * - hybrid: BM25 + 벡터 검색
 * - bm25: 쿼리 임베딩이 실패해 키워드 검색만 한 경우
 */
export type SearchType = "hybrid" | "bm25";

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
    /** 검색 방식 (q 가 있을 때만) */
    search_type?: SearchType;
  };
}

/** 목록 정렬 방식. v1 의 popular 는 latest 와 같게 정렬되어 화면에서는 쓰지 않는다 */
export type ArticleSort = "latest" | "popular";

/** GET /regions/{code}/articles 의 쿼리 파라미터 */
export interface RegionArticlesQuery {
  sort: ArticleSort;
  /** 검색어 (제목+본문). 빈 문자열이면 보내지 않는다 */
  q: string;
  page: number;
  perPage: number;
}
