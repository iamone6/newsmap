/**
 * 행정동 경계 GeoJSON 을 받아 지도에서 쓸 TopoJSON 3개(시도·시군구·읍면동)를 만드는 스크립트.
 *
 * - 원본: vuski/admdongkor (통계청 SGIS 경계 + 행정안전부 행정동 코드 adm_cd2)
 *   https://github.com/vuski/admdongkor
 * - 결과: public/geo/sido.topo.json, sigungu.topo.json, emd.topo.json
 *   각 파일의 TopoJSON 오브젝트 이름은 모두 "regions" 이고, 속성은 아래와 같다.
 *     sido     : code(2자리), name
 *     sigungu  : code(5자리), name, sido_code
 *     emd      : code(10자리), name, sigungu_code, sido_code
 *   코드 자릿수는 contracts/API.md 의 "지역 코드 규칙"을 따른다.
 *
 * 일반구가 있는 시(수원·성남·포항 등 13곳)는 시군구 단계에서 시 하나로 합친다(2026-11-06 결정).
 *   원본의 시군구는 일반구 단위(예: 47111 포항시남구)라 시(47110) 경계가 없는데, 기사는 대부분
 *   "포항시"로만 매칭돼 시 코드로 저장된다. 그래서 일반구를 시 코드·이름으로 바꾼 뒤 합친다.
 *   읍면동의 sigungu_code 도 시 코드가 된다. 일반구 코드 → 시 코드 표는
 *   src/features/map/districtToCity.json 으로 남겨, 구 코드로 저장된 기사도 시로 찾게 한다.
 *   일반구 판정은 시군구 이름이 "○○시○○구" 모양인지로 한다. 코드 끝자리로는 안 된다
 *   (광진구 11215·제물포구 28125·증평군 43745 처럼 끝자리가 0이 아닌 일반 자치구·군이 있다).
 *
 * 바다(서해·남해·동해)는 행정경계가 없는 개념적 영역이라 scripts/sea-areas.json 에 대략적인 꼭짓점으로 정의한다.
 *   그대로 쓰면 해안선과 겹쳐, 반투명한 육지 색 사이로 바다 색이 비친다(해안 시군구 안의 비스듬한 띠).
 *   그래서 단계(시도·시군구·읍면동)마다 그 단계 경계를 바다에서 잘라낸(erase) 모양을
 *   src/features/map/seaAreas.{sido,sigungu,emd}.json 으로 저장하고, 지도는 지금 단계의 바다를 그린다.
 *   단계마다 단순화 정도가 달라, 한 단계로만 자르면 다른 단계에서 해안선 사이에 틈이 생긴다. 섬은 바다의 구멍이 된다.
 *
 * 실행: npm run build:geo
 * 원본 파일은 .cache/ 에 한 번만 내려받아 두고 다시 쓴다.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mapshaper from "mapshaper";

/** 사용할 admdongkor 버전. 새 버전이 나오면 이 값만 바꾼다. */
const SOURCE_VERSION = "ver20261001";
const SOURCE_URL = `https://raw.githubusercontent.com/vuski/admdongkor/master/${SOURCE_VERSION}/HangJeongDong_${SOURCE_VERSION}.geojson`;

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = path.join(projectRoot, ".cache");
const outputDir = path.join(projectRoot, "public", "geo");
const sourceFile = path.join(cacheDir, `HangJeongDong_${SOURCE_VERSION}.geojson`);
/** 일반구를 시로 바꾼 원본. mapshaper 에는 이 파일을 넣는다 */
const citySourceFile = path.join(cacheDir, `HangJeongDong_${SOURCE_VERSION}.cities.geojson`);
/** 일반구 코드(5자리) → 시 코드(5자리) 표. fe 가 구 코드로 저장된 기사의 지역을 시로 찾을 때 쓴다 */
const districtTableFile = path.join(projectRoot, "src", "features", "map", "districtToCity.json");

/** 바다 정의(대략적인 꼭짓점·라벨 위치)와, 육지를 잘라낸 결과 */
const seaDefinitionFile = path.join(projectRoot, "scripts", "sea-areas.json");
const seaInputFile = path.join(cacheDir, "sea-areas.input.geojson");
/** @param {string} level 단계 이름 @returns {string} 그 단계 바다 결과 파일 */
const seaOutputFileOf = (level) => path.join(projectRoot, "src", "features", "map", `seaAreas.${level}.json`);

/** "수원시영통구" → ["수원시", "영통구"]. 일반구만 이 모양이다 (일반 자치구는 "광진구"처럼 시 이름이 없다) */
const GENERAL_DISTRICT_NAME = /^(.+시)(.+구)$/;

/**
 * 원본 GeoJSON 이 캐시에 없으면 내려받는다.
 * @returns {Promise<void>}
 */
async function downloadSourceIfMissing() {
  if (existsSync(sourceFile)) {
    console.log(`원본 캐시 사용: ${sourceFile}`);
    return;
  }
  console.log(`원본 내려받는 중: ${SOURCE_URL}`);
  const response = await fetch(SOURCE_URL);
  if (!response.ok) {
    throw new Error(`내려받기 실패: HTTP ${response.status}`);
  }
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(sourceFile, Buffer.from(await response.arrayBuffer()));
}

/**
 * 일반구를 시로 바꾼 원본을 만들고, 일반구 → 시 코드 표를 저장한다.
 * 1) 시군구 이름이 "○○시○○구" 인 행정동은 sgg 를 시 코드(앞 4자리 + "0"), sggnm 을 시 이름으로 바꾼다
 * 2) 한 시의 구들이 모두 같은 시 코드가 되는지, 시 코드가 다른 시군구 코드와 겹치지 않는지 확인한다
 * 3) 바꾼 원본(.cache)과 표(src/features/map/districtToCity.json)를 저장한다
 * @returns {void}
 */
function mergeGeneralDistricts() {
  const source = JSON.parse(readFileSync(sourceFile, "utf8"));
  const originalCodes = new Set(source.features.map((feature) => feature.properties.sgg));
  /** @type {Record<string, string>} 일반구 코드 → 시 코드 */
  const districtToCity = {};
  /** @type {Map<string, string>} 시 이름(시도 포함) → 시 코드 */
  const cityCodeByName = new Map();

  // 1) 바꾸기
  for (const feature of source.features) {
    const properties = feature.properties;
    const match = properties.sggnm.match(GENERAL_DISTRICT_NAME);
    if (!match) continue;
    const cityCode = `${properties.sgg.slice(0, 4)}0`;
    const cityKey = `${properties.sidonm} ${match[1]}`;

    // 2) 확인
    if (cityCodeByName.has(cityKey) && cityCodeByName.get(cityKey) !== cityCode) {
      throw new Error(`${cityKey} 의 일반구들이 서로 다른 시 코드로 계산된다: ${cityCodeByName.get(cityKey)}, ${cityCode}`);
    }
    if (originalCodes.has(cityCode)) {
      throw new Error(`${cityKey} 의 시 코드 ${cityCode} 가 원본의 다른 시군구 코드와 겹친다`);
    }
    cityCodeByName.set(cityKey, cityCode);
    districtToCity[properties.sgg] = cityCode;

    properties.sgg = cityCode;
    properties.sggnm = match[1];
  }

  // 3) 저장
  writeFileSync(citySourceFile, JSON.stringify(source));
  const sortedTable = Object.fromEntries(Object.entries(districtToCity).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(districtTableFile, `${JSON.stringify(sortedTable, null, 2)}
`);
  console.log(
    `일반구를 시로 합침: 시 ${cityCodeByName.size}곳, 일반구 ${Object.keys(districtToCity).length}개 ` +
      `(${[...cityCodeByName.keys()].join(", ")})`,
  );
}

/**
 * 바다 다각형에서 육지를 단계마다 잘라내 저장한다.
 * 1) sea-areas.json 의 꼭짓점으로 GeoJSON 을 만든다 (라벨 위치는 속성으로 넘긴다)
 * 2) 단계마다 mapshaper -erase 로 그 단계 TopoJSON 과 겹치는 부분을 뺀다. 그 단계에서 그리는 육지와 같은 선이라 틈·겹침이 없다
 * 3) 좌표를 소수 넷째 자리(약 10m)로 줄여 저장한다
 * @returns {Promise<void>}
 */
async function buildSeaAreas() {
  const definitions = JSON.parse(readFileSync(seaDefinitionFile, "utf8"));
  const input = {
    type: "FeatureCollection",
    features: definitions.map((sea) => ({
      type: "Feature",
      properties: { code: sea.code, name: sea.name, label_lng: sea.labelAt[0], label_lat: sea.labelAt[1] },
      geometry: { type: "Polygon", coordinates: [sea.ring] },
    })),
  };
  writeFileSync(seaInputFile, JSON.stringify(input));
  for (const level of ["sido", "sigungu", "emd"]) {
    console.log(`만드는 중: seaAreas.${level}.json (바다 - ${level} 육지)`);
    const landFile = path.join(outputDir, `${level}.topo.json`);
    await runMapshaper(
      `-i "${seaInputFile}" -erase "${landFile}" -o "${seaOutputFileOf(level)}" format=geojson precision=0.0001`,
    );
  }
}

/**
 * mapshaper 명령 한 줄을 실행한다.
 * 경로에 공백이 있어도 되도록 따옴표로 감싸서 넘긴다.
 * @param {string} commands mapshaper CLI 와 같은 형식의 명령 문자열
 * @returns {Promise<void>}
 */
async function runMapshaper(commands) {
  await mapshaper.runCommands(commands);
}

/**
 * 단계(level)별 TopoJSON 을 만든다.
 * 1) 읍면동 속성 정리 → 2) 필요하면 상위 코드로 합치기(dissolve) → 3) 단순화 → 4) 저장
 * @returns {Promise<void>}
 */
async function buildAll() {
  await downloadSourceIfMissing();
  mkdirSync(outputDir, { recursive: true });
  mergeGeneralDistricts();

  // 모든 단계에서 공통으로 쓰는 "속성 정리" 명령.
  // adm_nm 은 "서울특별시 종로구 사직동" 형태라 마지막 단어만 읍면동 이름으로 쓴다.
  const prepare =
    `-i "${citySourceFile}" ` +
    `-each "code=adm_cd2, name=adm_nm.split(' ').pop(), sigungu_code=sgg, sido_code=sido, sigungu_name=sggnm, sido_name=sidonm"`;

  const levels = [
    {
      file: "sido.topo.json",
      // 시도 코드(2자리)로 합친다
      transform: `-dissolve sido_code copy-fields=sido_name -rename-fields code=sido_code,name=sido_name`,
      simplify: "1.5%",
    },
    {
      file: "sigungu.topo.json",
      // 시군구 코드(5자리)로 합친다
      transform: `-dissolve sigungu_code copy-fields=sigungu_name,sido_code -rename-fields code=sigungu_code,name=sigungu_name`,
      simplify: "4%",
    },
    {
      file: "emd.topo.json",
      // 읍면동은 그대로 쓰고 필요한 속성만 남긴다
      transform: `-filter-fields code,name,sigungu_code,sido_code`,
      simplify: "8%",
    },
  ];

  for (const level of levels) {
    const output = path.join(outputDir, level.file);
    console.log(`만드는 중: ${level.file}`);
    await runMapshaper(
      `${prepare} ${level.transform} ` +
        `-simplify ${level.simplify} keep-shapes ` +
        `-rename-layers regions ` +
        `-o "${output}" format=topojson quantization=100000`,
    );
  }
  await buildSeaAreas();
  console.log("완료");
}

buildAll().catch((error) => {
  console.error(error);
  process.exit(1);
});
