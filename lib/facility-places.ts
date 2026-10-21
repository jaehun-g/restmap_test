import {distanceMeters} from "./geo-search.ts";
import type {GasStation} from "./gas-stations.ts";
import {canonicalHighwayRouteName} from "./highway-route-name.ts";
import {hasCoordinates, type RestArea} from "./rest-areas.ts";

/** EX 주유소를 휴게소 정보에 자동 연결할 수 있는 최대 거리입니다. */
export const REST_AREA_STATION_MATCH_METERS = 300;

export type FacilityPlace<T extends GasStation = GasStation, A extends RestArea = RestArea> = {
  area: A;
  stations: T[];
};

export type FacilityPlaces<T extends GasStation = GasStation, A extends RestArea = RestArea> = {
  facilities: FacilityPlace<T, A>[];
  unmatchedStations: T[];
};

export function normalizedFacilityName(value: string): string {
  return value
    .replace(/\([^)]*\)/g, "")
    .replace(/(?:휴게소|주유소|충전소)/g, "")
    .replace(/\s+/g, "")
    .trim()
    .toLocaleLowerCase("ko-KR");
}

export function normalizedDirection(value: string | null | undefined): string | null {
  const direction = value?.replace(/방향/g, "").replace(/\s+/g, "").trim();
  return direction ? direction.toLocaleLowerCase("ko-KR") : null;
}

function areaDirection(area: RestArea) {
  return normalizedDirection(area.directionLabel ?? area.routeDirection);
}

function canMatch(area: RestArea, station: GasStation): boolean {
  if (station.brand !== "EX" || !area.routeName || !station.routeName) return false;
  if (canonicalHighwayRouteName(area.routeName) !== canonicalHighwayRouteName(station.routeName))
    return false;
  if (normalizedFacilityName(area.name) !== normalizedFacilityName(station.name)) return false;
  const restDirection = areaDirection(area);
  const stationDirection = normalizedDirection(station.direction);
  return restDirection !== null && stationDirection !== null && restDirection === stationDirection;
}

/**
 * 물리적으로 같은 휴게소의 EX 주유소만 결합한다. 이름·노선·방향과 좌표를 모두 확인해
 * 상행/하행 또는 인근 동명 시설이 한 마커로 합쳐지는 일을 막는다.
 */
export function mergeFacilityPlaces<T extends GasStation, A extends RestArea>(
  areas: A[],
  stations: T[],
): FacilityPlaces<T, A> {
  const candidates = stations.filter(station => station.brand === "EX");
  const facilities = areas.map(area => ({area, stations: [] as T[]}));
  const linked = new Set<string>();
  for (const station of candidates) {
    const match = facilities
      .flatMap((facility, index) => {
        const {area} = facility;
        if (!canMatch(area, station) || !hasCoordinates(area) || !hasCoordinates(station)) return [];
        const distance = distanceMeters(area, station);
        return distance <= REST_AREA_STATION_MATCH_METERS ? [{index, distance}] : [];
      })
      .sort((left, right) => left.distance - right.distance || left.index - right.index)[0];
    if (match) {
      facilities[match.index].stations.push(station);
      linked.add(station.siteCode);
    }
  }
  facilities.forEach(facility =>
    facility.stations.sort((left, right) => left.siteCode.localeCompare(right.siteCode)),
  );
  return {facilities, unmatchedStations: candidates.filter(station => !linked.has(station.siteCode))};
}
