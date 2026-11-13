import {connection} from "next/server";
import {errorStatus} from "@/lib/api-request";
import {fetchDrivingRoutes, parseDirectionsQuery} from "@/lib/directions";

export async function GET(request: Request) {
  await connection();
  const headers = {"Cache-Control": "no-store"};
  const parsed = parseDirectionsQuery(new URL(request.url).searchParams);
  if (!parsed.ok) {
    return Response.json({error: parsed.error}, {status: 400, headers});
  }
  const result = await fetchDrivingRoutes(parsed.value.origin, parsed.value.destination);
  if (!result.ok) {
    const status =
      result.error.code === "CONFIG_ERROR" ? 503 : errorStatus(result.error.code);
    return Response.json({error: result.error}, {status, headers});
  }
  return Response.json(
    {route: result.value[0] ?? null, routes: result.value},
    {headers},
  );
}
