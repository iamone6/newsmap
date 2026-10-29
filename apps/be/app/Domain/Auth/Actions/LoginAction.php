<?php

namespace App\Domain\Auth\Actions;

use App\Domain\Auth\DTOs\LoginResultDTO;
use App\Domain\Auth\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

/**
 * 이메일(계정 id)·비밀번호를 확인하고 Sanctum 토큰을 발급한다 (POST /auth/login).
 */
class LoginAction
{
    /** 로그인 실패 문구 (contracts/API.md) */
    private const string FAILED_MESSAGE = '이메일 또는 비밀번호가 올바르지 않습니다.';

    /**
     * @param  string  $email  이메일 또는 계정 id
     * @param  string  $password  비밀번호
     * @param  string  $deviceName  토큰 이름(발급 기기)
     * @return LoginResultDTO 평문 토큰과 사용자
     *
     * @throws ValidationException 계정이 없거나 비밀번호가 틀릴 때 (422)
     */
    public function execute(string $email, string $password, string $deviceName): LoginResultDTO
    {
        $user = User::query()->where('email', $email)->first();

        if ($user === null || ! Hash::check($password, $user->password)) {
            throw ValidationException::withMessages(['email' => [self::FAILED_MESSAGE]]);
        }

        $token = $user->createToken($deviceName);

        return new LoginResultDTO($token->plainTextToken, $user);
    }
}
