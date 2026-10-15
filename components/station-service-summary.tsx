import {sharedClasses} from "@/lib/shared-classes";
import {stationServices, type GasStation} from "@/lib/gas-stations";

const convenienceServices = stationServices.filter(({key}) => key !== "cargo");

export default function StationServiceSummary({station}: {station: GasStation}) {
  const available = convenienceServices.filter(({key}) => station.services[key] === true);
  return (
    <details
      className="facility-summary station-service-summary min-w-[145px] max-w-[200px]"
      onClick={event => event.stopPropagation()}
    >
      <summary aria-label={`${station.name} 전체 주유소 서비스 확인`}>
        <span className="facility-tags">
          {available.slice(0, 3).map(({key, label}) => (
            <span key={key}>{label}</span>
          ))}
          <span className="facility-more">
            {available.length > 3 ? `+${available.length - 3}` : "전체 보기"}
          </span>
        </span>
      </summary>
      <ul className={sharedClasses.facilityList}>
        {convenienceServices.map(({key, label}) => {
          const value = station.services[key];
          return (
            <li
              key={key}
              className={value === true ? "available" : value === null ? "unknown" : "unavailable"}
            >
              <span>{label}</span>
              <span className="facility-state shrink-0 text-[9px]">
                {value === true ? "있음" : value === false ? "없음" : "미확인"}
              </span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
