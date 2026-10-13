import type {
  GeoBounds,
  GeoPoint,
  GeoSearchScope,
  GeoRadius,
  LocationCameraRequest,
} from "./geo-search.ts";
import type { KakaoCircle, KakaoMap, KakaoMaps } from "./kakao-sdk.ts";

export type MobileMapLocation = {
  position: GeoPoint | null;
  scope: GeoSearchScope;
  locationRadius: GeoRadius | null;
  cameraRequest: LocationCameraRequest | null;
  requesting: boolean;
  error: { message: string } | null;
  researchAvailable: boolean;
  locate: () => void;
  cameraReady: (sequence: number, level: number) => void;
  radiusReady: (level: number) => void;
  zoomChanged: (level: number) => void;
  mapMoved: () => void;
  research: (bounds: GeoBounds) => void;
};
export type MobileMapMemory = {
  viewport?: { center: GeoPoint; level: number };
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
) {
  let circle: KakaoCircle | null = null;
  let disposed = false;
  let programmaticDepth = 0;
  let observedLevel = map.getLevel();
  let pendingZoom = false;
  let pendingMove = false;
  const dot = new sdk.CustomOverlay({
    content:
      '<span class="current-location-dot" role="img" aria-label="내 현재 위치"></span>',
    clickable: false,
    xAnchor: 0.5,
    yAnchor: 0.5,
    zIndex: 3,
  });
  function rememberView() {
    const center = map.getCenter();
    memory.viewport = {
      center: { latitude: center.getLat(), longitude: center.getLng() },
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
    if (changedZoom) callbacks.zoomChanged(map.getLevel());
    if (moved) callbacks.mapMoved();
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
      if (locationRadius) {
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
        if (scope.kind === "radius" && request && memory.cameraSequence !== request.sequence) {
          memory.cameraSequence = request.sequence;
          memory.initialFitDone = true;
          programmatic(() => {
            map.setBounds(circle!.getBounds(), 65, 35, 65, 35);
            map.setCenter(
              new sdk.LatLng(request.center.latitude, request.center.longitude),
            );
          });
          callbacks.cameraReady(request.sequence, map.getLevel());
        } else if (locationRadius.referenceLevel === null)
          callbacks.radiusReady(map.getLevel());
      } else circle?.setMap(null);
    },
    fitInitialResults(fit: () => void) {
      if (disposed || memory.initialFitDone || memory.userMoved) return;
      memory.initialFitDone = true;
      programmatic(fit);
    },
    research() {
      if (disposed) return;
      callbacks.zoomChanged(map.getLevel());
      pendingZoom = false;
      pendingMove = false;
      memory.initialFitDone = true;
      callbacks.research(mapBounds(map));
    },
    dispose() {
      disposed = true;
      rememberView();
      Object.entries(listeners).forEach(([name, listener]) =>
        sdk.event.removeListener(map, name, listener),
      );
      dot.setMap(null);
      circle?.setMap(null);
    },
  };
}
