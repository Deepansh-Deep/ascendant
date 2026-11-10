"use strict";
/* =====================================================================
   ASCENDANT accounts and guild screens
   Sign in / register (participant or guild master), join-guild step,
   guild leaderboard, guild master management, owner admin panel, shop checkout.
   ===================================================================== */
const ROLE_NAME = {owner: "Owner", guild_master: "Guild Master", participant: "Participant"};
UI.g = {board: {}, prev: {}};
const fmtDate = d => d ? new Date(d).toLocaleDateString("en-IN", {day: "numeric", month: "short", year: "numeric"}) : "never";
const rupees = p => "₹" + (p / 100).toLocaleString("en-IN");
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const logoHTML = (url, name, size = 52) => url ? `<img class="glogo" src="${esc(url)}" alt="${esc(name)} logo" style="--s:${size}px">` : hexBadge((name || "G")[0].toUpperCase(), size, "rank");

/* ---------------- AUTH SCREENS ---------------- */
function authField(id, label, opt = {}){
  const f = UI.auth.f || (UI.auth.f = {});
  return `<label class="lab" for="af-${id}">${label}</label><input id="af-${id}" class="input" data-af="${id}" value="${esc(f[id] || "")}"
    ${opt.type ? `type="${opt.type}"` : ""} ${opt.ph ? `placeholder="${esc(opt.ph)}"` : ""} ${opt.ac ? `autocomplete="${opt.ac}"` : ""} ${opt.max ? `maxlength="${opt.max}"` : ""} ${opt.caps ? 'autocapitalize="characters"' : 'autocapitalize="off"'} spellcheck="false">
    ${opt.hint ? `<div class="tiny mute" id="hint-${id}">${opt.hint}</div>` : ""}`;
}
function renderAuth(){
  const a = UI.auth, err = a.err ? `<p class="err" role="alert">${esc(a.err)}</p>` : "", busy = a.busy ? "disabled" : "";
  const back = to => `<button class="link mute" data-act="ac-step" data-v="${to}">${ICON.left ? "" : ""}Back</button>`;
  document.documentElement.dataset.theme = "gold";
  let body = "";
  if (a.step === "welcome") body = `<div class="welcome">${hunterStage("welcome-stage", {mode: "hero", interactive: true})}
      <div class="w-copy"><h1>Train in real life.<br>Level up here.</h1><p class="mute">Log every set, earn XP, rank up and grow your aura. Compete with your gym's guild.</p></div></div>
      <button class="btn" data-act="ac-step" data-v="role">Create account</button>
      <div class="grid2"><button class="btn ghost" data-act="ac-step" data-v="signin">Sign in</button><button class="btn ghost" data-act="demo">Try demo data</button></div>`;
  if (a.step === "signin") body = `<div class="grow"><h1>Sign in</h1><p class="mute sm">Participants, guild masters and the owner all sign in here.</p>
      ${authField("username", "Username", {ac: "username", max: 20})}${authField("password", "Password", {type: "password", ac: "current-password"})}${err}
      <button class="btn" data-act="ac-signin" ${busy}>${a.busy ? "Signing in…" : "Sign in"}</button>
      <p class="tiny mute">Forgot your password? Ask Ascendant to reset it for you.</p></div>
      <div class="row between">${back("welcome")}<button class="link" data-act="ac-step" data-v="role">Create an account</button></div>`;
  if (a.step === "role") body = `<div class="grow"><h1>Who are you?</h1>
      <button class="choice" data-act="ac-step" data-v="participant"><b>Participant</b><span class="sm mute">Train solo, earn XP and grow your aura. Join your gym's guild now or later.</span></button>
      <button class="choice" data-act="ac-step" data-v="master"><b>Guild Master</b><span class="sm mute">Register your gym, add your logo and approve members. Needs a guild master code from Ascendant.</span></button>
      <p class="tiny mute">Owner of Ascendant? Sign in with your account.</p></div>
      <div class="row between">${back("welcome")}<button class="link" data-act="ac-step" data-v="signin">I already have an account</button></div>`;
  if (a.step === "participant") body = `<div class="grow"><h1>Create your account</h1>
      ${authField("display", "Your name", {ac: "name", max: 40, ph: "Rahul Kumar"})}
      ${authField("username", "Username", {ac: "username", max: 20, ph: "rahul_k", hint: "3 to 20 letters, numbers or underscore. Shown on leaderboards."})}
      ${authField("password", "Password", {type: "password", ac: "new-password", hint: "At least 8 characters."})}${authField("password2", "Repeat password", {type: "password", ac: "new-password"})}${err}
      <button class="btn" data-act="ac-signup-p" ${busy}>${a.busy ? "Creating…" : "Create account"}</button></div>${back("role")}`;
  if (a.step === "master") body = `<div class="grid-gap grow"><h1>Register your gym</h1><p class="mute sm">Ascendant gives you a guild master code when your gym joins.</p>
      ${authField("code", "Guild master code", {caps: true, ph: "GM-XXXXXXXX", max: 11, hint: " "})}
      ${authField("gym", "Gym name", {max: 60, ph: "Yodha Gym"})}${authField("city", "City", {max: 40, ph: "Bokaro Steel City"})}
      ${authField("display", "Your name", {ac: "name", max: 40})}
      ${authField("username", "Your username", {ac: "username", max: 20, hint: "3 to 20 letters, numbers or underscore."})}
      ${authField("password", "Password", {type: "password", ac: "new-password", hint: "At least 8 characters."})}${authField("password2", "Repeat password", {type: "password", ac: "new-password"})}${err}
      <button class="btn" data-act="ac-signup-m" ${busy}>${a.busy ? "Registering…" : "Register gym"}</button></div>${back("role")}`;
  if (a.step === "join") body = `<div class="grow"><h1>Join your gym's guild?</h1><p class="mute">Members of a guild appear on their gym's leaderboard. The guild master approves each request. You can also do this later from the Guild tab.</p>
      ${a.joinOpen ? `${authField("join", "Gym join code", {caps: true, max: 6, ph: "6-letter code from your gym"})}${err}
        <button class="btn" data-act="ac-join-onb" ${busy}>${a.busy ? "Sending…" : "Send join request"}</button><button class="btn quiet" data-act="ac-join-skip">Not now</button>`
      : `<div class="grid2"><button class="btn" data-act="ac-join-yes">Yes, join a guild</button><button class="btn ghost" data-act="ac-join-skip">No, train solo</button></div>`}</div>`;
  if (a.step === "bring") body = `<div class="grow"><h1>Training found on this phone</h1><p class="mute">This phone has ${Object.keys(a.legacy.logs).length} days of training from before accounts, for ${esc(a.legacy.profile.name)}. Move it into @${esc(Cloud.session.username)}? It is then backed up to your account.</p>
      <div class="grid2"><button class="btn" data-act="ac-bring-yes">Move it</button><button class="btn ghost" data-act="ac-bring-no">Start fresh</button></div></div>`;
  if (a.step === "restoring") body = `<div class="grow center"><span class="spin"></span><p class="mute">Loading your training from your account…</p></div>`;
  $("#app").innerHTML = `<div class="onb auth">${body}</div>`;
  mountStage();
}
const authVal = k => ((UI.auth.f || {})[k] || "").trim();
function authErr(msg){ UI.auth.err = msg; UI.auth.busy = false; renderAuth(); }
function readLegacy(){
  try { const s = JSON.parse(localStorage.getItem(KEY) || "null");
    if (s && s.profile && s.logs && !s.demo && Object.keys(s.logs).length && !localStorage.getItem(KEY + ":moved")) return s; } catch(e){}
  return null;
}
async function afterLogin(){
  STORE_KEY = KEY + ":" + Cloud.session.user_id;
  S = load();
  if (S){ return finishAuth(); }
  UI.auth = {step: "restoring"}; renderAuth();
  try { if (await restoreFromServer()) return finishAuth("Your training is restored"); }
  catch(e){ UI.auth = {step: "signin", err: e.message}; return renderAuth(); }
  const legacy = readLegacy();
  if (legacy){ UI.auth = {step: "bring", legacy}; return renderAuth(); }
  return finishAuth();
}
function finishAuth(msg){
  if (UI.pendingJoin){ UI.pendingJoin = false; UI.auth = {step: "join"}; return renderAuth(); }
  UI.auth = null; UI.achInit = false;
  if (S && !S.seen) initSeen();
  if (!S){ UI.onb = blankOnb(); UI.onb.name = Cloud.session.username; UI.onb.step = 1; render(); return; }
  UI.tab = "home"; render(); if (msg) toast(msg);
  refreshAccount().then(() => render()).catch(() => {}); Sync.run();
}
function validNewAccount(){
  const u = authVal("username").toLowerCase(), p = (UI.auth.f || {}).password || "", p2 = (UI.auth.f || {}).password2 || "";
  if (!authVal("display")) return "Enter your name";
  if (!USERNAME_RE.test(u)) return "Usernames are 3 to 20 letters, numbers or underscore";
  if (p.length < 8) return "Password must be at least 8 characters";
  if (p !== p2) return "The two passwords do not match";
  return null;
}

/* ---------------- GUILD TAB ---------------- */
const CATS = [["overall", "Overall"], ["consistency", "Consistency"], ["strength", "Strength"], ["progress", "Progress"]];
const PERIODS = [["week", "Weekly"], ["month", "Monthly"], ["all", "All time"]];
function scoreExplain(sc){
  const d = sc.detail;
  return [["consistency", "Consistency", sc.consistency, `${d.done} of ${d.planned} planned days trained (up to 6 per week count)`],
    ["strength", "Strength", sc.strength, d.lifts ? `Top ${d.lifts} lift${d.lifts > 1 ? "s" : ""}: estimated 1RM averages ${d.rel}× bodyweight (1.5× = 100), or skill-tree mastery if higher` : "Skill-tree mastery (no weighted lifts in this period)"],
    ["progress", "Progress", sc.progress, `Average estimated-1RM gain ${d.gainPct}% vs your previous 4 weeks (capped), plus ${d.skillsIn} skill unlock${d.skillsIn === 1 ? "" : "s"}`],
    ["overall", "Overall", sc.overall, "40% consistency + 30% progress + 30% strength"]];
}
function localScores(C){
  const per = UI.gper || "week", sc = guildScores(C, per);
  return `<section class="card"><div class="sec-h"><h3>How your scores are calculated</h3></div>${segs(PERIODS, per, "gper")}
    ${scoreExplain(sc).map(([k, n, v, why]) => `<div class="score ${k === "overall" ? "ov" : ""}"><div class="row between"><b>${n}</b><b class="num">${v}</b></div><i class="track"><i style="width:${v}%"></i></i><span class="tiny mute">${why}</span></div>`).join("")}
    <p class="tiny mute">The server recalculates these from your synced workouts with the same formulas, so nobody can type in a score. Beginners can top Consistency and Progress because both compare you with your own past. Purchases never affect any score.</p></section>`;
}
function boardCard(gid){
  const cat = UI.gcat || "overall", per = UI.gper || "week", key = (gid || "me") + ":" + cat + ":" + per, b = UI.g.board[key];
  let list;
  if (!b || b.loading) list = `<p class="mute sm"><span class="spin sm"></span> Loading leaderboard…</p>`;
  else if (b.err) list = `<p class="sm bad-t">${esc(b.err)}</p><button class="btn ghost sm" data-act="ac-grefresh">Try again</button>`;
  else { const me = b.rows.find(r => r.is_me), prev = UI.g.prev[key], delta = me && prev ? prev - me.rank : 0;
    list = `${me ? `<div class="me-pos"><span class="num big">#${me.rank}</span><div><b>Your position</b><div class="tiny mute">of ${plural(me.member_count, "member")}${prev ? (delta > 0 ? `, up ${delta} since your last visit` : delta < 0 ? `, down ${-delta} since your last visit` : ", same as your last visit") : ""}</div></div></div>` : ""}
      ${b.rows.length ? `<ol class="board">${b.rows.slice(0, 100).map(r => `<li class="${r.is_me ? "me" : ""}"><span class="rk num">${r.rank}</span><span class="nm">${esc(r.display_name || r.username)}<span class="tiny mute">@${esc(r.username)}</span></span><span class="sc num">${r.score}</span></li>`).join("")}</ol>` : `<p class="mute sm">No members yet.</p>`}
      <p class="tiny mute">Live from the server, ${new Date(b.at).toLocaleTimeString("en-IN", {hour: "2-digit", minute: "2-digit"})}. Scores update when members sync.</p>`; }
  return `${segs(CATS, cat, "gcat")}${segs(PERIODS, per, "gper")}<section class="card">${list}</section>`;
}
function viewGuild(C){
  const head = right => `<div class="page-h"><h1>${role() === "owner" ? "Admin" : "Guild"}</h1>${right || ""}</div>`;
  if (!CLOUD_ON) return head() + `<section class="card notice"><h3>Offline build</h3><p class="sm">This copy of the app is not connected to the Ascendant server, so there are no accounts, guilds or live rankings here, and the app will not invent any.</p></section>` + localScores(C);
  if (S.demo) return head() + `<section class="card notice"><h3>Demo data cannot join a guild</h3><p class="sm">Guild rankings only accept real training. Create an account to join your gym.</p><button class="btn" data-act="reset">Leave demo</button></section>` + localScores(C);
  const a = acct();
  if (!a) return head() + `<section class="card"><p class="mute sm"><span class="spin sm"></span> Connecting to your account…</p>${Sync.lastError ? `<p class="sm bad-t">${esc(Sync.lastError)}</p><button class="btn ghost sm" data-act="ac-grefresh">Try again</button>` : ""}</section>`;
  const sync = `<button class="btn sm ghost" data-act="ac-grefresh">Refresh</button>`;
  if (a.role === "owner") return head(sync) + viewAdmin(C);
  const mg = a.master_guild, m = a.membership;
  if (mg){
    const t = UI.mtab || "board";
    const top = `<section class="card gid">${logoHTML(mg.logo_url, mg.name)}<div class="grow"><h3>${esc(mg.name)}</h3><div class="tiny mute">${esc(mg.city || "")}${mg.city ? ", " : ""}${plural(mg.members, "member")}. You are the Guild Master.</div></div></section>
      ${mg.active ? "" : `<section class="card notice"><h3>Subscription expired</h3><p class="sm">Your guild's leaderboards are locked for members and new members cannot join. Contact Ascendant to renew.</p></section>`}
      ${segs([["board", "Leaderboard"], ["manage", `Manage${mg.pending ? ` (${mg.pending})` : ""}`]], t, "ac-mtab")}`;
    return head(sync) + top + (t === "manage" ? viewManage(mg) : boardCard());
  }
  if (!m) return head(sync) + `<section class="card"><h3>Join your gym's guild</h3><p class="sm mute">Get the 6-letter join code from your gym. The guild master approves your request. Only your name, username and four scores are visible to the guild, never your logs, photos or weight.</p>
      <label class="lab" for="gcode">Gym join code</label><input id="gcode" class="input" autocapitalize="characters" maxlength="6" placeholder="ABC123">
      <button class="btn" data-act="ac-join">Send join request</button><p class="err" id="gerr" role="alert"></p></section>` + localScores(C);
  if (m.status === "pending") return head(sync) + `<section class="card gid">${logoHTML(m.logo_url, m.guild_name)}<div class="grow"><h3>${esc(m.guild_name)}</h3><div class="tiny mute">Request sent. The guild master needs to approve you.</div></div></section>
      <button class="btn quiet" data-act="ac-cancel-join">Cancel request</button>` + localScores(C);
  const hist = UI.g.hist;
  return head(sync) + `<section class="card gid">${logoHTML(m.logo_url, m.guild_name)}<div class="grow"><h3>${esc(m.guild_name)}</h3><div class="tiny mute">${esc(m.city || "")}</div></div></section>
    ${m.active ? boardCard() : `<section class="card notice"><h3>Guild inactive</h3><p class="sm">This gym's Ascendant subscription has expired, so its leaderboard is paused. Your own training is not affected.</p></section>`}
    <section class="card"><div class="row between"><h3>Competition history</h3><button class="btn sm ghost" data-act="ac-ghist">${hist ? "Refresh" : "Load"}</button></div>
      ${hist ? (hist.err ? `<p class="sm bad-t">${esc(hist.err)}</p>` : hist.rows.length ? hist.rows.slice(0, 16).map(r => `<div class="line"><span>${r.period === "week" ? "Week of " + esc(r.period_key) : esc(r.period_key)}, ${esc(r.category)}</span><b class="num">#${r.rank} of ${r.member_count}</b></div>`).join("") : `<p class="mute sm">Finished weeks and months appear here.</p>`) : `<p class="mute sm">Your final positions in past weeks and months.</p>`}</section>
    ${localScores(C)}<button class="btn danger quiet" data-act="ac-leave">Leave guild</button>`;
}
function viewManage(mg){
  const reqs = UI.g.reqs, mem = UI.g.members;
  return `<section class="card"><h3>Gym profile</h3>
      <div class="row gap"><button class="logo-pick" data-act="ac-logo" aria-label="Change logo">${logoHTML(mg.logo_url, mg.name, 64)}<span class="tiny">Change logo</span></button>
      <div class="grow"><label class="lab" for="mg-name">Gym name</label><input id="mg-name" class="input" maxlength="60" value="${esc(mg.name)}">
      <label class="lab" for="mg-city">City</label><input id="mg-city" class="input" maxlength="40" value="${esc(mg.city || "")}"></div></div>
      <button class="btn ghost" data-act="ac-gsave">Save gym profile</button></section>
    <section class="card"><h3>Join code</h3><p class="sm mute">Give this code to your members. They enter it in the app, and you approve them below.</p>
      <div class="code-big num">${esc(mg.join_code)}</div>
      <div class="grid2"><button class="btn ghost sm" data-act="ac-copy" data-v="${esc(mg.join_code)}">Copy code</button><button class="btn quiet sm" data-act="ac-regen">New code</button></div></section>
    <section class="card"><h3>Join requests${reqs && reqs.length ? ` (${reqs.length})` : ""}</h3>
      ${!reqs ? `<p class="mute sm"><span class="spin sm"></span> Loading…</p>` : reqs.length ? reqs.map(r => `<div class="line"><div><b>${esc(r.display_name || r.username)}</b><div class="tiny mute">@${esc(r.username)}, asked ${fmtDate(r.requested_at)}</div></div>
        <div class="row gap"><button class="btn sm quiet" data-act="ac-reject" data-u="${r.user_id}">Reject</button><button class="btn sm" data-act="ac-approve" data-u="${r.user_id}">Approve</button></div></div>`).join("") : `<p class="mute sm">No pending requests.</p>`}</section>
    <section class="card"><h3>Members${mem ? ` (${mem.length})` : ""}</h3>
      ${!mem ? `<p class="mute sm"><span class="spin sm"></span> Loading…</p>` : mem.map(r => `<div class="line"><div><b>${esc(r.display_name || r.username)}</b><div class="tiny mute">@${esc(r.username)}, this week ${r.week_overall ?? 0} pts, last active ${fmtDate(r.last_seen)}</div></div>
        ${r.username === acct().username ? `<span class="pill">You</span>` : `<button class="btn sm quiet" data-act="ac-remove" data-u="${r.user_id}" data-n="${esc(r.username)}">Remove</button>`}</div>`).join("")}</section>
    <section class="card"><h3>Subscription</h3><p class="sm">${mg.active ? `Active${mg.paid_until ? ` until <b>${fmtDate(mg.paid_until)}</b>` : ""}.` : "Expired."} Renewals are handled by Ascendant.</p></section>`;
}

/* ---------------- OWNER ADMIN ---------------- */
function viewAdmin(C){
  const t = UI.atab || "overview", A = UI.g.admin || {};
  let body = "";
  if (t === "overview"){ const s = A.stats;
    body = `<section class="card">${s ? `<div class="cmp"><div><b class="num">${s.users}</b><span>Users</span></div><div><b class="num">${s.active_7d}</b><span>Active 7 days</span></div>
        <div><b class="num">${s.active_guilds}/${s.guilds}</b><span>Active guilds</span></div></div>` : `<p class="mute sm"><span class="spin sm"></span> Loading…</p>`}</section>
      <section class="card"><h3>Create guild master codes</h3><p class="sm mute">Give one code to each gym after they pay. The gym owner registers with it and sets up the guild himself.</p>
        <div class="grid2"><div><label class="lab" for="cc-n">How many</label><input id="cc-n" class="input" inputmode="numeric" value="1"></div>
        <div><label class="lab" for="cc-days">Free days included</label><input id="cc-days" class="input" inputmode="numeric" value="30"></div></div>
        <div class="grid2"><div><label class="lab" for="cc-valid">Code valid for (days)</label><input id="cc-valid" class="input" inputmode="numeric" value="30"></div>
        <div><label class="lab" for="cc-note">Note</label><input id="cc-note" class="input" maxlength="80" placeholder="Yodha Gym, paid Nov"></div></div>
        <button class="btn" data-act="ac-mkcodes">Create codes</button>
        ${A.newCodes ? `<div class="newcodes">${A.newCodes.map(c => `<div class="line"><b class="num code">${esc(c)}</b><button class="btn sm ghost" data-act="ac-copy" data-v="${esc(c)}">Copy</button></div>`).join("")}</div>` : ""}</section>
      <section class="card"><h3>Recent owner actions</h3>${!A.log ? `<p class="mute sm"><span class="spin sm"></span> Loading…</p>` : A.log.length ? A.log.map(l => `<div class="line"><div><b>${l.action === "grant_crystals" ? `${l.detail.amount > 0 ? "+" : ""}${l.detail.amount} crystals to @${esc(l.target_name)}` : l.action === "delete_user" ? `Deleted @${esc(l.target_name)}` : `Deleted guild ${esc(l.target_name)}`}</b>
        ${l.detail && l.detail.reason ? `<div class="tiny mute">${esc(l.detail.reason)}</div>` : ""}</div><span class="tiny mute">${fmtDate(l.created_at)}</span></div>`).join("") : `<p class="mute sm">Nothing yet.</p>`}</section>`; }
  if (t === "guilds") body = !A.guilds ? `<p class="mute sm"><span class="spin sm"></span> Loading…</p>` : A.guilds.length ? A.guilds.map(g => `<section class="card"><div class="row gap">${logoHTML(g.logo_url, g.name, 44)}<div class="grow"><h3>${esc(g.name)}</h3>
      <div class="tiny mute">${esc(g.city || "")}, master @${esc(g.master_username || "none")}, ${plural(g.members, "member")}${g.pending ? `, ${g.pending} pending` : ""}</div></div>
      <span class="pill ${g.active ? "good" : "bad"}">${g.active ? "Active" : g.status === "suspended" ? "Suspended" : "Expired"}</span></div>
      <div class="line"><span class="sm">Paid until</span><input type="date" class="timeinput" data-gdate="${g.id}" value="${g.paid_until || ""}" aria-label="Paid until"></div>
      <div class="row gap"><button class="btn sm ghost" data-act="ac-gextend" data-g="${g.id}" data-d="30">+30 days</button><button class="btn sm ghost" data-act="ac-gextend" data-g="${g.id}" data-d="365">+1 year</button>
      <button class="btn sm quiet" data-act="ac-gstatus" data-g="${g.id}" data-v="${g.status === "suspended" ? "active" : "suspended"}">${g.status === "suspended" ? "Reactivate" : "Suspend"}</button>
      <button class="btn sm quiet" data-act="ac-gview" data-g="${g.id}" data-n="${esc(g.name)}">Leaderboard</button><button class="btn sm danger" data-act="ac-delguild" data-g="${g.id}" data-n="${esc(g.name)}">Delete</button></div></section>`).join("") : `<section class="card"><p class="mute sm">No guilds yet. Create a guild master code and give it to a gym.</p></section>`;
  if (t === "codes") body = !A.codes ? `<p class="mute sm"><span class="spin sm"></span> Loading…</p>` : `<section class="card">${A.codes.length ? A.codes.map(c => { const exp = c.expires_at && new Date(c.expires_at) < new Date();
      const st = c.used_by_username ? `Used by @${esc(c.used_by_username)} for ${esc(c.guild_name || "a gym")}` : c.revoked ? "Revoked" : exp ? "Expired" : `Unused, ${c.grant_days} free days${c.expires_at ? `, valid until ${fmtDate(c.expires_at)}` : ""}`;
      return `<div class="line"><div><b class="num code">${esc(c.code)}</b><div class="tiny mute">${st}${c.note ? `. ${esc(c.note)}` : ""}</div></div>
        ${!c.used_by_username && !c.revoked && !exp ? `<div class="row gap"><button class="btn sm ghost" data-act="ac-copy" data-v="${esc(c.code)}">Copy</button><button class="btn sm quiet" data-act="ac-revoke" data-v="${esc(c.code)}">Revoke</button></div>` : ""}</div>`; }).join("") : `<p class="mute sm">No codes yet.</p>`}</section>`;
  if (t === "users") body = `<section class="card"><div class="row gap"><input id="us-q" class="input grow" placeholder="Search username or name" value="${esc(A.q || "")}"><button class="btn sm" data-act="ac-usearch">Search</button></div></section>
    ${!A.users ? "" : `<section class="card">${A.users.length ? A.users.map(u => `<div class="line"><div><b>${esc(u.display_name || u.username)}</b> <span class="pill">${ROLE_NAME[u.role]}</span>
      <div class="tiny mute">@${esc(u.username)}${u.guild_name ? `, ${esc(u.guild_name)} (${esc(u.membership)})` : ""}, joined ${fmtDate(u.created_at)}, last active ${fmtDate(u.last_seen)}</div></div>
      <div class="row gap wrap"><button class="btn sm quiet" data-act="ac-resetpw" data-u="${u.id}" data-n="${esc(u.username)}">Reset password</button>${u.role === "owner" ? "" : `<button class="btn sm danger" data-act="ac-deluser" data-u="${u.id}" data-n="${esc(u.username)}">Delete</button>`}</div></div>`).join("") : `<p class="mute sm">No users found.</p>`}</section>`}`;
  return segs([["overview", "Overview"], ["guilds", "Guilds"], ["codes", "Codes"], ["users", "Users"]], t, "ac-atab") + body;
}

/* ---------------- loaders ---------------- */
let guildLoading = false;
async function guildLoad(force){
  if (!CLOUD_ON || !Cloud.session || !S || S.demo || guildLoading) return;
  guildLoading = true; let changed = false;
  try {
    if (!acct() || force || Date.now() - (acct().at || 0) > 20e3){ await refreshAccount(); changed = true; }
    const a = acct();
    if (a.role === "owner"){
      const A = UI.g.admin = UI.g.admin || {}, t = UI.atab || "overview";
      if (t === "overview" && (!A.stats || force)){ A.stats = await Cloud.rpc("owner_stats"); A.log = await Cloud.rpc("owner_log_recent"); changed = true; }
      if (t === "guilds" && (!A.guilds || force)){ A.guilds = await Cloud.rpc("owner_guilds"); changed = true; }
      if (t === "codes" && (!A.codes || force)){ A.codes = await Cloud.rpc("owner_codes"); changed = true; }
      if (t === "users" && (!A.users || force)){ A.users = await Cloud.rpc("owner_users", {p_search: A.q || ""}); changed = true; }
    } else if (a.master_guild && (UI.mtab || "board") === "manage"){
      if (!UI.g.reqs || force){ UI.g.reqs = await Cloud.rpc("master_requests"); changed = true; }
      if (!UI.g.members || force){ UI.g.members = await Cloud.rpc("master_members"); changed = true; }
    } else if ((a.master_guild && a.master_guild.active) || (a.membership && a.membership.status === "approved" && a.membership.active)){
      const cat = UI.gcat || "overall", per = UI.gper || "week", key = "me:" + cat + ":" + per;
      if (!UI.g.board[key] || force){
        UI.g.board[key] = {loading: true};
        if (!UI.g.scored){ UI.g.scored = true; await Sync.run(); try { await Cloud.fn("compute-scores"); } catch(e){} }
        try {
          const rows = await Cloud.rpc("guild_leaderboard", {p_category: cat, p_period: per});
          UI.g.board[key] = {rows, at: Date.now()};
          const me = rows.find(r => r.is_me); S.guildSeen = S.guildSeen || {};
          if (me){ UI.g.prev[key] = UI.g.prev[key] ?? (S.guildSeen[cat + ":" + per] || {}).rank; S.guildSeen[cat + ":" + per] = {rank: me.rank, of: me.member_count, at: Date.now()}; Sync.quietSave(); }
        } catch(e){ UI.g.board[key] = {err: e.message}; }
        changed = true;
      }
    }
  } catch(e){ Sync.lastError = e.message; changed = true; if (!acct()) toast(e.message); }
  finally { guildLoading = false; }
  if (changed && UI.tab === "guild" && !UI.auth) render();
}

/* ---------------- settings card + shop ---------------- */
function accountCard(){
  if (!CLOUD_ON || !Cloud.session || !S || S.demo) return "";
  const a = acct(), st = Sync.status, at = S.sync && S.sync.at;
  return `<section class="card"><div class="row between gap"><div><h3>@${esc(Cloud.session.username)}</h3><div class="tiny mute">${ROLE_NAME[role()]}${a && a.membership ? `, ${esc(a.membership.guild_name)}${a.membership.status === "pending" ? " (pending)" : ""}` : ""}</div></div>
      <span class="pill ${st === "ok" ? "good" : st === "offline" ? "" : st === "error" ? "bad" : ""}">${st === "ok" ? "Synced" : st === "offline" ? "Offline" : st === "error" ? "Sync error" : "Saved on phone"}</span></div>
    <div class="tiny mute">${at ? `Last synced ${new Date(at).toLocaleString("en-IN", {day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"})}.` : "Not synced yet."} ${Sync.lastError && st !== "ok" ? esc(Sync.lastError) : ""}</div>
    <div class="grid3"><button class="btn sm ghost" data-act="ac-syncnow">Sync now</button><button class="btn sm ghost" data-act="ac-chpw">Password</button><button class="btn sm quiet" data-act="ac-signout">Sign out</button></div></section>`;
}

/* ---------------- actions ---------------- */
document.addEventListener("click", async e => {
  const b = e.target.closest("[data-act^='ac-']"); if (!b) return;
  const a = b.dataset.act, v = b.dataset.v;
  const busy = async (fnc, label) => { const t = b.textContent; b.disabled = true; if (label) b.textContent = label; try { return await fnc(); } finally { if (b.isConnected){ b.disabled = false; b.textContent = t; } } };
  try {
    switch (a){
      case "ac-step": UI.auth = {step: v, f: (UI.auth && UI.auth.f) || {}}; renderAuth(); scrollTo(0, 0); return;
      case "ac-signin": {
        const u = authVal("username").toLowerCase(), p = (UI.auth.f || {}).password || "";
        if (!u || !p) return authErr("Enter your username and password");
        UI.auth.busy = true; UI.auth.err = null; renderAuth();
        try { await Cloud.signIn(u, p); } catch(err){ return authErr(err.message); }
        UI.auth.busy = false; return afterLogin(); }
      case "ac-signup-p": {
        const bad = validNewAccount(); if (bad) return authErr(bad);
        const u = authVal("username").toLowerCase();
        UI.auth.busy = true; UI.auth.err = null; renderAuth();
        try { if (!(await Cloud.rpc("username_available", {p_username: u}))) return authErr("That username is taken"); await Cloud.signUp(u, UI.auth.f.password, authVal("display")); }
        catch(err){ return authErr(err.message); }
        UI.pendingJoin = true; UI.auth.busy = false; return afterLogin(); }
      case "ac-signup-m": {
        const code = authVal("code").toUpperCase(), gym = authVal("gym"), city = authVal("city");
        if (!code) return authErr("Enter the guild master code from Ascendant"); if (gym.length < 2) return authErr("Enter your gym's name");
        const bad = validNewAccount(); if (bad) return authErr(bad);
        const u = authVal("username").toLowerCase();
        UI.auth.busy = true; UI.auth.err = null; renderAuth();
        try {
          if (!(await Cloud.rpc("check_master_code", {p_code: code}))) return authErr("This guild master code is invalid, expired or already used");
          if (!(await Cloud.rpc("username_available", {p_username: u}))) return authErr("That username is taken");
          await Cloud.signUp(u, UI.auth.f.password, authVal("display"));
        } catch(err){ return authErr(err.message); }
        try { await Cloud.rpc("become_guild_master", {p_code: code, p_gym_name: gym, p_city: city}); }
        catch(err){ UI.auth.busy = false; toast("Your account was created, but the gym could not be registered: " + err.message); }
        UI.auth.busy = false; UI.tab = "guild"; UI.mtab = "manage"; return afterLogin(); }
      case "ac-join-yes": UI.auth.joinOpen = true; renderAuth(); return;
      case "ac-join-onb": {
        const code = authVal("join").toUpperCase(); if (code.length !== 6) return authErr("Join codes have 6 characters");
        UI.auth.busy = true; UI.auth.err = null; renderAuth();
        try { const r = await Cloud.rpc("request_join", {p_join_code: code}); toast(`Request sent to ${r.guild_name}. The guild master will approve you.`); }
        catch(err){ return authErr(err.message); }
        UI.auth = null; return finishAuth(); }
      case "ac-join-skip": UI.auth = null; return finishAuth();
      case "ac-bring-yes": { const L = UI.auth.legacy; S = migrate(L); S.profile.name = Cloud.session.username; delete S.sync; S.demo = false;
        try { localStorage.setItem(KEY + ":moved", Cloud.session.user_id); } catch(err){} save(); return finishAuth("Your training is now in your account"); }
      case "ac-bring-no": try { localStorage.setItem(KEY + ":moved", "declined"); } catch(err){} return finishAuth();
      case "ac-signout": modal(`<h2>Sign out?</h2><p class="mute">Your training is backed up to your account. Signing out removes it from this phone until you sign in again.</p>
        <div class="grid2"><button class="btn ghost" data-act="close">Cancel</button><button class="btn danger" data-act="ac-signout-yes">Sign out</button></div>`); return;
      case "ac-signout-yes": {
        const ok = await busy(() => Sync.run(), "Syncing…");
        if (!ok && Sync.status !== "ok"){ return modal(`<h2>Not synced</h2><p class="mute">Your latest training has not reached the server (${esc(Sync.lastError || "offline")}). Signing out now would lose it on this phone.</p>
          <div class="grid2"><button class="btn ghost" data-act="close">Stay signed in</button><button class="btn danger" data-act="ac-signout-force">Sign out anyway</button></div>`); }
      } // falls through
      case "ac-signout-force": { const key = STORE_KEY; await Cloud.signOut(); try { localStorage.removeItem(key); } catch(err){}
        S = null; STORE_KEY = KEY; UI.g = {board: {}, prev: {}}; UI.products = null; closeModal(); UI.auth = {step: "welcome"}; render(); scrollTo(0, 0); return; }
      case "ac-syncnow": { await busy(() => Sync.run(), "Syncing…"); try { await refreshAccount(); } catch(err){} render(); toast(Sync.status === "ok" ? "Synced" : "Sync failed: " + (Sync.lastError || "")); return; }
      case "ac-chpw": modal(`<h2>Change password</h2><label class="lab" for="pw1">New password</label><input id="pw1" class="input" type="password" autocomplete="new-password">
        <label class="lab" for="pw2">Repeat new password</label><input id="pw2" class="input" type="password" autocomplete="new-password"><p class="err" id="pwerr"></p>
        <button class="btn" data-act="ac-chpw-save">Save password</button>`); return;
      case "ac-chpw-save": { const p1 = $("#pw1").value, p2 = $("#pw2").value;
        if (p1.length < 8) return void ($("#pwerr").textContent = "At least 8 characters"); if (p1 !== p2) return void ($("#pwerr").textContent = "The passwords do not match");
        try { await busy(() => Cloud.changePassword(p1), "Saving…"); closeModal(); toast("Password changed"); } catch(err){ $("#pwerr").textContent = err.message; } return; }
      // ---- guild: participant
      case "ac-join": { const code = ($("#gcode").value || "").trim().toUpperCase(); if (code.length !== 6) return void ($("#gerr").textContent = "Join codes have 6 characters");
        try { const r = await busy(() => Cloud.rpc("request_join", {p_join_code: code}), "Sending…"); await refreshAccount(); render(); toast(`Request sent to ${r.guild_name}`); }
        catch(err){ $("#gerr").textContent = err.message; } return; }
      case "ac-cancel-join": await busy(() => Cloud.rpc("leave_guild")); await refreshAccount(); render(); toast("Request cancelled"); return;
      case "ac-leave": modal(`<h2>Leave guild?</h2><p class="mute">You disappear from this gym's leaderboard. Your training and history stay with you. To come back you need the guild master's approval again.</p>
        <div class="grid2"><button class="btn ghost" data-act="close">Cancel</button><button class="btn danger" data-act="ac-leave-yes">Leave guild</button></div>`); return;
      case "ac-leave-yes": await Cloud.rpc("leave_guild"); await refreshAccount(); UI.g = {board: {}, prev: {}}; closeModal(); render(); toast("You left the guild"); return;
      case "ac-ghist": { try { const rows = await busy(() => Cloud.rpc("my_competition_history"), "Loading…"); UI.g.hist = {rows};
          const best = rows.filter(r => r.category === "overall").reduce((mn, r) => Math.min(mn, r.rank), 999); if (best < 999){ S.guildBest = Math.min(S.guildBest || 999, best); save(); } }
        catch(err){ UI.g.hist = {err: err.message}; } render(); return; }
      case "ac-grefresh": UI.g.board = {}; UI.g.reqs = null; UI.g.members = null; if (UI.g.admin) UI.g.admin = {q: UI.g.admin.q}; render(); return guildLoad(true);
      // ---- guild master
      case "ac-mtab": UI.mtab = v; render(); return;
      case "ac-approve": case "ac-reject": await busy(() => Cloud.rpc("master_decide", {p_user: b.dataset.u, p_approve: a === "ac-approve"}));
        UI.g.reqs = null; UI.g.members = null; UI.g.board = {}; await refreshAccount(); render(); guildLoad(); toast(a === "ac-approve" ? "Member approved" : "Request rejected"); return;
      case "ac-remove": modal(`<h2>Remove @${esc(b.dataset.n)}?</h2><p class="mute">They leave your guild's leaderboard. Their own training is not deleted.</p>
        <div class="grid2"><button class="btn ghost" data-act="close">Cancel</button><button class="btn danger" data-act="ac-remove-yes" data-u="${esc(b.dataset.u)}">Remove</button></div>`); return;
      case "ac-remove-yes": await Cloud.rpc("master_remove", {p_user: b.dataset.u}); UI.g.members = null; UI.g.board = {}; await refreshAccount(); closeModal(); render(); guildLoad(); toast("Member removed"); return;
      case "ac-regen": modal(`<h2>Make a new join code?</h2><p class="mute">The old code stops working. Existing members stay in the guild.</p>
        <div class="grid2"><button class="btn ghost" data-act="close">Cancel</button><button class="btn" data-act="ac-regen-yes">New code</button></div>`); return;
      case "ac-regen-yes": await Cloud.rpc("master_regen_join_code"); await refreshAccount(); closeModal(); render(); toast("New join code ready"); return;
      case "ac-gsave": { const n = $("#mg-name").value.trim(), c = $("#mg-city").value.trim(); if (n.length < 2) return toast("Enter the gym name");
        await busy(() => Cloud.rpc("master_update_guild", {p_name: n, p_city: c}), "Saving…"); await refreshAccount(); render(); toast("Gym profile saved"); return; }
      case "ac-logo": $("#logoFile").click(); return;
      case "ac-copy": try { await navigator.clipboard.writeText(v); toast("Copied " + v); } catch(err){ toast(v); } return;
      // ---- owner
      case "ac-atab": UI.atab = v; render(); return guildLoad();
      case "ac-mkcodes": { const n = +$("#cc-n").value || 1, d = +$("#cc-days").value, va = +$("#cc-valid").value, note = $("#cc-note").value;
        const codes = await busy(() => Cloud.rpc("owner_create_codes", {p_count: n, p_note: note, p_grant_days: isNaN(d) ? 30 : d, p_valid_days: isNaN(va) ? 30 : va}), "Creating…");
        UI.g.admin.newCodes = codes; UI.g.admin.codes = null; render(); toast(`${codes.length} code${codes.length > 1 ? "s" : ""} created`); return; }
      case "ac-revoke": await Cloud.rpc("owner_revoke_code", {p_code: v}); UI.g.admin.codes = null; render(); guildLoad(); toast("Code revoked"); return;
      case "ac-gextend": { const g = UI.g.admin.guilds.find(x => x.id === b.dataset.g), base = g.paid_until && new Date(g.paid_until) > new Date() ? new Date(g.paid_until) : new Date();
        base.setDate(base.getDate() + +b.dataset.d); const until = keyOf(base);
        await busy(() => Cloud.rpc("owner_set_guild", {p_guild: g.id, p_paid_until: until, p_status: g.status}));
        UI.g.admin.guilds = null; UI.g.admin.stats = null; render(); guildLoad(); toast(`${g.name} paid until ${fmtDate(until)}`); return; }
      case "ac-gstatus": { const g = UI.g.admin.guilds.find(x => x.id === b.dataset.g);
        await busy(() => Cloud.rpc("owner_set_guild", {p_guild: g.id, p_paid_until: g.paid_until, p_status: v}));
        UI.g.admin.guilds = null; render(); guildLoad(); toast(v === "suspended" ? `${g.name} suspended` : `${g.name} reactivated`); return; }
      case "ac-gview": { modal(`<h2>${esc(b.dataset.n)}</h2><p class="mute sm"><span class="spin sm"></span> Loading…</p>`);
        try { const rows = await Cloud.rpc("guild_leaderboard", {p_category: "overall", p_period: "week", p_guild: b.dataset.g});
          modal(`<h2>${esc(b.dataset.n)}</h2><p class="tiny mute">Overall, this week</p>${rows.length ? `<ol class="board">${rows.map(r => `<li><span class="rk num">${r.rank}</span><span class="nm">${esc(r.display_name || r.username)}<span class="tiny mute">@${esc(r.username)}</span></span><span class="sc num">${r.score}</span></li>`).join("")}</ol>` : `<p class="mute sm">No members yet.</p>`}<button class="btn" data-act="close">Close</button>`); }
        catch(err){ modal(`<h2>${esc(b.dataset.n)}</h2><p class="bad-t sm">${esc(err.message)}</p><button class="btn" data-act="close">Close</button>`); } return; }
      case "ac-usearch": UI.g.admin.q = $("#us-q").value; UI.g.admin.users = null; render(); return guildLoad();
      case "ac-deluser": modal(`<h2>Delete @${esc(b.dataset.n)}?</h2><p class="sm mute">This permanently removes the account, all workouts, scores and guild membership. Payment records are kept without a name. It cannot be undone.</p>
        <label class="lab" for="du-c">Type the username to confirm</label><input id="du-c" class="input" autocomplete="off"><p class="err" id="duerr"></p>
        <div class="grid2"><button class="btn ghost" data-act="close">Cancel</button><button class="btn danger" data-act="ac-deluser-do" data-u="${esc(b.dataset.u)}" data-n="${esc(b.dataset.n)}">Delete forever</button></div>`); return;
      case "ac-deluser-do": { if ($("#du-c").value.trim().toLowerCase() !== b.dataset.n) return void ($("#duerr").textContent = "Username does not match");
        try { await busy(() => Cloud.rpc("owner_delete_user", {p_user: b.dataset.u}), "Deleting…"); closeModal(); UI.g.admin.users = null; UI.g.admin.stats = null; UI.g.admin.log = null; render(); guildLoad(); toast("User deleted"); }
        catch(err){ $("#duerr").textContent = err.message; } return; }
      case "ac-delguild": modal(`<h2>Delete ${esc(b.dataset.n)}?</h2><p class="sm mute">The guild, its member list and join code are removed. Members keep their own accounts and training. The guild master becomes a normal participant. This cannot be undone. To stop a gym temporarily, use Suspend instead.</p>
        <label class="lab" for="dg-c">Type the guild name to confirm</label><input id="dg-c" class="input" autocomplete="off"><p class="err" id="dgerr"></p>
        <div class="grid2"><button class="btn ghost" data-act="close">Cancel</button><button class="btn danger" data-act="ac-delguild-do" data-g="${esc(b.dataset.g)}" data-n="${esc(b.dataset.n)}">Delete forever</button></div>`); return;
      case "ac-delguild-do": { if ($("#dg-c").value.trim().toLowerCase() !== b.dataset.n.toLowerCase()) return void ($("#dgerr").textContent = "Name does not match");
        try { await busy(() => Cloud.rpc("owner_delete_guild", {p_guild: b.dataset.g}), "Deleting…"); closeModal(); UI.g.admin.guilds = null; UI.g.admin.stats = null; UI.g.admin.log = null; render(); guildLoad(); toast("Guild deleted"); }
        catch(err){ $("#dgerr").textContent = err.message; } return; }
      case "ac-resetpw": modal(`<h2>Reset password for @${esc(b.dataset.n)}</h2><p class="sm mute">Tell them the new password in person. They can change it in Settings.</p>
        <label class="lab" for="rpw">New password</label><input id="rpw" class="input" autocomplete="off" value="${_randPw()}"><p class="err" id="rpwerr"></p>
        <button class="btn" data-act="ac-resetpw-save" data-u="${esc(b.dataset.u)}">Set password</button>`); return;
      case "ac-resetpw-save": { const pw = $("#rpw").value; if (pw.length < 8) return void ($("#rpwerr").textContent = "At least 8 characters");
        try { await busy(() => Cloud.fn("owner-admin", {action: "reset_password", user_id: b.dataset.u, password: pw}), "Saving…"); closeModal(); toast("Password reset"); }
        catch(err){ $("#rpwerr").textContent = err.message; } return; }
    }
  } catch(err){ toast(err.message || String(err)); }
});
function _randPw(){ const c = "abcdefghjkmnpqrstuvwxyz23456789"; let s = ""; const r = crypto.getRandomValues(new Uint8Array(10)); for (const x of r) s += c[x % c.length]; return s; }

document.addEventListener("input", e => {
  const el = e.target;
  if (el.dataset.af && UI.auth){ (UI.auth.f = UI.auth.f || {})[el.dataset.af] = el.value;
    if (el.dataset.af === "username" && UI.auth.step !== "signin"){ clearTimeout(UI.unameT); const u = el.value.trim().toLowerCase(), h = $("#hint-username");
      if (!h) return; if (!USERNAME_RE.test(u)){ h.textContent = "3 to 20 letters, numbers or underscore."; h.className = "tiny mute"; return; }
      UI.unameT = setTimeout(async () => { try { const ok = await Cloud.rpc("username_available", {p_username: u}); if ($("#hint-username")){ h.textContent = ok ? `@${u} is available` : `@${u} is taken`; h.className = "tiny " + (ok ? "good-t" : "bad-t"); } } catch(err){} }, 400); }
    if (el.dataset.af === "code"){ clearTimeout(UI.codeT); const c = el.value.trim().toUpperCase(), h = $("#hint-code"); if (!h || c.length < 11){ if (h) h.textContent = " "; return; }
      UI.codeT = setTimeout(async () => { try { const ok = await Cloud.rpc("check_master_code", {p_code: c}); h.textContent = ok ? "Code accepted" : "Invalid, expired or already used"; h.className = "tiny " + (ok ? "good-t" : "bad-t"); } catch(err){} }, 300); }
  }
});
document.addEventListener("change", async e => {
  const el = e.target;
  if (el.dataset.gdate){ const g = UI.g.admin.guilds.find(x => x.id === el.dataset.gdate);
    try { await Cloud.rpc("owner_set_guild", {p_guild: g.id, p_paid_until: el.value || null, p_status: g.status}); toast(`${g.name}: paid until ${el.value ? fmtDate(el.value) : "not set"}`); UI.g.admin.guilds = null; guildLoad(); }
    catch(err){ toast(err.message); } }
});
document.addEventListener("keydown", e => { if (e.key === "Enter" && UI.auth && e.target.dataset && e.target.dataset.af){ const btn = document.querySelector(".auth .btn[data-act^='ac-sign']"); if (btn) btn.click(); } });
$("#logoFile").addEventListener("change", e => {
  const f = e.target.files[0]; if (!f) return; e.target.value = "";
  readImage(f, 256, 1, async url => {
    toast("Uploading logo…");
    try { await Cloud.fn("upload-logo", {image: url}); await refreshAccount(); render(); toast("Logo updated"); } catch(err){ toast("Logo upload failed: " + err.message); }
  });
});
