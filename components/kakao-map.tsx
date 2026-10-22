"use client";
import {Button} from "@/components/ui/button";
import {sharedClasses} from "@/lib/shared-classes";
import {cn} from "@/lib/design-system";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {loadKakaoMaps, type KakaoMap as MapInstance} from "@/lib/kakao-sdk";
import {createPlaceMarkers} from "@/lib/kakao-place-markers";
import {restPlace, stationPlace, type MapPlace} from "@/lib/map-places";
import type {GasStation} from "@/lib/gas-stations";
import {stationKey} from "@/lib/gas-stations";
import {mapCardOverlayArea} from "@/lib/map-card-layout";
import {createStationMapCard} from "@/lib/station-map-card";
import {createHighwayRouteLayer} from "@/lib/kakao-highway-route";
import {createHighwayRouteViewport} from "@/lib/kakao-route-viewport";
import {useHighwayRoute} from "@/hooks/use-highway-route";
import {createMapCard} from "@/lib/map-card";
import {markerLayerSignature} from "@/lib/marker-layer";
import {MapFitPolicy, type MapFitRequest} from "@/lib/map-fit-policy";
import {hasCoordinates, type RestArea} from "@/lib/rest-areas";
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
  onFullscreen,
  fullscreen = false,
  linkedStationsByRestId,
  selectedDirection = null,
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
  selectedStationId?: string | null;
  onStationSelect?: (id: string | null) => void;
  onStationDetails?: (id: string) => void;
  stationsLoading?: boolean;
  stationError?: string | null;
  onRetryStations?: () => void;
  locationDisabled?: boolean;
  onFullscreen?: () => void;
  fullscreen?: boolean;
  linkedStationsByRestId?: ReadonlyMap<number, GasStation[]>;
  selectedDirection?: string | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const topbar = useRef<HTMLDivElement>(null);
  const legend = useRef<HTMLDivElement>(null);
  const layer = useRef<ReturnType<typeof createPlaceMarkers> | null>(null);
  const placeSelected = useRef(selectedId !== null || selectedStationId !== null);
  const places = useMemo(
    () => [...areas.map(restPlace), ...stations.map(stationPlace)],
    [areas, stations],
  );
  const [prevPlaces, setPrevPlaces] = useState(places);
  const [committedPlaces, setCommittedPlaces] = useState(places);

  const radius = mobileLocation?.scope.kind === "radius" ? mobileLocation.scope.radiusMeters : null;
  const [prevRadius, setPrevRadius] = useState(radius);

  // 줌인(반경 축소) 시: 이미 이전 넓은 반경의 주유소 데이터가 메모리에 있으므로 서버 응답을 기다리지 않고 즉시 반영하여 반경 밖 마커가 남거나 쪼개지는 현상을 방지한다.
  // 줌아웃(반경 확대) 시: 새 영역의 주유소가 서버에서 올 때까지 stationsLoading 동안 대기하여 단일 핀 중간 노출을 방지한다.
  const isZoomingIn = radius !== null && prevRadius !== null && radius < prevRadius;

  if (places !== prevPlaces) {
    if (!stationsLoading || isZoomingIn) {
      setPrevPlaces(places);
      setCommittedPlaces(places);
      setPrevRadius(radius);
    }
  } else if (radius !== prevRadius && (!stationsLoading || isZoomingIn)) {
    setPrevRadius(radius);
  }

  const markerSignature = useMemo(() => markerLayerSignature(committedPlaces), [committedPlaces]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 표시 단위가 같으면 기존 레이어의 배열 참조를 유지한다.
  const markerPlaces = useMemo(() => committedPlaces, [markerSignature]);
  const positionedItems = useMemo(() => committedPlaces.map(place => place.record), [committedPlaces]);
  const linkedStationsRef = useRef<ReadonlyMap<number, GasStation[]> | undefined>(linkedStationsByRestId);
  useEffect(() => {
    linkedStationsRef.current = linkedStationsByRestId;
  }, [linkedStationsByRestId]);
  const clearSelection = useCallback(() => {
    placeSelected.current = false;
    onSelect(null);
    onStationSelect?.(null);
  }, [onSelect, onStationSelect]);
  const selectPlace = useCallback(
    (place: MapPlace) => {
      placeSelected.current = true;
      if (place.kind === "station") onStationSelect?.(stationKey(place.record));
      else onSelect(place.record.id);
    },
    [onSelect, onStationSelect],
  );
  const fitPolicy = useRef<{
    map: MapInstance;
    policy: MapFitPolicy;
  } | null>(null);
  const routeViewport = useRef<{
    map: MapInstance;
    view: ReturnType<typeof createHighwayRouteViewport>;
  } | null>(null);
  const lastSelection = useRef<{
    map: MapInstance | null;
    key: string | null;
  }>({
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
  useEffect(() => {
    placeSelected.current = selectedId !== null || selectedStationId !== null;
  }, [selectedId, selectedStationId]);
  const highway = useHighwayRoute(selectedRouteName, !!map && !error);
  const card = useCallback(
    (place: MapPlace) =>
      place.kind === "station"
        ? createStationMapCard(
            place.record,
            () => onStationSelect?.(null),
            () => onStationDetails?.(stationKey(place.record)),
          )
        : createMapCard(
            place.record,
            audience,
            () => onSelect(null),
            () => onDetails(place.record.id),
            linkedStationsRef.current?.get(place.record.id),
          ),
    [audience, onSelect, onDetails, onStationSelect, onStationDetails],
  );
  const runProgrammaticMapAction = useCallback(
    (action: () => void, expectZoomChange = false) => {
      if (locationEnabled && locationLayer.current) {
        locationLayer.current.runProgrammaticMapAction(action, expectZoomChange);
        return;
      }
      action();
    },
    [locationEnabled],
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
      markerPlaces,
      selectPlace,
      card,
      () => {
        const bounds = container.current!.getBoundingClientRect();
        const view = cardViewport ? cardViewport(bounds) : bounds;
        const area = mapCardOverlayArea(
          view,
          topbar.current?.getBoundingClientRect(),
          legend.current?.getBoundingClientRect(),
        );
        return new DOMRect(area.left, area.top, area.width, area.height);
      },
      clearSelection,
      audience === "mobile" ? "above" : "below",
      runProgrammaticMapAction,
      !selectedRouteName,
      () => container.current!.getBoundingClientRect(),
    );
    layer.current = current;
    return () => {
      current.dispose();
      layer.current = null;
    };
  }, [
    map,
    markerPlaces,
    selectPlace,
    card,
    cardViewport,
    clearSelection,
    audience,
    runProgrammaticMapAction,
    selectedRouteName,
  ]);
  useEffect(() => {
    if (!map || !container.current) return;
    const adjust = () => layer.current?.adjustCard();
    const observer = new ResizeObserver(adjust);
    observer.observe(container.current);
    if (topbar.current) observer.observe(topbar.current);
    if (legend.current) observer.observe(legend.current);
    window.addEventListener("resize", adjust);
    window.visualViewport?.addEventListener("resize", adjust);
    window.visualViewport?.addEventListener("scroll", adjust);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", adjust);
      window.visualViewport?.removeEventListener("resize", adjust);
      window.visualViewport?.removeEventListener("scroll", adjust);
    };
  }, [map]);
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
          clearSelection();
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
        preserveRadiusOnZoom: () => placeSelected.current,
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
    clearSelection,
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
      ? (places.find(
          place => place.kind === "station" && stationKey(place.record) === selectedStationId,
        )?.key ?? null)
      : selectedId !== null
        ? `rest:${selectedId}`
        : null;
  useEffect(() => {
    const move = lastSelection.current.map !== map || lastSelection.current.key !== selectedKey;
    layer.current?.select(selectedKey, showCard, move);
    lastSelection.current = {map, key: selectedKey};
  }, [
    map,
    places,
    selectedKey,
    showCard,
    card,
    cardViewport,
    selectPlace,
    clearSelection,
    audience,
  ]);
  useEffect(() => {
    layer.current?.adjustCard();
  }, [map, viewportVersion]);
  const prevFullscreenRef = useRef(fullscreen);
  const selectedKeyRef = useRef(selectedKey);
  useEffect(() => {
    selectedKeyRef.current = selectedKey;
  }, [selectedKey]);

  useEffect(() => {
    const justEnteredFullscreen = !prevFullscreenRef.current && fullscreen;
    prevFullscreenRef.current = fullscreen;

    if (!map || !justEnteredFullscreen) return;
    const timer = window.setTimeout(() => {
      map.relayout();
      if (map.getLevel() >= 10 || selectedKeyRef.current === null) {
        layer.current?.fit();
      }
    }, 80);
    return () => window.clearTimeout(timer);
  }, [map, fullscreen]);
  useEffect(() => {
    if (selectedKey === null) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        clearSelection();
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [selectedKey, clearSelection]);
  const ready = !!map && !error;
  return (
    <section
      className="map-panel relative w-full h-full min-h-0 overflow-hidden bg-[#edf1f5]"
      aria-label="휴게소 위치 지도"
    >
      <div ref={container} className="map-canvas w-full h-full" />
      {!ready && (
        <div
          className="map-placeholder absolute inset-[0] flex flex-col items-center justify-center gap-[14px] p-[22px] text-center bg-[#f3f6fa] bg-size-[36px_36px]"
          role="status"
        >
          <div className="placeholder-icon flex items-center justify-center w-[68px] h-[68px] [border:1px_solid_#dce8fb] rounded-[22px] text-primary bg-white [box-shadow:0_5px_18px_#25395308]">
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
              <code className="setting-name text-[11px] max-w-[100%] [overflow-wrap:anywhere] p-[9px_11px] bg-white rounded-[6px] [border:1px_solid_var(--line)] text-[#526b91]">
                NEXT_PUBLIC_KAKAO_MAP_APP_KEY
              </code>
            </>
          ) : error ? (
            <>
              <p>{error}</p>
              <Button
                onClick={() => {
                  setError(null);
                  setMap(null);
                  setAttempt(value => value + 1);
                }}
                variant="secondary"
              >
                다시 시도
              </Button>
            </>
          ) : (
            <span className="loading-dots tracking-[4px] text-primary">•••</span>
          )}
        </div>
      )}
      {(ready || mobileLocation) && (
        <div
          ref={topbar}
          className={`map-topbar absolute z-[3] top-[14px] left-[14px] right-[14px] flex flex-wrap justify-between items-start gap-[8px] pointer-events-none ${mobileEnabled ? "mobile-navigation" : ""}`}
        >
          {mobileEnabled && mobileLocation ? (
            <>
              {selectedRouteName && (
                <div className="mobile-navigation-row flex items-center justify-between gap-[8px] w-full">
                  <span
                    className="map-scope-label p-[8px_10px] rounded-[20px] bg-[#fffffff2] [box-shadow:0_2px_8px_#26374d12] text-[#526b91] text-[11px]"
                    role="status"
                  >
                    {[selectedRouteName, selectedDirection].filter(Boolean).join(" · ")} 전체 구간
                  </span>
                </div>
              )}
              {ready && !selectedRouteName && mobileLocation.researchAvailable && (
                <button
                  className={cn(sharedClasses.mapButton, "map-research-button")}
                  onClick={() => {
                    clearSelection();
                    locationLayer.current?.research();
                  }}
                >
                  <Icon name="refresh" size={16} />
                  지도 내 재검색
                </button>
              )}
              {!selectedRouteName && mobileLocation.error && (
                <p
                  className="map-location-error w-full rounded-[10px] bg-[#fffffff2] p-[10px_12px] text-[#526b91] text-[11px] leading-[1.6]"
                  role="status"
                >
                  {mobileLocation.error.message}
                </p>
              )}
            </>
          ) : (
            <>
              <span className="map-hint p-[8px_11px] rounded-[6px] bg-[#fffffff0] [box-shadow:0_2px_8px_#26374d12] text-[11px] text-[#5d6f87]">
                마커를 눌러 장소 정보 보기
              </span>
              <button
                className={sharedClasses.mapButton}
                onClick={() => {
                  clearSelection();
                  if (onFullscreen) {
                    onFullscreen();
                    return;
                  }
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
                disabled={!onFullscreen && !highway.route && !positionedItems.some(hasCoordinates)}
              >
                <Icon name="fit" size={17} />
                {onFullscreen ? (fullscreen ? "전체화면 닫기" : "전체화면으로 지도 보기") : "결과 전체 보기"}
              </button>
            </>
          )}
          {ready && highway.error && (
            <div
              className="map-route-error flex items-center justify-between gap-[8px] w-full p-[8px_10px] rounded-[10px] bg-[#fffffff2] [box-shadow:0_2px_8px_#26374d12] text-[#526b91] text-[11px] pointer-events-auto"
              role="status"
            >
              <span>{highway.error}</span>
              <button type="button" className={sharedClasses.mapButton} onClick={highway.retry}>
                다시 시도
              </button>
            </div>
          )}
          {stationError && (
            <div
              className="map-route-error flex items-center justify-between gap-[8px] w-full p-[8px_10px] rounded-[10px] bg-[#fffffff2] [box-shadow:0_2px_8px_#26374d12] text-[#526b91] text-[11px] pointer-events-auto"
              role="status"
            >
              <span>{stationError}</span>
              <button type="button" className={sharedClasses.mapButton} onClick={onRetryStations}>
                주유소 다시 조회
              </button>
            </div>
          )}
        </div>
      )}
      {ready && (
        <>
          <div
            ref={legend}
            className="map-legend absolute z-[3] bottom-[36px] left-[12px] flex flex-wrap gap-[10px] items-center max-w-[calc(100%_-_24px)] p-[6px_9px] rounded-[5px] bg-[#fffffff0] text-[9px] text-[#6c7c90] pointer-events-none"
          >
            <span>
              <i />
              일반
            </span>
            <span>
              <i className="legend-lounge" />
              화물차 라운지
            </span>
            {stations.some(station => station.brand === "GS") && (
              <span>
                <i className="legend-station" />
                GS 주유소
              </span>
            )}
            {stations.some(station => station.brand === "EX") && (
              <span>
                <i className="legend-ex-station" />
                고속도로 주유소
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
            <div className="location-control absolute z-[3] right-[14px] bottom-[38px] flex flex-col [border:1px_solid_#e1e7ee] rounded-[8px] [box-shadow:0_2px_8px_#26374d12] overflow-hidden">
              <button
                className="map-button pointer-events-auto min-h-[40px] inline-flex gap-[6px] items-center p-[8px_10px] rounded-[8px] [border:1px_solid_#e3e8ef] bg-white text-[#334e73] text-[12px] font-[600] [box-shadow:0_2px_8px_#26374d10]"
                aria-label="내 위치로 이동"
                disabled={mobileLocation.requesting || locationDisabled}
                onClick={() => {
                  clearSelection();
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
        <div className="admin-location-status absolute left-[16px] right-[16px] top-[70px] flex flex-col items-start gap-[6px] z-[6] pointer-events-none">
          {mobileLocation.error && (
            <p
              className="map-location-error w-full rounded-[10px] bg-[#fffffff2] p-[10px_12px] text-[#526b91] text-[11px] leading-[1.6]"
              role="status"
            >
              {mobileLocation.error.message}
            </p>
          )}
          {!selectedRouteName && mobileLocation.researchAvailable && (
            <button
              className="map-button pointer-events-auto min-h-[40px] inline-flex gap-[6px] items-center p-[8px_10px] rounded-[8px] [border:1px_solid_#e3e8ef] bg-white text-[#334e73] text-[12px] font-[600] [box-shadow:0_2px_8px_#26374d10]"
              disabled={locationDisabled}
              onClick={() => {
                clearSelection();
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
