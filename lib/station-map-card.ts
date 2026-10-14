import { stationHours, type GasStation } from "./gas-stations.ts";
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
  icon.src = "/marker-station.svg";
  icon.alt = "";
  const title = document.createElement("strong");
  title.textContent = station.name;
  const close = document.createElement("button");
  close.className = "map-card-close";
  close.type = "button";
  close.textContent = "×";
  close.setAttribute("aria-label", "주유소 요약 닫기");
  close.addEventListener("click", (event) => {
    event.stopPropagation();
    onClose();
  });
  heading.append(icon, title, close);
  card.append(heading);
  const source = document.createElement("p");
  source.className = "map-card-route";
  source.textContent = `GS 주유·충전소${station.services.cargo ? " · 화물 특화" : ""}`;
  card.append(source);
  const address = document.createElement("p");
  address.textContent = [station.address, station.detailAddress].filter(Boolean).join(" ");
  card.append(address);
  const hours = document.createElement("p");
  hours.textContent = stationHours(station);
  card.append(hours);
  const details = document.createElement("button");
  details.className = "map-card-details";
  details.type = "button";
  details.textContent = "상세보기 →";
  details.addEventListener("click", (event) => {
    event.stopPropagation();
    onDetails();
  });
  card.append(details);
  return card;
}
