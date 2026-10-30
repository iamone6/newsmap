<?php

namespace App\Domain\Stats\Services;

use App\Domain\Stats\Consts\StatsConsts;

/**
 * 지도 범례 구간(contracts/API.md 의 meta.legend)을 기사 수 분포로 계산한다.
 *
 * - 첫 구간은 0건, 둘째 구간은 1건부터 시작한다.
 * - 기사가 있는 지역을 기사 수로 정렬해 StatsConsts::LEGEND_QUANTILE_COUNT 등분하고,
 *   각 등분이 시작하는 기사 수를 나머지 구간의 시작값으로 쓴다.
 * - 시작값은 앞 값보다 커야 해서, 값이 겹치면 1씩 올리고 최대 기사 수를 넘는 구간은 버린다.
 *   그래서 분포에 따라 구간 수가 줄어들 수 있다.
 */
class LegendCalculator
{
    /**
     * 기사 수 목록으로 범례 구간 시작값을 만든다.
     *
     * @param  list<int>  $articleCounts  지역별 기사 수 (응답에 들어가는 지역 전부)
     * @return list<int> 오름차순 구간 시작값. 예) [0, 1, 365, 453, 532, 707]
     */
    public function calculate(array $articleCounts): array
    {
        $legend = [0, 1];

        $nonZeroCounts = array_values(array_filter($articleCounts, fn (int $count): bool => $count > 0));
        if ($nonZeroCounts === []) {
            return $legend;
        }
        sort($nonZeroCounts);

        $regionCount = count($nonZeroCounts);
        $maxCount = $nonZeroCounts[$regionCount - 1];

        // 1번째 등분은 1건부터 시작하므로(위의 1) 2번째 등분부터 시작값을 구한다
        for ($part = 1; $part < StatsConsts::LEGEND_QUANTILE_COUNT; $part++) {
            $position = intdiv($part * $regionCount, StatsConsts::LEGEND_QUANTILE_COUNT);
            $start = max($nonZeroCounts[$position], end($legend) + 1);
            if ($start > $maxCount) {
                break;
            }
            $legend[] = $start;
        }

        return $legend;
    }
}
