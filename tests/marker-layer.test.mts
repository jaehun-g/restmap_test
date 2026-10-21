import test from "node:test";
import assert from "node:assert/strict";
import {markerLayerSignature} from "../lib/marker-layer.ts";
import type {MapPlace} from "../lib/map-places.ts";

const place = (name = "휴게소") =>
  ({
    kind: "rest",
    key: "rest:1",
    record: {name, latitude: 37, longitude: 127, facilities: {has_truck_lounge: false}},
  }) as unknown as MapPlace;

test("equivalent place arrays keep the same marker-layer signature", () => {
  assert.equal(markerLayerSignature([place()]), markerLayerSignature([place()]));
  assert.notEqual(markerLayerSignature([place()]), markerLayerSignature([place("다른 휴게소")]));
});
