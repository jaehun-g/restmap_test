import {test} from "node:test";
import {strict as assert} from "node:assert";
import {timedMapQuery, type MapQueryTiming} from "../lib/map-query-timing.ts";

test("DB 조회 시간을 기록하고 연결을 반환한다", async () => {
  const timing: MapQueryTiming = {connectionMs: null, queryMs: null};
  let releases = 0;
  const result = await timedMapQuery(async () => ({query: async () => ({rows: [1]}), release: () => { releases++; }}), "SELECT", [], timing);
  assert.deepEqual(result, {rows: [1]});
  assert.equal(releases, 1);
  assert.ok(timing.connectionMs !== null && timing.connectionMs >= 0);
  assert.ok(timing.queryMs !== null && timing.queryMs >= 0);
});

test("쿼리 실패 시에도 연결을 반환한다", async () => {
  const timing: MapQueryTiming = {connectionMs: null, queryMs: null};
  let releases = 0;
  await assert.rejects(timedMapQuery(async () => ({query: async () => { throw new Error("failed"); }, release: () => { releases++; }}), "SELECT", [], timing));
  assert.equal(releases, 1);
  assert.notEqual(timing.queryMs, null);
});

test("연결 실패 시 대기 시간을 기록하고 쿼리 시간은 비워 둔다", async () => {
  const timing: MapQueryTiming = {connectionMs: null, queryMs: null};
  await assert.rejects(timedMapQuery(async () => { throw new Error("failed"); }, "SELECT", [], timing));
  assert.notEqual(timing.connectionMs, null);
  assert.equal(timing.queryMs, null);
});
