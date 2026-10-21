import "server-only";
import {Pool, type QueryResultRow} from "pg";
import {databaseError, readDatabaseConfig} from "./db-config";
import {
  hasCoordinates,
  normalizeRestAreas,
  type Result,
  type RestAreasResponse,
} from "./rest-areas";
import {rowRevision} from "./rest-area-revision";
import {selectRestAreaColumns} from "./rest-area-fields";
import {saveRestArea} from "./rest-area-save";
import type {UpdateRequest} from "./rest-area-validation";
import type {RestAreaRecord} from "./rest-areas";
import {normalizeHighwayRoute, type HighwayRoute} from "./highway-routes";
import {canonicalHighwayRouteName} from "./highway-route-name";
import {hasCoordinates as positioned} from "./rest-areas";
import {
  selectStationColumns,
  selectStationColumn,
  stationColumns,
  stationReadOnlyColumns,
  type GasStationRecord,
  type GasStationsResponse,
} from "./gas-stations";
import {stationRecordFromRow} from "./gas-station-revision";
import {stationQueryBounds, type GasStationQuery} from "./gas-station-query";
import {compileRouteProximity, expandedBounds, routeStationRadiusMeters} from "./route-proximity";
import {filterByGeoScope} from "./geo-search";
import {saveGasStation} from "./gas-station-save";
import type {StationUpdateRequest} from "./gas-station-validation";
import {normalizeExGasStations, selectExStationColumns} from "./ex-gas-stations";
import {synchronizeExStations, type ExStationSyncSummary} from "./ex-station-sync";

const databaseGlobal = globalThis as typeof globalThis & {
  restAreaPool?: Pool;
};

// Keep one small pool across development reloads; never import this module in a client component.
function getPool(): Result<Pool> {
  const config = readDatabaseConfig(process.env);
  if (!config.ok) return config;
  if (!databaseGlobal.restAreaPool) {
    databaseGlobal.restAreaPool = new Pool({
      connectionString: config.value.connectionString,
      max: 1,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 8_000,
      ssl: {rejectUnauthorized: false},
    });
  }
  return {ok: true, value: databaseGlobal.restAreaPool};
}

export async function queryRestAreas(): Promise<Result<RestAreasResponse>> {
  try {
    const pool = getPool();
    if (!pool.ok) return pool;
    const {rows} = await pool.value.query<QueryResultRow>(`${selectRestAreaColumns} ORDER BY name, id`);
    const parsed = normalizeRestAreas(rows);
    if (!parsed.ok) return parsed;
    return {
      ok: true,
      value: {
        items: parsed.value.map((area, index) => ({
          ...area,
          revision: rowRevision(rows[index]),
        })),
        unmappedCount: parsed.value.filter(area => !hasCoordinates(area)).length,
        fetchedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {ok: false, error: databaseError(error)};
  }
}

export async function queryHighwayRoute(routeName: string): Promise<Result<HighwayRoute>> {
  try {
    routeName = canonicalHighwayRouteName(routeName);
    const pool = getPool();
    if (!pool.ok) return pool;
    const {rows} = await pool.value.query<QueryResultRow>(
      `SELECT id, route_name, route_number, sw_lat, sw_lng, ne_lat, ne_lng,
              path_coordinates
       FROM test_highway_routes WHERE route_name = $1 LIMIT 1`,
      [routeName],
    );
    if (!rows.length)
      return {
        ok: false,
        error: {code: "NOT_FOUND", message: "선택한 노선의 경로를 찾지 못했습니다."},
      };
    return normalizeHighwayRoute(rows[0]);
  } catch (reason) {
    const error = databaseError(reason);
    if (error.code === "DB_SCHEMA_ERROR")
      error.message = "노선 경로 테이블(test_highway_routes)을 확인해주세요.";
    if (error.code === "DB_QUERY_FAILED")
      error.message = "노선 경로를 조회하지 못했습니다. 잠시 후 다시 시도해주세요.";
    return {ok: false, error};
  }
}

export async function queryGasStations(
  query: GasStationQuery,
): Promise<Result<GasStationsResponse>> {
  try {
    const pool = getPool();
    if (!pool.ok) return pool;
    let bounds = stationQueryBounds(query.scope);
    let nearRoute: ReturnType<typeof compileRouteProximity> | null = null;
    if (query.routeName) {
      const route = await queryHighwayRoute(query.routeName);
      if (!route.ok) return route;
      bounds = expandedBounds(route.value.bounds, routeStationRadiusMeters + 100);
      nearRoute = compileRouteProximity(route.value);
    }
    const values: number[] = [];
    let where = "";
    if (bounds) {
      const longitude =
        bounds.west <= bounds.east ? "longi BETWEEN $3 AND $4" : "(longi >= $3 OR longi <= $4)";
      where = ` WHERE lat BETWEEN $1 AND $2 AND ${longitude}`;
      values.push(bounds.south, bounds.north, bounds.west, bounds.east);
    }
      const records: GasStationRecord[] = [];
      if (query.source === "all") {
        const {rows} = await pool.value.query<QueryResultRow>(
          `${selectStationColumns}${where} ORDER BY "siteNm", id`,
          values,
        );
        for (const row of rows) {
          const parsed = stationRecordFromRow(row);
          if (!parsed.ok) return parsed;
          records.push(parsed.value);
        }
      }
    const exWhere = where.replace(/\blat\b/g, "latitude").replace(/\blongi\b/g, "longitude");
    const {rows: exRows} = await pool.value.query<QueryResultRow>(
      `${selectExStationColumns}${exWhere} ORDER BY service_area_name, id`,
      values,
    );
    const exStations = normalizeExGasStations(exRows);
    if (!exStations.ok) return exStations;
    records.push(...exStations.value);
    const items = nearRoute
      ? records.filter(station => positioned(station) && nearRoute(station))
      : filterByGeoScope(records, query.scope, null);
    return {
      ok: true,
      value: {
        items,
        unmappedCount: items.filter(station => !positioned(station)).length,
        fetchedAt: new Date().toISOString(),
      },
    };
  } catch (reason) {
    const error = databaseError(reason);
    if (error.code === "DB_SCHEMA_ERROR")
      error.message = "주유소 테이블(test_gscargo, test_ex_station_geocodes)을 확인해주세요.";
    return {ok: false, error};
  }
}

/** Updates the read-only EX station snapshot from the Korea Expressway Corporation API. */
export async function syncExStationStatuses(): Promise<Result<ExStationSyncSummary>> {
  const pool = getPool();
  if (!pool.ok) return pool;
  return synchronizeExStations({pool: pool.value});
}

export async function queryGasStation(id: number): Promise<Result<GasStationRecord>> {
  try {
    const pool = getPool();
    if (!pool.ok) return pool;
    const columns = [...stationColumns, ...stationReadOnlyColumns]
      .map(selectStationColumn)
      .join(", ");
    const {rows} = await pool.value.query<QueryResultRow>(
      `SELECT ${columns} FROM test_gscargo WHERE id = $1 LIMIT 1`,
      [id],
    );
    if (!rows.length)
      return {ok: false, error: {code: "NOT_FOUND", message: "주유소를 찾을 수 없습니다."}};
    return stationRecordFromRow(rows[0], true);
  } catch (reason) {
    return {ok: false, error: databaseError(reason)};
  }
}

export async function updateGasStation(
  id: number,
  request: StationUpdateRequest,
): Promise<Result<GasStationRecord>> {
  try {
    const pool = getPool();
    if (!pool.ok) return pool;
    const connection = await pool.value.connect();
    return await saveGasStation(
      {
        beginTransaction: () => connection.query("BEGIN").then(() => undefined),
        query: (sql, values) => connection.query(sql, values),
        commit: () => connection.query("COMMIT").then(() => undefined),
        rollback: () => connection.query("ROLLBACK").then(() => undefined),
        release: () => connection.release(),
        destroy: () => connection.release(new Error("transaction rollback failed")),
      },
      id,
      request,
    );
  } catch (reason) {
    return {ok: false, error: databaseError(reason, "write")};
  }
}

export async function updateRestArea(
  id: number,
  request: UpdateRequest,
): Promise<Result<RestAreaRecord>> {
  try {
    const pool = getPool();
    if (!pool.ok) return pool;
    const connection = await pool.value.connect();
    return await saveRestArea(
      {
        beginTransaction: () => connection.query("BEGIN").then(() => undefined),
        query: (sql, values) => connection.query(sql, values),
        commit: () => connection.query("COMMIT").then(() => undefined),
        rollback: () => connection.query("ROLLBACK").then(() => undefined),
        release: () => connection.release(),
        destroy: () => connection.release(new Error("transaction rollback failed")),
      },
      id,
      request,
    );
  } catch (error) {
    return {ok: false, error: databaseError(error, "write")};
  }
}
