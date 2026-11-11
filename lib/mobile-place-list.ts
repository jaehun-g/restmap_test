import {restPlace, stationPlace, type MapPlace, type PlaceView} from "./map-places.ts";
import type {FacilityStation} from "./facility-places.ts";
import type {RestArea} from "./rest-areas.ts";
import type {GasStation} from "./gas-stations.ts";

export function previewForRestArea<T extends {restAreaId: number}>(preview: T | null, restAreaId: number): T | null {
  return preview?.restAreaId === restAreaId ? preview : null;
}

export function mobilePlaceList(
  areas: RestArea[],
  stations: FacilityStation<GasStation>[],
  view: PlaceView,
): MapPlace[] {
  if (view === "rest") return areas.map(restPlace);
  if (view === "ex") return stations.filter(station => station.brand === "EX").map(stationPlace);
  const visibleAreaIds = new Set(areas.map(area => area.id));
  const linkedIds = new Set(stations.flatMap(station =>
    station.linkedRestAreaId !== null && visibleAreaIds.has(station.linkedRestAreaId)
      ? [station.linkedRestAreaId] : [],
  ));
  return [
    ...areas.map(restPlace),
    ...stations.filter(station => station.linkedRestAreaId === null || !linkedIds.has(station.linkedRestAreaId)).map(stationPlace),
  ];
}
