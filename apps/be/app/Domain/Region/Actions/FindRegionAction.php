<?php

namespace App\Domain\Region\Actions;

use App\Domain\Region\Models\Region;
use App\Domain\Shared\Exceptions\InvalidRegionCodeException;
use App\Domain\Shared\VOs\RegionCode;

/**
 * API 지역 코드로 현행 지역을 찾는다. 형식이 틀렸거나 없는(말소된) 코드면 404 로 응답되게 예외를 던진다.
 */
class FindRegionAction
{
    /**
     * @param  string  $apiCode  API 지역 코드 (2/5/10자리)
     * @return Region 현행 지역
     *
     * @throws InvalidRegionCodeException 형식 오류이거나 현행 지역이 아닐 때
     */
    public function execute(string $apiCode): Region
    {
        $regionCode = RegionCode::fromApi($apiCode);

        $region = Region::query()->current()->find($regionCode->dbCode);
        if ($region === null) {
            throw new InvalidRegionCodeException($apiCode);
        }

        return $region;
    }
}
