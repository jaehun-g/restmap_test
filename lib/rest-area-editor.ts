import {
  facilityDefinitions,
  type RestArea,
  type Result,
} from "./rest-areas.ts";
import { scalarFields, type ScalarKey } from "./rest-area-fields.ts";
import {
  validateUpdateRequest,
  validateCoordinatePair,
  type UpdateRequest,
} from "./rest-area-validation.ts";

export type EditorDraft = {
  values: Record<ScalarKey, string>;
  facilities: RestArea["facilities"];
};
export function createEditorDraft(area: RestArea): EditorDraft {
  return {
    values: Object.fromEntries(
      scalarFields.map(({ key }) => [
        key,
        area[key] === null ? "" : String(area[key]),
      ]),
    ) as EditorDraft["values"],
    facilities: { ...area.facilities },
  };
}
export function editorIsDirty(area: RestArea, draft: EditorDraft): boolean {
  const initial = createEditorDraft(area);
  return (
    scalarFields.some(({ key }) => initial.values[key] !== draft.values[key]) ||
    facilityDefinitions.some(
      ([key]) => area.facilities[key] !== draft.facilities[key],
    )
  );
}
export function requestFromDraft(
  area: RestArea,
  revision: string,
  draft: EditorDraft,
): Result<UpdateRequest> {
  const initial = createEditorDraft(area);
  const changes = Object.fromEntries(
    scalarFields
      .filter(({ key }) => initial.values[key] !== draft.values[key])
      .map(({ key, kind }) => {
        const text = draft.values[key].trim();
        return [
          key,
          kind === "text" ? text || null : text ? Number(text) : null,
        ];
      }),
  );
  const facilities = Object.fromEntries(
    facilityDefinitions
      .filter(([key]) => area.facilities[key] !== draft.facilities[key])
      .map(([key]) => [key, draft.facilities[key]]),
  );
  const result = validateUpdateRequest({
    expectedRevision: revision,
    changes: {
      ...changes,
      ...(Object.keys(facilities).length ? { facilities } : {}),
    },
  });
  if (!result.ok) return result;
  const pair = validateCoordinatePair(area, result.value.changes);
  return pair.ok ? result : pair;
}
