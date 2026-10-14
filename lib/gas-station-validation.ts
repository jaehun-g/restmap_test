import {
  stationFields,
  stationServices,
  type GasStation,
  type StationChanges,
} from "./gas-stations.ts";
import type {Result} from "./rest-areas.ts";
export type StationUpdateRequest = {changes: StationChanges; expectedRevision: string};
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const invalid = (message: string): Result<never> => ({
  ok: false,
  error: {code: "VALIDATION_ERROR", message},
});
export function validateStationUpdate(input: unknown): Result<StationUpdateRequest> {
  if (
    !object(input) ||
    Object.keys(input).some(key => !["changes", "expectedRevision"].includes(key)) ||
    typeof input.expectedRevision !== "string" ||
    !/^[a-f0-9]{64}$/.test(input.expectedRevision) ||
    !object(input.changes)
  )
    return invalid("수정 요청 형식 또는 revision이 올바르지 않습니다.");
  const allowed = new Set<string>([...stationFields.map(field => field.key), "services"]);
  if (Object.keys(input.changes).some(key => !allowed.has(key)))
    return invalid("식별자·내부 코드·결제 항목은 수정할 수 없습니다.");
  const changes: Record<string, unknown> = {};
  for (const field of stationFields) {
    if (!Object.hasOwn(input.changes, field.key)) continue;
    const value = input.changes[field.key];
    if (field.kind === "coordinate") {
      if (
        value !== null &&
        (typeof value !== "number" ||
          !Number.isFinite(value) ||
          value < field.min ||
          value > field.max ||
          Number(value.toFixed(10)) !== value)
      )
        return invalid(`${field.label}은 올바른 범위의 소수점 10자리 이하 숫자여야 합니다.`);
      changes[field.key] = value;
    } else {
      if (value !== null && typeof value !== "string")
        return invalid(`${field.label}의 형식이 올바르지 않습니다.`);
      const text = typeof value === "string" ? value.trim() : null;
      if ("required" in field && field.required && !text) return invalid("주유소명은 필수입니다.");
      if (
        text &&
        (text.length > field.maxLength ||
          [...text].some(char => {
            const code = char.codePointAt(0)!;
            return code === 0 || code > 0xffff || (code >= 0xd800 && code <= 0xdfff);
          }))
      )
        return invalid(`${field.label}은 ${field.maxLength}자 이하의 DB UTF-8 문자여야 합니다.`);
      if (field.kind === "time" && text && !/^([01]\d|2[0-3])[0-5]\d$/.test(text))
        return invalid("영업시간은 0000~2359의 HHmm 형식으로 입력해주세요.");
      changes[field.key] = text || null;
    }
  }
  if (Object.hasOwn(input.changes, "services")) {
    if (!object(input.changes.services)) return invalid("시설 수정 형식이 올바르지 않습니다.");
    const keys = new Set<string>(stationServices.map(field => field.key));
    const services: Record<string, boolean | null> = {};
    for (const [key, value] of Object.entries(input.changes.services)) {
      if (!keys.has(key) || (value !== null && typeof value !== "boolean"))
        return invalid("시설은 허용된 항목의 있음·없음·미확인 값만 수정할 수 있습니다.");
      services[key] = value as boolean | null;
    }
    if (Object.keys(services).length) changes.services = services;
  }
  if (!Object.keys(changes).length) return invalid("수정할 필드가 없습니다.");
  return {
    ok: true,
    value: {changes: changes as StationChanges, expectedRevision: input.expectedRevision},
  };
}
export function validateStationCoordinatePair(
  station: GasStation,
  changes: StationChanges,
): Result<true> {
  const latitude = Object.hasOwn(changes, "latitude") ? changes.latitude : station.latitude;
  const longitude = Object.hasOwn(changes, "longitude") ? changes.longitude : station.longitude;
  return (latitude === null) === (longitude === null)
    ? {ok: true, value: true}
    : invalid("위도와 경도는 함께 입력하거나 함께 미등록으로 설정해주세요.");
}
