<?php

namespace App\Domain\Article\Models;

use App\Domain\Region\Models\Region;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * 기사-지역 연결 (article_regions). 코드는 regions 에 매칭된 DB 10자리, 매칭 실패 단위는 NULL.
 *
 * @property int $article_id
 * @property string|null $sido_code
 * @property string|null $sigungu_code
 * @property string|null $emd_code
 * @property bool $is_primary
 * @property-read Region|null $sidoRegion
 * @property-read Region|null $sigunguRegion
 * @property-read Region|null $emdRegion
 */
class ArticleRegion extends Model
{
    protected $table = 'article_regions';

    public $timestamps = false;

    /**
     * 컬럼 타입 변환.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'is_primary' => 'boolean',
        ];
    }

    /**
     * @return BelongsTo<Region, $this> 시도
     */
    public function sidoRegion(): BelongsTo
    {
        return $this->belongsTo(Region::class, 'sido_code', 'code');
    }

    /**
     * @return BelongsTo<Region, $this> 시군구
     */
    public function sigunguRegion(): BelongsTo
    {
        return $this->belongsTo(Region::class, 'sigungu_code', 'code');
    }

    /**
     * @return BelongsTo<Region, $this> 읍면동
     */
    public function emdRegion(): BelongsTo
    {
        return $this->belongsTo(Region::class, 'emd_code', 'code');
    }

    /**
     * 판정된 가장 깊은 단계의 지역 (읍면동 → 시군구 → 시도 순으로 있는 것).
     *
     * @return Region|null 매칭된 지역이 하나도 없으면 null
     */
    public function deepestRegion(): ?Region
    {
        return $this->emdRegion ?? $this->sigunguRegion ?? $this->sidoRegion;
    }
}
