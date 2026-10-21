"use client";

import {useEffect, useMemo, useState} from "react";
import {foodBadges, foodPrice, type FoodMenusResponse} from "@/lib/food-menus";

export default function FoodMenuSection({restAreaId}: {restAreaId: number}) {
  const [data, setData] = useState<FoodMenusResponse | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
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

  const ordered = useMemo(() => [...(data?.items ?? [])].sort((a, b) => Number(Boolean(b.recommended)) - Number(Boolean(a.recommended))), [data]);
  const preview = ordered.slice(0, 5);
  return <section className="food-menu-section" aria-label="휴게소 음식 메뉴">
    <div className="food-menu-heading"><h3>전체 메뉴 <span>{data?.items.length ?? 0}개</span></h3></div>
    {loading ? <p role="status">메뉴 정보를 불러오는 중입니다.</p>
      : error ? <p role="status">메뉴 정보를 불러오지 못했습니다.</p>
        : !ordered.length ? <p>등록된 메뉴 정보가 없습니다.</p>
          : <>
            <ul className={expanded ? "is-expanded" : "food-menu-preview"}>{(expanded ? ordered : preview).map(menu => <li key={menu.key}>
              <div className="food-menu-name"><strong>{menu.name}</strong>{foodBadges(menu).map(badge => <span className={`food-menu-badge ${badge === "추천" ? "recommended" : "best"}`} key={badge}>{badge}</span>)}</div>
              <span className="food-menu-price">{foodPrice(menu.price)}</span>
            </li>)}</ul>
            {ordered.length > 3 && <button type="button" className="food-menu-more" onClick={() => setExpanded(value => !value)} aria-expanded={expanded}>{expanded ? "접기" : `전체 메뉴 보기 (${ordered.length}개)`}</button>}
          </>}
  </section>;
}
