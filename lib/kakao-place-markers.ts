import {hasCoordinates} from "./rest-areas.ts";
import {stationLabel} from "./gas-stations.ts";
import {placeSummary, sortPlacesForList, type MapPlace} from "./map-places.ts";
import {
  createClusterListCard,
  initialClusterListState,
  restoreClusterListCard,
  type ClusterListState,
} from "./cluster-list-card.ts";
import {cardPanOffset, cardSizeLimit} from "./map-card-layout.ts";
import {setMapCardIcon} from "./map-card-icon.ts";
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
  /** 카드가 마커 아래("below", 기본) 또는 위("above")에 표시되는 방향. */
  placement: "above" | "below" = "below",
) {
  const above = placement === "above";
  const placeCard = (target: HTMLElement) => {
    if (above) target.classList.add("placement-above");
  };
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
  const exImage = places.some(place => place.kind === "station" && place.record.brand === "EX")
    ? image("/marker-ex-station.svg")
    : stationImage;
  const exActive = places.some(place => place.kind === "station" && place.record.brand === "EX")
    ? image("/marker-ex-station-selected.svg", true)
    : stationActive;
  const overlay = new sdk.CustomOverlay({
    content: "",
    clickable: true,
    xAnchor: 0.5,
    yAnchor: above ? 1 : 0,
    zIndex: 5,
  });
  const listOverlay = new sdk.CustomOverlay({
    content: "",
    clickable: true,
    xAnchor: 0.5,
    yAnchor: above ? 1 : 0,
    zIndex: 6,
  });
  let listItems: MapPlace[] | null = null,
    listCenter: KakaoLatLng | null = null,
    listBounds: KakaoBounds | null = null,
    listOpen = false;
  let listCard: HTMLElement | null = null;
  let listState: ClusterListState = initialClusterListState();
  let focusFrame: number | null = null;
  let disposed = false;
  const resizeObserver =
    typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => scheduleAdjustment());
  const clusterer = sdk.MarkerClusterer
    ? new sdk.MarkerClusterer({
        map,
        gridSize: 88,
        minLevel: CLUSTER_MIN_LEVEL,
        minClusterSize: 2,
        averageCenter: true,
        disableClickZoom: true,
        clickable: true,
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
  // Kakao Maps can emit its map click immediately after a marker/overlay click.
  // Keep that follow-up event from dismissing the card that was just opened.
  let suppressMapClickUntil = 0;
  function suppressFollowUpMapClick() {
    suppressMapClickUntil = Date.now() + 250;
    sdk.event.preventMap?.();
  }
  const isLounge = (place: MapPlace) =>
    place.kind === "rest" && place.record.facilities.has_truck_lounge === true;
  const baseZ = (place: MapPlace) => (isLounge(place) ? 3 : place.kind === "rest" ? 2 : 1);
  function protectMapInteraction(content: HTMLElement) {
    for (const name of ["mousedown", "touchstart", "click"])
      content.addEventListener?.(name, suppressFollowUpMapClick, {capture: true});
  }
  function closeListOverlay() {
    if (focusFrame !== null) cancelAnimationFrame(focusFrame);
    focusFrame = null;
    if (listCard) resizeObserver?.unobserve(listCard);
    listCard = null;
    listOverlay.setMap(null);
    listOverlay.setContent("");
    listOpen = false;
  }
  function closeList() {
    closeListOverlay();
    listItems = null;
    listCenter = null;
    listBounds = null;
    listState = initialClusterListState();
  }
  function closeCardFromMap() {
    if (!card) return;
    clearCard();
    onClear?.();
  }
  function handleMapClick() {
    if (Date.now() <= suppressMapClickUntil) return;
    closeList();
    closeCardFromMap();
  }
  /** 목록에서 장소를 고르면 그 장소를 중심으로 개별 마커 레벨까지 확대합니다. 이미 더 확대돼 있으면 유지합니다. */
  function zoomToPlace(place: MapPlace) {
    if (!hasCoordinates(place.record)) return;
    const target = CLUSTER_MIN_LEVEL - 1;
    if (map.getLevel() <= target) return;
    map.setCenter(new sdk.LatLng(place.record.latitude, place.record.longitude));
    map.setLevel(target);
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
    const restore = items === listItems;
    closeListOverlay();
    if (!restore) listState = initialClusterListState();
    listItems = items;
    listCenter = center;
    listBounds = bounds;
    listOpen = true;
    allowAdjustment = true;
    const content = createClusterListCard(
      items,
      {
        onPick: place => {
          zoomToPlace(place);
          select(place.key, true, true);
          onSelect(place);
        },
        onClose: closeList,
        onStateChange: state => {
          if (listCard === content) listState = state;
        },
        onLayout: () => {
          allowAdjustment = true;
          scheduleAdjustment();
        },
        onZoom: canZoom(bounds)
          ? () => {
              closeList();
              const level = map.getLevel();
              map.setBounds(bounds, 65, 45, 65, 45);
              if (map.getLevel() >= level) map.setLevel(Math.max(1, level - 1));
            }
          : undefined,
      },
      listState,
    );
    listCard = content;
    placeCard(content);
    protectMapInteraction(content);
    listOverlay.setContent(content);
    listOverlay.setPosition(center);
    listOverlay.setMap(map);
    resizeObserver?.observe(content);
    scheduleAdjustment();
    focusFrame = requestAnimationFrame(() => {
      focusFrame = null;
      if (!disposed && listCard === content) restoreClusterListCard(content, listState);
    });
  }
  function addBackButton(target: HTMLElement) {
    const back = document.createElement("button");
    back.type = "button";
    back.className = "map-card-back cluster-back";
    setMapCardIcon(back, "back");
    back.setAttribute("aria-label", "목록으로 돌아가기");
    back.addEventListener("click", event => {
      event.stopPropagation();
      if (listItems && listCenter && listBounds) {
        const items = listItems,
          center = listCenter,
          bounds = listBounds;
        clearCard();
        showList(items, center, bounds);
        onClear?.();
      }
    });
    const heading = target.querySelector(".map-card-heading");
    heading?.insertBefore(back, heading.firstChild);
  }
  function constrainCard(view: DOMRect, target = listCard ?? card) {
    if (!target) return;
    const fixed = [...(target.children ?? [])].filter(
      child =>
        !child.classList.contains("map-card-body") &&
        !child.classList.contains("cluster-popover-list"),
    );
    const fixedHeight =
      14 +
      fixed.reduce((height, child) => {
        const style = typeof getComputedStyle === "undefined" ? null : getComputedStyle(child);
        return (
          height +
          child.getBoundingClientRect().height +
          (parseFloat(style?.marginTop ?? "0") || 0) +
          (parseFloat(style?.marginBottom ?? "0") || 0)
        );
      }, 0);
    const limit = cardSizeLimit(view, fixedHeight);
    target.style.maxWidth = `${limit.width}px`;
    target.style.maxHeight = `${limit.height}px`;
    target.style.visibility = limit.hidden ? "hidden" : "";
    target.style.pointerEvents = limit.hidden ? "none" : "";
  }
  function keepVisible() {
    const target = listCard ?? card;
    if (!target || !viewport || disposed) return;
    const view = viewport();
    constrainCard(view, target);
    if (!allowAdjustment || target.style.visibility === "hidden") return;
    const box = target.getBoundingClientRect();
    if (!box.width || !box.height || !view.width || !view.height) return;
    const {x, y} = cardPanOffset(box, view);
    if (Math.abs(x) > 1 || Math.abs(y) > 1) map.panBy(x, y);
  }
  function clearCard() {
    if (frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
    }
    if (card) resizeObserver?.unobserve(card);
    card = null;
    overlay.setMap(null);
    overlay.setContent("");
  }
  function scheduleAdjustment() {
    if ((!card && !listCard) || !viewport || disposed) return;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = null;
      keepVisible();
    });
  }
  sdk.event.addListener(map, "idle", keepVisible);
  sdk.event.addListener(map, "click", handleMapClick);
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
      ? place.record.brand === "EX"
        ? selected
          ? exActive
          : exImage
        : selected
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
  const pinKind = (items: MapPlace[]) =>
    items.every(place => place.kind === "station" && place.record.brand === "EX")
      ? ("exStation" as const)
      : pinKindFor(placeSummary(items));
  const groupImage = (grouped: MapPlace[]) => {
    const kind = pinKind(grouped);
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
  function select(key: string | null, showCard = true, move = true) {
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
      placeCard(card);
      protectMapInteraction(card);
      if (listItems && listItems.some(item => item.key === key)) addBackButton(card);
      if (viewport) constrainCard(viewport(), card);
      overlay.setContent(card);
      overlay.setPosition(position);
      overlay.setMap(map);
      resizeObserver?.observe(card);
      scheduleAdjustment();
    }
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
        ? `${first.record.name}${isLounge(first) ? " · 화물차 라운지" : first.kind === "station" ? ` · ${stationLabel(first.record)}` : ""}`
        : `이 위치의 장소 ${grouped.length}개`,
      clickable: true,
      image: single ? placeImage(first, false) : groupImage(grouped),
    });
    marker.setZIndex(unitZ(grouped));
    const unit: Unit = {marker, places: grouped, latitude, longitude, click: () => {}};
    unit.click = single
      ? () => {
          suppressFollowUpMapClick();
          select(first.key);
          onSelect(first);
        }
      : () => {
          suppressFollowUpMapClick();
          groupClick(unit);
        };
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
  let lastCluster: KakaoCluster | null = null;
  let lastClusterOpenedAt = 0;
  function clusterClick(cluster: KakaoCluster) {
    suppressFollowUpMapClick();
    const now = Date.now();
    if (lastCluster === cluster && now - lastClusterOpenedAt < 250) return;
    lastCluster = cluster;
    lastClusterOpenedAt = now;
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
      const kind = pinKind(members(cluster));
      const content = document.createElement("div");
      content.className = "place-cluster-pin";
      content.setAttribute("role", "button");
      content.tabIndex = 0;
      protectMapInteraction(content);
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
    sdk.event.addListener<KakaoCluster>(clusterer, "clusterclick", clusterClick);
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
    select,
    dispose() {
      disposed = true;
      clearCard();
      closeList();
      resizeObserver?.disconnect();
      sdk.event.removeListener(map, "idle", keepVisible);
      sdk.event.removeListener(map, "click", handleMapClick);
      sdk.event.removeListener(map, "dragstart", closeList);
      if (typeof window !== "undefined") window.removeEventListener("keydown", escape);
      if (clusterer) {
        sdk.event.removeListener(clusterer, "clusterclick", clusterClick);
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
