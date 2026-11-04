# Graph Report - newsmap  (2026-11-03)

## Corpus Check
- 216 files · ~93,242 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 36 file(s) not represented in the graph (top: (none) 19, .example 4, .dockerfile 4)

## Summary
- 1570 nodes · 2854 edges · 101 communities (68 shown, 33 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 106 edges (avg confidence: 0.85)
- Token cost: 533,399 input · 0 output

## Community Hubs (Navigation)
- rag 임베딩 (Qwen3/DeepInfra)
- be 기사 API 테스트
- be Composer 의존성
- fe 지도 색상·지오 유틸
- fe 기사 조회 훅·HTTP
- fe UI 컴포넌트
- be Region 도메인 모델
- fe 카카오맵 엔진
- rag 지역명 매칭
- Laravel 관례 체크리스트
- fe 앱 셸·브레드크럼
- fe SVG 지도 엔진
- rag 페이지 파서·이미지 판단
- rag CLI·설정
- be 지역·최신기사 Action
- be 지역 기사 검색 Action
- be API Resource
- be 아키텍처 문서
- fe 카카오맵 목업
- rag RSS 수집·피드 설정
- be 기사 이미지·지역 모델
- be 통계 요약 Action
- rag 파이프라인 설계 결정
- be 로그인·User
- fe npm 의존성
- rag 크롤링·비용 추정
- rag 기사 저장소
- rag 청킹
- 시도 별칭
- be 도메인 설계 (DDD)
- fe TypeScript 설정
- rag 로깅
- 고급 쿼리 관례
- be 지역 기사 목록 Action
- fe 범례·경계 데이터 문서
- rag 파이프라인·게시시각
- rag 구글뉴스 피드
- be Article 모델
- 지역 코드 체계·마스터 갱신
- 이벤트·알림 관례
- 행정동 마스터 적재
- rag 운영 문서·모노레포 원칙
- 중부일보 기사 픽스처
- 컬렉션·DB 성능 관례
- HTTP 클라이언트·큐 관례
- 설정·보안 관례
- 라우팅·컨트롤러 관례
- 스타일·네이밍 관례
- 테스트 격리·Fake
- be FormRequest 검증
- be 인증 Action·컨트롤러
- Octane 스킬
- fe 지오 빌드 스크립트
- 테스트 일관성 원칙
- Laravel 아키텍처 관례
- 엔드포인트·보안 테스트
- fe Next 설정·레이아웃
- 락·스케줄링 관례
- Eloquent 관례
- 테스트 네이밍·리뷰
- be Me API·라우트
- be 부트스트랩
- rag 전체 피드 병렬 실행
- 캐싱 관례
- Blade 관례
- be 검색 DTO·SearchType
- feeds.yaml 구조
- compose 최상위 구성
- compose 빌드 설정
- 에러 처리 관례
- 테스트 데이터·팩토리
- be 시더
- 지역언론 RSS 조사
- compose healthcheck
- compose db 서비스
- 테스트 단언 규칙
- be JSON 유니코드 미들웨어
- be ServiceProvider
- fe ESLint 설정
- fe 런타임 의존성
- fe npm 스크립트
- compose depends_on
- compose be 서비스
- compose 환경변수
- compose rag 서비스
- compose fe 서비스
- MCP 설정
- be robots.txt
- rag 패키지

## God Nodes (most connected - your core abstractions)
1. `Region` - 34 edges
2. `SvgMapRenderer` - 28 edges
3. `RegionLevel` - 27 edges
4. `_process_item()` - 26 edges
5. `Laravel Best Practices Skill` - 26 edges
6. `KakaoMapRenderer` - 25 edges
7. `MapFeature` - 22 edges
8. `sido` - 21 edges
9. `match_region()` - 18 edges
10. `NewsMap REST API v1 contract` - 18 edges

## Surprising Connections (you probably didn't know these)
- `newsApi interface (NewsApi)` --implements--> `NewsMap REST API v1 contract`  [EXTRACTED]
  apps/fe/CLAUDE.md → contracts/API.md
- `RAG PostgreSQL schema original requirements` --conceptually_related_to--> `Recursive character splitter, 500 tokens, 10% overlap`  [INFERRED]
  prompts/postgre-schema,RAG.prompt.txt → README.md
- `RAG PostgreSQL schema original requirements` --conceptually_related_to--> `sections (6 fixed categories)`  [INFERRED]
  prompts/postgre-schema,RAG.prompt.txt → README.md
- `Martin Joo 2-layer DDD (app/Http + app/Domain)` --implements--> `Pragmatic DDD with aggregates`  [INFERRED]
  apps/be/CLAUDE.md → CLAUDE.md
- `be CLAUDE.md` --references--> `Root CLAUDE.md (monorepo principles)`  [EXTRACTED]
  apps/be/CLAUDE.md → CLAUDE.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **rag article ingestion flow** — apps_rag_claude_rag_cli, apps_rag_claude_pipeline, apps_rag_claude_llm_judge, apps_rag_claude_regions_py, apps_rag_claude_embedder, readme_seen_rss_links, readme_single_transaction [EXTRACTED 1.00]
- **Hybrid BM25+vector search stack** — readme_search_chunks, readme_bm25_lindera, readme_hnsw_cosine, readme_rrf, apps_be_claude_query_embedding_service, contracts_api_search_type [EXTRACTED 1.00]
- **Region master refresh and remap procedure** — readme_load_regions_script, apps_db_claude_retire_missing, apps_rag_region_aliases, apps_db_claude_remap_regions, apps_fe_claude_build_geo, prompts_postgre_schema_rag_decisions_latest_region_master [EXTRACTED 1.00]
- **교체 가능한 지도 엔진 (clearSelection/kind 인터페이스)** — apps_fe_mockup_index_svgengine, apps_fe_mockup_index_kakaoengine, apps_fe_mockup_index_openlayer, apps_fe_mockup_index_closelayer [INFERRED 0.85]
- **목 기사 데이터 생성-필터-목록 렌더 흐름** — apps_fe_mockup_index_postsfor, apps_fe_mockup_index_filteredposts, apps_fe_mockup_index_renderlist, apps_fe_mockup_index_ph [EXTRACTED 1.00]
- **기사 메타데이터 추출 소스 (meta/og, JSON-LD, 본문 DOM)** — apps_rag_tests_fixtures_sample_article_og_meta, apps_rag_tests_fixtures_sample_article_jsonld_newsarticle, apps_rag_tests_fixtures_sample_article_article_body_div, apps_rag_tests_fixtures_sample_article_article_363740244 [INFERRED 0.85]
- **After-commit dispatch pattern** — apps_be__claude_skills_laravel_best_practices_rules_events_notifications_shoulddispatchaftercommit, apps_be__claude_skills_laravel_best_practices_rules_events_notifications_notification_aftercommit, apps_be__claude_skills_laravel_best_practices_rules_mail_mail_aftercommit [INFERRED 0.85]
- **Lock-based concurrency coordination** — apps_be__claude_skills_laravel_best_practices_rules_architecture_atomic_locks, apps_be__claude_skills_laravel_best_practices_rules_caching_cache_add_atomic_write, apps_be__claude_skills_laravel_best_practices_rules_queue_jobs_shouldbeunique, apps_be__claude_skills_laravel_best_practices_rules_scheduling_ononeserver, apps_be__claude_skills_laravel_best_practices_rules_scheduling_withoutoverlapping [INFERRED 0.85]
- **N+1 prevention toolkit** — apps_be__claude_skills_laravel_best_practices_rules_db_performance_n_1_prevention, apps_be__claude_skills_laravel_best_practices_rules_db_performance_eager_loading, apps_be__claude_skills_laravel_best_practices_rules_db_performance_preventlazyloading, apps_be__claude_skills_laravel_best_practices_rules_db_performance_withcount, apps_be__claude_skills_laravel_best_practices_rules_advanced_queries_setrelation_to_reuse_loaded_parent [INFERRED 0.85]
- **Testing Best Practices Rule Set** — apps_be__claude_skills_testing_best_practices_skill, apps_be__claude_skills_testing_best_practices_rules_assertions, apps_be__claude_skills_testing_best_practices_rules_endpoint_tests, apps_be__claude_skills_testing_best_practices_rules_isolation, apps_be__claude_skills_testing_best_practices_rules_naming, apps_be__claude_skills_testing_best_practices_rules_test_data, apps_be__claude_skills_testing_best_practices_rules_review [EXTRACTED 1.00]
- **Octane Per-Request State Reset Mechanisms** — apps_be__claude_skills_octane_development_skill_scoped_binding, apps_be__claude_skills_octane_development_skill_octane_flush_list, apps_be__claude_skills_octane_development_skill_requestterminated_event [EXTRACTED 1.00]

## Communities (101 total, 33 thin omitted)

### Community 0 - "rag 임베딩 (Qwen3/DeepInfra)"
Cohesion: 0.06
Nodes (32): _check_dimensions(), _client(), embed_documents(), embed_query(), ArticleJudgment, _format_images(), _invoke_once(), judge_article() (+24 more)

### Community 1 - "be 기사 API 테스트"
Cohesion: 0.06
Nodes (8): ArticleApiTest, AuthApiTest, HealthCheckTest, RateLimitTest, RegionApiTest, StatsApiTest, InsertsNewsData, TestCase

### Community 2 - "be Composer 의존성"
Cohesion: 0.04
Nodes (48): pestphp/pest-plugin, php-http/discovery, autoload, autoload-dev, psr-4, psr-4, config, allow-plugins (+40 more)

### Community 3 - "fe 지도 색상·지오 유틸"
Cohesion: 0.08
Nodes (36): COUNT_RAMP, DEFAULT_LEGEND, MAP_COLORS, featureCache, findRegion(), ISLAND_MARKERS, isLevelCached(), KOREA_BOUNDS (+28 more)

### Community 4 - "fe 기사 조회 훅·HTTP"
Cohesion: 0.08
Nodes (29): ARTICLES_PER_PAGE, errorMessageOf(), FetchResult, useRegionArticles(), ApiError, getJson(), QueryParams, mockApi (+21 more)

### Community 5 - "fe UI 컴포넌트"
Cohesion: 0.10
Nodes (29): Button(), ButtonProps, ButtonVariant, VARIANT_CLASSES, Tag(), TagTone, TONE_CLASSES, TextInput() (+21 more)

### Community 6 - "be Region 도메인 모델"
Cohesion: 0.10
Nodes (9): {closure#1}(), RegionLevel, Emd, Sido, Sigungu, InvalidRegionCodeException, RegionCode, LegendCalculatorTest (+1 more)

### Community 7 - "fe 카카오맵 엔진"
Cohesion: 0.12
Nodes (14): toRegionRef(), KakaoMapEngine(), KakaoMapEngineProps, escapeHtml(), KakaoMapRenderer, KakaoMapsApi, loadKakaoSdk(), Window (+6 more)

### Community 8 - "rag 지역명 매칭"
Cohesion: 0.12
Nodes (22): _common_sigungu_of_split_emd(), expand_region_codes(), _match_from_emd(), _match_names(), match_region(), normalize_sido_name(), _parent_codes(), RegionMatch (+14 more)

### Community 9 - "Laravel 관례 체크리스트"
Cohesion: 0.08
Nodes (29): Detection Checklist, A. Validation & HTTP input, Accessors and mutators fork, Action/Service structure (architecture), B. Controllers & routing, C. Authorization, Collaborator isolation fork, D. Eloquent & models (+21 more)

### Community 10 - "fe 앱 셸·브레드크럼"
Cohesion: 0.14
Nodes (18): HomePage(), NewsMapApp(), Breadcrumbs(), Crumb, LevelChip(), MapTooltip(), SvgRendererCallbacks, MapEngineHandle (+10 more)

### Community 11 - "fe SVG 지도 엔진"
Cohesion: 0.16
Nodes (4): colorForCount(), SvgMapEngine(), SvgMapRenderer, MapFeature

### Community 12 - "rag 페이지 파서·이미지 판단"
Cohesion: 0.14
Nodes (17): ImageJudgment, _clean_text(), _is_site_chrome_image(), parse(), ParsedArticle, ParsedImage, _strip_title_suffix(), _truncate_at_byline() (+9 more)

### Community 13 - "rag CLI·설정"
Cohesion: 0.12
Nodes (11): main(), _print_cost_estimate(), _print_result(), load_settings(), Settings, _connect(), main(), missing_alias_targets() (+3 more)

### Community 14 - "be 지역·최신기사 Action"
Cohesion: 0.14
Nodes (7): ListLatestArticlesAction, FindRegionAction, ListRegionsAction, ListRegionsRequest, RegionDetailResource, RegionResource, RegionController

### Community 15 - "be 지역 기사 검색 Action"
Cohesion: 0.12
Nodes (5): SearchRegionArticlesAction, ArticleConsts, QueryEmbeddingFailedException, {closure#1}(), QueryEmbeddingService

### Community 16 - "be API Resource"
Cohesion: 0.17
Nodes (9): ArticleListResource, LatestArticleResource, RegionRefResource, RegionStatResource, SummaryResource, ArticleController, {closure#1}(), {closure#2}() (+1 more)

### Community 17 - "be 아키텍처 문서"
Cohesion: 0.11
Nodes (18): be CLAUDE.md, Caddyfile request routing, newsmap_test PostgreSQL test DB, be app (Laravel/FrankenPHP API), fe app (Next.js map frontend), NewsMap REST API v1 contract, GET /articles/latest (ticker), GET /articles/{id} (not implemented v1) (+10 more)

### Community 18 - "fe 카카오맵 목업"
Cohesion: 0.13
Nodes (23): NewsMap 카카오맵 기반 목업 (index.html), closeLayer(), countFor() 지역 게시물 수, decimate() 폴리곤 링 간소화, fillRail() 좌측 현황 레일/티커 채우기, filteredPosts() 카테고리/검색/정렬 필터, ISLES 울릉도/독도 클릭 영역, kakaoEngine() 카카오맵 타일+폴리곤 엔진 (+15 more)

### Community 19 - "rag RSS 수집·피드 설정"
Cohesion: 0.17
Nodes (13): fetch_new_items(), FeedConfig, FeedsFile, get_feed(), load_feeds(), load_region_aliases(), RegionAliases, _entries() (+5 more)

### Community 20 - "be 기사 이미지·지역 모델"
Cohesion: 0.14
Nodes (6): ArticleImage, ArticleRegion, Region, {closure#1}(), {closure#2}(), ListRegionStatsAction

### Community 21 - "be 통계 요약 Action"
Cohesion: 0.12
Nodes (6): {closure#1}(), GetSummaryAction, StatsConsts, ListRegionStatsRequest, LegendCalculator, StatsController

### Community 22 - "rag 파이프라인 설계 결정"
Cohesion: 0.11
Nodes (18): retry.call_with_retry (max 4 attempts), embedder.embed_documents / embed_query, llm_judge.judge_article, MAX_ITEMS_PER_BATCH (50), FEEDS_WITH_NAIVE_KST_PUBDATE (imaeil fix), Per-article rag pipeline (parse -> LLM -> chunk -> embed -> save), RAG PostgreSQL schema original requirements, article_chunks (halfvec(1024) + filter columns) (+10 more)

### Community 23 - "be 로그인·User"
Cohesion: 0.13
Nodes (3): LoginResultDTO, User, UserFactory

### Community 25 - "fe npm 의존성"
Cohesion: 0.12
Nodes (22): devDependencies, tailwindcss@^4, @tailwindcss/turbopack@^4, @types/d3@^7.4.3, @types/geojson@^7946.0.16, @types/node@^20, @types/react@^19, @types/react-dom@^19 (+14 more)

### Community 26 - "rag 크롤링·비용 추정"
Cohesion: 0.15
Nodes (14): _fetch_entries(), fetch(), CostEstimate, estimate_cost(), _fetch_pricing(), record_embedding(), record_llm(), reset() (+6 more)

### Community 27 - "rag 기사 저장소"
Cohesion: 0.13
Nodes (11): _process_item(), _region_label(), ArticleToSave, ChunkToSave, find_article_id_by_canonical_url(), find_seen_article_id(), ImageToSave, mark_seen() (+3 more)

### Community 28 - "rag 청킹"
Cohesion: 0.14
Nodes (8): Chunk, chunk_article(), count_tokens(), _splitter(), _tokenizer(), test_long_text_splits_with_overlap_and_respects_token_budget(), test_short_text_is_single_chunk(), settings()

### Community 29 - "시도 별칭"
Cohesion: 0.10
Nodes (21): sido, 강원, 강원도, 광주, 광주광역시, 대구, 대전, 대전시 (+13 more)

### Community 30 - "be 도메인 설계 (DDD)"
Cohesion: 0.12
Nodes (13): Region::descendantsOf(), Article domain, Auth domain (Sanctum), Region domain, QueryEmbeddingService, RegionArticlesPanel / useRegionArticles, POST /auth/login (Sanctum bearer), include_children parameter (+5 more)

### Community 31 - "fe TypeScript 설정"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 32 - "rag 로깅"
Cohesion: 0.18
Nodes (6): configure_logging(), MonthlyRotatingFileHandler, _clean_rag_loggers(), test_configure_logging_writes_summary_and_error_to_separate_files(), test_monthly_handler_rolls_to_first_of_next_month(), test_monthly_handler_wraps_december_into_next_january()

### Community 34 - "be 지역 기사 목록 Action"
Cohesion: 0.18
Nodes (6): ListRegionArticlesAction, ArticleListQueryDTO, ArticleSort, Latest, Popular, ListRegionArticlesRequest

### Community 35 - "fe 범례·경계 데이터 문서"
Cohesion: 0.14
Nodes (16): Stats domain, LegendCalculator, fe AGENTS.md (Next.js agent rules), fe CLAUDE.md, vuski/admdongkor admin dong boundaries, scripts/build-geo.mjs (TopoJSON builder), colors.ts colorForCount (meta.legend), Mock API (NEXT_PUBLIC_USE_MOCK_API) (+8 more)

### Community 36 - "rag 파이프라인·게시시각"
Cohesion: 0.29
Nodes (9): CollectedItem, _resolve_published_at(), _struct_to_datetime(), _item(), test_falls_back_to_collected_time_when_neither_present(), test_falls_back_to_created_when_no_published(), test_imaeil_naive_pubdate_is_corrected_by_9_hours(), test_other_feeds_are_not_affected_by_imaeil_correction() (+1 more)

### Community 37 - "rag 구글뉴스 피드"
Cohesion: 0.21
Nodes (9): decode_real_url(), is_excluded(), source_host(), source_name(), _entries(), test_is_excluded_false_when_not_in_blocklist(), test_is_excluded_handles_subdomain(), test_is_excluded_matches_known_national_outlet() (+1 more)

### Community 39 - "지역 코드 체계·마스터 갱신"
Cohesion: 0.18
Nodes (13): InvalidRegionCodeException -> 404, Shared/VOs/RegionCode, db CLAUDE.md (region code rules), Jeonnam-Gwangju unified special city (12), Region master update procedure, rag name -> code matching rules, rag.remap_regions, --retire-missing valid_to retirement (+5 more)

### Community 41 - "행정동 마스터 적재"
Cohesion: 0.24
Nodes (6): clean(), file_date(), main(), parse_date(), read_rows(), to_region()

### Community 42 - "rag 운영 문서·모노레포 원칙"
Cohesion: 0.18
Nodes (10): rag CLAUDE.md, logging_setup (rag.log, rag_error.log monthly), rag.cli --feed-key, Root CLAUDE.md (monorepo principles), rag app (Python/LangChain worker), PostgreSQL 18.6 + pgvector 0.8.6 + pg_search 0.25.11, RAG PostgreSQL schema decisions, uv + Python 3.14 + LangChain 1.4.x (+2 more)

### Community 43 - "중부일보 기사 픽스처"
Cohesion: 0.15
Nodes (15): sample_article.html (중부일보 기사 HTML 테스트 픽스처), 기사: 법원 전산망 한때 장애…법원행정처 “원인 파악 중, 해킹은 아니야” (idxno=363740244), 본문 컨테이너 #article-view-content-div (itemprop=articleBody), 기자 이성관 (lsky@joongboo.com, reporter_id lsklsky), canonical / og:url / AMP 링크 (articleView.html?idxno=363740244), 중부일보 (joongboo.com, 경기·인천 지역언론), JSON-LD NewsArticle (headline, datePublished, dateModified, author, image 690x388, publisher), 키워드 (법원 전산망, 장애, 재판사무시스템, 복구, 법원행정처) / .tag-group (+7 more)

### Community 48 - "스타일·네이밍 관례"
Cohesion: 0.15
Nodes (5): Convention and Style Best Practices, Laravel Best Practices Skill, Rule Index, search-docs tool, testing-best-practices skill

### Community 49 - "테스트 격리·Fake"
Cohesion: 0.22
Nodes (12): Fakes, Mocks, and Determinism Rules, Dependency Isolation Order, Framework Fakes, Http::preventStrayRequests(), LazilyRefreshDatabase, Mockery Mocking, Time and Randomness Control, Test Suite Performance Rules (+4 more)

### Community 51 - "be 인증 Action·컨트롤러"
Cohesion: 0.22
Nodes (4): LoginAction, LogoutAction, AuthController, Controller

### Community 52 - "Octane 스킬"
Cohesion: 0.29
Nodes (11): Laravel Octane Skill, Detect the Driver First, FrankenPHP, Octane Common Pitfalls, Octane::concurrently(), Octane flush list, RequestTerminated event, scoped() binding (+3 more)

### Community 53 - "fe 지오 빌드 스크립트"
Cohesion: 0.20
Nodes (9): mapshaper@^0.7.100, buildAll(), cacheDir, downloadSourceIfMissing(), outputDir, projectRoot, runMapshaper(), sourceFile (+1 more)

### Community 54 - "테스트 일관성 원칙"
Cohesion: 0.20
Nodes (7): Octane Testing Guidance, Finding Test Framework Features Rules, Framework Feature Lookup Table, Testing Best Practices Skill, PHPUnit 12.5.42, search-docs Tool, What to Test

### Community 56 - "엔드포인트·보안 테스트"
Cohesion: 0.20
Nodes (9): Endpoint Tests Rules, Endpoint Coverage, Test Authorization at the Policy Level, Testing Validation, Security Tests Rules, Cross-Tenant Access Test, Dynamic Query Injection Test, Escaping User Content Test (+1 more)

### Community 57 - "fe Next 설정·레이아웃"
Cohesion: 0.18
Nodes (6): nextConfig, next@16.4.3, caprasimo, figtree, metadata, next

### Community 60 - "테스트 네이밍·리뷰"
Cohesion: 0.22
Nodes (9): Naming and Structure Rules, Group Attribute Usage, Test File Layout, Test Names as Specification, Reviewing Tests Checklist, Assertions Checklist, Coverage Checklist, Names and Structure Checklist (+1 more)

### Community 62 - "be 부트스트랩"
Cohesion: 0.28
Nodes (4): {closure#1}(), {closure#2}(), {closure#3}(), {closure#4}()

### Community 63 - "rag 전체 피드 병렬 실행"
Cohesion: 0.36
Nodes (7): run(), run_all(), RunResult, test_run_all_iterates_every_feed_key_and_isolates_failures(), fake_run(), test_run_all_processes_feeds_concurrently(), fake_run()

### Community 66 - "be 검색 DTO·SearchType"
Cohesion: 0.39
Nodes (4): ArticleListResultDTO, SearchType, Bm25, Hybrid

### Community 67 - "feeds.yaml 구조"
Cohesion: 0.25
Nodes (7): exclude_sources, feeds, feed_key, note, publisher_name, rss_url, type

### Community 68 - "compose 최상위 구성"
Cohesion: 0.25
Nodes (7): file, secrets, fe_env, services, volumes, caddy_config, caddy_data

### Community 69 - "compose 빌드 설정"
Cohesion: 0.36
Nodes (8): build, context, dockerfile, secrets, target, build, build, build

### Community 71 - "테스트 데이터·팩토리"
Cohesion: 0.29
Nodes (6): DataProvider and TestWith attributes, Parallel Test Run (ParaTest), Data and Determinism Checklist, Factories and Test Data Rules, Data Providers, Record Construction (create/make/states)

### Community 73 - "지역언론 RSS 조사"
Cohesion: 0.33
Nodes (5): feeds.yaml (direct / google_news_search), find-rss-target prompt (empty), Regional news RSS feeds research (17 sido), 32 verified regional RSS outlets, domain/rss/allArticle.xml URL pattern

### Community 74 - "compose healthcheck"
Cohesion: 0.43
Nodes (7): healthcheck, healthcheck, interval, retries, start_period, test, timeout

### Community 75 - "compose db 서비스"
Cohesion: 0.29
Nodes (7): env_file, image, ports, restart, shm_size, volumes, db

### Community 76 - "테스트 단언 규칙"
Cohesion: 0.33
Nodes (4): Assertions Rules, Arrange Act Assert, Assert the Complete Result, Named Response Assertions

### Community 79 - "fe ESLint 설정"
Cohesion: 0.33
Nodes (5): eslintConfig, eslint@^9, eslint-config-next@16.4.3, eslint, eslint-config-next

### Community 80 - "fe 런타임 의존성"
Cohesion: 0.33
Nodes (6): dependencies, d3@^7.9.0, react@19.3.0, react-dom@19.3.0, topojson-client@^3.1.0, react-dom

### Community 81 - "fe npm 스크립트"
Cohesion: 0.33
Nodes (6): scripts, build, build:geo, dev, lint, start

### Community 82 - "compose depends_on"
Cohesion: 0.33
Nodes (6): depends_on, condition, db, fe, condition, depends_on

### Community 83 - "compose be 서비스"
Cohesion: 0.33
Nodes (6): env_file, image, ports, restart, volumes, be

### Community 84 - "compose 환경변수"
Cohesion: 0.40
Nodes (6): environment, environment, DB_HOST, TZ, environment, environment

### Community 88 - "compose rag 서비스"
Cohesion: 0.40
Nodes (5): env_file, image, restart, volumes, rag

### Community 90 - "compose fe 서비스"
Cohesion: 0.50
Nodes (4): expose, image, restart, fe

## Ambiguous Edges - Review These
- `find-rss-target prompt (empty)` → `Regional news RSS feeds research (17 sido)`  [AMBIGUOUS]
  prompts/find-rss-target.prompt.txt · relation: conceptually_related_to

## Knowledge Gaps
- **84 isolated node(s):** `docker`, `Latest`, `Popular`, `Hybrid`, `Bm25` (+79 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 554 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **33 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Laravel Best Practices Skill` connect `스타일·네이밍 관례` to `캐싱 관례`, `Blade 관례`, `고급 쿼리 관례`, `에러 처리 관례`, `이벤트·알림 관례`, `컬렉션·DB 성능 관례`, `HTTP 클라이언트·큐 관례`, `설정·보안 관례`, `라우팅·컨트롤러 관례`, `Laravel 아키텍처 관례`, `락·스케줄링 관례`, `Eloquent 관례`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `_process_item()` (e.g. with `CollectedItem` and `FeedConfig`) actually correct?**
  _`_process_item()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `docker`, `Latest`, `Popular` to the rest of the system?**
  _84 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `rag 임베딩 (Qwen3/DeepInfra)` be split into smaller, more focused modules?**
  _Cohesion score 0.06253652834599649 - nodes in this community are weakly interconnected._
- **Why does `Collection Best Practices` connect `컬렉션·DB 성능 관례` to `스타일·네이밍 관례`, `rag CLI·설정`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Should `be 기사 API 테스트` be split into smaller, more focused modules?**
  _Cohesion score 0.05584415584415584 - nodes in this community are weakly interconnected._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `find-rss-target prompt (empty)` and `Regional news RSS feeds research (17 sido)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._