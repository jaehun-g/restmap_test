"use client";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {loadKakaoMaps, type KakaoMap as MapInstance} from "@/lib/kakao-sdk";
import {createPlaceMarkers} from "@/lib/kakao-place-markers";
import {restPlace, stationPlace, type MapPlace} from "@/lib/map-places";
import type {GasStation} from "@/lib/gas-stations";
import {createStationMapCard} from "@/lib/station-map-card";
import {createHighwayRouteLayer} from "@/lib/kakao-highway-route";
import {createHighwayRouteViewport} from "@/lib/kakao-route-viewport";
import {useHighwayRoute} from "@/hooks/use-highway-route";
import {createMapCard} from "@/lib/map-card";
import {MapFitPolicy, type MapFitRequest} from "@/lib/map-fit-policy";
import {hasCoordinates, type RestArea} from "@/lib/rest-areas";
import {scopeLabel} from "@/lib/geo-search";
import {
  createLocationMapLayer,
  type MobileMapLocation,
  type MobileMapMemory,
} from "@/lib/kakao-location";
import Icon from "./icon";

const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY?.trim();
const emptyStations: GasStation[] = [];
export default function KakaoMap({
  areas,
  selectedId,
  onSelect,
  onDetails,
  audience = "admin",
  showCard = true,
  deferFit = false,
  fitRequest,
  dataVersion,
  cardViewport,
  viewportVersion,
  mobileLocation,
  selectedRouteName = null,
  onClearRoute,
  stations = emptyStations,
  selectedStationId = null,
  onStationSelect,
  onStationDetails,
  stationsLoading = false,
  stationError,
  onRetryStations,
  locationDisabled = false,
}: {
  areas: RestArea[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  onDetails: (id: number) => void;
  audience?: "admin" | "mobile";
  showCard?: boolean;
  deferFit?: boolean;
  fitRequest?: MapFitRequest;
  dataVersion?: string;
  cardViewport?: (canvas: DOMRect) => DOMRect;
  viewportVersion?: string;
  mobileLocation?: MobileMapLocation;
  selectedRouteName?: string | null;
  onClearRoute?: () => void;
  stations?: GasStation[];
  selectedStationId?: number | null;
  onStationSelect?: (id: number | null) => void;
  onStationDetails?: (id: number) => void;
  stationsLoading?: boolean;
  stationError?: string | null;
  onRetryStations?: () => void;
  locationDisabled?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const layer = useRef<ReturnType<typeof createPlaceMarkers> | null>(null);
  const places = useMemo(
    () => [...areas.map(restPlace), ...stations.map(stationPlace)],
    [areas, stations],
  );
  const positionedItems = useMemo(() => places.map(place => place.record), [places]);
  const clearSelection = useCallback(() => {
    onSelect(null);
    onStationSelect?.(null);
  }, [onSelect, onStationSelect]);
  const selectPlace = useCallback(
    (place: MapPlace) => {
      if (place.kind === "station") onStationSelect?.(place.record.id);
      else onSelect(place.record.id);
    },
    [onSelect, onStationSelect],
  );
  const fitPolicy = useRef<{map: MapInstance; policy: MapFitPolicy} | null>(null);
  const routeViewport = useRef<{
    map: MapInstance;
    view: ReturnType<typeof createHighwayRouteViewport>;
  } | null>(null);
  const lastSelection = useRef<{map: MapInstance | null; key: string | null}>({
    map: null,
    key: null,
  });
  const locationLayer = useRef<ReturnType<typeof createLocationMapLayer> | null>(null);
  const mobileMemory = useRef<MobileMapMemory>({});
  const locationEnabled = !!mobileLocation;
  const mobileEnabled = locationEnabled && audience === "mobile";
  const {cameraReady, radiusReady, zoomChanged, mapMoved, research} = mobileLocation ?? {};
  const [map, setMap] = useState<MapInstance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const highway = useHighwayRoute(selectedRouteName, !!map && !error);
  const card = useCallback(
    (place: MapPlace) =>
      place.kind === "station"
        ? createStationMapCard(
            place.record,
            () => onStationSelect?.(null),
            () => onStationDetails?.(place.record.id),
          )
        : createMapCard(
            place.record,
            audience,
            () => onSelect(null),
            () => onDetails(place.record.id),
          ),
    [audience, onSelect, onDetails, onStationSelect, onStationDetails],
  );
  useEffect(() => {
    if (!appKey) {
      return;
    }
    let cancelled = false;
    let observer: ResizeObserver | undefined;
    loadKakaoMaps(appKey)
      .then(sdk => {
        if (cancelled || !container.current) return;
        const saved = locationEnabled ? mobileMemory.current.viewport : undefined;
        const instance = new sdk.Map(container.current, {
          center: new sdk.LatLng(saved?.center.latitude ?? 36.4, saved?.center.longitude ?? 127.8),
          level: saved?.level ?? 13,
        });
        observer = new ResizeObserver(() => {
          const center = instance.getCenter();
          instance.relayout();
          instance.setCenter(center);
        });
        observer.observe(container.current);
        setMap(instance);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "카카오맵을 불러오지 못했습니다.");
        }
      });
    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [attempt, locationEnabled]);
  useEffect(() => {
    const sdk = window.kakao?.maps;
    if (!map || !sdk) return;
    const current = createPlaceMarkers(
      sdk,
      map,
      places,
      selectPlace,
      card,
      () => {
        const bounds = container.current!.getBoundingClientRect();
        return cardViewport ? cardViewport(bounds) : bounds;
      },
      clearSelection,
    );
    layer.current = current;
    return () => {
      current.dispose();
      layer.current = null;
    };
  }, [map, places, selectPlace, card, cardViewport, clearSelection]);
  useEffect(() => {
    const sdk = window.kakao?.maps;
    if (!map || !sdk) return;
    const current = createHighwayRouteLayer(sdk, map);
    current.update(highway.route);
    return () => current.dispose();
  }, [map, highway.route]);
  useEffect(() => {
    const sdk = window.kakao?.maps;
    if (!map || !sdk || !cameraReady || !radiusReady || !zoomChanged || !mapMoved || !research)
      return;
    const current = createLocationMapLayer(
      sdk,
      map,
      {
        cameraReady,
        radiusReady,
        zoomChanged,
        mapMoved,
        research,
        dragStart: () => {
          layer.current?.select(null);
          onSelect(null);
        },
        zoomStart: () => layer.current?.suspendCardAdjustment(),
      },
      mobileMemory.current,
      {
        container: container.current,
        viewport: () => {
          const bounds = container.current?.getBoundingClientRect() ?? new DOMRect();
          return cardViewport ? cardViewport(bounds) : bounds;
        },
      },
    );
    locationLayer.current = current;
    return () => {
      current.dispose();
      locationLayer.current = null;
    };
  }, [
    map,
    cameraReady,
    radiusReady,
    zoomChanged,
    mapMoved,
    research,
    onSelect,
    onStationSelect,
    cardViewport,
  ]);
  const position = mobileLocation?.position;
  const scope = mobileLocation?.scope;
  const cameraRequest = mobileLocation?.cameraRequest;
  const locationRadius = mobileLocation?.locationRadius;
  useEffect(() => {
    locationLayer.current?.setRouteMode(!!selectedRouteName);
    if (scope)
      locationLayer.current?.update(
        position ?? null,
        scope,
        cameraRequest ?? null,
        locationRadius ?? null,
      );
  }, [
    map,
    position,
    scope,
    cameraRequest,
    locationRadius,
    selectedRouteName,
    cameraReady,
    radiusReady,
    zoomChanged,
    mapMoved,
    research,
    onSelect,
    onStationSelect,
  ]);
  const fitSource = fitRequest ? dataVersion : areas;
  useEffect(() => {
    if (!map) return;
    if (mobileEnabled) {
      if (
        !selectedRouteName &&
        scope?.kind === "all" &&
        dataVersion &&
        !stationsLoading &&
        positionedItems.some(hasCoordinates)
      )
        locationLayer.current?.fitInitialResults(() => layer.current?.fit());
      return;
    }
    if (fitPolicy.current?.map !== map) fitPolicy.current = {map, policy: new MapFitPolicy()};
    if (
      fitPolicy.current.policy.update(fitSource, fitRequest, deferFit) &&
      !selectedRouteName &&
      (!scope || scope.kind === "all")
    )
      layer.current?.fit();
  }, [
    map,
    fitSource,
    fitRequest,
    deferFit,
    mobileEnabled,
    scope,
    dataVersion,
    areas,
    positionedItems,
    stationsLoading,
    selectedRouteName,
  ]);
  useEffect(() => {
    const sdk = window.kakao?.maps;
    if (!map || !sdk) return;
    if (routeViewport.current?.map !== map)
      routeViewport.current = {map, view: createHighwayRouteViewport(sdk, map)};
    routeViewport.current.view.update(selectedRouteName, highway.route, positionedItems, action => {
      if (locationLayer.current) locationLayer.current.fitRoute(action);
      else action();
    });
  }, [map, selectedRouteName, highway.route, positionedItems]);
  const selectedKey =
    selectedStationId !== null
      ? (places.find(place => place.kind === "station" && place.record.id === selectedStationId)
          ?.key ?? null)
      : selectedId !== null
        ? `rest:${selectedId}`
        : null;
  useEffect(() => {
    const move = lastSelection.current.map !== map || lastSelection.current.key !== selectedKey;
    layer.current?.select(selectedKey, showCard, move);
    lastSelection.current = {map, key: selectedKey};
  }, [map, places, selectedKey, showCard, card, cardViewport]);
  useEffect(() => {
    layer.current?.adjustCard();
  }, [map, viewportVersion]);
  useEffect(() => {
    if (selectedKey === null) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        onSelect(null);
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [selectedKey, onSelect, onStationSelect]);
  const ready = !!map && !error;
  return (
    <section className="map-panel" aria-label="휴게소 위치 지도">
      <div ref={container} className="map-canvas" />
      {!ready && (
        <div className="map-placeholder" role="status">
          <div className="placeholder-icon">
            <Icon name="pin" size={36} />
          </div>
          <h2>
            {!appKey
              ? "카카오맵을 연결해주세요"
              : error
                ? "지도를 불러오지 못했어요"
                : "지도를 불러오는 중이에요"}
          </h2>
          {!appKey ? (
            <>
              <p>
                <code>.env.local</code>에 JavaScript 키를 설정해주세요.
              </p>
              <code className="setting-name">NEXT_PUBLIC_KAKAO_MAP_APP_KEY</code>
            </>
          ) : error ? (
            <>
              <p>{error}</p>
              <button
                className="button secondary"
                onClick={() => {
                  setError(null);
                  setMap(null);
                  setAttempt(value => value + 1);
                }}
              >
                다시 시도
              </button>
            </>
          ) : (
            <span className="loading-dots">•••</span>
          )}
        </div>
      )}
      {(ready || mobileLocation) && (
        <div className={`map-topbar ${mobileEnabled ? "mobile-navigation" : ""}`}>
          {mobileEnabled && mobileLocation ? (
            <>
              {(selectedRouteName || mobileLocation.scope.kind !== "radius") && (
                <div className="mobile-navigation-row">
                  <span className="map-scope-label" role="status">
                    {selectedRouteName
                      ? `${selectedRouteName} 전체 구간`
                      : scopeLabel(mobileLocation.scope)}
                  </span>
                </div>
              )}
              {ready && !selectedRouteName && mobileLocation.researchAvailable && (
                <button
                  className="map-button map-research-button"
                  onClick={() => {
                    onSelect(null);
                    locationLayer.current?.research();
                  }}
                >
                  <Icon name="refresh" size={16} />
                  지도 내 재검색
                </button>
              )}
              {!selectedRouteName && mobileLocation.error && (
                <p className="map-location-error" role="status">
                  {mobileLocation.error.message}
                </p>
              )}
            </>
          ) : (
            <>
              <span className="map-hint">마커를 눌러 장소 정보 보기</span>
              <button
                className="map-button"
                onClick={() => {
                  onSelect(null);
                  if (selectedRouteName)
                    routeViewport.current?.view.update(
                      selectedRouteName,
                      highway.route,
                      positionedItems,
                      undefined,
                      true,
                    );
                  else layer.current?.fit();
                }}
                disabled={!highway.route && !positionedItems.some(hasCoordinates)}
              >
                <Icon name="fit" size={17} />
                결과 전체 보기
              </button>
            </>
          )}
          {ready && highway.error && (
            <div className="map-route-error" role="status">
              <span>{highway.error}</span>
              <button type="button" className="map-button" onClick={highway.retry}>
                다시 시도
              </button>
            </div>
          )}
          {stationError && (
            <div className="map-route-error" role="status">
              <span>{stationError}</span>
              <button type="button" className="map-button" onClick={onRetryStations}>
                주유소 다시 조회
              </button>
            </div>
          )}
        </div>
      )}
      {ready && (
        <>
          <div className="map-legend">
            <span>
              <i />
              일반
            </span>
            <span>
              <i className="legend-lounge" />
              화물차 라운지
            </span>
            {stations.length > 0 && (
              <span>
                <i className="legend-station" />
                GS 주유소
              </span>
            )}
            {stations.length > 0 && areas.length > 0 && (
              <span>
                <i className="legend-mixed" />
                휴게소+주유소
              </span>
            )}
            {highway.route && (
              <span>
                <i className="legend-route" />
                선택 노선
              </span>
            )}
          </div>
          {mobileLocation && (
            <div className="location-control">
              <button
                className="map-button"
                aria-label="내 위치로 이동"
                disabled={mobileLocation.requesting || locationDisabled}
                onClick={() => {
                  onSelect(null);
                  if (selectedRouteName) onClearRoute?.();
                  mobileLocation.locate();
                }}
              >
                <Icon name="locate" size={20} />
                <span>{mobileLocation.requesting ? "확인 중" : "내 위치"}</span>
              </button>
            </div>
          )}
        </>
      )}
      {ready && !mobileEnabled && mobileLocation && (
        <div className="admin-location-status">
          {mobileLocation.error && (
            <p className="map-location-error" role="status">
              {mobileLocation.error.message}
            </p>
          )}
          {!selectedRouteName && mobileLocation.researchAvailable && (
            <button
              className="map-button"
              disabled={locationDisabled}
              onClick={() => {
                onSelect(null);
                locationLayer.current?.research();
              }}
            >
              <Icon name="refresh" size={16} />
              지도 내 재검색
            </button>
          )}
        </div>
      )}
    </section>
  );
}
