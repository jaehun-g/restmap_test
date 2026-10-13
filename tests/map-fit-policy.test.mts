import test from "node:test";
import assert from "node:assert/strict";
import { MapFitPolicy } from "../lib/map-fit-policy.ts";

test("lounge toggles and filter resets update markers without requesting a viewport change", () => {
  const policy = new MapFitPolicy();
  const initial = { sequence: 0, fit: true };
  assert.equal(policy.update("loaded", initial, false), true);
  for (const sequence of [1, 2, 3])
    assert.equal(policy.update("loaded", { sequence, fit: false }, false), false);
});

test("facility selections defer fitting and fit only once after the sheet closes", () => {
  const policy = new MapFitPolicy();
  policy.update("loaded", { sequence: 0, fit: true }, false);
  assert.equal(policy.update("loaded", { sequence: 1, fit: true }, true), false);
  const latest = { sequence: 2, fit: true };
  assert.equal(policy.update("loaded", latest, true), false);
  assert.equal(policy.update("loaded", latest, false), true);
  assert.equal(policy.update("loaded", latest, false), false);
});

test("a preserve request cancels a pending facility fit even while the sheet is open", () => {
  const policy = new MapFitPolicy();
  policy.update("loaded", { sequence: 0, fit: true }, false);
  policy.update("loaded", { sequence: 1, fit: true }, true);
  const reset = { sequence: 2, fit: false };
  assert.equal(policy.update("loaded", reset, true), false);
  assert.equal(policy.update("loaded", reset, false), false);
});

test("initial loading and a later explicit data reload fit their new result once", () => {
  const policy = new MapFitPolicy();
  const request = { sequence: 0, fit: false };
  assert.equal(policy.update(undefined, request, false), true);
  assert.equal(policy.update("first-load", request, false), true);
  assert.equal(policy.update("first-load", request, false), false);
  assert.equal(policy.update("reload", request, false), true);
});
