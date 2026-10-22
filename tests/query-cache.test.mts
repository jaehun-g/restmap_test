import test from "node:test";
import assert from "node:assert/strict";
import {QueryCache} from "../lib/query-cache.ts";

test("검색 범위별 결과를 격리하고 TTL이 지나면 재조회를 허용한다", () => {
  let now = 0;
  const cache = new QueryCache<number>(30_000, 2, () => now);
  cache.set("source=ex&radiusMeters=15000", 1);
  cache.set("source=ex&radiusMeters=30000", 2);
  assert.equal(cache.get("source=ex&radiusMeters=15000"), 1);
  assert.equal(cache.get("source=ex&radiusMeters=30000"), 2);
  assert.equal(cache.get("source=all&radiusMeters=15000"), undefined);
  now = 30_000;
  assert.equal(cache.get("source=ex&radiusMeters=15000"), undefined);
});

test("저장 개수를 제한하고 명시적 새로고침·저장 후 이전 범위의 결과도 폐기한다", () => {
  const cache = new QueryCache<number>(30_000, 2);
  cache.set("a", 1); cache.set("b", 2); cache.set("a", 3); cache.set("c", 4);
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("a"), 3);
  cache.clear();
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("c"), undefined);
});
