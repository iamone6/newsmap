-- 2026-11-07: search_chunks() 가 병렬 스캔을 타지 않게 한다.
-- BM25 TopK 질의에 `NOT is_wire` 필터가 붙으면 병렬 계획이 선택되는데, 워커 기동·병합 고정비 때문에
-- 약 530ms 로 느려진다. 병렬을 끄면 약 170ms 로 줄어든다(BM25 인덱스 상태가 좋으면 수 ms).
-- 함수 본문은 그대로이고 설정만 바꾸므로 ALTER FUNCTION 으로 충분하다. 적용: apps/db/CLAUDE.md "마이그레이션".
BEGIN;

ALTER FUNCTION search_chunks(text, halfvec, varchar[], smallint[], timestamptz, timestamptz, boolean, integer, integer, integer, double precision, double precision, double precision, double precision, double precision)
    SET max_parallel_workers_per_gather = 0;

COMMIT;
