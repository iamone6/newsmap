<?php

/*
| fe ↔ be API 라우트. 전체 경로는 /api/v1/... (prefix 는 bootstrap/app.php 의 apiPrefix).
| 엔드포인트·요청·응답 형식은 contracts/API.md 를 따른다.
*/

use Illuminate\Support\Facades\Route;

// 엔드포인트는 contracts/API.md 순서대로 다음 단계에서 추가한다.
