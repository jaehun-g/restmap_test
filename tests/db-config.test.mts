import test from "node:test";
import assert from "node:assert/strict";
import { databaseError, readDatabaseConfig } from "../lib/db-config.ts";

const environment = { DB_HOST: "example.invalid", DB_USER: "reader", DB_PASSWORD: "test-only-secret", DB_NAME: "test" };

test("missing DB configuration reports variable names without exposing values", () => {
  const result = readDatabaseConfig({ ...environment, DB_NAME: "", DB_HOST: " " });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error.message, /DB_NAME/);
  assert.match(result.error.message, /DB_HOST/);
  assert.ok(!result.error.message.includes(environment.DB_PASSWORD));
});

test("DB configuration defaults to port 3306 and preserves password whitespace", () => {
  const result = readDatabaseConfig({ ...environment, DB_PASSWORD: " space-sensitive " });
  if (!result.ok) assert.fail(result.error.message);
  assert.equal(result.value.port, 3306);
  assert.equal(result.value.password, " space-sensitive ");
  assert.equal(result.value.tls, false);
});

test("port accepts only an integer within the TCP range", () => {
  for (const DB_PORT of ["0", "65536", "3306.5", "3306abc", "-1"]) {
    assert.equal(readDatabaseConfig({ ...environment, DB_PORT }).ok, false);
  }
  assert.equal(readDatabaseConfig({ ...environment, DB_PORT: "3307" }).ok, true);
});

test("TLS opt-in retains certificate validation and rejects misspelled settings", () => {
  const result = readDatabaseConfig({ ...environment, DB_SSL: "true" });
  if (!result.ok) assert.fail(result.error.message);
  assert.equal(result.value.tls, true);
  assert.equal(readDatabaseConfig({ ...environment, DB_SSL: "tru" }).ok, false);
});

test("database errors give actionable categories without raw SQL or credentials", () => {
  for (const [code, expected] of [
    ["ER_ACCESS_DENIED_ERROR", "DB_ACCESS_DENIED"],
    ["ETIMEDOUT", "DB_CONNECTION_FAILED"],
    ["ER_NO_SUCH_TABLE", "DB_SCHEMA_ERROR"],
    ["OTHER", "DB_QUERY_FAILED"],
  ]) {
    const result = databaseError({ code, message: "secret password; SELECT secret FROM confidential" });
    assert.equal(result.code, expected);
    assert.ok(!result.message.includes("secret"));
    assert.ok(!result.message.includes("SELECT secret"));
  }
  const update = databaseError({ code: "OTHER", message: "secret UPDATE" }, "write");
  assert.equal(update.code, "DB_UPDATE_FAILED");
  assert.match(update.message, /UPDATE 권한/);
  assert.ok(!update.message.includes("secret"));
});
