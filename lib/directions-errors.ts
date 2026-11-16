export type DirectionsError = {code: string; message: string};
export type DirectionsErrorPresentation = {title: string; action: "origin" | "destination" | "none"; retry: boolean};

const kakaoErrors: Record<number, DirectionsError> = {
  1: {code: "DIRECTIONS_NO_ROUTE", message: "출발지에서 목적지까지의 경로를 찾지 못했습니다. 다른 위치를 선택해 주세요."},
  101: {code: "DIRECTIONS_WAYPOINT_ROAD", message: "경유지 주변에서 도로를 찾지 못했습니다."},
  102: {code: "DIRECTIONS_ORIGIN_ROAD", message: "출발지 주변에서 도로를 찾지 못했습니다. 도로와 가까운 출발지를 선택해 주세요."},
  103: {code: "DIRECTIONS_DESTINATION_ROAD", message: "목적지 주변에서 도로를 찾지 못했습니다. 도로와 가까운 목적지를 선택해 주세요."},
  104: {code: "DIRECTIONS_TOO_CLOSE", message: "출발지와 목적지가 너무 가깝습니다. 다른 위치를 선택해 주세요."},
  105: {code: "DIRECTIONS_ORIGIN_INCIDENT", message: "출발지 주변에 교통 장애가 있습니다. 출발지를 변경하거나 잠시 후 다시 탐색해 주세요."},
  106: {code: "DIRECTIONS_DESTINATION_INCIDENT", message: "목적지 주변에 교통 장애가 있습니다. 목적지를 변경하거나 잠시 후 다시 탐색해 주세요."},
  107: {code: "DIRECTIONS_WAYPOINT_INCIDENT", message: "경유지 주변에 교통 장애가 있습니다. 잠시 후 다시 탐색해 주세요."},
};

export function kakaoDirectionsError(code: number): DirectionsError {
  return kakaoErrors[code] ?? {code: "DIRECTIONS_UNKNOWN", message: "경로를 찾지 못했습니다. 잠시 후 다시 탐색해 주세요."};
}

export function directionsErrorPresentation(code: string | null | undefined): DirectionsErrorPresentation {
  switch (code) {
    case "DIRECTIONS_ORIGIN_ROAD": return {title: "출발지 주변 도로를 찾지 못했어요", action: "origin", retry: false};
    case "DIRECTIONS_DESTINATION_ROAD": return {title: "목적지 주변 도로를 찾지 못했어요", action: "destination", retry: false};
    case "DIRECTIONS_ORIGIN_INCIDENT": return {title: "출발지 주변에 교통 장애가 있어요", action: "origin", retry: true};
    case "DIRECTIONS_DESTINATION_INCIDENT": return {title: "목적지 주변에 교통 장애가 있어요", action: "destination", retry: true};
    case "DIRECTIONS_WAYPOINT_ROAD": return {title: "경유지 주변 도로를 찾지 못했어요", action: "none", retry: false};
    case "DIRECTIONS_WAYPOINT_INCIDENT": return {title: "경유지 주변에 교통 장애가 있어요", action: "none", retry: true};
    case "DIRECTIONS_TOO_CLOSE": return {title: "출발지와 목적지가 너무 가까워요", action: "destination", retry: false};
    case "DIRECTIONS_NO_ROUTE": return {title: "경로를 찾지 못했어요", action: "destination", retry: true};
    default: return {title: "길찾기를 완료하지 못했어요", action: "none", retry: true};
  }
}
