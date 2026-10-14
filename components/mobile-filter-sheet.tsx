"use client";
import {useMemo, useState} from "react";
import {routeOptions, selectableFacilities, type RestAreaFilters} from "@/lib/rest-area-filters";
import type {RestArea} from "@/lib/rest-areas";
import Icon from "./icon";

export default function MobileFilterSheet({
  kind,
  areas,
  filters,
  onChange,
  onClose,
}: {
  kind: "routes" | "facilities";
  areas: RestArea[];
  filters: RestAreaFilters;
  onChange: (filters: RestAreaFilters) => void;
  onClose: () => void;
}) {
  const [routeQuery, setRouteQuery] = useState("");
  const options = useMemo(() => routeOptions(areas), [areas]);
  const found = options.filter(({name}) =>
    name.toLocaleLowerCase("ko-KR").includes(routeQuery.trim().toLocaleLowerCase("ko-KR")),
  );
  return (
    <>
      <div className="sheet-list-heading">
        <div>
          <h2>{kind === "routes" ? "노선 선택" : "편의시설 선택"}</h2>
          <p>
            {kind === "routes"
              ? "원하는 노선을 검색하거나 선택하세요."
              : "선택한 시설을 모두 갖춘 휴게소를 보여드려요."}
          </p>
        </div>
        <button className="icon-button" aria-label="필터 선택창 닫기" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      {kind === "routes" ? (
        <>
          <div className="sheet-route-search">
            <div className="search-box">
              <Icon name="search" size={17} />
              <input
                type="search"
                aria-label="선택할 노선 검색"
                placeholder="노선명 검색"
                value={routeQuery}
                onChange={event => setRouteQuery(event.target.value)}
              />
            </div>
          </div>
          <div className="filter-sheet-scroll">
            <ul className="route-options">
              <li>
                <button
                  className={filters.routeName === null ? "selected" : ""}
                  aria-pressed={filters.routeName === null}
                  onClick={() => {
                    onChange({
                      ...filters,
                      routeName: null,
                      missingRoute: false,
                    });
                    onClose();
                  }}
                >
                  <span>전체 노선</span>
                  {filters.routeName === null && <Icon name="check" size={18} />}
                </button>
              </li>
              {found.map(({name, count}) => (
                <li key={name}>
                  <button
                    className={filters.routeName === name ? "selected" : ""}
                    aria-pressed={filters.routeName === name}
                    onClick={() => {
                      onChange({
                        ...filters,
                        routeName: name,
                        missingRoute: false,
                      });
                      onClose();
                    }}
                  >
                    <span>
                      {name}
                      <small>{count}개 · 전체 데이터 기준</small>
                    </span>
                    {filters.routeName === name && <Icon name="check" size={18} />}
                  </button>
                </li>
              ))}
            </ul>
            {!found.length && routeQuery && (
              <p className="filter-empty">일치하는 노선이 없습니다.</p>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="facility-sheet-top">
            <span>{filters.facilities.length}개 선택</span>
            <button
              onClick={() => onChange({...filters, facilities: []})}
              disabled={!filters.facilities.length}
            >
              전체 해제
            </button>
          </div>
          <div className="filter-sheet-scroll">
            <div className="facility-checkboxes">
              {selectableFacilities.map(([key, label]) => (
                <label key={key} className={filters.facilities.includes(key) ? "selected" : ""}>
                  <input
                    type="checkbox"
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
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="sheet-filter-footer">
            <button className="button primary" onClick={onClose}>
              선택 완료
            </button>
          </div>
        </>
      )}
    </>
  );
}
