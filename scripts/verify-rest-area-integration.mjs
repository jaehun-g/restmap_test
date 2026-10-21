import fs from "node:fs/promises";
import assert from "node:assert/strict";
import nextEnv from "@next/env";
import {Client} from "pg";
import {validRestCoordinates} from "../lib/rest-area-integration.ts";

nextEnv.loadEnvConfig(process.cwd());
const snapshot = JSON.parse(await fs.readFile(process.argv[2] ?? ".rest-area-sync/snapshot.json", "utf8"));
const client = new Client({connectionString: process.env.DATABASE_URL, ssl: {rejectUnauthorized: false}});
await client.connect();
try {
  await client.query("BEGIN READ ONLY");
  const rows = (await client.query("SELECT * FROM public.test_lounge ORDER BY id")).rows;
  const mappings = (await client.query("SELECT std_rest_cd,rest_area_id,match_status FROM public.test_food_area_mappings ORDER BY std_rest_cd")).rows;
  const foodCounts = (await client.query("SELECT count(*)::int AS total, count(*) FILTER (WHERE source_present AND app_visible)::int AS visible FROM public.test_food_menus")).rows[0];
  await client.query("ROLLBACK");
  assert.equal(new Set(rows.map(row => row.id)).size, rows.length);
  const retained = snapshot.existing.map(before => {
    const after = rows.find(row => row.id === before.id);
    assert.ok(after, `기존 id ${before.id} 누락`);
    for (const [key, value] of Object.entries(before)) {
      if (value == null || value === after[key]) continue;
      assert.ok(key === "name" && after.std_rest_cd === "000119" && before.phone === after.phone, `기존 값 변경: ${before.id}.${key}`);
    }
    return after.id;
  });
  for (const field of ["std_rest_cd", "service_area_code"]) {
    const codes = rows.map(row => row[field]).filter(Boolean);
    assert.equal(codes.length, new Set(codes).size, `${field} 중복`);
  }
  assert.ok(rows.every(row => typeof row.std_rest_cd === "string" && /^\d{6}$/.test(row.std_rest_cd)));
  const iksan = rows.find(row => row.std_rest_cd === "000119");
  assert.equal(iksan.id, 38);
  assert.equal(Number(mappings.find(mapping => mapping.std_rest_cd === "000119")?.rest_area_id), 38);
  const originalIds = new Set(snapshot.existing.map(row => row.id));
  const added = rows.filter(row => !originalIds.has(row.id));
  const located = rows.filter(row => validRestCoordinates(row.latitude, row.longitude));
  const unresolved = rows.filter(row => !validRestCoordinates(row.latitude, row.longitude));
  const validation = {verifiedAt: new Date().toISOString(), retained: retained.length, total: rows.length, added: added.length, located: located.length,
    unresolved: unresolved.length, sourceCodes: rows.filter(row => row.std_rest_cd).length, serviceCodes: rows.filter(row => row.service_area_code).length,
    foodMatched: mappings.filter(row => row.match_status === "matched").length, foodUnmatched: mappings.filter(row => row.match_status !== "matched").length,
    foodMenus: foodCounts.total, visibleMenus: foodCounts.visible, preservedOriginalValues: true};
  await fs.writeFile(".rest-area-sync/verification.json", JSON.stringify({validation, unresolved: unresolved.map(row => ({id: row.id, name: row.name, code: row.std_rest_cd}))}, null, 2));
  let report = await fs.readFile("docs/rest-area-integration.md", "utf8");
  report = report.replace(/"unresolvedCoordinates": \d+/, `"unresolvedCoordinates": ${unresolved.length}`);
  const cell = value => String(value ?? "미제공").replace(/\|/g, "\\|");
  const newRows = ["## 신규 추가 휴게소", "", "최종 좌표 감사 결과를 반영했습니다.", "", "| ID | 이름 | 표준 코드 | 노선 | 위도 | 경도 |", "|---:|---|---|---|---:|---:|",
    ...added.map(row => `| ${row.id} | ${cell(row.name)} | ${row.std_rest_cd} | ${cell(row.route_name)} | ${cell(row.latitude)} | ${cell(row.longitude)} |`), "", ""];
  report = report.replace(/## 신규 추가 휴게소[\s\S]*?(?=## 이름 보정)/, newRows.join("\n"));
  const audit = await fs.readFile("docs/rest-area-coordinate-audit.md", "utf8");
  const coordinates = audit.match(/## 좌표 처리[\s\S]*?(?=## API 필드 충돌)/)?.[0];
  if (coordinates) report = report.replace(/## 좌표 처리[\s\S]*?(?=## API 필드 충돌)/, coordinates);
  report = report.replace(/\n## 최종 DB 검증[\s\S]*$/, "");
  report += `\n## 최종 DB 검증\n\n\`\`\`json\n${JSON.stringify(validation, null, 2)}\n\`\`\`\n\n[좌표 재검증 보고서](./rest-area-coordinate-audit.md)를 함께 확인하세요.\n`;
  await fs.writeFile("docs/rest-area-integration.md", report);
  console.log(JSON.stringify(validation, null, 2));
} finally { await client.end(); }
