import {createPlaceMarkers} from "./kakao-place-markers.ts";
import {restPlace} from "./map-places.ts";
import type {RestArea} from "./rest-areas.ts";
import type {KakaoMap, KakaoMaps} from "./kakao-sdk.ts";

export function createRestAreaMarkers(
  sdk: KakaoMaps,
  map: KakaoMap,
  areas: RestArea[],
  onSelect: (id: number) => void,
  createCard: (area: RestArea) => HTMLElement,
  viewport?: () => DOMRect,
) {
  const layer = createPlaceMarkers(
    sdk,
    map,
    areas.map(restPlace),
    place => onSelect(place.record.id),
    place => createCard(place.record as RestArea),
    viewport,
  );
  return {
    ...layer,
    select(id: number | null, showCard = true, move = true) {
      layer.select(id === null ? null : `rest:${id}`, showCard, move);
    },
  };
}
