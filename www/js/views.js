"use strict";
/* =====================================================================
   ASCENDANT 2.0 screens, actions and boot.
   ===================================================================== */
const SKINC = ["#EBCBB6","#DDB39A","#C99A7E","#B08064","#93664C","#76503B","#5A3B2B","#3F291E"];
const HAIRC = {black:"#1A1716", espresso:"#3A2A20", brown:"#4E3423", chestnut:"#6E3F22", auburn:"#7D3220", blonde:"#B8925A", ash:"#8F8A82", silver:"#C9C7C2", crimson:"#7E1C24", azure:"#23406E"};
const CLOTHC = {graphite:"#2A2C30", onyx:"#121315", bone:"#D9D4CA", steel:"#5B6470", olive:"#4A5139", navy:"#1D2A44", oxblood:"#5A1E22", sand:"#B59E7C", gold:"#B8913E", white:"#E8E8E6"};
const EYEC = {brown:"#5B3A21", hazel:"#7A6033", grey:"#7D8A93", green:"#4F6B45", dark:"#2B1D14"};
const TABS = [["home","Home","home"],["train","Train","lift"],["hunter","Hunter","user"],["progress","Progress","chart"],["guild","Guild","guild"]];
const VIEW_BTNS = [["front","Front"],["three","Angle"],["side","Side"],["back","Back"],["face","Face"]];
const segs = (opts, cur, act) => `<div class="seg" role="tablist">${opts.map(([k, l]) => `<button role="tab" aria-selected="${cur === k}" class="${cur === k ? "on" : ""}" data-act="${act}" data-v="${k}">${l}</button>`).join("")}</div>`;
const secH = (title, right = "") => `<div class="sec-h"><h2>${title}</h2>${right}</div>`;
const curLook = () => UI.onb ? UI.onb.look : S ? Object.assign({}, S.look, UI.preview || {}) : Object.assign({}, BASE_LOOK);
const logKey = () => UI.editKey || TODAY();

/* ---------------- render ---------------- */
function render(){
  const root = document.documentElement;
  const pt = UI.previewItem && CAT[UI.previewItem] && CAT[UI.previewItem].slot === "theme" ? CAT[UI.previewItem].key : null;
  root.dataset.theme = pt || (S && S.theme) || "gold";
  root.dataset.font = fontKey();
  if (UI.auth){ renderAuth(); $("#nav").innerHTML = ""; $("#pbar").innerHTML = ""; return; }
  if (!S || UI.onb){ renderOnboarding(); $("#nav").innerHTML = ""; return; }
  const C = compute();
  const V = {home:viewHome, train:viewTrain, hunter:viewHunter, progress:viewProgress, guild:viewGuild, settings:viewSettings}[UI.tab] || viewHome;
  $("#app").innerHTML = updateBar() + (S.demo ? `<div class="demo-bar"><span>Demo data. These workouts are generated examples, not your training.</span><button data-act="reset">${CLOUD_ON ? "Leave demo" : "Start my own"}</button></div>` : "") + V(C);
  $("#nav").innerHTML = `<div class="nav-in">${TABS.map(([k, l, i]) => `<button class="${UI.tab === k ? "on" : ""}" data-act="tab" data-v="${k}" ${UI.tab === k ? 'aria-current="page"' : ""}>${ICON[i]}<span>${l}</span></button>`).join("")}</div>`;
  $("#pbar").innerHTML = UI.tab === "hunter" ? previewBar(C) : "";
  mountStage();
  if (!UI.achInit){ UI.achInit = true; C.ach.forEach(id => { if (!S.achieved[id]) S.achieved[id] = TODAY(); }); save(); }
  else checkAchievements(C);
  if (UI.tab === "guild") guildLoad();
}

/* stage bridge (works in onboarding too) */
async function mountStage(){
  const el = document.querySelector(".stage"); if (!el) return;
  const api = window.Hunter3D;
  if (!api){ if (!UI.waiting3d){ UI.waiting3d = true; window.addEventListener("hunter3d-ready", () => { UI.waiting3d = false; mountStage(); }, {once:true}); } return; }
  const fail = msg => { el.innerHTML = `<div class="stage-fallback">${hexBadge(S ? compute().rank[1] : "E", 76)}<p>${msg}</p></div>`; };
  if (!api.supported) return fail("This device cannot run 3D (WebGL is unavailable). Training, XP and rankings work normally.");
  const opts = JSON.parse(el.dataset.stage || "{}");
  try {
    const ok = await api.ready; if (!ok) return fail("3D failed to start on this device. Training, XP and rankings work normally.");
    if (!el.isConnected) return;
    api.mount(el, opts);
    const L = curLook();
    await api.setLook(L);
    if (!el.isConnected) return;
    if (S && !UI.onb && !UI.auth){ const C = compute(); api.setBody({level: C.level, stages: C.body.stages});
      const a = CAT["aura:" + L.aura]; api.setAura(a && a.hex, a && a.key !== "none" ? Math.max(0.4, C.aura) : 0);
      const tl = S.logs[TODAY()], trained = !!(tl && tl.type === "workout" && tl.saved && daySets(tl)), fxc = (a && a.key !== "none" && a.hex) || FX.accent();
      const charged = trained && (UI.tab === "home" || el.classList.contains("cer-stage"));
      api.setCharged(charged, fxc);
      if (charged && UI.justTrained && !$("#cer").innerHTML){ UI.justTrained = false; api.burst(fxc); } }
    else { api.setBody({level:1, stages:{}}); api.setAura(null, 0); api.setCharged(false); }
    api.setPose(L.pose || "relaxed");
    api.view(opts.view || "front");
    el.classList.add("live");
  } catch(err){ console.error(err); fail("The 3D model files could not be loaded (assets/hunter). Check your connection and reopen the app."); }
}

/* ---------------- HOME ---------------- */
function greet(){ const h = new Date().getHours(); return h < 5 ? "Late session" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; }
function musclesFromLog(k){ const l = S.logs[k]; if (!l || l.type !== "workout") return []; return [...new Set(l.entries.map(e => MUSCLE_OF[e.ex]).filter(Boolean))]; }
function viewHome(C){
  const t = TODAY(), td = C.days[t] || {ms:[], status:"rest", sets:0}, nx = nextEvo(C.level), xpPct = C.level >= 60 ? 100 : Math.round(C.into / C.need * 100);
  const daily = dailyChallenges(C, t), weekly = weeklyChallenges(C, keyOf(mondayOf(todayD())));
  const thisMon = mondayOf(todayD()), lastMon = addDays(thisMon, -7), lw = weekStats(C, lastMon), g = gradeOf(lw);
  const log = S.logs[t], inProgress = log && log.type === "workout" && daySets(log) > 0 && !log.saved;
  const restDay = !td.ms.length && !td.did && !inProgress && !(log && log.type === "workout");
  const cw = currentWeight(), ch = cw - S.profile.startWeight;
  const recent = Object.entries(S.achieved).sort((a, b) => a[1] < b[1] ? 1 : -1).slice(0, 3).map(([id]) => ACH.find(a => a.id === id)).filter(Boolean);
  const nextAch = ACH.find(a => !C.ach.includes(a.id));
  const doneToday = td.did && !inProgress;
  const status = doneToday ? `<span class="pill good">Done, +${td.xp} XP</span>` : td.status === "skipped" ? `<span class="pill bad">Skipped</span>` : inProgress ? `<span class="pill acc">In progress</span>` : td.ms.length ? `<span class="pill acc">Planned</span>` : `<span class="pill">Rest</span>`;
  return `
  <header class="topbar"><div><div class="hello">${greet()}</div><div class="date">${fmt(todayD(), {weekday:"long", day:"numeric", month:"long"})}</div></div>
    <div class="row"><button class="cry-pill" data-act="open-shop" aria-label="${C.crystals} crystals, open shop">${CRY}<b>${C.crystals}</b></button>
    <button class="iconbtn" data-act="tab" data-v="settings" aria-label="Settings and plan">${ICON.gear}</button></div></header>
  <section class="hero">
    ${hunterStage("hero-stage", {mode:"hero", interactive:true})}
    <button class="stage-cta" data-act="tab" data-v="hunter">Customize</button>
    <div class="hero-info">
      <div class="hero-id">${hexBadge(C.rank[1], 54, "rank")}
        <div class="hid"><div class="h-name"><span class="glow" data-rank="${C.rank[1]}">${esc(S.hunterName || S.profile.name)}</span></div><div class="h-user">@${esc(S.profile.name)}</div><div class="h-tags"><span>${C.rank[2]} rank</span><span>${C.evo[1]} form</span>${doneToday ? `<span class="charged">Charged</span>` : ""}</div></div></div>
      <div class="lvl-row"><span class="lvl">Level <b class="num">${C.level}</b></span><span class="xp num">${nf(C.into)} / ${nf(C.need)} XP</span></div>
      <div class="xpbar" role="progressbar" aria-valuenow="${xpPct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${xpPct}%"></i></div>
      <div class="evo-next">${nx ? `Next evolution: <b>${nx[1]}</b> at level ${nx[0]}, ${nf(xpAt(nx[0]) - C.xp)} XP away` : "Final evolution reached"}</div>
    </div>
  </section>

  <section class="card today-card">
    <div class="row between"><div><div class="k">Today</div><h3>${restDay ? "Recovery day" : focusText(td.ms.length ? td.ms : musclesFromLog(t))}</h3></div>${status}</div>
    ${restDay ? `<p class="mute sm">How does your body feel?</p><div class="moods">${MOODS.map(m => `<button class="mood ${S.checkins[t] === m ? "on" : ""}" data-act="checkin" data-v="${m}">${m}</button>`).join("")}</div>
        <button class="btn ghost" data-act="go-today">Train anyway</button>`
      : doneToday ? `<p class="mute sm">${td.sets} sets logged${td.beats.length ? `, beat your last session on ${td.beats.length} exercise${td.beats.length > 1 ? "s" : ""}` : ""}.</p><button class="btn ghost" data-act="go-today">View today's log</button>`
      : td.status === "skipped" ? `<button class="btn ghost" data-act="go-today">Log a workout instead</button>`
      : `<button class="btn" data-act="go-today">${inProgress ? `Continue workout, ${daySets(log)} sets so far` : "Start today's workout"}</button>`}
  </section>

  <section class="card">
    ${secH("Challenges", `<span class="tiny mute">Reset daily and on Monday</span>`)}
    ${daily.map(chRow).join("")}
    <div class="sub-h">This week</div>${weekly.map(chRow).join("")}
  </section>

  <section class="stats4">
    <button class="stat" data-act="shield-info"><span class="v num">${C.streak}</span><span class="l">Day streak</span><span class="h">${C.shieldsLeft ? "Shield ready" : "Shield used"}</span></button>
    <div class="stat"><span class="v num">${C.consistency}<small>%</small></span><span class="l">Consistency</span><span class="h">Last 4 weeks</span></div>
    <button class="stat" data-act="weigh"><span class="v num">${cw}<small>kg</small></span><span class="l">Bodyweight</span><span class="h">${ch === 0 ? "Tap to log" : (ch > 0 ? "+" : "") + ch.toFixed(1) + " kg"}</span></button>
    <div class="stat"><span class="v num">${C.workouts}</span><span class="l">Workouts</span><span class="h">${C.beatsAll} bests beaten</span></div>
  </section>

  <section class="card">
    ${secH("Badges", `<button class="link" data-act="open-badges">All ${ACH.length}</button>`)}
    ${recent.length ? `<div class="badge-row">${recent.map(a => `<div class="badge" style="--rc:${RARITY[a.rarity].c}">${hexBadge(a.name.split(" ").map(w => w[0]).join("").slice(0, 3), 46, "ach")}<b>${esc(a.name)}</b><span>${RARITY[a.rarity].n}</span></div>`).join("")}</div>` : `<p class="mute sm">No badges yet. Your first workout earns First Blood.</p>`}
    ${nextAch ? `<div class="next-ach"><span class="tiny mute">Next</span><b>${esc(nextAch.name)}</b><span class="tiny mute">${esc(nextAch.desc)}</span></div>` : ""}
  </section>

  ${guildHomeCard(C)}

  <section class="card">
    <div class="row between"><div><h3>Last week</h3><div class="tiny mute">${short(keyOf(lastMon))} to ${short(keyOf(addDays(lastMon, 6)))}</div></div>
      ${g ? `<button class="grade g-${g}" data-act="report" aria-label="Open report card">${g}</button>` : `<span class="tiny mute">No grade yet</span>`}</div>
    <div class="cmp"><div><b class="num">${lw.workouts}</b><span>Workouts</span></div><div><b class="num">${lw.sets}</b><span>Sets</span></div><div><b class="num">${kgfmt(lw.volume)}</b><span>Lifted</span></div><div><b class="num">${nf(lw.xp)}</b><span>XP</span></div></div>
    ${g ? "" : `<p class="tiny mute">Your first report card arrives next Monday.</p>`}
  </section>`;
}
function chRow(c){
  return `<div class="ch ${c.done ? "done" : ""}"><span class="ck">${c.done ? ICON.check : ""}</span><div class="ch-t"><b>${esc(c.t)}</b><span>${esc(c.d)}</span>
    ${c.prog !== undefined && !c.done ? `<i class="ch-bar"><i style="width:${Math.round(c.prog * 100)}%"></i></i>` : ""}</div><span class="ch-xp num">+${c.xp}</span></div>`;
}
function guildHomeCard(C){
  const a = acct(), m = a && a.membership, mg = a && a.master_guild, last = S.guildSeen && S.guildSeen["overall:week"];
  const card = (k, h, sub, btn) => `<section class="card guild-card"><div class="row between gap"><div class="grow"><div class="k">${k}</div><h3>${h}</h3><div class="tiny mute">${sub}</div></div>
    <button class="btn sm ghost" data-act="tab" data-v="guild">${btn}</button></div></section>`;
  if (!CLOUD_ON || S.demo) return card("Gym ranking", "Offline mode", "Guild rankings need an Ascendant account.", "Details");
  if (role() === "owner") return card("Owner", "Ascendant admin", "Guilds, codes, users and subscriptions.", "Open admin");
  if (mg) return card("Your gym", esc(mg.name), `${mg.members} member${mg.members === 1 ? "" : "s"}${mg.pending ? `, <b>${mg.pending} waiting for approval</b>` : ""}${mg.active ? "" : ", subscription expired"}`, "Manage");
  if (m && m.status === "pending") return card("Gym ranking", "Waiting for approval", `Your request to join ${esc(m.guild_name)} is with the guild master.`, "Open");
  if (m && last) return card(esc(m.guild_name), `Rank <span class="num">#${last.rank}</span> of ${last.of}`, "Overall, this week", "Leaderboard");
  if (m) return card(esc(m.guild_name), "Leaderboard", "See where you stand this week.", "Open");
  return card("Gym ranking", "Not in a guild", "Join your gym's guild with the code from your gym.", "Join");
}

/* ---------------- TRAIN ---------------- */
function viewTrain(C){
  return `<div class="page-h"><h1>Train</h1><span class="tiny mute">${C.workouts} workouts logged</span></div>
  ${segs([["today", "Workout"], ["skills", "Skills"], ["history", "History"]], UI.trainTab, "train-tab")}
  ${UI.trainTab === "skills" ? viewSkills(C) : UI.trainTab === "history" ? viewHistory(C) : viewWorkout(C)}`;
}
function viewWorkout(C){
  const t = TODAY(), mon = addDays(mondayOf(todayD()), UI.weekOff * 7);
  if (UI.sel === null) UI.sel = wd(todayD());
  const k = keyOf(addDays(mon, UI.sel));
  const strip = DAYS.map((n, i) => { const dk = keyOf(addDays(mon, i)), x = C.days[dk], ms = dk >= S.profile.startDate ? musclesOn(dk) : [];
    const dot = x ? (x.did ? "done" : x.status === "shielded" ? "shield" : (x.status === "missed" || x.status === "skipped") ? "miss" : (ms.length ? "plan" : "")) : (ms.length ? "plan" : "");
    return `<button class="dayb ${i === UI.sel ? "sel" : ""} ${dk === t ? "is-today" : ""}" data-act="sel" data-v="${i}" aria-label="${n} ${addDays(mon, i).getDate()}"><span class="d">${n.slice(0, 3)}</span><span class="n num">${addDays(mon, i).getDate()}</span><i class="dot ${dot}"></i></button>`; }).join("");
  return `<div class="weeknav"><button class="iconbtn" data-act="wk" data-v="-1" aria-label="Previous week">${ICON.left}</button>
    <span class="sm mute">${UI.weekOff === 0 ? "This week" : `${short(keyOf(mon))} to ${short(keyOf(addDays(mon, 6)))}`}</span>
    <button class="iconbtn" data-act="wk" data-v="1" aria-label="Next week" ${UI.weekOff >= 0 ? 'style="visibility:hidden"' : ""}>${ICON.right}</button></div>
    <div class="strip">${strip}</div>${dayView(C, k)}`;
}
function exFor(ms){ return ms.flatMap(m => S.exercises[m] || []); }
function ensureToday(ms){ const k = TODAY(); let L = S.logs[k];
  if (!L || L.type !== "workout") L = S.logs[k] = {type:"workout", entries: exFor(ms).map(ex => ({ex, sets:[{}, {}, {}]}))};
  return L; }
function fmtSet(ex, s){ if (RUN.has(ex)) return `${s.km || 0}km/${s.reps}min`; if (HOLD.has(ex)) return `${s.reps}s`; if (TIMED.has(ex)) return `${s.reps} min`; if (BODYW.has(ex)) return `${s.reps} reps${+s.kg ? ` +${s.kg}kg` : ""}`; return `${+s.kg || 0}×${s.reps}`; }
function bestBefore(ex, k){
  let b = null;
  for (const d in S.logs){ if (d >= k) continue; const l = S.logs[d]; if (l.type !== "workout") continue;
    for (const e of l.entries) if (e.ex === ex){ const bs = bestSet(ex, e.sets); if (bs && (b === null || bs.score > b.score)) b = {score: bs.score, set: bs.set, k: d}; } }
  return b;
}
const metricName = ex => isWeighted(ex) ? "Estimated 1-rep max" : RUN.has(ex) ? "Distance" : HOLD.has(ex) ? "Hold" : TIMED.has(ex) ? "Minutes" : "Reps";
const metricFmt = (ex, v) => isWeighted(ex) ? `${(Math.round(v * 2) / 2)} kg` : RUN.has(ex) ? `${v} km` : HOLD.has(ex) ? `${Math.round(v)} s` : TIMED.has(ex) ? `${v} min` : `${Math.round(v)}`;
function dayView(C, k){
  const t = TODAY(), d = fromKey(k), ms = musclesOn(k), log = S.logs[k], x = C.days[k], editing = UI.editKey === k;
  const head = `<div class="dayhead"><div class="sm mute">${fmt(d, {weekday:"long", day:"numeric", month:"long"})}</div><h2>${focusText(ms.length ? ms : musclesFromLog(k))}</h2></div>`;
  if (k < S.profile.startDate) return head + `<div class="card empty">Before your journey started.</div>`;
  if (k > t) return head + `<div class="card"><span class="pill">Coming up</span>${ms.length ? `<div class="chips">${exFor(ms).map(e => `<span class="chip static">${esc(e)}</span>`).join("")}</div>` : `<p class="mute sm">Rest and recover.</p>`}</div>` + history(k);
  if (k < t && !editing){
    if (x && x.did) return head + `<div class="row gap"><span class="pill good">Done</span><span class="pill acc">+${x.xp} XP</span><button class="link" data-act="edit-day" data-k="${k}">Edit this log</button></div>` + doneList(log, x, k) + history(k);
    if (x && x.status === "shielded") return head + `<div class="card empty"><span class="pill shield">Shield used</span><p>You missed this day, but your monthly streak shield saved your streak.</p></div>` + history(k);
    if (ms.length) return head + `<div class="card empty"><span class="pill bad">${x && x.status === "skipped" ? "Skipped" : "Missed"}</span><p>No workout was logged. Missed days stay missed.</p></div>` + history(k);
    return head + `<div class="card empty">Rest day${S.checkins[k] ? `. You felt ${S.checkins[k].toLowerCase()}.` : "."}</div>`;
  }
  if (k === t){
    if (!ms.length && !(log && log.type === "workout")) return head + `<div class="card empty"><p>Rest day. Recovery is part of leveling up.</p><button class="btn ghost" data-act="train-anyway">Train anyway</button></div>`;
    if (log && log.type === "rest") return head + `<div class="card empty"><span class="pill bad">Skipped</span><p>You marked today as rest. ${C.shieldsLeft ? "" : "Your streak resets tomorrow."}</p><button class="btn ghost" data-act="undo-rest">Log a workout instead</button></div>`;
  }
  const L = k === t ? ensureToday(ms) : log;
  const cards = L.entries.map((e, ei) => {
    const last = lastSession(e.ex, k), best = bestBefore(e.ex, k);
    const rows = e.sets.map((s, si) => { const ph = last && last.sets[si] ? last.sets[si] : null, ok = +s.reps > 0, pr = ok && best && setScore(e.ex, s) > best.score + 1e-9;
      const f = (key, label, unit, mode, phv, span) => `<label class="field" ${span ? 'style="grid-column:span 2"' : ""}><input inputmode="${mode}" aria-label="${label}, set ${si + 1}" data-in="${key}" data-e="${ei}" data-s="${si}" value="${s[key] ?? ""}" placeholder="${phv}"><span>${unit}</span></label>`;
      return `<div class="set ${ok ? "ok" : ""} ${pr ? "pr" : ""}"><span class="idx">${pr ? "PR" : ok ? "✓" : si + 1}</span>
        ${RUN.has(e.ex) ? f("km", "Kilometres", "km", "decimal", ph ? (ph.km || 0) : "km") + f("reps", "Minutes", "min", "decimal", ph ? ph.reps : "min")
        : HOLD.has(e.ex) ? f("reps", "Seconds", "sec", "numeric", ph ? ph.reps : "0", true)
        : TIMED.has(e.ex) ? f("reps", "Minutes", "min", "decimal", ph ? ph.reps : "0", true)
        : f("kg", "Kilograms", "kg", "decimal", ph ? (ph.kg || 0) : (BODYW.has(e.ex) ? "0" : "kg")) + f("reps", "Reps", "reps", "numeric", ph ? ph.reps : "0")}
        <button class="del" data-act="delset" data-e="${ei}" data-s="${si}" aria-label="Remove set ${si + 1}">${ICON.x}</button></div>`; }).join("");
    return `<div class="ex"><div class="row between"><button class="ex-name" data-act="ex-hist" data-e="${esc(e.ex)}">${esc(e.ex)}<span class="tiny mute">History</span></button><button class="link mute" data-act="delex" data-e="${ei}">Remove</button></div>
      <div class="ex-ref"><span>${last ? `Last, ${short(last.k)}: <b>${last.sets.map(s => fmtSet(e.ex, s)).join(", ")}</b>` : "First time. Set your baseline."}</span>
      ${best ? `<span>Best: <b>${fmtSet(e.ex, best.set)}</b>${isWeighted(e.ex) ? `, est. 1RM ${metricFmt(e.ex, best.score)}` : ""}</span>` : ""}</div>
      <div class="sets">${rows}</div><div class="row between"><button class="addset" data-act="addset" data-e="${ei}">${ICON.plus}Add set</button>${last ? `<button class="addset" data-act="repeat" data-e="${ei}">Same as last time</button>` : ""}</div></div>`; }).join("");
  return head + `<div class="row gap"><span class="pill acc">${editing ? "Editing" : "Today"}</span><span class="tiny mute"><b id="setcount">${daySets(L)}</b> sets logged.${editing ? "" : " Rest timer starts when a set is complete."}</span></div>
    ${cards}<button class="btn ghost" data-act="add-ex">${ICON.plus}Add exercise</button>
    ${editing ? `<div class="grid2"><button class="btn ghost" data-act="discard-edit">Discard changes</button><button class="btn" data-act="save-edit">Save changes</button></div>`
      : `<button class="btn" data-act="finish">Save workout</button>${ms.length ? `<button class="btn quiet" data-act="mark-rest">I rested today</button>` : ""}`}${history(k)}`;
}
function doneList(log, x, k){
  return log.entries.filter(e => validSets(e.sets).length).map(e => { const best = bestBefore(e.ex, k), b = bestSet(e.ex, e.sets), pr = best && b.score > best.score + 1e-9;
    return `<div class="ex"><div class="row between"><button class="ex-name" data-act="ex-hist" data-e="${esc(e.ex)}">${esc(e.ex)}<span class="tiny mute">History</span></button>${pr ? '<span class="pill pr">New PR</span>' : x.beats.includes(e.ex) ? '<span class="pill good">Beat last time</span>' : ""}</div>
    <div class="sets">${validSets(e.sets).map((s, i) => `<div class="line"><span class="mute">Set ${i + 1}</span><span class="num">${fmtLong(e.ex, s)}</span></div>`).join("")}</div></div>`; }).join("");
}
function history(k){
  const w = wd(fromKey(k)), past = Object.keys(S.logs).filter(x => x < k && wd(fromKey(x)) === w && daySets(S.logs[x]) > 0).sort().reverse().slice(0, 3);
  if (!past.length) return "";
  return `<div class="sec-h"><h3>Previous ${DAYS[w]}s</h3></div><div class="card">${past.map(p => { const l = S.logs[p];
    const top = l.entries.filter(e => validSets(e.sets).length).slice(0, 3).map(e => `${esc(e.ex)} ${fmtSet(e.ex, bestSet(e.ex, e.sets).set)}`).join(", ");
    return `<div class="line block"><div class="row between"><b>${short(p)}</b><span class="tiny mute">${daySets(l)} sets</span></div><div class="tiny mute">${top}</div></div>`; }).join("")}</div>`;
}
function viewHistory(C){
  const ks = Object.keys(S.logs).filter(k => S.logs[k].type === "workout" && daySets(S.logs[k]) > 0 && k <= TODAY()).sort().reverse();
  if (!ks.length) return `<div class="card empty"><p>No workouts logged yet. Your sessions appear here with sets, volume and personal records.</p><button class="btn" data-act="go-today">Start today's workout</button></div>`;
  const n = UI.histN || 25, out = []; let month = "";
  for (const k of ks.slice(0, n)){
    const m = fmt(fromKey(k), {month:"long", year:"numeric"}); if (m !== month){ month = m; out.push(`<div class="sub-h">${m}</div>`); }
    const l = S.logs[k], x = C.days[k] || {beats:[], xp:0}, prs = l.entries.filter(e => { const b = bestSet(e.ex, e.sets), bb = bestBefore(e.ex, k); return b && bb && b.score > bb.score + 1e-9; }).length;
    out.push(`<button class="hrow" data-act="open-day" data-k="${k}"><span class="hd"><b class="num">${fromKey(k).getDate()}</b><span>${DAYS[wd(fromKey(k))].slice(0, 3)}</span></span>
      <span class="ht"><b>${focusText(musclesFromLog(k))}</b><span class="tiny mute">${daySets(l)} sets${dayVolume(l) ? `, ${kgfmt(dayVolume(l))} kg` : ""}${prs ? `, ${prs} PR${prs > 1 ? "s" : ""}` : ""}</span></span>
      <span class="hx num">+${x.xp}</span></button>`);
  }
  return `<div class="card hist">${out.join("")}</div>${ks.length > n ? `<button class="btn ghost" data-act="hist-more">Show older sessions (${ks.length - n})</button>` : ""}`;
}
function exHistory(ex){
  const rows = Object.keys(S.logs).sort().map(k => { const l = S.logs[k]; if (l.type !== "workout") return null; const e = l.entries.find(e => e.ex === ex); if (!e) return null;
    const b = bestSet(ex, e.sets); return b ? {k, b, sets: validSets(e.sets)} : null; }).filter(Boolean);
  if (!rows.length) return modal(`<h2>${esc(ex)}</h2><p class="mute">No completed sets yet. Log one to start the history.</p><button class="btn" data-act="close">Close</button>`);
  let best = -1; const prK = new Set(); rows.forEach(r => { if (r.b.score > best + 1e-9){ if (best >= 0) prK.add(r.k); best = r.b.score; } });
  const top = rows.reduce((a, r) => r.b.score > a.b.score ? r : a, rows[0]);
  modal(`<div class="row between"><h2>${esc(ex)}</h2><span class="pill">${MUSCLE_OF[ex] || ""}</span></div>
    <div class="cmp"><div><b class="num">${rows.length}</b><span>Sessions</span></div><div><b class="num">${metricFmt(ex, top.b.score)}</b><span>${metricName(ex)}</span></div><div><b class="num">${prK.size}</b><span>PRs</span></div></div>
    <h3>${metricName(ex)} by session</h3>${lineChart(rows.slice(-16).map(r => ({y: Math.round(r.b.score * 10) / 10, l: short(r.k)})), {label: metricName(ex) + " trend", empty: "One session so far. The trend appears after your second."})}
    <div class="list">${rows.slice().reverse().slice(0, 30).map(r => `<div class="line block"><div class="row between"><b>${short(r.k)}</b>${prK.has(r.k) ? '<span class="pill pr">PR</span>' : ""}</div><div class="tiny mute">${r.sets.map(s => fmtSet(ex, s)).join(", ")}</div></div>`).join("")}</div>
    <button class="btn" data-act="close">Close</button>`);
}
function viewSkills(C){
  const sk = C.skills;
  return `<p class="sm mute">Hit the target in one set to unlock the next skill. Each unlock gives +${XP.skill} XP and 3 crystals.</p>
  ${SKILLS.map(t => { const st = sk.trees[t.id];
    return `<section class="card"><div class="row between"><h3>${t.name}</h3><span class="pill ${st.count === 5 ? "good" : "acc"}">${st.count} / 5</span></div>
    <div class="tree">${t.nodes.map(([ex, target], i) => { const done = i < st.count, cur = st.next && st.next.i === i;
      const p = cur ? Math.min(100, Math.round(st.next.best / target * 100)) : 0;
      return `<div class="node ${done ? "done" : cur ? "cur" : "locked"}"><span class="nd">${done ? ICON.check : i + 1}</span><div class="grow"><b>${esc(nodeLabel(ex, target))}</b><div class="tiny mute">${nodeTarget(ex, target)}</div>
        ${cur ? `<div class="nbar"><i style="width:${p}%"></i></div><div class="tiny mute">Your best: ${st.next.best || 0} / ${target}</div>` : ""}</div>
        ${cur ? `<button class="btn sm ghost" data-act="add-skill-ex" data-e="${esc(ex)}">Train</button>` : ""}</div>`; }).join("")}</div></section>`; }).join("")}`;
}

/* ---------------- HUNTER STUDIO ---------------- */
function viewHunter(C){
  const ht = UI.htab || "look";
  return `<div class="page-h"><h1>Hunter</h1><button class="cry-pill" data-act="htab" data-v="shop">${CRY}<b>${C.crystals}</b></button></div>
  <section class="studio ${ht === "look" ? "sticky" : ""}">${hunterStage("studio-stage", {mode:"hero", interactive:true, view: UI.view || "front"})}
    <div class="studio-tag"><b>${esc(S.hunterName || S.profile.name)}</b><span>Level ${C.level}, ${C.evo[1]} form</span></div>
    <div class="stage-hint tiny">Drag to rotate, pinch to zoom</div>
    <div class="view-btns" role="group" aria-label="Camera view">${VIEW_BTNS.map(([k, l]) => `<button class="${(UI.view || "front") === k ? "on" : ""}" data-act="view" data-v="${k}">${l}</button>`).join("")}</div>
  </section>
  ${segs([["look", "Customize"], ["evo", "Evolution"], ["shop", "Shop"], ["badges", "Badges"]], ht, "htab")}
  ${ht === "evo" ? panelEvo(C) : ht === "shop" ? panelShop(C) : ht === "badges" ? panelBadges(C) : panelLook(C, "studio")}`;
}
const LOOK_CATS = [["identity", "Body and face"], ["hair", "Hair"], ["facial", "Facial hair"], ["outfit", "Outfit"], ["gear", "Gear"], ["aura", "Aura"], ["pose", "Pose"]];
function optRow(label, field, opts, L, act){
  return `<div class="opt"><span class="opt-l">${label}</span><div class="chips">${opts.map(([v, n]) => `<button class="chip ${(L[field] || "") === v ? "on" : ""}" data-act="${act}" data-f="${field}" data-v="${v}">${n}</button>`).join("")}</div></div>`;
}
function panelLook(C, mode){
  const L = curLook(), male = L.gender === "male", onb = mode === "onb", idAct = onb ? "onb-look" : "id-set";
  const cats = LOOK_CATS.filter(c => !(c[0] === "facial" && !male) && !(onb && (c[0] === "aura" || c[0] === "pose")));
  const cat = cats.some(c => c[0] === UI.lcat) ? UI.lcat : "identity";
  const tiles = (filter) => `<div class="tiles">${CATALOG.filter(filter).map(it => tile(it, C, L, onb)).join("")}</div>`;
  const fits = it => !it.g || it.g === L.gender;
  let body = "";
  if (cat === "identity") body = `
    ${optRow("Body", "gender", [["male", "Male"], ["female", "Female"]], L, idAct)}
    <div class="opt"><span class="opt-l">Skin tone</span><div class="swatches">${SKINC.map((c, i) => `<button class="sw ${L.skin === i ? "on" : ""}" style="--c:${c}" data-act="${idAct}" data-f="skin" data-v="${i}" aria-label="Skin tone ${i + 1}"></button>`).join("")}</div></div>
    ${optRow("Face shape", "face", [["oval", "Oval"], ["square", "Square"], ["round", "Round"], ["angular", "Angular"]], L, idAct)}
    ${optRow("Jaw", "jaw", [["soft", "Soft"], ["", "Balanced"], ["strong", "Strong"]], L, idAct)}
    ${optRow("Nose", "nose", [["narrow", "Narrow"], ["", "Balanced"], ["broad", "Broad"]], L, idAct)}
    <div class="opt"><span class="opt-l">Eyes</span><div class="swatches">${Object.entries(EYEC).map(([k, c]) => `<button class="sw ${L.eyes === k ? "on" : ""}" style="--c:${c}" data-act="${idAct}" data-f="eyes" data-v="${k}" aria-label="${k} eyes"></button>`).join("")}</div></div>
    ${optRow("Brows", "brows", [["normal", "Natural"], ["bold", "Bold"]], L, idAct)}
    ${optRow("Frame", "build", [["lean", "Lean"], ["", "Balanced"], ["solid", "Solid"], ["heavy", "Heavy"]], L, idAct)}
    <div class="opt"><label class="opt-l" for="hn">Hunter name</label><input id="hn" class="input" maxlength="18" data-hn value="${esc(onb ? UI.onb.hunterName : (S.hunterName || ""))}" placeholder="${esc(onb ? (UI.onb.name || "Your hunter") : S.profile.name)}"></div>
    ${onb ? "" : `<p class="tiny mute">Your frame evolves from training on top of these choices. Changing body or face after creation costs ${REDESIGN_COST} crystals, free with the Pass. Your hunter name is free to change.</p>`}`;
  if (cat === "hair") body = `<div class="sub-h">Style</div>${tiles(it => it.slot === "hair" && fits(it))}<div class="sub-h">Color</div>${tiles(it => it.slot === "hairColor")}`;
  if (cat === "facial") body = tiles(it => it.slot === "beard");
  if (cat === "outfit"){ const tgt = UI.colorTarget || "topColor";
    body = `<div class="sub-h">Top</div>${tiles(it => it.slot === "top" && fits(it))}<div class="sub-h">Bottoms</div>${tiles(it => it.slot === "bottom")}<div class="sub-h">Footwear</div>${tiles(it => it.slot === "shoes")}
      <div class="sub-h">Colors</div><div class="chips">${[["topColor", "Top"], ["bottomColor", "Bottoms"], ["shoesColor", "Footwear"]].map(([k, n]) => `<button class="chip ${tgt === k ? "on" : ""}" data-act="ctarget" data-v="${k}">${n}</button>`).join("")}</div>${tiles(it => it.slot === "color")}`; }
  if (cat === "gear") body = `${tiles(it => it.slot === "acc")}<div class="sub-h">Wraps and headband color</div>${tiles(it => it.slot === "color")}`;
  if (cat === "aura") body = `<p class="tiny mute">Aura strength follows your streak. Legendary auras are earned by level and cannot be bought.</p>${tiles(it => it.slot === "aura")}`;
  if (cat === "pose") body = `<p class="tiny mute">Legendary poses unlock with your level.</p>${tiles(it => it.slot === "pose")}`;
  return `<div class="chips cats">${cats.map(([k, n]) => `<button class="chip ${cat === k ? "on" : ""}" data-act="lcat" data-v="${k}">${n}</button>`).join("")}</div><div class="panel">${body}</div>`;
}
function swatchFor(it){
  if (it.slot === "hairColor") return `<i class="t-sw" style="--c:${HAIRC[it.key]}"></i>`;
  if (it.slot === "color") return `<i class="t-sw" style="--c:${CLOTHC[it.key]}"></i>`;
  if (it.slot === "aura") return `<i class="t-sw aura" style="--c:${it.hex || "#3A3F47"}"></i>`;
  if (it.slot === "theme") return `<i class="t-sw" style="--c:${(THEMES.find(t => t[0] === it.key) || [])[2]}"></i>`;
  return "";
}
function isEquipped(it, L){
  if (it.slot === "acc") return (L.acc || []).includes(it.key);
  if (it.slot === "color") return L[UI.colorTarget || "topColor"] === it.key;
  if (it.slot === "theme") return S && S.theme === it.key;
  return (L[it.slot] || "none") === it.key;
}
function tile(it, C, L, onb){
  const own = onb ? (!it.cost && !it.earn) : owns(it.id, C.level), on = isEquipped(it, L), prev = UI.previewItem === it.id;
  const state = on ? "Equipped" : own ? "Owned" : onb ? "Unlock later" : it.earn ? `Level ${it.earn}` : `${it.cost} ${CRY}`;
  return `<button class="tile ${on ? "on" : ""} ${own ? "" : "locked"} ${prev ? "prev" : ""}" data-act="${onb ? "onb-item" : "item"}" data-v="${it.id}" style="--rc:${RARITY[it.rarity].c}" aria-pressed="${on}">
    ${swatchFor(it)}<span class="t-n">${esc(it.name)}</span><span class="t-r">${RARITY[it.rarity].n}</span><span class="t-s">${state}</span></button>`;
}
function lookPatch(it, L){
  if (it.slot === "acc") return {acc: (L.acc || []).includes(it.key) ? L.acc.filter(a => a !== it.key) : [...(L.acc || []), it.key]};
  if (it.slot === "color"){ const tgt = UI.colorTarget || "topColor"; return UI.lcat === "gear" ? {accColor: it.key} : {[tgt]: it.key}; }
  return {[it.slot]: it.key};
}
function previewBar(C){
  if (UI.previewKind === "identity") return `<div class="pbar"><div class="grow"><b>Body or face change</b><span class="tiny mute">${hasPass() ? "Free with your Pass" : `Costs ${REDESIGN_COST} crystals. You have ${C.crystals}.`}</span></div>
    <button class="btn sm quiet" data-act="cancel-preview">Discard</button><button class="btn sm" data-act="save-identity">Save</button></div>`;
  const it = UI.previewItem && CAT[UI.previewItem]; if (!it) return "";
  const earnOnly = !!it.earn;
  return `<div class="pbar" style="--rc:${RARITY[it.rarity].c}"><div class="grow"><b>${esc(it.name)}</b><span class="tiny">${rarityTag(it.rarity)} ${earnOnly ? `Earned at level ${it.earn}. You are level ${C.level}.` : `Preview. ${it.cost} crystals, you have ${C.crystals}.`}</span></div>
    <button class="btn sm quiet" data-act="cancel-preview">${earnOnly ? "Close" : "Cancel"}</button>${earnOnly ? "" : `<button class="btn sm" data-act="buy-item" data-v="${it.id}">Buy</button>`}</div>`;
}
function panelEvo(C){
  const nx = nextEvo(C.level);
  return `<section class="card"><div class="sec-h"><h3>Evolution</h3><span class="pill acc">${C.evo[1]}</span></div>
    <p class="sm mute">${esc(C.evo[2])} ${nx ? `Next form, ${nx[1]}, at level ${nx[0]}.` : ""}</p>
    <div class="ladder">${EVOLUTION.map(e => `<div class="rung ${C.level >= e[0] ? "got" : ""} ${C.evo[0] === e[0] ? "cur" : ""}"><span class="lv num">Lv ${e[0]}</span><div><b>${e[1]}</b><div class="tiny mute">${e[2]}</div></div></div>`).join("")}</div></section>
  <section class="card"><div class="sec-h"><h3>Muscle development</h3><span class="tiny mute">Stage 1 to 5</span></div>
    ${REGIONS.map(([r, n]) => { const st = C.body.stages[r], sets = C.body.sets[r], a = STAGE_AT[st - 1], b = STAGE_AT[st];
      const p = st >= 5 ? 100 : Math.round((sets - a) / (b - a) * 100);
      return `<div class="region"><div class="row between"><b>${n}</b><span class="tiny mute num">Stage ${st}${st < 5 ? `, ${b - sets} sets to stage ${st + 1}` : ", maxed"}</span></div><div class="stage-bar">${[1, 2, 3, 4, 5].map(i => `<i class="${i < st ? "full" : i === st ? "cur" : ""}" ${i === st && st < 5 ? `style="--p:${p}%"` : ""}></i>`).join("")}</div></div>`; }).join("")}
    <p class="tiny mute">Each region grows from the hard sets you log for it. At most 20 sets per region per week count, so extra junk volume never speeds it up and recovery stays part of the plan. This is a game picture of your training effort, not a prediction of how your real body will change.</p></section>`;
}
function panelShop(C){
  const pk = PACKS[0], pkOwned = pk.items.every(id => S.owned.includes(id)) || hasPass();
  const forSale = r => CATALOG.filter(it => it.rarity === r && !it.earn && it.cost && !owns(it.id, C.level));
  return `<section class="card balance"><div><div class="k">Crystals</div><div class="big num">${C.crystals}</div></div>
    <div class="tiny mute">Earned free: 5 per rank, 2 per full week, 3 per skill, 1 to 10 per badge.</div></section>
  <section class="card pass"><div class="row between"><div><div class="k">Ascendant Pass</div><h3>${hasPass() ? "Active" : "One-time unlock"}</h3></div>${hasPass() ? '<span class="pill good">Owned</span>' : `<button class="btn sm" data-act="pass">Details</button>`}</div>
    <p class="tiny mute">Every crystal-priced item and free redesigns. Legendary items stay earned only, and nothing you buy affects rankings.</p></section>
  <section class="card"><div class="row between"><div><h3>${pk.name}</h3><div class="tiny mute">${pk.desc}</div></div>${pkOwned ? '<span class="pill good">Owned</span>' : `<button class="btn sm" data-act="buy-pack">${pk.cost} ${CRY}</button>`}</div></section>
  ${["epic", "rare"].map(r => { const list = forSale(r); return list.length ? `<div class="sub-h">${RARITY[r].n} items</div><div class="tiles">${list.map(it => tile(it, C, curLook(), false)).join("")}</div>` : ""; }).join("")}
  <div class="sub-h">Legendary, earned only</div><div class="tiles">${CATALOG.filter(it => it.rarity === "legendary").map(it => tile(it, C, curLook(), false)).join("")}</div>
  <div class="sub-h">Themes</div><div class="tiles">${CATALOG.filter(it => it.slot === "theme").map(it => tile(it, C, curLook(), false)).join("")}</div>
  ${crystalShop()}`;
}
function panelBadges(C){
  return `<p class="sm mute">${C.ach.length} of ${ACH.length} earned. Badges are checked against your logs, so they cannot be bought.</p>
  <div class="badges">${ACH.map(a => { const got = C.ach.includes(a.id);
    return `<div class="bcard ${got ? "got" : ""}" style="--rc:${RARITY[a.rarity].c}">${hexBadge(got ? a.name.split(" ").map(w => w[0]).join("").slice(0, 3) : "?", 44, "ach")}
      <div><b>${esc(a.name)}</b><div class="tiny mute">${esc(a.desc)}</div><div class="tiny">${rarityTag(a.rarity)} ${got ? `<span class="mute">Earned ${S.achieved[a.id] ? short(S.achieved[a.id]) : ""}, +${ACH_CRYSTALS[a.rarity]} crystals</span>` : `<span class="mute">+${ACH_CRYSTALS[a.rarity]} crystals</span>`}</div></div></div>`; }).join("")}</div>`;
}

/* ---------------- PROGRESS ---------------- */
function viewProgress(C){
  const t = todayD(), p = UI.period || "week";
  let from, to; if (p === "week"){ from = mondayOf(t); to = addDays(from, 6); } else if (p === "month"){ from = new Date(t.getFullYear(), t.getMonth(), 1); to = new Date(t.getFullYear(), t.getMonth() + 1, 0); } else { from = fromKey(S.profile.startDate); to = t; }
  const fk = keyOf(from), tk = keyOf(to), o = {workouts:0, sets:0, volume:0, xp:0, beats:0, missed:0, planned:0, done:0}, musc = {};
  for (const k in C.days){ if (k < fk || k > tk) continue; const x = C.days[k];
    if (x.did) o.workouts++; if (x.planned && k < TODAY()){ o.planned++; if (x.did) o.done++; } if (x.status === "missed") o.missed++;
    o.sets += x.sets; o.volume += x.volume; o.xp += x.xp; o.beats += x.beats.length;
    const l = S.logs[k]; if (l && l.type === "workout") for (const e of l.entries){ const n = validSets(e.sets).length; if (n) musc[MUSCLE_OF[e.ex] || "Other"] = (musc[MUSCLE_OF[e.ex] || "Other"] || 0) + n; } }
  // last 8 weeks
  const weeks = []; for (let i = 7; i >= 0; i--){ const m = addDays(mondayOf(t), -7 * i); if (keyOf(addDays(m, 6)) < S.profile.startDate) continue; const w = weekStats(C, m); weeks.push({l: short(keyOf(m)).split(" ")[0] + " " + short(keyOf(m)).split(" ")[1].slice(0, 3), v: w.volume, s: w.sets, c: w.planned ? Math.round(w.plannedDone / w.planned * 100) : 0}); }
  // strength trend
  const exCount = {}; for (const k in S.logs){ const l = S.logs[k]; if (l.type !== "workout") continue; for (const e of l.entries) if (validSets(e.sets).length) exCount[e.ex] = (exCount[e.ex] || 0) + 1; }
  const exList = Object.keys(exCount).filter(e => exCount[e] >= 2).sort((a, b) => exCount[b] - exCount[a]);
  const ex = exList.includes(UI.statEx) ? UI.statEx : exList[0];
  const exPts = ex ? Object.keys(S.logs).sort().map(k => { const l = S.logs[k]; if (l.type !== "workout") return null; const e = l.entries.find(e => e.ex === ex); const b = e && bestSet(ex, e.sets); return b ? {y: Math.round(b.score * 10) / 10, l: short(k)} : null; }).filter(Boolean).slice(-14) : [];
  // all-time bests
  const bests = Object.keys(exCount).map(e => { let b = null, bk = null; for (const k in S.logs){ const l = S.logs[k]; if (l.type !== "workout") continue; const en = l.entries.find(x => x.ex === e); const bs = en && bestSet(e, en.sets); if (bs && (!b || bs.score > b.score)){ b = bs; bk = k; } } return {e, b, k: bk}; }).filter(x => x.b && isWeighted(x.e)).sort((a, b) => b.b.score - a.b.score).slice(0, 6);
  const mx = Math.max(1, ...Object.values(musc)), wts = S.weights.slice(-12);
  const label = p === "week" ? "This week" : p === "month" ? fmt(t, {month:"long", year:"numeric"}) : "Since " + fmt(from, {day:"numeric", month:"short", year:"numeric"});
  return `<div class="page-h"><h1>Progress</h1><button class="btn sm ghost" data-act="report">Report card</button></div>
  ${segs([["week", "Week"], ["month", "Month"], ["all", "All time"]], p, "period")}
  <div class="sec-h"><h2>${label}</h2><span class="pill acc">+${nf(o.xp)} XP</span></div>
  <div class="stats4">
    <div class="stat"><span class="v num">${o.workouts}</span><span class="l">Workouts</span></div>
    <div class="stat"><span class="v num">${o.sets}</span><span class="l">Sets</span></div>
    <div class="stat"><span class="v num">${kgfmt(o.volume)}<small>kg</small></span><span class="l">Volume</span></div>
    <div class="stat"><span class="v num">${o.planned ? Math.round(o.done / o.planned * 100) : 0}<small>%</small></span><span class="l">Plan kept</span><span class="h">${o.done} of ${o.planned} days</span></div>
  </div>
  ${o.missed ? `<p class="sm bad-t">${o.missed} planned day${o.missed > 1 ? "s" : ""} missed in this period.</p>` : ""}
  <section class="card"><h3>Weekly volume</h3><p class="tiny mute">Kilograms moved on weighted lifts, last ${weeks.length} weeks.</p>${weeks.length ? barChart(weeks.map(w => w.v), weeks.map(w => w.l), {label:"Weekly volume", fmt: v => kgfmt(v)}) : ""}</section>
  <section class="card"><h3>Consistency</h3><p class="tiny mute">Share of planned days trained each week.</p>${weeks.length ? barChart(weeks.map(w => w.c), weeks.map(w => w.l), {label:"Weekly consistency", fmt: v => Math.round(v) + "%", h: 90}) : ""}</section>
  <section class="card"><div class="row between"><h3>Strength trend</h3>${exList.length ? `<select class="select" data-sel="statEx" aria-label="Exercise">${exList.map(e => `<option ${e === ex ? "selected" : ""}>${esc(e)}</option>`).join("")}</select>` : ""}</div>
    ${ex ? `<p class="tiny mute">${metricName(ex)} per session${isWeighted(ex) ? ", from weight and reps (Epley)" : ""}.</p>${lineChart(exPts, {label: ex + " trend"})}` : `<p class="mute sm">Log the same exercise twice to see a trend.</p>`}</section>
  <section class="card"><h3>Muscles trained</h3>${Object.keys(musc).length ? MUSCLES.filter(m => musc[m]).map(m => `<div class="mrow"><span>${m}</span><i class="track"><i style="width:${musc[m] / mx * 100}%"></i></i><b class="num">${musc[m]}</b></div>`).join("") : `<p class="mute sm">Nothing logged in this period.</p>`}</section>
  <section class="card"><h3>Personal records</h3>${bests.length ? bests.map(x => `<button class="line" data-act="ex-hist" data-e="${esc(x.e)}"><span>${esc(x.e)}</span><span class="num"><b>${fmtSet(x.e, x.b.set)}</b> <span class="tiny mute">${short(x.k)}</span></span></button>`).join("") : `<p class="mute sm">Your best weighted lifts appear here.</p>`}</section>
  <section class="card"><div class="row between"><h3>Bodyweight</h3><button class="btn sm ghost" data-act="weigh">Log weight</button></div>${lineChart(wts.map(w => ({y: w.kg, l: short(w.date)})), {label:"Bodyweight trend", fmt: v => v.toFixed(1), empty:"Log your weight weekly to see the trend."})}</section>
  <section class="card"><h3>Progress photos</h3>${photosBlock()}</section>`;
}
function photosBlock(){
  const ps = S.photos;
  if (!ps.length) return `<p class="mute sm">Same pose, same light, once a month. Photos stay on this phone only.</p><button class="btn ghost" data-act="add-photo">${ICON.camera}Add first photo</button>`;
  const a = ps[0], b = ps[ps.length - 1], days = Math.round((fromKey(b.date) - fromKey(a.date)) / 864e5);
  return `${ps.length > 1 ? `<div class="photos"><figure><img src="${a.img}" alt="First photo"><figcaption>${short(a.date)}, ${a.kg} kg</figcaption></figure><figure><img src="${b.img}" alt="Latest photo"><figcaption>${short(b.date)}, ${b.kg} kg</figcaption></figure></div>
    <p class="sm"><b>${days} days</b> apart, <b>${(b.kg - a.kg > 0 ? "+" : "") + (b.kg - a.kg).toFixed(1)} kg</b>.</p>` : `<div class="photos"><figure><img src="${a.img}" alt="First photo"><figcaption>${short(a.date)}, ${a.kg} kg</figcaption></figure><figure class="ph-empty"><span class="tiny mute">Your next photo appears here.</span></figure></div>`}
    ${ps.length > 2 ? `<div class="thumbs">${ps.map((p, i) => `<button data-act="del-photo" data-v="${i}" aria-label="Delete photo from ${short(p.date)}"><img src="${p.img}" alt=""></button>`).join("")}</div><p class="tiny mute">Tap a thumbnail to delete it.</p>` : ""}
    <button class="btn ghost" data-act="add-photo">${ICON.camera}Add photo</button>`;
}

/* ---------------- SETTINGS / PLAN ---------------- */
function viewSettings(C){
  const plan = planOn(TODAY()), st = S.settings, native = !!nativeLN();
  return `<div class="page-h"><button class="iconbtn" data-act="tab" data-v="home" aria-label="Back">${ICON.left}</button><h1>Plan and settings</h1></div>
  ${accountCard()}
  <section class="card row gap"><div class="ava">${S.profile.photo ? `<img src="${S.profile.photo}" alt="">` : esc((S.profile.name || "?")[0].toUpperCase())}</div><div class="grow"><h3>@${esc(S.profile.name)}</h3>
    <div class="tiny mute">${S.profile.height || "?"} cm, goal ${S.profile.goal} kg, since ${fmt(fromKey(S.profile.startDate), {day:"numeric", month:"short", year:"numeric"})}</div></div><button class="btn sm ghost" data-act="edit-profile">Edit</button></section>
  ${secH("Theme")}<div class="tiles">${CATALOG.filter(it => it.slot === "theme").map(it => tile(it, C, S.look, false)).join("")}</div>
  ${secH("Font", `<span class="tiny mute">Changes the whole app</span>`)}<div class="ftiles">${FONTS.map(f => `<button class="ftile ${fontKey() === f[0] ? "on" : ""}" data-font="${f[0]}" data-act="set-font" data-v="${f[0]}" aria-pressed="${fontKey() === f[0]}"><b>${f[1]}</b><span>${f[2]}</span><i>Level 24, 1,280 XP</i></button>`).join("")}</div>
  ${secH("How you train")}${segs([["gym", "Gym"], ["home", "Home"], ["both", "Both"]], S.style, "style")}
  <p class="tiny mute">Changes which exercises you can pick. Home shows calisthenics, holds and running.</p>
  ${secH("Weekly split", `<span class="tiny mute">Tap to change</span>`)}
  <section class="card">${DAYS.map((n, i) => `<div class="plan-day"><span class="dn">${n.slice(0, 3)}</span><div class="chips">${MUSCLES.map(m => `<button class="chip ${plan[i].includes(m) ? "on" : ""}" data-act="toggle-day" data-d="${i}" data-m="${m}">${m}</button>`).join("")}</div></div>`).join("")}</section>
  <p class="tiny mute">No muscle selected means rest. Changes apply from today. Past days keep their old plan.</p>
  ${secH("My exercises")}
  ${MUSCLES.filter(m => plan.some(p => p.includes(m))).map(m => `<section class="card"><h3>${m}</h3><div class="chips">${optsFor(m).map(e => `<button class="chip ${(S.exercises[m] || []).includes(e) ? "on" : ""}" data-act="toggle-ex" data-m="${m}" data-e="${esc(e)}">${esc(e)}</button>`).join("")}</div></section>`).join("")}
  ${secH("Training settings")}<section class="card">
    <div class="line"><div><b>Daily reminder</b><div class="tiny mute">${native ? "Notification at this time on training days." : "Works in the installed Android app."}</div></div>
      <div class="row gap"><input type="time" class="timeinput" data-set="time" value="${st.remind.time}" aria-label="Reminder time"><button class="switch ${st.remind.on ? "on" : ""}" data-act="remind" role="switch" aria-checked="${st.remind.on}" aria-label="Daily reminder"></button></div></div>
    <div class="line"><div><b>Rest timer</b><div class="tiny mute">Starts after each finished set.</div></div>
      <div class="chips">${[0, 60, 90, 120, 180].map(x => `<button class="chip ${st.rest === x ? "on" : ""}" data-act="rest-len" data-v="${x}">${x ? x + "s" : "Off"}</button>`).join("")}</div></div>
    <div class="line"><div><b>Sounds and vibration</b><div class="tiny mute">Set done, timer end, level up.</div></div><button class="switch ${st.sound ? "on" : ""}" data-act="sound" role="switch" aria-checked="${st.sound}" aria-label="Sounds"></button></div></section>
  ${secH("Ranks", `<span class="tiny mute">Level ${C.level}</span>`)}
  <section class="card ladder">${RANKS.map(r => `<div class="rung ${C.level >= r[0] ? "got" : ""} ${C.rank[0] === r[0] ? "cur" : ""}"><span class="lv">${r[1]}</span><div><b><span class="glow" data-rank="${r[1]}">${r[2]}</span></b><div class="tiny mute">${r[3]}</div></div><span class="tiny mute num">Lv ${r[0]}</span></div>`).join("")}</section>
  ${secH("How XP works")}<section class="card">${[["Finish a workout", "+50"], ["Every set you log (max 20)", "+2"], ["Beat your last session on an exercise", "+25"], ["Each daily challenge", "+" + XP.daily], ["Beat 3 bests in a week", "+50"], ["Weigh in during a week", "+20 (+10 base)"], ["Unlock a skill", "+40"], ["Train every planned day in a week", "+100"], ["Rest-day check-in", "+5"]].map(x => `<div class="line"><span>${x[0]}</span><b class="num acc-t">${x[1]} XP</b></div>`).join("")}
    <p class="tiny mute">Missed days stay missed. One streak shield per month saves your streak the first time you miss a planned day.</p></section>
  ${secH("Backup and restore")}<section class="card"><p class="sm mute">Your training data lives only on this phone. Save a backup before changing phones or reinstalling.</p>
    <div class="grid2"><button class="btn ghost sm" data-act="backup">Save backup</button><button class="btn ghost sm" data-act="restore">Restore</button></div></section>
  <div class="grid2">${CLOUD_ON && Cloud.session ? "" : `<button class="btn ghost" data-act="demo">Load demo data</button>`}<button class="btn danger" data-act="reset">Start fresh</button></div>
  <p class="tiny mute center">Ascendant ${VERSION}. Offline first. No ads. 3D hunter built on CC0 MakeHuman assets.</p>`;
}

/* ---------------- ONBOARDING ---------------- */
function blankOnb(){ return {step:0, name:"", hunterName:"", height:"", weight:"", goal:"", photo:null, style:"gym", plan:[[], [], [], [], [], [], []], ex:{}, look: Object.assign({}, BASE_LOOK)}; }
function renderOnboarding(){
  const o = UI.onb = UI.onb || blankOnb(); let body = ""; const N = 5;
  document.documentElement.dataset.theme = "gold";
  if (o.step === 0) body = `<div class="welcome">${hunterStage("welcome-stage", {mode:"hero", interactive:true})}
      <div class="w-copy"><h1>Train in real life.<br>Level up here.</h1><p class="mute">Log every set, earn XP, and watch a 3D hunter evolve with your training.</p></div></div>
      <button class="btn" data-act="onb-next">Create my hunter</button><div class="grid2"><button class="btn ghost" data-act="restore">Restore backup</button><button class="btn ghost" data-act="demo">Try demo data</button></div>`;
  if (o.step === 1) body = `<div class="grow"><h1>Your profile</h1>
      <div class="center"><button class="ava lg" data-act="photo" aria-label="Add a photo">${o.photo ? `<img src="${o.photo}" alt="">` : ICON.camera}</button><div class="tiny mute">Optional photo</div></div>
      <label class="lab" for="n">Username</label><input id="n" class="input" data-o="name" value="${esc(o.name)}" placeholder="deepansh" autocomplete="nickname" maxlength="20" ${CLOUD_ON && Cloud.session ? "readonly" : ""}>
      <div class="grid2"><div><label class="lab" for="h">Height (cm)</label><input id="h" class="input" inputmode="numeric" data-o="height" value="${esc(o.height)}" placeholder="175"></div>
      <div><label class="lab" for="w">Weight (kg)</label><input id="w" class="input" inputmode="decimal" data-o="weight" value="${esc(o.weight)}" placeholder="72"></div></div>
      <label class="lab" for="gl">Goal weight (kg)</label><input id="gl" class="input" inputmode="decimal" data-o="goal" value="${esc(o.goal)}" placeholder="68"></div>
      <button class="btn" data-act="onb-next">Next</button>`;
  if (o.step === 2) body = `<div class="grow"><h1>Where do you train?</h1>
      ${[["gym", "Gym", "Machines, barbells, dumbbells"], ["home", "Home and calisthenics", "Push-ups, pull-ups, pistol squats, holds, running"], ["both", "Both", "Everything"]].map(([k, n, d]) => `<button class="choice ${o.style === k ? "on" : ""}" data-act="onb-style" data-v="${k}"><b>${n}</b><span class="sm mute">${d}</span></button>`).join("")}
      <p class="tiny mute">Gym guilds are joined later from the Guild tab with a code from your gym. Training solo needs nothing else.</p></div>
      <button class="btn" data-act="onb-next">Next</button>`;
  if (o.step === 3) body = `<div class="grow"><h1>Your weekly split</h1><p class="mute sm">Pick what you train each day. Leave a day empty to rest.</p>
      <section class="card">${DAYS.map((n, i) => `<div class="plan-day"><span class="dn">${n.slice(0, 3)}</span><div class="chips">${MUSCLES.map(m => `<button class="chip ${o.plan[i].includes(m) ? "on" : ""}" data-act="onb-day" data-d="${i}" data-m="${m}">${m}</button>`).join("")}</div></div>`).join("")}</section></div>
      <button class="btn" data-act="onb-next">Next</button>`;
  if (o.step === 4){ const used = MUSCLES.filter(m => o.plan.some(p => p.includes(m))); used.forEach(m => { if (!o.ex[m]) o.ex[m] = optsFor(m, o.style).slice(0, 3); });
    body = `<div class="grow"><h1>Choose your exercises</h1><p class="mute sm">They show up on the days you train each muscle. Change them any time.</p>
      ${used.map(m => `<section class="card"><h3>${m}</h3><div class="chips">${optsFor(m, o.style).map(e => `<button class="chip ${o.ex[m].includes(e) ? "on" : ""}" data-act="onb-ex" data-m="${m}" data-e="${esc(e)}">${esc(e)}</button>`).join("")}</div></section>`).join("")}</div>
      <button class="btn" data-act="onb-next">Next</button>`; }
  if (o.step === 5) body = `<div class="grow"><h1>Create your hunter</h1><p class="mute sm">Your hunter starts untrained and evolves from the sets you log. Rare and epic items unlock later.</p>
      <section class="studio onb-studio">${hunterStage("studio-stage", {mode:"hero", interactive:true, view: UI.view || "front"})}
      <div class="view-btns">${VIEW_BTNS.map(([k, l]) => `<button class="${(UI.view || "front") === k ? "on" : ""}" data-act="view" data-v="${k}">${l}</button>`).join("")}</div></section>
      ${panelLook(null, "onb")}</div><button class="btn" data-act="onb-next">Start my journey</button>`;
  $("#app").innerHTML = `<div class="onb">${o.step ? `<div class="steps" aria-label="Step ${o.step} of ${N}">${Array.from({length:N}, (_, i) => `<i class="${o.step >= i + 1 ? "on" : ""}"></i>`).join("")}</div>` : ""}${body}</div>`;
  mountStage();
}
function onbNext(){
  const o = UI.onb;
  if (o.step === 1){ if (!o.name.trim()) return toast("Enter a username"); if (!(+o.weight > 20 && +o.weight < 300)) return toast("Enter your weight in kg"); }
  if (o.step === 3 && !o.plan.some(p => p.length)) return toast("Pick at least one training day");
  if (o.step === 4) for (const m in o.ex) if (o.plan.some(p => p.includes(m)) && !o.ex[m].length) return toast(`Pick at least one ${m} exercise`);
  if (o.step === 5){
    const t = TODAY();
    S = migrate({theme:"gold", profile:{name:o.name.trim(), photo:o.photo, height:+o.height || 0, startWeight:+o.weight, goal:+o.goal || +o.weight, startDate:t},
      planHistory:[{from:t, plan:o.plan}], exercises:o.ex, logs:{}, weights:[{date:t, kg:+o.weight}], style:o.style, path:"solo", look:o.look, owned:[], ownedV2:true,
      hunterName: (o.hunterName || "").trim() || o.name.trim()});
    const C0 = compute(); S.seen = {level:C0.level, skills:[]}; S.seenEvo = C0.evo[0];
    UI.onb = null; UI.tab = "home"; save(); render(); scrollTo(0, 0); toast("The System has registered you");
    if (CLOUD_ON && Cloud.session){ Sync.run(); refreshAccount().then(() => render()).catch(() => {}); }
    return;
  }
  o.step++; renderOnboarding(); scrollTo(0, 0);
}

/* ---------------- CEREMONY + CARDS ---------------- */
const queueBase = queueCeremonies;
queueCeremonies = function(before, C){
  const prevEvo = S.seenEvo ?? (S.seen ? evoOf(S.seen.level)[0] : C.evo[0]);
  const r = queueBase(before, C);
  if (C.evo[0] > prevEvo) UI.queue.push({evo: C.evo});
  S.seenEvo = Math.max(prevEvo, C.evo[0]); save();
  return r;
};
/* Cinematic ceremonies: energy gathers, impact, then the result. Colours follow the hunter's rank. */
const RANK_COL = {E:"#AEB4BD", D:"#5FBF8F", C:"#5E9BE6", B:"#A77BEA", A:"#E5B24A", S:"#FF5A3C"};
function cineOpen(inner, col, cls){
  $("#cer").innerHTML = `<div class="cer cine ${cls || ""}" role="dialog" aria-modal="true" style="--cc:${col}"><div class="cine-veil"></div><div class="cine-core">${inner}</div><button class="btn cine-go" data-act="cer-close">Continue</button></div>`;
}
function cineImpact(col, big, onHit){
  const [x0, y0] = FX.pos(".cine-emb"); SFX.charge(); FX.implode(x0, y0, {col, n: big ? 120 : 76});
  FX.at(620, () => {
    const [x, y] = FX.pos(".cine-emb"); (big ? SFX.rankup : SFX.impact)(); buzz(big ? [30, 40, 120, 60, 260] : [20, 30, 140]);
    FX.flash({alpha: big ? .7 : .45}); FX.glow(x, y, {col, r: big ? 440 : 300, dur: 1000});
    FX.ring(x, y, {col, width: big ? 10 : 6}); FX.ring(x, y, {col: "#ffffff", width: 3, delay: 90, dur: 900}); if (big) FX.ring(x, y, {col, width: 5, delay: 240, dur: 1100});
    FX.burst(x, y, {col, n: big ? 160 : 96, speed: big ? 920 : 720}); FX.shake(".cine");
    FX.embers({col, dur: 90000, rate: big ? 26 : 16, tag: "cer"});
    if (onHit) onHit();
  });
}
function ceremony(p){
  FX.clear();
  if (p.reward) return rewardCeremony(p.reward);
  const emb = h => `<div class="cine-emb"><div class="cine-rays"></div>${h}</div>`;
  let inner, col = FX.accent(), big = false, onHit = null;
  if (p.skill){ const u = p.skill; inner = `${emb(hexBadge("★", 116, "cer-hex"))}<div class="k">Skill unlocked</div><div class="cer-t">${esc(nodeLabel(u.ex, u.target))}</div><p>+${XP.skill} XP and 3 crystals.</p>`; }
  else if (p.evo){ big = true; inner = `${emb(`<div class="stage cer-stage" data-stage='{"mode":"hero","interactive":false}'></div>`)}<div class="k">Evolution</div><div class="cer-t">${p.evo[1]} form</div><p>${esc(p.evo[2])}</p>`;
    onHit = () => { try { window.Hunter3D.setCharged(true, col); window.Hunter3D.burst(col); } catch(e){} }; }
  else { const rankUp = p.rank[0] !== p.prevRank[0]; col = RANK_COL[p.rank[1]] || col; big = rankUp;
    inner = rankUp ? `${emb(hexBadge(p.rank[1], 136, "cer-hex"))}<div class="k">New rank</div><div class="cer-t">${p.rank[2]}</div><p>${p.rank[3]} +5 crystals.</p>`
      : `${emb(hexBadge(String(p.prevLevel || p.level), 124, "cer-hex"))}<div class="k">Level up</div><div class="cer-t">Level ${p.level}</div><p>${nf(200 + 50 * p.level)} XP to the next level.</p>`;
    if (!rankUp && p.prevLevel) onHit = () => FX.count(".cine-emb .hexb b", p.prevLevel, p.level, 420); }
  cineOpen(inner, col, big ? "big" : "");
  if (p.evo){ const app = $("#app .stage"); if (app) app.classList.remove("stage"); mountStage(); }
  if (FX.reduced){ const n = $(".cine-emb .hexb b"); if (n && p.level && !big) n.textContent = p.level; SFX.level(); buzz([80, 60, 240]); return; }
  cineImpact(col, big, onHit);
}
function rewardCeremony(r){
  const col = FX.accent();
  cineOpen(`<div class="k">Workout complete</div>
    <div class="rw-xp"><span class="num">+<span id="rw-n">${FX.reduced ? nf(r.tot) : 0}</span></span><small>XP</small></div>
    ${r.gained > 0 ? `<span class="rw-cry">${CRY} +${r.gained} crystals</span>` : ""}
    <ul class="rw-list">${r.items.map((i, n) => `<li style="--i:${n}"><span>${esc(i[0])}</span><b>+${i[1]}</b></li>`).join("")}</ul>
    ${r.prs.length ? `<div class="rw-prs" style="--i:${r.items.length}">${r.prs.map(e => `<span>New best: ${esc(e)}</span>`).join("")}</div>` : ""}
    <div class="rw-lv" style="--i:${r.items.length + 1}"><div class="row between"><span>Level ${r.lv0}</span><span>${r.up ? "Level up" : `${nf(r.left)} XP to level ${r.lv0 + 1}`}</span></div>
      <div class="rw-bar"><i style="width:${FX.reduced ? r.p1 : r.p0}%"></i></div></div>`, col, "reward");
  SFX.reward(); buzz([30, 40, 90]);
  if (FX.reduced) return;
  const [x, y] = FX.pos(".rw-xp"); let lastTick = 0;
  FX.glow(x, y, {col, r: 300, dur: 1300}); FX.ring(x, y, {col, r1: innerWidth * .95, dur: 800}); FX.burst(x, y, {col, n: 80, speed: 660});
  FX.embers({col, dur: 90000, rate: 14, tag: "cer"});
  FX.at(160, () => { FX.fountain(x, y + 26, {col, dur: 950, w: 70});
    FX.count("#rw-n", 0, r.tot, 1050, nf, () => { const n = performance.now(); if (n - lastTick > 70){ lastTick = n; SFX.tick(); } }); });
  FX.at(750 + r.items.length * 130, () => { const b = $(".rw-bar i"); if (b) b.style.width = r.p1 + "%"; });
  if (r.up) FX.at(1900 + r.items.length * 130, () => { const bar = $(".rw-bar"); if (!bar) return; const q = bar.getBoundingClientRect(); FX.burst(q.right, q.top + q.height / 2, {col, n: 46, speed: 520}); FX.ring(q.right, q.top, {col, r1: 160, dur: 500, width: 4}); buzz(40); });
}
async function makeCard(kind){
  try { await document.fonts.ready; } catch(e){}
  const C = compute(), cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
  const W = 1080, H = 1350, c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d");
  const DF = "'Sora','SoraLocal',sans-serif", BF = "'Inter','InterLocal',sans-serif", NF = "'BarlowLocal','Barlow Condensed',sans-serif";
  x.fillStyle = v("--bg"); x.fillRect(0, 0, W, H);
  const gr = x.createRadialGradient(W / 2, 600, 40, W / 2, 600, 700); gr.addColorStop(0, v("--surface2")); gr.addColorStop(1, v("--bg")); x.fillStyle = gr; x.fillRect(0, 0, W, H);
  x.textAlign = "center"; x.fillStyle = v("--acc"); x.font = `600 30px ${DF}`; x.fillText("Ascendant", W / 2, 96);
  let g, lw, wk;
  if (kind === "week"){ wk = addDays(mondayOf(todayD()), -7); lw = weekStats(C, wk); g = gradeOf(lw); }
  const shot = kind !== "week" && window.Hunter3D && window.Hunter3D.supported ? await window.Hunter3D.snapshot(640, 860).catch(() => null) : null;
  if (shot) await new Promise(res => { const im = new Image(); im.onload = () => { x.drawImage(im, W / 2 - 320, 130, 640, 860); res(); }; im.onerror = res; im.src = shot; });
  else { x.fillStyle = v("--ink"); x.font = `700 ${kind === "week" ? 360 : 300}px ${NF}`; x.fillText(kind === "week" ? g : C.rank[1], W / 2, 640); }
  x.fillStyle = v("--ink"); x.font = `700 72px ${DF}`; x.fillText(kind === "week" ? `Grade ${g}` : (S.hunterName || S.profile.name), W / 2, 1040);
  x.fillStyle = v("--mute"); x.font = `500 32px ${BF}`;
  x.fillText(kind === "week" ? `@${S.profile.name}, week of ${short(keyOf(wk))}` : `@${S.profile.name}, ${C.rank[2]} rank, level ${C.level}`, W / 2, 1092);
  const stats = kind === "week" ? [[`${lw.plannedDone}/${lw.planned}`, "Planned days"], [lw.sets, "Sets"], [lw.beats, "Bests beaten"]] : [[C.streak, "Day streak"], [C.workouts, "Workouts"], [C.evo[1], "Form"]];
  stats.forEach((s, i) => { const sx = 200 + i * 340, sy = 1205; x.fillStyle = v("--surface"); roundRect(x, sx - 150, sy - 66, 300, 132, 22); x.fill();
    x.fillStyle = i === 1 ? v("--acc") : v("--ink"); x.font = `700 60px ${NF}`; x.fillText(String(s[0]), sx, sy + 10); x.fillStyle = v("--mute"); x.font = `500 24px ${BF}`; x.fillText(s[1], sx, sy + 46); });
  return c.toDataURL("image/png");
}
function roundRect(x, a, b, w, h, r){ x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
async function showCard(kind){
  modal(`<p class="mute sm center">Making your card…</p>`);
  const url = await makeCard(kind);
  modal(`<h2>${kind === "week" ? "Your report card" : "Your hunter card"}</h2><img src="${url}" alt="Share card" class="cardimg">
    <p class="tiny mute">Long-press the image to save it if the buttons do not work on your phone.</p>
    <div class="grid2"><button class="btn ghost" data-act="dl-card">Save image</button><button class="btn" data-act="share-card">${ICON.share}Share</button></div>`);
  UI.card = url;
}
async function shareCard(){
  if (await nativeShare("ascendant-card.png", UI.card.split(",")[1], "Leveling up with Ascendant")) return;
  try { const blob = await (await fetch(UI.card)).blob(); const file = new File([blob], "ascendant.png", {type:"image/png"});
    if (navigator.canShare && navigator.canShare({files:[file]})){ await navigator.share({files:[file], text:"Leveling up with Ascendant"}); return; } } catch(e){}
  toast("Sharing is not available here. Long-press the image to save it.");
}
function reportCard(){
  const C = compute(), mon = addDays(mondayOf(todayD()), -7), w = weekStats(C, mon), g = gradeOf(w);
  if (!g) return toast("No report card yet. The first one arrives after your first full week.");
  S.seenReport = keyOf(mondayOf(todayD())); save();
  modal(`<div class="center"><div class="sm mute">Week of ${short(keyOf(mon))}</div><div class="grade big g-${g}">${g}</div><p class="mute sm">${GRADE_LINE[g]}</p></div>
    ${[["Planned days trained", `${w.plannedDone} / ${w.planned}`], ["Sets", w.sets], ["Weight lifted", nf(w.volume) + " kg"], ["Bests beaten", w.beats], ["XP earned", "+" + nf(w.xp)]].map(r => `<div class="line"><span>${r[0]}</span><b class="num">${r[1]}</b></div>`).join("")}
    <p class="tiny mute">Grade S needs every planned day plus 3 or more bests beaten.</p>
    <div class="grid2"><button class="btn ghost" data-act="close">Close</button><button class="btn" data-act="share-week">${ICON.share}Share</button></div>`);
}
function passSheet(){
  const pr = (UI.products || []).find(p => p.id === "pass");
  modal(`<h2>Ascendant Pass</h2><div class="price num">${pr ? "₹" + pr.amount_paise / 100 : PASS_PRICE}</div><p class="sm mute">One payment. No subscription.</p>
    <ul class="ticks">${["Every rare and epic item, now and future", "Free body and face redesigns", "All themes", "Supports an independent app from Bokaro"].map(f => `<li>${ICON.check}<span>${f}</span></li>`).join("")}</ul>
    <p class="tiny mute">Legendary items are still earned by level, and nothing in the Pass affects guild rankings.</p>
    ${CLOUD_ON && !S.demo ? `<button class="btn" data-act="ac-buy" data-v="pass">Buy the Pass</button><p class="tiny mute">Secure payment by Razorpay: UPI, cards, net banking.</p>`
      : `<p class="sm warn">Purchases need a signed-in Ascendant account.</p><button class="btn ghost" data-act="close">Close</button>`}`);
}

/* ---------------- ACTIONS ---------------- */
function finish(){
  const t = TODAY(), L = S.logs[t]; delete S.logs[t]; const before = compute(); S.logs[t] = L;
  if (!daySets(L)) return toast("Log at least one set first");
  L.saved = true; save(); stopTimer();
  const C = compute(), x = C.days[t], wk = keyOf(mondayOf(todayD()));
  const items = [["Workout finished", XP.workout], [`Sets logged (${x.sets})`, Math.min(XP.setCap, x.sets * XP.set)]];
  if (x.beats.length) items.push([`Beat last time (${x.beats.length})`, x.beats.length * XP.beat]);
  const dc = dailyChallenges(C, t).filter(c => c.done).length - dailyChallenges(before, t).filter(c => c.done).length;
  if (dc > 0) items.push([`Daily challenges (${dc})`, dc * XP.daily]);
  const newSkills = queueCeremonies(before, C);
  newSkills.forEach(u => items.push([`Skill: ${nodeLabel(u.ex, u.target)}`, XP.skill]));
  if (C.weekBonus[wk] && !before.weekBonus[wk]) items.push(["Full week completed", C.weekBonus[wk]]);
  const tot = C.xp - before.xp, gained = C.crystals - before.crystals;
  const prs = L.entries.filter(e => { const b = bestSet(e.ex, e.sets), bb = bestBefore(e.ex, t); return b && bb && b.score > bb.score + 1e-9; }).map(e => e.ex);
  const pct = c => c.level >= 60 ? 100 : Math.round(c.into / c.need * 100), up = C.level > before.level;
  UI.queue = UI.queue || []; UI.queue.unshift({reward: {tot, gained, items, prs, lv0: before.level, up, p0: pct(before), p1: up ? 100 : pct(C), left: C.need - C.into}});
  UI.justTrained = true;
  render(); scheduleReminders(); UI.board = {}; nextCeremony();
}
function checkLevelChange(before){ queueCeremonies(before, compute()); if (!$("#layer").innerHTML) nextCeremony(); }
function curLog(){ return S.logs[logKey()]; }
function addExercise(){
  const L = curLog(); const have = new Set((L && L.entries || []).map(e => e.ex));
  modal(`<h2>Add exercise</h2>${MUSCLES.map(m => `<div class="sub-h">${m}</div><div class="chips">${optsFor(m).filter(e => !have.has(e)).map(e => `<button class="chip" data-act="pick-ex" data-e="${esc(e)}">${esc(e)}</button>`).join("")}</div>`).join("")}`);
}
function trainAnyway(){ modal(`<h2>What are you training?</h2><div class="chips">${MUSCLES.map(m => `<button class="chip" data-act="extra" data-m="${m}">${m}</button>`).join("")}</div>`); }
function goDay(k){ const d = fromKey(k); UI.trainTab = "today"; UI.tab = "train"; UI.weekOff = Math.round((mondayOf(d) - mondayOf(todayD())) / (7 * 864e5)); UI.sel = wd(d); }
function itemTap(id){
  const it = CAT[id], C = compute(); if (!it) return;
  if (UI.previewKind === "identity") return toast("Save or discard your body change first");
  if (it.slot === "theme"){ if (owns(id, C.level)){ S.theme = it.key; UI.previewItem = null; save(); render(); return; }
    UI.previewItem = id; UI.previewKind = "item"; UI.preview = null; UI.tab = UI.tab === "settings" ? "hunter" : UI.tab; UI.htab = UI.htab || "shop"; render(); return; }
  const patch = lookPatch(it, curLook());
  if (owns(id, C.level)){ Object.assign(S.look, lookPatch(it, S.look)); UI.preview = null; UI.previewItem = null; UI.previewKind = null; save(); render(); return; }
  UI.preview = patch; UI.previewItem = id; UI.previewKind = "item"; render();
}
function onbItem(id){
  const it = CAT[id]; if (!it) return; if (it.cost || it.earn) return toast(`${it.name} unlocks after you start`);
  Object.assign(UI.onb.look, lookPatch(it, UI.onb.look)); renderOnboarding();
}
function setIdentity(look, f, v){
  look[f] = f === "skin" ? +v : v;
  if (f === "gender"){ if (v === "female"){ look.beard = "none"; if (look.top === "none") look.top = "tank"; } else if (look.top === "sportsbra") look.top = "tank"; }
}

document.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const a = b.dataset.act, v = b.dataset.v;
  switch (a){
    case "close-scrim": if (e.target === b) closeModal(); return;
    case "close": closeModal(); return;
    case "set-font": S.settings.font = v === "default" ? "" : v; save(); render(); toast("Font changed"); return;
    case "tab": if (UI.editKey) return toast("Save or discard your log edit first"); UI.tab = v; if (v === "train"){ UI.weekOff = 0; UI.sel = wd(todayD()); }
      if (v !== "hunter"){ UI.preview = null; UI.previewItem = null; UI.previewKind = null; } render(); scrollTo(0, 0); return;
    case "train-tab": UI.trainTab = v; render(); return;
    case "htab": UI.tab = "hunter"; UI.htab = v; render(); return;
    case "open-shop": UI.tab = "hunter"; UI.htab = "shop"; render(); scrollTo(0, 0); return;
    case "open-badges": UI.tab = "hunter"; UI.htab = "badges"; render(); scrollTo(0, 0); return;
    case "lcat": UI.lcat = v; if (UI.onb) renderOnboarding(); else render(); return;
    case "ctarget": UI.colorTarget = v; render(); return;
    case "view": UI.view = v; document.querySelectorAll(".view-btns button").forEach(x => x.classList.toggle("on", x.dataset.v === v)); if (window.Hunter3D) window.Hunter3D.view(v); return;
    case "item": itemTap(v); return;
    case "onb-item": onbItem(v); return;
    case "onb-look": setIdentity(UI.onb.look, b.dataset.f, v); renderOnboarding(); return;
    case "id-set": { const f = b.dataset.f; if (UI.previewKind === "item"){ UI.preview = null; UI.previewItem = null; }
      const tmp = Object.assign({}, S.look, UI.preview || {}); setIdentity(tmp, f, v);
      const diff = {}; ["gender", "skin", "face", "jaw", "nose", "eyes", "brows", "build", "beard", "top"].forEach(k => { if (tmp[k] !== S.look[k]) diff[k] = tmp[k]; });
      UI.preview = Object.keys(diff).length ? diff : null; UI.previewKind = UI.preview ? "identity" : null; render(); return; }
    case "save-identity": { const C = compute(); if (!hasPass() && C.crystals < REDESIGN_COST){ toast(`You need ${REDESIGN_COST} crystals`); UI.htab = "shop"; render(); return; }
      if (!hasPass()) S.wallet.spent += REDESIGN_COST; Object.assign(S.look, UI.preview); UI.preview = null; UI.previewKind = null; save(); render(); SFX.done(); toast("Hunter redesigned"); return; }
    case "cancel-preview": UI.preview = null; UI.previewItem = null; UI.previewKind = null; render(); return;
    case "buy-item": { const it = CAT[v], C = compute(); if (!it || it.earn) return;
      if (C.crystals < it.cost){ toast(`You need ${it.cost} crystals, you have ${C.crystals}`); UI.htab = "shop"; render(); return; }
      S.wallet.spent += it.cost; if (!S.owned.includes(v)) S.owned.push(v);
      if (it.slot === "theme") S.theme = it.key; else Object.assign(S.look, lookPatch(it, S.look));
      UI.preview = null; UI.previewItem = null; UI.previewKind = null; save(); render(); SFX.set(); toast(`${it.name} unlocked`); return; }
    case "buy-pack": { const pk = PACKS[0], C = compute(); if (C.crystals < pk.cost){ toast(`You need ${pk.cost} crystals, you have ${C.crystals}`); return; }
      S.wallet.spent += pk.cost; pk.items.forEach(id => { if (!S.owned.includes(id)) S.owned.push(id); });
      Object.assign(S.look, {top:"hoodie", bottom:"joggers", shoes:"high", topColor:"onyx", bottomColor:"onyx"}); save(); render(); SFX.done(); toast(`${pk.name} unlocked`); return; }
    case "pass": passSheet(); return;
    case "go-today": { if (UI.editKey) return toast("Save or discard your log edit first"); goDay(TODAY()); render(); scrollTo(0, 0);
      if (!musclesOn(TODAY()).length && !(S.logs[TODAY()] && S.logs[TODAY()].type === "workout")) trainAnyway(); return; }
    case "open-day": goDay(b.dataset.k); render(); scrollTo(0, 0); return;
    case "hist-more": UI.histN = (UI.histN || 25) + 25; render(); return;
    case "ex-hist": exHistory(b.dataset.e); return;
    case "sel": if (UI.editKey) return toast("Save or discard your log edit first"); UI.sel = +v; render(); return;
    case "wk": if (UI.editKey) return toast("Save or discard your log edit first"); UI.weekOff = Math.min(0, UI.weekOff + +v); render(); return;
    case "edit-day": UI.editKey = b.dataset.k; UI.editBackup = JSON.stringify(S.logs[UI.editKey]); render(); return;
    case "discard-edit": S.logs[UI.editKey] = JSON.parse(UI.editBackup); UI.editKey = null; UI.editBackup = null; save(); render(); toast("Changes discarded"); return;
    case "save-edit": { const k = UI.editKey, L = S.logs[k]; L.entries.forEach(en => en.sets = en.sets.filter(s => +s.reps > 0)); L.entries = L.entries.filter(en => en.sets.length);
      if (!L.entries.length) delete S.logs[k]; UI.editKey = null; UI.editBackup = null; save(); const before = compute(); render(); toast("Log updated"); checkLevelChange(before); guildPush(); return; }
    case "addset": { const ent = curLog().entries[+b.dataset.e], last = ent.sets[ent.sets.length - 1] || {}; ent.sets.push({kg:last.kg}); save(); render(); return; }
    case "repeat": { const ent = curLog().entries[+b.dataset.e], last = lastSession(ent.ex, logKey()); if (last){ ent.sets = last.sets.map(s => ({kg:s.kg, reps:s.reps, km:s.km})); save(); render(); toast("Filled from last time. Change any set you beat."); } return; }
    case "delset": { const ent = curLog().entries[+b.dataset.e], si = +b.dataset.s, removed = ent.sets.splice(si, 1)[0]; save(); render();
      toast("Set removed", {label:"Undo", fn:() => { ent.sets.splice(si, 0, removed); save(); render(); }}); return; }
    case "delex": { const L = curLog(), ei = +b.dataset.e, removed = L.entries.splice(ei, 1)[0]; save(); render();
      toast(`${removed.ex} removed`, {label:"Undo", fn:() => { L.entries.splice(ei, 0, removed); save(); render(); }}); return; }
    case "add-ex": addExercise(); return;
    case "pick-ex": { const L = UI.editKey ? curLog() : ensureToday(musclesOn(TODAY())); L.entries.push({ex:b.dataset.e, sets:[{}, {}, {}]}); save(); closeModal(); render(); return; }
    case "train-anyway": trainAnyway(); return;
    case "extra": { const m = b.dataset.m; if (!S.exercises[m] || !S.exercises[m].length) S.exercises[m] = optsFor(m).slice(0, 3);
      S.logs[TODAY()] = {type:"workout", entries:S.exercises[m].map(ex => ({ex, sets:[{}, {}, {}]}))}; save(); closeModal(); goDay(TODAY()); render(); return; }
    case "mark-rest": modal(`<h2>Rest today?</h2><p class="mute">${focusText(musclesOn(TODAY()))} was planned. Resting on a planned day counts as skipped.</p>
      <div class="grid2"><button class="btn ghost" data-act="close">Keep training</button><button class="btn danger" data-act="confirm-rest">Rest today</button></div>`); return;
    case "confirm-rest": S.logs[TODAY()] = {type:"rest"}; save(); closeModal(); render(); return;
    case "undo-rest": delete S.logs[TODAY()]; save(); render(); return;
    case "finish": finish(); return;
    case "t-adj": T.end += (+v) * 1000; T.dur = Math.max(T.dur, Math.round((T.end - Date.now()) / 1000)); drawTimer(); return;
    case "t-skip": stopTimer(); return;
    case "cer-close": FX.clear(); $("#cer").innerHTML = ""; render(); nextCeremony(); return;
    case "checkin": { const before = compute(); S.checkins[TODAY()] = v; save(); render(); toast(`Checked in: ${v.toLowerCase()}`); checkLevelChange(before); return; }
    case "weigh": modal(`<h2>Log bodyweight</h2><p class="mute sm">Weigh in once a week, same time, before breakfast.</p>
      <label class="lab" for="wkg">Today's weight (kg)</label><input id="wkg" class="input" inputmode="decimal" placeholder="${currentWeight()}">
      <button class="btn" data-act="save-weight">Save weight</button>`); setTimeout(() => $("#wkg") && $("#wkg").focus(), 60); return;
    case "save-weight": { const kg = parseFloat(($("#wkg").value || "").replace(",", ".")); if (!(kg > 20 && kg < 300)) return toast("Enter a weight between 20 and 300 kg");
      const before = compute(), t = TODAY(); S.weights = S.weights.filter(w => w.date !== t); S.weights.push({date:t, kg}); S.weights.sort((x, y) => x.date < y.date ? -1 : 1); save(); closeModal(); render(); toast("Weight saved"); checkLevelChange(before); return; }
    case "shield-info": modal(`<h2>Streak shield</h2><p class="mute">You get 1 shield every month. The first time you miss a planned day in a month, the shield saves your streak automatically.</p>
      <p><b>${compute().shieldsLeft ? "Your shield for this month is ready." : "You used this month's shield. The next one arrives on the 1st."}</b></p><button class="btn" data-act="close">Got it</button>`); return;
    case "report": reportCard(); return;
    case "share-rank": showCard("rank"); return;
    case "share-week": showCard("week"); return;
    case "dl-card": if (!(await nativeShare("ascendant-card.png", UI.card.split(",")[1], "My Ascendant card"))) download(UI.card, "ascendant-card.png"); return;
    case "share-card": shareCard(); return;
    case "period": UI.period = v; render(); return;
    case "add-photo": $("#progress").click(); return;
    case "del-photo": { const i = +v, removed = S.photos.splice(i, 1)[0]; save(); render(); toast("Photo deleted", {label:"Undo", fn:() => { S.photos.splice(i, 0, removed); save(); render(); }}); return; }
    case "gcat": UI.gcat = v; render(); return;
    case "gper": UI.gper = v; render(); return;
    case "style": S.style = v; save(); render(); return;
    case "add-skill-ex": { const ex = b.dataset.e, L = ensureToday(musclesOn(TODAY())); if (!L.entries.some(e => e.ex === ex)) L.entries.push({ex, sets:[{}, {}, {}]}); save();
      goDay(TODAY()); render(); scrollTo(0, 0); toast(`${ex} added to today`); return; }
    case "toggle-day": { const d = +b.dataset.d, m = b.dataset.m, t = TODAY(), p = JSON.parse(JSON.stringify(planOn(t)));
      p[d] = p[d].includes(m) ? p[d].filter(x => x !== m) : [...p[d], m];
      const h = S.planHistory.find(h => h.from === t); if (h) h.plan = p; else S.planHistory.push({from:t, plan:p});
      if (!S.exercises[m] || !S.exercises[m].length) S.exercises[m] = optsFor(m).slice(0, 3); save(); render(); scheduleReminders(); return; }
    case "toggle-ex": { const m = b.dataset.m, ex = b.dataset.e, l = S.exercises[m] = S.exercises[m] || [];
      if (l.includes(ex)){ if (l.length === 1) return toast("Keep at least one exercise"); S.exercises[m] = l.filter(x => x !== ex); } else l.push(ex); save(); render(); return; }
    case "remind": S.settings.remind.on = !S.settings.remind.on; save(); render(); scheduleReminders(); if (!nativeLN()) toast("Reminders work in the installed Android app"); return;
    case "rest-len": S.settings.rest = +v; save(); render(); return;
    case "sound": S.settings.sound = !S.settings.sound; save(); render(); return;
    case "edit-profile": { const p = S.profile; modal(`<h2>Edit profile</h2>
      <label class="lab" for="en">Username</label><input id="en" class="input" maxlength="20" value="${esc(p.name)}">
      <label class="lab" for="ehn">Hunter name</label><input id="ehn" class="input" maxlength="18" value="${esc(S.hunterName || "")}">
      <div class="grid2"><div><label class="lab" for="eh">Height (cm)</label><input id="eh" class="input" inputmode="numeric" value="${p.height || ""}"></div><div><label class="lab" for="eg">Goal weight (kg)</label><input id="eg" class="input" inputmode="decimal" value="${p.goal}"></div></div>
      <button class="btn" data-act="save-profile">Save</button>`); return; }
    case "save-profile": { const n = $("#en").value.trim(); if (!n) return toast("Enter a username"); S.profile.name = n; S.hunterName = $("#ehn").value.trim() || n;
      S.profile.height = +$("#eh").value || S.profile.height; S.profile.goal = +$("#eg").value || S.profile.goal; save(); closeModal(); render(); return; }
    case "photo": $("#photo").click(); return;
    case "backup": backup(); return;
    case "copy-backup": try { await navigator.clipboard.writeText(JSON.stringify(S)); toast("Backup code copied"); } catch(err){ const t = $("#bk"); t.select(); toast("Select all and copy the code"); } return;
    case "restore": restoreSheet(); return;
    case "restore-file": $("#restore").click(); return;
    case "restore-paste": restoreFrom($("#paste").value.trim()); return;
    case "confirm-restore": S = migrate(UI.restore); if (!S.seen){ const C0 = compute(); S.seen = {level:C0.level, skills:C0.skills.unlocked.map(skId)}; S.seenEvo = C0.evo[0]; } UI.restore = null; UI.onb = null; UI.achInit = false; save(); closeModal(); UI.tab = "home"; render(); toast("Backup restored"); return;
    case "demo": if (CLOUD_ON) STORE_KEY = KEY + ":demo"; UI.auth = null; S = demoState(); S.demo = true; S.hunterName = "Demo Hunter"; { const C0 = compute(); S.seen = {level:C0.level, skills:C0.skills.unlocked.map(skId)}; S.seenEvo = C0.evo[0]; }
      UI.onb = null; UI.achInit = false; save(); UI.tab = "home"; UI.period = "week"; render(); scrollTo(0, 0); toast("Demo data loaded"); return;
    case "reset":
      if (S && S.demo){ try { localStorage.removeItem(STORE_KEY); } catch(err){} S = null; STORE_KEY = KEY; UI.onb = null; UI.tab = "home";
        if (CLOUD_ON){ UI.auth = {step:"welcome"}; } else UI.onb = blankOnb(); render(); scrollTo(0, 0); return; }
      modal(`<h2>Start fresh?</h2><p class="mute">This deletes every workout, weight, photo and XP${CLOUD_ON && Cloud.session ? " on this phone and on the Ascendant server. Your account, username and guild stay" : " on this phone. Save a backup first if you might want it back"}.</p>
      <div class="grid2"><button class="btn ghost" data-act="close">Cancel</button><button class="btn danger" data-act="confirm-reset">Delete my training</button></div>`); return;
    case "confirm-reset": {
      if (CLOUD_ON && Cloud.session){ try { await Cloud.rpc("reset_my_training"); } catch(err){ return toast("Could not reset on the server: " + err.message); } }
      closeModal(); stopTimer(); const uname = CLOUD_ON && Cloud.session ? Cloud.session.username : ""; S = null; try { localStorage.removeItem(STORE_KEY); } catch(err){}
      UI.onb = blankOnb(); UI.onb.name = uname; UI.onb.step = uname ? 1 : 0; UI.tab = "home"; render(); scrollTo(0, 0); return; }
    case "onb-style": UI.onb.style = v; UI.onb.ex = {}; renderOnboarding(); return;
    case "onb-day": { const o = UI.onb, d = +b.dataset.d, m = b.dataset.m; o.plan[d] = o.plan[d].includes(m) ? o.plan[d].filter(x => x !== m) : [...o.plan[d], m]; renderOnboarding(); return; }
    case "onb-ex": { const o = UI.onb, m = b.dataset.m, ex = b.dataset.e; o.ex[m] = o.ex[m].includes(ex) ? o.ex[m].filter(x => x !== ex) : [...o.ex[m], ex]; renderOnboarding(); return; }
    case "onb-next": onbNext(); return;
  }
});
document.addEventListener("input", e => {
  const el = e.target;
  if (el.dataset.in){ const s = curLog().entries[+el.dataset.e].sets[+el.dataset.s], val = el.value.replace(",", ".");
    s[el.dataset.in] = val === "" ? undefined : +val; save(); return; }
  if (el.dataset.o && UI.onb) UI.onb[el.dataset.o] = el.value;
  if ("hn" in el.dataset){ if (UI.onb) UI.onb.hunterName = el.value; else { S.hunterName = el.value.trim() || S.profile.name; save(); } }
});
document.addEventListener("change", e => {
  const el = e.target;
  if (el.dataset.set === "time"){ S.settings.remind.time = el.value || "18:30"; save(); scheduleReminders(); return; }
  if (el.dataset.sel === "statEx"){ UI.statEx = el.value; render(); return; }
  if (el.dataset.in){ const k = logKey(), ent = curLog().entries[+el.dataset.e], s = ent.sets[+el.dataset.s];
    const complete = +s.reps > 0 && (TIMED.has(ent.ex) || BODYW.has(ent.ex) || HOLD.has(ent.ex) || (RUN.has(ent.ex) ? +s.km > 0 : s.kg !== undefined));
    const row = el.closest(".set"), sc = $("#setcount"); if (sc) sc.textContent = daySets(curLog()); if (!complete || !row) return;
    const best = bestBefore(ent.ex, k), pr = best && setScore(ent.ex, s) > best.score + 1e-9;
    if (pr && !row.classList.contains("pr")){ row.classList.add("ok", "pr"); row.querySelector(".idx").textContent = "PR"; SFX.done(); buzz([40, 40, 80]);
      toast(`New PR on ${ent.ex}: ${fmtLong(ent.ex, s)}. Previous best ${fmtLong(ent.ex, best.set)}.`); if (!UI.editKey) startTimer(S.settings.rest); return; }
    if (!row.classList.contains("ok")){ row.classList.add("ok"); row.querySelector(".idx").textContent = "✓"; SFX.set(); buzz(30); if (!UI.editKey) startTimer(S.settings.rest); }
  }
});
function readImage(file, size, ratio, cb){
  const r = new FileReader();
  r.onload = () => { const img = new Image(); img.onload = () => { const c = document.createElement("canvas"); const w = size, h = Math.round(size * ratio); c.width = w; c.height = h;
    const sr = Math.min(img.width / w, img.height / h), sw = w * sr, sh = h * sr; c.getContext("2d").drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, w, h); cb(c.toDataURL("image/jpeg", .78)); }; img.src = r.result; };
  r.readAsDataURL(file);
}
$("#photo").addEventListener("change", e => { const f = e.target.files[0]; if (!f) return; readImage(f, 240, 1, url => { if (UI.onb){ UI.onb.photo = url; renderOnboarding(); } else { S.profile.photo = url; save(); render(); } }); e.target.value = ""; });
$("#progress").addEventListener("change", e => { const f = e.target.files[0]; if (!f) return; readImage(f, 480, 4 / 3, url => { const t = TODAY(); S.photos = S.photos.filter(p => p.date !== t); S.photos.push({date:t, img:url, kg:currentWeight()}); S.photos.sort((a, b) => a.date < b.date ? -1 : 1); if (save()) toast("Progress photo saved"); render(); }); e.target.value = ""; });
$("#restore").addEventListener("change", e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => restoreFrom(String(r.result)); r.readAsText(f); e.target.value = ""; });
document.addEventListener("visibilitychange", () => { if (!document.hidden && S && !UI.onb && !document.activeElement.matches("input,textarea,select")) render(); });

