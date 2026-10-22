/** 2026-10-22 사용자 검증 결과. 원천 식별자는 변경하지 않는다. */
export const verifiedRestAreaStations = [
  {sourceKey: "0010|B00183|부산|SK", restName: "옥천만남", routeName: "경부선"},
  {sourceKey: "0150|B00084|목포|HD", restName: "행담도", routeName: "서해안선"},
  {sourceKey: "0352|B00120|통영|AD", restName: "마장", routeName: "중부선"},
  {sourceKey: "0352|B00187|하남|SK", restName: "마장", routeName: "중부선"},
  {sourceKey: "0290|B00244|-|AD", restName: "처인", routeName: "세종포천선", direction: "포천"},
  {sourceKey: "0290|B00245|-|AD", restName: "처인", routeName: "세종포천선", direction: "세종"},
  {sourceKey: "0290|B00250|-|AD", restName: "고삼호수", routeName: "세종포천선", direction: "포천"},
  {sourceKey: "0290|B00251|-|AD", restName: "고삼호수", routeName: "세종포천선", direction: "세종"},
] as const;

export const verifiedStationLocations = [
  {
    sourceKey: "0150|B00084|목포|HD",
    restAreaId: 89,
    latitude: 36.9448,
    longitude: 126.808,
    roadAddress: "충청남도 당진시 신평면 서해안고속도로 275",
    parcelAddress: "충남 당진시 신평면 매산리 513",
  },
  {
    sourceKey: "0290|B00250|-|AD",
    restAreaId: 211,
    latitude: 37.0771,
    longitude: 127.295,
    roadAddress: "경기도 안성시 고삼면 이전봉산길 224-56",
    parcelAddress: "경기 안성시 고삼면 삼은리 산 15-9",
  },
] as const;

export function verifiedStationDirection(sourceKey: string): string | undefined {
  const verified = verifiedRestAreaStations.find(item => item.sourceKey === sourceKey);
  return verified && "direction" in verified ? verified.direction : undefined;
}
