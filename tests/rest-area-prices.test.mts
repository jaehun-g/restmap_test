import test from "node:test";
import assert from "node:assert/strict";
import {normalizeExGasStations} from "../lib/ex-gas-stations.ts";
import {restAreaPriceSummary} from "../lib/rest-area-prices.ts";

function stations() {
  const result = normalizeExGasStations([
    {id: 1, source_key: "a", service_area_name: "서울 주유소", gasoline_price: 1650, diesel_price: 1540},
    {id: 2, source_key: "b", service_area_name: "부산 주유소", gasoline_price: 1680, diesel_price: 1520},
  ]);
  assert.ok(result.ok);
  return result.value;
}

test("유종별 가격 범위는 각각 계산하고 단일·동일 가격은 한 값으로 표시한다", () => {
  const items = stations();
  assert.deepEqual(restAreaPriceSummary(items, "gasoline"), {text: "1,650~1,680원/L", partial: false});
  assert.deepEqual(restAreaPriceSummary(items, "diesel"), {text: "1,520~1,540원/L", partial: false});
  assert.equal(restAreaPriceSummary(items.slice(0, 1), "gasoline").text, "1,650원/L");
  items[1].prices!.gasoline = 1650;
  assert.equal(restAreaPriceSummary(items, "gasoline").text, "1,650원/L");
});

test("누락·0·음수·비정상 가격은 범위에서 제외하고 일부 미확인을 알린다", () => {
  const items = stations();
  for (const price of [null, 0, -1, NaN, Infinity]) {
    items[1].prices!.gasoline = price;
    assert.deepEqual(restAreaPriceSummary(items, "gasoline"), {text: "1,650원/L", partial: true});
  }
  assert.deepEqual(restAreaPriceSummary([], "gasoline"), {text: "정보 없음", partial: false});
  items[0].prices!.gasoline = null;
  assert.deepEqual(restAreaPriceSummary(items, "gasoline"), {text: "정보 없음", partial: false});
});
