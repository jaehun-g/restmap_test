import {distanceMeters, isGeoPoint, type GeoBounds, type GeoPoint} from "./geo-search.ts";
import type {HighwayCoordinate} from "./highway-routes.ts";
import {expandedBounds} from "./route-proximity.ts";
import {hasCoordinates, type RestArea, type Result} from "./rest-areas.ts";

export type DrivingRoute = {
  id: string;
  label: string;
  summaryRoad: string | null;
  distanceMeters: number;
  durationSeconds: number;
  bounds: GeoBounds;
  path: HighwayCoordinate[];
};

export type RouteRestAreaMatch = {
  area: RestArea;
  alongMeters: number;
  offsetMeters: number;
};

export const minDrivingRouteDistanceMeters = 3000;
export const tooCloseDirectionsMessage = "3km 이내의 거리는 경로 안내를 제공하지 않습니다.";

const earthRadius = 6_371_008.8;
const radians = (value: number) => (value * Math.PI) / 180;

function bearing(from: GeoPoint, to: GeoPoint) {
  const delta = radians(to.longitude - from.longitude);
  const left = radians(from.latitude);
  const right = radians(to.latitude);
  return Math.atan2(
    Math.sin(delta) * Math.cos(right),
    Math.cos(left) * Math.sin(right) - Math.sin(left) * Math.cos(right) * Math.cos(delta),
  );
}

function parseCoordinate(raw: string | null): number {
  if (raw === null || raw.trim() === "") return Number.NaN;
  return Number(raw);
}

export function parseDirectionsQuery(
  params: URLSearchParams,
): Result<{origin: GeoPoint; destination: GeoPoint}> {
  const origin = {
    latitude: parseCoordinate(params.get("originLat")),
    longitude: parseCoordinate(params.get("originLng")),
  };
  const destination = {
    latitude: parseCoordinate(params.get("destLat")),
    longitude: parseCoordinate(params.get("destLng")),
  };
  if (!isGeoPoint(origin) || !isGeoPoint(destination)) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "출발지 또는 목적지 좌표가 올바르지 않습니다.",
      },
    };
  }
  if (distanceMeters(origin, destination) <= minDrivingRouteDistanceMeters) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: tooCloseDirectionsMessage,
      },
    };
  }
  return {ok: true, value: {origin, destination}};
}

function computeBounds(path: readonly HighwayCoordinate[]): GeoBounds {
  let south = Infinity;
  let north = -Infinity;
  let west = Infinity;
  let east = -Infinity;
  for (const [lat, lng] of path) {
    if (lat < south) south = lat;
    if (lat > north) north = lat;
    if (lng < west) west = lng;
    if (lng > east) east = lng;
  }
  return {south, north, west, east};
}

type RawRoad = {
  name?: unknown;
  distance?: unknown;
  vertexes?: unknown;
};

type RawRoute = {
  result_code?: unknown;
  result_msg?: unknown;
  summary?: {distance?: unknown; duration?: unknown};
  sections?: Array<{roads?: RawRoad[]}>;
};

function extractMajorRoadName(sections: Array<{roads?: RawRoad[]}>): string | null {
  const distancesByRoad = new Map<string, number>();
  for (const section of sections) {
    const roads = Array.isArray(section?.roads) ? section.roads : [];
    for (const road of roads) {
      const name = typeof road?.name === "string" ? road.name.trim() : "";
      if (!name || name === "일반도로") continue;
      const dist = Number(road?.distance);
      distancesByRoad.set(
        name,
        (distancesByRoad.get(name) ?? 0) + (Number.isFinite(dist) && dist > 0 ? dist : 1),
      );
    }
  }
  let bestName: string | null = null;
  let bestDistance = 0;
  for (const [name, total] of distancesByRoad) {
    if (total > bestDistance) {
      bestDistance = total;
      bestName = name;
    }
  }
  return bestName;
}

export function parseKakaoDirectionsRoutes(
  payload: unknown,
): Result<DrivingRoute[]> {
  if (!payload || typeof payload !== "object") {
    return {
      ok: false,
      error: {code: "UPSTREAM_ERROR", message: "길찾기 응답 형식이 올바르지 않습니다."},
    };
  }
  const rawRoutes = (payload as {routes?: unknown}).routes;
  if (!Array.isArray(rawRoutes) || rawRoutes.length === 0) {
    return {
      ok: false,
      error: {code: "NOT_FOUND", message: "탐색된 도로 경로가 없습니다."},
    };
  }

  const parsedRoutes: DrivingRoute[] = [];
  let firstErrorMsg: string | null = null;

  for (const raw of rawRoutes as RawRoute[]) {
    if (typeof raw?.result_code === "number" && raw.result_code !== 0) {
      if (!firstErrorMsg && typeof raw.result_msg === "string" && raw.result_msg.trim()) {
        firstErrorMsg = raw.result_msg.trim();
      }
      continue;
    }
    const distance = Number(raw?.summary?.distance);
    const duration = Number(raw?.summary?.duration);
    if (!Number.isFinite(distance) || distance < 0 || !Number.isFinite(duration) || duration < 0) {
      continue;
    }
    const path: HighwayCoordinate[] = [];
    const sections = Array.isArray(raw.sections) ? raw.sections : [];
    for (const section of sections) {
      const roads = Array.isArray(section?.roads) ? section.roads : [];
      for (const road of roads) {
        const vertexes = road?.vertexes;
        if (!Array.isArray(vertexes)) continue;
        for (let index = 0; index + 1 < vertexes.length; index += 2) {
          const lng = Number(vertexes[index]);
          const lat = Number(vertexes[index + 1]);
          if (!isGeoPoint({latitude: lat, longitude: lng})) continue;
          const prev = path[path.length - 1];
          if (prev && Math.abs(prev[0] - lat) < 1e-7 && Math.abs(prev[1] - lng) < 1e-7) continue;
          path.push([lat, lng]);
        }
      }
    }
    if (path.length < 2) continue;

    const roundedDist = Math.round(distance);
    const roundedDur = Math.round(duration);
    const summaryRoad = extractMajorRoadName(sections);

    // 완전히 동일한 경로 중복 제거
    const isDuplicate = parsedRoutes.some(
      existing =>
        Math.abs(existing.distanceMeters - roundedDist) < 50 &&
        Math.abs(existing.durationSeconds - roundedDur) < 15 &&
        existing.summaryRoad === summaryRoad,
    );
    if (isDuplicate) continue;

    const index = parsedRoutes.length;
    parsedRoutes.push({
      id: `route-${index}`,
      label: index === 0 ? "추천 경로" : `대안 경로 ${index}`,
      summaryRoad,
      distanceMeters: roundedDist,
      durationSeconds: roundedDur,
      bounds: computeBounds(path),
      path,
    });
  }

  if (parsedRoutes.length === 0) {
    return {
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: firstErrorMsg ?? "도로 경로를 찾을 수 없습니다.",
      },
    };
  }

  const validDistanceRoutes = parsedRoutes.filter(
    route => route.distanceMeters > minDrivingRouteDistanceMeters,
  );
  if (validDistanceRoutes.length === 0) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: tooCloseDirectionsMessage,
      },
    };
  }

  // 대안 경로 중 최단시간/최단거리가 추천 경로와 다른 경우 보조 라벨 부여
  if (validDistanceRoutes.length > 1) {
    let minDurationIdx = 0;
    let minDistanceIdx = 0;
    for (let i = 1; i < validDistanceRoutes.length; i++) {
      if (validDistanceRoutes[i].durationSeconds < validDistanceRoutes[minDurationIdx].durationSeconds) {
        minDurationIdx = i;
      }
      if (validDistanceRoutes[i].distanceMeters < validDistanceRoutes[minDistanceIdx].distanceMeters) {
        minDistanceIdx = i;
      }
    }
    if (minDurationIdx > 0) {
      validDistanceRoutes[minDurationIdx] = {
        ...validDistanceRoutes[minDurationIdx],
        label: "최단시간",
      };
    }
    if (minDistanceIdx > 0 && minDistanceIdx !== minDurationIdx) {
      validDistanceRoutes[minDistanceIdx] = {
        ...validDistanceRoutes[minDistanceIdx],
        label: "최단거리",
      };
    }
  }

  return {ok: true, value: validDistanceRoutes};
}

export function parseKakaoDirectionsResponse(
  payload: unknown,
): Result<DrivingRoute> {
  const result = parseKakaoDirectionsRoutes(payload);
  if (!result.ok) return result;
  return {ok: true, value: result.value[0]};
}

const cacheTtlMs = 5 * 60 * 1000;
const maxCacheEntries = 200;
const routeCache = new Map<string, {expiresAt: number; routes: DrivingRoute[]}>();

export function directionsCacheKey(origin: GeoPoint, destination: GeoPoint): string {
  return `${origin.latitude.toFixed(4)},${origin.longitude.toFixed(4)}->${destination.latitude.toFixed(4)},${destination.longitude.toFixed(4)}`;
}

export async function fetchDrivingRoutes(
  origin: GeoPoint,
  destination: GeoPoint,
  fetchImpl: typeof fetch = fetch,
): Promise<Result<DrivingRoute[]>> {
  const apiKey = process.env.KAKAO_REST_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      error: {
        code: "CONFIG_ERROR",
        message: "KAKAO_REST_API_KEY가 설정되지 않았습니다.",
      },
    };
  }
  if (distanceMeters(origin, destination) <= minDrivingRouteDistanceMeters) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: tooCloseDirectionsMessage,
      },
    };
  }
  const key = directionsCacheKey(origin, destination);
  const cached = routeCache.get(key);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return {ok: true, value: cached.routes};
  }
  const url = new URL("https://apis-navi.kakaomobility.com/v1/directions");
  url.searchParams.set("origin", `${origin.longitude},${origin.latitude}`);
  url.searchParams.set("destination", `${destination.longitude},${destination.latitude}`);
  url.searchParams.set("priority", "RECOMMEND");
  url.searchParams.set("alternatives", "true");

  try {
    const response = await fetchImpl(url, {
      headers: {
        Authorization: `KakaoAK ${apiKey}`,
      },
      cache: "no-store",
    });
    if (!response.ok) {
      return {
        ok: false,
        error: {
          code: "UPSTREAM_ERROR",
          message: `길찾기 경로를 조회하지 못했습니다 (${response.status}).`,
        },
      };
    }
    const payload: unknown = await response.json();
    const parsed = parseKakaoDirectionsRoutes(payload);
    if (parsed.ok) {
      if (routeCache.size >= maxCacheEntries) {
        const oldestKey = routeCache.keys().next().value;
        if (oldestKey) routeCache.delete(oldestKey);
      }
      routeCache.set(key, {expiresAt: now + cacheTtlMs, routes: parsed.value});
    }
    return parsed;
  } catch {
    return {
      ok: false,
      error: {
        code: "UPSTREAM_ERROR",
        message: "길찾기 서버와 통신하지 못했습니다.",
      },
    };
  }
}

export async function fetchDrivingRoute(
  origin: GeoPoint,
  destination: GeoPoint,
  fetchImpl: typeof fetch = fetch,
): Promise<Result<DrivingRoute>> {
  const result = await fetchDrivingRoutes(origin, destination, fetchImpl);
  if (!result.ok) return result;
  return {ok: true, value: result.value[0]};
}

/**
 * 주행 경로 폴리라인을 따라 반경 내 장소들을 출발지→목적지 진행 순서대로 반환합니다.
 */
export function findItemsAlongDrivingRoute<
  T extends {latitude: number | null; longitude: number | null},
>(
  route: Pick<DrivingRoute, "bounds" | "path">,
  items: readonly T[],
  maxDistanceMeters = 1500,
): Array<{item: T; alongMeters: number; offsetMeters: number}> {
  if (route.path.length < 2) return [];
  const routeEnvelope = expandedBounds(route.bounds, maxDistanceMeters + 200);
  let cumulative = 0;
  const segments = route.path.slice(1).map(([latitude, longitude], index) => {
    const start = {latitude: route.path[index][0], longitude: route.path[index][1]};
    const end = {latitude, longitude};
    const length = distanceMeters(start, end);
    const startAlong = cumulative;
    cumulative += length;
    return {
      start,
      end,
      length,
      startAlong,
      bearing: bearing(start, end),
      bounds: expandedBounds(
        {
          south: Math.min(start.latitude, end.latitude),
          north: Math.max(start.latitude, end.latitude),
          west: Math.min(start.longitude, end.longitude),
          east: Math.max(start.longitude, end.longitude),
        },
        maxDistanceMeters + 100,
      ),
    };
  });

  const matches: Array<{item: T; alongMeters: number; offsetMeters: number}> = [];
  for (const item of items) {
    if (!hasCoordinates(item)) continue;
    if (
      item.latitude < routeEnvelope.south ||
      item.latitude > routeEnvelope.north ||
      item.longitude < routeEnvelope.west ||
      item.longitude > routeEnvelope.east
    ) {
      continue;
    }
    const point = {latitude: item.latitude, longitude: item.longitude};
    let bestOffset = Infinity;
    let bestAlong = 0;
    for (const segment of segments) {
      const bounds = segment.bounds;
      if (
        point.latitude < bounds.south ||
        point.latitude > bounds.north ||
        point.longitude < bounds.west ||
        point.longitude > bounds.east
      ) {
        continue;
      }
      const startDistance = distanceMeters(segment.start, point);
      if (segment.length < 1e-6) {
        if (startDistance < bestOffset) {
          bestOffset = startDistance;
          bestAlong = segment.startAlong;
        }
        continue;
      }
      const delta = startDistance / earthRadius;
      const angle = bearing(segment.start, point) - segment.bearing;
      const along = Math.atan2(Math.sin(delta) * Math.cos(angle), Math.cos(delta)) * earthRadius;
      const clampedAlong = Math.max(0, Math.min(segment.length, along));
      const distance =
        along <= 0
          ? startDistance
          : along >= segment.length
            ? distanceMeters(segment.end, point)
            : Math.abs(Math.asin(Math.max(-1, Math.min(1, Math.sin(delta) * Math.sin(angle))))) *
              earthRadius;
      if (distance < bestOffset) {
        bestOffset = distance;
        bestAlong = segment.startAlong + clampedAlong;
      }
    }
    if (bestOffset <= maxDistanceMeters + 1e-6) {
      matches.push({
        item,
        alongMeters: Math.round(bestAlong),
        offsetMeters: Math.round(bestOffset),
      });
    }
  }
  return matches.sort((left, right) => left.alongMeters - right.alongMeters);
}

/**
 * 주행 경로 폴리라인을 따라 반경 내 휴게소를 출발지→목적지 진행 순서대로 반환합니다.
 */
export function findRestAreasAlongDrivingRoute(
  route: Pick<DrivingRoute, "bounds" | "path">,
  areas: readonly RestArea[],
  maxDistanceMeters = 1500,
  excludeRestAreaId?: number | null,
): RouteRestAreaMatch[] {
  const filtered =
    excludeRestAreaId != null
      ? areas.filter(area => area.id !== excludeRestAreaId)
      : areas;
  return findItemsAlongDrivingRoute(route, filtered, maxDistanceMeters).map(
    ({item, alongMeters, offsetMeters}) => ({
      area: item,
      alongMeters,
      offsetMeters,
    }),
  );
}

/** 출발·도착 휴게소는 지도에 유지하고 경유 휴게소 개수와 목록에서만 제외합니다. */
export function collectRouteRestAreas(
  route: Pick<DrivingRoute, "bounds" | "path">,
  areas: readonly RestArea[],
  endpoints: {originRestAreaId?: number | null; destinationRestAreaId?: number | null} = {},
) {
  const matches = findRestAreasAlongDrivingRoute(
    route,
    areas.filter(area => area.operationStatus !== "closed"),
  );
  const stops = matches.filter(({area}) =>
    area.id !== endpoints.originRestAreaId && area.id !== endpoints.destinationRestAreaId,
  );
  return {matches, stops};
}
