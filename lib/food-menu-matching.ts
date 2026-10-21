import type {RestArea} from "./rest-areas.ts";
import type {SourceFoodMenu} from "./food-menu-source.ts";
import {normalizedFacilityName, normalizedDirection} from "./facility-places.ts";
import {canonicalHighwayRouteName} from "./highway-route-name.ts";

function routeNamesMatch(sourceRoute: string, areaRoute: string | null): boolean {
  if (!areaRoute) return false;
  const areaName = canonicalHighwayRouteName(areaRoute);
  return sourceRoute.split(/[,，]/).some(route => canonicalHighwayRouteName(route) === areaName);
}

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
    const codeCandidates = areas.filter(area => area.stdRestCd === stdRestCd);
    if (codeCandidates.length) {
      const matched = consistent && codeCandidates.length === 1;
      return {stdRestCd, restCd: first.restCd, restName: first.restName, routeName: first.routeName,
        direction, restAreaId: matched ? codeCandidates[0].id : null,
        status: matched ? "matched" : "ambiguous", candidates: codeCandidates.map(area => area.id)};
    }
    const nameCandidates = areas.filter(area =>
      !area.stdRestCd && normalizedFacilityName(area.name) === normalizedFacilityName(first.restName),
    );
    const routeCandidates = consistent && first.routeName ? nameCandidates.filter(area =>
      routeNamesMatch(first.routeName!, area.routeName),
    ) : [];
    const exactCandidates = direction ? routeCandidates.filter(area =>
      normalizedDirection(area.directionLabel ?? area.routeDirection) === direction,
    ) : routeCandidates;
    const status = !consistent || exactCandidates.length > 1 ? "ambiguous" : exactCandidates.length === 1 ? "matched" : "unmatched";
    const candidates = exactCandidates.length ? exactCandidates.map(area => area.id) : nameCandidates.map(area => area.id);
    return {
      stdRestCd, restCd: first.restCd, restName: first.restName, routeName: first.routeName,
      direction, restAreaId: status === "matched" ? exactCandidates[0].id : null, status, candidates,
    };
  });
}
