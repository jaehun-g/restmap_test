import {connection, NextResponse} from "next/server";
import {errorStatus} from "@/lib/api-request";
import {adminSessions, sameOrigin, sessionCookie} from "@/lib/admin-auth";
import {syncFoodMenuSnapshot} from "@/lib/db";

const headers = {"Cache-Control": "no-store"};

export async function POST(request: Request) {
  await connection();
  if (!sameOrigin(request.url, request.headers.get("origin"), request.headers.get("host")))
    return NextResponse.json({error: {code: "FORBIDDEN", message: "동기화 요청 출처가 올바르지 않습니다."}}, {status: 403, headers});
  if (!process.env.ADMIN_PASSWORD)
    return NextResponse.json({error: {code: "ADMIN_NOT_CONFIGURED", message: "관리자 인증이 설정되지 않았습니다."}}, {status: 503, headers});
  const token = sessionCookie(request.headers.get("cookie"));
  if (!adminSessions().verify(token, process.env.ADMIN_PASSWORD))
    return NextResponse.json({error: {code: "UNAUTHORIZED", message: "관리자 인증이 필요합니다."}}, {status: 401, headers});
  const result = await syncFoodMenuSnapshot();
  return result.ok
    ? NextResponse.json(result.value, {headers})
    : NextResponse.json({error: result.error}, {status: errorStatus(result.error.code), headers});
}
