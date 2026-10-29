<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * JSON 응답의 한글을 \uXXXX 이스케이프 없이 UTF-8 그대로 내보낸다.
 *
 * 왜 필요한가:
 * - PHP json_encode() 는 옵션이 없으면 ASCII 가 아닌 문자를 모두 \uXXXX 로 바꾼다.
 *   Laravel JsonResponse 도 기본 인코딩 옵션이 0 이라 그대로 따른다.
 *   예) "지역을 찾을 수 없습니다." → "지역을 ..."
 * - JSON 표준상 두 표기는 같은 문자열이라 fe(JSON.parse)에는 영향이 없지만,
 *   한글 한 글자가 3바이트(UTF-8) 대신 6바이트가 되어 응답이 커지고,
 *   curl·로그로 응답을 볼 때 읽을 수 없다.
 * - 응답은 Content-Type: application/json(UTF-8)이라 이스케이프하지 않아도 깨지지 않는다.
 *
 * 그래서 모든 JsonResponse 에 JSON_UNESCAPED_UNICODE 를 더한다(기존 옵션은 유지).
 * bootstrap/app.php 에서 전역 미들웨어로 등록해, 라우트가 없는 404 나 예외 응답에도 적용된다.
 */
class UnescapedUnicodeJson
{
    /**
     * @param  Request  $request  요청
     * @param  Closure(Request): Response  $next  다음 미들웨어
     * @return Response JSON 이면 한글을 이스케이프하지 않은 응답
     */
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        if ($response instanceof JsonResponse) {
            $response->setEncodingOptions($response->getEncodingOptions() | JSON_UNESCAPED_UNICODE);
        }

        return $response;
    }
}
