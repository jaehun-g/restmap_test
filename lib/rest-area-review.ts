import type {SourceRow} from "./rest-area-sources.ts";

export type RestAreaReview = {id: number; name: string; reason: string};

export function findMissingRestAreas(
  areas: {id: number; name: string; stdRestCd?: string | null}[],
  locations: SourceRow[],
): RestAreaReview[] {
  const codes = new Set(locations.map(row => row.stdRestCd).filter(Boolean));
  return areas.filter(area => area.stdRestCd && !codes.has(area.stdRestCd)).map(area => ({
    id: area.id, name: area.name, reason: "기준정보 API에서 조회되지 않음",
  }));
}
