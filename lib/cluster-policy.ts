/** 카카오 지도 레벨은 숫자가 작을수록 확대입니다. 이 레벨 이상(축소)에서는 항상 클러스터링합니다. */
export const CLUSTER_MIN_LEVEL = 5;
/** 확대 상태에서도 화면 안 표시 단위가 이 값을 넘으면 클러스터링을 유지합니다. */
export const MAX_INDIVIDUAL_VISIBLE = 150;

/** 화면 안 표시 단위 수에 따라 클러스터러의 minLevel(이 레벨 이상에서 클러스터링)을 정합니다. */
export function clusterMinLevel(
  visibleCount: number,
  options: {minLevel?: number; maxVisible?: number} = {},
): number {
  const {minLevel = CLUSTER_MIN_LEVEL, maxVisible = MAX_INDIVIDUAL_VISIBLE} = options;
  return visibleCount > maxVisible ? 1 : minLevel;
}

/** 현재 레벨과 화면 안 표시 단위 수로 클러스터링 여부를 판단합니다. */
export function shouldCluster(
  level: number,
  visibleCount: number,
  options?: {minLevel?: number; maxVisible?: number},
): boolean {
  return level >= clusterMinLevel(visibleCount, options);
}

export type LatLngItem = {latitude: number; longitude: number};

/** 소수 `precision`자리(5자리 ≈ 1m)까지 같은 좌표의 항목을 입력 순서를 유지하며 묶습니다. */
export function groupByCoordinate<T extends LatLngItem>(items: T[], precision = 5): T[][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = `${item.latitude.toFixed(precision)},${item.longitude.toFixed(precision)}`;
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return [...groups.values()];
}

/** 경계(포함) 안에 있는 항목 수를 셉니다. */
export function countInBounds(
  items: LatLngItem[],
  bounds: {south: number; west: number; north: number; east: number},
): number {
  let count = 0;
  for (const {latitude, longitude} of items) {
    if (
      latitude >= bounds.south &&
      latitude <= bounds.north &&
      longitude >= bounds.west &&
      longitude <= bounds.east
    )
      count++;
  }
  return count;
}

/** 동일 좌표 그룹 마커에 쓰는 개수 배지 이미지(SVG data URI)를 만듭니다. */
export function groupBadgeImageUrl(count: number, hasLounge: boolean): string {
  const stroke = hasLounge ? "#ffb962" : "#ffffff";
  const size = count > 99 ? 12 : 15;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">` +
    `<circle cx="18" cy="18" r="16" fill="#193d6b" stroke="${stroke}" stroke-width="3"/>` +
    `<text x="18" y="23" text-anchor="middle" font-family="sans-serif" font-size="${size}" ` +
    `font-weight="700" fill="#ffffff">${count > 99 ? "99+" : count}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
