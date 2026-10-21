import {connection} from "next/server";
import {queryFoodMenus} from "@/lib/db";
import {errorStatus} from "@/lib/api-request";

export async function GET(_request: Request, {params}: {params: Promise<{id: string}>}) {
  await connection();
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0)
    return Response.json({error: {code: "VALIDATION_ERROR", message: "휴게소 ID가 올바르지 않습니다."}}, {status: 400, headers: {"Cache-Control": "no-store"}});
  const result = await queryFoodMenus(id);
  return result.ok
    ? Response.json(result.value, {headers: {"Cache-Control": "no-store"}})
    : Response.json({error: result.error}, {status: errorStatus(result.error.code), headers: {"Cache-Control": "no-store"}});
}
