<?php

namespace Tests\Feature;

use Tests\TestCase;

/**
 * 골격 확인용: 헬스체크(/up)와 API prefix(/api/v1) 동작을 검사한다.
 */
class HealthCheckTest extends TestCase
{
    /**
     * /up 이 200 을 돌려주는지 확인한다. 컨테이너 healthcheck 가 이 경로를 쓴다.
     */
    public function test_health_check_returns_ok(): void
    {
        $this->get('/up')->assertOk();
    }

    /**
     * 없는 API 경로는 HTML 이 아니라 JSON 404 를 돌려주는지 확인한다.
     */
    public function test_unknown_api_path_returns_json_404(): void
    {
        $this->get('/api/v1/not-found')
            ->assertNotFound()
            ->assertHeader('Content-Type', 'application/json');
    }
}
