import {connection} from "next/server";
import {queryMapStations} from "@/lib/cached-map-queries";
import {parseStationQuery} from "@/lib/gas-station-query";
import {errorStatus} from "@/lib/api-request";

export async function GET(request: Request) {
  await connection();
  const started = performance.now();
  const query = parseStationQuery(new URL(request.url).searchParams);
  const result = query.ok ? await queryMapStations(query.value, request.headers.get("x-map-fresh") === "1") : query;
  const headers = {"Cache-Control": "no-store", "Server-Timing": `map-query;dur=${(performance.now() - started).toFixed(1)}`};
  return result.ok
    ? Response.json(result.value, {headers})
    : Response.json({error: result.error}, {status: errorStatus(result.error.code), headers});
}
