import {connection} from "next/server";
import {syncExStationPrices} from "@/lib/db";

export const maxDuration = 60;

const headers = {"Cache-Control": "no-store"};

export async function GET(request: Request) {
  await connection();
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return Response.json({error: "Unauthorized"}, {status: 401, headers});
  const result = await syncExStationPrices();
  if (!result.ok) {
    console.error("EX station price cron failed", result.error);
    return Response.json({error: result.error}, {status: result.error.code === "CONFLICT" ? 409 : 502, headers});
  }
  console.info("EX station price cron completed", result.value);
  return Response.json(result.value, {headers});
}
