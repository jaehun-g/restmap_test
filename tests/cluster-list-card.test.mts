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

test("actual 더보기 clicks add 5 then the final 2, retain scroll and restore the picked row", t => {
  installCardDOM(t);
  let state: ClusterListState = initialClusterListState();
  let picked = "";
  let layouts = 0;
  const items = places(12);
  const handlers = {
    onPick: (place: ReturnType<typeof restPlace>) => {
      picked = place.key;
    },
    onClose() {},
    onStateChange: (next: ClusterListState) => {
      state = next;
    },
    onLayout: () => {
      layouts++;
    },
  };
  const card = createClusterListCard(items, handlers) as unknown as CardElement;
  const list = card.querySelector(".cluster-popover-list")!;
  const more = card.querySelector(".cluster-list-more")!;
  assert.equal(list.children.length, 5);
  assert.equal(more.textContent, "더보기 (5개)");
  more.dispatch("click");
  assert.equal(list.children.length, 10);
  assert.equal(more.textContent, "더보기 (2개)");
  assert.equal(card.querySelector(".cluster-list-progress")?.textContent, "10 / 12개 표시");
  assert.equal(list.scrollTop, 240);
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
  restored.querySelector(".cluster-list-more")!.dispatch("click");
  assert.equal(restoredList.children.length, 12);
  assert.equal(restored.querySelector(".cluster-list-more"), null);
  assert.equal(state.shownCount, 12);
  assert.equal(layouts, 2);
});

test("small lists, last single item and new-cluster state preserve boundaries and labels", t => {
  installCardDOM(t);
  for (const count of [1, 5, 6]) {
    let closed = false;
    const card = createClusterListCard(places(count), {
      onPick() {},
      onClose() {
        closed = true;
      },
    }) as unknown as CardElement;
    const list = card.querySelector(".cluster-popover-list")!;
    assert.equal(list.children.length, Math.min(5, count));
    assert.equal(card.querySelector("strong")?.textContent, `주변 장소 ${count}개`);
    assert.equal(
      card.querySelector(".cluster-composition")?.textContent,
      `휴게소 ${count} · 주유소 0`,
    );
    if (count === 6) {
      assert.equal(card.querySelector(".cluster-list-more")?.textContent, "더보기 (1개)");
      card.querySelector(".cluster-list-more")!.dispatch("click");
      assert.equal(list.children.length, 6);
      assert.equal(card.querySelector(".cluster-list-more"), null);
    } else assert.equal(card.querySelector(".cluster-list-more"), null);
    card.querySelector(".map-card-close")!.dispatch("click");
    assert.equal(closed, true);
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
