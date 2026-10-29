<?php

namespace Tests\Feature;

use App\Domain\Auth\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

/**
 * 인증 API (POST /auth/login, /auth/logout, GET /me). Sanctum Bearer 토큰.
 */
class AuthApiTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        User::factory()->create(['name' => '김민지', 'email' => 'kim@example.com', 'password' => 'secret']);
    }

    /**
     * 로그인 → 토큰으로 /me → 로그아웃 → 같은 토큰은 401.
     */
    public function test_login_me_and_logout_flow(): void
    {
        $token = $this->postJson('/api/v1/auth/login', [
            'email' => 'kim@example.com',
            'password' => 'secret',
            'device_name' => 'web',
        ])
            ->assertOk()
            ->assertJsonPath('user.email', 'kim@example.com')
            ->json('token');

        $this->withToken($token)->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data', ['id' => User::query()->value('id'), 'name' => '김민지', 'email' => 'kim@example.com']);

        $this->withToken($token)->postJson('/api/v1/auth/logout')->assertNoContent();

        // 테스트 클라이언트는 인증된 사용자를 기억하므로 지워야 토큰 삭제가 반영된다
        $this->app['auth']->forgetGuards();
        $this->withToken($token)->getJson('/api/v1/me')->assertUnauthorized();
    }

    /**
     * 비밀번호가 틀리면 422 와 계약 문구를 준다.
     */
    public function test_rejects_wrong_password(): void
    {
        $this->postJson('/api/v1/auth/login', [
            'email' => 'kim@example.com',
            'password' => 'wrong',
            'device_name' => 'web',
        ])
            ->assertUnprocessable()
            ->assertJsonPath('errors.email', ['이메일 또는 비밀번호가 올바르지 않습니다.']);
    }

    /**
     * 토큰 없이 /me 를 부르면 401 이다.
     */
    public function test_me_requires_token(): void
    {
        $this->getJson('/api/v1/me')
            ->assertUnauthorized()
            ->assertExactJson(['message' => 'Unauthenticated.']);
    }
}
