import test from "node:test";
import assert from "node:assert/strict";
import { normalizeRestAreas, visibleFacilities, routeDescription, type RestArea, type FacilityKey } from "../lib/rest-areas.ts";
import { directionOptions, filterRestAreas, initialFilters, routeOptions, sortRestAreas } from "../lib/rest-area-filters.ts";
import { scalarFields, sortFields } from "../lib/rest-area-fields.ts";

const parsed = normalizeRestAreas([
  { id: 3, name: "안성 10", route_name: "경부선", route_number: "777", route_direction: "하행", direction_label: "부산 방향", latitude: 37, longitude: 127, has_truck_lounge: 1, has_shower: 1, has_sleeping_room: 1, parking_count: 120 },
  { id: 1, name: "안성 2", route_name: "경부선", latitude: 36, longitude: 128, has_truck_lounge: 0, has_shower: 1, has_sleeping_room: 0, parking_count: 0 },
  { id: 2, name: "Mixed CASE", route_name: null, latitude: null, longitude: null, has_truck_lounge: null, has_shower: null, has_sleeping_room: 1, parking_count: null },
]);
if (!parsed.ok) throw new Error(parsed.error.message);
const areas = parsed.value;

test("search matches only name and route, with all whitespace-separated terms required", () => {
  assert.deepEqual(filterRestAreas(areas, initialFilters(), "  안성   경부선 ").map(a=>a.id), [3,1]);
  assert.deepEqual(filterRestAreas(areas, initialFilters(), "mixed case").map(a=>a.id), [2]);
  for (const query of ["777", "하행", "부산", "안성 영동"]) assert.equal(filterRestAreas(areas, initialFilters(), query).length, 0);
});
test("mobile lounge OFF includes all three states and ON includes only true", () => {
  assert.equal(filterRestAreas(areas, initialFilters(), "").length, 3);
  assert.deepEqual(filterRestAreas(areas, { ...initialFilters(), lounge:"present" }, "").map(a=>a.id), [3]);
});
test("administrator absent and unknown filters distinguish false from NULL", () => {
  assert.deepEqual(filterRestAreas(areas, {...initialFilters(),lounge:"absent"},"").map(a=>a.id),[1]);
  assert.deepEqual(filterRestAreas(areas, {...initialFilters(),lounge:"unknown"},"").map(a=>a.id),[2]);
});
test("facilities combine with AND and neither false nor unknown counts as present", () => {
  assert.deepEqual(filterRestAreas(areas,{...initialFilters(),facilities:["has_shower","has_sleeping_room"]},"").map(a=>a.id),[3]);
  assert.equal(filterRestAreas(areas,{...initialFilters(),facilities:["has_shower"],lounge:"unknown"},"").length,0);
});
test("route, facilities, lounge and search all combine with AND", () => {
  assert.deepEqual(filterRestAreas(areas,{...initialFilters(),routeName:"경부선",facilities:["has_shower"],lounge:"present"},"10").map(a=>a.id),[3]);
  assert.equal(filterRestAreas(areas,{...initialFilters(),routeName:"영동선"},"").length,0);
});
test("direction filtering is enabled only with a selected route and uses the display direction", () => {
  const filters = {...initialFilters(), routeName: "경부선", direction: "부산"};
  assert.deepEqual(filterRestAreas(areas, filters, "").map(area => area.id), [3]);
  assert.deepEqual(directionOptions(areas, "경부선"), [{key: "부산", label: "부산 방향"}]);
  assert.deepEqual(directionOptions(areas, null), []);
});
test("bidirectional rest areas remain visible for either selected route direction", () => {
  const bidirectional = normalizeRestAreas([
    {id: 30, name: "양방향 휴게소", route_name: "경부선", route_direction: "양방향", direction_label: "양방향"},
  ]);
  assert.ok(bidirectional.ok);
  for (const direction of ["상행", "하행"])
    assert.deepEqual(
      filterRestAreas(bidirectional.value, {...initialFilters(), routeName: "경부선", direction}, "").map(area => area.id),
      [30],
    );
  assert.deepEqual(directionOptions([...areas, ...bidirectional.value], "경부선"), [
    {key: "부산", label: "부산 방향"},
  ]);
});

test("route filtering and route options merge the Miryang-Ulsan alias", () => {
  const mixed = normalizeRestAreas([
    {id: 10, name: "울주", route_name: "밀양울산선"},
    {id: 11, name: "밀양영남루", route_name: "함양울산선"},
  ]);
  assert.ok(mixed.ok);
  assert.deepEqual(
    filterRestAreas(mixed.value, {...initialFilters(), routeName: "밀양울산선"}, "").map(area => area.id),
    [10, 11],
  );
  assert.deepEqual(routeOptions(mixed.value), [{name: "함양울산선", count: 2}]);
});
test("missing routes are visible to mobile but only administrator offers a missing route filter", () => {
  assert.equal(filterRestAreas(areas, initialFilters(), "").length,3);
  assert.deepEqual(filterRestAreas(areas,{...initialFilters(),missingRoute:true},"").map(a=>a.id),[2]);
  assert.deepEqual(routeOptions(areas),[{name:"경부선",count:2}]);
  assert.equal(routeDescription(areas[2],"mobile"),"");
  assert.equal(routeDescription(areas[2],"admin"),"노선 미등록");
});
test("unknown lounge facility is hidden only in mobile presentation", () => {
  assert.equal(visibleFacilities(areas[2],"mobile").some(([key])=>key==="has_truck_lounge"),false);
  assert.equal(visibleFacilities(areas[2],"admin").length,12);
  assert.equal(visibleFacilities(areas[1],"mobile").length,12);
});
test("sorting uses numeric values and leaves NULL last in both directions", () => {
  assert.deepEqual(sortRestAreas(areas,"parkingCount","asc").map(a=>a.id),[1,3,2]);
  assert.deepEqual(sortRestAreas(areas,"parkingCount","desc").map(a=>a.id),[3,1,2]);
  assert.deepEqual(sortRestAreas(areas,"has_truck_lounge","asc").map(a=>a.id),[1,3,2]);
  assert.deepEqual(sortRestAreas(areas,"has_truck_lounge","desc").map(a=>a.id),[3,1,2]);
});
test("string sorting recognizes numbers; ties use ID ascending even in descending order", () => {
  assert.deepEqual(sortRestAreas(areas.slice(0,2),"name","asc").map(a=>a.id),[1,3]);
  assert.deepEqual(sortRestAreas(areas.slice(0,2),"routeName","desc").map(a=>a.id),[1,3]);
});
test("all 23 sort fields are unique and sorting never mutates map input order", () => {
  assert.equal(new Set(sortFields.map(f=>f.key)).size,23);
  const original=areas.map(a=>a.id);
  for(const {key} of sortFields) for(const dir of ["asc","desc"] as const) {
    assert.equal(sortRestAreas(areas,key,dir).length,3);
    assert.deepEqual(areas.map(a=>a.id),original);
  }
  for (const { key } of sortFields) {
    if (key === "id") {
      assert.deepEqual(sortRestAreas(areas, key, "asc").map(a => a.id), [1, 2, 3]);
      assert.deepEqual(sortRestAreas(areas, key, "desc").map(a => a.id), [3, 2, 1]);
      continue;
    }
    const make = (id: number, rank: "low" | "high" | "missing"): RestArea => {
      const record = { ...areas[0], id, facilities: { ...areas[0].facilities } };
      if (key.startsWith("has_"))
        record.facilities[key as FacilityKey] = rank === "missing" ? null : rank === "high";
      else {
        const text = scalarFields.find(field => field.key === key)!.kind === "text";
        Object.assign(record, {
          [key]: rank === "missing"
            ? key === "name" ? "값20" : null
            : text ? rank === "low" ? "값2" : "값10" : rank === "low" ? 0 : 10,
        });
      }
      return record;
    };
    const records = [make(1, "high"), make(2, "missing"), make(3, "low")];
    assert.deepEqual(sortRestAreas(records, key, "asc").map(a => a.id), [3, 1, 2], key);
    assert.deepEqual(sortRestAreas(records, key, "desc").map(a => a.id), key === "name" ? [2, 1, 3] : [1, 3, 2], key);
  }
});
