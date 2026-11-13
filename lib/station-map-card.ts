import {stationHours, stationLabel, stationPriceItems, type GasStation} from "./gas-stations.ts";
import {setMapCardIcon} from "./map-card-icon.ts";
import type {MapCardNavigation} from "./navigation.ts";
export function createStationMapCard(
  station: GasStation,
  onClose: () => void,
  onDetails: () => void,
  navigation?: MapCardNavigation,
): HTMLElement {
  const card = document.createElement("section");
  card.className = "map-info-card station-map-card";
  card.setAttribute("aria-label", `${station.name} 요약`);
  const heading = document.createElement("div");
  heading.className = "map-card-heading";
  const icon = document.createElement("img");
  icon.src = station.brand === "EX" ? "/marker-ex-station.svg" : "/marker-station.svg";
  icon.alt = "";
  const title = document.createElement("strong");
  title.textContent = station.name;
  const close = document.createElement("button");
  close.className = "map-card-close";
  close.type = "button";
  setMapCardIcon(close, "close");
  close.setAttribute("aria-label", "주유소 요약 닫기");
  close.addEventListener("click", event => {
    event.stopPropagation();
    onClose();
  });
  heading.append(icon, title, close);
  card.append(heading);
  const body = document.createElement("div");
  body.className = "map-card-body";
  const meta = document.createElement("div");
  meta.className = "map-card-meta";
  const sourceText = [station.brand === "EX" ? null : stationLabel(station), station.services.cargo ? "화물 특화" : null]
    .filter(Boolean).join(" · ");
  if (sourceText) {
    const source = document.createElement("p");
    source.className = "map-card-route";
    source.textContent = sourceText;
    meta.append(source);
  }
  if (station.routeName || station.direction) {
    const route = document.createElement("p");
    route.className = "map-card-route";
    route.textContent = [station.routeName, station.direction ? `${station.direction} 방향` : null]
      .filter(Boolean)
      .join(" · ");
    meta.append(route);
  }
  if (navigation?.distanceText) {
    const distance = document.createElement("p");
    distance.className = "map-card-distance";
    distance.textContent = navigation.distanceText;
    meta.append(distance);
  }
  if (sourceText || station.routeName || station.direction || navigation?.distanceText) body.append(meta);
  const address = document.createElement("p");
  address.textContent = [station.address, station.detailAddress].filter(Boolean).join(" ");
  address.className = "map-card-address";
  if (address.textContent) body.append(address);
  const hours = document.createElement("p");
  hours.textContent = stationHours(station);
  hours.className = "map-card-hours";
  body.append(hours);
  const prices = stationPriceItems(station);
  if (prices.length) {
    const list = document.createElement("dl");
    list.className = "station-fuel-prices";
    list.setAttribute("aria-label", "유가 정보");
    for (const price of prices) {
      const row = document.createElement("div");
      const label = document.createElement("dt");
      label.textContent = price.label;
      const value = document.createElement("dd");
      value.textContent = price.text;
      row.append(label, value);
      list.append(row);
    }
    body.append(list);
    const note = document.createElement("p");
    note.className = "map-card-hours";
    note.textContent = "한국도로공사 제공 · 현장 가격과 다를 수 있습니다.";
    body.append(note);
  }
  const details = document.createElement("button");
  details.className = "map-card-details";
  details.type = "button";
  details.textContent = "상세보기 →";
  details.addEventListener("click", event => {
    event.stopPropagation();
    onDetails();
  });
  if (navigation?.onNavigate) {
    const onNavigate = navigation.onNavigate;
    const actions = document.createElement("div");
    actions.className = "map-card-actions";
    const navigate = document.createElement("button");
    navigate.className = navigation.active ? "map-card-navigate active" : "map-card-navigate";
    navigate.type = "button";
    navigate.textContent = navigation.label ?? (navigation.active ? "길찾기 종료" : "길찾기");
    navigate.addEventListener("click", event => {
      event.stopPropagation();
      onNavigate();
    });
    actions.append(navigate, details);
    card.append(body, actions);
  } else {
    card.append(body, details);
  }
  return card;
}
