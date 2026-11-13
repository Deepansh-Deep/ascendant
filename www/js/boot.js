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
  return `<div class="update-bar"><div><b>Ascendant ${esc(u.version)} is available</b><span class="tiny">${esc(u.notes || "Install it over this version. Your training stays.")}</span></div>
    <button class="btn sm" data-act="app-update">Update</button></div>`;
}

/* ---------------- in-app updater ----------------
   1. save, and sync to the account if there is one   2. one-time "install unknown apps" permission
   3. download inside the app with progress            4. the native side checks it is the same app, newer, and
   signed with the same key (so Android can never demand an uninstall)   5. Android's own installer: tap Update.
   An in-place update keeps everything stored on the phone; nothing is deleted at any step. */
const Updater = {
  busy: false, waitingPerm: false,
  plugin(){ const C = window.Capacitor; if (!C) return null; try { return C.registerPlugin ? C.registerPlugin("AppUpdater") : (C.Plugins || {}).AppUpdater; } catch(e){ return null; } },
  sheet(title, body, buttons){ modal(`<h2>${title}</h2>${body}${buttons ? `<div class="grid2" style="margin-top:14px">${buttons}</div>` : ""}`); },
  fail(msg){
    this.busy = false;
    this.sheet("Update not finished", `<p class="sm mute" style="margin-top:6px">${esc(msg)}</p><p class="sm mute" style="margin-top:8px">Nothing on your phone was changed. Your training is safe.</p>`,
      `<button class="btn ghost" data-act="upd-browser">Use browser</button><button class="btn" data-act="app-update">Try again</button>`);
  },
  async start(){
    const u = UI.update, P = this.plugin(); if (!u || this.busy) return;
    if (!P || !P.download){ this.browser(); return; }      // app versions before the updater existed
    this.busy = true;
    try {
      // 1. make sure the newest training is saved, and on the server if this is an account
      this.sheet("Getting ready", `<p class="sm mute" style="margin-top:6px"><span class="spin sm"></span> Saving your training first…</p>`);
      if (S) save();
      if (typeof Sync !== "undefined" && Sync.active()){
        for (let i = 0; i < 40 && Sync.running; i++) await new Promise(r => setTimeout(r, 250));
        if (!(await Sync.run())){
          this.busy = false;
          return this.sheet("Your latest training is not on the server yet", `<p class="sm mute" style="margin-top:6px">${Sync.status === "offline" ? "You seem to be offline." : "Sync did not finish."} That is fine: updating keeps everything on this phone, and it will sync later. Updating needs internet for the download though.</p>`,
            `<button class="btn ghost" data-act="close">Not now</button><button class="btn" data-act="upd-force">Update anyway</button>`);
        }
      }
      return this.afterSync();
    } catch(e){ this.fail(e.message || "Something went wrong"); }
  },
  async afterSync(){
    const u = UI.update, P = this.plugin(); this.busy = true;
    try {
      // 2. one-time permission to open the installer
      const info = await P.info();
      if (!info.canInstall){
        this.busy = false; this.waitingPerm = true;
        return this.sheet("One-time permission", `<p class="sm mute" style="margin-top:6px">Android needs you to allow Ascendant to install its own updates. Turn on <b>Allow from this source</b>, then come back. You only do this once.</p>`,
          `<button class="btn ghost" data-act="close">Not now</button><button class="btn" data-act="upd-perm">Open setting</button>`);
      }
      // 3. download with progress
      this.sheet(`Downloading ${esc(u.version)}`, `<div class="upd-track"><i id="upd-fill"></i></div><p class="tiny mute" id="upd-txt">Starting…</p><p class="tiny mute">Keep the app open.</p>`);
      const h = await P.addListener("progress", e => { const f = $("#upd-fill"), t = $("#upd-txt");
        if (f && e.pct >= 0) f.style.width = e.pct + "%"; if (t) t.textContent = e.pct >= 0 ? `${e.pct}%, ${e.mb} MB` : `${e.mb} MB`; });
      let r; try { r = await P.download({url: u.apk_url}); } finally { try { h.remove(); } catch(e){} }
      // 4. the native side has verified the file
      if (!r.ok){
        this.busy = false;
        if (r.reason === "not_newer"){ UI.update = null; closeModal(); render(); return toast("You already have the newest version"); }
        if (r.reason === "key_mismatch") return this.sheet("This update cannot go over your app", `<p class="sm mute" style="margin-top:6px">The app on this phone was installed from a different build, so Android will not let this version replace it. Nothing was changed.</p>
          <p class="sm" style="margin-top:8px"><b>Do not uninstall yet.</b> Uninstalling deletes training that is only on this phone.</p>
          <p class="sm mute" style="margin-top:8px">${CLOUD_ON && Cloud.session ? "First tap Sync now and wait for Synced. Your account then holds everything, and after reinstalling you just sign in." : "First tap Save backup and keep the file. After reinstalling, use Restore."}</p>`,
          CLOUD_ON && Cloud.session ? `<button class="btn ghost" data-act="close">Close</button><button class="btn" data-act="ac-syncnow">Sync now</button>` : `<button class="btn ghost" data-act="close">Close</button><button class="btn" data-act="backup">Save backup</button>`);
        return this.fail(r.reason === "other_app" ? "The downloaded file is not Ascendant." : "The downloaded file was damaged.");
      }
      // 5. Android's installer
      this.sheet("Ready to install", `<p class="sm mute" style="margin-top:6px">Android will now show its install screen. Tap <b>Update</b>. Your training stays on this phone.</p>`,
        `<button class="btn ghost" data-act="close">Later</button><button class="btn" data-act="upd-install">Install</button>`);
      this.busy = false;
      await this.install();
    } catch(e){ this.fail(e.message || "Download failed. Check your internet."); }
  },
  async install(){
    const P = this.plugin();
    try { await P.install(); }
    catch(e){ if (/NEEDS_PERMISSION/.test(e.message || "")){ this.waitingPerm = true; return this.afterSync(); } this.fail(e.message || "Could not open the installer"); }
  },
  async browser(){
    const u = UI.update, P = this.plugin(); if (!u) return;
    try { if (P && P.openExternal) await P.openExternal({url: u.apk_url}); else window.open(u.apk_url, "_system"); } catch(e){ window.open(u.apk_url, "_blank"); }
    this.sheet("Finish in your browser", `<p class="sm mute" style="margin-top:6px">When the download finishes, open <b>ascendant-${esc(u.version)}.apk</b> from your notifications or the Downloads folder and tap <b>Update</b>. Do not uninstall the app first.</p>`, `<button class="btn" data-act="close">OK</button>`);
  }
};
document.addEventListener("click", e => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const a = b.dataset.act;
  if (a === "app-update"){ e.preventDefault(); Updater.start(); }
  else if (a === "upd-force"){ Updater.afterSync(); }
  else if (a === "upd-perm"){ Updater.waitingPerm = true; const P = Updater.plugin(); P && P.openInstallSettings().catch(() => {}); }
  else if (a === "upd-install"){ Updater.install(); }
  else if (a === "upd-browser"){ Updater.browser(); }
});
document.addEventListener("visibilitychange", () => {   // back from the permission screen: carry on by itself
  if (document.hidden || !Updater.waitingPerm) return;
  Updater.waitingPerm = false;
  const P = Updater.plugin(); if (P) P.info().then(i => { if (i.canInstall) Updater.afterSync(); }).catch(() => {});
});

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
