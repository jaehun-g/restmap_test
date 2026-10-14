import {
  stationFields,
  stationServices,
  type GasStation,
  type StationScalarKey,
  type StationChanges,
} from "./gas-stations.ts";
import { validateStationUpdate, type StationUpdateRequest } from "./gas-station-validation.ts";
import type { Result } from "./rest-areas.ts";
export type StationDraft = {
  values: Record<StationScalarKey, string>;
  services: GasStation["services"];
};
export function createStationDraft(station: GasStation): StationDraft {
  return {
    values: Object.fromEntries(
      stationFields.map(({ key }) => [key, station[key] === null ? "" : String(station[key])]),
    ) as StationDraft["values"],
    services: { ...station.services },
  };
}
export function stationDraftDirty(original: GasStation, draft: StationDraft) {
  return (
    stationFields.some(
      ({ key }) => draft.values[key] !== (original[key] === null ? "" : String(original[key])),
    ) || stationServices.some(({ key }) => draft.services[key] !== original.services[key])
  );
}
export function stationRequestFromDraft(
  original: GasStation,
  revision: string,
  draft: StationDraft,
): Result<StationUpdateRequest> {
  const changes: Record<string, unknown> = {};
  for (const field of stationFields) {
    const before = original[field.key] === null ? "" : String(original[field.key]);
    if (draft.values[field.key] === before) continue;
    const value = draft.values[field.key].trim();
    if (field.kind === "coordinate" && value && !/^-?\d+(\.\d+)?$/.test(value))
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: `${field.label}을 올바른 숫자로 입력해주세요.`,
        },
      };
    changes[field.key] = !value ? null : field.kind === "coordinate" ? Number(value) : value;
  }
  const services = Object.fromEntries(
    stationServices
      .filter(({ key }) => draft.services[key] !== original.services[key])
      .map(({ key }) => [key, draft.services[key]]),
  );
  if (Object.keys(services).length) changes.services = services;
  return validateStationUpdate({ changes: changes as StationChanges, expectedRevision: revision });
}
