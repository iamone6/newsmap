<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Support\InsertsNewsData;
use Tests\TestCase;

/**
 * 지역 API (GET /regions, /regions/{code}, /regions/{code}/children).
 */
class RegionApiTest extends TestCase
{
    use DatabaseTransactions;
    use InsertsNewsData;

    protected function setUp(): void
    {
        parent::setUp();
        $this->insertSampleRegions();
    }

    /**
     * 시도 아래 시군구에는 시와 그 아래 일반구가 모두 들어간다.
     */
    public function test_lists_sigungu_under_sido_including_general_districts(): void
    {
        $this->getJson('/api/v1/regions?level=sigungu&parent=41')
            ->assertOk()
            ->assertExactJson(['data' => [
                ['code' => '41110', 'name' => '수원시', 'level' => 'sigungu', 'parent_code' => '41'],
                ['code' => '41117', 'name' => '수원시 영통구', 'level' => 'sigungu', 'parent_code' => '41110'],
            ]]);
    }

    /**
     * 파라미터가 없으면 시도 목록을 준다.
     */
    public function test_lists_sido_by_default(): void
    {
        $this->getJson('/api/v1/regions')
            ->assertOk()
            ->assertJsonPath('data.*.code', ['11', '41']);
    }

    /**
     * 상세에는 시도부터 자신까지의 경로가 들어간다.
     */
    public function test_shows_region_with_path(): void
    {
        $this->getJson('/api/v1/regions/4111751000')
            ->assertOk()
            ->assertJsonPath('data.code', '4111751000')
            ->assertJsonPath('data.level', 'emd')
            ->assertJsonPath('data.parent_code', '41117')
            ->assertJsonPath('data.path.*.code', ['41', '41110', '41117', '4111751000']);
    }

    /**
     * children 은 바로 아래 지역만 준다. 수원시 아래는 영통구.
     */
    public function test_lists_direct_children(): void
    {
        $this->getJson('/api/v1/regions/41110/children')
            ->assertOk()
            ->assertJsonPath('data.*.code', ['41117']);
    }

    /**
     * 없는 코드, 바다 코드는 404 를 준다.
     */
    public function test_returns_404_for_unknown_or_sea_code(): void
    {
        $this->getJson('/api/v1/regions/99')
            ->assertNotFound()
            ->assertExactJson(['message' => '지역을 찾을 수 없습니다.']);
        $this->getJson('/api/v1/regions/SEA_W')->assertNotFound();
    }

    /**
     * JSON 응답의 한글은 \uXXXX 로 이스케이프하지 않고 UTF-8 그대로 나간다 (UnescapedUnicodeJson).
     */
    public function test_json_keeps_korean_unescaped(): void
    {
        $body = $this->getJson('/api/v1/regions/99')->assertNotFound()->getContent();

        $this->assertStringContainsString('지역을 찾을 수 없습니다.', $body);
        $this->assertStringNotContainsString('\u', $body);
    }

    /**
     * level 값이 틀리면 422 를 준다.
     */
    public function test_rejects_invalid_level(): void
    {
        $this->getJson('/api/v1/regions?level=country')
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['level']);
    }
}
