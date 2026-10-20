import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";
import {Client} from "pg";

const coordinatePrecision = 5;
const coordinateFactor = 10 ** coordinatePrecision;

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function fail(message) {
  throw new Error(message);
}

function number(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`${label} must be a finite number.`);
  return value;
}

function coordinate(value, label) {
  if (!Array.isArray(value) || value.length < 2) fail(`${label} must be a GeoJSON coordinate.`);
  const longitude = number(value[0], `${label}[0]`);
  const latitude = number(value[1], `${label}[1]`);
  if (Math.abs(longitude) > 180 || Math.abs(latitude) > 90) fail(`${label} is outside WGS84 bounds.`);
  return [
    Math.round(latitude * coordinateFactor) / coordinateFactor,
    Math.round(longitude * coordinateFactor) / coordinateFactor,
  ];
}

function lines(geometry, label) {
  if (!geometry || typeof geometry !== "object") fail(`${label} has no geometry.`);
  if (geometry.type === "LineString") return [geometry.coordinates];
  if (geometry.type === "MultiLineString") return geometry.coordinates;
  fail(`${label} must be a LineString or MultiLineString.`);
}

export function routeFromGeoJson(value) {
  if (!value || typeof value !== "object" || value.type !== "FeatureCollection" || !Array.isArray(value.features))
    fail("Expected a GeoJSON FeatureCollection.");

  const paths = [];
  let south = Infinity;
  let west = Infinity;
  let north = -Infinity;
  let east = -Infinity;
  for (const [featureIndex, feature] of value.features.entries()) {
    if (!feature || typeof feature !== "object") fail(`Feature ${featureIndex + 1} is invalid.`);
    for (const [lineIndex, sourceLine] of lines(feature.geometry, `Feature ${featureIndex + 1}`).entries()) {
      if (!Array.isArray(sourceLine) || sourceLine.length < 2)
        fail(`Feature ${featureIndex + 1}, line ${lineIndex + 1} has fewer than two coordinates.`);
      const line = sourceLine.map((point, pointIndex) =>
        coordinate(point, `Feature ${featureIndex + 1}, line ${lineIndex + 1}, point ${pointIndex + 1}`),
      );
      for (const [latitude, longitude] of line) {
        south = Math.min(south, latitude);
        west = Math.min(west, longitude);
        north = Math.max(north, latitude);
        east = Math.max(east, longitude);
      }
      paths.push(line);
    }
  }
  if (!paths.length) fail("The GeoJSON contains no paths.");
  return {paths, bounds: {south, west, north, east}};
}

async function main() {
  const routeName = argument("--route-name");
  const file = argument("--file");
  const apply = process.argv.includes("--apply");
  if (!routeName || !file) {
    fail("Usage: node --env-file=.env.local scripts/import-highway-route.mjs --route-name <name> --file <geojson> [--apply]");
  }

  const geojson = JSON.parse(await fs.readFile(path.resolve(file), "utf8"));
  const route = routeFromGeoJson(geojson);
  const summary = {
    routeName,
    pathCount: route.paths.length,
    pointCount: route.paths.reduce((count, line) => count + line.length, 0),
    bounds: route.bounds,
    mode: apply ? "apply" : "dry-run",
  };
  if (!apply) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) fail("DATABASE_URL is required when using --apply.");
  const client = new Client({connectionString, ssl: {rejectUnauthorized: false}});
  await client.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE test_highway_routes
       SET path_coordinates = $1::jsonb,
           sw_lat = $2,
           sw_lng = $3,
           ne_lat = $4,
           ne_lng = $5
       WHERE route_name = $6
       RETURNING id, route_name, sw_lat, sw_lng, ne_lat, ne_lng, jsonb_array_length(path_coordinates) AS path_count`,
      [JSON.stringify(route.paths), route.bounds.south, route.bounds.west, route.bounds.north, route.bounds.east, routeName],
    );
    if (result.rows.length !== 1) fail(`Expected exactly one '${routeName}' route row, found ${result.rows.length}.`);
    await client.query("COMMIT");
    console.log(JSON.stringify({...summary, updated: result.rows[0]}, null, 2));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
