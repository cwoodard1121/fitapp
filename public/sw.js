/* simplegym service worker. Network-first pages with an offline cache. */
const CACHE = "simplegym-v3";
const ASSETS = ["/manifest.webmanifest", "/icon.svg", "/icon-192.png"];
// Main pages, cached on install so they open with no wifi.
const PAGES = ["/today", "/nutrition", "/history", "/program", "/progress", "/body", "/goals", "/overview", "/checkin", "/settings"];

async function cachePage(cache, path) {
  try {
    const res = await fetch(path, { credentials: "same-origin" });
    if (!res.ok || res.redirected) return;
    const html = await res.clone().text();
    await cache.put(path, res);
    // Also cache the page's scripts and styles so it runs offline.
    const assets = [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)].map((m) => m[1]);
    await Promise.all(
      [...new Set(assets)].map((a) =>
        cache.match(a).then((hit) => hit || cache.add(a).catch(() => {})),
      ),
    );
  } catch {
    /* offline or failed: skip */
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (c) => {
      await c.addAll(ASSETS).catch(() => {});
      await Promise.all(PAGES.map((p) => cachePage(c, p)));
    }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Only GET, same-origin. Never cache Supabase/auth/API calls.
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/auth") || url.pathname.startsWith("/api")) return;

  // Navigations: network-first, fall back to cached page, then /today.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok && !res.redirected) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(url.pathname, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() =>
          caches
            .match(url.pathname)
            .then((m) => m || caches.match(request, { ignoreSearch: true }))
            .then((m) => m || caches.match("/today")),
        ),
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  if (
    url.pathname.startsWith("/_next/static") ||
    url.pathname.startsWith("/icon") ||
    url.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
            return res;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
  }
});
