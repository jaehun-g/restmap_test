"use client";
import {useEffect, useState} from "react";
import type {RestAreaRecord} from "@/lib/rest-areas";
import type {GasStationRecord} from "@/lib/gas-stations";

export function useMobileDetails(kind: "rest" | "station", ids: number[]) {
  const [items, setItems] = useState<Record<number, RestAreaRecord | GasStationRecord>>({});
  const [failure, setFailure] = useState<{key: string; attempt: number; message: string} | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = ids.join(",");
  useEffect(() => {
    const controller = new AbortController();
    const missing = key ? key.split(",").map(Number).filter(id => !items[id]) : [];
    if (!missing.length) return () => controller.abort();
    void Promise.all(missing.map(async id => {
      const response = await fetch(`/api/map-detail?kind=${kind}&id=${id}`, {signal: controller.signal});
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "상세 정보를 불러오지 못했습니다.");
      return [id, body.item] as const;
    })).then(entries => {
      if (!controller.signal.aborted) { setFailure(null); setItems(current => ({...current, ...Object.fromEntries(entries)})); }
    }).catch(reason => { if (!controller.signal.aborted) setFailure({key, attempt, message: reason instanceof Error ? reason.message : "상세 정보를 불러오지 못했습니다."}); });
    return () => controller.abort();
  // items is intentionally excluded: fetching is driven by selection and explicit retry.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, key, attempt]);
  return {items, error: failure?.key === key && failure.attempt === attempt ? failure.message : null, retry: () => setAttempt(value => value + 1)};
}
