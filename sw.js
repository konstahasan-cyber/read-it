// Offline support. Bump VERSION after changing any file so phones pick up the update.
const VERSION = 'readit-v3';
const SHELL = [
  './', './index.html', './admin.html', './styles.css', './config.js', './manifest.webmanifest',
  './js/app.js', './js/admin.js', './js/icons.js', './js/data.js', './js/engine.js', './js/rng.js', './js/speech.js', './js/store.js', './js/sync.js',
  './topics/index.json', './topics/alphabet.json', './topics/phonics.json', './topics/dictionary.json',
  './icons/icon.svg', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'no-cache' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.includes('/rest/v1/') || url.pathname.includes('/auth/v1/')) return;
  // Lessons and code: network first so updates arrive, cache when offline.
  // Fonts and audio: cache first.
  const cacheFirst = url.origin.includes('fonts.g') || url.pathname.includes('/audio/');
  if (cacheFirst) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => {
      if (r.ok || r.type === 'opaque') { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return r;
    })));
    return;
  }
  if (url.origin !== location.origin) return;
  // no-cache: always ask the server whether a file changed, so updates reach phones at once.
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
