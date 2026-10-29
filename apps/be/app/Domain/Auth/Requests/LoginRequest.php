<?php

namespace App\Domain\Auth\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /auth/login 본문 검증.
 * email 은 이메일 형식을 검사하지 않는다(로컬 테스트 계정 id 가 "test").
 */
class LoginRequest extends FormRequest
{
    /**
     * @return array<string, mixed> 검증 규칙
     */
    public function rules(): array
    {
        return [
            'email' => ['required', 'string', 'max:255'],
            'password' => ['required', 'string'],
            'device_name' => ['required', 'string', 'max:255'],
        ];
    }

    /**
     * @return array<string, string> 한국어 검증 메시지
     */
    public function messages(): array
    {
        return [
            'email.required' => '이메일을 입력해 주세요.',
            'password.required' => '비밀번호를 입력해 주세요.',
            'device_name.required' => 'device_name 값이 필요합니다.',
        ];
    }
}
