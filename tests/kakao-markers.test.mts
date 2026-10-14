import test from "node:test";
import assert from "node:assert/strict";
import {createRestAreaMarkers} from "../lib/kakao-markers.ts";
import {normalizeRestAreas, type RestArea} from "../lib/rest-areas.ts";
import type {KakaoMaps, KakaoMap} from "../lib/kakao-sdk.ts";

function mockKakao() {
  const state = {
    created: 0,
    clicks: [] as (() => void)[],
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
    constructor(options: {image: MarkerImage}) {
      state.created++;
      state.images.push(options.image.path);
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
      addListener(target: unknown, name: string, callback: () => void) {
        if (name === "click" && target instanceof Marker) state.clicks.push(callback);
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
  state.clicks[1]();
  assert.equal(selected, 2);
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

test("summary cards fit the viewport width without introducing a height limit or scrolling", t => {
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
  assert.equal(style.maxWidth, "288px");
  assert.equal(style.maxHeight, "");
  assert.ok(scheduled);
  (scheduled as () => void)();
  assert.deepEqual(state.offsets, [[-24, -45]]);
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
