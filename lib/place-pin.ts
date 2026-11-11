export type PinKind = "rest" | "lounge" | "station" | "exStation" | "mixed";

/**
 * 핀 이미지 크기와 앵커(핀 끝).
 * 핀 본체는 단일 마커와 1:1 완전히 동일한 크기(32x38)이며, 우상단에 +N 배지 여백이 포함됩니다.
 */
export const PIN_WIDTH = 48;
export const PIN_HEIGHT = 44;
export const PIN_ANCHOR_X = 16;
export const PIN_ANCHOR_Y = 43;

/** 라운지가 포함되면 우선 표시하고, 그 외에는 휴게소와 주유소 구성에 따라 구분한다. */
export function pinKindFor(summary: {rest: number; station: number; lounge: number}): PinKind {
  if (summary.lounge > 0) return "lounge";
  if (summary.rest > 0 && summary.station > 0) return "mixed";
  if (summary.station > 0) return "station";
  return "rest";
}

/** 대표 핀을 제외한 나머지 개수 라벨(+12). 1개 이하이면 빈 문자열, 99 초과는 99+ 로 줄입니다. */
export function countLabel(total: number): string {
  const rest = total - 1;
  if (rest < 1) return "";
  return rest > 99 ? "99+" : `+${rest}`;
}

const pinIcon = `<path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>`;
const truckIcon = `<path d="M2 6h12v12H2zM14 10h4l4 4v4h-8"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>`;
const circlePin = (color: string, icon = pinIcon) =>
  `<path d="m11 27 5 10 5-10" fill="${color}"/><circle cx="16" cy="16" r="14" fill="#fff" stroke="${color}" stroke-width="2"/>` +
  `<g transform="translate(6.4 6.4) scale(.8)" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icon}</g>`;

const pinBodies: Record<PinKind, string> = {
  exStation: circlePin("#7c3aed"),
  rest: circlePin("#0865ff"),
  lounge: circlePin("#ed8a23", truckIcon),
  station: circlePin("#15845c"),
  mixed:
    `<defs><linearGradient id="splitPin" x1="0" y1="0" x2="1" y2="0"><stop offset="50%" stop-color="#0865ff"/><stop offset="50%" stop-color="#15845c"/></linearGradient></defs>` +
    circlePin("url(#splitPin)"),
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
