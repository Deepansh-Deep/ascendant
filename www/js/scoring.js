/* Ascendant guild scoring: ONE implementation shared by the app and the server.
   Loaded as a classic script in the app (window.AscendantScoring) and imported for its side effect
   by the Supabase edge function (globalThis.AscendantScoring). Pure: no DOM, no storage.
   Keep exercise categories in sync with core.js (test: supabase/test/run_tests.mjs checks this). */
(function (root) {
  "use strict";
  const TIMED = new Set(["Plank", "Treadmill", "Cycling", "Rowing", "Stair Climber", "Skipping"]);
  const HOLD = new Set(["Dead Hang", "Handstand Hold", "Wall Sit", "Hollow Hold", "L-Sit"]);
  const RUN = new Set(["Running"]);
  const BODYW = new Set(["Push-ups", "Pull-ups", "Bench Dips", "Hanging Leg Raise", "Crunches", "Russian Twist", "Ab Wheel",
    "Knee Push-ups", "Diamond Push-ups", "Decline Push-ups", "Archer Push-ups", "One-arm Push-up", "Chin-ups", "Inverted Rows", "Negative Pull-ups", "Muscle-up",
    "Pike Push-ups", "Band Curls", "Dips", "Bodyweight Squats", "Jump Squats", "Bulgarian Split Squat", "Assisted Pistol Squat", "Pistol Squats", "Leg Raises",
    "Hanging Knee Raise", "Mountain Climbers", "Burpees"]);
  const SKILLS = [
    {id: "push", nodes: [["Knee Push-ups", 20], ["Push-ups", 20], ["Diamond Push-ups", 15], ["Archer Push-ups", 8], ["One-arm Push-up", 3]]},
    {id: "pull", nodes: [["Dead Hang", 60], ["Inverted Rows", 15], ["Negative Pull-ups", 5], ["Pull-ups", 10], ["Muscle-up", 1]]},
    {id: "legs", nodes: [["Bodyweight Squats", 30], ["Lunges", 20], ["Bulgarian Split Squat", 15], ["Assisted Pistol Squat", 8], ["Pistol Squats", 5]]},
    {id: "core", nodes: [["Plank", 2], ["Hollow Hold", 45], ["Hanging Knee Raise", 15], ["Hanging Leg Raise", 10], ["L-Sit", 20]]},
    {id: "run", nodes: [["Running", 1], ["Running", 3], ["Running", 5], ["Running", 10], ["Running", 21]]}
  ];
  const pad = n => String(n).padStart(2, "0");
  const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromKey = k => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const wd = d => (d.getDay() + 6) % 7;
  const mondayOf = d => addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -wd(d));
  const isWeighted = ex => !(TIMED.has(ex) || BODYW.has(ex) || HOLD.has(ex) || RUN.has(ex));
  const validSets = sets => (sets || []).filter(s => +s.reps > 0);
  function setScore(ex, s) { const kg = +s.kg || 0, r = +s.reps || 0; if (RUN.has(ex)) return +s.km || 0; if (TIMED.has(ex) || HOLD.has(ex)) return r; if (BODYW.has(ex)) return r + kg; return kg * (1 + r / 30); }
  function bestSet(ex, sets) { let b = null, bs = -1; for (const s of validSets(sets)) { const v = setScore(ex, s); if (v > bs) { bs = v; b = s; } } return b ? {set: b, score: bs} : null; }
  const daySets = log => log && log.type === "workout" ? log.entries.reduce((a, e) => a + validSets(e.sets).length, 0) : 0;
  function planOn(S, k) { let p = S.planHistory[0].plan; for (const h of S.planHistory) if (h.from <= k) p = h.plan; return p; }
  const musclesOn = (S, k) => planOn(S, k)[wd(fromKey(k))] || [];
  const metricOf = (ex, s) => RUN.has(ex) ? (+s.km || 0) : (+s.reps || 0);
  function skillsUnlocked(S) {
    const best = {};
    for (const k of Object.keys(S.logs).sort()) { const l = S.logs[k]; if (!l || l.type !== "workout" || k < S.profile.startDate) continue;
      for (const e of l.entries) for (const s of validSets(e.sets)) (best[e.ex] = best[e.ex] || []).push({date: k, v: metricOf(e.ex, s)}); }
    const unlocked = [];
    for (const t of SKILLS) { let prev = null;
      for (let i = 0; i < t.nodes.length; i++) { const [ex, target] = t.nodes[i]; const hits = (best[ex] || []).filter(h => h.v >= target).map(h => h.date).sort();
        if (!hits.length || (i > 0 && prev === null)) break;
        const d = hits[0] > (prev || "") ? hits[0] : prev; prev = d; unlocked.push({tree: t.id, i, date: d}); } }
    return unlocked;
  }
  function currentWeight(S) { return S.weights && S.weights.length ? S.weights[S.weights.length - 1].kg : S.profile.startWeight; }
  function bestE1RM(S, fromK, toK) {
    const best = {};
    for (const k in S.logs) { if (k < fromK || k > toK) continue; const l = S.logs[k]; if (!l || l.type !== "workout") continue;
      for (const e of l.entries) { if (!isWeighted(e.ex)) continue; const b = bestSet(e.ex, e.sets); if (b && b.score > (best[e.ex] || 0)) best[e.ex] = b.score; } }
    return best;
  }
  function periodRange(S, period, todayKey) {
    const t = fromKey(todayKey);
    if (period === "week") { const m = mondayOf(t); return [m, addDays(m, 6)]; }
    if (period === "month") return [new Date(t.getFullYear(), t.getMonth(), 1), new Date(t.getFullYear(), t.getMonth() + 1, 0)];
    return [fromKey(S.profile.startDate), t];
  }
  function periodKey(period, todayKey) { return period === "week" ? keyOf(mondayOf(fromKey(todayKey))) : period === "month" ? todayKey.slice(0, 7) : "all"; }

  // S: {profile:{startDate,startWeight}, planHistory, logs, weights}; todayKey: "YYYY-MM-DD" in the user's (Indian) calendar
  function guildScores(S, period, todayKey) {
    const [a, b] = periodRange(S, period, todayKey), t = todayKey, fk = keyOf(a), tk = keyOf(b) < t ? keyOf(b) : t;
    const start = S.profile.startDate, unlocked = skillsUnlocked(S);
    // consistency: planned days trained / planned days so far (max 6 counted per week); today counts only once trained
    let planned = 0, done = 0; const perWeek = {};
    for (let d = fromKey(fk > start ? fk : start); keyOf(d) <= tk; d = addDays(d, 1)) {
      const k = keyOf(d); if (!musclesOn(S, k).length) continue; const did = daySets(S.logs[k]) > 0; if (k === t && !did) continue;
      const w = keyOf(mondayOf(d)); perWeek[w] = perWeek[w] || {p: 0};
      if (perWeek[w].p < 6) { perWeek[w].p++; planned++; if (did) done++; } }
    const consistency = planned ? Math.round(done / planned * 100) : 0;
    // strength: average estimated 1RM of the 3 strongest lifts relative to bodyweight (1.5x = 100), or skill mastery if higher
    const bw = currentWeight(S) || 70, cur = bestE1RM(S, fk, tk);
    const top3 = Object.values(cur).sort((x, y) => y - x).slice(0, 3);
    const rel = top3.length ? top3.reduce((s, v) => s + v / bw, 0) / top3.length : 0;
    const strength = Math.max(Math.min(100, Math.round(rel / 1.5 * 100)), Math.round(unlocked.length / 25 * 100));
    // progress: gain vs your own previous 4 weeks, capped (4% per week, 15% per month) so reckless maxing never pays
    const prev = bestE1RM(S, keyOf(addDays(a, -28)), keyOf(addDays(a, -1)));
    const gains = Object.keys(cur).filter(ex => prev[ex]).map(ex => cur[ex] / prev[ex] - 1);
    const cap = period === "week" ? 0.04 : 0.15, avgGain = gains.length ? gains.reduce((s, g) => s + g, 0) / gains.length : 0;
    const skillsIn = unlocked.filter(u => u.date >= fk && u.date <= tk).length;
    const progress = Math.min(100, Math.round(Math.max(0, Math.min(avgGain, cap)) / cap * 80 + skillsIn * 10));
    const overall = Math.round(consistency * 0.4 + progress * 0.3 + strength * 0.3);
    return {period, period_key: periodKey(period, todayKey), consistency, strength, progress, overall,
      detail: {planned, done, rel: rel.toFixed(2), gainPct: (avgGain * 100).toFixed(1), lifts: top3.length, skillsIn}};
  }
  // calendar date in India regardless of the device or server time zone
  function indiaToday(now) { const d = new Date((now || Date.now()) + 5.5 * 3600e3); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }
  function validState(S) { return !!(S && S.profile && S.profile.startDate && Array.isArray(S.planHistory) && S.planHistory.length && S.logs); }

  root.AscendantScoring = {guildScores, periodKey, indiaToday, validState, categories: {TIMED, HOLD, RUN, BODYW}};
})(typeof globalThis !== "undefined" ? globalThis : window);
