/** 사용자 확인 방향. 표준 코드는 유지하고 표시 이름과 방향만 보정한다. */
export const verifiedRestAreaDirections = [
  {id: 227, code: "000376", name: "부안쉼터(서울 방향)", direction: "서울", sourceNames: ["부안상쉼터"]},
  {id: 228, code: "000377", name: "부안쉼터(목포 방향)", direction: "목포", sourceNames: ["부안하쉼터"]},
  {id: 263, code: "000501", name: "양북임시(울산 방향)", direction: "울산", sourceNames: ["양북임시(상)휴게소", "양북임시(상 방향)"]},
  {id: 264, code: "000502", name: "양북임시(포항 방향)", direction: "포항", sourceNames: ["양북임시(하)휴게소", "양북임시(하 방향)"]},
  {id: 209, code: "000602", name: "밀양영남루(밀양 방향)", direction: "밀양", sourceNames: ["밀양영남루(울산 방향)", "밀양영남루(울산)휴게소", "밀양영남루(울산)", "밀양영남루(밀양)휴게소"]},
  {id: 222, code: "000329", name: "의왕청계(일산 방향)", direction: "일산", sourceNames: ["의왕(일산 방향)", "의왕(일산)휴게소", "의왕(일산)"]},
  {id: 223, code: "000336", name: "서하남행복드림쉼터", direction: "판교", sourceNames: ["서하남행복드림쉼터"]},
] as const;

export function verifiedRestAreaDirectionByName(name: string) {
  const key = name.replace(/\s+/g, "");
  return verifiedRestAreaDirections.find(item => [item.name, ...item.sourceNames].some(value => value.replace(/\s+/g, "") === key));
}
