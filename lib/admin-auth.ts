import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Result } from "./rest-areas.ts";

export const ADMIN_COOKIE = "rest_area_admin";
export const SESSION_SECONDS = 8 * 60 * 60;
const WINDOW_MS = 5 * 60 * 1000;
const digest = (password: string) =>
  createHash("sha256").update(password).digest();

export class AdminSessionStore {
  private sessions = new Map<
    string,
    { expiresAt: number; fingerprint: string }
  >();
  private failures = 0;
  private windowStart = 0;
  private now: () => number;
  private token: () => string;
  constructor(
    now: () => number = Date.now,
    token: () => string = () => randomBytes(32).toString("base64url"),
  ) {
    this.now = now;
    this.token = token;
  }

  login(
    input: unknown,
    password: string | undefined,
  ): Result<{ token: string; expiresAt: number }> {
    if (!password)
      return {
        ok: false,
        error: {
          code: "ADMIN_NOT_CONFIGURED",
          message: "ADMIN_PASSWORD를 설정하면 편집 기능을 사용할 수 있습니다.",
        },
      };
    const now = this.now();
    if (now - this.windowStart >= WINDOW_MS) {
      this.failures = 0;
      this.windowStart = now;
    }
    if (this.failures >= 5)
      return {
        ok: false,
        error: {
          code: "RATE_LIMITED",
          message: "인증 시도가 너무 많습니다. 5분 후 다시 시도해주세요.",
        },
      };
    if (
      typeof input !== "string" ||
      !timingSafeEqual(digest(input), digest(password))
    ) {
      if (!this.failures) this.windowStart = now;
      this.failures++;
      return {
        ok: false,
        error: { code: "UNAUTHORIZED", message: "관리자 암호를 확인해주세요." },
      };
    }
    this.failures = 0;
    for (const [token, session] of this.sessions)
      if (session.expiresAt <= now) this.sessions.delete(token);
    while (this.sessions.size >= 50)
      this.sessions.delete(this.sessions.keys().next().value!);
    const token = this.token();
    const expiresAt = now + SESSION_SECONDS * 1000;
    this.sessions.set(token, {
      expiresAt,
      fingerprint: digest(password).toString("hex"),
    });
    return { ok: true, value: { token, expiresAt } };
  }

  verify(token: string | null, password: string | undefined): number | null {
    const session = token ? this.sessions.get(token) : undefined;
    if (!session || !password) return null;
    if (
      session.expiresAt <= this.now() ||
      session.fingerprint !== digest(password).toString("hex")
    ) {
      this.sessions.delete(token!);
      return null;
    }
    return session.expiresAt;
  }
  logout(token: string | null) {
    if (token) this.sessions.delete(token);
  }
}

export function sameOrigin(
  requestUrl: string,
  origin: string | null,
  host?: string | null,
): boolean {
  if (!origin) return false;
  try {
    let target = new URL(requestUrl);
    // Next's request URL can contain the bind address; Host retains the browser's LAN address.
    if (host) {
      if (/[\s/\\?#@]/.test(host)) return false;
      target = new URL(`${target.protocol}//${host}`);
    }
    return origin === target.origin && origin === new URL(origin).origin;
  } catch {
    return false;
  }
}

export function sessionCookie(header: string | null): string | null {
  const value = header
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ADMIN_COOKIE}=`))
    ?.slice(ADMIN_COOKIE.length + 1);
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

const sessionGlobal = globalThis as typeof globalThis & {
  restAreaAdminSessions?: AdminSessionStore;
};
export function adminSessions() {
  return (sessionGlobal.restAreaAdminSessions ??= new AdminSessionStore());
}
