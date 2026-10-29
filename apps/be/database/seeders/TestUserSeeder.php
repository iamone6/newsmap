<?php

namespace Database\Seeders;

use App\Domain\Auth\Models\User;
use Illuminate\Database\Seeder;
use RuntimeException;

/**
 * 로컬 로그인 확인용 테스트 계정(id test / pw test)을 만든다.
 * 운영 DB 에 약한 계정이 생기지 않도록 APP_ENV=local 에서만 실행된다.
 *
 * 실행: docker compose exec be php artisan db:seed --class=TestUserSeeder
 */
class TestUserSeeder extends Seeder
{
    /**
     * 테스트 계정을 만들거나 비밀번호를 다시 맞춘다.
     *
     * @throws RuntimeException local 환경이 아닐 때
     */
    public function run(): void
    {
        if (! app()->environment('local')) {
            throw new RuntimeException('TestUserSeeder 는 APP_ENV=local 에서만 실행할 수 있습니다.');
        }

        User::query()->updateOrCreate(
            ['email' => 'test'],
            ['name' => 'test', 'password' => 'test'],
        );
    }
}
