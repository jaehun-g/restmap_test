import type {Result} from "./rest-areas.ts";

export type ExStationGeocodeOverride = {
  sourceKey: string;
  searchAddress: string;
};

function fail(code: string, message: string): Result<never> {
  return {ok: false, error: {code, message}};
}

export function parseExStationGeocodeOverrides(
  payload: unknown,
): Result<ExStationGeocodeOverride[]> {
  if (!Array.isArray(payload))
    return fail("OVERRIDE_DATA_INVALID", "수동 주소 매핑은 배열이어야 합니다.");
  const sourceKeys = new Set<string>();
  const overrides: ExStationGeocodeOverride[] = [];
  for (const value of payload) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return fail("OVERRIDE_DATA_INVALID", "수동 주소 매핑 항목 형식이 올바르지 않습니다.");
    const {sourceKey, searchAddress} = value as Record<string, unknown>;
    if (typeof sourceKey !== "string" || !sourceKey.trim() || sourceKey.trim().length > 255)
      return fail("OVERRIDE_DATA_INVALID", "수동 주소 매핑의 sourceKey가 올바르지 않습니다.");
    if (
      typeof searchAddress !== "string" ||
      !searchAddress.trim() ||
      searchAddress.trim().length > 255
    )
      return fail("OVERRIDE_DATA_INVALID", "수동 주소 매핑의 searchAddress가 올바르지 않습니다.");
    const key = sourceKey.trim();
    if (sourceKeys.has(key)) return fail("OVERRIDE_DATA_INVALID", "중복된 sourceKey가 있습니다.");
    sourceKeys.add(key);
    overrides.push({sourceKey: key, searchAddress: searchAddress.trim().replace(/\s+/g, " ")});
  }
  return {ok: true, value: overrides};
}
