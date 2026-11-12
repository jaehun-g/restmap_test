import test from "node:test";
import assert from "node:assert/strict";
import {
  clusterListPreviewSize,
  visibleClusterListPlaces,
  createClusterListCard,
  restoreClusterListCard,
  initialClusterListState,
  type ClusterListState,
} from "../lib/cluster-list-card.ts";
import {restPlace} from "../lib/map-places.ts";
import {normalizeRestAreas} from "../lib/rest-areas.ts";
import {CardElement, installCardDOM} from "./helpers/card-dom.mts";

function places(count: number) {
  const result = normalizeRestAreas(
    Array.from({length: count}, (_, i) => ({
      id: i + 1,
      name: `아주 긴 이름의 휴게소 ${i + 1}`,
      route_name: "경부선",
      latitude: "37",
      longitude: "127",
      has_truck_lounge: i === 0 ? 1 : 0,
    })),
  );
  if (!result.ok) assert.fail(result.error.message);
  return result.value.map(restPlace);
}

test("scrolling loads five more and restores the selected row", t => {
  installCardDOM(t);
  let state: ClusterListState = initialClusterListState();
  let picked = "";
  const handlers = {onPick: (place: ReturnType<typeof restPlace>) => { picked = place.key; }, onClose() {}, onStateChange: (next: ClusterListState) => { state = next; }};
  const items = places(12);
  const card = createClusterListCard(items, handlers) as unknown as CardElement;
  const list = card.querySelector(".cluster-popover-list")!;
  assert.equal(list.children.length, 5);
  assert.equal(card.querySelector(".cluster-list-more"), null);
  list.scrollTop = 40;
  list.dispatch("scroll");
  assert.equal(list.children.length, 10);
  list.scrollTop = 144;
  list.dispatch("scroll");
  list.children[7].children[0].dispatch("click");
  assert.equal(picked, "rest:8");
  const restored = createClusterListCard(items, handlers, state) as unknown as CardElement;
  restoreClusterListCard(restored as unknown as HTMLElement, state);
  const restoredList = restored.querySelector(".cluster-popover-list")!;
  assert.equal(restoredList.children.length, 10);
  assert.equal(restoredList.scrollTop, 144);
  assert.equal(restoredList.children[7].children[0].focused, true);
  restoredList.scrollTop = 280;
  restoredList.dispatch("scroll");
  assert.equal(restoredList.children.length, 12);
  assert.equal(state.shownCount, 12);
});

test("small lists and a final single item respect boundaries", t => {
  installCardDOM(t);
  for (const count of [1, 5, 6]) {
    const card = createClusterListCard(places(count), {onPick() {}, onClose() {}}) as unknown as CardElement;
    const list = card.querySelector(".cluster-popover-list")!;
    assert.equal(list.children.length, Math.min(5, count));
    if (count === 6) {
      list.scrollTop = 40;
      list.dispatch("scroll");
      assert.equal(list.children.length, 6);
    }
  }
});

test("cluster list reveals the original ordered places five at a time after 더보기", () => {
  const result = normalizeRestAreas(
    Array.from({length: 12}, (_, index) => ({
      id: index + 1,
      name: `휴게소 ${index + 1}`,
      latitude: "37",
      longitude: `${127 + index / 100}`,
      has_truck_lounge: 0,
    })),
  );
  if (!result.ok) assert.fail(result.error.message);
  const places = result.value.map(restPlace);

  assert.equal(clusterListPreviewSize, 5);
  assert.deepEqual(
    visibleClusterListPlaces(places).map(place => place.key),
    places.slice(0, 5).map(place => place.key),
  );
  assert.deepEqual(
    visibleClusterListPlaces(places, 10).map(place => place.key),
    places.slice(0, 10).map(place => place.key),
  );
  assert.deepEqual(visibleClusterListPlaces(places, 15), places);
});
