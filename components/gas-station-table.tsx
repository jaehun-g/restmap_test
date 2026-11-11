"use client";

import {Button} from "@/components/ui/button";
import {sharedClasses} from "@/lib/shared-classes";
import {useInfiniteTableRows} from "@/hooks/use-infinite-table-rows";
import {Input} from "@/components/ui/field";
import {hasCoordinates} from "@/lib/rest-areas";
import {
  stationServices,
  stationKey,
  stationLabel,
  type GasStationRecord,
  type StationScalarKey,
  type StationServiceKey,
} from "@/lib/gas-stations";
import {useMemo, useState} from "react";
import QueryState from "./query-state";
import StationServiceSummary from "./station-service-summary";

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
  {key: "siteCode", label: "출처별 코드"},
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
  searchValue,
  onSearchChange,
  onClose,
}: {
  rows: GasStationRecord[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onReset: () => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onClose: () => void;
}) {
  const [allColumns, setAllColumns] = useState(false);
  const [sort, setSort] = useState<{key: StationColumnKey; asc: boolean}>({
    key: "name",
    asc: true,
  });
  const columns = allColumns
    ? [...basicColumns, ...fullColumns.filter(column => !basicColumns.some(basic => basic.key === column.key))]
    : basicColumns;
  const columnWidth = (key: StationColumnKey) => key === "address" ? 300 : key === "name" ? 180 : key === "detailAddress" ? 240 : 140;
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
  const selectedIndex = sorted.findIndex(station => stationKey(station) === selectedId);
  const {visibleRows, sentinel, visibleCount} = useInfiniteTableRows(sorted, selectedIndex);
  const sortBy = (key: StationColumnKey) => {
    setSort(value => ({key, asc: value.key === key ? !value.asc : true}));
  };
  const cell = (station: GasStationRecord, key: StationColumnKey) => {
    if (key === "name")
      return (
        <>
          <button
            className="table-name-button"
            aria-pressed={selectedId === stationKey(station)}
            onClick={event => {
              event.stopPropagation();
              onSelect(stationKey(station));
            }}
          >
            {station.name}
          </button>
          <small className="block text-ui-10 text-[#637995]">{stationLabel(station)}</small>
        </>
      );
    if (stationServices.some(service => service.key === key))
      return serviceLabel(station.services[key as StationServiceKey]);
    if (key === "latitude" || key === "longitude") return station[key]?.toFixed(10) ?? "—";
    if (key === "openTime" || key === "closeTime") return timeLabel(station[key]);
    if (key === "address")
      return [station.address, station.detailAddress].filter(Boolean).join(" ") || "미등록";
    return station[key as Exclude<StationColumnKey, StationServiceKey>] ?? "—";
  };
  return (
    <section
      className="station-table-panel flex-1 min-h-[230px] flex flex-col"
      aria-label="주유소 목록"
    >
      <div className={sharedClasses.tablePanelHeading}>
        <div className="flex min-w-0 items-center gap-[12px]">
          <h3 className="shrink-0">주유·충전소 <span>{rows.length}</span></h3>
          <Input
            type="search"
            className="w-[min(320px,_34vw)]"
            aria-label="주유·충전소 목록 검색"
            placeholder="주유소명·주소·전화번호 검색"
            value={searchValue}
            onChange={event => onSearchChange(event.target.value)}
          />
        </div>
        <div className={sharedClasses.tableHeadingActions}>
          <span className={sharedClasses.tableSource}>
            {columns.find(column => column.key === sort.key)?.label} ·{" "}
            {sort.asc ? "오름차순" : "내림차순"}
          </span>
          <button
            type="button"
            className={sharedClasses.tableColumnsToggle}
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
          <Button onClick={onClose} variant="secondary">닫기</Button>
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
              className="admin-data-table station-table table-fixed [border-collapse:collapse] text-left text-ui-12"
              style={{width: 48 + columns.reduce((sum, column) => sum + columnWidth(column.key), 0) + 340}}
            >
              <caption className={sharedClasses.screenReaderOnly}>
                주유소 조회·정렬 목록. 컬럼 제목을 누르면 오름차순·내림차순으로 정렬합니다.
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
                  <th className="station-service-summary-cell">서비스 요약</th>
                  <th>좌표 상태</th>
                  {columns.slice(basicColumns.length).map(({key, label}) => <th key={key} className={columnClass(key)} aria-sort={sort.key === key ? (sort.asc ? "ascending" : "descending") : "none"}><button type="button" onClick={() => sortBy(key)}>{label}{sort.key === key && (sort.asc ? " ↑" : " ↓")}</button></th>)}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((station, index) => (
                  <tr
                    key={stationKey(station)}
                    id={`station-row-${stationKey(station)}`}
                    className={selectedId === stationKey(station) ? "selected-row" : ""}
                    onClick={() => onSelect(stationKey(station))}
                  >
                    <td className="row-number-cell">{index + 1}</td>
                    {basicColumns.map(({key}) => (
                      <td key={key} className={key === "id" ? "id-cell" : columnClass(key)}>
                        {cell(station, key)}
                      </td>
                    ))}
                      <td className="station-service-summary-cell">
                        <StationServiceSummary station={station} />
                      </td>
                    <td>
                      <span
                        className={`coordinate-badge inline-block whitespace-nowrap p-[3px_6px] rounded-[4px] text-ui-10 ${hasCoordinates(station) ? "valid" : "missing"}`}
                      >
                        {hasCoordinates(station) ? "등록" : "미등록 / 오류"}
                      </span>
                    </td>
                    {columns.slice(basicColumns.length).map(({key}) => <td key={key} className={`overflow-hidden text-ellipsis !whitespace-nowrap ${key === "id" ? "id-cell" : columnClass(key) ?? ""}`}>{cell(station, key)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleCount < sorted.length && <div ref={sentinel} className="py-3 text-center text-xs text-slate-500" aria-live="polite">아래로 스크롤하면 목록을 더 불러옵니다</div>}
          </div>
        </>
      )}
    </section>
  );
}
