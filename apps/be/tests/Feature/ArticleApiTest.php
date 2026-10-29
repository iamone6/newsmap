<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Http;
use Tests\Support\InsertsNewsData;
use Tests\TestCase;

/**
 * 기사 API (GET /regions/{code}/articles, /articles/latest).
 */
class ArticleApiTest extends TestCase
{
    use DatabaseTransactions;
    use InsertsNewsData;

    /** 영통구 매탄1동 기사 id */
    private int $maetanArticleId;

    /** 수원시로만 판정된 기사 id */
    private int $suwonArticleId;

    /** 강남구 기사 id */
    private int $gangnamArticleId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->insertSampleRegions();

        $this->maetanArticleId = $this->insertArticle(
            '매탄동 재개발 조합 설립 인가',
            ['sido' => '4100000000', 'sigungu' => '4111700000', 'emd' => '4111751000'],
            ['4111751000', '4111700000', '4111000000', '4100000000'],
            publishedAt: '2026-10-28 10:00:00+09',
            embeddingAxis: 1,
        );
        $this->suwonArticleId = $this->insertArticle(
            '수원시 버스 노선 개편',
            ['sido' => '4100000000', 'sigungu' => '4111000000', 'emd' => null],
            ['4111000000', '4100000000'],
            publishedAt: '2026-10-28 09:00:00+09',
            embeddingAxis: 2,
        );
        $this->gangnamArticleId = $this->insertArticle(
            '강남역 보행로 정비 공사',
            ['sido' => '1100000000', 'sigungu' => '1168000000', 'emd' => '1168064000'],
            ['1168064000', '1168000000', '1100000000'],
            publishedAt: '2026-10-28 11:00:00+09',
            embeddingAxis: 3,
        );
        $this->insertThumbnail($this->maetanArticleId, 'https://example.test/images/maetan.jpg');
        // 상대 경로 썸네일은 쓸 수 없어 thumbnail 이 null 로 나와야 한다
        $this->insertThumbnail($this->suwonArticleId, '/assets/share_logo.png');
    }

    /**
     * 시로 물으면 일반구·동 기사까지 최신순으로 나오고, 목록 항목 형식이 계약대로다.
     */
    public function test_lists_region_articles_including_children(): void
    {
        $this->getJson('/api/v1/regions/41110/articles')
            ->assertOk()
            ->assertJsonPath('data.*.id', [$this->maetanArticleId, $this->suwonArticleId])
            ->assertJsonPath('data.0.region', ['code' => '4111751000', 'name' => '매탄1동', 'level' => 'emd'])
            ->assertJsonPath('data.0.thumbnail', ['url' => 'https://example.test/images/maetan.jpg', 'width' => null, 'height' => null])
            ->assertJsonPath('data.1.thumbnail', null)
            ->assertJsonPath('data.0.published_at', '2026-10-28T10:00:00+09:00')
            ->assertJsonPath('data.0.source_url', 'https://example.test/article/'.md5('매탄동 재개발 조합 설립 인가'))
            ->assertJsonPath('meta.region', ['code' => '41110', 'name' => '수원시', 'level' => 'sigungu'])
            ->assertJsonPath('meta.total', 2)
            ->assertJsonMissingPath('meta.search_type');
    }

    /**
     * include_children=0 이면 그 단계로만 판정된 기사만 나온다.
     */
    public function test_lists_only_exact_region_articles(): void
    {
        $this->getJson('/api/v1/regions/41110/articles?include_children=0')
            ->assertOk()
            ->assertJsonPath('data.*.id', [$this->suwonArticleId]);
    }

    /**
     * per_page 는 50 이하만 받는다.
     */
    public function test_rejects_too_large_per_page(): void
    {
        $this->getJson('/api/v1/regions/41/articles?per_page=51')
            ->assertUnprocessable()
            ->assertJsonPath('message', 'per_page 값은 50 이하여야 합니다.');
    }

    /**
     * 임베딩이 되면 하이브리드 검색을 하고 search_type 이 hybrid 다.
     */
    public function test_searches_with_hybrid_when_embedding_succeeds(): void
    {
        Http::fake([
            '*/embeddings' => Http::response(['data' => [['embedding' => $this->unitVector(1)]]]),
        ]);

        $this->getJson('/api/v1/regions/41/articles?q=조합')
            ->assertOk()
            ->assertJsonPath('meta.search_type', 'hybrid')
            ->assertJsonPath('data.0.id', $this->maetanArticleId);

        Http::assertSent(fn ($request): bool => str_contains($request['input'], 'Query: 조합'));
    }

    /**
     * 임베딩 호출이 실패하면 BM25 만으로 검색하고 search_type 이 bm25 다.
     */
    public function test_falls_back_to_bm25_when_embedding_fails(): void
    {
        Http::fake(['*/embeddings' => Http::response('error', 500)]);

        $this->getJson('/api/v1/regions/41/articles?q=조합')
            ->assertOk()
            ->assertJsonPath('meta.search_type', 'bm25')
            ->assertJsonPath('data.*.id', [$this->maetanArticleId]);
    }

    /**
     * 전국 최신 기사는 발행일 역순이고 limit 만큼 준다.
     */
    public function test_lists_latest_articles(): void
    {
        $this->getJson('/api/v1/articles/latest?limit=2')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.id', $this->gangnamArticleId)
            ->assertJsonPath('data.0.region.code', '1168064000');
    }
}
