"use client";
import {Button, IconButton} from "@/components/ui/button";
import {sharedClasses} from "@/lib/shared-classes";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {loadKakaoMaps, type KakaoMap as MapInstance} from "@/lib/kakao-sdk";
import {createPlaceMarkers} from "@/lib/kakao-place-markers";
import {restPlace, stationPlace, type MapPlace} from "@/lib/map-places";
import type {GasStation} from "@/lib/gas-stations";
import {stationKey} from "@/lib/gas-stations";
import {mapCardOverlayArea} from "@/lib/map-card-layout";
import {createStationMapCard} from "@/lib/station-map-card";
import {createHighwayRouteLayer} from "@/lib/kakao-highway-route";
import {createDrivingRouteLayer} from "@/lib/kakao-driving-route";
import {createGeneralPlaceLayer} from "@/lib/kakao-general-place";
import {createHighwayRouteViewport} from "@/lib/kakao-route-viewport";
import {useHighwayRoute} from "@/hooks/use-highway-route";
import {useDrivingRoute} from "@/hooks/use-driving-route";
import {collectRouteRestAreas, findItemsAlongDrivingRoute} from "@/lib/directions";
import {excludeLinkedRouteStations} from "@/lib/facility-places";
import {createMapCard} from "@/lib/map-card";
import {formatPlaceDistance, type MapCardNavigation, type NavigationTarget} from "@/lib/navigation";
import type {PlaceSearchItem} from "@/lib/place-search";
import {MapFitPolicy, type MapFitRequest} from "@/lib/map-fit-policy";
import {hasCoordinates, type RestArea} from "@/lib/rest-areas";
import {
  createLocationMapLayer,
  mapBounds,
  type MobileMapLocation,
  type MobileMapMemory,
} from "@/lib/kakao-location";
import type {GeoBounds} from "@/lib/geo-search";
import InAppDirectionsPanel from "./in-app-directions-panel";
import Icon from "./icon";
const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY?.trim();
const emptyStations: GasStation[] = [];
const clientAddressCache = new Map<string, string>();
function LocationErrorNotice({message, dismiss}: {message: string; dismiss: () => void}) {
  const [closing, setClosing] = useState(false);
  return (
    <div
      className={`map-location-error pointer-events-auto flex w-full items-start gap-2 rounded-[10px] bg-overlay p-[10px_12px] text-ink text-ui-12 leading-[1.6] ${closing ? "is-closing" : ""}`}
      role="status"
      onAnimationEnd={dismiss}
    >
      <span className="flex-1">{message}</span>
      <IconButton type="button" aria-label="위치 안내 닫기" onClick={() => setClosing(true)}>
        <Icon name="close" size={16} />
      </IconButton>
    </div>
  );
}
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
  onLocate,
  onViewportChange,
  stations = emptyStations,
  searchFitPlaces,
  selectedStationId = null,
  pinnedStationId = null,
  onStationSelect,
  onStationDetails,
  areasLoading = false,
  stationsLoading = false,
  stationError,
  onRetryStations,
  locationDisabled = false,
  onFullscreen,
  fullscreen = false,
  linkedStationsByRestId,
  onMapClick,
  navigationTarget,
  onNavigationChange,
  directionsOpen = false,
  onDirectionsOpenChange,
  allRestAreas,
  allStations,
  selectedGeneralPlace = null,
  onClearGeneralPlace,
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
  onLocate?: () => void;
  onViewportChange?: (bounds: GeoBounds) => void;
  stations?: GasStation[];
  searchFitPlaces?: MapPlace[];
  selectedStationId?: string | null;
  pinnedStationId?: string | null;
  onStationSelect?: (id: string | null) => void;
  onStationDetails?: (id: string) => void;
  areasLoading?: boolean;
  stationsLoading?: boolean;
  stationError?: string | null;
  onRetryStations?: () => void;
  locationDisabled?: boolean;
  onFullscreen?: () => void;
  fullscreen?: boolean;
  linkedStationsByRestId?: ReadonlyMap<number, GasStation[]>;
  onMapClick?: () => void;
  navigationTarget?: NavigationTarget | null;
  onNavigationChange?: (target: NavigationTarget | null) => void;
  directionsOpen?: boolean;
  onDirectionsOpenChange?: (open: boolean) => void;
  allRestAreas?: readonly RestArea[];
  allStations?: readonly GasStation[];
  selectedGeneralPlace?: PlaceSearchItem | null;
  onClearGeneralPlace?: () => void;
}) {
  const mapClickRef = useRef(onMapClick);
  useEffect(() => { mapClickRef.current = onMapClick; }, [onMapClick]);
  const container = useRef<HTMLDivElement>(null);
  const topbar = useRef<HTMLDivElement>(null);
  const legend = useRef<HTMLDivElement>(null);
  const layer = useRef<ReturnType<typeof createPlaceMarkers> | null>(null);
  const placeSelected = useRef(selectedId !== null || selectedStationId !== null);
  const [map, setMap] = useState<MapInstance | null>(null);
  const [satellite, setSatellite] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [internalNavTarget, setInternalNavTarget] = useState<NavigationTarget | null>(null);
  const [customOrigin, setCustomOrigin] = useState<NavigationTarget | null | undefined>(undefined);
  const activeNavTarget = navigationTarget !== undefined ? navigationTarget : internalNavTarget;
  const isDirectionsOpen = Boolean(directionsOpen || activeNavTarget);
  const setNavTarget = useCallback(
    (next: NavigationTarget | null) => {
      if (onNavigationChange) onNavigationChange(next);
      else setInternalNavTarget(next);
    },
    [onNavigationChange],
  );
  const gpsLat = mobileLocation?.position?.latitude ?? null;
  const gpsLng = mobileLocation?.position?.longitude ?? null;
  const gpsCoordKey =
    gpsLat !== null && gpsLng !== null
      ? `${gpsLat.toFixed(4)},${gpsLng.toFixed(4)}`
      : null;
  const [resolvedGpsAddress, setResolvedGpsAddress] = useState<{
    key: string;
    address: string | null;
  } | null>(null);
  useEffect(() => {
    if (!gpsCoordKey || gpsLat === null || gpsLng === null || clientAddressCache.has(gpsCoordKey)) {
      return;
    }
    const controller = new AbortController();
    const saveAddress = (address: string | null) => {
      if (address) {
        clientAddressCache.set(gpsCoordKey, address);
      }
      if (!controller.signal.aborted) {
        setResolvedGpsAddress(current =>
          address
            ? {key: gpsCoordKey, address}
            : current?.address
              ? current
              : {key: gpsCoordKey, address: null},
        );
      }
    };
    const fallbackWithJsSdk = () => {
      const services = window.kakao?.maps?.services;
      if (!services?.Geocoder) {
        saveAddress(null);
        return;
      }
      const geocoder = new services.Geocoder();
      geocoder.coord2Address(gpsLng, gpsLat, (result, status) => {
        if (controller.signal.aborted) return;
        const first = status === services.Status.OK ? result?.[0] : undefined;
        const addr =
          first?.road_address?.address_name?.trim() || first?.address?.address_name?.trim() || "";
        if (addr) {
          saveAddress(addr);
          return;
        }
        if (geocoder.coord2RegionCode) {
          geocoder.coord2RegionCode(gpsLng, gpsLat, (regions, regionStatus) => {
            if (controller.signal.aborted) return;
            const region =
              regionStatus === services.Status.OK
                ? (regions?.find(item => item.region_type === "B") ?? regions?.[0])?.address_name?.trim()
                : "";
            saveAddress(region || null);
          });
        } else {
          saveAddress(null);
        }
      });
    };
    void fetch(
      `/api/places?lat=${encodeURIComponent(String(gpsLat))}&lng=${encodeURIComponent(String(gpsLng))}`,
      {
        signal: controller.signal,
        cache: "no-store",
      },
    )
      .then(async response => {
        if (!response.ok) {
          fallbackWithJsSdk();
          return;
        }
        const body = (await response.json()) as {address?: string | null};
        const address =
          typeof body.address === "string" && body.address.trim() ? body.address.trim() : null;
        if (address) {
          saveAddress(address);
        } else {
          fallbackWithJsSdk();
        }
      })
      .catch(() => {
        fallbackWithJsSdk();
      });
    return () => controller.abort();
  }, [gpsCoordKey, gpsLat, gpsLng, map, isDirectionsOpen]);
  const gpsAddress = gpsCoordKey
    ? (clientAddressCache.get(gpsCoordKey) ??
      (resolvedGpsAddress?.key === gpsCoordKey
        ? resolvedGpsAddress.address
        : (resolvedGpsAddress?.address ?? null)))
    : null;
  const myLocationLabel = gpsAddress ?? "";
  const activeNavOrigin: NavigationTarget | null =
    customOrigin !== undefined
      ? customOrigin?.key === "my-location"
        ? {...customOrigin, name: myLocationLabel}
        : customOrigin
      : mobileLocation?.position
        ? {
            key: "my-location",
            name: myLocationLabel,
            latitude: mobileLocation.position.latitude,
            longitude: mobileLocation.position.longitude,
          }
        : null;
  const navDriving = useDrivingRoute(
    activeNavOrigin,
    activeNavTarget,
    Boolean(map && !error && isDirectionsOpen && activeNavTarget && activeNavOrigin),
  );
  const routeRestAreas = useMemo(
    () => navDriving.routes.map(route => collectRouteRestAreas(route, allRestAreas ?? areas, {
      originRestAreaId: activeNavOrigin?.restAreaId,
      destinationRestAreaId: activeNavTarget?.restAreaId,
    })),
    [navDriving.routes, allRestAreas, areas, activeNavOrigin?.restAreaId, activeNavTarget?.restAreaId],
  );
  const restStopsByRoute = useMemo(() => routeRestAreas.map(({stops}) => stops), [routeRestAreas]);
  const places = useMemo(() => {
    if (isDirectionsOpen) {
      if (!activeNavTarget || !navDriving.route) {
        return [] as MapPlace[];
      }
      const sourceAreas = allRestAreas ?? areas;
      const sourceStations = allStations ?? stations;
      const areaMatches = routeRestAreas[navDriving.selectedIndex]?.matches ?? [];
      const routeAreas = areaMatches.map(match => restPlace(match.area));
      const stationMatches = findItemsAlongDrivingRoute(navDriving.route, sourceStations, 1500);
      const standaloneRouteStations = new Set(
        excludeLinkedRouteStations(
          areaMatches.map(match => match.area),
          stationMatches.map(match => match.item),
          sourceAreas,
          sourceStations,
        ),
      );
      const routeStations = stationMatches
        .filter(match => standaloneRouteStations.has(match.item))
        .map(match => stationPlace(match.item));
      return [...routeAreas, ...routeStations];
    }
    return [...areas.map(restPlace), ...stations.map(stationPlace)];
  }, [
    isDirectionsOpen,
    activeNavTarget,
    navDriving.route,
    navDriving.selectedIndex,
    routeRestAreas,
    allRestAreas,
    areas,
    allStations,
    stations,
  ]);
  const [prevPlaces, setPrevPlaces] = useState(places);
  const [committedPlaces, setCommittedPlaces] = useState(places);

  const radius = mobileLocation?.scope.kind === "radius" ? mobileLocation.scope.radiusMeters : null;
  const [prevRadius, setPrevRadius] = useState(radius);

  // 줌인(반경 축소) 시: 이미 이전 넓은 반경의 주유소 데이터가 메모리에 있으므로 서버 응답을 기다리지 않고 즉시 반영하여 반경 밖 마커가 남거나 쪼개지는 현상을 방지한다.
  // 줌아웃(반경 확대) 시: 새 영역의 주유소가 서버에서 올 때까지 stationsLoading 동안 대기하여 단일 핀 중간 노출을 방지한다.
  const isZoomingIn = radius !== null && prevRadius !== null && radius < prevRadius;
  // 최초에는 두 조회가 모두 끝난 뒤 마커를 함께 반영한다. 길찾기 모드에서는 경로상 마커만 즉시 반영한다.
  const canCommitPlaces = isDirectionsOpen || (!areasLoading && (!stationsLoading || isZoomingIn));

  if (places !== prevPlaces) {
    if (canCommitPlaces) {
      setPrevPlaces(places);
      setCommittedPlaces(places);
      setPrevRadius(radius);
    }
  } else if (radius !== prevRadius && canCommitPlaces) {
    setPrevRadius(radius);
  }

  const latestPlaces = useRef(committedPlaces);
  useEffect(() => { latestPlaces.current = committedPlaces; }, [committedPlaces]);
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
      onClearGeneralPlace?.();
      if (place.kind === "station") onStationSelect?.(stationKey(place.record));
      else onSelect(place.record.id);
    },
    [onSelect, onStationSelect, onClearGeneralPlace],
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
  const [initialLocationWaitExpired, setInitialLocationWaitExpired] = useState(false);
  const initialCamera = useRef(mobileLocation?.cameraRequest);
  useEffect(() => {
    initialCamera.current = mobileLocation?.cameraRequest;
  }, [mobileLocation?.cameraRequest]);
  const initialLocationReady = !mobileEnabled || initialLocationWaitExpired || !!map ||
    !!mobileLocation?.cameraRequest || !!mobileLocation?.error;
  useEffect(() => {
    if (!mobileEnabled) return;
    const timer = window.setTimeout(() => setInitialLocationWaitExpired(true), 2000);
    return () => window.clearTimeout(timer);
  }, [mobileEnabled]);
  useEffect(() => {
    const types = window.kakao?.maps.MapTypeId;
    if (map && types) map.setMapTypeId(satellite ? types.HYBRID : types.ROADMAP);
  }, [map, satellite]);
  useEffect(() => {
    placeSelected.current = selectedId !== null || selectedStationId !== null;
  }, [selectedId, selectedStationId]);
  const highway = useHighwayRoute(selectedRouteName, !!map && !error);
  const positionRef = useRef(mobileLocation?.position ?? null);
  useEffect(() => {
    positionRef.current = mobileLocation?.position ?? null;
  }, [mobileLocation?.position]);
  const activeNavTargetRef = useRef(activeNavTarget);
  useEffect(() => {
    activeNavTargetRef.current = activeNavTarget;
  }, [activeNavTarget]);
  const isDirectionsOpenRef = useRef(isDirectionsOpen);
  useEffect(() => {
    isDirectionsOpenRef.current = isDirectionsOpen;
  }, [isDirectionsOpen]);
  const card = useCallback(
    (place: MapPlace) => {
      const distanceSummary = formatPlaceDistance(
        place.record,
        positionRef.current,
      );
      const record = place.record;
      const isNavActive = activeNavTargetRef.current?.key === place.key;
      const inDirections = isDirectionsOpenRef.current;
      const navigation: MapCardNavigation = {
        distanceText: distanceSummary?.badgeText ?? null,
        active: isNavActive,
        label: inDirections && !isNavActive ? "목적지 변경" : undefined,
        onNavigate:
          hasCoordinates(record) && !(inDirections && isNavActive)
            ? () => {
                if (activeNavTargetRef.current?.key === place.key) {
                  setNavTarget(null);
                  return;
                }
                setNavTarget({
                  key: place.key,
                  name: record.name,
                  latitude: record.latitude,
                  longitude: record.longitude,
                  restAreaId: place.kind === "rest" ? place.record.id : null,
                  stationId: place.kind === "station" ? stationKey(place.record) : null,
                });
                layer.current?.select(null);
                clearSelection();
              }
            : undefined,
      };
      return place.kind === "station"
        ? createStationMapCard(
            place.record,
            () => onStationSelect?.(null),
            () => onStationDetails?.(stationKey(place.record)),
            navigation,
          )
        : createMapCard(
            place.record,
            audience,
            () => onSelect(null),
            () => onDetails(place.record.id),
            linkedStationsRef.current?.get(place.record.id),
            navigation,
          );
    },
    [audience, onSelect, onDetails, onStationSelect, onStationDetails, setNavTarget, clearSelection],
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
  const selectPlaceRef = useRef(selectPlace);
  useEffect(() => { selectPlaceRef.current = selectPlace; }, [selectPlace]);
  const cardRef = useRef(card);
  useEffect(() => { cardRef.current = card; }, [card]);
  const cardViewportRef = useRef(cardViewport);
  useEffect(() => { cardViewportRef.current = cardViewport; }, [cardViewport]);
  const clearSelectionRef = useRef(clearSelection);
  useEffect(() => { clearSelectionRef.current = clearSelection; }, [clearSelection]);
  const runProgrammaticMapActionRef = useRef(runProgrammaticMapAction);
  useEffect(() => { runProgrammaticMapActionRef.current = runProgrammaticMapAction; }, [runProgrammaticMapAction]);
  useEffect(() => {
    if (!appKey || !initialLocationReady) {
      return;
    }
    let cancelled = false;
    let observer: ResizeObserver | undefined;
    loadKakaoMaps(appKey)
      .then(sdk => {
        if (cancelled || !container.current) return;
        const saved = locationEnabled ? mobileMemory.current.viewport : undefined;
        const initialPosition = mobileEnabled ? initialCamera.current?.center : undefined;
        const instance = new sdk.Map(container.current, {
          center: new sdk.LatLng(
            saved?.center.latitude ?? initialPosition?.latitude ?? 36.4,
            saved?.center.longitude ?? initialPosition?.longitude ?? 127.8,
          ),
          level: saved?.level ?? (initialPosition ? 10 : 13),
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
  }, [attempt, locationEnabled, mobileEnabled, initialLocationReady]);
  useEffect(() => {
    const sdk = window.kakao?.maps;
    if (!map || !sdk) return;
    const current = createPlaceMarkers(
      sdk,
      map,
      latestPlaces.current,
      place => selectPlaceRef.current(place),
      place => cardRef.current(place),
      () => {
        const bounds = container.current!.getBoundingClientRect();
        const view = cardViewportRef.current ? cardViewportRef.current(bounds) : bounds;
        const area = mapCardOverlayArea(
          view,
          topbar.current?.getBoundingClientRect(),
          legend.current?.getBoundingClientRect(),
        );
        return new DOMRect(area.left, area.top, area.width, area.height);
      },
      () => clearSelectionRef.current(),
      audience === "mobile" ? "above" : "below",
      (action, expectZoomChange) => runProgrammaticMapActionRef.current(action, expectZoomChange),
      true,
      () => container.current!.getBoundingClientRect(),
      () => mapClickRef.current?.(),
    );
    layer.current = current;
    return () => {
      current.dispose();
      layer.current = null;
    };
  }, [map, audience]);
  useEffect(() => {
    layer.current?.update(committedPlaces);
  }, [map, committedPlaces]);
  useEffect(() => {
    layer.current?.setPinned(pinnedStationId);
  }, [map, pinnedStationId]);
  const isRouteMode = Boolean(selectedRouteName || activeNavTarget);
  useEffect(() => {
    layer.current?.setRouteMode(isRouteMode);
  }, [map, isRouteMode]);
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
  const highwayLayerRef = useRef<ReturnType<typeof createHighwayRouteLayer> | null>(null);
  useEffect(() => {
    const sdk = window.kakao?.maps;
    if (!map || !sdk) return;
    const current = createHighwayRouteLayer(sdk, map);
    highwayLayerRef.current = current;
    return () => {
      current.dispose();
      highwayLayerRef.current = null;
    };
  }, [map]);
  useEffect(() => {
    highwayLayerRef.current?.update(activeNavTarget ? null : highway.route);
  }, [map, highway.route, activeNavTarget]);
  const drivingLayerRef = useRef<ReturnType<typeof createDrivingRouteLayer> | null>(null);
  const selectNavRouteRef = useRef(navDriving.selectRoute);
  useEffect(() => {
    selectNavRouteRef.current = navDriving.selectRoute;
  }, [navDriving.selectRoute]);
  const fittedNavKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const sdk = window.kakao?.maps;
    if (!map || !sdk) return;
    const current = createDrivingRouteLayer(sdk, map, index => {
      selectNavRouteRef.current(index);
    });
    drivingLayerRef.current = current;
    return () => {
      current.dispose();
      drivingLayerRef.current = null;
    };
  }, [map]);
  const navRouteSignature =
    activeNavOrigin && activeNavTarget
      ? `${activeNavOrigin.key}->${activeNavTarget.key}`
      : null;
  useEffect(() => {
    const current = drivingLayerRef.current;
    if (!current) return;
    if (!activeNavTarget || navDriving.routes.length === 0) {
      current.update([], 0);
      if (!activeNavTarget) fittedNavKeyRef.current = null;
      return;
    }
    current.update(navDriving.routes, navDriving.selectedIndex);
    if (fittedNavKeyRef.current !== navRouteSignature) {
      fittedNavKeyRef.current = navRouteSignature;
      const fitAction = () => current.fitBounds(navDriving.routes);
      if (locationLayer.current) locationLayer.current.fitRoute(fitAction);
      else fitAction();
    }
  }, [map, activeNavTarget, navRouteSignature, navDriving.routes, navDriving.selectedIndex]);
  const generalPlaceLayerRef = useRef<ReturnType<typeof createGeneralPlaceLayer> | null>(null);
  const lastGeneralPlaceIdRef = useRef<string | null>(null);
  useEffect(() => {
    const sdk = window.kakao?.maps;
    if (!map || !sdk) return;
    document.querySelectorAll(".general-place-map-card").forEach(el => el.remove());
    generalPlaceLayerRef.current?.dispose();
    const current = createGeneralPlaceLayer(sdk, map);
    generalPlaceLayerRef.current = current;
    if (selectedGeneralPlace && !isDirectionsOpen) {
      const shouldPan = lastGeneralPlaceIdRef.current !== selectedGeneralPlace.id;
      lastGeneralPlaceIdRef.current = selectedGeneralPlace.id;
      const updateAction = () => {
        current.update(selectedGeneralPlace, shouldPan);
      };
      if (shouldPan) {
        runProgrammaticMapAction(updateAction, true);
      } else {
        updateAction();
      }
    } else {
      current.update(null);
      if (!selectedGeneralPlace) lastGeneralPlaceIdRef.current = null;
    }
    return () => {
      current.dispose();
      if (generalPlaceLayerRef.current === current) {
        generalPlaceLayerRef.current = null;
      }
    };
  }, [map, selectedGeneralPlace, isDirectionsOpen, runProgrammaticMapAction]);
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
          clearSelectionRef.current();
        },
        zoomStart: () => layer.current?.suspendCardAdjustment(),
      },
      mobileMemory.current,
      {
        container: container.current,
        viewport: () => {
          const bounds = container.current?.getBoundingClientRect() ?? new DOMRect();
          return cardViewportRef.current ? cardViewportRef.current(bounds) : bounds;
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
  ]);
  const updateViewport = useCallback(() => {
    const sdk = window.kakao?.maps;
    if (!map || !sdk || !onViewportChange) return;
    // 패널을 펼치거나 정보창을 닫아도 같은 지도 영역의 장소를 유지한다.
    onViewportChange(mapBounds(map));
    zoomChanged?.(map.getLevel());
  }, [map, onViewportChange, zoomChanged]);
  useEffect(() => {
    const sdk = window.kakao?.maps;
    if (!map || !sdk || !onViewportChange) return;
    sdk.event.addListener(map, "idle", updateViewport);
    updateViewport();
    return () => sdk.event.removeListener(map, "idle", updateViewport);
  }, [map, onViewportChange, updateViewport]);
  useEffect(() => {
    if (!onViewportChange) return;
    const timer = window.setTimeout(updateViewport, 120);
    return () => window.clearTimeout(timer);
  }, [onViewportChange, updateViewport, viewportVersion]);
  const position = mobileLocation?.position;
  const scope = mobileLocation?.scope;
  const cameraRequest = mobileLocation?.cameraRequest;
  const locationRadius = mobileLocation?.locationRadius;
  useEffect(() => {
    locationLayer.current?.setSatellite(satellite);
    locationLayer.current?.setRouteMode(!!selectedRouteName || !!activeNavTarget);
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
    satellite,
    selectedRouteName,
    activeNavTarget,
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
    if (fitPolicy.current?.map !== map) fitPolicy.current = {map, policy: new MapFitPolicy()};
    const shouldFit = fitPolicy.current.policy.update(fitSource, fitRequest, deferFit);
    if (mobileEnabled) {
      if (shouldFit && fitRequest?.search) {
        locationLayer.current?.runProgrammaticMapAction(
          () => layer.current?.fit(searchFitPlaces),
          true,
        );
        return;
      }
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
    if (
      shouldFit &&
      (fitRequest?.search || (!selectedRouteName && (!scope || scope.kind === "all")))
    ) layer.current?.fit(fitRequest?.search ? searchFitPlaces : undefined);
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
    searchFitPlaces,
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
    }, false, highway.loading);
  }, [map, selectedRouteName, highway.route, highway.loading, positionedItems]);
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
    if (move && selectedKey && !showCard && audience === "mobile")
      layer.current?.focus(selectedKey, false);
    else layer.current?.select(selectedKey, showCard, move);
    lastSelection.current = {map, key: selectedKey};
  }, [
    map,
    places,
    selectedKey,
    showCard,
    audience,
  ]);
  useEffect(() => {
    if (!map || !selectedKey || !showCard) return;
    layer.current?.select(selectedKey, true, false, true);
  }, [map, selectedKey, showCard, linkedStationsByRestId, position, activeNavTarget, isDirectionsOpen]);
  useEffect(() => {
    layer.current?.adjustCard();
  }, [map, viewportVersion, isDirectionsOpen, navDriving.route, navDriving.loading]);
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
    if (selectedKey === null || !showCard) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        clearSelection();
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [selectedKey, showCard, clearSelection]);
  const ready = !!map && !error;
  return (
    <section
      className="map-panel relative w-full h-full min-h-0 overflow-hidden bg-surface"
      aria-label="휴게소 위치 지도"
    >
      <div ref={container} className="map-canvas w-full h-full" />
      {!ready && (
        <div
          className="map-placeholder absolute inset-[0] flex flex-col items-center justify-center gap-[14px] p-[22px] text-center bg-surface bg-size-[36px_36px]"
          role="status"
        >
          <div className="placeholder-icon flex items-center justify-center w-[68px] h-[68px] [border:1px_solid_var(--color-primary-line)] rounded-[22px] text-primary bg-white [box-shadow:0_5px_18px_#25395308]">
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
              <code className="setting-name text-ui-12 max-w-[100%] [overflow-wrap:anywhere] p-[9px_11px] bg-white rounded-[6px] [border:1px_solid_var(--line)] text-ink">
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
              {!selectedRouteName && mobileLocation.error && (
                <LocationErrorNotice message={mobileLocation.error.message} dismiss={mobileLocation.dismissError} />
              )}
            </>
          ) : (
            <>
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
              className="map-route-error flex items-center justify-between gap-[8px] w-full p-[8px_10px] rounded-[10px] bg-overlay [box-shadow:0_2px_8px_#26374d12] text-ink text-ui-12 pointer-events-auto"
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
              className="map-route-error flex items-center justify-between gap-[8px] w-full p-[8px_10px] rounded-[10px] bg-overlay [box-shadow:0_2px_8px_#26374d12] text-ink text-ui-12 pointer-events-auto"
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
      {ready && (mobileLocation || !isDirectionsOpen) && (
        <div
          className={`map-bottom-controls absolute z-[3] left-[14px] right-[14px] bottom-[36px] flex flex-col items-start gap-[10px] pointer-events-none ${isDirectionsOpen ? (activeNavOrigin && activeNavTarget ? "is-directions-dock" : "is-directions-open") : ""}`}
        >
          {mobileLocation && (
            <div className="location-control pointer-events-auto flex flex-col [border:1px_solid_var(--line)] rounded-[8px] bg-white [box-shadow:0_4px_12px_#1d314d22] overflow-hidden">
              <button
                type="button"
                aria-label="위성 보기"
                aria-pressed={satellite}
                title={satellite ? "일반 지도로 전환" : "위성 지도로 전환"}
                onClick={() => setSatellite(value => !value)}
              >
                <Icon name="layers" size={20} />
              </button>
              <button
                className={`${sharedClasses.mapButton} ${mobileLocation.requesting && !locationDisabled ? "is-locating" : ""}`}
                aria-label="내 위치로 이동"
                aria-busy={mobileLocation.requesting}
                title={mobileLocation.requesting ? "위치 확인 중" : "내 위치로 이동"}
                disabled={mobileLocation.requesting || locationDisabled}
                onClick={() => {
                  if (isDirectionsOpen) {
                    const sdk = window.kakao?.maps;
                    if (map && sdk && position) {
                      runProgrammaticMapAction(() => {
                        map.panTo(new sdk.LatLng(position.latitude, position.longitude));
                      });
                    } else {
                      mobileLocation.locate();
                    }
                    return;
                  }
                  clearSelection();
                  onLocate?.();
                  if (selectedRouteName) onClearRoute?.();
                  mobileLocation.locate();
                }}
              >
                <Icon name={mobileLocation.requesting ? "refresh" : "locate"} size={20} />
              </button>
            </div>
          )}
          {!isDirectionsOpen && (
            <div
              ref={legend}
              className="map-legend flex flex-wrap gap-x-[10px] gap-y-[5px] items-center max-w-full p-[5px_9px] rounded-[6px] bg-overlay [border:1px_solid_#e4ebf4] text-ui-10 text-muted pointer-events-none"
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
          )}
        </div>
      )}
      {ready && isDirectionsOpen && (
        <InAppDirectionsPanel
          origin={activeNavOrigin}
          target={activeNavTarget}
          gpsOrigin={position ?? null}
          gpsAddress={gpsAddress}
          onChangeOrigin={setCustomOrigin}
          onChangeTarget={setNavTarget}
          routes={navDriving.routes}
          restAreasByRoute={restStopsByRoute}
          selectedIndex={navDriving.selectedIndex}
          onSelectRoute={navDriving.selectRoute}
          loading={navDriving.loading}
          error={navDriving.error}
          tooClose={navDriving.tooClose}
          onRetry={navDriving.retry}
          allRestAreas={allRestAreas ?? areas}
          onSelectRestArea={id => onDetails(id)}
          onClose={() => {
            setNavTarget(null);
            setCustomOrigin(undefined);
            onDirectionsOpenChange?.(false);
          }}
        />
      )}
      {ready && !mobileEnabled && mobileLocation && (
        <div className="admin-location-status absolute left-[16px] right-[16px] top-[70px] flex flex-col items-start gap-[6px] z-[6] pointer-events-none">
          {mobileLocation.error && (
            <LocationErrorNotice message={mobileLocation.error.message} dismiss={mobileLocation.dismissError} />
          )}
          {!selectedRouteName && mobileLocation.researchAvailable && (
            <button
              className={sharedClasses.mapButton}
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
