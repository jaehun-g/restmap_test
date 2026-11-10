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
import {selectRestAreaColumns, selectMobileRestAreaColumns} from "./rest-area-fields";
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
import {normalizeExGasStations, selectExStationColumns, selectMobileExStationColumns} from "./ex-gas-stations";
import {synchronizeExStations, type ExStationSyncSummary} from "./ex-station-sync";
import {synchronizeExStationPrices, type ExStationPriceSyncSummary} from "./ex-station-price-sync";
import {fetchFoodMenus} from "./food-menu-source";
import {synchronizeFoodMenus, type FoodMenuSyncSummary} from "./food-menu-sync";
import type {FoodMenusResponse} from "./food-menus";
import {invalidateMapData} from "./map-cache-tags";

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

export async function queryRestAreas(mobile = false): Promise<Result<RestAreasResponse>> {
  try {
    const pool = getPool();
    if (!pool.ok) return pool;
    const {rows} = await pool.value.query<QueryResultRow>(`${mobile ? selectMobileRestAreaColumns : selectRestAreaColumns} ORDER BY name, id`);
    const parsed = normalizeRestAreas(rows);
    if (!parsed.ok) return parsed;
    return {
      ok: true,
      value: {
        items: parsed.value.map((area, index) => ({
          ...area,
          revision: mobile ? "" : rowRevision(rows[index]),
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
      `SELECT hr_id AS id, hr_route_name AS route_name, hr_route_number AS route_number,
              hr_sw_lat AS sw_lat, hr_sw_lng AS sw_lng, hr_ne_lat AS ne_lat,
              hr_ne_lng AS ne_lng, hr_path_coordinates AS path_coordinates
       FROM tb_highway_routes WHERE hr_route_name = $1 LIMIT 1`,
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
      error.message = "노선 경로 테이블(tb_highway_routes)을 확인해주세요.";
    if (error.code === "DB_QUERY_FAILED")
      error.message = "노선 경로를 조회하지 못했습니다. 잠시 후 다시 시도해주세요.";
    return {ok: false, error};
  }
}

export async function queryGasStations(
  query: GasStationQuery,
  mobile = false,
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
        bounds.west <= bounds.east ? "gs_longi BETWEEN $3 AND $4" : "(gs_longi >= $3 OR gs_longi <= $4)";
      where = ` WHERE gs_lat BETWEEN $1 AND $2 AND ${longitude}`;
      values.push(bounds.south, bounds.north, bounds.west, bounds.east);
    }
      const records: GasStationRecord[] = [];
      if (query.source === "all") {
        const {rows} = await pool.value.query<QueryResultRow>(
          `${selectStationColumns}${where} ORDER BY "gs_sitenm", "gs_id"`,
          values,
        );
        for (const row of rows) {
          const parsed = stationRecordFromRow(row);
          if (!parsed.ok) return parsed;
          records.push(parsed.value);
        }
      }
    const exWhere = where.replace(/\bgs_lat\b/g, "ex_latitude").replace(/\bgs_longi\b/g, "ex_longitude");
    const {rows: exRows} = await pool.value.query<QueryResultRow>(
      `${mobile ? selectMobileExStationColumns : selectExStationColumns}${exWhere} ORDER BY service_area_name, id`,
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
      error.message = "주유소 테이블(tb_gscargo, tb_ex_station_geocodes)을 확인해주세요.";
    return {ok: false, error};
  }
}

export async function queryMobileDetail(kind: "rest" | "station", id: number) {
  try {
    const pool = getPool();
    if (!pool.ok) return pool;
    if (kind === "rest") {
      const {rows} = await pool.value.query<QueryResultRow>(`${selectRestAreaColumns} WHERE lg_id = $1`, [id]);
      if (!rows.length) return {ok: false as const, error: {code: "NOT_FOUND", message: "휴게소를 찾을 수 없습니다."}};
      const parsed = normalizeRestAreas(rows);
      return parsed.ok ? {ok: true as const, value: {...parsed.value[0], revision: rowRevision(rows[0])}} : parsed;
    }
    const {rows} = await pool.value.query<QueryResultRow>(`${selectExStationColumns} WHERE ex_id = $1`, [id]);
    if (!rows.length) return {ok: false as const, error: {code: "NOT_FOUND", message: "주유소를 찾을 수 없습니다."}};
    const parsed = normalizeExGasStations(rows);
    return parsed.ok ? {ok: true as const, value: parsed.value[0]} : parsed;
  } catch (error) { return {ok: false as const, error: databaseError(error)}; }
}

/** Updates the read-only EX station snapshot from the Korea Expressway Corporation API. */
export async function syncExStationStatuses(): Promise<Result<ExStationSyncSummary>> {
  const pool = getPool();
  if (!pool.ok) return pool;
  const result = await synchronizeExStations({pool: pool.value});
  if (result.ok) invalidateMapData("station");
  return result;
}

export async function syncExStationPrices(): Promise<Result<ExStationPriceSyncSummary>> {
  const pool = getPool();
  if (!pool.ok) return pool;
  const result = await synchronizeExStationPrices({pool: pool.value});
  if (result.ok) invalidateMapData("station");
  return result;
}

export async function queryFoodMenus(restAreaId: number): Promise<Result<FoodMenusResponse>> {
  try {
    const pool = getPool();
    if (!pool.ok) return pool;
    const {rows} = await pool.value.query<QueryResultRow>(
      `SELECT f.fm_source_key AS source_key, f.fm_food_nm AS food_nm,
        f.fm_food_cost AS food_cost, f.fm_recommendyn AS recommendyn,
        f.fm_bestfoodyn AS bestfoodyn,
        to_char(f.fm_source_updated_at,'YYYY-MM-DD') AS source_updated_at,
        f.fm_collected_at AS collected_at
       FROM public.tb_food_menus f
       JOIN public.tb_food_area_mappings m ON m.am_std_rest_cd=f.fm_std_rest_cd
       WHERE m.am_rest_area_id=$1 AND m.am_match_status='matched'
         AND f.fm_source_present=true AND f.fm_app_visible=true
       ORDER BY f.fm_bestfoodyn DESC NULLS LAST,
         f.fm_recommendyn DESC NULLS LAST, f.fm_food_nm`,
      [restAreaId],
    );
    const items = rows.map(row => ({
      key: String(row.source_key), name: String(row.food_nm),
      price: row.food_cost === null ? null : Number(row.food_cost),
      recommended: typeof row.recommendyn === "boolean" ? row.recommendyn : null,
      best: typeof row.bestfoodyn === "boolean" ? row.bestfoodyn : null,
      sourceUpdatedAt: typeof row.source_updated_at === "string" ? row.source_updated_at : null,
      collectedAt: row.collected_at instanceof Date ? row.collected_at.toISOString() : String(row.collected_at),
    }));
    return {ok: true, value: {items, collectedAt: items[0]?.collectedAt ?? null}};
  } catch (reason) {
    return {ok: false, error: databaseError(reason)};
  }
}

export async function syncFoodMenuSnapshot(): Promise<Result<FoodMenuSyncSummary>> {
  const pool = getPool();
  if (!pool.ok) return pool;
  const result = await synchronizeFoodMenus({
    pool: pool.value,
    fetchMenus: fetchFoodMenus,
    loadAreas: async () => {
      const result = await queryRestAreas();
      return result.ok ? {ok: true, value: result.value.items} : result;
    },
  });
  if (result.ok) invalidateMapData("rest");
  return result;
}

export async function queryGasStation(id: number): Promise<Result<GasStationRecord>> {
  try {
    const pool = getPool();
    if (!pool.ok) return pool;
    const columns = [...stationColumns, ...stationReadOnlyColumns]
      .map(selectStationColumn)
      .join(", ");
    const {rows} = await pool.value.query<QueryResultRow>(
      `SELECT ${columns} FROM tb_gscargo WHERE gs_id = $1 LIMIT 1`,
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
    const result = await saveGasStation(
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
    if (result.ok) invalidateMapData("station");
    return result;
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
    const result = await saveRestArea(
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
    if (result.ok) invalidateMapData("rest");
    return result;
  } catch (error) {
    return {ok: false, error: databaseError(error, "write")};
  }
}
