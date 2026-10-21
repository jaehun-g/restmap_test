"use client";
import {sharedClasses} from "@/lib/shared-classes";
import {IconButton, Button} from "@/components/ui/button";
import {Input} from "@/components/ui/field";
import {useMemo, useState} from "react";
import {directionOptions, routeOptions, selectableFacilities, type RestAreaFilters} from "@/lib/rest-area-filters";
import type {RestArea} from "@/lib/rest-areas";
import {
  stationServices as stationServiceDefinitions,
  type StationServiceKey,
} from "@/lib/gas-stations";
import Icon from "./icon";
export default function MobileFilterSheet({
  kind,
  areas,
  filters,
  stationServices,
  onChange,
  onStationServices,
  onClose,
}: {
  kind: "routes" | "directions" | "facilities" | "stationServices";
  areas: RestArea[];
  filters: RestAreaFilters;
  stationServices: StationServiceKey[];
  onChange: (filters: RestAreaFilters) => void;
  onStationServices: (services: StationServiceKey[]) => void;
  onClose: () => void;
}) {
  const [routeQuery, setRouteQuery] = useState("");
  const options = useMemo(() => routeOptions(areas), [areas]);
  const found = options.filter(({name}) =>
    name.toLocaleLowerCase("ko-KR").includes(routeQuery.trim().toLocaleLowerCase("ko-KR")),
  );
  return (
    <>
      <div className={sharedClasses.sheetListHeading}>
        <div>
          <h2>
            {kind === "routes"
              ? "노선 선택"
              : kind === "facilities"
                ? "편의시설 선택"
                : kind === "directions"
                  ? "방향 선택"
                  : "주유소 조건"}
          </h2>
          <p>
            {kind === "routes"
              ? "원하는 노선을 검색하거나 선택하세요."
              : kind === "facilities"
                ? "선택한 시설을 모두 갖춘 휴게소를 보여드려요."
                : kind === "directions"
                  ? "선택한 노선에서 진행 방향을 골라 보세요."
                  : "선택한 조건이 모두 확인된 주유소를 보여드려요."}
          </p>
        </div>
        <IconButton aria-label="필터 선택창 닫기" onClick={onClose}>
          <Icon name="close" />
        </IconButton>
      </div>
      {kind === "routes" ? (
        <>
          <div className="sheet-route-search p-[5px_20px_10px] shrink-0">
            <div className={sharedClasses.searchBox}>
              <Icon name="search" size={17} />
              <Input
                type="search"
                aria-label="선택할 노선 검색"
                placeholder="노선명 검색"
                value={routeQuery}
                onChange={event => setRouteQuery(event.target.value)}
                variant="search"
              />
            </div>
          </div>
          <div className={sharedClasses.filterSheetScroll}>
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
                      direction: null,
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
                      direction: null,
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
              <p className="filter-empty p-[15px] text-center text-muted text-[12px]">
                일치하는 노선이 없습니다.
              </p>
            )}
          </div>
        </>
      ) : kind === "directions" ? (
        <div className={sharedClasses.filterSheetScroll}>
          <ul className="route-options">
            <li>
              <button
                className={filters.direction === null ? "selected" : ""}
                onClick={() => { onChange({...filters, direction: null}); onClose(); }}
              >
                <span>전체 방향</span>
                {filters.direction === null && <Icon name="check" size={18} />}
              </button>
            </li>
            {directionOptions(areas, filters.routeName).map(option => (
              <li key={option.key}>
                <button
                  className={filters.direction === option.key ? "selected" : ""}
                  onClick={() => { onChange({...filters, direction: option.key}); onClose(); }}
                >
                  <span>{option.label}</span>
                  {filters.direction === option.key && <Icon name="check" size={18} />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : kind === "facilities" ? (
        <>
          <div className={sharedClasses.facilitySheetTop}>
            <span>{filters.facilities.length}개 선택</span>
            <button
              onClick={() => onChange({...filters, facilities: []})}
              disabled={!filters.facilities.length}
            >
              전체 해제
            </button>
          </div>
          <div className={sharedClasses.filterSheetScroll}>
            <div className={sharedClasses.facilityCheckboxes}>
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
          <div className={sharedClasses.sheetFilterFooter}>
            <Button onClick={onClose} variant="primary">
              선택 완료
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className={sharedClasses.facilitySheetTop}>
            <span>{stationServices.length}개 선택</span>
            <button onClick={() => onStationServices([])} disabled={!stationServices.length}>
              전체 해제
            </button>
          </div>
          <div className={sharedClasses.filterSheetScroll}>
            <div className={sharedClasses.facilityCheckboxes}>
              {stationServiceDefinitions.map(({key, label}) => (
                <label key={key} className={stationServices.includes(key) ? "selected" : ""}>
                  <input
                    type="checkbox"
                    checked={stationServices.includes(key)}
                    onChange={event =>
                      onStationServices(
                        event.target.checked
                          ? [...stationServices, key]
                          : stationServices.filter(value => value !== key),
                      )
                    }
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className={sharedClasses.sheetFilterFooter}>
            <Button onClick={onClose} variant="primary">
              선택 완료
            </Button>
          </div>
        </>
      )}
    </>
  );
}
