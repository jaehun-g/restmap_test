import type {Result} from "./rest-areas.ts";

export const stationFields = [
  {
    key: "name",
    column: "siteNm",
    label: "주유소명",
    kind: "text",
    maxLength: 150,
    required: true,
  },
  {key: "phone", column: "telNo", label: "전화번호", kind: "text", maxLength: 30},
  {key: "address", column: "zipAddr", label: "주소", kind: "text", maxLength: 255},
  {key: "detailAddress", column: "detAddr", label: "상세주소", kind: "text", maxLength: 255},
  {key: "latitude", column: "lat", label: "위도", kind: "coordinate", min: -90, max: 90},
  {key: "longitude", column: "longi", label: "경도", kind: "coordinate", min: -180, max: 180},
  {key: "openTime", column: "businsFrTm", label: "영업 시작", kind: "time", maxLength: 4},
  {key: "closeTime", column: "businsToTm", label: "영업 종료", kind: "time", maxLength: 4},
] as const;
export const stationServices = [
  {key: "cargo", column: "cargoYn", label: "화물 특화"},
  {key: "convenience", column: "cvsYn", label: "편의점"},
  {key: "self", column: "selfYn", label: "셀프 주유"},
  {key: "lpg", column: "lpgYn", label: "LPG 충전"},
  {key: "carWash", column: "carWashYn", label: "세차장"},
  {key: "ev", column: "evYn", label: "전기차 충전"},
] as const;
export type StationServiceKey = (typeof stationServices)[number]["key"];
export type StationScalarKey = (typeof stationFields)[number]["key"];
export type GasStation = {
  id: number;
  siteCode: string;
  brand: "GS" | "EX";
  name: string;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  address: string | null;
  detailAddress: string | null;
  openTime: string | null;
  closeTime: string | null;
  services: Record<StationServiceKey, boolean | null>;
  routeName?: string | null;
  direction?: string | null;
  oilCompany?: string | null;
  prices?: {gasoline: number | null; diesel: number | null; lpg: number | null};
  priceUpdatedAt?: string | null;
};
export type GasStationRecord = GasStation & {
  revision: string;
  sourceDetails?: Record<string, string | null>;
};
export type GasStationsResponse = {
  items: GasStationRecord[];
  unmappedCount: number;
  fetchedAt: string;
};
export const stationKey = (station: Pick<GasStation, "brand" | "siteCode">) =>
  `station:${station.brand}:${station.siteCode}`;
export const stationLabel = (station: GasStation) =>
  station.brand === "EX" ? "고속도로 주유소" : "GS 주유·충전소";
export function stationPriceItems(station: GasStation) {
  return (
    [
      ["gasoline", "휘발유"],
      ["diesel", "경유"],
      ["lpg", "LPG"],
    ] as const
  ).flatMap(([key, label]) => {
    const price = station.prices?.[key];
    return typeof price === "number" && Number.isFinite(price) && price > 0
      ? [
          {
            key,
            label,
            price,
            text: `${price.toLocaleString("ko-KR", {maximumFractionDigits: 1})}원/L`,
          },
        ]
      : [];
  });
}
export type StationChanges = Partial<Pick<GasStation, StationScalarKey>> & {
  services?: Partial<GasStation["services"]>;
};
export const stationColumns = [
  "id",
  "siteCd",
  ...stationFields.map(field => field.column),
  ...stationServices.map(field => field.column),
  "updated_at",
];
export const stationReadOnlyColumns = [
  "siteSxnCd",
  "siteOperTy",
  "zipNo",
  "aoYn",
  "kixxprimeYn",
  "payPsblYn",
  "epMoneyYn",
  "goodgsYn",
  "kakaoPayYn",
  "naverPayYn",
  "zeroPayYn",
  "paycoYn",
  "hyundaiPayYn",
  "tossPayYn",
];
export const selectStationColumn = (column: string) => `"${column.toLowerCase()}" AS "${column}"`;
export const selectStationColumns = `SELECT ${stationColumns.map(selectStationColumn).join(", ")} FROM test_gscargo`;

export function stationText(value: unknown): string | null {
  if (value instanceof Uint8Array) {
    try {
      value = new TextDecoder("utf-8", {fatal: true}).decode(value);
    } catch {
      return null;
    }
  }
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
export function stationNumber(value: unknown): number | null {
  if (value instanceof Uint8Array) value = stationText(value);
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && !value.trim())
  )
    return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
export function normalizeGasStations(rows: Record<string, unknown>[]): Result<GasStation[]> {
  const items: GasStation[] = [];
  const ids = new Set<number>();
  const codes = new Set<string>();
  for (const row of rows) {
    const id = stationNumber(row.id),
      name = stationText(row.siteNm),
      siteCode = stationText(row.siteCd);
    if (
      !id ||
      !Number.isSafeInteger(id) ||
      id < 1 ||
      !name ||
      !siteCode ||
      ids.has(id) ||
      codes.has(siteCode)
    )
      return {
        ok: false,
        error: {
          code: "INVALID_DATA",
          message:
            "주유소의 식별자 또는 이름이 올바르지 않습니다. test_gscargo 데이터를 확인해주세요.",
        },
      };
    ids.add(id);
    codes.add(siteCode);
    let latitude = stationNumber(row.lat),
      longitude = stationNumber(row.longi);
    if (
      latitude === null ||
      longitude === null ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    ) {
      latitude = null;
      longitude = null;
    }
    items.push({
      id,
      siteCode,
      brand: "GS",
      name,
      latitude,
      longitude,
      phone: stationText(row.telNo),
      address: stationText(row.zipAddr),
      detailAddress: stationText(row.detAddr),
      openTime: stationText(row.businsFrTm),
      closeTime: stationText(row.businsToTm),
      services: Object.fromEntries(
        stationServices.map(({key, column}) => {
          const value = stationText(row[column]);
          return [key, value === "Y" ? true : value === "N" ? false : null];
        }),
      ) as GasStation["services"],
    });
  }
  return {ok: true, value: items};
}
export function stationHours(station: Pick<GasStation, "openTime" | "closeTime">): string {
  const {openTime, closeTime} = station;
  if (!openTime || !closeTime || !/^\d{4}$/.test(openTime + "") || !/^\d{4}$/.test(closeTime + ""))
    return "영업시간 정보 없음";
  const display = (value: string) => `${value.slice(0, 2)}:${value.slice(2)}`;
  return `${display(openTime)}–${display(closeTime)}${openTime === closeTime ? " · 운영시간 확인 필요" : ""}`;
}
