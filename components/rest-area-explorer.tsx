"use client";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {useRestAreas} from "@/hooks/use-rest-areas";
import {useSearchQuery} from "@/hooks/use-search-query";
import {useMobileLocation} from "@/hooks/use-mobile-location";
import {useGasStations} from "@/hooks/use-gas-stations";
import {stationQueryString} from "@/lib/gas-station-query";
import {stationHours, type StationServiceKey} from "@/lib/gas-stations";
import {filterStations, restPlace, stationPlace, type PlaceView} from "@/lib/map-places";
import {filterMobileRestAreas, initialFilters} from "@/lib/rest-area-filters";
import {areaDistance, filterByGeoScope, formatDistance, scopeLabel} from "@/lib/geo-search";
import {cardDisplayArea} from "@/lib/map-card-layout";
import {facilityDefinitions, hasCoordinates, routeDescription} from "@/lib/rest-areas";
import KakaoMap from "./kakao-map";
import RestAreaDetails from "./rest-area-details";
import QueryState from "./query-state";
import SearchBox from "./search-box";
import MobileFilterSheet from "./mobile-filter-sheet";
import Icon from "./icon";
import PlaceControls from "./place-controls";
import GasStationDetails from "./gas-station-details";
const noAreas: ReturnType<typeof filterMobileRestAreas> = [];

type Panel = "collapsed" | "list" | "detail" | "routes" | "facilities" | "stationServices";
export default function MobileExplorer() {
  const {data, areas, loading, error, reload} = useRestAreas();
  const location = useMobileLocation();
  const search = useSearchQuery();
  const [filters, setFilters] = useState(initialFilters);
  const [placeView, setPlaceView] = useState<PlaceView>("all");
  const [stationFilters, setStationFilters] = useState<StationServiceKey[]>([]);
  const gas = useGasStations(
    placeView === "rest" ? null : stationQueryString(filters.routeName, location.scope),
  );
  const [panel, setPanel] = useState<Panel>("collapsed");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedStationId, setSelectedStationId] = useState<number | null>(null);
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
  const results = useMemo(
    () => filterMobileRestAreas(areas, filters, search.query, location.scope, location.position),
    [areas, filters, search.query, location.scope, location.position],
  );
  const stationResults = useMemo(
    () =>
      filterByGeoScope(
        filterStations(gas.stations, search.query, stationFilters),
        {kind: "all"},
        location.position,
      ),
    [gas.stations, search.query, stationFilters, location.position],
  );
  const visibleAreas = placeView === "station" ? noAreas : results;
  const listPlaces = useMemo(() => {
    const places = [...visibleAreas.map(restPlace), ...stationResults.map(stationPlace)];
    if (location.position)
      places.sort((left, right) => {
        const a = areaDistance(left.record, location.position) ?? Infinity,
          b = areaDistance(right.record, location.position) ?? Infinity;
        return a === b ? left.key.localeCompare(right.key) : a - b;
      });
    return places;
  }, [visibleAreas, stationResults, location.position]);
  const selected = visibleAreas.find(area => area.id === selectedId);
  const selectedStation = stationResults.find(station => station.id === selectedStationId);
  const effectivePanel =
    panel === "detail" && !selected && !selectedStation && !loading && !gas.loading
      ? "list"
      : panel;
  const expanded = effectivePanel !== "collapsed";
  const mapped = listPlaces.filter(place => hasCoordinates(place.record)).length;
  const resultCount = listPlaces.length;
  const filtered = Boolean(
    search.input ||
    filters.routeName ||
    filters.facilities.length ||
    filters.lounge !== "all" ||
    stationFilters.length ||
    placeView !== "all",
  );
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
  const selectStation = useCallback((id: number | null) => {
    setSelectedId(null);
    setSelectedStationId(id);
    setPanel("collapsed");
  }, []);
  const stationDetails = useCallback((id: number) => {
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
    setFilters(current => ({...current, routeName: null}));
    setSelectedId(null);
    setSelectedStationId(null);
  }, []);

  return (
    <main className="mobile-shell" ref={shellRef}>
      <header className="mobile-header" ref={headerRef}>
        <h1 className="sr-only">휴게소·주유소 찾기</h1>
        <SearchBox search={search} includeStations={placeView !== "rest"} />
        <PlaceControls
          view={placeView}
          onView={next => {
            setPlaceView(next);
            setSelectedId(null);
            setSelectedStationId(null);
            setPanel("collapsed");
          }}
        />
        <div className="mobile-filters">
          <button
            className={`filter-chip ${filters.routeName ? "active" : ""}`}
            onClick={event => open("routes", event.currentTarget)}
            aria-expanded={panel === "routes"}
            disabled={loading}
          >
            <span>{filters.routeName || "전체 노선"}</span>
            <Icon name="chevronUp" size={13} style={{transform: "rotate(180deg)"}} />
          </button>
          {placeView !== "station" && (
            <button
              className={`filter-chip ${filters.facilities.length ? "active" : ""}`}
              onClick={event => open("facilities", event.currentTarget)}
              aria-expanded={panel === "facilities"}
            >
              휴게소 편의시설
              {filters.facilities.length > 0 && <b>{filters.facilities.length}</b>}
              <Icon name="chevronUp" size={13} style={{transform: "rotate(180deg)"}} />
            </button>
          )}
          {placeView !== "rest" && (
            <button
              className={`filter-chip ${stationFilters.length ? "active" : ""}`}
              onClick={event => open("stationServices", event.currentTarget)}
              aria-expanded={panel === "stationServices"}
            >
              주유소 조건
              {stationFilters.length > 0 && <b>{stationFilters.length}</b>}
              <Icon name="chevronUp" size={13} style={{transform: "rotate(180deg)"}} />
            </button>
          )}
          {placeView !== "station" && (
            <button
              className={`filter-chip lounge-toggle ${filters.lounge === "present" ? "on" : ""}`}
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
            </button>
          )}
        </div>
        {filtered && (
          <div className="mobile-result-info">
            <span>지도에 {mapped}개 표시</span>
            <button onClick={reset}>조건 초기화</button>
          </div>
        )}
        {filters.routeName && placeView !== "rest" && (
          <p className="station-route-note compact">주유소는 선택 노선 주변 2km · 직선거리 기준</p>
        )}
      </header>
      <div className="mobile-content">
        <div className="mobile-map">
          <KakaoMap
            areas={visibleAreas}
            stations={stationResults}
            selectedStationId={selectedStation?.id ?? null}
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
          className={`mobile-sheet ${expanded ? "is-open" : ""}`}
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
          <div className="sheet-handle" aria-hidden="true" />
          {!expanded ? (
            <button
              ref={summaryRef}
              className="sheet-summary"
              onClick={event => open("list", event.currentTarget)}
              aria-expanded={false}
            >
              <span className="summary-list-icon">
                <Icon name="list" size={21} />
              </span>
              <span>
                <strong>
                  {loading
                    ? "휴게소를 찾고 있어요"
                    : error
                      ? "휴게소 조회 확인"
                      : `${placeView === "rest" ? "휴게소" : placeView === "station" ? "주유소" : "장소"} ${resultCount}개`}
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
            <div ref={panelRef} className="sheet-content" tabIndex={-1}>
              {effectivePanel === "routes" ||
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
                  key={selectedStation.id}
                  station={selectedStation}
                  onClose={collapse}
                  routeName={filters.routeName}
                />
              ) : effectivePanel === "detail" && selected ? (
                <>
                  <button
                    className="back-to-list"
                    onClick={() => {
                      setSelectedId(null);
                      setPanel("list");
                    }}
                  >
                    <Icon name="arrow" size={16} style={{transform: "rotate(180deg)"}} />
                    휴게소 목록
                  </button>
                  <RestAreaDetails area={selected} onClose={collapse} audience="mobile" />
                </>
              ) : (
                <>
                  <div className="sheet-list-heading">
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
                    <button
                      className="icon-button"
                      onClick={collapse}
                      aria-label="휴게소 목록 접기"
                    >
                      <Icon name="close" />
                    </button>
                  </div>
                  <div className="mobile-area-list" aria-busy={loading}>
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
                      <div className="query-state">
                        <Icon name="search" size={25} />
                        <strong>조건에 맞는 장소가 없습니다</strong>
                        <p>
                          {filters.routeName
                            ? "검색어·편의시설·라운지 조건을 변경하거나 필터를 초기화해보세요."
                            : "필터를 초기화하거나 지도를 이동한 뒤 지도 내 재검색을 눌러보세요."}
                        </p>
                        <button className="button secondary" onClick={reset}>
                          조건 초기화
                        </button>
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
                                  className="mobile-area-card"
                                  onClick={() => stationDetails(station.id)}
                                  aria-label={`${station.name} 주유소 상세정보 보기`}
                                >
                                  <span className="list-pin is-station">
                                    <Icon name="pin" size={19} />
                                  </span>
                                  <span className="mobile-area-info">
                                    <strong>
                                      <span className="mobile-area-name">{station.name}</span>
                                      {distance !== null && (
                                        <small className="mobile-area-distance">
                                          {formatDistance(distance)}
                                        </small>
                                      )}
                                      <Icon name="chevron" size={16} />
                                    </strong>
                                    <span>
                                      GS 주유·충전소{station.services.cargo ? " · 화물 특화" : ""}
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
                                className="mobile-area-card"
                                onClick={() => details(area.id)}
                                aria-label={`${area.name} 상세정보 보기`}
                              >
                                <span
                                  className={`list-pin ${area.facilities.has_truck_lounge === true ? "is-lounge" : ""}`}
                                >
                                  <Icon
                                    name={
                                      area.facilities.has_truck_lounge === true ? "truck" : "pin"
                                    }
                                    size={19}
                                  />
                                </span>
                                <span className="mobile-area-info">
                                  <strong>
                                    <span className="mobile-area-name">{area.name}</span>
                                    {distance !== null && (
                                      <small
                                        className="mobile-area-distance"
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
