import { facilityDefinitions, type RestArea } from "@/lib/rest-areas";

export default function FacilitySummary({ area }: { area: RestArea }) {
  const available = facilityDefinitions.filter(([key]) => area.facilities[key] === true);
  return (
    <details className="facility-summary" onClick={(event) => event.stopPropagation()}>
      <summary aria-label={`${area.name} 전체 편의시설 확인`}>
        <span className="facility-tags">
          {available.slice(0, 3).map(([key, label]) => (
            <span key={key}>{label}</span>
          ))}
          <span className="facility-more">
            {available.length > 3 ? `+${available.length - 3}` : "전체 보기"}
          </span>
        </span>
      </summary>
      <ul className="facility-list">
        {facilityDefinitions.map(([key, label]) => (
          <li key={key} className={area.facilities[key] === true ? "available" : "unknown"}>
            <span>{label}</span>
            <span className="facility-state">
              {area.facilities[key] === true
                ? "있음"
                : area.facilities[key] === false
                  ? "없음"
                  : "미확인"}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
