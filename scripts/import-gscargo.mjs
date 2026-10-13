import fs from "node:fs/promises";
import mysql from "mysql2/promise";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

// Next.js의 .env.local 환경변수 불러오기
loadEnvConfig(process.cwd());

// 1. 다운로드한 GS칼텍스 JSON 읽기
const file = await fs.readFile("./gsdata/gs_stations.json", "utf8");

const data = JSON.parse(file);

if (!Array.isArray(data.siteList)) {
  throw new Error("siteList 배열이 없습니다.");
}

const stations = data.siteList;

// 2. 원본 JSON 필드 목록
const columns = [
  "siteCd",
  "siteNm",
  "siteSxnCd",
  "siteOperTy",
  "telNo",
  "mpNo",
  "zipNo",
  "zipAddr",
  "detAddr",
  "lat",
  "longi",
  "aoYn",
  "cvsYn",
  "kixxprimeYn",
  "cargoYn",
  "selfYn",
  "lpgYn",
  "carWashYn",
  "smartSiteYn",
  "evYn",
  "bmarkYn",
  "payPsblYn",
  "businsFrTm",
  "businsToTm",
  "carWashFrTm",
  "carWashToTm",
  "carWashCpnJoinYn",
  "eplusHubYn",
  "reservationYn",
  "carWashPsblYn",
  "taxiPreperYn",
  "disabledPreperYn",
  "persona",
  "epMoneyYn",
  "goodgsYn",
  "kakaoPayYn",
  "naverPayYn",
  "zeroPayYn",
  "paycoYn",
  "hyundaiPayYn",
  "tossPayYn",
];

// 3. 데이터 검증
const siteCodes = stations.map((s) => s.siteCd);

if (
  stations.length === 0 ||
  siteCodes.some((code) => typeof code !== "string" || !code) ||
  new Set(siteCodes).size !== siteCodes.length
) {
  throw new Error("데이터가 비었거나 siteCd가 누락·중복되었습니다.");
}

const unknownFields = [
  ...new Set(
    stations.flatMap((station) =>
      Object.keys(station).filter((key) => !columns.includes(key)),
    ),
  ),
];

if (unknownFields.length > 0) {
  throw new Error("처리되지 않은 JSON 필드: " + unknownFields.join(", "));
}

console.log("원본 전체 주유소:", stations.length);
console.log(
  "원본 화물차 특화:",
  stations.filter((s) => s.cargoYn === "Y").length,
);

// 4. 입력 모드 설정
// 기본은 10건 테스트, --all 옵션일 때 전체 입력
const importAll = process.argv.includes("--all");
const targetStations = importAll ? stations : stations.slice(0, 10);

console.log("입력 모드:", importAll ? "전체 입력" : "10건 테스트");

// 5. SQL 생성
const allColumns = [...columns];

const insertColumns = allColumns.map((column) => `\`${column}\``).join(", ");

const placeholders = allColumns.map(() => "?").join(", ");

const updateColumns = allColumns
  .filter((column) => column !== "siteCd")
  .map((column) => `\`${column}\` = VALUES(\`${column}\`)`)
  .join(", ");

const sql = `
  INSERT INTO \`ktrucker\`.\`test_gscargo\`
  (${insertColumns})
  VALUES (${placeholders})
  ON DUPLICATE KEY UPDATE ${updateColumns}
`;

// 6. MariaDB 연결
const db = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: "ktrucker",
  charset: "utf8",
});

try {
  // 연결 대상 테이블 확인
  const [tables] = await db.execute(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.tables
     WHERE table_schema = 'ktrucker'
       AND table_name = 'test_gscargo'`,
  );

  if (tables[0].cnt !== 1) {
    throw new Error("test_gscargo 테이블이 없습니다.");
  }

  // 7. 데이터 입력 시작
  await db.beginTransaction();

  for (const station of targetStations) {
    const values = columns.map((column) => station[column] ?? null);
    await db.execute(sql, values);
  }

  // 8. 성공한 경우 변경사항 확정
  await db.commit();

  console.log("DB 입력 성공:", targetStations.length, "건");
} catch (error) {
  // 오류 시 미확정 변경 취소
  await db.rollback();
  console.error("DB 입력 실패:", error);
  process.exitCode = 1;
} finally {
  // DB 연결 종료
  await db.end();
}
