import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_LEGEND } from "@/features/map/colors";
import type { MapLevel } from "@/features/map/types";
import { newsApi } from "@/lib/api/newsApi";
import type { LatestArticle, RegionStat, RegionStatsResponse, StatsSummary } from "@/lib/api/types";

/** 하단 티커에 보여 줄 최신 기사 수 */
const TICKER_ARTICLE_COUNT = 16;

/**
 * 페이지가 열릴 때 한 번 불러오는 전국 요약과 최신 기사.
 * @returns summary(전국 현황), latestArticles(티커용 최신 기사)
 */
export function useSummaryStats() {
  const [summary, setSummary] = useState<StatsSummary | null>(null);
  const [latestArticles, setLatestArticles] = useState<LatestArticle[]>([]);

  useEffect(() => {
    newsApi
      .getSummary()
      .then(setSummary)
      .catch((error) => console.error("전국 현황을 불러오지 못했습니다", error));
    newsApi
      .getLatestArticles(TICKER_ARTICLE_COUNT)
      .then(setLatestArticles)
      .catch((error) => console.error("최신 기사를 불러오지 못했습니다", error));
  }, []);

  return { summary, latestArticles };
}

/**
 * 지도 색칠에 쓰는 지역별 기사 수.
 * - sido 는 항상 불러 둔다 (계약상 sido 응답에 바다·섬이 들어간다. v1 be 는 아직 넣지 않아 바다·섬은 0건 색이 된다).
 * - 지금 단계(level) 응답을 sido 응답 위에 합쳐서 하나의 Map 으로 만든다.
 * - 한 번 받은 단계는 다시 부르지 않는다.
 * @param level 지금 지도 단계
 * @returns statsByCode(지역 코드 → 통계), legend(범례 구간)
 */
export function useRegionStats(level: MapLevel) {
  const [responses, setResponses] = useState<Partial<Record<MapLevel, RegionStatsResponse>>>({});
  /** 이미 요청을 보낸 단계 (같은 단계를 두 번 요청하지 않도록) */
  const requestedLevels = useRef(new Set<MapLevel>());

  useEffect(() => {
    for (const neededLevel of new Set<MapLevel>(["sido", level])) {
      if (requestedLevels.current.has(neededLevel)) continue;
      requestedLevels.current.add(neededLevel);
      newsApi
        .getRegionStats(neededLevel)
        .then((response) => setResponses((previous) => ({ ...previous, [neededLevel]: response })))
        .catch((error) => {
          // 실패하면 다음에 다시 시도할 수 있게 기록을 지운다
          requestedLevels.current.delete(neededLevel);
          console.error(`${neededLevel} 통계를 불러오지 못했습니다`, error);
        });
    }
  }, [level]);

  const statsByCode = useMemo(() => {
    const merged = new Map<string, RegionStat>();
    const sources = [responses.sido, level === "sido" ? undefined : responses[level]];
    for (const response of sources) {
      for (const stat of response?.data ?? []) merged.set(stat.code, stat);
    }
    return merged;
  }, [responses, level]);

  const legend = responses[level]?.meta.legend ?? responses.sido?.meta.legend ?? DEFAULT_LEGEND;

  return { statsByCode, legend };
}
