import type {Pool, PoolClient, QueryResultRow} from "pg";
import {databaseError} from "./db-config.ts";
import {
  exStationAddressCandidates,
  fetchExStationStatuses,
  type ExStationStatus,
} from "./ex-station-status.ts";
import {
  geocodeKakaoAddress,
  searchKakaoKeywordPlaces,
  selectKakaoKeywordPlace,
} from "./kakao-local.ts";
import type {Result} from "./rest-areas.ts";
import {verifiedStationLocations, verifiedStationCoordinates} from "./verified-rest-area-stations.ts";

type CachedStation = {
  sourceKey: string;
  sourceLocation: string | null;
  latitude: number | null;
  longitude: number | null;
  kakaoAddressName: string | null;
  kakaoAddressType: string | null;
  kakaoParcelAddressName: string | null;
  kakaoRoadAddressName: string | null;
  geocodeStatus: string | null;
  geocodeErrorCode: string | null;
  geocodedAt: number | null;
};

type GeocodeOverride = {searchAddress: string; updatedAt: number};
type ResolvedStation = {
  latitude: number | null;
  longitude: number | null;
  kakaoAddressName: string | null;
  kakaoAddressType: string | null;
  kakaoParcelAddressName: string | null;
  kakaoRoadAddressName: string | null;
  geocodeStatus: string;
  geocodeErrorCode: string | null;
  geocodedAt: Date | null;
};

export type ExStationSyncSummary = {
  synchronizedAt: string;
  total: number;
  geocoded: number;
  reused: number;
  unresolved: number;
  deleted: number;
};

export type ExStationSyncDependencies = {
  pool: Pick<Pool, "query" | "connect">;
  fetchStations?: () => Promise<Result<ExStationStatus[]>>;
  geocodeAddress?: typeof geocodeKakaoAddress;
  searchKeywordPlaces?: typeof searchKakaoKeywordPlaces;
  selectKeywordPlace?: typeof selectKakaoKeywordPlace;
  now?: () => Date;
};

function databaseText(value: unknown): string | null {
  if (value instanceof Uint8Array) {
    try {
      value = new TextDecoder("utf-8", {fatal: true}).decode(value);
    } catch {
      return null;
    }
  }
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function databaseNumber(value: unknown): number | null {
  const number = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}

function databaseTime(value: unknown): number | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  const text = databaseText(value);
  if (!text) return null;
  const time = Date.parse(text);
  return Number.isFinite(time) ? time : null;
}

function cachedStation(row: QueryResultRow): CachedStation | null {
  const sourceKey = databaseText(row.source_key);
  if (!sourceKey) return null;
  return {
    sourceKey,
    sourceLocation: databaseText(row.source_location),
    latitude: databaseNumber(row.latitude),
    longitude: databaseNumber(row.longitude),
    kakaoAddressName: databaseText(row.kakao_address_name),
    kakaoAddressType: databaseText(row.kakao_address_type),
    kakaoParcelAddressName: databaseText(row.kakao_parcel_address_name),
    kakaoRoadAddressName: databaseText(row.kakao_road_address_name),
    geocodeStatus: databaseText(row.geocode_status),
    geocodeErrorCode: databaseText(row.geocode_error_code),
    geocodedAt: databaseTime(row.geocoded_at),
  };
}

function resolvedFromCache(previous: CachedStation): ResolvedStation {
  return {
    latitude: previous.latitude,
    longitude: previous.longitude,
    kakaoAddressName: previous.kakaoAddressName,
    kakaoAddressType: previous.kakaoAddressType,
    kakaoParcelAddressName: previous.kakaoParcelAddressName,
    kakaoRoadAddressName: previous.kakaoRoadAddressName,
    geocodeStatus: previous.geocodeStatus ?? "ERROR",
    geocodeErrorCode: previous.geocodeErrorCode,
    geocodedAt: previous.geocodedAt === null ? null : new Date(previous.geocodedAt),
  };
}

function unresolved(code: string, status: "ADDRESS_MISSING" | "NOT_FOUND" | "ERROR"): ResolvedStation {
  return {
    latitude: null,
    longitude: null,
    kakaoAddressName: null,
    kakaoAddressType: null,
    kakaoParcelAddressName: null,
    kakaoRoadAddressName: null,
    geocodeStatus: status,
    geocodeErrorCode: code,
    geocodedAt: null,
  };
}

async function resolveStation(
  station: ExStationStatus,
  previous: CachedStation | undefined,
  override: GeocodeOverride | undefined,
  dependencies: Required<
    Pick<
      ExStationSyncDependencies,
      "geocodeAddress" | "searchKeywordPlaces" | "selectKeywordPlace" | "now"
    >
  >,
): Promise<{resolved: ResolvedStation; geocoded: boolean; reused: boolean; unresolved: boolean}> {
  const verified = verifiedStationLocations.find(item => item.sourceKey === station.sourceKey);
  if (verified) return {
    resolved: {
      latitude: verified.latitude,
      longitude: verified.longitude,
      kakaoAddressName: verified.roadAddress,
      kakaoAddressType: "ROAD_ADDR",
      kakaoParcelAddressName: verified.parcelAddress,
      kakaoRoadAddressName: verified.roadAddress,
      geocodeStatus: "SUCCESS",
      geocodeErrorCode: null,
      geocodedAt: dependencies.now(),
    },
    geocoded: false,
    reused: true,
    unresolved: false,
  };
  const coordinates = verifiedStationCoordinates.find(item => item.sourceKey === station.sourceKey);
  if (coordinates) return {
    resolved: {
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      kakaoAddressName: previous?.kakaoAddressName ?? station.location,
      kakaoAddressType: previous?.kakaoAddressType ?? null,
      kakaoParcelAddressName: previous?.kakaoParcelAddressName ?? null,
      kakaoRoadAddressName: previous?.kakaoRoadAddressName ?? null,
      geocodeStatus: "SUCCESS",
      geocodeErrorCode: null,
      geocodedAt: dependencies.now(),
    },
    geocoded: false,
    reused: true,
    unresolved: false,
  };
  const overrideChanged =
    Boolean(override) &&
    (!previous?.geocodedAt || override!.updatedAt > previous.geocodedAt);
  const sourceUnchanged = previous?.sourceLocation === station.location;
  if (previous && sourceUnchanged && !overrideChanged)
    return {
      resolved: resolvedFromCache(previous),
      geocoded: false,
      reused: true,
      unresolved: previous.geocodeStatus !== "SUCCESS",
    };

  if (!station.location && !override)
    return {
      resolved: unresolved("ADDRESS_MISSING", "ADDRESS_MISSING"),
      geocoded: false,
      reused: false,
      unresolved: true,
    };

  const candidates = [
    ...(override ? [override.searchAddress] : []),
    ...(station.location ? exStationAddressCandidates(station.location) : []),
  ];
  let result: Awaited<ReturnType<typeof geocodeKakaoAddress>> | undefined;
  for (const candidate of [...new Set(candidates)]) {
    result = await dependencies.geocodeAddress(candidate);
    if (!result.ok && result.error.code === "GEOCODE_NOT_FOUND")
      result = await dependencies.geocodeAddress(candidate, {analyzeType: "similar"});
    if (result.ok || result.error.code !== "GEOCODE_NOT_FOUND") break;
  }
  if (!result) return {resolved: unresolved("ADDRESS_MISSING", "ADDRESS_MISSING"), geocoded: false, reused: false, unresolved: true};
  if (!result.ok && result.error.code === "GEOCODE_NOT_FOUND" && station.serviceAreaName) {
    const places = await dependencies.searchKeywordPlaces(station.serviceAreaName);
    if (places.ok) {
      const place = dependencies.selectKeywordPlace(places.value, station.serviceAreaName, station.phone);
      result = place.ok
        ? {
            ok: true,
            value: {
              latitude: place.value.latitude,
              longitude: place.value.longitude,
              addressName: place.value.addressName ?? place.value.roadAddressName ?? place.value.name,
              addressType: "KEYWORD_OL7",
              parcelAddressName: place.value.addressName,
              roadAddressName: place.value.roadAddressName,
            },
          }
        : place;
    } else result = places;
  }
  if (result.ok)
    return {
      resolved: {
        latitude: result.value.latitude,
        longitude: result.value.longitude,
        kakaoAddressName: result.value.addressName,
        kakaoAddressType: result.value.addressType,
        kakaoParcelAddressName: result.value.parcelAddressName,
        kakaoRoadAddressName: result.value.roadAddressName,
        geocodeStatus: "SUCCESS",
        geocodeErrorCode: null,
        geocodedAt: dependencies.now(),
      },
      geocoded: true,
      reused: false,
      unresolved: false,
    };
  const status = ["GEOCODE_NOT_FOUND", "KEYWORD_PLACE_NOT_FOUND", "KEYWORD_PLACE_AMBIGUOUS"].includes(
    result.error.code,
  )
    ? "NOT_FOUND"
    : "ERROR";
  return {
    resolved: unresolved(result.error.code, status),
    geocoded: false,
    reused: false,
    unresolved: true,
  };
}

function stationValues(station: ExStationStatus, resolved: ResolvedStation) {
  return [
    station.sourceKey,
    station.routeCode,
    station.serviceAreaCode,
    station.routeName,
    station.direction,
    station.serviceAreaName,
    station.oilCompany,
    station.location,
    station.phone,
    station.lpgAvailable,
    station.gasolinePrice,
    station.dieselPrice,
    station.lpgPrice,
    resolved.latitude,
    resolved.longitude,
    resolved.kakaoAddressName,
    resolved.kakaoAddressType,
    resolved.kakaoParcelAddressName,
    resolved.kakaoRoadAddressName,
    resolved.geocodeStatus,
    resolved.geocodeErrorCode,
    resolved.geocodedAt,
  ];
}

const upsertSql = `INSERT INTO test_ex_station_geocodes (
  source_key, route_code, service_area_code, route_name, direction, service_area_name, oil_company,
  source_location, tel_no, lpg_available, gasoline_price, diesel_price, lpg_price,
  latitude, longitude, kakao_address_name, kakao_address_type,
  kakao_parcel_address_name, kakao_road_address_name, geocode_status, geocode_error_code,
  source_fetched_at, geocoded_at
) VALUES (${Array.from({length: 21}, (_, index) => `$${index + 1}`).join(", ")}, CURRENT_TIMESTAMP(3), $22)
ON CONFLICT (source_key) DO UPDATE SET
  route_code = EXCLUDED.route_code, service_area_code = EXCLUDED.service_area_code, route_name = EXCLUDED.route_name,
  direction = EXCLUDED.direction, service_area_name = EXCLUDED.service_area_name, oil_company = EXCLUDED.oil_company,
  source_location = EXCLUDED.source_location, tel_no = EXCLUDED.tel_no, lpg_available = EXCLUDED.lpg_available,
  gasoline_price = EXCLUDED.gasoline_price, diesel_price = EXCLUDED.diesel_price, lpg_price = EXCLUDED.lpg_price,
  latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, kakao_address_name = EXCLUDED.kakao_address_name,
  kakao_address_type = EXCLUDED.kakao_address_type, kakao_parcel_address_name = EXCLUDED.kakao_parcel_address_name,
  kakao_road_address_name = EXCLUDED.kakao_road_address_name, geocode_status = EXCLUDED.geocode_status,
  geocode_error_code = EXCLUDED.geocode_error_code, source_fetched_at = EXCLUDED.source_fetched_at,
  geocoded_at = EXCLUDED.geocoded_at, updated_at = CURRENT_TIMESTAMP`;

/** Synchronizes the EX station table only after the complete source snapshot is validated. */
export async function synchronizeExStations(
  dependencies: ExStationSyncDependencies,
): Promise<Result<ExStationSyncSummary>> {
  const fetchStations = dependencies.fetchStations ?? fetchExStationStatuses;
  const geocodeAddress = dependencies.geocodeAddress ?? geocodeKakaoAddress;
  const searchKeywordPlaces = dependencies.searchKeywordPlaces ?? searchKakaoKeywordPlaces;
  const selectKeywordPlace = dependencies.selectKeywordPlace ?? selectKakaoKeywordPlace;
  const now = dependencies.now ?? (() => new Date());
  const fetched = await fetchStations();
  if (!fetched.ok) return fetched;
  try {
    const {rows: cachedRows} = await dependencies.pool.query<QueryResultRow>(
      "SELECT source_key, source_location, latitude, longitude, kakao_address_name, kakao_address_type, kakao_parcel_address_name, kakao_road_address_name, geocode_status, geocode_error_code, geocoded_at FROM test_ex_station_geocodes",
    );
    const cached = new Map(
      cachedRows.flatMap(row => {
        const item = cachedStation(row);
        return item ? [[item.sourceKey, item] as const] : [];
      }),
    );
    const {rows: overrideRows} = await dependencies.pool.query<QueryResultRow>(
      "SELECT source_key, search_address, updated_at FROM test_ex_station_geocode_overrides WHERE enabled IS TRUE",
    );
    const overrides = new Map(
      overrideRows.flatMap(row => {
        const sourceKey = databaseText(row.source_key);
        const searchAddress = databaseText(row.search_address);
        if (!sourceKey || !searchAddress) return [];
        return [[sourceKey, {searchAddress, updatedAt: databaseTime(row.updated_at) ?? 0}] as const];
      }),
    );
    const resolved: Array<{
      station: ExStationStatus;
      resolved: ResolvedStation;
      geocoded: boolean;
      reused: boolean;
      unresolved: boolean;
    }> = [];
    for (const station of fetched.value)
      resolved.push({
        station,
        ...(await resolveStation(station, cached.get(station.sourceKey), overrides.get(station.sourceKey), {
          geocodeAddress,
          searchKeywordPlaces,
          selectKeywordPlace,
          now,
        })),
      });
    const connection: PoolClient = await dependencies.pool.connect();
    let released = false;
    try {
      await connection.query("BEGIN");
      for (const item of resolved) await connection.query(upsertSql, stationValues(item.station, item.resolved));
      const sourceKeys = fetched.value.map(station => station.sourceKey);
      const deleted = sourceKeys.length
        ? await connection.query(
            "DELETE FROM test_ex_station_geocodes WHERE source_key <> ALL($1::text[])",
            [sourceKeys],
          )
        : await connection.query("DELETE FROM test_ex_station_geocodes");
      await connection.query("COMMIT");
      return {
        ok: true,
        value: {
          synchronizedAt: now().toISOString(),
          total: fetched.value.length,
          geocoded: resolved.filter(item => item.geocoded).length,
          reused: resolved.filter(item => item.reused).length,
          unresolved: resolved.filter(item => item.unresolved).length,
          deleted: deleted.rowCount ?? 0,
        },
      };
    } catch (reason) {
      try {
        await connection.query("ROLLBACK");
      } catch {
        connection.release(new Error("transaction rollback failed"));
        released = true;
      }
      return {ok: false, error: databaseError(reason, "write")};
    } finally {
      if (!released) connection.release();
    }
  } catch (reason) {
    return {ok: false, error: databaseError(reason, "write")};
  }
}
