import test from "node:test";
import assert from "node:assert/strict";
import { HighwayRouteLoader } from "../lib/highway-route-loader.ts";
import type { HighwayRoute } from "../lib/highway-routes.ts";

function route(routeName: string): HighwayRoute {
  return { id: 1, routeName, routeNumber: "35", bounds: { south: 36, west: 127, north: 37, east: 128 }, paths: [[[36, 127], [37, 128]]] };
}
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
function pendingRequests() {
  const requests: { name: string; signal: AbortSignal; resolve: (response: Response) => void }[] = [];
  const fetcher: typeof fetch = (input, options) => new Promise((resolve) => {
    requests.push({ name: new URL(String(input), "https://example.test").searchParams.get("routeName")!, signal: options!.signal!, resolve });
  });
  return { requests, loader: new HighwayRouteLoader(fetcher, Date.now, new Map()) };
}

test("default fetch uses the global receiver required by browser fetch", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", function (
    this: typeof globalThis,
    input: Parameters<typeof fetch>[0],
  ) {
    if (this !== globalThis) throw new TypeError("Illegal invocation");
    const name = new URL(String(input), "https://example.test").searchParams.get("routeName")!;
    return Promise.resolve(Response.json({ route: route(name) }));
  });
  const loader = new HighwayRouteLoader(undefined, Date.now, new Map());
  loader.select("중부선");
  await settle();
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.equal(loader.getSnapshot().error, null);
  assert.equal(loader.getSnapshot().route?.routeName, "중부선");
});

test("all routes performs no request and changing a selection cancels and hides the previous route", async () => {
  const { loader, requests } = pendingRequests();
  loader.select(null);
  assert.equal(requests.length, 0);
  loader.select("중부선");
  requests[0].resolve(Response.json({ route: route("중부선") }));
  await settle();
  assert.equal(loader.getSnapshot().route?.routeName, "중부선");
  loader.select("대전통영선");
  assert.equal(loader.getSnapshot().route, null);
  assert.equal(loader.getSnapshot().loading, true);
  loader.select(null);
  assert.equal(requests[1].signal.aborted, true);
  requests[1].resolve(Response.json({ route: route("대전통영선") }));
  await settle();
  assert.deepEqual(loader.getSnapshot(), { routeName: null, route: null, loading: false, error: null });
});

test("late responses cannot replace the currently selected route even when fetch ignores abort", async () => {
  const { loader, requests } = pendingRequests();
  loader.select("중부선");
  loader.select("대전통영선");
  assert.equal(requests[0].signal.aborted, true);
  requests[1].resolve(Response.json({ route: route("대전통영선") }));
  await settle();
  requests[0].resolve(Response.json({ route: route("중부선") }));
  await settle();
  assert.equal(loader.getSnapshot().route?.routeName, "대전통영선");
});

test("successful cache entries are shared, expire after five minutes and use names rather than route numbers", async () => {
  let now = 0;
  let calls = 0;
  const cache = new Map();
  const fetcher: typeof fetch = async (input) => {
    calls++;
    const name = new URL(String(input), "https://example.test").searchParams.get("routeName")!;
    return Response.json({ route: route(name) });
  };
  const loader = new HighwayRouteLoader(fetcher, () => now, cache);
  loader.select("중부선");
  await settle();
  const second = new HighwayRouteLoader(fetcher, () => now, cache);
  second.select("중부선");
  assert.equal(calls, 1);
  assert.equal(second.getSnapshot().loading, false);
  loader.select("대전통영선");
  await settle();
  assert.equal(calls, 2);
  now = 299999;
  loader.select("중부선");
  assert.equal(calls, 2);
  now = 300000;
  loader.select("중부선");
  await settle();
  assert.equal(calls, 3);
});

test("failed requests are not cached and explicit retry can recover", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls++;
    return calls === 1
      ? Response.json({ error: { message: "경로 조회 실패" } }, { status: 502 })
      : Response.json({ route: route("중부선") });
  };
  const cache = new Map();
  const loader = new HighwayRouteLoader(fetcher, Date.now, cache);
  loader.select("중부선");
  await settle();
  assert.equal(loader.getSnapshot().error, "경로 조회 실패");
  assert.equal(cache.size, 0);
  loader.retry();
  await settle();
  assert.equal(calls, 2);
  assert.equal(loader.getSnapshot().error, null);
  assert.equal(loader.getSnapshot().route?.routeName, "중부선");
});

test("wrong-route or malformed success responses never enter the cache", async () => {
  for (const body of [{ route: route("다른 노선") }, { route: { ...route("중부선"), paths: [] } }]) {
    const cache = new Map();
    const loader = new HighwayRouteLoader(async () => Response.json(body), Date.now, cache);
    loader.select("중부선");
    await settle();
    assert.equal(loader.getSnapshot().route, null);
    assert.ok(loader.getSnapshot().error);
    assert.equal(cache.size, 0);
  }
});

test("effect cleanup and restart with the same name can complete without using the cancelled request", async () => {
  const { loader, requests } = pendingRequests();
  loader.select("중부선");
  loader.cancel();
  loader.select("중부선");
  requests[1].resolve(Response.json({ route: route("중부선") }));
  await settle();
  requests[0].resolve(Response.json({ route: route("중부선") }));
  await settle();
  assert.equal(loader.getSnapshot().loading, false);
  assert.equal(loader.getSnapshot().route?.routeName, "중부선");
});
