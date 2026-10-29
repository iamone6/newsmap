<?php

use App\Domain\Shared\Exceptions\InvalidRegionCodeException;
use App\Http\Middleware\UnescapedUnicodeJson;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    // API 전용 서버라 web 라우트는 두지 않는다. 화면(/)은 Caddyfile 이 fe 컨테이너로 넘긴다.
    ->withRouting(
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
        apiPrefix: 'api/v1',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // JSON 응답의 한글을 \uXXXX 없이 UTF-8 그대로 내보낸다 (이유는 미들웨어 주석)
        $middleware->append(UnescapedUnicodeJson::class);

        // 모든 API 에 요청 제한 (limiter 'api', 횟수는 config/newsmap.php rate_limits)
        $middleware->throttleApi();
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );

        // 형식이 틀렸거나 없는(말소된) 지역 코드는 404 로 응답한다 (contracts/API.md 공통 에러). 오류 로그는 남기지 않는다
        $exceptions->dontReport(InvalidRegionCodeException::class);
        $exceptions->render(fn (InvalidRegionCodeException $exception) => response()->json(
            ['message' => '지역을 찾을 수 없습니다.'],
            404,
        ));
    })->create();
