import {test} from "node:test";
import assert from "node:assert/strict";
import {findMissingRestAreas} from "../lib/rest-area-review.ts";

test("기준정보에서 누락된 코드가 있는 휴게소만 검토 대상으로 표시한다", () => {
  const areas = [{id: 1, name: "가", stdRestCd: "001"}, {id: 2, name: "나", stdRestCd: "002"}, {id: 3, name: "다", stdRestCd: null}];
  assert.deepEqual(findMissingRestAreas(areas, [{stdRestCd: "001"}]), [
    {id: 2, name: "나", reason: "기준정보 API에서 조회되지 않음"},
  ]);
});
