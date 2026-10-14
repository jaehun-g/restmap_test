import type {Result} from "./rest-areas.ts";

/** Bound authenticated and anonymous JSON requests before parsing or opening a DB connection. */
export async function readJsonRequest(request: Request): Promise<Result<unknown>> {
  const fail = (message: string): Result<never> => ({
    ok: false,
    error: {code: "VALIDATION_ERROR", message},
  });
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json"
  )
    return fail("JSON 요청만 지원합니다.");
  const limit = 16 * 1024;
  if (Number(request.headers.get("content-length")) > limit)
    return fail("요청 크기가 너무 큽니다.");
  if (!request.body) return fail("요청 본문이 없습니다.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) {
        await reader.cancel();
        return fail("요청 크기가 너무 큽니다.");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return {
      ok: true,
      value: JSON.parse(new TextDecoder("utf-8", {fatal: true}).decode(bytes)),
    };
  } catch {
    return fail("JSON 형식이 올바르지 않습니다.");
  } finally {
    reader.releaseLock();
  }
}

export function errorStatus(code: string) {
  if (code === "VALIDATION_ERROR") return 400;
  if (code === "UNAUTHORIZED") return 401;
  if (code === "FORBIDDEN") return 403;
  if (code === "NOT_FOUND") return 404;
  if (code === "CONFLICT") return 409;
  if (code === "RATE_LIMITED") return 429;
  if (code === "ADMIN_NOT_CONFIGURED" || code.startsWith("DB_CONFIG")) return 503;
  return 502;
}
