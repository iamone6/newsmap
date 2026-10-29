<?php

namespace Tests\Support;

use Illuminate\Support\Facades\DB;

/**
 * 테스트용 지역·기사·청크 행을 직접 넣는다.
 * 기사 테이블은 rag 소유라 factory 대신 schema.sql 컬럼대로 insert 한다.
 */
trait InsertsNewsData
{
    /** 임베딩 차원 (schema.sql 의 halfvec(1024)) */
    protected const int EMBEDDING_DIMENSIONS = 1024;

    /**
     * 수원(시·일반구·동)과 강남(구·동) 지역 마스터를 넣는다.
     * 수원시 영통구(41117)는 일반구라 parent 가 수원시(41110)다.
     */
    protected function insertSampleRegions(): void
    {
        $rows = [
            ['4100000000', 1, '경기도', null, null, '경기도', null],
            ['4111000000', 2, '경기도', '수원시', null, '경기도 수원시', '4100000000'],
            ['4111700000', 2, '경기도', '수원시 영통구', null, '경기도 수원시 영통구', '4111000000'],
            ['4111751000', 3, '경기도', '수원시 영통구', '매탄1동', '경기도 수원시 영통구 매탄1동', '4111700000'],
            ['1100000000', 1, '서울특별시', null, null, '서울특별시', null],
            ['1168000000', 2, '서울특별시', '강남구', null, '서울특별시 강남구', '1100000000'],
            ['1168064000', 3, '서울특별시', '강남구', '역삼1동', '서울특별시 강남구 역삼1동', '1168000000'],
        ];

        foreach ($rows as [$code, $level, $sidoName, $sigunguName, $emdName, $fullName, $parentCode]) {
            DB::table('regions')->insert([
                'code' => $code,
                'level' => $level,
                'sido_name' => $sidoName,
                'sigungu_name' => $sigunguName,
                'emd_name' => $emdName,
                'full_name' => $fullName,
                'parent_code' => $parentCode,
            ]);
        }
    }

    /**
     * 기사 한 건과 대표 지역, 청크 한 개를 넣는다.
     *
     * @param  string  $title  제목
     * @param  array{sido: string|null, sigungu: string|null, emd: string|null}  $region  대표 지역 DB 코드
     * @param  list<string>  $expandedRegionCodes  청크 region_codes (상위 단위까지 펼친 코드)
     * @param  string  $publishedAt  발행 시각 (예: '2026-10-28 08:40:00+09')
     * @param  int  $embeddingAxis  임베딩 벡터에서 1 로 둘 축 (같은 축이면 벡터가 같다)
     * @param  bool  $isWire  통신사 기사 여부
     * @return int 기사 id
     */
    protected function insertArticle(
        string $title,
        array $region,
        array $expandedRegionCodes,
        string $publishedAt = '2026-10-28 08:40:00+09',
        int $embeddingAxis = 0,
        bool $isWire = false,
    ): int {
        $slug = md5($title);
        $body = "{$title} 본문입니다. 지역 소식을 전합니다.";

        $articleId = DB::table('articles')->insertGetId([
            'feed_key' => 'test',
            'publisher_name' => '테스트일보',
            'rss_link' => "https://example.test/rss/{$slug}",
            'canonical_url' => "https://example.test/article/{$slug}",
            'title' => $title,
            'body' => $body,
            'published_at' => $publishedAt,
            'published_at_source' => 'rss_published',
        ]);

        DB::table('article_regions')->insert([
            'article_id' => $articleId,
            'sido_code' => $region['sido'],
            'sigungu_code' => $region['sigungu'],
            'emd_code' => $region['emd'],
            'is_primary' => true,
        ]);

        DB::table('article_chunks')->insert([
            'article_id' => $articleId,
            'chunk_index' => 0,
            'content' => $body,
            'embed_text' => "[제목: {$title}] {$body}",
            'token_count' => 20,
            'embedding' => $this->embeddingLiteral($embeddingAxis),
            'region_codes' => '{'.implode(',', $expandedRegionCodes).'}',
            'published_at' => $publishedAt,
            'is_wire' => $isWire,
        ]);

        return $articleId;
    }

    /**
     * 한 축만 1 인 단위 벡터. 같은 축끼리는 코사인 거리가 0 이다.
     *
     * @param  int  $axis  1 로 둘 축 번호
     * @return list<float> 1024차원 벡터
     */
    protected function unitVector(int $axis): array
    {
        $vector = array_fill(0, self::EMBEDDING_DIMENSIONS, 0.0);
        $vector[$axis] = 1.0;

        return $vector;
    }

    /**
     * pgvector 리터럴 문자열.
     *
     * @param  int  $axis  1 로 둘 축 번호
     * @return string 예) "[1,0,0,...]"
     */
    private function embeddingLiteral(int $axis): string
    {
        return '['.implode(',', $this->unitVector($axis)).']';
    }
}
