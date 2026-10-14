"use client";
import { useEffect, useState } from "react";
import { stationHours, stationServices, type GasStationRecord } from "@/lib/gas-stations";
import { hasCoordinates } from "@/lib/rest-areas";
import Icon from "./icon";

export default function GasStationDetails({ station, onClose, audience = "mobile", routeName }: {
  station: GasStationRecord; onClose: () => void; audience?: "mobile" | "admin"; routeName?: string | null;
}) {
  const [detail, setDetail] = useState<GasStationRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (audience !== "admin") return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void globalThis.fetch(`/api/gas-stations/${station.id}`, { cache: "no-store", signal: controller.signal })
        .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error?.message || "추가 정보를 조회하지 못했습니다."); if (!controller.signal.aborted) { setDetail(body.item); setError(null); } })
        .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "추가 정보를 조회하지 못했습니다."); });
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [station.id, audience, attempt]);
  const phone = station.phone?.replace(/[^\d+]/g, "");
  return <section className="detail-panel" aria-labelledby="station-detail-title">
    <div className="detail-heading"><div><span className="eyebrow">GS 주유·충전소</span><h2 id="station-detail-title">{station.name}</h2></div><button className="icon-button" aria-label="주유소 상세정보 닫기" onClick={onClose}><Icon name="close" /></button></div>
    <div className="detail-scroll">
      {routeName && <p className="station-route-note">{routeName} 주변 2km · 직선거리 기준<br />고속도로 내부 또는 진입 가능 여부는 확인이 필요합니다.</p>}
      <dl className="detail-facts">
        <div className="wide"><dt>주소</dt><dd>{[station.address, station.detailAddress].filter(Boolean).join(" ") || "정보 없음"}</dd></div>
        <div className="wide"><dt>영업시간</dt><dd>{stationHours(station)}</dd></div>
        <div className="wide"><dt>전화번호</dt><dd>{station.phone && phone ? <a href={`tel:${phone}`}><Icon name="phone" size={15} />{station.phone}</a> : "정보 없음"}</dd></div>
      </dl>
      <div className="facility-heading"><h3>주유소 시설·서비스</h3><span>있음 / 없음 / 미확인</span></div>
      <ul className="facility-list">{stationServices.map(({ key, label }) => { const value = station.services[key]; return <li key={key} className={value === true ? "available" : value === false ? "unavailable" : "unknown"}><span>{label}</span><span className="facility-state">{value === true ? "있음" : value === false ? "없음" : "미확인"}</span></li>; })}</ul>
      <p className="coordinate-note">{hasCoordinates(station) ? `위도 ${station.latitude.toFixed(10)} · 경도 ${station.longitude.toFixed(10)}` : "좌표 정보가 없어 지도에 표시되지 않습니다."}</p>
      {audience === "admin" && <details className="station-source-details"><summary>읽기 전용 원본 정보 · GS 코드 {station.siteCode}</summary>
        {error ? <p role="status">{error} <button className="button secondary" onClick={() => setAttempt((value) => value + 1)}>다시 조회</button></p> : detail?.id === station.id && detail.sourceDetails ? <dl className="detail-facts">{Object.entries(detail.sourceDetails).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value ?? "정보 없음"}</dd></div>)}</dl> : <p>추가 정보 조회 중</p>}
      </details>}
    </div>
  </section>;
}
