import fs from "node:fs/promises";
import assert from "node:assert/strict";
import nextEnv from "@next/env";
import {Client} from "pg";
import {verifiedRestAreaDirections} from "../lib/verified-rest-area-directions.ts";
import {dbColumn, dbTable, selectLegacyRows} from "./db-columns.mjs";

nextEnv.loadEnvConfig(process.cwd());
const apply = process.argv.includes("--apply");
const client = new Client({connectionString: process.env.DATABASE_URL, ssl: {rejectUnauthorized: false}, connectionTimeoutMillis: 10_000});
try {
  await client.connect();
  await client.query(apply ? "BEGIN" : "BEGIN READ ONLY");
  if (apply) await client.query(`LOCK TABLE public.${dbTable("lounge")} IN SHARE ROW EXCLUSIVE MODE`);
  const before = await selectLegacyRows(client, "lounge", "ORDER BY lg_id");
  const changes = verifiedRestAreaDirections.map(verified => {
    const matches = before.filter(row => row.std_rest_cd === verified.code);
    assert.equal(matches.length, 1, `표준 코드 ${verified.code}의 대상이 유일하지 않습니다.`);
    const area = matches[0];
    assert.equal(area.id, verified.id);
    assert.ok([verified.name, ...verified.sourceNames].includes(area.name), `기존 이름 변경: ${area.name}`);
    return {id: area.id, code: verified.code, before: area, after: {...area, name: verified.name, direction_label: `${verified.direction} 방향`, route_direction: verified.direction}};
  }).filter(item => item.before.name !== item.after.name || item.before.direction_label !== item.after.direction_label || item.before.route_direction !== item.after.route_direction);
  let backupPath = null;
  if (apply && changes.length) {
    await fs.mkdir(".rest-area-sync", {recursive: true});
    backupPath = `.rest-area-sync/rest-area-directions-backup-${Date.now()}.json`;
    await fs.writeFile(backupPath, JSON.stringify({createdAt: new Date().toISOString(), changes}, null, 2), {encoding: "utf8", flag: "wx"});
    for (const item of changes) {
      const result = await client.query(`UPDATE public.${dbTable("lounge")} SET ${dbColumn("lounge", "name")}=$2, ${dbColumn("lounge", "direction_label")}=$3, ${dbColumn("lounge", "route_direction")}=$4 WHERE ${dbColumn("lounge", "id")}=$1 AND ${dbColumn("lounge", "std_rest_cd")}=$5`, [item.id, item.after.name, item.after.direction_label, item.after.route_direction, item.code]);
      assert.equal(result.rowCount, 1);
    }
    const after = await selectLegacyRows(client, "lounge", "ORDER BY lg_id");
    assert.deepEqual(after, before.map(row => changes.find(item => item.id === row.id)?.after ?? row));
  }
  await client.query(apply ? "COMMIT" : "ROLLBACK");
  const summary = {applied: apply, count: changes.length, backupPath, changes: changes.map(item => ({id: item.id, code: item.code, before: item.before.name, after: item.after.name, direction: item.after.direction_label}))};
  if (apply && changes.length) await fs.writeFile("docs/rest-area-direction-corrections.md", ["# 양북임시·부안 방향 보정", "", `반영 시각: ${new Date().toISOString()}`, "", "사용자 확인에 따라 양북임시 상→울산·하→포항, 부안 상→서울·하→목포로 보정했다. 이름, direction_label, route_direction을 변경하고 표준 코드·ID·좌표는 유지했다. 코드별 보정 및 기존 원천 이름 매핑으로 API·CSV 동기화 후에도 보정값을 유지한다.", "", "```json", JSON.stringify(summary, null, 2), "```", ""].join("\n"), "utf8");
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  await client.end();
}
