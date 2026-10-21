"use client";

import {useState} from "react";
import {sharedClasses} from "@/lib/shared-classes";
import {IconButton} from "@/components/ui/button";
import {facilityDefinitions, type RestArea, routeDescription} from "@/lib/rest-areas";
import {stationPriceItems, type GasStation} from "@/lib/gas-stations";
import FoodMenuSection from "@/components/food-menu-section";
import Icon from "./icon";

type Tab = "시설" | "음식" | "주유";

export default function RestAreaDetails({
  area,
  onClose,
  audience = "admin",
  stations = [],
}: {
  area: RestArea;
  onClose: () => void;
  audience?: "admin" | "mobile";
  stations?: GasStation[];
}) {
  const [tab, setTab] = useState<Tab>("시설");
  const provided = facilityDefinitions.filter(([key]) => area.facilities[key] === true);
  const unavailable = facilityDefinitions.filter(([key]) => area.facilities[key] === false);
  const linkedStations = stations.filter(station => station.brand === "EX");
  const headlineStation =
    linkedStations.find(station => stationPriceItems(station).length > 0) ?? linkedStations[0];
  const headlinePrices = headlineStation ? stationPriceItems(headlineStation) : [];
  const fuelPrice = (key: "gasoline" | "diesel") =>
    headlinePrices.find(price => price.key === key)?.text.replace("원/L", "/L") ?? "정보 없음";

  return (
    <section className={sharedClasses.detailPanel} aria-labelledby="detail-title">
      <div className="detail-handle hidden" aria-hidden="true" />
      <div className="detail-heading flex justify-between items-start shrink-0 gap-[10px] p-[13px_20px_8px]">
        <div className="min-w-0">
          <span className={sharedClasses.eyebrow}>휴게소 상세정보</span>
          <h2 id="detail-title">{area.name}</h2>
          <div className="detail-meta-row">
            <p className="detail-route-line">
              {routeDescription(area, audience) || "노선 정보 없음"}
            </p>
            <div className="detail-overview-tags">
              <span>
                주차{" "}
                {area.parkingCount === null
                  ? "정보 없음"
                  : `${area.parkingCount.toLocaleString("ko-KR")}대`}
              </span>
              {area.restAreaType && <span>{area.restAreaType}</span>}
            </div>
          </div>
        </div>
        <IconButton onClick={onClose} aria-label="상세정보 닫기">
          <Icon name="close" />
        </IconButton>
      </div>

      <div className="detail-overview shrink-0">
        <div className="detail-overview-prices">
          <span>
            <small>휘발유</small>
            <strong>{fuelPrice("gasoline")}</strong>
          </span>
          <span>
            <small>경유</small>
            <strong>{fuelPrice("diesel")}</strong>
          </span>
        </div>
      </div>

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
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </div>

      <div
        id="detail-tabpanel"
        role="tabpanel"
        aria-labelledby={`detail-tab-${tab}`}
        className={`${sharedClasses.detailScroll} detail-tab-content`}
      >
        {tab === "시설" && (
          <section aria-label="편의시설">
            <div className="facility-heading">
              <h3>편의시설</h3>
              <span>{provided.length}개</span>
            </div>
            {provided.length ? (
              <ul className="detail-facility-grid">
                {provided.map(([key, label]) => (
                  <li key={key}>
                    <span className="detail-facility-icon">
                      <Icon
                        name={
                          key === "has_truck_lounge"
                            ? "truck"
                            : key.includes("gas") || key.includes("lpg")
                              ? "fuel"
                              : key.includes("ev")
                                ? "bolt"
                                : key.includes("restroom")
                                  ? "restroom"
                                  : "info"
                        }
                        size={20}
                      />
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
            {linkedStations.length ? (
              linkedStations.map(station => {
                const prices = stationPriceItems(station);
                return (
                  <article key={station.siteCode} className="station-price-section">
                    <h3>{station.name}</h3>
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
