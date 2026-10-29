<?php

namespace App\Domain\Auth\Actions;

use App\Domain\Auth\Models\User;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * 현재 요청에 쓴 토큰만 지운다 (POST /auth/logout). 다른 기기의 토큰은 그대로 둔다.
 */
class LogoutAction
{
    /**
     * @param  User  $user  로그인한 사용자 (auth:sanctum 으로 인증됨)
     */
    public function execute(User $user): void
    {
        $token = $user->currentAccessToken();

        if ($token instanceof PersonalAccessToken) {
            $token->delete();
        }
    }
}
