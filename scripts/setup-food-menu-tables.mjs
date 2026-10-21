import fs from "node:fs/promises";
import nextEnv from "@next/env";
import {Pool} from "pg";
import {readDatabaseConfig} from "../lib/db-config.ts";

nextEnv.loadEnvConfig(process.cwd());
const config = readDatabaseConfig(process.env);
if (!config.ok) throw new Error(config.error.message);
const sql = await fs.readFile(new URL("../sql/test_food_menus.sql", import.meta.url), "utf8");
const pool = new Pool({connectionString: config.value.connectionString, max: 1, ssl: {rejectUnauthorized: false}});
try {
  await pool.query(sql);
  const {rows} = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public'
     AND table_name = ANY($1::text[]) ORDER BY table_name`,
    [["test_food_area_mappings", "test_food_menus", "test_food_menu_sync_runs"]],
  );
  if (rows.length !== 3) throw new Error("음식정보 테이블 생성 검증에 실패했습니다.");
  console.log("휴게소 음식정보 테이블 3개를 Supabase에 준비했습니다.");
} finally {
  await pool.end();
}
