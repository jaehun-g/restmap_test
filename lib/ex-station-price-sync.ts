import type {Pool} from "pg";
import {databaseError} from "./db-config.ts";
import {fetchExStationStatuses, type ExStationStatus} from "./ex-station-status.ts";
import type {Result} from "./rest-areas.ts";

export type ExStationPriceSyncSummary = {
  synchronizedAt: string;
  sourceCount: number;
  updatedCount: number;
  unmatchedCount: number;
  newerSnapshotCount: number;
};

export type ExStationPriceSyncDependencies = {
  pool: Pick<Pool, "connect">;
  fetchStations?: () => Promise<Result<ExStationStatus[]>>;
  now?: () => Date;
};

const fail = (code: string, message: string): Result<never> => ({ok: false, error: {code, message}});

/** Refreshes prices atomically without changing station identities or manually corrected coordinates. */
export async function synchronizeExStationPrices({
  pool,
  fetchStations = fetchExStationStatuses,
  now = () => new Date(),
}: ExStationPriceSyncDependencies): Promise<Result<ExStationPriceSyncSummary>> {
  const at = now();
  const fetched = await fetchStations();
  if (!fetched.ok) return fetched;
  const stations = fetched.value;
  if (!stations.length || new Set(stations.map(item => item.sourceKey)).size !== stations.length)
    return fail("EX_STATION_DATA_INVALID", "빈 응답 또는 중복 식별자가 있어 기존 주유소 가격을 유지합니다.");

  try {
    const client = await pool.connect();
    let released = false;
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL statement_timeout = '30s'");
      const lock = await client.query<{locked: boolean}>(
        "SELECT pg_try_advisory_xact_lock(748392111) AS locked",
      );
      if (!lock.rows[0]?.locked) {
        await client.query("ROLLBACK");
        return fail("CONFLICT", "주유소 가격 동기화가 이미 실행 중입니다.");
      }
      const keys = stations.map(item => item.sourceKey);
      const matched = await client.query(
        "SELECT source_key FROM public.test_ex_station_geocodes WHERE source_key = ANY($1::text[])",
        [keys],
      );
      if (!matched.rows.length) {
        await client.query("ROLLBACK");
        return fail("EX_STATION_PRICE_MATCH_MISSING", "일치하는 주유소 코드가 없습니다. EX 주유소 전체 동기화를 확인해주세요.");
      }
      const prices = stations.map(item => ({
        source_key: item.sourceKey,
        gasoline_price: item.gasolinePrice,
        diesel_price: item.dieselPrice,
        lpg_price: item.lpgPrice,
      }));
      const updated = await client.query(
        `UPDATE public.test_ex_station_geocodes AS station
         SET gasoline_price = source.gasoline_price, diesel_price = source.diesel_price,
             lpg_price = source.lpg_price, source_fetched_at = $2, updated_at = CURRENT_TIMESTAMP
         FROM jsonb_to_recordset($1::jsonb) AS source(
           source_key text, gasoline_price numeric, diesel_price numeric, lpg_price numeric
         )
         WHERE station.source_key = source.source_key
           AND (station.source_fetched_at IS NULL OR station.source_fetched_at <= $2)
         RETURNING station.source_key`,
        [JSON.stringify(prices), at],
      );
      await client.query("COMMIT");
      const updatedCount = updated.rowCount ?? 0;
      return {ok: true, value: {
        synchronizedAt: at.toISOString(),
        sourceCount: stations.length,
        updatedCount,
        unmatchedCount: stations.length - matched.rows.length,
        newerSnapshotCount: matched.rows.length - updatedCount,
      }};
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        client.release(new Error("transaction rollback failed"));
        released = true;
      }
      return {ok: false, error: databaseError(error, "write")};
    } finally {
      if (!released) client.release();
    }
  } catch (error) {
    return {ok: false, error: databaseError(error, "write")};
  }
}
