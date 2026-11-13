import test from "node:test";
import assert from "node:assert/strict";
import {
  formatDuration,
  formatPlaceDistance,
  kakaoDirectionsUrl,
  navigationProviderUrl,
} from "../lib/navigation.ts";
import {
  collectRouteRestAreas,
  fetchDrivingRoutes,
  findItemsAlongDrivingRoute,
  findRestAreasAlongDrivingRoute,
  parseDirectionsQuery,
  parseKakaoDirectionsRoutes,
  tooCloseDirectionsMessage,
} from "../lib/directions.ts";
import {
  normalizePlaceSearchQuery,
  parseKakaoCoord2Address,
  parseKakaoPlaceDocuments,
} from "../lib/place-search.ts";
import {excludeLinkedRouteStations} from "../lib/facility-places.ts";
import {normalizeExGasStations} from "../lib/ex-gas-stations.ts";
import {normalizeGasStations} from "../lib/gas-stations.ts";
import {normalizeRestAreas} from "../lib/rest-areas.ts";

test("네비게이션 앱별 연결 URL(T맵, 카카오내비, 네이버지도, 카카오맵)을 생성한다", () => {
  const target = {name: "죽전휴게소(서울)", latitude: 37.3324, longitude: 127.1045};
  const origin = {latitude: 37.2, longitude: 127.1};

  assert.equal(
    kakaoDirectionsUrl(target, origin),
    `https://map.kakao.com/link/from/${encodeURIComponent("내 위치")},37.2,127.1/to/${encodeURIComponent("죽전휴게소(서울)")},37.3324,127.1045`,
  );
  assert.equal(
    navigationProviderUrl("tmap", target, origin, true),
    `tmap://route?goalname=${encodeURIComponent("죽전휴게소(서울)")}&goalx=127.1045&goaly=37.3324`,
  );
  assert.equal(
    navigationProviderUrl("kakaonavi", target, origin, true),
    `kakaonavi://navigate?name=${encodeURIComponent("죽전휴게소(서울)")}&x=127.1045&y=37.3324&coord_type=wgs84`,
  );
  assert.equal(
    navigationProviderUrl("navermap", target, origin, true),
    `nmap://route/car?slat=37.2&slng=127.1&sname=${encodeURIComponent("내 위치")}&dlat=37.3324&dlng=127.1045&dname=${encodeURIComponent("죽전휴게소(서울)")}&appname=next-map-test`,
  );
});

test("길찾기의 소요시간을 포맷팅한다", () => {
  assert.equal(formatDuration(45), "1분 미만");
  assert.equal(formatDuration(840), "약 14분");
  assert.equal(formatDuration(3600), "약 1시간");
  assert.equal(formatDuration(4800), "약 1시간 20분");
});

test("장소 거리는 두 좌표 사이의 직선거리만 km로 표시한다", () => {
  const straight = formatPlaceDistance(
    {latitude: 0, longitude: 1},
    {latitude: 0, longitude: 0},
  );
  assert.deepEqual(straight, {
    badgeText: "111.2 km",
    detailText: "내 위치에서 111.2 km",
    isRoad: false,
  });
});

test("가까운 거리와 0도 km만 표시하고 위치 정보가 없으면 숨긴다", () => {
  const origin = {latitude: 0, longitude: 0};
  for (const [latitude, expected] of [[0, "0 km"], [0.004, "0.4 km"], [0.01, "1.1 km"]] as const) {
    assert.equal(formatPlaceDistance({latitude, longitude: 0}, origin)?.badgeText, expected);
  }
  assert.equal(formatPlaceDistance(origin), null);
  assert.equal(formatPlaceDistance({latitude: null, longitude: null}, origin), null);
  assert.equal(formatPlaceDistance(origin, {latitude: 91, longitude: 0}), null);
  assert.equal(formatPlaceDistance({latitude: NaN, longitude: 0}, origin), null);
});

test("길찾기 쿼리 파라미터와 카카오모빌리티 대안 경로 목록을 파싱한다", () => {
  const valid = parseDirectionsQuery(
    new URLSearchParams("originLat=37.2&originLng=127.1&destLat=37.4&destLng=127.05"),
  );
  assert.equal(valid.ok, true);

  const invalid = parseDirectionsQuery(new URLSearchParams("originLat=999&originLng=127.1"));
  assert.equal(invalid.ok, false);

  const tooClose = parseDirectionsQuery(
    new URLSearchParams("originLat=37.2&originLng=127.1&destLat=37.21&destLng=127.11"),
  );
  assert.equal(tooClose.ok, false);
  if (!tooClose.ok) {
    assert.equal(tooClose.error.message, tooCloseDirectionsMessage);
  }

  const parsed = parseKakaoDirectionsRoutes({
    routes: [
      {
        result_code: 0,
        summary: {distance: 15840, duration: 842},
        sections: [
          {
            roads: [
              {
                name: "경부고속도로",
                distance: 14000,
                vertexes: [127.1, 37.2, 127.1, 37.2, 127.08, 37.3, 127.05, 37.4],
              },
            ],
          },
        ],
      },
      {
        result_code: 0,
        summary: {distance: 17200, duration: 780},
        sections: [
          {
            roads: [
              {
                name: "용인서울고속도로",
                distance: 15000,
                vertexes: [127.1, 37.2, 127.06, 37.32, 127.05, 37.4],
              },
            ],
          },
        ],
      },
    ],
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.value.length, 2);
    assert.equal(parsed.value[0].label, "추천 경로");
    assert.equal(parsed.value[0].summaryRoad, "경부고속도로");
    assert.equal(parsed.value[1].label, "최단시간");
    assert.equal(parsed.value[1].summaryRoad, "용인서울고속도로");
  }
});

test("도로 좌표가 없거나 한 점뿐인 응답은 경로로 사용하지 않는다", () => {
  for (const vertexes of [[], [127, 37], [127, 37, 127, 37]]) {
    const result = parseKakaoDirectionsRoutes({routes: [{
      result_code: 0,
      summary: {distance: 20000, duration: 1200},
      sections: [{roads: [{vertexes}]}],
    }]});
    assert.equal(result.ok, false);
  }
});

test("경로 조회 응답에 도로 좌표가 없으면 출발·도착 직선으로 대체하지 않는다", async () => {
  const previousKey = process.env.KAKAO_REST_API_KEY;
  process.env.KAKAO_REST_API_KEY = "test-api-key";
  try {
    const result = await fetchDrivingRoutes(
      {latitude: 36.125, longitude: 127.125},
      {latitude: 37.125, longitude: 128.125},
      async () => Response.json({routes: [{result_code: 0, summary: {distance: 20000, duration: 1200}}]}),
    );
    assert.equal(result.ok, false);
  } finally {
    if (previousKey === undefined) delete process.env.KAKAO_REST_API_KEY;
    else process.env.KAKAO_REST_API_KEY = previousKey;
  }
});

test("주행 경로 폴리라인을 따라 반경 내 휴게소를 출발지 진행 순서대로 찾는다", () => {
  const normalized = normalizeRestAreas([
    {id: 1, name: "기흥휴게소", latitude: 37.235, longitude: 127.101},
    {id: 2, name: "죽전휴게소", latitude: 37.332, longitude: 127.102},
    {id: 3, name: "먼휴게소", latitude: 36.5, longitude: 128.0},
  ]);
  assert.ok(normalized.ok);
  const route = {
    bounds: {south: 37.2, north: 37.4, west: 127.09, east: 127.11},
    path: [
      [37.2, 127.1],
      [37.3, 127.1],
      [37.4, 127.1],
    ] as [number, number][],
  };
  const matches = findRestAreasAlongDrivingRoute(route, normalized.value, 1500);
  assert.deepEqual(
    matches.map(item => item.area.name),
    ["기흥휴게소", "죽전휴게소"],
  );
  assert.ok(matches[0].alongMeters < matches[1].alongMeters);

  const stationItems = findItemsAlongDrivingRoute(
    route,
    [
      {id: "st1", name: "기흥주유소", latitude: 37.24, longitude: 127.105},
      {id: "st2", name: "외부주유소", latitude: 36.1, longitude: 128.2},
    ],
    1500,
  );
  assert.deepEqual(
    stationItems.map(entry => entry.item.name),
    ["기흥주유소"],
  );
});

test("경유 개수는 출발·도착과 폐쇄 휴게소를 제외하고 지도에는 출발·도착을 유지한다", () => {
  const normalized = normalizeRestAreas([
    {id: 1, name: "출발 휴게소", latitude: 37.2, longitude: 127.1},
    {id: 2, name: "경유 휴게소", latitude: 37.3, longitude: 127.1},
    {id: 3, name: "도착 휴게소", latitude: 37.4, longitude: 127.1},
    {id: 4, name: "같은 좌표의 별도 휴게소", latitude: 37.3, longitude: 127.1},
    {id: 5, name: "폐쇄 휴게소", latitude: 37.35, longitude: 127.1, operation_status: "closed"},
    {id: 6, name: "좌표 없는 휴게소"},
    {id: 7, name: "경로 밖 휴게소", latitude: 37.3, longitude: 128.1},
  ]);
  if (!normalized.ok) assert.fail(normalized.error.message);
  const path: [number, number][] = [[37.2, 127.1], [37.4, 127.1]];
  const route = {path, bounds: {south: 37.2, north: 37.4, west: 127.1, east: 127.1}};
  const {matches, stops} = collectRouteRestAreas(route, normalized.value, {originRestAreaId: 1, destinationRestAreaId: 3});
  assert.deepEqual(matches.map(({area}) => area.id), [1, 2, 4, 3]);
  assert.deepEqual(stops.map(({area}) => area.id), [2, 4]);
  assert.ok(stops.every(stop => matches.includes(stop)));
  const reversed = collectRouteRestAreas({...route, path: [...path].reverse()}, normalized.value, {originRestAreaId: 3, destinationRestAreaId: 1});
  assert.deepEqual(reversed.stops.map(({area}) => area.id), [2, 4]);
  const alternative = collectRouteRestAreas({path: [[37.2, 129], [37.4, 129]], bounds: {...route.bounds, west: 129, east: 129}}, normalized.value);
  assert.equal(alternative.matches.length, 0);
  assert.equal(alternative.stops.length, 0);
});

test("카카오 로컬 장소·주소 검색 응답을 출발지/목적지 후보로 정규화하고 자모 오타를 제외한다", () => {
  assert.equal(normalizePlaceSearchQuery("ㄴ"), "");
  assert.equal(normalizePlaceSearchQuery("남동 ㄴ"), "남동");

  const items = parseKakaoPlaceDocuments(
    {
      documents: [
        {
          id: "1001",
          place_name: "수원역",
          road_address_name: "경기 수원시 팔달구 덕영대로 924",
          category_group_name: "지하철역",
          phone: "1544-7788",
          x: "127.0001",
          y: "37.2659",
        },
        {
          id: "1002",
          place_name: "BM바이크 ㄴ마동점",
          road_address_name: "인천 남동구",
          x: "126.7",
          y: "37.4",
        },
      ],
    },
    {
      documents: [
        {
          address_name: "경기 화성시 동탄기흥로 565",
          x: "127.095",
          y: "37.211",
        },
      ],
    },
  );
  assert.equal(items.length, 2);
  assert.equal(items[0].name, "수원역");
  assert.equal(items[0].address, "경기 수원시 팔달구 덕영대로 924");
  assert.equal(items[0].phone, "1544-7788");
  assert.equal(items[1].name, "경기 화성시 동탄기흥로 565");

  assert.equal(
    parseKakaoCoord2Address({
      documents: [
        {
          road_address: {address_name: "경기 화성시 동탄구 동탄기흥로 565"},
          address: {address_name: "경기 화성시 영천동 681-4"},
        },
      ],
    }),
    "경기 화성시 동탄구 동탄기흥로 565",
  );
  assert.equal(
    parseKakaoCoord2Address(
      {documents: []},
      {documents: [{address_name: "경기도 화성시 영천동"}]},
    ),
    "경기도 화성시 영천동",
  );
});

test("경로상 주유소 마커 목록에서 경로상 휴게소에 종속된 EX 주유소는 제외하고 독립 주유소는 유지한다", () => {
  const restResult = normalizeRestAreas([
    {
      id: 10,
      name: "안성(부산 방향)",
      route_name: "경부선",
      direction_label: "부산 방향",
      latitude: "37.01",
      longitude: "127.15",
      has_truck_lounge: 1,
    },
  ]);
  const exResult = normalizeExGasStations([
    {
      id: 100,
      source_key: "ex-anseong",
      service_area_name: "안성(부산)주유소",
      route_name: "경부선",
      direction: "부산방향",
      latitude: "37.0102",
      longitude: "127.1502",
    },
  ]);
  const gsResult = normalizeGasStations([
    {
      id: 200,
      siteCd: "gs-1",
      siteNm: "독립 GS 주유소",
      lat: "37.05",
      longi: "127.16",
    },
  ]);
  if (!restResult.ok || !exResult.ok || !gsResult.ok) assert.fail("fixture normalization failed");

  const allAreas = restResult.value;
  const allStations = [...exResult.value, ...gsResult.value];
  const filtered = excludeLinkedRouteStations(allAreas, allStations, allAreas, allStations);
  assert.deepEqual(
    filtered.map(item => item.name),
    ["독립 GS 주유소"],
  );
});
