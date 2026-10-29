<?php

namespace App\Domain\Region\Actions;

use App\Domain\Region\Models\Region;
use App\Domain\Shared\Enums\RegionLevel;
use Illuminate\Database\Eloquent\Collection;

/**
 * 현행 지역 목록을 고른다.
 * - level 만: 그 단계의 전국 지역
 * - parent 만: parent 의 바로 아래 지역 (GET /regions/{code}/children)
 * - level + parent: parent 아래(손자 포함)에서 그 단계 지역. 예) 경기도 아래 시군구 = 시 + 일반구
 * - 둘 다 없으면 시도 목록
 */
class ListRegionsAction
{
    /**
     * @param  RegionLevel|null  $level  고를 단계
     * @param  Region|null  $parent  상위 지역
     * @return Collection<int, Region> 코드 순 지역 목록
     */
    public function execute(?RegionLevel $level, ?Region $parent): Collection
    {
        $query = Region::query()->current()->orderBy('code');

        if ($parent === null) {
            $query->where('level', $level ?? RegionLevel::Sido);
        } elseif ($level === null) {
            $query->where('parent_code', $parent->code);
        } else {
            $query->where('level', $level)->descendantsOf($parent->code);
        }

        return $query->get();
    }
}
