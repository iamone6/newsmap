<?php

namespace App\Http\Controllers;

use App\Domain\Region\Actions\FindRegionAction;
use App\Domain\Stats\Actions\GetSummaryAction;
use App\Domain\Stats\Actions\ListRegionStatsAction;
use App\Domain\Stats\Consts\StatsConsts;
use App\Domain\Stats\Requests\ListRegionStatsRequest;
use App\Domain\Stats\Resources\RegionStatResource;
use App\Domain\Stats\Resources\SummaryResource;
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
     * @return AnonymousResourceCollection {data: [...], meta: {level, max, legend}}
     */
    public function regions(ListRegionStatsRequest $request, FindRegionAction $findRegion, ListRegionStatsAction $listRegionStats): AnonymousResourceCollection
    {
        $parentCode = $request->parentCode();
        $parent = $parentCode === null ? null : $findRegion->execute($parentCode);
        $level = $request->level();

        $stats = $listRegionStats->execute($level, $parent);
        $maxCount = $stats === [] ? 0 : max(array_column($stats, 'article_count'));

        return RegionStatResource::collection($stats)->additional([
            'meta' => [
                'level' => $level->apiName(),
                'max' => $maxCount,
                'legend' => StatsConsts::LEGEND,
            ],
        ]);
    }
}
