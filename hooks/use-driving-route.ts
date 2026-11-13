"use client";

import {useEffect, useState} from "react";
import {
  directionsCacheKey,
  minDrivingRouteDistanceMeters,
  tooCloseDirectionsMessage,
  type DrivingRoute,
} from "@/lib/directions";
import {distanceMeters, isGeoPoint, type GeoPoint} from "@/lib/geo-search";

const clientRouteCache = new Map<string, DrivingRoute[]>();
const emptyRoutes: DrivingRoute[] = [];

export function useDrivingRoute(
  origin: GeoPoint | null | undefined,
  destination: {latitude: number | null; longitude: number | null} | null | undefined,
  enabled = true,
) {
  const validOrigin = origin && isGeoPoint(origin) ? origin : null;
  const validDestination =
    destination &&
    typeof destination.latitude === "number" &&
    typeof destination.longitude === "number" &&
    isGeoPoint({latitude: destination.latitude, longitude: destination.longitude})
      ? {latitude: destination.latitude, longitude: destination.longitude}
      : null;

  const tooClose = Boolean(
    enabled &&
      validOrigin &&
      validDestination &&
      distanceMeters(validOrigin, validDestination) <= minDrivingRouteDistanceMeters,
  );

  const key =
    enabled && !tooClose && validOrigin && validDestination
      ? directionsCacheKey(validOrigin, validDestination)
      : null;

  const [attempt, setAttempt] = useState(0);
  const [selection, setSelection] = useState<{key: string | null; index: number}>({
    key: null,
    index: 0,
  });
  const [fetched, setFetched] = useState<{
    key: string;
    attempt: number;
    routes: DrivingRoute[];
    error: string | null;
  } | null>(null);

  const cached = key ? (clientRouteCache.get(key) ?? null) : null;
  const originLat = validOrigin?.latitude ?? null;
  const originLng = validOrigin?.longitude ?? null;
  const destLat = validDestination?.latitude ?? null;
  const destLng = validDestination?.longitude ?? null;

  useEffect(() => {
    if (
      !key ||
      originLat === null ||
      originLng === null ||
      destLat === null ||
      destLng === null ||
      clientRouteCache.has(key)
    ) {
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({
      originLat: String(originLat),
      originLng: String(originLng),
      destLat: String(destLat),
      destLng: String(destLng),
    });
    void fetch(`/api/directions?${params.toString()}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async response => {
        const body = (await response.json()) as {
          route?: DrivingRoute;
          routes?: DrivingRoute[];
          error?: {message?: string};
        };
        const resolved = Array.isArray(body.routes) && body.routes.length > 0
          ? body.routes
          : body.route
            ? [body.route]
            : [];
        if (!response.ok || resolved.length === 0) {
          throw new Error(body.error?.message || "실도로 경로를 불러오지 못했습니다.");
        }
        clientRouteCache.set(key, resolved);
        if (!controller.signal.aborted) {
          setFetched({key, attempt, routes: resolved, error: null});
        }
      })
      .catch(reason => {
        if (!controller.signal.aborted) {
          setFetched({
            key,
            attempt,
            routes: emptyRoutes,
            error:
              reason instanceof Error ? reason.message : "실도로 경로를 불러오지 못했습니다.",
          });
        }
      });
    return () => controller.abort();
  }, [key, attempt, originLat, originLng, destLat, destLng]);

  const isCurrent = Boolean(key && fetched?.key === key && fetched.attempt === attempt);
  const routes = cached ?? (isCurrent ? fetched!.routes : emptyRoutes);
  const selectedIndex =
    selection.key === key && selection.index >= 0 && selection.index < routes.length
      ? selection.index
      : 0;
  const route = routes[selectedIndex] ?? routes[0] ?? null;
  const error = tooClose
    ? tooCloseDirectionsMessage
    : isCurrent
      ? fetched!.error
      : null;
  const loading = Boolean(key && !cached && !isCurrent);

  return {
    routes,
    route,
    selectedIndex,
    selectRoute: (index: number) => {
      if (key) setSelection({key, index});
    },
    loading,
    error,
    tooClose: tooClose || error === tooCloseDirectionsMessage,
    retry: () => setAttempt(value => value + 1),
  };
}
