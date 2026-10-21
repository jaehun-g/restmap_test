import type {Result} from "./rest-areas.ts";
import {validateHighwayRouteName} from "./highway-routes.ts";
import {isGeoPoint, type GeoSearchScope} from "./geo-search.ts";
import {expandedBounds} from "./route-proximity.ts";

export type GasStationQuery = {routeName: string | null; scope: GeoSearchScope; source: "all" | "ex"};

/** 위치 범위만 변경된 동일 원본의 주유소 조회인지 판별한다. */
export function canKeepPreviousStations(previousQuery: string | null, nextQuery: string | null) {
  if (!previousQuery || !nextQuery) return false;
  const previous = new URLSearchParams(previousQuery);
  const next = new URLSearchParams(nextQuery);
  return (
    !previous.has("routeName") &&
    !next.has("routeName") &&
    previous.get("source") === next.get("source")
  );
}

export function stationQueryString(
  routeName: string | null,
  scope: GeoSearchScope,
  source: "all" | "ex" = "all",
): string {
  const params = new URLSearchParams();
  if (source === "ex") params.set("source", source);
  if (routeName) params.set("routeName", routeName);
  else if (scope.kind === "bounds") {
    for (const [key, value] of Object.entries(scope.bounds)) params.set(key, String(value));
  } else if (scope.kind === "radius") {
    params.set("latitude", String(scope.center.latitude));
    params.set("longitude", String(scope.center.longitude));
    params.set("radiusMeters", String(scope.radiusMeters));
  }
  return params.toString();
}
export function parseStationQuery(params: URLSearchParams): Result<GasStationQuery> {
  const fail = (): Result<never> => ({
    ok: false,
    error: {code: "VALIDATION_ERROR", message: "주유소 검색 범위가 올바르지 않습니다."},
  });
  const keys = [
    "routeName",
    "south",
    "west",
    "north",
    "east",
    "latitude",
    "longitude",
    "radiusMeters", "source",
  ];
  if ([...params.keys()].some(key => !keys.includes(key) || params.getAll(key).length !== 1))
    return fail();
  if (params.has("source") && params.get("source") !== "ex") return fail();
  if (params.has("routeName")) {
    const name = validateHighwayRouteName(params.get("routeName"));
    if (!name.ok) return name;
    if ([...params.keys()].some(key => key !== "routeName" && key !== "source")) return fail();
    return {ok: true, value: {routeName: name.value, scope: {kind: "all"}, source: params.get("source") === "ex" ? "ex" : "all"}};
  }
  if (params.size === 1 && params.has("source"))
    return {ok: true, value: {routeName: null, scope: {kind: "all"}, source: "ex"}};
  const number = (key: string) => (params.get(key)?.trim() ? Number(params.get(key)) : NaN);
  if (["south", "west", "north", "east"].some(key => params.has(key))) {
    if (["latitude", "longitude", "radiusMeters"].some(key => params.has(key))) return fail();
    const bounds = {
      south: number("south"),
      west: number("west"),
      north: number("north"),
      east: number("east"),
    };
    if (
      !isGeoPoint({latitude: bounds.south, longitude: bounds.west}) ||
      !isGeoPoint({latitude: bounds.north, longitude: bounds.east}) ||
      bounds.south > bounds.north
    )
      return fail();
    return {ok: true, value: {routeName: null, scope: {kind: "bounds", bounds}, source: params.get("source") === "ex" ? "ex" : "all"}};
  }
  if (params.size) {
    const center = {latitude: number("latitude"), longitude: number("longitude")},
      radiusMeters = number("radiusMeters");
    if (
      !isGeoPoint(center) ||
      !Number.isFinite(radiusMeters) ||
      radiusMeters <= 0 ||
      radiusMeters > 5_000_000
    )
      return fail();
    return {
      ok: true,
      value: {
        routeName: null,
        scope: {kind: "radius", center, radiusMeters, referenceLevel: null}, source: params.get("source") === "ex" ? "ex" : "all",
      },
    };
  }
  return {ok: true, value: {routeName: null, scope: {kind: "all"}, source: params.get("source") === "ex" ? "ex" : "all"}};
}
export function stationQueryBounds(scope: GeoSearchScope) {
  return scope.kind === "bounds"
    ? scope.bounds
    : scope.kind === "radius"
      ? expandedBounds(
          {
            south: scope.center.latitude,
            north: scope.center.latitude,
            west: scope.center.longitude,
            east: scope.center.longitude,
          },
          scope.radiusMeters,
        )
      : null;
}
