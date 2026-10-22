import {mergeFacilityPlaces, normalizedFacilityName, normalizedDirection, isBidirectionalDirection, stationNameDirections, REST_AREA_STATION_MATCH_METERS} from "./facility-places.ts";
import {distanceMeters} from "./geo-search.ts";
import {hasCoordinates, type RestArea} from "./rest-areas.ts";
import type {GasStationRecord} from "./gas-stations.ts";

/** 거리만 실패하며 연결 대상이 유일한 동명·동방향 주유소의 보정 후보입니다. */
export function planStationCoordinateCorrections(areas: RestArea[], stations: GasStationRecord[]) {
  const linked = mergeFacilityPlaces(areas, stations).stations;
  return linked.flatMap(station => {
    if (station.linkedRestAreaId !== null || !hasCoordinates(station)) return [];
    const candidates = areas.filter((area): area is RestArea & {latitude: number; longitude: number} => {
      const direction = normalizedDirection(area.directionLabel ?? area.routeDirection);
      if (!hasCoordinates(area) || !direction || isBidirectionalDirection(direction)) return false;
      if (normalizedFacilityName(area.name) !== normalizedFacilityName(station.name)) return false;
      if (normalizedDirection(station.direction) !== direction && !stationNameDirections(station.name).includes(direction)) return false;
      if (distanceMeters(area, station) <= REST_AREA_STATION_MATCH_METERS) return false;
      return mergeFacilityPlaces([area], [{...station, latitude: area.latitude, longitude: area.longitude}]).stations[0]?.linkedRestAreaId === area.id;
    });
    if (candidates.length !== 1) return [];
    const area = candidates[0];
    return [{station, area, distance: distanceMeters(area, station)}];
  });
}
