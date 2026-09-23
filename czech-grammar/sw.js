// Offline cache. Network first, so a deploy shows up on the next load with all
// files in step, but a network that hangs gives way to the cache after 4 s
// (the fetch still finishes in the background and refreshes the cache).
// Bump VERSION when the list of files changes.
const VERSION = 'slovicka-6';
const DATA = 'cards.json?v=6';   // keep in step with DATA_VERSION in app.js
const FILES = ['./', 'index.html', 'app.css', 'srs.js', 'app.js', DATA,
  'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];
const TIMEOUT = 4000;

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
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    // hand the response over at once (so the page can stream it) and cache a copy alongside
    const network = fetch(req);
    // registered before anything reads the body, so the clone is taken first
    e.waitUntil(network.then(res => res.ok ? cache.put(req, res.clone()) : null).catch(() => {}));
    // pages ignore their query string (?utm…); data keeps it, so an old deck is never served for a new one
    const cached = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
    const timeout = new Promise(r => setTimeout(r, cached ? TIMEOUT : 30000));
    const res = await Promise.race([network.catch(() => null), timeout]);
    return res || cached || new Response('Offline', { status: 503, statusText: 'Offline' });
  })());
});
