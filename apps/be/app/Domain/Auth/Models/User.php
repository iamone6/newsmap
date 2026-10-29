<?php

namespace App\Domain\Auth\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

/**
 * 서비스 사용자 (users). 인증은 Sanctum Bearer 토큰(personal_access_tokens)으로 한다.
 * 테이블은 contracts/schema.sql 이 진실이다.
 *
 * @property int $id
 * @property string $name
 * @property string $email
 * @property string $password
 */
#[Fillable(['name', 'email', 'password'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory;

    /**
     * 컬럼 타입 변환. password 는 저장할 때 해시된다.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    /**
     * 모델이 App\Models 밖에 있어 factory 를 직접 지정한다.
     *
     * @return UserFactory 사용자 factory
     */
    protected static function newFactory(): UserFactory
    {
        return UserFactory::new();
    }
}
