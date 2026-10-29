<?php

namespace App\Domain\Article\Actions;

use App\Domain\Article\Models\Article;
use Illuminate\Database\Eloquent\Collection;

/**
 * 전국 최신 기사 (GET /articles/latest, 하단 "방금 등록" 티커).
 */
class ListLatestArticlesAction
{
    /**
     * @param  int  $limit  개수 (1~50)
     * @return Collection<int, Article> 최신순 기사
     */
    public function execute(int $limit): Collection
    {
        return Article::query()
            ->withListRelations()
            ->latestPublished()
            ->limit($limit)
            ->get();
    }
}
