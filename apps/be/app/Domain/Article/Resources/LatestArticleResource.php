<?php

namespace App\Domain\Article\Resources;

use App\Domain\Article\Models\Article;
use App\Domain\Region\Resources\RegionRefResource;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * 전국 최신 기사 항목 (GET /articles/latest). region 은 기사의 대표 지역.
 *
 * @mixin Article
 */
class LatestArticleResource extends JsonResource
{
    /**
     * @return array{id: int, title: string, source_url: string, region: RegionRefResource|null, published_at: string}
     */
    public function toArray(Request $request): array
    {
        $region = $this->primaryRegion?->deepestRegion();

        return [
            'id' => $this->id,
            'title' => $this->title,
            'source_url' => $this->canonical_url,
            'region' => $region === null ? null : new RegionRefResource($region),
            'published_at' => $this->published_at->toIso8601String(),
        ];
    }
}
