import {
  selectStationColumns,
  stationFields,
  stationServices,
  type GasStationRecord,
} from "./gas-stations.ts";
import { stationRecordFromRow } from "./gas-station-revision.ts";
import {
  validateStationCoordinatePair,
  type StationUpdateRequest,
} from "./gas-station-validation.ts";
import { databaseError } from "./db-config.ts";
import type { SaveConnection } from "./rest-area-save.ts";
import type { Result } from "./rest-areas.ts";

/** 인증 후 명시적인 저장에서만 호출합니다. 식별자와 읽기 전용 컬럼은 UPDATE 대상에 포함하지 않습니다. */
export async function saveGasStation(
  connection: SaveConnection,
  id: number,
  request: StationUpdateRequest,
): Promise<Result<GasStationRecord>> {
  let active = false,
    broken = false;
  try {
    if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647)
      return {
        ok: false,
        error: { code: "VALIDATION_ERROR", message: "주유소 ID가 올바르지 않습니다." },
      };
    await connection.beginTransaction();
    active = true;
    const [rows] = await connection.query(`${selectStationColumns} WHERE id = ? FOR UPDATE`, [id]);
    if (!Array.isArray(rows) || rows.length !== 1)
      return { ok: false, error: { code: "NOT_FOUND", message: "주유소를 찾을 수 없습니다." } };
    const current = stationRecordFromRow(rows[0]);
    if (!current.ok) return current;
    if (current.value.revision !== request.expectedRevision)
      return {
        ok: false,
        error: {
          code: "CONFLICT",
          message: "다른 변경이 먼저 저장되었습니다. 초안은 유지됩니다. 취소 후 다시 조회해주세요.",
        },
      };
    const pair = validateStationCoordinatePair(current.value, request.changes);
    if (!pair.ok) return pair;
    const assignments: string[] = [],
      values: unknown[] = [];
    for (const { key, column } of stationFields) {
      if (Object.hasOwn(request.changes, key) && current.value[key] !== request.changes[key]) {
        assignments.push(`\`${column}\` = ?`);
        values.push(request.changes[key]);
      }
    }
    for (const { key, column } of stationServices) {
      if (
        request.changes.services &&
        Object.hasOwn(request.changes.services, key) &&
        current.value.services[key] !== request.changes.services[key]
      ) {
        assignments.push(`\`${column}\` = ?`);
        const value = request.changes.services[key];
        values.push(value === null ? null : value ? "Y" : "N");
      }
    }
    if (assignments.length)
      await connection.query(`UPDATE test_gscargo SET ${assignments.join(", ")} WHERE id = ?`, [
        ...values,
        id,
      ]);
    const [updated] = await connection.query(`${selectStationColumns} WHERE id = ?`, [id]);
    if (!Array.isArray(updated) || updated.length !== 1) throw new Error("Missing updated station");
    const record = stationRecordFromRow(updated[0]);
    if (!record.ok) return record;
    await connection.commit();
    active = false;
    return record;
  } catch (reason) {
    return { ok: false, error: databaseError(reason, "write") };
  } finally {
    if (active) {
      try {
        await connection.rollback();
      } catch {
        broken = true;
      }
    }
    if (broken) connection.destroy?.();
    else connection.release();
  }
}
