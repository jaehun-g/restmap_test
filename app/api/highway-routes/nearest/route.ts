import {connection} from "next/server";
import {errorStatus} from "@/lib/api-request";
import {queryNearestHighwayRoute} from "@/lib/db";
import {isGeoPoint} from "@/lib/geo-search";

export async function POST(request: Request) {
  await connection();
  const headers = {"Cache-Control": "no-store"};
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      {error: {code: "VALIDATION_ERROR", message: "위치를 확인해주세요."}},
      {status: 400, headers},
    );
  }
  if (
    !body ||
    typeof body !== "object" ||
    !isGeoPoint(body as {latitude: number; longitude: number})
  )
    return Response.json(
      {error: {code: "VALIDATION_ERROR", message: "위치를 확인해주세요."}},
      {status: 400, headers},
    );
  const result = await queryNearestHighwayRoute(body as {latitude: number; longitude: number});
  return result.ok
    ? Response.json({routeName: result.value}, {headers})
    : Response.json({error: result.error}, {status: errorStatus(result.error.code), headers});
}
