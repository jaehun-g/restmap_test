"use client";

import {useState, type ComponentProps} from "react";
import {sharedClasses} from "@/lib/shared-classes";
import {IconButton} from "@/components/ui/button";
import {facilityDefinitions, hasCoordinates, highlightedFacilities, type FacilityKey, type RestArea, routeDescription} from "@/lib/rest-areas";
import {stationPriceItems, type GasStation} from "@/lib/gas-stations";
import {restAreaPriceSummary} from "@/lib/rest-area-prices";
import {formatDistance, type GeoPoint} from "@/lib/geo-search";
import type {RouteRestAreaMatch} from "@/lib/directions";
import {formatPlaceDistance} from "@/lib/navigation";
import FoodMenuSection from "@/components/food-menu-section";
import Icon from "./icon";

type Tab = "시설" | "음식" | "주유";
const facilityIcons: Record<FacilityKey, ComponentProps<typeof Icon>["name"]> = {
  has_truck_lounge: "truck",
  has_gas_station: "fuel",
  has_lpg_station: "fuel",
  has_ev_charger: "bolt",
  has_repair_shop: "repair",
  has_car_wash: "carWash",
  has_shower: "shower",
  has_sleeping_room: "bed",
  has_laundry: "laundry",
  has_restaurant: "restaurant",
  has_store: "store",
  has_restroom: "restroom",
};

export default function RestAreaDetails({
  area,
  onClose,
  audience = "admin",
  stations = [],
  onStationMap,
  preview = false,
  onExpand,
  userPosition = null,
  routeRestAreas = [],
  onSelectRestArea,
  onNavigate,
}: {
  area: RestArea;
  onClose: () => void;
  audience?: "admin" | "mobile";
  stations?: GasStation[];
  onStationMap?: (station: GasStation) => void;
  preview?: boolean;
  onExpand?: () => void;
  userPosition?: GeoPoint | null;
  routeRestAreas?: readonly RouteRestAreaMatch[];
  onSelectRestArea?: (id: number) => void;
  onNavigate?: () => void;
}) {
  const [tab, setTab] = useState<Tab>("시설");
  const distanceSummary = formatPlaceDistance(area, userPosition);
  const canNavigate = Boolean(onNavigate && hasCoordinates(area));
  const handleNavigate = () => {
    onNavigate?.();
  };
  const linkedStations = stations.filter(station => station.brand === "EX");
  const showStationOverviewLink =
    audience === "admin" ? linkedStations.length > 0 : linkedStations.length > 1;
  const selectTab = (next: Tab) => {
    setTab(next);
    onExpand?.();
  };
  const provided = facilityDefinitions.filter(([key]) => area.facilities[key] === true);
  const unavailable = facilityDefinitions.filter(([key]) => area.facilities[key] === false);
  const gasoline = restAreaPriceSummary(linkedStations, "gasoline");
  const diesel = restAreaPriceSummary(linkedStations, "diesel");

  return (
    <section className={sharedClasses.detailPanel} aria-labelledby="detail-title">
      <div className="detail-handle hidden" aria-hidden="true" />
      <div className={sharedClasses.detailHeading}>
        <div className="min-w-0 flex-1">
          {audience === "admin" && <span className={sharedClasses.eyebrow}>휴게소 상세정보</span>}
          <div className="detail-title-row">
            <h2 id="detail-title">{area.name}</h2>
            {canNavigate && (
              <button
                type="button"
                className="detail-navigate-button"
                onClick={handleNavigate}
                aria-label="길찾기"
                title="길찾기"
              >
                <Icon name="directions" size={18} />
              </button>
            )}
          </div>
          {area.operationStatus && area.operationStatus !== "open" && <p role="status" className="my-[8px] rounded-[6px] [border:1px_solid_var(--color-lounge-line)] bg-lounge-soft p-[8px_10px] text-ui-12 text-lounge">
            {area.operationStatus === "suspended" ? "일시 운영중지" : area.operationStatus === "closed" ? "운영 종료" : "운영 상태 확인 필요"}{area.operationNote ? ` · ${area.operationNote}` : ""}
          </p>}
          <div className="detail-meta-row">
            <p className="detail-route-line">
              {routeDescription(area, audience) || "노선 정보 없음"}
            </p>
            {distanceSummary && (
              <span
                className="detail-distance-text"
                aria-label={distanceSummary.detailText}
              >
                {distanceSummary.badgeText}
              </span>
            )}
          </div>
          <div className="detail-overview-tags mt-[8px]">
            {highlightedFacilities(area).map(([key, label]) => (
              <span key={key} className={`facility-highlight-${key}`}>{label}</span>
            ))}
            {audience === "admin" && area.restAreaType && <span>{area.restAreaType}</span>}
            {area.largeParkingCount != null && (
              <span className="large-parking-badge">대형주차 {area.largeParkingCount.toLocaleString("ko-KR")}면</span>
            )}
          </div>
        </div>
        {audience === "admin" && (
          <IconButton onClick={onClose} aria-label="상세정보 닫기">
            <Icon name="close" />
          </IconButton>
        )}
      </div>

      <div className="detail-overview shrink-0">
        <div className="detail-overview-prices">
          <span>
            <small>휘발유</small>
            <strong>{gasoline.text}</strong>
            {gasoline.partial && <small>일부 가격 미확인</small>}
          </span>
          <span>
            <small>경유</small>
            <strong>{diesel.text}</strong>
            {diesel.partial && <small>일부 가격 미확인</small>}
          </span>
        </div>
        {showStationOverviewLink && (
          <div className="detail-overview-actions">
            <button type="button" className="detail-station-link" onClick={() => selectTab("주유")}>
              {`주유소 ${linkedStations.length}곳 · 방향별 가격 확인 →`}
            </button>
          </div>
        )}
      </div>

      {audience !== "mobile" && routeRestAreas.length > 0 && (
        <div className="detail-route-areas" aria-label="이동 경로상 휴게소">
          <span className="detail-route-areas-label">
            이동 경로상 휴게소 {routeRestAreas.length}곳
          </span>
          <div className="detail-route-areas-list">
            {routeRestAreas.map(match => (
              <button
                key={match.area.id}
                type="button"
                className="detail-route-area-chip"
                onClick={() => onSelectRestArea?.(match.area.id)}
              >
                <span>{match.area.name}</span>
                <small>{formatDistance(match.alongMeters)}</small>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="detail-tabs shrink-0" role="tablist" aria-label="휴게소 상세정보">
        {(["시설", "음식", "주유"] as const).map(item => (
          <button
            key={item}
            id={`detail-tab-${item}`}
            type="button"
            role="tab"
            aria-selected={tab === item}
            aria-controls="detail-tabpanel"
            className={tab === item ? "active" : ""}
            onClick={() => selectTab(item)}
          >
            {item}
          </button>
        ))}
      </div>

      <div
        id="detail-tabpanel"
        role="tabpanel"
        aria-labelledby={`detail-tab-${tab}`}
        hidden={preview}
        className={`${sharedClasses.detailScroll} detail-tab-content`}
      >
        {tab === "시설" && (
          <section aria-label="편의시설">
            <div className="detail-section-heading">
              <h3>편의시설</h3>
              <span>{provided.length}개</span>
            </div>
            {provided.length ? (
              <ul className="detail-facility-grid">
                {provided.map(([key, label]) => (
                  <li key={key}>
                    <span className="detail-facility-icon">
                      <Icon name={facilityIcons[key]} size={20} />
                    </span>
                    <span>{label}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="detail-empty-state">이용 가능 여부가 확인된 시설이 없습니다.</p>
            )}
            {unavailable.length > 0 && (
              <p className="detail-unavailable">
                미제공 시설: {unavailable.map(([, label]) => label).join(" · ")}
              </p>
            )}
          </section>
        )}
        {tab === "음식" && <FoodMenuSection key={area.id} restAreaId={area.id} />}
        {tab === "주유" && (
          <section className="detail-gas-content" aria-label="주유소 정보">
            <div className="detail-section-heading">
              <h3>주유소</h3>
              <span>{linkedStations.length}곳</span>
            </div>
            {linkedStations.length ? (
              linkedStations.map(station => {
                const prices = stationPriceItems(station);
                return (
                  <article key={station.siteCode} className="station-price-section">
                    <h3>{station.name}</h3>
                    <p>{station.direction ? `${station.direction.replace(/방향/g, "").trim()} 방향` : "방향 정보 없음"}</p>
                    {audience !== "mobile" && onStationMap && (
                      <button type="button" className="detail-station-link" onClick={() => onStationMap(station)}>
                        지도에서 보기 →
                      </button>
                    )}
                    {prices.length ? (
                      <dl className="station-fuel-prices">
                        {prices.map(price => (
                          <div key={price.key}>
                            <dt>{price.label}</dt>
                            <dd>{price.text.replace("원/L", "/L")}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p>등록된 유가 정보가 없습니다.</p>
                    )}
                    <p>
                      가격 수집 시각:{" "}
                      {station.priceUpdatedAt
                        ? new Date(station.priceUpdatedAt).toLocaleString("ko-KR", {
                            timeZone: "Asia/Seoul",
                          })
                        : "정보 없음"}
                    </p>
                  </article>
                );
              })
            ) : (
              <div className="detail-empty-state">
                <strong>연결된 주유소가 없습니다.</strong>
                <p>현재 휴게소에 등록된 주유소 정보를 찾을 수 없습니다.</p>
              </div>
            )}
          </section>
        )}
      </div>
    </section>
  );
}
