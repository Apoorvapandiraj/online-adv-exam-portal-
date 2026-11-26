const fs = require("node:fs/promises");
const path = require("node:path");

const TABLE = "exam_portal_state";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function validateState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new Error("Persisted application state must be a JSON object.");
  }
  return state;
}

async function readFileState(filePath, defaultState) {
  try {
    const contents = await fs.readFile(filePath, "utf8");
    return { state: validateState(JSON.parse(contents)), needsSave: false };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { state: clone(defaultState), needsSave: true };
  }
}

function createStorage({ filePath, databaseUrl, Pool: PoolConstructor } = {}) {
  let pool = null;
  let initialized = false;
  let writeQueue = Promise.resolve();

  async function persist(serializedState) {
    if (pool) {
      await pool.query(
        `INSERT INTO ${TABLE} (id, state) VALUES (1, $1::jsonb)
         ON CONFLICT (id) DO UPDATE
         SET state = EXCLUDED.state, updated_at = CURRENT_TIMESTAMP`,
        [serializedState]
      );
      return;
    }

    const temporaryFile = `${filePath}.tmp.${process.pid}`;
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(temporaryFile, serializedState);
    await fs.rename(temporaryFile, filePath);
  }

  async function initialize(defaultState) {
    if (initialized) throw new Error("Storage has already been initialized.");

    if (databaseUrl) {
      const Pool = PoolConstructor || require("pg").Pool;
      pool = new Pool({ connectionString: databaseUrl });
      await pool.query(
        `CREATE TABLE IF NOT EXISTS ${TABLE} (
          id smallint PRIMARY KEY CHECK (id = 1),
          state jsonb NOT NULL,
          updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`
      );
      const result = await pool.query(`SELECT state FROM ${TABLE} WHERE id = 1`);
      if (result.rows.length) {
        let state = result.rows[0].state;
        if (typeof state === "string") state = JSON.parse(state);
        initialized = true;
        return { state: validateState(state), needsSave: false };
      }

      const localState = await readFileState(filePath, defaultState);
      await persist(JSON.stringify(localState.state));
      initialized = true;
      return { state: localState.state, needsSave: false };
    }

    const localState = await readFileState(filePath, defaultState);
    initialized = true;
    return localState;
  }

  function save(state) {
    if (!initialized) return Promise.reject(new Error("Storage is not initialized."));
    const serializedState = JSON.stringify(state);
    const pendingWrite = writeQueue.then(() => persist(serializedState));
    writeQueue = pendingWrite.catch(() => {});
    return pendingWrite;
  }

  async function close() {
    await writeQueue;
    if (pool) await pool.end();
  }

  return { initialize, save, close };
}

module.exports = { createStorage };
