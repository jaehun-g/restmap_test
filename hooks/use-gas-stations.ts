"use client";
import {useCallback, useEffect, useRef, useState} from "react";
import type {GasStationsResponse, GasStationRecord} from "@/lib/gas-stations";
import {stationKey} from "@/lib/gas-stations";
import {canKeepPreviousStations} from "@/lib/gas-station-query";

const empty: GasStationRecord[] = [];

export function useGasStations(query: string | null) {
  const [state, setState] = useState<{
    query: string | null;
    data: GasStationsResponse | null;
    loading: boolean;
    error: string | null;
  }>({query: null, data: null, loading: false, error: null});
  const request = useRef<AbortController | null>(null);
  const reload = useCallback(async () => {
    request.current?.abort();
    if (query === null) {
      setState({query: null, data: null, loading: false, error: null});
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setState(prev => ({...prev, loading: true, error: null}));
    try {
      const response = await globalThis.fetch(`/api/gas-stations${query ? `?${query}` : ""}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "주유소를 조회하지 못했습니다.");
      if (!Array.isArray(body.items) || typeof body.fetchedAt !== "string")
        throw new Error("주유소 응답 형식이 올바르지 않습니다.");
      if (!controller.signal.aborted) setState({query, data: body, loading: false, error: null});
    } catch (reason) {
      if (!controller.signal.aborted)
        setState(prev => ({
          ...prev,
          query,
          data: prev.query === query || canKeepPreviousStations(prev.query, query) ? prev.data : null,
          loading: false,
          error: reason instanceof Error ? reason.message : "주유소를 조회하지 못했습니다.",
        }));
    }
  }, [query]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void reload();
    }, 150);
    return () => {
      window.clearTimeout(timer);
      request.current?.abort();
    };
  }, [reload]);
  const replaceItem = useCallback(
    (item: GasStationRecord) =>
      setState(current =>
        current.data
          ? {
              ...current,
              data: {
                ...current.data,
                items: current.data.items.map(station =>
                  stationKey(station) === stationKey(item) ? item : station,
                ),
              },
            }
          : current,
      ),
    [],
  );
  const current = query !== null && state.query === query;
  const keepPrevious =
    !current && canKeepPreviousStations(state.query, query) && state.data !== null;
  const displayedData = current || keepPrevious ? state.data : null;
  return {
    data: displayedData,
    stations: displayedData?.items ?? empty,
    loading: query !== null && (!current || state.loading),
    error: current ? state.error : null,
    reload,
    replaceItem,
  };
}
