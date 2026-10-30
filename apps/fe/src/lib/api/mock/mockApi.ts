/**
 * be 없이 화면을 개발하기 위한 가짜 API.
 * newsApi.ts 의 NewsApi 와 같은 함수를 갖고, 응답 모양도 contracts/API.md 와 똑같이 만든다.
 * "v1 구현 범위"도 실제 be 와 같게 따른다: 바다·섬은 통계에 없고 목록은 404, view_count 없음, region 은 null 일 수 있음.
 */
import { findRegion, isAdminLevel, levelOfCode, loadLevelFeatures, toRegionRef } from "@/features/map/geo";
import { ApiError } from "@/lib/api/httpClient";
import type { NewsApi } from "@/lib/api/newsApi";
import type { ArticleListItem, RegionLevel, RegionRef, RegionStat } from "@/lib/api/types";
import { mockArticlesOf } from "./mockData";

/** 가짜 응답을 돌려주기 전에 기다리는 시간(ms). 실제 네트워크처럼 보이게 한다 */
const FAKE_DELAY_MS = 150;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
/** 범례에서 기사가 있는 지역을 몇 등분할지 (be StatsConsts::LEGEND_QUANTILE_COUNT 와 같게) */
const LEGEND_QUANTILE_COUNT = 5;

/**
 * 잠깐 기다린다.
 * @param ms 기다릴 시간(밀리초)
 * @returns 시간이 지나면 끝나는 Promise
 */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 단계별 지역 목록을 만든다. v1 be 처럼 바다·섬은 넣지 않는다.
 * @param level 지역 단위
 * @returns 지역 목록 (sea·island 단계는 빈 목록)
 */
async function regionsOfLevel(level: RegionLevel): Promise<RegionRef[]> {
  if (!isAdminLevel(level)) return [];
  const features = await loadLevelFeatures(level);
  return features.map(toRegionRef);
}

/**
 * 지역 하나의 통계를 만든다.
 * @param region 지역
 * @returns 기사 수와 최신 기사 제목
 */
function statOf(region: RegionRef): RegionStat {
  const articles = mockArticlesOf(region);
  return {
    code: region.code,
    name: region.name,
    article_count: articles.length,
    latest_title: articles[0]?.title ?? null,
  };
}

/**
 * be 의 LegendCalculator 와 같은 규칙으로 범례 구간 시작값을 만든다.
 * 0건과 1건부터를 먼저 두고, 기사가 있는 지역을 기사 수로 정렬해 5등분한 시작값을 붙인다.
 * 앞 값보다 커야 하므로 겹치면 1씩 올리고, 최대 기사 수를 넘으면 그만 붙인다.
 * @param articleCounts 지역별 기사 수
 * @returns 오름차순 구간 시작값. 예) [0, 1, 6, 11, 19, 35]
 */
function legendOf(articleCounts: number[]): number[] {
  const legend = [0, 1];
  const nonZeroCounts = articleCounts.filter((count) => count > 0).sort((a, b) => a - b);
  if (nonZeroCounts.length === 0) return legend;

  const maxCount = nonZeroCounts[nonZeroCounts.length - 1];
  for (let part = 1; part < LEGEND_QUANTILE_COUNT; part++) {
    const position = Math.floor((part * nonZeroCounts.length) / LEGEND_QUANTILE_COUNT);
    const start = Math.max(nonZeroCounts[position], legend[legend.length - 1] + 1);
    if (start > maxCount) break;
    legend.push(start);
  }
  return legend;
}

export const mockApi: NewsApi = {
  async getSummary() {
    await wait(FAKE_DELAY_MS);
    const regions = await regionsOfLevel("sido");
    const allArticles = regions.flatMap(mockArticlesOf);
    const now = Date.now();
    const isWithin = (article: ArticleListItem, days: number) =>
      now - new Date(article.published_at).getTime() <= days * ONE_DAY_MS;

    return {
      total_articles: allArticles.length,
      today_articles: allArticles.filter((article) => isWithin(article, 1)).length,
      // 최근 7일 안에 기사가 있는 지역 수
      active_regions: regions.filter((region) => mockArticlesOf(region).some((article) => isWithin(article, 7))).length,
      updated_at: new Date(now).toISOString(),
    };
  },

  async getRegionStats(level) {
    await wait(FAKE_DELAY_MS);
    const stats = (await regionsOfLevel(level)).map(statOf);
    const counts = stats.map((stat) => stat.article_count);
    const max = Math.max(0, ...counts);
    return { data: stats, meta: { level, max, legend: legendOf(counts) } };
  },

  async getRegionArticles(code, query) {
    await wait(FAKE_DELAY_MS);
    // v1 be 는 바다·섬 코드에 404 를 준다
    if (!isAdminLevel(levelOfCode(code))) throw new ApiError(404, "지역을 찾을 수 없습니다.");
    const found = await findRegion(code);
    const region: RegionRef = found ? toRegionRef(found) : { code, name: code, level: levelOfCode(code) };

    // 1) 검색어로 거르기 (실제 API 는 제목+본문을 보지만 가짜에서는 제목만)
    // 2) 정렬하기. v1 은 조회수가 없어 popular 도 최신순이다 (mockArticlesOf 가 이미 최신순)
    let articles = mockArticlesOf(region);
    if (query.q) {
      articles = articles.filter((article) => article.title.includes(query.q));
    }

    // 3) 페이지 자르기
    const total = articles.length;
    const lastPage = Math.max(1, Math.ceil(total / query.perPage));
    const page = Math.min(query.page, lastPage);
    const start = (page - 1) * query.perPage;
    const pageItems = articles.slice(start, start + query.perPage);

    const path = `mock://regions/${code}/articles`;
    return {
      data: pageItems,
      links: {
        first: `${path}?page=1`,
        last: `${path}?page=${lastPage}`,
        prev: page > 1 ? `${path}?page=${page - 1}` : null,
        next: page < lastPage ? `${path}?page=${page + 1}` : null,
      },
      meta: {
        current_page: page,
        from: pageItems.length ? start + 1 : null,
        to: pageItems.length ? start + pageItems.length : null,
        last_page: lastPage,
        per_page: query.perPage,
        total,
        path,
        region,
        // 실제 API 처럼 검색할 때만 search_type 을 준다
        ...(query.q ? { search_type: "hybrid" as const } : {}),
      },
    };
  },

  async getLatestArticles(limit) {
    await wait(FAKE_DELAY_MS);
    const regions = await regionsOfLevel("sido");
    return regions
      .flatMap(mockArticlesOf)
      .sort((a, b) => b.published_at.localeCompare(a.published_at))
      .slice(0, limit)
      .map((article) => ({
        id: article.id,
        title: article.title,
        source_url: article.source_url,
        region: article.region,
        published_at: article.published_at,
      }));
  },
};
