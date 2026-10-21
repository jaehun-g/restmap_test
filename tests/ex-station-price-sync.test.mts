import test from "node:test";
import assert from "node:assert/strict";
import {synchronizeExStationPrices, type ExStationPriceSyncDependencies} from "../lib/ex-station-price-sync.ts";
import type {ExStationStatus} from "../lib/ex-station-status.ts";

const at = new Date("2026-10-21T19:00:00Z");
const station: ExStationStatus = {
  sourceKey: "0010|A001|부산|EX", routeCode: "0010", serviceAreaCode: "A001",
  routeName: "경부선", direction: "부산", serviceAreaName: "안성", oilCompany: "EX",
  location: "주소", phone: null, lpgAvailable: false,
  gasolinePrice: 1700, dieselPrice: 1600, lpgPrice: null,
};

function database({locked = true, matched = 1, updated = 1, failWrite = false} = {}) {
  const events: string[] = [];
  let payload: unknown;
  let query = "";
  const pool = {
    async connect() {
      events.push("connect");
      return {
        async query(sql: string, values?: unknown[]) {
          if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) {
            events.push(sql);
            return {rows: [], rowCount: 0};
          }
          if (sql.startsWith("SET LOCAL")) return {rows: []};
          if (sql.includes("pg_try_advisory_xact_lock")) return {rows: [{locked}]};
          if (sql.startsWith("SELECT source_key")) return {rows: Array.from({length: matched}, () => ({source_key: station.sourceKey}))};
          if (sql.startsWith("UPDATE")) {
            events.push("update");
            query = sql;
            payload = JSON.parse(String(values?.[0]));
            assert.deepEqual(values?.[1], at);
            if (failWrite) throw new Error("DB write failed");
            return {rows: [], rowCount: updated};
          }
          throw new Error("Unexpected SQL");
        },
        release() { events.push("release"); },
      };
    },
  } as unknown as ExStationPriceSyncDependencies["pool"];
  return {pool, events, payload: () => payload, query: () => query};
}

test("updates only fuel prices by stable source key, retaining null LPG without coordinate writes", async () => {
  const db = database();
  const result = await synchronizeExStationPrices({
    pool: db.pool, now: () => at,
    fetchStations: async () => ({ok: true, value: [station, {...station, sourceKey: "new-station"}]}),
  });
  assert.deepEqual(result, {ok: true, value: {
    synchronizedAt: at.toISOString(), sourceCount: 2, updatedCount: 1, unmatchedCount: 1, newerSnapshotCount: 0,
  }});
  assert.deepEqual(db.payload(), [station, {...station, sourceKey: "new-station"}].map(item => ({
    source_key: item.sourceKey, gasoline_price: 1700, diesel_price: 1600, lpg_price: null,
  })));
  assert.match(db.query(), /station.source_key = source.source_key/);
  assert.doesNotMatch(db.query(), /\b(latitude|longitude|geocoded_at|geocode_status|INSERT|DELETE)\b/);
  assert.deepEqual(db.events, ["connect", "BEGIN", "update", "COMMIT", "release"]);
});

test("rejects failed, incomplete, empty, and duplicate snapshots without opening the database", async () => {
  const db = database();
  const error = {ok: false as const, error: {code: "EX_STATION_DATA_INVALID", message: "incomplete source"}};
  assert.deepEqual(await synchronizeExStationPrices({pool: db.pool, fetchStations: async () => error}), error);
  for (const items of [[], [station, station]]) {
    const result = await synchronizeExStationPrices({pool: db.pool, fetchStations: async () => ({ok: true, value: items})});
    assert.equal(result.ok, false);
  }
  assert.deepEqual(db.events, []);
});

test("returns a conflict and releases the connection when another price sync holds the DB lock", async () => {
  const db = database({locked: false});
  const result = await synchronizeExStationPrices({pool: db.pool, fetchStations: async () => ({ok: true, value: [station]})});
  assert.equal(!result.ok && result.error.code, "CONFLICT");
  assert.deepEqual(db.events, ["connect", "BEGIN", "ROLLBACK", "release"]);
});

test("fails visibly when no source codes match the existing table", async () => {
  const db = database({matched: 0});
  const result = await synchronizeExStationPrices({pool: db.pool, fetchStations: async () => ({ok: true, value: [station]})});
  assert.equal(!result.ok && result.error.code, "EX_STATION_PRICE_MATCH_MISSING");
  assert.deepEqual(db.events, ["connect", "BEGIN", "ROLLBACK", "release"]);
});

test("guards more recent snapshots against stale or overlapping requests", async () => {
  const db = database({updated: 0});
  const result = await synchronizeExStationPrices({pool: db.pool, now: () => at, fetchStations: async () => ({ok: true, value: [station]})});
  assert.equal(result.ok && result.value.newerSnapshotCount, 1);
  assert.match(db.query(), /station.source_fetched_at <= \$2/);
});

test("rolls back failed writes so previous prices and timestamps remain unchanged", async () => {
  const db = database({failWrite: true});
  const result = await synchronizeExStationPrices({pool: db.pool, now: () => at, fetchStations: async () => ({ok: true, value: [station]})});
  assert.equal(result.ok, false);
  assert.deepEqual(db.events, ["connect", "BEGIN", "update", "ROLLBACK", "release"]);
});
