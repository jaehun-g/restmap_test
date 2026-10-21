import {geocodeKakaoAddress, searchKakaoKeywordPlaces, type KakaoKeywordPlace} from "./kakao-local.ts";
import {exStationAddressCandidates} from "./ex-station-status.ts";
import {normalizedDirection} from "./facility-places.ts";
import {closeRestAreaIds, restNameDirection, validRestCoordinates, type IntegratedArea, type LoungeRow} from "./rest-area-integration.ts";
import {distanceMeters, type GeoPoint} from "./geo-search.ts";

export type RestAreaCoordinateResolution = {latitude: number | null; longitude: number | null; method: string; reason: string};
const compact = (value: string) => value.replace(/[^\p{L}\p{N}]/gu, "");
const phone = (value: unknown) => String(value ?? "").replace(/\D/g, "");
function placeKey(value: string, direction: string | null) {
  let name = value.replace(/\([^)]*\)/g, "").replace(/졸음쉼터|휴게소|쉼터/g, "");
  if (direction && direction !== "양방") name = name.replaceAll(`${direction}방향`, "").replaceAll(`${direction} 방향`, "");
  if (!direction) name = name.replace(/\s+[가-힣]+\s*방향\s*$/, "");
  return compact(name);
}

export function selectRestAreaKeywordPlace(places: KakaoKeywordPlace[], area: IntegratedArea, requireDirection = false): KakaoKeywordPlace | null {
  const expected = placeKey(area.name, area.direction);
  const candidates = places.filter(place => {
    if (/주유소|충전소/.test(place.name) || !/휴게소|쉼터/.test(`${place.name} ${place.categoryName ?? ""}`)) return false;
    if (placeKey(place.name, area.direction) !== expected) return false;
    const label = restNameDirection(place.name) ?? normalizedDirection(place.name.match(/([가-힣]+)\s*방향/)?.[1]);
    const phoneMatches = Boolean(phone(area.fields.phone) && phone(place.phone) === phone(area.fields.phone));
    if (label && area.direction && label !== area.direction) return false;
    if (requireDirection && area.direction && label !== area.direction && !phoneMatches) return false;
    return true;
  });
  const byPhone = candidates.filter(place => phone(area.fields.phone) && phone(place.phone) === phone(area.fields.phone));
  return byPhone.length === 1 ? byPhone[0] : candidates.length === 1 ? candidates[0] : null;
}

/** 공용 주소와 반대 방향 시설은 주소 첫 결과만으로 좌표를 확정하지 않는다. */
export async function resolveRestAreaCoordinates(area: IntegratedArea, existing: LoungeRow[], options: {
  addressShared?: boolean; routeContains?: (point: GeoPoint) => boolean;
  geocode?: typeof geocodeKakaoAddress; search?: typeof searchKakaoKeywordPlaces;
} = {}): Promise<RestAreaCoordinateResolution> {
  const permitted = (point: GeoPoint) => validRestCoordinates(point.latitude, point.longitude) && (!options.routeContains || options.routeContains(point)) && !closeRestAreaIds(point.latitude, point.longitude, existing).length;
  let reason = "좌표를 확인할 수 없음";
  let addressResolution: RestAreaCoordinateResolution | null = null;
  let addressContradicted = false;
  if (validRestCoordinates(area.fields.latitude, area.fields.longitude)) {
    const point = {latitude: Number(area.fields.latitude), longitude: Number(area.fields.longitude)};
    if (permitted(point)) return {...point, method: "locationinfoRest", reason: "기준정보 좌표와 노선·중복 검사 통과"};
    reason = "기준정보 좌표가 노선에서 벗어나거나 기존 시설과 겹침";
  }
  if (area.address && !options.addressShared) {
    addressSearch: for (const address of exStationAddressCandidates(area.address)) {
      for (const analyzeType of ["exact", "similar"] as const) {
        const result = await (options.geocode ?? geocodeKakaoAddress)(address, {analyzeType, requireUnique: true});
        if (result.ok && ["ROAD_ADDR", "REGION_ADDR"].includes(result.value.addressType) && permitted(result.value)) {
          addressResolution = {latitude: result.value.latitude, longitude: result.value.longitude, method: "kakao-address", reason: result.value.addressName};
          break addressSearch;
        }
        if (!result.ok && /UNAUTHORIZED|REQUEST_FAILED/.test(result.error.code)) return {latitude: null, longitude: null, method: "unresolved", reason: result.error.message};
      }
    }
  }
  const queries = [...new Set([
    `${area.name} ${area.routes[0] ?? ""}`, area.name,
    area.name.replace(/[()]/g, " ").replace(/\s+/g, " ").trim(),
    `${area.name.replace(/\([^)]*\)/g, "")} ${area.direction && area.direction !== "양방" ? `${area.direction}방향` : ""}`.trim(),
  ])];
  for (const query of queries) {
    const result = await (options.search ?? searchKakaoKeywordPlaces)(query, {categoryGroupCode: null});
    if (!result.ok) { reason = result.error.message; continue; }
    const place = selectRestAreaKeywordPlace(result.value, area, options.addressShared || Boolean(area.direction));
    if (place && permitted(place)) return {latitude: place.latitude, longitude: place.longitude, method: "kakao-keyword", reason: `${place.name} / ${place.roadAddressName ?? place.addressName ?? "주소 없음"}`};
    if (addressResolution && area.direction && result.value.some(candidate =>
      compact(candidate.name).includes(compact(area.name.replace(/\([^)]*\)|휴게소/g, ""))) &&
      compact(candidate.name).includes(`${area.direction}방향`) &&
      distanceMeters({latitude: addressResolution!.latitude!, longitude: addressResolution!.longitude!}, candidate) > 1000)) addressContradicted = true;
    if (place) reason = "이름이 일치하는 좌표가 원본 노선과 불일치하거나 기존 시설과 겹침";
    else if (result.value.length) reason = "키워드 후보의 이름·방향·좌표를 유일하게 검증하지 못함";
  }
  if (addressContradicted) return {latitude: null, longitude: null, method: "unresolved", reason: "주소 좌표가 같은 휴게소 키워드 후보 위치와 1km 이상 달라 보류"};
  return addressResolution ?? {latitude: null, longitude: null, method: "unresolved", reason};
}
