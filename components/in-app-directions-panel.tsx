"use client";

import {useEffect, useMemo, useRef, useState} from "react";
import {Button, IconButton} from "@/components/ui/button";
import type {DrivingRoute, RouteRestAreaMatch} from "@/lib/directions";
import {formatDistance, type GeoPoint} from "@/lib/geo-search";
import {
  formatDurationParts,
  getPreferredNavigationProvider,
  launchNavigationApp,
  navigationProviderOptions,
  setPreferredNavigationProvider,
  type NavigationProvider,
  type NavigationTarget,
} from "@/lib/navigation";
import {
  addRecentSearch,
  clearRecentSearches,
  getRecentSearches,
  normalizePlaceSearchQuery,
  removeRecentSearch,
  type PlaceSearchItem,
  type RecentSearchEntry,
} from "@/lib/place-search";
import {hasCoordinates, type RestArea} from "@/lib/rest-areas";
import Icon from "./icon";

export default function InAppDirectionsPanel({
  origin,
  target,
  gpsOrigin,
  gpsAddress = null,
  onChangeOrigin,
  onChangeTarget,
  routes,
  restAreasByRoute,
  selectedIndex,
  onSelectRoute,
  loading,
  error,
  tooClose = false,
  onRetry,
  allRestAreas = [],
  onSelectRestArea,
  onClose,
}: {
  origin: NavigationTarget | null;
  target: NavigationTarget | null;
  gpsOrigin: GeoPoint | null;
  gpsAddress?: string | null;
  onChangeOrigin: (next: NavigationTarget | null) => void;
  onChangeTarget: (next: NavigationTarget | null) => void;
  routes: readonly DrivingRoute[];
  restAreasByRoute: readonly (readonly RouteRestAreaMatch[])[];
  selectedIndex: number;
  onSelectRoute: (index: number) => void;
  loading: boolean;
  error: string | null;
  tooClose?: boolean;
  onRetry: () => void;
  allRestAreas?: readonly RestArea[];
  onSelectRestArea?: (id: number) => void;
  onClose: () => void;
}) {
  const [sheetMode, setSheetMode] = useState<"none" | "rest" | "provider">("none");
  const [sheetClosing, setSheetClosing] = useState(false);
  const [preferredProvider, setPreferredProvider] = useState<NavigationProvider | null>(() =>
    getPreferredNavigationProvider(),
  );
  const [rememberChoice, setRememberChoice] = useState(true);
  const openProviderSheet = () => {
    setSheetClosing(false);
    setSheetMode("provider");
  };
  const closeProviderSheet = () => {
    if (sheetMode === "provider") {
      setSheetClosing(true);
    }
  };
  const [activeField, setActiveField] = useState<"origin" | "dest" | null>(
    !origin && !gpsOrigin ? "origin" : target ? null : "dest",
  );
  const [originQuery, setOriginQuery] = useState("");
  const [destQuery, setDestQuery] = useState("");
  const [remoteResults, setRemoteResults] = useState<PlaceSearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [recentItems, setRecentItems] = useState<RecentSearchEntry[]>(() =>
    getRecentSearches(),
  );
  const [visibleRecentCount, setVisibleRecentCount] = useState(4);

  const originInputRef = useRef<HTMLInputElement>(null);
  const destInputRef = useRef<HTMLInputElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const programmaticScrollRef = useRef(false);

  useEffect(() => {
    if (!origin && !gpsOrigin) {
      originInputRef.current?.focus();
    } else if (!target) {
      destInputRef.current?.focus();
    }
  }, [origin, gpsOrigin, target]);

  const activeQuery =
    activeField === "origin"
      ? normalizePlaceSearchQuery(originQuery)
      : activeField === "dest"
        ? normalizePlaceSearchQuery(destQuery)
        : "";

  const localMatches = useMemo<PlaceSearchItem[]>(() => {
    if (!activeQuery) return [];
    const lowered = activeQuery.toLocaleLowerCase("ko-KR");
    const items: PlaceSearchItem[] = [];
    for (const area of allRestAreas) {
      if (!hasCoordinates(area)) continue;
      const haystack = `${area.name} ${area.routeName ?? ""} ${area.directionLabel ?? ""}`.toLocaleLowerCase("ko-KR");
      if (haystack.includes(lowered)) {
        items.push({
          id: `rest:${area.id}`,
          name: area.name,
          address: [area.routeName, area.directionLabel].filter(Boolean).join(" · ") || "고속도로 휴게소",
          category: "휴게소",
          latitude: area.latitude,
          longitude: area.longitude,
        });
        if (items.length >= 4) break;
      }
    }
    return items;
  }, [activeQuery, allRestAreas]);

  useEffect(() => {
    if (!activeField || !activeQuery) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      void fetch(`/api/places?q=${encodeURIComponent(activeQuery)}`, {
        signal: controller.signal,
        cache: "no-store",
      })
        .then(async response => {
          const body = (await response.json()) as {items?: PlaceSearchItem[]};
          if (!controller.signal.aborted) {
            setRemoteResults(Array.isArray(body.items) ? body.items : []);
            setSearching(false);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setRemoteResults([]);
            setSearching(false);
          }
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [activeField, activeQuery]);

  const combinedResults = useMemo(() => {
    if (!activeQuery) return [];
    const seen = new Set<string>();
    const merged: PlaceSearchItem[] = [];
    for (const item of [...localMatches, ...remoteResults]) {
      const key = `${item.name}|${item.latitude.toFixed(4)},${item.longitude.toFixed(4)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
      if (merged.length >= 10) break;
    }
    return merged;
  }, [activeQuery, localMatches, remoteResults]);

  const selectPlaceItem = (item: PlaceSearchItem) => {
    const restId = item.id.startsWith("rest:") ? Number(item.id.slice(5)) : null;
    setRecentItems(
      addRecentSearch(
        Number.isFinite(restId) && restId !== null
          ? {
              key: item.id,
              kind: "rest",
              restId,
              name: item.name,
              address: item.address,
              badge: "휴게소",
              latitude: item.latitude,
              longitude: item.longitude,
            }
          : {
              key: `place:${item.id}`,
              kind: "place",
              place: item,
              name: item.name,
              address: item.address,
              category: item.category,
              latitude: item.latitude,
              longitude: item.longitude,
            },
      ),
    );
    const navTarget: NavigationTarget = {
      key: item.id,
      name: item.name,
      latitude: item.latitude,
      longitude: item.longitude,
      restAreaId: Number.isFinite(restId) ? restId : null,
    };
    if (activeField === "origin") {
      onChangeOrigin(navTarget);
      setOriginQuery("");
    } else if (activeField === "dest") {
      onChangeTarget(navTarget);
      setDestQuery("");
    }
    setActiveField(null);
  };

  const handleSwap = () => {
    const resolvedOrigin =
      origin?.key === "my-location" && !origin.name && gpsAddress
        ? {...origin, name: gpsAddress}
        : origin;
    onChangeOrigin(target);
    onChangeTarget(resolvedOrigin);
    setActiveField(null);
  };

  const effectiveOriginPoint: GeoPoint | null = origin
    ? {latitude: origin.latitude, longitude: origin.longitude}
    : null;

  useEffect(() => {
    const card = cardRefs.current[selectedIndex];
    const container = carouselRef.current;
    if (!card || !container) return;
    const targetLeft =
      selectedIndex === 0 ? 0 : Math.max(0, card.offsetLeft - 16);
    if (Math.abs(container.scrollLeft - targetLeft) < 8) return;
    programmaticScrollRef.current = true;
    container.scrollTo({left: targetLeft, behavior: "smooth"});
    const timer = window.setTimeout(() => {
      programmaticScrollRef.current = false;
    }, 320);
    return () => window.clearTimeout(timer);
  }, [selectedIndex, routes.length]);

  const handleCarouselScroll = () => {
    if (programmaticScrollRef.current || routes.length <= 1) return;
    const container = carouselRef.current;
    if (!container) return;
    const center = container.scrollLeft + container.clientWidth / 2;
    let closestIdx = selectedIndex;
    let minDistance = Infinity;
    cardRefs.current.forEach((card, idx) => {
      if (!card) return;
      const cardCenter = card.offsetLeft + card.offsetWidth / 2;
      const dist = Math.abs(center - cardCenter);
      if (dist < minDistance) {
        minDistance = dist;
        closestIdx = idx;
      }
    });
    if (closestIdx !== selectedIndex) {
      onSelectRoute(closestIdx);
    }
  };

  const selectedMatches = restAreasByRoute[selectedIndex] ?? [];
  const preferredOption = useMemo(
    () => navigationProviderOptions.find(opt => opt.id === preferredProvider) ?? null,
    [preferredProvider],
  );
  const originDisplay = origin ? origin.name : "";
  const destDisplay = target ? target.name : "";
  const canSuggestMyLocation =
    activeField === "origin" && Boolean(gpsOrigin) && origin?.key !== "my-location";
  const recentCoordinateItems = useMemo(
    () =>
      recentItems.filter(
        (entry): entry is Exclude<RecentSearchEntry, {kind: "query"}> =>
          entry.kind !== "query",
      ),
    [recentItems],
  );
  const showRecentInDirections =
    activeField !== null && !activeQuery && recentCoordinateItems.length > 0;
  const showDropdown =
    activeField !== null &&
    (Boolean(activeQuery) || canSuggestMyLocation || showRecentInDirections);

  return (
    <>
      <header className="directions-top-header" aria-label="출발지 및 목적지 입력">
        <div className="directions-top-row">
          <IconButton
            type="button"
            aria-label="출발지와 목적지 바꾸기"
            disabled={!origin && !target}
            onClick={handleSwap}
          >
            <Icon name="swap" size={18} />
          </IconButton>

          <div className="directions-inputs-col">
            <div className="directions-input-wrap">
              <input
                ref={originInputRef}
                type="search"
                className="directions-place-input"
                placeholder={
                  origin?.key === "my-location" && !originDisplay
                    ? "현재 위치 주소 확인 중..."
                    : "출발지 입력"
                }
                aria-label="출발지"
                value={activeField === "origin" ? originQuery : originDisplay}
                onFocus={() => {
                  setRecentItems(getRecentSearches());
                  setVisibleRecentCount(4);
                  setActiveField("origin");
                  setOriginQuery(origin ? origin.name : "");
                }}
                onChange={event => {
                  const val = event.target.value;
                  setActiveField("origin");
                  setOriginQuery(val);
                  if (!val.trim()) onChangeOrigin(null);
                }}
                onKeyDown={event => {
                  if (event.key === "Enter" && !event.nativeEvent.isComposing && combinedResults[0]) {
                    event.preventDefault();
                    selectPlaceItem(combinedResults[0]);
                  }
                }}
              />
            </div>
            <div className="directions-input-wrap">
              <input
                ref={destInputRef}
                type="search"
                className="directions-place-input"
                placeholder="목적지 입력"
                aria-label="목적지"
                value={activeField === "dest" ? destQuery : destDisplay}
                onFocus={() => {
                  setRecentItems(getRecentSearches());
                  setVisibleRecentCount(4);
                  setActiveField("dest");
                  setDestQuery(target ? target.name : "");
                }}
                onChange={event => {
                  const val = event.target.value;
                  setActiveField("dest");
                  setDestQuery(val);
                  if (!val.trim()) onChangeTarget(null);
                }}
                onKeyDown={event => {
                  if (event.key === "Enter" && !event.nativeEvent.isComposing && combinedResults[0]) {
                    event.preventDefault();
                    selectPlaceItem(combinedResults[0]);
                  }
                }}
              />
            </div>
          </div>

          <IconButton type="button" aria-label="길찾기 닫기" onClick={onClose}>
            <Icon name="close" size={20} />
          </IconButton>
        </div>

        {showDropdown && (
          <div className="directions-search-dropdown" role="listbox" aria-label="장소 검색 결과">
            {canSuggestMyLocation && gpsOrigin && (
              <button
                type="button"
                className="directions-search-item is-my-location"
                onClick={() => {
                  onChangeOrigin({
                    key: "my-location",
                    name: gpsAddress || "",
                    latitude: gpsOrigin.latitude,
                    longitude: gpsOrigin.longitude,
                  });
                  setOriginQuery("");
                  setActiveField(null);
                }}
              >
                <Icon name="locate" size={16} />
                <div>
                  <strong>{gpsAddress || "현재 위치 주소 확인 중..."}</strong>
                  <small>{gpsAddress ? "현재 위치" : "GPS 좌표로 주소를 불러오는 중입니다"}</small>
                </div>
              </button>
            )}
            {showRecentInDirections && (
              <>
                <div className="recent-search-header">
                  <span>최근 검색</span>
                  <button
                    type="button"
                    onClick={() => setRecentItems(clearRecentSearches())}
                  >
                    전체 삭제
                  </button>
                </div>
                <div
                  className="recent-search-list"
                  onScroll={event => {
                    const el = event.currentTarget;
                    if (
                      visibleRecentCount < recentCoordinateItems.length &&
                      el.scrollTop + el.clientHeight >= el.scrollHeight - 24
                    ) {
                      setVisibleRecentCount(count =>
                        Math.min(recentCoordinateItems.length, count + 3),
                      );
                    }
                  }}
                >
                  {recentCoordinateItems.slice(0, visibleRecentCount).map(entry => (
                    <div key={entry.key} className="recent-search-row">
                      <button
                        type="button"
                        className="directions-search-item flex-1 min-w-0"
                        onClick={() => {
                          setRecentItems(addRecentSearch(entry));
                          const navTarget: NavigationTarget = {
                            key: entry.key,
                            name: entry.name,
                            latitude: entry.latitude,
                            longitude: entry.longitude,
                            restAreaId: entry.kind === "rest" ? entry.restId : null,
                            stationId: entry.kind === "station" ? entry.stationId : null,
                          };
                          if (activeField === "origin") {
                            onChangeOrigin(navTarget);
                            setOriginQuery("");
                          } else if (activeField === "dest") {
                            onChangeTarget(navTarget);
                            setDestQuery("");
                          }
                          setActiveField(null);
                        }}
                      >
                        <Icon
                          name={
                            entry.kind === "rest" && entry.isLounge
                              ? "truck"
                              : entry.kind === "station"
                                ? "fuel"
                                : "pin"
                          }
                          size={16}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="directions-search-item-title">
                            <strong>{entry.name}</strong>
                            {(entry.kind === "rest" || entry.kind === "station") && (
                              <span className="is-cargo-badge">{entry.badge}</span>
                            )}
                            {entry.kind === "place" && entry.category && (
                              <span>{entry.category}</span>
                            )}
                          </div>
                          {entry.address && <small>{entry.address}</small>}
                        </div>
                      </button>
                      <button
                        type="button"
                        className="recent-search-delete"
                        aria-label={`${entry.name} 최근 검색 삭제`}
                        onClick={event => {
                          event.stopPropagation();
                          setRecentItems(removeRecentSearch(entry.key));
                        }}
                      >
                        <Icon name="close" size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
            {activeQuery && (
              searching && combinedResults.length === 0 ? (
                <p className="directions-search-hint">장소를 검색하고 있어요...</p>
              ) : combinedResults.length === 0 ? (
                <p className="directions-search-hint">일치하는 장소를 찾지 못했습니다.</p>
              ) : (
                combinedResults.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    className="directions-search-item"
                    onClick={() => selectPlaceItem(item)}
                  >
                    <Icon name="pin" size={16} />
                    <div className="min-w-0 flex-1">
                      <div className="directions-search-item-title">
                        <strong>{item.name}</strong>
                        {item.category && <span>{item.category}</span>}
                      </div>
                      {item.address && <small>{item.address}</small>}
                    </div>
                  </button>
                ))
              )
            )}
          </div>
        )}
      </header>

      {origin && target && (
        <div className="directions-dock-container">
          <section className="directions-bottom-ui" aria-label={`${target.name} 경로 안내`}>
            {sheetMode === "rest" && (
              <div className="directions-popup-sheet" role="region" aria-label="선택 경로상 휴게소">
                <div className="directions-provider-header">
                  <strong>경로상 휴게소 {selectedMatches.length}곳</strong>
                  <button
                    type="button"
                    className="directions-provider-close"
                    onClick={() => setSheetMode("none")}
                  >
                    닫기
                  </button>
                </div>
                {selectedMatches.length > 0 ? (
                  <div className="detail-route-areas-list">
                    {selectedMatches.map(match => (
                      <button
                        key={match.area.id}
                        type="button"
                        className="detail-route-area-chip"
                        onClick={() => {
                          setSheetMode("none");
                          onSelectRestArea?.(match.area.id);
                        }}
                      >
                        <span>{match.area.name}</span>
                        <small>{formatDistance(match.alongMeters)}</small>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="directions-empty-note">선택한 경로 주변에 경유 휴게소가 없습니다.</p>
                )}
              </div>
            )}

            {loading ? (
              <div
                className="directions-carousel"
                role="status"
                aria-busy="true"
                aria-label="경로 탐색 중"
              >
                {[0, 1].map(idx => (
                  <div
                    key={idx}
                    className={`directions-swipe-card is-loading-card ${idx === 0 ? "selected" : ""}`}
                  >
                    <div className="directions-card-header">
                      <span className="directions-loading-spinner" aria-hidden="true" />
                      <span className="directions-skeleton-bar w-[58%] h-[14px]" />
                    </div>
                    <span className="directions-skeleton-bar w-[48%] h-[26px] mt-[6px]" />
                    <span className="directions-skeleton-bar w-[34%] h-[13px] mt-[5px]" />
                    <span className="directions-skeleton-bar w-[66%] h-[13px] mt-[3px]" />
                    <span className="directions-skeleton-bar w-full h-[36px] mt-[8px] rounded-[7px]" />
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="directions-floating-status" role="status">
                <p>{error}</p>
                {!tooClose && (
                  <Button type="button" variant="secondary" onClick={onRetry}>
                    <Icon name="refresh" size={15} />
                    다시 탐색
                  </Button>
                )}
              </div>
            ) : (
              <div
                ref={carouselRef}
                className="directions-carousel"
                role="tablist"
                aria-label="대안 경로 카드 목록"
                onScroll={handleCarouselScroll}
              >
                {routes.map((route, index) => {
                  const selected = index === selectedIndex;
                  const matches = restAreasByRoute[index] ?? [];
                  const time = formatDurationParts(route.durationSeconds);
                  const titleText =
                    index === 0
                      ? "실시간 추천"
                      : route.summaryRoad
                        ? route.summaryRoad
                        : route.label;
                  const showRoadSuffix = index > 0 && Boolean(route.summaryRoad);
                  return (
                    <div
                      key={route.id}
                      ref={element => {
                        cardRefs.current[index] = element;
                      }}
                      role="tab"
                      tabIndex={0}
                      aria-selected={selected}
                      className={`directions-swipe-card ${selected ? "selected" : ""}`}
                      onClick={() => onSelectRoute(index)}
                      onKeyDown={event => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onSelectRoute(index);
                        }
                      }}
                    >
                      <div className="directions-card-header">
                        <span className="directions-card-num">{index + 1}</span>
                        <span className="directions-card-title">
                          <strong>{titleText}</strong>
                          {showRoadSuffix && <em> 이용</em>}
                        </span>
                      </div>
                      <div className="directions-card-time">
                        {time.hours > 0 && (
                          <>
                            <strong>{time.hours}</strong>
                            <span>시간 </span>
                          </>
                        )}
                        <strong>{time.minutes}</strong>
                        <span>분</span>
                      </div>
                      <span className="directions-card-meta">
                        {formatDistance(route.distanceMeters)}
                      </span>
                      <span className="directions-card-sub">
                        {matches.length > 0
                          ? `경로상 휴게소 ${matches.length}곳`
                          : "경로상 휴게소 없음"}
                      </span>
                      <div className="directions-card-actions">
                        <button
                          type="button"
                          className="directions-card-start-btn"
                          onClick={event => {
                            event.stopPropagation();
                            onSelectRoute(index);
                            if (preferredOption) {
                              launchNavigationApp(
                                preferredOption.id,
                                target,
                                effectiveOriginPoint,
                              );
                            } else {
                              openProviderSheet();
                            }
                          }}
                        >
                          <Icon name="car" size={15} />
                          <span>
                            {preferredOption ? `${preferredOption.label} 안내` : "안내 시작"}
                          </span>
                        </button>
                        {preferredOption && (
                          <button
                            type="button"
                            className="directions-card-app-switch"
                            aria-label="네비게이션 앱 변경"
                            title="네비게이션 앱 변경"
                            onClick={event => {
                              event.stopPropagation();
                              onSelectRoute(index);
                              openProviderSheet();
                            }}
                          >
                            <Icon name="chevronUp" size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {origin && target && sheetMode === "provider" && (
        <div
          className={`directions-action-backdrop ${sheetClosing ? "is-closing" : ""}`}
          onClick={closeProviderSheet}
        >
          <div
            className={`directions-action-sheet ${sheetClosing ? "is-closing" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label="네비게이션 앱 선택"
            onClick={event => event.stopPropagation()}
            onAnimationEnd={() => {
              if (sheetClosing) {
                setSheetClosing(false);
                setSheetMode("none");
              }
            }}
          >
            <div className="directions-action-handle" aria-hidden="true" />
            <div className="directions-action-header">
              <div>
                <strong>네비게이션 앱 선택</strong>
                <p>{target.name}까지 길안내를 시작합니다</p>
              </div>
              <IconButton
                type="button"
                aria-label="네비게이션 앱 선택 닫기"
                onClick={closeProviderSheet}
              >
                <Icon name="close" size={18} />
              </IconButton>
            </div>
            <div className="directions-provider-list">
              {navigationProviderOptions.map(option => {
                const isPreferred = preferredProvider === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={`directions-provider-row ${isPreferred ? "is-preferred" : ""}`}
                    onClick={() => {
                      if (rememberChoice) {
                        setPreferredNavigationProvider(option.id);
                        setPreferredProvider(option.id);
                      } else {
                        setPreferredNavigationProvider(null);
                        setPreferredProvider(null);
                      }
                      closeProviderSheet();
                      launchNavigationApp(option.id, target, effectiveOriginPoint);
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="directions-provider-row-title">
                        <strong>{option.label}</strong>
                        {isPreferred && <span>기본</span>}
                      </div>
                      <small>{option.description}</small>
                    </div>
                    <Icon name="chevron" size={16} />
                  </button>
                );
              })}
            </div>
            <label className="directions-remember-check">
              <input
                type="checkbox"
                checked={rememberChoice}
                onChange={event => {
                  const checked = event.target.checked;
                  setRememberChoice(checked);
                  if (!checked) {
                    setPreferredNavigationProvider(null);
                    setPreferredProvider(null);
                  }
                }}
              />
              <span>다음에도 선택한 네비게이션 앱으로 바로 열기</span>
            </label>
          </div>
        </div>
      )}
    </>
  );
}
