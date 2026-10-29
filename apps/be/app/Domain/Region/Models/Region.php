<?php

namespace App\Domain\Region\Models;

use App\Domain\Shared\Enums\RegionLevel;
use App\Domain\Shared\VOs\RegionCode;
use Illuminate\Database\Eloquent\Attributes\Scope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * 행정구역 마스터 (regions). rag·db 스크립트가 적재하고 be 는 읽기만 한다.
 * 코드는 DB 형식 10자리이며, API 로 내보낼 때는 regionCode()->toApi() 를 쓴다.
 *
 * @property string $code
 * @property RegionLevel $level
 * @property string $sido_name
 * @property string|null $sigungu_name
 * @property string|null $emd_name
 * @property string $full_name
 * @property string|null $parent_code
 */
class Region extends Model
{
    protected $table = 'regions';

    protected $primaryKey = 'code';

    protected $keyType = 'string';

    public $incrementing = false;

    public $timestamps = false;

    /**
     * 컬럼 타입 변환.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'level' => RegionLevel::class,
            'valid_from' => 'date',
            'valid_to' => 'date',
        ];
    }

    /**
     * 상위 지역.
     *
     * @return BelongsTo<Region, $this>
     */
    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_code', 'code');
    }

    /**
     * 현행(말소되지 않은) 지역만 고른다.
     *
     * @param  Builder<Region>  $query
     */
    #[Scope]
    protected function current(Builder $query): void
    {
        $query->whereNull('valid_to');
    }

    /**
     * 주어진 지역 아래의 모든 하위 지역(자식·손자…)만 고른다.
     * 일반구(수원시 영통구)는 시(수원시) 아래에 있으므로 parent_code 한 단계로는 부족해 재귀로 찾는다.
     *
     * @param  Builder<Region>  $query
     * @param  string  $ancestorDbCode  상위 지역 DB 코드
     */
    #[Scope]
    protected function descendantsOf(Builder $query, string $ancestorDbCode): void
    {
        $query->whereRaw(
            'code IN (
                WITH RECURSIVE tree AS (
                    SELECT code FROM regions WHERE parent_code = ?
                    UNION
                    SELECT child.code FROM regions child JOIN tree ON child.parent_code = tree.code
                )
                SELECT code FROM tree
            )',
            [$ancestorDbCode],
        );
    }

    /**
     * 단계에 맞는 지역 이름. 일반구는 "수원시 영통구" 처럼 시 이름을 포함한다.
     * 마스터에 단계 이름이 비어 있는 행(예: 북부출장소, 세종특별자치시 시군구 코드)은 full_name 을 쓴다.
     *
     * @return string 예) "경기도", "수원시 영통구", "매탄1동"
     */
    public function name(): string
    {
        $levelName = match ($this->level) {
            RegionLevel::Sido => $this->sido_name,
            RegionLevel::Sigungu => $this->sigungu_name,
            RegionLevel::Emd => $this->emd_name,
        };

        return ($levelName === null || $levelName === '') ? $this->full_name : $levelName;
    }

    /**
     * 이 지역의 코드 값 객체.
     *
     * @return RegionCode 코드
     */
    public function regionCode(): RegionCode
    {
        return RegionCode::fromDb($this->code);
    }

    /**
     * 시도부터 이 지역까지의 경로. 조상을 parent_code 로 따라 올라간다(최대 4단계).
     *
     * @return list<Region> [시도, 시군구(, 일반구), 읍면동] 순서
     */
    public function pathFromRoot(): array
    {
        $path = [$this];
        $current = $this;
        while ($current->parent_code !== null) {
            $current = self::query()->find($current->parent_code);
            if ($current === null) {
                break;
            }
            array_unshift($path, $current);
        }

        return $path;
    }
}
