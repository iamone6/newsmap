<?php

namespace App\Domain\Region\Resources;

use App\Domain\Region\Models\Region;
use App\Domain\Shared\VOs\RegionCode;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * 지역 한 건 (GET /regions 목록 항목). 코드는 API 형식(2/5/10자리)으로 내보낸다.
 *
 * @mixin Region
 */
class RegionResource extends JsonResource
{
    /**
     * @return array{code: string, name: string, level: string, parent_code: string|null}
     */
    public function toArray(Request $request): array
    {
        return [
            'code' => $this->regionCode()->toApi(),
            'name' => $this->name(),
            'level' => $this->level->apiName(),
            'parent_code' => $this->parent_code === null ? null : RegionCode::fromDb($this->parent_code)->toApi(),
        ];
    }
}
