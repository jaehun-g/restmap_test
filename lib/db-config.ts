import type { Result } from "./rest-areas.ts";

export type DatabaseConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  tls: boolean;
};

export function readDatabaseConfig(
  environment: Record<string, string | undefined>,
): Result<DatabaseConfig> {
  const missing = ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"].filter(
    (key) =>
      key === "DB_PASSWORD" ? !environment[key] : !environment[key]?.trim(),
  );
  if (missing.length)
    return {
      ok: false,
      error: {
        code: "DB_CONFIG_MISSING",
        message: `.env.local에 ${missing.join(", ")}을 설정해주세요.`,
      },
    };
  const portText = environment.DB_PORT || "3306";
  const port = Number(portText);
  if (
    !/^\d+$/.test(portText) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    return {
      ok: false,
      error: {
        code: "DB_CONFIG_INVALID",
        message: "DB_PORT는 1~65535 사이의 정수여야 합니다.",
      },
    };
  }
  if (environment.DB_SSL && !["true", "false"].includes(environment.DB_SSL)) {
    return {
      ok: false,
      error: {
        code: "DB_CONFIG_INVALID",
        message: "DB_SSL은 true 또는 false로 설정해주세요.",
      },
    };
  }
  return {
    ok: true,
    value: {
      host: environment.DB_HOST!.trim(),
      user: environment.DB_USER!.trim(),
      password: environment.DB_PASSWORD!,
      database: environment.DB_NAME!.trim(),
      port,
      tls: environment.DB_SSL === "true",
    },
  };
}

export function databaseError(
  error: unknown,
  operation: "read" | "write" = "read",
): {
  code: string;
  message: string;
} {
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
  if (["ER_ACCESS_DENIED_ERROR", "ER_DBACCESS_DENIED_ERROR"].includes(code)) {
    return {
      code: "DB_ACCESS_DENIED",
      message:
        operation === "write"
          ? "DB 인증 또는 저장 권한을 확인해주세요. DB_USER, DB_PASSWORD와 DB_NAME 설정을 점검해주세요. 입력 초안은 유지됩니다."
          : "DB 인증 또는 조회 권한을 확인해주세요. DB_USER, DB_PASSWORD와 DB_NAME 설정을 점검해주세요.",
    };
  }
  if (
    [
      "ETIMEDOUT",
      "ECONNREFUSED",
      "ENOTFOUND",
      "EHOSTUNREACH",
      "PROTOCOL_SEQUENCE_TIMEOUT",
    ].includes(code)
  ) {
    return {
      code: "DB_CONNECTION_FAILED",
      message:
        "DB에 연결하지 못했습니다. 호스트·포트와 Cafe24 MySQL 외부 IP 허용 설정을 확인해주세요.",
    };
  }
  if (
    ["ER_NO_SUCH_TABLE", "ER_BAD_FIELD_ERROR", "ER_BAD_DB_ERROR"].includes(code)
  ) {
    return {
      code: "DB_SCHEMA_ERROR",
      message: "DB_NAME과 test_lounge 테이블 및 컬럼 구성을 확인해주세요.",
    };
  }
  return {
    code: operation === "write" ? "DB_UPDATE_FAILED" : "DB_QUERY_FAILED",
    message:
      operation === "write"
        ? "변경사항을 저장하지 못했습니다. DB 연결 상태와 test_lounge UPDATE 권한을 확인해주세요. 입력 초안은 유지됩니다."
        : "휴게소를 조회하지 못했습니다. DB 연결 상태와 SELECT 권한을 확인한 뒤 다시 시도해주세요.",
  };
}
