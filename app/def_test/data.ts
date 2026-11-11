export const areas = [
  ["02", "경기"],
  ["01", "서울"],
  ["03", "강원"],
  ["04", "충북"],
  ["05", "충남"],
  ["06", "전북"],
  ["20", "전남·광주"],
  ["08", "경북"],
  ["09", "경남"],
  ["10", "부산"],
  ["11", "제주"],
  ["14", "대구"],
  ["15", "인천"],
  ["17", "대전"],
  ["18", "울산"],
  ["19", "세종"],
] as const;

export function priceChange(current: number | null, previous: number | null) {
  if (current === null || previous === null || previous <= 0) return null;
  const difference = current - previous;
  return {difference, percent: (difference / previous) * 100};
}

export function parseOpinetJson(text: string) {
  let inString = false;
  let escaped = false;
  let normalized = "";
  for (const char of text) {
    if (inString && char.charCodeAt(0) < 32) {
      normalized += `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`;
      continue;
    }
    normalized += char;
    if (char === '"' && !escaped) inString = !inString;
    if (inString && char === "\\" && !escaped) escaped = true;
    else escaped = false;
  }
  return JSON.parse(normalized);
}

export function averagePrices(records: unknown[]) {
  const prices = records.flatMap(record => {
    if (!record || typeof record !== "object") return [];
    const price = (record as {PRICE?: unknown}).PRICE;
    if (typeof price !== "number" && (typeof price !== "string" || !price.trim())) return [];
    const value = Number(price);
    return Number.isFinite(value) && value > 0 ? [value] : [];
  });
  return {
    average: prices.length ? prices.reduce((sum, price) => sum + price, 0) / prices.length : null,
    count: prices.length,
  };
}
