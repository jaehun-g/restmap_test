import {expect, test} from "@playwright/test";

test("공개 지도 조회 캐시와 최신 조회 우회가 실제 DB 응답에서 동작한다", async ({request}, testInfo) => {
  test.skip(process.env.E2E_READONLY_DB !== "1", "읽기 전용 실제 DB 검증을 명시적으로 실행할 때만 사용합니다.");
  const timings = [];
  for (const endpoint of ["/api/rest-areas", "/api/gas-stations?source=ex"]) {
    const read = async (fresh = false) => {
      const started = performance.now();
      const response = await request.get(endpoint, {headers: fresh ? {"x-map-fresh": "1"} : {}});
      expect(response.ok()).toBeTruthy();
      return {body: await response.json(), ms: Math.round(performance.now() - started)};
    };
    const first = await read();
    const cached = await read();
    const fresh = await read(true);
    expect(cached.body.fetchedAt).toBe(first.body.fetchedAt);
    expect(fresh.body.fetchedAt).not.toBe(first.body.fetchedAt);
    expect(cached.body.items).toEqual(first.body.items);
    expect(fresh.body.items.length).toBeGreaterThan(0);
    if (endpoint === "/api/rest-areas") {
      expect(fresh.body.items.some((item: Record<string, unknown>) => "foodMenuSummary" in item)).toBe(false);
    }
    timings.push({endpoint, firstMs: first.ms, cachedMs: cached.ms, freshMs: fresh.ms, items: fresh.body.items.length});
  }
  console.log(JSON.stringify({mapQueryTimings: timings}));
  let snapshotTime: string | undefined;
  for (const scope of [
    "latitude=37.5&longitude=127&radiusMeters=15000",
    "latitude=35.1&longitude=129&radiusMeters=30000",
    "south=36&west=126&north=38&east=128",
  ]) {
    const url = `/api/gas-stations?source=ex&${scope}`;
    const cached = await request.get(url);
    const fresh = await request.get(url, {headers: {"x-map-fresh": "1"}});
    expect(cached.ok()).toBeTruthy();
    expect(fresh.ok()).toBeTruthy();
    const fromCache = await cached.json();
    const fromDatabase = await fresh.json();
    expect(fromCache.items).toEqual(fromDatabase.items);
    if (snapshotTime) expect(fromCache.fetchedAt).toBe(snapshotTime);
    snapshotTime = fromCache.fetchedAt;
  }
  await testInfo.attach("map-query-timings.json", {body: JSON.stringify(timings, null, 2), contentType: "application/json"});
});
