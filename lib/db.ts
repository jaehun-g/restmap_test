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
