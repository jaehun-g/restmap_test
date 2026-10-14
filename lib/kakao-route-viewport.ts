import type { HighwayRoute } from "./highway-routes.ts";
import type { KakaoMap, KakaoMaps } from "./kakao-sdk.ts";
import { hasCoordinates } from "./rest-areas.ts";
import type { LocatedItem } from "./geo-search.ts";

/** 조회 중에는 휴게소, 조회 성공 후에는 노선 전체로 맞추고 이후 필터 변경에서는 시점을 유지합니다. */
export function createHighwayRouteViewport(sdk: KakaoMaps, map: KakaoMap) {
  let selectedName: string | null = null;
  let fittedResults = false;
  let fittedRoute = false;

  return {
    update(
      routeName: string | null,
      route: HighwayRoute | null,
      areas: LocatedItem[],
      move: (action: () => void) => void = (action) => action(),
      force = false,
    ) {
      if (routeName !== selectedName) {
        selectedName = routeName;
        fittedResults = false;
        fittedRoute = false;
      }
      if (!routeName) return;
      const selectedRoute = route?.routeName === routeName ? route : null;
      if (!force && (fittedRoute || (!selectedRoute && fittedResults))) return;
      const positioned = areas.filter(hasCoordinates);
      if (!selectedRoute && !positioned.length) return;
      const bounds = new sdk.LatLngBounds();
      if (selectedRoute) {
        const { south, west, north, east } = selectedRoute.bounds;
        bounds.extend(new sdk.LatLng(south, west));
        bounds.extend(new sdk.LatLng(north, east));
        fittedRoute = true;
      }
      positioned.forEach((area) =>
        bounds.extend(new sdk.LatLng(area.latitude, area.longitude)),
      );
      fittedResults = true;
      move(() => {
        if (!selectedRoute && positioned.length === 1) {
          map.setCenter(
            new sdk.LatLng(positioned[0].latitude, positioned[0].longitude),
          );
          map.setLevel(6);
        } else map.setBounds(bounds, 65, 45, 65, 45);
      });
    },
  };
}
