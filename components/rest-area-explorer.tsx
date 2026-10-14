"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRestAreas } from "@/hooks/use-rest-areas";
import { useSearchQuery } from "@/hooks/use-search-query";
import { useMobileLocation } from "@/hooks/use-mobile-location";
import { filterMobileRestAreas, initialFilters } from "@/lib/rest-area-filters";
import {
  areaDistance,
  formatDistance,
  scopeLabel,
} from "@/lib/geo-search";
import {
  facilityDefinitions,
  hasCoordinates,
  routeDescription,
} from "@/lib/rest-areas";
import KakaoMap from "./kakao-map";
import RestAreaDetails from "./rest-area-details";
import QueryState from "./query-state";
import SearchBox from "./search-box";
import MobileFilterSheet from "./mobile-filter-sheet";
import Icon from "./icon";

type Panel = "collapsed" | "list" | "detail" | "routes" | "facilities";
export default function MobileExplorer() {
  const { data, areas, loading, error, reload } = useRestAreas();
  const location = useMobileLocation();
  const search = useSearchQuery();
  const [filters, setFilters] = useState(initialFilters);
  const [panel, setPanel] = useState<Panel>("collapsed");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const summaryRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    const header = headerRef.current;
    const shell = shellRef.current;
    if (!header || !shell) return;
    const measure = () =>
      shell.style.setProperty(
        "--mobile-header-height",
        `${header.getBoundingClientRect().height}px`,
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  const cardViewport = useCallback((canvas: DOMRect) => {
    const top = Math.max(
      canvas.top,
      (headerRef.current?.getBoundingClientRect().bottom ?? canvas.top) + 8,
    );
    const bottom = Math.min(
      canvas.bottom,
      (sheetRef.current?.getBoundingClientRect().top ?? canvas.bottom) - 10,
    );
    return new DOMRect(
      canvas.left,
      top,
      canvas.width,
      Math.max(0, bottom - top),
    );
  }, []);
  const results = useMemo(
    () =>
      filterMobileRestAreas(
        areas,
        filters,
        search.query,
        location.scope,
        location.position,
      ),
    [areas, filters, search.query, location.scope, location.position],
  );
  const selected = results.find((area) => area.id === selectedId);
  const effectivePanel =
    panel === "detail" && !selected && !loading ? "list" : panel;
  const expanded = effectivePanel !== "collapsed";
  const mapped = results.filter(hasCoordinates).length;
  const filtered = Boolean(
    search.input ||
    filters.routeName ||
    filters.facilities.length ||
    filters.lounge !== "all",
  );
  const select = useCallback((id: number | null) => {
    setSelectedId(id);
    setPanel("collapsed");
  }, []);
  const details = useCallback((id: number) => {
    setSelectedId(id);
    setPanel("detail");
  }, []);
  const collapse = useCallback(() => {
    setPanel("collapsed");
    setSelectedId(null);
  }, []);
  useEffect(() => {
    if (loading || selectedId === null || selected) return;
    let active = true;
    queueMicrotask(() => {
      if (active) {
        setSelectedId(null);
        setPanel((current) => (current === "detail" ? "list" : current));
      }
    });
    return () => {
      active = false;
    };
  }, [loading, selectedId, selected]);
  useEffect(() => {
    if (!expanded) {
      if (wasOpen.current)
        (returnFocus.current?.isConnected
          ? returnFocus.current
          : summaryRef.current
        )?.focus({ preventScroll: true });
      wasOpen.current = false;
      return;
    }
    wasOpen.current = true;
    panelRef.current?.focus({ preventScroll: true });
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
    setPanel(next);
  };
  const reset = () => {
    search.clear(false);
    setFilters(initialFilters());
    setSelectedId(null);
  };
  const clearRoute = useCallback(() => {
    setFilters((current) => ({ ...current, routeName: null }));
    setSelectedId(null);
  }, []);

  return (
    <main className="mobile-shell" ref={shellRef}>
      <header className="mobile-header" ref={headerRef}>
        <div className="mobile-brand">
          <span className="mobile-brand-mark">
            <Icon name="pin" size={23} />
          </span>
          <h1>휴게소 찾기</h1>
          <span className="mobile-test-label" role="status">
            {loading ? "조회 중" : `${results.length}개 결과`}
          </span>
        </div>
        <SearchBox search={search} />
        <div className="mobile-filters">
          <button
            className={`filter-chip ${filters.routeName ? "active" : ""}`}
            onClick={(event) => open("routes", event.currentTarget)}
            aria-expanded={panel === "routes"}
            disabled={loading}
          >
            <span>{filters.routeName || "전체 노선"}</span>
            <Icon
              name="chevronUp"
              size={13}
              style={{ transform: "rotate(180deg)" }}
            />
          </button>
          <button
            className={`filter-chip ${filters.facilities.length ? "active" : ""}`}
            onClick={(event) => open("facilities", event.currentTarget)}
            aria-expanded={panel === "facilities"}
          >
            편의시설
            {filters.facilities.length > 0 && (
              <b>{filters.facilities.length}</b>
            )}
            <Icon
              name="chevronUp"
              size={13}
              style={{ transform: "rotate(180deg)" }}
            />
          </button>
          <button
            className={`filter-chip lounge-toggle ${filters.lounge === "present" ? "on" : ""}`}
            aria-pressed={filters.lounge === "present"}
            aria-label={
              filters.lounge === "present"
                ? "라운지 ON: 라운지 있는 휴게소만 표시"
                : "라운지 OFF: 전체 휴게소 표시"
            }
            onClick={() => {
              setFilters((current) => ({
                ...current,
                lounge: current.lounge === "present" ? "all" : "present",
              }));
            }}
          >
            <Icon name="truck" size={14} />
            라운지 <b>{filters.lounge === "present" ? "ON" : "OFF"}</b>
          </button>
        </div>
        {filtered && (
          <div className="mobile-result-info">
            <span>지도에 {mapped}개 표시</span>
            <button onClick={reset}>조건 초기화</button>
          </div>
        )}
      </header>
      <div className="mobile-content">
        <div className="mobile-map">
          <KakaoMap
            areas={results}
            selectedRouteName={filters.routeName}
            onClearRoute={clearRoute}
            selectedId={loading ? selectedId : (selected?.id ?? null)}
            onSelect={select}
            onDetails={details}
            audience="mobile"
            showCard
            dataVersion={data?.fetchedAt}
            cardViewport={cardViewport}
            viewportVersion={effectivePanel}
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
                  : "휴게소 목록"
          }
        >
          <div className="sheet-handle" aria-hidden="true" />
          {!expanded ? (
            <button
              ref={summaryRef}
              className="sheet-summary"
              onClick={(event) => open("list", event.currentTarget)}
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
                      : `휴게소 ${results.length}개`}
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
              effectivePanel === "facilities" ? (
                <MobileFilterSheet
                  key={effectivePanel}
                  kind={effectivePanel}
                  areas={areas}
                  filters={filters}
                  onChange={(next) => {
                    setFilters(next);
                  }}
                  onClose={collapse}
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
                    <Icon
                      name="arrow"
                      size={16}
                      style={{ transform: "rotate(180deg)" }}
                    />
                    휴게소 목록
                  </button>
                  <RestAreaDetails
                    area={selected}
                    onClose={collapse}
                    audience="mobile"
                  />
                </>
              ) : (
                <>
                  <div className="sheet-list-heading">
                    <div>
                      <h2>
                        휴게소 목록 <span>{results.length}</span>
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
                    {loading || error || !areas.length ? (
                      <QueryState
                        loading={loading}
                        error={error}
                        onRetry={() => {
                          void reload();
                        }}
                      />
                    ) : !results.length ? (
                      <div className="query-state">
                        <Icon name="search" size={25} />
                        <strong>조건에 맞는 휴게소가 없습니다</strong>
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
                        {results.map((area) => {
                          const available = facilityDefinitions.filter(
                            ([key]) => area.facilities[key] === true,
                          );
                          const route = routeDescription(area, "mobile");
                          const distance = areaDistance(
                            area,
                            location.position,
                          );
                          return (
                            <li key={area.id}>
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
                                      area.facilities.has_truck_lounge === true
                                        ? "truck"
                                        : "pin"
                                    }
                                    size={19}
                                  />
                                </span>
                                <span className="mobile-area-info">
                                  <strong>
                                    <span className="mobile-area-name">
                                      {area.name}
                                    </span>
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
                                    {available
                                      .slice(0, 3)
                                      .map(([key, label]) => (
                                        <span key={key}>{label}</span>
                                      ))}
                                    {available.length > 3 && (
                                      <span>+{available.length - 3}</span>
                                    )}
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
