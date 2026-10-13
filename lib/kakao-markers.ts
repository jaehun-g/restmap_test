import { hasCoordinates, type RestArea } from "./rest-areas.ts";
import type { KakaoMap, KakaoMaps, KakaoMarker } from "./kakao-sdk.ts";

export function createRestAreaMarkers(
  sdk: KakaoMaps,
  map: KakaoMap,
  areas: RestArea[],
  onSelect: (id: number) => void,
  createCard: (area: RestArea) => HTMLElement,
  viewport?: () => DOMRect,
) {
  const image = (path: string, active = false) =>
    new sdk.MarkerImage(
      path,
      new sdk.Size(active ? 36 : 32, active ? 42 : 38),
      { offset: new sdk.Point(active ? 18 : 16, active ? 41 : 37) },
    );
  const normal = image("/marker.svg");
  const active = image("/marker-selected.svg", true);
  const lounge = image("/marker-lounge.svg");
  const loungeActive = image("/marker-lounge-selected.svg", true);
  const overlay = new sdk.CustomOverlay({
    content: "",
    clickable: true,
    xAnchor: 0.5,
    yAnchor: 1,
    zIndex: 5,
  });
  const markers = new Map<
    number,
    { marker: KakaoMarker; area: RestArea; click: () => void }
  >();
  let card: HTMLElement | null = null;
  let frame: number | null = null;
  let activeId: number | null = null;
  let allowAdjustment = true;

  function cardMargins(view: DOMRect, cardHeight: number) {
    const spare = Math.max(0, view.height - cardHeight) / 2;
    return {
      top: Math.min(55, view.height / 4, spare),
      bottom: Math.min(28, view.height / 8, spare),
    };
  }

  function constrainCard(view: DOMRect) {
    if (!card || !view.width || !view.height) return;
    card.style.maxWidth = `${Math.max(1, view.width - 32)}px`;
  }

  function keepVisible() {
    if (!card || !viewport || !allowAdjustment) return;
    const view = viewport();
    constrainCard(view);
    const box = card.getBoundingClientRect();
    if (!box.width || !box.height || !view.width || !view.height) return;
    const margins = cardMargins(view, box.height);
    const left = view.left + 16;
    const right = view.right - 16;
    const top = view.top + margins.top;
    const bottom = view.bottom - margins.bottom;
    const dx =
      box.left < left
        ? box.left - left
        : box.right > right
          ? box.right - right
          : 0;
    const dy =
      box.height > bottom - top
        ? box.top - top
        : box.top < top
          ? box.top - top
          : box.bottom > bottom
            ? box.bottom - bottom
            : 0;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) map.panBy(dx, dy);
  }
  sdk.event.addListener(map, "idle", keepVisible);
  for (const area of areas) {
    if (!hasCoordinates(area)) continue;
    const marker = new sdk.Marker({
      map,
      position: new sdk.LatLng(area.latitude, area.longitude),
      title: `${area.name}${area.facilities.has_truck_lounge === true ? " · 화물차 라운지" : ""}`,
      image: area.facilities.has_truck_lounge === true ? lounge : normal,
    });
    marker.setZIndex(area.facilities.has_truck_lounge === true ? 2 : 1);
    const click = () => onSelect(area.id);
    sdk.event.addListener(marker, "click", click);
    markers.set(area.id, { marker, area, click });
  }
  function clearCard() {
    if (frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
    }
    card = null;
    overlay.setMap(null);
    overlay.setContent("");
  }
  function scheduleAdjustment() {
    if (!card || !viewport || !allowAdjustment) return;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = null;
      keepVisible();
    });
  }
  return {
    suspendCardAdjustment() {
      allowAdjustment = false;
      if (frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
      }
    },
    adjustCard() {
      allowAdjustment = true;
      scheduleAdjustment();
    },
    fit() {
      const positioned = areas.filter(hasCoordinates);
      if (positioned.length === 1) {
        map.setCenter(
          new sdk.LatLng(positioned[0].latitude, positioned[0].longitude),
        );
        map.setLevel(6);
      } else if (positioned.length > 1) {
        const bounds = new sdk.LatLngBounds();
        positioned.forEach((area) =>
          bounds.extend(new sdk.LatLng(area.latitude, area.longitude)),
        );
        map.setBounds(bounds, 65, 45, 65, 45);
      }
    },
    select(id: number | null, showCard = true, move = true) {
      allowAdjustment = move;
      if (id === activeId && card && showCard) {
        scheduleAdjustment();
        return;
      }
      activeId = id;
      clearCard();
      markers.forEach(({ marker, area }, markerId) => {
        const isLounge = area.facilities.has_truck_lounge === true;
        marker.setImage(
          markerId === id
            ? isLounge
              ? loungeActive
              : active
            : isLounge
              ? lounge
              : normal,
        );
        marker.setZIndex(markerId === id ? 4 : isLounge ? 2 : 1);
      });
      const selected = id === null ? undefined : markers.get(id);
      if (!selected || !hasCoordinates(selected.area)) return;
      const position = new sdk.LatLng(
        selected.area.latitude,
        selected.area.longitude,
      );
      if (move) map.panTo(position);
      if (showCard) {
        card = createCard(selected.area);
        if (viewport) constrainCard(viewport());
        overlay.setContent(card);
        overlay.setPosition(position);
        overlay.setMap(map);
        scheduleAdjustment();
      }
    },
    dispose() {
      clearCard();
      sdk.event.removeListener(map, "idle", keepVisible);
      markers.forEach(({ marker, click }) => {
        sdk.event.removeListener(marker, "click", click);
        marker.setMap(null);
      });
      markers.clear();
    },
  };
}
