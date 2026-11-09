import fs from "node:fs/promises";
import nextEnv from "@next/env";
import {Client} from "pg";

nextEnv.loadEnvConfig(process.cwd());

const args = new Set(process.argv.slice(2));
for (const arg of args) {
  if (arg !== "--apply") throw new Error(`알 수 없는 옵션: ${arg}`);
}
const apply = args.has("--apply");
const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL을 설정해주세요.");

const tables = [
  ["test_lounge", "tb_lounge", "lg_"],
  ["test_gscargo", "tb_gscargo", "gs_"],
  ["test_ex_station_geocodes", "tb_ex_station_geocodes", "ex_"],
  ["test_ex_station_geocode_overrides", "tb_ex_station_geocode_overrides", "eo_"],
  ["test_highway_routes", "tb_highway_routes", "hr_"],
  ["test_food_menus", "tb_food_menus", "fm_"],
  ["test_food_area_mappings", "tb_food_area_mappings", "am_"],
  ["test_food_menu_sync_runs", "tb_food_menu_sync_runs", "sr_"],
];
const sql = await fs.readFile(
  new URL("../sql/migrate_test_tables_to_tb_prefixes.sql", import.meta.url),
  "utf8",
);
const triggerSql = await fs.readFile(new URL("../sql/fix_station_update_triggers.sql", import.meta.url), "utf8");
const client = new Client({
  connectionString,
  ssl: {rejectUnauthorized: false},
  connectionTimeoutMillis: 10_000,
});

try {
  await client.connect();
  await client.query("BEGIN");
  await client.query(sql);
  await client.query(triggerSql);

  const summary = [];
  for (const [, table, prefix] of tables) {
    const {rows: countRows} = await client.query(`SELECT count(*)::int AS count FROM public."${table}"`);
    const {rows: columnRows} = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
      [table],
    );
    if (columnRows.some(({column_name}) => !column_name.startsWith(prefix)))
      throw new Error(`${table}에 접두사가 없는 컬럼이 있습니다.`);
    summary.push({table, rows: countRows[0].count, columns: columnRows.length});
  }
  const {rows: foreignKeyRows} = await client.query(
    `SELECT count(*)::int AS count FROM pg_constraint
     WHERE contype='f' AND (conrelid = ANY(ARRAY[
       'public.tb_lounge'::regclass, 'public.tb_gscargo'::regclass,
       'public.tb_ex_station_geocodes'::regclass,
       'public.tb_ex_station_geocode_overrides'::regclass,
       'public.tb_highway_routes'::regclass, 'public.tb_food_menus'::regclass,
       'public.tb_food_area_mappings'::regclass,
       'public.tb_food_menu_sync_runs'::regclass
     ]) OR confrelid = ANY(ARRAY[
       'public.tb_lounge'::regclass, 'public.tb_gscargo'::regclass,
       'public.tb_ex_station_geocodes'::regclass,
       'public.tb_ex_station_geocode_overrides'::regclass,
       'public.tb_highway_routes'::regclass, 'public.tb_food_menus'::regclass,
       'public.tb_food_area_mappings'::regclass,
       'public.tb_food_menu_sync_runs'::regclass
     ]))`,
  );

  if (apply) {
    await client.query("COMMIT");
  } else {
    await client.query("ROLLBACK");
  }
  console.log(JSON.stringify({mode: apply ? "applied" : "dry-run rolled back", tables: summary, foreignKeys: foreignKeyRows[0].count}, null, 2));
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  await client.end();
}
