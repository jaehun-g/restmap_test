import {stationPriceItems, type GasStation} from "./gas-stations.ts";

/** 연결된 EX 주유소의 유종별 유효 가격만 집계한다. */
export function restAreaPriceSummary(stations: readonly GasStation[], fuel: "gasoline" | "diesel") {
  const linked = stations.filter(station => station.brand === "EX");
  const prices = linked.flatMap(station =>
    stationPriceItems(station).filter(item => item.key === fuel).map(item => item.price),
  );
  const format = (price: number) => price.toLocaleString("ko-KR", {maximumFractionDigits: 1});
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return {
    text: !prices.length ? "정보 없음" : `${format(min)}${min === max ? "" : `~${format(max)}`}원/L`,
    partial: prices.length > 0 && prices.length < linked.length,
  };
}
