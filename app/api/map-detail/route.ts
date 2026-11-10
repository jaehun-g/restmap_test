import {connection} from "next/server";
import {queryMobileDetail} from "@/lib/db";
import {errorStatus} from "@/lib/api-request";

export async function GET(request: Request) {
  await connection();
  const params = new URL(request.url).searchParams;
  const kind = params.get("kind");
  const raw = params.get("id") ?? "";
  const id = Number(raw);
  if ((kind !== "rest" && kind !== "station") || !/^\d+$/.test(raw) || !Number.isSafeInteger(id) || id < 1 || id > 2147483647)
    return Response.json({error: {message: "잘못된 요청입니다."}}, {status: 400});
  const result = await queryMobileDetail(kind, id);
  return result.ok
    ? Response.json({item: result.value}, {headers: {"Cache-Control": "no-store"}})
    : Response.json({error: result.error}, {status: errorStatus(result.error.code), headers: {"Cache-Control": "no-store"}});
}
