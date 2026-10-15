import mysql from "mysql2/promise";
import nextEnv from "@next/env";
import {readDatabaseConfig} from "../lib/db-config.ts";
import {exStationAddressCandidates, fetchExStationStatuses} from "../lib/ex-station-status.ts";
import {
  geocodeKakaoAddress,
  searchKakaoKeywordPlaces,
  selectKakaoKeywordPlace,
} from "../lib/kakao-local.ts";

const {loadEnvConfig} = nextEnv;
loadEnvConfig(process.cwd());

const apply = process.argv.includes("--apply");
const refresh = process.argv.includes("--refresh");
const decoder = new TextDecoder("utf-8");
const config = readDatabaseConfig(process.env);
if (!config.ok) throw new Error(config.error.message);
if (!apply) {
  console.log("DB에 저장하지 않았습니다. 저장하려면 --apply 옵션을 추가하세요.");
  process.exit(0);
}

const statuses = await fetchExStationStatuses();
if (!statuses.ok) throw new Error(statuses.error.message);

const {tls, ...connection} = config.value;
const pool = mysql.createPool({
  ...connection,
  ...(tls ? {ssl: {rejectUnauthorized: true}} : {}),
  charset: "utf8",
  connectionLimit: 3,
});

function databaseText(value) {
  if (value instanceof Uint8Array) return decoder.decode(value);
  return typeof value === "string" ? value : null;
}

function databaseTime(value) {
  if (value instanceof Date) return value.getTime();
  const text = databaseText(value);
  if (!text) return null;
  const time = Date.parse(text);
  return Number.isFinite(time) ? time : null;
}

try {
  const [cachedRows] = await pool.query(
    "SELECT source_key, source_location, latitude, longitude, kakao_address_name, kakao_address_type, kakao_parcel_address_name, kakao_road_address_name, geocode_status, geocode_error_code, geocoded_at FROM test_ex_station_geocodes",
  );
  const cached = new Map(
    cachedRows.flatMap(row => {
      const sourceKey = databaseText(row.source_key);
      if (!sourceKey) return [];
      return [
        [
          sourceKey,
          {
            ...row,
            source_location: databaseText(row.source_location),
            kakao_address_name: databaseText(row.kakao_address_name),
            kakao_address_type: databaseText(row.kakao_address_type),
            kakao_parcel_address_name: databaseText(row.kakao_parcel_address_name),
            kakao_road_address_name: databaseText(row.kakao_road_address_name),
            geocode_status: databaseText(row.geocode_status),
            geocode_error_code: databaseText(row.geocode_error_code),
          },
        ],
      ];
    }),
  );
  const [overrideRows] = await pool.query(
    "SELECT source_key, search_address, updated_at FROM test_ex_station_geocode_overrides WHERE enabled = 1",
  );
  const overrides = new Map(
    overrideRows.flatMap(row => {
      const sourceKey = databaseText(row.source_key),
        searchAddress = databaseText(row.search_address);
      if (!sourceKey || !searchAddress) return [];
      return [[sourceKey, {searchAddress, updatedAt: databaseTime(row.updated_at) ?? 0}]];
    }),
  );
  let geocoded = 0;
  let reused = 0;
  let failed = 0;
  for (const station of statuses.value) {
    const previous = cached.get(station.sourceKey),
      override = overrides.get(station.sourceKey),
      overrideChanged =
        Boolean(override) &&
        (!previous?.geocoded_at || override.updatedAt > (databaseTime(previous.geocoded_at) ?? 0));
    const canReuse =
      !refresh &&
      !overrideChanged &&
      previous?.source_location === station.location &&
      previous.geocode_status === "SUCCESS" &&
      previous.latitude !== null &&
      previous.longitude !== null;
    let resolved = previous;
    if (canReuse) {
      reused++;
      resolved = {...previous, geocode_error_code: null};
    } else if (station.location || override) {
      let result;
      const addressCandidates = [
        ...(override ? [override.searchAddress] : []),
        ...(station.location ? exStationAddressCandidates(station.location) : []),
      ];
      for (const candidate of [...new Set(addressCandidates)]) {
        result = await geocodeKakaoAddress(candidate);
        if (!result.ok && result.error.code === "GEOCODE_NOT_FOUND")
          result = await geocodeKakaoAddress(candidate, {analyzeType: "similar"});
        if (result.ok || result.error.code !== "GEOCODE_NOT_FOUND") break;
      }
      if (!result.ok && result.error.code === "GEOCODE_NOT_FOUND" && station.serviceAreaName) {
        const places = await searchKakaoKeywordPlaces(station.serviceAreaName);
        if (places.ok) {
          const place = selectKakaoKeywordPlace(
            places.value,
            station.serviceAreaName,
            station.phone,
          );
          if (place.ok)
            result = {
              ok: true,
              value: {
                latitude: place.value.latitude,
                longitude: place.value.longitude,
                addressName:
                  place.value.addressName ?? place.value.roadAddressName ?? place.value.name,
                addressType: "KEYWORD_OL7",
                parcelAddressName: place.value.addressName,
                roadAddressName: place.value.roadAddressName,
              },
            };
          else result = place;
        } else result = places;
      }
      if (result.ok) {
        geocoded++;
        resolved = {
          latitude: result.value.latitude,
          longitude: result.value.longitude,
          kakao_address_name: result.value.addressName,
          kakao_address_type: result.value.addressType,
          kakao_parcel_address_name: result.value.parcelAddressName,
          kakao_road_address_name: result.value.roadAddressName,
          geocode_status: "SUCCESS",
          geocode_error_code: null,
          geocoded_at: new Date(),
        };
      } else {
        failed++;
        resolved = {
          latitude: null,
          longitude: null,
          kakao_address_name: null,
          kakao_address_type: null,
          kakao_parcel_address_name: null,
          kakao_road_address_name: null,
          geocode_status: [
            "GEOCODE_NOT_FOUND",
            "KEYWORD_PLACE_NOT_FOUND",
            "KEYWORD_PLACE_AMBIGUOUS",
          ].includes(result.error.code)
            ? "NOT_FOUND"
            : "ERROR",
          geocode_error_code: result.error.code,
          geocoded_at: null,
        };
      }
    } else {
      failed++;
      resolved = {
        latitude: null,
        longitude: null,
        kakao_address_name: null,
        kakao_address_type: null,
        kakao_parcel_address_name: null,
        kakao_road_address_name: null,
        geocode_status: "ADDRESS_MISSING",
        geocode_error_code: "ADDRESS_MISSING",
        geocoded_at: null,
      };
    }
    const values = [
      station.sourceKey,
      station.routeCode,
      station.serviceAreaCode,
      station.routeName,
      station.direction,
      station.serviceAreaName,
      station.oilCompany,
      station.location,
      station.phone,
      station.lpgAvailable === null ? null : Number(station.lpgAvailable),
      station.gasolinePrice,
      station.dieselPrice,
      station.lpgPrice,
      resolved?.latitude ?? null,
      resolved?.longitude ?? null,
      resolved?.kakao_address_name ?? null,
      resolved?.kakao_address_type ?? null,
      resolved?.kakao_parcel_address_name ?? null,
      resolved?.kakao_road_address_name ?? null,
      resolved?.geocode_status ?? "ERROR",
      resolved?.geocode_error_code === undefined ? "UNKNOWN" : resolved.geocode_error_code,
    ];
    await pool.query(
      `INSERT INTO test_ex_station_geocodes (
        source_key, route_code, service_area_code, route_name, direction, service_area_name, oil_company,
        source_location, tel_no, lpg_available, gasoline_price, diesel_price, lpg_price,
        latitude, longitude, kakao_address_name, kakao_address_type,
        kakao_parcel_address_name, kakao_road_address_name, geocode_status, geocode_error_code,
        source_fetched_at, geocoded_at
      ) VALUES (${values.map(() => "?").join(", ")}, NOW(3), ?)
      ON DUPLICATE KEY UPDATE
        route_code = VALUES(route_code), service_area_code = VALUES(service_area_code), route_name = VALUES(route_name),
        direction = VALUES(direction), service_area_name = VALUES(service_area_name), oil_company = VALUES(oil_company),
        source_location = VALUES(source_location), tel_no = VALUES(tel_no), lpg_available = VALUES(lpg_available),
        gasoline_price = VALUES(gasoline_price), diesel_price = VALUES(diesel_price), lpg_price = VALUES(lpg_price),
        latitude = VALUES(latitude), longitude = VALUES(longitude),
        kakao_address_name = VALUES(kakao_address_name), kakao_address_type = VALUES(kakao_address_type),
        kakao_parcel_address_name = VALUES(kakao_parcel_address_name),
        kakao_road_address_name = VALUES(kakao_road_address_name), geocode_status = VALUES(geocode_status),
        geocode_error_code = VALUES(geocode_error_code), source_fetched_at = VALUES(source_fetched_at),
        geocoded_at = VALUES(geocoded_at)`,
      [...values, resolved?.geocoded_at ?? null],
    );
  }
  console.log(
    `저장 완료: 전체 ${statuses.value.length}건 · 신규 지오코딩 ${geocoded}건 · 캐시 재사용 ${reused}건 · 실패 ${failed}건`,
  );
  const [summary] = await pool.query(
    "SELECT geocode_status, geocode_error_code, COUNT(*) AS count FROM test_ex_station_geocodes GROUP BY geocode_status, geocode_error_code ORDER BY geocode_status, geocode_error_code",
  );
  console.table(
    summary.map(row => ({
      ...row,
      geocode_status: databaseText(row.geocode_status),
      geocode_error_code: databaseText(row.geocode_error_code),
    })),
  );
  const [samples] = await pool.query(
    "SELECT service_area_name, source_location FROM test_ex_station_geocodes WHERE geocode_status <> 'SUCCESS' ORDER BY service_area_name LIMIT 5",
  );
  if (samples.length)
    console.table(
      samples.map(row => ({
        service_area_name: databaseText(row.service_area_name),
        source_location: databaseText(row.source_location),
      })),
    );
} finally {
  await pool.end();
}
