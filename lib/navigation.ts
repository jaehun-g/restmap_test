import {distanceMeters, isGeoPoint, type GeoPoint} from "./geo-search.ts";

export type NavigationTarget = {
  key: string;
  name: string;
  latitude: number;
  longitude: number;
  restAreaId?: number | null;
  stationId?: string | null;
};

export type MapCardNavigation = {
  distanceText?: string | null;
  active?: boolean;
  label?: string | null;
  onNavigate?: () => void;
};

export type PlaceDistanceSummary = {
  badgeText: string;
  detailText: string;
  isRoad: boolean;
};

export type NavigationProvider = "tmap" | "kakaonavi" | "navermap" | "kakaomap";

export type NavigationProviderOption = {
  id: NavigationProvider;
  label: string;
  description: string;
};

export const navigationProviderOptions: readonly NavigationProviderOption[] = [
  {id: "tmap", label: "T맵", description: "T맵 네비게이션 앱으로 안내 시작"},
  {id: "kakaonavi", label: "카카오내비", description: "카카오내비·카카오맵 앱으로 안내 시작"},
  {id: "navermap", label: "네이버지도", description: "네이버지도 길찾기로 연결"},
  {id: "kakaomap", label: "카카오맵", description: "카카오맵 웹·앱 길찾기로 연결"},
];

const preferredNavigationStorageKey = "next-map-test:preferred-nav-provider";

export function isNavigationProvider(value: unknown): value is NavigationProvider {
  return (
    value === "tmap" ||
    value === "kakaonavi" ||
    value === "navermap" ||
    value === "kakaomap"
  );
}

export function getPreferredNavigationProvider(): NavigationProvider | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(preferredNavigationStorageKey);
    return isNavigationProvider(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function setPreferredNavigationProvider(provider: NavigationProvider | null): void {
  if (typeof window === "undefined") return;
  try {
    if (provider) {
      window.localStorage.setItem(preferredNavigationStorageKey, provider);
    } else {
      window.localStorage.removeItem(preferredNavigationStorageKey);
    }
  } catch {
    // Ignore storage quota or privacy mode errors
  }
}

export function kakaoDirectionsUrl(
  target: Pick<NavigationTarget, "name" | "latitude" | "longitude">,
  origin?: GeoPoint | null,
): string {
  const destName = encodeURIComponent(target.name.trim() || "목적지");
  const destCoord = `${target.latitude},${target.longitude}`;
  if (origin && isGeoPoint(origin)) {
    const originName = encodeURIComponent("내 위치");
    const originCoord = `${origin.latitude},${origin.longitude}`;
    return `https://map.kakao.com/link/from/${originName},${originCoord}/to/${destName},${destCoord}`;
  }
  return `https://map.kakao.com/link/to/${destName},${destCoord}`;
}

export function navigationProviderUrl(
  provider: NavigationProvider,
  target: Pick<NavigationTarget, "name" | "latitude" | "longitude">,
  origin?: GeoPoint | null,
  isMobile = false,
): string {
  const name = encodeURIComponent(target.name.trim() || "목적지");
  const lat = target.latitude;
  const lng = target.longitude;
  const validOrigin = origin && isGeoPoint(origin) ? origin : null;

  switch (provider) {
    case "tmap":
      return `tmap://route?goalname=${name}&goalx=${lng}&goaly=${lat}`;
    case "kakaonavi":
      if (isMobile) {
        return `kakaonavi://navigate?name=${name}&x=${lng}&y=${lat}&coord_type=wgs84`;
      }
      return kakaoDirectionsUrl(target, validOrigin);
    case "navermap":
      if (isMobile) {
        const originQuery = validOrigin
          ? `slat=${validOrigin.latitude}&slng=${validOrigin.longitude}&sname=${encodeURIComponent("내 위치")}&`
          : "";
        return `nmap://route/car?${originQuery}dlat=${lat}&dlng=${lng}&dname=${name}&appname=next-map-test`;
      }
      return `https://map.naver.com/p/search/${name}`;
    case "kakaomap":
      return kakaoDirectionsUrl(target, validOrigin);
  }
}

export function launchNavigationApp(
  provider: NavigationProvider,
  target: Pick<NavigationTarget, "name" | "latitude" | "longitude">,
  origin?: GeoPoint | null,
): void {
  if (typeof window === "undefined") return;
  const isMobile = /Android|iPhone|iPad|iPod/i.test(window.navigator?.userAgent ?? "");
  const url = navigationProviderUrl(provider, target, origin, isMobile);
  if (url.startsWith("http://") || url.startsWith("https://")) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  window.location.href = url;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  if (seconds < 60) return "1분 미만";
  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  if (totalMinutes < 60) return `약 ${totalMinutes}분`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `약 ${hours}시간 ${minutes}분` : `약 ${hours}시간`;
}

export function formatDurationParts(seconds: number): {hours: number; minutes: number} {
  if (!Number.isFinite(seconds) || seconds <= 0) return {hours: 0, minutes: 1};
  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  return {
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
  };
}

export function formatPlaceDistance(
  target: {latitude: number | null; longitude: number | null},
  origin?: GeoPoint | null,
): PlaceDistanceSummary | null {
  if (
    !origin ||
    !isGeoPoint(origin) ||
    typeof target.latitude !== "number" ||
    typeof target.longitude !== "number" ||
    !isGeoPoint({latitude: target.latitude, longitude: target.longitude})
  ) {
    return null;
  }
  const straightMeters = distanceMeters(origin, {
    latitude: target.latitude,
    longitude: target.longitude,
  });
  const distance = `${(straightMeters / 1000).toLocaleString("ko-KR", {maximumFractionDigits: 1})} km`;
  return {
    badgeText: distance,
    detailText: `내 위치에서 ${distance}`,
    isRoad: false,
  };
}
