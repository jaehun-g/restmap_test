import {normalizedFacilityName, normalizedDirection} from "./facility-places.ts";
import {canonicalHighwayRouteName} from "./highway-route-name.ts";
import {distanceMeters} from "./geo-search.ts";
import type {RestAreaSources, SourceRow} from "./rest-area-sources.ts";

export type LoungeRow = Record<string, string | number | null> & {id: number; name: string};
export type IntegratedArea = {
  code: string; serviceCode: string | null; name: string; names: string[];
  routes: string[]; routeCodes: string[]; direction: string | null; address: string | null;
  fields: Record<string, string | number | null>; sources: string[]; warnings: string[];
};
export type IntegrationEntry = {
  area: IntegratedArea; status: "existing" | "new" | "alias" | "review";
  targetId: number | null; candidates: number[]; reason: string;
  changes: Record<string, string | number | null>;
};
export type IntegrationPlan = {entries: IntegrationEntry[]; csvRows: LoungeRow[]; csvReviews: string[]; retainedIds: number[]};
const text = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;
const numeric = (value: unknown): number | null => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
const yesNo = (value: unknown): number | null => ["Y", "O", "1", 1].includes(value as string) ? 1 : ["N", "X", "0", 0].includes(value as string) ? 0 : null;
export function validRestCoordinates(latitude: unknown, longitude: unknown): boolean {
  const lat = numeric(latitude), lon = numeric(longitude);
  return lat !== null && lon !== null && lat >= 33 && lat <= 39 && lon >= 124 && lon <= 132;
}
export function restNameDirection(name: string): string | null {
  const raw = name.match(/\(([^)]*)\)/)?.[1];
  return normalizedDirection(raw);
}
export function restDisplayName(name: string, direction?: string | null): string {
  const base = name.replace(/\([^)]*\)/g, "").replace(/휴게소/g, "").trim();
  const label = normalizedDirection(direction ?? restNameDirection(name));
  return label ? `${base}(${label === "양방" ? "양방향" : `${label} 방향`})` : base;
}
function routeKey(route: string): string { return canonicalHighwayRouteName(route).replace(/선의지선/g, "지선").replace(/제(?=\d지선)/g, ""); }
function routeNumberKey(value: string): string {
  return String(Number(value.length === 4 && /^\d+$/.test(value) ? value.slice(0, 3) : value));
}
function routeCompatible(area: IntegratedArea, row: LoungeRow): boolean {
  if (row.route_number && area.routeCodes.some(code => routeNumberKey(code) === routeNumberKey(String(row.route_number)))) return true;
  return Boolean(row.route_name && area.routes.some(route => routeKey(route) === routeKey(String(row.route_name))));
}
function directionCompatible(area: IntegratedArea, row: LoungeRow): boolean {
  const existing = restNameDirection(row.name) ?? normalizedDirection(String(row.direction_label ?? row.route_direction ?? ""));
  return !area.direction || !existing || area.direction === existing;
}
const phoneKey = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const featureNames: Record<string, string[]> = {
  has_shower: ["샤워실"], has_sleeping_room: ["수면실"], has_laundry: ["세탁실"],
  has_truck_lounge: ["ex-화물차라운지"], has_repair_shop: ["경정비"], has_car_wash: ["세차장"], has_store: ["편의점"],
};

export function integrateRestAreaSources(sources: RestAreaSources): IntegratedArea[] {
  const codes = new Set<string>();
  const locations = new Map<string, SourceRow>(), services = new Map<string, SourceRow[]>(), facilities = new Map<string, SourceRow[]>();
  for (const row of sources.locations) { codes.add(row.stdRestCd!); locations.set(row.stdRestCd!, row); }
  for (const row of sources.facilities) { codes.add(row.stdRestCd!); const group = facilities.get(row.stdRestCd!) ?? []; group.push(row); facilities.set(row.stdRestCd!, group); }
  const codeByService = new Map(sources.locations.map(row => [row.serviceAreaCode, row.stdRestCd]));
  for (const row of sources.services) {
    const code = row.serviceAreaCode2 ?? codeByService.get(row.serviceAreaCode);
    if (!code) throw new Error(`편의시설 ${row.serviceAreaCode}의 표준 휴게소 코드가 없습니다.`);
    if (codeByService.has(row.serviceAreaCode) && codeByService.get(row.serviceAreaCode) !== code) throw new Error(`휴게소 코드가 충돌합니다: ${row.serviceAreaCode}`);
    codes.add(code); const group = services.get(code) ?? []; group.push(row); services.set(code, group);
  }
  return [...codes].sort().map(code => {
    const location = locations.get(code), service = services.get(code) ?? [], detail = facilities.get(code) ?? [];
    const names = [...new Set([location?.unitName, ...service.map(row => row.serviceAreaName), ...detail.map(row => row.stdRestNm)].filter((name): name is string => Boolean(name)))];
    const name = names[0] ?? `이름 미제공 [${code}]`, direction = restNameDirection(name) ?? normalizedDirection(service[0]?.direction);
    const warnings: string[] = [];
    const usableService = service.filter(row => {
      const label = normalizedDirection(row.direction);
      if (direction && label && !["상행", "하행", "상", "하"].includes(label) && label !== direction) {
        warnings.push(`API 이름의 방향(${direction})과 편의시설 방향(${label}) 충돌: 해당 요약 정보 제외`);
        return false;
      }
      return true;
    });
    const routeCodes = [...new Set([location?.routeNo, ...service.map(row => row.routeCode), ...detail.map(row => row.routeCd)].filter((route): route is string => Boolean(route)))];
    const routes = [...new Set([location?.routeName, ...service.map(row => row.routeName), ...detail.map(row => row.routeNm)].flatMap(route => route?.split(/[,，]/) ?? []))];
    const serviceCodes = [...new Set([location?.serviceAreaCode, ...service.map(row => row.serviceAreaCode)].filter(Boolean))];
    if (serviceCodes.length > 1) throw new Error(`${code}에 여러 serviceAreaCode가 있습니다.`);
    const fields: IntegratedArea["fields"] = {
      name: restDisplayName(name, direction), std_rest_cd: code, service_area_code: serviceCodes[0] ?? null,
      route_name: location?.routeName ?? service[0]?.routeName ?? detail[0]?.routeNm ?? null,
      route_number: routeCodes[0] ? routeNumberKey(routeCodes[0]) : null,
      direction_label: direction === "양방" ? "양방향" : direction ? `${direction} 방향` : null,
      route_direction: direction === "양방" ? "양방향" : text(usableService[0]?.direction), phone: usableService[0]?.telNo ?? null,
      latitude: null, longitude: null,
    };
    if (location && validRestCoordinates(location.yValue, location.xValue)) { fields.latitude = Number(location.yValue); fields.longitude = Number(location.xValue); }
    const labels = new Set([...detail.map(row => row.psName), ...usableService.flatMap(row => row.convenience?.split(/[|,]/) ?? [])]);
    for (const [key, labelsForFeature] of Object.entries(featureNames)) if (labelsForFeature.some(label => labels.has(label))) fields[key] = 1;
    for (const [key, sourceKey] of [["has_repair_shop", "maintenanceYn"], ["has_truck_lounge", "truckSaYn"]]) {
      const values = usableService.map(row => yesNo(row[sourceKey])).filter(value => value !== null);
      if (fields[key] !== 1 && values.length && new Set(values).size === 1) fields[key] = values[0];
    }
    return {code, serviceCode: serviceCodes[0] ?? null, name, names, routes, routeCodes, direction,
      address: text(usableService[0]?.svarAddr) ?? text(detail[0]?.svarAddr), fields, warnings,
      sources: [...(location ? ["locationinfoRest"] : []), ...(detail.length ? ["restConvList"] : []), ...(service.length ? ["conveniServiceArea"] : [])]};
  });
}

function csvFields(row: Record<string, string>, id: number): LoungeRow {
  const direction = restNameDirection(row["휴게소명"]) ?? normalizedDirection(row["기준정보_도로노선방향"]);
  const values: LoungeRow = {id, name: restDisplayName(row["휴게소명"], direction), phone: text(row["전화번호"]),
    route_name: text(row["기준정보_도로노선명"]), route_number: text(row["기준정보_도로노선번호"]),
    route_direction: text(row["기준정보_도로노선방향"]), direction_label: direction === "양방" ? "양방향" : direction ? `${direction} 방향` : null,
    rest_area_type: text(row["기준정보_휴게소종류"]), parking_count: numeric(row["기준정보_주차면수"]),
    latitude: numeric(row.latitude), longitude: numeric(row.longitude)};
  if (!validRestCoordinates(values.latitude, values.longitude)) { values.latitude = null; values.longitude = null; }
  for (const [key, field] of Object.entries({has_truck_lounge: "ex-화물차라운지", has_repair_shop: "경정비소", has_car_wash: "세차장", has_gas_station: "기준정보_주유소유무", has_lpg_station: "기준정보_LPG충전소유무", has_ev_charger: "기준정보_전기차충전소유무", has_restroom: "기준정보_화장실유무", has_store: "기준정보_매점유무", has_restaurant: "기준정보_음식점유무"})) values[key] = yesNo(row[field]);
  const labels = row["편의시설"]?.split(/[,|]/) ?? [];
  for (const [key, list] of Object.entries(featureNames)) if (values[key] == null && list.some(label => labels.includes(label))) values[key] = 1;
  return values;
}

/** 원본 코드를 우선하고 이름·노선·방향이 유일한 경우에만 기존 행에 연결한다. */
export function planRestAreaIntegration(sources: RestAreaSources, csv: Record<string, string>[], existing: LoungeRow[]): IntegrationPlan {
  const csvRows: LoungeRow[] = [], csvReviews: string[] = [];
  const retained = existing.map(row => ({...row}));
  let nextId = Math.max(0, ...existing.map(row => row.id)) + 1;
  const usedCsvIds = new Set<number>();
  for (const record of csv) {
    const name = restDisplayName(record["휴게소명"], normalizedDirection(record["기준정보_도로노선방향"]) === "양방" ? "양방" : undefined);
    let candidates = existing.filter(row => restDisplayName(row.name) === name);
    if (!candidates.length && phoneKey(record["전화번호"]) && validRestCoordinates(record.latitude, record.longitude)) candidates = existing.filter(row => phoneKey(row.phone) === phoneKey(record["전화번호"]) && validRestCoordinates(row.latitude, row.longitude) && distanceMeters({latitude: Number(record.latitude), longitude: Number(record.longitude)}, {latitude: Number(row.latitude), longitude: Number(row.longitude)}) < 200 && restNameDirection(row.name) === restNameDirection(name));
    if (candidates.length > 1) throw new Error(`CSV 행의 기존 DB 후보가 여러 개입니다: ${name}`);
    const id = candidates[0]?.id ?? nextId++;
    if (usedCsvIds.has(id)) throw new Error(`CSV에 중복 휴게소가 있습니다: ${name}`);
    usedCsvIds.add(id);
    const fields = csvFields(record, id);
    fields.name = name;
    csvRows.push(fields);
    if (!candidates.length) retained.push(fields);
    else {
      const target = retained.find(row => row.id === id)!;
      for (const [key, value] of Object.entries(fields)) if (target[key] == null && value != null) target[key] = value;
    }
    if (record.match_status !== "이름·방향 일치") csvReviews.push(`${name}: ${record.match_status} (${record.match_note})`);
  }
  const groups = integrateRestAreaSources(sources);
  const entries: IntegrationEntry[] = groups.map(area => {
    if (!area.names.length || /테스트/.test(area.name)) return {area, status: "review", targetId: null, candidates: [], reason: !area.names.length ? "API에 휴게소 이름이 없음" : "테스트 데이터: 실제 휴게소 확인 필요", changes: {}};
    const byCode = retained.filter(row => row.std_rest_cd === area.code || (area.serviceCode && row.service_area_code === area.serviceCode));
    const byIdentity = retained.filter(row => area.names.some(name => normalizedFacilityName(row.name) === normalizedFacilityName(name)) && (routeCompatible(area, row) || Boolean(phoneKey(area.fields.phone) && phoneKey(area.fields.phone) === phoneKey(row.phone))) && directionCompatible(area, row));
    let candidates = byCode.length ? byCode : byIdentity;
    if (!candidates.length && phoneKey(area.fields.phone) && validRestCoordinates(area.fields.latitude, area.fields.longitude)) candidates = retained.filter(row => phoneKey(row.phone) === phoneKey(area.fields.phone) && routeCompatible(area, row) && directionCompatible(area, row) && validRestCoordinates(row.latitude, row.longitude) && distanceMeters({latitude: Number(area.fields.latitude), longitude: Number(area.fields.longitude)}, {latitude: Number(row.latitude), longitude: Number(row.longitude)}) < 200);
    if (candidates.length > 1) return {area, status: "review", targetId: null, candidates: candidates.map(row => row.id), reason: "기존 휴게소 후보 중복", changes: {}};
    const target = candidates[0];
    if (target) {
      if (target.std_rest_cd && target.std_rest_cd !== area.code) return {area, status: "alias", targetId: target.id, candidates: [target.id], reason: "기존 시설에 다른 표준 코드가 연결됨", changes: {}};
      const changes: IntegrationEntry["changes"] = {};
      if (!area.names.some(name => normalizedFacilityName(name) === normalizedFacilityName(target.name))) changes.name = area.fields.name;
      for (const [key, value] of Object.entries(area.fields)) if (key !== "name" && target[key] == null && value != null) changes[key] = value;
      if (!validRestCoordinates(target.latitude, target.longitude) && validRestCoordinates(area.fields.latitude, area.fields.longitude)) { changes.latitude = area.fields.latitude; changes.longitude = area.fields.longitude; }
      return {area, status: "existing", targetId: target.id, candidates: [target.id], reason: byCode.length ? "원본 코드 일치" : "이름·노선·방향 또는 전화번호 일치", changes};
    }
    const uncertain = retained.filter(row => area.names.some(name => normalizedFacilityName(row.name) === normalizedFacilityName(name)) && (!area.direction || !restNameDirection(row.name)));
    if (uncertain.length) return {area, status: "review", targetId: null, candidates: uncertain.map(row => row.id), reason: "이름이 같지만 방향 또는 노선 확인 필요", changes: {}};
    if (validRestCoordinates(area.fields.latitude, area.fields.longitude)) {
      const close = closeRestAreaIds(Number(area.fields.latitude), Number(area.fields.longitude), retained);
      if (close.length) return {area, status: "review", targetId: null, candidates: close, reason: "다른 이름의 기존 휴게소와 좌표 중복: 동일 시설 확인 필요", changes: {}};
    }
    return {area, status: "new", targetId: null, candidates: [], reason: "CSV·기존 DB에 없는 휴게소", changes: {...area.fields}};
  });
  // 구코드/신코드가 같은 물리적 휴게소를 가리키면 기준정보 코드를 우선한다.
  const byTarget = new Map<number, IntegrationEntry[]>();
  for (const entry of entries.filter(entry => entry.status === "existing")) { const group = byTarget.get(entry.targetId!) ?? []; group.push(entry); byTarget.set(entry.targetId!, group); }
  for (const group of byTarget.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => Number(b.area.sources.includes("locationinfoRest")) - Number(a.area.sources.includes("locationinfoRest")) || a.area.code.localeCompare(b.area.code));
    for (const entry of group.slice(1)) { entry.status = "alias"; entry.changes = {}; entry.reason = `동일 시설의 다른 코드: 대표 ${group[0].area.code}`; }
  }
  const newByIdentity = new Map<string, IntegrationEntry[]>();
  for (const entry of entries.filter(entry => entry.status === "new")) {
    const key = `${normalizedFacilityName(entry.area.name)}|${entry.area.direction ?? ""}|${routeKey(entry.area.routes[0] ?? "")}`;
    const group = newByIdentity.get(key) ?? []; group.push(entry); newByIdentity.set(key, group);
  }
  for (const group of newByIdentity.values()) if (group.length > 1) for (const entry of group) { entry.status = "review"; entry.changes = {}; entry.reason = `신규 시설 식별자 중복: ${group.map(row => row.area.code).join(", ")}`; }
  return {entries, csvRows, csvReviews, retainedIds: existing.map(row => row.id)};
}

export function closeRestAreaIds(latitude: number, longitude: number, rows: LoungeRow[], excludeId: number | null = null): number[] {
  return rows.filter(row => row.id !== excludeId && validRestCoordinates(row.latitude, row.longitude) && distanceMeters({latitude, longitude}, {latitude: Number(row.latitude), longitude: Number(row.longitude)}) < 30).map(row => row.id);
}
