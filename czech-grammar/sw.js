// Offline cache. Network first, so a deploy shows up on the next load with all
// files in step; the cache answers only when the network fails.
// Bump VERSION when the list of files changes.
const VERSION = 'slovicka-1';
const FILES = ['./', 'index.html', 'app.css', 'srs.js', 'app.js', 'cards.json',
  'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(cache =>
    fetch(req).then(res => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => cache.match(req, { ignoreSearch: true })
      .then(hit => hit || new Response('Offline', { status: 503 })))));
});
