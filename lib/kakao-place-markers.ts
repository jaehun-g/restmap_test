import { hasCoordinates } from "./rest-areas.ts";
import { placeSummary, sortPlacesForList, type MapPlace } from "./map-places.ts";
import { createClusterListCard } from "./cluster-list-card.ts";
import type {
  KakaoMap,
  KakaoMaps,
  KakaoMarker,
  KakaoCluster,
  KakaoBounds,
  KakaoLatLng,
} from "./kakao-sdk.ts";

export function createPlaceMarkers(
  sdk: KakaoMaps,
  map: KakaoMap,
  places: MapPlace[],
  onSelect: (place: MapPlace) => void,
  createCard: (place: MapPlace) => HTMLElement,
  viewport?: () => DOMRect,
  onClear?: () => void,
) {
  const image = (path: string, active = false) =>
    new sdk.MarkerImage(path, new sdk.Size(active ? 36 : 32, active ? 42 : 38), {
      offset: new sdk.Point(active ? 18 : 16, active ? 41 : 37),
    });
  const normal = image("/marker.svg"),
    active = image("/marker-selected.svg", true);
  const lounge = image("/marker-lounge.svg"),
    loungeActive = image("/marker-lounge-selected.svg", true);
  const stationImage = places.some((place) => place.kind === "station")
    ? image("/marker-station.svg")
    : normal;
  const stationActive = places.some((place) => place.kind === "station")
    ? image("/marker-station-selected.svg", true)
    : active;
  const overlay = new sdk.CustomOverlay({
    content: "",
    clickable: true,
    xAnchor: 0.5,
    yAnchor: 1,
    zIndex: 5,
  });
  const listOverlay = new sdk.CustomOverlay({
    content: "",
    clickable: true,
    xAnchor: 0.5,
    yAnchor: 1,
    zIndex: 6,
  });
  let listItems: MapPlace[] | null = null,
    listCenter: KakaoLatLng | null = null,
    listBounds: KakaoBounds | null = null,
    listOpen = false;
  const clusterer = sdk.MarkerClusterer
    ? new sdk.MarkerClusterer({
        map,
        gridSize: 88,
        minLevel: 1,
        minClusterSize: 2,
        averageCenter: true,
        disableClickZoom: true,
        styles: [{ width: "76px", height: "58px", background: "transparent", textAlign: "center" }],
      })
    : null;
  const markers = new Map<string, { marker: KakaoMarker; place: MapPlace; click: () => void }>();
  const placeByMarker = new Map<KakaoMarker, MapPlace>();
  let card: HTMLElement | null = null,
    frame: number | null = null,
    activeKey: string | null = null;
  let allowAdjustment = true;
  const isLounge = (place: MapPlace) =>
    place.kind === "rest" && place.record.facilities.has_truck_lounge === true;
  const baseZ = (place: MapPlace) => (isLounge(place) ? 3 : place.kind === "rest" ? 2 : 1);
  function closeListOverlay() {
    listOverlay.setMap(null);
    listOverlay.setContent("");
    listOpen = false;
  }
  function closeList() {
    closeListOverlay();
    listItems = null;
    listCenter = null;
    listBounds = null;
  }
  function canZoom(bounds: KakaoBounds) {
    const sw = bounds.getSouthWest(),
      ne = bounds.getNorthEast();
    return (
      map.getLevel() > 1 &&
      (Math.abs(ne.getLat() - sw.getLat()) >= 1e-8 || Math.abs(ne.getLng() - sw.getLng()) >= 1e-8)
    );
  }
  function showList(items: MapPlace[], center: KakaoLatLng, bounds: KakaoBounds) {
    closeListOverlay();
    listItems = items;
    listCenter = center;
    listBounds = bounds;
    listOpen = true;
    const content = createClusterListCard(items, {
      onPick: (place) => {
        closeListOverlay();
        onSelect(place);
      },
      onClose: closeList,
      onZoom: canZoom(bounds)
        ? () => {
            closeList();
            const level = map.getLevel();
            map.setBounds(bounds, 65, 45, 65, 45);
            if (map.getLevel() >= level) map.setLevel(Math.max(1, level - 1));
          }
        : undefined,
    });
    listOverlay.setContent(content);
    listOverlay.setPosition(center);
    listOverlay.setMap(map);
    requestAnimationFrame(() => content.querySelector<HTMLButtonElement>("ul button")?.focus());
  }
  function addBackButton(target: HTMLElement) {
    const back = document.createElement("button");
    back.type = "button";
    back.className = "map-card-details cluster-back";
    back.textContent = "← 목록으로";
    back.addEventListener("click", (event) => {
      event.stopPropagation();
      if (listItems && listCenter && listBounds) {
        const items = listItems,
          center = listCenter,
          bounds = listBounds;
        onClear?.();
        showList(items, center, bounds);
      }
    });
    target.append(back);
  }
  function constrainCard(view: DOMRect) {
    if (card && view.width && view.height)
      card.style.maxWidth = `${Math.max(1, view.width - 32)}px`;
  }
  function keepVisible() {
    if (!card || !viewport || !allowAdjustment) return;
    const view = viewport();
    constrainCard(view);
    const box = card.getBoundingClientRect();
    if (!box.width || !box.height || !view.width || !view.height) return;
    const spare = Math.max(0, view.height - box.height) / 2;
    const left = view.left + 16,
      right = view.right - 16;
    const top = view.top + Math.min(55, view.height / 4, spare),
      bottom = view.bottom - Math.min(28, view.height / 8, spare);
    const dx = box.left < left ? box.left - left : box.right > right ? box.right - right : 0;
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
  sdk.event.addListener(map, "idle", keepVisible);
  sdk.event.addListener(map, "click", closeList);
  sdk.event.addListener(map, "dragstart", closeList);
  const escape = (event: KeyboardEvent) => {
    if (event.key === "Escape" && listOpen) {
      event.preventDefault();
      closeList();
    }
  };
  if (typeof window !== "undefined") window.addEventListener("keydown", escape);
  for (const place of places) {
    const record = place.record;
    if (!hasCoordinates(record)) continue;
    const marker = new sdk.Marker({
      ...(clusterer ? {} : { map }),
      position: new sdk.LatLng(record.latitude, record.longitude),
      title: `${record.name}${isLounge(place) ? " · 화물차 라운지" : place.kind === "station" ? " · GS 주유소" : ""}`,
      image: place.kind === "station" ? stationImage : isLounge(place) ? lounge : normal,
    });
    marker.setZIndex(baseZ(place));
    const click = () => onSelect(place);
    sdk.event.addListener(marker, "click", click);
    markers.set(place.key, { marker, place, click });
    placeByMarker.set(marker, place);
  }
  const members = (cluster: KakaoCluster) =>
    cluster.getMarkers().flatMap((marker) => {
      const place = placeByMarker.get(marker);
      return place ? [place] : [];
    });
  function clusterClick(cluster: KakaoCluster) {
    const items = sortPlacesForList(members(cluster)),
      bounds = cluster.getBounds();
    if (!items.length) return;
    const sw = bounds.getSouthWest(),
      ne = bounds.getNorthEast();
    onClear?.();
    showList(
      items,
      new sdk.LatLng((sw.getLat() + ne.getLat()) / 2, (sw.getLng() + ne.getLng()) / 2),
      bounds,
    );
  }
  function clustered(clusters: KakaoCluster[]) {
    for (const cluster of clusters) {
      const summary = placeSummary(members(cluster));
      if (summary.total < 2) continue;
      const content = document.createElement("span");
      content.className = `place-cluster${summary.lounge ? " has-lounge" : ""}`;
      content.setAttribute("role", "button");
      content.tabIndex = 0;
      content.setAttribute(
        "aria-label",
        `${summary.total}개 장소: 휴게소 ${summary.rest}, 주유소 ${summary.station}${summary.lounge ? `, 라운지 ${summary.lounge}` : ""}. 목록 보기`,
      );
      content.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          clusterClick(cluster);
        }
      });
      const total = document.createElement("strong");
      total.textContent = String(summary.total);
      const counts = document.createElement("small");
      counts.textContent = `휴 ${summary.rest} · 주 ${summary.station}`;
      content.append(total, counts);
      if (summary.lounge) {
        const badge = document.createElement("em");
        badge.textContent = `라운지 ${summary.lounge}`;
        content.append(badge);
      }
      cluster.getClusterMarker().setContent(content);
    }
  }
  if (clusterer) {
    sdk.event.addListener(clusterer, "clustered", clustered);
    sdk.event.addListener(clusterer, "clusterclick", clusterClick);
    clusterer.addMarkers([...markers.values()].map(({ marker }) => marker));
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
      const positioned = places.map((place) => place.record).filter(hasCoordinates);
      if (positioned.length === 1) {
        map.setCenter(new sdk.LatLng(positioned[0].latitude, positioned[0].longitude));
        map.setLevel(6);
      } else if (positioned.length > 1) {
        const bounds = new sdk.LatLngBounds();
        positioned.forEach((place) =>
          bounds.extend(new sdk.LatLng(place.latitude, place.longitude)),
        );
        map.setBounds(bounds, 65, 45, 65, 45);
      }
    },
    select(key: string | null, showCard = true, move = true) {
      allowAdjustment = move;
      if (key === activeKey && card && showCard) {
        scheduleAdjustment();
        return;
      }
      const previous = activeKey === null ? undefined : markers.get(activeKey);
      const selected = key === null ? undefined : markers.get(key);
      if (clusterer && key !== activeKey) {
        if (previous) {
          previous.marker.setMap(null);
          clusterer.addMarker(previous.marker, true);
        }
        if (selected) {
          clusterer.removeMarker(selected.marker, true);
          selected.marker.setMap(map);
        }
        clusterer.redraw();
      }
      activeKey = key;
      clearCard();
      if (key === null) {
        if (!listOpen) closeList();
      } else if (listItems && !listItems.some((item) => item.key === key)) closeList();
      else if (listOpen) closeListOverlay();
      markers.forEach(({ marker, place }, markerKey) => {
        marker.setImage(
          place.kind === "station"
            ? markerKey === key
              ? stationActive
              : stationImage
            : isLounge(place)
              ? markerKey === key
                ? loungeActive
                : lounge
              : markerKey === key
                ? active
                : normal,
        );
        marker.setZIndex(markerKey === key ? 4 : baseZ(place));
      });
      if (!selected || !hasCoordinates(selected.place.record)) return;
      const point = selected.place.record,
        position = new sdk.LatLng(point.latitude, point.longitude);
      if (move) map.panTo(position);
      if (showCard) {
        card = createCard(selected.place);
        if (listItems && listItems.some((item) => item.key === key)) addBackButton(card);
        if (viewport) constrainCard(viewport());
        overlay.setContent(card);
        overlay.setPosition(position);
        overlay.setMap(map);
        scheduleAdjustment();
      }
    },
    dispose() {
      clearCard();
      closeList();
      sdk.event.removeListener(map, "idle", keepVisible);
      sdk.event.removeListener(map, "click", closeList);
      sdk.event.removeListener(map, "dragstart", closeList);
      if (typeof window !== "undefined") window.removeEventListener("keydown", escape);
      if (clusterer) {
        sdk.event.removeListener(clusterer, "clustered", clustered);
        sdk.event.removeListener(clusterer, "clusterclick", clusterClick);
        clusterer.clear();
      }
      markers.forEach(({ marker, click }) => {
        sdk.event.removeListener(marker, "click", click);
        marker.setMap(null);
      });
      markers.clear();
      placeByMarker.clear();
    },
  };
}
