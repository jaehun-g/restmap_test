import type {
  KakaoMap,
  KakaoMaps,
  KakaoMarker,
} from "./kakao-sdk.ts";
import type { PlaceSearchItem } from "./place-search.ts";

export function createGeneralPlaceLayer(
  sdk: KakaoMaps,
  map: KakaoMap,
) {
  let marker: KakaoMarker | null = null;
  let activeId: string | null = null;
  let disposed = false;

  const markerImage = new sdk.MarkerImage(
    "/marker-selected.svg",
    new sdk.Size(36, 42),
    { offset: new sdk.Point(18, 41) },
  );

  function clear() {
    if (typeof document !== "undefined") {
      document.querySelectorAll(".general-place-map-card").forEach(el => {
        el.remove();
      });
    }
    if (marker) {
      marker.setMap(null);
      marker = null;
    }
    activeId = null;
  }

  return {
    update(
      place: PlaceSearchItem | null,
      panToPlace = false,
    ) {
      if (disposed) return;
      if (typeof document !== "undefined") {
        document.querySelectorAll(".general-place-map-card").forEach(el => {
          el.remove();
        });
      }
      if (!place) {
        clear();
        return;
      }

      const pos = new sdk.LatLng(place.latitude, place.longitude);
      const isNewPlace = activeId !== place.id;
      activeId = place.id;

      if (!marker) {
        marker = new sdk.Marker({
          map,
          position: pos,
          title: place.name,
          clickable: false,
          image: markerImage,
        });
        marker.setZIndex(6);
      } else if (isNewPlace) {
        marker.setMap(null);
        marker = new sdk.Marker({
          map,
          position: pos,
          title: place.name,
          clickable: false,
          image: markerImage,
        });
        marker.setZIndex(6);
      }

      if (panToPlace && isNewPlace) {
        map.setCenter(pos);
        if (map.getLevel() > 6) {
          map.setLevel(6);
        }
      }
    },
    dispose() {
      disposed = true;
      clear();
    },
  };
}
