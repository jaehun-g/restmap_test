import { connection } from "next/server";
import { queryGasStations } from "@/lib/db";
import { parseStationQuery } from "@/lib/gas-station-query";
import { errorStatus } from "@/lib/api-request";

export async function GET(request: Request) {
  await connection();
  const query = parseStationQuery(new URL(request.url).searchParams);
  const result = query.ok ? await queryGasStations(query.value) : query;
  const headers = { "Cache-Control": "no-store" };
  return result.ok
    ? Response.json(result.value, { headers })
    : Response.json({ error: result.error }, { status: errorStatus(result.error.code), headers });
}
