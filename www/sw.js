// Ascendant offline cache. Bump VERSION on every release so phones pick up the update.
const VERSION = "ascendant-2.3.0";
const CORE = [
  "./", "./index.html", "./manifest.webmanifest", "./css/app.css",
  "./js/config.js", "./js/core.js", "./js/ui.js", "./js/scoring.js", "./js/cloud.js", "./js/fx.js", "./js/views.js", "./js/account.js", "./js/boot.js", "./js/hunter3d.js", "./js/hunter3d_post.js", "./vendor/three-bundle.js",
  "./fonts/sora-variable.woff2", "./fonts/inter-variable.woff2", "./fonts/barlow-condensed-600.woff2", "./fonts/barlow-condensed-700.woff2",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/maskable-512.png",
  "./assets/hunter/manifest.json", "./assets/hunter/skin_normal.png", "./assets/hunter/fabric_normal.png", "./assets/hunter/hair_strands.png", "./assets/hunter/hair_normal.png"
];
// large 3D files and optional fonts are cached on first use instead of at install, so installing stays fast
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE))); self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url); if (url.origin !== location.origin) return; // guild server calls go straight to the network
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok && /\/(assets\/hunter|fonts)\//.test(url.pathname)) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => req.mode === "navigate" ? caches.match("./index.html") : Response.error())));
});
