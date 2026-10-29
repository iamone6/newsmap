<?php

namespace App\Domain\Article\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * 기사 이미지 (article_images). rag 가 본문에서 모은 이미지로, 기사당 하나는 썸네일(is_thumbnail)이다.
 * 이미지 크기(width/height)는 아직 저장하지 않는다 (contracts/TODO.md).
 *
 * @property int $id
 * @property int $article_id
 * @property int $position
 * @property string $image_url
 * @property string|null $caption
 * @property bool $is_thumbnail
 */
class ArticleImage extends Model
{
    protected $table = 'article_images';

    public $timestamps = false;

    /**
     * 컬럼 타입 변환.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'is_thumbnail' => 'boolean',
        ];
    }

    /**
     * 브라우저에서 바로 열 수 있는 절대 주소(http/https)인지 확인한다.
     * 일부 언론사는 og:image 에 상대 경로(예: /assets/.../share_logo.png)를 넣어 두어 그대로는 쓸 수 없다.
     *
     * @return bool 절대 주소면 true
     */
    public function hasAbsoluteUrl(): bool
    {
        return str_starts_with($this->image_url, 'https://') || str_starts_with($this->image_url, 'http://');
    }
}
