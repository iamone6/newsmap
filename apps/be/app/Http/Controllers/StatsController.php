<?php

namespace App\Http\Controllers;

use App\Domain\Region\Actions\FindRegionAction;
use App\Domain\Stats\Actions\GetSummaryAction;
use App\Domain\Stats\Actions\ListRegionStatsAction;
use App\Domain\Stats\Requests\ListRegionStatsRequest;
use App\Domain\Stats\Resources\RegionStatResource;
use App\Domain\Stats\Resources\SummaryResource;
use App\Domain\Stats\Services\LegendCalculator;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * 통계 (GET /stats/summary, /stats/regions).
 */
class StatsController extends Controller
{
    /**
     * 상단 요약 통계.
     *
     * @param  GetSummaryAction  $getSummary  요약 Action
     * @return SummaryResource {data: {...}}
     */
    public function summary(GetSummaryAction $getSummary): SummaryResource
    {
        return new SummaryResource($getSummary->execute());
    }

    /**
     * 지도 색칠용 지역별 기사 수.
     *
     * @param  ListRegionStatsRequest  $request  level·parent
     * @param  FindRegionAction  $findRegion  parent 코드 확인
     * @param  ListRegionStatsAction  $listRegionStats  집계 Action
     * @param  LegendCalculator  $legendCalculator  기사 수 분포로 범례 구간 계산
     * @return AnonymousResourceCollection {data: [...], meta: {level, max, legend}}
     */
    public function regions(ListRegionStatsRequest $request, FindRegionAction $findRegion, ListRegionStatsAction $listRegionStats, LegendCalculator $legendCalculator): AnonymousResourceCollection
    {
        $parentCode = $request->parentCode();
        $parent = $parentCode === null ? null : $findRegion->execute($parentCode);
        $level = $request->level();

        $stats = $listRegionStats->execute($level, $parent);
        $articleCounts = array_column($stats, 'article_count');
        $maxCount = $articleCounts === [] ? 0 : max($articleCounts);

        return RegionStatResource::collection($stats)->additional([
            'meta' => [
                'level' => $level->apiName(),
                'max' => $maxCount,
                'legend' => $legendCalculator->calculate($articleCounts),
            ],
        ]);
    }
}
