export type MapQueryTiming = {connectionMs: number | null; queryMs: number | null};

type QueryClient<T> = {query: (sql: string, values: number[]) => Promise<T>; release: () => void};

export async function timedMapQuery<T>(
  connect: () => Promise<QueryClient<T>>,
  sql: string,
  values: number[],
  timing: MapQueryTiming,
): Promise<T> {
  const start = performance.now();
  let client: QueryClient<T>;
  try {
    client = await connect();
  } finally {
    timing.connectionMs = performance.now() - start;
  }
  const queryStart = performance.now();
  try {
    return await client.query(sql, values);
  } finally {
    timing.queryMs = performance.now() - queryStart;
    client.release();
  }
}

export function logMapQueryTiming(kind: "rest" | "station", timing: MapQueryTiming, processingMs: number | null, ok: boolean) {
  const round = (value: number | null) => value === null ? null : Math.round(value * 10) / 10;
  console.info("[mobile-map-db]", JSON.stringify({kind, connectionMs: round(timing.connectionMs), queryMs: round(timing.queryMs), processingMs: round(processingMs), ok}));
}
