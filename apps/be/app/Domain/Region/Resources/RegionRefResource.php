<?php

namespace App\Domain\Region\Resources;

use App\Domain\Region\Models\Region;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * 기사에 붙는 지역 요약 {code, name, level}. 코드는 API 형식(2/5/10자리).
 *
 * @mixin Region
 */
class RegionRefResource extends JsonResource
{
    /**
     * @return array{code: string, name: string, level: string}
     */
    public function toArray(Request $request): array
    {
        return [
            'code' => $this->regionCode()->toApi(),
            'name' => $this->name(),
            'level' => $this->level->apiName(),
        ];
    }
}
