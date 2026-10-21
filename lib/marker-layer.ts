import type {MapPlace} from "./map-places.ts";

/** 지도 카메라 이벤트로 새 배열이 만들어져도 마커의 실제 표시 단위가 같으면 레이어를 재사용한다. */
export function markerLayerSignature(places: readonly MapPlace[]): string {
  return JSON.stringify(
    places.map(place => {
      const {record} = place;
      const lounge = place.kind === "rest" && place.record.facilities.has_truck_lounge === true ? "l" : "";
      const food = place.kind === "rest" ? place.record.foodMenuSummary : undefined;
      return [place.key, record.name, record.latitude, record.longitude, lounge,
        food?.count ?? 0, food?.featured.map(item => [item.key, item.name, item.price, item.recommended, item.best]) ?? []];
    }),
  );
}
