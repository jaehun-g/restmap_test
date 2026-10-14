"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRestAreas } from "@/hooks/use-rest-areas";
import { useSearchQuery } from "@/hooks/use-search-query";
import { useAdminSession } from "@/hooks/use-admin-session";
import { useMapFitRequest } from "@/hooks/use-map-fit-request";
import {
  filterRestAreas,
  initialFilters,
  sortRestAreas,
  type RestAreaFilters,
} from "@/lib/rest-area-filters";
import type { SortField } from "@/lib/rest-area-fields";
import { createEditorDraft, editorIsDirty, type EditorDraft } from "@/lib/rest-area-editor";
import { hasCoordinates, type RestAreaRecord } from "@/lib/rest-areas";
import KakaoMap from "./kakao-map";
import RestAreaDetails from "./rest-area-details";
import RestAreaEditor from "./rest-area-editor";
import AdminRestAreaTable from "./admin-rest-area-table";
import AdminFilterBar from "./admin-filter-bar";
import AdminAuthControl from "./admin-auth-control";
import Icon from "./icon";
import { useGasStations } from "@/hooks/use-gas-stations";
import { stationQueryString } from "@/lib/gas-station-query";
import { filterStations, type PlaceView } from "@/lib/map-places";
import type { GasStationRecord, StationServiceKey } from "@/lib/gas-stations";
import PlaceControls from "./place-controls";
import GasStationTable from "./gas-station-table";
import GasStationDetails from "./gas-station-details";
import GasStationEditor from "./gas-station-editor";
const noAreas: RestAreaRecord[] = [];

export default function AdminExplorer() {
  const { data, areas, loading, error, reload, replaceItem } = useRestAreas();
  const view = useMapFitRequest();
  const search = useSearchQuery(view.requestFit);
  const auth = useAdminSession();
  const [filters, setFilters] = useState(initialFilters);
  const [placeView, setPlaceView] = useState<PlaceView>("all");
  const [stationFilters, setStationFilters] = useState<StationServiceKey[]>([]);
  const gas = useGasStations(
    placeView === "rest"
      ? null
      : stationQueryString(filters.missingRoute ? null : filters.routeName, { kind: "all" }),
  );
  const [selectedStationId, setSelectedStationId] = useState<number | null>(null);
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
  const detailRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const dirty = (!!editing && editorIsDirty(editing.base, editing.draft)) || stationDirty;
  const anyEditing = !!editing || !!editingStation;
  const editState = useRef({ dirty, saving });
  useEffect(() => {
    editState.current = { dirty, saving };
  }, [dirty, saving]);
  const results = useMemo(
    () => filterRestAreas(areas, filters, search.query),
    [areas, filters, search.query],
  );
  const sorted = useMemo(
    () => sortRestAreas(results, sortField, direction),
    [results, sortField, direction],
  );
  const selected = results.find((area) => area.id === selectedId);
  const stationResults = useMemo(
    () => filterStations(gas.stations, search.query, stationFilters),
    [gas.stations, search.query, stationFilters],
  );
  const visibleAreas = placeView === "station" ? noAreas : results;
  const selectedStation = stationResults.find((station) => station.id === selectedStationId);
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
    setEditing(null);
    setEditingStation(null);
    setStationDirty(false);
    editState.current.dirty = false;
    setSelectedStationId(null);
    setSelectedId(null);
    returnFocus.current?.focus({ preventScroll: true });
  }, [mayLeave]);
  const details = useCallback((id: number) => select(id), [select]);
  const selectStation = useCallback(
    (id: number | null) => {
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
  const stationDetails = useCallback((id: number) => selectStation(id), [selectStation]);
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
    detailRef.current?.focus({ preventScroll: true });
    document
      .getElementById(
        selectedStationId !== null
          ? `station-row-${selectedStationId}`
          : `rest-area-row-${selectedId}`,
      )
      ?.scrollIntoView({ block: "nearest" });
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
  const mapped =
    visibleAreas.filter(hasCoordinates).length + stationResults.filter(hasCoordinates).length;
  const missingRoute = areas.filter((area) => area.routeName === null).length;
  const unknownLounge = areas.filter((area) => area.facilities.has_truck_lounge === null).length;
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
    setStationFilters([]);
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

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div className="admin-brand">
          <span className="brand-icon">
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
        <div className="admin-actions">
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
          <Link href="/mobile" className="button secondary" target="_blank">
            사용자 화면
            <Icon name="arrow" size={16} />
          </Link>
          <button className="button primary" disabled={loading || saving} onClick={reloadData}>
            <Icon name="refresh" size={17} />
            다시 조회
          </button>
        </div>
      </header>
      <section className="admin-intro">
        <div>
          <span className="eyebrow">휴게소·주유소 데이터</span>
          <h2>조회하고, 필요한 정보를 보완하세요.</h2>
          <p>표의 이름 또는 지도 마커를 선택해 상세정보를 확인하세요.</p>
        </div>
        <div className="admin-stat-cards">
          <div>
            <span>전체 휴게소</span>
            <strong>{loading ? "—" : areas.length}</strong>
          </div>
          <div>
            <span>검색 결과</span>
            <strong>{visibleAreas.length + stationResults.length}</strong>
          </div>
          <button
            disabled={anyEditing}
            className={filters.missingRoute ? "active" : ""}
            onClick={() => {
              setFilters((current) => ({
                ...current,
                routeName: null,
                missingRoute: !current.missingRoute,
              }));
              view.requestFit();
            }}
          >
            <span>노선 미등록</span>
            <strong>{missingRoute}</strong>
            <small>전체 데이터 기준</small>
          </button>
          <button
            disabled={anyEditing}
            className={filters.lounge === "unknown" ? "active" : ""}
            onClick={() => {
              setFilters((current) => ({
                ...current,
                lounge: current.lounge === "unknown" ? "all" : "unknown",
              }));
              view.preserveView();
            }}
          >
            <span>라운지 미확인</span>
            <strong>{unknownLounge}</strong>
            <small>전체 데이터 기준</small>
          </button>
        </div>
      </section>
      <PlaceControls
        view={placeView}
        onView={(next) => {
          if (!mayLeave()) return;
          setPlaceView(next);
          setFilters((current) => ({ ...current, missingRoute: false }));
          setSelectedId(null);
          setSelectedStationId(null);
          view.requestFit();
        }}
        services={stationFilters}
        onServices={(next) => {
          setStationFilters(next);
          view.preserveView();
        }}
        disabled={anyEditing}
      />
      <AdminFilterBar
        areas={areas}
        filters={filters}
        onChange={changeFilters}
        search={search}
        onReset={reset}
        disabled={anyEditing}
        includeStations={placeView !== "rest"}
        hideRestFilters={placeView === "station"}
      />
      {filters.routeName && placeView !== "rest" && (
        <p className="station-route-note compact">
          GS 주유소는 선택 노선 주변 2km · 직선거리 기준이며 고속도로 소속을 뜻하지 않습니다.
        </p>
      )}
      {notice && (
        <div className="save-notice" role="status">
          <Icon name="check" size={17} />
          {notice}
          <button
            className="icon-button"
            aria-label="저장 안내 닫기"
            onClick={() => setNotice(null)}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      <div className="admin-workspace">
        <section className="admin-table-panel" aria-labelledby="table-heading">
          {placeView !== "station" && (
            <AdminRestAreaTable
              rows={sorted}
              selectedId={selectedId}
              sortField={sortField}
              direction={direction}
              onSort={changeSort}
              onSelect={select}
              loading={loading}
              error={error}
              hasData={!!areas.length}
              onRetry={reloadData}
              onReset={reset}
            />
          )}
          {placeView !== "rest" && (
            <GasStationTable
              rows={stationResults}
              selectedId={selectedStationId}
              onSelect={stationDetails}
              loading={gas.loading}
              error={gas.error}
              onRetry={() => {
                void gas.reload();
              }}
            />
          )}
          <div className="panel-footer">
            <span>
              지도 {mapped}개 · 좌표 확인 필요{" "}
              {visibleAreas.length + stationResults.length - mapped}개
            </span>
            {data && (
              <time dateTime={data.fetchedAt}>
                최근 조회{" "}
                {new Date(data.fetchedAt).toLocaleTimeString("ko-KR", {
                  hour12: false,
                  timeZone: "Asia/Seoul",
                })}
              </time>
            )}
          </div>
        </section>
        <section className="admin-map-panel" aria-label="지도 및 상세정보">
          <div className="panel-heading">
            <h3>휴게소·주유소 위치</h3>
            <span className="table-source">KAKAO MAP</span>
          </div>
          <div className="admin-map">
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
              selectedRouteName={filters.missingRoute ? null : filters.routeName}
              selectedId={selected?.id ?? null}
              onSelect={select}
              onDetails={details}
              showCard={!anyEditing}
              fitRequest={view.fitRequest}
              dataVersion={`${data?.fetchedAt ?? ""}|${gas.data?.fetchedAt ?? ""}`}
            />
          </div>
          <div className="admin-details" ref={detailRef} tabIndex={selected ? -1 : undefined}>
            {editingStation ? (
              <GasStationEditor
                key={editingStation.id}
                original={editingStation}
                authenticated={auth.authenticated}
                onDirty={(value) => {
                  editState.current.dirty = value;
                  setStationDirty(value);
                }}
                onBusy={(value) => {
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
                onSaved={(record) => {
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
                onChange={(draft) => {
                  editState.current.dirty = editorIsDirty(editing.base, draft);
                  setEditing((current) => (current ? { ...current, draft } : current));
                }}
                authenticated={auth.authenticated}
                onBusy={(busy) => {
                  editState.current.saving = busy;
                  setSaving(busy);
                }}
                onExpired={() => {
                  void auth.refresh();
                }}
                onCancel={() => {
                  if (mayLeave()) setEditing(null);
                }}
                onSaved={(record) => {
                  replaceItem(record);
                  view.requestFit();
                  setEditing(null);
                  setNotice(`${record.name}의 변경사항을 저장했습니다.`);
                  if (!filterRestAreas([record], filters, search.query).length) setSelectedId(null);
                }}
              />
            ) : selectedStation ? (
              <>
                <div className="admin-detail-actions">
                  <span>GS 코드 {selectedStation.siteCode}</span>
                  <button
                    className="button secondary"
                    disabled={!auth.authenticated}
                    onClick={() => setEditingStation(selectedStation)}
                  >
                    {auth.authenticated ? "정보 수정" : "인증 후 수정 가능"}
                  </button>
                </div>
                <div className="admin-detail-body">
                  <GasStationDetails
                    key={selectedStation.id}
                    station={selectedStation}
                    onClose={close}
                    audience="admin"
                    routeName={filters.routeName}
                  />
                </div>
              </>
            ) : selected ? (
              <>
                <div className="admin-detail-actions">
                  <span>ID {selected.id}</span>
                  <button
                    className="button secondary"
                    disabled={!auth.authenticated}
                    onClick={() =>
                      setEditing({
                        base: selected,
                        draft: createEditorDraft(selected),
                      })
                    }
                  >
                    {auth.authenticated ? "정보 수정" : "인증 후 수정 가능"}
                  </button>
                </div>
                <div className="admin-detail-body">
                  <RestAreaDetails area={selected} onClose={close} />
                </div>
              </>
            ) : (
              <div className="detail-empty">
                <Icon name="pin" size={26} />
                <div>
                  <strong>휴게소 또는 주유소를 선택해주세요</strong>
                  <p>목록과 지도에서 정보를 확인하고 보완할 수 있습니다.</p>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
