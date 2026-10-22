import {distanceMeters} from "./geo-search.ts";
import type {GasStation} from "./gas-stations.ts";
import {canonicalHighwayRouteName} from "./highway-route-name.ts";
import {hasCoordinates, type RestArea} from "./rest-areas.ts";
import {verifiedRestAreaStations} from "./verified-rest-area-stations.ts";

/** EX 주유소를 휴게소 정보에 자동 연결할 수 있는 최대 거리입니다. */
export const REST_AREA_STATION_MATCH_METERS = 300;

export type FacilityPlace<A extends RestArea = RestArea> = {
  area: A;
};

export type FacilityStation<T extends GasStation = GasStation> = T & {
  linkedRestAreaId: number | null;
};

export type FacilityPlaces<T extends GasStation = GasStation, A extends RestArea = RestArea> = {
  facilities: FacilityPlace<A>[];
  stations: FacilityStation<T>[];
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
  if (isBidirectionalDirection(value)) return "양방";
  const direction = value?.replace(/방향/g, "").replace(/\s+/g, "").trim();
  return direction ? direction.toLocaleLowerCase("ko-KR") : null;
}

export function isBidirectionalDirection(value: string | null | undefined): boolean {
  const direction = value?.replace(/\s+/g, "").toLocaleLowerCase("ko-KR") ?? "";
  return /^(?:양방향|양방|통합)(?:방향)?$/.test(direction);
}

function areaDirection(area: RestArea) {
  return normalizedDirection(area.directionLabel ?? area.routeDirection);
}

function canMatch(area: RestArea, station: GasStation): boolean {
  if (station.brand !== "EX" || !area.routeName || !station.routeName) return false;
  if (canonicalHighwayRouteName(area.routeName) !== canonicalHighwayRouteName(station.routeName))
    return false;
  if (isBidirectionalDirection(areaDirection(area)) && verifiedRestAreaStations.some(item =>
    item.sourceKey === station.siteCode && item.restName === normalizedFacilityName(area.name) &&
    item.routeName === canonicalHighwayRouteName(area.routeName!),
  )) return true;
  if (normalizedFacilityName(area.name) !== normalizedFacilityName(station.name)) return false;
  const restDirection = areaDirection(area);
  const stationDirection = normalizedDirection(station.direction);
  return restDirection !== null && stationDirection !== null &&
    (isBidirectionalDirection(restDirection) || restDirection === stationDirection);
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
  const facilities = areas.map(area => ({area}));
  const linkedRestAreaBySiteCode = new Map<string, number>();
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
      linkedRestAreaBySiteCode.set(station.siteCode, facilities[match.index].area.id);
    }
  }
  const linkedStations = candidates
    .map(station => ({
      ...station,
      linkedRestAreaId: linkedRestAreaBySiteCode.get(station.siteCode) ?? null,
    }))
    .sort((left, right) => left.siteCode.localeCompare(right.siteCode));
  return {facilities, stations: linkedStations};
}

export function linkedStationsByArea<T extends GasStation, A extends RestArea>(
  facilities: FacilityPlace<A>[],
  stations: FacilityStation<T>[],
): Map<number, T[]> {
  const linked = new Map<number, T[]>(facilities.map(({area}) => [area.id, []]));
  for (const station of stations) {
    if (station.linkedRestAreaId !== null) linked.get(station.linkedRestAreaId)?.push(station);
  }
  return linked;
}
