"use strict";
/* ===== CONSTANTS ===== */
const VERSION = "2.3.0";
const MUSCLES = ["Chest","Back","Shoulders","Biceps","Triceps","Legs","Abs","Cardio"];
const OPTIONS = {
  Chest:["Bench Press","Incline Dumbbell Press","Chest Press Machine","Pec Deck Fly","Cable Crossover","Push-ups"],
  Back:["Lat Pulldown","Seated Cable Row","Barbell Row","Deadlift","Pull-ups","One-arm Dumbbell Row"],
  Shoulders:["Shoulder Press","Lateral Raise","Front Raise","Rear Delt Fly","Face Pull","Shrugs"],
  Biceps:["Barbell Curl","Dumbbell Curl","Hammer Curl","Preacher Curl","Cable Curl"],
  Triceps:["Tricep Pushdown","Rope Pushdown","Overhead Extension","Skull Crusher","Bench Dips"],
  Legs:["Squat","Leg Press","Leg Extension","Leg Curl","Romanian Deadlift","Calf Raise","Lunges"],
  Abs:["Crunches","Hanging Leg Raise","Plank","Cable Crunch","Russian Twist","Ab Wheel"],
  Cardio:["Treadmill","Cycling","Rowing","Stair Climber","Skipping"]
};
const TIMED = new Set(["Plank","Treadmill","Cycling","Rowing","Stair Climber","Skipping"]);
const BODYW = new Set(["Push-ups","Pull-ups","Bench Dips","Hanging Leg Raise","Crunches","Russian Twist","Ab Wheel"]);
const MUSCLE_OF = {}; for (const m in OPTIONS) OPTIONS[m].forEach(e => MUSCLE_OF[e] = m);
const RANKS = [
  [1,"E","Awakened","The System has chosen you."],[6,"D","Initiate","The habit is forming."],
  [13,"C","Hunter","You show up. Others notice."],[21,"B","Vanguard","Discipline over motivation."],
  [29,"A","Elite","Top of every gym you walk into."],[37,"S","Warlord","Your past self would not recognise you."],
  [45,"SS","Titan","Strength is now who you are."],[53,"SSS","Sovereign","Few ever reach this floor."],
  [60,"ASC","Ascendant","Ascended. The System bows."]
];
const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const XP = {workout:50, set:2, setCap:40, beat:25, week:100, weigh:10, checkin:5, skill:40, daily:15, weekly:60};
const MOODS = ["Fresh","Okay","Sore","Wrecked"];
const PRICE = "₹19";
const KEY = "ascendant_v1";
const THEMES = [["gold","Gold","#D4A84F"],["crimson","Crimson","#D2575D"],["jade","Jade","#4FB38E"],["steel","Steel","#8FA9D6"],["chalk","Chalk","#1F2937"]];

/* ===== DATES ===== */
const pad = n => String(n).padStart(2,"0");
const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const fromKey = k => { const [y,m,d] = k.split("-").map(Number); return new Date(y,m-1,d); };
const addDays = (d,n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
const wd = d => (d.getDay()+6)%7;
const mondayOf = d => addDays(new Date(d.getFullYear(),d.getMonth(),d.getDate()), -wd(d));
const todayD = () => { const n = new Date(); return new Date(n.getFullYear(),n.getMonth(),n.getDate()); };
const TODAY = () => keyOf(todayD());
const fmt = (d,o) => d.toLocaleDateString("en-IN",o);
const short = k => fmt(fromKey(k),{day:"numeric",month:"short"});

/* ===== STATE ===== */
let S = null;
const UI = {tab:"home", weekOff:0, sel:null, period:"week", onb:null, pending:null, trainTab:"today", studioTab:"body", statEx:null};
function migrate(s){
  if (!s) return s;
  s.v = 3; s.theme = ({iron:"gold", shadow:"gold"})[s.theme] || s.theme || "gold"; s.pro = !!s.pro;
  s.checkins = s.checkins || {}; s.photos = s.photos || []; s.weights = s.weights || []; s.logs = s.logs || {};
  s.settings = Object.assign({rest:90, sound:true, remind:{on:false, time:"18:30"}}, s.settings || {});
  if (!s.settings.remind) s.settings.remind = {on:false, time:"18:30"};
  if (!("seenReport" in s)) s.seenReport = null;
  if (!s.look) s.look = lookFromOldChar(s.char);
  s.look = Object.assign({}, BASE_LOOK, s.look); s.owned = s.owned || []; s.wallet = Object.assign({bought:0, spent:0}, s.wallet||{});
  s.achieved = s.achieved || {}; s.guild = s.guild || null;
  s.style = s.style || "gym"; s.path = s.path || "solo"; s.pass = !!s.pass;
  if (s.pro && s.theme && s.theme!=="iron" && !s.owned.includes("theme:"+s.theme)) s.owned.push("theme:"+s.theme);
  return s;
}
let STORE_KEY = KEY;      // per account when signed in (see cloud.js)
let afterSave = null;     // set by cloud.js to schedule a background sync
function save(){
  if (!S) return false;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); }
  catch(e){ toast("Storage is full. Remove some progress photos."); return false; }
  if (afterSave) afterSave();
  return true;
}
function load(){ try { const s = localStorage.getItem(STORE_KEY); if (s) return migrate(JSON.parse(s)); } catch(e){} return null; }

function planOn(k){ let p = S.planHistory[0].plan; for (const h of S.planHistory) if (h.from <= k) p = h.plan; return p; }
const musclesOn = k => planOn(k)[wd(fromKey(k))] || [];
const focusText = ms => ms.length ? ms.join(" + ") : "Rest day";

/* ===== ENGINE ===== */
function setScore(ex,s){ const kg=+s.kg||0, r=+s.reps||0; if (RUN.has(ex)) return +s.km||0; if (TIMED.has(ex)||HOLD.has(ex)) return r; if (BODYW.has(ex)) return r+kg; return kg*(1+r/30); }
const validSets = sets => (sets||[]).filter(s => +s.reps > 0);
function bestSet(ex,sets){ let b=null,bs=-1; for (const s of validSets(sets)){ const v=setScore(ex,s); if(v>bs){bs=v;b=s;} } return b?{set:b,score:bs}:null; }
function daySets(log){ return log && log.type==="workout" ? log.entries.reduce((a,e)=>a+validSets(e.sets).length,0) : 0; }
function dayVolume(log){ if(!log||log.type!=="workout") return 0; let v=0; for(const e of log.entries){ if(!isWeighted(e.ex)) continue; for(const s of validSets(e.sets)) v+=(+s.kg||0)*(+s.reps||0);} return v; }
const levelOf = xp => Math.min(60, Math.floor((-175+Math.sqrt(30625+100*(200+xp)))/50 + 1e-9));
const xpAt = L => 200*(L-1)+25*L*(L-1);
const rankOf = L => { let r=RANKS[0]; for (const x of RANKS) if (L>=x[0]) r=x; return r; };
const monthOf = k => k.slice(0,7);

function compute(){
  const t = TODAY(), start = S.profile.startDate, end = todayD();
  const days = {}, lastBest = {}, shieldUsed = {}, weekMap = {};
  let xp = 0, streak = 0, best = 0, workouts = 0, beatsAll = 0;
  for (let d = fromKey(start); d <= end; d = addDays(d,1)){
    const k = keyOf(d), log = S.logs[k], ms = musclesOn(k), planned = ms.length>0;
    const sets = daySets(log), did = sets>0, beats = [];
    let x = 0;
    if (did){
      workouts++; x = XP.workout + Math.min(XP.setCap, sets*XP.set);
      for (const e of log.entries){ const b = bestSet(e.ex,e.sets); if (!b) continue;
        if (lastBest[e.ex]!==undefined && b.score > lastBest[e.ex]+1e-9){ x += XP.beat; beats.push(e.ex); }
        lastBest[e.ex] = b.score; }
    }
    if (!planned && !did && S.checkins[k]) x += XP.checkin;
    let status;
    if (planned){
      if (did) status = "done";
      else if (k===t) status = log && log.type==="rest" ? "skipped" : "today";
      else if (!shieldUsed[monthOf(k)]){ shieldUsed[monthOf(k)] = k; status = "shielded"; }
      else status = log && log.type==="rest" ? "skipped" : "missed";
    } else status = did ? "bonus" : "rest";
    if (did) streak++; else if (status==="missed" || (status==="skipped" && k<t)) streak = 0;
    best = Math.max(best, streak); xp += x; beatsAll += beats.length;
    days[k] = {k, ms, planned, did, sets, status, xp:x, beats, volume:dayVolume(log)};
    const wk = keyOf(mondayOf(d)); (weekMap[wk] = weekMap[wk] || []).push(days[k]);
  }
  const weekBonus = {};
  for (const wk in weekMap){
    const mon = fromKey(wk); let pl = 0, complete = true;
    for (let i=0;i<7;i++){ const k = keyOf(addDays(mon,i)); if (k<start) continue; if (musclesOn(k).length){ pl++; if (!(days[k] && days[k].did)) complete = false; } }
    if (pl && complete){ weekBonus[wk] = XP.week; xp += XP.week; }
  }
  const seen = new Set(), weighXP = {};
  for (const w of S.weights){ const wk = keyOf(mondayOf(fromKey(w.date))); if (w.date>=start && !seen.has(wk)){ seen.add(wk); xp += XP.weigh; weighXP[w.date] = XP.weigh; } }
  let pl=0, dn=0;
  for (let i=27;i>=0;i--){ const k = keyOf(addDays(end,-i)), x = days[k]; if (!x||!x.planned) continue; if (k===t && !x.did) continue; pl++; if (x.did) dn++; }
  const skills = skillState();
  for (const u of skills.unlocked){ xp += XP.skill; if (days[u.date]) days[u.date].xp += XP.skill; }
  const L = levelOf(xp);
  const sw = S.profile.startWeight, gw = S.profile.goal, cw = currentWeight();
  const goalPct = sw===gw ? 0 : Math.max(0, Math.min(1, (sw-cw)/(sw-gw)));
  const R0 = {days, xp, level:L, rank:rankOf(L), into:xp-xpAt(L), need:200+50*L, streak, bestStreak:best,
    consistency: pl ? Math.round(dn/pl*100) : 0, weekBonus, weighXP, shieldsLeft: shieldUsed[monthOf(t)] ? 0 : 1,
    attrs:{STR:10+beatsAll+skills.unlocked.length*2, END:10+workouts, VIT:10+seen.size*2+Math.round(goalPct*20)}, workouts, beatsAll, goalPct, skills, body:bodyStages()};
  R0.crystals = crystalsOf(R0); return R0;
}
function weekStats(C, mon){
  const o = {workouts:0,sets:0,volume:0,xp:0,beats:0,planned:0,plannedDone:0,perDay:[]};
  for (let i=0;i<7;i++){ const k = keyOf(addDays(mon,i)), x = C.days[k]; o.perDay.push(x?x.sets:0); if (!x) continue;
    if (x.did) o.workouts++; if (x.planned){ o.planned++; if (x.did) o.plannedDone++; } o.sets+=x.sets; o.volume+=x.volume; o.xp+=x.xp; o.beats+=x.beats.length; }
  o.xp += C.weekBonus[keyOf(mon)]||0;
  for (const d in C.weighXP) if (keyOf(mondayOf(fromKey(d)))===keyOf(mon)) o.xp += C.weighXP[d];
  return o;
}
function gradeOf(w){ if (!w.planned) return null; const p = w.plannedDone/w.planned;
  return p>=1 && w.beats>=3 ? "S" : p>=.85 ? "A" : p>=.7 ? "B" : p>=.5 ? "C" : "D"; }
const GRADE_LINE = {S:"Flawless week. The System is impressed.",A:"Strong week. Keep the chain going.",B:"Solid, but you left days on the table.",C:"Half effort gets half results.",D:"This week beat you. Next week, you beat it."};
function lastSession(ex, beforeKey){
  const ks = Object.keys(S.logs).filter(k => k<beforeKey).sort().reverse();
  for (const k of ks){ const l = S.logs[k]; if (l.type!=="workout") continue; const e = l.entries.find(e=>e.ex===ex); if (e && validSets(e.sets).length) return {k, sets:validSets(e.sets)}; }
  return null;
}
const currentWeight = () => S.weights.length ? S.weights[S.weights.length-1].kg : S.profile.startWeight;
function weightOn(k){ let w = S.profile.startWeight; for (const x of S.weights) if (x.date<=k) w = x.kg; return w; }

/* ===== HOME / CALISTHENICS EXERCISES ===== */
const EXTRA = {
  Chest:["Knee Push-ups","Diamond Push-ups","Decline Push-ups","Archer Push-ups","One-arm Push-up"],
  Back:["Chin-ups","Inverted Rows","Negative Pull-ups","Muscle-up","Dead Hang"],
  Shoulders:["Pike Push-ups","Handstand Hold"], Biceps:["Band Curls"], Triceps:["Dips"],
  Legs:["Bodyweight Squats","Jump Squats","Bulgarian Split Squat","Assisted Pistol Squat","Pistol Squats","Wall Sit"],
  Abs:["Leg Raises","Hanging Knee Raise","Hollow Hold","L-Sit","Mountain Climbers"], Cardio:["Running","Burpees"]
};
const HOMEONLY = new Set(Object.values(EXTRA).flat());
for (const m in EXTRA){ OPTIONS[m].push(...EXTRA[m]); EXTRA[m].forEach(e => MUSCLE_OF[e] = m); }
const HOLD = new Set(["Dead Hang","Handstand Hold","Wall Sit","Hollow Hold","L-Sit"]);
const RUN = new Set(["Running"]);
["Knee Push-ups","Diamond Push-ups","Decline Push-ups","Archer Push-ups","One-arm Push-up","Chin-ups","Inverted Rows","Negative Pull-ups","Muscle-up",
 "Pike Push-ups","Band Curls","Dips","Bodyweight Squats","Jump Squats","Bulgarian Split Squat","Assisted Pistol Squat","Pistol Squats","Leg Raises",
 "Hanging Knee Raise","Mountain Climbers","Burpees"].forEach(e => BODYW.add(e));
const HOME = new Set([...BODYW, ...HOLD, ...RUN, "Plank", "Skipping", "Lunges"]);
const isWeighted = ex => !(TIMED.has(ex) || BODYW.has(ex) || HOLD.has(ex) || RUN.has(ex));
function optsFor(m, style){ style = style || (S && S.style) || "both";
  if (style==="gym") return OPTIONS[m].filter(e => !HOMEONLY.has(e));
  if (style==="home") return OPTIONS[m].filter(e => HOME.has(e));
  return OPTIONS[m]; }
function fmtLong(ex,s){ if (RUN.has(ex)) return `${s.km||0} km in ${s.reps} min`; if (HOLD.has(ex)) return `${s.reps} s`; if (TIMED.has(ex)) return `${s.reps} min`;
  if (BODYW.has(ex)) return `${s.reps} reps${+s.kg?` +${s.kg} kg`:""}`; return `${+s.kg||0} kg × ${s.reps}`; }

/* ===== SKILL TREES ===== */
const SKILLS = [
  {id:"push", name:"Push", unit:"reps", nodes:[["Knee Push-ups",20],["Push-ups",20],["Diamond Push-ups",15],["Archer Push-ups",8],["One-arm Push-up",3]]},
  {id:"pull", name:"Pull", unit:"reps", nodes:[["Dead Hang",60],["Inverted Rows",15],["Negative Pull-ups",5],["Pull-ups",10],["Muscle-up",1]]},
  {id:"legs", name:"Legs", unit:"reps", nodes:[["Bodyweight Squats",30],["Lunges",20],["Bulgarian Split Squat",15],["Assisted Pistol Squat",8],["Pistol Squats",5]]},
  {id:"core", name:"Core", unit:"reps", nodes:[["Plank",2],["Hollow Hold",45],["Hanging Knee Raise",15],["Hanging Leg Raise",10],["L-Sit",20]]},
  {id:"run",  name:"Run",  unit:"km",   nodes:[["Running",1],["Running",3],["Running",5],["Running",10],["Running",21]]}
];
const nodeLabel = (ex,t) => RUN.has(ex) ? `Run ${t} km` : ex;
const nodeTarget = (ex,t) => RUN.has(ex) ? `${t} km in one run` : HOLD.has(ex) ? `Hold ${t} s` : TIMED.has(ex) ? `Hold ${t} min` : `${t} reps in one set`;
const metricOf = (ex,s) => RUN.has(ex) ? (+s.km||0) : (+s.reps||0);
function skillState(){
  const best = {};   // ex -> [{date, v}]
  for (const k of Object.keys(S.logs).sort()){ const l = S.logs[k]; if (l.type!=="workout" || k<S.profile.startDate) continue;
    for (const e of l.entries) for (const s of validSets(e.sets)) (best[e.ex] = best[e.ex] || []).push({date:k, v:metricOf(e.ex,s)}); }
  const unlocked = [], trees = {};
  for (const t of SKILLS){ let prev = null, count = 0, next = null;
    for (let i=0;i<t.nodes.length;i++){ const [ex,target] = t.nodes[i]; const hits = (best[ex]||[]).filter(h => h.v >= target).map(h=>h.date).sort();
      const top = Math.max(0, ...(best[ex]||[]).map(h=>h.v));
      if (!hits.length || (i>0 && prev===null)){ next = {i, ex, target, best: top}; break; }
      const d = hits[0] > (prev||"") ? hits[0] : prev; prev = d; count++; unlocked.push({tree:t.id, i, ex, target, date:d}); }
    trees[t.id] = {count, next}; }
  return {unlocked, trees};
}

/* ===== BODY GROWTH ===== */
const REGION = {Chest:"chest", Back:"back", Shoulders:"shoulders", Biceps:"arms", Triceps:"arms", Legs:"legs", Abs:"core"};
const REGIONS = [["chest","Chest"],["back","Back"],["shoulders","Shoulders"],["arms","Arms"],["legs","Legs"],["core","Core"]];
const STAGE_AT = [0, 30, 90, 200, 400];
function bodyStages(){
  const sets = {chest:0,back:0,shoulders:0,arms:0,legs:0,core:0};
  // recovery-aware: at most 20 sets per region per week count toward growth (no reward for junk volume)
  const weekly = {};
  for (const k in S.logs){ const l = S.logs[k]; if (l.type!=="workout" || k<S.profile.startDate) continue;
    const wk = keyOf(mondayOf(fromKey(k)));
    for (const e of l.entries){ const r = REGION[MUSCLE_OF[e.ex]]; if (!r) continue; const id = wk+r;
      const add = Math.min(validSets(e.sets).length, Math.max(0, 20 - (weekly[id]||0))); weekly[id] = (weekly[id]||0) + add; sets[r] += add; } }
  const stages = {}; for (const r in sets){ let st = 1; STAGE_AT.forEach((v,i)=>{ if (sets[r]>=v) st = i+1; }); stages[r] = st; }
  return {sets, stages};
}

/* ===== HELPERS ===== */
const $ = s => document.querySelector(s);
const esc = s => String(s??"").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const nf = n => Math.round(n).toLocaleString("en-IN");
const svg = p => `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const ICON = {
  home:svg('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>'), lift:svg('<path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12"/>'),
  chart:svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'), skill:svg('<path d="M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.6 7.1 18.2 8 12.7 4 8.8l5.5-.8z"/>'), plan:svg('<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 9h18M8 2v4M16 2v4"/>'),
  left:svg('<path d="M15 5l-7 7 7 7"/>'), right:svg('<path d="M9 5l7 7-7 7"/>'), bolt:svg('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'),
  moon:svg('<path d="M20 14A8 8 0 1110 4a7 7 0 0010 10z"/>'), share:svg('<path d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7M16 6l-4-4-4 4M12 2v13"/>'),
  lock:svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>'), check:svg('<path d="M5 12l5 5L20 7"/>'),
  shield:svg('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>'), camera:svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>')
};
function toast(msg, action){
  document.querySelectorAll(".toast").forEach(t=>t.remove());
  const t = document.createElement("div"); t.className = "toast"; t.innerHTML = `<span>${esc(msg)}</span>`;
  if (action){ const b = document.createElement("button"); b.textContent = action.label; b.onclick = () => { t.remove(); action.fn(); }; t.appendChild(b); }
  document.body.appendChild(t); setTimeout(()=>t.remove(), action ? 4500 : 2000);
}
function modal(html){ $("#layer").innerHTML = `<div class="scrim" data-act="close-scrim"><div class="sheet" role="dialog" aria-modal="true">${html}</div></div>`; }
function closeModal(){ $("#layer").innerHTML = ""; nextCeremony(); }
/* ===== SOUND + HAPTICS ===== */
let AC = null;
function tone(seq){
  if (!S || !S.settings.sound) return;
  try { AC = AC || new (window.AudioContext||window.webkitAudioContext)(); const now = AC.currentTime;
    seq.forEach(([f,t,d,type="triangle",v=.18]) => { const o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0, now+t); g.gain.linearRampToValueAtTime(v, now+t+.02); g.gain.exponentialRampToValueAtTime(.001, now+t+d);
      o.connect(g).connect(AC.destination); o.start(now+t); o.stop(now+t+d+.05); });
  } catch(e){}
}
const buzz = p => { try { navigator.vibrate && navigator.vibrate(p); } catch(e){} };
const SFX = { set:()=>tone([[660,0,.08,"sine",.08]]), done:()=>tone([[523,0,.15],[659,.1,.15],[784,.2,.3]]),
  level:()=>tone([[392,0,.18],[523,.12,.18],[659,.24,.18],[784,.36,.2],[1047,.5,.6,"sawtooth",.1]]),
  rest:()=>tone([[880,0,.15,"square",.08],[880,.25,.15,"square",.08],[1175,.5,.35,"square",.08]]) };

/* richer synthesis for ceremonies: pitch sweeps and filtered noise, still no audio files */
function synth(parts){
  if (!S || !S.settings.sound) return;
  try { AC = AC || new (window.AudioContext||window.webkitAudioContext)(); if (AC.state === "suspended") AC.resume(); const now = AC.currentTime;
    parts.forEach(p => { const g = AC.createGain(), t = now + (p.t || 0), d = p.d; let src;
      g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(p.v ?? .2, t + (p.a ?? .012)); g.gain.exponentialRampToValueAtTime(.0001, t + d);
      if (p.noise){ const len = Math.ceil(AC.sampleRate * d), buf = AC.createBuffer(1, len, AC.sampleRate), ch = buf.getChannelData(0); for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
        src = AC.createBufferSource(); src.buffer = buf; const f = AC.createBiquadFilter(); f.type = p.ft || "lowpass"; f.frequency.setValueAtTime(p.f0 || 800, t); if (p.f1) f.frequency.exponentialRampToValueAtTime(p.f1, t + d); src.connect(f).connect(g); }
      else { src = AC.createOscillator(); src.type = p.type || "sine"; src.frequency.setValueAtTime(p.f0, t); if (p.f1) src.frequency.exponentialRampToValueAtTime(p.f1, t + d); src.connect(g); }
      g.connect(AC.destination); src.start(t); src.stop(t + d + .05); });
  } catch(e){}
}
SFX.charge = () => synth([{f0:90, f1:620, d:.62, type:"sawtooth", v:.045, a:.5}, {noise:1, f0:260, f1:5200, d:.62, v:.07, a:.55, ft:"bandpass"}]);
SFX.impact = () => synth([{f0:150, f1:36, d:.6, v:.5}, {noise:1, f0:2600, f1:180, d:.38, v:.2}, {f0:523, d:.9, type:"triangle", v:.11, t:.03}, {f0:784, d:1.1, type:"triangle", v:.09, t:.09}, {f0:1047, d:1.4, v:.07, t:.15}]);
SFX.rankup = () => synth([{f0:130, f1:30, d:.9, v:.55}, {noise:1, f0:3200, f1:140, d:.55, v:.24}, {f0:392, d:1.2, type:"triangle", v:.11, t:.03}, {f0:587, d:1.3, type:"triangle", v:.1, t:.1}, {f0:784, d:1.5, type:"triangle", v:.09, t:.18}, {f0:1175, d:1.9, v:.08, t:.3}, {f0:1568, d:2.1, v:.05, t:.42}]);
SFX.reward = () => synth([{noise:1, f0:400, f1:6000, d:.3, v:.08, a:.2, ft:"bandpass"}, {f0:110, f1:55, d:.35, v:.3, t:.02}, {f0:659, d:.5, type:"triangle", v:.1, t:.06}, {f0:988, d:.8, type:"triangle", v:.08, t:.16}]);
SFX.tick = () => synth([{f0:1500, d:.035, type:"square", v:.022}]);

/* ===== REST TIMER ===== */
const T = {end:0, dur:0, id:null};
function startTimer(sec){ if (!sec) return; T.dur = sec; T.end = Date.now()+sec*1000; clearInterval(T.id); T.id = setInterval(drawTimer, 250); drawTimer(); }
function stopTimer(){ clearInterval(T.id); T.id = null; $("#timer").innerHTML = ""; }
function drawTimer(){
  const left = Math.max(0, Math.round((T.end-Date.now())/1000));
  if (left<=0){ stopTimer(); SFX.rest(); buzz([300,120,300]); toast("Rest over. Next set."); return; }
  $("#timer").innerHTML = `<div class="timer" role="timer" aria-live="off"><div><div class="lab">Rest</div><div class="t">${Math.floor(left/60)}:${pad(left%60)}</div></div>
    <div class="sp"><button data-act="t-adj" data-v="-15">-15</button><button data-act="t-adj" data-v="15">+15</button><button data-act="t-skip">Skip</button></div>
    <div class="prog"><i style="width:${(1-left/T.dur)*100}%"></i></div></div>`;
}

/* ===== BACKUP ===== */
async function backup(){
  const data = JSON.stringify(S), name = `ascendant-backup-${TODAY()}.json`;
  if (await nativeShare(name, btoa(unescape(encodeURIComponent(data))), "Ascendant backup. Keep this file safe.")) return toast("Save the backup to Drive or send it to yourself");
  try { download(URL.createObjectURL(new Blob([data],{type:"application/json"})), name); } catch(e){}
  modal(`<h2>Backup</h2><p class="small mute" style="margin-top:6px">If your phone did not save <b>${name}</b>, copy this backup code and keep it in your notes or send it to yourself on WhatsApp.</p>
    <textarea class="input" style="margin-top:12px" readonly id="bk">${esc(data)}</textarea>
    <button class="btn" style="margin-top:12px" data-act="copy-backup">Copy backup code</button>`);
}
function restoreFrom(text){
  let d; try { d = JSON.parse(text); } catch(e){ return toast("That backup is not valid"); }
  if (!d || !d.profile || !d.logs || !d.planHistory) return toast("That backup is not valid");
  modal(`<h2>Restore backup?</h2><p class="mute" style="margin-top:8px">This replaces everything on this phone with the backup of <b>${esc(d.profile.name)}</b> (${Object.keys(d.logs).length} days of logs).</p>
    <div class="grid2" style="margin-top:18px"><button class="btn ghost" data-act="close">Cancel</button><button class="btn" data-act="confirm-restore">Restore</button></div>`);
  UI.restore = d;
}
function restoreSheet(){
  modal(`<h2>Restore</h2><p class="small mute" style="margin-top:6px">Pick your backup file, or paste a backup code.</p>
    <button class="btn ghost" style="margin-top:12px" data-act="restore-file">Choose backup file</button>
    <textarea class="input" style="margin-top:12px" id="paste" placeholder="Paste backup code here"></textarea>
    <button class="btn" style="margin-top:12px" data-act="restore-paste">Restore from code</button>`);
}

/* ===== REMINDERS (native app) ===== */
function nativeLN(){ try { return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications; } catch(e){ return null; } }
async function scheduleReminders(){
  const LN = nativeLN(); if (!LN || !S) return;
  try {
    const pend = await LN.getPending(); if (pend.notifications.length) await LN.cancel({notifications: pend.notifications.map(n=>({id:n.id}))});
    if (!S.settings.remind.on) return;
    const perm = await LN.requestPermissions(); if (perm.display!=="granted") return;
    const [hh,mm] = S.settings.remind.time.split(":").map(Number), C = compute(), list = [];
    for (let i=0;i<7;i++){ const d = addDays(todayD(),i), k = keyOf(d), at = new Date(d.getFullYear(),d.getMonth(),d.getDate(),hh,mm);
      if (at<=new Date()) continue; if (i===0 && C.days[k] && C.days[k].did) continue;
      const ms = musclesOn(k);
      list.push({id:100+i, title: ms.length?`${focusText(ms)} today`:"Rest day check-in",
        body: ms.length?(C.streak?`Your ${C.streak}-day streak is waiting. Don't break it.`:"Log today's workout and earn XP."):"Tell the System how you feel. +5 XP.", schedule:{at}}); }
    if (list.length) await LN.schedule({notifications:list});
  } catch(e){}
}

/* ===== DEMO ===== */
function demoState(){
  const t = todayD(), start = addDays(mondayOf(t), -21);
  const plan = [["Chest","Triceps"],["Back","Biceps"],["Legs"],["Shoulders","Abs"],["Chest","Back"],["Biceps","Triceps","Abs"],[]];
  const exercises = {Chest:["Bench Press","Incline Dumbbell Press","Pec Deck Fly"],Back:["Lat Pulldown","Seated Cable Row","Pull-ups"],
    Shoulders:["Shoulder Press","Lateral Raise","Face Pull"],Biceps:["Barbell Curl","Hammer Curl"],Triceps:["Tricep Pushdown","Overhead Extension"],
    Legs:["Squat","Leg Press","Leg Curl","Calf Raise"],Abs:["Hanging Leg Raise","Plank"],Cardio:["Treadmill"]};
  const base = {"Bench Press":40,"Incline Dumbbell Press":14,"Pec Deck Fly":35,"Lat Pulldown":40,"Seated Cable Row":40,"Shoulder Press":14,"Lateral Raise":6,
    "Face Pull":15,"Barbell Curl":20,"Hammer Curl":10,"Tricep Pushdown":20,"Overhead Extension":12,"Squat":50,"Leg Press":100,"Leg Curl":30,"Calf Raise":40};
  let seed = 11; const rnd = () => (seed = (seed*9301+49297)%233280)/233280;
  const logs = {}, weights = [], checkins = {};
  for (let d = new Date(start); d < t; d = addDays(d,1)){
    const k = keyOf(d), ms = plan[wd(d)], week = Math.floor((d-start)/864e5/7);
    if (wd(d)===0) weights.push({date:k, kg:+(78 - week*0.35 - rnd()*0.3).toFixed(1)});
    if (!ms.length){ checkins[k] = MOODS[Math.floor(rnd()*3)]; continue; }
    if (k === keyOf(addDays(start,9))) continue;
    logs[k] = {type:"workout", entries: ms.flatMap(m=>exercises[m]).map(ex=>{ const sets = [];
      for (let i=0;i<3;i++){
        if (TIMED.has(ex)) sets.push({reps:+(1+week*0.25).toFixed(1)});
        else if (BODYW.has(ex)) sets.push({reps:6+week-i+(rnd()<.3?1:0)});
        else { const step = base[ex]>=20?2.5:1, kg = Math.round(base[ex]*(1+week*0.05)/step)*step; sets.push({kg:i===2?kg-step:kg, reps:Math.min(12, 9+week%3-i+(rnd()<.4?1:0))}); }
      } return {ex, sets}; })};
  }
  // calisthenics in demo: push-ups and running on some days
  for (const k of Object.keys(logs)){ const d = fromKey(k), week = Math.floor((d-start)/864e5/7);
    if (wd(d)===0) logs[k].entries.push({ex:"Knee Push-ups", sets:[{reps:20+week},{reps:18},{reps:15}]});
    if (wd(d)===2) logs[k].entries.push({ex:"Running", sets:[{km:+(1.5+week*0.6).toFixed(1), reps:12+week*3}]}); }
  return migrate({theme:"iron", profile:{name:"Deepansh", photo:null, height:175, startWeight:78, goal:72, startDate:keyOf(start)},
    planHistory:[{from:keyOf(start), plan}], exercises, logs, weights, checkins, style:"both", path:"solo",
    look:Object.assign({}, BASE_LOOK, {gender:"male", skin:3, face:"angular", jaw:"strong", hair:"fade", hairColor:"black", beard:"stubble", top:"tank", topColor:"graphite", bottom:"shorts", bottomColor:"onyx", shoes:"trainer", shoesColor:"white"}),
    owned:["hair:fade","top:tank"], wallet:{bought:0, spent:2}});
}

/* ===== CEREMONY QUEUE ===== */
const skId = u => u.tree+":"+u.i;
function queueCeremonies(_before, C){
  if (!S.seen) S.seen = {level:C.level, skills:C.skills.unlocked.map(skId)};
  const q = [], newSkills = C.skills.unlocked.filter(u => !S.seen.skills.includes(skId(u)));
  newSkills.forEach(u => q.push({skill:u}));
  if (C.level > S.seen.level) q.push({level:C.level, prevLevel:S.seen.level, rank:C.rank, prevRank:rankOf(S.seen.level)});
  S.seen = {level:Math.max(S.seen.level, C.level), skills:C.skills.unlocked.map(skId)}; save();
  UI.queue = (UI.queue||[]).concat(q);
  return newSkills;
}
function nextCeremony(){ if ($("#cer").innerHTML) return; if (UI.queue && UI.queue.length) ceremony(UI.queue.shift()); }

