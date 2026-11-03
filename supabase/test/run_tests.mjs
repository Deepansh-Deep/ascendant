// Server tests: every role and rule, through the same HTTP API the app uses.
// Needs the mock server running (npm run mock) on a database loaded with mock_supabase.sql + schema.sql.
import fs from "node:fs";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
const URL_ = process.env.MOCK_URL || "http://localhost:54321", ANON = "anon-test-key";
let pass = 0, failN = 0;
const ok = (cond, name, extra) => { if (cond) { pass++; console.log("  ok  " + name); } else { failN++; console.log("  FAIL " + name + (extra ? " :: " + JSON.stringify(extra).slice(0, 300) : "")); } };
const sql = q => execFileSync("psql", ["-h", process.env.PGHOST || "/tmp", "-p", process.env.PGPORT || "5499", "-U", "postgres", "-d", process.env.PGDATABASE || "asc_test", "-At", "-c", q], { encoding: "utf8" }).trim();
async function call(method, path, body, token) {
  const r = await fetch(URL_ + path, { method, headers: { apikey: ANON, "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch (_) { j = t; }
  return { status: r.status, ok: r.ok, data: j };
}
const email = u => `${u}@users.ascendant.app`;
const signup = (u, pw, name) => call("POST", "/auth/v1/signup", { email: email(u), password: pw, data: { username: u, display_name: name || u } });
const login = (u, pw) => call("POST", "/auth/v1/token?grant_type=password", { email: email(u), password: pw });
const rpc = (fn, args, tok) => call("POST", "/rest/v1/rpc/" + fn, args || {}, tok);
const fn = (name, args, tok) => call("POST", "/functions/v1/" + name, args || {}, tok);

// ---------- 1. scoring categories must match the app engine
{
  const core = fs.readFileSync(new URL("../../www/js/core.js", import.meta.url), "utf8");
  const ctx = { console }; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(new URL("../../www/js/scoring.js", import.meta.url), "utf8"), ctx);
  vm.runInContext(core + "\n;globalThis.__cats = {TIMED, HOLD, RUN, BODYW};", ctx);
  const a = ctx.AscendantScoring.categories, b = ctx.__cats, same = (x, y) => [...x].sort().join() === [...y].sort().join();
  console.log("scoring module");
  ok(["TIMED", "HOLD", "RUN", "BODYW"].every(k => same(a[k], b[k])), "exercise categories identical to core.js");
  ok(fs.readFileSync(new URL("../../www/js/scoring.js", import.meta.url), "utf8") === fs.readFileSync(new URL("../functions/_shared/scoring.js", import.meta.url), "utf8"), "server copy of scoring.js is up to date");
}

// ---------- 2. accounts
console.log("accounts");
const stamp = Date.now().toString(36).slice(-4);
const OWNER = "owner_" + stamp, GM = "yodha_" + stamp, P1 = "rahul_" + stamp, P2 = "priya_" + stamp;
ok((await rpc("username_available", { p_username: OWNER })).data === true, "username available before signup");
const so = await signup(OWNER, "ownerpass1", "Deepansh"); ok(so.ok && so.data.access_token, "owner signs up", so.data);
ok((await rpc("username_available", { p_username: OWNER })).data === false, "username taken after signup");
ok((await signup(OWNER, "different9")).status === 422, "duplicate username rejected");
ok((await rpc("username_available", { p_username: "Bad Name!" })).data === false, "invalid username format rejected");
ok(!(await signup("x!", "password1")).ok, "signup with invalid username fails at the database");
sql(`update public.profiles set role = 'owner' where username = '${OWNER}'`);
let ownerT = (await login(OWNER, "ownerpass1")).data.access_token;
ok(!!ownerT, "owner logs in");
ok(!(await login(OWNER, "wrongpass")).ok, "wrong password rejected");
const acc = await rpc("my_account", {}, ownerT); ok(acc.data && acc.data.role === "owner", "my_account shows owner role", acc.data);
ok(!(await rpc("my_account", {})).ok, "anonymous caller cannot read an account");

// ---------- 3. owner creates guild master codes
console.log("owner codes");
const codes = await rpc("owner_create_codes", { p_count: 2, p_note: "Yodha Gym, paid Nov", p_grant_days: 30, p_valid_days: 14 }, ownerT);
ok(codes.ok && codes.data.length === 2 && /^GM-[A-Z2-9]{8}$/.test(codes.data[0]), "owner creates 2 codes", codes.data);
const CODE = codes.data[0];
ok((await rpc("check_master_code", { p_code: CODE })).data === true, "code checks valid before use (anon)");
ok((await rpc("check_master_code", { p_code: "GM-NOPE1234" })).data === false, "unknown code checks invalid");

// ---------- 4. guild master registers his gym
console.log("guild master");
const sg = await signup(GM, "gympass12", "Yodha Gym owner"); let gmT = sg.data.access_token;
const bg = await rpc("become_guild_master", { p_code: CODE, p_gym_name: "Yodha Gym", p_city: "Bokaro" }, gmT);
ok(bg.ok && bg.data.join_code && bg.data.join_code.length === 6, "master redeems code and creates guild", bg.data);
const JOIN = bg.data.join_code;
ok(!(await rpc("become_guild_master", { p_code: CODE, p_gym_name: "Again", p_city: "" }, gmT)).ok, "code cannot be used twice");
ok((await rpc("check_master_code", { p_code: CODE })).data === false, "used code checks invalid");
const gacc = (await rpc("my_account", {}, gmT)).data;
ok(gacc.role === "guild_master" && gacc.master_guild && gacc.master_guild.name === "Yodha Gym" && gacc.master_guild.active, "account shows master guild, active", gacc);
ok((await rpc("master_update_guild", { p_name: "Yodha Gym Bokaro", p_city: "Bokaro Steel City" }, gmT)).ok, "master renames gym");
// 1x1 PNG
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const lg = await fn("upload-logo", { image: png }, gmT);
ok(lg.ok && /guild-logos/.test(lg.data.logo_url), "master uploads logo", lg.data);
ok(lg.ok && (await fetch(lg.data.logo_url)).ok, "logo is publicly readable");
ok(!(await fn("upload-logo", { image: "data:text/html;base64,PGI+" }, gmT)).ok, "non-image upload rejected");

// ---------- 5. participants join with approval
console.log("participants");
let p1T = (await signup(P1, "rahulpass1", "Rahul")).data.access_token;
let p2T = (await signup(P2, "priyapass1", "Priya")).data.access_token;
ok(!(await fn("upload-logo", { image: png }, p1T)).ok, "participant cannot upload a guild logo");
ok(!(await rpc("request_join", { p_join_code: "ZZZZZZ" }, p1T)).ok, "wrong join code rejected");
const rj = await rpc("request_join", { p_join_code: JOIN.toLowerCase() }, p1T); ok(rj.ok && rj.data.status === "pending", "participant requests to join (code case-insensitive)", rj.data);
await rpc("request_join", { p_join_code: JOIN }, p2T);
ok(!(await rpc("guild_leaderboard", { p_category: "overall", p_period: "week" }, p1T)).ok, "pending member cannot see leaderboard");
const reqs = await rpc("master_requests", {}, gmT); ok(reqs.ok && reqs.data.length === 2, "master sees 2 pending requests", reqs.data);
ok(!(await rpc("master_requests", {}, p1T)).ok, "participant cannot see join requests");
const r1 = reqs.data.find(r => r.username === P1), r2 = reqs.data.find(r => r.username === P2);
ok((await rpc("master_decide", { p_user: r1.user_id, p_approve: true }, gmT)).ok, "master approves Rahul");
ok((await rpc("master_decide", { p_user: r2.user_id, p_approve: false }, gmT)).ok, "master rejects Priya");
ok((await rpc("my_account", {}, p2T)).data.membership === null, "rejected request is removed");
const mem = await rpc("master_members", {}, gmT); ok(mem.ok && mem.data.length === 2, "guild has master + Rahul", mem.data);

// ---------- 6. sync + server-computed scores
console.log("sync and scores");
const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const days = n => { const d = new Date(today + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const start = days(40), allDays = [0, 1, 2, 3, 4, 5, 6];
const plan = [["Chest"], ["Back"], ["Legs"], ["Chest"], ["Back"], ["Legs"], []];
const state = { profile: { name: P1, startDate: start, startWeight: 75, goal: 72, height: 175 }, planHistory: [{ from: start, plan }], weights: [{ date: start, kg: 75 }], exercises: {} };
const logs = []; for (let i = 40; i >= 1; i -= 1) { if (i % 7 === 0) continue; const w = 40 + (40 - i) * 0.5; logs.push({ day: days(i), data: { type: "workout", entries: [{ ex: "Bench Press", sets: [{ kg: w, reps: 8 }, { kg: w, reps: 8 }] }, { ex: "Squat", sets: [{ kg: w + 20, reps: 6 }] }] } }); }
const sp = await rpc("sync_push", { p_logs: logs, p_state: state }, p1T); ok(sp.ok, "participant pushes 40 days of logs + state", sp.data);
const pl = await rpc("sync_pull", { p_since: null }, p1T); ok(pl.ok && pl.data.logs.length === logs.length && pl.data.state, "pull returns everything back", pl.data && pl.data.logs.length);
const since = pl.data.now;
ok((await rpc("sync_push", { p_logs: [{ day: days(1), data: null }], p_state: null }, p1T)).ok, "delete one day");
const pl2 = await rpc("sync_pull", { p_since: since }, p1T); ok(pl2.data.logs.length === 1 && pl2.data.logs[0].data === null && pl2.data.state === null, "incremental pull returns only the change", pl2.data);
ok((await rpc("sync_pull", { p_since: null }, p2T)).data.logs.length === 0, "other users cannot see Rahul's logs");
const cs = await fn("compute-scores", {}, p1T); ok(cs.ok && cs.data.scores.length === 3, "server computes scores from synced logs", cs.data);
const wk = cs.data.scores[0]; ok(wk.consistency >= 0 && wk.consistency <= 100 && wk.overall === Math.round(wk.consistency * .4 + wk.progress * .3 + wk.strength * .3), "overall follows published formula", wk);
ok((await fn("compute-scores", {}, gmT)).status === 409, "user with no synced training gets a clear error");
ok(!(await rpc("admin_write_scores", { p_user: r1.user_id, p_rows: [{ period: "week", period_key: wk.period_key, consistency: 100, strength: 100, progress: 100, overall: 100 }] }, p1T)).ok, "phone cannot write its own scores");
const lb = await rpc("guild_leaderboard", { p_category: "overall", p_period: "week" }, p1T);
ok(lb.ok && lb.data.length === 2 && lb.data[0].username === P1 && lb.data[0].is_me && lb.data[0].member_count === 2, "leaderboard ranks approved members", lb.data);
ok((await rpc("guild_leaderboard", { p_category: "strength", p_period: "month" }, gmT)).ok, "master sees his guild board");

// ---------- 7. owner controls
console.log("owner controls");
const og = await rpc("owner_guilds", {}, ownerT); const yg = og.data.find(g => g.master_username === GM);
ok(og.ok && yg && yg.members === 2 && yg.logo_url, "owner sees guild with members and logo", yg);
ok(!(await rpc("owner_guilds", {}, gmT)).ok, "guild master cannot use owner functions");
const expired = days(30);
ok((await rpc("owner_set_guild", { p_guild: yg.id, p_paid_until: expired, p_status: "active" }, ownerT)).ok, "owner marks subscription expired");
const lbx = await rpc("guild_leaderboard", { p_category: "overall", p_period: "week" }, p1T);
ok(!lbx.ok && /inactive/.test(lbx.data.message), "expired guild: leaderboard locked with clear message", lbx.data);
ok((await rpc("guild_leaderboard", { p_category: "overall", p_period: "week", p_guild: yg.id }, ownerT)).ok, "owner can still view any guild board");
ok(!(await rpc("request_join", { p_join_code: JOIN }, p2T)).ok, "nobody can join an expired guild");
await rpc("owner_set_guild", { p_guild: yg.id, p_paid_until: days(-30), p_status: "active" }, ownerT);
ok((await rpc("guild_leaderboard", { p_category: "overall", p_period: "week" }, p1T)).ok, "renewed guild unlocks again");
const us = await rpc("owner_users", { p_search: "rahul" }, ownerT); ok(us.ok && us.data.some(u => u.username === P1), "owner searches users", us.data);
const st = await rpc("owner_stats", {}, ownerT); ok(st.ok && st.data.users >= 4 && st.data.guilds >= 1, "owner stats", st.data);
ok((await fn("owner-admin", { action: "reset_password", user_id: r1.user_id, password: "newpass123" }, ownerT)).ok, "owner resets Rahul's password");
ok(!(await fn("owner-admin", { action: "reset_password", user_id: r1.user_id, password: "hacked123" }, gmT)).ok, "non-owner cannot reset passwords");
ok((await login(P1, "newpass123")).ok && !(await login(P1, "rahulpass1")).ok, "new password works, old one does not");
p1T = (await login(P1, "newpass123")).data.access_token;
ok((await rpc("owner_revoke_code", { p_code: codes.data[1] }, ownerT)).ok && (await rpc("check_master_code", { p_code: codes.data[1] })).data === false, "owner revokes an unused code");

// ---------- 8. payments
console.log("payments");
const prods = await rpc("list_products", {}, p1T); ok(prods.ok && prods.data.find(p => p.id === "crystals_55").amount_paise === 4900, "server price list", prods.data);
const ord = await fn("create-order", { product_id: "crystals_55" }, p1T); ok(ord.ok && ord.data.order_id && ord.data.amount === 4900, "order created at server price", ord.data);
ok(!(await fn("create-order", { product_id: "free_stuff" }, p1T)).ok, "unknown product rejected");
const paid = (await call("POST", "/__test/pay", { order_id: ord.data.order_id })).data;
ok(!(await fn("verify-payment", { ...paid, razorpay_signature: "0".repeat(64) }, p1T)).ok, "forged signature rejected");
let w0 = (await rpc("my_account", {}, p1T)).data.wallet; ok(w0.bought === 0, "no crystals before verified payment");
const vp = await fn("verify-payment", paid, p1T); ok(vp.ok && vp.data.credited === true, "verified payment credits", vp.data);
const vp2 = await fn("verify-payment", paid, p1T); ok(vp2.ok && vp2.data.credited === false, "verifying twice does not double-credit");
const evt = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: paid.razorpay_payment_id, order_id: paid.razorpay_order_id } } } });
ok((await (await fetch(URL_ + "/__test/webhook", { method: "POST", body: evt })).text()).includes("ok"), "webhook for same payment accepted");
w0 = (await rpc("my_account", {}, p1T)).data.wallet; ok(w0.bought === 55, "wallet shows exactly 55 bought crystals", w0);
const ord2 = await fn("create-order", { product_id: "pass" }, p1T);
const paid2 = (await call("POST", "/__test/pay", { order_id: ord2.data.order_id })).data;
const ev2 = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: paid2.razorpay_payment_id, order_id: paid2.razorpay_order_id } } } });
await fetch(URL_ + "/__test/webhook", { method: "POST", body: ev2 });
ok((await rpc("my_account", {}, p1T)).data.wallet.pass === true, "webhook alone credits the Pass (app closed after paying)");
const badHook = await fn("razorpay-webhook", JSON.parse(ev2)); ok(badHook.status === 401, "webhook without valid signature rejected");
ok((await rpc("my_purchases", {}, p1T)).data.filter(p => p.status === "paid").length === 2, "purchase history");

// ---------- 9. leaving and direct table access
console.log("membership and security");
ok(!(await rpc("leave_guild", {}, gmT)).ok, "master cannot leave his own guild");
ok(!(await rpc("master_remove", { p_user: (await rpc("my_account", {}, gmT)).data.id }, gmT)).ok, "master cannot remove himself");
ok((await rpc("master_remove", { p_user: r1.user_id }, gmT)).ok && (await rpc("my_account", {}, p1T)).data.membership === null, "master removes a member");
ok((await rpc("request_join", { p_join_code: JOIN }, p1T)).ok && (await rpc("leave_guild", {}, p1T)).ok, "member can request again and leave");
const direct = await call("POST", "/rest/v1/rpc/_master_guild", {}, p1T); ok(!direct.ok, "internal helper functions are not callable", direct.data);
const adm = await rpc("admin_mark_paid", { p_order_id: ord.data.order_id, p_payment_id: "x" }, p1T); ok(!adm.ok, "app users cannot call admin functions", adm.data);

console.log(`\n${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
