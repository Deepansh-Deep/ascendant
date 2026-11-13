// Ascendant offline cache. Bump VERSION on every release so phones pick up the update.
const VERSION = "ascendant-3.3.5";
const CORE = [
  "./", "./index.html", "./manifest.webmanifest", "./css/app.css",
  "./js/config.js", "./js/core.js", "./js/ui.js", "./js/scoring.js", "./js/cloud.js", "./js/fx.js", "./js/hero2d.js", "./js/views.js", "./js/account.js", "./js/boot.js",
  "./fonts/sora-variable.woff2", "./fonts/inter-variable.woff2", "./fonts/barlow-condensed-600.woff2", "./fonts/barlow-condensed-700.woff2",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/maskable-512.png",
  ...["male", "female"].flatMap(g => ["signature", "urban", "royal"].map(o => `./assets/hero/${g}_${o}.webp`))
];
// optional fonts are cached on first use instead of at install, so installing stays fast
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE))); self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url); if (url.origin !== location.origin || /\.(mp4|webm)$/.test(url.pathname)) return; // video streams with range requests: leave to the browser // guild server calls go straight to the network
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok && /\/fonts\//.test(url.pathname)) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => req.mode === "navigate" ? caches.match("./index.html") : Response.error())));
});
