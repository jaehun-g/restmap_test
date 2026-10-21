"use client";

import type {PlaceView} from "@/lib/map-places";
export default function PlaceControls({
  view,
  onView,
  disabled = false,
  audience = "mobile",
}: {
  view: PlaceView;
  onView: (view: PlaceView) => void;
  disabled?: boolean;
  audience?: "mobile" | "admin";
}) {
  return (
    <div
      className={
        audience === "admin"
          ? "place-controls flex items-center justify-start m-[14px_0_10px] relative z-[12]"
          : "place-controls flex items-center justify-start m-[8px_0_0] relative z-[12]"
      }
    >
      <nav
        className="place-tabs inline-flex p-[3px] gap-[3px] [border:1px_solid_#dde6f2] rounded-[10px] bg-white [box-shadow:0_2px_8px_#23416a10]"
        aria-label="표시할 정보 종류"
      >
        {([
          ["rest", "휴게소 · EX 주유소"],
        ] as const).map(([key, label]) => (
          <button
            type="button"
            key={key}
            className={view === key ? "active" : ""}
            aria-pressed={view === key}
            disabled={disabled}
            onClick={() => onView(key)}
          >
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
