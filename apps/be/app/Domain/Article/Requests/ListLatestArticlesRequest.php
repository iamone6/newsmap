<?php

namespace App\Domain\Article\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * GET /articles/latest 쿼리 검증. limit 1~50, 기본 16.
 */
class ListLatestArticlesRequest extends FormRequest
{
    /** 기본 개수 */
    private const int DEFAULT_LIMIT = 16;

    /**
     * @return array<string, mixed> 검증 규칙
     */
    public function rules(): array
    {
        return [
            'limit' => ['nullable', 'integer', 'min:1', 'max:50'],
        ];
    }

    /**
     * @return array<string, string> 한국어 검증 메시지
     */
    public function messages(): array
    {
        return [
            'limit' => 'limit 값은 1~50 사이의 정수여야 합니다.',
        ];
    }

    /**
     * 검증된 개수.
     *
     * @return int 1~50
     */
    public function limit(): int
    {
        return (int) ($this->validated('limit') ?? self::DEFAULT_LIMIT);
    }
}
