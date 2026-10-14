import type { HighwayRoute } from "./highway-routes.ts";
import type { KakaoMap, KakaoMaps, KakaoPolyline } from "./kakao-sdk.ts";

export function createHighwayRouteLayer(sdk: KakaoMaps, map: KakaoMap) {
  let active: HighwayRoute | null = null;
  let lines: KakaoPolyline[] = [];
  let disposed = false;
  function clear() {
    lines.forEach((line) => line.setMap(null));
    lines = [];
    active = null;
  }
  return {
    update(route: HighwayRoute | null) {
      if (disposed || route === active) return;
      clear();
      if (!route) return;
      const path = route.paths.map((segment) =>
        segment.map(([latitude, longitude]) => new sdk.LatLng(latitude, longitude)),
      );
      lines.push(
        new sdk.Polyline({
          map,
          path,
          strokeWeight: 9,
          strokeColor: "#ffffff",
          strokeOpacity: 0.85,
          strokeStyle: "solid",
          zIndex: 0,
        }),
      );
      lines.push(
        new sdk.Polyline({
          map,
          path,
          strokeWeight: 5,
          strokeColor: "#0865ff",
          strokeOpacity: 0.9,
          strokeStyle: "solid",
          zIndex: 0,
        }),
      );
      active = route;
    },
    dispose() {
      disposed = true;
      clear();
    },
  };
}
