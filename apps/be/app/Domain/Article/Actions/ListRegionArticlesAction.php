<?php

namespace App\Domain\Article\Actions;

use App\Domain\Article\DTOs\ArticleListQueryDTO;
use App\Domain\Article\DTOs\ArticleListResultDTO;
use App\Domain\Article\Models\Article;
use App\Domain\Region\Models\Region;

/**
 * 지역 기사 목록 (GET /regions/{code}/articles).
 * 검색어가 있으면 하이브리드 검색으로, 없으면 최신순 목록으로 돌려준다.
 */
class ListRegionArticlesAction
{
    /**
     * @param  SearchRegionArticlesAction  $searchRegionArticles  검색어가 있을 때 쓰는 검색 Action
     */
    public function __construct(
        private readonly SearchRegionArticlesAction $searchRegionArticles,
    ) {}

    /**
     * @param  Region  $region  선택한 지역
     * @param  ArticleListQueryDTO  $query  정렬·검색어·페이지 조건
     * @return ArticleListResultDTO 페이지 단위 기사와 검색 방식
     */
    public function execute(Region $region, ArticleListQueryDTO $query): ArticleListResultDTO
    {
        if ($query->searchText !== null) {
            return $this->searchRegionArticles->execute($region, $query);
        }

        // v1 은 조회수가 없어 sort=popular 도 최신순으로 정렬한다
        $articles = Article::query()
            ->inRegion($region, $query->includeChildren)
            ->withListRelations()
            ->latestPublished()
            ->paginate(perPage: $query->perPage, page: $query->page)
            ->withQueryString();

        return new ArticleListResultDTO($articles, searchType: null);
    }
}
