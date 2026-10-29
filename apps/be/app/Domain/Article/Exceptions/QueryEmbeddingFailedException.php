<?php

namespace App\Domain\Article\Exceptions;

use RuntimeException;

/**
 * 검색 쿼리 임베딩(DeepInfra) 호출이 실패했을 때 던진다. 검색은 BM25 만으로 계속한다.
 */
class QueryEmbeddingFailedException extends RuntimeException {}
