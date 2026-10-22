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
import {markerLayerSignature} from "./marker-layer.ts";
import {
  CLUSTER_MIN_LEVEL,
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
  runProgrammaticMapAction: (action: () => void, expectZoomChange?: boolean) => void = action => action(),
  clusterEnabled = true,
  canvasViewport?: () => DOMRect,
) {
  const above = placement === "above";
  const cardArea = (view: DOMRect) => {
    // placement-above의 translateY(-43px) 아래에 있는 마커도 패널에 가려지지 않아야 한다.
    const bottom = above ? Math.max(view.top, view.bottom - 43) : view.bottom;
    return {left: view.left, right: view.right, width: view.width,
      top: view.top, bottom, height: bottom - view.top};
  };
  const placeCard = (target: HTMLElement) => {
    if (above) target.classList.add("placement-above");
  };
  const markerImages = new Map<string, KakaoMarkerImage>();
  const image = (path: string, active = false) => {
    let cached = markerImages.get(path);
    if (cached) return cached;
    cached = new sdk.MarkerImage(path, new sdk.Size(active ? 36 : 32, active ? 42 : 38), {
      offset: new sdk.Point(active ? 18 : 16, active ? 41 : 37),
    });
    markerImages.set(path, cached);
    return cached;
  };
  const normal = image("/marker.svg"),
    active = image("/marker-selected.svg", true);
  const lounge = image("/marker-lounge.svg"),
    loungeActive = image("/marker-lounge-selected.svg", true);
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
  const clusterer = clusterEnabled && sdk.MarkerClusterer
    ? new sdk.MarkerClusterer({
        map,
        gridSize: 48,
        minLevel: 7,
        minClusterSize: 3,
        averageCenter: false,
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
  /** 지도에 하나의 마커로 그려지는 표시 단위: 단일 장소 또는 같은 좌표의 장소 그룹. */
  type Unit = {
    marker: KakaoMarker;
    places: MapPlace[];
    latitude: number;
    longitude: number;
    click: () => void;
    signature: string;
  };
  const units = new Map<string, Unit>();
  const unitOfPlace = new Map<string, Unit>();
  const placeByKey = new Map<string, MapPlace>();
  const placesByMarker = new Map<KakaoMarker, MapPlace[]>();
  let card: HTMLElement | null = null,
    frame: number | null = null,
    activeKey: string | null = null;
  let allowAdjustment = true;
  let zoomPending = false;
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
    content.addEventListener?.("wheel", event => {
      event.stopPropagation();
      suppressFollowUpMapClick();
    });
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
    if (!hasCoordinates(place.record)) return false;
    const target = CLUSTER_MIN_LEVEL - 1;
    if (map.getLevel() <= target) return false;
    map.setCenter(new sdk.LatLng(place.record.latitude, place.record.longitude));
    map.setLevel(target);
    return true;
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
          const expectZoomChange =
            hasCoordinates(place.record) && map.getLevel() > CLUSTER_MIN_LEVEL - 1;
          runProgrammaticMapAction(() => {
            zoomToPlace(place);
            select(place.key, true, true);
          }, expectZoomChange);
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
              runProgrammaticMapAction(() => {
                closeList();
                const level = map.getLevel();
                map.setBounds(bounds, 65, 45, 65, 45);
                if (map.getLevel() >= level) map.setLevel(Math.max(1, level - 1));
              }, true);
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
    const limit = cardSizeLimit(cardArea(view), fixedHeight);
    target.style.maxWidth = `${limit.width}px`;
    target.style.maxHeight = `${limit.height}px`;
    target.style.visibility = limit.hidden ? "hidden" : "";
    target.style.pointerEvents = limit.hidden ? "none" : "";
  }
  function mapIdle() {
    if (zoomPending) {
      zoomPending = false;
      const selected = activeKey === null ? undefined : placeByKey.get(activeKey);
      if (!disposed && selected && hasCoordinates(selected.record)) {
        // 정보창을 피하려고 이동한 중심에서 확대하면 선택 장소 자체가 화면 밖으로 나갈 수 있다.
        // 선택 장소를 다시 화면 안으로 이동한 뒤 카드 여백을 다시 맞춘다.
        allowAdjustment = true;
        const position = new sdk.LatLng(selected.record.latitude, selected.record.longitude);
        const canvas = canvasViewport?.();
        const view = viewport?.();
        if (canvas && view && view.width > 0 && view.height > 0) {
          // 상세 패널 때문에 유효 지도 영역이 줄어든 경우 그 영역의 중심에 마커를 둔다.
          map.setCenter(position);
          map.panBy(
            canvas.left + canvas.width / 2 - (view.left + view.width / 2),
            canvas.top + canvas.height / 2 - (view.top + view.height / 2),
          );
        } else map.panTo(position);
        scheduleAdjustment();
        return;
      }
    }
    keepVisible();
  }
  function keepVisible() {
    const target = listCard ?? card;
    if (!target || !viewport || disposed) return;
    const view = viewport();
    constrainCard(view, target);
    if (!allowAdjustment || target.style.visibility === "hidden") return;
    const box = target.getBoundingClientRect();
    if (!box.width || !box.height || !view.width || !view.height) return;
    const {x, y} = cardPanOffset(box, cardArea(view));
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
  const zoomChanged = () => { zoomPending = true; };
  sdk.event.addListener(map, "zoom_changed", zoomChanged);
  sdk.event.addListener(map, "idle", mapIdle);
  sdk.event.addListener(map, "click", handleMapClick);
  sdk.event.addListener(map, "dragstart", closeList);
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
        ? image(selected ? "/marker-ex-station-selected.svg" : "/marker-ex-station.svg", selected)
        : image(selected ? "/marker-station-selected.svg" : "/marker-station.svg", selected)
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
  function select(key: string | null, showCard = true, move = true, refresh = false) {
    allowAdjustment = move;
    if (key === activeKey && card && showCard && !refresh) {
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
  function update(nextPlaces: MapPlace[]) {
    if (disposed) return;
    const oldRecords = new Map(places.map(place => [place.key, place.record]));
    const dataChanged =
      places.length !== nextPlaces.length ||
      nextPlaces.some(place => oldRecords.get(place.key) !== place.record);
    places = nextPlaces;
    const located = places.flatMap(place => {
      const record = place.record;
      return hasCoordinates(record)
        ? [{place, latitude: record.latitude, longitude: record.longitude}]
        : [];
    });
    const nextUnits = new Map<
      string,
      {grouped: MapPlace[]; latitude: number; longitude: number; signature: string}
    >();
    for (const group of groupByCoordinate(located)) {
      const grouped = group.map(item => item.place);
      const key =
        grouped.length === 1
          ? grouped[0].key
          : `group:${grouped
              .map(place => place.key)
              .sort()
              .join("|")}`;
      nextUnits.set(key, {
        grouped,
        latitude: group[0].latitude,
        longitude: group[0].longitude,
        signature: markerLayerSignature(grouped),
      });
    }
    let changed = false;
    for (const [key, unit] of units) {
      if (nextUnits.get(key)?.signature === unit.signature) continue;
      clusterer?.removeMarker(unit.marker, true);
      sdk.event.removeListener(unit.marker, "click", unit.click);
      unit.marker.setMap(null);
      placesByMarker.delete(unit.marker);
      units.delete(key);
      changed = true;
    }
    unitOfPlace.clear();
    placeByKey.clear();
    const added: KakaoMarker[] = [];
    for (const [key, next] of nextUnits) {
      const {grouped, latitude, longitude, signature} = next;
      const first = grouped[0];
      const single = grouped.length === 1;
      let unit = units.get(key);
      if (!unit) {
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
        const created: Unit = {
          marker,
          places: grouped,
          latitude,
          longitude,
          signature,
          click: () => {},
        };
        created.click = single
          ? () => {
              suppressFollowUpMapClick();
              const current = created.places[0];
              select(current.key);
              onSelect(current);
            }
          : () => {
              suppressFollowUpMapClick();
              groupClick(created);
            };
        sdk.event.addListener(marker, "click", created.click);
        units.set(key, created);
        unit = created;
        added.push(marker);
        changed = true;
      }
      unit.places = grouped;
      for (const place of grouped) {
        unitOfPlace.set(place.key, unit);
        placeByKey.set(place.key, place);
      }
      placesByMarker.set(unit.marker, grouped);
    }
    const selectedUnit = activeKey === null ? undefined : unitOfPlace.get(activeKey);
    if (clusterer) {
      const clusteredAdditions = added.filter(marker => marker !== selectedUnit?.marker);
      if (clusteredAdditions.length) clusterer.addMarkers(clusteredAdditions, true);
      if (selectedUnit) selectedUnit.marker.setMap(map);
      if (changed) clusterer.redraw();
    }
    const previousKey = activeKey;
    const showCard = card !== null;
    if (listItems) {
      const items = listItems.flatMap(item =>
        placeByKey.has(item.key) ? [placeByKey.get(item.key)!] : [],
      );
      if (!items.length) closeList();
      else {
        listItems = items;
        if (listOpen && listCenter && listBounds && (changed || dataChanged))
          showList(items, listCenter, listBounds);
      }
    }
    if (previousKey !== null && (changed || dataChanged)) {
      select(selectedUnit ? previousKey : null, showCard, false, true);
    }
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
      const items = members(cluster);
      const summary = placeSummary(items);
      if (summary.total < 2) continue;
      const kind = pinKind(items);
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
  }
  // 개별 핀을 중간에 노출하지 않고 변경된 집합을 한 번에 클러스터링한다.
  update(places);
  return {
    update,
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
      sdk.event.removeListener(map, "zoom_changed", zoomChanged);
      sdk.event.removeListener(map, "idle", mapIdle);
      sdk.event.removeListener(map, "click", handleMapClick);
      sdk.event.removeListener(map, "dragstart", closeList);
      if (typeof window !== "undefined") window.removeEventListener("keydown", escape);
      if (clusterer) {
        sdk.event.removeListener(clusterer, "clusterclick", clusterClick);
        sdk.event.removeListener(clusterer, "clustered", clustered);
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
