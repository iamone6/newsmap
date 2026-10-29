<?php

namespace App\Domain\Article\Consts;

/**
 * Article 도메인 상수.
 */
class ArticleConsts
{
    /** 목록 excerpt 최대 글자 수 */
    public const int EXCERPT_LENGTH = 120;

    /** 검색 때 search_chunks 에서 가져올 청크 수(= 후보 수). 기사 단위로 묶은 뒤 페이지를 자른다 */
    public const int SEARCH_CHUNK_LIMIT = 300;

    /** Qwen3-Embedding 질의용 instruction. apps/rag/rag/embedder.py 의 QUERY_INSTRUCTION 과 같아야 한다 */
    public const string QUERY_INSTRUCTION = "Instruct: Given a web search query, retrieve relevant passages that answer the query\nQuery: ";
}
