import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import ts from "typescript";

let moduleId = 0;
async function loadRoute(result: unknown) {
  const source = await readFile(new URL("../app/api/cron/ex-station-prices/route.ts", import.meta.url), "utf8");
  const injected = source
    .replace('import {connection} from "next/server";', 'const connection = async () => {};')
    .replace('import {syncExStationPrices} from "@/lib/db";',
      `let calls = 0; export function syncCalls() { return calls; }
       const syncExStationPrices = async () => { calls++; return ${JSON.stringify(result)}; };`);
  const {outputText} = ts.transpileModule(injected, {compilerOptions: {module: ts.ModuleKind.ESNext}});
  return import(`data:text/javascript;base64,${Buffer.from(`${outputText}\n// ${moduleId++}`).toString("base64")}`);
}

test("cron requires the configured secret and never synchronizes an unauthorized request", async t => {
  const previous = process.env.CRON_SECRET;
  t.after(() => { if (previous === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previous; });
  const route = await loadRoute({ok: true, value: {updatedCount: 1}});
  const request = (authorization?: string) => new Request("https://example.test/api/cron/ex-station-prices", {
    headers: authorization ? {authorization} : {},
  });
  delete process.env.CRON_SECRET;
  assert.equal((await route.GET(request("Bearer undefined"))).status, 401);
  process.env.CRON_SECRET = "test-cron-token";
  for (const auth of [undefined, "Bearer invalid", "test-cron-token"])
    assert.equal((await route.GET(request(auth))).status, 401);
  assert.equal(route.syncCalls(), 0);
  const response = await route.GET(request("Bearer test-cron-token"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {updatedCount: 1});
  assert.equal(route.syncCalls(), 1);
});

test("cron exposes sync failures in HTTP status instead of reporting success", async t => {
  const previous = process.env.CRON_SECRET;
  t.after(() => { if (previous === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previous; });
  process.env.CRON_SECRET = "test-cron-token";
  for (const [code, status] of [["CONFLICT", 409], ["EX_STATION_REQUEST_FAILED", 502]] as const) {
    const route = await loadRoute({ok: false, error: {code, message: "test failure"}});
    const response = await route.GET(new Request("https://example.test/api/cron/ex-station-prices", {
      headers: {authorization: "Bearer test-cron-token"},
    }));
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), {error: {code, message: "test failure"}});
  }
});

test("Vercel registers the price job daily at 04:00 KST while retaining the food menu job", async () => {
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.deepEqual(config.crons, [
    {path: "/api/cron/food-menus", schedule: "0 18 * * *"},
    {path: "/api/cron/ex-station-prices", schedule: "0 19 * * *"},
  ]);
});
