<?php

namespace App\Http\Controllers;

use App\Domain\Region\Actions\FindRegionAction;
use App\Domain\Region\Actions\ListRegionsAction;
use App\Domain\Region\Requests\ListRegionsRequest;
use App\Domain\Region\Resources\RegionDetailResource;
use App\Domain\Region\Resources\RegionResource;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * 지역 조회 (GET /regions, /regions/{code}, /regions/{code}/children).
 */
class RegionController extends Controller
{
    /**
     * 지역 목록.
     *
     * @param  ListRegionsRequest  $request  level·parent
     * @param  FindRegionAction  $findRegion  parent 코드 확인
     * @param  ListRegionsAction  $listRegions  목록 Action
     * @return AnonymousResourceCollection {data: [...]}
     */
    public function index(ListRegionsRequest $request, FindRegionAction $findRegion, ListRegionsAction $listRegions): AnonymousResourceCollection
    {
        $parentCode = $request->parentCode();
        $parent = $parentCode === null ? null : $findRegion->execute($parentCode);

        return RegionResource::collection($listRegions->execute($request->level(), $parent));
    }

    /**
     * 지역 상세(시도부터의 경로 포함).
     *
     * @param  string  $code  API 지역 코드
     * @param  FindRegionAction  $findRegion  지역 찾기
     * @return RegionDetailResource {data: {...}}
     */
    public function show(string $code, FindRegionAction $findRegion): RegionDetailResource
    {
        return new RegionDetailResource($findRegion->execute($code));
    }

    /**
     * 바로 아래 지역 목록. /regions?parent={code} 와 같다.
     *
     * @param  string  $code  API 지역 코드
     * @param  FindRegionAction  $findRegion  지역 찾기
     * @param  ListRegionsAction  $listRegions  목록 Action
     * @return AnonymousResourceCollection {data: [...]}
     */
    public function children(string $code, FindRegionAction $findRegion, ListRegionsAction $listRegions): AnonymousResourceCollection
    {
        return RegionResource::collection($listRegions->execute(null, $findRegion->execute($code)));
    }
}
