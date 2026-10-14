"use client";
import { facilityDefinitions, type RestArea } from "@/lib/rest-areas";
import {
  routeOptions,
  selectableFacilities,
  type LoungeFilter,
  type RestAreaFilters,
} from "@/lib/rest-area-filters";
import type { useSearchQuery } from "@/hooks/use-search-query";
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
}: {
  areas: RestArea[];
  filters: RestAreaFilters;
  onChange: (filters: RestAreaFilters) => void;
  search: ReturnType<typeof useSearchQuery>;
  onReset: () => void;
  disabled: boolean;
  includeStations?: boolean;
  hideRestFilters?: boolean;
}) {
  const routeValue = filters.missingRoute
    ? "missing"
    : filters.routeName
      ? `route:${filters.routeName}`
      : "all";
  return (
    <section className="admin-filter-bar" aria-label="휴게소 검색·필터">
      <div className="admin-filter-controls">
        <SearchBox search={search} disabled={disabled} includeStations={includeStations} />
        <label className="filter-select">
          노선
          <select
            aria-label="노선 필터"
            value={routeValue}
            disabled={disabled}
            onChange={(event) =>
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
            {routeOptions(areas).map(({ name }) => (
              <option key={name} value={`route:${name}`}>
                {name}
              </option>
            ))}
          </select>
        </label>
        {!hideRestFilters && (
          <details className="facility-picker">
            <summary
              onClick={(event) => {
                if (disabled) event.preventDefault();
              }}
            >
              휴게소 편의시설{" "}
              {filters.facilities.length ? `(${filters.facilities.length})` : "전체"} ▾
            </summary>
            <div className="facility-picker-options">
              <p>선택한 시설을 모두 포함</p>
              {selectableFacilities.map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={filters.facilities.includes(key)}
                    onChange={(event) =>
                      onChange({
                        ...filters,
                        facilities: event.target.checked
                          ? [...filters.facilities, key]
                          : filters.facilities.filter((value) => value !== key),
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </details>
        )}
        {!hideRestFilters && (
          <label className="filter-select">
            휴게소 라운지
            <select
              aria-label="화물차 라운지 필터"
              value={filters.lounge}
              disabled={disabled}
              onChange={(event) =>
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
            </select>
          </label>
        )}
        <button className="button secondary" disabled={disabled} onClick={onReset}>
          필터 초기화
        </button>
      </div>
      <div className="active-filter-tags" aria-label="적용 조건">
        {search.query && (
          <button disabled={disabled} onClick={() => search.clear()}>
            검색: {search.query}
            <Icon name="close" size={12} />
          </button>
        )}
        {(filters.routeName || filters.missingRoute) && (
          <button
            disabled={disabled}
            onClick={() => onChange({ ...filters, routeName: null, missingRoute: false })}
          >
            {filters.routeName || "노선 미등록"}
            <Icon name="close" size={12} />
          </button>
        )}
        {filters.facilities.map((key) => (
          <button
            key={key}
            disabled={disabled}
            onClick={() =>
              onChange({
                ...filters,
                facilities: filters.facilities.filter((value) => value !== key),
              })
            }
          >
            {facilityDefinitions.find(([value]) => value === key)?.[1]}
            <Icon name="close" size={12} />
          </button>
        ))}
        {filters.lounge !== "all" && (
          <button disabled={disabled} onClick={() => onChange({ ...filters, lounge: "all" })}>
            라운지{" "}
            {filters.lounge === "present"
              ? "있음"
              : filters.lounge === "absent"
                ? "없음"
                : "미확인"}
            <Icon name="close" size={12} />
          </button>
        )}
        {!search.query &&
          !filters.routeName &&
          !filters.missingRoute &&
          !filters.facilities.length &&
          filters.lounge === "all" && <span>모든 휴게소 표시</span>}
        {disabled && <span>수정 중에는 저장 또는 취소 후 조건을 변경할 수 있습니다.</span>}
      </div>
    </section>
  );
}
