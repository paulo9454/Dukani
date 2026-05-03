/**
 * Dukayko — minimal service worker.
 *
 * Goals (no more, no less):
 *  1. Satisfy Chrome's PWA install criteria (SW with a fetch handler).
 *  2. Offline shell — if the network fails, serve a cached `/` for navigations.
 *  3. Stale-while-revalidate for product images under /api/static/.
 *
 * We keep this simple on purpose — no Workbox, no runtime deps. Bump
 * SW_VERSION when you ship a change that must purge old caches.
 */
const SW_VERSION = "dukayko-v1";
const SHELL_CACHE = `dukayko-shell-${SW_VERSION}`;
const IMG_CACHE = `dukayko-img-${SW_VERSION}`;
const SHELL_URLS = [
  "/",
  "/manifest.json",
  "/dukayko-logo.jpg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) =>
        // addAll would fail the whole install on a single 404; be permissive.
        Promise.all(
          SHELL_URLS.map((url) =>
            fetch(url, { cache: "no-store" })
              .then((r) => (r.ok ? cache.put(url, r.clone()) : null))
              .catch(() => null)
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => ![SHELL_CACHE, IMG_CACHE].includes(k))
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Same-origin only — don't touch cross-origin CDN images, don't touch /api/.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/static/")) return;

  // Product images — stale-while-revalidate keeps shop pages fast.
  if (url.pathname.startsWith("/api/static/")) {
    event.respondWith(
      caches.open(IMG_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const fetchPromise = fetch(req)
          .then((resp) => {
            if (resp && resp.ok) cache.put(req, resp.clone());
            return resp;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Navigations — network first, fallback to cached shell when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match("/").then((r) => r || new Response("Offline", { status: 503 }))
      )
    );
  }
});
