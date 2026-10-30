<?php

namespace App\Domain\Stats\Consts;

/**
 * Stats 도메인 상수.
 */
class StatsConsts
{
    /** active_regions 를 셀 기간(일) */
    public const int ACTIVE_REGION_DAYS = 7;

    /** 지도 범례에서 기사가 있는 지역을 몇 등분할지 (0건 구간과 합쳐 fe 색 단계 6개와 맞춘다) */
    public const int LEGEND_QUANTILE_COUNT = 5;
}
