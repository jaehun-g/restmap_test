import test from "node:test";
import assert from "node:assert/strict";
import { MobileLocationController, readCurrentPosition } from "../lib/mobile-location.ts";

const origin = { latitude: 37, longitude: 127 };
const bounds = { south: 35, west: 128, north: 36, east: 129 };
const successful = () => Promise.resolve({ ok: true as const, value: origin });

test("initial position and returning to my location start 15km with a new reference level", async () => {
  const controller = new MobileLocationController();
  await controller.requestLocation(successful);
  assert.deepEqual(controller.getSnapshot().scope, { kind: "radius", center: origin, radiusMeters: 15000, referenceLevel: null });
  controller.cameraReady(1, 9);
  controller.zoomChanged(10);
  const expanded = controller.getSnapshot().scope;
  assert.ok(expanded.kind === "radius");
  assert.equal(expanded.radiusMeters, 30000);
  controller.research(bounds);
  controller.zoomChanged(8);
  assert.deepEqual(controller.getSnapshot().scope, { kind: "bounds", bounds });
  await controller.requestLocation(successful);
  controller.cameraReady(1, 13);
  controller.cameraReady(2, 10);
  assert.deepEqual(controller.getSnapshot().scope, { kind: "radius", center: origin, radiusMeters: 15000, referenceLevel: 10 });
  controller.zoomChanged(9);
  const reduced = controller.getSnapshot().scope;
  assert.ok(reduced.kind === "radius");
  assert.equal(reduced.radiusMeters, 7500);
});

test("dragging marks re-search available without changing scope or camera and snapshots bounds", async () => {
  const controller = new MobileLocationController();
  await controller.requestLocation(successful);
  const { scope, cameraRequest } = controller.getSnapshot();
  controller.mapMoved();
  assert.equal(controller.getSnapshot().scope, scope);
  assert.equal(controller.getSnapshot().cameraRequest, cameraRequest);
  assert.equal(controller.getSnapshot().researchAvailable, true);
  const mutable = { ...bounds };
  controller.research(mutable);
  mutable.north = 40;
  assert.deepEqual(controller.getSnapshot().scope, { kind: "bounds", bounds });
  assert.equal(controller.getSnapshot().researchAvailable, false);
  assert.equal(controller.getSnapshot().cameraRequest, null);
});

test("map search preserves the user radius display and zoom updates only that display", async () => {
  const controller = new MobileLocationController();
  await controller.requestLocation(successful);
  controller.cameraReady(1, 9);
  controller.zoomChanged(10);
  const radius = controller.getSnapshot().locationRadius;
  controller.research(bounds);
  const scope = controller.getSnapshot().scope;
  assert.equal(controller.getSnapshot().locationRadius, radius);
  controller.zoomChanged(8);
  assert.equal(controller.getSnapshot().scope, scope);
  assert.deepEqual(controller.getSnapshot().locationRadius, {
    kind: "radius", center: origin, radiusMeters: 7500, referenceLevel: 9,
  });
  assert.equal(controller.getSnapshot().cameraRequest, null);
});

test("a late GPS response updates position but cannot replace a newer map search", async () => {
  const controller = new MobileLocationController();
  let resolve!: (value: Awaited<ReturnType<typeof successful>>) => void;
  const pending = controller.requestLocation(() => new Promise(done => { resolve = done; }));
  controller.research(bounds);
  resolve({ ok: true, value: origin });
  await pending;
  assert.deepEqual(controller.getSnapshot().position, origin);
  assert.deepEqual(controller.getSnapshot().scope, { kind: "bounds", bounds });
  assert.equal(controller.getSnapshot().cameraRequest, null);
});

test("duplicate requests are ignored and cancelled callbacks cannot update an unmounted view", async () => {
  const controller = new MobileLocationController();
  let resolve!: (value: Awaited<ReturnType<typeof successful>>) => void;
  let calls = 0;
  const read = () => { calls++; return new Promise<Awaited<ReturnType<typeof successful>>>(done => { resolve = done; }); };
  const pending = controller.requestLocation(read);
  await controller.requestLocation(read);
  assert.equal(calls, 1);
  controller.cancelPendingRequests();
  await controller.requestLocation(() => Promise.resolve({ ok: true, value: { latitude: 36, longitude: 128 } }));
  resolve({ ok: true, value: origin });
  await pending;
  assert.deepEqual(controller.getSnapshot().position, { latitude: 36, longitude: 128 });
});

test("initial failure keeps all records and a later failure keeps the committed geographic search", async () => {
  const controller = new MobileLocationController();
  await controller.requestLocation(() => readCurrentPosition({ secure: false }));
  assert.deepEqual(controller.getSnapshot().scope, { kind: "all" });
  assert.equal(controller.getSnapshot().error?.code, "INSECURE");
  await controller.requestLocation(successful);
  controller.cameraReady(1, 9);
  const before = controller.getSnapshot();
  await controller.requestLocation(() => Promise.reject(new Error("provider failed")));
  assert.equal(controller.getSnapshot().scope, before.scope);
  assert.equal(controller.getSnapshot().position, before.position);
  assert.equal(controller.getSnapshot().cameraRequest, before.cameraRequest);
  assert.equal(controller.getSnapshot().error?.code, "UNAVAILABLE");
});

test("insecure and unsupported environments never request native coordinates", async () => {
  let calls = 0;
  const geolocation = { getCurrentPosition() { calls++; } };
  const insecure = await readCurrentPosition({ secure: false, geolocation });
  assert.equal(insecure.ok, false);
  if (!insecure.ok) assert.equal(insecure.error.code, "INSECURE");
  const unsupported = await readCurrentPosition({ secure: true });
  assert.equal(unsupported.ok, false);
  if (!unsupported.ok) assert.equal(unsupported.error.code, "UNSUPPORTED");
  assert.equal(calls, 0);
});

test("native request uses accuracy, ten-second timeout and no cached location", async () => {
  let options: PositionOptions | undefined;
  const result = await readCurrentPosition({ secure: true, geolocation: {
    getCurrentPosition(success, _error, supplied) {
      options = supplied;
      success({ coords: origin } as GeolocationPosition);
    },
  } });
  assert.deepEqual(result, { ok: true, value: origin });
  assert.deepEqual(options, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
});

test("native errors distinguish denial, timeout, unavailability, exceptions and invalid coordinates", async () => {
  for (const [code, expected] of [[1, "DENIED"], [2, "UNAVAILABLE"], [3, "TIMEOUT"]] as const) {
    const result = await readCurrentPosition({ secure: true, geolocation: {
      getCurrentPosition(_success, error) { error?.({ code } as GeolocationPositionError); },
    } });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, expected);
  }
  const thrown = await readCurrentPosition({ secure: true, geolocation: { getCurrentPosition() { throw new Error("unavailable"); } } });
  assert.equal(thrown.ok, false);
  const invalid = await readCurrentPosition({ secure: true, geolocation: {
    getCurrentPosition(success) { success({ coords: { latitude: NaN, longitude: 127 } } as GeolocationPosition); },
  } });
  assert.equal(invalid.ok, false);
});
