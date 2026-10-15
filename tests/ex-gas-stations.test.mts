import test from "node:test";
import assert from "node:assert/strict";
import {normalizeExGasStations} from "../lib/ex-gas-stations.ts";
import {normalizeGasStations, stationKey, stationPriceItems} from "../lib/gas-stations.ts";
import {
  filterStations,
  filterStationView,
  showsRestAreas,
  stationPlace,
} from "../lib/map-places.ts";
import {filterByGeoScope} from "../lib/geo-search.ts";
import {createStationMapCard} from "../lib/station-map-card.ts";
import {CardElement, installCardDOM} from "./helpers/card-dom.mts";

const row = () => ({
  id: 1,
  source_key: "0010|B00001|부산|AD",
  service_area_name: "서울만남(부산)주유소",
  route_name: "경부선",
  direction: "부산",
  oil_company: "AD",
  tel_no: "02-123-4567",
  latitude: "37.1",
  longitude: "127.1",
  kakao_road_address_name: "서울 검색 주소",
  source_location: "서울 원본 주소",
  lpg_available: 1,
  gasoline_price: "1700.0",
  diesel_price: "1555.5",
  lpg_price: "999.0",
  source_fetched_at: new Date("2026-10-15T00:00:00Z"),
});
function station() {
  const result = normalizeExGasStations([row()]);
  assert.ok(result.ok);
  return result.value[0];
}

test("EX rows decode UTF-8, decimal prices, coordinates and source collection time", () => {
  const result = normalizeExGasStations([
    {
      ...row(),
      source_key: Buffer.from(row().source_key),
      service_area_name: Buffer.from(row().service_area_name),
      diesel_price: Buffer.from("1555.5"),
    },
  ]);
  assert.ok(result.ok);
  const item = result.value[0];
  assert.equal(item.name, row().service_area_name);
  assert.equal(item.brand, "EX");
  assert.equal(item.latitude, 37.1);
  assert.equal(item.address, "서울 검색 주소");
  assert.deepEqual(item.prices, {gasoline: 1700, diesel: 1555.5, lpg: 999});
  assert.equal(item.priceUpdatedAt, "2026-10-15T00:00:00.000Z");
  assert.equal(item.services.lpg, true);
  assert.equal(item.services.cargo, null);
});

test("EX and GS stay separate even with the same numeric ID, phone and coordinates", () => {
  const ex = station();
  const gs = normalizeGasStations([
    {
      id: 1,
      siteCd: ex.siteCode,
      siteNm: "별도 GS 충전소",
      telNo: ex.phone,
      lat: ex.latitude,
      longi: ex.longitude,
    },
  ]);
  assert.ok(gs.ok);
  assert.notEqual(stationKey(ex), stationKey(gs.value[0]));
  assert.notEqual(stationPlace(ex).key, stationPlace(gs.value[0]).key);
  assert.equal(filterStations([ex, ...gs.value], "", []).length, 2);
});

test("EX data applies search, scope and known service filters without inventing facilities", () => {
  const item = station();
  assert.equal(filterStations([item], "서울만남", ["lpg"]).length, 1);
  assert.equal(filterStations([item], "", ["cargo"]).length, 0);
  assert.equal(
    filterByGeoScope(
      [item],
      {kind: "bounds", bounds: {south: 37, north: 37.2, west: 127, east: 127.2}},
      null,
    ).length,
    1,
  );
  assert.equal(
    filterByGeoScope(
      [item],
      {kind: "bounds", bounds: {south: 36, north: 36.2, west: 127, east: 127.2}},
      null,
    ).length,
    0,
  );
});

test("administrator views separate GS and EX without dropping either from combined station views", () => {
  const ex = station();
  const gs = {...ex, brand: "GS" as const};
  const items = [gs, ex];
  assert.deepEqual(filterStationView(items, "gs"), [gs]);
  assert.deepEqual(filterStationView(items, "ex"), [ex]);
  assert.deepEqual(filterStationView(items, "rest"), []);
  assert.deepEqual(filterStationView(items, "all"), items);
  assert.deepEqual(filterStationView(items, "station"), items);
  for (const view of ["gs", "ex", "station"] as const) assert.equal(showsRestAreas(view), false);
  assert.equal(showsRestAreas("all"), true);
  assert.equal(showsRestAreas("rest"), true);
});

test("invalid coordinates stay unmapped; empty, zero, negative and nonfinite prices stay absent", () => {
  for (const invalid of [null, "", "invalid", -1, 0, Infinity]) {
    const result = normalizeExGasStations([
      {
        ...row(),
        latitude: 91,
        gasoline_price: invalid,
        diesel_price: invalid,
        lpg_price: invalid,
        lpg_available: null,
      },
    ]);
    assert.ok(result.ok);
    assert.equal(result.value[0].latitude, null);
    assert.equal(result.value[0].longitude, null);
    assert.equal(result.value[0].services.lpg, null);
    assert.deepEqual(stationPriceItems(result.value[0]), []);
  }
  assert.equal(normalizeExGasStations([row(), row()]).ok, false);
  assert.equal(normalizeExGasStations([{...row(), source_key: ""}]).ok, false);
});

test("EX info card shows fuel prices, route and source while close/detail buttons work", t => {
  installCardDOM(t);
  let closed = 0,
    opened = 0;
  const item = station();
  const card = createStationMapCard(
    item,
    () => closed++,
    () => opened++,
  ) as unknown as CardElement;
  const texts = card.all().map(element => element.textContent);
  for (const text of [
    "고속도로 주유소",
    "경부선 · 부산 방향",
    "휘발유",
    "1,700원/L",
    "경유",
    "1,555.5원/L",
    "LPG",
    "999원/L",
  ])
    assert.ok(texts.includes(text), text);
  card.querySelector(".map-card-close")!.dispatch("click");
  card.querySelector(".map-card-details")!.dispatch("click");
  assert.equal(closed, 1);
  assert.equal(opened, 1);
  const empty = createStationMapCard(
    {...item, prices: {gasoline: null, diesel: 0, lpg: -1}},
    () => {},
    () => {},
  ) as unknown as CardElement;
  assert.equal(empty.querySelector(".station-fuel-prices"), null);
});
