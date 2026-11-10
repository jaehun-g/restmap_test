import test from "node:test";
import assert from "node:assert/strict";
import {synchronizeExStations, type ExStationSyncDependencies} from "../lib/ex-station-sync.ts";
import type {ExStationStatus} from "../lib/ex-station-status.ts";
import {verifiedStationLocations, verifiedStationIndependentLocations, verifiedStationCoordinates} from "../lib/verified-rest-area-stations.ts";

const station = (sourceKey: string, location: string | null = "서울시 도로 1"): ExStationStatus => ({
  sourceKey,
  routeCode: "0010",
  serviceAreaCode: sourceKey,
  routeName: "경부선",
  direction: "부산",
  serviceAreaName: `${sourceKey} 휴게소`,
  oilCompany: "EX",
  location,
  phone: "031-000-0000",
  lpgAvailable: true,
  gasolinePrice: 1700,
  dieselPrice: 1600,
  lpgPrice: 1000,
});

test("검증 좌표·주소는 원천 주소와 캐시가 바뀌어도 유지하며 지오코딩을 호출하지 않는다", async () => {
  const {pool, writes} = fakePool({cached: verifiedStationLocations.map(item => ({
    source_key: item.sourceKey, source_location: "이전 원천 주소", latitude: 35, longitude: 128,
    geocode_status: "SUCCESS", geocoded_at: new Date("2026-10-21T00:00:00Z"),
  }))});
  const result = await synchronizeExStations({
    pool,
    fetchStations: async () => ({ok: true, value: verifiedStationLocations.map(item => station(item.sourceKey, "잘못된 새 원천 주소"))}),
    geocodeAddress: async () => {throw new Error("검증된 위치는 재지오코딩하면 안 됩니다.");},
    now: () => new Date("2026-10-22T00:00:00Z"),
  });
  assert.ok(result.ok);
  assert.equal(writes.length, 2);
  verifiedStationLocations.forEach((item, index) => {
    assert.deepEqual(writes[index].slice(13, 19), [item.latitude, item.longitude, item.roadAddress, "ROAD_ADDR", item.parcelAddress, item.roadAddress]);
    assert.equal(writes[index][7], "잘못된 새 원천 주소");
    assert.equal(writes[index][19], "SUCCESS");
  });
});

test("거리 보정 좌표는 캐시·원천 주소 변경이나 캐시 누락에도 유지한다", async () => {
  const {pool, writes} = fakePool({cached: verifiedStationCoordinates.slice(1).map(item => ({
    source_key: item.sourceKey, source_location: "이전 주소", latitude: 35, longitude: 128,
    kakao_address_name: "기존 주소", kakao_road_address_name: "기존 도로명주소", geocode_status: "SUCCESS",
  }))});
  const result = await synchronizeExStations({
    pool,
    fetchStations: async () => ({ok: true, value: verifiedStationCoordinates.map(item => station(item.sourceKey, "새 원천 주소"))}),
    geocodeAddress: async () => {throw new Error("보정 좌표 재지오코딩 금지");},
  });
  assert.ok(result.ok);
  assert.equal(writes.length, verifiedStationCoordinates.length);
  verifiedStationCoordinates.forEach((item, index) => {
    assert.deepEqual(writes[index].slice(13, 15), [item.latitude, item.longitude]);
    assert.equal(writes[index][15], index ? "기존 주소" : "새 원천 주소");
    assert.equal(writes[index][18], index ? "기존 도로명주소" : null);
    assert.equal(writes[index][19], "SUCCESS");
  });
});

test("김해금관가야 기장 주유소의 검증 좌표는 동기화 후에도 유지한다", async () => {
  const verified = verifiedStationIndependentLocations.find(item => item.sourceKey === "6000|B00216|기장|AD")!;
  const {pool, writes} = fakePool();
  const result = await synchronizeExStations({pool, fetchStations: async () => ({ok: true, value: [station(verified.sourceKey)]}), geocodeAddress: async () => {throw new Error("검증된 위치는 재지오코딩하지 않습니다.");}});
  assert.ok(result.ok);
  assert.deepEqual(writes[0].slice(13, 19), [verified.latitude, verified.longitude, verified.roadAddress, "ROAD_ADDR", verified.parcelAddress, verified.roadAddress]);
});

test("선산 창원 주유소는 휴게소 좌표가 아닌 실제 주유소 좌표를 유지한다", async () => {
  const verified = verifiedStationIndependentLocations.find(item => item.sourceKey === "0450|B00102|양평|AD")!;
  const {pool, writes} = fakePool();
  const result = await synchronizeExStations({
    pool,
    fetchStations: async () => ({ok: true, value: [station(verified.sourceKey)]}),
    geocodeAddress: async () => {throw new Error("검증된 주유소 위치는 재지오코딩하지 않습니다.");},
  });
  assert.ok(result.ok);
  assert.deepEqual(writes[0].slice(13, 19), [verified.latitude, verified.longitude, verified.roadAddress, "ROAD_ADDR", verified.parcelAddress, verified.roadAddress]);
});

test("의왕청계 일산 주유소의 실제 위치와 보정 방향을 동기화 후에도 유지한다", async () => {
  const verified = verifiedStationIndependentLocations.find(item => item.sourceKey === "1000|B00158|판교|HD")!;
  const {pool, writes} = fakePool();
  const result = await synchronizeExStations({pool, fetchStations: async () => ({ok: true, value: [{...station(verified.sourceKey), direction: "판교"}]}), geocodeAddress: async () => {throw new Error("검증된 위치는 재지오코딩하지 않습니다.");}});
  assert.ok(result.ok);
  assert.equal(writes[0][4], "일산");
  assert.deepEqual(writes[0].slice(13, 19), [verified.latitude, verified.longitude, verified.roadAddress, "ROAD_ADDR", verified.parcelAddress, verified.roadAddress]);
});

test("선산·문경·서여주 창원 주유소는 원천 방향이 양평이어도 DB 방향을 창원으로 유지한다", async () => {
  const sourceKeys = ["0450|B00102|양평|AD", "0450|B00137|양평|AD", "0450|B00166|양평|AD"];
  const {pool, writes} = fakePool({cached: sourceKeys.slice(1).map(source_key => ({source_key, source_location: "서울시 도로 1", latitude: 36.6194935, longitude: 128.1509056, geocode_status: "SUCCESS"}))});
  const result = await synchronizeExStations({
    pool,
    fetchStations: async () => ({ok: true, value: sourceKeys.map(sourceKey => ({...station(sourceKey), direction: "양평"}))}),
    geocodeAddress: async () => {throw new Error("기존 좌표를 유지해야 합니다.");},
  });
  assert.ok(result.ok);
  assert.deepEqual(writes.map(row => row[4]), ["창원", "창원", "창원"]);
});

test("선산·문경·서여주 양평 주유소는 원천 방향이 마산이어도 DB 방향을 양평으로 유지한다", async () => {
  const sourceKeys = ["0450|B00101|마산|AD", "0450|B00136|마산|AD", "0450|B00167|마산|AD"];
  const {pool, writes} = fakePool({cached: sourceKeys.map(source_key => ({source_key, source_location: "서울시 도로 1", latitude: 36.2784348, longitude: 128.2479158, geocode_status: "SUCCESS"}))});
  const result = await synchronizeExStations({
    pool,
    fetchStations: async () => ({ok: true, value: sourceKeys.map(sourceKey => ({...station(sourceKey), direction: "마산"}))}),
    geocodeAddress: async () => {throw new Error("기존 좌표를 유지해야 합니다.");},
  });
  assert.ok(result.ok);
  assert.deepEqual(writes.map(row => row[4]), ["양평", "양평", "양평"]);
});

test("부여백제 공주 주유소는 동기화 시 원천 방향 대신 공주를 저장한다", async () => {
  const sourceKey = "1510|B00156|서천|AD";
  const {pool, writes} = fakePool({cached: [{source_key: sourceKey, source_location: "서울시 도로 1", latitude: 36.3, longitude: 127, geocode_status: "SUCCESS"}]});
  const result = await synchronizeExStations({pool, fetchStations: async () => ({ok: true, value: [{...station(sourceKey), direction: "서천"}]})});
  assert.ok(result.ok);
  assert.equal(writes[0][4], "공주");
});

test("부여백제 서천 주유소는 동기화 시 원천 방향 대신 서천을 저장한다", async () => {
  const sourceKey = "1510|B00155|공주|AD";
  const {pool, writes} = fakePool({cached: [{source_key: sourceKey, source_location: "서울시 도로 1", latitude: 36.3, longitude: 127, geocode_status: "SUCCESS"}]});
  const result = await synchronizeExStations({pool, fetchStations: async () => ({ok: true, value: [{...station(sourceKey), direction: "공주"}]})});
  assert.ok(result.ok);
  assert.equal(writes[0][4], "서천");
});

test("영덕·포항·김제 주유소의 확인된 노선과 방향은 동기화 후에도 유지한다", async () => {
  const sourceKeys = ["0650|B00246|속초|AD", "0650|B00247|동해|AD", "7001|B00248|포항|AD", "7001|B00249|익산|AD"];
  const {pool, writes} = fakePool({cached: sourceKeys.map(source_key => ({source_key, source_location: "서울시 도로 1", latitude: 36.3, longitude: 127, geocode_status: "SUCCESS"}))});
  const result = await synchronizeExStations({pool, fetchStations: async () => ({ok: true, value: sourceKeys.map(sourceKey => ({...station(sourceKey), direction: "원천방향"}))})});
  assert.ok(result.ok);
  assert.deepEqual(writes.map(row => row[4]), ["영덕", "포항", "전주", "새만금"]);
  assert.deepEqual(writes.map(row => row[3]), ["포항영덕선", "포항영덕선", "새만금포항선", "새만금포항선"]);
});

test("동기화해도 밀양영남루 주유소의 보정된 이름을 유지한다", async () => {
  const sourceKey = "0140|B00243|밀양|AD";
  const {pool, writes} = fakePool();
  const result = await synchronizeExStations({
    pool,
    fetchStations: async () => ({ok: true, value: [{...station(sourceKey), serviceAreaName: "밀양영남루(울산)주유소"}]}),
  });
  assert.ok(result.ok);
  assert.equal(writes[0][5], "밀양영남루(밀양)주유소");
  assert.equal(writes[0][0], sourceKey);
});

test("서하남 주유소 원천 이름이 깨져도 동기화 시 보정된 이름을 저장한다", async () => {
  const sourceKey = "1000|B00161|판교|S";
  const {pool, writes} = fakePool({cached: [{source_key: sourceKey, source_location: "서울시 도로 1", latitude: 37.525914, longitude: 127.1930451, geocode_status: "SUCCESS"}]});
  const result = await synchronizeExStations({pool, fetchStations: async () => ({ok: true, value: [{...station(sourceKey), serviceAreaName: "서하남(���교)주유소"}]})});
  assert.ok(result.ok);
  assert.equal(writes[0][5], "서하남(판교)주유소");
});

test("원천 주유소 이름이 없으면 동기화 시 null을 유지한다", async () => {
  const sourceKey = "0140|B00243|밀양|AD";
  const {pool, writes} = fakePool();
  const result = await synchronizeExStations({
    pool,
    fetchStations: async () => ({ok: true, value: [{...station(sourceKey), serviceAreaName: null}]}),
  });
  assert.ok(result.ok);
  assert.equal(writes[0][5], null);
});

function fakePool({
  cached = [],
  overrides = [],
  failWrite = false,
}: {
  cached?: Record<string, unknown>[];
  overrides?: Record<string, unknown>[];
  failWrite?: boolean;
} = {}) {
  const events: string[] = [];
  const writes: unknown[][] = [];
  const connection = {
    async beginTransaction() {
      events.push("begin");
    },
    async query(sql: string, values?: unknown[]) {
      if (sql === "BEGIN") {
        events.push("begin");
        return {rows: [], rowCount: null};
      }
      if (sql === "COMMIT") {
        events.push("commit");
        return {rows: [], rowCount: null};
      }
      if (sql === "ROLLBACK") {
        events.push("rollback");
        return {rows: [], rowCount: null};
      }
      if (sql.startsWith("INSERT")) {
        events.push("upsert");
        if (failWrite) throw new Error("write failed");
        writes.push(values ?? []);
        return {rows: [], rowCount: 1};
      }
      if (sql.startsWith("DELETE")) {
        events.push("delete");
        return {rows: [], rowCount: 1};
      }
      throw new Error(`unexpected connection query: ${sql}`);
    },
    async commit() {
      events.push("commit");
    },
    async rollback() {
      events.push("rollback");
    },
    release() {
      events.push("release");
    },
    destroy() {
      events.push("destroy");
    },
  };
  const pool = {
    async query(sql: string) {
      if (sql.includes("FROM tb_ex_station_geocodes")) return {rows: cached};
      if (sql.includes("FROM tb_ex_station_geocode_overrides")) return {rows: overrides};
      throw new Error(`unexpected pool query: ${sql}`);
    },
    async connect() {
      return connection;
    },
  } as unknown as ExStationSyncDependencies["pool"];
  return {pool, events, writes};
}

test("syncs a validated snapshot, reuses unchanged results, and removes absent source rows", async () => {
  const {pool, events, writes} = fakePool({
    cached: [
      {
        source_key: "reused",
        source_location: "서울시 도로 1",
        latitude: "37.5",
        longitude: "127.0",
        kakao_address_name: "서울시 도로 1",
        kakao_address_type: "ROAD",
        kakao_parcel_address_name: null,
        kakao_road_address_name: "서울시 도로 1",
        geocode_status: "SUCCESS",
        geocode_error_code: null,
        geocoded_at: new Date("2026-01-01T00:00:00.000Z"),
      },
    ],
  });
  let geocodeCalls = 0;
  const result = await synchronizeExStations({
    pool,
    fetchStations: async () => ({ok: true, value: [station("new"), station("reused")]}),
    geocodeAddress: async () => {
      geocodeCalls++;
      return {
        ok: true,
        value: {
          latitude: 37.6,
          longitude: 127.1,
          addressName: "서울시 도로 1",
          addressType: "ROAD",
          parcelAddressName: null,
          roadAddressName: "서울시 도로 1",
        },
      };
    },
    now: () => new Date("2026-10-15T00:00:00.000Z"),
  });
  assert.ok(result.ok);
  if (result.ok)
    assert.deepEqual(result.value, {
      synchronizedAt: "2026-10-15T00:00:00.000Z",
      total: 2,
      geocoded: 1,
      reused: 1,
      unresolved: 0,
      deleted: 1,
    });
  assert.equal(geocodeCalls, 1);
  assert.equal(writes.length, 2);
  assert.ok(writes.every(values => values.length === 22));
  assert.deepEqual(events, ["begin", "upsert", "upsert", "delete", "commit", "release"]);
});

test("geocodes only new or changed source rows and reuses unchanged unresolved rows", async () => {
  const {pool} = fakePool({
    cached: [
      {
        source_key: "changed",
        source_location: "이전 주소",
        latitude: null,
        longitude: null,
        kakao_address_name: null,
        kakao_address_type: null,
        kakao_parcel_address_name: null,
        kakao_road_address_name: null,
        geocode_status: "NOT_FOUND",
        geocode_error_code: "GEOCODE_NOT_FOUND",
        geocoded_at: null,
      },
      {
        source_key: "unchanged-failure",
        source_location: "서울시 도로 1",
        latitude: null,
        longitude: null,
        kakao_address_name: null,
        kakao_address_type: null,
        kakao_parcel_address_name: null,
        kakao_road_address_name: null,
        geocode_status: "NOT_FOUND",
        geocode_error_code: "GEOCODE_NOT_FOUND",
        geocoded_at: null,
      },
    ],
  });
  const calls: string[] = [];
  const result = await synchronizeExStations({
    pool,
    fetchStations: async () => ({
      ok: true,
      value: [station("changed", "새 주소"), station("unchanged-failure")],
    }),
    geocodeAddress: async address => {
      calls.push(String(address));
      return {
        ok: true,
        value: {
          latitude: 37.5,
          longitude: 127,
          addressName: "새 주소",
          addressType: "ROAD",
          parcelAddressName: null,
          roadAddressName: "새 주소",
        },
      };
    },
  });
  assert.ok(result.ok);
  assert.equal(result.ok && result.value.geocoded, 1);
  assert.equal(result.ok && result.value.reused, 1);
  assert.equal(result.ok && result.value.unresolved, 1);
  assert.equal(calls.length, 1);
});

test("does not open a DB transaction for an invalid source fetch", async () => {
  const {pool, events} = fakePool();
  const result = await synchronizeExStations({
    pool,
    fetchStations: async () => ({
      ok: false,
      error: {code: "EX_STATION_DATA_INVALID", message: "invalid source"},
    }),
  });
  assert.deepEqual(result, {ok: false, error: {code: "EX_STATION_DATA_INVALID", message: "invalid source"}});
  assert.deepEqual(events, []);
});

test("rolls back and never deletes rows when a write fails", async () => {
  const {pool, events} = fakePool({failWrite: true});
  const result = await synchronizeExStations({
    pool,
    fetchStations: async () => ({ok: true, value: [station("new")]}),
    geocodeAddress: async () => ({
      ok: true,
      value: {
        latitude: 37.5,
        longitude: 127,
        addressName: "서울시 도로 1",
        addressType: "ROAD",
        parcelAddressName: null,
        roadAddressName: "서울시 도로 1",
      },
    }),
  });
  assert.equal(result.ok, false);
  assert.deepEqual(events, ["begin", "upsert", "rollback", "release"]);
});
