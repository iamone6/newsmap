/**
 * be 없이 화면을 개발하기 위한 가짜 API.
 * newsApi.ts 의 NewsApi 와 같은 함수를 갖고, 응답 모양도 contracts/API.md 와 똑같이 만든다.
 */
import { DEFAULT_LEGEND } from "@/features/map/colors";
import {
  ISLAND_MARKERS,
  SEA_FEATURES,
  findRegion,
  levelOfCode,
  loadLevelFeatures,
  toRegionRef,
} from "@/features/map/geo";
import type { NewsApi } from "@/lib/api/newsApi";
import type { PostListItem, RegionLevel, RegionRef, RegionStat } from "@/lib/api/types";
import { mockPostsOf } from "./mockData";

/** 가짜 응답을 돌려주기 전에 기다리는 시간(ms). 실제 네트워크처럼 보이게 한다 */
const FAKE_DELAY_MS = 150;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 잠깐 기다린다.
 * @param ms 기다릴 시간(밀리초)
 * @returns 시간이 지나면 끝나는 Promise
 */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 단계별 지역 목록을 만든다. sido 단계에는 바다와 섬도 넣는다 (API.md 예시와 같게).
 * @param level 지역 단위
 * @returns 지역 목록
 */
async function regionsOfLevel(level: RegionLevel): Promise<RegionRef[]> {
  if (level === "sea") return SEA_FEATURES.map(toRegionRef);
  if (level === "island") return ISLAND_MARKERS.map(toRegionRef);

  const features = await loadLevelFeatures(level);
  const regions = features.map(toRegionRef);
  if (level === "sido") {
    regions.push(...SEA_FEATURES.map(toRegionRef), ...ISLAND_MARKERS.map(toRegionRef));
  }
  return regions;
}

/**
 * 지역 하나의 통계를 만든다.
 * @param region 지역
 * @returns 기사 수와 최신 기사 제목
 */
function statOf(region: RegionRef): RegionStat {
  const posts = mockPostsOf(region);
  return {
    code: region.code,
    name: region.name,
    post_count: posts.length,
    latest_title: posts[0]?.title ?? null,
  };
}

export const mockApi: NewsApi = {
  async getSummary() {
    await wait(FAKE_DELAY_MS);
    const regions = await regionsOfLevel("sido");
    const allPosts = regions.flatMap(mockPostsOf);
    const now = Date.now();
    const isWithin = (post: PostListItem, days: number) =>
      now - new Date(post.published_at).getTime() <= days * ONE_DAY_MS;

    return {
      total_posts: allPosts.length,
      today_posts: allPosts.filter((post) => isWithin(post, 1)).length,
      // 최근 7일 안에 기사가 있는 지역 수
      active_regions: regions.filter((region) => mockPostsOf(region).some((post) => isWithin(post, 7))).length,
      updated_at: new Date(now).toISOString(),
    };
  },

  async getRegionStats(level) {
    await wait(FAKE_DELAY_MS);
    const stats = (await regionsOfLevel(level)).map(statOf);
    const max = Math.max(0, ...stats.map((stat) => stat.post_count));
    return { data: stats, meta: { level, max, legend: DEFAULT_LEGEND } };
  },

  async getRegionPosts(code, query) {
    await wait(FAKE_DELAY_MS);
    const found = await findRegion(code);
    const region: RegionRef = found ? toRegionRef(found) : { code, name: code, level: levelOfCode(code) };

    // 1) 검색어로 거르기 (실제 API 는 제목+본문을 보지만 가짜에서는 제목만)
    let posts = mockPostsOf(region);
    if (query.q) {
      posts = posts.filter((post) => post.title.includes(query.q));
    }

    // 2) 정렬하기
    posts = [...posts].sort((a, b) =>
      query.sort === "popular" ? b.view_count - a.view_count : b.published_at.localeCompare(a.published_at),
    );

    // 3) 페이지 자르기
    const total = posts.length;
    const lastPage = Math.max(1, Math.ceil(total / query.perPage));
    const page = Math.min(query.page, lastPage);
    const start = (page - 1) * query.perPage;
    const pageItems = posts.slice(start, start + query.perPage);

    const path = `mock://regions/${code}/posts`;
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
      },
    };
  },

  async getLatestPosts(limit) {
    await wait(FAKE_DELAY_MS);
    const regions = await regionsOfLevel("sido");
    return regions
      .flatMap(mockPostsOf)
      .sort((a, b) => b.published_at.localeCompare(a.published_at))
      .slice(0, limit)
      .map((post) => ({
        id: post.id,
        title: post.title,
        source_url: post.source_url,
        region: post.region,
        published_at: post.published_at,
      }));
  },
};
