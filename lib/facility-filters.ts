import {isBidirectionalDirection, linkedStationsByArea, mergeFacilityPlaces, normalizedDirection, type FacilityPlaces} from "./facility-places.ts";
import {filterRestAreas, type RestAreaFilters} from "./rest-area-filters.ts";
import {filterStations} from "./map-places.ts";
import {filterByGeoScope, type GeoPoint, type GeoSearchScope} from "./geo-search.ts";
import {canonicalHighwayRouteName} from "./highway-route-name.ts";
import type {GasStation, StationServiceKey} from "./gas-stations.ts";
import type {RestArea} from "./rest-areas.ts";

/** 검색·필터보다 먼저 시설을 통합하여 같은 장소가 주유소 마커로 분리되는 것을 방지한다. */
export function filterFacilityPlaces<A extends RestArea, T extends GasStation>(
  areas: A[],
  stations: T[],
  options: {
    filters: RestAreaFilters;
    query: string;
    stationServices: StationServiceKey[];
    scope: GeoSearchScope;
    position: GeoPoint | null;
  },
  merged: FacilityPlaces<T, A> = mergeFacilityPlaces(areas, stations),
): FacilityPlaces<T, A> {
  const {filters, query, stationServices, scope, position} = options;
  const linkedByArea = linkedStationsByArea(merged.facilities, merged.stations);
  const areaById = new Map(areas.map(area => [area.id, area]));
  const matchesStationDirection = (station: FacilityPlaces<T, A>["stations"][number]) => {
    if (!filters.direction) return true;
    const area = station.linkedRestAreaId === null ? undefined : areaById.get(station.linkedRestAreaId);
    const linkedDirection = area ? normalizedDirection(area.directionLabel ?? area.routeDirection) : null;
    if (linkedDirection !== null && !isBidirectionalDirection(linkedDirection)) return linkedDirection === filters.direction;
    return isBidirectionalDirection(station.direction) || normalizedDirection(station.direction) === filters.direction;
  };
  const searchScope = filters.routeName ? {kind: "all" as const} : scope;
  const eligible = new Set(filterByGeoScope(filterRestAreas(areas, filters, ""), searchScope, position).map(area => area.id));
  const terms = query.trim().toLocaleLowerCase("ko-KR").split(/\s+/).filter(Boolean);
  const stationText = (station: T) =>
    `${station.name} ${station.routeName ?? ""} ${station.direction ?? ""} ${station.address ?? ""} ${station.detailAddress ?? ""}`;
  const matches = (text: string) => {
    const haystack = text.toLocaleLowerCase("ko-KR");
    return terms.every(term => haystack.includes(term));
  };
  const facilities = merged.facilities.filter(({area}) => {
    const linked = linkedByArea.get(area.id) ?? [];
    return (
      eligible.has(area.id) &&
      (!stationServices.length || filterStations(linked, "", stationServices).length > 0) &&
      matches(`${area.name} ${area.routeName ?? ""} ${area.directionLabel ?? area.routeDirection ?? ""} ${linked.map(stationText).join(" ")}`)
    );
  });
  const restOnly = filters.missingRoute || filters.facilities.length > 0 || filters.lounge !== "all";
  const visibleStations = restOnly ? [] : filterByGeoScope(
    filterStations(merged.stations, "", stationServices).filter(station =>
      (!filters.routeName || (station.routeName !== null && station.routeName !== undefined &&
        canonicalHighwayRouteName(station.routeName) === canonicalHighwayRouteName(filters.routeName))) &&
      matchesStationDirection(station) &&
      matches(stationText(station)),
    ), searchScope, position,
  );
  return {facilities, stations: visibleStations};
}
