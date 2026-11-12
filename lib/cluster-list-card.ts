import type {MapPlace} from "./map-places.ts";
import {routeDescription} from "./rest-areas.ts";
import {setMapCardIcon} from "./map-card-icon.ts";
import {stationLabel} from "./gas-stations.ts";

export const clusterListPreviewSize = 5;
export type ClusterListState = {shownCount: number; scrollTop: number; selectedKey: string | null};
export const initialClusterListState = (): ClusterListState => ({
  shownCount: 5,
  scrollTop: 0,
  selectedKey: null,
});

export function visibleClusterListPlaces(places: MapPlace[], count = clusterListPreviewSize) {
  return places.slice(0, count);
}

const kindLabel = (place: MapPlace) =>
  place.kind === "station"
    ? stationLabel(place.record)
    : place.record.facilities.has_truck_lounge === true
      ? "화물차 라운지"
      : "휴게소";

/** 클러스터 클릭 시 말풍선으로 띄우는 장소 목록 카드를 만듭니다. */
export function createClusterListCard(
  places: MapPlace[],
  handlers: {
    onPick: (place: MapPlace) => void;
    onClose: () => void;
    onZoom?: () => void;
    onStateChange?: (state: ClusterListState) => void;
    onLayout?: () => void;
  },
  saved: ClusterListState = initialClusterListState(),
): HTMLElement {
  const card = document.createElement("section");
  card.className = "map-info-card cluster-popover";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", "장소 목록");
  const heading = document.createElement("div");
  heading.className = "map-card-heading";
  const title = document.createElement("strong");
  title.textContent = "장소 목록";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "map-card-close";
  setMapCardIcon(close, "close");
  close.setAttribute("aria-label", "장소 목록 닫기");
  close.addEventListener("click", event => {
    event.stopPropagation();
    handlers.onClose();
  });
  heading.append(title, close);
  const list = document.createElement("ul");
  list.className = "cluster-popover-list";
  let state = {...saved, shownCount: Math.min(places.length, Math.max(5, saved.shownCount))};
  const updateState = (next: Partial<ClusterListState>) => {
    state = {...state, ...next};
    handlers.onStateChange?.({...state});
  };
  list.addEventListener("scroll", () => {
    updateState({scrollTop: list.scrollTop});
    if (state.shownCount >= places.length || list.scrollHeight - list.scrollTop - list.clientHeight > 24) return;
    const previousCount = state.shownCount;
    updateState({shownCount: Math.min(places.length, previousCount + clusterListPreviewSize)});
    visibleClusterListPlaces(places, state.shownCount).slice(previousCount).forEach(appendPlace);
    handlers.onLayout?.();
  });
  const appendPlace = (place: MapPlace) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("data-place-key", place.key);
    const name = document.createElement("span");
    name.textContent = place.record.name;
    if (place.kind === "rest" && place.record.operationStatus === "suspended") name.textContent += " · 일시 운영중지";
    if (place.kind === "rest" && place.record.operationStatus === "review") name.textContent += " · 운영 확인 필요";
    const kind = document.createElement("small");
    const extra =
      place.kind === "rest"
        ? routeDescription(place.record, "mobile")
        : place.record.services.cargo
          ? "화물 특화"
          : null;
    kind.textContent = [kindLabel(place), extra].filter(Boolean).join(" · ");
    button.append(name, kind);
    button.addEventListener("click", event => {
      event.stopPropagation();
      updateState({selectedKey: place.key, scrollTop: list.scrollTop});
      handlers.onPick(place);
    });
    item.append(button);
    list.append(item);
  };
  for (const place of visibleClusterListPlaces(places, state.shownCount)) {
    appendPlace(place);
  }
  if (places.length > clusterListPreviewSize) {
    list.classList.add("is-scrollable");
    list.tabIndex = 0;
  }
  card.append(heading, list);
  if (handlers.onZoom) {
    const zoom = document.createElement("button");
    zoom.type = "button";
    zoom.className = "map-card-details map-card-secondary";
    zoom.textContent = "이 영역 확대 →";
    zoom.addEventListener("click", event => {
      event.stopPropagation();
      handlers.onZoom?.();
    });
    card.append(zoom);
  }
  return card;
}

export function restoreClusterListCard(card: HTMLElement, state: ClusterListState) {
  const list = card.querySelector<HTMLElement>(".cluster-popover-list");
  if (!list) return;
  list.scrollTop = state.scrollTop;
  const buttons = [...list.querySelectorAll<HTMLButtonElement>("button")];
  const selected = buttons.find(
    button => button.getAttribute("data-place-key") === state.selectedKey,
  );
  (selected ?? buttons[0])?.focus({preventScroll: true});
}
