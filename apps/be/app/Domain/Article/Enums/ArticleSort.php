<?php

namespace App\Domain\Article\Enums;

/**
 * 기사 목록 정렬 방식. v1 에는 조회수가 없어 Popular 도 최신순으로 정렬한다 (contracts/API.md v1 구현 범위).
 */
enum ArticleSort: string
{
    case Latest = 'latest';
    case Popular = 'popular';
}
