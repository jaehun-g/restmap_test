"use client";
import {Badge} from "@/components/ui/badge";
import {sharedClasses} from "@/lib/shared-classes";
import {Button} from "@/components/ui/button";
import {useState} from "react";
import {useInfiniteTableRows} from "@/hooks/use-infinite-table-rows";
import {Input} from "@/components/ui/field";
import {sortFields, type SortField} from "@/lib/rest-area-fields";
import {hasCoordinates, type FacilityKey, type RestAreaRecord} from "@/lib/rest-areas";
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
  searchValue,
  onSearchChange,
  onClose,
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
  searchValue: string;
  onSearchChange: (value: string) => void;
  onClose: () => void;
}) {
  const [allColumns, setAllColumns] = useState(false);
  const basicColumns = defaultColumns.map(key => sortFields.find(field => field.key === key)!);
  const columns = allColumns
    ? [...basicColumns, ...sortFields.filter(field => field.key !== "id" && !defaultColumns.includes(field.key)), {key: "id" as const, label: "DB ID"}]
    : basicColumns;
  const columnWidth = (key: SortField) => key === "name" ? 180 : 140;
  const selectedIndex = rows.findIndex(area => area.id === selectedId);
  const {visibleRows, sentinel, visibleCount} = useInfiniteTableRows(rows, selectedIndex);
  const cell = (area: RestAreaRecord, key: SortField) => {
    if (key === "name")
      return (
        <>
          <button
            className="table-area-name text-ink text-ui-12 font-[650] p-[2px_0] [border:0] bg-[transparent] text-left"
            aria-pressed={selectedId === area.id}
            onClick={event => {
              event.stopPropagation();
              onSelect(area.id);
            }}
          >
            {area.name}
          </button>
            <span className="table-meta block text-ui-10 mt-[5px] text-muted">
              {area.phone || "전화번호 미등록"}
            </span>
        </>
      );
    if (key === "routeName")
      return (
        <>
          {area.routeName ?? (
            <span className="missing-value text-lounge text-ui-10">미등록</span>
          )}
          {area.routeNumber && <Badge variant="route">{area.routeNumber}</Badge>}
        </>
      );
    if (key === "directionLabel")
      return (
        <>
          {area.directionLabel ?? "—"}
            <span className="table-meta block text-ui-10 mt-[5px] text-muted">
              {area.routeDirection ?? ""}
            </span>
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
                ? "missing-value text-lounge text-ui-10"
                : "table-meta block text-ui-10 mt-[5px] text-muted"
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
      <div className={sharedClasses.tablePanelHeading}>
        <div className="flex min-w-0 items-center gap-[12px]">
          <h3 id="table-heading" className="shrink-0">휴게소 목록 <span>{rows.length}</span></h3>
          <Input
            type="search"
            className="w-[min(320px,_34vw)]"
            aria-label="휴게소 목록 검색"
            placeholder="휴게소명·노선·전화번호 검색"
            value={searchValue}
            onChange={event => onSearchChange(event.target.value)}
          />
        </div>
        <div className={sharedClasses.tableHeadingActions}>
          <span className={sharedClasses.tableSource}>
            {sortField === "id"
              ? "DB ID"
              : sortFields.find(field => field.key === sortField)?.label}{" "}
            · {direction === "asc" ? "오름차순" : "내림차순"}
          </span>
          <button
            className={sharedClasses.tableColumnsToggle}
            aria-pressed={allColumns}
            onClick={() => {
              const next = !allColumns;
              setAllColumns(next);
              if (!next && !defaultColumns.includes(sortField)) onSort("name", "asc");
            }}
          >
            {allColumns ? "기본 컬럼 보기" : "전체 컬럼 보기"}
          </button>
          <Button onClick={onClose} variant="secondary">닫기</Button>
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
            <table className="admin-data-table rest-area-table table-fixed [border-collapse:collapse] text-left text-ui-12" style={{width: 48 + columns.reduce((sum, column) => sum + columnWidth(column.key), 0) + 340}}>
              <caption className={sharedClasses.screenReaderOnly}>
                휴게소 조회·정렬 목록. 컬럼 제목을 누르면 오름차순·내림차순으로 정렬합니다.
              </caption>
              <colgroup><col style={{width: 48}} />{basicColumns.map(column => <col key={column.key} style={{width: columnWidth(column.key)}} />)}<col style={{width: 240}} /><col style={{width: 100}} />{columns.slice(basicColumns.length).map(column => <col key={column.key} style={{width: columnWidth(column.key)}} />)}</colgroup>
              <thead>
                <tr>
                  <th scope="col" className="row-number-cell">
                    No
                  </th>
                  {basicColumns.map(({key, label}) => (
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
                  {columns.slice(basicColumns.length).map(({key, label}) => <th key={key} aria-sort={sortField === key ? direction === "asc" ? "ascending" : "descending" : "none"}><button onClick={() => onSort(key, sortField === key && direction === "asc" ? "desc" : "asc")}>{label}{sortField === key && (direction === "asc" ? " ↑" : " ↓")}</button></th>)}
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
                    <td className="row-number-cell">{index + 1}</td>
                    {basicColumns.map(({key}) => (
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
                        className={`coordinate-badge inline-block whitespace-nowrap p-[3px_6px] rounded-[4px] text-ui-10 ${hasCoordinates(area) ? "valid" : "missing"}`}
                      >
                        {hasCoordinates(area) ? "등록" : "미등록 / 오류"}
                      </span>
                    </td>
                    {columns.slice(basicColumns.length).map(({key}) => <td key={key} className={`overflow-hidden text-ellipsis whitespace-nowrap ${key === "id" ? "id-cell" : ""}`}>{cell(area, key)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleCount < rows.length && <div ref={sentinel} className="py-[12px] text-center text-ui-12 text-muted" aria-live="polite">아래로 스크롤하면 목록을 더 불러옵니다</div>}
          </div>
        </>
      )}
    </>
  );
}
