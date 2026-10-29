<?php

namespace App\Domain\Shared\Enums;

/**
 * 행정구역 단계. 값은 DB regions.level(smallint) 과 같다.
 * API 에서는 sido / sigungu / emd 문자열로 주고받는다.
 */
enum RegionLevel: int
{
    case Sido = 1;
    case Sigungu = 2;
    case Emd = 3;

    /**
     * API 문자열(sido|sigungu|emd)로 단계를 찾는다.
     *
     * @param  string  $name  API 의 level 값
     * @return self 해당 단계
     *
     * @throws \ValueError 알 수 없는 이름일 때
     */
    public static function fromApiName(string $name): self
    {
        return match ($name) {
            'sido' => self::Sido,
            'sigungu' => self::Sigungu,
            'emd' => self::Emd,
            default => throw new \ValueError("알 수 없는 지역 단계: {$name}"),
        };
    }

    /**
     * API 에 내보낼 단계 이름.
     *
     * @return string sido|sigungu|emd
     */
    public function apiName(): string
    {
        return match ($this) {
            self::Sido => 'sido',
            self::Sigungu => 'sigungu',
            self::Emd => 'emd',
        };
    }

    /**
     * 이 단계의 API 코드 길이. 시도 2, 시군구 5, 읍면동 10.
     *
     * @return int 자릿수
     */
    public function apiCodeLength(): int
    {
        return match ($this) {
            self::Sido => 2,
            self::Sigungu => 5,
            self::Emd => 10,
        };
    }

    /**
     * API 의 level 파라미터 검증에 쓰는 이름 목록.
     *
     * @return list<string> ['sido', 'sigungu', 'emd']
     */
    public static function apiNames(): array
    {
        return array_map(fn (self $level): string => $level->apiName(), self::cases());
    }
}
