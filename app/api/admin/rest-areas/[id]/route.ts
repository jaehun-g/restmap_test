import { adminSessions, sameOrigin, sessionCookie } from "@/lib/admin-auth";
import { readJsonRequest, errorStatus } from "@/lib/api-request";
import { validateUpdateRequest } from "@/lib/rest-area-validation";
import { updateRestArea } from "@/lib/db";

const headers = { "Cache-Control": "no-store" };
const denied = (code: string, message: string) =>
  Response.json({ error: { code, message } }, { status: errorStatus(code), headers });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request.url, request.headers.get("origin"), request.headers.get("host")))
    return denied("FORBIDDEN", "동일 출처에서만 저장할 수 있습니다.");
  if (!process.env.ADMIN_PASSWORD)
    return denied("ADMIN_NOT_CONFIGURED", "ADMIN_PASSWORD가 설정되지 않아 조회만 가능합니다.");
  if (
    !adminSessions().verify(
      sessionCookie(request.headers.get("cookie")),
      process.env.ADMIN_PASSWORD,
    )
  )
    return denied(
      "UNAUTHORIZED",
      "관리자 인증이 필요하거나 세션이 만료되었습니다. 입력 초안은 유지됩니다.",
    );
  const { id } = await context.params;
  if (
    !/^\d+$/.test(id) ||
    !Number.isSafeInteger(Number(id)) ||
    Number(id) < 1 ||
    Number(id) > 2147483647
  )
    return denied("VALIDATION_ERROR", "휴게소 ID가 올바르지 않습니다.");
  const body = await readJsonRequest(request);
  if (!body.ok) return denied(body.error.code, body.error.message);
  const validated = validateUpdateRequest(body.value);
  if (!validated.ok) return denied(validated.error.code, validated.error.message);
  const result = await updateRestArea(Number(id), validated.value);
  if (!result.ok) return denied(result.error.code, result.error.message);
  return Response.json({ item: result.value }, { headers });
}
