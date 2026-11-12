"use client";

import {useEffect, useMemo, useRef, useState} from "react";
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

  const ordered = useMemo(() => [...(data?.items ?? [])].sort((a, b) => Number(Boolean(b.recommended)) - Number(Boolean(a.recommended))), [data]);
  const [progress, setProgress] = useState<{items: typeof ordered; count: number}>({items: ordered, count: 5});
  const count = progress.items === ordered ? progress.count : 5;
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = sentinel.current;
    if (!node || count >= ordered.length) return;
    if (typeof IntersectionObserver === "undefined") {
      const timer = setTimeout(() => setProgress({items: ordered, count: ordered.length}), 0);
      return () => clearTimeout(timer);
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting))
        setProgress(current => ({items: ordered, count: Math.min(ordered.length, (current.items === ordered ? current.count : 5) + 5)}));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ordered, count]);
  return <section className="food-menu-section" aria-label="휴게소 음식 메뉴" aria-busy={loading}>
    <div className="detail-section-heading food-menu-heading"><h3>전체 메뉴</h3>{data && <span>{data.items.length}개</span>}</div>
    {loading ? <div className="food-menu-loading" role="status">
      <span>메뉴 정보를 불러오는 중입니다.</span>
      <ul aria-hidden="true">
        {[0, 1, 2].map(index => <li className="food-menu-skeleton" key={index}>
          <span className="food-menu-skeleton-name" />
          <span className="food-menu-skeleton-price" />
        </li>)}
      </ul>
    </div>
      : error ? <p role="status">메뉴 정보를 불러오지 못했습니다.</p>
        : !ordered.length ? <p>등록된 메뉴 정보가 없습니다.</p>
          : <>
            <ul>{ordered.slice(0, count).map(menu => <li key={menu.key}>
              <div className="food-menu-name"><strong>{menu.name}</strong>{foodBadges(menu).map(badge => <span className={`food-menu-badge ${badge === "추천" ? "recommended" : "best"}`} key={badge}>{badge}</span>)}</div>
              <span className="food-menu-price">{foodPrice(menu.price)}</span>
            </li>)}</ul>
            {count < ordered.length && <div ref={sentinel} aria-hidden="true" />}
          </>}
  </section>;
}
