# DB 테이블별 데이터 출처와 결합 기준

2026-11-16 기준 저장소 코드와 설정된 Supabase PostgreSQL의 `public` 스키마를 읽기 전용으로 확인했다. DB 조회 대상은 테이블 구조·제약조건과 음식 수상 출처의 집계이며, 실제 서비스 배포 환경의 설정이나 각 행의 전체 변경 이력까지 확인한 것은 아니다. 테이블과 값은 이후 변경될 수 있다.

## 테이블 한눈에 보기

| 테이블 | 역할 | 주요 원천 | 식별·결합 기준 |
|---|---|---|---|
| `tb_lounge` | 휴게소 기본정보·시설·주차 | 기존 휴게소 CSV, 한국도로공사 API, 주차장 CSV, 카카오 검색, 관리자 확인 | `lg_id`, 표준 휴게소 코드 `lg_std_rest_cd`, 서비스 시설 코드 `lg_service_area_code` |
| `tb_ex_station_geocodes` | 도로공사 EX 주유소·가격·좌표 | 한국도로공사 주유소 현황 API, 카카오 검색, 검증된 수동 보정 | `ex_id`; 원천 복합키 `ex_source_key` |
| `tb_ex_station_geocode_overrides` | EX 주유소의 수동 검색 주소 | 수동 검증 주소 목록 | `eo_source_key` = `ex_source_key` |
| `tb_gscargo` | GS 주유소 정보 | 기존 GS칼텍스 주유소 JSON에서 적재된 데이터 | `gs_id`; 원천 식별자 `gs_sitecd` |
| `tb_highway_routes` | 고속도로 노선 선형·경계 | 기존 DB 선형 및 별도 제공 GeoJSON | `hr_route_name`과 정규화된 노선명 |
| `tb_food_area_mappings` | 음식 API 휴게소 코드와 DB 휴게소 연결 | 음식 API와 `tb_lounge` | `am_std_rest_cd`; `am_rest_area_id` → `lg_id` |
| `tb_food_menus` | 휴게소 메뉴·가격·추천 여부 | 한국도로공사 음식정보 API | `fm_source_key` = `stdRestCd\|seq`; `fm_std_rest_cd` → `am_std_rest_cd` |
| `tb_food_menu_sync_runs` | 음식 동기화 실행 결과 | 동기화 작업이 생성하는 운영 기록 | `sr_id`; 특정 메뉴·휴게소와 직접 결합하지 않음 |
| `tb_food_awards` | 휴게소 음식 수상 정보 | DB 각 행의 `fa_source_url`에 기록된 기사·자료 | `fa_id`; `fa_rest_area_id` → `lg_id`, `fa_food_menu_source_key` → `fm_source_key` |

`→`는 DB에서 확인한 외래키다. 같은 이름이나 값으로 비교하는 다른 관계는 애플리케이션의 매칭 규칙이며 외래키로 보장되는 관계가 아니다. 수상 테이블을 제외하면 위 DB 테이블의 접두어와 컬럼명은 [DB 컬럼 매핑](../scripts/db-columns.mjs)과 실제 스키마를 기준으로 했다.

## 휴게소: `tb_lounge`

### 원천과 저장 항목

| 원천 | 주로 사용하는 항목 | 설명 |
|---|---|---|
| 기존 휴게소·화물차 라운지 통합 CSV | `lg_name`, `lg_route_name`, `lg_direction_label`, `lg_phone`, `lg_parking_count`, `lg_has_*` | 기존 행과 식별자를 유지하며 CSV 값을 결합한다. CSV의 최초 생성 경로와 개별 값별 출처는 현재 저장소만으로 모두 확인되지 않는다. |
| 한국도로공사 [`locationinfoRest`](https://data.ex.co.kr/openapi/locationinfo/locationinfoRest) | `lg_std_rest_cd`, `lg_service_area_code`, 이름·노선·위도·경도 | 휴게소 기준정보. 원천 `stdRestCd`, `serviceAreaCode`, `unitName`, `routeName`, `routeNo`, `yValue`, `xValue` 등을 사용한다. |
| 한국도로공사 [`restConvList`](https://data.ex.co.kr/openapi/restinfo/restConvList) | `lg_has_*`, 이름·노선·주소 보완 | `stdRestCd`별 편의시설 상세의 `psName` 등을 사용한다. |
| 한국도로공사 [`conveniServiceArea`](https://data.ex.co.kr/openapi/business/conveniServiceArea) | 전화·노선·방향과 `lg_has_*` 보완 | `serviceAreaCode2`, `serviceAreaCode`, `telNo`, `direction`, `convenience`, `truckSaYn`, `maintenanceYn` 등을 사용한다. |
| 한국도로공사 [휴게소 주차장 현황 CSV](https://www.data.go.kr/data/15043716/fileData.do) | `lg_large_parking_count` | CSV의 `대형` 값을 기존 휴게소에 연결했다. [작업 결과](rest-area/parking-large-spaces.md)는 2026-11-13의 일회성 반영 결과다. |
| 카카오 [주소 검색](https://dapi.kakao.com/v2/local/search/address.json)·[키워드 검색](https://dapi.kakao.com/v2/local/search/keyword.json) | `lg_latitude`, `lg_longitude` 보완 | 기준정보 좌표가 없을 때 주소·장소명·방향을 검증해 좌표를 찾는다. |
| 관리자 입력·검증된 보정 | 운영 상태, 이름·방향 등 | `lg_operation_*` 및 일부 확인된 방향·명칭은 별도 관리·보정된다. 각 행 전체의 실제 출처가 모두 기록된 것은 아니다. |

### 원천 간 결합

1. 기준정보 `locationinfoRest.stdRestCd`와 시설 상세 `restConvList.stdRestCd`를 표준 휴게소 코드로 묶는다. 요약 `conveniServiceArea.serviceAreaCode2`를 같은 표준 코드로 사용하며, 없으면 기준정보 `serviceAreaCode`와 요약의 `serviceAreaCode`를 연결해 찾는다. 두 코드가 충돌하면 중단한다.
2. 통합한 API 행을 기존 `tb_lounge`에 연결할 때 `lg_std_rest_cd` 또는 `lg_service_area_code` 일치를 우선한다. 코드가 없으면 정규화한 이름과 방향, 그리고 노선 또는 전화번호를 비교한다. 방향이 없는 경우 코드의 호환성 조건에 따라 후보가 허용될 수 있다. 이름이 바뀐 경우 전화번호·노선·방향 호환과 좌표 200m 미만 조건으로 보완한다. 복수 후보는 검토 대상으로 남긴다.
3. CSV와 기존 DB는 표시 이름으로 먼저 비교하고, 이름 후보가 없으면 전화번호·방향·200m 미만 좌표로 보완한다. DB의 기존 값을 우선하고 빈 값을 보완한다. API 시설 목록에 없다는 이유만으로 시설이 없다고 확정하지 않는다.
4. **대형 주차 CSV는 별도 기준**이다. CSV `휴게소명`과 괄호의 방향을 DB `lg_name`, `lg_direction_label` 또는 `lg_route_direction`과 비교해 유일한 후보에 연결했다. 노선 표기가 달라도 기존 DB 노선은 유지했다. CSV에 방향이 없을 때는 단일 양방향 후보를 사용했고, 밀양영남루는 별도 근거로 확인했다. 이 기준을 모든 API의 연결 규칙으로 일반화하면 안 된다.

이름 비교는 괄호 내용·`휴게소`/`주유소`/`충전소`·공백을 제거하고, 방향 비교는 공백·`방향`을 정리하며 `양방향`과 `통합방향`을 동일하게 취급한다. 코드와 예외는 [휴게소 통합 로직](../lib/rest-area-integration.ts), [시설 매칭](../lib/facility-places.ts), [통합 동기화 안내](rest-area/rest-area-sync.md)에 있다.

## EX 주유소: `tb_ex_station_geocodes`

원천은 한국도로공사 [주유소 현황 API `curStateStation`](https://data.ex.co.kr/openapi/business/curStateStation)이다. `serviceAreaName`, `routeName`, `direction`, `oilCompany`, `location`/`svarAddr`, `telNo`, `lpgYn`, 유종별 가격을 각각 `ex_service_area_name`, `ex_route_name`, `ex_direction`, `ex_oil_company`, `ex_source_location`, `ex_tel_no`, `ex_lpg_available`, 가격 컬럼에 적재한다. 일부 이름·노선·방향·좌표는 검증된 보정값을 적용한다.

- 원천 키는 `routeCode|serviceAreaCode|direction|oilCompany`로 만들고 누락된 선택 항목은 `-`로 표시한다. 이 값이 `ex_source_key`이며 전체 동기화의 upsert와 가격 갱신의 일치 기준이다. `ex_service_area_code` 하나만으로는 주유소 행의 전체 식별자가 아니다.
- 가격 전용 동기화도 원천 복합키와 `ex_source_key`가 같은 기존 행만 갱신한다. 원천 코드가 바뀌면 이전 행과 자동으로 같은 행이라고 보장되지 않는다.
- 좌표는 검증된 좌표 또는 캐시된 좌표를 우선 활용하고, 원천 주소·수동 검색 주소를 카카오 주소 검색 및 조건에 맞는 키워드 검색으로 확인한다. 좌표·주소와 상태는 `ex_latitude`, `ex_longitude`, `ex_kakao_*`, `ex_geocode_status`에 저장한다.

코드: [원천 파싱과 키](../lib/ex-station-status.ts), [전체 동기화](../lib/ex-station-sync.ts), [가격 동기화](../lib/ex-station-price-sync.ts).

### 수동 주소: `tb_ex_station_geocode_overrides`

`eo_source_key`는 기본키이고 `eo_search_address`는 수동으로 확인한 검색 주소다. 활성화된 `eo_enabled` 행을 `eo_source_key = ex_source_key`로 찾아 좌표 검색에 사용한다. 기본 자료는 [수동 주소 목록](../data/ex-station-geocode-overrides.json)과 관리자의 DB 보정이며, 테이블 간 외래키는 확인되지 않았다. [주소 등록 스크립트](../scripts/upsert-ex-station-geocode-overrides.mjs)가 원천 키 기준으로 upsert한다.

### 휴게소와 EX 주유소의 화면상 결합

`tb_lounge`와 `tb_ex_station_geocodes` 사이에 저장된 외래키를 사용하는 방식이 아니다. [시설 결합 로직](../lib/facility-places.ts)이 조회한 EX 주유소만 대상으로 다음 순서로 연결을 계산한다.

1. `lg_route_name`과 `ex_route_name`을 노선 별칭 적용 후 비교한다.
2. 일반 후보는 `lg_name`과 `ex_service_area_name`의 정규화된 이름이 같아야 한다. `lg_direction_label`(없으면 `lg_route_direction`)과 `ex_direction`을 정규화해 비교한다. 양방향 휴게소는 양쪽 방향 주유소를 허용한다. 방향 필드로 연결되지 않으면 주유소 이름 괄호의 방향을 보조 기준으로 쓴다.
3. 두 좌표가 유효하고 직선거리가 **300m 이하**여야 한다. 후보가 여러 개면 방향 필드 일치를 우선한 뒤 더 가까운 휴게소를 선택하며, 거리 동률은 휴게소 원본 순서를 따른다. 주유소 한 곳은 최대 하나의 휴게소에 연결된다.
4. [검증된 연결 예외](../lib/verified-rest-area-stations.ts)는 `ex_source_key`와 휴게소 ID 또는 정해진 이름·노선으로 확인한 사례다. 예외에도 노선과 좌표·거리 조건은 적용된다.

이는 앱에서 계산하는 연결이므로 DB에서 `lg_id = ex_service_area_code`처럼 단순 조인하면 안 된다.

## GS 주유소: `tb_gscargo`

기존 GS칼텍스 주유소 JSON의 `siteList`가 원천으로 기록돼 있다. 과거 적재 스크립트는 `siteCd`, `siteNm`, 주소, `lat`/`longi`, 편의시설·운영시간 등을 사용해 주유소를 식별했다. 현재 DB의 대응 컬럼은 `gs_sitecd`, `gs_sitenm`, `gs_lat`, `gs_longi` 등이며 내부 기본키는 `gs_id`다. [과거 GS 적재 스크립트](../scripts/import-gscargo.mjs)는 현재 Supabase 환경에서 실행이 비활성화돼 있으므로 현재 자동 갱신 경로로 간주하지 않는다.

애플리케이션은 조건에 따라 GS와 EX 주유소를 각각 조회해 결과 목록에 합친다. GS와 EX의 동일 시설을 식별해 자동 결합하는 외래키 또는 검증된 통합 키는 확인되지 않았다. `tb_lounge`와의 위 EX 전용 결합에도 GS는 포함되지 않는다.

## 고속도로 선형: `tb_highway_routes`

노선명 `hr_route_name`, 노선 번호 `hr_route_number`, 선형 `hr_path_coordinates`, 경계 `hr_sw_lat`·`hr_sw_lng`·`hr_ne_lat`·`hr_ne_lng`를 보관한다. 사용자가 제공한 GeoJSON `LineString`/`MultiLineString`을 변환하여 기존 노선명의 유일한 행에 반영하는 [가져오기 스크립트](../scripts/import-highway-route.mjs)가 있다. 기존 선형 전체의 최초 출처·라이선스·변환 이력은 확인되지 않은 항목이 있다.

화면은 선택한 노선명에 [노선 별칭](../lib/highway-route-name.ts)을 적용해 `hr_route_name`을 조회한다. 휴게소·주유소의 노선명도 같은 별칭 함수를 이용해 비교하고, 노선 주변 검색은 해당 선형과 좌표의 근접성을 사용한다. 테이블 간 노선 외래키는 확인되지 않았다. [선형 미해결 사항](unresolved.md)을 참고한다.

## 음식: `tb_food_area_mappings`와 `tb_food_menus`

원천은 한국도로공사 [휴게소 음식정보 API `restBestfoodList`](https://data.ex.co.kr/openapi/restinfo/restBestfoodList)다. `stdRestCd`, `seq`, `stdRestNm`, `routeNm`, `foodNm`, `foodCost`, `recommendyn`, `bestfoodyn`, `app` 등을 사용한다.

1. API `stdRestCd`별로 메뉴를 묶어 `tb_food_area_mappings.am_std_rest_cd`를 만든다. DB `lg_std_rest_cd`가 같으면 코드 일치를 우선한다.
2. 같은 표준 코드가 없다면 **DB 표준 코드가 비어 있는 행만** 대상으로 정규화한 이름·노선을 비교한다. API 이름에 괄호 방향이 있으면 DB 방향도 일치해야 하며, 방향이 없으면 이름·노선 후보가 유일할 때만 연결한다. 후보가 여러 개이거나 API 그룹의 식별 정보가 충돌하면 보류한다. 이미 다른 코드가 지정된 DB 행은 보조 매칭하지 않는다.
3. 연결된 내부 휴게소 ID는 `am_rest_area_id`에 저장되고 `tb_lounge.lg_id`를 참조한다. 여러 API 코드가 같은 DB 행에 자동 매칭되면 중복으로 보류하며 기존 수동 매핑은 동기화 시 유지한다.
4. 메뉴의 기본키 `fm_source_key`는 문자열 `stdRestCd|seq`다. `fm_std_rest_cd`는 `am_std_rest_cd`를 참조한다. `fm_food_nm`, `fm_food_cost`, `fm_recommendyn`, `fm_bestfoodyn`에 음식 정보를 저장한다.
5. 화면 조회는 `tb_food_menus.fm_std_rest_cd = tb_food_area_mappings.am_std_rest_cd`로 조인하고 `am_rest_area_id = lg_id`, `am_match_status = 'matched'`, `fm_source_present = true`, `fm_app_visible = true` 조건으로 메뉴를 고른다. `fm_rest_cd`와 `am_rest_cd`는 보관하지만 이 조인 키는 아니다.

코드: [메뉴 파싱](../lib/food-menu-source.ts), [휴게소 매칭](../lib/food-menu-matching.ts), [동기화](../lib/food-menu-sync.ts), [메뉴 조회](../lib/db.ts), [운영 설명](food/food-menu-sync.md).

## 음식 동기화 기록: `tb_food_menu_sync_runs`

메뉴 동기화가 `sr_id`별로 실행 상태 `sr_status`, 시작·완료 시각, 원천 수·매칭 수·오류 코드를 생성한다. 외부 API에서 제공한 원본 행이나 특정 휴게소·메뉴를 참조하는 외래키는 없다. 운영 내역을 보는 테이블이며 [동기화 로직](../lib/food-menu-sync.ts)에서 기록한다.

## 음식 수상: `tb_food_awards`

DB에서 `fa_id` 기본키와 `fa_rest_area_id → tb_lounge.lg_id`, `fa_food_menu_source_key → tb_food_menus.fm_source_key` 외래키를 확인했다. 메뉴 연결은 비어 있을 수 있다. `fa_event_year`, `fa_category`, `fa_award_name`, `fa_awarded_name`, `fa_source_url`, `fa_image_url`은 수상 내역과 출처·이미지를 나타낸다.

DB에 기록된 출처는 2024년 자료의 [한국도로공사 게시글](https://ex.co.kr/portal/biz/bbs/layout1/selectBoardArticle.do?authFlag=Y&bbsAttrbCode=BBSA06&bbsId=BBSMSTR_000000000183&bbsTyCode=BBST01&nttId=27472&pageIndex=1)과 2025년 [휴게소 음식 페스타 기사](https://www.yna.co.kr/view/AKR20250715136800053)다. 2024년 게시글은 이번 확인에서 연결 시간 초과로 본문을 열지 못했다. 현재 저장소에서는 이 테이블의 적재·조회 코드와 행별 매칭 절차를 찾지 못했으므로, 수상명·메뉴명을 어떤 규칙으로 정규화해 연결했는지와 추가 원천의 존재는 확인되지 않았다. 위 링크는 DB에 기록된 출처이지 모든 필드의 최초 생성 이력을 입증하지 않는다.
