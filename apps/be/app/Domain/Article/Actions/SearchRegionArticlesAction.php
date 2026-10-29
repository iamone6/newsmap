<?php

namespace App\Domain\Article\Actions;

use App\Domain\Article\Consts\ArticleConsts;
use App\Domain\Article\DTOs\ArticleListQueryDTO;
use App\Domain\Article\DTOs\ArticleListResultDTO;
use App\Domain\Article\Enums\SearchType;
use App\Domain\Article\Exceptions\QueryEmbeddingFailedException;
use App\Domain\Article\Models\Article;
use App\Domain\Article\Services\QueryEmbeddingService;
use App\Domain\Region\Models\Region;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * 지역 안에서 기사를 검색한다.
 * 쿼리 임베딩이 되면 search_chunks()(BM25 + 벡터 RRF), 실패하면 BM25 만 쓴다.
 * 결과는 청크 단위라 기사 단위로 묶은 뒤(가장 높은 청크 순서 유지) 페이지를 자른다.
 */
class SearchRegionArticlesAction
{
    /**
     * @param  QueryEmbeddingService  $queryEmbedding  검색어 임베딩
     */
    public function __construct(
        private readonly QueryEmbeddingService $queryEmbedding,
    ) {}

    /**
     * @param  Region  $region  검색할 지역 (청크는 하위 지역 포함으로 거른다)
     * @param  ArticleListQueryDTO  $query  검색어·페이지 조건 (searchText 는 null 이 아니어야 한다)
     * @return ArticleListResultDTO 관련도 순 기사 페이지와 검색 방식
     */
    public function execute(Region $region, ArticleListQueryDTO $query): ArticleListResultDTO
    {
        $searchText = (string) $query->searchText;

        try {
            $embedding = $this->queryEmbedding->embed($searchText);
            $chunkRows = $this->searchHybrid($searchText, $embedding, $region);
            $searchType = SearchType::Hybrid;
        } catch (QueryEmbeddingFailedException $exception) {
            Log::warning('쿼리 임베딩 실패로 BM25 검색만 사용', ['error' => $exception->getMessage()]);
            $chunkRows = $this->searchBm25($searchText, $region);
            $searchType = SearchType::Bm25;
        }

        $articleIds = $this->rankedArticleIds($chunkRows);
        if (! $query->includeChildren) {
            $articleIds = $this->keepExactRegionArticles($articleIds, $region);
        }

        return new ArticleListResultDTO($this->paginate($articleIds, $query), $searchType);
    }

    /**
     * search_chunks() 로 하이브리드 검색한다.
     *
     * @param  string  $searchText  검색어
     * @param  list<float>  $embedding  검색어 임베딩
     * @param  Region  $region  지역 필터
     * @return list<object> 점수 순 청크 (article_id 컬럼)
     */
    private function searchHybrid(string $searchText, array $embedding, Region $region): array
    {
        return DB::select(
            'SELECT article_id
             FROM search_chunks(
                 p_query_text      => ?,
                 p_query_embedding => ?::halfvec,
                 p_region_codes    => ARRAY[?]::varchar(10)[],
                 p_exclude_wire    => ?,
                 p_limit           => ?,
                 p_candidates      => ?
             )',
            [
                $searchText,
                $this->queryEmbedding->toVectorLiteral($embedding),
                $region->code,
                (bool) config('newsmap.exclude_wire'),
                ArticleConsts::SEARCH_CHUNK_LIMIT,
                ArticleConsts::SEARCH_CHUNK_LIMIT,
            ],
        );
    }

    /**
     * BM25(pg_search, 한국어 Lindera)만으로 검색한다. search_chunks() 의 text_hits 와 같은 조건이다.
     *
     * @param  string  $searchText  검색어
     * @param  Region  $region  지역 필터
     * @return list<object> 점수 순 청크 (article_id 컬럼)
     */
    private function searchBm25(string $searchText, Region $region): array
    {
        $wireCondition = config('newsmap.exclude_wire') ? 'AND NOT c.is_wire' : '';

        return DB::select(
            "SELECT c.article_id
             FROM article_chunks c
             WHERE c.embed_text ||| ?
               AND c.region_codes && ARRAY[?]::varchar(10)[]
               {$wireCondition}
             ORDER BY pdb.score(c.id) DESC, c.id
             LIMIT ?",
            [$searchText, $region->code, ArticleConsts::SEARCH_CHUNK_LIMIT],
        );
    }

    /**
     * 점수 순 청크에서 기사 id 를 처음 나온 순서대로 중복 없이 뽑는다.
     *
     * @param  list<object>  $chunkRows  점수 순 청크 (article_id 컬럼)
     * @return list<int> 관련도 순 기사 id
     */
    private function rankedArticleIds(array $chunkRows): array
    {
        $articleIds = array_map(fn (object $row): int => (int) $row->article_id, $chunkRows);

        return array_values(array_unique($articleIds));
    }

    /**
     * include_children=0 일 때, 그 단계로만 판정된 기사만 남긴다(순서 유지).
     *
     * @param  list<int>  $articleIds  관련도 순 기사 id
     * @param  Region  $region  지역
     * @return list<int> 걸러진 기사 id
     */
    private function keepExactRegionArticles(array $articleIds, Region $region): array
    {
        $exactIds = Article::query()
            ->whereIn('id', $articleIds)
            ->inRegion($region, includeChildren: false)
            ->pluck('id')
            ->all();

        return array_values(array_intersect($articleIds, $exactIds));
    }

    /**
     * 기사 id 목록에서 요청 페이지만 읽어 페이지네이터로 만든다.
     *
     * @param  list<int>  $articleIds  관련도 순 기사 id
     * @param  ArticleListQueryDTO  $query  페이지 조건
     * @return LengthAwarePaginator<int, Article> 관련도 순 기사 페이지
     */
    private function paginate(array $articleIds, ArticleListQueryDTO $query): LengthAwarePaginator
    {
        $pageIds = array_slice($articleIds, ($query->page - 1) * $query->perPage, $query->perPage);

        $articlesById = Article::query()
            ->whereIn('id', $pageIds)
            ->withListRelations()
            ->get()
            ->keyBy('id');
        $pageArticles = collect($pageIds)
            ->map(fn (int $id): ?Article => $articlesById->get($id))
            ->filter()
            ->values();

        $paginator = new LengthAwarePaginator(
            $pageArticles,
            total: count($articleIds),
            perPage: $query->perPage,
            currentPage: $query->page,
            options: ['path' => LengthAwarePaginator::resolveCurrentPath()],
        );

        return $paginator->withQueryString();
    }
}
