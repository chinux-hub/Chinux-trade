const CACHE = 'chinux-client-v1';
const SHELL = ['./index.html', './manifest.json', '../icon-192.png', '../icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

// App-shell files: cache-first (so the shell works offline).
// Everything else (API calls): network-first, no caching — trading data
// must never be served stale silently.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  const isShellFile = SHELL.some(s => url.pathname.endsWith(s.replace('./', '/').replace('../', '/')));
  if (isShellFile) {
    e.respondWith(caches.match(e.request).then(cached => cached || fetch(e.request)));
  }
  // API/network requests fall through to normal browser handling.
});
