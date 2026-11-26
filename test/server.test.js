const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const fs = require("node:fs/promises");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

async function findPort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => {
    listener.listen(0, "127.0.0.1", error => error ? reject(error) : resolve());
  });
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  return port;
}

async function startServer(dataFile) {
  const port = await findPort();
  const child = spawn(process.execPath, ["server.js"], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      PORT: String(port),
      DATA_FILE: dataFile,
      DATABASE_URL: "",
      NODE_ENV: "production",
      TEACHER_PASSWORD: "teacher-test-password",
      ADMIN_ID: "smoke-admin",
      ADMIN_PASSWORD: "admin-test-password"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let output = "";
  const capture = chunk => {
    output += chunk.toString();
  };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Server did not start: ${output}`)), 10000);
      const fail = error => {
        clearTimeout(timer);
        reject(error);
      };
      child.once("error", fail);
      child.once("exit", (code, signal) => {
        fail(new Error(`Server exited before startup (${code ?? signal}): ${output}`));
      });
      child.stdout.on("data", () => {
        if (output.includes("Exam Portal running")) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
  } catch (error) {
    if (child.exitCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGTERM");
      await exited;
    }
    throw error;
  }

  return { child, baseUrl: `http://127.0.0.1:${port}` };
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  const [code] = await exited;
  assert.equal(code, 0);
}

test("production server serves pages and retains created users after restart", async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "exam-portal-server-"));
  const dataFile = path.join(directory, "state.json");
  let running;

  t.after(async () => {
    if (running) await stopServer(running.child);
    await fs.rm(directory, { recursive: true, force: true });
  });

  running = await startServer(dataFile);
  assert.equal((await fetch(`${running.baseUrl}/teacher`)).status, 200);
  assert.equal((await fetch(`${running.baseUrl}/admin`)).status, 200);
  assert.equal((await fetch(`${running.baseUrl}/api/me`)).status, 401);

  const login = await fetch(`${running.baseUrl}/api/admin-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "smoke-admin", password: "admin-test-password" })
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const created = await fetch(`${running.baseUrl}/api/users`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      id: "smoke-user",
      name: "Smoke User",
      role: "teacher",
      password: "user-test-password"
    })
  });
  assert.equal(created.status, 200);
  await stopServer(running.child);
  running = null;

  running = await startServer(dataFile);
  const relogin = await fetch(`${running.baseUrl}/api/admin-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "smoke-admin", password: "admin-test-password" })
  });
  assert.equal(relogin.status, 200);
  const reloginCookie = relogin.headers.get("set-cookie").split(";")[0];
  const users = await fetch(`${running.baseUrl}/api/users`, { headers: { cookie: reloginCookie } });
  assert.equal(users.status, 200);
  assert.ok((await users.json()).some(user => user.id === "smoke-user"));
  await stopServer(running.child);
  running = null;
});
