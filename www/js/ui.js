"use strict";
/* =====================================================================
   ASCENDANT UI layer: hero, aura, achievements, challenges,
   guild scoring, analytics, screens, events. Engine lives in core.js.
   ===================================================================== */

const RARITY = {common:{n:"Common", c:"var(--r-common)"}, rare:{n:"Rare", c:"var(--r-rare)"}, epic:{n:"Epic", c:"var(--r-epic)"}, legendary:{n:"Legendary", c:"var(--r-legend)"}};
/* the two playable characters; art lives in assets/hero/<key>.png */
const HEROES = [["male", "Hunter", "He"], ["female", "Huntress", "She"]];

/* ---------------- aura: earned, never bought ----------------
   Power grows with level, rank, streak and bests beaten. Colour and style follow the rank. */
const AURA_PARTS = [["Level", C => Math.min(C.level, 60) / 60, .42], ["Rank", C => RANKS.indexOf(C.rank) / (RANKS.length - 1), .14],
  ["Streak", C => Math.min(C.streak, 30) / 30, .18], ["Bests beaten", C => Math.min(C.beatsAll, 80) / 80, .16]];
const AURA_BASE = .1;
const AURA_NAME = {E: "Faint spirit", D: "Verdant flame", C: "Azure flame", B: "Violet shadow", A: "Golden flame", S: "Crimson shadow", SS: "White-gold flame", SSS: "Void shadow", ASC: "Ascendant radiance"};
function auraPower(C){ return Math.min(1, AURA_BASE + AURA_PARTS.reduce((a, [, f, w]) => a + f(C) * w, 0)); }

/* ---------------- challenges (all verifiable from logs) ---------------- */
function dailyChallenges(C, k){
  const x = C.days[k] || {}, log = S.logs[k], ms = musclesOn(k);
  if (!ms.length && !(log && log.type === "workout"))
    return [{id:"checkin", t:"Recovery check-in", d:"Tell the System how your body feels.", done: !!S.checkins[k], xp: XP.daily}];
  if (!ms.length) return [{id:"volume", t:"Log 12 working sets", d:`${Math.min(12, x.sets||0)} / 12 sets`, done: (x.sets||0) >= 12, xp: XP.daily, prog: Math.min(1,(x.sets||0)/12)},
                          {id:"beat", t:"Beat a previous best", d:"Heavier, or more reps at the same weight.", done: (x.beats||[]).length > 0, xp: XP.daily}];
  const muscleSets = {}; if (log && log.type === "workout") for (const e of log.entries){ const m = MUSCLE_OF[e.ex]; muscleSets[m] = (muscleSets[m]||0) + validSets(e.sets).length; }
  return [{id:"plan", t:`Complete ${focusText(ms)}`, d:"3+ sets for every planned muscle.", done: ms.every(m => (muscleSets[m]||0) >= 3), xp: XP.daily},
          {id:"volume", t:"Log 12 working sets", d:`${Math.min(12, x.sets||0)} / 12 sets`, done: (x.sets||0) >= 12, xp: XP.daily, prog: Math.min(1,(x.sets||0)/12)},
          {id:"beat", t:"Beat a previous best", d:"Heavier, or more reps at the same weight.", done: (x.beats||[]).length > 0, xp: XP.daily}];
}
function weeklyChallenges(C, monKey){
  const mon = fromKey(monKey), w = weekStats(C, mon), weighed = S.weights.some(x => keyOf(mondayOf(fromKey(x.date))) === monKey);
  return [{id:"full", t:"Train every planned day", d: w.planned ? `${w.plannedDone} / ${w.planned} planned days so far` : "No planned days yet this week", done: !!C.fullWeekKeys[monKey], xp: XP.week, prog: w.planned ? w.plannedDone / w.planned : 0, builtin:true},
          {id:"beats", t:"Beat 3 previous bests", d:`${Math.min(3,w.beats)} / 3`, done: w.beats >= 3, xp: 50, prog: Math.min(1, w.beats/3)},
          {id:"weigh", t:"Weigh in once", d: weighed ? "Done" : "Not yet this week", done: weighed, xp: 20}];
}

/* ---------------- achievements ---------------- */
const ACH = [
  ["first_blood","First Blood","Complete your first workout","common", C => C.workouts >= 1],
  ["limit_breaker","Limit Breaker","Beat a previous best for the first time","common", C => C.beatsAll >= 1],
  ["awakened_skill","Awakened Skill","Unlock your first skill","common", C => C.skills.unlocked.length >= 1],
  ["iron_week","Iron Week","Train every planned day of a week","rare", C => Object.keys(C.fullWeekKeys).length >= 1],
  ["iron_will","Iron Will","Beat 25 previous bests","rare", C => C.beatsAll >= 25],
  ["ascension","Ascension","Reach Level 15","rare", C => C.level >= 15],
  ["hunter_rank","Hunter Rank","Reach Level 13","rare", C => C.level >= 13],
  ["ten_tonnes","Ten Tonnes","Move 10,000 kg in total","rare", C => C.volumeAll >= 10000],
  ["ritual","Ritual","Log 12 weigh-ins","rare", C => S.weights.length >= 12],
  ["unbreakable","Unbreakable","Hold 85%+ consistency over 4 weeks","epic", C => C.daysSince >= 28 && C.consistency >= 85],
  ["thirty_days","Thirty","Reach a 30-day training streak","epic", C => C.bestStreak >= 30],
  ["bodyweight_master","Bodyweight Master","Complete any skill tree","epic", C => Object.values(C.skills.trees).some(t => t.count >= 5)],
  ["elite_form","Elite","Reach Level 29","epic", C => C.level >= 29],
  ["hundred_tonnes","Hundred Tonnes","Move 100,000 kg in total","epic", C => C.volumeAll >= 100000],
  ["legend_form","Legend","Reach Level 45","legendary", C => C.level >= 45],
  ["ascendant","Ascendant","Reach Level 60","legendary", C => C.level >= 60],
  ["guild_warrior","Guild Warrior","Finish a guild season in the top 3","legendary", C => !!(S.guildBest && S.guildBest <= 3)],
].map(([id,name,desc,rarity,test]) => ({id,name,desc,rarity,test}));

/* ---------------- compute wrapper: challenges, achievements, aura ---------------- */
const computeBase = compute;
compute = function(){
  const C = computeBase();
  C.fullWeekKeys = Object.assign({}, C.weekBonus);
  let extra = 0; const t = TODAY(); const weeks = new Set();
  for (const k in C.days){ if (k > t) continue; weeks.add(keyOf(mondayOf(fromKey(k))));
    const add = dailyChallenges(C, k).filter(c => c.done).length * XP.daily; extra += add; C.days[k].xp += add; }
  C.weekChal = {};
  for (const wk of weeks) for (const ch of weeklyChallenges(C, wk)) if (ch.done && !ch.builtin){ extra += ch.xp; C.weekChal[wk] = (C.weekChal[wk] || 0) + ch.xp; }
  C.xp += extra; C.challengeXP = extra;
  C.level = levelOf(C.xp); C.rank = rankOf(C.level); C.into = C.xp - xpAt(C.level); C.need = 200 + 50 * C.level;
  C.volumeAll = Object.values(C.days).reduce((a, d) => a + d.volume, 0);
  C.daysSince = Math.round((todayD() - fromKey(S.profile.startDate)) / 864e5);
  C.ach = ACH.filter(a => { try { return a.test(C); } catch(e){ return false; } }).map(a => a.id);
  C.aura = auraPower(C);
  return C;
};
const weekStatsBase = weekStats;
weekStats = function(C, mon){ const o = weekStatsBase(C, mon); o.xp += (C.weekChal && C.weekChal[keyOf(mon)]) || 0; return o; };
const migrateBase = migrate;
migrate = function(s){ s = migrateBase(s); if (s) s.hunterName = s.hunterName || (s.profile && s.profile.name) || "Hunter"; return s; };
function checkAchievements(C){
  const fresh = C.ach.filter(id => !S.achieved[id]);
  if (!fresh.length) return;
  fresh.forEach(id => S.achieved[id] = TODAY()); save();
  fresh.slice(0, 3).forEach((id, i) => setTimeout(() => banner(ACH.find(a => a.id === id)), 400 + i * 2600));
}

/* ---------------- guild scores: one implementation shared with the server (js/scoring.js) ---------------- */
const CFG = window.ASCENDANT_CONFIG || {};
function guildScores(C, period){ return AscendantScoring.guildScores(S, period, TODAY()); }

/* ---------------- small helpers ---------------- */
Object.assign(ICON, {
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'), guild: svg('<path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/><path d="M9 12l2 2 4-4"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>'),
  trophy: svg('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0z"/><path d="M17 5h3a3 3 0 01-3 4M7 5H4a3 3 0 003 4"/>'), flame: svg('<path d="M12 22c4 0 7-3 7-7 0-5-5-7-5-12-3 2-5 5-5 8-1-1-2-2-2-4-1 2-2 4-2 7 0 4 3 8 7 8z"/>'),
  up: svg('<path d="M6 15l6-6 6 6"/>'), down: svg('<path d="M6 9l6 6 6-6"/>'), x: svg('<path d="M6 6l12 12M18 6L6 18"/>'), plus: svg('<path d="M12 5v14M5 12h14"/>'),
  timer: svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>'), rotate: svg('<path d="M21 12a9 9 0 11-3-6.7L21 8M21 3v5h-5"/>')
});
function download(url, name){ try { const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); } catch(e){ toast("Download blocked. Long-press to save."); } }
async function nativeShare(name, base64, text){
  try { const P = window.Capacitor && window.Capacitor.Plugins; if (!P || !P.Filesystem || !P.Share) return false;
    const r = await P.Filesystem.writeFile({path:name, data:base64, directory:"CACHE"}); await P.Share.share({title:"Ascendant", text, files:[r.uri], dialogTitle:"Share"}); return true; } catch(e){ return false; }
}
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
const kgfmt = v => v >= 10000 ? (v / 1000).toFixed(1) + "t" : nf(v);
function rarityTag(r){ return `<span class="rar" style="--rc:${RARITY[r].c}">${RARITY[r].n}</span>`; }
function hexBadge(text, size = 56, cls = ""){
  return `<span class="hexb ${cls}" style="--s:${size}px"><svg viewBox="0 0 100 110" aria-hidden="true"><path d="M50 3 L95 29 L95 81 L50 107 L5 81 L5 29 Z"/></svg><b>${esc(text)}</b></span>`;
}
function banner(a){
  const el = document.createElement("div"); el.className = "banner"; el.style.setProperty("--rc", RARITY[a.rarity].c);
  el.innerHTML = `<span class="b-ic">${ICON.trophy}</span><div><div class="b-k">${RARITY[a.rarity].n} badge unlocked</div><div class="b-t">${esc(a.name)}</div></div>`;
  document.body.appendChild(el); SFX.done(); setTimeout(() => el.classList.add("out"), 2200); setTimeout(() => el.remove(), 2700);
}

/* ---------------- charts (SVG) ---------------- */
function barChart(vals, labels, opt = {}){
  const W = 330, H = opt.h || 120, P = 22, mx = Math.max(1, ...vals), bw = (W - P) / vals.length;
  const ticks = [0, mx / 2, mx];
  return `<svg class="chart" viewBox="0 0 ${W} ${H + 18}" role="img" aria-label="${esc(opt.label || "chart")}">
    ${ticks.map(v => { const y = H - v / mx * (H - 8); return `<line x1="${P}" x2="${W}" y1="${y}" y2="${y}" class="grid"/><text x="0" y="${y + 3}" class="ax">${opt.fmt ? opt.fmt(v) : Math.round(v)}</text>`; }).join("")}
    ${vals.map((v, i) => { const h = Math.max(v ? 2 : 0, v / mx * (H - 8)); return `<rect x="${P + i * bw + bw * 0.18}" y="${H - h}" width="${bw * 0.64}" height="${h}" rx="2" class="${i === vals.length - 1 && opt.hl !== false ? "bar hl" : "bar"}"/>
      <text x="${P + i * bw + bw / 2}" y="${H + 14}" class="ax" text-anchor="middle">${esc(labels[i] || "")}</text>`; }).join("")}</svg>`;
}
function lineChart(pts, opt = {}){
  if (pts.length < 2) return `<p class="empty-s">${opt.empty || "Not enough data yet. Keep logging."}</p>`;
  const W = 330, H = opt.h || 130, P = 28, ys = pts.map(p => p.y), mn = Math.min(...ys), mx = Math.max(...ys), pad = (mx - mn) * 0.15 || 1;
  const lo = opt.min ?? mn - pad, hi = opt.max ?? mx + pad, X = i => P + i / (pts.length - 1) * (W - P - 6), Y = v => H - (v - lo) / (hi - lo) * (H - 10) - 4;
  const d = pts.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(p.y).toFixed(1)}`).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H + 18}" role="img" aria-label="${esc(opt.label || "trend")}">
    ${[lo, (lo + hi) / 2, hi].map(v => `<line x1="${P}" x2="${W}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/><text x="0" y="${Y(v) + 3}" class="ax">${opt.fmt ? opt.fmt(v) : Math.round(v)}</text>`).join("")}
    <path d="${d} L${X(pts.length - 1)} ${H} L${P} ${H} Z" class="area"/><path d="${d}" class="line"/>
    ${pts.map((p, i) => `<circle cx="${X(i)}" cy="${Y(p.y)}" r="${i === pts.length - 1 ? 3.6 : 2.2}" class="${i === pts.length - 1 ? "dot hl" : "dot"}"/>`).join("")}
    <text x="${P}" y="${H + 14}" class="ax">${esc(pts[0].l || "")}</text><text x="${W}" y="${H + 14}" class="ax" text-anchor="end">${esc(pts[pts.length - 1].l || "")}</text></svg>`;
}

/* ---------------- hero stage ---------------- */
function hunterStage(cls, opts){ return `<div class="stage ${cls}" data-stage='${JSON.stringify(opts || {})}'><div class="stage-load"><span class="spin"></span></div></div>`; }

/* ---------------- typefaces (Settings > Font). Files live in www/fonts, all OFL. ---------------- */
const FONTS = [["default", "Ascendant", "Sora with Inter"], ["inter", "Inter", "Neutral, very readable"], ["manrope", "Manrope", "Soft and modern"], ["outfit", "Outfit", "Round and friendly"],
  ["grotesk", "Space Grotesk", "Technical with character"], ["rajdhani", "Rajdhani", "Squared, HUD style"], ["oxanium", "Oxanium", "Game interface"], ["exo", "Exo 2", "Sci-fi, wide"],
  ["orbitron", "Orbitron", "Futuristic headings"], ["chakra", "Chakra Petch", "Angular, tactical"], ["cinzel", "Cinzel", "Carved, regal headings"], ["iron", "Barlow", "Condensed, athletic"], ["system", "JetBrains Mono", "Terminal headings"]];
const fontKey = () => { const f = S && S.settings && S.settings.font; return FONTS.some(x => x[0] === f) ? f : "default"; };
