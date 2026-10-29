<?php

namespace App\Domain\Stats\Requests;

use App\Domain\Shared\Enums\RegionLevel;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * GET /stats/regions 쿼리 검증. level(sido|sigungu|emd) 필수, parent(API 지역 코드) 선택.
 */
class ListRegionStatsRequest extends FormRequest
{
    /**
     * @return array<string, mixed> 검증 규칙
     */
    public function rules(): array
    {
        return [
            'level' => ['required', Rule::in(RegionLevel::apiNames())],
            'parent' => ['nullable', 'string', 'max:10'],
        ];
    }

    /**
     * @return array<string, string> 한국어 검증 메시지
     */
    public function messages(): array
    {
        return [
            'level.required' => 'level 값이 필요합니다.',
            'level.in' => 'level 값은 sido, sigungu, emd 중 하나여야 합니다.',
            'parent.max' => 'parent 값이 올바르지 않습니다.',
        ];
    }

    /**
     * 검증된 level 값.
     *
     * @return RegionLevel 집계 단계
     */
    public function level(): RegionLevel
    {
        return RegionLevel::fromApiName($this->validated('level'));
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
