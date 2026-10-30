<?php

namespace Tests\Unit;

use App\Domain\Stats\Services\LegendCalculator;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * 지도 범례 구간(meta.legend)을 기사 수 분포로 계산하는 규칙을 검사한다.
 */
class LegendCalculatorTest extends TestCase
{
    /**
     * @return array<string, array{list<int>, list<int>}> [지역별 기사 수, 기대하는 범례]
     */
    public static function distributions(): array
    {
        return [
            '지역이 없음' => [[], [0, 1]],
            '모두 0건' => [[0, 0, 0], [0, 1]],
            '1건짜리만 있음' => [[0, 1, 1], [0, 1]],
            '한 곳만 기사 있음' => [[0, 0, 5], [0, 1, 5]],
            // 정렬 [230..810] 16개 → 0부터 센 3·6·9·12번째 값
            '시도형 (모두 수백 건)' => [
                [481, 409, 514, 343, 351, 468, 789, 233, 571, 699, 653, 416, 556, 230, 240, 810],
                [0, 1, 343, 416, 514, 653],
            ],
            // 기사 있는 지역 10곳 [1,1,1,1,2,2,3,5,8,20] → 0부터 센 2·4·6·8번째 값 1·2·3·8, 1 은 겹쳐서 2 로 올리고 다음도 차례로 올린다
            '읍면동형 (0건이 대부분, 값이 겹침)' => [
                [...array_fill(0, 30, 0), 1, 1, 1, 1, 2, 2, 3, 5, 8, 20],
                [0, 1, 2, 3, 4, 8],
            ],
            // 값이 모두 같으면 올린 값이 최대를 넘어 구간이 줄어든다
            '모두 같은 값' => [[7, 7, 7, 7], [0, 1, 7]],
        ];
    }

    /**
     * 분포마다 기대하는 구간 시작값이 나오는지 확인한다.
     *
     * @param  list<int>  $articleCounts  지역별 기사 수
     * @param  list<int>  $expected  기대하는 범례
     */
    #[DataProvider('distributions')]
    public function test_calculates_legend_from_distribution(array $articleCounts, array $expected): void
    {
        $this->assertSame($expected, (new LegendCalculator)->calculate($articleCounts));
    }
}
