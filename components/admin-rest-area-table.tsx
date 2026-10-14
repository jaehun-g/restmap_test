"use client";
import { useState } from "react";
import { sortFields, type SortField } from "@/lib/rest-area-fields";
import { hasCoordinates, type FacilityKey, type RestAreaRecord } from "@/lib/rest-areas";
import FacilitySummary from "./facility-summary";
import QueryState from "./query-state";
import Icon from "./icon";

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
  const columns = allColumns
    ? [...sortFields.filter((field) => field.key !== "id"), { key: "id" as const, label: "DB ID" }]
    : defaultColumns.map((key) => sortFields.find((field) => field.key === key)!);
  const cell = (area: RestAreaRecord, key: SortField) => {
    if (key === "name")
      return (
        <>
          <button
            className="table-area-name"
            aria-pressed={selectedId === area.id}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(area.id);
            }}
          >
            {area.name}
          </button>
          {!allColumns && <span className="table-meta">{area.phone || "전화번호 미등록"}</span>}
        </>
      );
    if (key === "routeName")
      return (
        <>
          {area.routeName ?? <span className="missing-value">미등록</span>}
          {!allColumns && area.routeNumber && (
            <span className="route-number">{area.routeNumber}</span>
          )}
        </>
      );
    if (key === "directionLabel")
      return (
        <>
          {area.directionLabel ?? "—"}
          {!allColumns && <span className="table-meta">{area.routeDirection ?? ""}</span>}
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
                ? "missing-value"
                : "table-meta"
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
      <div className="panel-heading">
        <h3 id="table-heading">
          휴게소 목록 <span>{rows.length}</span>
        </h3>
        <div className="table-heading-actions">
          <span className="table-source">
            {sortField === "id"
              ? "DB ID"
              : sortFields.find((field) => field.key === sortField)?.label}{" "}
            · {direction === "asc" ? "오름차순" : "내림차순"}
          </span>
          <button
            className="table-columns-toggle"
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
      <div className="table-scroll" aria-busy={loading}>
        {loading || error || !hasData ? (
          <QueryState loading={loading} error={error} onRetry={onRetry} />
        ) : !rows.length ? (
          <div className="query-state">
            <Icon name="search" size={27} />
            <strong>조건에 맞는 휴게소가 없습니다</strong>
            <button className="button secondary" onClick={onReset}>
              조건 초기화
            </button>
          </div>
        ) : (
          <table className="rest-area-table">
            <caption className="sr-only">
              휴게소 조회·정렬 목록. 컬럼 제목을 누르면 오름차순·내림차순으로 정렬합니다.
            </caption>
            <thead>
              <tr>
                <th scope="col" className="row-number-cell">
                  No
                </th>
                {columns.map(({ key, label }) => (
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
              {rows.map((area, index) => (
                <tr
                  key={area.id}
                  id={`rest-area-row-${area.id}`}
                  className={selectedId === area.id ? "selected-row" : ""}
                  onClick={() => onSelect(area.id)}
                >
                  <td className="row-number-cell">{rows.length - index}</td>
                  {columns.map(({ key }) => (
                    <td
                      key={key}
                      className={
                        key === "id"
                          ? "id-cell"
                          : key === "parkingCount"
                            ? "numeric-cell"
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
                      className={`coordinate-badge ${hasCoordinates(area) ? "valid" : "missing"}`}
                    >
                      {hasCoordinates(area) ? "등록" : "미등록 / 오류"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
