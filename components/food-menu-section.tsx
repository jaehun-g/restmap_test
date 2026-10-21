"use client";

import {useEffect, useState} from "react";
import {foodBadges, foodPrice, type FoodMenusResponse} from "@/lib/food-menus";

export default function FoodMenuSection({restAreaId}: {restAreaId: number}) {
  const [data, setData] = useState<FoodMenusResponse | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/rest-areas/${restAreaId}/food-menus`, {cache: "no-store", signal: controller.signal})
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error("food menu query failed");
        setData(body as FoodMenusResponse);
      })
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [restAreaId]);

  return <section className="food-menu-section" aria-label="휴게소 음식 메뉴">
    <h3>음식 메뉴</h3>
    {loading ? <p role="status">메뉴 정보를 불러오는 중입니다.</p>
      : error ? <p role="status">메뉴 정보를 불러오지 못했습니다.</p>
        : !data?.items.length ? <p>등록된 메뉴 정보가 없습니다.</p>
          : <>
            <ul>{data.items.map(menu => <li key={menu.key}>
              <div><strong>{menu.name}</strong>{foodBadges(menu).map(badge => <span className="food-menu-badge" key={badge}>{badge}</span>)}</div>
              <span>{foodPrice(menu.price)}</span>
            </li>)}</ul>
            <p className="food-menu-updated">정보 기준: {data.items[0]?.sourceUpdatedAt ?? "원본 기준일 미제공"}</p>
          </>}
  </section>;
}
