# db CLAUDE.md

DB 운영 스크립트와 **주소·행정동(지역 코드) 규칙**을 다룬다. 루트 `CLAUDE.md`의 공통 원칙을 따른다.
스키마 자체는 `contracts/schema.sql`이 단일 진실 공급원이고, 이 문서는 지역 데이터를 어떻게 채우고 맞추는지 적는다.

## 원칙
- **행정구역은 항상 최신 행정동 마스터를 따른다.** 개편(통합·분할·명칭 변경)이 있으면 마스터를 갱신하고 기존 기사도 현행 코드로 다시 매핑한다(사용자 결정, 2026-10-28).
  - 예: 광주광역시(29)·전라남도(46) → 전남광주통합특별시(`12`, 2026-07-01). 인천 중구·동구·서구 → 제물포구·영종구·서해구·검단구.
- 옛 코드 행은 **지우지 않고** `valid_to`로 말소 표시한다. `article_regions`의 FK가 참조할 수 있기 때문이다.
- 새 매칭은 현행 코드(`valid_to IS NULL`)만 대상으로 한다.

## 지역 코드 체계
- 출처: 행정안전부 주민등록 행정동 코드 `KIKcd_H.YYYYMMDD.xlsx` (jumin.mois.go.kr)
  - 컬럼: `행정동코드, 시도명, 시군구명, 읍면동명, 생성일자, 말소일자`. 과거 말소 이력 행도 함께 들어 있다.
- DB(`regions.code`)와 rag는 **항상 10자리**다: 시도(2) + 시군구(3) + 읍면동(3) + 리(2).

| level | DB 판정 | 예 |
|---|---|---|
| 1 시도 | `XX00000000` | `1200000000` 전남광주통합특별시 |
| 2 시군구 | `XXXXX00000` | `1224000000` 전남광주통합특별시 서구 |
| 3 읍면동 | 그 외 | `1224074500` 서구 치평동 |

- **일반구**: 수원시 영통구(`4111700000`)처럼 일반구도 level 2다. `parent_code`는 시(`4111000000` 수원시)로 연결되고 시의 상위가 시도다. 그래서 청크 `region_codes`에는 시 단위도 들어간다.
- **API 코드**(`contracts/API.md`)는 2/5/10자리를 쓴다(`12`, `12240`, `1224074500`). 10자리와의 변환은 **be만** 한다. fe 지도 경계(`apps/fe/public/geo`)도 2/5/10자리다.
- 바다(`SEA_W/S/E`)·섬(`ISL_*`)은 행정코드가 아니라 API·fe 쪽 개념이다(`contracts/API.md` 지역 코드 규칙).
- KIKcd_H에는 `…출장소`(예: `2811400000 중구영종출장소`) 같은 행이 현행으로 남아 있다. 원본 그대로 두고, 이름 매칭에는 걸리지 않으므로 별도로 처리하지 않는다.

## 관련 테이블 (`contracts/schema.sql`)
- `regions`: 마스터. `level`, `sido_name/sigungu_name/emd_name`(자기 레벨까지 채움), `full_name`, `parent_code`, `valid_from`, `valid_to`.
- `article_regions`: 기사 ↔ 지역. 시도·시군구·읍면동 코드(FK, 매칭 실패 시 NULL)와 LLM 원문 이름을 같이 보관한다. 원문 이름이 있어서 개편 후에도 다시 매칭할 수 있다.
- `article_chunks.region_codes`: 검색 필터용. 기사 지역 코드를 `parent_code`를 따라 시도까지 펼친 합집합이다. 그래서 `search_chunks(p_region_codes => ARRAY[코드])`는 시도·시군구·읍면동 어느 depth로 물어도 하위 기사를 함께 찾는다.

## 스크립트: `scripts/load_regions.py`
PEP 723 인라인 의존성을 쓰고 Python 3.11 이상이 필요하다. `apps/db/.env`의 `POSTGRES_*`로 `127.0.0.1:5432`에 접속한다.

```bash
uv run apps/db/scripts/load_regions.py apps/db/scripts/KIKcd_H.YYYYMMDD.xlsx --retire-missing --dry-run
uv run apps/db/scripts/load_regions.py apps/db/scripts/KIKcd_H.YYYYMMDD.xlsx --retire-missing
```
- `code` 기준 upsert. level 은 코드 모양으로, `parent_code`는 읍면동 → 시군구, 일반구 → 시, 시군구 → 시도로 채운다.
- `--retire-missing`: 이번 파일에 없는 현행 코드에 `valid_to = 파일 기준일`을 넣는다. 기준일은 파일명의 YYYYMMDD 또는 `--as-of`로 정한다. KIKcd_H는 말소 행도 들고 있어 보통 0건이지만, 말소 행이 빠진 파일을 넣을 때를 위한 안전장치다.
- `--dry-run`: 적재 후 롤백한다. 한 트랜잭션으로 처리한다.
- 원본 파일은 `apps/db/scripts/`에 둔다. `*.xlsx`·`*.csv`는 루트 `.gitignore`로 커밋하지 않는다.

## 마스터 갱신 절차 (행정구역 개편 시)
1. 최신 `KIKcd_H.YYYYMMDD.xlsx`를 받아 `apps/db/scripts/`에 둔다.
2. `load_regions.py … --retire-missing --dry-run`으로 건수를 확인한 뒤 실제로 적재한다.
3. 옛 이름이 생겼으면 `apps/rag/region_aliases.yaml`에 별칭을 추가한다(옛 시도명 → 현행 시도명).
4. 기존 기사를 재매핑한다: `cd apps/rag && uv run python -m rag.remap_regions --dry-run` 다음 `uv run python -m rag.remap_regions`.
   - 보관된 LLM 원문 이름으로 `article_regions` 코드를 다시 매칭하고 청크 `region_codes`를 다시 펼친다.
   - 별칭 대상 시도가 마스터에 없으면(= 1~2단계 전) 실행을 멈춘다.
5. rag 컨테이너는 코드가 이미지에 들어 있으므로 매칭 로직·별칭을 바꿨다면 `docker compose up -d --build rag`.
6. fe 경계(`apps/fe/scripts/build-geo.mjs`의 `SOURCE_VERSION`)를 가까운 기준일 버전으로 맞추고 `npm run build:geo`를 실행한다.
7. 아래 검증을 한다.

### rag 의 이름 → 코드 매칭 규칙 (`apps/rag/rag/regions.py`)
가장 구체적인 단계부터 시도하고, 모두 현행 코드만 대상으로 한다.
1. 시도명은 별칭 표로 현행 이름으로 바꾼다. 개편명(광주광역시·전라남도 → 전남광주통합특별시), 옛 명칭(강원도 → 강원특별자치도, 전라북도 → 전북특별자치도), 줄임말(부산 → 부산광역시 등)이 들어 있다. "광주시"는 경기도 광주시와 겹쳐서 넣지 않았다.
2. 시도 + 시군구 + 읍면동이 모두 일치하면 읍면동으로 매칭한다.
3. 시도 + 시군구가 일치하면 시군구로 매칭한다.
4. 시군구 이름이 개편으로 사라진 경우:
   - 시도 + 읍면동명이 하나로만 정해지면 그 읍면동으로 매칭한다. 예: 인천 중구 연안동 → 제물포구 연안동.
   - 읍면동이 번호 동으로 나뉘었고 후보가 모두 한 시군구에 있으면 그 시군구로 매칭한다. 예: 운서동 → 영종구.
5. 시도만 매칭한다.
6. 별칭 대상이 아직 마스터에 없으면 원래 이름으로 한 번 더 시도한다(마스터 갱신 전 수집 대비).

## 검증
- 현행 시도 목록과 말소 여부: `SELECT code, sido_name, valid_to FROM regions WHERE level = 1 ORDER BY code;`
- 현행 레벨별 건수: `SELECT level, count(*) FROM regions WHERE valid_to IS NULL GROUP BY level;`
- 말소 코드를 가리키는 기사: `article_regions`의 코드를 `regions.valid_to IS NOT NULL`과 조인해서 확인한다. 0건이어야 한다.
- 시도명은 있는데 코드가 NULL 인 기사 수: 재매핑 후 0에 가까워야 한다. 남으면 별칭 후보다.
- fe 경계 코드 대조: `apps/fe/.cache/HangJeongDong_*.geojson`의 `adm_cd2`가 모두 현행 `regions.code`에 있어야 한다. 다르면 버전 차이로 기록한다.
- depth 별 검색: `search_chunks(…, ARRAY['1200000000'])`, `['1224000000']`, `['1224074500']`가 해당 지역 청크만 돌려주는지 확인한다.
- rag 테스트: `cd apps/rag && uv run pytest tests/test_regions.py` (로컬 DB 필요).

## 현재 상태 (2026-10-28)
- 적재한 마스터: `KIKcd_H.20261012.xlsx` (9,612행, 현행 시도 16 · 시군구 280 · 읍면동 3,629). 광주 29·전남 46은 2026-07-01 말소.
  - 이전 마스터는 `KIKcd_H.20260101`(최신 `valid_from` 2025-07-01)이었다.
- 재매핑: `article_regions` 6,463행 중 656행의 코드를 바꿨고, 청크 1,388개의 `region_codes`를 갱신했다.
  - 시도명 매칭 실패 164 → 0, 말소 코드 참조 0, 옛 광주·전남 코드 0.
  - 옛 인천 중구·동구·서구처럼 구가 여러 개로 나뉘어 이름만으로 정할 수 없는 기사는 시도(인천광역시)까지만 매칭된다.
- fe 경계 `ver20261001`과의 차이: 평택시 고덕동(`4122066000`, 2026-10-12 고덕1·2동으로 분동) 1건.
