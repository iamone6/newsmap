<?php

namespace App\Domain\Article\Requests;

use App\Domain\Article\DTOs\ArticleListQueryDTO;
use App\Domain\Article\Enums\ArticleSort;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * GET /regions/{code}/articles 쿼리 검증.
 * sort(latest|popular), q(검색어), page, per_page(1~50), include_children(1|0).
 */
class ListRegionArticlesRequest extends FormRequest
{
    /** 기본 페이지 크기 */
    private const int DEFAULT_PER_PAGE = 10;

    /**
     * @return array<string, mixed> 검증 규칙
     */
    public function rules(): array
    {
        return [
            'sort' => ['nullable', Rule::enum(ArticleSort::class)],
            'q' => ['nullable', 'string', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:50'],
            'include_children' => ['nullable', Rule::in(['0', '1'])],
        ];
    }

    /**
     * @return array<string, string> 한국어 검증 메시지
     */
    public function messages(): array
    {
        return [
            'sort' => 'sort 값은 latest, popular 중 하나여야 합니다.',
            'q.max' => '검색어는 100자 이하여야 합니다.',
            'page' => 'page 값은 1 이상의 정수여야 합니다.',
            'per_page.max' => 'per_page 값은 50 이하여야 합니다.',
            'per_page' => 'per_page 값은 1~50 사이의 정수여야 합니다.',
            'include_children' => 'include_children 값은 0 또는 1 이어야 합니다.',
        ];
    }

    /**
     * 검증된 값을 조회 조건 DTO 로 만든다. 빈 검색어는 검색하지 않는다.
     *
     * @return ArticleListQueryDTO 조회 조건
     */
    public function toQuery(): ArticleListQueryDTO
    {
        $searchText = trim((string) $this->validated('q'));

        return new ArticleListQueryDTO(
            sort: ArticleSort::tryFrom((string) $this->validated('sort')) ?? ArticleSort::Latest,
            searchText: $searchText === '' ? null : $searchText,
            page: (int) ($this->validated('page') ?? 1),
            perPage: (int) ($this->validated('per_page') ?? self::DEFAULT_PER_PAGE),
            includeChildren: $this->validated('include_children') !== '0',
        );
    }
}
