<?php

namespace App\Domain\Article\DTOs;

use App\Domain\Article\Enums\SearchType;
use App\Domain\Article\Models\Article;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

/**
 * 지역 기사 목록 결과. 검색했을 때만 실제 검색 방식(searchType)이 있다.
 */
final readonly class ArticleListResultDTO
{
    /**
     * @param  LengthAwarePaginator<int, Article>  $articles  페이지 단위 기사
     * @param  SearchType|null  $searchType  검색 방식. 검색어가 없으면 null
     */
    public function __construct(
        public LengthAwarePaginator $articles,
        public ?SearchType $searchType,
    ) {}
}
