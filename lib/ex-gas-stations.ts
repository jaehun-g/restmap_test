import {stationNumber, stationText, type GasStationRecord} from "./gas-stations.ts";
import type {Result} from "./rest-areas.ts";
import {canonicalHighwayRouteName} from "./highway-route-name.ts";

export const selectExStationColumns = `SELECT id, source_key, service_area_name, route_name,
  direction, oil_company, source_location, tel_no, lpg_available, gasoline_price, diesel_price,
  lpg_price, latitude, longitude, kakao_address_name, kakao_road_address_name,
  source_fetched_at, updated_at FROM test_ex_station_geocodes`;

function timestamp(value: unknown): string | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  return stationText(value);
}

export function normalizeExGasStations(
  rows: Record<string, unknown>[],
): Result<GasStationRecord[]> {
  const items: GasStationRecord[] = [];
  const keys = new Set<string>();
  for (const row of rows) {
    const id = stationNumber(row.id),
      siteCode = stationText(row.source_key),
      name = stationText(row.service_area_name);
    if (!id || !Number.isSafeInteger(id) || id < 1 || !siteCode || !name || keys.has(siteCode))
      return {
        ok: false,
        error: {
          code: "INVALID_DATA",
          message: "고속도로 주유소의 식별자 또는 이름이 올바르지 않습니다.",
        },
      };
    keys.add(siteCode);
    let latitude = stationNumber(row.latitude),
      longitude = stationNumber(row.longitude);
    if (
      latitude === null ||
      longitude === null ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    ) {
      latitude = null;
      longitude = null;
    }
    const price = (value: unknown) => {
      const amount = stationNumber(value);
      return amount !== null && amount > 0 ? amount : null;
    };
    const lpg =
      typeof row.lpg_available === "boolean"
        ? row.lpg_available
        : stationNumber(row.lpg_available) === 1
          ? true
          : stationNumber(row.lpg_available) === 0
            ? false
            : null;
    items.push({
      id,
      siteCode,
      brand: "EX",
      name,
      latitude,
      longitude,
      phone: stationText(row.tel_no),
      address:
        stationText(row.kakao_road_address_name) ??
        stationText(row.kakao_address_name) ??
        stationText(row.source_location),
      detailAddress: null,
      openTime: null,
      closeTime: null,
      services: {
        cargo: null,
        convenience: null,
        self: null,
        lpg,
        carWash: null,
        ev: null,
      },
      routeName: (() => {
        const routeName = stationText(row.route_name);
        return routeName === null ? null : canonicalHighwayRouteName(routeName);
      })(),
      direction: stationText(row.direction),
      oilCompany: stationText(row.oil_company),
      prices: {
        gasoline: price(row.gasoline_price),
        diesel: price(row.diesel_price),
        lpg: price(row.lpg_price),
      },
      priceUpdatedAt: timestamp(row.source_fetched_at),
      revision: timestamp(row.updated_at) ?? "",
    });
  }
  return {ok: true, value: items};
}
