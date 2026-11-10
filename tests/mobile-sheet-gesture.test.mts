import test from "node:test";
import assert from "node:assert/strict";
import {detailSheetSwipe} from "../lib/mobile-sheet-gesture.ts";

test("상세 시트는 세로 스와이프로 확장하고 스크롤 상단에서만 축소한다", () => {
  const start = {x: 100, y: 300, canCollapse: true};
  assert.equal(detailSheetSwipe(start, {x: 105, y: 220}, false), "expand");
  assert.equal(detailSheetSwipe(start, {x: 105, y: 380}, true), "collapse");
  assert.equal(detailSheetSwipe(start, {x: 105, y: 380}, false), "close");
  assert.equal(detailSheetSwipe({...start, canCollapse: false}, {x: 100, y: 380}, true), null);
  assert.equal(detailSheetSwipe(start, {x: 100, y: 340}, false), null);
  assert.equal(detailSheetSwipe(start, {x: 200, y: 380}, false), null);
});
