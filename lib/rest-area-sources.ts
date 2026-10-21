export type SourceRow = Record<string, string | null>;
export type RestAreaSources = {
  fetchedAt: string;
  locations: SourceRow[];
  facilities: SourceRow[];
  services: SourceRow[];
  serviceExpectedCount: number;
  serviceComplete: boolean;
  recovery: string[];
};

const endpoints = {
  locations: "https://data.ex.co.kr/openapi/locationinfo/locationinfoRest",
  facilities: "https://data.ex.co.kr/openapi/restinfo/restConvList",
  services: "https://data.ex.co.kr/openapi/business/conveniServiceArea",
};

export async function fetchRestAreaSources(apiKey = process.env.EX_OPEN_API_KEY, referenceNames: string[] = [], allowPartialServices = false): Promise<RestAreaSources> {
  if (!apiKey?.trim()) throw new Error("EX_OPEN_API_KEY를 설정해주세요.");
  type Page = {list: SourceRow[]; count: number; pageSize: number};
  async function request(kind: keyof typeof endpoints, pageNo: number, filter: Record<string, string> = {}): Promise<Page> {
    const url = new URL(endpoints[kind]);
    url.search = new URLSearchParams({key: apiKey!.trim(), type: "json", pageNo: String(pageNo), numOfRows: "99", ...filter}).toString();
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(url, {cache: "no-store", signal: AbortSignal.timeout(20_000)});
        if (!response.ok) continue;
        const value = await response.json();
        const count = Number(value.count), pages = Number(value.pageSize);
        if (Array.isArray(value.list) && Number.isSafeInteger(count) && count >= 0 && Number.isSafeInteger(pages) && pages >= 0)
          return {list: value.list, count, pageSize: pages};
      } catch { /* 일부 API는 HTTP 200으로 장애 HTML을 반환하므로 재시도한다. */ }
    }
    throw new Error(`${kind} API ${pageNo}페이지 조회 실패`);
  }
  async function collect(kind: keyof typeof endpoints, filter: Record<string, string> = {}) {
    const first = await request(kind, 1, filter);
    const rows = [...first.list];
    const failed: number[] = [];
    for (let n = 2; n <= first.pageSize; n++) {
      try {
        const page = await request(kind, n, filter);
        if (page.count !== first.count) throw new Error("수집 중 API 총건수가 변경되었습니다.");
        rows.push(...page.list);
      } catch (error) {
        if (kind !== "services" || Object.keys(filter).length) throw error;
        failed.push(n);
      }
    }
    if (!failed.length && rows.length !== first.count) throw new Error(`${kind} API 전체 건수가 맞지 않습니다.`);
    return {rows, count: first.count, failed};
  }
  const [locations, facilities, services] = await Promise.all([collect("locations"), collect("facilities"), collect("services")]);
  const recovery: string[] = [];
  if (services.failed.length) {
    const byCode = new Map(services.rows.map(row => [row.serviceAreaCode, row]));
    const routes = [...new Set([
      ...locations.rows.map(row => row.routeNo), ...facilities.rows.map(row => row.routeCd),
      ...services.rows.map(row => row.routeCode),
    ].filter((value): value is string => Boolean(value)))];
    for (const routeCode of routes) {
      try {
        const partition = await collect("services", {routeCode});
        for (const row of partition.rows) byCode.set(row.serviceAreaCode, row);
      } catch { recovery.push(`노선 ${routeCode} 분할 조회 실패`); }
    }
    if (byCode.size !== services.count) {
      for (const location of locations.rows.filter(row => !byCode.has(row.serviceAreaCode))) {
        try {
          const partition = await collect("services", {serviceAreaCode: location.serviceAreaCode!});
          for (const row of partition.rows) byCode.set(row.serviceAreaCode, row);
        } catch { recovery.push(`휴게소 ${location.serviceAreaCode} 분할 조회 실패`); }
      }
    }
    if (byCode.size !== services.count) {
      const nameKey = (value: string) => value.replace(/\([^)]*\)|휴게소|\s/g, "");
      const known = new Set([...byCode.values()].map(row => nameKey(row.serviceAreaName ?? "")));
      for (const serviceAreaName of [...new Set(referenceNames.map(nameKey))].filter(name => name && !known.has(name))) {
        const partition = await collect("services", {serviceAreaName});
        for (const row of partition.rows) byCode.set(row.serviceAreaCode, row);
      }
    }
    services.rows = [...byCode.values()];
    recovery.push(`편의시설 API ${services.failed.join(", ")}페이지 장애: ${routes.length}개 노선별 조회로 복구`);
  }
  const serviceComplete = services.rows.length === services.count;
  if (!serviceComplete && !allowPartialServices) throw new Error(`편의시설 API 불완전: ${services.rows.length}/${services.count}; ${recovery.join("; ")}`);
  if (!serviceComplete) recovery.push(`편의시설 API ${services.rows.length}/${services.count}건만 수집: 기존 정보 보존, 미제공 값을 없음으로 판정하지 않음`);
  for (const [rows, key] of [[locations.rows, "stdRestCd"], [locations.rows, "serviceAreaCode"], [services.rows, "serviceAreaCode"]] as const) {
    const ids = rows.map(row => row[key]);
    if (ids.some(id => !id) || new Set(ids).size !== ids.length) throw new Error(`${key} 원본 식별자가 비어 있거나 중복되었습니다.`);
  }
  if (facilities.rows.some(row => !row.stdRestCd || !row.psCode || !row.psName)) throw new Error("편의시설 원본 식별자가 없습니다.");
  return {fetchedAt: new Date().toISOString(), locations: locations.rows, facilities: facilities.rows, services: services.rows, serviceExpectedCount: services.count, serviceComplete, recovery};
}

/** CSV 인용부호·내부 줄바꿈·이스케이프·BOM을 보존하고 잘못된 행은 거부한다. */
export function parseRestAreaCsv(source: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  const value = source.replace(/^\uFEFF/, "");
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (quoted) {
      if (char === '"' && value[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (quoted) throw new Error("CSV 인용부호가 닫히지 않았습니다.");
  if (row.length || cell.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
  const headers = rows.shift();
  if (!headers?.includes("휴게소명") || new Set(headers).size !== headers.length) throw new Error("CSV 헤더가 올바르지 않습니다.");
  return rows.filter(values => values.some(value => value.trim())).map((values, index) => {
    if (values.length !== headers.length) throw new Error(`CSV ${index + 2}행의 컬럼 수가 맞지 않습니다.`);
    return Object.fromEntries(headers.map((key, i) => [key, values[i].trim()]));
  });
}
