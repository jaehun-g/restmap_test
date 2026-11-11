import {restPlace, stationPlace, type MapPlace, type PlaceView} from "./map-places.ts";
import type {FacilityStation} from "./facility-places.ts";
import type {RestArea} from "./rest-areas.ts";
import type {GasStation} from "./gas-stations.ts";

export function mobilePlaceList(
  areas: RestArea[],
  stations: FacilityStation<GasStation>[],
  view: PlaceView,
): MapPlace[] {
  if (view === "rest") return areas.map(restPlace);
  const visibleAreaIds = new Set(areas.map(area => area.id));
  const linkedIds = new Set(stations.flatMap(station =>
    station.linkedRestAreaId !== null && visibleAreaIds.has(station.linkedRestAreaId)
      ? [station.linkedRestAreaId] : [],
  ));
  const shownAreas = view === "all" ? areas : areas.filter(area => linkedIds.has(area.id));
  return [
    ...shownAreas.map(restPlace),
    ...stations.filter(station => station.linkedRestAreaId === null || !linkedIds.has(station.linkedRestAreaId)).map(stationPlace),
  ];
}
