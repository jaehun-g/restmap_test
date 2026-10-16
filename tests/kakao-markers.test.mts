import test from "node:test";
import assert from "node:assert/strict";
import {createPlaceMarkers} from "../lib/kakao-place-markers.ts";
import {createRestAreaMarkers} from "../lib/kakao-markers.ts";
import {restPlace} from "../lib/map-places.ts";
import {normalizeRestAreas, type RestArea} from "../lib/rest-areas.ts";
import type {KakaoMaps, KakaoMap} from "../lib/kakao-sdk.ts";
import {createMapCard} from "../lib/map-card.ts";
import {CardElement, installCardDOM} from "./helpers/card-dom.mts";
import {normalizeExGasStations} from "../lib/ex-gas-stations.ts";
import {normalizeGasStations} from "../lib/gas-stations.ts";
import {stationPlace} from "../lib/map-places.ts";

function mockKakao() {
  const state = {
    created: 0,
    clicks: [] as (() => void)[],
    mapClicks: [] as (() => void)[],
    idle: [] as (() => void)[],
    offsets: [] as number[][],
    removed: 0,
    detached: 0,
    shown: 0,
    hidden: 0,
    fitted: 0,
    panned: 0,
    centered: 0,
    images: [] as string[],
    sizes: [] as number[][],
    ids: [] as string[],
    content: [] as unknown[],
    clickable: [] as boolean[],
    prevented: 0,
  };
  class LatLng {
    latitude: number;
    longitude: number;
    constructor(latitude: number, longitude: number) {
      this.latitude = latitude;
      this.longitude = longitude;
    }
    getLat() {
      return this.latitude;
    }
    getLng() {
      return this.longitude;
    }
  }
  class Bounds {
    extend() {}
    getSouthWest() {
      return new LatLng(37, 127);
    }
    getNorthEast() {
      return new LatLng(37, 127);
    }
  }
  class Size {
    width: number;
    height: number;
    constructor(width: number, height: number) {
      this.width = width;
      this.height = height;
    }
  }
  class MarkerImage {
    path: string;
    constructor(path: string, size: Size) {
      this.path = path;
      state.sizes.push([size.width, size.height]);
    }
  }
  class Marker {
    clickable: boolean;
    constructor(options: {image: MarkerImage; clickable?: boolean}) {
      state.created++;
      state.images.push(options.image.path);
      this.clickable = options.clickable ?? false;
      state.clickable.push(this.clickable);
    }
    setMap(map: unknown) {
      if (map === null) state.detached++;
    }
    setImage(image: MarkerImage) {
      state.ids.push(image.path);
    }
    setZIndex() {}
  }
  class Overlay {
    setContent(content: unknown) {
      state.content.push(content);
    }
    setPosition() {}
    setMap(map: unknown) {
      if (map) state.shown++;
      else state.hidden++;
    }
  }
  const sdk = {
    LatLng,
    LatLngBounds: Bounds,
    Marker,
    MarkerImage,
    Size,
    Point: class {},
    CustomOverlay: Overlay,
    event: {
      preventMap() {
        state.prevented++;
      },
      addListener(target: unknown, name: string, callback: () => void) {
        if (name === "click") {
          if (target instanceof Marker)
            state.clicks.push(() => {
              callback();
              state.mapClicks.forEach(click => click());
            });
          else state.mapClicks.push(callback);
        }
        if (name === "idle") state.idle.push(callback);
      },
      removeListener() {
        state.removed++;
      },
    },
  } as unknown as KakaoMaps;
  const map = {
    setBounds() {
      state.fitted++;
    },
    panTo() {
      state.panned++;
    },
    panBy(dx: number, dy: number) {
      state.offsets.push([dx, dy]);
    },
    setCenter() {
      state.centered++;
    },
    setLevel() {},
    getLevel() {
      return 6;
    },
  } as unknown as KakaoMap;
  return {sdk, map, state};
}
function areas(): RestArea[] {
  const result = normalizeRestAreas([
    {id: 1, name: "A", latitude: "37", longitude: "127", has_truck_lounge: 1},
    {id: 2, name: "B", latitude: "36", longitude: "128", has_truck_lounge: 0},
    {id: 3, name: "No coordinates", latitude: null, longitude: null, has_truck_lounge: null},
  ]);
  if (!result.ok) assert.fail(result.error.message);
  return result.value;
}
const label = () => ({}) as HTMLElement;
test("marker clicks do not bubble into map-close and EX selections keep their distinct identity and icon", t => {
  installCardDOM(t);
  const ex = normalizeExGasStations([
    {
      id: 1,
      source_key: "0010|B00001|부산|AD",
      service_area_name: "고속도로 주유소",
      latitude: 37,
      longitude: 127,
    },
  ]);
  const gs = normalizeGasStations([
    {id: 1, siteCd: "same-numeric-id", siteNm: "별도 GS", lat: 37.01, longi: 127},
  ]);
  assert.ok(ex.ok && gs.ok);
  const places = [stationPlace(ex.value[0]), stationPlace(gs.value[0])];
  const {sdk, map, state} = mockKakao();
  let selected: string | null = null;
  let cleared = 0;
  const card = new CardElement("section");
  const layer = createPlaceMarkers(
    sdk,
    map,
    places,
    place => {
      selected = place.key;
      layer.select(place.key);
    },
    () => card as unknown as HTMLElement,
    undefined,
    () => {
      cleared++;
    },
  );
  state.clicks[0]();
  assert.equal(selected, places[0].key);
  assert.deepEqual(state.clickable, [true, true]);
  assert.equal(cleared, 0);
  assert.ok(state.images.includes("/marker-ex-station.svg"));
  assert.ok(state.ids.includes("/marker-ex-station-selected.svg"));
  card.dispatch("mousedown");
  assert.equal(state.prevented, 2);
  state.clicks[1]();
  assert.equal(selected, places[1].key);
  assert.equal(cleared, 0);
  layer.dispose();
});

test("cluster popover wheel events stay inside its scrollable list", t => {
  installCardDOM(t);
  const {sdk, map, state} = mockKakao();
  const result = normalizeRestAreas(
    Array.from({length: 6}, (_, index) => ({
      id: index + 1,
      name: `\uD734\uAC8C\uC18C ${index + 1}`,
      latitude: "37",
      longitude: "127",
      has_truck_lounge: 0,
    })),
  );
  assert.ok(result.ok);
  const markers = createPlaceMarkers(
    sdk,
    map,
    result.value.map(restPlace),
    () => {},
    label,
  );
  state.clicks[0]();
  const card = [...state.content].reverse().find(content => content instanceof CardElement) as CardElement;
  assert.ok(card.querySelector(".cluster-popover-list"));
  const before = state.prevented;
  card.dispatch("wheel");
  assert.equal(state.prevented, before + 1);
  markers.dispose();
});
test("only positioned records produce markers and clicks select the correct ID", () => {
  const {sdk, map, state} = mockKakao();
  let selected: number | undefined;
  createRestAreaMarkers(
    sdk,
    map,
    areas(),
    id => {
      selected = id;
    },
    label,
  );
  assert.equal(state.created, 2);
  state.clicks[0]();
  assert.equal(selected, 1);
  assert.equal(state.shown, 1, "marker click opens its card before parent state is reconciled");
  state.clicks[1]();
  assert.equal(selected, 2);
  assert.equal(state.shown, 2);
});
test("lounge and ordinary markers use distinct icon assets at the requested sizes", () => {
  const {sdk, map, state} = mockKakao();
  createRestAreaMarkers(sdk, map, areas(), () => {}, label);
  assert.deepEqual(state.images, ["/marker-lounge.svg", "/marker.svg"]);
  assert.deepEqual(state.sizes, [
    [32, 38],
    [36, 42],
    [32, 38],
    [36, 42],
  ]);
});
test("selection preserves marker type and restores its correct icon on deselection", () => {
  const {sdk, map, state} = mockKakao();
  const markers = createRestAreaMarkers(sdk, map, areas(), () => {}, label);
  markers.select(1);
  assert.deepEqual(state.ids.slice(-2), ["/marker-lounge-selected.svg", "/marker.svg"]);
  assert.equal(state.shown, 1);
  markers.select(2);
  assert.deepEqual(state.ids.slice(-2), ["/marker-lounge.svg", "/marker-selected.svg"]);
  markers.select(null);
  assert.deepEqual(state.ids.slice(-2), ["/marker-lounge.svg", "/marker.svg"]);
});
test("hiding a card can retain marker selection for administrator editing", () => {
  const {sdk, map, state} = mockKakao();
  const markers = createRestAreaMarkers(sdk, map, areas(), () => {}, label);
  markers.select(1, false);
  assert.equal(state.shown, 0);
  assert.equal(state.panned, 1);
  markers.select(3);
  assert.equal(state.shown, 0);
  assert.equal(state.panned, 1);
});
test("clicking an empty map area closes an open single-place card and clears its selection", () => {
  const {sdk, map, state} = mockKakao();
  let cleared = 0;
  const markers = createPlaceMarkers(
    sdk,
    map,
    areas().slice(0, 1).map(restPlace),
    () => {},
    label,
    undefined,
    () => {
      cleared++;
    },
  );
  markers.select("rest:1");
  assert.equal(state.shown, 1);
  const hidden = state.hidden;
  state.mapClicks[0]();
  assert.ok(state.hidden > hidden);
  assert.equal(cleared, 1);
});
test("fit handles multiple markers, a single marker and empty results", () => {
  const {sdk, map, state} = mockKakao();
  createRestAreaMarkers(sdk, map, areas(), () => {}, label).fit();
  assert.equal(state.fitted, 1);
  createRestAreaMarkers(sdk, map, areas().slice(0, 1), () => {}, label).fit();
  assert.equal(state.centered, 1);
  createRestAreaMarkers(sdk, map, [], () => {}, label).fit();
  assert.equal(state.fitted, 1);
});
test("disposal removes marker listeners, the map idle listener, card contents and all markers", () => {
  const {sdk, map, state} = mockKakao();
  const markers = createRestAreaMarkers(sdk, map, areas(), () => {}, label);
  markers.dispose();
  assert.equal(state.detached, 2);
  assert.equal(state.removed, 5);
  assert.equal(state.content.at(-1), "");
});

test("summary cards fit viewport width and height and adjust only overflowing edges", t => {
  const animation = Object.getOwnPropertyDescriptor(globalThis, "requestAnimationFrame");
  const cancellation = Object.getOwnPropertyDescriptor(globalThis, "cancelAnimationFrame");
  let scheduled: (() => void) | null = null;
  let cancelled = false;
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    configurable: true,
    value: (callback: () => void) => {
      scheduled = callback;
      return 1;
    },
  });
  Object.defineProperty(globalThis, "cancelAnimationFrame", {
    configurable: true,
    value: () => {
      cancelled = true;
    },
  });
  t.after(() => {
    if (animation) Object.defineProperty(globalThis, "requestAnimationFrame", animation);
    else Reflect.deleteProperty(globalThis, "requestAnimationFrame");
    if (cancellation) Object.defineProperty(globalThis, "cancelAnimationFrame", cancellation);
    else Reflect.deleteProperty(globalThis, "cancelAnimationFrame");
  });
  const {sdk, map, state} = mockKakao();
  const style = {maxWidth: "", maxHeight: ""};
  let box = {left: -8, right: 230, top: 10, bottom: 160, width: 238, height: 150};
  const card = {style, getBoundingClientRect: () => box} as unknown as HTMLElement;
  const view = {left: 0, right: 320, top: 0, bottom: 400, width: 320, height: 400} as DOMRect;
  const markers = createRestAreaMarkers(
    sdk,
    map,
    areas(),
    () => {},
    () => card,
    () => view,
  );
  markers.select(1);
  assert.equal(style.maxWidth, "280px");
  assert.equal(style.maxHeight, "384px");
  assert.ok(scheduled);
  (scheduled as () => void)();
  assert.deepEqual(state.offsets, [[-24, 0]]);
  box = {...box, left: 16, right: 254, top: 55, bottom: 205};
  state.idle[0]();
  assert.equal(state.offsets.length, 1);
  box = {...box, left: -8, right: 230};
  markers.suspendCardAdjustment();
  state.idle[0]();
  assert.equal(state.offsets.length, 1, "user zoom must not trigger card-driven map movement");
  markers.adjustCard();
  (scheduled as () => void)();
  assert.equal(state.offsets.length, 2, "explicit panel/card adjustment remains available");
  markers.select(2);
  markers.dispose();
  assert.equal(cancelled, true);
});

test("cluster list returns with count, scroll and focus intact; close resets the next opening", t => {
  const dom = installCardDOM(t);
  const {sdk, map, state} = mockKakao();
  const normalized = normalizeRestAreas(
    Array.from({length: 12}, (_, i) => ({
      id: i + 1,
      name: `휴게소 ${i + 1}`,
      latitude: "37",
      longitude: "127",
      has_truck_lounge: 0,
    })),
  );
  if (!normalized.ok) assert.fail(normalized.error.message);
  const layer = createPlaceMarkers(
    sdk,
    map,
    normalized.value.map(restPlace),
    place => layer.select(place.key),
    place =>
      createMapCard(
        place.record as RestArea,
        "mobile",
        () => layer.select(null),
        () => {},
      ),
    () => ({left: 0, right: 320, top: 50, bottom: 700, width: 320, height: 650}) as DOMRect,
    () => layer.select(null),
  );
  const currentCard = () =>
    [...state.content].reverse().find(content => content instanceof CardElement) as CardElement;
  state.clicks[0]();
  dom.flush();
  let listCard = currentCard();
  listCard.querySelector(".cluster-list-more")!.dispatch("click");
  const list = listCard.querySelector(".cluster-popover-list")!;
  list.scrollTop = 192;
  list.dispatch("scroll");
  const key = list.children[7].children[0].getAttribute("data-place-key");
  list.children[7].children[0].dispatch("click");
  const single = currentCard();
  const heading = single.querySelector(".map-card-heading")!;
  assert.equal(heading.firstChild?.getAttribute("aria-label"), "목록으로 돌아가기");
  assert.equal(heading.children[1].tag, "img");
  single.querySelector(".cluster-back")!.dispatch("click");
  dom.flush();
  listCard = currentCard();
  const restored = listCard.querySelector(".cluster-popover-list")!;
  assert.equal(restored.children.length, 10);
  assert.equal(restored.scrollTop, 192);
  assert.equal(
    restored
      .querySelectorAll("button")
      .find(button => button.getAttribute("data-place-key") === key)?.focused,
    true,
  );
  listCard.querySelector(".map-card-close")!.dispatch("click");
  state.clicks[0]();
  assert.equal(currentCard().querySelector(".cluster-popover-list")?.children.length, 5);
  layer.dispose();
  assert.equal(dom.frames.size, 0);
});

test("resize observation hides and restores cards and cleans up all queued work on disposal", t => {
  const dom = installCardDOM(t, true);
  const {sdk, map, state} = mockKakao();
  const card = new CardElement("section");
  card.append(new CardElement("div"), new CardElement("button"));
  let height = 400;
  const layer = createPlaceMarkers(
    sdk,
    map,
    areas().slice(0, 1).map(restPlace),
    () => {},
    () => card as unknown as HTMLElement,
    () => ({left: 0, top: 50, right: 320, bottom: 50 + height, width: 320, height}) as DOMRect,
  );
  layer.select("rest:1");
  dom.flush();
  assert.equal(card.style.visibility, "");
  height = 70;
  dom.observers[0].callback();
  dom.flush();
  assert.equal(card.style.visibility, "hidden");
  assert.equal(card.style.pointerEvents, "none");
  height = 400;
  dom.observers[0].callback();
  dom.flush();
  assert.equal(card.style.visibility, "");
  assert.equal(card.style.pointerEvents, "");
  assert.equal(dom.observers[0].targets.has(card), true);
  dom.observers[0].callback();
  layer.dispose();
  assert.equal(dom.observers[0].disconnected, true);
  assert.equal(dom.observers[0].targets.size, 0);
  assert.equal(dom.frames.size, 0);
  const offsets = state.offsets.length;
  dom.observers[0].callback();
  dom.flush();
  assert.equal(state.offsets.length, offsets);
  assert.equal(dom.frames.size, 0);
});

test("opening details keeps the existing card and does not recenter the selected marker", () => {
  const {sdk, map, state} = mockKakao();
  const markers = createRestAreaMarkers(sdk, map, areas(), () => {}, label);
  markers.select(1);
  const shown = state.shown;
  const contents = state.content.length;
  markers.select(1, true, false);
  assert.equal(state.shown, shown);
  assert.equal(state.content.length, contents);
  assert.equal(state.panned, 1);
});

test("redrawing filtered markers restores their selected card without moving center or zoom", () => {
  const {sdk, map, state} = mockKakao();
  const markers = createRestAreaMarkers(sdk, map, areas().slice(0, 1), () => {}, label);
  markers.select(1, true, false);
  assert.equal(state.shown, 1);
  assert.equal(state.panned, 0);
  assert.equal(state.fitted, 0);
  assert.equal(state.centered, 0);
});
