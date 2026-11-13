import {setMapCardIcon} from "./map-card-icon.ts";
import type {MapCardNavigation} from "./navigation.ts";
import type {PlaceSearchItem} from "./place-search.ts";

export function createGeneralPlaceMapCard(
  place: PlaceSearchItem,
  onClose: () => void,
  navigation?: MapCardNavigation,
): HTMLElement {
  const card = document.createElement("section");
  card.className = "map-info-card general-place-map-card";
  card.setAttribute("aria-label", `${place.name} 요약`);

  const heading = document.createElement("div");
  heading.className = "map-card-heading";

  const icon = document.createElement("img");
  icon.src = "/marker.svg";
  icon.alt = "";

  const title = document.createElement("strong");
  title.textContent = place.name;

  const close = document.createElement("button");
  close.className = "map-card-close";
  close.type = "button";
  setMapCardIcon(close, "close");
  close.setAttribute("aria-label", "장소 요약 닫기");
  close.addEventListener("click", event => {
    event.stopPropagation();
    onClose();
  });

  heading.append(icon, title, close);
  card.append(heading);

  const body = document.createElement("div");
  body.className = "map-card-body";

  if (navigation?.distanceText) {
    const distance = document.createElement("p");
    distance.className = "map-card-distance";
    distance.textContent = navigation.distanceText;
    body.append(distance);
  }

  const addressText = [place.category, place.address].filter(Boolean).join(" · ");
  if (addressText) {
    const address = document.createElement("p");
    address.className = "map-card-address";
    address.textContent = addressText;
    body.append(address);
  }

  if (place.phone) {
    const phone = document.createElement("p");
    phone.className = "map-card-hours";
    phone.textContent = place.phone;
    body.append(phone);
  }

  card.append(body);

  if (navigation?.onNavigate) {
    const onNavigate = navigation.onNavigate;
    const action = document.createElement("button");
    action.className = "map-card-details";
    action.type = "button";
    action.textContent = navigation.active ? "길찾기 종료" : "길찾기 →";
    action.addEventListener("click", event => {
      event.stopPropagation();
      onNavigate();
    });
    card.append(action);
  }

  return card;
}
