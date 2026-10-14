import {
  INITIAL_RADIUS_METERS,
  isGeoPoint,
  radiusForLevel,
  type GeoPoint,
  type GeoBounds,
  type GeoSearchScope,
  type GeoRadius,
  type LocationCameraRequest,
} from "./geo-search.ts";

export type LocationErrorCode = "INSECURE" | "UNSUPPORTED" | "DENIED" | "TIMEOUT" | "UNAVAILABLE";
type LocationError = {code: LocationErrorCode; message: string};
type LocationResult = {ok: true; value: GeoPoint} | {ok: false; error: LocationError};
export type LocationState = {
  position: GeoPoint | null;
  scope: GeoSearchScope;
  locationRadius: GeoRadius | null;
  cameraRequest: LocationCameraRequest | null;
  requesting: boolean;
  error: LocationError | null;
  researchAvailable: boolean;
};

const messages: Record<LocationErrorCode, string> = {
  INSECURE:
    "현재 위치는 HTTPS 또는 localhost에서 사용할 수 있어요. 지도를 이동해 지도 내 재검색을 이용해주세요.",
  UNSUPPORTED: "이 브라우저는 현재 위치를 지원하지 않아요. 지도 내 재검색을 이용해주세요.",
  DENIED:
    "위치 권한이 꺼져 있어요. 브라우저 설정에서 위치를 허용하거나 지도 내 재검색을 이용해주세요.",
  TIMEOUT: "위치 확인 시간이 초과됐어요. 내 위치 버튼으로 다시 시도해주세요.",
  UNAVAILABLE:
    "현재 위치를 확인하지 못했어요. 내 위치 버튼으로 다시 시도하거나 지도 내 재검색을 이용해주세요.",
};
const failure = (code: LocationErrorCode): LocationResult => ({
  ok: false,
  error: {code, message: messages[code]},
});
export const locationOptions: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10_000,
  maximumAge: 0,
};

export function readCurrentPosition(environment: {
  secure: boolean;
  geolocation?: Pick<Geolocation, "getCurrentPosition">;
}): Promise<LocationResult> {
  if (!environment.secure) return Promise.resolve(failure("INSECURE"));
  if (!environment.geolocation) return Promise.resolve(failure("UNSUPPORTED"));
  return new Promise(resolve => {
    try {
      environment.geolocation!.getCurrentPosition(
        result => {
          const value = {
            latitude: result.coords.latitude,
            longitude: result.coords.longitude,
          };
          resolve(isGeoPoint(value) ? {ok: true, value} : failure("UNAVAILABLE"));
        },
        error =>
          resolve(
            failure(error.code === 1 ? "DENIED" : error.code === 3 ? "TIMEOUT" : "UNAVAILABLE"),
          ),
        locationOptions,
      );
    } catch {
      resolve(failure("UNAVAILABLE"));
    }
  });
}

const initialState: LocationState = {
  position: null,
  scope: {kind: "all"},
  locationRadius: null,
  cameraRequest: null,
  requesting: false,
  error: null,
  researchAvailable: false,
};

/** Keep asynchronous location responses from replacing a newer explicit map search. */
export class MobileLocationController {
  private state: LocationState = initialState;
  private listeners = new Set<() => void>();
  private requestSequence = 0;
  private intentSequence = 0;
  private cameraSequence = 0;
  getSnapshot = () => this.state;
  getServerSnapshot = () => initialState;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(changes: Partial<LocationState>) {
    this.state = {...this.state, ...changes};
    this.listeners.forEach(listener => listener());
  }
  async requestLocation(read: () => Promise<LocationResult>): Promise<void> {
    if (this.state.requesting) return;
    const request = ++this.requestSequence;
    const intent = ++this.intentSequence;
    this.update({requesting: true, error: null});
    let result: LocationResult;
    try {
      result = await read();
    } catch {
      result = failure("UNAVAILABLE");
    }
    if (request !== this.requestSequence) return;
    if (!result.ok) {
      this.update({requesting: false, error: result.error});
      return;
    }
    const position = {...result.value};
    const locationRadius: GeoRadius = {
      kind: "radius",
      center: position,
      radiusMeters: INITIAL_RADIUS_METERS,
      referenceLevel: null,
    };
    if (intent !== this.intentSequence) {
      this.update({
        position,
        requesting: false,
        locationRadius: this.state.locationRadius
          ? {...this.state.locationRadius, center: position}
          : locationRadius,
      });
      return;
    }
    this.update({
      position,
      requesting: false,
      researchAvailable: false,
      scope: locationRadius,
      locationRadius,
      cameraRequest: {
        sequence: ++this.cameraSequence,
        center: position,
        radiusMeters: INITIAL_RADIUS_METERS,
      },
    });
  }
  cancelPendingRequests() {
    ++this.requestSequence;
    if (this.state.requesting) this.update({requesting: false});
  }
  cameraReady = (sequence: number, level: number) => {
    if (this.state.cameraRequest?.sequence !== sequence || this.state.scope.kind !== "radius")
      return;
    this.radiusReady(level);
  };
  private updateRadius(locationRadius: GeoRadius) {
    this.update({
      locationRadius,
      ...(this.state.scope.kind === "radius" ? {scope: locationRadius} : {}),
    });
  }
  radiusReady = (level: number) => {
    const radius = this.state.locationRadius;
    if (radius && radius.referenceLevel === null)
      this.updateRadius({...radius, referenceLevel: level});
  };
  zoomChanged = (level: number) => {
    const radius = this.state.locationRadius;
    if (!radius || radius.referenceLevel === null) return;
    const radiusMeters = radiusForLevel(level, radius.referenceLevel);
    if (radiusMeters !== radius.radiusMeters) this.updateRadius({...radius, radiusMeters});
  };
  mapMoved = () => {
    if (!this.state.researchAvailable) this.update({researchAvailable: true});
  };
  research = (bounds: GeoBounds) => {
    ++this.intentSequence;
    this.update({
      scope: {kind: "bounds", bounds: {...bounds}},
      cameraRequest: null,
      researchAvailable: false,
    });
  };
}
