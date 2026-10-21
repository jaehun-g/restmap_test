import nextEnv from "@next/env";
import {Pool} from "pg";
import {readDatabaseConfig} from "../lib/db-config.ts";
import {synchronizeExStationPrices} from "../lib/ex-station-price-sync.ts";

nextEnv.loadEnvConfig(process.cwd());
if (!process.argv.includes("--apply")) {
  console.log("DB를 변경하지 않습니다. 실제 가격 갱신은 --apply 옵션으로 실행하세요.");
} else {
  const config = readDatabaseConfig(process.env);
  if (!config.ok) throw new Error(config.error.message);
  const pool = new Pool({
    connectionString: config.value.connectionString, max: 1,
    connectionTimeoutMillis: 8_000, ssl: {rejectUnauthorized: false},
  });
  try {
    const result = await synchronizeExStationPrices({pool});
    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
    console.log(JSON.stringify(result.value, null, 2));
  } finally {
    await pool.end();
  }
}
