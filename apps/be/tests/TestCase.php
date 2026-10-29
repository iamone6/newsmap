<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use RuntimeException;

/**
 * 모든 테스트의 기반. 테스트가 개발 DB 를 건드리지 않도록 DB 이름을 확인한다.
 */
abstract class TestCase extends BaseTestCase
{
    /** 테스트 전용 DB 이름 (phpunit.xml) */
    private const string TEST_DATABASE = 'newsmap_test';

    /**
     * 앱을 띄운 뒤 테스트 DB 를 가리키는지 확인한다.
     *
     * @throws RuntimeException 다른 DB 를 가리킬 때
     */
    protected function setUp(): void
    {
        parent::setUp();

        $database = config('database.connections.'.config('database.default').'.database');
        if ($database !== self::TEST_DATABASE) {
            throw new RuntimeException('테스트는 '.self::TEST_DATABASE." DB 에서만 실행합니다. 현재: {$database}");
        }
    }
}
