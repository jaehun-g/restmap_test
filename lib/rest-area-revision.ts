import { createHash } from "node:crypto";
import { databaseColumns } from "./rest-area-fields.ts";
import { normalizeRestAreas, type Result, type RestAreaRecord } from "./rest-areas.ts";

export function rowRevision(row: Record<string, unknown>): string {
  const snapshot = databaseColumns.map((key) => {
    const value = row[key];
    return [
      key,
      value instanceof Uint8Array
        ? { bytes: Buffer.from(value).toString("base64") }
        : (value ?? null),
    ];
  });
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

export function recordFromRow(row: Record<string, unknown>): Result<RestAreaRecord> {
  const normalized = normalizeRestAreas([row]);
  return normalized.ok
    ? {
        ok: true,
        value: { ...normalized.value[0], revision: rowRevision(row) },
      }
    : normalized;
}
