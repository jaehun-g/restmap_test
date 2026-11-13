"use client";

import {useEffect, useMemo, useRef, useState} from "react";
import {sharedClasses} from "@/lib/shared-classes";
import {Input} from "@/components/ui/field";
import {IconButton} from "@/components/ui/button";
import {stationKey, stationLabel, type GasStation} from "@/lib/gas-stations";
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
import type {useSearchQuery} from "@/hooks/use-search-query";

type LocalSuggestion =
  | {
      key: string;
      kind: "rest";
      restId: number;
      name: string;
      address: string;
      badge: string;
      isLounge: boolean;
      latitude: number;
      longitude: number;
    }
  | {
      key: string;
      kind: "station";
      stationId: string;
      name: string;
      address: string;
      badge: string;
      latitude: number;
      longitude: number;
    };

export default function SearchBox({
  search,
  disabled = false,
  includeStations = false,
  areas = [],
  stations = [],
  onSelectRestArea,
  onSelectStation,
  onSelectGeneralPlace,
  onClearGeneralPlace,
}: {
  search: ReturnType<typeof useSearchQuery>;
  disabled?: boolean;
  includeStations?: boolean;
  areas?: readonly RestArea[];
  stations?: readonly GasStation[];
  onSelectRestArea?: (id: number) => void;
  onSelectStation?: (stationId: string) => void;
  onSelectGeneralPlace?: (place: PlaceSearchItem) => void;
  onClearGeneralPlace?: () => void;
}) {
  const unifiedEnabled = Boolean(onSelectGeneralPlace);
  const [focused, setFocused] = useState(false);
  const [remoteResults, setRemoteResults] = useState<PlaceSearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [recentItems, setRecentItems] = useState<RecentSearchEntry[]>(() =>
    getRecentSearches(),
  );
  const [visibleRecentCount, setVisibleRecentCount] = useState(4);
  const wrapRef = useRef<HTMLDivElement>(null);

  const normalizedQuery = useMemo(
    () => (unifiedEnabled ? normalizePlaceSearchQuery(search.input) : ""),
    [unifiedEnabled, search.input],
  );

  const localSuggestions = useMemo<LocalSuggestion[]>(() => {
    if (!unifiedEnabled || !normalizedQuery) return [];
    const lowered = normalizedQuery.toLocaleLowerCase("ko-KR");
    const items: LocalSuggestion[] = [];

    for (const area of areas) {
      if (!hasCoordinates(area)) continue;
      const haystack = `${area.name} ${area.routeName ?? ""} ${area.directionLabel ?? ""}`.toLocaleLowerCase("ko-KR");
      if (haystack.includes(lowered)) {
        const isLounge = area.facilities.has_truck_lounge === true;
        items.push({
          key: `rest:${area.id}`,
          kind: "rest",
          restId: area.id,
          name: area.name,
          address: [area.routeName, area.directionLabel].filter(Boolean).join(" · ") || "고속도로 휴게소",
          badge: isLounge ? "화물라운지" : "휴게소",
          isLounge,
          latitude: area.latitude,
          longitude: area.longitude,
        });
        if (items.length >= 4) break;
      }
    }

    let stationCount = 0;
    for (const station of stations) {
      if (!hasCoordinates(station)) continue;
      const haystack = `${station.name} ${station.address ?? ""} ${station.routeName ?? ""}`.toLocaleLowerCase("ko-KR");
      if (haystack.includes(lowered)) {
        const id = stationKey(station);
        items.push({
          key: `station:${id}`,
          kind: "station",
          stationId: id,
          name: station.name,
          address: station.address || stationLabel(station),
          badge: station.services.cargo
            ? "화물특화 주유소"
            : station.brand === "EX"
              ? "고속도로 주유소"
              : "주유소",
          latitude: station.latitude,
          longitude: station.longitude,
        });
        stationCount++;
        if (stationCount >= 3) break;
      }
    }

    return items;
  }, [unifiedEnabled, normalizedQuery, areas, stations]);

  useEffect(() => {
    if (!unifiedEnabled || !focused || !normalizedQuery) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      void fetch(`/api/places?q=${encodeURIComponent(normalizedQuery)}`, {
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
  }, [unifiedEnabled, focused, normalizedQuery]);

  useEffect(() => {
    if (!focused) return;
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setFocused(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [focused]);

  const filteredRemoteResults = useMemo(() => {
    if (!normalizedQuery) return [];
    const localCoords = localSuggestions.map(item => ({
      name: item.name,
      lat: item.latitude,
      lng: item.longitude,
    }));
    return remoteResults
      .filter(
        remote =>
          !localCoords.some(
            local =>
              local.name === remote.name ||
              (Math.abs(local.lat - remote.latitude) < 0.002 &&
                Math.abs(local.lng - remote.longitude) < 0.002),
          ),
      )
      .slice(0, 6);
  }, [normalizedQuery, localSuggestions, remoteResults]);

  const showRecent =
    unifiedEnabled && focused && !normalizedQuery && recentItems.length > 0;
  const showSuggestions =
    unifiedEnabled &&
    focused &&
    Boolean(normalizedQuery) &&
    (localSuggestions.length > 0 || filteredRemoteResults.length > 0 || searching);
  const showDropdown = showRecent || showSuggestions;

  const selectRecentEntry = (entry: RecentSearchEntry) => {
    setFocused(false);
    setRecentItems(addRecentSearch(entry));
    if (entry.kind === "rest") {
      search.clear(false);
      setRemoteResults([]);
      onClearGeneralPlace?.();
      onSelectRestArea?.(entry.restId);
    } else if (entry.kind === "station") {
      search.clear(false);
      setRemoteResults([]);
      onClearGeneralPlace?.();
      onSelectStation?.(entry.stationId);
    } else if (entry.kind === "place") {
      search.clear(false);
      setRemoteResults([]);
      onSelectGeneralPlace?.(entry.place);
    } else {
      onClearGeneralPlace?.();
      search.flush(entry.query);
    }
  };

  const submitSearch = () => {
    setFocused(false);
    if (!unifiedEnabled) {
      search.flush();
      return;
    }
    if (!normalizedQuery) {
      search.clear();
      onClearGeneralPlace?.();
      return;
    }
    if (localSuggestions.length > 0) {
      setRecentItems(
        addRecentSearch({
          key: `query:${normalizedQuery}`,
          kind: "query",
          query: normalizedQuery,
          name: normalizedQuery,
        }),
      );
      onClearGeneralPlace?.();
      search.flush();
      return;
    }
    if (filteredRemoteResults[0]) {
      const first = filteredRemoteResults[0];
      setRecentItems(
        addRecentSearch({
          key: `place:${first.id}`,
          kind: "place",
          place: first,
          name: first.name,
          address: first.address,
          category: first.category,
          latitude: first.latitude,
          longitude: first.longitude,
        }),
      );
      search.clear(false);
      setRemoteResults([]);
      onSelectGeneralPlace?.(first);
      return;
    }
    setRecentItems(
      addRecentSearch({
        key: `query:${normalizedQuery}`,
        kind: "query",
        query: normalizedQuery,
        name: normalizedQuery,
      }),
    );
    search.flush();
  };

  const searchBoxNode = (
    <div className={sharedClasses.searchBox}>
      {!unifiedEnabled && <Icon name="search" size={18} />}
      <Input
        type="search"
        value={search.input}
        placeholder={
          includeStations ? "장소·주소·휴게소·노선·주유소 검색" : "휴게소명·노선명 검색"
        }
        aria-label={
          includeStations
            ? "장소·주소·휴게소명·노선명·주유소명 통합 검색"
            : "휴게소명과 노선명 검색"
        }
        disabled={disabled}
        onFocus={() => {
          setRecentItems(getRecentSearches());
          setVisibleRecentCount(4);
          setFocused(true);
        }}
        onChange={event => {
          setFocused(true);
          if (event.target.value === "") {
            setRecentItems(getRecentSearches());
            setVisibleRecentCount(4);
            search.clear();
            onClearGeneralPlace?.();
          } else {
            search.setInput(event.target.value);
          }
        }}
        onKeyDown={event => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            submitSearch();
            (event.currentTarget as HTMLInputElement).blur();
          } else if (event.key === "Escape") {
            setFocused(false);
          }
        }}
        variant="search"
      />
      {search.input && (
        <IconButton
          disabled={disabled}
          aria-label="검색어 지우기"
          onClick={() => {
            search.clear();
            onClearGeneralPlace?.();
            setRemoteResults([]);
            setRecentItems(getRecentSearches());
            setVisibleRecentCount(4);
          }}
        >
          <Icon name="close" size={16} />
        </IconButton>
      )}
      {unifiedEnabled && (
        <IconButton
          type="button"
          disabled={disabled}
          aria-label="검색"
          onClick={submitSearch}
        >
          <Icon name="search" size={18} />
        </IconButton>
      )}
    </div>
  );

  if (!unifiedEnabled) {
    return searchBoxNode;
  }

  return (
    <div ref={wrapRef} className="unified-search-wrap relative">
      {searchBoxNode}

      {showDropdown && (
        <div className="unified-search-dropdown" role="listbox" aria-label="통합 검색 자동완성">
          {showRecent ? (
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
                    visibleRecentCount < recentItems.length &&
                    el.scrollTop + el.clientHeight >= el.scrollHeight - 24
                  ) {
                    setVisibleRecentCount(count =>
                      Math.min(recentItems.length, count + 3),
                    );
                  }
                }}
              >
                {recentItems.slice(0, visibleRecentCount).map(entry => (
                  <div key={entry.key} className="recent-search-row">
                    <button
                      type="button"
                      className="directions-search-item flex-1 min-w-0"
                      onClick={() => selectRecentEntry(entry)}
                    >
                      <Icon
                        name={
                          entry.kind === "rest" && entry.isLounge
                            ? "truck"
                            : entry.kind === "station"
                              ? "fuel"
                              : entry.kind === "query"
                                ? "search"
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
                        {entry.kind !== "query" && entry.address && (
                          <small>{entry.address}</small>
                        )}
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
          ) : (
            <>
              {localSuggestions.map(item => (
                <button
                  key={item.key}
                  type="button"
                  className="directions-search-item"
                  onClick={() => {
                    setFocused(false);
                    setRecentItems(
                      addRecentSearch(
                        item.kind === "rest"
                          ? {
                              key: item.key,
                              kind: "rest",
                              restId: item.restId,
                              name: item.name,
                              address: item.address,
                              badge: item.badge,
                              isLounge: item.isLounge,
                              latitude: item.latitude,
                              longitude: item.longitude,
                            }
                          : {
                              key: item.key,
                              kind: "station",
                              stationId: item.stationId,
                              name: item.name,
                              address: item.address,
                              badge: item.badge,
                              latitude: item.latitude,
                              longitude: item.longitude,
                            },
                      ),
                    );
                    search.clear(false);
                    setRemoteResults([]);
                    onClearGeneralPlace?.();
                    if (item.kind === "rest") {
                      onSelectRestArea?.(item.restId);
                    } else {
                      onSelectStation?.(item.stationId);
                    }
                  }}
                >
                  <Icon
                    name={item.kind === "rest" && item.isLounge ? "truck" : item.kind === "station" ? "fuel" : "pin"}
                    size={16}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="directions-search-item-title">
                      <strong>{item.name}</strong>
                      <span className="is-cargo-badge">{item.badge}</span>
                    </div>
                    {item.address && <small>{item.address}</small>}
                  </div>
                </button>
              ))}

              {filteredRemoteResults.map(item => (
                <button
                  key={item.id}
                  type="button"
                  className="directions-search-item"
                  onClick={() => {
                    setFocused(false);
                    setRecentItems(
                      addRecentSearch({
                        key: `place:${item.id}`,
                        kind: "place",
                        place: item,
                        name: item.name,
                        address: item.address,
                        category: item.category,
                        latitude: item.latitude,
                        longitude: item.longitude,
                      }),
                    );
                    search.clear(false);
                    setRemoteResults([]);
                    onSelectGeneralPlace?.(item);
                  }}
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
              ))}

              {searching && localSuggestions.length === 0 && filteredRemoteResults.length === 0 && (
                <p className="directions-search-hint">장소를 검색하고 있어요...</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
