import fs from "node:fs/promises";
import mysql from "mysql2/promise";
import nextEnv from "@next/env";
import {readDatabaseConfig} from "../lib/db-config.ts";
import {parseExStationGeocodeOverrides} from "../lib/ex-station-geocode-overrides.ts";

const {loadEnvConfig} = nextEnv;
loadEnvConfig(process.cwd());

if (!process.argv.includes("--apply")) {
  console.log("DB에 저장하지 않았습니다. 저장하려면 --apply 옵션을 추가하세요.");
  process.exit(0);
}

const config = readDatabaseConfig(process.env);
if (!config.ok) throw new Error(config.error.message);
const source = JSON.parse(
  await fs.readFile(new URL("../data/ex-station-geocode-overrides.json", import.meta.url), "utf8"),
);
const overrides = parseExStationGeocodeOverrides(source);
if (!overrides.ok) throw new Error(overrides.error.message);
const {tls, ...connection} = config.value;
const db = await mysql.createConnection({
  ...connection,
  charset: "utf8",
  ...(tls ? {ssl: {rejectUnauthorized: true}} : {}),
});

try {
  for (const override of overrides.value)
    await db.query(
      `INSERT INTO test_ex_station_geocode_overrides (source_key, search_address, enabled)
       VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE search_address = VALUES(search_address), enabled = VALUES(enabled)`,
      [override.sourceKey, override.searchAddress],
    );
  console.log(`${overrides.value.length}건의 수동 주소 매핑을 저장했습니다.`);
} finally {
  await db.end();
}
