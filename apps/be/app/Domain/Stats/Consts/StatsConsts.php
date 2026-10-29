<?php

namespace App\Domain\Stats\Consts;

/**
 * Stats 도메인 상수.
 */
class StatsConsts
{
    /** active_regions 를 셀 기간(일) */
    public const int ACTIVE_REGION_DAYS = 7;

    /** 지도 범례 구간의 시작값 (contracts/API.md 의 meta.legend) */
    public const array LEGEND = [0, 1, 5, 15, 30];
}
