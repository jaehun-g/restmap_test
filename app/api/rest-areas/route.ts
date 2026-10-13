import { connection } from "next/server";
import { queryRestAreas } from "@/lib/db";

export async function GET() {
  await connection();
  const result = await queryRestAreas();
  const headers = { "Cache-Control": "no-store" };
  if (!result.ok) {
    const status = result.error.code.startsWith("DB_CONFIG") ? 503 : 502;
    return Response.json({ error: result.error }, { status, headers });
  }
  return Response.json(result.value, { headers });
}
