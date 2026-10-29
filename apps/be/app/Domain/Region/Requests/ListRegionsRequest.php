<?php

namespace App\Domain\Region\Requests;

use App\Domain\Shared\Enums\RegionLevel;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * GET /regions 쿼리 검증. level(sido|sigungu|emd), parent(API 지역 코드) 모두 선택.
 */
class ListRegionsRequest extends FormRequest
{
    /**
     * @return array<string, mixed> 검증 규칙
     */
    public function rules(): array
    {
        return [
            'level' => ['nullable', Rule::in(RegionLevel::apiNames())],
            'parent' => ['nullable', 'string', 'max:10'],
        ];
    }

    /**
     * @return array<string, string> 한국어 검증 메시지
     */
    public function messages(): array
    {
        return [
            'level.in' => 'level 값은 sido, sigungu, emd 중 하나여야 합니다.',
            'parent.max' => 'parent 값이 올바르지 않습니다.',
        ];
    }

    /**
     * 검증된 level 값.
     *
     * @return RegionLevel|null 없으면 null
     */
    public function level(): ?RegionLevel
    {
        $level = $this->validated('level');

        return $level === null ? null : RegionLevel::fromApiName($level);
    }

    /**
     * 검증된 parent 값(API 코드).
     *
     * @return string|null 없으면 null
     */
    public function parentCode(): ?string
    {
        return $this->validated('parent');
    }
}
