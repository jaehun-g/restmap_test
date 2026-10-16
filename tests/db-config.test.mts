import test from "node:test";
import assert from "node:assert/strict";
import {databaseError, readDatabaseConfig} from "../lib/db-config.ts";

const environment = {DATABASE_URL: "postgresql://postgres:secret@pooler.supabase.com:6543/postgres?sslmode=require"};

test("DATABASE_URL is required without exposing credentials", () => {
  const result = readDatabaseConfig({});
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error.message, /DATABASE_URL/);
  assert.ok(!result.error.message.includes("secret"));
});
test("only PostgreSQL connection strings are accepted", () => {
  const result = readDatabaseConfig(environment);
  assert.ok(result.ok);
  if (result.ok) assert.equal(result.value.connectionString, environment.DATABASE_URL);
  assert.equal(readDatabaseConfig({DATABASE_URL: "mysql://user:secret@example.com/db"}).ok, false);
  assert.equal(readDatabaseConfig({DATABASE_URL: "not a URL"}).ok, false);
});
test("PostgreSQL errors are categorized without leaking raw errors", () => {
  for (const [code, expected] of [["28P01", "DB_ACCESS_DENIED"], ["ETIMEDOUT", "DB_CONNECTION_FAILED"], ["42P01", "DB_SCHEMA_ERROR"], ["OTHER", "DB_QUERY_FAILED"]]) {
    const result = databaseError({code, message: "secret SELECT"});
    assert.equal(result.code, expected);
    assert.ok(!result.message.includes("secret"));
  }
});
