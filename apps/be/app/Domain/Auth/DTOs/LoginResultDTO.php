<?php

namespace App\Domain\Auth\DTOs;

use App\Domain\Auth\Models\User;

/**
 * 로그인 결과. 평문 토큰은 이때 한 번만 알 수 있다(DB 에는 해시만 저장).
 */
final readonly class LoginResultDTO
{
    /**
     * @param  string  $plainTextToken  "id|토큰" 형식 Bearer 토큰
     * @param  User  $user  로그인한 사용자
     */
    public function __construct(
        public string $plainTextToken,
        public User $user,
    ) {}
}
