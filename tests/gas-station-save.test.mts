import test from "node:test";
import assert from "node:assert/strict";
import { saveGasStation } from "../lib/gas-station-save.ts";
import { stationRevision } from "../lib/gas-station-revision.ts";
import { validateStationUpdate } from "../lib/gas-station-validation.ts";
import type { SaveConnection } from "../lib/rest-area-save.ts";
import type { StationChanges } from "../lib/gas-stations.ts";

function setup(failure?: "update" | "commit" | "rollback") {
  const row: Record<string, unknown> = {
    id: 17,
    siteCd: "001234",
    siteNm: Buffer.from("GS 주유소"),
    lat: "37.1234567891",
    longi: "127.1234567891",
    cargoYn: Buffer.from("Y"),
  };
  const calls: { sql: string; values: unknown[] }[] = [];
  const state = { committed: 0, rolledBack: 0, released: 0, destroyed: 0 };
  const connection: SaveConnection = {
    async beginTransaction() {},
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.startsWith("UPDATE")) {
        if (failure === "update" || failure === "rollback") throw new Error("write failed");
        const columns = [...sql.matchAll(/`(\w+)` = \?/g)].map((match) => match[1]);
        columns.forEach((column, index) => {
          row[column] = values[index];
        });
        return [{ affectedRows: 1 }, []];
      }
      return [[{ ...row }], []];
    },
    async commit() {
      if (failure === "commit") throw new Error("commit failed");
      state.committed++;
    },
    async rollback() {
      state.rolledBack++;
      if (failure === "rollback") throw new Error("rollback failed");
    },
    release() {
      state.released++;
    },
    destroy() {
      state.destroyed++;
    },
  };
  const request = (changes: StationChanges) => {
    const parsed = validateStationUpdate({ changes, expectedRevision: stationRevision(row) });
    assert.ok(parsed.ok);
    return parsed.value;
  };
  return { connection, row, calls, state, request };
}

test("station save binds names and Y/N/NULL flags and never changes identity or readonly columns", async () => {
  const mock = setup();
  const name = "GS ' 주유소; DROP TABLE test_lounge; --";
  const result = await saveGasStation(
    mock.connection,
    17,
    mock.request({ name, services: { cargo: false, convenience: null } }),
  );
  assert.ok(result.ok);
  assert.equal(result.value.name, name);
  assert.equal(result.value.siteCode, "001234");
  assert.equal(result.value.services.cargo, false);
  const update = mock.calls.find((call) => call.sql.startsWith("UPDATE"));
  assert.ok(update);
  assert.equal(update.sql, "UPDATE test_gscargo SET `siteNm` = ?, `cargoYn` = ? WHERE id = ?");
  assert.deepEqual(update.values, [name, "N", 17]);
  assert.equal(mock.state.committed, 1);
  assert.equal(mock.state.rolledBack, 0);
  assert.equal(mock.state.released, 1);
  assert.match(result.value.revision, /^[a-f0-9]{64}$/);
});
test("revision conflicts and partial coordinates roll back without an UPDATE", async () => {
  for (const conflict of [true, false]) {
    const mock = setup();
    const request = mock.request(conflict ? { name: "수정" } : { latitude: null });
    if (conflict) request.expectedRevision = "0".repeat(64);
    const result = await saveGasStation(mock.connection, 17, request);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, conflict ? "CONFLICT" : "VALIDATION_ERROR");
    assert.ok(mock.calls.every((call) => !call.sql.startsWith("UPDATE")));
    assert.equal(mock.state.rolledBack, 1);
    assert.equal(mock.state.committed, 0);
    assert.equal(mock.state.released, 1);
  }
});
test("unchanged station edits commit without writes and invalid IDs never start a transaction", async () => {
  const mock = setup();
  const request = mock.request({ name: "GS 주유소" });
  assert.equal((await saveGasStation(mock.connection, 17, request)).ok, true);
  assert.ok(mock.calls.every((call) => !call.sql.startsWith("UPDATE")));
  assert.equal(mock.state.committed, 1);
  const other = setup();
  assert.equal(
    (await saveGasStation(other.connection, 0, other.request({ name: "수정" }))).ok,
    false,
  );
  assert.equal(other.calls.length, 0);
  assert.equal(other.state.released, 1);
});
test("station write and commit failures roll back; a failed rollback destroys the connection", async () => {
  for (const failure of ["update", "commit", "rollback"] as const) {
    const mock = setup(failure);
    assert.equal(
      (await saveGasStation(mock.connection, 17, mock.request({ name: "수정" }))).ok,
      false,
    );
    assert.equal(mock.state.rolledBack, 1);
    assert.equal(mock.state.committed, 0);
    assert.equal(mock.state.destroyed, failure === "rollback" ? 1 : 0);
    assert.equal(mock.state.released, failure === "rollback" ? 0 : 1);
  }
});
