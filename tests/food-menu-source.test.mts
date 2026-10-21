import test from "node:test";
import assert from "node:assert/strict";
import {fetchFoodMenus, parseFoodMenuPage} from "../lib/food-menu-source.ts";

const row = {
  stdRestCd: "000001", stdRestNm: "\uC11C\uC6B8\uB9CC\uB0A8(\uBD80\uC0B0)\uD734\uAC8C\uC18C",
  restCd: "S000001", seq: "272", foodNm: "\uC5B4\uBB35\uC6B0\uB3D9", foodCost: "7,000",
  recommendyn: "Y", bestfoodyn: "N", app: "Y", lsttmAltrDttm: "2026-10-21", lastDtime: "2025-08-28",
};

test("source parser keeps leading-zero identifiers and only the approved menu fields", () => {
  const result = parseFoodMenuPage({code: "SUCCESS", count: 1, pageSize: 1, list: [row]});
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.items[0].key, "000001|272");
  assert.equal(result.value.items[0].price, 7000);
  assert.equal(result.value.items[0].recommended, true);
  assert.equal(result.value.items[0].best, false);
  assert.equal("description" in result.value.items[0], false);
});

test("invalid flags fail closed", () => {
  assert.equal(parseFoodMenuPage({code: "SUCCESS", count: 1, pageSize: 1, list: [{...row, app: "maybe"}]}).ok, false);
  assert.equal(parseFoodMenuPage({code: "SUCCESS", count: 2, pageSize: 1, list: [row]}).ok, true);
});

test("a missing page rejects the complete snapshot", async () => {
  let calls = 0;
  const result = await fetchFoodMenus({apiKey: "test", fetcher: async () => {
    calls++;
    const body = calls === 1
      ? {code: "SUCCESS", count: 2, pageSize: 2, list: [row]}
      : {code: "ERROR", list: []};
    return new Response(JSON.stringify(body), {status: 200});
  }});
  assert.equal(result.ok, false);
  assert.equal(calls, 2);
});
