import {test} from "node:test";
import {strict as assert} from "node:assert";
import {selectMobileRestAreaColumns} from "../lib/rest-area-fields.ts";
import {selectMobileExStationColumns} from "../lib/ex-gas-stations.ts";

test("모바일 초기 휴게소 조회는 지도와 필터 컬럼을 유지하고 상세 컬럼을 제외한다", () => {
  for (const column of ["lg_id", "lg_name", "lg_latitude", "lg_longitude", "lg_route_name", "lg_has_truck_lounge", "lg_operation_status", "lg_large_parking_count"])
    assert.ok(selectMobileRestAreaColumns.includes(column), column);
  for (const column of ["lg_phone", "lg_parking_count", "lg_operation_note", "lg_operation_source"])
    assert.ok(!selectMobileRestAreaColumns.includes(column), column);
});

test("모바일 초기 주유소 조회는 주소 검색과 연결 컬럼을 유지하고 상세 컬럼을 제외한다", () => {
  for (const column of ["ex_id", "ex_source_key", "ex_service_area_name", "ex_latitude", "ex_longitude", "ex_route_name", "ex_direction", "ex_kakao_address_name", "ex_gasoline_price", "ex_diesel_price"])
    assert.ok(selectMobileExStationColumns.includes(column), column);
  for (const column of ["ex_tel_no", "ex_lpg_price", "ex_source_fetched_at"])
    assert.ok(!selectMobileExStationColumns.includes(column), column);
});
