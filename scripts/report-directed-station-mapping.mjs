import fs from "node:fs/promises";
import nextEnv from "@next/env";
import {Client} from "pg";
import {normalizeRestAreas} from "../lib/rest-areas.ts";
import {normalizeExGasStations} from "../lib/ex-gas-stations.ts";
import {mergeFacilityPlaces, isBidirectionalDirection, normalizedDirection, normalizedFacilityName, stationNameDirections} from "../lib/facility-places.ts";
import {canonicalHighwayRouteName} from "../lib/highway-route-name.ts";
import {distanceMeters} from "../lib/geo-search.ts";

nextEnv.loadEnvConfig(process.cwd());
const client = new Client({connectionString: process.env.DATABASE_URL, ssl: {rejectUnauthorized: false}, connectionTimeoutMillis: 10_000});
const reportPath = new URL("../docs/directed-rest-area-station-review.md", import.meta.url);
const cell = value => String(value ?? "미제공").replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
const point = item => item.latitude !== null && item.longitude !== null;
const direction = area => area.directionLabel ?? area.routeDirection;
const missingDirections = new Set(["미제공", "미등록", "정보없음", "방향미상"]);

try {
  await client.connect();
  await client.query("BEGIN READ ONLY");
  const parsedAreas = normalizeRestAreas((await client.query("SELECT * FROM public.test_lounge ORDER BY id")).rows);
  const parsedStations = normalizeExGasStations((await client.query("SELECT * FROM public.test_ex_station_geocodes ORDER BY id")).rows);
  if (!parsedAreas.ok || !parsedStations.ok) throw new Error("휴게소 또는 EX 주유소 원본 형식이 올바르지 않습니다.");
  const areas = parsedAreas.value;
  const stations = parsedStations.value;
  const merged = mergeFacilityPlaces(areas, stations);
  const linkedIds = new Set(merged.stations.filter(station => station.linkedRestAreaId !== null).map(station => station.linkedRestAreaId));
  const stationLinks = new Map(merged.stations.map(station => [station.siteCode, station.linkedRestAreaId]));
  const directed = areas.filter(area => {
    const label = normalizedDirection(direction(area));
    return label && !isBidirectionalDirection(label) && !missingDirections.has(label);
  });
  const bidirectional = areas.filter(area => isBidirectionalDirection(direction(area)));
  const unmatched = directed.filter(area => !linkedIds.has(area.id)).map(area => {
    const exact = stations.filter(station => normalizedFacilityName(station.name) === normalizedFacilityName(area.name));
    const nearby = exact.length || !point(area) ? [] : stations.filter(station => point(station) && distanceMeters(area, station) <= 1000);
    const candidates = (exact.length ? exact : nearby).map(station => {
      const distance = point(area) && point(station) ? distanceMeters(area, station) : null;
      const issues = [];
      if (normalizedFacilityName(station.name) !== normalizedFacilityName(area.name)) issues.push("명칭 불일치");
      if (!area.routeName || !station.routeName || canonicalHighwayRouteName(station.routeName) !== canonicalHighwayRouteName(area.routeName)) issues.push("노선 불일치·누락");
      if (normalizedDirection(station.direction) !== normalizedDirection(direction(area)) && !stationNameDirections(station.name).includes(normalizedDirection(direction(area)))) issues.push("방향 필드·이름 방향 모두 불일치·누락");
      if (distance === null) issues.push("좌표 미등록");
      else if (distance > 300) issues.push("거리 300m 초과");
      const linkedId = stationLinks.get(station.siteCode);
      if (linkedId !== null && linkedId !== undefined && linkedId !== area.id) issues.push(`다른 휴게소 ID ${linkedId}에 연결됨`);
      const nameDirection = normalizedDirection(station.name.match(/\(([^)]*)\)/)?.[1]);
      return {station, distance, issues, linkedId, nameDirectionMatches: nameDirection === normalizedDirection(direction(area))};
    }).sort((left, right) => Number(right.nameDirectionMatches) - Number(left.nameDirectionMatches) || (left.distance ?? Infinity) - (right.distance ?? Infinity) || left.station.id - right.station.id);
    const notes = [];
    if (!point(area)) notes.push("휴게소 좌표 미등록");
    if (!exact.length) notes.push("정규화 이름이 같은 EX 주유소 없음");
    else notes.push("동명 후보의 조건 불일치 또는 다른 휴게소에 연결");
    return {area, candidates, candidateType: exact.length ? "동명 후보" : "주변 1km 후보", notes};
  });
  await client.query("ROLLBACK");

  const checkedAt = new Intl.DateTimeFormat("sv-SE", {timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "medium"}).format(new Date());
  const withStation = unmatched.filter(item => item.area.facilities.has_gas_station === true);
  const unknownStation = unmatched.filter(item => item.area.facilities.has_gas_station === null);
  const withoutStation = unmatched.filter(item => item.area.facilities.has_gas_station === false);
  const lines = [
    "# 방향 명시 휴게소·EX 주유소 미매핑 검증표", "", `조회 시각: ${checkedAt} (Asia/Seoul)`, "",
    "DB를 읽기 전용으로 조회하고 현재 `mergeFacilityPlaces` 로직으로 대조했다. DB 데이터와 서비스 매칭 규칙은 변경하지 않았다.", "",
    "## 집계", "", "| 구분 | 개소 |", "| --- | ---: |",
    `| 전체 휴게소 | ${areas.length} |`, `| EX 주유소 | ${stations.length} |`,
    `| 방향이 명시된 단방향 휴게소 | ${directed.length} |`,
    `| 단방향 휴게소 중 주유소가 연결된 곳 | ${directed.length - unmatched.length} |`,
    `| 단방향 휴게소 중 미매핑 | ${unmatched.length} |`,
    `| 미매핑 중 주유소 있음으로 등록 — 우선 검토 | ${withStation.length} |`,
    `| 미매핑 중 주유소 유무 미확인 | ${unknownStation.length} |`,
    `| 미매핑 중 주유소 없음으로 등록 | ${withoutStation.length} |`,
    `| 양방향 휴게소 / 미매핑 | ${bidirectional.length} / ${bidirectional.filter(area => !linkedIds.has(area.id)).length} |`,
    `| 방향 미제공 등 집계 제외 | ${areas.length - directed.length - bidirectional.length} |`, "",
    "## 판정 기준과 검토 시 주의사항", "",
    "- 단방향은 `direction_label` 우선, 없으면 `route_direction`을 사용하며 양방향·양방·통합 및 방향 미제공 상태를 제외했다.",
    "- 현재 자동 매칭은 EX 주유소를 대상으로 정규화 이름·노선 일치 및 직선거리 300m 이하를 확인한다. 방향 필드·사용자 검증 예외를 우선 적용하고, 해당 조건의 후보가 없으면 주유소 이름의 괄호 안 방향으로 보완한다. 주유소당 하나의 휴게소에 배정하는 규칙은 유지한다.",
    "- 주유소 시설 상태는 DB의 `has_gas_station` 값이다. 있음/없음/미확인은 실제 현장을 재검증한 결과가 아니다.",
    "- 후보는 정규화 이름이 같은 EX 주유소를 모두 제시했다. 동명 후보가 없고 휴게소 좌표가 있으면 주변 1km의 다른 이름 후보를 참고로 제시한다. EX 226건 외의 GS 데이터와 외부 API는 이번 대조에 포함하지 않았다.",
    "- 후보는 확정 매칭이 아니다. 반대 방향 주유소도 포함될 수 있으므로, 이름의 괄호 방향·원천 방향 필드·좌표·기존 연결을 함께 확인해야 한다.",
    "- 서울↔시흥, 창원↔마산, 남이↔통영 등을 전역 방향 별칭으로 동일시하지는 않는다. 방향 필드로 매칭되지 않은 경우에만 주유소 이름의 명시된 방향이 휴게소 방향과 같은지 비교한다.",
    "- 같은 주유소가 이미 다른 휴게소에 연결된 경우 중복 휴게소 레코드인지, 실제 공유 시설인지 확인한 후 반영해야 한다. 사용자 정정에 따라 이천(남이)주유소는 이천(남이 방향)에, 마장복합(상)주유소는 마장(양방향)에 연결한다.",
    "- 거리와 좌표는 DB 저장값으로 계산했다. 현재 값이 정확하다고 확정하는 것이 아니며, 거리는 반올림해 표시했다.", "",
  ];
  function table(title, items) {
    lines.push(`## ${title} (${items.length}곳)`, "", "| 휴게소 ID | 휴게소 | 노선 | 방향 | 검토 후보 / 상태 |", "| --- | --- | --- | --- | --- |");
    for (const {area, candidates, notes} of items) {
      const best = candidates[0];
      const summary = best ? `${best.station.name} (ID ${best.station.id}, ${best.distance === null ? "거리 미확인" : `${Math.round(best.distance).toLocaleString("ko-KR")}m`}) — ${best.issues.join(" · ") || "배정 상태 확인"}${candidates.length > 1 ? ` / 후보 총 ${candidates.length}곳` : ""}` : notes.join(" · ");
      lines.push(`| ${area.id} | ${cell(area.name)} | ${cell(area.routeName)} | ${cell(direction(area))} | ${cell(summary)} |`);
    }
    lines.push("");
  }
  table("1. 주유소 있음으로 등록 — 우선 검토", withStation);
  table("2. 주유소 유무 미확인 — 존재 여부부터 확인", unknownStation);
  table("3. 주유소 없음으로 등록 — 미매핑 오류로 단정하지 않음", withoutStation);
  lines.push("## 후보 상세 및 검증 기록", "", "원천 코드는 `source_key`이며 좌표 순서는 위도, 경도(WGS84)다. 후보가 있는 휴게소의 상세 정보를 아래에 기록한다.", "");
  for (const {area, candidates, candidateType} of unmatched.filter(item => item.candidates.length)) {
    lines.push(`### ID ${area.id} · ${area.name}`, "", `휴게소 좌표: ${area.latitude ?? "미등록"}, ${area.longitude ?? "미등록"} / 노선: ${area.routeName ?? "미등록"} / 방향: ${direction(area)}`, "", `후보 구분: ${candidateType}`, "",
      "| 주유소 ID | 주유소명 | source_key | 노선 | 방향 필드 | 거리(m) | 저장 좌표 | 표시 주소 | 현재 연결 휴게소 ID | 불일치 조건 |",
      "| --- | --- | --- | --- | --- | ---: | --- | --- | --- | --- |");
    for (const {station, distance, issues, linkedId} of candidates) lines.push(`| ${station.id} | ${cell(station.name)} | ${cell(station.siteCode)} | ${cell(station.routeName)} | ${cell(station.direction)} | ${distance === null ? "미확인" : Math.round(distance)} | ${station.latitude ?? "미등록"}, ${station.longitude ?? "미등록"} | ${cell(station.address)} | ${linkedId ?? "미연결"} | ${cell(issues.join(" · ") || "배정 상태 확인")} |`);
    lines.push("", "- [ ] 실제 동일 휴게소·진행 방향인지 확인", "- [ ] 주소·좌표 및 다른 휴게소 연결 여부 확인", "- [ ] 수정할 값·연결할 원천 코드·근거 기록", "", "> 검증 결과: 미작성", "");
  }
  lines.push("## 후보 없는 항목의 검증 기록", "", "| 휴게소 ID | 확인한 주유소명 / 원천 코드 | 실제 주유소 유무 | 수정값 / 근거 | 반영 여부 |", "| --- | --- | --- | --- | --- |");
  for (const {area} of unmatched.filter(item => !item.candidates.length)) lines.push(`| ${area.id} | | | | [ ] |`);
  lines.push("", "## 재실행", "", "```powershell", "node scripts/report-directed-station-mapping.mjs", "```", "", "최신 DB를 읽어 이 문서를 다시 생성한다. 수기로 작성한 검증 메모를 보존하려면 재실행 전에 별도로 보관해야 한다.", "");
  await fs.writeFile(reportPath, lines.join("\n"), "utf8");
  console.log(JSON.stringify({checkedAt, directed: directed.length, matched: directed.length - unmatched.length, unmatched: unmatched.length, withStation: withStation.length, unknownStation: unknownStation.length, withoutStation: withoutStation.length, report: "docs/directed-rest-area-station-review.md", examples: withStation.slice(0, 10).map(item => ({id: item.area.id, name: item.area.name}))}, null, 2));
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  await client.end();
}
