import mysql from "mysql2/promise";
import nextEnv from "@next/env";
import {readDatabaseConfig} from "../lib/db-config.ts";
import {synchronizeExStations} from "../lib/ex-station-sync.ts";

const {loadEnvConfig} = nextEnv;
loadEnvConfig(process.cwd());

if (!process.argv.includes("--apply")) {
  console.log("DB를 변경하지 않았습니다. 실제 동기화는 --apply 옵션으로 실행하세요.");
  process.exit(0);
}

const config = readDatabaseConfig(process.env);
if (!config.ok) throw new Error(config.error.message);
const {tls, ...connection} = config.value;
const pool = mysql.createPool({
  ...connection,
  ...(tls ? {ssl: {rejectUnauthorized: true}} : {}),
  charset: "utf8",
  connectionLimit: 3,
});

try {
  const result = await synchronizeExStations({pool});
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  const summary = result.value;
  console.log(
    `동기화 완료: 전체 ${summary.total}건 · 신규 지오코딩 ${summary.geocoded}건 · 재사용 ${summary.reused}건 · 미해결 ${summary.unresolved}건 · 삭제 ${summary.deleted}건`,
  );
} finally {
  await pool.end();
}
