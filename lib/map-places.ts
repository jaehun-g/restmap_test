import type {RestArea} from "./rest-areas.ts";
import type {GasStation} from "./gas-stations.ts";
export type PlaceView = "all" | "rest" | "station";
export type MapPlace =
  | {kind: "rest"; key: string; record: RestArea}
  | {kind: "station"; key: string; record: GasStation};
export const restPlace = (record: RestArea): MapPlace => ({
  kind: "rest",
  key: `rest:${record.id}`,
  record,
});
export const stationPlace = (record: GasStation): MapPlace => ({
  kind: "station",
  key: `station:${record.brand}:${record.siteCode}`,
  record,
});
export function placeSummary(places: MapPlace[]) {
  const rest = places.filter(place => place.kind === "rest").length;
  const lounge = places.filter(
    place => place.kind === "rest" && place.record.facilities.has_truck_lounge === true,
  ).length;
  return {total: places.length, rest, station: places.length - rest, lounge};
}
const placeRank = (place: MapPlace) =>
  place.kind === "station" ? 2 : place.record.facilities.has_truck_lounge === true ? 0 : 1;
/** 클러스터 목록용 정렬: 라운지 휴게소 → 일반 휴게소 → 주유소, 같은 그룹은 이름순. 원본은 변경하지 않습니다. */
export function sortPlacesForList(places: MapPlace[]): MapPlace[] {
  return [...places].sort(
    (a, b) => placeRank(a) - placeRank(b) || a.record.name.localeCompare(b.record.name, "ko-KR"),
  );
}
export function filterStations<T extends GasStation>(
  stations: T[],
  query: string,
  services: (keyof GasStation["services"])[],
) {
  const terms = query.trim().toLocaleLowerCase("ko-KR").split(/\s+/).filter(Boolean);
  return stations.filter(station => {
    const haystack =
      `${station.name} ${station.address ?? ""} ${station.detailAddress ?? ""}`.toLocaleLowerCase(
        "ko-KR",
      );
    return (
      terms.every(term => haystack.includes(term)) &&
      services.every(key => station.services[key] === true)
    );
  });
}
