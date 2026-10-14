"use client";

import {useEffect, useState, useSyncExternalStore} from "react";
import {HighwayRouteLoader} from "@/lib/highway-route-loader";

export function useHighwayRoute(routeName: string | null, enabled: boolean) {
  const [loader] = useState(() => new HighwayRouteLoader());
  const state = useSyncExternalStore(
    loader.subscribe,
    loader.getSnapshot,
    loader.getServerSnapshot,
  );
  useEffect(() => {
    loader.select(enabled ? routeName : null);
    return loader.cancel;
  }, [loader, routeName, enabled]);
  const current = enabled && state.routeName === routeName;
  return {
    route: current ? state.route : null,
    loading: enabled && !!routeName && (!current || state.loading),
    error: current ? state.error : null,
    retry: loader.retry,
  };
}
