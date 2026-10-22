import {connection} from "next/server";
import {queryMapRestAreas} from "@/lib/cached-map-queries";

export async function GET(request: Request) {
  await connection();
  const started = performance.now();
  const result = await queryMapRestAreas(request.headers.get("x-map-fresh") === "1");
  const headers = {"Cache-Control": "no-store", "Server-Timing": `map-query;dur=${(performance.now() - started).toFixed(1)}`};
  if (!result.ok) {
    const status = result.error.code.startsWith("DB_CONFIG") ? 503 : 502;
    return Response.json({error: result.error}, {status, headers});
  }
  return Response.json(result.value, {headers});
}
