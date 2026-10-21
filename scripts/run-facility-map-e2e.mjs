const baseUrl = (process.env.E2E_BASE_URL ?? "http://127.0.0.1:3003").replace(/\/$/, "");
const routeName = "경부선";

function check(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path) {
  const response = await fetch(`${baseUrl}${path}`, {cache: "no-store"});
  const body = await response.text();
  check(response.ok, `${path}: HTTP ${response.status} ${body.slice(0, 300)}`);
  return {response, body};
}

const mobile = await request("/mobile");
check(
  mobile.body.includes("휴게소 · EX 주유소"),
  "모바일 화면에 통합 장소 제어 문구가 렌더링되지 않았습니다.",
);

const rest = JSON.parse((await request("/api/rest-areas")).body);
check(Array.isArray(rest.items) && rest.items.length > 0, "휴게소 API가 비어 있습니다.");

const encodedRoute = encodeURIComponent(routeName);
const ex = JSON.parse((await request(`/api/gas-stations?source=ex&routeName=${encodedRoute}`)).body);
check(Array.isArray(ex.items) && ex.items.length > 0, "선택 노선 EX 주유소 API가 비어 있습니다.");
check(ex.items.every(station => station.brand === "EX"), "EX 전용 조회에 GS 데이터가 포함되었습니다.");

const highway = JSON.parse((await request(`/api/highway-routes?routeName=${encodedRoute}`)).body);
check(highway.route?.routeName === routeName, "선택 노선의 하이라이트 데이터를 찾지 못했습니다.");
check(Array.isArray(highway.route?.paths) && highway.route.paths.length > 0, "노선 경로가 비어 있습니다.");
check(
  highway.route.paths.every(path =>
    Array.isArray(path) &&
    path.length >= 2 &&
    path.every(point => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite)),
  ),
  "노선 좌표 형식이 [위도, 경도] 숫자 쌍이 아닙니다.",
);

console.log(
  JSON.stringify({
    baseUrl,
    routeName,
    restAreaCount: rest.items.length,
    exStationCount: ex.items.length,
    routePathCount: highway.route.paths.length,
    result: "passed",
  }),
);
