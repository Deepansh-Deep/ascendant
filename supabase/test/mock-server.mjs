// Local stand-in for Supabase, for automated tests only.
// Real Postgres (schema.sql), plus small imitations of: GoTrue auth, PostgREST RPC, Edge Functions,
// Storage, and the Razorpay orders API. Never use this in production.
//   PGHOST=/tmp PGPORT=5499 PGDATABASE=asc_test PGUSER=postgres node supabase/test/mock-server.mjs
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const PORT = +(process.env.MOCK_PORT || 54321);
const BASE = `http://localhost:${PORT}`;
const ANON = "anon-test-key", SERVICE = "service-test-key";
const ENV = { SUPABASE_URL: BASE, SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SERVICE,
  RAZORPAY_KEY_ID: "rzp_test_mock", RAZORPAY_KEY_SECRET: "mock_key_secret", RAZORPAY_WEBHOOK_SECRET: "mock_webhook_secret", RAZORPAY_API_BASE: BASE + "/razorpay" };
const HERE = path.dirname(fileURLToPath(import.meta.url));
const STORE = "/tmp/asc-mock-storage";
const pool = new pg.Pool();
const tokens = new Map(), refresh = new Map();
const hash = p => crypto.createHash("sha256").update("mock:" + p).digest("hex");
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-upsert", "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS" };

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { ...CORS, "Content-Type": type });
  res.end(body === undefined ? "" : typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function session(user) {
  const at = crypto.randomBytes(24).toString("hex"), rt = crypto.randomBytes(24).toString("hex");
  tokens.set(at, { sub: user.id, role: "authenticated" }); refresh.set(rt, user.id);
  return { access_token: at, refresh_token: rt, token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: user.id, email: user.email, user_metadata: user.raw_user_meta_data } };
}
function caller(req) {
  const t = (req.headers.authorization || "").replace(/^Bearer /, "");
  if (t === SERVICE) return { role: "service_role" };
  if (tokens.has(t)) return tokens.get(t);
  return { role: "anon" };
}
const readBody = req => new Promise(r => { const c = []; req.on("data", d => c.push(d)); req.on("end", () => r(Buffer.concat(c))); });

async function rpc(fn, args, who) {
  const meta = await pool.query(`select proretset, proargnames, prorettype::regtype::text as rt from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and proname = $1`, [fn]);
  if (!meta.rows.length) return [404, { code: "PGRST202", message: `Could not find the function public.${fn}` }];
  const names = Object.keys(args || {});
  const call = `public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(", ")})`;
  const vals = names.map(n => { const v = args[n]; return v !== null && typeof v === "object" ? JSON.stringify(v) : v; });
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query(`set local role ${who.role}`);
    await c.query("select set_config('request.jwt.claim.sub', $1, true)", [who.sub || ""]);
    const m = meta.rows[0];
    const q = m.proretset ? `select coalesce(json_agg(t), '[]'::json) as r from ${call} t` : `select to_json(${call}) as r`;
    const out = await c.query(q, vals);
    await c.query("commit");
    if (m.rt === "void") return [204, undefined];
    return [200, out.rows[0].r];
  } catch (e) {
    await c.query("rollback").catch(() => {});
    return [e.code === "42501" ? 403 : 400, { code: e.code, message: e.message, details: null, hint: null }];
  } finally { c.release(); }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") return send(res, 204);
    const u = new URL(req.url, BASE), p = u.pathname, raw = await readBody(req);
    const body = () => { try { return JSON.parse(raw.toString() || "{}"); } catch (_) { return {}; } };
    // ---- auth
    if (p === "/auth/v1/signup" && req.method === "POST") {
      const b = body(); if (!b.email || !b.password) return send(res, 422, { msg: "Signup requires a valid password" });
      if (b.password.length < 6) return send(res, 422, { code: "weak_password", msg: "Password should be at least 6 characters." });
      const ex = await pool.query("select 1 from auth.users where email = $1", [b.email.toLowerCase()]);
      if (ex.rows.length) return send(res, 422, { code: "user_already_exists", msg: "User already registered" });
      try {
        const r = await pool.query("insert into auth.users (email, encrypted_password, raw_user_meta_data) values ($1, $2, $3) returning *",
          [b.email.toLowerCase(), hash(b.password), JSON.stringify(b.data || {})]);
        return send(res, 200, session(r.rows[0]));
      } catch (e) { return send(res, 500, { code: "unexpected_failure", msg: "Database error saving new user" }); }
    }
    if (p === "/auth/v1/token" && req.method === "POST") {
      const b = body(), gt = u.searchParams.get("grant_type");
      if (gt === "password") {
        const r = await pool.query("select * from auth.users where email = $1 and encrypted_password = $2", [String(b.email || "").toLowerCase(), hash(b.password || "")]);
        if (!r.rows.length) return send(res, 400, { error: "invalid_grant", error_description: "Invalid login credentials", code: "invalid_credentials", msg: "Invalid login credentials" });
        return send(res, 200, session(r.rows[0]));
      }
      if (gt === "refresh_token") {
        const id = refresh.get(b.refresh_token); if (!id) return send(res, 400, { error: "invalid_grant", error_description: "Invalid Refresh Token" });
        refresh.delete(b.refresh_token);
        const r = await pool.query("select * from auth.users where id = $1", [id]); return send(res, 200, session(r.rows[0]));
      }
    }
    if (p === "/auth/v1/user" && req.method === "GET") {
      const w = caller(req); if (!w.sub) return send(res, 401, { msg: "Invalid JWT" });
      const r = await pool.query("select * from auth.users where id = $1", [w.sub]);
      return r.rows.length ? send(res, 200, { id: r.rows[0].id, email: r.rows[0].email, user_metadata: r.rows[0].raw_user_meta_data }) : send(res, 401, { msg: "User not found" });
    }
    if (p === "/auth/v1/logout") { tokens.delete((req.headers.authorization || "").replace(/^Bearer /, "")); return send(res, 204); }
    let m;
    if ((m = /^\/auth\/v1\/admin\/users\/([^/]+)$/.exec(p)) && req.method === "PUT") {
      if (caller(req).role !== "service_role") return send(res, 403, { msg: "Not allowed" });
      const b = body(); await pool.query("update auth.users set encrypted_password = $1 where id = $2", [hash(b.password), decodeURIComponent(m[1])]);
      return send(res, 200, { id: m[1] });
    }
    // ---- PostgREST rpc
    if ((m = /^\/rest\/v1\/rpc\/([a-z_]+)$/.exec(p)) && req.method === "POST") {
      const [status, out] = await rpc(m[1], body(), caller(req)); return send(res, status, out);
    }
    // ---- edge functions
    if ((m = /^\/functions\/v1\/([a-z-]+)$/.exec(p))) {
      const mod = await import(path.join(HERE, "..", "functions", m[1], "handler.js"));
      const r = await mod.default(new Request(BASE + p, { method: req.method, headers: req.headers, body: req.method === "GET" ? undefined : raw }), ENV);
      res.writeHead(r.status, Object.fromEntries(r.headers)); return res.end(Buffer.from(await r.arrayBuffer()));
    }
    // ---- storage
    if ((m = /^\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/.exec(p)) && req.method === "GET") {
      const f = path.join(STORE, m[1], m[2]); if (!fs.existsSync(f)) return send(res, 404, { error: "not found" });
      return send(res, 200, fs.readFileSync(f), /\.png$/.test(f) ? "image/png" : /\.webp$/.test(f) ? "image/webp" : "image/jpeg");
    }
    if ((m = /^\/storage\/v1\/object\/([^/]+)\/(.+)$/.exec(p)) && (req.method === "POST" || req.method === "PUT")) {
      if (caller(req).role !== "service_role") return send(res, 403, { error: "Unauthorized" });
      const f = path.join(STORE, m[1], m[2]); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, raw);
      return send(res, 200, { Key: `${m[1]}/${m[2]}` });
    }
    // ---- Razorpay imitation
    if (p === "/razorpay/v1/orders" && req.method === "POST") {
      if (req.headers.authorization !== "Basic " + Buffer.from(ENV.RAZORPAY_KEY_ID + ":" + ENV.RAZORPAY_KEY_SECRET).toString("base64")) return send(res, 401, { error: { description: "Authentication failed" } });
      const b = body(); return send(res, 200, { id: "order_" + crypto.randomBytes(7).toString("hex"), amount: b.amount, currency: b.currency, status: "created" });
    }
    // test helper: what Razorpay checkout hands back after a successful payment
    if (p === "/__test/pay" && req.method === "POST") {
      const b = body(), pid = "pay_" + crypto.randomBytes(7).toString("hex");
      const sig = crypto.createHmac("sha256", ENV.RAZORPAY_KEY_SECRET).update(b.order_id + "|" + pid).digest("hex");
      return send(res, 200, { razorpay_order_id: b.order_id, razorpay_payment_id: pid, razorpay_signature: sig });
    }
    if (p === "/__test/webhook" && req.method === "POST") {
      const ev = raw.toString(), sig = crypto.createHmac("sha256", ENV.RAZORPAY_WEBHOOK_SECRET).update(ev).digest("hex");
      const mod = await import(path.join(HERE, "..", "functions", "razorpay-webhook", "handler.js"));
      const r = await mod.default(new Request(BASE + "/functions/v1/razorpay-webhook", { method: "POST", headers: { "x-razorpay-signature": sig }, body: ev }), ENV);
      return send(res, r.status, await r.text());
    }
    send(res, 404, { message: "mock: no route " + req.method + " " + p });
  } catch (e) { console.error(e); send(res, 500, { message: String(e.message || e) }); }
});
server.listen(PORT, () => console.log("mock supabase on " + BASE));
