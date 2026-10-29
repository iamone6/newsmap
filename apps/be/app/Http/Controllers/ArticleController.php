<?php

namespace App\Http\Controllers;

use App\Domain\Article\Actions\ListLatestArticlesAction;
use App\Domain\Article\Actions\ListRegionArticlesAction;
use App\Domain\Article\Requests\ListLatestArticlesRequest;
use App\Domain\Article\Requests\ListRegionArticlesRequest;
use App\Domain\Article\Resources\ArticleListResource;
use App\Domain\Article\Resources\LatestArticleResource;
use App\Domain\Region\Actions\FindRegionAction;
use App\Domain\Region\Resources\RegionRefResource;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * 기사 목록 (GET /regions/{code}/articles, /articles/latest).
 */
class ArticleController extends Controller
{
    /**
     * 지역 기사 목록. q 가 있으면 검색 결과(관련도 순)와 meta.search_type 을 준다.
     *
     * @param  string  $code  API 지역 코드
     * @param  ListRegionArticlesRequest  $request  sort·q·page·per_page·include_children
     * @param  FindRegionAction  $findRegion  지역 찾기
     * @param  ListRegionArticlesAction  $listRegionArticles  목록·검색 Action
     * @return AnonymousResourceCollection 페이지네이션 응답 + meta.region(, meta.search_type)
     */
    public function indexByRegion(
        string $code,
        ListRegionArticlesRequest $request,
        FindRegionAction $findRegion,
        ListRegionArticlesAction $listRegionArticles,
    ): AnonymousResourceCollection {
        $region = $findRegion->execute($code);
        $result = $listRegionArticles->execute($region, $request->toQuery());

        $meta = ['region' => new RegionRefResource($region)];
        if ($result->searchType !== null) {
            $meta['search_type'] = $result->searchType->value;
        }

        return ArticleListResource::collection($result->articles)->additional(['meta' => $meta]);
    }

    /**
     * 전국 최신 기사.
     *
     * @param  ListLatestArticlesRequest  $request  limit
     * @param  ListLatestArticlesAction  $listLatestArticles  최신 기사 Action
     * @return AnonymousResourceCollection {data: [...]}
     */
    public function latest(ListLatestArticlesRequest $request, ListLatestArticlesAction $listLatestArticles): AnonymousResourceCollection
    {
        return LatestArticleResource::collection($listLatestArticles->execute($request->limit()));
    }
}
