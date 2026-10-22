import {facilityDefinitions, routeDescription, type RestArea} from "./rest-areas.ts";
import {setMapCardIcon} from "./map-card-icon.ts";
import type {GasStation} from "./gas-stations.ts";
import {restAreaPriceSummary} from "./rest-area-prices.ts";

export function createMapCard(
  area: RestArea,
  audience: "admin" | "mobile",
  onClose: () => void,
  onDetails: () => void,
  stations: readonly GasStation[] = [],
): HTMLElement {
  const card = document.createElement("section");
  card.className = "map-info-card";
  card.setAttribute("aria-label", `${area.name} 요약`);
  const heading = document.createElement("div");
  heading.className = "map-card-heading";
  const icon = document.createElement("img");
  icon.src = area.facilities.has_truck_lounge === true ? "/marker-lounge.svg" : "/marker.svg";
  icon.alt = "";
  const title = document.createElement("strong");
  title.textContent = area.name;
  const close = document.createElement("button");
  close.className = "map-card-close";
  close.type = "button";
  setMapCardIcon(close, "close");
  close.setAttribute("aria-label", "휴게소 요약 닫기");
  close.addEventListener("click", event => {
    event.stopPropagation();
    onClose();
  });
  heading.append(icon, title, close);
  card.append(heading);
  const body = document.createElement("div");
  body.className = "map-card-body";
  if (stations.length) {
    const prices = document.createElement("div");
    prices.className = "map-card-prices";
    for (const [fuel, label] of [["gasoline", "휘발유"], ["diesel", "경유"]] as const) {
      const summary = restAreaPriceSummary(stations, fuel);
      const line = document.createElement("p");
      line.textContent = `${label} ${summary.text}${summary.partial ? " · 일부 가격 미확인" : ""}`;
      prices.append(line);
    }
    body.append(prices);
  }
  const route = routeDescription(area, audience);
  if (route) {
    const text = document.createElement("p");
    text.className = "map-card-route";
    text.textContent = route;
    body.append(text);
  }
  const lounge = area.facilities.has_truck_lounge;
  if (lounge === true || audience === "admin") {
    const badge = document.createElement("span");
    badge.className = lounge === true ? "lounge-badge" : "map-card-muted";
    badge.textContent =
      lounge === true ? "화물차 라운지" : lounge === false ? "라운지 없음" : "라운지 미확인";
    body.append(badge);
  }
  const available = facilityDefinitions.filter(
    ([key]) => key !== "has_truck_lounge" && area.facilities[key] === true,
  );
  if (available.length) {
    const facilities = document.createElement("div");
    facilities.className = "facility-tags map-card-facilities";
    available.slice(0, 3).forEach(([, label]) => {
      const badge = document.createElement("span");
      badge.textContent = label;
      facilities.append(badge);
    });
    if (available.length > 3) {
      const more = document.createElement("span");
      more.textContent = `+${available.length - 3}`;
      facilities.append(more);
    }
    body.append(facilities);
  }
  const details = document.createElement("button");
  details.className = "map-card-details";
  details.type = "button";
  details.textContent = "상세보기 →";
  details.addEventListener("click", event => {
    event.stopPropagation();
    onDetails();
  });
  card.append(body, details);
  return card;
}
