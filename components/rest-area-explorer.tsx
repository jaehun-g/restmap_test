"use client";
import {sharedClasses} from "@/lib/shared-classes";
import {IconButton, Button} from "@/components/ui/button";
import {FilterChip} from "@/components/ui/filter-chip";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {useRestAreas} from "@/hooks/use-rest-areas";
import {useSearchQuery} from "@/hooks/use-search-query";
import {useMobileLocation} from "@/hooks/use-mobile-location";
import {useGasStations} from "@/hooks/use-gas-stations";
import {stationQueryString} from "@/lib/gas-station-query";
import {stationHours, stationKey, stationLabel, type StationServiceKey} from "@/lib/gas-stations";
import {restPlace, stationPlace, type PlaceView} from "@/lib/map-places";
import {directionOptions, initialFilters} from "@/lib/rest-area-filters";
import {filterFacilityPlaces} from "@/lib/facility-filters";
import {linkedStationsByArea} from "@/lib/facility-places";
import {areaDistance, formatDistance, scopeLabel} from "@/lib/geo-search";
import {cardDisplayArea} from "@/lib/map-card-layout";
import {facilityDefinitions, routeDescription} from "@/lib/rest-areas";
import KakaoMap from "./kakao-map";
import RestAreaDetails from "./rest-area-details";
import QueryState from "./query-state";
import SearchBox from "./search-box";
import MobileFilterSheet from "./mobile-filter-sheet";
import Icon from "./icon";
import PlaceControls from "./place-controls";
import GasStationDetails from "./gas-station-details";
type Panel = "collapsed" | "list" | "detail" | "routes" | "directions" | "facilities" | "stationServices";
export default function MobileExplorer() {
  const {data, areas, loading, error, reload} = useRestAreas();
  const location = useMobileLocation();
  const search = useSearchQuery();
  const [filters, setFilters] = useState(initialFilters);
  const [placeView, setPlaceView] = useState<PlaceView>("all");
  const [stationFilters, setStationFilters] = useState<StationServiceKey[]>([]);
  const gas = useGasStations(
    stationQueryString(filters.routeName, location.scope, "ex"),
  );
  const [panel, setPanel] = useState<Panel>("collapsed");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const summaryRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  const [viewportRevision, setViewportRevision] = useState(0);
  useEffect(() => {
    const header = headerRef.current;
    const shell = shellRef.current;
    if (!header || !shell) return;
    let signature = "";
    const measure = () => {
      shell.style.setProperty(
        "--mobile-header-height",
        `${header.getBoundingClientRect().height}px`,
      );
      const next = [
        header.getBoundingClientRect().bottom,
        sheetRef.current?.getBoundingClientRect().top,
        window.visualViewport?.height,
        window.visualViewport?.offsetTop,
        shell.getBoundingClientRect().width,
      ].join(":");
      if (next !== signature) {
        signature = next;
        setViewportRevision(value => value + 1);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    observer.observe(shell);
    if (sheetRef.current) observer.observe(sheetRef.current);
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
    };
  }, []);
  const cardViewport = useCallback((canvas: DOMRect) => {
    const screen = window.visualViewport;
    const area = cardDisplayArea(
      canvas,
      headerRef.current?.getBoundingClientRect().bottom ?? canvas.top,
      sheetRef.current?.getBoundingClientRect().top ?? canvas.bottom,
      screen
        ? {
            left: screen.offsetLeft,
            right: screen.offsetLeft + screen.width,
            top: screen.offsetTop,
            bottom: screen.offsetTop + screen.height,
            width: screen.width,
            height: screen.height,
          }
        : undefined,
    );
    return new DOMRect(area.left, area.top, area.width, area.height);
  }, []);
  const mergedFacilities = useMemo(
    () => filterFacilityPlaces(areas, gas.stations, {
      filters, query: search.query, stationServices: stationFilters,
      scope: location.scope, position: location.position,
    }),
    [areas, gas.stations, filters, search.query, stationFilters, location.scope, location.position],
  );
  const visibleAreas = mergedFacilities.facilities.map(({area}) => area);
  const stationResults = mergedFacilities.stations;
  const linkedStationsByRestId = useMemo(
    () => linkedStationsByArea(mergedFacilities.facilities, mergedFacilities.stations),
    [mergedFacilities.facilities, mergedFacilities.stations],
  );
  const selectedDirectionLabel = useMemo(
    () =>
      directionOptions(areas, filters.routeName).find(option => option.key === filters.direction)
        ?.label ?? filters.direction,
    [areas, filters.routeName, filters.direction],
  );
  const listPlaces = useMemo(() => {
    const places = [
      ...(placeView === "ex" ? [] : visibleAreas.map(restPlace)),
      ...(placeView === "rest" ? [] : stationResults.map(stationPlace)),
    ];
    if (location.position)
      places.sort((left, right) => {
        const a = areaDistance(left.record, location.position) ?? Infinity,
          b = areaDistance(right.record, location.position) ?? Infinity;
        return a === b ? left.key.localeCompare(right.key) : a - b;
      });
    return places;
  }, [visibleAreas, stationResults, location.position, placeView]);
  const selected = visibleAreas.find(area => area.id === selectedId);
  const selectedStation = stationResults.find(station => stationKey(station) === selectedStationId);
  const effectivePanel =
    panel === "detail" && !selected && !selectedStation && !loading && !gas.loading
      ? "list"
      : panel;
  const expanded = effectivePanel !== "collapsed";
  const resultCount = listPlaces.length;
  const select = useCallback((id: number | null) => {
    setSelectedStationId(null);
    setSelectedId(id);
    setPanel("collapsed");
  }, []);
  const details = useCallback((id: number) => {
    setSelectedStationId(null);
    setSelectedId(id);
    setPanel("detail");
  }, []);
  const collapse = useCallback(() => {
    setPanel("collapsed");
    setSelectedId(null);
    setSelectedStationId(null);
  }, []);
  const selectStation = useCallback((id: string | null) => {
    setSelectedId(null);
    setSelectedStationId(id);
    setPanel("collapsed");
  }, []);
  const stationDetails = useCallback((id: string) => {
    setSelectedId(null);
    setSelectedStationId(id);
    setPanel("detail");
  }, []);
  useEffect(() => {
    if (selectedStationId === null || selectedStation || gas.loading) return;
    let active = true;
    queueMicrotask(() => {
      if (active) setSelectedStationId(null);
    });
    return () => {
      active = false;
    };
  }, [selectedStationId, selectedStation, gas.loading]);
  useEffect(() => {
    if (loading || selectedId === null || selected) return;
    let active = true;
    queueMicrotask(() => {
      if (active) {
        setSelectedId(null);
        setPanel(current => (current === "detail" ? "list" : current));
      }
    });
    return () => {
      active = false;
    };
  }, [loading, selectedId, selected]);
  useEffect(() => {
    if (!expanded) {
      if (wasOpen.current)
        (returnFocus.current?.isConnected ? returnFocus.current : summaryRef.current)?.focus({
          preventScroll: true,
        });
      wasOpen.current = false;
      return;
    }
    wasOpen.current = true;
    panelRef.current?.focus({preventScroll: true});
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        collapse();
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [expanded, effectivePanel, selectedId, collapse]);
  const open = (next: Panel, element: HTMLElement) => {
    returnFocus.current = element;
    setSelectedId(null);
    setSelectedStationId(null);
    setPanel(next);
  };
  const reset = () => {
    search.clear(false);
    setFilters(initialFilters());
    setSelectedId(null);
    setSelectedStationId(null);
    setStationFilters([]);
    setPlaceView("all");
  };
  const clearRoute = useCallback(() => {
    setFilters(current => ({...current, routeName: null, direction: null}));
    setSelectedId(null);
    setSelectedStationId(null);
  }, []);
  return (
    <main
      className="mobile-shell relative w-full max-w-[480px] m-[0_auto] flex flex-col bg-white [box-shadow:0_0_28px_#24364a0c] overflow-hidden"
      ref={shellRef}
    >
      <header
        className="mobile-header absolute inset-[0_0_auto] bg-[transparent] pointer-events-none z-[4] p-[calc(10px_+_env(safe-area-inset-top,_0px))_18px_12px]"
        ref={headerRef}
      >
        <h1 className="sr-only absolute w-[1px] h-[1px] p-[0] m-[-1px] overflow-hidden [clip:rect(0,_0,_0,_0)] whitespace-nowrap [border:0]">
          휴게소·주유소 찾기
        </h1>
        <SearchBox search={search} includeStations />
        <PlaceControls
          view={placeView}
          onView={next => {
            setPlaceView(next);
            setSelectedId(null);
            setSelectedStationId(null);
            setPanel("collapsed");
          }}
        />
        <div className="mobile-filters flex items-center flex-nowrap gap-[6px] m-[8px_-18px_0] p-[2px_18px_6px] overflow-x-auto whitespace-nowrap [scrollbar-width:none] [scroll-padding:0_18px]">
          <FilterChip
            active={Boolean(filters.routeName)}
            onClick={event => open("routes", event.currentTarget)}
            aria-expanded={panel === "routes"}
            disabled={loading}
          >
            <span>{filters.routeName || "전체 노선"}</span>
            <Icon name="chevronUp" size={13} style={{transform: "rotate(180deg)"}} />
          </FilterChip>
          {filters.routeName && (
            <FilterChip
              active={filters.direction !== null}
              onClick={event => open("directions", event.currentTarget)}
              aria-expanded={panel === "directions"}
            >
              {selectedDirectionLabel ?? "전체 방향"}
              <Icon name="chevronUp" size={13} style={{transform: "rotate(180deg)"}} />
            </FilterChip>
          )}
          {placeView !== "ex" && (
            <FilterChip
              active={filters.facilities.length > 0}
              onClick={event => open("facilities", event.currentTarget)}
              aria-expanded={panel === "facilities"}
            >
              휴게소 편의시설
              {filters.facilities.length > 0 && <b>{filters.facilities.length}</b>}
              <Icon name="chevronUp" size={13} style={{transform: "rotate(180deg)"}} />
            </FilterChip>
          )}
          {placeView !== "rest" && (
            <FilterChip
              active={stationFilters.length > 0}
              onClick={event => open("stationServices", event.currentTarget)}
              aria-expanded={panel === "stationServices"}
            >
              주유소 조건
              {stationFilters.length > 0 && <b>{stationFilters.length}</b>}
              <Icon name="chevronUp" size={13} style={{transform: "rotate(180deg)"}} />
            </FilterChip>
          )}
          {placeView !== "ex" && (
            <FilterChip
              variant="lounge"
              active={filters.lounge === "present"}
              aria-pressed={filters.lounge === "present"}
              aria-label={
                filters.lounge === "present"
                  ? "라운지 ON: 라운지 있는 휴게소만 표시"
                  : "라운지 OFF: 전체 휴게소 표시"
              }
              onClick={() => {
                setFilters(current => ({
                  ...current,
                  lounge: current.lounge === "present" ? "all" : "present",
                }));
              }}
            >
              <Icon name="truck" size={14} />
              라운지 <b>{filters.lounge === "present" ? "ON" : "OFF"}</b>
            </FilterChip>
          )}
        </div>
        {filters.routeName && placeView === "ex" && (
          <p className="station-route-note text-[#526882] bg-[#f1f7f4] rounded-[8px] p-[10px] text-[11px] leading-[1.6] compact">
            주유소는 선택 노선 주변 2km · 직선거리 기준
          </p>
        )}
      </header>
      <div className="mobile-content flex-1 min-h-0 flex flex-col relative">
        <div className="mobile-map absolute inset-[0]">
          <KakaoMap
            areas={placeView === "ex" ? [] : visibleAreas}
            stations={placeView === "rest" ? [] : stationResults}
            linkedStationsByRestId={linkedStationsByRestId}
            selectedDirection={selectedDirectionLabel}
            selectedStationId={selectedStation ? stationKey(selectedStation) : null}
            onStationSelect={selectStation}
            onStationDetails={stationDetails}
            stationsLoading={gas.loading}
            stationError={gas.error}
            onRetryStations={() => {
              void gas.reload();
            }}
            selectedRouteName={filters.routeName}
            onClearRoute={clearRoute}
            selectedId={loading ? selectedId : (selected?.id ?? null)}
            onSelect={select}
            onDetails={details}
            audience="mobile"
            showCard
            dataVersion={data?.fetchedAt ?? gas.data?.fetchedAt}
            cardViewport={cardViewport}
            viewportVersion={`${effectivePanel}:${viewportRevision}`}
            mobileLocation={location}
          />
        </div>
        <section
          ref={sheetRef}
          className={`mobile-sheet absolute bottom-[0] w-full shrink-0 h-[calc(84px_+_env(safe-area-inset-bottom,_0px))] max-h-[max(120px,_calc(100%_-_var(--mobile-header-height,_150px)_-_230px))] flex flex-col [border-top:1px_solid_#e8edf4] rounded-[18px_18px_0_0] bg-white z-[4] [box-shadow:0_-5px_15px_#2a477908] pb-[env(safe-area-inset-bottom,_0px)] ${expanded ? "is-open" : ""}`}
          aria-label={
            effectivePanel === "detail"
              ? "휴게소 상세정보"
              : effectivePanel === "routes"
                ? "노선 필터"
                : effectivePanel === "facilities"
                  ? "편의시설 필터"
                  : effectivePanel === "stationServices"
                    ? "주유소 조건 필터"
                    : "휴게소 목록"
          }
        >
          <div
            className="sheet-handle w-[30px] h-[4px] m-[9px_auto_2px] bg-[#dce2e9] rounded-[5px] shrink-0"
            aria-hidden="true"
          />
          {!expanded ? (
            <button
              ref={summaryRef}
              className="sheet-summary flex items-center gap-[12px] w-full p-[13px_20px_14px] [border:0] bg-[transparent] text-left text-ink"
              onClick={event => open("list", event.currentTarget)}
              aria-expanded={false}
            >
              <span className="summary-list-icon w-[36px] h-[36px] flex items-center justify-center rounded-[11px] bg-primary-soft text-primary shrink-0">
                <Icon name="list" size={21} />
              </span>
              <span>
                <strong>
                  {loading
                    ? "휴게소를 찾고 있어요"
                    : error
                      ? "휴게소 조회 확인"
                      : `${placeView === "rest" ? "휴게소" : "고속도로 주유소"} ${resultCount}개`}
                </strong>
                <small>
                  {error
                    ? "목록에서 조회 상태를 확인해주세요"
                    : filters.routeName
                      ? `${filters.routeName} 전체 구간`
                      : location.requesting
                        ? "현재 위치를 확인하고 있어요"
                        : scopeLabel(location.scope)}
                </small>
              </span>
              <Icon name="chevronUp" size={20} />
            </button>
          ) : (
            <div
              ref={panelRef}
              className="sheet-content flex-1 min-h-0 flex flex-col [outline:none]"
              tabIndex={-1}
            >
              {effectivePanel === "routes" ||
              effectivePanel === "directions" ||
              effectivePanel === "facilities" ||
              effectivePanel === "stationServices" ? (
                <MobileFilterSheet
                  key={effectivePanel}
                  kind={effectivePanel}
                  areas={areas}
                  filters={filters}
                  stationServices={stationFilters}
                  onChange={next => {
                    setFilters(next);
                  }}
                  onStationServices={setStationFilters}
                  onClose={collapse}
                />
              ) : effectivePanel === "detail" && selectedStation ? (
                <GasStationDetails
                  key={stationKey(selectedStation)}
                  station={selectedStation}
                  onClose={collapse}
                  routeName={filters.routeName}
                />
              ) : effectivePanel === "detail" && selected ? (
                <>
                  <button
                    className="back-to-list [align-self:flex-start] flex items-center gap-[5px] min-h-[36px] p-[7px_20px_0] [border:0] bg-[transparent] text-[#7b8aa0] text-[11px] shrink-0"
                    onClick={() => {
                      setSelectedId(null);
                      setPanel("list");
                    }}
                  >
                    <Icon name="arrow" size={16} style={{transform: "rotate(180deg)"}} />
                    휴게소 목록
                  </button>
                  <RestAreaDetails area={selected} onClose={collapse} audience="mobile" stations={linkedStationsByRestId.get(selected.id)} />
                </>
              ) : (
                <>
                  <div className={sharedClasses.sheetListHeading}>
                    <div>
                      <h2>
                        장소 목록 <span>{resultCount}</span>
                      </h2>
                      <p>
                        {location.position
                          ? "내 위치에서 가까운 순 · 직선거리"
                          : "원하는 휴게소를 선택하세요."}
                      </p>
                    </div>
                    <IconButton onClick={collapse} aria-label="휴게소 목록 접기">
                      <Icon name="close" />
                    </IconButton>
                  </div>
                  <div
                    className="mobile-area-list overflow-y-auto min-h-0 flex-1 overscroll-contain"
                    aria-busy={loading}
                  >
                    {!resultCount && (loading || gas.loading || error || gas.error) ? (
                      <QueryState
                        loading={loading || gas.loading}
                        error={error ?? gas.error}
                        onRetry={() => {
                          void reload();
                          void gas.reload();
                        }}
                      />
                    ) : !resultCount ? (
                      <div className={sharedClasses.queryState}>
                        <Icon name="search" size={25} />
                        <strong>조건에 맞는 장소가 없습니다</strong>
                        <p>
                          {filters.routeName
                            ? "검색어·편의시설·라운지 조건을 변경하거나 필터를 초기화해보세요."
                            : "필터를 초기화하거나 지도를 이동한 뒤 지도 내 재검색을 눌러보세요."}
                        </p>
                        <Button onClick={reset} variant="secondary">
                          조건 초기화
                        </Button>
                      </div>
                    ) : (
                      <ul>
                        {listPlaces.map(place => {
                          if (place.kind === "station") {
                            const station = place.record;
                            const distance = areaDistance(station, location.position);
                            return (
                              <li key={place.key}>
                                <button
                                  className="mobile-area-card flex gap-[12px] items-start w-full p-[19px_0] [border:0] bg-[transparent] text-left"
                                  onClick={() => stationDetails(stationKey(station))}
                                  aria-label={`${station.name} 주유소 상세정보 보기`}
                                >
                                  <span className="list-pin flex items-center justify-center w-[31px] h-[31px] [border:1.5px_solid_#d8e7ff] rounded-[50%] text-primary mt-[1px] shrink-0 is-station">
                                    <Icon name="pin" size={19} />
                                  </span>
                                  <span className="mobile-area-info flex-1 min-w-0">
                                    <strong>
                                      <span className="mobile-area-name flex-1 min-w-0">
                                        {station.name}
                                      </span>
                                      {distance !== null && (
                                        <small className="mobile-area-distance shrink-0 text-primary text-[11px] font-[600]">
                                          {formatDistance(distance)}
                                        </small>
                                      )}
                                      <Icon name="chevron" size={16} />
                                    </strong>
                                    <span>
                                      {stationLabel(station)}
                                      {station.services.cargo ? " · 화물 특화" : ""}
                                    </span>
                                    <span>{station.address || stationHours(station)}</span>
                                  </span>
                                </button>
                              </li>
                            );
                          }
                          const area = place.record;
                          const available = facilityDefinitions.filter(
                            ([key]) => area.facilities[key] === true,
                          );
                          const route = routeDescription(area, "mobile");
                          const distance = areaDistance(area, location.position);
                          return (
                            <li key={place.key}>
                              <button
                                className="mobile-area-card flex gap-[12px] items-start w-full p-[19px_0] [border:0] bg-[transparent] text-left"
                                onClick={() => details(area.id)}
                                aria-label={`${area.name} 상세정보 보기`}
                              >
                                <span
                                  className={`list-pin flex items-center justify-center w-[31px] h-[31px] [border:1.5px_solid_#d8e7ff] rounded-[50%] text-primary mt-[1px] shrink-0 ${area.facilities.has_truck_lounge === true ? "is-lounge" : ""}`}
                                >
                                  <Icon
                                    name={
                                      area.facilities.has_truck_lounge === true ? "truck" : "pin"
                                    }
                                    size={19}
                                  />
                                </span>
                                <span className="mobile-area-info flex-1 min-w-0">
                                  <strong>
                                    <span className="mobile-area-name flex-1 min-w-0">
                                      {area.name}
                                    </span>
                                    {distance !== null && (
                                      <small
                                        className="mobile-area-distance shrink-0 text-primary text-[11px] font-[600]"
                                        aria-label={`내 위치에서 직선거리 ${formatDistance(distance)}`}
                                      >
                                        {formatDistance(distance)}
                                      </small>
                                    )}
                                    <Icon name="chevron" size={16} />
                                  </strong>
                                  {route && <span>{route}</span>}
                                  <span className="facility-tags">
                                    {available.slice(0, 3).map(([key, label]) => (
                                      <span key={key}>{label}</span>
                                    ))}
                                    {available.length > 3 && <span>+{available.length - 3}</span>}
                                  </span>
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
