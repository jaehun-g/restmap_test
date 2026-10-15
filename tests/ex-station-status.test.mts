import test from "node:test";
import assert from "node:assert/strict";
import {
  exOpenApiKey,
  exStationAddressCandidates,
  exStationSourceKey,
  fetchExStationStatuses,
  normalizeExStationAddress,
  parseExStationStatus,
} from "../lib/ex-station-status.ts";

test("EX station status request uses the required json format and 1,000-row limit", async () => {
  const calls: {url: string; init: RequestInit}[] = [];
  const result = await fetchExStationStatuses({
    apiKey: "ex-key",
    fetch: async (url, init) => {
      calls.push({url, init});
      return new Response(
        JSON.stringify({
          count: 1,
          pageNo: 1,
          numOfRows: 1,
          pageSize: 1,
          list: [
            {
              routeCode: "0010",
              serviceAreaCode: "A001",
              routeName: "경부선",
              direction: "부산",
              serviceAreaName: "안성휴게소",
              oilCompany: "GS칼텍스",
              svarAddr: "경기 안성시 원곡면 경부고속도로 372",
              telNo: "031-123-4567",
              lpgYn: "Y",
              gasolinePrice: "1,864원",
              diselPrice: "1,853원",
              lpgPrice: "1,232원",
            },
          ],
        }),
      );
    },
  });
  assert.ok(result.ok);
  assert.equal(result.value[0].sourceKey, "0010|A001|부산|GS칼텍스");
  assert.equal(result.value[0].location, "경기 안성시 원곡면 경부고속도로 372");
  assert.equal(result.value[0].lpgAvailable, true);
  assert.deepEqual(
    [result.value[0].gasolinePrice, result.value[0].dieselPrice, result.value[0].lpgPrice],
    [1864, 1853, 1232],
  );
  const url = new URL(calls[0].url);
  assert.equal(url.searchParams.get("type"), "json");
  assert.equal(url.searchParams.get("numOfRows"), "1000");
  assert.equal(url.searchParams.get("pageNo"), "1");
  assert.equal(url.searchParams.get("key"), "ex-key");
});

test("EX station status retrieves every response page instead of assuming the requested row limit", async () => {
  const pages = ["A001", "A002", "A003"];
  const calls: string[] = [];
  const result = await fetchExStationStatuses({
    apiKey: "ex-key",
    fetch: async url => {
      const parsed = new URL(url);
      calls.push(parsed.searchParams.get("pageNo") ?? "");
      const pageNo = Number(parsed.searchParams.get("pageNo"));
      return new Response(
        JSON.stringify({
          count: pages.length,
          pageNo,
          numOfRows: 1,
          pageSize: pages.length,
          list: [{serviceAreaCode: pages[pageNo - 1]}],
        }),
      );
    },
  });
  assert.ok(result.ok);
  if (result.ok)
    assert.deepEqual(
      result.value.map(station => station.serviceAreaCode),
      pages,
    );
  assert.deepEqual(calls, ["1", "2", "3"]);
});

test("EX station status rejects missing keys, malformed data and duplicate source keys", () => {
  assert.equal(exOpenApiKey({}).ok, false);
  assert.equal(parseExStationStatus({items: []}).ok, true);
  assert.equal(parseExStationStatus({}).ok, false);
  assert.equal(
    parseExStationStatus({
      list: [{serviceAreaCode: "A001"}, {serviceAreaCode: "A001"}],
    }).ok,
    false,
  );
  assert.equal(
    exStationSourceKey({
      routeCode: null,
      serviceAreaCode: "A001",
      direction: null,
      oilCompany: null,
    }),
    "-|A001|-|-",
  );
  assert.equal(
    normalizeExStationAddress("전북 순창군 순창읍88올림픽고속도록 23"),
    "전북 순창군 순창읍 88올림픽고속도로 23",
  );
  assert.equal(
    normalizeExStationAddress("경북 경산시 진량면신상리 대학로 1089"),
    "경북 경산시 진량면 신상리 대학로 1089",
  );
  const parentheticalCandidates = exStationAddressCandidates(
    "전남 곡성군 겸면가정리(호남고속도로)49-1",
  );
  assert.ok(parentheticalCandidates.includes("전남 곡성군 겸면 가정리 49-1"));
  assert.ok(parentheticalCandidates.includes("전라남도 곡성군 겸면 가정리 49-1"));
  assert.equal(
    normalizeExStationAddress("전북 고창군 신림면벽송리 산103-1"),
    "전북 고창군 신림면 벽송리 산 103-1",
  );
  const parcelCandidates = exStationAddressCandidates("전남 장흥군 부산면호계리 산 211-1 외 9필지");
  assert.ok(parcelCandidates.includes("전라남도 장흥군 부산면 호계리 산 211-1"));
});
