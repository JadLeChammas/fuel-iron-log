// Keeps the app shell available so it opens fast from the home screen.
// Data always comes from Supabase over the network; it is never cached here.
const CACHE = "fil-v1";
const SHELL = ["/", "/index.html", "/styles.css", "/app.js", "/config.js", "/manifest.webmanifest", "/icons/icon-192.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // Network first, so a new deploy shows up right away; fall back to cache when offline.
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match("/index.html")))
  );
});
