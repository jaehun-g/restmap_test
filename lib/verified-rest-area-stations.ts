/** 2026-10-22 사용자 검증 결과. 원천 식별자는 변경하지 않는다. */
export const verifiedRestAreaStations = [
  {sourceKey: "0010|B00183|부산|SK", restName: "옥천만남", routeName: "경부선"},
  {sourceKey: "0150|B00084|목포|HD", restName: "행담도", routeName: "서해안선"},
  {sourceKey: "0352|B00187|하남|SK", restName: "마장", routeName: "중부선"},
  {sourceKey: "0290|B00244|-|AD", restName: "처인", routeName: "세종포천선", direction: "포천"},
  {sourceKey: "0290|B00245|-|AD", restName: "처인", routeName: "세종포천선", direction: "세종"},
  {sourceKey: "0290|B00250|-|AD", restName: "고삼호수", routeName: "세종포천선", direction: "포천"},
  {sourceKey: "0290|B00251|-|AD", restName: "고삼호수", routeName: "세종포천선", direction: "세종"},
  {sourceKey: "0450|B00102|양평|AD", restName: "선산", routeName: "중부내륙선", direction: "창원"},
  {sourceKey: "0450|B00101|마산|AD", restName: "선산", routeName: "중부내륙선", direction: "양평"},
  {sourceKey: "0450|B00137|양평|AD", restName: "문경", routeName: "중부내륙선", direction: "창원"},
  {sourceKey: "0450|B00136|마산|AD", restName: "문경", routeName: "중부내륙선", direction: "양평"},
  {sourceKey: "0450|B00167|마산|AD", restName: "서여주", routeName: "중부내륙선", direction: "양평"},
  {sourceKey: "0450|B00166|양평|AD", restName: "서여주", routeName: "중부내륙선", direction: "창원"},
  {sourceKey: "1510|B00156|서천|AD", restName: "부여백제", routeName: "서천공주선", direction: "공주"},
  {sourceKey: "1510|B00155|공주|AD", restName: "부여백제", routeName: "서천공주선", direction: "서천"},
  {sourceKey: "0650|B00246|속초|AD", restName: "영덕", routeName: "포항영덕선", direction: "영덕"},
  {sourceKey: "0650|B00247|동해|AD", restName: "포항", routeName: "포항영덕선", direction: "포항"},
  {sourceKey: "7001|B00248|포항|AD", restName: "김제", routeName: "새만금포항선", direction: "전주"},
  {sourceKey: "7001|B00249|익산|AD", restName: "김제", routeName: "새만금포항선", direction: "새만금"},
  {sourceKey: "1000|B00158|판교|HD", restName: "의왕청계", routeName: "수도권제1순환선", direction: "일산"},
] as const;

export const verifiedStationIndependentLocations = [
  {
    sourceKey: "1000|B00158|판교|HD",
    restAreaId: 222,
    latitude: 37.3932302,
    longitude: 127.0221883,
    roadAddress: "경기 의왕시 안양판교로 476",
    parcelAddress: "경기 의왕시 청계동 산 8-18",
  },
  {
    sourceKey: "0450|B00102|양평|AD",
    restAreaId: 103,
    latitude: 36.2738648,
    longitude: 128.2516744,
    roadAddress: "경북 구미시 옥성면 중부내륙고속도로 129-1",
    parcelAddress: "경북 구미시 옥성면 덕촌리 64-2",
  },
] as const;

export const verifiedStationAreaLinks = [
  {sourceKey: "1000|B00161|판교|S", restAreaId: 223},
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

export function verifiedStationStorageDirection(sourceKey: string): string | undefined {
  if (sourceKey === "1000|B00158|판교|HD") return "일산";
  if (sourceKey === "0650|B00246|속초|AD") return "영덕";
  if (sourceKey === "0650|B00247|동해|AD") return "포항";
  if (sourceKey === "7001|B00248|포항|AD") return "전주";
  if (sourceKey === "7001|B00249|익산|AD") return "새만금";
  if (sourceKey === "1510|B00156|서천|AD") return "공주";
  if (sourceKey === "1510|B00155|공주|AD") return "서천";
  if (["0450|B00101|마산|AD", "0450|B00136|마산|AD", "0450|B00167|마산|AD"].includes(sourceKey)) return "양평";
  return ["0450|B00102|양평|AD", "0450|B00137|양평|AD", "0450|B00166|양평|AD"].includes(sourceKey)
    ? "창원"
    : undefined;
}

export function verifiedStationMatchingRoute(sourceKey: string): string | undefined {
  if (["0650|B00246|속초|AD", "0650|B00247|동해|AD"].includes(sourceKey)) return "포항영덕선";
  if (["7001|B00248|포항|AD", "7001|B00249|익산|AD"].includes(sourceKey)) return "새만금포항선";
  return undefined;
}

export function verifiedStationName(sourceKey: string, name: string): string {
  if (sourceKey === "1000|B00161|판교|S") return "서하남(판교)주유소";
  return sourceKey === "0140|B00243|밀양|AD" ? "밀양영남루(밀양)주유소" : name;
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
  {sourceKey: "0140|B00243|밀양|AD", restAreaId: 209, latitude: 35.4894626, longitude: 128.6643041},
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
