"use client";

import {useState, type UIEvent} from "react";

export function useInfiniteScroll<T>(items: T[], pageSize = 5) {
  const [progress, setProgress] = useState({items, count: pageSize});
  const count = progress.items === items ? progress.count : pageSize;
  function onScroll(event: UIEvent<HTMLElement>) {
    const node = event.currentTarget;
    if (node.scrollHeight - node.scrollTop - node.clientHeight > 24) return;
    setProgress(current => ({items, count: Math.min(items.length, (current.items === items ? current.count : pageSize) + pageSize)}));
  }
  return {visibleItems: items.slice(0, count), onScroll};
}
