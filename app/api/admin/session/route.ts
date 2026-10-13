import { connection, NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  SESSION_SECONDS,
  adminSessions,
  sameOrigin,
  sessionCookie,
} from "@/lib/admin-auth";
import { errorStatus, readJsonRequest } from "@/lib/api-request";

const headers = { "Cache-Control": "no-store" };
export async function GET(request: Request) {
  await connection();
  const expiresAt = adminSessions().verify(
    sessionCookie(request.headers.get("cookie")),
    process.env.ADMIN_PASSWORD,
  );
  return NextResponse.json(
    {
      configured: Boolean(process.env.ADMIN_PASSWORD),
      authenticated: expiresAt !== null,
      expiresAt,
    },
    { headers },
  );
}

export async function POST(request: Request) {
  if (
    !sameOrigin(
      request.url,
      request.headers.get("origin"),
      request.headers.get("host"),
    )
  )
    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message: "동일 출처에서만 인증할 수 있습니다.",
        },
      },
      { status: 403, headers },
    );
  const body = await readJsonRequest(request);
  if (!body.ok)
    return NextResponse.json({ error: body.error }, { status: 400, headers });
  const input =
    body.value && typeof body.value === "object" && "password" in body.value
      ? body.value.password
      : undefined;
  const result = adminSessions().login(input, process.env.ADMIN_PASSWORD);
  if (!result.ok)
    return NextResponse.json(
      { error: result.error },
      { status: errorStatus(result.error.code), headers },
    );
  const response = NextResponse.json(
    {
      authenticated: true,
      configured: true,
      expiresAt: result.value.expiresAt,
    },
    { headers },
  );
  response.cookies.set(ADMIN_COOKIE, result.value.token, {
    httpOnly: true,
    sameSite: "strict",
    secure: new URL(request.url).protocol === "https:",
    path: "/api/admin",
    maxAge: SESSION_SECONDS,
  });
  return response;
}

export async function DELETE(request: Request) {
  if (
    !sameOrigin(
      request.url,
      request.headers.get("origin"),
      request.headers.get("host"),
    )
  )
    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message: "동일 출처에서만 로그아웃할 수 있습니다.",
        },
      },
      { status: 403, headers },
    );
  adminSessions().logout(sessionCookie(request.headers.get("cookie")));
  const response = NextResponse.json({ authenticated: false }, { headers });
  response.cookies.set(ADMIN_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: new URL(request.url).protocol === "https:",
    path: "/api/admin",
    maxAge: 0,
  });
  return response;
}
