import type {Result} from "./rest-areas.ts";

export type DatabaseConfig = {connectionString: string};

export function readDatabaseConfig(
  environment: Record<string, string | undefined>,
): Result<DatabaseConfig> {
  const connectionString = environment.DATABASE_URL?.trim();
  if (!connectionString)
    return {ok: false, error: {code: "DB_CONFIG_MISSING", message: ".env.local에 DATABASE_URL을 설정해주세요."}};
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    return {ok: false, error: {code: "DB_CONFIG_INVALID", message: "DATABASE_URL은 올바른 PostgreSQL 연결 문자열이어야 합니다."}};
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    return {ok: false, error: {code: "DB_CONFIG_INVALID", message: "DATABASE_URL은 postgres:// 또는 postgresql://로 시작해야 합니다."}};
  return {ok: true, value: {connectionString}};
}

export function databaseError(
  error: unknown,
  operation: "read" | "write" = "read",
): {code: string; message: string} {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (["28P01", "28000"].includes(code))
    return {code: "DB_ACCESS_DENIED", message: operation === "write" ? "DB 인증 또는 저장 권한을 확인해주세요. DATABASE_URL과 Supabase 권한을 점검해주세요. 입력 초안은 유지됩니다." : "DB 인증 또는 조회 권한을 확인해주세요. DATABASE_URL과 Supabase 권한을 점검해주세요."};
  if (["ETIMEDOUT", "ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH", "57P01"].includes(code))
    return {code: "DB_CONNECTION_FAILED", message: "DB에 연결하지 못했습니다. Supabase Transaction Pooler 연결 문자열과 네트워크 설정을 확인해주세요."};
  if (["42P01", "42703", "3D000"].includes(code))
    return {code: "DB_SCHEMA_ERROR", message: "Supabase public 스키마와 필요한 테이블 및 컬럼 구성을 확인해주세요."};
  return {
    code: operation === "write" ? "DB_UPDATE_FAILED" : "DB_QUERY_FAILED",
    message: operation === "write" ? "변경사항을 저장하지 못했습니다. Supabase 연결 상태와 UPDATE 권한을 확인해주세요. 입력 초안은 유지됩니다." : "데이터를 조회하지 못했습니다. Supabase 연결 상태와 SELECT 권한을 확인한 뒤 다시 시도해주세요.",
  };
}
