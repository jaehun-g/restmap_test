import {cacheLife, cacheTag} from "next/cache";
import {queryGasStations, queryRestAreas} from "./db";
import {MAP_REST_AREAS_TAG, MAP_STATIONS_TAG} from "./map-cache-tags";
import type {GasStationQuery} from "./gas-station-query";
import type {Result} from "./rest-areas";
import {hasCoordinates} from "./rest-areas";
import {filterByGeoScope} from "./geo-search";

class MapQueryFailure extends Error {
  constructor(readonly detail: {code: string; message: string}) {
    super(detail.message);
  }
}

async function cachedRestAreas() {
  "use cache";
  cacheLife({stale: 0, revalidate: 60, expire: 120});
  cacheTag(MAP_REST_AREAS_TAG);
  const result = await queryRestAreas();
  if (!result.ok) throw new MapQueryFailure(result.error);
  return result.value;
}

async function cachedStations(query: GasStationQuery) {
  "use cache";
  cacheLife({stale: 0, revalidate: 60, expire: 120});
  cacheTag(MAP_STATIONS_TAG, MAP_REST_AREAS_TAG);
  const result = await queryGasStations(query);
  if (!result.ok) throw new MapQueryFailure(result.error);
  return result.value;
}

async function readCached<T>(read: () => Promise<T>): Promise<Result<T>> {
  try {
    return {ok: true, value: await read()};
  } catch (error) {
    return {ok: false, error: error instanceof MapQueryFailure ? error.detail : {
      code: "DB_QUERY_FAILED", message: "지도 정보를 조회하지 못했습니다. 잠시 후 다시 시도해주세요.",
    }};
  }
}

export function queryMapRestAreas(fresh = false) {
  return fresh ? queryRestAreas() : readCached(cachedRestAreas);
}

export async function queryMapStations(query: GasStationQuery, fresh = false) {
  if (fresh) return queryGasStations(query);
  // 위치별로 DB 캐시를 만들지 않고 원본별 스냅샷을 공유한 뒤 요청 범위를 적용한다.
  const cacheQuery: GasStationQuery = query.routeName ? query : {
    source: query.source, routeName: null, scope: {kind: "all"},
  };
  const result = await readCached(() => cachedStations(cacheQuery));
  if (!result.ok || query.routeName) return result;
  const items = filterByGeoScope(result.value.items, query.scope, null);
  return {ok: true as const, value: {...result.value, items, unmappedCount: items.filter(item => !hasCoordinates(item)).length}};
}
