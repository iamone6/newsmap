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
 * 실행: npm run build:geo
 * 원본 파일은 .cache/ 에 한 번만 내려받아 두고 다시 쓴다.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
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

  // 모든 단계에서 공통으로 쓰는 "속성 정리" 명령.
  // adm_nm 은 "서울특별시 종로구 사직동" 형태라 마지막 단어만 읍면동 이름으로 쓴다.
  const prepare =
    `-i "${sourceFile}" ` +
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
  console.log("완료");
}

buildAll().catch((error) => {
  console.error(error);
  process.exit(1);
});
