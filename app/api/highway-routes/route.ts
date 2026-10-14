import {connection} from "next/server";
import {queryHighwayRoute} from "@/lib/db";
import {validateHighwayRouteName} from "@/lib/highway-routes";
import {errorStatus} from "@/lib/api-request";

export async function GET(request: Request) {
  await connection();
  const headers = {"Cache-Control": "no-store"};
  const name = validateHighwayRouteName(new URL(request.url).searchParams.get("routeName"));
  if (!name.ok) return Response.json({error: name.error}, {status: 400, headers});
  const result = await queryHighwayRoute(name.value);
  if (!result.ok)
    return Response.json({error: result.error}, {status: errorStatus(result.error.code), headers});
  return Response.json({route: result.value}, {headers});
}
