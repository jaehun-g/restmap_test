import type {
  GeoBounds,
  GeoPoint,
  GeoSearchScope,
  GeoRadius,
  LocationCameraRequest,
} from "./geo-search.ts";
import type {KakaoCircle, KakaoMap, KakaoMaps} from "./kakao-sdk.ts";
import {formatRadius} from "./geo-search.ts";

export type MobileMapLocation = {
  position: GeoPoint | null;
  scope: GeoSearchScope;
  locationRadius: GeoRadius | null;
  cameraRequest: LocationCameraRequest | null;
  requesting: boolean;
  error: {message: string} | null;
  researchAvailable: boolean;
  locate: () => void;
  cameraReady: (sequence: number, level: number) => void;
  radiusReady: (level: number) => void;
  zoomChanged: (level: number) => void;
  mapMoved: () => void;
  research: (bounds: GeoBounds) => void;
};
export type MobileMapMemory = {
  viewport?: {center: GeoPoint; level: number};
  cameraSequence?: number;
  initialFitDone?: boolean;
  userMoved?: boolean;
};

export function mapBounds(map: KakaoMap): GeoBounds {
  const bounds = map.getBounds();
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  return {
    south: sw.getLat(),
    west: sw.getLng(),
    north: ne.getLat(),
    east: ne.getLng(),
  };
}

/**
 * 상단 헤더, 하단 시트 등으로 가려지는 영역을 제외한 실제 눈에 보이는 유효 뷰포트의 위경도 범위를 계산합니다.
 * 계산이 불가능하거나 가시 영역이 지나치게 좁을 경우 전체 지도 뷰포트 Bounds로 안전하게 폴백합니다.
 */
export function visibleMapBounds(
  sdk: KakaoMaps,
  map: KakaoMap,
  container?: HTMLElement | null,
  viewport?: DOMRect,
): GeoBounds {
  const fallback = mapBounds(map);
  if (!container || !viewport || !map.getProjection || !sdk.Point) {
    return fallback;
  }
  const canvasRect = container.getBoundingClientRect();
  if (
    canvasRect.width <= 0 ||
    canvasRect.height <= 0 ||
    viewport.width < 100 ||
    viewport.height < 100
  ) {
    return fallback;
  }
  try {
    const projection = map.getProjection();
    if (!projection?.coordsFromContainerPoint) {
      return fallback;
    }
    const swX = Math.max(0, Math.min(canvasRect.width, viewport.left - canvasRect.left));
    const swY = Math.max(0, Math.min(canvasRect.height, viewport.bottom - canvasRect.top));
    const neX = Math.max(0, Math.min(canvasRect.width, viewport.right - canvasRect.left));
    const neY = Math.max(0, Math.min(canvasRect.height, viewport.top - canvasRect.top));

    // 화면 y좌표는 아래로 갈수록 커지므로 swY > neY 여야 유효한 사각형입니다.
    if (swY <= neY || neX <= swX) {
      return fallback;
    }

    const sw = projection.coordsFromContainerPoint(new sdk.Point(swX, swY));
    const ne = projection.coordsFromContainerPoint(new sdk.Point(neX, neY));

    const south = sw.getLat();
    const west = sw.getLng();
    const north = ne.getLat();
    const east = ne.getLng();

    if (
      !Number.isFinite(south) ||
      !Number.isFinite(west) ||
      !Number.isFinite(north) ||
      !Number.isFinite(east)
    ) {
      return fallback;
    }
    if (south >= north || west >= east) {
      return fallback;
    }

    return {south, west, north, east};
  } catch {
    return fallback;
  }
}

/** SDK events are tracked separately from programmatic camera moves to avoid fit/zoom feedback loops. */
export function createLocationMapLayer(
  sdk: KakaoMaps,
  map: KakaoMap,
  callbacks: Pick<
    MobileMapLocation,
    "cameraReady" | "radiusReady" | "zoomChanged" | "mapMoved" | "research"
  > & {
    dragStart: () => void;
    zoomStart?: () => void;
  },
  memory: MobileMapMemory = {},
  options?: {
    container?: HTMLElement | null;
    viewport?: () => DOMRect;
  },
) {
  let circle: KakaoCircle | null = null;
  let disposed = false;
  let programmaticDepth = 0;
  let observedLevel = map.getLevel();
  let pendingZoom = false;
  let pendingMove = false;
  let routeMode = false;
  const dot = new sdk.CustomOverlay({
    content: '<span class="current-location-dot" role="img" aria-label="내 현재 위치"></span>',
    clickable: false,
    xAnchor: 0.5,
    yAnchor: 0.5,
    zIndex: 3,
  });
  const radiusLabel = new sdk.CustomOverlay({
    content: "",
    clickable: false,
    xAnchor: 0.5,
    yAnchor: 0.5,
    zIndex: 3,
  });
  function rememberView() {
    const center = map.getCenter();
    memory.viewport = {
      center: {latitude: center.getLat(), longitude: center.getLng()},
      level: map.getLevel(),
    };
  }
  function programmatic(action: () => void) {
    programmaticDepth++;
    try {
      action();
    } finally {
      programmaticDepth--;
      observedLevel = map.getLevel();
      pendingZoom = false;
      pendingMove = false;
      rememberView();
    }
  }
  const zoom = () => {
    const level = map.getLevel();
    if (!programmaticDepth && level !== observedLevel) {
      pendingZoom = true;
      pendingMove = true;
      memory.userMoved = true;
      callbacks.zoomStart?.();
    }
    observedLevel = level;
  };
  const dragStart = () => {
    memory.userMoved = true;
    callbacks.dragStart();
  };
  const dragEnd = () => {
    pendingMove = true;
  };
  const idle = () => {
    if (programmaticDepth || disposed) return;
    const changedZoom = pendingZoom;
    const moved = pendingMove;
    pendingZoom = false;
    pendingMove = false;
    rememberView();
    if (changedZoom && !routeMode) callbacks.zoomChanged(map.getLevel());
    if (moved && !routeMode) callbacks.mapMoved();
  };
  const listeners = {
    zoom_changed: zoom,
    dragstart: dragStart,
    dragend: dragEnd,
    idle,
  };
  Object.entries(listeners).forEach(([name, listener]) =>
    sdk.event.addListener(map, name, listener),
  );

  return {
    setRouteMode(enabled: boolean) {
      routeMode = enabled;
      if (enabled) {
        circle?.setMap(null);
        radiusLabel.setMap(null);
      }
    },
    update(
      position: GeoPoint | null,
      scope: GeoSearchScope,
      request: LocationCameraRequest | null,
      locationRadius: GeoRadius | null,
    ) {
      if (disposed) return;
      if (position) {
        dot.setPosition(new sdk.LatLng(position.latitude, position.longitude));
        dot.setMap(map);
      } else dot.setMap(null);
      if (locationRadius && !routeMode) {
        const center = new sdk.LatLng(
          locationRadius.center.latitude,
          locationRadius.center.longitude,
        );
        circle ??= new sdk.Circle({
          center,
          radius: locationRadius.radiusMeters,
          strokeWeight: 2,
          strokeColor: "#397af0",
          strokeOpacity: 0.5,
          fillColor: "#397af0",
          fillOpacity: 0.07,
          zIndex: 0,
        });
        circle.setPosition(center);
        circle.setRadius(locationRadius.radiusMeters);
        circle.setMap(map);
        const radius = formatRadius(locationRadius.radiusMeters);
        radiusLabel.setContent(
          `<span class="location-radius-label" role="img" aria-label="내 위치 기준 반경 ${radius}">${radius}</span>`,
        );
        radiusLabel.setPosition(
          new sdk.LatLng(
            locationRadius.center.latitude,
            circle.getBounds().getNorthEast().getLng(),
          ),
        );
        radiusLabel.setMap(map);
        if (scope.kind === "radius" && request && memory.cameraSequence !== request.sequence) {
          memory.cameraSequence = request.sequence;
          memory.initialFitDone = true;
          programmatic(() => {
            map.setBounds(circle!.getBounds(), 65, 35, 65, 35);
            map.setCenter(new sdk.LatLng(request.center.latitude, request.center.longitude));
          });
          callbacks.cameraReady(request.sequence, map.getLevel());
        } else if (locationRadius.referenceLevel === null) callbacks.radiusReady(map.getLevel());
      } else {
        circle?.setMap(null);
        radiusLabel.setMap(null);
      }
    },
    fitInitialResults(fit: () => void) {
      if (disposed || routeMode || memory.initialFitDone || memory.userMoved) return;
      memory.initialFitDone = true;
      programmatic(fit);
    },
    fitRoute(fit: () => void) {
      if (disposed) return;
      memory.initialFitDone = true;
      programmatic(fit);
    },
    research() {
      if (disposed || routeMode) return;
      callbacks.zoomChanged(map.getLevel());
      pendingZoom = false;
      pendingMove = false;
      memory.initialFitDone = true;
      const bounds =
        options?.container && options?.viewport
          ? visibleMapBounds(sdk, map, options.container, options.viewport())
          : mapBounds(map);
      callbacks.research(bounds);
    },
    dispose() {
      disposed = true;
      rememberView();
      Object.entries(listeners).forEach(([name, listener]) =>
        sdk.event.removeListener(map, name, listener),
      );
      dot.setMap(null);
      circle?.setMap(null);
      radiusLabel.setMap(null);
    },
  };
}
