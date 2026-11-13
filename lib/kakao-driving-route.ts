import type {DrivingRoute} from "./directions.ts";
import type {KakaoMap, KakaoMaps, KakaoOverlay, KakaoPolyline} from "./kakao-sdk.ts";

export function createDrivingRouteLayer(
  sdk: KakaoMaps,
  map: KakaoMap,
  onSelectRoute?: (index: number) => void,
) {
  let activeRoutes: readonly DrivingRoute[] = [];
  let activeIndex = -1;
  let lines: {line: KakaoPolyline; click?: () => void}[] = [];
  let endpointOverlays: KakaoOverlay[] = [];
  let disposed = false;

  function clear() {
    for (const item of lines) {
      if (item.click) sdk.event.removeListener(item.line, "click", item.click);
      item.line.setMap(null);
    }
    lines = [];
    for (const overlay of endpointOverlays) {
      overlay.setMap(null);
    }
    endpointOverlays = [];
    activeRoutes = [];
    activeIndex = -1;
  }

  return {
    update(routes: readonly DrivingRoute[], selectedIndex = 0) {
      if (disposed || (routes === activeRoutes && selectedIndex === activeIndex)) return;
      clear();
      if (!routes.length) return;

      const resolvedIndex =
        selectedIndex >= 0 && selectedIndex < routes.length ? selectedIndex : 0;

      // 비선택 대안 경로를 먼저 그려 선택 경로 아래에 배치하고 클릭 시 해당 경로로 전환
      routes.forEach((route, index) => {
        if (index === resolvedIndex || route.path.length < 2) return;
        const path = [
          route.path.map(([latitude, longitude]) => new sdk.LatLng(latitude, longitude)),
        ];
        const casing = new sdk.Polyline({
          map,
          path,
          strokeWeight: 8,
          strokeColor: "#ffffff",
          strokeOpacity: 0.8,
          strokeStyle: "solid",
          zIndex: 1,
        });
        const stroke = new sdk.Polyline({
          map,
          path,
          strokeWeight: 5,
          strokeColor: "#94a3b8",
          strokeOpacity: 0.85,
          strokeStyle: "solid",
          clickable: true,
          zIndex: 1,
        });
        const click = () => {
          sdk.event.preventMap?.();
          onSelectRoute?.(index);
        };
        sdk.event.addListener(stroke, "click", click);
        lines.push({line: casing}, {line: stroke, click});
      });

      const selected = routes[resolvedIndex];
      if (selected && selected.path.length >= 2) {
        const path = [
          selected.path.map(([latitude, longitude]) => new sdk.LatLng(latitude, longitude)),
        ];
        lines.push(
          {
            line: new sdk.Polyline({
              map,
              path,
              strokeWeight: 9,
              strokeColor: "#ffffff",
              strokeOpacity: 0.85,
              strokeStyle: "solid",
              zIndex: 2,
            }),
          },
          {
            line: new sdk.Polyline({
              map,
              path,
              strokeWeight: 5,
              strokeColor: "#0865ff",
              strokeOpacity: 0.9,
              strokeStyle: "solid",
              zIndex: 2,
            }),
          },
        );

        const startCoord = selected.path[0];
        const endCoord = selected.path[selected.path.length - 1];
        if (sdk.CustomOverlay && startCoord && endCoord) {
          const startOverlay = new sdk.CustomOverlay({
            content: '<div class="route-endpoint-dot is-start" role="img" aria-label="출발"></div>',
            clickable: false,
            xAnchor: 0.5,
            yAnchor: 0.5,
            zIndex: 0,
          });
          startOverlay.setPosition(new sdk.LatLng(startCoord[0], startCoord[1]));
          startOverlay.setMap(map);

          const endOverlay = new sdk.CustomOverlay({
            content: '<div class="route-endpoint-dot is-end" role="img" aria-label="도착"></div>',
            clickable: false,
            xAnchor: 0.5,
            yAnchor: 0.5,
            zIndex: 0,
          });
          endOverlay.setPosition(new sdk.LatLng(endCoord[0], endCoord[1]));
          endOverlay.setMap(map);

          endpointOverlays.push(startOverlay, endOverlay);
        }
      }

      activeRoutes = routes;
      activeIndex = resolvedIndex;
    },
    fitBounds(routes: readonly DrivingRoute[]) {
      if (disposed || !routes.length) return;
      const bounds = new sdk.LatLngBounds();
      for (const route of routes) {
        bounds.extend(new sdk.LatLng(route.bounds.south, route.bounds.west));
        bounds.extend(new sdk.LatLng(route.bounds.north, route.bounds.east));
      }
      map.setBounds(bounds, 85, 45, 240, 45);
    },
    dispose() {
      disposed = true;
      clear();
    },
  };
}
