"use client";
import {sharedClasses} from "@/lib/shared-classes";
import {IconButton, Button} from "@/components/ui/button";
import {useEffect, useState} from "react";
import {
  stationHours,
  stationLabel,
  stationPriceItems,
  stationServices,
  type GasStationRecord,
} from "@/lib/gas-stations";
import {hasCoordinates} from "@/lib/rest-areas";
import Icon from "./icon";
export default function GasStationDetails({
  station,
  onClose,
  audience = "mobile",
  routeName,
}: {
  station: GasStationRecord;
  onClose: () => void;
  audience?: "mobile" | "admin";
  routeName?: string | null;
}) {
  const [detail, setDetail] = useState<GasStationRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (audience !== "admin" || station.brand !== "GS") return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void globalThis
        .fetch(`/api/gas-stations/${station.id}`, {cache: "no-store", signal: controller.signal})
        .then(async response => {
          const body = await response.json();
          if (!response.ok)
            throw new Error(body.error?.message || "추가 정보를 조회하지 못했습니다.");
          if (!controller.signal.aborted) {
            setDetail(body.item);
            setError(null);
          }
        })
        .catch(reason => {
          if (!controller.signal.aborted)
            setError(reason instanceof Error ? reason.message : "추가 정보를 조회하지 못했습니다.");
        });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [station.id, station.brand, audience, attempt]);
  const phone = station.phone?.replace(/[^\d+]/g, "");
  const prices = stationPriceItems(station);
  const priceTime = station.priceUpdatedAt ? new Date(station.priceUpdatedAt) : null;
  return (
    <section className={sharedClasses.detailPanel} aria-labelledby="station-detail-title">
      <div className={sharedClasses.detailHeading}>
        <div>
          <span className={sharedClasses.eyebrow}>{stationLabel(station)}</span>
          <h2 id="station-detail-title">{station.name}</h2>
        </div>
        <IconButton aria-label="주유소 상세정보 닫기" onClick={onClose}>
          <Icon name="close" />
        </IconButton>
      </div>
      <div className={sharedClasses.detailScroll}>
        {routeName && station.brand === "GS" && (
          <p className="station-route-note text-[#526882] bg-[#f1f7f4] rounded-[8px] p-[10px] text-[11px] leading-[1.6]">
            {routeName} 주변 2km · 직선거리 기준
            <br />
            고속도로 내부 또는 진입 가능 여부는 확인이 필요합니다.
          </p>
        )}
        <dl className={sharedClasses.detailFacts}>
          {(station.routeName || station.direction) && (
            <div className="wide">
              <dt>노선 · 방향</dt>
              <dd>{[station.routeName, station.direction].filter(Boolean).join(" · ")}</dd>
            </div>
          )}
          <div className="wide">
            <dt>주소</dt>
            <dd>
              {[station.address, station.detailAddress].filter(Boolean).join(" ") || "정보 없음"}
            </dd>
          </div>
          <div className="wide">
            <dt>영업시간</dt>
            <dd>{stationHours(station)}</dd>
          </div>
          <div className="wide">
            <dt>전화번호</dt>
            <dd>
              {station.phone && phone ? (
                <a href={`tel:${phone}`}>
                  <Icon name="phone" size={15} />
                  {station.phone}
                </a>
              ) : (
                "정보 없음"
              )}
            </dd>
          </div>
        </dl>
        {prices.length > 0 && (
          <section aria-label="유가 정보" className="station-price-section">
            <h3>유가 정보</h3>
            <dl className="station-fuel-prices">
              {prices.map(price => (
                <div key={price.key}>
                  <dt>{price.label}</dt>
                  <dd>{price.text}</dd>
                </div>
              ))}
            </dl>
            <p>
              한국도로공사 제공
              {priceTime && Number.isFinite(priceTime.getTime())
                ? ` · 수집 ${priceTime.toLocaleString("ko-KR", {timeZone: "Asia/Seoul"})}`
                : ""}
              <br />
              현장 가격과 다를 수 있습니다.
            </p>
          </section>
        )}
        <div className={sharedClasses.facilityHeading}>
          <h3>주유소 시설·서비스</h3>
          <span>있음 / 없음 / 미확인</span>
        </div>
        <ul className={sharedClasses.facilityList}>
          {stationServices.map(({key, label}) => {
            const value = station.services[key];
            return (
              <li
                key={key}
                className={
                  value === true ? "available" : value === false ? "unavailable" : "unknown"
                }
              >
                <span>{label}</span>
                <span className="facility-state shrink-0 text-[9px]">
                  {value === true ? "있음" : value === false ? "없음" : "미확인"}
                </span>
              </li>
            );
          })}
        </ul>
        <p className={sharedClasses.coordinateNote}>
          {hasCoordinates(station)
            ? `위도 ${station.latitude.toFixed(10)} · 경도 ${station.longitude.toFixed(10)}`
            : "좌표 정보가 없어 지도에 표시되지 않습니다."}
        </p>
        {audience === "admin" && station.brand === "GS" && (
          <details className="station-source-details p-[10px_0] text-[11px]">
            <summary>읽기 전용 원본 정보 · GS 코드 {station.siteCode}</summary>
            {error ? (
              <p role="status">
                {error}{" "}
                <Button onClick={() => setAttempt(value => value + 1)} variant="secondary">
                  다시 조회
                </Button>
              </p>
            ) : detail?.id === station.id && detail.sourceDetails ? (
              <dl className={sharedClasses.detailFacts}>
                {Object.entries(detail.sourceDetails).map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>{value ?? "정보 없음"}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p>추가 정보 조회 중</p>
            )}
          </details>
        )}
      </div>
    </section>
  );
}
