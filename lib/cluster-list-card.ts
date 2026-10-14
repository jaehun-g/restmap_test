import type { MapPlace } from "./map-places.ts";

const kindLabel = (place: MapPlace) =>
  place.kind === "station"
    ? "GS 주유소"
    : place.record.facilities.has_truck_lounge === true
      ? "화물차 라운지"
      : "휴게소";

/** 클러스터 클릭 시 말풍선으로 띄우는 장소 목록 카드를 만듭니다. */
export function createClusterListCard(
  places: MapPlace[],
  handlers: { onPick: (place: MapPlace) => void; onClose: () => void; onZoom?: () => void },
): HTMLElement {
  const card = document.createElement("section");
  card.className = "map-info-card cluster-popover";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", `겹친 위치의 장소 ${places.length}개`);
  const heading = document.createElement("div");
  heading.className = "map-card-heading";
  const title = document.createElement("strong");
  title.textContent = `이 위치의 장소 ${places.length}개`;
  const close = document.createElement("button");
  close.type = "button";
  close.className = "map-card-close";
  close.textContent = "×";
  close.setAttribute("aria-label", "장소 목록 닫기");
  close.addEventListener("click", (event) => {
    event.stopPropagation();
    handlers.onClose();
  });
  heading.append(title, close);
  const list = document.createElement("ul");
  list.className = "cluster-popover-list";
  for (const place of places) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    const name = document.createElement("span");
    name.textContent = place.record.name;
    const kind = document.createElement("small");
    kind.textContent = kindLabel(place);
    button.append(name, kind);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      handlers.onPick(place);
    });
    item.append(button);
    list.append(item);
  }
  card.append(heading, list);
  if (handlers.onZoom) {
    const zoom = document.createElement("button");
    zoom.type = "button";
    zoom.className = "map-card-details";
    zoom.textContent = "이 영역 확대 →";
    zoom.addEventListener("click", (event) => {
      event.stopPropagation();
      handlers.onZoom?.();
    });
    card.append(zoom);
  }
  return card;
}
