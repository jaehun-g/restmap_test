import { hasCoordinates } from "./rest-areas.ts";
export type LocatedItem = { id: number; latitude: number | null; longitude: number | null };

export type GeoPoint = { latitude: number; longitude: number };
export type GeoBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};
export type GeoSearchScope =
  | { kind: "all" }
  | {
      kind: "radius";
      center: GeoPoint;
      radiusMeters: number;
      referenceLevel: number | null;
    }
  | { kind: "bounds"; bounds: GeoBounds };
export type GeoRadius = Extract<GeoSearchScope, { kind: "radius" }>;
export type LocationCameraRequest = {
  sequence: number;
  center: GeoPoint;
  radiusMeters: number;
};

export const INITIAL_RADIUS_METERS = 15_000;
const EARTH_RADIUS_METERS = 6_371_008.8;
const radians = (degrees: number) => (degrees * Math.PI) / 180;

export function isGeoPoint(point: GeoPoint): boolean {
  return (
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    Math.abs(point.latitude) <= 90 &&
    Math.abs(point.longitude) <= 180
  );
}

export function distanceMeters(from: GeoPoint, to: GeoPoint): number {
  const latitude = radians(to.latitude - from.latitude);
  const longitude = radians(to.longitude - from.longitude);
  const arc =
    Math.sin(latitude / 2) ** 2 +
    Math.cos(radians(from.latitude)) *
      Math.cos(radians(to.latitude)) *
      Math.sin(longitude / 2) ** 2;
  return (
    2 *
    EARTH_RADIUS_METERS *
    Math.asin(Math.sqrt(Math.min(1, Math.max(0, arc))))
  );
}

export function radiusForLevel(level: number, referenceLevel: number): number {
  return INITIAL_RADIUS_METERS * 2 ** (level - referenceLevel);
}

export function areaDistance(
  area: LocatedItem,
  position: GeoPoint | null,
): number | null {
  return position && hasCoordinates(area)
    ? distanceMeters(position, area)
    : null;
}

export function filterByGeoScope<T extends LocatedItem>(
  areas: T[],
  scope: GeoSearchScope,
  position: GeoPoint | null,
): T[] {
  const results = areas.filter((area) => {
    if (scope.kind === "all") return true;
    if (!hasCoordinates(area)) return false;
    if (scope.kind === "radius")
      return (
        distanceMeters(scope.center, area) <= scope.radiusMeters + 0.000001
      );
    const { south, west, north, east } = scope.bounds;
    return (
      area.latitude >= south &&
      area.latitude <= north &&
      (west <= east
        ? area.longitude >= west && area.longitude <= east
        : area.longitude >= west || area.longitude <= east)
    );
  });
  if (!position) return results;
  const distances = new Map(
    results.map((area) => [area.id, areaDistance(area, position)]),
  );
  return results.sort((a, b) => {
    const left = distances.get(a.id) ?? Infinity;
    const right = distances.get(b.id) ?? Infinity;
    return left === right ? a.id - b.id : left - right;
  });
}

export function formatDistance(meters: number): string {
  return meters < 1000
    ? `${Math.round(meters)}m`
    : `${(meters / 1000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}km`;
}

export function scopeLabel(scope: GeoSearchScope): string {
  if (scope.kind === "all") return "전체 휴게소";
  if (scope.kind === "bounds") return "지도 영역 검색";
  const radius =
    scope.radiusMeters >= 1000
      ? `${(scope.radiusMeters / 1000).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}km`
      : `${Math.round(scope.radiusMeters)}m`;
  return `내 위치 기준 반경 ${radius}`;
}
