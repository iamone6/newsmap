<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Carbon;
use Tests\Support\InsertsNewsData;
use Tests\TestCase;

/**
 * 통계 API (GET /stats/summary, /stats/regions).
 */
class StatsApiTest extends TestCase
{
    use DatabaseTransactions;
    use InsertsNewsData;

    protected function setUp(): void
    {
        parent::setUp();
        $this->insertSampleRegions();

        $this->insertArticle(
            '어제 매탄동 기사',
            ['sido' => '4100000000', 'sigungu' => '4111700000', 'emd' => '4111751000'],
            ['4111751000', '4111700000', '4111000000', '4100000000'],
            publishedAt: Carbon::now()->subDay()->toIso8601String(),
        );
        $this->insertArticle(
            '오늘 수원시 기사',
            ['sido' => '4100000000', 'sigungu' => '4111000000', 'emd' => null],
            ['4111000000', '4100000000'],
            publishedAt: Carbon::now()->toIso8601String(),
        );
    }

    /**
     * 시도별 기사 수는 하위 지역을 포함하고, 기사가 없는 시도는 0 이다.
     */
    public function test_counts_articles_per_sido_including_children(): void
    {
        $this->getJson('/api/v1/stats/regions?level=sido')
            ->assertOk()
            ->assertJsonPath('data', [
                ['code' => '11', 'name' => '서울특별시', 'article_count' => 0, 'latest_title' => null],
                ['code' => '41', 'name' => '경기도', 'article_count' => 2, 'latest_title' => '오늘 수원시 기사'],
            ])
            ->assertJsonPath('meta', ['level' => 'sido', 'max' => 2, 'legend' => [0, 1, 5, 15, 30]]);
    }

    /**
     * parent 를 주면 그 아래 지역만 센다. 수원시에는 영통구 기사도 들어간다.
     */
    public function test_counts_sigungu_under_parent(): void
    {
        $this->getJson('/api/v1/stats/regions?level=sigungu&parent=41')
            ->assertOk()
            ->assertJsonPath('data.*.code', ['41110', '41117'])
            ->assertJsonPath('data.*.article_count', [2, 1]);
    }

    /**
     * 요약 통계: 전체, 오늘, 최근 7일 기사가 있는 시군구 수(수원시, 영통구).
     */
    public function test_returns_summary(): void
    {
        $this->getJson('/api/v1/stats/summary')
            ->assertOk()
            ->assertJsonPath('data.total_articles', 2)
            ->assertJsonPath('data.today_articles', 1)
            ->assertJsonPath('data.active_regions', 2);
    }

    /**
     * level 은 필수다.
     */
    public function test_requires_level(): void
    {
        $this->getJson('/api/v1/stats/regions')
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['level']);
    }
}
