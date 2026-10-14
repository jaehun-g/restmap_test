"use client";
import { useEffect, useMemo, useState } from "react";
import type { GasStationRecord } from "@/lib/gas-stations";
import QueryState from "./query-state";

export default function GasStationTable({ rows, selectedId, onSelect, loading, error, onRetry }: {
  rows: GasStationRecord[]; selectedId: number | null; onSelect: (id: number) => void;
  loading: boolean; error: string | null; onRetry: () => void;
}) {
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<{ key: "name" | "address"; asc: boolean }>({ key: "name", asc: true });
  const sorted = useMemo(() => [...rows].sort((a, b) => (a[sort.key] ?? "").localeCompare(b[sort.key] ?? "", "ko-KR", { numeric: true }) * (sort.asc ? 1 : -1) || a.id - b.id), [rows, sort]);
  const selectedIndex = sorted.findIndex((station) => station.id === selectedId);
  useEffect(() => {
    if (selectedIndex < 0) return;
    let active = true;
    queueMicrotask(() => { if (active) setPage(Math.floor(selectedIndex / 50)); });
    return () => { active = false; };
  }, [selectedIndex, selectedId]);
  const pages = Math.max(1, Math.ceil(sorted.length / 50)), current = Math.min(page, pages - 1);
  const sortBy = (key: "name" | "address") => { setSort((value) => ({ key, asc: value.key === key ? !value.asc : true })); setPage(0); };
  return <section className="station-table-panel" aria-label="주유소 목록">
    <div className="panel-heading"><h3>GS 주유·충전소 <span>{rows.length}개</span></h3></div>
    {loading || error ? <QueryState loading={loading} error={error} onRetry={onRetry} /> : !rows.length ? <p className="query-state">조건에 맞는 주유소가 없습니다.</p> : <>
      <div className="station-table-scroll"><table className="admin-table"><thead><tr><th>No</th><th><button onClick={() => sortBy("name")}>주유소명{sort.key === "name" ? sort.asc ? " ↑" : " ↓" : ""}</button></th><th><button onClick={() => sortBy("address")}>주소{sort.key === "address" ? sort.asc ? " ↑" : " ↓" : ""}</button></th><th>화물 특화</th><th>전화번호</th></tr></thead><tbody>{sorted.slice(current * 50, (current + 1) * 50).map((station, index) => <tr key={station.siteCode} id={`station-row-${station.id}`} className={selectedId === station.id ? "selected" : ""}><td>{current * 50 + index + 1}</td><td><button className="table-name-button" onClick={() => onSelect(station.id)}>{station.name}</button></td><td>{[station.address, station.detailAddress].filter(Boolean).join(" ") || "미등록"}</td><td>{station.services.cargo === true ? "있음" : station.services.cargo === false ? "없음" : "미확인"}</td><td>{station.phone ?? "미등록"}</td></tr>)}</tbody></table></div>
      <div className="station-pagination"><button className="button secondary" disabled={current === 0} onClick={() => setPage(current - 1)}>이전</button><span>{current + 1} / {pages} · 페이지당 50개</span><button className="button secondary" disabled={current + 1 === pages} onClick={() => setPage(current + 1)}>다음</button></div>
    </>}
  </section>;
}
