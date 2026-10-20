/**
 * Canonical names used to join highway geometry, rest areas, and fuel stations.
 * Keep legacy source names here so old links and externally synchronized records
 * continue to resolve after the displayed/data model name is unified.
 */
const routeNameAliases: Readonly<Record<string, string>> = {
  "밀양울산선": "함양울산선",
};

export function canonicalHighwayRouteName(value: string): string {
  return routeNameAliases[value] ?? value;
}

export function sameHighwayRouteName(left: string, right: string): boolean {
  return canonicalHighwayRouteName(left) === canonicalHighwayRouteName(right);
}
