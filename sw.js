/* Anchor service worker — offline shell for field use (spotty job-site signal).
 *
 * Strategy, chosen to avoid the classic "stuck on an old version" service-worker trap:
 *  - NETWORK-FIRST for the page/navigations: when online you ALWAYS get the live app,
 *    and the freshly-fetched copy is stashed so an offline reload still works.
 *  - CACHE-FIRST for same-origin static assets (icons, wordmark, manifest): they change
 *    rarely, so serve them instantly and fill the cache on first fetch.
 *  - Cross-origin requests (Supabase auth/data, xAI, any CDN) are NEVER intercepted —
 *    they go straight to the network so logins, sync, and AI reads are untouched.
 *  - Only GET is handled; POST/PUT/etc. (writes, auth) always hit the network.
 *  - On activate, every cache except the current version is deleted, and the worker
 *    claims open tabs, so a deploy that bumps CACHE cleans up old shells immediately.
 *
 * Bump CACHE whenever a precached static asset changes (the HTML is network-first, so a
 * new deploy is picked up online without a bump).
 */
const CACHE = "anchor-shell-v1";
const SHELL = [
  "/", "/index.html", "/manifest.webmanifest", "/anchor-wordmark.png",
  "/favicon.ico", "/favicon-32.png", "/favicon-16.png", "/apple-touch-icon.png",
  "/icon-192.png", "/icon-512.png"
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  // Best-effort precache — a single missing/renamed asset must not abort the install.
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {})))));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (e) => { if (e.data === "skipWaiting") self.skipWaiting(); });

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;                 // never touch writes / auth POSTs
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return;  // Supabase / xAI / CDNs → straight to network

  const isDoc = req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");
  if (isDoc) {
    // Network-first: live page when online, cached shell when offline.
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/index.html", copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("/index.html")).then((r) => r || caches.match("/")))
    );
    return;
  }

  // Same-origin static assets: cache-first, fill on first fetch.
  e.respondWith(
    caches.match(req).then((r) => r ||
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => r))
  );
});
