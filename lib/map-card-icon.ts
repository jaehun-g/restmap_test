/** DOM으로 생성하는 지도 카드에서도 앱과 같은 SVG 선 규격을 사용합니다. */
export function setMapCardIcon(button: HTMLElement, name: "back" | "close") {
  const icon = document.createElement("span");
  icon.setAttribute("aria-hidden", "true");
  const path = name === "back" ? "m15 5-7 7 7 7" : "m6 6 12 12M18 6 6 18";
  icon.innerHTML = `<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`;
  button.append(icon);
}
