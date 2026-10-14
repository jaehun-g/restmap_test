import {createHash} from "node:crypto";
import {
  normalizeGasStations,
  stationColumns,
  stationReadOnlyColumns,
  stationText,
  type GasStationRecord,
} from "./gas-stations.ts";
import type {Result} from "./rest-areas.ts";

export function stationRevision(row: Record<string, unknown>): string {
  return createHash("sha256")
    .update(
      JSON.stringify(
        stationColumns.map(key => {
          const value = row[key];
          return [
            key,
            value instanceof Uint8Array
              ? {bytes: Buffer.from(value).toString("base64")}
              : (value ?? null),
          ];
        }),
      ),
    )
    .digest("hex");
}
export function stationRecordFromRow(
  row: Record<string, unknown>,
  detail = false,
): Result<GasStationRecord> {
  const parsed = normalizeGasStations([row]);
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    value: {
      ...parsed.value[0],
      revision: stationRevision(row),
      ...(detail
        ? {
            sourceDetails: Object.fromEntries(
              stationReadOnlyColumns.map(column => [column, stationText(row[column])]),
            ),
          }
        : {}),
    },
  };
}
