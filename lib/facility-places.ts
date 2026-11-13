import {distanceMeters} from "./geo-search.ts";
import {stationKey, type GasStation} from "./gas-stations.ts";
import {canonicalHighwayRouteName} from "./highway-route-name.ts";
import {hasCoordinates, type RestArea} from "./rest-areas.ts";
import {verifiedRestAreaStations, verifiedStationAreaLinks} from "./verified-rest-area-stations.ts";

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
    .replace(/[（(][^）)]*[）)]/g, "")
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

export function stationNameDirections(name: string): string[] {
  return [...name.matchAll(/[（(]([^()（）]*)[）)]/g)]
    .map(match => normalizedDirection(match[1]))
    .filter((value): value is string => value !== null);
}

type MatchingArea = {
  area: RestArea;
  index: number;
  routeName: string;
  name: string;
  direction: string | null;
  bidirectional: boolean;
};
type MatchingStation = {
  station: GasStation;
  routeName: string | null;
  name: string;
  direction: string | null;
  nameDirections: string[];
};

function canMatch(area: MatchingArea, station: MatchingStation, allowNameDirection = false): boolean {
  if (station.routeName === null || area.routeName !== station.routeName) return false;
  if (verifiedStationAreaLinks.some(item =>
    item.sourceKey === station.station.siteCode && item.restAreaId === area.area.id,
  )) return true;
  if (area.bidirectional && verifiedRestAreaStations.some(item =>
    item.sourceKey === station.station.siteCode && item.restName === area.name &&
    item.routeName === area.routeName,
  )) return true;
  if (area.name !== station.name) return false;
  const restDirection = area.direction;
  const stationDirection = station.direction;
  if (restDirection !== null && stationDirection !== null &&
    (area.bidirectional || restDirection === stationDirection)) return true;
  return allowNameDirection && restDirection !== null && !area.bidirectional &&
    station.nameDirections.includes(restDirection);
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
  const facilitiesByRoute = new Map<string, MatchingArea[]>();
  facilities.forEach(({area}, index) => {
    if (!area.routeName) return;
    const route = canonicalHighwayRouteName(area.routeName);
    const group = facilitiesByRoute.get(route) ?? [];
    const direction = areaDirection(area);
    group.push({area, index, routeName: route, name: normalizedFacilityName(area.name),
      direction, bidirectional: isBidirectionalDirection(direction)});
    facilitiesByRoute.set(route, group);
  });
  const linkedRestAreaBySiteCode = new Map<string, number>();
  for (const station of candidates) {
    const identity: MatchingStation = {
      station,
      routeName: station.routeName ? canonicalHighwayRouteName(station.routeName) : null,
      name: normalizedFacilityName(station.name),
      direction: normalizedDirection(station.direction),
      nameDirections: stationNameDirections(station.name),
    };
    // 노선이 다른 휴게소는 연결 대상이 될 수 없으므로 전체 목록을 반복 정규화하지 않는다.
    const routeFacilities = identity.routeName !== null
      ? facilitiesByRoute.get(identity.routeName) ?? []
      : [];
    const findMatch = (allowNameDirection: boolean) => routeFacilities
      .flatMap(candidate => {
        const {area, index} = candidate;
        if (!canMatch(candidate, identity, allowNameDirection) || !hasCoordinates(area) || !hasCoordinates(station)) return [];
        const distance = distanceMeters(area, station);
        return distance <= REST_AREA_STATION_MATCH_METERS ? [{index, distance}] : [];
      })
      .sort((left, right) => left.distance - right.distance || left.index - right.index)[0];
    // 기존 방향 필드·검증된 연결을 우선하고, 후보가 없을 때만 이름의 방향으로 보완한다.
    const match = findMatch(false) ?? findMatch(true);
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

/**
 * 경로에 표시되는 휴게소에 종속된 EX 주유소 마커는 단독 주유소 마커 목록에서 제외합니다.
 */
export function excludeLinkedRouteStations<T extends GasStation, A extends RestArea>(
  routeAreas: readonly A[],
  routeStations: readonly T[],
  allAreas: readonly A[],
  allStations: readonly T[],
): T[] {
  const merged = mergeFacilityPlaces([...allAreas], [...allStations]);
  const routeAreaIds = new Set(routeAreas.map(area => area.id));
  const linkedByKey = new Map(
    merged.stations.map(station => [stationKey(station), station.linkedRestAreaId]),
  );
  return routeStations.filter(station => {
    const linkedId = linkedByKey.get(stationKey(station)) ?? null;
    return linkedId === null || !routeAreaIds.has(linkedId);
  });
}
