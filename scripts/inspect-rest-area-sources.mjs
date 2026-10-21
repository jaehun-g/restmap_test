import fs from "node:fs/promises";
import nextEnv from "@next/env";
import {Client} from "pg";
import {fetchRestAreaSources, parseRestAreaCsv} from "../lib/rest-area-sources.ts";

nextEnv.loadEnvConfig(process.cwd());
const csvPath = process.argv[2];
if (!csvPath) throw new Error("CSV 경로가 필요합니다.");
const csv = parseRestAreaCsv(await fs.readFile(csvPath, "utf8"));
const sources = await fetchRestAreaSources(undefined, csv.map(row => row["휴게소명"]), process.argv.includes("--allow-partial-services"));
const client = new Client({connectionString: process.env.DATABASE_URL, ssl: {rejectUnauthorized: false}});
await client.connect();
try {
  await client.query("BEGIN READ ONLY");
  const existing = (await client.query("SELECT * FROM test_lounge ORDER BY id")).rows;
  const columns = (await client.query("SELECT column_name, data_type, character_maximum_length, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='test_lounge' ORDER BY ordinal_position")).rows;
  await client.query("ROLLBACK");
  await fs.mkdir(".rest-area-sync", {recursive: true});
  await fs.writeFile(".rest-area-sync/snapshot.json", JSON.stringify({sources, csv, existing, columns}, null, 2));
  console.log(JSON.stringify({csv: csv.length, existing: existing.length, locations: sources.locations.length, facilities: sources.facilities.length, services: sources.services.length, recovery: sources.recovery, columns}, null, 2));
} finally { await client.end(); }
