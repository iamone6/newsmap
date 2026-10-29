<?php

namespace App\Domain\Shared\VOs;

use App\Domain\Shared\Enums\RegionLevel;
use App\Domain\Shared\Exceptions\InvalidRegionCodeException;

/**
 * 지역 코드 값 객체.
 * API 는 시도 2자리 / 시군구 5자리 / 읍면동 10자리, DB 는 항상 10자리(행정동 코드)를 쓴다.
 * 두 형식 사이의 변환은 이 클래스만 한다 (contracts/API.md "API 코드 ↔ DB 코드 변환").
 */
final readonly class RegionCode
{
    /** DB 코드 길이 */
    private const int DB_CODE_LENGTH = 10;

    /**
     * @param  string  $dbCode  DB 형식 10자리 코드
     * @param  RegionLevel  $level  행정구역 단계
     */
    private function __construct(
        public string $dbCode,
        public RegionLevel $level,
    ) {}

    /**
     * API 코드(2/5/10자리)로 만든다. 바다(SEA_*)·섬(ISL_*) 코드는 v1 에서 받지 않는다.
     *
     * @param  string  $apiCode  예) "41", "41117", "4111759000"
     * @return self 변환된 지역 코드
     *
     * @throws InvalidRegionCodeException 숫자가 아니거나 길이가 맞지 않을 때
     */
    public static function fromApi(string $apiCode): self
    {
        if (! ctype_digit($apiCode)) {
            throw new InvalidRegionCodeException($apiCode);
        }

        $level = match (strlen($apiCode)) {
            2 => RegionLevel::Sido,
            5 => RegionLevel::Sigungu,
            10 => RegionLevel::Emd,
            default => throw new InvalidRegionCodeException($apiCode),
        };

        $dbCode = str_pad($apiCode, self::DB_CODE_LENGTH, '0');

        // 10자리라도 뒷자리가 0 으로 끝나면 읍면동이 아니라 시도·시군구 코드다
        if ($level === RegionLevel::Emd && self::levelOfDbCode($dbCode) !== RegionLevel::Emd) {
            throw new InvalidRegionCodeException($apiCode);
        }

        return new self($dbCode, $level);
    }

    /**
     * DB 코드(10자리)로 만든다. 단계는 뒷자리 0 패턴으로 판단한다
     * (apps/db/scripts/load_regions.py 와 같은 규칙).
     *
     * @param  string  $dbCode  예) "4111700000"
     * @return self 지역 코드
     */
    public static function fromDb(string $dbCode): self
    {
        return new self($dbCode, self::levelOfDbCode($dbCode));
    }

    /**
     * API 형식 코드. 단계에 맞춰 앞 2/5/10자리를 쓴다.
     *
     * @return string 예) "41117"
     */
    public function toApi(): string
    {
        return substr($this->dbCode, 0, $this->level->apiCodeLength());
    }

    /**
     * DB 10자리 코드의 단계를 판단한다. XX00000000 은 시도, XXXXX00000 은 시군구, 나머지는 읍면동.
     *
     * @param  string  $dbCode  DB 코드
     * @return RegionLevel 단계
     */
    private static function levelOfDbCode(string $dbCode): RegionLevel
    {
        if (str_ends_with($dbCode, '00000000')) {
            return RegionLevel::Sido;
        }

        if (str_ends_with($dbCode, '00000')) {
            return RegionLevel::Sigungu;
        }

        return RegionLevel::Emd;
    }
}
