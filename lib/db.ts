import "server-only";
import mysql, { type Pool, type RowDataPacket } from "mysql2/promise";
import { databaseError, readDatabaseConfig } from "./db-config";
import {
  hasCoordinates,
  normalizeRestAreas,
  type Result,
  type RestAreasResponse,
} from "./rest-areas";
import { rowRevision } from "./rest-area-revision";
import { selectRestAreaColumns } from "./rest-area-fields";
import { saveRestArea } from "./rest-area-save";
import type { UpdateRequest } from "./rest-area-validation";
import type { RestAreaRecord } from "./rest-areas";
import { normalizeHighwayRoute, type HighwayRoute } from "./highway-routes";

const databaseGlobal = globalThis as typeof globalThis & {
  restAreaPool?: Pool;
};

// Keep one small pool across development reloads; never import this module in a client component.
function getPool(): Result<Pool> {
  const config = readDatabaseConfig(process.env);
  if (!config.ok) return config;
  if (!databaseGlobal.restAreaPool) {
    const { tls, ...connection } = config.value;
    databaseGlobal.restAreaPool = mysql.createPool({
      ...connection,
      charset: "utf8mb4",
      connectionLimit: 3,
      maxIdle: 1,
      idleTimeout: 30_000,
      waitForConnections: true,
      queueLimit: 10,
      connectTimeout: 8_000,
      enableKeepAlive: true,
      ...(tls ? { ssl: { rejectUnauthorized: true } } : {}),
    });
  }
  return { ok: true, value: databaseGlobal.restAreaPool };
}

export async function queryRestAreas(): Promise<Result<RestAreasResponse>> {
  try {
    const pool = getPool();
    if (!pool.ok) return pool;
    const [rows] = await pool.value.query<RowDataPacket[]>({
      sql: `${selectRestAreaColumns} ORDER BY name, id`,
      timeout: 10_000,
    });
    const parsed = normalizeRestAreas(rows);
    if (!parsed.ok) return parsed;
    return {
      ok: true,
      value: {
        items: parsed.value.map((area, index) => ({
          ...area,
          revision: rowRevision(rows[index]),
        })),
        unmappedCount: parsed.value.filter((area) => !hasCoordinates(area))
          .length,
        fetchedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    return { ok: false, error: databaseError(error) };
  }
}

export async function queryHighwayRoute(routeName: string): Promise<Result<HighwayRoute>> {
  try {
    const pool = getPool();
    if (!pool.ok) return pool;
    const [rows] = await pool.value.query<RowDataPacket[]>({
      sql: `SELECT id, route_name, route_number, sw_lat, sw_lng, ne_lat, ne_lng,
                   path_coordinates
            FROM test_highway_routes WHERE route_name = ? LIMIT 1`,
      timeout: 10_000,
    }, [routeName]);
    if (!rows.length)
      return { ok: false, error: { code: "NOT_FOUND", message: "선택한 노선의 경로를 찾지 못했습니다." } };
    return normalizeHighwayRoute(rows[0]);
  } catch (reason) {
    const error = databaseError(reason);
    if (error.code === "DB_SCHEMA_ERROR")
      error.message = "노선 경로 테이블(test_highway_routes)을 확인해주세요.";
    if (error.code === "DB_QUERY_FAILED")
      error.message = "노선 경로를 조회하지 못했습니다. 잠시 후 다시 시도해주세요.";
    return { ok: false, error };
  }
}

export async function updateRestArea(
  id: number,
  request: UpdateRequest,
): Promise<Result<RestAreaRecord>> {
  try {
    const pool = getPool();
    if (!pool.ok) return pool;
    const connection = await pool.value.getConnection();
    return await saveRestArea(
      {
        beginTransaction: () => connection.beginTransaction(),
        query: (sql, values) =>
          connection.query({ sql, timeout: 10_000 }, values),
        commit: () => connection.commit(),
        rollback: () => connection.rollback(),
        release: () => connection.release(),
        destroy: () => connection.destroy(),
      },
      id,
      request,
    );
  } catch (error) {
    return { ok: false, error: databaseError(error, "write") };
  }
}
