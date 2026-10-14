import type { RestArea } from "./rest-areas.ts";
import type { GasStation } from "./gas-stations.ts";
export type PlaceView = "all" | "rest" | "station";
export type MapPlace = { kind: "rest"; key: string; record: RestArea } | { kind: "station"; key: string; record: GasStation };
export const restPlace = (record: RestArea): MapPlace => ({ kind: "rest", key: `rest:${record.id}`, record });
export const stationPlace = (record: GasStation): MapPlace => ({ kind: "station", key: `station:${record.brand}:${record.siteCode}`, record });
export function placeSummary(places: MapPlace[]) {
  const rest = places.filter((place) => place.kind === "rest").length;
  const lounge = places.filter((place) => place.kind === "rest" && place.record.facilities.has_truck_lounge === true).length;
  return { total: places.length, rest, station: places.length - rest, lounge };
}
export function filterStations<T extends GasStation>(stations: T[], query: string, services: (keyof GasStation["services"])[]) {
  const terms = query.trim().toLocaleLowerCase("ko-KR").split(/\s+/).filter(Boolean);
  return stations.filter((station) => {
    const haystack = `${station.name} ${station.address ?? ""} ${station.detailAddress ?? ""}`.toLocaleLowerCase("ko-KR");
    return terms.every((term) => haystack.includes(term)) && services.every((key) => station.services[key] === true);
  });
}
