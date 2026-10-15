"use client";

import {Button} from "@/components/ui/button";
import {sharedClasses} from "@/lib/shared-classes";
import {pageForIndex, pageItems, tablePageSize} from "@/lib/pagination";
import {hasCoordinates} from "@/lib/rest-areas";
import {
  stationServices,
  type GasStationRecord,
  type StationScalarKey,
  type StationServiceKey,
} from "@/lib/gas-stations";
import {useEffect, useMemo, useState} from "react";
import QueryState from "./query-state";
import StationServiceSummary from "./station-service-summary";
import TablePagination from "./table-pagination";

type StationColumnKey = "id" | "siteCode" | StationScalarKey | StationServiceKey;
type StationColumn = {key: StationColumnKey; label: string};

const basicColumns: StationColumn[] = [
  {key: "name", label: "주유소명"},
  {key: "address", label: "주소"},
  {key: "phone", label: "전화번호"},
  {key: "cargo", label: "화물 특화"},
];
const fullColumns: StationColumn[] = [
  {key: "name", label: "주유소명"},
  {key: "siteCode", label: "GS 코드"},
  {key: "address", label: "주소"},
  {key: "detailAddress", label: "상세주소"},
  {key: "phone", label: "전화번호"},
  {key: "openTime", label: "영업 시작"},
  {key: "closeTime", label: "영업 종료"},
  {key: "latitude", label: "위도"},
  {key: "longitude", label: "경도"},
  ...stationServices.map(({key, label}) => ({key, label})),
  {key: "id", label: "DB ID"},
];

function serviceLabel(value: boolean | null) {
  return value === true ? "있음" : value === false ? "없음" : "미확인";
}

function timeLabel(value: string | null) {
  return value && /^\d{4}$/.test(value) ? `${value.slice(0, 2)}:${value.slice(2)}` : "—";
}

function valueForSort(station: GasStationRecord, key: StationColumnKey) {
  if (stationServices.some(service => service.key === key))
    return station.services[key as StationServiceKey];
  return station[key as Exclude<StationColumnKey, StationServiceKey>];
}

function columnClass(key: StationColumnKey) {
  if (key === "name") return "station-name-cell";
  if (key === "address") return "station-address-cell";
  if (key === "detailAddress") return "station-detail-address-cell";
  if (key === "phone") return "station-phone-cell";
  if (key === "latitude" || key === "longitude") return "station-coordinate-cell";
  if (stationServices.some(service => service.key === key)) return "station-service-cell";
  return undefined;
}

export default function GasStationTable({
  rows,
  selectedId,
  onSelect,
  loading,
  error,
  onRetry,
  onReset,
}: {
  rows: GasStationRecord[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onReset: () => void;
}) {
  const [page, setPage] = useState(0);
  const [allColumns, setAllColumns] = useState(false);
  const [sort, setSort] = useState<{key: StationColumnKey; asc: boolean}>({
    key: "name",
    asc: true,
  });
  const columns = allColumns ? fullColumns : basicColumns;
  const sorted = useMemo(
    () =>
      [...rows].sort((left, right) => {
        const a = valueForSort(left, sort.key);
        const b = valueForSort(right, sort.key);
        if (a === null || b === null) return a === b ? left.id - right.id : a === null ? 1 : -1;
        const comparison =
          typeof a === "number" && typeof b === "number"
            ? a - b
            : typeof a === "boolean" && typeof b === "boolean"
              ? Number(a) - Number(b)
              : String(a).localeCompare(String(b), "ko-KR", {numeric: true});
        return comparison * (sort.asc ? 1 : -1) || left.id - right.id;
      }),
    [rows, sort],
  );
  const selectedIndex = sorted.findIndex(station => station.id === selectedId);
  const visibleRows = useMemo(() => pageItems(sorted, page), [sorted, page]);
  useEffect(() => {
    const timer = window.setTimeout(() => setPage(0), 0);
    return () => window.clearTimeout(timer);
  }, [rows]);
  useEffect(() => {
    if (selectedIndex < 0) return;
    const timer = window.setTimeout(() => setPage(pageForIndex(selectedIndex)), 0);
    return () => window.clearTimeout(timer);
  }, [selectedIndex]);
  const sortBy = (key: StationColumnKey) => {
    setSort(value => ({key, asc: value.key === key ? !value.asc : true}));
    setPage(0);
  };
  const cell = (station: GasStationRecord, key: StationColumnKey) => {
    if (key === "name")
      return (
        <button
          className="table-name-button"
          aria-pressed={selectedId === station.id}
          onClick={event => {
            event.stopPropagation();
            onSelect(station.id);
          }}
        >
          {station.name}
        </button>
      );
    if (stationServices.some(service => service.key === key))
      return serviceLabel(station.services[key as StationServiceKey]);
    if (key === "latitude" || key === "longitude") return station[key]?.toFixed(10) ?? "—";
    if (key === "openTime" || key === "closeTime") return timeLabel(station[key]);
    if (key === "address" && !allColumns)
      return [station.address, station.detailAddress].filter(Boolean).join(" ") || "미등록";
    return station[key as Exclude<StationColumnKey, StationServiceKey>] ?? "—";
  };
  return (
    <section
      className="station-table-panel flex-1 min-h-[230px] flex flex-col"
      aria-label="주유소 목록"
    >
      <div className="panel-heading flex justify-between items-center gap-[12px] min-h-[57px] p-[15px_20px] [border-bottom:1px_solid_var(--line)] shrink-0">
        <h3>
          GS 주유·충전소 <span>{rows.length}</span>
        </h3>
        <div className="table-heading-actions flex items-center gap-[9px]">
          <span className="table-source text-[9px] text-[#99a6b7] tracking-[0.04em]">
            {columns.find(column => column.key === sort.key)?.label} ·{" "}
            {sort.asc ? "오름차순" : "내림차순"}
          </span>
          <button
            type="button"
            className="table-columns-toggle p-[7px_9px] min-h-[35px] [border:1px_solid_#e3e9f1] rounded-[6px] bg-[#f9fbfe] text-[#7185a1] text-[10px]"
            aria-pressed={allColumns}
            onClick={() => {
              const next = !allColumns;
              setAllColumns(next);
              if (!next && !basicColumns.some(column => column.key === sort.key))
                setSort({key: "name", asc: true});
            }}
          >
            {allColumns ? "기본 컬럼 보기" : "전체 컬럼 보기"}
          </button>
        </div>
      </div>
      {loading || error ? (
        <QueryState loading={loading} error={error} onRetry={onRetry} />
      ) : !rows.length ? (
        <div className={sharedClasses.queryState}>
          <strong>조건에 맞는 주유소가 없습니다</strong>
          <Button onClick={onReset} variant="secondary">
            조건 초기화
          </Button>
        </div>
      ) : (
        <>
          <div className="station-table-scroll table-scroll flex-1 min-h-0 overflow-auto">
            <table
              className={`admin-data-table station-table w-full [border-collapse:collapse] text-left text-[11px] ${allColumns ? "station-table--all min-w-[1900px]" : "station-table--basic min-w-[1180px]"}`}
            >
              <caption className="sr-only absolute w-[1px] h-[1px] p-[0] m-[-1px] overflow-hidden [clip:rect(0,_0,_0,_0)] whitespace-nowrap [border:0]">
                주유소 조회·정렬 목록. 컬럼 제목을 누르면 오름차순·내림차순으로 정렬합니다.
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="row-number-cell">
                    No
                  </th>
                  {columns.map(({key, label}) => (
                    <th
                      key={key}
                      className={columnClass(key)}
                      aria-sort={
                        sort.key === key ? (sort.asc ? "ascending" : "descending") : "none"
                      }
                    >
                      <button type="button" onClick={() => sortBy(key)}>
                        {label}
                        {sort.key === key && (sort.asc ? " ↑" : " ↓")}
                      </button>
                    </th>
                  ))}
                  {!allColumns && <th className="station-service-summary-cell">서비스 요약</th>}
                  <th>좌표 상태</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((station, index) => (
                  <tr
                    key={station.siteCode}
                    id={`station-row-${station.id}`}
                    className={selectedId === station.id ? "selected-row" : ""}
                    onClick={() => onSelect(station.id)}
                  >
                    <td className="row-number-cell">{page * tablePageSize + index + 1}</td>
                    {columns.map(({key}) => (
                      <td key={key} className={key === "id" ? "id-cell" : columnClass(key)}>
                        {cell(station, key)}
                      </td>
                    ))}
                    {!allColumns && (
                      <td className="station-service-summary-cell">
                        <StationServiceSummary station={station} />
                      </td>
                    )}
                    <td>
                      <span
                        className={`coordinate-badge inline-block whitespace-nowrap p-[3px_6px] rounded-[4px] text-[9px] ${hasCoordinates(station) ? "valid" : "missing"}`}
                      >
                        {hasCoordinates(station) ? "등록" : "미등록 / 오류"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination total={sorted.length} page={page} onPageChange={setPage} />
        </>
      )}
    </section>
  );
}
