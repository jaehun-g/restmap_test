export type Result<T> =
  { ok: true; value: T } | { ok: false; error: { code: string; message: string } };

export const facilityDefinitions = [
  ["has_truck_lounge", "화물차 라운지"],
  ["has_gas_station", "주유소"],
  ["has_lpg_station", "LPG 충전소"],
  ["has_ev_charger", "전기차 충전"],
  ["has_repair_shop", "정비소"],
  ["has_car_wash", "세차장"],
  ["has_shower", "샤워실"],
  ["has_sleeping_room", "수면실"],
  ["has_laundry", "세탁실"],
  ["has_restaurant", "식당"],
  ["has_store", "매점"],
  ["has_restroom", "화장실"],
] as const;

export type FacilityKey = (typeof facilityDefinitions)[number][0];
export type RestArea = {
  id: number;
  name: string;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  routeName: string | null;
  routeNumber: string | null;
  routeDirection: string | null;
  directionLabel: string | null;
  restAreaType: string | null;
  parkingCount: number | null;
  facilities: Record<FacilityKey, boolean | null>;
};

export type RestAreasResponse = {
  items: RestAreaRecord[];
  unmappedCount: number;
  fetchedAt: string;
};

export type RestAreaRecord = RestArea & { revision: string };

export function visibleFacilities(area: RestArea, audience: "admin" | "mobile") {
  return facilityDefinitions.filter(
    ([key]) => audience === "admin" || key !== "has_truck_lounge" || area.facilities[key] !== null,
  );
}

export function routeDescription(area: RestArea, audience: "admin" | "mobile") {
  return [
    area.routeName || (audience === "admin" ? "노선 미등록" : null),
    area.directionLabel || area.routeDirection,
  ]
    .filter(Boolean)
    .join(" · ");
}

function nullableText(value: unknown): string | null {
  // This Cafe24 MariaDB reports text fields with binary collation metadata.
  // Decode their UTF-8 bytes without changing the connection or DB settings.
  if (value instanceof Uint8Array) {
    try {
      value = new TextDecoder("utf-8", { fatal: true }).decode(value);
    } catch {
      return null;
    }
  }
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nullableNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function nullableBoolean(value: unknown): boolean | null {
  if (value === 1 || value === "1" || value === true) return true;
  if (value === 0 || value === "0" || value === false) return false;
  return null;
}

export function hasCoordinates<T extends { latitude: number | null; longitude: number | null }>(
  area: T,
): area is T & { latitude: number; longitude: number } {
  return area.latitude !== null && area.longitude !== null;
}

/** MariaDB DECIMAL values arrive as strings; NULL coordinates must never become (0, 0). */
export function normalizeRestAreas(rows: Record<string, unknown>[]): Result<RestArea[]> {
  const items: RestArea[] = [];
  const ids = new Set<number>();
  for (const row of rows) {
    const id = nullableNumber(row.id);
    const name = nullableText(row.name);
    if (id === null || !Number.isSafeInteger(id) || id <= 0 || !name || ids.has(id)) {
      return {
        ok: false,
        error: {
          code: "INVALID_DATA",
          message: "휴게소의 ID 또는 이름이 올바르지 않습니다. test_lounge 데이터를 확인해주세요.",
        },
      };
    }
    ids.add(id);
    let latitude = nullableNumber(row.latitude);
    let longitude = nullableNumber(row.longitude);
    if (
      latitude === null ||
      longitude === null ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      latitude = null;
      longitude = null;
    }
    const parking = nullableNumber(row.parking_count);
    items.push({
      id,
      name,
      latitude,
      longitude,
      phone: nullableText(row.phone),
      routeName: nullableText(row.route_name),
      routeNumber: nullableText(row.route_number),
      routeDirection: nullableText(row.route_direction),
      directionLabel: nullableText(row.direction_label),
      restAreaType: nullableText(row.rest_area_type),
      parkingCount:
        parking !== null && Number.isSafeInteger(parking) && parking >= 0 ? parking : null,
      facilities: Object.fromEntries(
        facilityDefinitions.map(([key]) => [key, nullableBoolean(row[key])]),
      ) as RestArea["facilities"],
    });
  }
  return { ok: true, value: items };
}
