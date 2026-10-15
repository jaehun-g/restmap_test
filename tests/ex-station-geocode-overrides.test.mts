import test from "node:test";
import assert from "node:assert/strict";
import {parseExStationGeocodeOverrides} from "../lib/ex-station-geocode-overrides.ts";

test("manual station address mappings normalize addresses and reject invalid source keys", () => {
  assert.deepEqual(
    parseExStationGeocodeOverrides([
      {sourceKey: "0010|B00050|서울|AD", searchAddress: "  경북  경산시 진량읍 대학로 1089 "},
    ]),
    {
      ok: true,
      value: [{sourceKey: "0010|B00050|서울|AD", searchAddress: "경북 경산시 진량읍 대학로 1089"}],
    },
  );
  assert.equal(parseExStationGeocodeOverrides([{sourceKey: "", searchAddress: "주소"}]).ok, false);
  assert.equal(
    parseExStationGeocodeOverrides([
      {sourceKey: "0010|B00050|서울|AD", searchAddress: "주소"},
      {sourceKey: "0010|B00050|서울|AD", searchAddress: "다른 주소"},
    ]).ok,
    false,
  );
});
