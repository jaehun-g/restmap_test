import process from "node:process";
import {Client} from "pg";
import {dbColumn, dbTable} from "./db-columns.mjs";

const legacyRouteName = "밀양울산선";
const canonicalRouteName = "함양울산선";

function fail(message) {
  throw new Error(message);
}

async function main() {
  if (!process.argv.includes("--apply")) {
    console.log(
      JSON.stringify({
        mode: "dry-run",
        legacyRouteName,
        canonicalRouteName,
        changes: ["tb_lounge.lg_route_name", "duplicate tb_highway_routes geometry"],
      }),
    );
    return;
  }

  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) fail("DATABASE_URL is required when using --apply.");
  const client = new Client({connectionString, ssl: {rejectUnauthorized: false}});
  await client.connect();
  try {
    await client.query("BEGIN");
    const routes = await client.query(
      `SELECT ${dbColumn("highway_routes", "id")} AS id, ${dbColumn("highway_routes", "route_name")} AS route_name, ${dbColumn("highway_routes", "route_number")} AS route_number, md5(${dbColumn("highway_routes", "path_coordinates")}::text) AS path_hash
       FROM public.${dbTable("highway_routes")}
       WHERE ${dbColumn("highway_routes", "route_name")} IN ($1, $2)
       ORDER BY ${dbColumn("highway_routes", "id")} FOR UPDATE`,
      [legacyRouteName, canonicalRouteName],
    );
    if (
      routes.rowCount !== 2 ||
      routes.rows[0].path_hash !== routes.rows[1].path_hash ||
      routes.rows.some(route => String(route.route_number) !== "14")
    )
      fail("Route aliases do not have exactly matching route 14 geometry.");

    const legacyAreas = await client.query(
      `SELECT ${dbColumn("lounge", "id")} AS id, ${dbColumn("lounge", "name")} AS name FROM public.${dbTable("lounge")}
       WHERE ${dbColumn("lounge", "route_name")} = $1 ORDER BY ${dbColumn("lounge", "id")} FOR UPDATE`,
      [legacyRouteName],
    );
    if (legacyAreas.rowCount !== 2) fail("Expected exactly two legacy rest-area rows.");

    const updatedRestAreas = await client.query(
      `UPDATE public.${dbTable("lounge")} SET ${dbColumn("lounge", "route_name")} = $1
       WHERE ${dbColumn("lounge", "route_name")} = $2 RETURNING ${dbColumn("lounge", "id")} AS id, ${dbColumn("lounge", "name")} AS name`,
      [canonicalRouteName, legacyRouteName],
    );
    const removedRoute = await client.query(
        `DELETE FROM public.${dbTable("highway_routes")}
         WHERE ${dbColumn("highway_routes", "route_name")} = $1 RETURNING ${dbColumn("highway_routes", "id")} AS id, ${dbColumn("highway_routes", "route_name")} AS route_name`,
      [legacyRouteName],
    );
    if (removedRoute.rowCount !== 1) fail("Expected exactly one duplicate route row.");

    await client.query("COMMIT");
    const [restAreaCounts, remainingRoutes] = await Promise.all([
      client.query(
        `SELECT ${dbColumn("lounge", "route_name")} AS route_name, count(*)::int AS count FROM public.${dbTable("lounge")}
         WHERE ${dbColumn("lounge", "route_name")} IN ($1, $2) GROUP BY ${dbColumn("lounge", "route_name")} ORDER BY ${dbColumn("lounge", "route_name")}`,
        [legacyRouteName, canonicalRouteName],
      ),
      client.query(
        `SELECT ${dbColumn("highway_routes", "id")} AS id, ${dbColumn("highway_routes", "route_name")} AS route_name, ${dbColumn("highway_routes", "route_number")} AS route_number, jsonb_array_length(${dbColumn("highway_routes", "path_coordinates")}) AS path_count
         FROM public.${dbTable("highway_routes")} WHERE ${dbColumn("highway_routes", "route_name")} = $1`,
        [canonicalRouteName],
      ),
    ]);
    console.log(
      JSON.stringify({
        updatedRestAreas: updatedRestAreas.rows,
        removedRoute: removedRoute.rows,
        restAreaRouteCounts: restAreaCounts.rows,
        remainingRoute: remainingRoutes.rows,
      }),
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

await main();
