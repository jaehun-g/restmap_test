import test from "node:test";
import assert from "node:assert/strict";
import {createMapCard} from "../lib/map-card.ts";
import {normalizeRestAreas, type RestArea} from "../lib/rest-areas.ts";
import {createStationMapCard} from "../lib/station-map-card.ts";
import {normalizeGasStations} from "../lib/gas-stations.ts";
import {normalizeExGasStations} from "../lib/ex-gas-stations.ts";
import {CardElement, installCardDOM} from "./helpers/card-dom.mts";

class ElementDouble {
  tag: string;
  className = "";
  textContent = "";
  children: ElementDouble[] = [];
  attributes = new Map<string, string>();
  listeners = new Map<string, (event: {stopPropagation(): void}) => void>();
  constructor(tag: string) {
    this.tag = tag;
  }
  append(...elements: ElementDouble[]) {
    this.children.push(...elements);
  }
  setAttribute(key: string, value: string) {
    this.attributes.set(key, value);
  }
  addEventListener(name: string, listener: (event: {stopPropagation(): void}) => void) {
    this.listeners.set(name, listener);
  }
  all(): ElementDouble[] {
    return [this, ...this.children.flatMap(child => child.all())];
  }
}

function installDocument(t: {after(callback: () => void): void}) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {createElement: (tag: string) => new ElementDouble(tag)},
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, "document", original);
    else Reflect.deleteProperty(globalThis, "document");
  });
}

function area(lounge: boolean | null, route: string | null): RestArea {
  const normalized = normalizeRestAreas([
    {
      id: 1,
      name: '<img src=x onerror="alert(1)">휴게소',
      route_name: route,
      has_truck_lounge: lounge === null ? null : Number(lounge),
      has_gas_station: 1,
      has_lpg_station: 1,
      has_ev_charger: 1,
      has_restroom: 1,
    },
  ]);
  if (!normalized.ok) assert.fail(normalized.error.message);
  return normalized.value[0];
}

test("휴게소 요약은 방향별 주유소의 유가 범위와 일부 가격 미확인을 표시한다", t => {
  installDocument(t);
  const stations = normalizeExGasStations([
    {id: 1, source_key: "a", service_area_name: "서울 주유소", gasoline_price: 1650, diesel_price: 1520},
    {id: 2, source_key: "b", service_area_name: "부산 주유소", gasoline_price: 1680, diesel_price: null},
  ]);
  assert.ok(stations.ok);
  const card = createMapCard(area(true, "경부선"), "mobile", () => {}, () => {}, stations.value) as unknown as ElementDouble;
  assert.ok(card.all().some(element => element.textContent === "휘발유 1,650~1,680원/L"));
  assert.ok(card.all().some(element => element.textContent === "경유 1,520원/L · 일부 가격 미확인"));
});

test("map card keeps database strings as literal text and links its close/detail actions", t => {
  installDocument(t);
  let closed = 0;
  let opened = 0;
  let stopped = 0;
  const item = area(true, "경부고속도로");
  const card = createMapCard(
    item,
    "mobile",
    () => closed++,
    () => opened++,
  ) as unknown as ElementDouble;
  assert.equal(card.all().find(element => element.tag === "strong")?.textContent, item.name);
  assert.equal(card.all().filter(element => element.tag === "img").length, 1);
  assert.ok(card.all().some(element => element.textContent === "화물차 라운지"));
  const tags = card.all().find(element => element.className.includes("map-card-facilities"))!;
  assert.equal(tags.children.length, 4);
  assert.equal(tags.children.at(-1)?.textContent, "+1");
  for (const name of ["map-card-close", "map-card-details"])
    card
      .all()
      .find(element => element.className === name)!
      .listeners.get("click")!({
      stopPropagation: () => stopped++,
    });
  assert.equal(closed, 1);
  assert.equal(opened, 1);
  assert.equal(stopped, 2);
});

test("mobile cards hide missing routes and unknown lounges while administrator cards expose them", t => {
  installDocument(t);
  const item = area(null, null);
  const mobile = createMapCard(
    item,
    "mobile",
    () => {},
    () => {},
  ) as unknown as ElementDouble;
  const admin = createMapCard(
    item,
    "admin",
    () => {},
    () => {},
  ) as unknown as ElementDouble;
  assert.equal(
    mobile.all().some(element => element.className === "map-card-route"),
    false,
  );
  assert.equal(
    mobile.all().some(element => element.textContent.includes("미확인")),
    false,
  );
  assert.ok(admin.all().some(element => element.textContent === "노선 미등록"));
  assert.ok(admin.all().some(element => element.textContent === "라운지 미확인"));
});

test("summary bodies scroll independently of header/footer and station text remains literal", t => {
  installCardDOM(t);
  const result = normalizeGasStations([
    {
      id: 1,
      siteCd: "0001",
      siteNm: "긴 이름의 GS 주유소",
      lat: "37",
      longi: "127",
      zipAddr: '<img src=x onerror="alert(1)">긴 주소',
      detAddr: "상세 주소",
      cargoYn: "Y",
      businsFrTm: "0900",
      businsToTm: "2200",
    },
  ]);
  if (!result.ok) assert.fail(result.error.message);
  let opened = 0;
  const cards = [
    createMapCard(
      area(true, "경부선"),
      "mobile",
      () => {},
      () => {},
    ),
    createStationMapCard(
      result.value[0],
      () => {},
      () => {
        opened++;
      },
    ),
  ] as unknown as CardElement[];
  for (const card of cards) {
    assert.deepEqual(
      card.children.map(child => child.className),
      ["map-card-heading", "map-card-body", "map-card-details"],
    );
    const close = card.querySelector(".map-card-close")!;
    assert.equal(close.children[0].getAttribute("aria-hidden"), "true");
    assert.ok(close.children[0].innerHTML.includes('stroke-width="1.7"'));
  }
  const station = cards[1];
  assert.equal(
    station.querySelector(".map-card-address")?.textContent,
    `${result.value[0].address} 상세 주소`,
  );
  assert.equal(station.querySelector(".map-card-hours")?.textContent, "09:00–22:00");
  station.querySelector(".map-card-details")!.dispatch("click");
  assert.equal(opened, 1);
});
