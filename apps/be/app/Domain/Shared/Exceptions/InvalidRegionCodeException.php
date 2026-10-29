<?php

namespace App\Domain\Shared\Exceptions;

use RuntimeException;

/**
 * 지역 코드 형식이 틀렸거나 현행 행정구역에 없을 때 던진다.
 * bootstrap/app.php 에서 404 "지역을 찾을 수 없습니다." 로 바꿔 응답한다.
 */
class InvalidRegionCodeException extends RuntimeException
{
    /**
     * @param  string  $regionCode  요청에서 받은 지역 코드
     */
    public function __construct(public readonly string $regionCode)
    {
        parent::__construct("지역을 찾을 수 없습니다: {$regionCode}");
    }
}
