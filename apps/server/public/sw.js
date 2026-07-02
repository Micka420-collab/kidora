// Kidora service worker.
//   1. Web Push notifications (unchanged).
//   2. Conservative offline support: NETWORK-FIRST, so when online the browser
//      behaves exactly as without a service worker (no stale content). The SW
//      only steps in when the network fails — serving a cached hashed asset, or a
//      branded offline page for a failed navigation instead of the browser error.
//   API requests are never cached (dynamic/auth data always hits the network).
const VERSION = "kidora-v2";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icon-192.png", "/kidora-mark.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(PRECACHE).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return url.pathname.startsWith("/_next/static/") || /\.(?:css|js|woff2?|png|jpg|jpeg|svg|ico|webmanifest)$/.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // never touch mutations
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // let cross-origin pass through
  if (url.pathname.startsWith("/api/")) return; // dynamic/auth data → always network

  // Navigations: network-first, fall back to the branded offline page.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Hashed/immutable static assets: cache-first (safe — the filename changes on
  // change), and cache a fresh copy for next time.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req)
            .then((res) => {
              if (res.ok) {
                const copy = res.clone();
                caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => undefined);
              }
              return res;
            })
            .catch(() => hit),
      ),
    );
  }
});

// ── Web Push (unchanged) ──
self.addEventListener("push", (event) => {
  let data = { title: "Kidora", body: "Nouvelle alerte", url: "/dashboard" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (_) {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: { url: data.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/dashboard";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes(url) && "focus" in c) return c.focus();
      }
      return clients.openWindow(url);
    }),
  );
});
