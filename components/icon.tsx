import type {CSSProperties} from "react";

const paths = {
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
    </>
  ),
  check: <path d="m5 12 4 4 10-10" />,
  truck: (
    <>
      <path d="M2 6h12v12H2zM14 10h4l4 4v4h-8" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="18" r="2" />
    </>
  ),
  pin: (
    <>
      <path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  arrow: (
    <>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 7v5h-5M4 17v-5h5" />
      <path d="M6 7a7 7 0 0 1 11-1l3 3M4 15l3 3a7 7 0 0 0 11-1" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
  fit: (
    <>
      <path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  locate: (
    <>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </>
  ),
  phone: (
    <path d="m5 3 4 1 1 5-3 2a16 16 0 0 0 6 6l2-3 5 1 1 4c0 2-3 3-5 2A23 23 0 0 1 3 8c-1-2 0-5 2-5Z" />
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7v.5" />
    </>
  ),
  fuel: (
    <>
      <path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M3 21h14M7 7h6v5H7z" />
      <path d="M16 8h2l2 2v7a2 2 0 0 1-4 0v-4" />
    </>
  ),
  bolt: <path d="m13 2-9 12h7l-1 8 10-13h-7z" />,
  repair: (
    <>
      <path d="M14 6a5 5 0 0 0-6 6L3 17a2 2 0 0 0 3 3l5-5a5 5 0 0 0 6-6l-3 3-3-3z" />
      <circle cx="5" cy="18" r=".5" />
    </>
  ),
  carWash: (
    <>
      <path d="M4 16h16l-1-4-2-3H7l-2 3-1 4ZM4 16v3M20 16v3M7 16v2M17 16v2M6 13h.5M17.5 13h.5" />
      <path d="M8 3v2M12 2v3M16 3v2" />
    </>
  ),
  shower: (
    <>
      <path d="M5 10a7 7 0 0 1 12 0H5ZM11 3V2M8 14v1M12 14v1M16 14v1M8 19v1M12 19v1M16 19v1" />
    </>
  ),
  bed: (
    <>
      <path d="M3 19V9M3 16h18v3M21 16v-4a2 2 0 0 0-2-2h-7v6M3 13h9" />
      <circle cx="7" cy="10" r="2" />
    </>
  ),
  laundry: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M4 7h16M7 5h.5M10 5h.5" />
      <circle cx="12" cy="14" r="4" />
      <path d="M9 14c1-1 2-1 3 0s2 1 3 0" />
    </>
  ),
  restaurant: (
    <>
      <path d="M5 3v7M8 3v7M11 3v7a3 3 0 0 1-6 0M8 13v8M18 21V3c-2 1-3 4-3 7v3h3" />
    </>
  ),
  store: (
    <>
      <path d="M4 10v10h16V10M3 7l2-4h14l2 4v2a2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-4 0V7ZM9 20v-6h6v6" />
    </>
  ),
  restroom: (
    <>
      <circle cx="8" cy="5" r="2" />
      <circle cx="17" cy="5" r="2" />
      <path d="M5 11h6l-1 4H8l-1 6M14 11h6l2 8h-4l-1-5-1 7" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 10 6-10 6L2 9l10-6ZM2 13l10 6 10-6M2 17l10 6 10-6" />
    </>
  ),
  list: (
    <>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <circle cx="3" cy="6" r=".5" />
      <circle cx="3" cy="12" r=".5" />
      <circle cx="3" cy="18" r=".5" />
    </>
  ),
  chevron: <path d="m8 5 7 7-7 7" />,
  chevronUp: <path d="m6 15 6-6 6 6" />,
} as const;

export default function Icon({
  name,
  size = 20,
  style,
}: {
  name: keyof typeof paths;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      {paths[name]}
    </svg>
  );
}
