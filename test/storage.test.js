const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createStorage } = require("../storage");

async function temporaryDirectory(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "exam-portal-storage-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

test("JSON storage loads defaults and persists state across restarts", async t => {
  const directory = await temporaryDirectory(t);
  const filePath = path.join(directory, "data.json");
  const defaults = { users: {}, tests: {} };

  const first = createStorage({ filePath });
  const loaded = await first.initialize(defaults);
  assert.deepEqual(loaded, { state: defaults, needsSave: true });

  const savedState = { users: { teacher: { id: "teacher" } }, tests: {} };
  await first.save(savedState);
  await first.close();

  const second = createStorage({ filePath });
  assert.deepEqual(await second.initialize(defaults), { state: savedState, needsSave: false });
  await second.close();
});

test("PostgreSQL storage initializes and reloads the persistent state", async () => {
  let databaseState = null;
  class FakePool {
    constructor(options) {
      assert.equal(options.connectionString, "postgres://test");
    }

    async query(sql, parameters = []) {
      if (sql.startsWith("CREATE TABLE")) return { rows: [] };
      if (sql.startsWith("SELECT")) {
        return { rows: databaseState ? [{ state: structuredClone(databaseState) }] : [] };
      }
      if (sql.startsWith("INSERT")) {
        databaseState = JSON.parse(parameters[0]);
        return { rows: [] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    }

    async end() {}
  }

  const options = { filePath: "/unused/data.json", databaseUrl: "postgres://test", Pool: FakePool };
  const defaults = { users: {}, tests: {} };
  const first = createStorage(options);
  assert.deepEqual(await first.initialize(defaults), { state: defaults, needsSave: false });
  const savedState = { users: { teacher: { id: "teacher" } }, tests: {} };
  await first.save(savedState);
  await first.close();

  const second = createStorage(options);
  assert.deepEqual(await second.initialize(defaults), { state: savedState, needsSave: false });
  await second.close();
});
