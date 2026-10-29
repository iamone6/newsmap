<?php

/*
| newsmap 서비스 설정. 값은 apps/be/.env 에서 읽는다.
*/

return [

    /*
    | 검색 쿼리 임베딩 (DeepInfra OpenAI 호환 API).
    | rag 가 문서를 임베딩한 모델·차원과 같아야 한다 (apps/rag/.env).
    */
    'embedding' => [
        'base_url' => env('DEEPINFRA_BASE_URL', 'https://api.deepinfra.com/v1/openai'),
        'api_key' => env('DEEPINFRA_API_KEY'),
        'model' => env('EMBEDDING_MODEL', 'Qwen/Qwen3-Embedding-0.6B'),
        'dimensions' => (int) env('EMBEDDING_DIMENSIONS', 1024),
        'timeout_seconds' => 5,
        'cache_seconds' => 60 * 60 * 24,
    ],

    /*
    | 검색(search_chunks)에서 통신사 기사 청크를 뺄지 여부 (p_exclude_wire).
    */
    'exclude_wire' => (bool) env('RAG_EXCLUDE_WIRE', true),

    /*
    | 통계 API 응답 캐시 시간(초).
    */
    'stats_cache_seconds' => 60,

    /*
    | 요청 제한(1분당 횟수). AppServiceProvider 의 RateLimiter 가 읽는다. 초과하면 429.
    | - api:    모든 API. 로그인 사용자는 사용자 id, 아니면 IP 기준.
    |           fe 한 화면 사용은 분당 수십 회 수준(첫 로드 4회, 줌·지역 클릭·페이지 이동, 검색 300ms 디바운스).
    |           통신사 CGNAT 처럼 여러 사용자가 한 IP 를 쓰는 경우를 생각해 여유를 둔다.
    | - search: 검색어(q)가 있는 기사 목록. 쿼리 임베딩(DeepInfra) 호출 비용이 들어 따로 더 낮게 잡는다. IP 기준.
    | - login:  로그인 시도. 비밀번호 무차별 대입을 막는다. 이메일 + IP 기준.
    */
    'rate_limits' => [
        'api' => 120,
        'search' => 30,
        'login' => 5,
    ],

];
