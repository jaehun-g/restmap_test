"use client";
import {Badge} from "@/components/ui/badge";
import {sharedClasses} from "@/lib/shared-classes";
import {Button} from "@/components/ui/button";
import {useEffect, useMemo, useState} from "react";
import {pageForIndex, pageItems, tablePageSize} from "@/lib/pagination";
import {sortFields, type SortField} from "@/lib/rest-area-fields";
import {hasCoordinates, type FacilityKey, type RestAreaRecord} from "@/lib/rest-areas";
import FacilitySummary from "./facility-summary";
import QueryState from "./query-state";
import Icon from "./icon";
import TablePagination from "./table-pagination";
const defaultColumns: SortField[] = [
  "name",
  "routeName",
  "directionLabel",
  "restAreaType",
  "parkingCount",
  "has_truck_lounge",
];
export default function AdminRestAreaTable({
  rows,
  selectedId,
  sortField,
  direction,
  onSort,
  onSelect,
  loading,
  error,
  hasData,
  onRetry,
  onReset,
}: {
  rows: RestAreaRecord[];
  selectedId: number | null;
  sortField: SortField;
  direction: "asc" | "desc";
  onSort: (field: SortField, direction: "asc" | "desc") => void;
  onSelect: (id: number) => void;
  loading: boolean;
  error: string | null;
  hasData: boolean;
  onRetry: () => void;
  onReset: () => void;
}) {
  const [allColumns, setAllColumns] = useState(false);
  const [page, setPage] = useState(0);
  const columns = allColumns
    ? [...sortFields.filter(field => field.key !== "id"), {key: "id" as const, label: "DB ID"}]
    : defaultColumns.map(key => sortFields.find(field => field.key === key)!);
  const selectedIndex = rows.findIndex(area => area.id === selectedId);
  const visibleRows = useMemo(() => pageItems(rows, page), [rows, page]);
  useEffect(() => {
    const timer = window.setTimeout(() => setPage(0), 0);
    return () => window.clearTimeout(timer);
  }, [rows]);
  useEffect(() => {
    if (selectedIndex < 0) return;
    const timer = window.setTimeout(() => setPage(pageForIndex(selectedIndex)), 0);
    return () => window.clearTimeout(timer);
  }, [selectedIndex]);
  const cell = (area: RestAreaRecord, key: SortField) => {
    if (key === "name")
      return (
        <>
          <button
            className="table-area-name text-[#33445d] text-[12px] font-[650] p-[2px_0] [border:0] bg-[transparent] text-left"
            aria-pressed={selectedId === area.id}
            onClick={event => {
              event.stopPropagation();
              onSelect(area.id);
            }}
          >
            {area.name}
          </button>
          {!allColumns && (
            <span className="table-meta block text-[9px] mt-[5px] text-[#97a3b3]">
              {area.phone || "전화번호 미등록"}
            </span>
          )}
        </>
      );
    if (key === "routeName")
      return (
        <>
          {area.routeName ?? (
            <span className="missing-value text-[#b58a48] text-[10px]">미등록</span>
          )}
          {!allColumns && area.routeNumber && <Badge variant="route">{area.routeNumber}</Badge>}
        </>
      );
    if (key === "directionLabel")
      return (
        <>
          {area.directionLabel ?? "—"}
          {!allColumns && (
            <span className="table-meta block text-[9px] mt-[5px] text-[#97a3b3]">
              {area.routeDirection ?? ""}
            </span>
          )}
        </>
      );
    if (key.startsWith("has_")) {
      const value = area.facilities[key as FacilityKey];
      return (
        <span
          className={
            value === true && key === "has_truck_lounge"
              ? "lounge-badge"
              : value === null
                ? "missing-value text-[#b58a48] text-[10px]"
                : "table-meta block text-[9px] mt-[5px] text-[#97a3b3]"
          }
        >
          {value === true ? "있음" : value === false ? "없음" : "미확인"}
        </span>
      );
    }
    if (key === "latitude" || key === "longitude") return area[key]?.toFixed(7) ?? "—";
    if (key === "parkingCount")
      return area.parkingCount === null ? "—" : `${area.parkingCount.toLocaleString("ko-KR")}대`;
    return area[key as Exclude<SortField, FacilityKey>] ?? "—";
  };
  return (
    <>
      <div className="panel-heading flex justify-between items-center gap-[12px] min-h-[57px] p-[15px_20px] [border-bottom:1px_solid_var(--line)] shrink-0">
        <h3 id="table-heading">
          휴게소 목록 <span>{rows.length}</span>
        </h3>
        <div className="table-heading-actions flex items-center gap-[9px]">
          <span className="table-source text-[9px] text-[#99a6b7] tracking-[0.04em]">
            {sortField === "id"
              ? "DB ID"
              : sortFields.find(field => field.key === sortField)?.label}{" "}
            · {direction === "asc" ? "오름차순" : "내림차순"}
          </span>
          <button
            className="table-columns-toggle p-[7px_9px] min-h-[35px] [border:1px_solid_#e3e9f1] rounded-[6px] bg-[#f9fbfe] text-[#7185a1] text-[10px]"
            aria-pressed={allColumns}
            onClick={() => {
              const next = !allColumns;
              setAllColumns(next);
              if (!next && !defaultColumns.includes(sortField)) onSort("name", "asc");
            }}
          >
            {allColumns ? "기본 컬럼 보기" : "전체 컬럼 보기"}
          </button>
        </div>
      </div>
      {loading || error || !hasData ? (
        <div className="table-scroll flex-1 min-h-0 overflow-auto" aria-busy={loading}>
          <QueryState loading={loading} error={error} onRetry={onRetry} />
        </div>
      ) : !rows.length ? (
        <div className="table-scroll flex-1 min-h-0 overflow-auto">
          <div className={sharedClasses.queryState}>
            <Icon name="search" size={27} />
            <strong>조건에 맞는 휴게소가 없습니다</strong>
            <Button onClick={onReset} variant="secondary">
              조건 초기화
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="table-scroll flex-1 min-h-0 overflow-auto">
            <table className="admin-data-table rest-area-table w-full [border-collapse:collapse] text-left text-[11px] min-w-[910px]">
              <caption className="sr-only absolute w-[1px] h-[1px] p-[0] m-[-1px] overflow-hidden [clip:rect(0,_0,_0,_0)] whitespace-nowrap [border:0]">
                휴게소 조회·정렬 목록. 컬럼 제목을 누르면 오름차순·내림차순으로 정렬합니다.
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="row-number-cell">
                    No
                  </th>
                  {columns.map(({key, label}) => (
                    <th
                      key={key}
                      aria-sort={
                        sortField === key
                          ? direction === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                    >
                      <button
                        onClick={() =>
                          onSort(key, sortField === key && direction === "asc" ? "desc" : "asc")
                        }
                      >
                        {label}
                        {sortField === key && (direction === "asc" ? " ↑" : " ↓")}
                      </button>
                    </th>
                  ))}
                  <th>편의시설 요약</th>
                  <th>좌표 상태</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((area, index) => (
                  <tr
                    key={area.id}
                    id={`rest-area-row-${area.id}`}
                    className={selectedId === area.id ? "selected-row" : ""}
                    onClick={() => onSelect(area.id)}
                  >
                    <td className="row-number-cell">{page * tablePageSize + index + 1}</td>
                    {columns.map(({key}) => (
                      <td
                        key={key}
                        className={
                          key === "id"
                            ? "id-cell"
                            : key === "parkingCount"
                              ? "numeric-cell whitespace-nowrap"
                              : undefined
                        }
                      >
                        {cell(area, key)}
                      </td>
                    ))}
                    <td>
                      <FacilitySummary area={area} />
                    </td>
                    <td>
                      <span
                        className={`coordinate-badge inline-block whitespace-nowrap p-[3px_6px] rounded-[4px] text-[9px] ${hasCoordinates(area) ? "valid" : "missing"}`}
                      >
                        {hasCoordinates(area) ? "등록" : "미등록 / 오류"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination total={rows.length} page={page} onPageChange={setPage} />
        </>
      )}
    </>
  );
}
