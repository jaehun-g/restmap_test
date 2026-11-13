import test from "node:test";
import assert from "node:assert/strict";
import {
  cardDisplayArea,
  cardCenterPanOffset,
  cardPanOffset,
  cardSizeLimit,
  mapCardOverlayArea,
  visibleChromeEdge,
} from "../lib/map-card-layout.ts";

const rect = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

test("mobile card area excludes changing headers, sheets and keyboard viewport", () => {
  for (const width of [320, 375, 430]) {
    const canvas = rect(0, 0, width, 800);
    const area = cardDisplayArea(canvas, 160, 710);
    assert.deepEqual(area, rect(0, 168, width, 532));
    assert.deepEqual(cardDisplayArea(canvas, 200, 450), rect(0, 208, width, 232));
    const keyboard = cardDisplayArea(canvas, 160, 710, rect(0, 0, width, 340));
    assert.equal(keyboard.bottom, 340);
    assert.equal(cardSizeLimit(keyboard, 150).hidden, true);
    assert.equal(cardSizeLimit(area, 150).hidden, false);
  }
});

test("card size fits landscape and offset visual viewport with no negative dimensions", () => {
  const area = cardDisplayArea(rect(30, 20, 700, 360), 100, 350, rect(50, 40, 600, 280));
  assert.deepEqual(area, rect(50, 108, 600, 212));
  assert.deepEqual(cardSizeLimit(area, 100), {width: 280, height: 196, hidden: false});
  assert.equal(cardSizeLimit(rect(0, 0, 250, 300), 100).width, 218);
  const closed = cardDisplayArea(rect(0, 0, 320, 300), 240, 180);
  assert.equal(closed.height, 0);
  assert.equal(cardSizeLimit(closed, 100).hidden, true);
});

test("only overflowing card edges request minimal camera translation", () => {
  const area = rect(0, 160, 375, 400);
  assert.deepEqual(cardPanOffset(rect(20, 180, 280, 240), area), {x: 0, y: 0});
  assert.deepEqual(cardPanOffset(rect(-10, 100, 280, 240), area), {x: -26, y: -68});
  assert.deepEqual(cardPanOffset(rect(110, 350, 280, 230), area), {x: 31, y: 28});
});

test("newly opened card centers within the unobstructed map area", () => {
  assert.deepEqual(cardCenterPanOffset(rect(30, 150, 280, 220), rect(0, 100, 400, 500)), {x: -30, y: -90});
});

test("administrator card viewport excludes map notices and bottom legend, retaining scrollable space", () => {
  const canvas = rect(900, 300, 420, 360);
  const area = mapCardOverlayArea(canvas, rect(916, 316, 388, 40), rect(912, 604, 340, 20));
  assert.deepEqual(area, rect(900, 364, 420, 232));
  assert.equal(cardSizeLimit(area, 100).hidden, false);
  assert.equal(cardSizeLimit(area, 100).height, 216);
  assert.deepEqual(mapCardOverlayArea(canvas), canvas);
  assert.equal(
    mapCardOverlayArea(canvas, rect(900, 300, 420, 360), rect(900, 600, 100, 20)).height,
    0,
  );
});

test("directions mode ignores hidden header and sheet rects so marker cards stay visible", () => {
  const canvas = rect(0, 0, 390, 844);
  const headerBottom = visibleChromeEdge(
    [
      {hidden: true, rect: rect(0, 0, 0, 0)},
      {hidden: false, rect: rect(10, 10, 370, 118)},
    ],
    "bottom",
    canvas.top,
  );
  const sheetTop = visibleChromeEdge(
    [
      {hidden: true, rect: rect(0, 0, 0, 0)},
      {hidden: false, rect: rect(0, 660, 390, 184)},
    ],
    "top",
    canvas.bottom,
  );
  const area = cardDisplayArea(canvas, headerBottom, sheetTop);
  assert.deepEqual(area, rect(0, 136, 390, 514));
  assert.equal(cardSizeLimit(area, 120).hidden, false);

  // When directions dock is not open yet, bottom falls back to canvas bottom
  const openBottom = visibleChromeEdge(
    [{hidden: true, rect: rect(0, 0, 0, 0)}, null],
    "top",
    canvas.bottom,
  );
  assert.equal(openBottom, 844);
});
