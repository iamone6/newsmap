<?php

namespace App\Http\Controllers;

use App\Domain\Auth\Resources\UserResource;
use Illuminate\Http\Request;

/**
 * 로그인한 사용자 정보 (GET /me). 토큰이 없거나 틀리면 auth:sanctum 이 401 을 준다.
 */
class MeController extends Controller
{
    /**
     * @param  Request  $request  인증된 요청
     * @return UserResource {data: {id, name, email}}
     */
    public function show(Request $request): UserResource
    {
        return new UserResource($request->user());
    }
}
