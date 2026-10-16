import {connection, NextResponse} from "next/server";
import {errorStatus} from "@/lib/api-request";
import {adminSessions, sameOrigin, sessionCookie} from "@/lib/admin-auth";
import {syncExStationStatuses} from "@/lib/db";
import {exStationSyncLock} from "@/lib/ex-station-sync-lock";

const headers = {"Cache-Control": "no-store"};

function responseError(code: string, message: string, status = errorStatus(code)) {
  return NextResponse.json({error: {code, message}}, {status, headers});
}

function syncErrorStatus(code: string) {
  return code.endsWith("_MISSING") || code.startsWith("DB_CONFIG") ? 503 : errorStatus(code);
}

export async function POST(request: Request) {
  await connection();
  if (!sameOrigin(request.url, request.headers.get("origin"), request.headers.get("host")))
    return responseError("FORBIDDEN", "동일 출처에서만 EX 주유소 동기화를 실행할 수 있습니다.");
  if (!process.env.ADMIN_PASSWORD)
    return responseError("ADMIN_NOT_CONFIGURED", "ADMIN_PASSWORD를 설정하면 EX 주유소 동기화를 실행할 수 있습니다.");
  const token = sessionCookie(request.headers.get("cookie"));
  if (!adminSessions().verify(token, process.env.ADMIN_PASSWORD))
    return responseError("UNAUTHORIZED", "관리자 인증이 필요합니다.");
  const lock = exStationSyncLock();
  if (!lock.acquire())
    return responseError("CONFLICT", "EX 주유소 동기화가 이미 실행 중입니다.");

  try {
    const result = await syncExStationStatuses();
    return result.ok
      ? NextResponse.json(result.value, {headers})
      : responseError(result.error.code, result.error.message, syncErrorStatus(result.error.code));
  } finally {
    lock.release();
  }
}
