import test from "node:test";
import assert from "node:assert/strict";
import {createMapCard} from "../lib/map-card.ts";
import {normalizeRestAreas, type RestArea} from "../lib/rest-areas.ts";

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
