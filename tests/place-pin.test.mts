import test from "node:test";
import assert from "node:assert/strict";
import { countLabel, pinKindFor, placePinImageUrl } from "../lib/place-pin.ts";

test("pinKindFor selects mixed when both rest and station exist", () => {
  assert.equal(pinKindFor({ rest: 2, station: 3, lounge: 0 }), "mixed");
  assert.equal(pinKindFor({ rest: 1, station: 1, lounge: 1 }), "mixed");
});

test("pinKindFor selects station when only stations exist", () => {
  assert.equal(pinKindFor({ rest: 0, station: 5, lounge: 0 }), "station");
});

test("pinKindFor distinguishes lounge and general rest area when only rest areas exist", () => {
  assert.equal(pinKindFor({ rest: 3, station: 0, lounge: 1 }), "lounge");
  assert.equal(pinKindFor({ rest: 3, station: 0, lounge: 0 }), "rest");
});

test("countLabel formats rest count correctly as +N", () => {
  assert.equal(countLabel(1), "");
  assert.equal(countLabel(2), "+1");
  assert.equal(countLabel(13), "+12");
  assert.equal(countLabel(100), "+99");
  assert.equal(countLabel(150), "99+");
});

test("placePinImageUrl returns a valid data URI containing SVG elements and badge", () => {
  const url = placePinImageUrl("mixed", 13);
  const decoded = decodeURIComponent(url);
  assert.match(url, /^data:image\/svg\+xml/);
  assert.match(decoded, /\+12/);
  assert.match(decoded, /url\(#splitPin\)/); // mixed pin split gradient
});

test("placePinImageUrl has no badge when total is 1", () => {
  const url = placePinImageUrl("station", 1);
  const decoded = decodeURIComponent(url);
  assert.doesNotMatch(decoded, /<rect/);
  assert.doesNotMatch(decoded, />\+/);
});
