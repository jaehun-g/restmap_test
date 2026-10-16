import {scalarFields, selectRestAreaColumns} from "./rest-area-fields.ts";
import {facilityDefinitions, type Result, type RestAreaRecord} from "./rest-areas.ts";
import {recordFromRow} from "./rest-area-revision.ts";
import {validateCoordinatePair, type UpdateRequest} from "./rest-area-validation.ts";
import {databaseError} from "./db-config.ts";

export interface SaveConnection {
  beginTransaction(): Promise<void>;
  query(sql: string, values?: unknown[]): Promise<{rows: Record<string, unknown>[]}>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): void;
  destroy?(): void;
}

/** Only an authenticated explicit save invokes this transaction. Tests supply a DB double. */
export async function saveRestArea(
  connection: SaveConnection,
  id: number,
  request: UpdateRequest,
): Promise<Result<RestAreaRecord>> {
  let active = false;
  let broken = false;
  try {
    if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647)
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "휴게소 ID가 올바르지 않습니다.",
        },
      };
    await connection.beginTransaction();
    active = true;
    const {rows} = await connection.query(`${selectRestAreaColumns} WHERE id = $1 FOR UPDATE`, [id]);
    if (rows.length !== 1)
      return {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "해당 휴게소를 찾을 수 없습니다.",
        },
      };
    const current = recordFromRow(rows[0]);
    if (!current.ok) return current;
    if (current.value.revision !== request.expectedRevision)
      return {
        ok: false,
        error: {
          code: "CONFLICT",
          message:
            "다른 변경이 먼저 저장되었습니다. 입력 초안은 유지됩니다. 취소 후 다시 조회해 최신 데이터와 비교해주세요.",
        },
      };
    const pair = validateCoordinatePair(current.value, request.changes);
    if (!pair.ok) return pair;
    const assignments: string[] = [];
    const values: unknown[] = [];
    for (const {key, column} of scalarFields) {
      if (Object.hasOwn(request.changes, key) && request.changes[key] !== current.value[key]) {
        assignments.push(`"${column}" = $${values.length + 1}`);
        values.push(request.changes[key]);
      }
    }
    for (const [key] of facilityDefinitions) {
      if (
        request.changes.facilities &&
        Object.hasOwn(request.changes.facilities, key) &&
        request.changes.facilities[key] !== current.value.facilities[key]
      ) {
        const value = request.changes.facilities[key];
        assignments.push(`"${key}" = $${values.length + 1}`);
        values.push(value === null ? null : value ? 1 : 0);
      }
    }
    if (assignments.length)
      await connection.query(`UPDATE test_lounge SET ${assignments.join(", ")} WHERE id = $${values.length + 1}`, [
        ...values,
        id,
      ]);
    const {rows: updatedRows} = await connection.query(`${selectRestAreaColumns} WHERE id = $1`, [id]);
    if (updatedRows.length !== 1)
      throw new Error("Missing updated row");
    const updated = recordFromRow(updatedRows[0]);
    if (!updated.ok) return updated;
    await connection.commit();
    active = false;
    return updated;
  } catch (error) {
    return {ok: false, error: databaseError(error, "write")};
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
