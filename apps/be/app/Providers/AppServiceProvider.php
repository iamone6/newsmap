<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

/**
 * 앱 공통 서비스 등록·초기화.
 */
class AppServiceProvider extends ServiceProvider
{
    /**
     * 서비스 컨테이너 바인딩.
     */
    public function register(): void
    {
        //
    }

    /**
     * 앱 부팅 시 초기화. 요청 제한(RateLimiter)을 정의한다.
     */
    public function boot(): void
    {
        $this->configureRateLimiting();
    }

    /**
     * API 요청 제한을 정의한다. 횟수는 config/newsmap.php 의 rate_limits (1분당).
     * - api:    모든 API (bootstrap/app.php 에서 api 그룹에 적용)
     * - search: 검색어(q)가 있을 때만 적용, 없으면 제한 없음
     * - login:  로그인 시도
     */
    private function configureRateLimiting(): void
    {
        // auth:sanctum 보다 먼저 실행되므로 Bearer 토큰 사용자를 sanctum 가드로 직접 확인한다
        RateLimiter::for('api', fn (Request $request): Limit => Limit::perMinute(config('newsmap.rate_limits.api'))
            ->by($request->user('sanctum')?->id ?? $request->ip()));

        RateLimiter::for('search', fn (Request $request): Limit => $request->filled('q')
            ? Limit::perMinute(config('newsmap.rate_limits.search'))->by($request->ip())
            : Limit::none());

        RateLimiter::for('login', fn (Request $request): Limit => Limit::perMinute(config('newsmap.rate_limits.login'))
            ->by(mb_strtolower((string) $request->input('email')).'|'.$request->ip()));
    }
}
