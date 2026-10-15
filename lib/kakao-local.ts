import type {Result} from "./rest-areas.ts";

const addressSearchUrl = "https://dapi.kakao.com/v2/local/search/address.json";
const keywordSearchUrl = "https://dapi.kakao.com/v2/local/search/keyword.json";
const requestTimeoutMs = 10_000;

type KakaoAddressType = "REGION" | "ROAD" | "REGION_ADDR" | "ROAD_ADDR" | "KEYWORD_OL7";
type KakaoAddressDocument = {
  address_name?: unknown;
  address_type?: unknown;
  x?: unknown;
  y?: unknown;
  address?: {address_name?: unknown} | null;
  road_address?: {address_name?: unknown} | null;
};
type KakaoAddressResponse = {documents?: unknown};
type KakaoKeywordDocument = {
  place_name?: unknown;
  category_group_code?: unknown;
  address_name?: unknown;
  road_address_name?: unknown;
  phone?: unknown;
  place_url?: unknown;
  x?: unknown;
  y?: unknown;
};
type KakaoKeywordResponse = {documents?: unknown};

export type KakaoGeocodedAddress = {
  latitude: number;
  longitude: number;
  addressName: string;
  addressType: KakaoAddressType;
  parcelAddressName: string | null;
  roadAddressName: string | null;
};

export type KakaoKeywordPlace = {
  name: string;
  categoryGroupCode: string | null;
  addressName: string | null;
  roadAddressName: string | null;
  phone: string | null;
  placeUrl: string | null;
  latitude: number;
  longitude: number;
};

export type KakaoLocalFetch = (input: string, init: RequestInit) => Promise<Response>;
export type KakaoGeocodeOptions = {
  apiKey?: string | undefined;
  fetch?: KakaoLocalFetch | undefined;
  analyzeType?: "similar" | "exact" | undefined;
  signal?: AbortSignal | undefined;
};

function fail(code: string, message: string): Result<never> {
  return {ok: false, error: {code, message}};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function coordinate(value: unknown, minimum: number, maximum: number): number | null {
  const number = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : null;
}

export function kakaoRestApiKey(
  environment: {KAKAO_REST_API_KEY?: string | undefined} = process.env as {
    KAKAO_REST_API_KEY?: string | undefined;
  },
): Result<string> {
  const key = environment.KAKAO_REST_API_KEY?.trim();
  return key
    ? {ok: true, value: key}
    : fail(
        "KAKAO_REST_API_KEY_MISSING",
        "KAKAO_REST_API_KEY를 설정하면 카카오 주소 지오코딩을 사용할 수 있습니다.",
      );
}

export function normalizeKakaoAddressQuery(value: unknown): Result<string> {
  if (typeof value !== "string") return fail("VALIDATION_ERROR", "주소를 입력해 주세요.");
  const address = value.trim().replace(/\s+/g, " ");
  if (!address) return fail("VALIDATION_ERROR", "주소를 입력해 주세요.");
  if (address.length > 255) return fail("VALIDATION_ERROR", "주소는 255자 이하로 입력해 주세요.");
  return {ok: true, value: address};
}

export function parseKakaoAddressResponse(payload: unknown): Result<KakaoGeocodedAddress> {
  const documents = (payload as KakaoAddressResponse | null)?.documents;
  if (!Array.isArray(documents))
    return fail("GEOCODE_DATA_INVALID", "카카오 주소 검색 응답 형식이 올바르지 않습니다.");
  if (!documents.length) return fail("GEOCODE_NOT_FOUND", "입력한 주소의 좌표를 찾지 못했습니다.");
  const document = documents[0] as KakaoAddressDocument;
  const latitude = coordinate(document.y, -90, 90);
  const longitude = coordinate(document.x, -180, 180);
  const addressName = text(document.address_name);
  const addressType = text(document.address_type);
  if (
    latitude === null ||
    longitude === null ||
    !addressName ||
    !addressType ||
    !["REGION", "ROAD", "REGION_ADDR", "ROAD_ADDR"].includes(addressType)
  )
    return fail("GEOCODE_DATA_INVALID", "카카오 주소 검색 결과에 유효한 좌표가 없습니다.");
  return {
    ok: true,
    value: {
      latitude,
      longitude,
      addressName,
      addressType: addressType as KakaoAddressType,
      parcelAddressName: text(document.address?.address_name),
      roadAddressName: text(document.road_address?.address_name),
    },
  };
}

function keywordQuery(value: unknown): Result<string> {
  if (typeof value !== "string") return fail("VALIDATION_ERROR", "장소명을 입력해 주세요.");
  const query = value.trim().replace(/\s+/g, " ");
  if (!query) return fail("VALIDATION_ERROR", "장소명을 입력해 주세요.");
  if (query.length > 255) return fail("VALIDATION_ERROR", "장소명은 255자 이하로 입력해 주세요.");
  return {ok: true, value: query};
}

export function parseKakaoKeywordResponse(payload: unknown): Result<KakaoKeywordPlace[]> {
  const documents = (payload as KakaoKeywordResponse | null)?.documents;
  if (!Array.isArray(documents))
    return fail("KEYWORD_DATA_INVALID", "카카오 키워드 검색 응답 형식이 올바르지 않습니다.");
  const places: KakaoKeywordPlace[] = [];
  for (const value of documents) {
    const document = value as KakaoKeywordDocument;
    const latitude = coordinate(document.y, -90, 90);
    const longitude = coordinate(document.x, -180, 180);
    const name = text(document.place_name);
    if (latitude === null || longitude === null || !name) continue;
    places.push({
      name,
      categoryGroupCode: text(document.category_group_code),
      addressName: text(document.address_name),
      roadAddressName: text(document.road_address_name),
      phone: text(document.phone),
      placeUrl: text(document.place_url),
      latitude,
      longitude,
    });
  }
  return {ok: true, value: places};
}

function placeNameKey(value: string) {
  return value
    .replace(/휴게소|주유소|충전소|방향|고속도로|GS칼텍스/gi, "")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .toLowerCase();
}

function phoneKey(value: string | null | undefined) {
  return value?.replace(/\D/g, "") ?? "";
}

/** Selects one OL7 place only when its normalized name exactly identifies the station. */
export function selectKakaoKeywordPlace(
  places: KakaoKeywordPlace[],
  serviceAreaName: string,
  sourcePhone?: string | null,
): Result<KakaoKeywordPlace> {
  const expected = placeNameKey(serviceAreaName);
  if (!expected) return fail("VALIDATION_ERROR", "휴게소명으로 장소를 확인할 수 없습니다.");
  const candidates = places
    .filter(place => place.categoryGroupCode === "OL7" && placeNameKey(place.name) === expected)
    .map(place => ({
      place,
      phoneMatches: Boolean(sourcePhone && phoneKey(place.phone) === phoneKey(sourcePhone)),
    }));
  if (!candidates.length)
    return fail("KEYWORD_PLACE_NOT_FOUND", "휴게소명과 일치하는 주유소를 찾지 못했습니다.");
  const phoneMatches = candidates.filter(candidate => candidate.phoneMatches);
  if (phoneMatches.length === 1) return {ok: true, value: phoneMatches[0].place};
  if (candidates.length === 1) return {ok: true, value: candidates[0].place};
  return fail("KEYWORD_PLACE_AMBIGUOUS", "휴게소명과 일치하는 주유소가 여러 곳입니다.");
}

function requestSignal(externalSignal: AbortSignal | undefined) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
  const abort = () => controller.abort();
  externalSignal?.addEventListener("abort", abort, {once: true});
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
      externalSignal?.removeEventListener("abort", abort);
    },
  };
}

/** Converts an address into WGS84 latitude and longitude for Kakao Maps. Run only on the server. */
export async function geocodeKakaoAddress(
  addressInput: unknown,
  options: KakaoGeocodeOptions = {},
): Promise<Result<KakaoGeocodedAddress>> {
  const address = normalizeKakaoAddressQuery(addressInput);
  if (!address.ok) return address;
  const apiKey = options.apiKey?.trim()
    ? {ok: true as const, value: options.apiKey.trim()}
    : kakaoRestApiKey();
  if (!apiKey.ok) return apiKey;
  const url = new URL(addressSearchUrl);
  url.searchParams.set("query", address.value);
  url.searchParams.set("analyze_type", options.analyzeType ?? "exact");
  const request = requestSignal(options.signal);
  try {
    const response = await (options.fetch ?? fetch)(url.toString(), {
      method: "GET",
      headers: {Authorization: `KakaoAK ${apiKey.value}`},
      cache: "no-store",
      signal: request.signal,
    });
    if (!response.ok)
      return fail(
        response.status === 401 || response.status === 403
          ? "KAKAO_GEOCODE_UNAUTHORIZED"
          : "KAKAO_GEOCODE_REQUEST_FAILED",
        response.status === 401 || response.status === 403
          ? "카카오 REST API 키를 확인해 주세요."
          : "카카오 주소 검색 요청에 실패했습니다.",
      );
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return fail("GEOCODE_DATA_INVALID", "카카오 주소 검색 응답을 읽을 수 없습니다.");
    }
    return parseKakaoAddressResponse(payload);
  } catch {
    return fail("KAKAO_GEOCODE_REQUEST_FAILED", "카카오 주소 검색 요청에 실패했습니다.");
  } finally {
    request.dispose();
  }
}

/** Searches Kakao places for WGS84 station coordinates. Run only on the server. */
export async function searchKakaoKeywordPlaces(
  queryInput: unknown,
  options: Omit<KakaoGeocodeOptions, "analyzeType"> = {},
): Promise<Result<KakaoKeywordPlace[]>> {
  const query = keywordQuery(queryInput);
  if (!query.ok) return query;
  const apiKey = options.apiKey?.trim()
    ? {ok: true as const, value: options.apiKey.trim()}
    : kakaoRestApiKey();
  if (!apiKey.ok) return apiKey;
  const url = new URL(keywordSearchUrl);
  url.searchParams.set("query", query.value);
  url.searchParams.set("category_group_code", "OL7");
  url.searchParams.set("size", "15");
  const request = requestSignal(options.signal);
  try {
    const response = await (options.fetch ?? fetch)(url.toString(), {
      method: "GET",
      headers: {Authorization: `KakaoAK ${apiKey.value}`},
      cache: "no-store",
      signal: request.signal,
    });
    if (!response.ok)
      return fail(
        response.status === 401 || response.status === 403
          ? "KAKAO_KEYWORD_UNAUTHORIZED"
          : "KAKAO_KEYWORD_REQUEST_FAILED",
        response.status === 401 || response.status === 403
          ? "카카오 REST API 키를 확인해 주세요."
          : "카카오 키워드 검색 요청이 실패했습니다.",
      );
    try {
      return parseKakaoKeywordResponse(await response.json());
    } catch {
      return fail("KEYWORD_DATA_INVALID", "카카오 키워드 검색 응답을 읽을 수 없습니다.");
    }
  } catch {
    return fail("KAKAO_KEYWORD_REQUEST_FAILED", "카카오 키워드 검색 요청이 실패했습니다.");
  } finally {
    request.dispose();
  }
}
