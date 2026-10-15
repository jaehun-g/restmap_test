"use client";
import {Select} from "@/components/ui/field";
import {Button} from "@/components/ui/button";
import {facilityDefinitions, type RestArea} from "@/lib/rest-areas";
import {
  routeOptions,
  selectableFacilities,
  type LoungeFilter,
  type RestAreaFilters,
} from "@/lib/rest-area-filters";
import type {useSearchQuery} from "@/hooks/use-search-query";
import {stationServices, type StationServiceKey} from "@/lib/gas-stations";
import SearchBox from "./search-box";
import Icon from "./icon";
export default function AdminFilterBar({
  areas,
  filters,
  onChange,
  search,
  onReset,
  disabled,
  includeStations = false,
  hideRestFilters = false,
  stationFilters = [],
  onStationFilters,
}: {
  areas: RestArea[];
  filters: RestAreaFilters;
  onChange: (filters: RestAreaFilters) => void;
  search: ReturnType<typeof useSearchQuery>;
  onReset: () => void;
  disabled: boolean;
  includeStations?: boolean;
  hideRestFilters?: boolean;
  stationFilters?: StationServiceKey[];
  onStationFilters?: (filters: StationServiceKey[]) => void;
}) {
  const routeValue = filters.missingRoute
    ? "missing"
    : filters.routeName
      ? `route:${filters.routeName}`
      : "all";
  return (
    <section
      className="admin-filter-bar mb-[16px] p-[13px_15px_9px] bg-white [border:1px_solid_#e2e8f0] rounded-[10px]"
      aria-label={includeStations ? "휴게소·주유소 검색·필터" : "휴게소 검색·필터"}
    >
      <div className="admin-filter-controls flex items-end gap-[10px] flex-wrap">
        <SearchBox search={search} disabled={disabled} includeStations={includeStations} />
        <label className="filter-select flex flex-col text-[9px] text-[#94a1b3] gap-[3px]">
          노선
          <Select
            aria-label="노선 필터"
            value={routeValue}
            disabled={disabled}
            onChange={event =>
              onChange({
                ...filters,
                routeName: event.target.value.startsWith("route:")
                  ? event.target.value.slice(6)
                  : null,
                missingRoute: event.target.value === "missing",
              })
            }
          >
            <option value="all">전체 노선</option>
            {!hideRestFilters && <option value="missing">휴게소 노선 미등록</option>}
            {routeOptions(areas).map(({name}) => (
              <option key={name} value={`route:${name}`}>
                {name}
              </option>
            ))}
          </Select>
        </label>
        {!hideRestFilters && (
          <details className="facility-picker relative">
            <summary
              onClick={event => {
                if (disabled) event.preventDefault();
              }}
            >
              휴게소 편의시설{" "}
              {filters.facilities.length ? `(${filters.facilities.length})` : "전체"} ▾
            </summary>
            <div className="facility-picker-options absolute z-[10] top-[42px] left-[0] w-[230px] grid grid-cols-[1fr_1fr] gap-[12px_8px] p-[15px] [border:1px_solid_#dde6f2] rounded-[9px] bg-white [box-shadow:0_4px_18px_#23416a1c]">
              <p>선택한 시설을 모두 포함</p>
              {selectableFacilities.map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={filters.facilities.includes(key)}
                    onChange={event =>
                      onChange({
                        ...filters,
                        facilities: event.target.checked
                          ? [...filters.facilities, key]
                          : filters.facilities.filter(value => value !== key),
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </details>
        )}
        {includeStations && onStationFilters && (
          <details className="facility-picker station-service-picker relative">
            <summary
              onClick={event => {
                if (disabled) event.preventDefault();
              }}
            >
              주유소 조건 {stationFilters.length ? `(${stationFilters.length})` : "전체"} ▾
            </summary>
            <div className="facility-picker-options absolute z-[10] top-[42px] left-[0] w-[230px] grid grid-cols-[1fr_1fr] gap-[12px_8px] p-[15px] [border:1px_solid_#dde6f2] rounded-[9px] bg-white [box-shadow:0_4px_18px_#23416a1c]">
              <p>선택한 조건을 모두 포함</p>
              {stationServices.map(({key, label}) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={stationFilters.includes(key)}
                    onChange={event =>
                      onStationFilters(
                        event.target.checked
                          ? [...stationFilters, key]
                          : stationFilters.filter(value => value !== key),
                      )
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </details>
        )}
        {!hideRestFilters && (
          <label className="filter-select flex flex-col text-[9px] text-[#94a1b3] gap-[3px]">
            휴게소 라운지
            <Select
              aria-label="화물차 라운지 필터"
              value={filters.lounge}
              disabled={disabled}
              onChange={event =>
                onChange({
                  ...filters,
                  lounge: event.target.value as LoungeFilter,
                })
              }
            >
              <option value="all">전체</option>
              <option value="present">있음</option>
              <option value="absent">없음</option>
              <option value="unknown">미확인</option>
            </Select>
          </label>
        )}
        <Button disabled={disabled} onClick={onReset} variant="secondary">
          필터 초기화
        </Button>
      </div>
      <div
        className="active-filter-tags flex flex-wrap gap-[6px] items-center pt-[10px] min-h-[32px]"
        aria-label="적용 조건"
      >
        {search.query && (
          <button disabled={disabled} onClick={() => search.clear()}>
            검색: {search.query}
            <Icon name="close" size={12} />
          </button>
        )}
        {(filters.routeName || filters.missingRoute) && (
          <button
            disabled={disabled}
            onClick={() => onChange({...filters, routeName: null, missingRoute: false})}
          >
            {filters.routeName || "노선 미등록"}
            <Icon name="close" size={12} />
          </button>
        )}
        {filters.facilities.map(key => (
          <button
            key={key}
            disabled={disabled}
            onClick={() =>
              onChange({
                ...filters,
                facilities: filters.facilities.filter(value => value !== key),
              })
            }
          >
            {facilityDefinitions.find(([value]) => value === key)?.[1]}
            <Icon name="close" size={12} />
          </button>
        ))}
        {filters.lounge !== "all" && (
          <button disabled={disabled} onClick={() => onChange({...filters, lounge: "all"})}>
            라운지{" "}
            {filters.lounge === "present"
              ? "있음"
              : filters.lounge === "absent"
                ? "없음"
                : "미확인"}
            <Icon name="close" size={12} />
          </button>
        )}
        {includeStations &&
          stationFilters.map(key => (
            <button
              key={key}
              disabled={disabled}
              onClick={() => onStationFilters?.(stationFilters.filter(value => value !== key))}
            >
              {stationServices.find(service => service.key === key)?.label}
              <Icon name="close" size={12} />
            </button>
          ))}
        {!search.query &&
          !filters.routeName &&
          !filters.missingRoute &&
          !filters.facilities.length &&
          filters.lounge === "all" &&
          !(includeStations && stationFilters.length) && (
            <span>{includeStations ? "모든 장소 표시" : "모든 휴게소 표시"}</span>
          )}
        {disabled && <span>수정 중에는 저장 또는 취소 후 조건을 변경할 수 있습니다.</span>}
      </div>
    </section>
  );
}
