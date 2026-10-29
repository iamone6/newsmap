<?php

namespace App\Domain\Stats\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * 지역별 기사 수 한 건 (GET /stats/regions). ListRegionStatsAction 이 만든 배열을 감싼다.
 *
 * @property array{code: string, name: string, article_count: int, latest_title: string|null} $resource
 */
class RegionStatResource extends JsonResource
{
    /**
     * @return array{code: string, name: string, article_count: int, latest_title: string|null}
     */
    public function toArray(Request $request): array
    {
        return [
            'code' => $this->resource['code'],
            'name' => $this->resource['name'],
            'article_count' => $this->resource['article_count'],
            'latest_title' => $this->resource['latest_title'],
        ];
    }
}
