import test from "node:test";
import assert from "node:assert/strict";
import {createLocationMapLayer, type MobileMapMemory} from "../lib/kakao-location.ts";
import {MobileLocationController} from "../lib/mobile-location.ts";
import {filterByGeoScope} from "../lib/geo-search.ts";
import {normalizeRestAreas} from "../lib/rest-areas.ts";
import type {KakaoMaps, KakaoMap} from "../lib/kakao-sdk.ts";

const origin = {latitude: 37, longitude: 127};
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
  sw: LatLng;
  ne: LatLng;
  constructor(sw = new LatLng(36.8, 126.8), ne = new LatLng(37.2, 127.2)) {
    this.sw = sw;
    this.ne = ne;
  }
  getSouthWest() {
    return this.sw;
  }
  getNorthEast() {
    return this.ne;
  }
  extend() {}
}
function mockKakao() {
  const listeners = new Map<string, Set<() => void>>();
  const emit = (name: string) => listeners.get(name)?.forEach(listener => listener());
  const state = {
    fitted: 0,
    centered: 0,
    overlays: [] as Overlay[],
    circles: [] as Circle[],
    bounds: new Bounds(),
  };
  class Overlay {
    position: LatLng | null = null;
    visible = false;
    content: string;
    constructor(options: {content: string}) {
      this.content = options.content;
      state.overlays.push(this);
    }
    setContent() {}
    setPosition(position: LatLng) {
      this.position = position;
    }
    setMap(map: unknown) {
      this.visible = !!map;
    }
  }
  class Circle {
    position: LatLng;
    radius: number;
    visible = false;
    constructor(options: {center: LatLng; radius: number}) {
      this.position = options.center;
      this.radius = options.radius;
      state.circles.push(this);
    }
    setPosition(position: LatLng) {
      this.position = position;
    }
    setRadius(radius: number) {
      this.radius = radius;
    }
    setMap(map: unknown) {
      this.visible = !!map;
    }
    getBounds() {
      const delta = this.radius / 111000;
      return new Bounds(
        new LatLng(this.position.latitude - delta, this.position.longitude - delta),
        new LatLng(this.position.latitude + delta, this.position.longitude + delta),
      );
    }
  }
  let level = 13;
  let center = new LatLng(36.4, 127.8);
  const map = {
    getCenter: () => center,
    getLevel: () => level,
    getBounds: () => state.bounds,
    setCenter(position: LatLng) {
      center = position;
      state.centered++;
    },
    setLevel(value: number) {
      level = value;
      emit("zoom_changed");
    },
    setBounds() {
      state.fitted++;
      this.setLevel(9);
      emit("idle");
    },
  };
  const sdk = {
    LatLng,
    Circle,
    CustomOverlay: Overlay,
    event: {
      addListener(_target: unknown, name: string, listener: () => void) {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name)!.add(listener);
      },
      removeListener(_target: unknown, name: string, listener: () => void) {
        listeners.get(name)?.delete(listener);
      },
    },
  };
  return {
    sdk: sdk as unknown as KakaoMaps,
    map: map as unknown as KakaoMap,
    state,
    emit,
    listeners,
  };
}
function connected(memory: MobileMapMemory = {}) {
  const mock = mockKakao();
  const controller = new MobileLocationController();
  let cleared = 0;
  let zoomStarts = 0;
  const layer = createLocationMapLayer(
    mock.sdk,
    mock.map,
    {
      cameraReady: controller.cameraReady,
      radiusReady: controller.radiusReady,
      zoomChanged: controller.zoomChanged,
      mapMoved: controller.mapMoved,
      research: controller.research,
      dragStart() {
        cleared++;
      },
      zoomStart() {
        zoomStarts++;
      },
    },
    memory,
  );
  const update = () => {
    const {position, scope, cameraRequest, locationRadius} = controller.getSnapshot();
    layer.update(position, scope, cameraRequest, locationRadius);
  };
  const unsubscribe = controller.subscribe(update);
  const locate = () => controller.requestLocation(() => Promise.resolve({ok: true, value: origin}));
  return {
    ...mock,
    controller,
    layer,
    update,
    locate,
    unsubscribe,
    getCleared: () => cleared,
    getZoomStarts: () => zoomStarts,
    memory,
  };
}

test("location fit initializes reference zoom, dot and circle without creating a user move", async () => {
  const {controller, state, locate, emit, map, getZoomStarts} = connected();
  await locate();
  emit("idle");
  assert.equal(state.fitted, 1);
  assert.deepEqual(controller.getSnapshot().scope, {
    kind: "radius",
    center: origin,
    radiusMeters: 15000,
    referenceLevel: 9,
  });
  assert.equal(controller.getSnapshot().researchAvailable, false);
  assert.deepEqual(
    {latitude: map.getCenter().getLat(), longitude: map.getCenter().getLng()},
    origin,
  );
  assert.equal(state.overlays[0].visible, true);
  assert.equal(state.circles[0].visible, true);
  assert.equal(getZoomStarts(), 0);
});

test("user zoom commits at idle, changes radius and results, and never fits or recenters", async () => {
  const {map, state, controller, locate, emit, getZoomStarts} = connected();
  await locate();
  const result = normalizeRestAreas([
    {id: 1, name: "near", latitude: 37.01, longitude: 127},
    {id: 2, name: "far", latitude: 37.2, longitude: 127},
  ]);
  assert.ok(result.ok);
  map.setLevel(10);
  assert.equal(state.circles[0].radius, 15000);
  emit("idle");
  assert.equal(state.circles[0].radius, 30000);
  assert.equal(filterByGeoScope(result.value, controller.getSnapshot().scope, origin).length, 2);
  map.setLevel(8);
  emit("idle");
  assert.equal(state.circles[0].radius, 7500);
  assert.equal(filterByGeoScope(result.value, controller.getSnapshot().scope, origin).length, 1);
  assert.equal(state.fitted, 1);
  assert.equal(state.centered, 1);
  assert.equal(controller.getSnapshot().researchAvailable, true);
  assert.equal(getZoomStarts(), 2);
});

test("drag immediately clears selection while keeping circle center, query radius and results", async () => {
  const current = connected();
  await current.locate();
  const before = current.controller.getSnapshot().scope;
  current.emit("dragstart");
  assert.equal(current.getCleared(), 1);
  current.map.setCenter(new LatLng(35, 129));
  current.emit("dragend");
  current.emit("idle");
  assert.equal(current.controller.getSnapshot().scope, before);
  assert.equal(current.controller.getSnapshot().researchAvailable, true);
  assert.equal(current.state.circles[0].position.latitude, origin.latitude);
  assert.equal(current.state.circles[0].position.longitude, origin.longitude);
  assert.equal(current.state.fitted, 1);
});

test("map re-search takes click-time bounds and keeps them fixed across further zooms and moves", async () => {
  const {locate, state, layer, controller, map, emit} = connected();
  await locate();
  state.bounds = new Bounds(new LatLng(35, 128), new LatLng(36, 129));
  layer.research();
  const committed = controller.getSnapshot().scope;
  assert.deepEqual(committed, {
    kind: "bounds",
    bounds: {south: 35, west: 128, north: 36, east: 129},
  });
  assert.equal(state.circles[0].visible, true);
  assert.equal(state.overlays[0].visible, true);
  state.bounds = new Bounds(new LatLng(34, 127), new LatLng(37, 130));
  map.setLevel(10);
  emit("idle");
  assert.equal(controller.getSnapshot().scope, committed);
  assert.equal(state.circles[0].radius, 30000);
  assert.equal(state.circles[0].position.latitude, origin.latitude);
  assert.equal(state.circles[0].position.longitude, origin.longitude);
  assert.equal(controller.getSnapshot().researchAvailable, true);
  assert.equal(state.fitted, 1);
  layer.research();
  assert.deepEqual(controller.getSnapshot().scope, {
    kind: "bounds",
    bounds: {south: 34, west: 127, north: 37, east: 130},
  });
  await locate();
  assert.equal(state.circles[0].radius, 15000);
  assert.equal(state.circles[0].visible, true);
  assert.equal(state.fitted, 2);
});

test("filter/redraw updates keep center, zoom, radius and camera; fallback fitting happens only once", async () => {
  const current = connected();
  current.layer.fitInitialResults(() => current.map.setLevel(11));
  current.layer.fitInitialResults(() => assert.fail("reload must not fit again"));
  current.emit("idle");
  assert.equal(current.controller.getSnapshot().researchAvailable, false);
  await current.locate();
  current.map.setLevel(10);
  current.emit("idle");
  const before = current.controller.getSnapshot();
  const camera = current.memory.viewport;
  for (let i = 0; i < 3; i++) current.update();
  assert.equal(current.controller.getSnapshot(), before);
  assert.deepEqual(current.memory.viewport, camera);
  assert.equal(current.state.fitted, 1);
  assert.equal(current.state.centered, 1);
  assert.equal(current.state.circles[0].radius, 30000);
});

test("re-search before zoom idle keeps the radius aligned to the current level without a camera move", async () => {
  const {locate, state, layer, controller, map, emit} = connected();
  await locate();
  map.setLevel(10);
  assert.equal(state.circles[0].radius, 15000);
  layer.research();
  const committed = controller.getSnapshot().scope;
  assert.equal(committed.kind, "bounds");
  assert.equal(state.circles[0].visible, true);
  assert.equal(state.circles[0].radius, 30000);
  emit("idle");
  assert.equal(controller.getSnapshot().scope, committed);
  assert.equal(controller.getSnapshot().researchAvailable, false);
  assert.equal(state.fitted, 1);
  assert.equal(state.centered, 1);
});

test("late initial GPS draws a zoom-aware radius while preserving a newer map search and camera", async () => {
  const {state, controller, layer, map, emit} = connected();
  let resolve!: (value: {ok: true; value: typeof origin}) => void;
  const pending = controller.requestLocation(
    () =>
      new Promise(done => {
        resolve = done;
      }),
  );
  map.setLevel(10);
  emit("idle");
  layer.research();
  const committed = controller.getSnapshot().scope;
  resolve({ok: true, value: origin});
  await pending;
  assert.equal(controller.getSnapshot().scope, committed);
  assert.deepEqual(controller.getSnapshot().locationRadius, {
    kind: "radius",
    center: origin,
    radiusMeters: 15000,
    referenceLevel: 10,
  });
  assert.equal(state.circles[0].visible, true);
  map.setLevel(9);
  emit("idle");
  assert.equal(state.circles[0].radius, 7500);
  assert.equal(controller.getSnapshot().scope, committed);
  assert.equal(state.fitted, 0);
  assert.equal(state.centered, 0);
});

test("moving before DB results arrive prevents a delayed fallback fit; searching works without GPS", () => {
  const {emit, layer, controller, state} = connected();
  emit("dragstart");
  emit("dragend");
  emit("idle");
  layer.fitInitialResults(() => assert.fail("do not undo an earlier drag"));
  layer.research();
  assert.equal(controller.getSnapshot().scope.kind, "bounds");
  assert.equal(controller.getSnapshot().position, null);
  assert.equal(state.circles.length, 0);
  assert.equal(state.overlays[0].visible, false);
});

test("SDK recreation retains camera memory and disposal removes overlays and all listeners", async () => {
  const current = connected();
  await current.locate();
  current.map.setLevel(10);
  current.emit("idle");
  current.layer.research();
  current.unsubscribe();
  current.layer.dispose();
  assert.equal(current.state.overlays[0].visible, false);
  assert.equal(current.state.circles[0].visible, false);
  assert.ok([...current.listeners.values()].every(listeners => listeners.size === 0));
  const layer = createLocationMapLayer(
    current.sdk,
    current.map,
    {
      cameraReady: current.controller.cameraReady,
      radiusReady: current.controller.radiusReady,
      zoomChanged: current.controller.zoomChanged,
      mapMoved: current.controller.mapMoved,
      research: current.controller.research,
      dragStart() {},
    },
    current.memory,
  );
  const state = current.controller.getSnapshot();
  layer.update(state.position, state.scope, state.cameraRequest, state.locationRadius);
  assert.equal(current.state.fitted, 1);
  assert.equal(current.map.getLevel(), 10);
  assert.equal(current.state.circles.at(-1)?.visible, true);
  assert.equal(current.state.circles.at(-1)?.radius, 30000);
  layer.dispose();
});

test("route mode hides the radius and preserves geographic scope across route fitting and user zoom", async () => {
  const current = connected();
  await current.locate();
  const saved = current.controller.getSnapshot();
  current.layer.setRouteMode(true);
  current.update();
  assert.equal(current.state.circles[0].visible, false);
  assert.equal(current.state.overlays[0].visible, true);
  current.layer.fitRoute(() => current.map.setLevel(12));
  current.emit("idle");
  current.map.setLevel(13);
  current.emit("idle");
  current.layer.research();
  assert.equal(current.controller.getSnapshot(), saved);
  assert.equal(current.state.fitted, 1);
  current.layer.setRouteMode(false);
  current.update();
  assert.equal(current.state.circles[0].visible, true);
  assert.equal(current.state.circles[0].radius, 15000);
  assert.equal(current.controller.getSnapshot().scope, saved.scope);
  assert.equal(current.state.fitted, 1);
});

test("late GPS in route mode updates the position without replacing the route camera", async () => {
  const current = connected();
  let resolve!: (result: {ok: true; value: typeof origin}) => void;
  const pending = current.controller.requestLocation(
    () =>
      new Promise(done => {
        resolve = done;
      }),
  );
  current.layer.setRouteMode(true);
  current.layer.fitRoute(() => current.map.setLevel(11));
  resolve({ok: true, value: origin});
  await pending;
  current.emit("idle");
  assert.equal(current.state.overlays[0].visible, true);
  assert.equal(current.state.circles.length, 0);
  assert.equal(current.state.fitted, 0);
  assert.equal(current.map.getLevel(), 11);
  current.layer.fitInitialResults(() =>
    assert.fail("initial results must not replace the route camera"),
  );
  current.layer.setRouteMode(false);
  current.update();
  assert.equal(current.state.fitted, 1);
  assert.equal(current.map.getLevel(), 9);
  assert.equal(current.state.circles[0].visible, true);
  assert.equal(current.state.circles[0].radius, 15000);
});
