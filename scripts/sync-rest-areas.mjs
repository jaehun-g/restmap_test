import fs from "node:fs/promises";
import {createHash} from "node:crypto";
import nextEnv from "@next/env";
import {Client} from "pg";
import {fetchRestAreaSources, parseRestAreaCsv} from "../lib/rest-area-sources.ts";
import {planRestAreaIntegration, validRestCoordinates} from "../lib/rest-area-integration.ts";
import {resolveRestAreaCoordinates} from "../lib/rest-area-geocode.ts";
import {canonicalHighwayRouteName} from "../lib/highway-route-name.ts";
import {normalizeHighwayRoute} from "../lib/highway-routes.ts";
import {compileRouteProximity} from "../lib/route-proximity.ts";
import {distanceMeters} from "../lib/geo-search.ts";

nextEnv.loadEnvConfig(process.cwd());
const args = process.argv.slice(2), option = key => args.includes(key) ? args[args.indexOf(key) + 1] : null;
const apply = args.includes("--apply"), geocode = args.includes("--geocode");
if (apply && !geocode) throw new Error("반영 전 좌표 검증이 필요합니다. --geocode를 사용하세요.");
const csvPath = option("--csv");
if (!csvPath) throw new Error("--csv <CSV 파일 경로>가 필요합니다.");
const csv = parseRestAreaCsv(await fs.readFile(csvPath, "utf8"));
const snapshotPath = option("--snapshot");
const snapshot = snapshotPath ? JSON.parse(await fs.readFile(snapshotPath, "utf8")) : null;
if (args.includes("--audit-added-coordinates") && !snapshot?.existing) throw new Error("신규 좌표 감사에는 반영 전 existing을 포함한 --snapshot이 필요합니다.");
const sources = snapshot ? snapshot.sources
  : await fetchRestAreaSources(undefined, csv.map(row => row["휴게소명"]), args.includes("--allow-partial-services"));
if (Date.now() - Date.parse(sources.fetchedAt) > 24 * 60 * 60 * 1000) throw new Error("24시간이 지난 API 스냅샷입니다. 다시 수집해주세요.");
if (!sources.serviceComplete && !args.includes("--allow-partial-services")) throw new Error("편의시설 API 일부가 조회되지 않았습니다. 보강만 수행하려면 --allow-partial-services를 명시하세요.");
const client = new Client({connectionString: process.env.DATABASE_URL, ssl: {rejectUnauthorized: false}});
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
await fs.mkdir(".rest-area-sync", {recursive: true});
const allowed = new Set(["id", "name", "std_rest_cd", "service_area_code", "latitude", "longitude", "phone", "route_name", "route_number", "route_direction", "direction_label", "rest_area_type", "parking_count", "has_truck_lounge", "has_gas_station", "has_lpg_station", "has_ev_charger", "has_repair_shop", "has_car_wash", "has_shower", "has_sleeping_room", "has_laundry", "has_restaurant", "has_store", "has_restroom"]);
await client.connect();
try {
  await client.query("BEGIN READ ONLY");
  const existing = (await client.query("SELECT * FROM public.test_lounge ORDER BY id")).rows;
  const routeRows = (await client.query("SELECT * FROM public.test_highway_routes ORDER BY id")).rows;
  await client.query("ROLLBACK");
  const baselineHash = hash(existing);
  const plan = planRestAreaIntegration(sources, csv, existing);
  const staged = new Map(existing.map(row => [row.id, {...row}]));
  let nextId = Math.max(0, ...existing.map(row => row.id)) + 1;
  for (const csvRow of plan.csvRows) {
    const target = staged.get(csvRow.id);
    if (!target) { staged.set(csvRow.id, {...csvRow}); nextId = Math.max(nextId, csvRow.id + 1); }
    else for (const [key, value] of Object.entries(csvRow)) if (target[key] == null && value != null) target[key] = value;
  }
  const routes = routeRows.flatMap(row => { const route = normalizeHighwayRoute(row); return route.ok ? [{...route.value, routeNumber: row.route_number == null ? null : String(row.route_number), contains: compileRouteProximity(route.value, 3000)}] : []; });
  const sourceRouteGuards = area => routes.filter(route =>
    area.routes.some(name => canonicalHighwayRouteName(name) === canonicalHighwayRouteName(route.routeName)) ||
    (area.fields.route_number && String(Number(route.routeNumber)) === String(Number(area.fields.route_number))));
  const addressKey = value => String(value ?? "").replace(/\s+/g, "");
  let cache = {};
  try { cache = JSON.parse(await fs.readFile(".rest-area-sync/geocodes.json", "utf8")); } catch { /* 첫 실행 */ }
  const resolutions = [], conflicts = [];
  let completed = 0;
  for (const entry of plan.entries) {
    if (!["existing", "new"].includes(entry.status)) continue;
    const row = entry.status === "existing" ? staged.get(entry.targetId) : {id: nextId++, ...entry.changes};
    if (!row) throw new Error("대상 휴게소가 없습니다.");
    const coordinatesWereMissing = !validRestCoordinates(row.latitude, row.longitude);
    if (entry.status === "existing") {
      for (const [key, value] of Object.entries(entry.area.fields)) if (key.startsWith("has_") && value != null && row[key] != null && value !== row[key]) conflicts.push({id: row.id, name: row.name, field: key, existing: row[key], source: value});
      Object.assign(row, entry.changes);
    }
    const area = entry.area;
    const guards = sourceRouteGuards(area);
    const auditRejected = args.includes("--audit-source-coordinates") && validRestCoordinates(row.latitude, row.longitude) && validRestCoordinates(area.fields.latitude, area.fields.longitude) && guards.length > 0 &&
      distanceMeters({latitude: Number(row.latitude), longitude: Number(row.longitude)}, {latitude: Number(area.fields.latitude), longitude: Number(area.fields.longitude)}) < 50 &&
      !guards.some(route => route.contains({latitude: Number(row.latitude), longitude: Number(row.longitude)}));
    const auditAdded = args.includes("--audit-added-coordinates") && !snapshot.existing.some(item => item.id === row.id);
    if (entry.status === "new" || coordinatesWereMissing || !validRestCoordinates(row.latitude, row.longitude) || auditRejected || auditAdded) {
      const shared = Boolean(area.address && plan.entries.some(other => other !== entry && addressKey(other.area.address) === addressKey(area.address) && other.area.direction !== area.direction));
      const fingerprint = hash({algorithmVersion: 3, area, shared, routes: guards.map(route => [route.id, route.paths])});
      const prior = cache[area.code];
      let resolution = prior?.fingerprint === fingerprint && (!args.includes("--retry-unresolved") || prior.value.method !== "unresolved") ? prior.value : null;
      if (!resolution && geocode) {
        resolution = await resolveRestAreaCoordinates(area, [...staged.values()].filter(item => item.id !== row.id), {
          addressShared: shared, routeContains: guards.length ? point => guards.some(route => route.contains(point)) : undefined,
        });
        cache[area.code] = {fingerprint, value: resolution};
        await fs.writeFile(".rest-area-sync/geocodes.json", JSON.stringify(cache, null, 2));
      }
      if (!resolution) {
        const valid = validRestCoordinates(area.fields.latitude, area.fields.longitude) && (!guards.length || guards.some(route => route.contains({latitude: Number(area.fields.latitude), longitude: Number(area.fields.longitude)})));
        resolution = {latitude: valid ? area.fields.latitude : null, longitude: valid ? area.fields.longitude : null, method: valid ? "locationinfoRest" : "unresolved", reason: "--geocode 없는 사전 계획"};
      }
      row.latitude = resolution.latitude; row.longitude = resolution.longitude;
      resolutions.push({code: area.code, name: row.name, ...resolution, routeChecked: guards.length > 0});
    }
    entry.targetId = row.id;
    staged.set(row.id, row);
    if (++completed % 20 === 0) console.log(`계획 ${completed}/${plan.entries.filter(entry => ["existing", "new"].includes(entry.status)).length}건`);
  }
  const stagedRows = [...staged.values()].sort((a, b) => a.id - b.id);
  for (const column of ["std_rest_cd", "service_area_code"]) {
    const values = stagedRows.map(row => row[column]).filter(Boolean);
    if (new Set(values).size !== values.length) throw new Error(`${column} 중복을 발견했습니다.`);
  }
  const changes = stagedRows.map(row => ({row, before: existing.find(item => item.id === row.id)})).filter(({row, before}) => !before || [...allowed].some(key => row[key] !== before[key]));
  const inserted = changes.filter(change => !change.before), updated = changes.filter(change => change.before);
  let applied = false;
  await fs.writeFile(".rest-area-sync/prepared.json", JSON.stringify({sources, csvPath, before: existing, plan, staged: stagedRows, resolutions, conflicts}, null, 2));
  if (apply) {
    try { await fs.writeFile(`.rest-area-sync/before-${baselineHash}.json`, JSON.stringify(existing, null, 2), {flag: "wx"}); }
    catch (error) { if (error.code !== "EEXIST") throw error; }
    await client.query("BEGIN");
    try {
      await client.query("LOCK TABLE public.test_lounge IN SHARE ROW EXCLUSIVE MODE");
      const current = (await client.query("SELECT * FROM public.test_lounge ORDER BY id")).rows;
      if (hash(current) !== baselineHash) throw new Error("계획 생성 중 DB가 변경됐습니다. 다시 실행해주세요.");
      await client.query(await fs.readFile(new URL("../sql/test_lounge_source_codes.sql", import.meta.url), "utf8"));
      for (const {row, before} of changes) {
        const columns = [...allowed].filter(key => row[key] !== undefined && (!before || (key !== "id" && row[key] !== before[key])));
        const values = columns.map(key => row[key]);
        if (before) await client.query(`UPDATE public.test_lounge SET ${columns.map((column, i) => `"${column}"=$${i + 1}`).join(", ")} WHERE id=$${columns.length + 1}`, [...values, row.id]);
        else await client.query(`INSERT INTO public.test_lounge (${columns.map(column => `"${column}"`).join(",")}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(",")})`, values);
      }
      const after = (await client.query("SELECT * FROM public.test_lounge ORDER BY id")).rows;
      if (after.length !== stagedRows.length || existing.some(row => !after.some(item => item.id === row.id))) throw new Error("기존 행 보존 검증에 실패했습니다.");
      await client.query("COMMIT"); applied = true;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
  }
  const cell = value => String(value ?? "미제공").replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
  const excluded = plan.entries.filter(entry => ["review", "alias", "excluded"].includes(entry.status));
  const sourceWarnings = plan.entries.flatMap(entry => entry.area.warnings.map(warning => ({code: entry.area.code, name: entry.area.name, warning})));
  const summary = {applied, sourceTime: sources.fetchedAt, csv: csv.length, before: existing.length, after: stagedRows.length, inserted: inserted.length, updated: updated.length, unresolvedCoordinates: stagedRows.filter(row => !validRestCoordinates(row.latitude, row.longitude)).length, aliases: plan.entries.filter(entry => entry.status === "alias").length, review: plan.entries.filter(entry => entry.status === "review").length, services: `${sources.services.length}/${sources.serviceExpectedCount}`, featureConflicts: conflicts.length};
  const lines = ["# 휴게소 CSV·EX API 통합 결과", "", `실행: ${new Date().toISOString()} / DB 반영: ${applied ? "완료" : "계획만 생성"}`, "", "```json", JSON.stringify(summary, null, 2), "```", "", "기존 행과 알려진 값은 보존합니다. API 정보가 없는 값은 NULL로 두며, 편의시설 상세 미제공을 시설 없음으로 판정하지 않습니다. 두 원본 코드 컬럼은 중복되지 않게 저장합니다.", "", "## API 수집", "", `- locationinfoRest: ${sources.locations.length}행`, `- restConvList: ${sources.facilities.length}행`, `- conveniServiceArea: ${sources.services.length}/${sources.serviceExpectedCount}행`, ...sources.recovery.map(item => `- ${item}`), "", "## 신규 추가 휴게소", "", "| ID | 이름 | 표준 코드 | 노선 | 위도 | 경도 |", "|---:|---|---|---|---:|---:|", ...inserted.map(({row}) => `| ${row.id} | ${cell(row.name)} | ${cell(row.std_rest_cd)} | ${cell(row.route_name)} | ${cell(row.latitude)} | ${cell(row.longitude)} |`), "", "## 이름 보정", "", ...updated.filter(({row, before}) => row.name !== before.name).map(({row, before}) => `- id ${row.id}: ${before.name} → ${row.name} (전화번호·방향·좌표 대조)`), "", "## 코드 중복·검토 항목", "", "| 표준 코드 | 이름 | 구분 | 기존 후보 ID | 사유 |", "|---|---|---|---|---|", ...excluded.map(entry => `| ${cell(entry.area.code)} | ${cell(entry.area.name)} | ${entry.status} | ${entry.candidates.join(", ")} | ${cell(entry.reason)} |`), "", "## 좌표 처리", "", "| 코드 | 이름 | 방법 | 노선 검증 | 사유 |", "|---|---|---|---|---|", ...resolutions.map(item => `| ${cell(item.code)} | ${cell(item.name)} | ${cell(item.method)} | ${item.routeChecked ? "확인" : "해당 경로 없음"} | ${cell(item.reason)} |`), "", "## 기존 값과 API 값의 충돌", "", "기존 값은 유지했으며 아래 항목은 검토 대상입니다.", "", "| ID | 이름 | 컬럼 | 기존 값 | API 값 |", "|---:|---|---|---:|---:|", ...conflicts.map(item => `| ${item.id} | ${cell(item.name)} | ${item.field} | ${item.existing} | ${item.source} |`), "", "## CSV 검토 메모", "", ...plan.csvReviews.map(item => `- ${item}`), "", "## 재실행", "", "```powershell", 'node scripts/sync-rest-areas.mjs --csv "<CSV 경로>" --geocode --allow-partial-services', 'node scripts/sync-rest-areas.mjs --csv "<CSV 경로>" --geocode --allow-partial-services --apply', "```", "", "--apply가 없으면 DB는 읽기만 합니다. 조회 장애가 있는 편의시설 API는 명시적으로 --allow-partial-services를 선택했을 때에만 확보한 정보를 보강합니다. 완전한 기준정보·상세 편의시설 수집과 기존 행 보존은 필수입니다.", ""];
  lines.splice(lines.indexOf("## 기존 값과 API 값의 충돌"), 0,
    "## API 필드 충돌", "", "기준정보·상세 편의시설의 코드와 이름으로 기존 행을 식별합니다. 방향이 충돌하는 편의시설 요약은 보강에 사용하지 않습니다.", "",
    "| 표준 코드 | 이름 | 사유 |", "|---|---|---|",
    ...sourceWarnings.map(item => `| ${cell(item.code)} | ${cell(item.name)} | ${cell(item.warning)} |`), "");
  await fs.writeFile(option("--report") ?? "docs/rest-area-integration.md", lines.join("\n"));
  await fs.writeFile(".rest-area-sync/result.json", JSON.stringify({summary, plan, inserted: inserted.map(item => item.row.id)}, null, 2));
  if (applied) await fs.writeFile(".rest-area-sync/applied-result.json", JSON.stringify({summary, plan, inserted: inserted.map(item => item.row.id)}, null, 2));
  console.log(JSON.stringify(summary, null, 2));
} finally { await client.end(); }
