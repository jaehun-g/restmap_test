import fs from "node:fs/promises";
import assert from "node:assert/strict";
import nextEnv from "@next/env";
import {Client} from "pg";
import {excludedPrivateRestAreas} from "../lib/excluded-private-rest-areas.ts";

nextEnv.loadEnvConfig(process.cwd());
const apply = process.argv.includes("--apply");
const ids = excludedPrivateRestAreas.map(item => item.id);
const codes = excludedPrivateRestAreas.map(item => item.code);
const client = new Client({connectionString: process.env.DATABASE_URL, ssl: {rejectUnauthorized: false}, connectionTimeoutMillis: 10_000});
try {
  await client.connect();
  await client.query(apply ? "BEGIN" : "BEGIN READ ONLY");
  if (apply) await client.query("LOCK TABLE public.test_lounge, public.test_food_area_mappings IN SHARE ROW EXCLUSIVE MODE");
  const before = (await client.query("SELECT * FROM public.test_lounge ORDER BY id")).rows;
  const targets = before.filter(row => codes.includes(row.std_rest_cd));
  for (const row of targets) {
    const expected = excludedPrivateRestAreas.find(item => item.code === row.std_rest_cd);
    assert.ok(expected && row.id === expected.id && row.name === expected.name && row.route_name === expected.route, `삭제 대상 변경: ${row.id}`);
  }
  assert.ok(targets.length === 0 || targets.length === excludedPrivateRestAreas.length, "제외 대상 일부만 존재합니다. 재검증이 필요합니다.");
  assert.ok(before.every(row => !ids.includes(row.id) || codes.includes(row.std_rest_cd)), "제외 ID를 다른 시설이 사용 중입니다.");
  const mappings = (await client.query("SELECT * FROM public.test_food_area_mappings WHERE rest_area_id=ANY($1::int[]) OR candidate_rest_area_ids && $1::int[] OR std_rest_cd=ANY($2::text[]) ORDER BY std_rest_cd", [ids, codes])).rows;
  const menus = (await client.query("SELECT * FROM public.test_food_menus WHERE std_rest_cd=ANY($1::text[]) ORDER BY source_key", [mappings.map(row => row.std_rest_cd)])).rows;
  let backupPath = null;
  let unlinked = 0;
  let removed = 0;
  if (apply && targets.length) {
    await fs.mkdir(".rest-area-sync", {recursive: true});
    backupPath = `.rest-area-sync/private-rest-areas-backup-${Date.now()}.json`;
    await fs.writeFile(backupPath, JSON.stringify({createdAt: new Date().toISOString(), lounges: targets, mappings, menus}, null, 2), {encoding: "utf8", flag: "wx"});
    unlinked = (await client.query("UPDATE public.test_food_area_mappings SET rest_area_id=NULL, match_status='unmatched' WHERE rest_area_id=ANY($1::int[])", [ids])).rowCount;
    await client.query("UPDATE public.test_food_area_mappings SET candidate_rest_area_ids=ARRAY(SELECT value FROM unnest(candidate_rest_area_ids) AS value WHERE NOT (value=ANY($1::int[]))) WHERE candidate_rest_area_ids && $1::int[]", [ids]);
    removed = (await client.query("DELETE FROM public.test_lounge WHERE id=ANY($1::int[]) AND std_rest_cd=ANY($2::text[]) RETURNING id", [ids, codes])).rowCount;
    assert.equal(removed, targets.length);
    const after = (await client.query("SELECT * FROM public.test_lounge ORDER BY id")).rows;
    assert.deepEqual(after, before.filter(row => !ids.includes(row.id)), "삭제 대상 외 휴게소 변경");
    assert.equal(Number((await client.query("SELECT count(*) AS count FROM public.test_food_area_mappings WHERE rest_area_id=ANY($1::int[]) OR candidate_rest_area_ids && $1::int[]", [ids])).rows[0].count), 0);
    assert.equal(Number((await client.query("SELECT count(*) AS count FROM public.test_food_area_mappings WHERE match_status='matched' AND rest_area_id IS NULL")).rows[0].count), 0);
  }
  await client.query(apply ? "COMMIT" : "ROLLBACK");
  const summary = {applied: apply, before: before.length, targetCount: targets.length, removed, remaining: before.length - removed, unlinkedFoodMappings: unlinked, backupPath};
  if (apply && targets.length) {
    const lines = ["# 민자 구간 휴게소 삭제 결과", "", `반영 시각: ${new Date().toISOString()}`, "", "사용자 요청으로 검증한 민자 구간 휴게소 23곳을 test_lounge에서 삭제했다. 혼합 노선은 시설 단위로 제외하며 같은 노선의 공영 구간 휴게소는 유지한다. 연결된 음식정보 매핑은 미연결 상태로 바꾸고 후보 ID에서 삭제 대상을 제거했다. 수집한 원본 음식정보는 보존했다. EX 주유소와 지도 선형은 이번 휴게소 삭제 대상에 포함하지 않았다.", "", "```json", JSON.stringify(summary, null, 2), "```", "", "## 삭제 대상", "", "| ID | 휴게소 | 표준 코드 | DB 노선명 |", "| --- | --- | --- | --- |", ...targets.map(row => `| ${row.id} | ${row.name} | ${row.std_rest_cd} | ${row.route_name} |`), "", "## 동기화 제외", "", "lib/excluded-private-rest-areas.ts의 표준 코드로 EX API의 재추가를 막고, CSV는 시설명·노선 일치로 제외한다. 새 민자 시설은 확인 후 이 목록에 추가해야 한다. 원천 API는 민자 여부를 별도 구분하지 않으므로 이 목록은 검증한 23곳에 대한 정책이다.", "", "백업에는 삭제 전 휴게소 행, 관련 음식정보 매핑 및 메뉴를 저장했다. 백업 경로는 위 집계에 기록했으며 Git에서는 제외된다.", ""];
    await fs.writeFile("docs/private-rest-area-removal.md", lines.join("\n"), "utf8");
  }
  console.log(JSON.stringify({...summary, targets: targets.map(row => ({id: row.id, name: row.name, code: row.std_rest_cd}))}, null, 2));
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  await client.end();
}
