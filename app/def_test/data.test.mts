import {test} from "node:test";
import assert from "node:assert/strict";
import {averagePrices, parseOpinetJson, priceChange} from "./data.ts";

test("요소수 평균은 유효한 양수 가격만 집계한다", () => {
  assert.deepEqual(averagePrices([{PRICE: "1000"}, {PRICE: 2000}, {PRICE: 0}, {PRICE: ""}, {PRICE: "-1"}, {PRICE: "오류"}, null]), {average: 1500, count: 2});
  assert.deepEqual(averagePrices([{PRICE: null}]), {average: null, count: 0});
});

test("이전 가격을 기준으로 등락액과 등락률을 계산한다", () => {
  assert.deepEqual(priceChange(1515, 1500), {difference: 15, percent: 1});
  assert.deepEqual(priceChange(1485, 1500), {difference: -15, percent: -1});
  assert.equal(priceChange(null, 1500), null);
  assert.equal(priceChange(1500, 0), null);
});

test("오피넷 JSON 문자열 내부의 줄바꿈을 처리한다", () => {
  const result = parseOpinetJson('{"RESULT":{"OIL":[{"PRICE":"\r\n750\r\n","OS_NM":"\\"상호\\""}]}}');
  assert.equal(result.RESULT.OIL[0].OS_NM, '"상호"');
  assert.deepEqual(averagePrices(result.RESULT.OIL), {average: 750, count: 1});
});
