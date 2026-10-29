# be CLAUDE.md

지역 기사 목록·하이브리드 검색 API. 루트 `CLAUDE.md`의 공통 원칙을 따르고, 여기에는 be 고유의 구현·검증 방법만 적는다.
API 형식은 `contracts/API.md`, DB 는 `contracts/schema.sql` 이 진실이다.

## 기술 스택
| 구분 | 사용 | 버전 |
|---|---|---|
| 언어 | PHP | 8.5.12 |
| 프레임워크 | Laravel | 13.39 |
| 서버 | FrankenPHP (Caddy 내장) + Laravel Octane worker 모드 | 1.13.4 / Octane 2.22 |
| 인증 | Laravel Sanctum (Bearer 토큰) | 4.x |
| DB | PostgreSQL (pdo_pgsql) | 18.6 |
| 패키지 | Composer | 2.10.3 |

- 버전은 `dockerfiles/be.dockerfile` 의 `ARG` 로 고정한다. 올릴 때는 ARG 와 `composer.json` 의 `php` 요구사항을 함께 본다.
- 호스트에 PHP·Composer 를 설치하지 않는다. composer·artisan 은 모두 컨테이너 안에서 실행한다.

## 구성 개요
- 이 프로젝트는 DDD 중 Martin Joo 의 2단 구조(애플리케이션 계층 `app/Http` + 도메인 계층 `app/Domain`)를 기반으로 한다.
- 도메인은 `apps/be/app/Domain/<도메인>/` 하위에 위치한다. 도메인 이름은 단수 PascalCase 이다.
  - 도메인: `Article`(기사 목록·검색, 쿼리 임베딩), `Region`(지역 조회), `Stats`(집계), `Auth`(사용자·Sanctum 토큰), `Shared`(지역 코드 VO `RegionCode`, `RegionLevel`).
  - 기사는 DB(`articles`)·rag 와 같게 **Article** 로 부른다. API 경로도 `/articles` 이다(`contracts/API.md`).
- 두 개 이상의 도메인에서 사용하는 공통 요소는 `apps/be/app/Domain/Shared/` 하위에 위치한다.
- 각 도메인은 아래 디렉터리를 **필요할 때만** 만든다(빈 디렉터리를 미리 두지 않는다). 필요시 디렉터리를 추가할 수 있다.
  - Actions : 하나의 유스케이스를 수행하는 Action 클래스. 공개 진입점은 `execute()` 하나다. `*Action.php` 로 네이밍한다.
  - Services : 여러 Action 이 함께 쓰는 로직이나 외부 API 연동(예: 쿼리 임베딩). `*Service.php` 로 네이밍한다.
  - DTOs : 계층 사이에 데이터를 넘기는 객체. PHP `readonly class` 로 만든다(spatie/laravel-data 를 쓰지 않는다). `*DTO.php` 로 네이밍한다.
  - VOs : Value Object(예: 지역 코드). 불변이고 생성 시 검증한다. VO 는 이 디렉터리에만 둔다.
  - Consts : 해당 도메인에서만 사용하는 상수를 public const 로 정의한 클래스. `*Consts.php` 로 네이밍한다.
  - Enums : 해당 도메인에서 사용하는 Enum.
  - Models : Eloquent 모델. `app/Models` 는 쓰지 않는다(`User` 는 `Domain/Auth/Models`). 모델 factory 는 `$model` 을 직접 지정한다.
  - Requests : FormRequest 를 상속받은 Request 객체. `*Request.php` 로 네이밍한다.
  - Resources : API 응답 형식을 만드는 `JsonResource`. `*Resource.php` 로 네이밍한다.
- Controller 는 `app/Http/Controllers/` 에 도메인 하위 폴더 없이 둔다. Controller 는 Request 검증 → Action `execute()` 호출 → Resource 반환만 한다.
- Repository 계층은 두지 않는다. 조회 쿼리(`search_chunks()` 같은 raw SQL 포함)는 해당 도메인 Action 안에 둔다.
- 애그리거트: be 는 rag 테이블을 읽기만 하므로 Article 이 이미지·지역·섹션을 묶는 읽기 쪽 루트다. 쓰기 애그리거트는 be 가 소유한 테이블(users 등)에만 생긴다.
- 지역 코드 변환은 be 책임이다: API 2/5/10자리 ↔ DB 10자리 (`contracts/API.md` 의 규칙). `Shared/VOs/RegionCode` 만 변환한다.
  - 잘못되거나 말소된 코드는 `InvalidRegionCodeException` → `bootstrap/app.php` 에서 404 JSON.
  - 일반구(수원시 영통구)의 parent 는 시(수원시)라 "하위 지역"은 `Region::descendantsOf()`(재귀) 로 찾는다.
- v1 에서 스키마에 없어 빼는 API 항목은 `contracts/API.md` 의 "v1 구현 범위"를 따른다.
- 서비스 설정은 `config/newsmap.php`(쿼리 임베딩, `exclude_wire`, 통계 캐시 시간, 요청 제한 `rate_limits`).
- 요청 제한: `AppServiceProvider` 에 limiter `api`(모든 API, `bootstrap/app.php` 의 `throttleApi()`), `search`(q 가 있을 때만), `login` 을 정의한다. 한도·근거는 `config/newsmap.php` 주석과 `contracts/API.md` "요청 제한".
  - limiter 카운터는 기본 캐시(`file`)에 쌓인다. 서버를 여러 대로 늘리면 Redis 같은 공유 캐시로 바꿔야 한다.
  - 앞에 프록시·CDN(Cloudflare 등)을 두면 `$request->ip()` 가 프록시 IP 가 되므로 `trustProxies` 를 설정해야 한다.
- JSON 응답의 한글은 `UnescapedUnicodeJson` 미들웨어로 `\uXXXX` 없이 나간다.
- 검색: 쿼리 임베딩(`QueryEmbeddingService`, rag 와 같은 Qwen3 query instruction, 1일 캐시)이 되면 `search_chunks()`, 실패하면 BM25 만 쓰고 `meta.search_type` 으로 알린다.
- 캐시는 `cache.serializable_classes=false` 라 객체를 되살리지 못한다. 캐시에는 배열·스칼라만 넣는다.
- Octane worker 라 요청 상태를 static·singleton 에 두지 않는다.

## Laravel Boost 가이드라인 적용 범위
아래 `<laravel-boost-guidelines>` 는 Boost 가 생성한 일반 규칙이다. 이 문서·루트 `CLAUDE.md` 와 다르면 **프로젝트 규칙이 우선**한다.
- `php artisan make:` 는 Laravel 기본 위치에 만든다. `app/Domain` 아래 클래스는 직접 작성해도 된다(컨테이너 artisan 부팅이 5초쯤 걸림).
- 모델의 factory·seeder 는 테스트에 필요할 때만 만든다. 기사·지역 테이블은 rag 소유라 seeder 를 두지 않는다.
- 문서 파일 규칙은 루트 `CLAUDE.md`(문서 갱신, `contracts/TODO.md` 기록)를 따른다.
- PHPDoc 은 한국어로, 클래스·메서드마다 역할과 파라미터·리턴 타입을 적는다.
- Deployment(Laravel Cloud) 항목은 무시한다. 배포는 `contracts/TODO.md` 의 Vultr CI/CD 를 따른다.
- `composer`, `php artisan`, `vendor/bin/pint`, `vendor/bin/phpunit` 은 모두 `docker compose exec be …` 로 실행한다(호스트에 PHP 없음).
- 테스트는 PostgreSQL 전용 기능(pgvector, pg_search, `search_chunks()`)을 쓰므로 sqlite 가 아니라 db 컨테이너의 `newsmap_test` DB 를 쓴다(아래 "테스트").


## 요청 흐름 (be 가 서비스 앞단)
```
브라우저 → be(FrankenPHP/Caddy :80, 로컬 :4000)
            ├─ /api/*, /up, /sanctum/*  → Laravel (Octane worker)
            └─ 그 외 (지도 화면, /geo/*) → fe:3000 (Next.js)
```
- 설정은 `Caddyfile`. fe 와 같은 도메인이라 CORS 설정이 없다. fe 는 `NEXT_PUBLIC_API_BASE_URL=/api/v1` 상대 경로로 호출한다.
- `SERVER_NAME=:80` 이면 HTTP 만, 도메인을 넣으면 Caddy 가 인증서를 자동 발급한다(인증서는 `caddy_data` 볼륨).
- `http://localhost` 사이트는 컨테이너 healthcheck(`/up`)용이다.
- API 는 `/api/v1` prefix(`bootstrap/app.php` 의 `apiPrefix`). web 라우트는 두지 않는다.

## 명령 (레포 루트에서)
```bash
# 로컬 개발: dev 타깃 + 소스 bind mount (docker-compose.override.yml). http://localhost:4000
docker compose up -d --build be
docker compose logs -f be

# 코드 변경은 dev-server 가 1초 안에 감지해 워커를 다시 띄운다 (재빌드 불필요)
# .env 를 바꾸면 컨테이너 환경변수라 재생성이 필요하다
docker compose up -d --force-recreate be

# composer / artisan (컨테이너 안). 9p 마운트라 artisan 1회 부팅에 5초쯤 걸린다
docker compose exec be composer require vendor/package
docker compose exec be php artisan route:list
docker compose exec be php artisan db:show
docker compose exec be php artisan test

# prod 이미지 빌드 (override 없이 기본 타깃 prod)
docker compose -f docker-compose.yml build be
```
- 주의: `docker compose -f docker-compose.yml up` 은 override 를 빼므로 로컬에서 db 볼륨 경로가 바뀐다. prod 이미지 동작 확인은 `docker run --network newsmap_default --env-file apps/be/.env -e DB_HOST=db -p 4080:80 newsmap-be:0.1.0` 처럼 따로 띄운다.

## 이미지 구성 (`dockerfiles/be.dockerfile`)
- **base**: FrankenPHP 공식 이미지(Debian trixie) + `pdo_pgsql pcntl intl zip opcache`, composer, 시간대 Asia/Seoul.
- **dev**: php.ini-development, `dev-server` 스크립트로 실행.
  - Windows Docker 의 bind mount 는 9p 라 inotify 가 오지 않아 `octane --watch` 가 동작하지 않는다.
  - 그래서 1초마다 `app bootstrap config routes database` 의 파일 목록·수정 시각 해시를 비교하고, 바뀌면 Caddy admin API(`POST localhost:2019/frankenphp/workers/restart`)로 워커를 재시작한다. `php artisan octane:reload` 는 artisan 부팅이 느려 쓰지 않는다.
- **prod**(기본): `composer install --no-dev`, 소스 COPY, 비루트 `app` 사용자. 기동 때 `php artisan optimize`(런타임 .env 가 필요해서) 후 `octane:frankenphp`.
- `public/frankenphp-worker.php` 는 Octane 이 `.gitignore` 에 넣지만 prod 이미지에서 생성할 권한이 없어 커밋한다.

## 환경변수 (`.env`, 키 목록은 `.env.example` — 값은 비워 둔다)
| 키 | 설명 |
|---|---|
| `APP_*` | `APP_KEY` 는 `php artisan key:generate --show` 로 만든다 |
| `LOG_CHANNEL` | `stderr` (docker compose logs 로 확인) |
| `DB_*` | `apps/db/.env` 의 `POSTGRES_*` 와 맞춘다. compose 가 `DB_HOST=db` 로 덮어쓴다 |
| `SESSION_DRIVER` `CACHE_STORE` `QUEUE_CONNECTION` | API 무상태: `array` / `file` / `sync` |
| `OCTANE_SERVER` | `frankenphp` |
| `SERVER_NAME` | 로컬 `:80`, prod 는 도메인 |
| `FE_UPSTREAM` | 기본 `fe:3000`. fe 를 호스트 dev 서버(hot reload)로 띄울 때 `host.docker.internal:4001` |
| `RAG_EXCLUDE_WIRE` | `search_chunks()` 의 `p_exclude_wire` 기본값 |
| `DEEPINFRA_*` `EMBEDDING_*` | 검색 쿼리 임베딩. `apps/rag/.env` 와 같은 모델·차원이어야 한다 |

## DB
- Laravel 마이그레이션을 쓰지 않는다(`database/migrations` 비움). 테이블은 `contracts/schema.sql` 이 진실이다.
- be 전용 테이블: `users`, `personal_access_tokens`(Sanctum). 나머지(기사·지역·청크)는 rag 가 쓰고 be 는 읽기만 한다.
- 이미 만든 DB 에 테이블을 추가할 때는 schema.sql 의 해당 블록만 psql 로 적용한다(스키마 전체는 재실행되지 않음).
- 로컬 로그인 확인용 계정(id `test` / pw `test`)은 `docker compose exec be php artisan db:seed --class=TestUserSeeder` 로 만든다. `APP_ENV=local` 에서만 실행된다.

## 테스트
```bash
# 최초 1회: 테스트 DB 생성 + 스키마 적용 (레포 루트에서)
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE DATABASE newsmap_test"'
docker compose exec -T db sh -c 'psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d newsmap_test' < contracts/schema.sql

# 실행 / 포맷
docker compose exec be php artisan test --compact
docker compose exec be vendor/bin/pint --format agent app tests config routes database bootstrap
```
- `phpunit.xml` 이 `DB_DATABASE=newsmap_test` 를 `<server>`·`<env force>` 로 덮어쓴다(컨테이너 환경변수가 개발 DB 를 가리키고, Laravel 은 `$_SERVER` 를 먼저 읽기 때문). `tests/TestCase.php` 는 다른 DB 면 바로 실패시킨다.
- 테스트마다 `DatabaseTransactions` 로 롤백한다. 기사·지역 행은 `tests/Support/InsertsNewsData` 로 직접 넣는다(rag 소유 테이블이라 factory 없음). DeepInfra 는 `Http::fake`.
- `schema.sql` 을 바꾸면 `newsmap_test` 를 지우고 위 두 줄로 다시 만든다.
- 컨테이너 안에는 git 이 없어 `pint --dirty` 가 안 된다. 경로를 지정한다.
- BM25(Lindera) 토큰화 때문에 테스트 문장의 단어가 검색되지 않을 수 있다(예: "매탄동 재개발 조합…"에서 "재개발"은 안 걸리고 "조합"은 걸림).

## 검증
1. `docker compose ps` 에서 be `healthy`
2. `curl localhost:4000/up` 200, `curl localhost:4000/` 200(fe 화면), 없는 `/api/v1/...` 는 JSON 404
3. `docker compose exec be php artisan db:show` 로 DB 연결 확인
4. `docker compose exec be php artisan test --compact` 전체 통과
5. 실데이터: `curl localhost:4000/api/v1/stats/summary`, `/stats/regions?level=sido`, `/regions/41110/articles`, `/regions/41/articles?q=재개발`(`meta.search_type` 확인), test/test 로그인 → `/me`

===

<laravel-boost-guidelines>
=== foundation rules ===

# Laravel Boost Guidelines

## Foundational Context

This application is a Laravel application running on PHP 8.5. Always use the APIs that match the installed major version of each package — do not assume a version.

Before relying on a package's API, confirm its installed version:
- PHP packages: run `composer show --direct` to list direct dependencies with versions, or `composer show <vendor/package>` for a single package.
- JS packages: check `package.json` for the installed versions.

## Skills Activation

This project has domain-specific skills available in `**/skills/**`. You MUST activate the relevant skill whenever you work in that domain—don't wait until you're stuck.

## Conventions

- You must follow all existing code conventions used in this application. When creating or editing a file, check sibling files for the correct structure, approach, and naming.
- Use descriptive names for variables and methods. For example, `isRegisteredForDiscounts`, not `discount()`.
- Check for existing components to reuse before writing a new one.

## Verification Scripts

- Do not create verification scripts or tinker when tests cover that functionality and prove they work. Unit and feature tests are more important.

## Application Structure & Architecture

- Stick to existing directory structure; don't create new base folders without approval.
- Do not change the application's dependencies without approval.

## Frontend Bundling

- If a frontend change doesn't show in the UI or you get a "Unable to locate file in Vite manifest" error, run `npm run build` or ask the user to run `npm run dev` or `composer run dev`.

## Documentation Files

- You must only create documentation files if explicitly requested by the user.

=== boost rules ===

# Laravel Boost

## Tools

- Laravel Boost is an MCP server with tools designed specifically for this application. Prefer Boost tools over manual alternatives like shell commands or file reads.
- Use `database-query` to run read-only queries against the database instead of writing raw SQL in tinker.
- Use `database-schema` to inspect table structure before writing migrations or models.
- Use `get-absolute-url` to resolve the correct scheme, domain, and port for project URLs. Always use this before sharing a URL with the user.
- Use `browser-logs` to read browser logs, errors, and exceptions. Only recent logs are useful, ignore old entries.

## Searching Documentation (IMPORTANT)

- Use `search-docs` before changes that depend on Laravel ecosystem APIs, behavior, configuration, or version-specific syntax. Skip it for copy-only edits and other changes where package documentation is irrelevant. Reuse sufficient results already in context instead of searching again.
- Pass a `packages` array to scope results when you know which packages are relevant.
- Use multiple broad, topic-based queries: `['rate limiting', 'routing rate limiting', 'routing']`. Expect the most relevant results first.
- Do not add package names to queries because package info is already shared. Use `test resource table`, not `filament 4 test resource table`.

### Search Syntax

1. Use words for auto-stemmed AND logic: `rate limit` matches both "rate" AND "limit".
2. Use `"quoted phrases"` for exact position matching: `"infinite scroll"` requires adjacent words in order.
3. Combine words and phrases for mixed queries: `middleware "rate limit"`.
4. Use multiple queries for OR logic: `queries=["authentication", "middleware"]`.

## Project Rules

- This project contains committed, area-grouped rules in `.ai/rules` when that directory exists, including path-scoped framework guidelines under `.ai/rules/boost`. Before you enter plan mode or create/edit any file, you MUST first: open @.ai/rules/index.md (it maps file globs to rule files), read every rule file whose globs cover the path(s) in scope, and run `grep -rin 'keyword' .ai/rules` to catch what a path match alone misses. Do not write code until you have read and are following every matching rule. If `.ai/rules` does not exist, continue without it.

## Artisan

- Run Artisan commands directly via the command line (e.g., `php artisan route:list`). Use `php artisan list` to discover available commands and `php artisan [command] --help` to check parameters.
- Inspect routes with `php artisan route:list`. Filter with: `--method=GET`, `--name=users`, `--path=api`, `--except-vendor`, `--only-vendor`.
- Read configuration values using dot notation: `php artisan config:show app.name`, `php artisan config:show database.default`. Or read config files directly from the `config/` directory.

## Tinker

- Execute PHP in app context for debugging and testing code. Do not create models without user approval, prefer tests with factories instead. Prefer existing Artisan commands over custom tinker code.
- Always use single quotes to prevent shell expansion: `php artisan tinker --execute 'Your::code();'`
  - Double quotes for PHP strings inside: `php artisan tinker --execute 'User::where("active", true)->count();'`

=== php rules ===

# PHP

- Always use curly braces for control structures, even for single-line bodies.
- Use PHP 8 constructor property promotion: `public function __construct(public GitHub $github) { }`. Do not leave empty zero-parameter `__construct()` methods unless the constructor is private.
- Use explicit return type declarations and type hints for all method parameters: `function isAccessible(User $user, ?string $path = null): bool`
- Use TitleCase for Enum keys: `FavoritePerson`, `BestLake`, `Monthly`.
- Prefer PHPDoc blocks over inline comments. Only add inline comments for exceptionally complex logic.
- Use array shape type definitions in PHPDoc blocks.

=== deployments rules ===

# Deployment

- Laravel can be deployed using [Laravel Cloud](https://cloud.laravel.com/), which is the fastest way to deploy and scale production Laravel applications.

=== laravel/core rules ===

# Do Things the Laravel Way

- Use `php artisan make:` commands to create new files (i.e. migrations, controllers, models, etc.). You can list available Artisan commands using `php artisan list` and check their parameters with `php artisan [command] --help`.
- If you're creating a generic PHP class, use `php artisan make:class`.
- Pass `--no-interaction` to all Artisan commands to ensure they work without user input. You should also pass the correct `--options` to ensure correct behavior.

### Model Creation

- When creating new models, create useful factories and seeders for them too. Ask the user if they need any other things, using `php artisan make:model --help` to check the available options.

## APIs & Eloquent Resources

- For APIs, default to using Eloquent API Resources and API versioning unless existing API routes do not, then you should follow existing application convention.

## URL Generation

- When generating links to other pages, prefer named routes and the `route()` function.

## Testing

- When creating models for tests, use the factories for the models. Check if the factory has custom states that can be used before manually setting up the model.
- Faker: Use methods such as `$this->faker->word()` or `fake()->randomDigit()`. Follow existing conventions whether to use `$this->faker` or `fake()`.
- When creating tests, make use of `php artisan make:test [options] {name}` to create a feature test, and pass `--unit` to create a unit test. Most tests should be feature tests.

=== laravel-octane/core rules ===

# Laravel Octane

This application uses Laravel Octane, a long-running PHP server. The application bootstraps once and handles many requests within the same process.

- Never store request-specific state in singletons or static properties, because it can leak across requests.
- Use `config('octane.server')` to detect the active driver (`swoole`, `roadrunner`, or `frankenphp`).
- Prefer scoped bindings (`$this->app->scoped()`) over singletons for per-request services.

When working on Octane-specific features (concurrency, shared tables, memory, driver configuration, testing), invoke `octane-development` for detailed rules.

=== pint/core rules ===

# Laravel Pint Code Formatter

- If you have modified any PHP files, you must run `vendor/bin/pint --dirty --format agent` before finalizing changes to ensure your code matches the project's expected style.
- Do not run `vendor/bin/pint --test --format agent`, simply run `vendor/bin/pint --format agent` to fix any formatting issues.

=== phpunit/core rules ===

# PHPUnit

- This project uses PHPUnit. Create tests with `php artisan make:test --phpunit {name}`.
- Do not include the test suite directory in `{name}`. Use `SomeFeatureTest`, not `Feature/SomeFeatureTest`.
- Read the `testing-best-practices` skill for guidance on coverage, naming, structure, dependency isolation, and review.

## Running Tests

- Run the narrowest set of tests that covers the change. Pass a file path or `--filter=testName` to `php artisan test --compact`.
- Rerun a test after each change to it.
- Run `vendor/bin/phpunit` to call the test runner directly. It accepts the same file path and `--filter=testName` arguments.

</laravel-boost-guidelines>
