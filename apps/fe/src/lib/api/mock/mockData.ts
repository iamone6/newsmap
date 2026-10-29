/**
 * be 가 준비되기 전에 쓰는 가짜 기사 데이터 생성기.
 *
 * 같은 지역 코드에는 항상 같은 기사 목록이 나오도록 "코드 문자열"을 씨앗(seed)으로 쓰는
 * 의사 난수를 사용한다. 그래야 새로고침해도 지도 색과 목록이 바뀌지 않는다.
 */
import type { ArticleListItem, RegionRef, Thumbnail } from "@/lib/api/types";

/** 일반 지역 기사 제목 후보 */
const LAND_TITLES = [
  "재개발 구역 지정 절차, 주민 의견 청취 단계로",
  "폭우 대비 배수시설 점검 마무리",
  "청년 창업 지원금 신청 이달 말까지",
  "도시철도 연장 기본계획 용역 결과 공개",
  "전통시장 야간 개장 시범 운영 한 달",
  "공공 도서관 주말 운영 시간 확대",
  "농수산물 직거래 장터 이번 주말 개장",
  "노후 상수관 교체 공사 통행 안내",
  "관광 활성화 협약 체결, 숙박 할인 연계",
  "미세먼지 저감 조례 개정안 통과",
  "청사 이전 부지 공청회 열려",
  "학교 급식 지역 농가 비중 확대",
  "버스 노선 개편안 확정 다음 달 시행",
  "하천 산책로 야간 조명 설치 완료",
];

/** 바다 기사 제목 후보 */
const SEA_TITLES = [
  "해상 풍랑주의보, 여객선 운항 일부 통제",
  "불법 조업 단속 강화 계획 발표",
  "해양 쓰레기 수거 사업 상반기 실적",
  "해상 풍력 입지 조사 착수",
  "적조 예비주의보 발령",
  "해양 보호구역 관리 계획 공청회",
  "항로 준설 공사 안전 안내",
];

const EXCERPT =
  "관계 부처와 지자체는 이번 결정으로 생활권 전반에 영향이 있을 것으로 보고, 후속 절차와 일정 조정에 대한 세부 계획을 이달 안에 공개하기로 했다. 현장에서는 기대와 우려가 함께 나온다.";

/** 썸네일 가로×세로 후보. 세로로 긴 사진도 섞어서 레이아웃 규칙을 확인할 수 있게 한다 */
const THUMBNAIL_SIZES: [number, number][] = [
  [1600, 900], [2000, 1000], [1400, 933], [1200, 1500], [1000, 2400], [1600, 700], [900, 1600],
];

/** 단위별 기사 수 범위 [최소, 최대] */
const ARTICLE_COUNT_RANGE: Record<RegionRef["level"], [number, number]> = {
  sido: [3, 40],
  sigungu: [3, 18],
  emd: [0, 6],
  sea: [4, 10],
  island: [2, 6],
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 문자열을 씨앗으로 하는 의사 난수 생성기를 만든다.
 * 선형 합동 생성기(LCG)라는 아주 단순한 방식: 다음값 = (이전값 × a + c) % m
 * @param seedText 씨앗 문자열 (지역 코드)
 * @returns 호출할 때마다 0 이상 1 미만의 수를 돌려주는 함수
 */
function createRandom(seedText: string): () => number {
  let state = 0;
  for (let index = 0; index < seedText.length; index++) {
    state = (state + seedText.charCodeAt(index) * (index + 1)) % 233280;
  }
  return () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
}

/**
 * 범위 안의 정수를 하나 고른다.
 * @param random createRandom 이 만든 함수
 * @param min 최솟값(포함)
 * @param max 최댓값(포함)
 * @returns 정수
 */
function randomInt(random: () => number, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

/**
 * 크기가 표시된 줄무늬 자리표시 이미지를 SVG data URI 로 만든다.
 * @param width 가로 픽셀
 * @param height 세로 픽셀
 * @returns img src 에 바로 넣을 수 있는 문자열
 */
function placeholderImage(width: number, height: number): string {
  const fontSize = Math.max(30, Math.min(width, height) * 0.1);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs><pattern id="p" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <rect width="12" height="12" fill="#ebddc5"/><rect width="5" height="12" fill="#dcd3c4"/></pattern></defs>
    <rect width="${width}" height="${height}" fill="url(#p)"/>
    <text x="${width / 2}" y="${height / 2}" fill="#82796a" font-family="monospace" text-anchor="middle"
      dominant-baseline="middle" font-size="${fontSize}">${width}×${height}</text></svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

/** 지역 코드 → 만들어 둔 기사 목록 (같은 목록을 다시 만들지 않도록) */
const articleCache = new Map<string, ArticleListItem[]>();

/**
 * 지역 하나의 가짜 기사 목록을 만든다. 최신순으로 정렬되어 있다.
 * @param region 지역
 * @returns 기사 목록
 */
export function mockArticlesOf(region: RegionRef): ArticleListItem[] {
  const cached = articleCache.get(region.code);
  if (cached) return cached;

  const random = createRandom(region.code);
  const titles = region.level === "sea" ? SEA_TITLES : LAND_TITLES;
  const [minCount, maxCount] = ARTICLE_COUNT_RANGE[region.level];
  const count = randomInt(random, minCount, maxCount);
  const now = Date.now();
  // id 가 지역끼리 잘 겹치지 않도록 지역마다 다른 앞자리를 준다
  const idBase = randomInt(random, 1, 9000) * 1000;

  const articles: ArticleListItem[] = [];
  for (let index = 0; index < count; index++) {
    const [width, height] = THUMBNAIL_SIZES[randomInt(random, 0, THUMBNAIL_SIZES.length - 1)];
    // 여섯 개 중 하나 정도는 썸네일이 없는 기사로 만든다
    const thumbnail: Thumbnail | null =
      random() < 0.17 ? null : { url: placeholderImage(width, height), width, height };
    const publishedAt = new Date(now - random() * 30 * ONE_DAY_MS);

    articles.push({
      id: idBase + index,
      title: titles[randomInt(random, 0, titles.length - 1)],
      excerpt: EXCERPT,
      thumbnail,
      // 열 개 중 하나 정도는 대표 지역이 없는 기사로 만든다 (실제 API 에서도 region 이 null 일 수 있다)
      region: random() < 0.1 ? null : region,
      source_url: `https://example.com/news/${region.code}/${index + 1}`,
      published_at: publishedAt.toISOString(),
    });
  }

  articles.sort((a, b) => b.published_at.localeCompare(a.published_at));
  articleCache.set(region.code, articles);
  return articles;
}
