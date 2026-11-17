import {distanceMeters, type GeoPoint} from "./geo-search.ts";
import type {HighwayRoute} from "./highway-routes.ts";

const earthRadius = 6_371_008.8;
const radians = (degrees: number) => (degrees * Math.PI) / 180;

function bearing(from: GeoPoint, to: GeoPoint) {
  const delta = radians(to.longitude - from.longitude);
  const left = radians(from.latitude);
  const right = radians(to.latitude);
  return Math.atan2(
    Math.sin(delta) * Math.cos(right),
    Math.cos(left) * Math.sin(right) - Math.sin(left) * Math.cos(right) * Math.cos(delta),
  );
}

function distanceToSegment(point: GeoPoint, start: GeoPoint, end: GeoPoint) {
  const length = distanceMeters(start, end);
  const startDistance = distanceMeters(start, point);
  if (length < 0.000001) return startDistance;
  const delta = startDistance / earthRadius;
  const angle = bearing(start, point) - bearing(start, end);
  const along = Math.atan2(Math.sin(delta) * Math.cos(angle), Math.cos(delta)) * earthRadius;
  if (along <= 0) return startDistance;
  if (along >= length) return distanceMeters(end, point);
  return (
    Math.abs(Math.asin(Math.max(-1, Math.min(1, Math.sin(delta) * Math.sin(angle))))) * earthRadius
  );
}

export function nearestHighwayRoute(
  point: GeoPoint,
  routes: readonly HighwayRoute[],
): HighwayRoute | null {
  let nearest: HighwayRoute | null = null;
  let nearestDistance = Infinity;
  for (const route of routes) {
    for (const path of route.paths) {
      for (let index = 1; index < path.length; index++) {
        const [startLat, startLng] = path[index - 1];
        const [endLat, endLng] = path[index];
        const distance = distanceToSegment(
          point,
          {latitude: startLat, longitude: startLng},
          {latitude: endLat, longitude: endLng},
        );
        if (distance < nearestDistance) {
          nearest = route;
          nearestDistance = distance;
        }
      }
    }
  }
  return nearest;
}
