import {hasCoordinates} from "./rest-areas.ts";
import {placeSummary, sortPlacesForList, type MapPlace} from "./map-places.ts";
import {createClusterListCard} from "./cluster-list-card.ts";
import {
  CLUSTER_MIN_LEVEL,
  clusterMinLevel,
  countInBounds,
  groupByCoordinate,
} from "./cluster-policy.ts";
import {
  PIN_WIDTH,
  PIN_HEIGHT,
  PIN_ANCHOR_X,
  PIN_ANCHOR_Y,
  pinKindFor,
  placePinImageUrl,
} from "./place-pin.ts";
import type {
  KakaoMap,
  KakaoMaps,
  KakaoMarker,
  KakaoCluster,
  KakaoMarkerImage,
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
  const stationImage = places.some(place => place.kind === "station")
    ? image("/marker-station.svg")
    : normal;
  const stationActive = places.some(place => place.kind === "station")
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
        minLevel: CLUSTER_MIN_LEVEL,
        minClusterSize: 2,
        averageCenter: true,
        disableClickZoom: true,
        styles: [
          {
            width: `${PIN_WIDTH}px`,
            height: `${PIN_HEIGHT}px`,
            background: "transparent",
            textAlign: "center",
          },
        ],
      })
    : null;
  let currentMinLevel = CLUSTER_MIN_LEVEL;
  /** 지도에 하나의 마커로 그려지는 표시 단위: 단일 장소 또는 같은 좌표의 장소 그룹. */
  type Unit = {
    marker: KakaoMarker;
    places: MapPlace[];
    latitude: number;
    longitude: number;
    click: () => void;
  };
  const units = new Map<string, Unit>();
  const unitOfPlace = new Map<string, Unit>();
  const placeByKey = new Map<string, MapPlace>();
  const placesByMarker = new Map<KakaoMarker, MapPlace[]>();
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
      onPick: place => {
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
    back.addEventListener("click", event => {
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
  if (clusterer) sdk.event.addListener(map, "idle", applyClusterMode);
  const escape = (event: KeyboardEvent) => {
    if (event.key === "Escape" && listOpen) {
      event.preventDefault();
      closeList();
    }
  };
  if (typeof window !== "undefined") window.addEventListener("keydown", escape);
  const placeImage = (place: MapPlace, selected: boolean) =>
    place.kind === "station"
      ? selected
        ? stationActive
        : stationImage
      : isLounge(place)
        ? selected
          ? loungeActive
          : lounge
        : selected
          ? active
          : normal;
  const groupImages = new Map<string, KakaoMarkerImage>();
  const groupImage = (grouped: MapPlace[]) => {
    const summary = placeSummary(grouped);
    const kind = pinKindFor(summary);
    const cacheKey = `${kind}:${grouped.length}`;
    let image = groupImages.get(cacheKey);
    if (!image) {
      image = new sdk.MarkerImage(
        placePinImageUrl(kind, grouped.length),
        new sdk.Size(PIN_WIDTH, PIN_HEIGHT),
        {offset: new sdk.Point(PIN_ANCHOR_X, PIN_ANCHOR_Y)},
      );
      groupImages.set(cacheKey, image);
    }
    return image;
  };
  const unitZ = (grouped: MapPlace[]) => Math.max(...grouped.map(baseZ));
  function groupClick(unit: Unit) {
    const center = new sdk.LatLng(unit.latitude, unit.longitude);
    const bounds = new sdk.LatLngBounds();
    bounds.extend(center);
    onClear?.();
    showList(sortPlacesForList(unit.places), center, bounds);
  }
  const located = places.flatMap(place => {
    const record = place.record;
    return hasCoordinates(record)
      ? [{place, latitude: record.latitude, longitude: record.longitude}]
      : [];
  });
  for (const group of groupByCoordinate(located)) {
    const grouped = group.map(item => item.place);
    const first = grouped[0];
    const {latitude, longitude} = group[0];
    const single = grouped.length === 1;
    const marker = new sdk.Marker({
      ...(clusterer ? {} : {map}),
      position: new sdk.LatLng(latitude, longitude),
      title: single
        ? `${first.record.name}${isLounge(first) ? " · 화물차 라운지" : first.kind === "station" ? " · GS 주유소" : ""}`
        : `이 위치의 장소 ${grouped.length}개`,
      image: single ? placeImage(first, false) : groupImage(grouped),
    });
    marker.setZIndex(unitZ(grouped));
    const unit: Unit = {marker, places: grouped, latitude, longitude, click: () => {}};
    unit.click = single ? () => onSelect(first) : () => groupClick(unit);
    sdk.event.addListener(marker, "click", unit.click);
    units.set(single ? first.key : `group:${first.key}`, unit);
    for (const place of grouped) {
      unitOfPlace.set(place.key, unit);
      placeByKey.set(place.key, place);
    }
    placesByMarker.set(marker, grouped);
  }
  /** 줌 레벨과 화면 안 표시 단위 수에 맞춰 클러스터링 시작 레벨을 조정합니다. */
  function applyClusterMode() {
    if (!clusterer) return;
    const view = map.getBounds();
    const sw = view.getSouthWest(),
      ne = view.getNorthEast();
    const visible = countInBounds([...units.values()], {
      south: sw.getLat(),
      west: sw.getLng(),
      north: ne.getLat(),
      east: ne.getLng(),
    });
    const next = clusterMinLevel(visible);
    if (next === currentMinLevel) return;
    currentMinLevel = next;
    clusterer.setMinLevel(next);
    clusterer.redraw();
  }
  const members = (cluster: KakaoCluster) =>
    cluster.getMarkers().flatMap(marker => placesByMarker.get(marker) ?? []);
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
      const kind = pinKindFor(summary);
      const content = document.createElement("div");
      content.className = "place-cluster-pin";
      content.setAttribute("role", "button");
      content.tabIndex = 0;
      content.setAttribute(
        "aria-label",
        `${summary.total}개 장소: 휴게소 ${summary.rest}, 주유소 ${summary.station}${summary.lounge ? `, 라운지 ${summary.lounge}` : ""}. 목록 보기`,
      );
      content.addEventListener("click", event => {
        event.stopPropagation();
        clusterClick(cluster);
      });
      content.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          clusterClick(cluster);
        }
      });
      const img = document.createElement("img");
      img.src = placePinImageUrl(kind, summary.total);
      img.alt = "";
      img.width = PIN_WIDTH;
      img.height = PIN_HEIGHT;
      content.append(img);
      cluster.getClusterMarker().setContent(content);
    }
  }
  if (clusterer) {
    sdk.event.addListener(clusterer, "clustered", clustered);
    clusterer.addMarkers([...units.values()].map(({marker}) => marker));
    applyClusterMode();
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
      const positioned = places.map(place => place.record).filter(hasCoordinates);
      if (positioned.length === 1) {
        map.setCenter(new sdk.LatLng(positioned[0].latitude, positioned[0].longitude));
        map.setLevel(6);
      } else if (positioned.length > 1) {
        const bounds = new sdk.LatLngBounds();
        positioned.forEach(place => bounds.extend(new sdk.LatLng(place.latitude, place.longitude)));
        map.setBounds(bounds, 65, 45, 65, 45);
      }
    },
    select(key: string | null, showCard = true, move = true) {
      allowAdjustment = move;
      if (key === activeKey && card && showCard) {
        scheduleAdjustment();
        return;
      }
      const previous = activeKey === null ? undefined : unitOfPlace.get(activeKey);
      const selected = key === null ? undefined : unitOfPlace.get(key);
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
      } else if (listItems && !listItems.some(item => item.key === key)) closeList();
      else if (listOpen) closeListOverlay();
      units.forEach(unit => {
        const isSelected = unit === selected;
        if (unit.places.length === 1) unit.marker.setImage(placeImage(unit.places[0], isSelected));
        unit.marker.setZIndex(isSelected ? 4 : unitZ(unit.places));
      });
      const selectedPlace = key === null ? undefined : placeByKey.get(key);
      if (!selectedPlace || !hasCoordinates(selectedPlace.record)) return;
      const point = selectedPlace.record,
        position = new sdk.LatLng(point.latitude, point.longitude);
      if (move) map.panTo(position);
      if (showCard) {
        card = createCard(selectedPlace);
        if (listItems && listItems.some(item => item.key === key)) addBackButton(card);
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
        sdk.event.removeListener(map, "idle", applyClusterMode);
        clusterer.clear();
      }
      units.forEach(({marker, click}) => {
        sdk.event.removeListener(marker, "click", click);
        marker.setMap(null);
      });
      units.clear();
      unitOfPlace.clear();
      placeByKey.clear();
      placesByMarker.clear();
    },
  };
}
