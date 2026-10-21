import type {Result} from "./rest-areas.ts";

const endpoint = "https://data.ex.co.kr/openapi/business/curStateStation";

export type ExStationStatus = {
  sourceKey: string;
  routeCode: string | null;
  serviceAreaCode: string;
  routeName: string | null;
  direction: string | null;
  serviceAreaName: string | null;
  oilCompany: string | null;
  location: string | null;
  phone: string | null;
  lpgAvailable: boolean | null;
  gasolinePrice: number | null;
  dieselPrice: number | null;
  lpgPrice: number | null;
};

export type ExOpenApiFetch = (input: string, init: RequestInit) => Promise<Response>;

function fail(code: string, message: string): Result<never> {
  return {ok: false, error: {code, message}};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonNegativeInteger(value: unknown): number | null {
  const number = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function yesNo(value: unknown): boolean | null {
  const normalized = text(value)?.toUpperCase();
  return normalized === "Y" ? true : normalized === "N" ? false : null;
}

function price(value: unknown): number | null {
  const source = text(value);
  if (!source) return null;
  const number = Number(source.replace(/[^\d.]/g, ""));
  return Number.isFinite(number) && number >= 0 && number <= 1_000_000 ? number : null;
}

export function exOpenApiKey(
  environment: {EX_OPEN_API_KEY?: string | undefined} = process.env as {
    EX_OPEN_API_KEY?: string | undefined;
  },
): Result<string> {
  const key = environment.EX_OPEN_API_KEY?.trim();
  return key
    ? {ok: true, value: key}
    : fail(
        "EX_OPEN_API_KEY_MISSING",
        "EX_OPEN_API_KEY를 설정하면 한국도로공사 주유소 현황을 조회할 수 있습니다.",
      );
}

export function exStationSourceKey(station: {
  routeCode: string | null;
  serviceAreaCode: string;
  direction: string | null;
  oilCompany: string | null;
}) {
  return [
    station.routeCode ?? "-",
    station.serviceAreaCode,
    station.direction ?? "-",
    station.oilCompany ?? "-",
  ].join("|");
}

export function normalizeExStationAddress(address: string) {
  return address
    .replace(/고속도록/g, "고속도로")
    .replace(/([읍면동리])(?=[가-힣0-9])/g, "$1 ")
    .replace(/(로|길)(?=\d)/g, "$1 ")
    .replace(/산(?=\d)/g, "산 ")
    .replace(/\s+/g, " ")
    .trim();
}

const provinceExpansions: Record<string, string[]> = {
  경기: ["경기도"],
  강원: ["강원도", "강원특별자치도"],
  충북: ["충청북도"],
  충남: ["충청남도"],
  전북: ["전라북도", "전북특별자치도"],
  전남: ["전라남도"],
  경북: ["경상북도"],
  경남: ["경상남도"],
  제주: ["제주특별자치도"],
};

function expandProvince(address: string) {
  const [province] = address.split(" ");
  return (provinceExpansions[province] ?? []).map(expansion =>
    normalizeExStationAddress(`${expansion}${address.slice(province.length)}`),
  );
}

function normalizeLegacyAdministrativeArea(address: string) {
  return address
    .replace(/안성군/g, "안성시")
    .replace(/화성군/g, "화성시")
    .replace(/\s+만세구(?=\s|$)/g, "")
    .replace(/\s+외\s+\d+필지.*$/g, "");
}

/**
 * Produces address-only alternatives for source addresses that concatenate
 * administrative areas or include a parenthesized expressway name.
 */
export function exStationAddressCandidates(address: string) {
  const original = address.trim().replace(/\s+/g, " ");
  const normalized = normalizeExStationAddress(original);
  const withoutParenthetical = normalizeExStationAddress(normalized.replace(/\([^)]*\)/g, " "));
  const candidates = [original, normalized, withoutParenthetical];
  for (const candidate of [...candidates]) candidates.push(...expandProvince(candidate));
  for (const candidate of [...candidates])
    candidates.push(normalizeExStationAddress(normalizeLegacyAdministrativeArea(candidate)));
  return [...new Set(candidates.filter(Boolean))];
}

export function parseExStationStatus(payload: unknown): Result<ExStationStatus[]> {
  const root = record(payload);
  const candidates = root && [root.list, root.items, root.data].find(Array.isArray);
  if (!Array.isArray(candidates))
    return fail(
      "EX_STATION_DATA_INVALID",
      "한국도로공사 주유소 현황 응답 형식이 올바르지 않습니다.",
    );
  const seen = new Set<string>();
  const stations: ExStationStatus[] = [];
  for (const value of candidates) {
    const row = record(value);
    const serviceAreaCode = row && text(row.serviceAreaCode);
    if (!row || !serviceAreaCode)
      return fail("EX_STATION_DATA_INVALID", "휴게소 코드가 없는 주유소 현황 데이터가 있습니다.");
    const routeCode = text(row.routeCode);
    const direction = text(row.direction);
    const oilCompany = text(row.oilCompany);
    const sourceKey = exStationSourceKey({routeCode, serviceAreaCode, direction, oilCompany});
    if (seen.has(sourceKey))
      return fail("EX_STATION_DATA_INVALID", "중복된 주유소 현황 식별자가 있습니다.");
    seen.add(sourceKey);
    stations.push({
      sourceKey,
      routeCode,
      serviceAreaCode,
      routeName: text(row.routeName),
      direction,
      serviceAreaName: text(row.serviceAreaName),
      oilCompany,
      location: text(row.location) ?? text(row.svarAddr),
      phone: text(row.telNo),
      lpgAvailable: yesNo(row.lpgYn),
      gasolinePrice: price(row.gasolinePrice),
      dieselPrice: price(row.dieselPrice) ?? price(row.diselPrice),
      lpgPrice: price(row.lpgPrice),
    });
  }
  return {ok: true, value: stations};
}

function exStationPageCount(
  payload: unknown,
  rowCount: number,
): Result<{count: number; pages: number}> {
  const root = record(payload);
  const count = root && nonNegativeInteger(root.count);
  const pages = root && nonNegativeInteger(root.pageSize);
  if (count === null || pages === null || pages < 1)
    return fail(
      "EX_STATION_DATA_INVALID",
      "한국도로공사 주유소 현황의 페이지 정보가 올바르지 않습니다.",
    );
  if (!count && pages !== 1)
    return fail(
      "EX_STATION_DATA_INVALID",
      "한국도로공사 주유소 현황의 전체 건수와 페이지 수가 일치하지 않습니다.",
    );
  if (count && !rowCount)
    return fail("EX_STATION_DATA_INVALID", "한국도로공사 주유소 현황의 첫 페이지가 비어 있습니다.");
  return {ok: true, value: {count, pages}};
}

/** Retrieves every page of Korea Expressway Corporation station records. Run only on the server. */
export async function fetchExStationStatuses({
  apiKey,
  fetch: fetcher = fetch,
}: {
  apiKey?: string | undefined;
  fetch?: ExOpenApiFetch | undefined;
} = {}): Promise<Result<ExStationStatus[]>> {
  const key = apiKey?.trim() ? {ok: true as const, value: apiKey.trim()} : exOpenApiKey();
  if (!key.ok) return key;
  const accessKey = key.value;
  async function requestPage(
    pageNo: number,
  ): Promise<Result<{payload: unknown; stations: ExStationStatus[]}>> {
    const url = new URL(endpoint);
    url.searchParams.set("key", accessKey);
    url.searchParams.set("type", "json");
    url.searchParams.set("numOfRows", "1000");
    url.searchParams.set("pageNo", String(pageNo));
    try {
      const response = await fetcher(url.toString(), {
        method: "GET", cache: "no-store", signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok)
        return fail("EX_STATION_REQUEST_FAILED", "한국도로공사 주유소 현황 요청에 실패했습니다.");
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        return fail("EX_STATION_DATA_INVALID", "한국도로공사 주유소 현황 응답을 읽을 수 없습니다.");
      }
      const stations = parseExStationStatus(payload);
      return stations.ok ? {ok: true, value: {payload, stations: stations.value}} : stations;
    } catch {
      return fail("EX_STATION_REQUEST_FAILED", "한국도로공사 주유소 현황 요청에 실패했습니다.");
    }
  }

  const first = await requestPage(1);
  if (!first.ok) return first;
  const pagination = exStationPageCount(first.value.payload, first.value.stations.length);
  if (!pagination.ok) return pagination;
  const stations = [...first.value.stations];
  for (let pageNo = 2; pageNo <= pagination.value.pages; pageNo++) {
    const page = await requestPage(pageNo);
    if (!page.ok) return page;
    stations.push(...page.value.stations);
  }
  if (stations.length !== pagination.value.count)
    return fail(
      "EX_STATION_DATA_INVALID",
      "한국도로공사 주유소 현황의 전체 건수를 모두 받지 못했습니다.",
    );
  if (new Set(stations.map(station => station.sourceKey)).size !== stations.length)
    return fail(
      "EX_STATION_DATA_INVALID",
      "한국도로공사 주유소 현황에 중복된 주유소 식별자가 있습니다.",
    );
  return {ok: true, value: stations};
}
