import test from "node:test";
import assert from "node:assert/strict";
import {synchronizeFoodMenus, type FoodMenuSyncDependencies} from "../lib/food-menu-sync.ts";
import type {SourceFoodMenu} from "../lib/food-menu-source.ts";
import type {RestArea} from "../lib/rest-areas.ts";

const sourceItem = (seq: string, name: string, price: number): SourceFoodMenu => ({
  key: `000001|${seq}`, stdRestCd: "000001", restCd: "S000001", seq,
  restName: "\uC11C\uC6B8\uB9CC\uB0A8(\uBD80\uC0B0)\uD734\uAC8C\uC18C",
  routeCode: "0010", routeName: "\uACBD\uBD80\uC120", address: null,
  name, price, recommended: false, best: false, displayed: true,
  sourceUpdatedAt: "2026-10-21", sourceCreatedAt: "2025-08-28",
});

const restArea: RestArea = {
  id: 1, name: "\uC11C\uC6B8\uB9CC\uB0A8(\uBD80\uC0B0 \uBC29\uD5A5)\uD734\uAC8C\uC18C",
  latitude: 37, longitude: 127, phone: null, routeName: "\uACBD\uBD80\uC120", routeNumber: "1",
  routeDirection: "\uD558\uD589", directionLabel: "\uBD80\uC0B0 \uBC29\uD5A5", restAreaType: null,
  parkingCount: null, facilities: {} as RestArea["facilities"],
};

function mockPool(initial: Record<string, Record<string, unknown>>, failMenuWrite = false) {
  const menus = new Map(Object.entries(initial));
  let beforeTransaction: Map<string, Record<string, unknown>> | null = null;
  const pool = {
    query: async (sql: string) => ({rows: sql.includes("INSERT INTO public.test_food_menu_sync_runs") ? [{id: "1"}] : []}),
    connect: async () => ({
      query: async (sql: string, values: unknown[] = []) => {
        if (sql === "BEGIN") beforeTransaction = new Map([...menus].map(([key, value]) => [key, {...value}]));
        if (sql === "ROLLBACK" && beforeTransaction) {
          menus.clear();
          for (const [key, value] of beforeTransaction) menus.set(key, value);
        }
        if (sql.includes("SELECT std_rest_cd")) return {rows: []};
        if (sql.includes("UPDATE public.test_food_menus")) {
          const [at, keys] = values as [Date, string[]];
          for (const [key, row] of menus) if (!keys.includes(key) && row.source_present) {
            row.source_present = false;
            row.missing_since ??= at;
          }
        }
        if (sql.includes("INSERT INTO public.test_food_menus")) {
          if (failMenuWrite) throw Object.assign(new Error("injected write failure"), {code: "TEST_WRITE_FAILED"});
          const rows = JSON.parse(String(values[0])) as Record<string, unknown>[];
          for (const row of rows) {
            const previous = menus.get(String(row.source_key));
            menus.set(String(row.source_key), {
              ...previous, ...row, source_present: true, collected_at: values[1],
              last_seen_at: values[1], missing_since: null,
            });
          }
        }
        if (sql.startsWith("SELECT count(*)"))
          return {rows: [{count: String([...menus.values()].filter(row => row.source_present && row.app_visible).length)}]};
        return {rows: []};
      },
      release: () => undefined,
    }),
  } as unknown as FoodMenuSyncDependencies["pool"];
  return {pool, menus};
}

test("failed source snapshot leaves the existing food menu table untouched", async () => {
  const statements: string[] = [];
  let connected = false;
  const pool = {
    query: async (sql: string) => {
      statements.push(sql);
      return {rows: [{id: "run-1"}]};
    },
    connect: async () => {
      connected = true;
      throw new Error("database writes should not begin for a failed source snapshot");
    },
  } as unknown as FoodMenuSyncDependencies["pool"];
  const result = await synchronizeFoodMenus({
    pool,
    fetchMenus: async () => ({ok: false, error: {code: "FOOD_SOURCE_FAILED", message: "failed"}}),
    loadAreas: async () => ({ok: true, value: []}),
  });
  assert.equal(result.ok, false);
  assert.equal(connected, false);
  assert.equal(statements.some(sql => sql.includes("test_food_menus")), false);
  assert.equal(statements.at(-1)?.includes("status='failed'"), true);
});

test("successful snapshots update changed menus, add new ones, and retain missing ones as hidden", async () => {
  const {pool, menus} = mockPool({
    "000001|1": {food_nm: "\uC774\uC804 \uBA54\uB274", food_cost: 5000, source_present: true, app_visible: true},
    "000001|3": {food_nm: "\uC0AC\uB77C\uC9C4 \uBA54\uB274", food_cost: 6000, source_present: true, app_visible: true},
  });
  const result = await synchronizeFoodMenus({
    pool,
    fetchMenus: async () => ({ok: true, value: [sourceItem("1", "\uC0C8\uB85C\uC6B4 \uBA54\uB274", 9000), sourceItem("2", "\uCD94\uAC00 \uBA54\uB274", 7000)]}),
    loadAreas: async () => ({ok: true, value: [restArea]}),
    now: () => new Date("2026-10-21T00:00:00.000Z"),
  });
  assert.equal(result.ok, true);
  assert.equal(menus.size, 3);
  assert.equal(menus.get("000001|1")?.food_nm, "\uC0C8\uB85C\uC6B4 \uBA54\uB274");
  assert.equal(menus.get("000001|1")?.food_cost, 9000);
  assert.equal(menus.get("000001|2")?.source_present, true);
  assert.equal(menus.get("000001|3")?.source_present, false);
  assert.equal(menus.get("000001|3")?.missing_since instanceof Date, true);
});

test("a database write failure rolls the snapshot back", async () => {
  const {pool, menus} = mockPool({
    "000001|1": {food_nm: "\uAE30\uC874 \uBA54\uB274", food_cost: 5000, source_present: true, app_visible: true},
    "000001|3": {food_nm: "\uAE30\uC874 \uB204\uB77D \uBA54\uB274", food_cost: 6000, source_present: true, app_visible: true},
  }, true);
  const result = await synchronizeFoodMenus({
    pool,
    fetchMenus: async () => ({ok: true, value: [sourceItem("1", "\uBC14\uB00C \uBA54\uB274", 9000)]}),
    loadAreas: async () => ({ok: true, value: [restArea]}),
  });
  assert.equal(result.ok, false);
  assert.equal(menus.size, 2);
  assert.equal(menus.get("000001|1")?.food_nm, "\uAE30\uC874 \uBA54\uB274");
  assert.equal(menus.get("000001|3")?.source_present, true);
});
