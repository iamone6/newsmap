<?php

namespace App\Domain\Article\Models;

use App\Domain\Region\Models\Region;
use App\Domain\Shared\Enums\RegionLevel;
use Illuminate\Database\Eloquent\Attributes\Scope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * 기사 (articles). 읽기 쪽 애그리거트 루트로, 대표 지역·이미지를 묶는다.
 * rag 가 저장하고 be 는 읽기만 한다.
 *
 * @property int $id
 * @property string $publisher_name
 * @property string $canonical_url
 * @property string $title
 * @property string $body
 * @property Carbon $published_at
 * @property Carbon $created_at
 * @property-read ArticleRegion|null $primaryRegion
 * @property-read ArticleImage|null $thumbnail
 */
class Article extends Model
{
    protected $table = 'articles';

    /**
     * 컬럼 타입 변환.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'published_at' => 'datetime',
            'rss_created_at' => 'datetime',
            'rss_updated_at' => 'datetime',
        ];
    }

    /**
     * 대표 지역 (article_regions.is_primary).
     *
     * @return HasOne<ArticleRegion, $this>
     */
    public function primaryRegion(): HasOne
    {
        return $this->hasOne(ArticleRegion::class)->where('is_primary', true);
    }

    /**
     * 썸네일 이미지 (article_images.is_thumbnail, 기사당 최대 1개).
     *
     * @return HasOne<ArticleImage, $this>
     */
    public function thumbnail(): HasOne
    {
        return $this->hasOne(ArticleImage::class)->where('is_thumbnail', true);
    }

    /**
     * 목록 응답에 필요한 관계(대표 지역과 그 지역 마스터, 썸네일)를 함께 읽는다.
     *
     * @param  Builder<Article>  $query
     */
    #[Scope]
    protected function withListRelations(Builder $query): void
    {
        $query->with(['primaryRegion.sidoRegion', 'primaryRegion.sigunguRegion', 'primaryRegion.emdRegion', 'thumbnail']);
    }

    /**
     * 지역으로 거른다.
     * - includeChildren=true: article_chunks.region_codes(상위 단위까지 펼친 코드)에 지역이 있는 기사.
     *   시도로 물으면 하위 시군구·읍면동 기사, 시로 물으면 일반구 기사까지 잡힌다.
     * - includeChildren=false: article_regions 에서 그 단계 코드가 일치하고 더 아래 단계는 비어 있는 기사.
     *
     * @param  Builder<Article>  $query
     * @param  Region  $region  거를 지역
     * @param  bool  $includeChildren  하위 지역 포함 여부
     */
    #[Scope]
    protected function inRegion(Builder $query, Region $region, bool $includeChildren): void
    {
        if ($includeChildren) {
            $query->whereIn('id', DB::table('article_chunks')
                ->select('article_id')
                ->whereRaw('region_codes && ARRAY[?]::varchar(10)[]', [$region->code]));

            return;
        }

        $exactMatch = DB::table('article_regions')->select('article_id');
        match ($region->level) {
            RegionLevel::Sido => $exactMatch->where('sido_code', $region->code)
                ->whereNull('sigungu_code')
                ->whereNull('emd_code'),
            RegionLevel::Sigungu => $exactMatch->where('sigungu_code', $region->code)
                ->whereNull('emd_code'),
            RegionLevel::Emd => $exactMatch->where('emd_code', $region->code),
        };
        $query->whereIn('id', $exactMatch);
    }

    /**
     * 최신순 정렬 (발행일, 같으면 id 역순).
     *
     * @param  Builder<Article>  $query
     */
    #[Scope]
    protected function latestPublished(Builder $query): void
    {
        $query->orderByDesc('published_at')->orderByDesc('id');
    }
}
