import {
  facilityDefinitions,
  type FacilityKey,
  type RestArea,
} from "./rest-areas.ts";

export const scalarFields = [
  {
    key: "name",
    column: "name",
    label: "휴게소명",
    kind: "text",
    maxLength: 100,
    required: true,
  },
  {
    key: "latitude",
    column: "latitude",
    label: "위도",
    kind: "coordinate",
    min: -90,
    max: 90,
  },
  {
    key: "longitude",
    column: "longitude",
    label: "경도",
    kind: "coordinate",
    min: -180,
    max: 180,
  },
  {
    key: "phone",
    column: "phone",
    label: "전화번호",
    kind: "text",
    maxLength: 30,
  },
  {
    key: "routeName",
    column: "route_name",
    label: "노선명",
    kind: "text",
    maxLength: 100,
  },
  {
    key: "routeNumber",
    column: "route_number",
    label: "노선 번호",
    kind: "text",
    maxLength: 20,
  },
  {
    key: "routeDirection",
    column: "route_direction",
    label: "진행 방향",
    kind: "text",
    maxLength: 20,
  },
  {
    key: "directionLabel",
    column: "direction_label",
    label: "방향 안내",
    kind: "text",
    maxLength: 100,
  },
  {
    key: "restAreaType",
    column: "rest_area_type",
    label: "휴게소 유형",
    kind: "text",
    maxLength: 30,
  },
  {
    key: "parkingCount",
    column: "parking_count",
    label: "주차 대수",
    kind: "integer",
    min: 0,
    max: 2147483647,
  },
] as const;

export type ScalarKey = (typeof scalarFields)[number]["key"];
export type SortField = "id" | ScalarKey | FacilityKey;
export const sortFields: { key: SortField; label: string }[] = [
  { key: "id", label: "ID" },
  ...scalarFields.map(({ key, label }) => ({ key, label })),
  ...facilityDefinitions.map(([key, label]) => ({ key, label })),
];

export const databaseColumns = [
  "id",
  ...scalarFields.map((field) => field.column),
  ...facilityDefinitions.map(([key]) => key),
];
export const selectRestAreaColumns = `SELECT ${databaseColumns.map((column) => `\`${column}\``).join(", ")} FROM test_lounge`;

export type RestAreaChanges = Partial<Pick<RestArea, ScalarKey>> & {
  facilities?: Partial<RestArea["facilities"]>;
};

export function changedFields(
  original: RestArea,
  draft: RestArea,
): RestAreaChanges {
  const scalar = Object.fromEntries(
    scalarFields
      .filter(({ key }) => original[key] !== draft[key])
      .map(({ key }) => [key, draft[key]]),
  );
  const facilities = Object.fromEntries(
    facilityDefinitions
      .filter(([key]) => original.facilities[key] !== draft.facilities[key])
      .map(([key]) => [key, draft.facilities[key]]),
  );
  return {
    ...scalar,
    ...(Object.keys(facilities).length ? { facilities } : {}),
  };
}
