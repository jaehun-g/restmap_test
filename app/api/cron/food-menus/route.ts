import {connection} from "next/server";
import {syncFoodMenuSnapshot} from "@/lib/db";

export async function GET(request: Request) {
  await connection();
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return Response.json({error: "Unauthorized"}, {status: 401, headers: {"Cache-Control": "no-store"}});
  const result = await syncFoodMenuSnapshot();
  return result.ok
    ? Response.json(result.value, {headers: {"Cache-Control": "no-store"}})
    : Response.json({error: result.error}, {status: 502, headers: {"Cache-Control": "no-store"}});
}
