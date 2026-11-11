"use client";
import {sharedClasses} from "@/lib/shared-classes";
import {IconButton, Button} from "@/components/ui/button";
import {FilterChip} from "@/components/ui/filter-chip";
import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from "react";
import {useRestAreas} from "@/hooks/use-rest-areas";
import {useSearchQuery} from "@/hooks/use-search-query";
import {useMapFitRequest} from "@/hooks/use-map-fit-request";
import {useMobileLocation} from "@/hooks/use-mobile-location";
import {useGasStations} from "@/hooks/use-gas-stations";
import {useMobileDetails} from "@/hooks/use-mobile-details";
import type {RestAreaRecord} from "@/lib/rest-areas";
import type {GasStation, GasStationRecord} from "@/lib/gas-stations";
import {stationQueryString} from "@/lib/gas-station-query";
import {stationHours, stationKey, stationLabel} from "@/lib/gas-stations";
import type {PlaceView} from "@/lib/map-places";
import {mobilePlaceList, previewForRestArea} from "@/lib/mobile-place-list";
import {restAreaPriceSummary} from "@/lib/rest-area-prices";
import {directionOptions, initialFilters} from "@/lib/rest-area-filters";
import {filterFacilityPlaces} from "@/lib/facility-filters";
import {linkedStationsByArea, mergeFacilityPlaces} from "@/lib/facility-places";
import {areaDistance, formatDistance, scopeLabel} from "@/lib/geo-search";
import {cardDisplayArea} from "@/lib/map-card-layout";
import {detailSheetSwipe} from "@/lib/mobile-sheet-gesture";
import {facilityDefinitions, routeDescription} from "@/lib/rest-areas";
import type {InitialMapData} from "@/lib/initial-map-data";
import KakaoMap from "./kakao-map";
import RestAreaDetails from "./rest-area-details";
import QueryState from "./query-state";
import SearchBox from "./search-box";
import MobileFilterSheet from "./mobile-filter-sheet";
import Icon from "./icon";
import GasStationDetails from "./gas-station-details";
type Panel = "collapsed" | "list" | "detail" | "routes" | "directions" | "facilities";
export default function MobileExplorer({initialData}: {
  initialData?: InitialMapData;
} = {}) {
  const initialRestAreas = initialData?.restAreas;
  const initialStations = useMemo(() => initialData ? {
    query: "source=ex", result: initialData.stations,
  } : undefined, [initialData]);
  const {data, areas: allAreas, loading, error, reload} = useRestAreas(false, initialRestAreas);
  const areas = useMemo(() => allAreas.filter(area => area.operationStatus !== "closed"), [allAreas]);
  const location = useMobileLocation();
  const view = useMapFitRequest();
  const search = useSearchQuery(view.requestSearchFit);
  const [filters, setFilters] = useState(initialFilters);
  const [placeView, setPlaceView] = useState<PlaceView>("all");
  // 위치·줌 변경은 공통 목록을 필터링하고, 노선 검색만 서버의 근접 조건을 적용한다.
  const gas = useGasStations(
    stationQueryString(filters.routeName, {kind: "all"}, "ex"),
    false,
    initialStations,
  );
  const [panel, setPanel] = useState<Panel>("collapsed");
  const [detailExpanded, setDetailExpanded] = useState(false);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const touchStart = useRef<{x: number; y: number; canCollapse: boolean} | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [previewStation, setPreviewStation] = useState<{
    station: GasStation; restAreaId: number; filters: typeof filters; query: string; view: PlaceView;
  } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const sheetHeight = useRef<number | null>(null);
  const sheetAnimation = useRef<Animation | null>(null);
  const summaryRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  const [viewportRevision, setViewportRevision] = useState(0);
  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const height = sheet.offsetHeight;
    const previous = sheetHeight.current;
    sheetHeight.current = height;
    if (previous === null || Math.abs(previous - height) < 1 ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches || !sheet.animate) return;
    const maxHeight = `${Math.max(previous, height)}px`;
    const animation = sheet.animate(
      [{height: `${previous}px`, maxHeight}, {height: `${height}px`, maxHeight}],
      {duration: 260, easing: "cubic-bezier(0.2, 0, 0, 1)"},
    );
    sheetAnimation.current = animation;
    animation.onfinish = () => {
      if (sheetAnimation.current === animation) sheetAnimation.current = null;
    };
    return () => {
      if (sheetAnimation.current === animation) sheetAnimation.current = null;
      animation.cancel();
    };
  }, [panel, detailExpanded]);
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const observer = new ResizeObserver(() => {
      if (!sheetAnimation.current) sheetHeight.current = sheet.offsetHeight;
    });
    observer.observe(sheet);
    return () => observer.disconnect();
  }, []);
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
  const sourceFacilities = useMemo(() => mergeFacilityPlaces(areas, gas.stations), [areas, gas.stations]);
  const mergedFacilities = useMemo(
    () => filterFacilityPlaces(areas, gas.stations, {
      filters, query: search.query, stationServices: [],
      scope: location.scope, position: location.position,
    }, sourceFacilities),
    [areas, gas.stations, filters, search.query, location.scope, location.position, sourceFacilities],
  );
  const baseVisibleAreas = useMemo(
    () => mergedFacilities.facilities.map(({area}) => area),
    [mergedFacilities.facilities],
  );
  const baseStations = mergedFacilities.stations;
  const baseLinkedStations = useMemo(
    () => linkedStationsByArea(mergedFacilities.facilities, sourceFacilities.stations),
    [mergedFacilities.facilities, sourceFacilities],
  );
  const selectedBaseArea = baseVisibleAreas.find(area => area.id === selectedId);
  const selectedBaseStation = baseStations.find(station => stationKey(station) === selectedStationId) ??
    [...baseLinkedStations.values()].flat().find(station => stationKey(station) === selectedStationId);
  const restDetails = useMobileDetails("rest", selectedBaseArea && !selectedBaseArea.revision ? [selectedBaseArea.id] : []);
  const detailStations = selectedBaseArea ? baseLinkedStations.get(selectedBaseArea.id) ?? [] : selectedBaseStation ? [selectedBaseStation] : [];
  const stationDetailsData = useMobileDetails("station", detailStations.filter(station => station.brand === "EX" && !station.revision).map(station => station.id));
  const detailLoading = !!(selectedBaseArea && !selectedBaseArea.revision && !restDetails.items[selectedBaseArea.id]) || detailStations.some(station => station.brand === "EX" && !station.revision && !stationDetailsData.items[station.id]);
  const detailError = restDetails.error ?? stationDetailsData.error;
  const visibleAreas = useMemo(() => baseVisibleAreas.map(area => (restDetails.items[area.id] as RestAreaRecord | undefined) ?? area), [baseVisibleAreas, restDetails.items]);
  const stationResults = useMemo(() => baseStations.map(station => ({...station, ...((stationDetailsData.items[station.id] as GasStationRecord | undefined) ?? {})})), [baseStations, stationDetailsData.items]);
  const linkedStationsByRestId = useMemo(() => new Map([...baseLinkedStations].map(([id, stations]) => [id, stations.map(station => ({...station, ...((stationDetailsData.items[station.id] as GasStationRecord | undefined) ?? {})}))])), [baseLinkedStations, stationDetailsData.items]);
  const selectedDirectionLabel = useMemo(
    () =>
      directionOptions(areas, filters.routeName).find(option => option.key === filters.direction)
        ?.label ?? filters.direction,
    [areas, filters.routeName, filters.direction],
  );
  const listPlaces = useMemo(() => {
    const places = mobilePlaceList(visibleAreas, stationResults, placeView);
    if (location.position)
      places.sort((left, right) => {
        const a = areaDistance(left.record, location.position) ?? Infinity,
          b = areaDistance(right.record, location.position) ?? Infinity;
        return a === b ? left.key.localeCompare(right.key) : a - b;
      });
    return places;
  }, [visibleAreas, stationResults, location.position, placeView]);
  const selected = visibleAreas.find(area => area.id === selectedId);
  const selectedStation = stationResults.find(station => stationKey(station) === selectedStationId) ??
    [...linkedStationsByRestId.values()].flat().find(station => stationKey(station) === selectedStationId);
  const mapAreas = useMemo(
    () => listPlaces.flatMap(place => place.kind === "rest" ? [place.record] : []),
    [listPlaces],
  );
  const mapStations = useMemo(
    () => listPlaces.flatMap(place => place.kind === "station" ? [place.record] : []),
    [listPlaces],
  );
  const visiblePreviewStation = previewStation && previewStation.filters === filters &&
    previewStation.query === search.query && previewStation.view === placeView ? previewStation.station : null;
  const stalePreview = previewStation && !visiblePreviewStation ? previewStation : null;
  const extraStation = stalePreview && selectedStationId === stationKey(stalePreview.station)
    ? null : selectedStation ?? visiblePreviewStation;
  const selectedMapStations = extraStation && !mapStations.some(station => stationKey(station) === stationKey(extraStation))
    ? [...mapStations, extraStation] : mapStations;
  useEffect(() => {
    if (!stalePreview) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setSelectedStationId(current => current === stationKey(stalePreview.station) ? null : current);
      setPreviewStation(null);
    });
    return () => { active = false; };
  }, [stalePreview]);
  const effectivePanel =
    panel === "detail" && !selected && !selectedStation && !loading && !gas.loading
      ? "list"
      : panel;
  const expanded = effectivePanel !== "collapsed";
  const resultCount = listPlaces.length;
  const select = useCallback((id: number | null) => {
    if (id !== null) setPreviewStation(current => previewForRestArea(current, id));
    setSelectedStationId(null);
    setSelectedId(id);
    setPanel("collapsed");
  }, []);
  const details = useCallback((id: number) => {
    setPreviewStation(current => previewForRestArea(current, id));
    setDetailExpanded(false);
    setSelectedStationId(null);
    setSelectedId(id);
    setPanel("detail");
  }, []);
  const collapse = useCallback(() => {
    setPanel("collapsed");
    setDetailExpanded(false);
    setPanelExpanded(false);
  }, []);
  const selectStation = useCallback((id: string | null) => {
    if (id !== null) setPreviewStation(current => current && stationKey(current.station) === id ? current : null);
    setSelectedId(null);
    setSelectedStationId(id);
    setPanel("collapsed");
  }, []);
  const stationDetails = useCallback((id: string) => {
    setPreviewStation(current => current && stationKey(current.station) === id ? current : null);
    setDetailExpanded(false);
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
    setPanelExpanded(false);
    setPanel(next);
  };
  const reset = () => {
    setPreviewStation(null);
    search.clear(false);
    setFilters(initialFilters());
    setSelectedId(null);
    setSelectedStationId(null);
    setPlaceView("all");
  };
  const clearRoute = useCallback(() => {
    setPreviewStation(null);
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
        <h1 className={sharedClasses.screenReaderOnly}>
          휴게소·주유소 찾기
        </h1>
        <SearchBox search={search} includeStations />
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
            <FilterChip
              active={filters.facilities.length > 0}
              onClick={event => open("facilities", event.currentTarget)}
              aria-expanded={panel === "facilities"}
              disabled={placeView === "ex"}
            >
              휴게소 편의시설
              {filters.facilities.length > 0 && <b>{filters.facilities.length}</b>}
              <Icon name="chevronUp" size={13} style={{transform: "rotate(180deg)"}} />
            </FilterChip>
          <FilterChip
            active={placeView === "ex"}
            aria-pressed={placeView === "ex"}
            onClick={() => {
              const next = placeView === "ex" ? "all" : "ex";
              setPlaceView(next);
              setPreviewStation(null);
              if (next === "ex") setFilters(current => ({...current, facilities: [], lounge: "all"}));
              setSelectedId(null);
              setSelectedStationId(null);
              setPanel("collapsed");
            }}
          >
            <Icon name="fuel" size={14} />
            주유소만 보기
          </FilterChip>
            <FilterChip
              variant="lounge"
              active={filters.lounge === "present"}
              disabled={placeView === "ex"}
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
        </div>
        {filters.routeName && placeView === "ex" && (
          <p className="station-route-note text-[#526882] bg-[#f1f7f4] rounded-[8px] p-[10px] text-ui-12 leading-[1.6] compact">
            주유소는 선택 노선 주변 2km · 직선거리 기준
          </p>
        )}
      </header>
      <div className="mobile-content flex-1 min-h-0 flex flex-col relative">
        <div className="mobile-map absolute inset-[0]">
          <KakaoMap
            areas={mapAreas}
            stations={selectedMapStations}
            linkedStationsByRestId={linkedStationsByRestId}
            selectedDirection={selectedDirectionLabel}
            fitRequest={view.fitRequest}
            searchFitPlaces={listPlaces}
            selectedStationId={selectedStation ? stationKey(selectedStation) : null}
            pinnedStationId={visiblePreviewStation ? stationKey(visiblePreviewStation) : null}
            onStationSelect={selectStation}
            onStationDetails={stationDetails}
            areasLoading={loading}
            stationsLoading={placeView === "rest" ? false : gas.loading}
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
            showCard={!expanded}
            dataVersion={data?.fetchedAt ?? gas.data?.fetchedAt}
            cardViewport={cardViewport}
            viewportVersion={`${effectivePanel}:${viewportRevision}`}
            mobileLocation={location}
          />
        </div>
        <section
          ref={sheetRef}
          className={`mobile-sheet absolute bottom-[0] w-full shrink-0 h-[calc(84px_+_env(safe-area-inset-bottom,_0px))] max-h-[max(120px,_calc(100%_-_var(--mobile-header-height,_150px)_-_230px))] flex flex-col [border-top:1px_solid_#e8edf4] rounded-[18px_18px_0_0] bg-white z-[4] [box-shadow:0_-5px_15px_#2a477908] pb-[env(safe-area-inset-bottom,_0px)] ${expanded ? "is-open" : ""} ${effectivePanel === "detail" ? (detailExpanded ? "is-detail-full" : "is-detail-preview") : expanded && panelExpanded ? "is-panel-full" : ""}`}
          onTouchStart={event => {
            const touch = event.touches[0];
            const scroll = (event.target as HTMLElement).closest<HTMLElement>(".detail-scroll, .mobile-area-list, .filter-sheet-scroll");
            touchStart.current = touch
              ? {x: touch.clientX, y: touch.clientY, canCollapse: !scroll || scroll.scrollTop <= 0}
              : null;
          }}
          onTouchEnd={event => {
            const start = touchStart.current;
            const touch = event.changedTouches[0];
            touchStart.current = null;
            if (!start || !touch) return;
            const action = detailSheetSwipe(start, {x: touch.clientX, y: touch.clientY}, effectivePanel === "detail" ? detailExpanded : panelExpanded);
            if (effectivePanel === "collapsed") {
              if (action === "expand") open("list", summaryRef.current ?? event.currentTarget);
              return;
            }
            if (action === "close") collapse();
            else if (action && effectivePanel === "detail") setDetailExpanded(action === "expand");
            else if (action) setPanelExpanded(action === "expand");
          }}
          onTouchCancel={() => { touchStart.current = null; }}
          aria-label={
            effectivePanel === "detail"
              ? (selectedStation ? "주유소 상세정보" : "휴게소 상세정보")
              : effectivePanel === "routes"
                ? "노선 필터"
                : effectivePanel === "facilities"
                  ? "편의시설 필터"
                  : effectivePanel === "directions"
                    ? "방향 필터"
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
                      : `${placeView === "rest" ? "휴게소" : placeView === "ex" ? "고속도로 주유소" : "휴게소·주유소"} ${resultCount}곳`}
                </strong>
                <small>
                  {error
                    ? "목록에서 조회 상태를 확인해주세요"
                    : filters.routeName
                      ? `${filters.routeName} 전체 구간`
                      : search.query.trim()
                        ? "전체 지역 검색"
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
              effectivePanel === "facilities" ? (
                <MobileFilterSheet
                  key={effectivePanel}
                  kind={effectivePanel}
                  areas={areas}
                  filters={filters}
                  onChange={next => {
                    setFilters(next);
                  }}
                  onClose={collapse}
                />
              ) : effectivePanel === "detail" && (selected || selectedStation) && (detailLoading || detailError) ? (
                <div role="status" className="p-5">
                  {detailError ? <>{detailError} <Button onClick={() => { restDetails.retry(); stationDetailsData.retry(); }}>다시 조회</Button></> : "상세 정보를 불러오고 있어요"}
                  <Button variant="secondary" onClick={collapse}>닫기</Button>
                </div>
              ) : effectivePanel === "detail" && selectedStation ? (
                <GasStationDetails
                  key={stationKey(selectedStation)}
                  station={selectedStation}
                  onClose={collapse}
                  routeName={filters.routeName}
                  preview={!detailExpanded}
                />
              ) : effectivePanel === "detail" && selected ? (
                <>
                  <div className="flex shrink-0 items-center justify-between px-[20px]">
                    <button
                      className="back-to-list flex items-center gap-[5px] min-h-[40px] p-0 [border:0] bg-[transparent] text-[#7b8aa0] text-ui-12"
                      onClick={() => {
                        setSelectedId(null);
                        setPanel("list");
                      }}
                    >
                      <Icon name="arrow" size={16} style={{transform: "rotate(180deg)"}} />
                      휴게소 목록
                    </button>
                    <IconButton onClick={collapse} aria-label="상세정보 닫기">
                      <Icon name="close" />
                    </IconButton>
                  </div>
                  <RestAreaDetails area={selected} onClose={collapse} audience="mobile" stations={linkedStationsByRestId.get(selected.id)} onStationMap={station => {
                    setPreviewStation({station, restAreaId: selected.id, filters, query: search.query, view: placeView});
                    setSelectedId(null);
                    setSelectedStationId(stationKey(station));
                    setDetailExpanded(false);
                    setPanel("collapsed");
                  }} preview={!detailExpanded} onExpand={() => setDetailExpanded(true)} />
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
                          {filters.routeName || search.query.trim()
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
                                  <span className={`list-pin flex items-center justify-center w-[31px] h-[31px] [border:1.5px_solid_#d8e7ff] rounded-[50%] text-primary mt-[1px] shrink-0 ${station.brand === "EX" ? "is-ex-station" : "is-station"}`}>
                                    <Icon name="pin" size={19} />
                                  </span>
                                  <span className="mobile-area-info flex-1 min-w-0">
                                    <strong>
                                      <span className="mobile-area-name flex-1 min-w-0">
                                        {station.name}
                                      </span>
                                      {distance !== null && (
                                        <small className="mobile-area-distance shrink-0 text-primary text-ui-12 font-[600]">
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
                          const linkedStations = linkedStationsByRestId.get(area.id) ?? [];
                          const hasPrices = linkedStations.some(station => station.prices?.gasoline || station.prices?.diesel);
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
                                      {area.operationStatus === "suspended" && " · 일시 운영중지"}
                                      {area.operationStatus === "review" && " · 운영 확인 필요"}
                                      {route && <span className="ml-[6px] text-ui-12 font-normal text-[#8592a3]">{route}</span>}
                                    </span>
                                    {distance !== null && (
                                      <small
                                        className="mobile-area-distance shrink-0 text-primary text-ui-12 font-[600]"
                                        aria-label={`내 위치에서 직선거리 ${formatDistance(distance)}`}
                                      >
                                        {formatDistance(distance)}
                                      </small>
                                    )}
                                    <Icon name="chevron" size={16} />
                                  </strong>
                                  {linkedStations.length > 0 && (
                                    <span className="mobile-fuel-price">
                                      {hasPrices
                                        ? `휘발유 ${restAreaPriceSummary(linkedStations, "gasoline").text} · 경유 ${restAreaPriceSummary(linkedStations, "diesel").text}`
                                        : "주유 가격 정보 없음"}
                                    </span>
                                  )}
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
