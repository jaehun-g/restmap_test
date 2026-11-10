"use client";
import {Button, IconButton} from "@/components/ui/button";
import {buttonClasses} from "@/lib/design-system";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import Link from "next/link";
import {useRestAreas} from "@/hooks/use-rest-areas";
import {useSearchQuery} from "@/hooks/use-search-query";
import {useAdminSession} from "@/hooks/use-admin-session";
import {useMapFitRequest} from "@/hooks/use-map-fit-request";
import {
  filterRestAreas,
  directionOptions,
  initialFilters,
  sortRestAreas,
  type RestAreaFilters,
} from "@/lib/rest-area-filters";
import type {SortField} from "@/lib/rest-area-fields";
import {createEditorDraft, editorIsDirty, type EditorDraft} from "@/lib/rest-area-editor";
import type {RestAreaRecord} from "@/lib/rest-areas";
import KakaoMap from "./kakao-map";
import RestAreaDetails from "./rest-area-details";
import RestAreaEditor from "./rest-area-editor";
import AdminRestAreaTable from "./admin-rest-area-table";
import AdminFilterBar from "./admin-filter-bar";
import AdminAuthControl from "./admin-auth-control";
import Icon from "./icon";
import {useGasStations} from "@/hooks/use-gas-stations";
import {stationQueryString} from "@/lib/gas-station-query";
import {restPlace, stationPlace, type PlaceView} from "@/lib/map-places";
import type {GasStationRecord} from "@/lib/gas-stations";
import {stationKey} from "@/lib/gas-stations";
import PlaceControls from "./place-controls";
import GasStationTable from "./gas-station-table";
import GasStationDetails from "./gas-station-details";
import GasStationEditor from "./gas-station-editor";
import {useMobileLocation} from "@/hooks/use-mobile-location";
import {filterFacilityPlaces} from "@/lib/facility-filters";
import {linkedStationsByArea, mergeFacilityPlaces} from "@/lib/facility-places";
import AdminDetailModal from "./admin-detail-modal";
import AdminRestAreaReview from "./admin-rest-area-review";
export default function AdminExplorer() {
  const location = useMobileLocation(false);
  const {data, areas, loading, error, reload, replaceItem} = useRestAreas(true);
  const view = useMapFitRequest();
  const search = useSearchQuery(view.requestSearchFit);
  const auth = useAdminSession();
  const [filters, setFilters] = useState(initialFilters);
  const [placeView, setPlaceView] = useState<PlaceView>("all");
  const gas = useGasStations(
    stationQueryString(filters.missingRoute ? null : filters.routeName, location.scope, "ex"), true,
  );
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [editingStation, setEditingStation] = useState<GasStationRecord | null>(null);
  const [stationDirty, setStationDirty] = useState(false);
  const [sortField, setSortField] = useState<SortField>("name");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState<{
    base: RestAreaRecord;
    draft: EditorDraft;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [syncingExStations, setSyncingExStations] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [detailModal, setDetailModal] = useState(false);
  const [listModal, setListModal] = useState<"rest" | "stations" | null>(null);
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);
  const mapPanelRef = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const dirty = (!!editing && editorIsDirty(editing.base, editing.draft)) || stationDirty;
  const anyEditing = !!editing || !!editingStation;
  const editState = useRef({dirty, saving});
  useEffect(() => {
    editState.current = {dirty, saving};
  }, [dirty, saving]);
  const sourceFacilities = useMemo(() => mergeFacilityPlaces(areas, gas.stations), [areas, gas.stations]);
  const mergedFacilities = useMemo(
    () => filterFacilityPlaces(areas, gas.stations, {
      filters, query: search.query, stationServices: [],
      scope: location.scope, position: location.position,
    }, sourceFacilities),
    [areas, gas.stations, filters, search.query, location.scope, location.position, sourceFacilities],
  );
  const results = useMemo(() => mergedFacilities.facilities.map(({area}) => area), [mergedFacilities]);
  const sorted = useMemo(
    () => sortRestAreas(results, sortField, direction),
    [results, sortField, direction],
  );
  const selected = results.find(area => area.id === selectedId);
  const visibleAreas = results;
  const stationResults = mergedFacilities.stations;
  const linkedStationsByRestId = useMemo(
    () => linkedStationsByArea(mergedFacilities.facilities, sourceFacilities.stations),
    [mergedFacilities.facilities, sourceFacilities],
  );
  const selectedDirectionLabel = useMemo(
    () =>
      directionOptions(areas, filters.routeName).find(option => option.key === filters.direction)
        ?.label ?? filters.direction,
    [areas, filters.routeName, filters.direction],
  );
  const selectedStation = stationResults.find(station => stationKey(station) === selectedStationId) ??
    [...linkedStationsByRestId.values()].flat().find(station => stationKey(station) === selectedStationId);
  const mayLeave = useCallback(
    () =>
      !editState.current.saving &&
      (!editState.current.dirty || window.confirm("저장하지 않은 변경사항을 버릴까요?")),
    [],
  );
  const select = useCallback(
    (id: number | null) => {
      if (!mayLeave()) return;
      if (id !== null)
        returnFocus.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setEditing(null);
      setEditingStation(null);
      setStationDirty(false);
      editState.current.dirty = false;
      setSelectedStationId(null);
      setSelectedId(id);
    },
    [mayLeave],
  );
  const close = useCallback(() => {
    if (!mayLeave()) return;
    setDetailModal(false);
    setEditing(null);
    setEditingStation(null);
    setStationDirty(false);
    editState.current.dirty = false;
    setSelectedStationId(null);
    setSelectedId(null);
    returnFocus.current?.focus({preventScroll: true});
  }, [mayLeave]);
  const details = useCallback(
    (id: number) => {
      if (!mayLeave()) return;
      returnFocus.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setEditing(null);
      setEditingStation(null);
      setStationDirty(false);
      editState.current.dirty = false;
      setSelectedStationId(null);
      setSelectedId(id);
      setDetailModal(true);
    },
    [mayLeave],
  );
  const clearRoute = useCallback(() => {
    setFilters(current => ({...current, routeName: null, missingRoute: false, direction: null}));
    setSelectedId(null);
    setSelectedStationId(null);
  }, []);
  const selectStation = useCallback(
    (id: string | null) => {
      if (!mayLeave()) return;
      returnFocus.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setEditing(null);
      setEditingStation(null);
      setStationDirty(false);
      editState.current.dirty = false;
      setSelectedId(null);
      setSelectedStationId(id);
    },
    [mayLeave],
  );
  const openStationDetails = useCallback(
    (id: string) => {
      if (!mayLeave()) return;
      returnFocus.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setEditing(null);
      setEditingStation(null);
      setStationDirty(false);
      editState.current.dirty = false;
      setSelectedId(null);
      setSelectedStationId(id);
      setDetailModal(true);
    },
    [mayLeave],
  );
  useEffect(() => {
    const updateFullscreen = () => setMapFullscreen(document.fullscreenElement === mapPanelRef.current);
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);
  useEffect(() => {
    if (selectedStationId === null || selectedStation || gas.loading || editingStation) return;
    let active = true;
    queueMicrotask(() => {
      if (active) setSelectedStationId(null);
    });
    return () => {
      active = false;
    };
  }, [selectedStationId, selectedStation, gas.loading, editingStation]);
  useEffect(() => {
    if (loading || selectedId === null || selected || editing) return;
    let active = true;
    queueMicrotask(() => {
      if (active) setSelectedId(null);
    });
    return () => {
      active = false;
    };
  }, [loading, selectedId, selected, editing]);
  useEffect(() => {
    if (selectedId === null && selectedStationId === null) return;
    detailRef.current?.focus({preventScroll: true});
    document
      .getElementById(
        selectedStationId !== null
          ? `station-row-${selectedStationId}`
          : `rest-area-row-${selectedId}`,
      )
      ?.scrollIntoView({block: "nearest"});
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [selectedId, selectedStationId, close]);
  useEffect(() => {
    if (!dirty) return;
    const beforeLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeLeave);
    return () => window.removeEventListener("beforeunload", beforeLeave);
  }, [dirty]);
  const mapAreas = placeView === "ex" ? [] : visibleAreas;
  const mapStations = placeView === "rest" ? [] : stationResults;
  const selectedMapStations = selectedStation && !mapStations.some(station => stationKey(station) === stationKey(selectedStation))
    ? [...mapStations, selectedStation] : mapStations;
  const changeSort = (field: SortField, next: "asc" | "desc") => {
    setSortField(field);
    setDirection(next);
  };
  const changeFilters = (next: RestAreaFilters) => {
    const onlyLounge =
      next.routeName === filters.routeName &&
      next.missingRoute === filters.missingRoute &&
      next.facilities === filters.facilities;
    setFilters(next);
    if (onlyLounge) view.preserveView();
    else view.requestFit();
  };
  const reset = () => {
    search.clear(false);
    setFilters(initialFilters());
    setPlaceView("all");
    setSelectedStationId(null);
    view.preserveView();
  };
  const reloadData = () => {
    if (mayLeave()) {
      setEditing(null);
      setEditingStation(null);
      setStationDirty(false);
      editState.current.dirty = false;
      setSelectedStationId(null);
      setSelectedId(null);
      void reload();
      void gas.reload();
    }
  };
  const syncExStations = async () => {
    if (!auth.authenticated || syncingExStations || saving || anyEditing) return;
    setSyncingExStations(true);
    setSyncError(null);
    try {
      const response = await fetch("/api/admin/ex-stations/sync", {
        method: "POST",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 401) void auth.refresh();
        throw new Error(payload?.error?.message ?? "EX 주유소 동기화에 실패했습니다.");
      }
      setNotice(
        `EX 동기화 완료: 전체 ${payload.total}건 · 지오코딩 ${payload.geocoded}건 · 미해결 ${payload.unresolved}건 · 삭제 ${payload.deleted}건`,
      );
      void gas.reload();
    } catch (reason) {
      setSyncError(reason instanceof Error ? reason.message : "EX 주유소 동기화에 실패했습니다.");
    } finally {
      setSyncingExStations(false);
    }
  };
  const toggleMapFullscreen = async () => {
    const panel = mapPanelRef.current;
    if (!panel) return;
    try {
      if (document.fullscreenElement === panel) await document.exitFullscreen();
      else await panel.requestFullscreen();
    } catch {
      setSyncError("전체화면 지도를 열지 못했습니다. 브라우저 권한을 확인해주세요.");
    }
  };
  return (
    <main className="admin-shell min-w-[1080px] h-[100dvh] overflow-hidden p-[0_24px_18px] flex flex-col">
      <AdminRestAreaReview authenticated={auth.authenticated} />
      <header className="admin-header h-[86px] flex items-center justify-between [border-bottom:1px_solid_#e3e8ef] gap-[25px]">
        <div className="admin-brand flex items-center gap-[11px]">
          <span className="brand-icon flex items-center justify-center w-[43px] h-[43px] rounded-[12px] bg-primary text-[#fff]">
            <Icon name="pin" size={24} />
          </span>
          <div>
            <h1>휴게소 관리</h1>
            <p>CAFE24 DATA VIEWER</p>
          </div>
          <span className={`read-only-badge ${auth.authenticated ? "edit-unlocked" : ""}`}>
            {auth.authenticated ? "편집 가능" : "조회 전용"}
          </span>
        </div>
        <div className="admin-actions flex items-center gap-[9px]">
          <Button variant="secondary" onClick={() => setListModal("rest")}>휴게소 목록 <span className="ml-1">{areas.length}</span></Button>
          <Button variant="secondary" onClick={() => setListModal("stations")}>주유·충전소 목록 <span className="ml-1">{gas.stations.length}</span></Button>
          <AdminAuthControl
            auth={auth}
            onLogout={() => {
              if (mayLeave()) {
                setEditing(null);
                setEditingStation(null);
                setStationDirty(false);
                editState.current.dirty = false;
                void auth.logout();
              }
            }}
          />
          <Button
            disabled={!auth.authenticated || syncingExStations || saving || anyEditing}
            onClick={() => void syncExStations()}
            variant="secondary"
          >
            <Icon name="refresh" size={16} />
            {syncingExStations ? "EX 동기화 중" : "EX 동기화"}
          </Button>
          <Link href="/mobile" className={buttonClasses("secondary")} target="_blank">
            사용자 화면
            <Icon name="arrow" size={16} />
          </Link>
          <Button disabled={loading || saving} onClick={reloadData} variant="primary">
            <Icon name="refresh" size={17} />
            다시 조회
          </Button>
        </div>
      </header>
      <PlaceControls
        view={placeView}
        onView={next => {
          if (!mayLeave()) return;
          setPlaceView(next);
          setFilters(current => ({...current, missingRoute: false}));
          setSelectedId(null);
          setSelectedStationId(null);
          view.requestFit();
        }}
        disabled={anyEditing}
        audience="admin"
      />
      <AdminFilterBar
        areas={areas}
        filters={filters}
        onChange={changeFilters}
        search={search}
        onReset={reset}
        disabled={anyEditing}
        includeStations={placeView !== "rest"}
        hideRestFilters={placeView === "ex"}
      />
      {notice && (
        <div
          className="save-notice flex items-center gap-[8px] p-[8px_13px] mb-[12px] bg-[#eef8f4] text-[#3a836e] [border:1px_solid_#d9ede5] rounded-[8px] text-[11px]"
          role="status"
        >
          <Icon name="check" size={17} />
          {notice}
          <IconButton aria-label="저장 안내 닫기" onClick={() => setNotice(null)}>
            <Icon name="close" size={16} />
          </IconButton>
        </div>
      )}
      {syncError && (
        <div
          className="sync-error-notice flex items-center gap-[8px] p-[8px_13px] mb-[12px] bg-[#fff7f5] text-[#b2645b] [border:1px_solid_#f0d6d1] rounded-[8px] text-[11px]"
          role="alert"
        >
          {syncError}
          <IconButton aria-label="동기화 오류 안내 닫기" onClick={() => setSyncError(null)}>
            <Icon name="close" size={16} />
          </IconButton>
        </div>
      )}
      <div className="admin-workspace grid grid-cols-[minmax(0,_1fr)] gap-[16px] flex-1 min-h-0">
        <section ref={mapPanelRef} className="admin-map-panel" aria-label="지도">
          <div className="admin-map h-full min-h-0">
            <KakaoMap
              areas={mapAreas}
              stations={selectedMapStations}
              searchFitPlaces={[...mapAreas.map(restPlace), ...mapStations.map(stationPlace)]}
              linkedStationsByRestId={linkedStationsByRestId}
              selectedDirection={selectedDirectionLabel}
              selectedStationId={selectedStation ? stationKey(selectedStation) : null}
              onStationSelect={selectStation}
              onStationDetails={openStationDetails}
              areasLoading={loading}
              stationsLoading={gas.loading}
              stationError={gas.error}
              onRetryStations={() => {
                void gas.reload();
              }}
              selectedRouteName={filters.missingRoute ? null : filters.routeName}
              mobileLocation={location}
              onClearRoute={clearRoute}
              locationDisabled={anyEditing}
              selectedId={selected?.id ?? null}
              onSelect={select}
              onDetails={details}
              showCard={!anyEditing}
              fitRequest={view.fitRequest}
              dataVersion={`${data?.fetchedAt ?? ""}|${gas.data?.fetchedAt ?? ""}`}
              onFullscreen={() => void toggleMapFullscreen()}
              fullscreen={mapFullscreen}
            />
          </div>
        </section>
      </div>
      {listModal && (
        <AdminDetailModal wide onClose={() => setListModal(null)}>
          <section className="admin-table-panel flex-1 min-h-0" aria-label={listModal === "rest" ? "휴게소 목록" : "주유·충전소 목록"}>
            <div className="flex items-center justify-between p-3 border-b border-slate-200">
              <h2 className="font-semibold">{listModal === "rest" ? "휴게소 목록" : "주유·충전소 목록"}</h2>
              <Button onClick={() => setListModal(null)}>닫기</Button>
            </div>
            {listModal === "rest" ? (
              <AdminRestAreaTable
                rows={sorted}
                selectedId={selectedId}
                sortField={sortField}
                direction={direction}
                onSort={changeSort}
                onSelect={id => { setListModal(null); details(id); }}
                loading={loading}
                error={error}
                hasData={!!areas.length}
                onRetry={reloadData}
                onReset={reset}
              />
            ) : (
              <GasStationTable
                rows={stationResults}
                selectedId={selectedStationId}
                onSelect={id => { setListModal(null); openStationDetails(id); }}
                loading={gas.loading}
                error={gas.error}
                onReset={reset}
                onRetry={() => { void gas.reload(); }}
              />
            )}
          </section>
        </AdminDetailModal>
      )}
      {detailModal && (
        <AdminDetailModal onClose={close}>
          <div
            className="admin-details min-h-0 flex-1 [outline:none] overflow-hidden flex flex-col"
            ref={detailRef}
            tabIndex={selected || selectedStation ? -1 : undefined}
          >
            {editingStation ? (
              <GasStationEditor
                key={editingStation.id}
                original={editingStation}
                authenticated={auth.authenticated}
                onDirty={value => {
                  editState.current.dirty = value;
                  setStationDirty(value);
                }}
                onBusy={value => {
                  editState.current.saving = value;
                  setSaving(value);
                }}
                onExpired={() => {
                  void auth.refresh();
                }}
                onCancel={() => {
                  if (mayLeave()) {
                    setEditingStation(null);
                    setStationDirty(false);
                    editState.current.dirty = false;
                  }
                }}
                onSaved={record => {
                  gas.replaceItem(record);
                  setEditingStation(null);
                  setStationDirty(false);
                  editState.current.dirty = false;
                  setNotice(`${record.name}의 변경사항을 저장했습니다.`);
                  void gas.reload();
                }}
              />
            ) : editing ? (
              <RestAreaEditor
                key={editing.base.id}
                original={editing.base}
                draft={editing.draft}
                onChange={draft => {
                  editState.current.dirty = editorIsDirty(editing.base, draft);
                  setEditing(current => (current ? {...current, draft} : current));
                }}
                authenticated={auth.authenticated}
                onBusy={busy => {
                  editState.current.saving = busy;
                  setSaving(busy);
                }}
                onExpired={() => {
                  void auth.refresh();
                }}
                onCancel={() => {
                  if (mayLeave()) setEditing(null);
                }}
                onSaved={record => {
                  replaceItem(record);
                  view.requestFit();
                  setEditing(null);
                  setNotice(`${record.name}의 변경사항을 저장했습니다.`);
                  if (!filterRestAreas([record], filters, search.query).length) setSelectedId(null);
                }}
              />
            ) : selectedStation ? (
              <>
                <div className="admin-detail-actions flex items-center justify-between p-[9px_18px] [border-bottom:1px_solid_var(--line)] shrink-0 text-[#9ba9ba] text-[9px]">
                  <span>
                    {selectedStation.brand === "EX" ? "EX 원본 키" : "GS 코드"}{" "}
                    {selectedStation.siteCode}
                  </span>
                  {selectedStation.brand === "GS" && (
                    <Button
                      disabled={!auth.authenticated}
                      onClick={() => setEditingStation(selectedStation)}
                      variant="secondary"
                    >
                      {auth.authenticated ? "정보 수정" : "인증 후 수정 가능"}
                    </Button>
                  )}
                </div>
                <div className="admin-detail-body min-h-0 flex-1">
                  <GasStationDetails
                    key={stationKey(selectedStation)}
                    station={selectedStation}
                    onClose={close}
                    audience="admin"
                    routeName={filters.routeName}
                  />
                </div>
              </>
            ) : selected ? (
              <>
                <div className="admin-detail-actions flex items-center justify-between p-[9px_18px] [border-bottom:1px_solid_var(--line)] shrink-0 text-[#9ba9ba] text-[9px]">
                  <span>ID {selected.id}</span>
                  <Button
                    disabled={!auth.authenticated}
                    onClick={() =>
                      setEditing({
                        base: selected,
                        draft: createEditorDraft(selected),
                      })
                    }
                    variant="secondary"
                  >
                    {auth.authenticated ? "정보 수정" : "인증 후 수정 가능"}
                  </Button>
                </div>
                <div className="admin-detail-body min-h-0 flex-1">
                  <RestAreaDetails area={selected} onClose={close} stations={linkedStationsByRestId.get(selected.id)} onStationMap={station => {
                    if (!mayLeave()) return;
                    selectStation(stationKey(station));
                    setDetailModal(false);
                  }} />
                </div>
              </>
            ) : (
              <div className="detail-empty flex items-center justify-center gap-[15px] text-[#a3b3c7] h-full p-[25px]">
                <Icon name="pin" size={26} />
                <div>
                  <strong>휴게소 또는 주유소를 선택해주세요</strong>
                  <p>목록과 지도에서 정보를 확인하고 보완할 수 있습니다.</p>
                </div>
              </div>
            )}
          </div>
        </AdminDetailModal>
      )}
    </main>
  );
}
