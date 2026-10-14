"use client";
import {stationServices, type StationServiceKey} from "@/lib/gas-stations";
import type {PlaceView} from "@/lib/map-places";

export default function PlaceControls({
  view,
  onView,
  services,
  onServices,
  disabled = false,
}: {
  view: PlaceView;
  onView: (view: PlaceView) => void;
  services: StationServiceKey[];
  onServices: (services: StationServiceKey[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="place-controls">
      <nav className="place-tabs" aria-label="표시할 정보 종류">
        {(
          [
            ["all", "통합"],
            ["rest", "휴게소"],
            ["station", "주유소"],
          ] as const
        ).map(([key, label]) => (
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
      {view !== "rest" && (
        <details className="station-filter-picker">
          <summary
            onClick={event => {
              if (disabled) event.preventDefault();
            }}
          >
            주유소 조건{services.length ? ` (${services.length})` : ""}
          </summary>
          <div className="station-filter-options">
            <p>GS 주유소에 적용 · 선택한 조건을 모두 포함</p>
            {stationServices.map(({key, label}) => (
              <label key={key}>
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={services.includes(key)}
                  onChange={event =>
                    onServices(
                      event.target.checked
                        ? [...services, key]
                        : services.filter(value => value !== key),
                    )
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
