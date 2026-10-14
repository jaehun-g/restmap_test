import { distanceMeters, type GeoBounds, type GeoPoint } from "./geo-search.ts";
import type { HighwayRoute } from "./highway-routes.ts";

export const routeStationRadiusMeters = 2000;
const earthRadius = 6_371_008.8;
const radians = (value: number) => value * Math.PI / 180;
function bearing(from: GeoPoint, to: GeoPoint) {
  const delta = radians(to.longitude - from.longitude);
  const left = radians(from.latitude), right = radians(to.latitude);
  return Math.atan2(Math.sin(delta) * Math.cos(right), Math.cos(left) * Math.sin(right) - Math.sin(left) * Math.cos(right) * Math.cos(delta));
}
export function expandedBounds(bounds: GeoBounds, meters: number): GeoBounds {
  const latitude = meters / 110000;
  const cosine = Math.max(0.000001, Math.cos(radians(Math.min(89.9999, Math.max(Math.abs(bounds.south), Math.abs(bounds.north)) + latitude))));
  const longitude = meters / (110000 * cosine);
  return { south: Math.max(-90, bounds.south - latitude), north: Math.min(90, bounds.north + latitude), west: Math.max(-180, bounds.west - longitude), east: Math.min(180, bounds.east + longitude) };
}

/** 각 분리 구간의 실제 선분에 대한 거리만 계산하며 구간 사이에 가상의 연결선을 만들지 않습니다. */
export function compileRouteProximity(route: HighwayRoute, meters = routeStationRadiusMeters) {
  const segments = route.paths.flatMap((path) => path.slice(1).map(([latitude, longitude], index) => {
    const start = { latitude: path[index][0], longitude: path[index][1] };
    const end = { latitude, longitude };
    return { start, end, length: distanceMeters(start, end), bearing: bearing(start, end), bounds: expandedBounds({ south: Math.min(start.latitude, end.latitude), north: Math.max(start.latitude, end.latitude), west: Math.min(start.longitude, end.longitude), east: Math.max(start.longitude, end.longitude) }, meters + 100) };
  }));
  return (point: GeoPoint): boolean => segments.some((segment) => {
    const bounds = segment.bounds;
    if (point.latitude < bounds.south || point.latitude > bounds.north || point.longitude < bounds.west || point.longitude > bounds.east) return false;
    const startDistance = distanceMeters(segment.start, point);
    if (segment.length < 0.000001) return startDistance <= meters + 0.000001;
    const delta = startDistance / earthRadius;
    const angle = bearing(segment.start, point) - segment.bearing;
    const along = Math.atan2(Math.sin(delta) * Math.cos(angle), Math.cos(delta)) * earthRadius;
    const distance = along <= 0 ? startDistance : along >= segment.length ? distanceMeters(segment.end, point) : Math.abs(Math.asin(Math.max(-1, Math.min(1, Math.sin(delta) * Math.sin(angle))))) * earthRadius;
    return distance <= meters + 0.000001;
  });
}
