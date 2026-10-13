import {
  hasCoordinates,
  type RestArea,
  visibleFacilities,
  routeDescription,
} from "@/lib/rest-areas";
import Icon from "./icon";

export default function RestAreaDetails({
  area,
  onClose,
  audience = "admin",
}: {
  area: RestArea;
  onClose: () => void;
  audience?: "admin" | "mobile";
}) {
  const number = area.phone?.replace(/[^\d+]/g, "");
  return (
    <section className="detail-panel" aria-labelledby="detail-title">
      <div className="detail-handle" aria-hidden="true" />
      <div className="detail-heading">
        <div>
          <span className="eyebrow">휴게소 상세정보</span>
          <h2 id="detail-title">{area.name}</h2>
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="상세정보 닫기"
        >
          <Icon name="close" />
        </button>
      </div>
      <div className="detail-scroll">
        {routeDescription(area, audience) && (
          <div className="detail-route">
            <Icon name="pin" size={17} />
            <span>{routeDescription(area, audience)}</span>
          </div>
        )}
        <dl className="detail-facts">
          <div>
            <dt>노선 번호</dt>
            <dd>{area.routeNumber ?? "정보 없음"}</dd>
          </div>
          <div>
            <dt>휴게소 유형</dt>
            <dd>{area.restAreaType ?? "정보 없음"}</dd>
          </div>
          <div>
            <dt>진행 방향</dt>
            <dd>{area.routeDirection ?? "정보 없음"}</dd>
          </div>
          <div>
            <dt>주차 대수</dt>
            <dd>
              {area.parkingCount === null
                ? "정보 없음"
                : `${area.parkingCount.toLocaleString("ko-KR")}대`}
            </dd>
          </div>
          <div className="wide">
            <dt>전화번호</dt>
            <dd>
              {area.phone && number ? (
                <a href={`tel:${number}`}>
                  <Icon name="phone" size={15} />
                  {area.phone}
                </a>
              ) : (
                (area.phone ?? "정보 없음")
              )}
            </dd>
          </div>
        </dl>
        <div className="facility-heading">
          <h3>편의시설</h3>
          <span>있음 / 없음 / 미확인</span>
        </div>
        <ul className="facility-list">
          {visibleFacilities(area, audience).map(([key, label]) => {
            const value = area.facilities[key];
            return (
              <li
                key={key}
                className={
                  value === true
                    ? "available"
                    : value === false
                      ? "unavailable"
                      : "unknown"
                }
              >
                <span>{label}</span>
                <span className="facility-state">
                  {value === true
                    ? "있음"
                    : value === false
                      ? "없음"
                      : "미확인"}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="coordinate-note">
          {hasCoordinates(area)
            ? `위도 ${area.latitude.toFixed(7)} · 경도 ${area.longitude.toFixed(7)}`
            : "좌표 정보가 없어 지도에 표시되지 않습니다."}
        </p>
      </div>
    </section>
  );
}
