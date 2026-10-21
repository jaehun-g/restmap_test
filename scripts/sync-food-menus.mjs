import nextEnv from "@next/env";
import {Pool} from "pg";
import {selectRestAreaColumns} from "../lib/rest-area-fields.ts";
import {normalizeRestAreas} from "../lib/rest-areas.ts";
import {readDatabaseConfig} from "../lib/db-config.ts";
import {fetchFoodMenus} from "../lib/food-menu-source.ts";
import {synchronizeFoodMenus} from "../lib/food-menu-sync.ts";

nextEnv.loadEnvConfig(process.cwd());
const config = readDatabaseConfig(process.env);
if (!config.ok) throw new Error(config.error.message);
const pool = new Pool({connectionString: config.value.connectionString, max: 1, ssl: {rejectUnauthorized: false}});
try {
  const result = await synchronizeFoodMenus({
    pool,
    fetchMenus: fetchFoodMenus,
    loadAreas: async () => {
      const {rows} = await pool.query(selectRestAreaColumns);
      return normalizeRestAreas(rows);
    },
  });
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  console.log(JSON.stringify(result.value, null, 2));
} finally {
  await pool.end();
}
