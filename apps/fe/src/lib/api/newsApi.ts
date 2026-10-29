/**
 * 화면에서 쓰는 API 함수 모음.
 *
 * 화면 코드는 항상 이 파일의 newsApi 만 부른다.
 * .env 의 NEXT_PUBLIC_USE_MOCK_API 값에 따라 실제 be(realApi) 또는 가짜 데이터(mockApi)로 연결된다.
 * 엔드포인트 정의는 contracts/API.md 를 따른다.
 */
import { config } from "@/lib/config";
import { getJson } from "./httpClient";
import { mockApi } from "./mock/mockApi";
import type {
  ArticleListItem,
  LatestArticle,
  PaginatedResponse,
  RegionArticlesQuery,
  RegionLevel,
  RegionStatsResponse,
  StatsSummary,
} from "./types";

/** realApi 와 mockApi 가 똑같이 갖춰야 하는 함수들 */
export interface NewsApi {
  /**
   * 전국 현황 요약 (GET /stats/summary)
   * @returns 총 기사 수, 오늘 기사 수, 활성 지역 수
   */
  getSummary(): Promise<StatsSummary>;

  /**
   * 단계별 지역 기사 수 (GET /stats/regions?level=…). 지도 색칠용
   * @param level 지역 단위. sido 응답에는 바다·섬도 들어 있다
   * @returns 지역별 기사 수와 범례
   */
  getRegionStats(level: RegionLevel): Promise<RegionStatsResponse>;

  /**
   * 지역 기사 목록 (GET /regions/{code}/articles)
   * @param code 지역 코드
   * @param query 정렬·검색어·페이지
   * @returns 페이지 단위 기사 목록
   */
  getRegionArticles(code: string, query: RegionArticlesQuery): Promise<PaginatedResponse<ArticleListItem>>;

  /**
   * 전국 최신 기사 (GET /articles/latest). 하단 티커용
   * @param limit 가져올 개수
   * @returns 최신순 기사 목록
   */
  getLatestArticles(limit: number): Promise<LatestArticle[]>;
}

/** 실제 be 를 호출하는 구현 */
const realApi: NewsApi = {
  async getSummary() {
    const response = await getJson<{ data: StatsSummary }>("/stats/summary");
    return response.data;
  },

  getRegionStats(level) {
    return getJson<RegionStatsResponse>("/stats/regions", { level });
  },

  getRegionArticles(code, query) {
    return getJson<PaginatedResponse<ArticleListItem>>(`/regions/${encodeURIComponent(code)}/articles`, {
      sort: query.sort,
      q: query.q,
      page: query.page,
      per_page: query.perPage,
    });
  },

  async getLatestArticles(limit) {
    const response = await getJson<{ data: LatestArticle[] }>("/articles/latest", { limit });
    return response.data;
  },
};

/** 화면에서 쓰는 API. 설정에 따라 실제/가짜 중 하나 */
export const newsApi: NewsApi = config.useMockApi ? mockApi : realApi;
