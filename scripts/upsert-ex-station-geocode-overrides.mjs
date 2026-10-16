import fs from "node:fs/promises";
import {Pool} from "pg";
import nextEnv from "@next/env";
import {readDatabaseConfig} from "../lib/db-config.ts";
import {parseExStationGeocodeOverrides} from "../lib/ex-station-geocode-overrides.ts";

const {loadEnvConfig} = nextEnv;
loadEnvConfig(process.cwd());
if (!process.argv.includes("--apply")) {
  console.log("DB를 변경하지 않습니다. 반영하려면 --apply 옵션을 추가하세요.");
  process.exit(0);
}
const config = readDatabaseConfig(process.env);
if (!config.ok) throw new Error(config.error.message);
const source = JSON.parse(await fs.readFile(new URL("../data/ex-station-geocode-overrides.json", import.meta.url), "utf8"));
const overrides = parseExStationGeocodeOverrides(source);
if (!overrides.ok) throw new Error(overrides.error.message);
const db = new Pool({connectionString: config.value.connectionString, max: 1, ssl: {rejectUnauthorized: false}});
try {
  for (const override of overrides.value)
    await db.query(
      `INSERT INTO test_ex_station_geocode_overrides (source_key, search_address, enabled)
       VALUES ($1, $2, TRUE)
       ON CONFLICT (source_key) DO UPDATE
       SET search_address = EXCLUDED.search_address, enabled = TRUE, updated_at = CURRENT_TIMESTAMP`,
      [override.sourceKey, override.searchAddress],
    );
  console.log(`${overrides.value.length}건의 수동 주소 매핑을 반영했습니다.`);
} finally {
  await db.end();
}
