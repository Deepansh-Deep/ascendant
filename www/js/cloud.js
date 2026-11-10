"use strict";
/* =====================================================================
   ASCENDANT cloud layer: accounts and offline-first sync.
   Off when js/config.js has no Supabase URL/key: the app then runs fully offline
   with no accounts, no guilds and no purchases (nothing is faked).
   ===================================================================== */
const CLOUD_ON = !!(CFG.supabaseUrl && CFG.supabaseAnonKey);
const CLOUD_URL = (CFG.supabaseUrl || "").replace(/\/$/, "");
const SESSION_KEY = "ascendant_session";
const emailOf = u => `${String(u).toLowerCase()}@users.ascendant.app`;   // usernames map to hidden addresses; users never see them
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

function friendlyError(j, status){
  const m = (j && (j.msg || j.message || j.error_description || j.error)) || "";
  if (/Invalid login credentials/i.test(m)) return "Wrong username or password.";
  if (/already registered|already exists/i.test(m)) return "That username is taken.";
  if (/Database error saving new user/i.test(m)) return "Could not create the account. Usernames are 3 to 20 letters, numbers or underscores.";
  if (/Password should be/i.test(m)) return "Password must be at least 8 characters.";
  if (/Email not confirmed/i.test(m)) return "The server still requires email confirmation. Turn it off in Supabase (see README).";
  if (status === 429) return "Too many attempts. Wait a minute and try again.";
  return m || `Server error (${status}).`;
}
const sessFrom = (j, username) => ({access_token: j.access_token, refresh_token: j.refresh_token,
  expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600), user_id: j.user && j.user.id, username});

const Cloud = {
  session: null,
  loadSession(){ try { this.session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch(e){ this.session = null; } return this.session; },
  saveSession(s){ this.session = s; try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); } catch(e){} },
  async http(method, path, body, opt = {}){
    const auth = opt.auth !== false, h = {apikey: CFG.supabaseAnonKey, "Content-Type": "application/json"};
    if (auth && this.session){ await this.ensureFresh(); h.Authorization = "Bearer " + this.session.access_token; }
    let r;
    try { r = await fetch(CLOUD_URL + path, {method, headers: h, body: body === undefined ? undefined : JSON.stringify(body)}); }
    catch(e){ const err = new Error("No internet connection. Your training stays saved on this phone and syncs later."); err.offline = true; throw err; }
    const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch(e){ j = t; }
    if (r.status === 401 && auth && this.session && !opt.retried){
      if (await this.refresh()) return this.http(method, path, body, Object.assign({}, opt, {retried: true}));
      this.expired(); const e = new Error("Your session expired. Sign in again."); e.status = 401; throw e;
    }
    if (!r.ok){ const e = new Error(friendlyError(j, r.status)); e.status = r.status; e.body = j; throw e; }
    return j;
  },
  async ensureFresh(){ const s = this.session; if (s && s.expires_at && s.expires_at * 1000 < Date.now() + 60000) await this.refresh(); },
  async refresh(){
    const s = this.session; if (!s || !s.refresh_token) return false;
    try {
      const r = await fetch(CLOUD_URL + "/auth/v1/token?grant_type=refresh_token", {method: "POST", headers: {apikey: CFG.supabaseAnonKey, "Content-Type": "application/json"}, body: JSON.stringify({refresh_token: s.refresh_token})});
      if (!r.ok) return false; this.saveSession(sessFrom(await r.json(), s.username)); return true;
    } catch(e){ return false; }
  },
  expired(){ this.saveSession(null); S = null; UI.onb = null; UI.auth = {step:"signin", err:"Your session expired. Sign in again."}; render(); },
  rpc(fn, args){ return this.http("POST", "/rest/v1/rpc/" + fn, args || {}); },
  fn(name, args){ return this.http("POST", "/functions/v1/" + name, args || {}); },
  async signUp(username, password, displayName){
    const j = await this.http("POST", "/auth/v1/signup", {email: emailOf(username), password, data:{username, display_name: displayName}}, {auth:false});
    if (!j || !j.access_token) throw new Error("Account created, but the server did not sign you in. Turn off email confirmation in Supabase (see README).");
    this.saveSession(sessFrom(j, username)); return j;
  },
  async signIn(username, password){
    const j = await this.http("POST", "/auth/v1/token?grant_type=password", {email: emailOf(username), password}, {auth:false});
    this.saveSession(sessFrom(j, username)); return j;
  },
  async signOut(){ try { await this.http("POST", "/auth/v1/logout", {}); } catch(e){} this.saveSession(null); },
  changePassword(pw){ return this.http("PUT", "/auth/v1/user", {password: pw}); }
};

/* account cache: role, membership and master guild are kept on the phone so the app works offline */
async function refreshAccount(){
  if (!CLOUD_ON || !Cloud.session || !S || S.demo) return null;
  const a = await Cloud.rpc("my_account");
  S.cloudAcct = {id: a.id, username: a.username, display_name: a.display_name, role: a.role, membership: a.membership, master_guild: a.master_guild, at: Date.now()};
  Sync.quietSave(); return a;
}
const acct = () => (S && S.cloudAcct) || null;
const role = () => (acct() && acct().role) || "participant";

/* ---------------- offline-first sync ----------------
   Every change is saved on the phone first. Changed days and the settings blob are pushed in the
   background, then anything newer on the server is pulled. If the same day was changed here since the
   last sync, the phone's version wins. Photos never leave the phone. */
const Sync = {
  timer: null, running: false, again: false, applying: false, status: "idle", lastError: null,
  stateOf(s){ const o = {}; for (const k in s) if (!["logs", "photos", "sync", "cloudAcct", "cloudWallet", "demo", "guild", "guildSeen"].includes(k)) o[k] = s[k]; return o; },
  hash(o){ const s = JSON.stringify(o === undefined ? null : o); let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36) + "." + s.length; },
  active(){ return CLOUD_ON && !!Cloud.session && !!S && !S.demo && !UI.onb; },
  schedule(ms){ if (!this.active() || this.applying) return; clearTimeout(this.timer); this.timer = setTimeout(() => this.run(), ms ?? 2500); },
  quietSave(){ this.applying = true; try { save(); } finally { this.applying = false; } },
  async run(){
    if (!this.active()) return false;
    if (this.running){ this.again = true; return false; }
    this.running = true; this.status = "syncing"; let pushedDays = 0, applied = false;
    try {
      const sy = S.sync = S.sync || {hashes:{}, stateHash:null, lastPull:null};
      const changed = [];
      for (const k in S.logs){ const h = this.hash(S.logs[k]); if (sy.hashes[k] !== h) changed.push({day:k, data:S.logs[k], h}); }
      for (const k in sy.hashes) if (!(k in S.logs)) changed.push({day:k, data:null, h:null});
      let st = this.stateOf(S), sh = this.hash(st);
      for (let i = 0; i < changed.length || (i === 0 && sh !== sy.stateHash); i += 300){
        const batch = changed.slice(i, i + 300);
        await Cloud.rpc("sync_push", {p_logs: batch.map(c => ({day:c.day, data:c.data})), p_state: i === 0 && sh !== sy.stateHash ? st : null});
        batch.forEach(c => { if (c.h) sy.hashes[c.day] = c.h; else delete sy.hashes[c.day]; });
        if (i === 0) sy.stateHash = sh;
        pushedDays += batch.length;
      }
      const pr = await Cloud.rpc("sync_pull", {p_since: sy.lastPull});
      for (const row of pr.logs || []){
        const local = S.logs[row.day], dirty = this.hash(local) !== (sy.hashes[row.day] || this.hash(undefined));
        if (dirty) continue;                                         // changed here during this sync: phone wins
        const remoteH = row.data === null ? null : this.hash(row.data);
        if ((remoteH || null) === (sy.hashes[row.day] || null)) continue;
        if (row.data === null){ delete S.logs[row.day]; delete sy.hashes[row.day]; } else { S.logs[row.day] = row.data; sy.hashes[row.day] = remoteH; }
        applied = true;
      }
      if (pr.state && this.hash(this.stateOf(S)) === sy.stateHash){
        const rh = this.hash(pr.state.data);
        if (rh !== sy.stateHash){ Object.assign(S, pr.state.data); S = migrate(S); sy.stateHash = this.hash(this.stateOf(S)); applied = true; }
      }
      sy.lastPull = pr.now; sy.at = Date.now();
      this.quietSave(); this.status = "ok"; this.lastError = null;
      if (pushedDays || applied || !UI.scoredToday){ UI.scoredToday = true; Cloud.fn("compute-scores").catch(() => {}); }
      if (applied && !UI.onb && !UI.editKey) render();
      return true;
    } catch(e){
      this.status = e.offline ? "offline" : "error"; this.lastError = e.message; return false;
    } finally {
      this.running = false; if (this.again){ this.again = false; this.schedule(1000); }
    }
  }
};
afterSave = () => Sync.schedule();   // core.js save() calls this
window.addEventListener("online", () => Sync.schedule(500));

/* build a local profile from the server copy (new phone, reinstalled app) */
async function restoreFromServer(){
  const pr = await Cloud.rpc("sync_pull", {p_since: null});
  if (!pr.state) return false;
  const logs = {}, hashes = {};
  for (const row of pr.logs || []) if (row.data !== null){ logs[row.day] = row.data; hashes[row.day] = Sync.hash(row.data); }
  S = migrate(Object.assign({}, pr.state.data, {logs, photos: []}));
  S.sync = {hashes, stateHash: Sync.hash(Sync.stateOf(S)), lastPull: pr.now, at: Date.now()};
  Sync.quietSave(); return true;
}

