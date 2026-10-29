<?php

namespace App\Domain\Stats\Actions;

use App\Domain\Region\Models\Region;
use App\Domain\Shared\Enums\RegionLevel;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * 지도 색칠용 지역별 기사 수 (GET /stats/regions). 60초 캐시.
 * 기사 수는 하위 지역 포함이다: article_chunks.region_codes(상위 단위까지 펼친 코드) 기준으로 센다.
 * 그 단계의 현행 지역은 기사가 없어도 0 으로 모두 넣는다.
 */
class ListRegionStatsAction
{
    /**
     * @param  RegionLevel  $level  집계할 단계
     * @param  Region|null  $parent  주면 그 지역 아래(손자 포함)만
     * @return list<array{code: string, name: string, article_count: int, latest_title: string|null}> 코드 순
     */
    public function execute(RegionLevel $level, ?Region $parent): array
    {
        $cacheKey = 'stats:regions:'.$level->apiName().':'.($parent->code ?? 'all');

        return Cache::remember(
            $cacheKey,
            config('newsmap.stats_cache_seconds'),
            fn (): array => $this->calculate($level, $parent),
        );
    }

    /**
     * 지역별 기사 수와 최신 기사 제목을 DB 에서 계산한다.
     *
     * @param  RegionLevel  $level  집계할 단계
     * @param  Region|null  $parent  상위 지역
     * @return list<array{code: string, name: string, article_count: int, latest_title: string|null}>
     */
    private function calculate(RegionLevel $level, ?Region $parent): array
    {
        $articleCounts = DB::table('article_chunks')
            ->crossJoin(DB::raw('LATERAL unnest(region_codes) AS region_code'))
            ->groupBy('region_code')
            ->select('region_code', DB::raw('count(DISTINCT article_id) AS article_count'));

        $latestTitles = DB::table('article_chunks')
            ->crossJoin(DB::raw('LATERAL unnest(article_chunks.region_codes) AS region_code'))
            ->join('articles', 'articles.id', '=', 'article_chunks.article_id')
            ->select(DB::raw('DISTINCT ON (region_code) region_code'), 'articles.title AS latest_title')
            ->orderBy('region_code')
            ->orderByDesc('articles.published_at')
            ->orderByDesc('articles.id');

        $query = Region::query()
            ->current()
            ->where('level', $level)
            ->leftJoinSub($articleCounts, 'counts', 'counts.region_code', '=', 'regions.code')
            ->leftJoinSub($latestTitles, 'latest', 'latest.region_code', '=', 'regions.code')
            ->select('regions.*', 'counts.article_count', 'latest.latest_title')
            ->orderBy('regions.code');
        if ($parent !== null) {
            $query->descendantsOf($parent->code);
        }

        return $query->get()
            ->map(fn (Region $region): array => [
                'code' => $region->regionCode()->toApi(),
                'name' => $region->name(),
                'article_count' => (int) $region->getAttribute('article_count'),
                'latest_title' => $region->getAttribute('latest_title'),
            ])
            ->all();
    }
}
