import {isGeoPoint, type GeoPoint} from "./geo-search.ts";
import type {Result} from "./rest-areas.ts";

export type PlaceSearchItem = {
  id: string;
  name: string;
  address: string;
  category: string | null;
  phone?: string | null;
  latitude: number;
  longitude: number;
};

type RawKeywordDoc = {
  id?: unknown;
  place_name?: unknown;
  address_name?: unknown;
  road_address_name?: unknown;
  category_group_name?: unknown;
  phone?: unknown;
  x?: unknown;
  y?: unknown;
};

const incompleteHangulJamoPattern = /[ㄱ-ㅎㅏ-ㅣ]+/g;
const containsHangulJamoTypo = (value: string) => /[ㄱ-ㅎㅏ-ㅣ]/.test(value);

export function normalizePlaceSearchQuery(rawQuery: string | null | undefined): string {
  if (!rawQuery) return "";
  return rawQuery.replace(incompleteHangulJamoPattern, " ").replace(/\s+/g, " ").trim();
}

type RawAddressDoc = {
  address_name?: unknown;
  x?: unknown;
  y?: unknown;
  road_address?: {building_name?: unknown; address_name?: unknown} | null;
};

export function parseKakaoPlaceDocuments(
  keywordPayload: unknown,
  addressPayload?: unknown,
): PlaceSearchItem[] {
  const results: PlaceSearchItem[] = [];
  const seen = new Set<string>();

  const keywordDocs =
    keywordPayload && typeof keywordPayload === "object"
      ? (keywordPayload as {documents?: unknown}).documents
      : null;

  if (Array.isArray(keywordDocs)) {
    for (const raw of keywordDocs as RawKeywordDoc[]) {
      const name = typeof raw?.place_name === "string" ? raw.place_name.trim() : "";
      const latitude = Number(raw?.y);
      const longitude = Number(raw?.x);
      if (!name || containsHangulJamoTypo(name) || !isGeoPoint({latitude, longitude})) continue;
      const roadAddr =
        typeof raw?.road_address_name === "string" ? raw.road_address_name.trim() : "";
      const jibunAddr =
        typeof raw?.address_name === "string" ? raw.address_name.trim() : "";
      const address = roadAddr || jibunAddr;
      const category =
        typeof raw?.category_group_name === "string" && raw.category_group_name.trim()
          ? raw.category_group_name.trim()
          : null;
      const phone =
        typeof raw?.phone === "string" && raw.phone.trim() ? raw.phone.trim() : null;
      const id =
        typeof raw?.id === "string" && raw.id.trim()
          ? `kakao:${raw.id.trim()}`
          : `coord:${latitude.toFixed(5)},${longitude.toFixed(5)}`;
      const dedupeKey = `${name}|${latitude.toFixed(4)},${longitude.toFixed(4)}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      results.push({id, name, address, category, phone, latitude, longitude});
    }
  }

  const addressDocs =
    addressPayload && typeof addressPayload === "object"
      ? (addressPayload as {documents?: unknown}).documents
      : null;

  if (Array.isArray(addressDocs)) {
    for (const raw of addressDocs as RawAddressDoc[]) {
      const addrName =
        typeof raw?.address_name === "string" ? raw.address_name.trim() : "";
      const buildingName =
        typeof raw?.road_address?.building_name === "string"
          ? raw.road_address.building_name.trim()
          : "";
      const roadAddr =
        typeof raw?.road_address?.address_name === "string"
          ? raw.road_address.address_name.trim()
          : "";
      const name = buildingName || roadAddr || addrName;
      const address = roadAddr || addrName;
      const latitude = Number(raw?.y);
      const longitude = Number(raw?.x);
      if (!name || !isGeoPoint({latitude, longitude})) continue;
      const dedupeKey = `${name}|${latitude.toFixed(4)},${longitude.toFixed(4)}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      results.push({
        id: `addr:${latitude.toFixed(5)},${longitude.toFixed(5)}`,
        name,
        address,
        category: "주소",
        latitude,
        longitude,
      });
    }
  }

  return results;
}

const cacheTtlMs = 5 * 60 * 1000;
const maxCacheEntries = 200;
const placeCache = new Map<string, {expiresAt: number; items: PlaceSearchItem[]}>();

export async function searchKakaoPlaces(
  rawQuery: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<Result<PlaceSearchItem[]>> {
  const query = normalizePlaceSearchQuery(rawQuery);
  if (!query) {
    return {ok: true, value: []};
  }
  if (query.length > 80) {
    return {
      ok: false,
      error: {code: "VALIDATION_ERROR", message: "검색어는 80자 이내로 입력해주세요."},
    };
  }
  const apiKey = process.env.KAKAO_REST_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      error: {
        code: "CONFIG_ERROR",
        message: "KAKAO_REST_API_KEY가 설정되지 않았습니다.",
      },
    };
  }

  const normalizedKey = query.toLocaleLowerCase("ko-KR");
  const now = Date.now();
  const cached = placeCache.get(normalizedKey);
  if (cached && cached.expiresAt > now) {
    return {ok: true, value: cached.items};
  }

  const headers = {Authorization: `KakaoAK ${apiKey}`};
  try {
    const keywordUrl = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
    keywordUrl.searchParams.set("query", query);
    keywordUrl.searchParams.set("size", "8");

    const keywordRes = await fetchImpl(keywordUrl, {headers, cache: "no-store"});
    if (!keywordRes.ok) {
      return {
        ok: false,
        error: {
          code: "UPSTREAM_ERROR",
          message: `장소 검색에 실패했습니다 (${keywordRes.status}).`,
        },
      };
    }
    const keywordPayload: unknown = await keywordRes.json();
    let items = parseKakaoPlaceDocuments(keywordPayload);

    if (items.length < 3) {
      const addressUrl = new URL("https://dapi.kakao.com/v2/local/search/address.json");
      addressUrl.searchParams.set("query", query);
      addressUrl.searchParams.set("size", "5");
      const addressRes = await fetchImpl(addressUrl, {headers, cache: "no-store"});
      if (addressRes.ok) {
        const addressPayload: unknown = await addressRes.json();
        items = parseKakaoPlaceDocuments(keywordPayload, addressPayload);
      }
    }

    if (placeCache.size >= maxCacheEntries) {
      const oldestKey = placeCache.keys().next().value;
      if (oldestKey) placeCache.delete(oldestKey);
    }
    placeCache.set(normalizedKey, {expiresAt: now + cacheTtlMs, items});
    return {ok: true, value: items};
  } catch {
    return {
      ok: false,
      error: {code: "UPSTREAM_ERROR", message: "장소 검색 서버와 통신하지 못했습니다."},
    };
  }
}

type RawCoord2AddressDoc = {
  road_address?: {address_name?: unknown; building_name?: unknown} | null;
  address?: {address_name?: unknown} | null;
};

type RawCoord2RegionDoc = {
  address_name?: unknown;
};

export function parseKakaoCoord2Address(
  addressPayload: unknown,
  regionPayload?: unknown,
): string | null {
  const addressDocs =
    addressPayload && typeof addressPayload === "object"
      ? (addressPayload as {documents?: unknown}).documents
      : null;

  if (Array.isArray(addressDocs) && addressDocs.length > 0) {
    const first = addressDocs[0] as RawCoord2AddressDoc;
    const roadAddr =
      typeof first?.road_address?.address_name === "string"
        ? first.road_address.address_name.trim()
        : "";
    if (roadAddr) return roadAddr;
    const parcelAddr =
      typeof first?.address?.address_name === "string"
        ? first.address.address_name.trim()
        : "";
    if (parcelAddr) return parcelAddr;
  }

  const regionDocs =
    regionPayload && typeof regionPayload === "object"
      ? (regionPayload as {documents?: unknown}).documents
      : null;

  if (Array.isArray(regionDocs) && regionDocs.length > 0) {
    const first = regionDocs[0] as RawCoord2RegionDoc;
    const regionAddr =
      typeof first?.address_name === "string" ? first.address_name.trim() : "";
    if (regionAddr) return regionAddr;
  }

  return null;
}

const reverseGeocodeCache = new Map<string, {expiresAt: number; address: string | null}>();

export async function reverseGeocodeKakaoPoint(
  point: GeoPoint,
  fetchImpl: typeof fetch = fetch,
): Promise<Result<string | null>> {
  if (!isGeoPoint(point)) {
    return {
      ok: false,
      error: {code: "VALIDATION_ERROR", message: "유효한 좌표가 아닙니다."},
    };
  }
  const apiKey = process.env.KAKAO_REST_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      error: {
        code: "CONFIG_ERROR",
        message: "KAKAO_REST_API_KEY가 설정되지 않았습니다.",
      },
    };
  }

  const cacheKey = `${point.latitude.toFixed(4)},${point.longitude.toFixed(4)}`;
  const now = Date.now();
  const cached = reverseGeocodeCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return {ok: true, value: cached.address};
  }

  const headers = {Authorization: `KakaoAK ${apiKey}`};
  try {
    const coordUrl = new URL("https://dapi.kakao.com/v2/local/geo/coord2address.json");
    coordUrl.searchParams.set("x", String(point.longitude));
    coordUrl.searchParams.set("y", String(point.latitude));

    const coordRes = await fetchImpl(coordUrl, {headers, cache: "no-store"});
    if (!coordRes.ok) {
      return {
        ok: false,
        error: {
          code: "UPSTREAM_ERROR",
          message: `주소 변환에 실패했습니다 (${coordRes.status}).`,
        },
      };
    }

    const coordPayload: unknown = await coordRes.json();
    let address = parseKakaoCoord2Address(coordPayload);

    if (!address) {
      const regionUrl = new URL("https://dapi.kakao.com/v2/local/geo/coord2regioncode.json");
      regionUrl.searchParams.set("x", String(point.longitude));
      regionUrl.searchParams.set("y", String(point.latitude));
      const regionRes = await fetchImpl(regionUrl, {headers, cache: "no-store"});
      if (regionRes.ok) {
        const regionPayload: unknown = await regionRes.json();
        address = parseKakaoCoord2Address(coordPayload, regionPayload);
      }
    }

    if (reverseGeocodeCache.size >= maxCacheEntries) {
      const oldestKey = reverseGeocodeCache.keys().next().value;
      if (oldestKey) reverseGeocodeCache.delete(oldestKey);
    }
    reverseGeocodeCache.set(cacheKey, {expiresAt: now + cacheTtlMs, address});
    return {ok: true, value: address};
  } catch {
    return {
      ok: false,
      error: {code: "UPSTREAM_ERROR", message: "주소 변환 서버와 통신하지 못했습니다."},
    };
  }
}

export type RecentSearchEntry =
  | {
      key: string;
      kind: "rest";
      restId: number;
      name: string;
      address: string;
      badge: string;
      isLounge?: boolean;
      latitude: number;
      longitude: number;
    }
  | {
      key: string;
      kind: "station";
      stationId: string;
      name: string;
      address: string;
      badge: string;
      latitude: number;
      longitude: number;
    }
  | {
      key: string;
      kind: "place";
      place: PlaceSearchItem;
      name: string;
      address: string;
      category: string | null;
      latitude: number;
      longitude: number;
    }
  | {
      key: string;
      kind: "query";
      query: string;
      name: string;
    };

const recentSearchStorageKey = "next-map-test:recent-searches";
const maxRecentSearches = 50;

export function getRecentSearches(): RecentSearchEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(recentSearchStorageKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is RecentSearchEntry =>
        Boolean(
          item &&
            typeof item === "object" &&
            typeof (item as {key?: unknown}).key === "string" &&
            typeof (item as {name?: unknown}).name === "string" &&
            typeof (item as {kind?: unknown}).kind === "string",
        ),
    );
  } catch {
    return [];
  }
}

function saveRecentSearches(items: RecentSearchEntry[]): RecentSearchEntry[] {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(recentSearchStorageKey, JSON.stringify(items));
    } catch {
      // Ignore storage quota or privacy mode errors
    }
  }
  return items;
}

export function addRecentSearch(entry: RecentSearchEntry): RecentSearchEntry[] {
  const current = getRecentSearches();
  const next = [
    entry,
    ...current.filter(item => item.key !== entry.key && item.name !== entry.name),
  ].slice(0, maxRecentSearches);
  return saveRecentSearches(next);
}

export function removeRecentSearch(key: string): RecentSearchEntry[] {
  const current = getRecentSearches();
  const next = current.filter(item => item.key !== key);
  return saveRecentSearches(next);
}

export function clearRecentSearches(): RecentSearchEntry[] {
  return saveRecentSearches([]);
}
