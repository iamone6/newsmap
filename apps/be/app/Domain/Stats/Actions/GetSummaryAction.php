<?php

namespace App\Domain\Stats\Actions;

use App\Domain\Stats\Consts\StatsConsts;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * 상단 요약 통계 (GET /stats/summary). 60초 캐시.
 * 캐시는 객체를 되살리지 않는 설정(cache.serializable_classes=false)이라 배열로 저장한다.
 */
class GetSummaryAction
{
    /**
     * @return array{total_articles: int, today_articles: int, active_regions: int, updated_at: string|null}
     */
    public function execute(): array
    {
        return Cache::remember(
            'stats:summary',
            config('newsmap.stats_cache_seconds'),
            fn (): array => $this->calculate(),
        );
    }

    /**
     * 통계를 DB 에서 계산한다.
     * active_regions 는 최근 N일 기사가 있는 시군구 수다(article_chunks.region_codes 기준, 일반구 포함).
     *
     * @return array{total_articles: int, today_articles: int, active_regions: int, updated_at: string|null}
     */
    private function calculate(): array
    {
        $todayStart = Carbon::now()->startOfDay();
        $activeFrom = Carbon::now()->subDays(StatsConsts::ACTIVE_REGION_DAYS);

        $articleStats = DB::selectOne(
            'SELECT count(*) AS total_articles,
                    count(*) FILTER (WHERE published_at >= ?) AS today_articles,
                    max(created_at) AS updated_at
             FROM articles',
            [$todayStart],
        );

        // 시군구 코드는 XXXXX00000 이고, 시도(XX00000000)는 빼야 한다
        $activeRegions = DB::selectOne(
            "SELECT count(DISTINCT region_code) AS active_regions
             FROM article_chunks
             CROSS JOIN LATERAL unnest(region_codes) AS region_code
             WHERE published_at >= ?
               AND region_code LIKE '_____00000'
               AND region_code NOT LIKE '__00000000'",
            [$activeFrom],
        );

        return [
            'total_articles' => (int) $articleStats->total_articles,
            'today_articles' => (int) $articleStats->today_articles,
            'active_regions' => (int) $activeRegions->active_regions,
            'updated_at' => $articleStats->updated_at === null
                ? null
                : Carbon::parse($articleStats->updated_at)->toIso8601String(),
        ];
    }
}
