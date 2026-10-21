import nextEnv from "@next/env";
import {Client} from "pg";
import {fetchFoodMenus} from "../lib/food-menu-source.ts";
import {matchFoodAreas} from "../lib/food-menu-matching.ts";
import {normalizedFacilityName, normalizedDirection} from "../lib/facility-places.ts";
import {canonicalHighwayRouteName} from "../lib/highway-route-name.ts";
import {normalizeRestAreas} from "../lib/rest-areas.ts";

nextEnv.loadEnvConfig(process.cwd());
const fetched = await fetchFoodMenus();
if (!fetched.ok) throw new Error(fetched.error.message);
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL을 설정해주세요.");
const client = new Client({connectionString: process.env.DATABASE_URL, ssl: {rejectUnauthorized: false}});
try {
  await client.connect();
  await client.query("BEGIN READ ONLY");
  const {rows} = await client.query("SELECT * FROM test_lounge ORDER BY id");
  const parsed = normalizeRestAreas(rows);
  if (!parsed.ok) throw new Error(parsed.error.message);
  const areas = parsed.value;
  const matches = matchFoodAreas(fetched.value, areas);
  const unmatched = matches.filter(match => match.status !== "matched");
  const matchedIds = new Set(matches.flatMap(match => match.restAreaId === null ? [] : [match.restAreaId]));
  const dbUnmapped = areas.filter(area => !matchedIds.has(area.id));
  const reasons = new Map();
  const comparisons = unmatched.map(match => {
    const name = normalizedFacilityName(match.restName);
    const exact = areas.filter(area => normalizedFacilityName(area.name) === name);
    const partial = exact.length ? [] : areas.filter(area => {
      const candidate = normalizedFacilityName(area.name);
      return candidate.length >= 2 && (candidate.includes(name) || name.includes(candidate));
    });
    const problems = [];
    if (!match.routeName) problems.push("API 노선 누락");
    if (!match.direction) problems.push("API 방향 누락");
    if (!exact.length) problems.push(partial.length ? "부분 명칭만 유사" : "동명 DB 후보 없음");
    if (exact.length && match.routeName && !exact.some(area => area.routeName && canonicalHighwayRouteName(area.routeName) === canonicalHighwayRouteName(match.routeName)))
      problems.push("노선명 불일치");
    if (exact.length && match.direction && !exact.some(area => normalizedDirection(area.directionLabel ?? area.routeDirection) === match.direction))
      problems.push("방향 불일치");
    if (match.status === "ambiguous") problems.push("중복 또는 원본 속성 충돌");
    for (const problem of problems) reasons.set(problem, (reasons.get(problem) ?? 0) + 1);
    const sameDirection = exact.filter(area => normalizedDirection(area.directionLabel ?? area.routeDirection) === match.direction);
    return {match, candidates: sameDirection.length ? sameDirection : exact.length ? exact : partial, problems, partial: !exact.length && partial.length > 0};
  });
  const cell = value => String(value ?? "미제공").replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
  const date = new Intl.DateTimeFormat("sv-SE", {timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "medium"}).format(new Date());
  const lines = [
    "# 휴게소 음식정보 API ↔ 기존 DB 미매핑 검토",
    "", `조회 시각: ${date} (Asia/Seoul)`, "",
    "원본: `https://data.ex.co.kr/openapi/restinfo/restBestfoodList` 전체 페이지와 Supabase `public.test_lounge`를 읽기 전용으로 대조했습니다. 주유소 데이터는 비교하지 않았습니다.", "",
    "## 대조 결과", "",
    "| 항목 | 건수 |", "|---|---:|",
    `| API 메뉴 | ${fetched.value.length} |`,
    `| API 휴게소 코드(stdRestCd) | ${matches.length} |`,
    `| 기존 DB 휴게소 | ${areas.length} |`,
    `| 이름·노선·방향 일치 API 휴게소 | ${matches.length - unmatched.length} |`,
    `| 검토가 필요한 API 휴게소 | ${unmatched.length} |`,
    `| 연결된 기존 DB 휴게소 | ${matchedIds.size} |`,
    `| 아직 연결되지 않은 기존 DB 휴게소 | ${dbUnmapped.length} |`, "",
    "메뉴 식별자는 `stdRestCd + seq`로 비교합니다. 이번 응답에서는 `seq` 단독으로도 중복이 없었지만, 휴게소별 코드와 함께 저장해 다른 휴게소의 음식이 섞이지 않게 합니다.", "",
    "## 판단 기준", "",
    "- 이름: 괄호와 `휴게소`·`주유소`·`충전소`·공백을 제거한 이름이 같아야 합니다.",
    "- 방향: API 휴게소명의 괄호에서 방향을 추출하고 DB `direction_label`(없으면 `route_direction`)과 비교합니다. `방향`이라는 접미어와 공백만 제거합니다.",
    "- 노선: 앱의 기존 노선 표준화 함수를 적용한 노선명이 같아야 합니다. 이 보고서를 위해 새로운 노선 별칭을 추가하지 않았습니다.",
    "- 세 항목이 모두 일치하고 DB 후보가 정확히 하나인 경우에만 자동 연결 대상으로 분류합니다.",
    "- 아래의 비교 후보는 확정 매핑이 아닙니다. 특히 부분 명칭 포함 후보는 다른 노선의 다른 휴게소일 수 있습니다.",
    "- 방향이 없다는 이유만으로 양방향·통합 휴게소라고 단정하지 않습니다. `통합 방향` 또는 DB의 빈 방향 표기는 별도 검토 대상입니다.", "",
    "## 불일치 사유 집계", "",
    "한 휴게소에 여러 사유가 있을 수 있으므로 아래 건수는 중복 집계입니다.", "",
    "| 사유 | API 휴게소 수 |", "|---|---:|",
    ...[...reasons].map(([reason, count]) => `| ${reason} | ${count} |`), "",
    "## API 휴게소 미매핑 목록", "",
    "DB 후보는 `id: 이름 / 노선 / 방향` 형식입니다. 동일 이름 후보 중 방향이 맞는 항목이 있으면 해당 후보만 표시했습니다. API 방향은 이름에서 추출한 값입니다.", "",
    "| stdRestCd | API 휴게소명 | API 노선 | API 방향 | 기존 DB 비교 후보 | 보류 사유 |",
    "|---|---|---|---|---|---|",
    ...comparisons.map(({match, candidates, problems, partial}) => `| \`${cell(match.stdRestCd)}\` | ${cell(match.restName)} | ${cell(match.routeName)} | ${cell(match.direction)} | ${candidates.length ? `${partial ? '(부분 명칭 포함) ' : ''}${candidates.map(area => `${area.id}: ${cell(area.name)} / ${cell(area.routeName)} / ${cell(area.directionLabel ?? area.routeDirection)}`).join('<br>')}` : '후보 없음'} | ${problems.join(' · ')} |`), "",
    "## 우선 검토할 사례", "",
    "- **익산미륵사지 `000119`**: API는 순천 방향이고 동명 DB 후보 id 37은 천안 방향입니다. 반대 방향으로 연결하면 안 됩니다.",
    "- **함양 코드 중복 가능성**: `000161`·`000551`은 대전, `000162`·`000552`는 통영 방향의 같은 이름으로 제공됩니다. 코드·주소·운영 이력을 검토한 뒤 연결해야 하며, 이름만으로 합치면 메뉴가 중복될 수 있습니다.",
    "- **노선 명칭 차이**: `통영대전선 ↔ 대전통영선`, `호남선의 지선 ↔ 호남지선`, `서산영덕선 ↔ 당진영덕선` 등의 명칭 차이가 있습니다. 실제 동일 구간인지 검증한 뒤 별칭이나 수동 매핑을 등록해야 합니다.",
    "- **부분 이름 유사**: 기흥복합·낙동강의성·군위영천·삼국유사군위는 부분 문자열이 겹치는 DB 행이 있지만 같은 휴게소라는 증거는 아닙니다.",
    "- **김제 `000613`·`000614`**: 이름과 방향에 맞는 DB 후보는 있으나 API 노선명이 비어 있어 자동 연결에서 제외했습니다.", "",
    "## 기존 DB에서 아직 연결되지 않은 휴게소", "",
    "아래에는 위 불일치로 보류된 항목과 API에 대응하는 휴게소가 없는 항목이 함께 포함됩니다. 이 목록만으로 음식정보가 없거나 영업을 중단했다고 판단하면 안 됩니다.", "",
    "| DB id | 휴게소명 | DB 노선 | DB 방향 |", "|---:|---|---|---|",
    ...dbUnmapped.map(area => `| ${area.id} | ${cell(area.name)} | ${cell(area.routeName)} | ${cell(area.directionLabel ?? area.routeDirection)} |`), "",
    "## 재현 및 검토 상태", "",
    "```powershell", "node scripts/report-food-menu-mapping.mjs", "```", "",
    "명령은 최신 API와 DB를 조회해 Markdown을 표준 출력하며 DB를 변경하지 않습니다. API·DB 내용이 바뀌면 건수와 후보도 달라질 수 있습니다.", "",
    "- [x] 전체 페이지 수와 API 총건수 검증", "- [x] 메뉴 복합 식별자 중복 확인",
    "- [x] 기존 휴게소 이름·노선·방향 비교", "- [x] 미매핑 API 휴게소와 미연결 DB 휴게소 목록 작성",
    "- [ ] 노선 별칭 및 방향 누락 항목 검증", "- [ ] 함양 등 동일 명칭의 여러 원본 코드 검토",
    "- [ ] 검토 완료 항목의 코드 ↔ DB id 매핑 확정", "",
  ];
  console.log(lines.join("\n"));
  await client.query("ROLLBACK");
} finally {
  await client.end();
}
