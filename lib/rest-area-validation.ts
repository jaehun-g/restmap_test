import {
  facilityDefinitions,
  type Result,
  type RestArea,
} from "./rest-areas.ts";
import { scalarFields, type RestAreaChanges } from "./rest-area-fields.ts";

export type UpdateRequest = {
  changes: RestAreaChanges;
  expectedRevision: string;
};
const invalid = (message: string): Result<never> => ({
  ok: false,
  error: { code: "VALIDATION_ERROR", message },
});
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export function validateUpdateRequest(input: unknown): Result<UpdateRequest> {
  if (
    !object(input) ||
    Object.keys(input).some(
      (key) => !["changes", "expectedRevision"].includes(key),
    ) ||
    typeof input.expectedRevision !== "string" ||
    !/^[a-f0-9]{64}$/.test(input.expectedRevision) ||
    !object(input.changes)
  ) {
    return invalid("수정 요청 형식 또는 revision이 올바르지 않습니다.");
  }
  const changes: Record<string, unknown> = {};
  const allowed = new Set<string>([
    ...scalarFields.map(({ key }) => key),
    "facilities",
  ]);
  if (Object.keys(input.changes).some((key) => !allowed.has(key)))
    return invalid(
      "수정할 수 없는 필드가 포함되어 있습니다. ID와 테이블은 변경할 수 없습니다.",
    );
  for (const field of scalarFields) {
    if (!Object.hasOwn(input.changes, field.key)) continue;
    const value = input.changes[field.key];
    if (field.kind === "text") {
      if (value !== null && typeof value !== "string")
        return invalid(`${field.label}은 문자열이어야 합니다.`);
      const text = typeof value === "string" ? value.trim() : null;
      if ("required" in field && field.required && !text)
        return invalid("휴게소명은 필수입니다.");
      if (
        text &&
        (text.length > field.maxLength ||
          [...text].some((char) => {
            const code = char.codePointAt(0)!;
            return (
              code === 0 || code > 0xffff || (code >= 0xd800 && code <= 0xdfff)
            );
          }))
      )
        return invalid(
          `${field.label}은 ${field.maxLength}자 이하의 DB UTF-8 문자여야 합니다. 이모지는 저장할 수 없습니다.`,
        );
      changes[field.key] = text || null;
    } else {
      if (
        value !== null &&
        (typeof value !== "number" ||
          !Number.isFinite(value) ||
          value < field.min ||
          value > field.max)
      )
        return invalid(`${field.label}의 범위가 올바르지 않습니다.`);
      if (
        typeof value === "number" &&
        (field.kind === "integer"
          ? !Number.isInteger(value)
          : Number(value.toFixed(7)) !== value)
      )
        return invalid(
          `${field.label}은 ${field.kind === "integer" ? "정수" : "소수점 7자리 이하"}여야 합니다.`,
        );
      changes[field.key] = value;
    }
  }
  if (Object.hasOwn(input.changes, "facilities")) {
    if (!object(input.changes.facilities))
      return invalid("시설 수정 형식이 올바르지 않습니다.");
    const keys = new Set<string>(facilityDefinitions.map(([key]) => key));
    const facilities: Record<string, boolean | null> = {};
    for (const [key, value] of Object.entries(input.changes.facilities)) {
      if (!keys.has(key) || (value !== null && typeof value !== "boolean"))
        return invalid(
          "시설은 허용된 항목의 있음·없음·미확인 값만 수정할 수 있습니다.",
        );
      facilities[key] = value as boolean | null;
    }
    if (Object.keys(facilities).length) changes.facilities = facilities;
  }
  if (!Object.keys(changes).length) return invalid("수정할 필드가 없습니다.");
  return {
    ok: true,
    value: {
      changes: changes as RestAreaChanges,
      expectedRevision: input.expectedRevision,
    },
  };
}

export function validateCoordinatePair(
  area: RestArea,
  changes: RestAreaChanges,
): Result<true> {
  if (
    !Object.hasOwn(changes, "latitude") &&
    !Object.hasOwn(changes, "longitude")
  )
    return { ok: true, value: true };
  const latitude = Object.hasOwn(changes, "latitude")
    ? changes.latitude
    : area.latitude;
  const longitude = Object.hasOwn(changes, "longitude")
    ? changes.longitude
    : area.longitude;
  return (latitude === null) === (longitude === null)
    ? { ok: true, value: true }
    : invalid("위도와 경도는 함께 입력하거나 함께 미등록으로 설정해주세요.");
}
