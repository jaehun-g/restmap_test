import fs from "node:fs/promises";
import mysql from "mysql2/promise";
import nextEnv from "@next/env";
import {readDatabaseConfig} from "../lib/db-config.ts";

const {loadEnvConfig} = nextEnv;
loadEnvConfig(process.cwd());

const config = readDatabaseConfig(process.env);
if (!config.ok) throw new Error(config.error.message);
const sql = await fs.readFile(
  new URL("../sql/test_ex_station_geocodes.sql", import.meta.url),
  "utf8",
);
const {tls, ...connection} = config.value;
const db = await mysql.createConnection({
  ...connection,
  charset: "utf8",
  ...(tls ? {ssl: {rejectUnauthorized: true}} : {}),
});

try {
  await db.query(sql);
  const [rows] = await db.query(
    "SELECT table_name, table_collation FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?",
    ["test_ex_station_geocodes"],
  );
  if (!rows.length) throw new Error("test_ex_station_geocodes 테이블 생성 확인에 실패했습니다.");
  console.log("test_ex_station_geocodes 테이블을 utf8로 생성했습니다.");
} finally {
  await db.end();
}
