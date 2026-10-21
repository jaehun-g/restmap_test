import type {Result} from "./rest-areas.ts";
import type {FoodMenu} from "./food-menus.ts";

export const foodMenuEndpoint = "https://data.ex.co.kr/openapi/restinfo/restBestfoodList";
export type SourceFoodMenu = Omit<FoodMenu, "collectedAt"> & {
  stdRestCd: string;
  restCd: string | null;
  seq: string;
  restName: string;
  routeCode: string | null;
  routeName: string | null;
  address: string | null;
  displayed: boolean | null;
  sourceCreatedAt: string | null;
};
type SourcePage = {items: SourceFoodMenu[]; count: number; pages: number};
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const yn = (value: unknown) => text(value) === "Y" ? true : text(value) === "N" ? false : null;
const date = (value: unknown) => {
  const source = text(value);
  if (!source || !/^\d{4}-\d{2}-\d{2}(?:[ T].*)?$/.test(source)) return null;
  const day = source.slice(0, 10);
  const parsed = new Date(`${day}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day ? source : null;
};
const fail = (code: string, message: string): Result<never> => ({ok: false, error: {code, message}});

export function parseFoodMenuPage(payload: unknown): Result<SourcePage> {
  const root = record(payload);
  if (!root || root.code !== "SUCCESS" || !Array.isArray(root.list))
    return fail("FOOD_SOURCE_INVALID", "음식정보 API가 정상 목록을 반환하지 않았습니다.");
  const count = Number(root.count), pages = Number(root.pageSize);
  if (!Number.isSafeInteger(count) || count < 1 || !Number.isSafeInteger(pages) || pages < 1 || pages > 500)
    return fail("FOOD_SOURCE_INVALID", "음식정보 전체 건수와 페이지 수를 확인할 수 없습니다.");
  const items: SourceFoodMenu[] = [];
  for (const value of root.list) {
    const row = record(value);
    if (!row) return fail("FOOD_SOURCE_INVALID", "음식정보 행 형식이 올바르지 않습니다.");
    const stdRestCd = text(row.stdRestCd), seq = text(row.seq), name = text(row.foodNm), restName = text(row.stdRestNm);
    if (!stdRestCd || !seq || !name || !restName)
      return fail("FOOD_SOURCE_INVALID", "음식정보의 휴게소 코드·메뉴 식별자·명칭이 없습니다.");
    const rawPrice = text(row.foodCost);
    const price = rawPrice === null ? null : Number(rawPrice.replace(/[,\s₩원]/g, ""));
    if (price !== null && (!Number.isSafeInteger(price) || price < 0 || price > 10_000_000))
      return fail("FOOD_SOURCE_INVALID", "음식 가격이 올바르지 않습니다.");
    for (const key of ["recommendyn", "bestfoodyn", "app"])
      if (text(row[key]) !== null && yn(row[key]) === null)
        return fail("FOOD_SOURCE_INVALID", "음식정보 표시 여부가 올바르지 않습니다.");
    items.push({
      key: `${stdRestCd}|${seq}`, stdRestCd, restCd: text(row.restCd), seq, restName,
      routeCode: text(row.routeCd), routeName: text(row.routeNm), address: text(row.svarAddr),
      name, price, recommended: yn(row.recommendyn), best: yn(row.bestfoodyn), displayed: yn(row.app),
      sourceUpdatedAt: date(row.lsttmAltrDttm), sourceCreatedAt: date(row.lastDtime),
    });
  }
  return {ok: true, value: {items, count, pages}};
}

/** 모든 페이지 검증이 끝나기 전에는 저장 단계로 진행하지 않는다. */
export async function fetchFoodMenus({
  apiKey = process.env.EX_OPEN_API_KEY,
  fetcher = fetch,
}: {apiKey?: string; fetcher?: typeof fetch} = {}): Promise<Result<SourceFoodMenu[]>> {
  if (!apiKey?.trim()) return fail("FOOD_KEY_MISSING", "EX_OPEN_API_KEY를 설정해주세요.");
  async function page(pageNo: number): Promise<Result<SourcePage>> {
    const url = new URL(foodMenuEndpoint);
    url.search = new URLSearchParams({key: apiKey!.trim(), type: "json", pageNo: String(pageNo), numOfRows: "99"}).toString();
    try {
      const response = await fetcher(url.toString(), {cache: "no-store", signal: AbortSignal.timeout(20_000)});
      if (!response.ok) return fail("FOOD_SOURCE_FAILED", "음식정보 API 요청에 실패했습니다.");
      return parseFoodMenuPage(await response.json());
    } catch {
      return fail("FOOD_SOURCE_FAILED", "음식정보 API 응답을 가져오지 못했습니다.");
    }
  }
  const first = await page(1);
  if (!first.ok) return first;
  const {count, pages} = first.value;
  const items = [...first.value.items];
  for (let next = 2; next <= pages; next += 3) {
    const batch = await Promise.all(Array.from({length: Math.min(3, pages - next + 1)}, (_, i) => page(next + i)));
    for (const result of batch) {
      if (!result.ok) return result;
      if (result.value.count !== count || result.value.pages !== pages)
        return fail("FOOD_SNAPSHOT_CHANGED", "수집 중 음식정보 전체 건수가 바뀌었습니다. 다시 시도해주세요.");
      items.push(...result.value.items);
    }
  }
  if (items.length !== count || new Set(items.map(item => item.key)).size !== count)
    return fail("FOOD_SOURCE_INCOMPLETE", "음식정보 전체 목록이 누락되거나 식별자가 중복되었습니다.");
  return {ok: true, value: items};
}
