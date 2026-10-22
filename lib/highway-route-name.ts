/**
 * Canonical names used to join highway geometry, rest areas, and fuel stations.
 * Keep legacy source names here so old links and externally synchronized records
 * continue to resolve after the displayed/data model name is unified.
 */
const routeNameAliases: Readonly<Record<string, string>> = {
  "밀양울산선": "함양울산선",
  "대전통영선": "통영대전선",
  "동해선(부산-포항)": "동해선",
  "동해선(삼척-속초)": "동해선",
  "호남선의지선": "호남지선",
  "서산영덕선": "당진영덕선",
  "청주영덕선": "당진영덕선",
  "남해2지선": "남해제2지선",
  "중부내륙선의지선": "중부내륙지선",
  "새만금포항선(대구~포항)": "대구포항선",
  "남해선(영암순천)": "남해선",
  "완주장수선": "익산장수선",
};

export function canonicalHighwayRouteName(value: string): string {
  const normalized = value.replace(/\s+/g, "");
  return routeNameAliases[normalized] ?? value.trim();
}

export function sameHighwayRouteName(left: string, right: string): boolean {
  return canonicalHighwayRouteName(left) === canonicalHighwayRouteName(right);
}
