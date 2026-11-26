const express = require("express"), path = require("path"), os = require("os"), crypto = require("crypto");
const { createStorage } = require("./storage");
const PORT = process.env.PORT || 3000;
const PASS = process.env.TEACHER_PASSWORD || "teacher123";
const FILE = process.env.DATA_FILE || path.join(__dirname, "data.json");
const storage = createStorage({ filePath: FILE, databaseUrl: process.env.DATABASE_URL });
const missingProductionEnv = ["TEACHER_PASSWORD", "ADMIN_ID", "ADMIN_PASSWORD"]
  .filter(name => !process.env[name]);
if (process.env.NODE_ENV === "production" && missingProductionEnv.length) {
  throw new Error("Production startup is missing required environment variables: " + missingProductionEnv.join(", ") + ".");
}
// ---- data model (additive migration; no existing field renamed or removed) ----
const DEFAULTS = {
  classes: {},
  tests: {},
  attempts: {},
  subs: {},
  users: {},           // { id: { id, name, role, hash, salt, permissions: [], active: true, at } }
  settings: { unlockCode: "1234" }
};
let D = Object.assign({}, DEFAULTS);
function ensureDefaults() {
  for (const k of Object.keys(DEFAULTS)) if (D[k] === undefined) D[k] = DEFAULTS[k];
  if (!D.settings || typeof D.settings !== "object") D.settings = {};
  if (D.settings.unlockCode == null) D.settings.unlockCode = "1234";
  if (!D.users || typeof D.users !== "object") D.users = {};
  // classes: additive restricted flag; keep every existing key
  for (const cid of Object.keys(D.classes)) {
    const c = D.classes[cid];
    if (!Array.isArray(c.st)) c.st = [];
    if (c.restricted === undefined) c.restricted = c.st.length > 0; // has students -> restricted
  }
  // tests: ensure array fields exist (additive)
  for (const tid of Object.keys(D.tests)) {
    const t = D.tests[tid];
    if (!Array.isArray(t.rl)) t.rl = [];
    if (!Array.isArray(t.qs)) t.qs = [];
  }
}
// ---- scrypt password hashing (salt stored with hash; never returned in responses) ----
const hashPassword = (password) => new Promise((resolve, reject) => {
  const salt = crypto.randomBytes(16).toString("hex");
  crypto.scrypt(password, salt, 64, (err, derivedKey) => {
    if (err) return reject(err);
    resolve(salt + ":" + derivedKey.toString("hex"));
  });
});
const verifyPassword = (password, stored) => new Promise((resolve, reject) => {
  if (typeof stored !== "string") return resolve(false);
  const sep = stored.indexOf(":");
  if (sep <= 0) return resolve(false);
  const salt = stored.slice(0, sep), hash = stored.slice(sep + 1);
  if (!salt || !hash) return resolve(false);
  crypto.scrypt(password, salt, 64, (err, derivedKey) => {
    if (err) return reject(err);
    resolve(derivedKey.toString("hex") === hash);
  });
});

// ---- serialized persistence writes ----
let writeTimer = null;
function enqueueWrite() {
  const pendingWrite = storage.save(D);
  pendingWrite.catch(error => console.error("Failed to persist application data:", error));
  return pendingWrite;
}
const save = () => {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(enqueueWrite, 200);
};

const rid = () => crypto.randomBytes(4).toString("hex");
const err = (s, m, c = 400) => s.status(c).json({ error: m });
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ---- sessions (httpOnly cookie) + in-memory store ----
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const sessions = new Map(); // token -> { userId, role, permissions, expiresAt }
// login rate limiting: key -> { fails, lockUntil }
const loginFails = new Map();
const LOGIN_MAX_FAILS = 5;
const LOGIN_LOCK_MS = 60 * 1000;
function loginLock(key) { const l = loginFails.get(key); return l && l.lockUntil > Date.now(); }
function loginFail(key) {
  const l = loginFails.get(key) || { fails: 0, lockUntil: 0 };
  l.fails++; if (l.fails >= LOGIN_MAX_FAILS) l.lockUntil = Date.now() + LOGIN_LOCK_MS;
  loginFails.set(key, l);
}
function loginReset(key) { loginFails.delete(key); }
function sessionToken(req) {
  // httpOnly cookie (primary)
  const c = req.headers.cookie || "";
  const m = c.match(/(?:^|;\s*)session=([^;]+)/);
  if (m) return m[1];
  // backward compat: x-token header / ?token= (existing teacher frontend)
  if (req.headers["x-token"]) return req.headers["x-token"];
  if (req.query.token) return req.query.token;
  return null;
}
const requireAuth = (req, res, next) => {
  const tok = sessionToken(req);
  const sess = tok && sessions.get(tok);
  if (!sess || sess.expiresAt < Date.now()) { sessions.delete(tok); return err(res, "Please log in.", 401); }
  sess.expiresAt = Date.now() + SESSION_TTL_MS; // sliding expiry
  req.session = sess;
  next();
};
const requirePermission = (perm) => (req, res, next) => {
  if (!req.session) return err(res, "Please log in.", 401);
  if (!req.session.permissions || !req.session.permissions.includes(perm)) return err(res, "Not permitted.", 403);
  next();
};
function createSession(res, userId, role, permissions) {
  const tok = crypto.randomBytes(16).toString("hex");
  sessions.set(tok, { userId, role, permissions: permissions || [], expiresAt: Date.now() + SESSION_TTL_MS });
  res.cookie("session", tok, { httpOnly: true, sameSite: "lax", path: "/", maxAge: SESSION_TTL_MS });
  return tok;
}
function destroySession(res, req) {
  const tok = sessionToken(req);
  if (tok) sessions.delete(tok);
  res.clearCookie("session", { path: "/" });
}

// ---- built-in permissions ----
const ALL_PERMS = ["manage_users","manage_classes","manage_students","create_tests","monitor_tests","view_results","grade_tests","export_results"];
const TEACHER_PERMS = ALL_PERMS.filter(p => p !== "manage_users");

// ---- seed users (teacher built-in + admin from env) ----
async function seedUsers() {
  let changed = false;
  // built-in teacher (maps to existing teacher login, password TEACHER_PASSWORD)
  if (!D.users.teacher) {
    D.users.teacher = { id: "teacher", name: "Teacher", role: "teacher", hash: null, salt: null, permissions: TEACHER_PERMS, active: true, at: Date.now() };
    changed = true;
  }
  // admin from env
  const adminId = (process.env.ADMIN_ID || "admin").toString();
  const adminPass = process.env.ADMIN_PASSWORD || "admin123";
  if (!D.users[adminId]) {
    D.users[adminId] = { id: adminId, name: "Admin", role: "admin", hash: null, salt: null, permissions: ALL_PERMS, active: true, at: Date.now() };
    changed = true;
    console.log("\nAdmin account seeded. Configure ADMIN_ID and ADMIN_PASSWORD before production use.\n");
  } else {
    // ensure admin has all perms + is active
    const a = D.users[adminId];
    if (a.role === "admin") {
      if (JSON.stringify(a.permissions) !== JSON.stringify(ALL_PERMS) || !a.active) changed = true;
      a.permissions = ALL_PERMS.slice();
      a.active = true;
    }
  }
  // hash any user with null hash using their default password (store "salt:hash" combined)
  if (D.users.teacher && !D.users.teacher.hash) {
    D.users.teacher.hash = await hashPassword(PASS);
    changed = true;
  }
  if (D.users[adminId] && !D.users[adminId].hash) {
    D.users[adminId].hash = await hashPassword(adminPass);
    changed = true;
  }
  return changed;
}
const app = express();
app.use(express.json({ limit: "5mb" }));

// ---- teacher ----
// ---- teacher login (built-in "teacher" user; keeps password teacher123 working) ----
app.post("/api/login", async (q, s) => {
  const ip = q.ip || q.connection.remoteAddress || "unknown";
  const key = "login:teacher:" + ip;
  if (loginLock(key)) return err(s, "Too many failed attempts. Try again in a minute.", 429);
  const u = D.users.teacher;
  if (!u) return err(s, "Auth not configured.", 500);
  let ok = false;
  if (u.hash) ok = await verifyPassword(String(q.body.password || ""), u.hash).catch(() => false);
  else ok = (String(q.body.password || "") === PASS); // fallback before hash is ready
  if (!ok) { loginFail(key); return err(s, "Wrong password.", 401); }
  loginReset(key);
  const tok = createSession(s, u.id, u.role, u.permissions);
  s.json({ token: tok, user: { id: u.id, name: u.name, role: u.role, permissions: u.permissions } });
});
// ---- admin login (Admin ID + Password) ----
app.post("/api/admin-login", async (q, s) => {
  const ip = q.ip || q.connection.remoteAddress || "unknown";
  const id = String(q.body.id || "").trim();
  const key = "login:admin:" + ip;
  if (loginLock(key)) return err(s, "Too many failed attempts. Try again in a minute.", 429);
  const u = D.users[id];
  if (!u || u.role !== "admin" || !u.active) { loginFail(key); return err(s, "Unknown or inactive admin.", 401); }
  let ok = false;
  if (u.hash) ok = await verifyPassword(String(q.body.password || ""), u.hash).catch(() => false);
  else ok = (String(q.body.password || "") === (process.env.ADMIN_PASSWORD || "admin123"));
  if (!ok) { loginFail(key); return err(s, "Wrong password.", 401); }
  loginReset(key);
  const tok = createSession(s, u.id, u.role, u.permissions);
  s.json({ token: tok, user: { id: u.id, name: u.name, role: u.role, permissions: u.permissions } });
});
// ---- logout ----
app.post("/api/logout", (q, s) => { destroySession(s, q); s.json({ ok: 1 }); });
// ---- me (current session) ----
app.get("/api/me", requireAuth, (q, s) => { const u = D.users[q.session.userId]; s.json({ user: { id: q.session.userId, role: q.session.role, permissions: q.session.permissions, name: u ? u.name : "" } }); });
// ---- users and rights API (manage_users) ----
function publicUser(u){ return { id:u.id, name:u.name, role:u.role, permissions:u.permissions||[], active:!!u.active, at:u.at }; }
function activeAdminCount(){ return Object.values(D.users).filter(u=>u.role==="admin"&&u.active).length; }
function permsFor(role, perms){ if(role==="admin") return ALL_PERMS.slice(); return Array.isArray(perms)&&perms.length? perms.filter(p=>ALL_PERMS.includes(p)) : TEACHER_PERMS.slice(); }
app.get("/api/users", requireAuth, requirePermission("manage_users"), (q, s) => {
  s.json(Object.values(D.users).map(publicUser).sort((a, b) => b.at - a.at));
});
app.post("/api/users", requireAuth, requirePermission("manage_users"), async (q, s) => {
  const b=q.body, name=String(b.name||"").trim(), role=String(b.role||"teacher");
  const id=String(b.id||"").trim() || name.toLowerCase().replace(/[^a-z0-9]+/g,"-")||"u";
  const password=String(b.password||""), perms=Array.isArray(b.permissions)?b.permissions:[];
  if(!name) return err(s,"Enter a name.");
  if(!["admin","teacher"].includes(role)) return err(s,"Role must be admin or teacher.");
  if(password.length<6) return err(s,"Password must be at least 6 characters.");
  const bad=perms.filter(p=>!ALL_PERMS.includes(p));
  if(bad.length) return err(s,"Invalid permission: "+bad[0]);
  if(D.users[id]) return err(s,"User already exists.",409);
  const hash=await hashPassword(password).catch(()=>null);
  if(!hash) return err(s,"Could not set password.",500);
  D.users[id]={ id, name, role, hash, permissions: permsFor(role,perms), active:true, at:Date.now() };
  save(); s.json({ user: publicUser(D.users[id]) });
});
app.put("/api/users/:id", requireAuth, requirePermission("manage_users"), async (q, s) => {
  const id=q.params.id, u=D.users[id];
  if(!u) return err(s,"User not found.",404);
  const b=q.body;
  const newRole=b.role!==undefined?String(b.role):u.role;
  const newActive=b.active!==undefined?!!b.active:u.active;
  if(!["admin","teacher"].includes(newRole)) return err(s,"Role must be admin or teacher.");
  const currentlyLastAdmin = u.role==="admin" && u.active && activeAdminCount()<=1;
  if(currentlyLastAdmin && !(newRole==="admin" && newActive)) return err(s,"Cannot delete, disable or demote the last active admin.",403);
  if(b.name!==undefined) u.name=String(b.name||"").trim();
  u.role=newRole; u.active=newActive;
  if(b.permissions!==undefined){ const bad=b.permissions.filter(p=>!ALL_PERMS.includes(p)); if(bad.length) return err(s,"Invalid permission: "+bad[0]); u.permissions=permsFor(newRole,b.permissions); }
  if(b.password){ const hash=await hashPassword(String(b.password)).catch(()=>null); if(!hash) return err(s,"Could not set password.",500); u.hash=hash; }
  save(); s.json({ user: publicUser(u) });
});
app.delete("/api/users/:id", requireAuth, requirePermission("manage_users"), (q, s) => {
  const id=q.params.id, u=D.users[id];
  if(!u) return err(s,"User not found.",404);
  if(u.role==="admin" && u.active && activeAdminCount()<=1) return err(s,"Cannot delete the last active admin.",403);
  delete D.users[id];
  // sign out if deleting self
  const tok=sessionToken(q); const sess=tok&&sessions.get(tok);
  if(sess&&sess.userId===id) destroySession(s,q);
  save(); s.json({ ok:1 });
});
app.post("/api/users/:id/reset-password", requireAuth, requirePermission("manage_users"), async (q, s) => {
  const id=q.params.id, u=D.users[id];
  if(!u) return err(s,"User not found.",404);
  const password=String(q.body.password||"");
  if(password.length<6) return err(s,"Password must be at least 6 characters.");
  const hash=await hashPassword(password).catch(()=>null);
  if(!hash) return err(s,"Could not set password.",500);
  u.hash=hash; save(); s.json({ ok:1 });
});
app.get("/api/classes", requireAuth, (q, s) => s.json(Object.values(D.classes).sort((a, b) => b.at - a.at)));
app.post("/api/classes", requireAuth, requirePermission("manage_classes"), (q, s) => {
  const name = String(q.body.name || "").trim(); if (!name) return err(s, "Enter a class name.");
  const st = Array.isArray(q.body.st) ? q.body.st : [];
  const id = "c-" + rid();
  // new classes default to restricted (true); legacy classes keep migration value
  D.classes[id] = { id, name, st, at: Date.now(), restricted: true };
  save(); s.json(D.classes[id]);
});
app.get("/api/tests", requireAuth, (q, s) => s.json(Object.values(D.tests).sort((a, b) => b.at - a.at)));
app.post("/api/tests", requireAuth, requirePermission("create_tests"), (q, s) => {
  const b = q.body, c = D.classes[b.cid];
  if (!b.t || !c || !Array.isArray(b.qs) || !b.qs.length || !(b.m > 0) || !b.pc) return err(s, "Missing test details.");
  const id = "t-" + rid();
  D.tests[id] = { id, t: String(b.t), ty: ["mcq", "code", "write"].includes(b.ty) ? b.ty : "mcq", cid: c.id, cn: c.name,
    rl: c.st.map(x => x.split(/[,|]/)[0].trim()), m: +b.m, n: Math.min(+b.n || b.qs.length, b.qs.length), mk: +b.mk || 1,
    pc: String(b.pc).trim(), qs: b.qs, at: Date.now() };
  save(); s.json({ id });
});
app.delete("/api/tests/:id", requireAuth, requirePermission("create_tests"), (q, s) => {
  const id = q.params.id; delete D.tests[id];
  for (const k of Object.keys(D.subs)) if (D.subs[k].tid === id) delete D.subs[k];
  for (const k of Object.keys(D.attempts)) if (D.attempts[k].tid === id) delete D.attempts[k];
  save(); s.json({ ok: 1 });
});
app.get("/api/results/:tid", requireAuth, requirePermission("view_results"), (q, s) => s.json(Object.values(D.subs).filter(x => x.tid === q.params.tid)));
app.post("/api/grade", requireAuth, requirePermission("grade_tests"), (q, s) => {
  const x = D.subs[q.body.u]; if (!x) return err(s, "Submission not found.", 404);
  x.g = Math.max(0, Math.min(x.x, +q.body.g || 0)); save(); s.json({ ok: 1 });
});
app.get("/api/export/:tid", requireAuth, requirePermission("export_results"), (q, s) => {
  const t = D.tests[q.params.tid]; if (!t) return err(s, "Test not found.", 404);
  const e = v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
  const rows = Object.values(D.subs).filter(x => x.tid === t.id).map(x => [x.n, x.r, x.s != null ? x.s : x.g, x.x, x.v, x.e].map(e).join(","));
  s.set({ "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="${t.id}-results.csv"` });
  s.send(["Name,Roll,Marks,Out of,Warnings,Seconds", ...rows].join("\n"));
});
// ---- class update/delete (manage_classes) ----
app.put("/api/classes/:id", requireAuth, requirePermission("manage_classes"), (q, s) => {
  const c = D.classes[q.params.id]; if (!c) return err(s, "Class not found.", 404);
  const b = q.body;
  if (b.name !== undefined) c.name = String(b.name).trim();
  if (Array.isArray(b.st)) c.st = b.st;
  if (b.restricted !== undefined) c.restricted = !!b.restricted;
  c.at = Date.now(); save(); s.json(c);
});
app.delete("/api/classes/:id", requireAuth, requirePermission("manage_classes"), (q, s) => {
  const id = q.params.id; if (!D.classes[id]) return err(s, "Class not found.", 404);
  for (const tid of Object.keys(D.tests)) if (D.tests[tid].cid === id) delete D.tests[tid];
  delete D.classes[id]; save(); s.json({ ok: 1 });
});
// ---- dashboard stats (overview) ----
app.get("/api/dashboard/stats", requireAuth, requirePermission("view_results"), (q, s) => {
  const now = Date.now();
  let live = 0;
  for (const [key, at] of Object.entries(D.attempts)) {
    if (D.subs[key]) continue;
    const t = D.tests[at.tid]; if (!t) continue;
    if ((now - at.t0) > t.m * 60 * 1000) continue;
    live++;
  }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const subsToday = Object.values(D.subs).filter(x => x.at >= today.getTime()).length;
  const studentCount = Object.values(D.classes).reduce((sum, c) => sum + (Array.isArray(c.st) ? c.st.length : 0), 0);
  s.json({ users: Object.values(D.users).length, classes: Object.values(D.classes).length, students: studentCount, tests: Object.values(D.tests).length, live, subsToday });
});
// ---- live attempts for monitor ----
app.get("/api/attempts", requireAuth, requirePermission("monitor_tests"), (q, s) => {
  const now = Date.now();
  const out = Object.values(D.attempts).map(at => {
    const t = D.tests[at.tid];
    const sub = D.subs[at.tid + ":" + at.r.toLowerCase()];
    let status = "active", left = 0;
    if (sub) status = "submitted";
    else if (!t) status = "expired";
    else if ((now - at.t0) > t.m * 60 * 1000) { status = "timed_out"; left = 0; }
    else { left = Math.max(0, t.m * 60 - Math.floor((now - at.t0) / 1000)); }
    return { key: at.tid + ":" + at.r.toLowerCase(), tid: at.tid, r: at.r, n: at.n, test: t ? t.t : null, cn: t ? t.cn : null, ty: t ? t.ty : null, start: at.t0, status, left, elapsed: Math.floor((now - at.t0) / 1000) };
  });
  s.json(out);
});
// ---- settings ----
app.get("/api/settings", requireAuth, (q, s) => s.json(D.settings));
app.post("/api/settings", requireAuth, requirePermission("manage_users"), (q, s) => {
  const b = q.body;
  if (b.unlockCode !== undefined) { D.settings.unlockCode = String(b.unlockCode).trim() || "1234"; save(); }
  s.json(D.settings);
});


// ---- student ----
app.post("/api/start", (q, s) => {
  const { id, r, n, pc } = q.body, t = D.tests[id];
  if (!t) return err(s, "Test not found. Check the Test ID.");
  if (t.pc !== String(pc || "").trim()) return err(s, "Wrong passcode.");
  const roll = String(r || "").trim(); let name = String(n || "").trim().slice(0, 80);
  if (!roll || !name) return err(s, "Enter your name and roll number.");
  const c = D.classes[t.cid];
  const rollNorm = roll.toLowerCase();
  // enrollment gate: classes[cid].st is the single source of truth, read live at test start
  if (c && c.restricted) {
    const entry = c.st.find(e => String(e).split(/[,|]/)[0].trim().toLowerCase() === rollNorm);
    if (!entry) return err(s, "You are not enrolled for this test.");
    const parts = String(entry).split(/[,|]/);
    if (parts.length > 1 && parts[1].trim()) name = parts[1].trim(); // official name from list
  }
  const key = id + ":" + rollNorm;
  if (D.subs[key]) return err(s, "You have already submitted this test.");
  let a = D.attempts[key];
  if (!a) { a = D.attempts[key] = { tid: id, r: roll, n: name, t0: Date.now(), k: rid() + rid(), o: shuffle([...t.qs.keys()]).slice(0, Math.min(t.n, t.qs.length)) }; save(); }
  s.json({ k: a.k, o: a.o, el: Math.floor((Date.now() - a.t0) / 1000),
    t: { t: t.t, ty: t.ty, m: t.m, mk: t.mk, qs: t.qs.map(x => ({ q: x.q, o: x.o })) } });
});
app.post("/api/submit", (q, s) => {
  const { tid, r, k, a, v } = q.body, key = tid + ":" + String(r || "").trim().toLowerCase(), at = D.attempts[key], t = D.tests[tid];
  if (!at || !t || at.k !== k) return err(s, "Invalid attempt.");
  if (D.subs[key]) return err(s, "You have already submitted this test.");
  const x = at.o.length * t.mk, A = a || {};
  const rec = { u: key, tid, n: at.n, r: at.r, x, v: +v || 0, e: Math.min(t.m * 60, Math.floor((Date.now() - at.t0) / 1000)), at: Date.now() };
  if (t.ty === "mcq") rec.s = at.o.reduce((c, i) => c + (A[i] === t.qs[i].a ? t.mk : 0), 0);
  else rec.ans = at.o.map(i => ({ q: t.qs[i].q, a: String(A[i] || "").slice(0, 20000) }));
  D.subs[key] = rec; save(); s.json({ s: rec.s == null ? null : rec.s, x });
});

// ---- pages ----
app.use(express.static(path.join(__dirname, "public")));
app.get(["/teacher", "/t/:id"], (q, s) => s.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/admin", (q, s) => s.sendFile(path.join(__dirname, "public", "admin.html")));
async function startServer() {
  const loaded = await storage.initialize(DEFAULTS);
  D = Object.assign({}, DEFAULTS, loaded.state);
  const stateBeforeMigration = JSON.stringify(D);
  ensureDefaults();
  const migrated = JSON.stringify(D) !== stateBeforeMigration;
  const seeded = await seedUsers();
  if (loaded.needsSave || migrated || seeded) await storage.save(D);

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log("\nExam Portal running");
    console.log("  Teacher dashboard: http://localhost:" + PORT + "/teacher");
    console.log("  Admin dashboard:   http://localhost:" + PORT + "/admin");
    for (const l of Object.values(os.networkInterfaces()).flat()) if (l && l.family === "IPv4" && !l.internal) console.log("  On your Wi-Fi/LAN:  http://" + l.address + ":" + PORT);
  });
  server.on("error", async error => {
    console.error("Failed to start the HTTP server:", error);
    process.exitCode = 1;
    try {
      await storage.close();
    } catch (closeError) {
      console.error("Failed to close application storage:", closeError);
    }
  });

  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    server.close(async () => {
      clearTimeout(writeTimer);
      try {
        await enqueueWrite();
        await storage.close();
      } catch (error) {
        console.error("Failed to shut down cleanly:", error);
        process.exitCode = 1;
      }
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

startServer().catch(async error => {
  console.error("Failed to initialize the application:", error);
  try {
    await storage.close();
  } catch (closeError) {
    console.error("Failed to close application storage:", closeError);
  }
  process.exitCode = 1;
});
