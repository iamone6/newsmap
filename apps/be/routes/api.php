<?php

/*
| fe ↔ be API 라우트. 전체 경로는 /api/v1/... (prefix 는 bootstrap/app.php 의 apiPrefix).
| 엔드포인트·요청·응답 형식은 contracts/API.md 를 따른다. v1 에서 빠진 항목은 API.md "v1 구현 범위".
*/

use App\Http\Controllers\ArticleController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\MeController;
use App\Http\Controllers\RegionController;
use App\Http\Controllers\StatsController;
use Illuminate\Support\Facades\Route;

// 모든 라우트에 limiter 'api' 가 걸려 있다(bootstrap/app.php). 아래 limiter 는 추가 제한이다.

// 1. 인증 (Sanctum Bearer 토큰). 로그인은 이메일+IP 당 제한(limiter 'login')
Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:login');
Route::middleware('auth:sanctum')->group(function (): void {
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/me', [MeController::class, 'show']);
});

// 2. 지역
Route::get('/regions', [RegionController::class, 'index']);
Route::get('/regions/{code}', [RegionController::class, 'show']);
Route::get('/regions/{code}/children', [RegionController::class, 'children']);

// 3. 통계
Route::get('/stats/summary', [StatsController::class, 'summary']);
Route::get('/stats/regions', [StatsController::class, 'regions']);

// 4. 기사. 검색어(q)가 있으면 쿼리 임베딩 비용이 들어 limiter 'search' 로 더 제한한다
Route::get('/regions/{code}/articles', [ArticleController::class, 'indexByRegion'])->middleware('throttle:search');
Route::get('/articles/latest', [ArticleController::class, 'latest']);
