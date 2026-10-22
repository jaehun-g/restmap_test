import test from "node:test";
import assert from "node:assert/strict";
import {integrateRestAreaSources, planRestAreaIntegration, type LoungeRow} from "../lib/rest-area-integration.ts";
import {parseRestAreaCsv, type RestAreaSources} from "../lib/rest-area-sources.ts";
import {normalizedDirection, isBidirectionalDirection} from "../lib/facility-places.ts";
import {resolveRestAreaCoordinates, selectRestAreaKeywordPlace} from "../lib/rest-area-geocode.ts";
import type {KakaoKeywordPlace} from "../lib/kakao-local.ts";
import {excludedPrivateRestAreas} from "../lib/excluded-private-rest-areas.ts";

const sources = (): RestAreaSources => ({fetchedAt: new Date().toISOString(), locations: [
  {stdRestCd: "000119", serviceAreaCode: "A00045", unitName: "익산미륵사지(순천)휴게소", routeName: "호남선", routeNo: "0251", yValue: "36.048719", xValue: "127.103033"},
], facilities: [{stdRestCd: "000119", stdRestNm: "익산미륵사지(순천)휴게소", routeCd: "0251", routeNm: "호남선", psName: "샤워실", psCode: "02"}], services: [
  {serviceAreaCode: "A00045", serviceAreaCode2: "000119", serviceAreaName: "익산미륵사지(순천)휴게소", direction: "순천", routeCode: "0251", routeName: "호남선", telNo: "063-836-5280"},
], serviceExpectedCount: 1, serviceComplete: true, recovery: []});
const existing: LoungeRow[] = [{id: 38, name: "여산(순천 방향)", route_name: "호남선", route_number: "25", direction_label: "순천 방향", phone: "063-836-5280", latitude: 36.0486, longitude: 127.102, has_store: 1}];

test("동해선 구간명은 API·CSV 통합 시 동해선으로 저장한다", () => {
  for (const route of ["동해선(부산-포항)", "동해선(삼척-속초)"]) {
    const input = sources();
    input.locations[0].routeName = route;
    assert.equal(integrateRestAreaSources(input)[0].fields.route_name, "동해선");
    const plan = planRestAreaIntegration(input, [{휴게소명: "양양(속초 방향)", 기준정보_도로노선명: route}], []);
    assert.equal(plan.csvRows[0].route_name, "동해선");
  }
});

test("제외한 민자 휴게소 23곳은 API 재수집 시 다시 추가하지 않는다", () => {
  const input = sources();
  for (const item of excludedPrivateRestAreas) input.facilities.push({stdRestCd: item.code, stdRestNm: item.name, routeNm: item.route, psName: "편의점", psCode: "01"});
  const plan = planRestAreaIntegration(input, [], existing);
  assert.equal(plan.entries.filter(entry => entry.status === "excluded").length, 23);
  assert.equal(plan.entries.filter(entry => entry.status === "new").length, 0);
  assert.equal(plan.entries.find(entry => entry.area.code === "000119")?.status, "existing");
});

test("민자 휴게소가 CSV로 들어와도 재추가하지 않고 같은 노선의 공영 시설은 유지한다", () => {
  const csv = excludedPrivateRestAreas.map(item => ({휴게소명: item.name, 기준정보_도로노선명: item.route}));
  const plan = planRestAreaIntegration(sources(), [...csv, {휴게소명: "내린천(양방향)", 기준정보_도로노선명: "서울양양선"}], existing);
  assert.equal(plan.csvRows.length, 1);
  assert.equal(plan.csvRows[0].name, "내린천(양방향)");
  assert.equal(plan.csvReviews.filter(note => note.includes("민자")).length, 23);
});

test("양방향 정규화가 양양·함양 방향을 양방향으로 오인하지 않는다", () => {
  for (const value of ["양방향", "통합 방향", "양방"]) assert.equal(normalizedDirection(value), "양방");
  for (const value of ["양양 방향", "함양 방향", "밀양 방향"]) assert.equal(isBidirectionalDirection(value), false);
  assert.equal(normalizedDirection("양양 방향"), "양양");
});
test("CSV 인용부호·줄바꿈·BOM을 읽고 잘못된 행을 거부한다", () => {
  assert.deepEqual(parseRestAreaCsv('\uFEFF휴게소명,비고\r\n"가,나","줄1\n줄2"\r\n'), [{휴게소명: "가,나", 비고: "줄1\n줄2"}]);
  assert.throws(() => parseRestAreaCsv("휴게소명,비고\n가\n"));
});
test("명칭 변경은 전화번호·방향·근접 좌표가 모두 맞을 때 기존 ID에 연결한다", () => {
  const plan = planRestAreaIntegration(sources(), [], existing);
  assert.equal(plan.entries[0].status, "existing");
  assert.equal(plan.entries[0].targetId, 38);
  assert.equal(plan.entries[0].changes.name, "익산미륵사지(순천 방향)");
  assert.equal(plan.entries[0].changes.std_rest_cd, "000119");
  assert.deepEqual(plan.retainedIds, [38]);
  const far = planRestAreaIntegration(sources(), [], [{...existing[0], latitude: 37}]);
  assert.equal(far.entries[0].status, "new");
});
test("다른 원본 코드가 같은 시설을 가리켜도 신규 행을 중복 생성하지 않는다", () => {
  const input = sources();
  input.facilities.push({...input.facilities[0], stdRestCd: "000551"});
  const row = {...existing[0], name: "익산미륵사지(순천 방향)"};
  const plan = planRestAreaIntegration(input, [], [row]);
  assert.equal(plan.entries.filter(entry => entry.status === "existing").length, 1);
  assert.equal(plan.entries.filter(entry => entry.status === "alias").length, 1);
  assert.equal(plan.entries.filter(entry => entry.status === "new").length, 0);
});
test("요약 API의 반대 방향 값이 기준정보 연결과 기존 값을 덮어쓰지 않는다", () => {
  const input = sources(); input.services[0].direction = "천안";
  const area = integrateRestAreaSources(input)[0];
  assert.equal(area.fields.phone, null);
  assert.equal(area.fields.has_shower, 1);
  assert.equal(area.warnings.length, 1);
  const plan = planRestAreaIntegration(input, [], [{...existing[0], name: "익산미륵사지(순천 방향)"}]);
  assert.equal(plan.entries[0].status, "existing");
  assert.equal(plan.entries[0].changes.has_store, undefined);
});
test("테스트·이름 누락 원본은 마커 데이터로 만들지 않고 검토 목록에 남긴다", () => {
  const input = sources(); input.facilities.push({stdRestCd: "900513", stdRestNm: null, psName: "기타", psCode: "99"});
  input.facilities.push({stdRestCd: "000542", stdRestNm: "테스트휴게소", psName: "기타", psCode: "99"});
  const plan = planRestAreaIntegration(input, [], []);
  assert.equal(plan.entries.filter(entry => entry.status === "review").length, 2);
});
const place = (overrides: Partial<KakaoKeywordPlace> = {}): KakaoKeywordPlace => ({name: "익산미륵사지휴게소 순천방향", categoryName: "교통 > 휴게소", categoryGroupCode: null, addressName: "전북 익산시", roadAddressName: null, phone: null, placeUrl: null, latitude: 36.048719, longitude: 127.103033, ...overrides});
test("휴게소 키워드는 주유소와 반대 방향을 제외하고 유일한 시설만 선택한다", () => {
  const area = integrateRestAreaSources(sources())[0];
  assert.equal(selectRestAreaKeywordPlace([place(), place({name: "익산미륵사지휴게소 천안방향"}), place({name: "익산미륵사지휴게소 주유소"})], area, true)?.name, place().name);
  assert.equal(selectRestAreaKeywordPlace([place(), place()], area, true), null);
  assert.equal(selectRestAreaKeywordPlace([place({name: "익산미륵사지휴게소(천안방향)", phone: "063-836-5280"})], area, true), null);
});
test("공용 주소의 첫 결과로 반대 방향 좌표를 넣지 않으며 실패해도 NULL로 남긴다", async () => {
  const area = integrateRestAreaSources(sources())[0];area.fields.latitude = null;area.fields.longitude = null;area.address = "공용 주소";
  let addressCalls = 0;
  const result = await resolveRestAreaCoordinates(area, [], {addressShared: true,
    geocode: async () => { addressCalls++; throw new Error("공용 주소를 검색하면 안 됨"); },
    search: async () => ({ok: true, value: [place({name: "익산미륵사지휴게소 천안방향"})]}),
  });
  assert.equal(addressCalls, 0);
  assert.equal(result.latitude, null);
  assert.equal(result.method, "unresolved");
});
test("검증된 원본 코드로 다시 계획해도 신규 행이 생기지 않는다", () => {
  const plan = planRestAreaIntegration(sources(), [], [{...existing[0], std_rest_cd: "000119", service_area_code: "A00045", route_direction: "순천", name: "익산미륵사지(순천 방향)"}]);
  assert.equal(plan.entries[0].status, "existing");
  assert.deepEqual(plan.entries[0].changes, {has_shower: 1});
});

test("주소 지오코딩이 같은 휴게소의 키워드 위치와 크게 다르면 확정하지 않는다", async () => {
  const area = integrateRestAreaSources(sources())[0]; area.fields.latitude = null; area.fields.longitude = null; area.address = "원본 주소";
  const result = await resolveRestAreaCoordinates(area, [], {
    geocode: async () => ({ok: true, value: {latitude: 36.07, longitude: 127.103, addressName: "같은 이름의 다른 필지", addressType: "REGION_ADDR", parcelAddressName: null, roadAddressName: null}}),
    search: async () => ({ok: true, value: [place({name: "익산미륵사지휴게소 순천방향 식당", categoryName: "음식점"})]}),
  });
  assert.equal(result.latitude, null);
  assert.match(result.reason, /1km/);
});
