const express = require("express"), fs = require("fs"), path = require("path"), os = require("os"), crypto = require("crypto");
const PORT = process.env.PORT || 3000;
const PASS = process.env.TEACHER_PASSWORD || "teacher123";
const FILE = process.env.DATA_FILE || path.join(__dirname, "data.json");
let D = { classes: {}, tests: {}, attempts: {}, subs: {} };
try { D = Object.assign(D, JSON.parse(fs.readFileSync(FILE, "utf8"))); } catch (e) {}
let wt;
const save = () => { clearTimeout(wt); wt = setTimeout(() => fs.writeFile(FILE + ".tmp", JSON.stringify(D), e => !e && fs.rename(FILE + ".tmp", FILE, () => {})), 200); };
const tokens = new Set(), rid = () => crypto.randomBytes(4).toString("hex");
const err = (s, m, c = 400) => s.status(c).json({ error: m });
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const auth = (q, s, n) => tokens.has(q.get("x-token") || q.query.token) ? n() : err(s, "Please log in as teacher.", 401);
const app = express();
app.use(express.json({ limit: "5mb" }));

// ---- teacher ----
app.post("/api/login", (q, s) => {
  if (q.body.password !== PASS) return err(s, "Wrong password.", 401);
  const t = crypto.randomBytes(16).toString("hex"); tokens.add(t); s.json({ token: t });
});
app.get("/api/classes", auth, (q, s) => s.json(Object.values(D.classes).sort((a, b) => b.at - a.at)));
app.post("/api/classes", auth, (q, s) => {
  const name = String(q.body.name || "").trim(); if (!name) return err(s, "Enter a class name.");
  const id = "c-" + rid(); D.classes[id] = { id, name, st: Array.isArray(q.body.st) ? q.body.st : [], at: Date.now() }; save(); s.json(D.classes[id]);
});
app.get("/api/tests", auth, (q, s) => s.json(Object.values(D.tests).sort((a, b) => b.at - a.at)));
app.post("/api/tests", auth, (q, s) => {
  const b = q.body, c = D.classes[b.cid];
  if (!b.t || !c || !Array.isArray(b.qs) || !b.qs.length || !(b.m > 0) || !b.pc) return err(s, "Missing test details.");
  const id = "t-" + rid();
  D.tests[id] = { id, t: String(b.t), ty: ["mcq", "code", "write"].includes(b.ty) ? b.ty : "mcq", cid: c.id, cn: c.name,
    rl: c.st.map(x => x.split(/[,|]/)[0].trim()), m: +b.m, n: Math.min(+b.n || b.qs.length, b.qs.length), mk: +b.mk || 1,
    pc: String(b.pc).trim(), qs: b.qs, at: Date.now() };
  save(); s.json({ id });
});
app.delete("/api/tests/:id", auth, (q, s) => {
  const id = q.params.id; delete D.tests[id];
  for (const k of Object.keys(D.subs)) if (D.subs[k].tid === id) delete D.subs[k];
  for (const k of Object.keys(D.attempts)) if (D.attempts[k].tid === id) delete D.attempts[k];
  save(); s.json({ ok: 1 });
});
app.get("/api/results/:tid", auth, (q, s) => s.json(Object.values(D.subs).filter(x => x.tid === q.params.tid)));
app.post("/api/grade", auth, (q, s) => {
  const x = D.subs[q.body.u]; if (!x) return err(s, "Submission not found.", 404);
  x.g = Math.max(0, Math.min(x.x, +q.body.g || 0)); save(); s.json({ ok: 1 });
});
app.get("/api/export/:tid", auth, (q, s) => {
  const t = D.tests[q.params.tid]; if (!t) return err(s, "Test not found.", 404);
  const e = v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
  const rows = Object.values(D.subs).filter(x => x.tid === t.id).map(x => [x.n, x.r, x.s != null ? x.s : x.g, x.x, x.v, x.e].map(e).join(","));
  s.set({ "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="${t.id}-results.csv"` });
  s.send(["Name,Roll,Marks,Out of,Warnings,Seconds", ...rows].join("\n"));
});

// ---- student ----
app.post("/api/start", (q, s) => {
  const { id, r, n, pc } = q.body, t = D.tests[id];
  if (!t) return err(s, "Test not found. Check the Test ID.");
  if (t.pc !== String(pc || "").trim()) return err(s, "Wrong passcode.");
  const roll = String(r || "").trim(), name = String(n || "").trim().slice(0, 80);
  if (!roll || !name) return err(s, "Enter your name and roll number.");
  if (t.rl.length && !t.rl.some(x => x.toLowerCase() === roll.toLowerCase())) return err(s, "This roll number is not on the class list.");
  const key = id + ":" + roll.toLowerCase();
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
app.listen(PORT, "0.0.0.0", () => {
  console.log("\nExam Portal running");
  console.log("  Teacher dashboard: http://localhost:" + PORT + "/teacher   (password: " + PASS + ")");
  for (const l of Object.values(os.networkInterfaces()).flat()) if (l && l.family === "IPv4" && !l.internal) console.log("  On your Wi-Fi/LAN:  http://" + l.address + ":" + PORT);
});
