<?php

namespace App\Domain\Region\Resources;

use App\Domain\Region\Models\Region;
use Illuminate\Http\Request;

/**
 * 지역 상세 (GET /regions/{code}). 목록 항목에 시도부터의 경로(path)를 더한다.
 *
 * @mixin Region
 */
class RegionDetailResource extends RegionResource
{
    /**
     * @return array{code: string, name: string, level: string, parent_code: string|null, path: mixed}
     */
    public function toArray(Request $request): array
    {
        return [
            ...parent::toArray($request),
            'path' => RegionRefResource::collection($this->pathFromRoot()),
        ];
    }
}
