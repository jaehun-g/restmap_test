import { facilityDefinitions, type FacilityKey, type RestArea } from "./rest-areas.ts";
import type { SortField } from "./rest-area-fields.ts";
import { filterByGeoScope, type GeoPoint, type GeoSearchScope } from "./geo-search.ts";

export type LoungeFilter = "all" | "present" | "absent" | "unknown";
export type RestAreaFilters = {
  routeName: string | null;
  missingRoute: boolean;
  facilities: FacilityKey[];
  lounge: LoungeFilter;
};
export const selectableFacilities = facilityDefinitions.filter(
  ([key]) => key !== "has_truck_lounge",
);
export function initialFilters(): RestAreaFilters {
  return {
    routeName: null,
    missingRoute: false,
    facilities: [],
    lounge: "all",
  };
}

function searchTerms(query: string) {
  return query.trim().toLocaleLowerCase("ko-KR").split(/\s+/).filter(Boolean);
}

export function filterRestAreas<T extends RestArea>(
  areas: T[],
  filters: RestAreaFilters,
  query: string,
): T[] {
  const terms = searchTerms(query);
  return areas.filter((area) => {
    const haystack = `${area.name} ${area.routeName ?? ""}`.toLocaleLowerCase("ko-KR");
    if (!terms.every((term) => haystack.includes(term))) return false;
    if (filters.missingRoute && area.routeName !== null) return false;
    if (filters.routeName !== null && area.routeName !== filters.routeName) return false;
    if (!filters.facilities.every((key) => area.facilities[key] === true)) return false;
    const lounge = area.facilities.has_truck_lounge;
    return (
      filters.lounge === "all" ||
      (filters.lounge === "present" && lounge === true) ||
      (filters.lounge === "absent" && lounge === false) ||
      (filters.lounge === "unknown" && lounge === null)
    );
  });
}

/** 노선 선택 시 위치 조건만 건너뛰고 거리순 정렬과 나머지 조건은 유지합니다. */
export function filterMobileRestAreas<T extends RestArea>(
  areas: T[],
  filters: RestAreaFilters,
  query: string,
  scope: GeoSearchScope,
  position: GeoPoint | null,
): T[] {
  return filterByGeoScope(
    filterRestAreas(areas, filters, query),
    filters.routeName ? { kind: "all" } : scope,
    position,
  );
}

const collator = new Intl.Collator("ko-KR", {
  numeric: true,
  sensitivity: "base",
});
export function routeOptions(areas: RestArea[]) {
  const counts = new Map<string, number>();
  areas.forEach((area) => {
    if (area.routeName) counts.set(area.routeName, (counts.get(area.routeName) ?? 0) + 1);
  });
  return [...counts]
    .sort(([a], [b]) => collator.compare(a, b))
    .map(([name, count]) => ({ name, count }));
}

export function sortRestAreas<T extends RestArea>(
  areas: T[],
  field: SortField,
  direction: "asc" | "desc",
): T[] {
  const value = (area: RestArea) =>
    field.startsWith("has_")
      ? area.facilities[field as FacilityKey]
      : area[field as "id" | Exclude<SortField, FacilityKey>];
  return [...areas].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    if (left === null || right === null)
      return left === right ? a.id - b.id : left === null ? 1 : -1;
    const comparison =
      typeof left === "number" && typeof right === "number"
        ? left - right
        : typeof left === "boolean" && typeof right === "boolean"
          ? Number(left) - Number(right)
          : collator.compare(String(left), String(right));
    return comparison ? comparison * (direction === "asc" ? 1 : -1) : a.id - b.id;
  });
}
