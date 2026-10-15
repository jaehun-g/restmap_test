import {stationHours, stationLabel, stationPriceItems, type GasStation} from "./gas-stations.ts";
import {setMapCardIcon} from "./map-card-icon.ts";
export function createStationMapCard(
  station: GasStation,
  onClose: () => void,
  onDetails: () => void,
): HTMLElement {
  const card = document.createElement("section");
  card.className = "map-info-card";
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
  const source = document.createElement("p");
  source.className = "map-card-route";
  source.textContent = `${stationLabel(station)}${station.services.cargo ? " · 화물 특화" : ""}`;
  body.append(source);
  if (station.routeName || station.direction) {
    const route = document.createElement("p");
    route.className = "map-card-route";
    route.textContent = [station.routeName, station.direction ? `${station.direction} 방향` : null]
      .filter(Boolean)
      .join(" · ");
    body.append(route);
  }
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
  card.append(body, details);
  return card;
}
