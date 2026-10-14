import { connection } from "next/server";
import { queryGasStation } from "@/lib/db";
import { errorStatus } from "@/lib/api-request";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await context.params;
  const headers = { "Cache-Control": "no-store" };
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) < 1 || Number(id) > 2147483647)
    return Response.json({ error: { code: "VALIDATION_ERROR", message: "주유소 ID가 올바르지 않습니다." } }, { status: 400, headers });
  const result = await queryGasStation(Number(id));
  return result.ok ? Response.json({ item: result.value }, { headers }) : Response.json({ error: result.error }, { status: errorStatus(result.error.code), headers });
}
