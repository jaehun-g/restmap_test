/** 2026-10-22 사용자 요청으로 제외한 민자 구간 휴게소. 혼합 노선 전체를 제외하지 않는다. */
export const excludedPrivateRestAreas = [
  {id: 242, code: "000454", name: "가평(서울 방향)", route: "서울양양선"},
  {id: 243, code: "000455", name: "가평(춘천 방향)", route: "서울양양선"},
  {id: 244, code: "000456", name: "오산(봉담 방향)", route: "평택파주선"},
  {id: 245, code: "000457", name: "오산(동탄 방향)", route: "평택파주선"},
  {id: 246, code: "000458", name: "송산포도", route: "평택시흥선"},
  {id: 247, code: "000459", name: "정안알밤(천안 방향)", route: "논산천안선,호남선"},
  {id: 248, code: "000460", name: "정안알밤(논산 방향)", route: "논산천안선,호남선"},
  {id: 249, code: "000461", name: "이인(천안 방향)", route: "논산천안선,호남선"},
  {id: 250, code: "000462", name: "탄천(논산 방향)", route: "논산천안선,호남선"},
  {id: 251, code: "000469", name: "양주(일산 방향)", route: "수도권제1순환선"},
  {id: 252, code: "000477", name: "청도새마을(대구 방향)", route: "중앙선"},
  {id: 253, code: "000478", name: "청도새마을(부산 방향)", route: "중앙선"},
  {id: 254, code: "000481", name: "장안(부산 방향)", route: "동해선"},
  {id: 255, code: "000482", name: "장안(울산 방향)", route: "동해선"},
  {id: 256, code: "000483", name: "영종대교", route: "인천국제공항선"},
  {id: 257, code: "000487", name: "양평(광주 방향)", route: "중앙선"},
  {id: 258, code: "000488", name: "양평(원주 방향)", route: "중앙선"},
  {id: 259, code: "000491", name: "광주(광주 방향)", route: "중앙선"},
  {id: 260, code: "000492", name: "광주(원주 방향)", route: "중앙선"},
  {id: 265, code: "000516", name: "낙동강의성(영천 방향)", route: "상주영천선"},
  {id: 266, code: "000517", name: "낙동강구미(상주 방향)", route: "상주영천선"},
  {id: 267, code: "000520", name: "군위영천(영천 방향)", route: "상주영천선"},
  {id: 268, code: "000521", name: "삼국유사군위(상주 방향)", route: "상주영천선"},
] as const;

export const excludedPrivateRestAreaCodes: ReadonlySet<string> = new Set(excludedPrivateRestAreas.map(item => item.code));
