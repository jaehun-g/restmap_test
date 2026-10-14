export type PinKind = "rest" | "lounge" | "station" | "mixed";

/**
 * 핀 이미지 크기와 앵커(핀 끝).
 * 핀 본체는 단일 마커와 1:1 완전히 동일한 크기(32x38)이며, 우상단에 +N 배지 여백이 포함됩니다.
 */
export const PIN_WIDTH = 48;
export const PIN_HEIGHT = 44;
export const PIN_ANCHOR_X = 16;
export const PIN_ANCHOR_Y = 43;

/** 묶음 구성에 맞는 대표 핀 종류: 휴게소+주유소=혼합, 주유소만=주유소, 휴게소만=라운지 포함 여부에 따라 구분. */
export function pinKindFor(summary: {rest: number; station: number; lounge: number}): PinKind {
  if (summary.rest > 0 && summary.station > 0) return "mixed";
  if (summary.station > 0) return "station";
  return summary.lounge > 0 ? "lounge" : "rest";
}

/** 대표 핀을 제외한 나머지 개수 라벨(+12). 1개 이하이면 빈 문자열, 99 초과는 99+ 로 줄입니다. */
export function countLabel(total: number): string {
  const rest = total - 1;
  if (rest < 1) return "";
  return rest > 99 ? "99+" : `+${rest}`;
}

const PIN_PATH = "M16 37S1 25 1 16a15 15 0 0 1 30 0c0 9-15 21-15 21Z";

const pinBodies: Record<PinKind, string> = {
  rest:
    `<path d="m11 27 5 10 5-10" fill="#0865ff"/><circle cx="16" cy="16" r="14" fill="#fff" stroke="#0865ff" stroke-width="2"/>` +
    `<g stroke="#0865ff" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="M8 19h16M10 14h12M10 10h12M11 10v9M21 10v9M10 19v5M22 19v5"/></g>`,
  lounge:
    `<path d="m11 27 5 10 5-10" fill="#ed8a23"/><circle cx="16" cy="16" r="14" fill="#fff" stroke="#ed8a23" stroke-width="2"/>` +
    `<g stroke="#df7c18" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="M6 10h12v11H6zM18 14h4l4 4v3h-8"/><circle cx="10" cy="22" r="2"/><circle cx="22" cy="22" r="2"/></g>`,
  station:
    `<path fill="#15845c" stroke="#fff" stroke-width="2" d="${PIN_PATH}"/>` +
    `<g fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="M10 23V10h9v13M8 23h13M10 15h9M19 16h3v5a2 2 0 0 0 4 0v-7l-3-3"/><path d="M24 12v3h2"/></g>`,
  mixed:
    `<defs><linearGradient id="splitPin" x1="0" y1="0" x2="1" y2="0"><stop offset="50%" stop-color="#0865ff"/><stop offset="50%" stop-color="#15845c"/></linearGradient></defs>` +
    `<path fill="url(#splitPin)" stroke="#fff" stroke-width="2" d="${PIN_PATH}"/>` +
    `<circle cx="16" cy="16" r="8" fill="#fff"/>` +
    `<circle cx="13" cy="16" r="3" fill="#0865ff"/><circle cx="19" cy="16" r="3" fill="#15845c"/>`,
};

/** 핀 오른쪽 위에 `+N` 배지를 겹친 마커 이미지(SVG data URI)를 만듭니다. */
export function placePinImageUrl(kind: PinKind, total: number): string {
  const label = countLabel(total);
  const badgeWidth = label ? Math.max(18, 10 + label.length * 6.2) : 0;
  const badgeX = PIN_WIDTH - badgeWidth - 0.5;
  const badgeCenterX = badgeX + badgeWidth / 2;
  const badge = label
    ? `<rect x="${badgeX}" y="1" width="${badgeWidth}" height="16" rx="8" fill="#e5484d" stroke="#ffffff" stroke-width="1.5"/>` +
      `<text x="${badgeCenterX}" y="9" text-anchor="middle" dominant-baseline="central" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="10.5" font-weight="700" fill="#ffffff">${label}</text>`
    : "";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PIN_WIDTH}" height="${PIN_HEIGHT}" viewBox="0 0 ${PIN_WIDTH} ${PIN_HEIGHT}">` +
    `<g transform="translate(0 6)">${pinBodies[kind]}</g>${badge}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
