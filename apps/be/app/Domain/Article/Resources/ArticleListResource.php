<?php

namespace App\Domain\Article\Resources;

use App\Domain\Article\Consts\ArticleConsts;
use App\Domain\Article\Models\Article;
use App\Domain\Region\Resources\RegionRefResource;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Str;

/**
 * 지역 기사 목록 항목 (GET /regions/{code}/articles).
 * v1 은 이미지 크기를 저장하지 않아 thumbnail 의 width/height 가 null 이다 (contracts/API.md v1 구현 범위).
 * 썸네일 주소가 절대 주소(http/https)가 아니면 thumbnail 을 null 로 준다.
 *
 * @mixin Article
 */
class ArticleListResource extends JsonResource
{
    /**
     * @return array{id: int, title: string, excerpt: string, thumbnail: array{url: string, width: null, height: null}|null, region: RegionRefResource|null, source_url: string, published_at: string}
     */
    public function toArray(Request $request): array
    {
        $region = $this->primaryRegion?->deepestRegion();
        $thumbnail = $this->thumbnail?->hasAbsoluteUrl() ? $this->thumbnail : null;

        return [
            'id' => $this->id,
            'title' => $this->title,
            'excerpt' => Str::limit($this->body, ArticleConsts::EXCERPT_LENGTH),
            'thumbnail' => $thumbnail === null ? null : [
                'url' => $thumbnail->image_url,
                'width' => null,
                'height' => null,
            ],
            'region' => $region === null ? null : new RegionRefResource($region),
            'source_url' => $this->canonical_url,
            'published_at' => $this->published_at->toIso8601String(),
        ];
    }
}
