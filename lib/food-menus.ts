export type FoodMenu = {
  key: string;
  name: string;
  price: number | null;
  recommended: boolean | null;
  best: boolean | null;
  sourceUpdatedAt: string | null;
  collectedAt: string;
};

export type FoodMenuSummary = {
  count: number;
  featured: Pick<FoodMenu, "key" | "name" | "price" | "recommended" | "best">[];
  collectedAt: string | null;
};

export type FoodMenusResponse = {
  items: FoodMenu[];
  collectedAt: string | null;
};

export function foodPrice(price: number | null) {
  return price === null ? "가격 미제공" : `${price.toLocaleString("ko-KR")}원`;
}

export function foodBadges(menu: Pick<FoodMenu, "recommended" | "best">) {
  return [menu.best && "인기", menu.recommended && "추천"].filter(
    (label): label is string => typeof label === "string",
  );
}
