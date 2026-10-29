<?php

namespace App\Domain\Stats\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * 요약 통계 (GET /stats/summary). GetSummaryAction 이 만든 배열을 감싼다.
 *
 * @property array{total_articles: int, today_articles: int, active_regions: int, updated_at: string|null} $resource
 */
class SummaryResource extends JsonResource
{
    /**
     * @return array{total_articles: int, today_articles: int, active_regions: int, updated_at: string|null}
     */
    public function toArray(Request $request): array
    {
        return [
            'total_articles' => $this->resource['total_articles'],
            'today_articles' => $this->resource['today_articles'],
            'active_regions' => $this->resource['active_regions'],
            'updated_at' => $this->resource['updated_at'],
        ];
    }
}
