"use client";
import {useCallback, useEffect, useRef, useState} from "react";
import type {GasStationsResponse, GasStationRecord} from "@/lib/gas-stations";
import {stationKey} from "@/lib/gas-stations";
import {canKeepPreviousStations} from "@/lib/gas-station-query";
import {QueryCache} from "@/lib/query-cache";
import type {Result} from "@/lib/rest-areas";

const empty: GasStationRecord[] = [];

export type InitialGasStations = {query: string; result: Promise<Result<GasStationsResponse> | undefined>};

export function useGasStations(query: string | null, fresh = false, initial?: InitialGasStations) {
  const [cache] = useState(() => new QueryCache<GasStationsResponse>());
  const requested = useRef(false);
  const [state, setState] = useState<{
    query: string | null;
    data: GasStationsResponse | null;
    loading: boolean;
    error: string | null;
  }>({query: null, data: null, loading: false, error: null});
  const request = useRef<AbortController | null>(null);
  const reload = useCallback(async (force = true) => {
    request.current?.abort();
    if (force) {
      requested.current = true;
      cache.clear();
    }
    if (query === null) {
      setState({query: null, data: null, loading: false, error: null});
      return;
    }
    const cached = !force && !fresh ? cache.get(query) : undefined;
    if (cached) {
      setState({query, data: cached, loading: false, error: null});
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setState(prev => ({...prev, loading: true, error: null}));
    try {
      const response = await globalThis.fetch(`/api/gas-stations${query ? `?${query}` : ""}`, {
        cache: "no-store",
        headers: force || fresh ? {"x-map-fresh": "1"} : {},
        signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "주유소를 조회하지 못했습니다.");
      if (!Array.isArray(body.items) || typeof body.fetchedAt !== "string")
        throw new Error("주유소 응답 형식이 올바르지 않습니다.");
      if (!controller.signal.aborted) {
        if (!fresh) cache.set(query, body);
        setState({query, data: body, loading: false, error: null});
      }
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
  }, [query, fresh, cache]);
  useEffect(() => {
    if (!fresh && initial?.query === query && !requested.current) {
      const controller = new AbortController();
      request.current = controller;
      void Promise.resolve(initial.result).then(result => {
        if (controller.signal.aborted) return;
        requested.current = true;
        if (!result) return reload(false);
        if (result.ok) cache.set(query, result.value);
        setState({query, data: result.ok ? result.value : null, loading: false,
          error: result.ok ? null : result.error.message});
      }).catch(() => {
        if (!controller.signal.aborted) {
          requested.current = true;
          void reload(false);
        }
      });
      return () => { request.current?.abort(); };
    }
    const timer = window.setTimeout(() => {
      if (query !== null) requested.current = true;
      void reload(false);
    }, requested.current ? 150 : 0);
    return () => {
      window.clearTimeout(timer);
      request.current?.abort();
    };
  }, [reload, query, initial, fresh, cache]);
  const replaceItem = useCallback(
    (item: GasStationRecord) => {
      cache.clear();
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
      );
    },
    [cache],
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
