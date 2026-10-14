import type { GeoBounds } from "./geo-search.ts";
import type { Result } from "./rest-areas.ts";

export type HighwayCoordinate = [latitude: number, longitude: number];
export type HighwayRoute = {
  id: number;
  routeName: string;
  routeNumber: string | null;
  bounds: GeoBounds;
  paths: HighwayCoordinate[][];
};
export type HighwayRouteResponse = { route: HighwayRoute };

function invalidRoute(): Result<never> {
  return {
    ok: false,
    error: {
      code: "HIGHWAY_ROUTE_DATA_INVALID",
      message: "선택한 노선의 경로 데이터가 올바르지 않습니다.",
    },
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  if (value instanceof Uint8Array) {
    try {
      value = new TextDecoder("utf-8", { fatal: true }).decode(value);
    } catch {
      return null;
    }
  }
  return typeof value === "string" ? value : null;
}

function number(value: unknown): number | null {
  const decoded = value instanceof Uint8Array ? text(value) : value;
  if (typeof decoded !== "number" && (typeof decoded !== "string" || !decoded.trim())) return null;
  const parsed = Number(decoded);
  return Number.isFinite(parsed) ? parsed : null;
}

export function validateHighwayRouteName(value: unknown): Result<string> {
  if (typeof value === "string") {
    const name = value.trim();
    if (name && name.length <= 100 && !/[\u0000-\u001f\u007f]/.test(name))
      return { ok: true, value: name };
  }
  return {
    ok: false,
    error: { code: "VALIDATION_ERROR", message: "노선명을 올바르게 입력해주세요." },
  };
}

/** Both the DB boundary and browser cache accept only complete, bounded paths. */
export function parseHighwayRoute(value: unknown): Result<HighwayRoute> {
  if (!record(value)) return invalidRoute();
  const name = validateHighwayRouteName(value.routeName);
  if (
    !name.ok ||
    typeof value.id !== "number" ||
    !Number.isSafeInteger(value.id) ||
    value.id <= 0 ||
    (value.routeNumber !== null &&
      (typeof value.routeNumber !== "string" || value.routeNumber.length > 20)) ||
    !record(value.bounds) ||
    !Array.isArray(value.paths) ||
    !value.paths.length
  )
    return invalidRoute();

  const { south, west, north, east } = value.bounds;
  if (
    typeof south !== "number" ||
    typeof west !== "number" ||
    typeof north !== "number" ||
    typeof east !== "number" ||
    ![south, west, north, east].every(Number.isFinite) ||
    Math.abs(south) > 90 ||
    Math.abs(north) > 90 ||
    Math.abs(west) > 180 ||
    Math.abs(east) > 180 ||
    south > north ||
    west > east
  )
    return invalidRoute();

  const paths: HighwayCoordinate[][] = [];
  const tolerance = 1e-7;
  for (const path of value.paths) {
    if (!Array.isArray(path) || path.length < 2) return invalidRoute();
    const coordinates: HighwayCoordinate[] = [];
    for (const point of path) {
      if (
        !Array.isArray(point) ||
        point.length !== 2 ||
        !point.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))
      )
        return invalidRoute();
      const [latitude, longitude] = point as HighwayCoordinate;
      if (
        Math.abs(latitude) > 90 ||
        Math.abs(longitude) > 180 ||
        latitude < south - tolerance ||
        latitude > north + tolerance ||
        longitude < west - tolerance ||
        longitude > east + tolerance
      )
        return invalidRoute();
      coordinates.push([latitude, longitude]);
    }
    paths.push(coordinates);
  }
  return {
    ok: true,
    value: {
      id: value.id,
      routeName: name.value,
      routeNumber: value.routeNumber,
      bounds: { south, west, north, east },
      paths,
    },
  };
}

export function normalizeHighwayRoute(row: Record<string, unknown>): Result<HighwayRoute> {
  const serialized = text(row.path_coordinates);
  if (serialized === null) return invalidRoute();
  let paths: unknown;
  try {
    paths = JSON.parse(serialized);
  } catch {
    return invalidRoute();
  }
  return parseHighwayRoute({
    id: number(row.id),
    routeName: text(row.route_name),
    routeNumber: row.route_number === null ? null : text(row.route_number),
    bounds: {
      south: number(row.sw_lat),
      west: number(row.sw_lng),
      north: number(row.ne_lat),
      east: number(row.ne_lng),
    },
    paths,
  });
}
