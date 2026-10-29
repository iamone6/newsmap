<?php

namespace App\Domain\Article\Enums;

/**
 * 검색(q)에 실제로 쓴 방식. 목록 응답 meta.search_type 으로 내보낸다.
 * 쿼리 임베딩이 실패하면 Bm25 로 내려간다.
 */
enum SearchType: string
{
    /** BM25 + 벡터를 RRF 로 결합 (search_chunks) */
    case Hybrid = 'hybrid';

    /** BM25 키워드 검색만 */
    case Bm25 = 'bm25';
}
