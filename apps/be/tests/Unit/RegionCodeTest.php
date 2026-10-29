<?php

namespace Tests\Unit;

use App\Domain\Shared\Enums\RegionLevel;
use App\Domain\Shared\Exceptions\InvalidRegionCodeException;
use App\Domain\Shared\VOs\RegionCode;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * 지역 코드 API(2/5/10자리) ↔ DB(10자리) 변환 규칙을 검사한다.
 */
class RegionCodeTest extends TestCase
{
    /**
     * @return array<string, array{string, string, RegionLevel}> [API 코드, DB 코드, 단계]
     */
    public static function validCodes(): array
    {
        return [
            '시도' => ['41', '4100000000', RegionLevel::Sido],
            '시군구' => ['41117', '4111700000', RegionLevel::Sigungu],
            '읍면동' => ['4111751000', '4111751000', RegionLevel::Emd],
        ];
    }

    /**
     * API 코드를 DB 코드로 바꾸고 다시 API 코드로 돌아오는지 확인한다.
     */
    #[DataProvider('validCodes')]
    public function test_converts_between_api_and_db_codes(string $apiCode, string $dbCode, RegionLevel $level): void
    {
        $fromApi = RegionCode::fromApi($apiCode);
        $fromDb = RegionCode::fromDb($dbCode);

        $this->assertSame($dbCode, $fromApi->dbCode);
        $this->assertSame($level, $fromApi->level);
        $this->assertSame($apiCode, $fromDb->toApi());
        $this->assertSame($level, $fromDb->level);
    }

    /**
     * @return array<string, array{string}> 잘못된 API 코드
     */
    public static function invalidCodes(): array
    {
        return [
            '숫자 아님' => ['abc'],
            '바다' => ['SEA_W'],
            '섬' => ['ISL_DOKDO'],
            '길이 3' => ['411'],
            '10자리 시군구 패턴' => ['4111700000'],
            '빈 문자열' => [''],
        ];
    }

    /**
     * 형식이 틀린 코드는 예외를 던진다(API 에서는 404).
     */
    #[DataProvider('invalidCodes')]
    public function test_rejects_invalid_api_codes(string $apiCode): void
    {
        $this->expectException(InvalidRegionCodeException::class);

        RegionCode::fromApi($apiCode);
    }
}
