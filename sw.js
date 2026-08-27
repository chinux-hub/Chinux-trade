const CACHE = 'chinux-trade-v2';
const ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Navigation requests (opening/reloading the app): try network first,
// fall back to the cached app shell when offline.
// Everything else (live price data, API calls): network only, so data
// is never stale — those already have their own offline handling in-app.
self.addEventListener('fetch', (e) => {
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('./index.html'))
    );
    return;
  }
  if (ASSETS.some((a) => e.request.url.endsWith(a.replace('./', '')))) {
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
  }
});
