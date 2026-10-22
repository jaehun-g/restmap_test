import fs from "node:fs/promises";
import nextEnv from "@next/env";
import {Client} from "pg";
import {normalizeRestAreas} from "../lib/rest-areas.ts";
import {normalizeExGasStations} from "../lib/ex-gas-stations.ts";
import {mergeFacilityPlaces} from "../lib/facility-places.ts";
import {planStationCoordinateCorrections} from "../lib/station-coordinate-corrections.ts";
import {verifiedStationCoordinates} from "../lib/verified-rest-area-stations.ts";

nextEnv.loadEnvConfig(process.cwd());
const apply = process.argv.includes("--apply");
const client = new Client({connectionString: process.env.DATABASE_URL, ssl: {rejectUnauthorized: false}, connectionTimeoutMillis: 10_000});
try {
  await client.connect();
  await client.query(apply ? "BEGIN" : "BEGIN READ ONLY");
  const read = async () => {
    const areas = normalizeRestAreas((await client.query("SELECT * FROM test_lounge ORDER BY id" + (apply ? " FOR SHARE" : ""))).rows);
    const stations = normalizeExGasStations((await client.query("SELECT * FROM test_ex_station_geocodes ORDER BY id" + (apply ? " FOR UPDATE" : ""))).rows);
    if (!areas.ok || !stations.ok) throw new Error("휴게소·주유소 데이터 형식 오류");
    return {areas: areas.value, stations: stations.value};
  };
  const before = await read();
  const plans = planStationCoordinateCorrections(before.areas, before.stations);
  const beforeLinks = mergeFacilityPlaces(before.areas, before.stations).stations;
  const changes = [];
  for (const verified of verifiedStationCoordinates) {
    const area = before.areas.find(item => item.id === verified.restAreaId);
    const stations = before.stations.filter(item => item.siteCode === verified.sourceKey);
    if (!area || area.latitude !== verified.latitude || area.longitude !== verified.longitude || stations.length !== 1)
      throw new Error(`검증 기준 변경: ${verified.sourceKey}`);
    const station = stations[0];
    if (station.latitude === area.latitude && station.longitude === area.longitude && beforeLinks.find(item => item.siteCode === station.siteCode)?.linkedRestAreaId === area.id) continue;
    const plan = plans.find(item => item.station.siteCode === verified.sourceKey && item.area.id === area.id);
    if (!plan) throw new Error(`거리 외 검증 실패 또는 대상 중복: ${verified.sourceKey}`);
    changes.push({stationId: station.id, sourceKey: station.siteCode, stationName: station.name, restAreaId: area.id, restAreaName: area.name, distance: plan.distance, before: {latitude: station.latitude, longitude: station.longitude}, after: {latitude: area.latitude, longitude: area.longitude}});
  }
  const replacements = new Map(changes.map(item => [item.sourceKey, item.after]));
  const projected = mergeFacilityPlaces(before.areas, before.stations.map(station => ({...station, ...replacements.get(station.siteCode)}))).stations;
  for (const change of changes) if (projected.find(item => item.siteCode === change.sourceKey)?.linkedRestAreaId !== change.restAreaId)
    throw new Error(`보정 후 연결 대상 불일치: ${change.sourceKey}`);
  for (const station of beforeLinks) if (!replacements.has(station.siteCode) && projected.find(item => item.siteCode === station.siteCode)?.linkedRestAreaId !== station.linkedRestAreaId)
    throw new Error(`다른 주유소 연결 변경: ${station.siteCode}`);
  if (apply && changes.length) {
    // 변경 전 좌표를 먼저 보관하고, 모든 대상 갱신·재검증이 성공한 경우에만 커밋한다.
    const backup = {createdAt: new Date().toISOString(), changes};
    const stamp = Date.now();
    await fs.writeFile(new URL(`../docs/station-coordinate-corrections-${stamp}.json`, import.meta.url), JSON.stringify(backup, null, 2) + "\n", "utf8");
    for (const change of changes) {
      const result = await client.query("UPDATE test_ex_station_geocodes SET latitude=$2, longitude=$3, geocode_status='SUCCESS', geocode_error_code=NULL, geocoded_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE source_key=$1 RETURNING id", [change.sourceKey, change.after.latitude, change.after.longitude]);
      if (result.rowCount !== 1) throw new Error(`갱신 건수 오류: ${change.sourceKey}`);
    }
    const after = await read();
    const links = mergeFacilityPlaces(after.areas, after.stations).stations;
    for (const expected of projected) {
      const actual = links.find(item => item.siteCode === expected.siteCode);
      if (!actual || actual.linkedRestAreaId !== expected.linkedRestAreaId || actual.latitude !== expected.latitude || actual.longitude !== expected.longitude)
        throw new Error(`DB 갱신 결과 불일치: ${expected.siteCode}`);
    }
    const lines = ["# 거리 초과 주유소 좌표 보정 결과", "", `반영 시각: ${backup.createdAt}`, "", "사용자 지시에 따라 동명·동방향·동일 노선이며 거리 외 기존 검증을 통과하는 유일 후보만 반영했다. 다른 휴게소에 연결된 주유소와 대상이 모호한 후보는 제외했다. 휴게소에는 주소 필드가 없어 위도·경도만 맞추고 기존 주유소 주소와 원천 식별자는 유지했다. 보정 좌표는 동기화에서도 유지한다.", "", "| 주유소 ID | 주유소 | 휴게소 ID | 휴게소 | 기존 거리(m) | 변경 전 좌표 | 변경 후 좌표 |", "| --- | --- | --- | --- | ---: | --- | --- |"];
    for (const item of changes) lines.push(`| ${item.stationId} | ${item.stationName} | ${item.restAreaId} | ${item.restAreaName} | ${Math.round(item.distance)} | ${item.before.latitude}, ${item.before.longitude} | ${item.after.latitude}, ${item.after.longitude} |`);
    lines.push("", `변경 전 좌표 및 원천 코드: [JSON 기록](station-coordinate-corrections-${stamp}.json)`, "");
    await fs.writeFile(new URL("../docs/station-coordinate-corrections.md", import.meta.url), lines.join("\n"), "utf8");
  }
  await client.query(apply ? "COMMIT" : "ROLLBACK");
  console.log(JSON.stringify({applied: apply, count: changes.length, changes}, null, 2));
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  await client.end();
}
