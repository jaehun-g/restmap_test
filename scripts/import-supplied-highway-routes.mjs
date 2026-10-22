import fs from "node:fs/promises";
import path from "node:path";
import {createHash} from "node:crypto";
import assert from "node:assert/strict";
import nextEnv from "@next/env";
import {Client} from "pg";
import {routeFromGeoJson} from "./import-highway-route.mjs";
import {normalizeHighwayRoute} from "../lib/highway-routes.ts";

nextEnv.loadEnvConfig(process.cwd());
const argument = name => process.argv[process.argv.indexOf(name) + 1];
const apply = process.argv.includes("--apply");
const definitions = [
  {name: "통영대전선", number: 35, aliases: ["대전통영선", "통영대전선"], option: "--tongyeong-file"},
  {name: "동해선", number: 65, aliases: ["동해선", "동해선(부산-포항)", "동해선(삼척-속초)"], option: "--donghae-file"},
];
const imports = [];
for (const definition of definitions) {
  assert.ok(process.argv.includes(definition.option) && argument(definition.option), `${definition.option} 파일 경로가 필요합니다.`);
  const file = path.resolve(argument(definition.option));
  const source = await fs.readFile(file, "utf8");
  const route = routeFromGeoJson(JSON.parse(source));
  assert.ok(route.paths.every(line => line.every(([lat, lon]) => lat >= 33 && lat <= 39 && lon >= 124 && lon <= 132)), "국내 WGS84 좌표 범위가 아닙니다.");
  imports.push({...definition, file, sha256: createHash("sha256").update(source).digest("hex"), ...route});
}
const client = new Client({connectionString: process.env.DATABASE_URL, ssl: {rejectUnauthorized: false}, connectionTimeoutMillis: 10_000});
try {
  await client.connect();
  await client.query(apply ? "BEGIN" : "BEGIN READ ONLY");
  if (apply) await client.query("LOCK TABLE test_highway_routes, test_lounge, test_ex_station_geocodes IN SHARE ROW EXCLUSIVE MODE");
  const names = imports.flatMap(item => item.aliases);
  const routes = (await client.query("SELECT * FROM test_highway_routes WHERE route_name=ANY($1::text[]) ORDER BY id", [names])).rows;
  const areaBefore = (await client.query("SELECT * FROM test_lounge ORDER BY id")).rows;
  const stationsBefore = (await client.query("SELECT * FROM test_ex_station_geocodes ORDER BY id")).rows;
  for (const item of imports) {
    const matches = routes.filter(row => item.aliases.includes(row.route_name));
    assert.equal(matches.length, 1, `${item.name}: 기존 선형은 정확히 한 건이어야 합니다.`);
    assert.equal(Number(matches[0].route_number), item.number);
    item.id = matches[0].id;
  }
  const donghaeAliases = definitions[1].aliases.slice(1);
  const areasToChange = areaBefore.filter(row => donghaeAliases.includes(row.route_name));
  const stationsToChange = stationsBefore.filter(row => donghaeAliases.includes(row.route_name));
  let backupPath = null;
  if (apply) {
    await fs.mkdir(".rest-area-sync", {recursive: true});
    backupPath = `.rest-area-sync/highway-routes-backup-${Date.now()}.json`;
    await fs.writeFile(backupPath, JSON.stringify({createdAt: new Date().toISOString(), routes, areas: areasToChange, stations: stationsToChange}, null, 2), {encoding: "utf8", flag: "wx"});
    for (const item of imports) {
      const result = await client.query("UPDATE test_highway_routes SET route_name=$2, path_coordinates=$3::jsonb, sw_lat=$4, sw_lng=$5, ne_lat=$6, ne_lng=$7 WHERE id=$1 RETURNING *", [item.id, item.name, JSON.stringify(item.paths), item.bounds.south, item.bounds.west, item.bounds.north, item.bounds.east]);
      assert.equal(result.rowCount, 1);
      const parsed = normalizeHighwayRoute(result.rows[0]);
      assert.ok(parsed.ok, `${item.name}: 저장 선형 형식 검증 실패`);
      assert.equal(parsed.value.routeName, item.name);
      assert.deepEqual(parsed.value.paths, item.paths);
    }
    await client.query("UPDATE test_lounge SET route_name=$1 WHERE route_name=ANY($2::text[])", [definitions[1].name, donghaeAliases]);
    await client.query("UPDATE test_ex_station_geocodes SET route_name=$1, updated_at=CURRENT_TIMESTAMP WHERE route_name=ANY($2::text[])", [definitions[1].name, donghaeAliases]);
    const areaAfter = (await client.query("SELECT * FROM test_lounge ORDER BY id")).rows;
    assert.deepEqual(areaAfter, areaBefore.map(row => donghaeAliases.includes(row.route_name) ? {...row, route_name: definitions[1].name} : row));
    assert.equal(Number((await client.query("SELECT count(*) AS count FROM test_lounge WHERE route_name=ANY($1::text[])", [donghaeAliases])).rows[0].count), 0);
  }
  await client.query(apply ? "COMMIT" : "ROLLBACK");
  const summary = {applied: apply, backupPath, imports: imports.map(item => ({id: item.id, routeName: item.name, routeNumber: item.number, file: item.file, sha256: item.sha256, paths: item.paths.length, points: item.paths.reduce((n, line) => n + line.length, 0), bounds: item.bounds})), updatedAreas: areasToChange.map(row => ({id: row.id, name: row.name, before: row.route_name, after: definitions[1].name})), updatedStations: stationsToChange.map(row => ({id: row.id, name: row.service_area_name})), restAreaTotal: areaBefore.length};
  if (apply) await fs.writeFile("docs/tongyeong-donghae-route-import.md", ["# 통영대전선·동해선 선형 적재 및 노선명 통합", "", `반영 시각: ${new Date().toISOString()}`, "", "사용자가 제공한 GeoJSON을 기존 변환 도구로 검증한 뒤 경도·위도를 위도·경도로 변환하고 소수점 5자리로 저장했다. 끊어진 경로는 각각 유지했다. 통영대전선은 기존 대전통영선 행의 ID를 유지해 교체했다. 동해선(부산-포항)·동해선(삼척-속초)는 동해선으로 통일하며 API·CSV 재수집 및 조회에서도 같은 별칭을 적용한다. 울산포항선·포항영덕선은 이번 명칭 통합 대상에 포함하지 않았다.", "", "```json", JSON.stringify(summary, null, 2), "```", "", "백업에는 변경 전 두 노선 선형과 노선명 수정 대상 휴게소·주유소를 저장했다. 사용자 제공 원본 파일은 변경하지 않았다.", ""].join("\n"), "utf8");
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  await client.end();
}
