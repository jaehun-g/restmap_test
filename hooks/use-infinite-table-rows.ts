"use client";

import {useEffect, useRef, useState} from "react";
import {tablePageSize} from "@/lib/pagination";

export function useInfiniteTableRows<T>(rows: T[], selectedIndex: number) {
  const [progress, setProgress] = useState<{rows: T[]; count: number}>({rows, count: tablePageSize});
  const sentinel = useRef<HTMLDivElement>(null);
  const initialCount = progress.rows === rows ? progress.count : tablePageSize;
  const visibleCount = typeof IntersectionObserver === "undefined"
    ? rows.length
    : Math.min(rows.length, Math.max(initialCount, selectedIndex >= initialCount ? selectedIndex + tablePageSize : initialCount));
  const visibleRows = rows.slice(0, visibleCount);
  useEffect(() => {
    if (visibleCount >= rows.length) return;
    if (typeof IntersectionObserver === "undefined") return;
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting))
        setProgress(current => ({rows, count: Math.min(rows.length, (current.rows === rows ? current.count : tablePageSize) + tablePageSize)}));
    }, {rootMargin: "240px"});
    observer.observe(node);
    return () => observer.disconnect();
  }, [rows, rows.length, visibleCount]);

  return {visibleRows, sentinel, visibleCount};
}
