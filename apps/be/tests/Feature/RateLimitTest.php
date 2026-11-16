<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Http;
use Tests\Support\InsertsNewsData;
use Tests\TestCase;

/**
 * 요청 제한 (config/newsmap.php rate_limits, AppServiceProvider 의 RateLimiter).
 * 횟수를 작게 바꿔서 한도를 넘으면 429 가 나오는지 본다.
 */
class RateLimitTest extends TestCase
{
    use DatabaseTransactions;
    use InsertsNewsData;

    protected function setUp(): void
    {
        parent::setUp();
        $this->insertSampleRegions();
        Http::fake([
            '*/embeddings' => Http::response(['data' => [['embedding' => $this->unitVector(0)]]]),
        ]);
    }

    /**
     * 모든 API 는 limiter 'api' 한도를 넘으면 429 와 Laravel 기본 문구를 준다.
     */
    public function test_api_limit_returns_429(): void
    {
        config(['newsmap.rate_limits.api' => 2]);

        $this->getJson('/api/v1/regions')->assertOk();
        $this->getJson('/api/v1/regions')->assertOk();
        $this->getJson('/api/v1/regions')
            ->assertTooManyRequests()
            ->assertJsonPath('message', 'Too Many Attempts.');
    }

    /**
     * 앞단 Caddy(vultr_proxy)를 거친 요청은 X-Forwarded-For 의 실제 사용자 IP 별로 한도를 센다.
     * trustProxies 가 없으면 모두 앞단 IP 하나로 묶여 두 번째 사용자도 429 를 받는다.
     */
    public function test_api_limit_counts_per_forwarded_client_ip(): void
    {
        config(['newsmap.rate_limits.api' => 1]);

        $this->withHeaders(['X-Forwarded-For' => '203.0.113.10'])->getJson('/api/v1/regions')->assertOk();
        $this->withHeaders(['X-Forwarded-For' => '203.0.113.10'])->getJson('/api/v1/regions')->assertTooManyRequests();
        $this->withHeaders(['X-Forwarded-For' => '203.0.113.20'])->getJson('/api/v1/regions')->assertOk();
    }

    /**
     * 검색 한도는 검색어(q)가 있는 요청에만 걸린다.
     */
    public function test_search_limit_applies_only_with_query(): void
    {
        config(['newsmap.rate_limits.search' => 1]);

        $this->getJson('/api/v1/regions/41/articles?q=조합')->assertOk();
        $this->getJson('/api/v1/regions/41/articles?q=조합')->assertTooManyRequests();
        $this->getJson('/api/v1/regions/41/articles')->assertOk();
    }

    /**
     * 로그인은 같은 이메일로 한도를 넘으면 429 다.
     */
    public function test_login_limit_returns_429(): void
    {
        config(['newsmap.rate_limits.login' => 2]);
        $credentials = ['email' => 'nobody@example.com', 'password' => 'wrong', 'device_name' => 'web'];

        $this->postJson('/api/v1/auth/login', $credentials)->assertUnprocessable();
        $this->postJson('/api/v1/auth/login', $credentials)->assertUnprocessable();
        $this->postJson('/api/v1/auth/login', $credentials)->assertTooManyRequests();
    }
}
