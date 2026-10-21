// TextChef service worker. build.js fills in VERSION and ASSETS.
// Cache-first for everything under one versioned cache. A new version waits until the user clicks Reload.
const VERSION = 'textchef-__VERSION__';
const ASSETS = __ASSETS__;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS.map((a) => new Request(a, { cache: 'reload' })))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION && k.startsWith('textchef-')) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    let hit = await cache.match(req, { ignoreSearch: true });
    if (!hit && req.mode === 'navigate') {
      const u = new URL(url);
      u.search = '';
      if (u.pathname.endsWith('/index.html')) u.pathname = u.pathname.slice(0, -10);
      else if (!u.pathname.endsWith('/')) u.pathname += '/';
      hit = await cache.match(u.href);
    }
    if (hit) return hit;
    try {
      return await fetch(req);
    } catch (err) {
      if (req.mode === 'navigate') {
        const home = await cache.match(new URL('./', self.registration.scope).href);
        if (home) return home;
      }
      throw err;
    }
  })());
});
