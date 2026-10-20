import {parseHighwayRoute, type HighwayRoute} from "./highway-routes.ts";
import {canonicalHighwayRouteName, sameHighwayRouteName} from "./highway-route-name.ts";

export type HighwayRouteState = {
  routeName: string | null;
  route: HighwayRoute | null;
  loading: boolean;
  error: string | null;
};
type CacheEntry = {route: HighwayRoute; expiresAt: number};
const routeCache = new Map<string, CacheEntry>();
const cacheLifetime = 5 * 60 * 1000;
const initialState: HighwayRouteState = {
  routeName: null,
  route: null,
  loading: false,
  error: null,
};

export class HighwayRouteLoader {
  private state = initialState;
  private listeners = new Set<() => void>();
  private sequence = 0;
  private request: AbortController | null = null;
  private fetcher: typeof fetch;
  private now: () => number;
  private cache: Map<string, CacheEntry>;

  constructor(
    fetcher: typeof fetch = (input, init) => globalThis.fetch(input, init),
    now: () => number = Date.now,
    cache: Map<string, CacheEntry> = routeCache,
  ) {
    this.fetcher = fetcher;
    this.now = now;
    this.cache = cache;
  }

  getSnapshot = () => this.state;
  getServerSnapshot = () => initialState;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private publish(state: HighwayRouteState) {
    this.state = state;
    this.listeners.forEach(listener => listener());
  }

  cancel = () => {
    this.sequence++;
    this.request?.abort();
    this.request = null;
  };

  select = (routeName: string | null, force = false) => {
    this.cancel();
    if (!routeName) {
      this.publish(initialState);
      return;
    }
    routeName = canonicalHighwayRouteName(routeName);
    const cached = this.cache.get(routeName);
    if (!force && cached && cached.expiresAt > this.now()) {
      this.publish({routeName, route: cached.route, loading: false, error: null});
      return;
    }
    this.cache.delete(routeName);
    const controller = new AbortController();
    this.request = controller;
    const sequence = this.sequence;
    this.publish({routeName, route: null, loading: true, error: null});
    void this.load(routeName, controller, sequence);
  };

  retry = () => this.select(this.state.routeName, true);

  private async load(routeName: string, controller: AbortController, sequence: number) {
    const current = () => !controller.signal.aborted && sequence === this.sequence;
    try {
      const response = await this.fetcher(
        `/api/highway-routes?${new URLSearchParams({routeName})}`,
        {cache: "no-store", signal: controller.signal},
      );
      const body = await response.json();
      if (!current()) return;
      if (!response.ok) {
        throw new Error(
          typeof body?.error?.message === "string"
            ? body.error.message
            : "선택한 노선의 경로를 불러오지 못했습니다.",
        );
      }
      const parsed = parseHighwayRoute(body?.route);
      if (!parsed.ok) throw new Error(parsed.error.message);
      if (!sameHighwayRouteName(parsed.value.routeName, routeName))
        throw new Error("선택한 노선과 경로 데이터가 일치하지 않습니다.");
      this.cache.set(routeName, {route: parsed.value, expiresAt: this.now() + cacheLifetime});
      this.publish({routeName, route: parsed.value, loading: false, error: null});
    } catch (reason) {
      if (!current()) return;
      this.publish({
        routeName,
        route: null,
        loading: false,
        error:
          reason instanceof Error ? reason.message : "선택한 노선의 경로를 불러오지 못했습니다.",
      });
    } finally {
      if (current()) this.request = null;
    }
  }
}
