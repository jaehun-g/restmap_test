"use client";

import {useCallback, useEffect, useRef, useState} from "react";
import {hasCoordinates, type RestAreasResponse, type RestAreaRecord} from "@/lib/rest-areas";

const emptyAreas: RestAreasResponse["items"] = [];

export function useRestAreas(fresh = false) {
  const [data, setData] = useState<RestAreasResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);

  const reload = useCallback(async (force = true) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/rest-areas", {
        cache: "no-store",
        headers: force || fresh ? {"x-map-fresh": "1"} : {},
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error?.message || "휴게소를 조회하지 못했습니다.");
      }
      if (!controller.signal.aborted) setData(result as RestAreasResponse);
    } catch (reason) {
      if (!controller.signal.aborted) {
        setError(reason instanceof Error ? reason.message : "휴게소를 조회하지 못했습니다.");
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [fresh]);

  useEffect(() => {
    // Cancel the first Strict Mode mount before it can issue a duplicate DB read.
    const timer = window.setTimeout(() => {
      void reload(false);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      request.current?.abort();
    };
  }, [reload]);

  const replaceItem = useCallback((item: RestAreaRecord) => {
    setData(current => {
      if (!current) return current;
      const items = current.items.map(area => (area.id === item.id
        ? {...item, ...(item.foodMenuSummary ? {} : area.foodMenuSummary ? {foodMenuSummary: area.foodMenuSummary} : {})}
        : area));
      return {
        ...current,
        items,
        unmappedCount: items.filter(area => !hasCoordinates(area)).length,
      };
    });
  }, []);
  return {
    data,
    areas: data?.items ?? emptyAreas,
    loading,
    error,
    reload,
    replaceItem,
  };
}
