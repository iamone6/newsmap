<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

/**
 * 기본 seeder. 기사·지역 데이터는 rag·db 스크립트가 적재하므로 여기서는 로컬 테스트 계정만 만든다.
 */
class DatabaseSeeder extends Seeder
{
    /**
     * 로컬 개발용 데이터를 넣는다.
     */
    public function run(): void
    {
        $this->call(TestUserSeeder::class);
    }
}
