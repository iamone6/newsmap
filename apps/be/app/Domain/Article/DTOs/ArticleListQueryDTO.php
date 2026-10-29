<?php

namespace App\Domain\Article\DTOs;

use App\Domain\Article\Enums\ArticleSort;

/**
 * 지역 기사 목록 조회 조건 (GET /regions/{code}/articles 쿼리).
 */
final readonly class ArticleListQueryDTO
{
    /**
     * @param  ArticleSort  $sort  정렬 (검색어가 있으면 무시하고 관련도 순)
     * @param  string|null  $searchText  검색어. 없거나 공백이면 null
     * @param  int  $page  페이지 (1부터)
     * @param  int  $perPage  페이지 크기 (1~50)
     * @param  bool  $includeChildren  하위 지역 기사 포함 여부
     */
    public function __construct(
        public ArticleSort $sort,
        public ?string $searchText,
        public int $page,
        public int $perPage,
        public bool $includeChildren,
    ) {}
}
