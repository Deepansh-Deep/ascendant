"use strict";
/* =====================================================================
   ASCENDANT 2.0 UI layer: hunter (3D), shop, achievements, challenges,
   guild scoring, analytics, screens, events. Engine lives in core.js.
   ===================================================================== */

/* ---------------- look + catalogue ---------------- */
const BASE_LOOK = {gender:"male", skin:3, face:"oval", jaw:"", nose:"", build:"", eyes:"brown", brows:"normal", hair:"short", hairColor:"black",
  beard:"none", top:"tee", topColor:"graphite", bottom:"shorts", bottomColor:"onyx", shoes:"trainer", shoesColor:"white", acc:[], accColor:"oxblood", aura:"none", pose:"relaxed"};
function lookFromOldChar(c){
  c = c || {}; const f = c.body === "f";
  const hairMap = {buzz:"buzz", short:"short", fade:"fade", spiky:"crop", quiff:"quiff", long:f?"long":"crop", bun:"bun", pony:"ponytail", bob:"bob", braid:"ponytail", pixie:"crop"};
  return Object.assign({}, BASE_LOOK, {gender: f ? "female" : "male", skin: Math.min(7, Math.round((c.skin ?? 1) * 1.4)), hair: hairMap[c.hair] || (f ? "ponytail" : "short"),
    beard: f ? "none" : (["stubble","goatee","full"].includes(c.beard) ? c.beard : "none"), top: f ? "tank" : (c.outfit === "bare" ? "none" : c.outfit === "tank" ? "tank" : "tee")});
}
const RARITY = {common:{n:"Common", c:"var(--r-common)"}, rare:{n:"Rare", c:"var(--r-rare)"}, epic:{n:"Epic", c:"var(--r-epic)"}, legendary:{n:"Legendary", c:"var(--r-legend)"}};
const COST = {common:0, rare:1, epic:3};
const C_ = (cat, slot, key, name, rarity, extra) => Object.assign({id:`${slot}:${key}`, cat, slot, key, name, rarity, cost: COST[rarity] ?? 0}, extra||{});
const CATALOG = [
  C_("outfit","top","none","Bare torso","common",{g:"male"}), C_("outfit","top","tank","Training tank","common"), C_("outfit","top","tee","Gym tee","common"),
  C_("outfit","top","sportsbra","Sports top","common",{g:"female"}), C_("outfit","top","long","Compression long-sleeve","rare"), C_("outfit","top","hoodie","Heavyweight hoodie","epic"),
  C_("outfit","bottom","shorts","Training shorts","common"), C_("outfit","bottom","tights","Compression tights","rare"), C_("outfit","bottom","joggers","Tapered joggers","rare"),
  C_("outfit","shoes","none","Barefoot","common"), C_("outfit","shoes","trainer","Trainers","common"), C_("outfit","shoes","high","High-top lifters","rare"),
  C_("hair","hair","none","Shaved","common"), C_("hair","hair","buzz","Buzz cut","common"), C_("hair","hair","short","Short","common"),
  C_("hair","hair","fade","Fade","rare"), C_("hair","hair","quiff","Quiff","rare"), C_("hair","hair","crop","Textured crop","rare"),
  C_("hair","hair","ponytail","Ponytail","common"), C_("hair","hair","bob","Bob","common"), C_("hair","hair","bun","Top bun","rare"), C_("hair","hair","long","Long","rare"),
  C_("facial","beard","none","Clean shaven","common",{g:"male"}), C_("facial","beard","stubble","Stubble","common",{g:"male"}), C_("facial","beard","moustache","Moustache","rare",{g:"male"}),
  C_("facial","beard","goatee","Goatee","rare",{g:"male"}), C_("facial","beard","full","Full beard","epic",{g:"male"}),
  C_("gear","acc","wraps","Wrist wraps","rare"), C_("gear","acc","headband","Headband","rare"), C_("gear","acc","gloves","Lifting gloves","epic"), C_("gear","acc","belt","Lifting belt","epic"),
  C_("effects","aura","none","No aura","common"), C_("effects","aura","ember","Ember aura","rare",{hex:"#D9822B"}), C_("effects","aura","frost","Frost aura","rare",{hex:"#7FB2E5"}),
  C_("effects","aura","verdant","Verdant aura","rare",{hex:"#55B07A"}), C_("effects","aura","royal","Royal aura","epic",{hex:"#9C7BE0"}),
  C_("effects","aura","warlord","Warlord flame","legendary",{hex:"#D24A3F", earn:37}), C_("effects","aura","ascendant","Ascendant radiance","legendary",{hex:"#E8C46A", earn:60}),
  C_("poses","pose","relaxed","Relaxed","common"), C_("poses","pose","flex","Front flex","legendary",{earn:13}), C_("poses","pose","victory","Victory","legendary",{earn:29}),
  C_("themes","theme","gold","Gold","common"), C_("themes","theme","crimson","Crimson","rare"), C_("themes","theme","jade","Jade","rare"), C_("themes","theme","steel","Steel","rare"), C_("themes","theme","chalk","Chalk (light)","rare"),
  ...["graphite","onyx","bone","white"].map(k => C_("colors","color",k, k[0].toUpperCase()+k.slice(1),"common")),
  ...["steel","navy","olive","sand"].map(k => C_("colors","color",k, k[0].toUpperCase()+k.slice(1),"rare")),
  C_("colors","color","oxblood","Oxblood","epic"), C_("colors","color","gold","Ascendant gold","legendary",{earn:45}),
  ...["black","espresso","brown"].map(k => C_("haircolor","hairColor",k, k[0].toUpperCase()+k.slice(1),"common")),
  ...["chestnut","auburn","blonde","ash"].map(k => C_("haircolor","hairColor",k, k[0].toUpperCase()+k.slice(1),"rare")),
  ...["silver","crimson","azure"].map(k => C_("haircolor","hairColor",k, k[0].toUpperCase()+k.slice(1),"epic")),
];
const CAT = Object.fromEntries(CATALOG.map(i => [i.id, i]));
const PACKS = [{id:"pack:nightops", name:"Night Ops Pack", desc:"Heavyweight hoodie, tapered joggers, high-tops and onyx colourway", cost:29, items:["top:hoodie","bottom:joggers","shoes:high","color:onyx"]}];
const REDESIGN_COST = 29, PASS_PRICE = "₹149";
const CRYSTAL_PACKS = [[10,"₹10",10],[49,"₹49",55],[99,"₹99",120]];
function owns(id, level){ const it = CAT[id]; if (!it) return false; if (it.earn) return level >= it.earn; if (!it.cost) return true; return !!(hasPass() || S.owned.includes(id)); }

/* ---------------- evolution tiers ---------------- */
const EVOLUTION = [[1,"Recruit","Untrained frame. Everything starts here."],[6,"Disciplined","Posture improves. Shoulders start to open."],
  [15,"Warrior","Visible upper-body development."],[29,"Elite","Advanced, defined physique."],[45,"Legend","Highly developed athletic build."],[60,"Ascendant","The final form."]];
const evoOf = L => { let e = EVOLUTION[0]; for (const x of EVOLUTION) if (L >= x[0]) e = x; return e; };
const nextEvo = L => EVOLUTION.find(x => x[0] > L);

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
  ["ascension","Ascension","Evolve into the Warrior form","rare", C => C.level >= 15],
  ["hunter_rank","Hunter Rank","Reach Level 13","rare", C => C.level >= 13],
  ["ten_tonnes","Ten Tonnes","Move 10,000 kg in total","rare", C => C.volumeAll >= 10000],
  ["ritual","Ritual","Log 12 weigh-ins","rare", C => S.weights.length >= 12],
  ["unbreakable","Unbreakable","Hold 85%+ consistency over 4 weeks","epic", C => C.daysSince >= 28 && C.consistency >= 85],
  ["thirty_days","Thirty","Reach a 30-day training streak","epic", C => C.bestStreak >= 30],
  ["bodyweight_master","Bodyweight Master","Complete any skill tree","epic", C => Object.values(C.skills.trees).some(t => t.count >= 5)],
  ["elite_form","Elite Form","Evolve into the Elite form","epic", C => C.level >= 29],
  ["hundred_tonnes","Hundred Tonnes","Move 100,000 kg in total","epic", C => C.volumeAll >= 100000],
  ["legend_form","Legend Form","Evolve into the Legend form","legendary", C => C.level >= 45],
  ["ascendant","Ascendant","Reach Level 60","legendary", C => C.level >= 60],
  ["guild_warrior","Guild Warrior","Finish a guild season in the top 3","legendary", C => !!(S.guildBest && S.guildBest <= 3)],
].map(([id,name,desc,rarity,test]) => ({id,name,desc,rarity,test}));
const ACH_CRYSTALS = {common:1, rare:2, epic:5, legendary:10};

/* ---------------- compute wrapper: challenges, achievements, crystals ---------------- */
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
  C.evo = evoOf(C.level);
  C.ach = ACH.filter(a => { try { return a.test(C); } catch(e){ return false; } }).map(a => a.id);
  C.crystals = crystalsOf(C);
  C.aura = S.look.aura !== "none" ? Math.min(1, C.streak / 21) : 0;
  return C;
};
const weekStatsBase = weekStats;
weekStats = function(C, mon){ const o = weekStatsBase(C, mon); o.xp += (C.weekChal && C.weekChal[keyOf(mon)]) || 0; return o; };
// v1.1 -> v2 cosmetics: map what has a 3D equivalent, refund what does not (1 crystal each)
const OLD_MAP = {"outfit:hoodie":"top:hoodie","outfit:compression":"top:long","hairColor:red":"hairColor:crimson","hairColor:blue":"hairColor:azure","hairColor:blonde":"hairColor:blonde",
  "hairColor:silver":"hairColor:silver","aura:crimson":"aura:ember","aura:emerald":"aura:verdant","aura:gold":"aura:frost","aura:violet":"aura:royal","beard:goatee":"beard:goatee","beard:full":"beard:full",
  "theme:crimson":"theme:crimson","theme:jade":"theme:jade","theme:chalk":"theme:chalk","hair:fade":"hair:fade","hair:quiff":"hair:quiff","hair:spiky":"hair:crop","hair:bun":"hair:bun","hair:long":"hair:long"};
const migrateBase = migrate;
migrate = function(s){
  s = migrateBase(s); if (!s || s.ownedV2) return s;
  const out = new Set(); let refund = 0;
  for (const id of s.owned || []){
    if (CAT[id]) out.add(id);
    else if (OLD_MAP[id]) out.add(OLD_MAP[id]);
    else if (id === "outfit:shadow"){ PACKS[0].items.forEach(i => out.add(i)); out.add("aura:royal"); }
    else if (!/^(theme:shadow|aura:violet)$/.test(id)) refund++;
  }
  s.owned = [...out]; s.wallet.spent = Math.max(0, s.wallet.spent - refund); s.ownedV2 = true;
  s.hunterName = s.hunterName || (s.profile && s.profile.name) || "Hunter";
  return s;
};
function crystalsOf(C){
  const ach = (C.ach || []).reduce((a, id) => a + ACH_CRYSTALS[ACH.find(x => x.id === id).rarity], 0);
  return Math.max(0, 5 + RANKS.indexOf(C.rank) * 5 + Object.keys(C.fullWeekKeys || C.weekBonus).length * 2 + C.skills.unlocked.length * 3 + ach + boughtCrystals() - S.wallet.spent);
}
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
  timer: svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>'), rotate: svg('<path d="M21 12a9 9 0 11-3-6.7L21 8M21 3v5h-5"/>'), crystal: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l8 7-8 13-8-13z" fill="currentColor" opacity=".9"/><path d="M4 9h16M12 2l-3 7 3 13 3-13z" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1"/></svg>'
});
const CRY = `<span class="cry">${ICON.crystal}</span>`;
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
  el.innerHTML = `<span class="b-ic">${ICON.trophy}</span><div><div class="b-k">${RARITY[a.rarity].n} badge unlocked</div><div class="b-t">${esc(a.name)}</div></div><span class="b-c">+${ACH_CRYSTALS[a.rarity]} ${CRY}</span>`;
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

/* ---------------- 3D hunter bridge ---------------- */
function hunterStage(cls, opts){ return `<div class="stage ${cls}" data-stage='${JSON.stringify(opts || {})}'><div class="stage-load"><span class="spin"></span><span>Loading your hunter</span></div></div>`; }
