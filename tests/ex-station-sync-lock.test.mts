import test from "node:test";
import assert from "node:assert/strict";
import {ExStationSyncLock} from "../lib/ex-station-sync-lock.ts";

test("EX station synchronization lock rejects overlapping runs and releases after completion", () => {
  const lock = new ExStationSyncLock();
  assert.equal(lock.acquire(), true);
  assert.equal(lock.acquire(), false);
  lock.release();
  assert.equal(lock.acquire(), true);
});
