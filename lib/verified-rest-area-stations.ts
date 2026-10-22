/** 2026-10-22 사용자 검증 결과. 원천 식별자는 변경하지 않는다. */
export const verifiedRestAreaStations = [
  {sourceKey: "0010|B00183|부산|SK", restName: "옥천만남", routeName: "경부선"},
  {sourceKey: "0150|B00084|목포|HD", restName: "행담도", routeName: "서해안선"},
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

/** 사용자 지시로 거리만 실패한 동명·동방향 시설의 좌표를 휴게소에 맞춘다. */
export const verifiedStationCoordinates = [
  {sourceKey: "0010|B00022|부산|AD", restAreaId: 25, latitude: 36.6577, longitude: 127.37},
  {sourceKey: "0101|B00181|부산|AD", restAreaId: 171, latitude: 34.8073, longitude: 127.181},
  {sourceKey: "0121|B00142|무안|AD", restAreaId: 139, latitude: 35.0382, longitude: 126.509},
  {sourceKey: "0122|B00116|대구|AD", restAreaId: 62, latitude: 35.7065, longitude: 128.057},
  {sourceKey: "0122|B00117|무안|AD", restAreaId: 63, latitude: 35.7089, longitude: 128.058},
  {sourceKey: "0122|B00191|대구|AD", restAreaId: 178, latitude: 35.3644, longitude: 127.105},
  {sourceKey: "0122|B00195|무안|AD", restAreaId: 179, latitude: 35.3657, longitude: 127.105},
  {sourceKey: "0122|B00198|대구|AD", restAreaId: 173, latitude: 35.765, longitude: 128.403},
  {sourceKey: "0122|B00199|무안|AD", restAreaId: 170, latitude: 35.7674, longitude: 128.403},
  {sourceKey: "0140|B00243|밀양|AD", restAreaId: 209, latitude: 35.4929, longitude: 128.664},
  {sourceKey: "0150|B00097|시흥|AD", restAreaId: 101, latitude: 36.0188, longitude: 126.798},
  {sourceKey: "0150|B00128|시흥|AD", restAreaId: 121, latitude: 36.5524, longitude: 126.582},
  {sourceKey: "0150|B00129|목포|AD", restAreaId: 122, latitude: 36.5526, longitude: 126.58},
  {sourceKey: "0251|B00038|순천|AD", restAreaId: 38, latitude: 36.0486, longitude: 127.102},
  {sourceKey: "0251|B00046|순천|AD", restAreaId: 54, latitude: 35.2585, longitude: 127.151},
  {sourceKey: "0251|B00073|순천|AD", restAreaId: 47, latitude: 35.0762, longitude: 127.264},
  {sourceKey: "0251|B00169|순천|AD", restAreaId: 161, latitude: 35.8039, longitude: 127.024},
  {sourceKey: "0270|B00175|광양|AD", restAreaId: 165, latitude: 35.1489, longitude: 127.454},
  {sourceKey: "0300|B00152|청원|AD", restAreaId: 152, latitude: 36.6235, longitude: 126.84},
  {sourceKey: "0400|B00185|제천|AD", restAreaId: 177, latitude: 36.9695, longitude: 127.591},
  {sourceKey: "0550|B00054|부산|AD", restAreaId: 66, latitude: 36.5532, longitude: 128.642},
] as const;
