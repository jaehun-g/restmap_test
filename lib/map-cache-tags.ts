import {revalidateTag} from "next/cache";

export const MAP_REST_AREAS_TAG = "map-rest-areas";
export const MAP_STATIONS_TAG = "map-stations";

export function invalidateMapData(kind: "rest" | "station") {
  revalidateTag(kind === "rest" ? MAP_REST_AREAS_TAG : MAP_STATIONS_TAG, {expire: 0});
}
