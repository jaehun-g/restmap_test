import process from "node:process";
import {Client} from "pg";

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
        changes: ["test_lounge route_name", "duplicate test_highway_routes geometry"],
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
      `SELECT id, route_name, route_number, md5(path_coordinates::text) AS path_hash
       FROM test_highway_routes
       WHERE route_name IN ($1, $2)
       ORDER BY id FOR UPDATE`,
      [legacyRouteName, canonicalRouteName],
    );
    if (
      routes.rowCount !== 2 ||
      routes.rows[0].path_hash !== routes.rows[1].path_hash ||
      routes.rows.some(route => String(route.route_number) !== "14")
    )
      fail("Route aliases do not have exactly matching route 14 geometry.");

    const legacyAreas = await client.query(
      `SELECT id, name FROM test_lounge
       WHERE route_name = $1 ORDER BY id FOR UPDATE`,
      [legacyRouteName],
    );
    if (legacyAreas.rowCount !== 2) fail("Expected exactly two legacy rest-area rows.");

    const updatedRestAreas = await client.query(
      `UPDATE test_lounge SET route_name = $1
       WHERE route_name = $2 RETURNING id, name`,
      [canonicalRouteName, legacyRouteName],
    );
    const removedRoute = await client.query(
      `DELETE FROM test_highway_routes
       WHERE route_name = $1 RETURNING id, route_name`,
      [legacyRouteName],
    );
    if (removedRoute.rowCount !== 1) fail("Expected exactly one duplicate route row.");

    await client.query("COMMIT");
    const [restAreaCounts, remainingRoutes] = await Promise.all([
      client.query(
        `SELECT route_name, count(*)::int AS count FROM test_lounge
         WHERE route_name IN ($1, $2) GROUP BY route_name ORDER BY route_name`,
        [legacyRouteName, canonicalRouteName],
      ),
      client.query(
        `SELECT id, route_name, route_number, jsonb_array_length(path_coordinates) AS path_count
         FROM test_highway_routes WHERE route_name = $1`,
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
