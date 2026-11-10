"use strict";
/* ASCENDANT boot: picks offline mode or account mode, restores the session, checks for app updates. */
function initSeen(){ const C0 = compute(); S.seen = {level: C0.level, skills: C0.skills.unlocked.map(skId)}; save(); }
function semverGt(a, b){ const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number); for (let i = 0; i < 3; i++){ if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); } return false; }
async function checkForUpdate(){
  // only the installed Android app updates itself from the website; the web version is always current
  const native = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  if (!native || !CFG.updateUrl) return;
  try {
    const r = await fetch(CFG.updateUrl + "?t=" + Date.now(), {cache: "no-store"}); if (!r.ok) return;
    const v = await r.json();
    if (v && v.version && semverGt(v.version, VERSION)){ UI.update = v; render(); }
  } catch(e){}
}
function updateBar(){
  const u = UI.update; if (!u) return "";
  return `<div class="update-bar"><div><b>Ascendant ${esc(u.version)} is available</b><span class="tiny">${esc(u.notes || "Download and install it over this version. Your data stays.")}</span></div>
    <a class="btn sm" href="${esc(u.apk_url)}" target="_blank" rel="noopener">Download</a></div>`;
}
(async function boot(){
  if (CLOUD_ON){
    Cloud.loadSession();
    if (Cloud.session && Cloud.session.user_id){
      STORE_KEY = KEY + ":" + Cloud.session.user_id; S = load();
      if (S){ if (!S.seen) initSeen();
        render(); refreshAccount().then(() => render()).catch(() => {}); Sync.run(); }
      else await afterLogin();
    } else {
      UI.auth = {step: "welcome"}; render();
    }
  } else {
    S = load();
    if (!S) UI.onb = blankOnb();
    else if (!S.seen) initSeen();
    render();
  }
  (function autoReport(){ if (!S || UI.onb || UI.auth) return; const thisMon = keyOf(mondayOf(todayD()));
    if (S.seenReport !== thisMon && S.profile.startDate < thisMon){ const C = compute(); if (gradeOf(weekStats(C, addDays(mondayOf(todayD()), -7)))) setTimeout(reportCard, 700); else { S.seenReport = thisMon; save(); } } })();
  scheduleReminders();
  checkForUpdate();
  if ("serviceWorker" in navigator && location.protocol === "https:" && !/claude|claudeusercontent/.test(location.hostname)) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
document.addEventListener("visibilitychange", () => { if (!document.hidden) Sync.schedule(800); });
