import {mergeFacilityPlaces, normalizedDirection, type FacilityPlaces} from "./facility-places.ts";
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
): FacilityPlaces<T, A> {
  const {filters, query, stationServices, scope, position} = options;
  const merged = mergeFacilityPlaces(areas, stations);
  const searchScope = filters.routeName ? {kind: "all" as const} : scope;
  const eligible = new Set(filterByGeoScope(filterRestAreas(areas, filters, ""), searchScope, position).map(area => area.id));
  const terms = query.trim().toLocaleLowerCase("ko-KR").split(/\s+/).filter(Boolean);
  const stationText = (station: T) =>
    `${station.name} ${station.routeName ?? ""} ${station.direction ?? ""} ${station.address ?? ""} ${station.detailAddress ?? ""}`;
  const matches = (text: string) => {
    const haystack = text.toLocaleLowerCase("ko-KR");
    return terms.every(term => haystack.includes(term));
  };
  const facilities = merged.facilities.filter(({area, stations: linked}) =>
    eligible.has(area.id) &&
    (!stationServices.length || filterStations(linked, "", stationServices).length > 0) &&
    matches(`${area.name} ${area.routeName ?? ""} ${area.directionLabel ?? area.routeDirection ?? ""} ${linked.map(stationText).join(" ")}`),
  );
  const restOnly = filters.missingRoute || filters.facilities.length > 0 || filters.lounge !== "all";
  const unmatchedStations = restOnly ? [] : filterByGeoScope(
    filterStations(merged.unmatchedStations, "", stationServices).filter(station =>
      (!filters.routeName || (station.routeName !== null && station.routeName !== undefined &&
        canonicalHighwayRouteName(station.routeName) === canonicalHighwayRouteName(filters.routeName))) &&
      (!filters.direction || normalizedDirection(station.direction) === filters.direction) &&
      matches(stationText(station)),
    ), searchScope, position,
  );
  return {facilities, unmatchedStations};
}
