import type {RestArea} from "./rest-areas.ts";
import type {SourceFoodMenu} from "./food-menu-source.ts";
import {normalizedFacilityName, normalizedDirection} from "./facility-places.ts";
import {canonicalHighwayRouteName} from "./highway-route-name.ts";

export type FoodAreaMatch = {
  stdRestCd: string;
  restCd: string | null;
  restName: string;
  routeName: string | null;
  direction: string | null;
  restAreaId: number | null;
  status: "matched" | "unmatched" | "ambiguous";
  candidates: number[];
};

export function matchFoodAreas(items: SourceFoodMenu[], areas: RestArea[]): FoodAreaMatch[] {
  const groups = new Map<string, SourceFoodMenu[]>();
  for (const item of items) {
    const group = groups.get(item.stdRestCd) ?? [];
    group.push(item);
    groups.set(item.stdRestCd, group);
  }
  return [...groups].map(([stdRestCd, menus]) => {
    const first = menus[0];
    const direction = normalizedDirection(first.restName.match(/\(([^)]+)\)/)?.[1]);
    const consistent = menus.every(menu => menu.restCd === first.restCd && menu.restName === first.restName && menu.routeName === first.routeName);
    const nameCandidates = areas.filter(area =>
      normalizedFacilityName(area.name) === normalizedFacilityName(first.restName),
    );
    const exactCandidates = consistent && direction && first.routeName ? nameCandidates.filter(area =>
      area.routeName && canonicalHighwayRouteName(area.routeName) === canonicalHighwayRouteName(first.routeName!) &&
      normalizedDirection(area.directionLabel ?? area.routeDirection) === direction,
    ).map(area => area.id) : [];
    const status = !consistent || exactCandidates.length > 1 ? "ambiguous" : exactCandidates.length === 1 ? "matched" : "unmatched";
    const candidates = exactCandidates.length ? exactCandidates : nameCandidates.map(area => area.id);
    return {
      stdRestCd, restCd: first.restCd, restName: first.restName, routeName: first.routeName,
      direction, restAreaId: status === "matched" ? exactCandidates[0] : null, status, candidates,
    };
  });
}
