<?php

namespace App\Http\Controllers;

use App\Domain\Auth\Actions\LoginAction;
use App\Domain\Auth\Actions\LogoutAction;
use App\Domain\Auth\Requests\LoginRequest;
use App\Domain\Auth\Resources\UserResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * 로그인·로그아웃 (POST /auth/login, POST /auth/logout).
 */
class AuthController extends Controller
{
    /**
     * 토큰을 발급한다.
     *
     * @param  LoginRequest  $request  email·password·device_name
     * @param  LoginAction  $login  로그인 Action
     * @return JsonResponse {token, user}
     */
    public function login(LoginRequest $request, LoginAction $login): JsonResponse
    {
        $result = $login->execute(
            $request->validated('email'),
            $request->validated('password'),
            $request->validated('device_name'),
        );

        return response()->json([
            'token' => $result->plainTextToken,
            'user' => new UserResource($result->user),
        ]);
    }

    /**
     * 현재 토큰을 지운다.
     *
     * @param  Request  $request  인증된 요청
     * @param  LogoutAction  $logout  로그아웃 Action
     * @return Response 204 No Content
     */
    public function logout(Request $request, LogoutAction $logout): Response
    {
        $logout->execute($request->user());

        return response()->noContent();
    }
}
