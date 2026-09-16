/* ApexMSP Dispatch service worker.
   Network-first for navigations (so a new deploy is always picked up), with an
   offline fallback to the cached app shell; stale-while-revalidate for same-
   origin static assets. Never touches the cross-origin API or the WebSocket. */
const CACHE = 'apex-dispatch-v1';
const SHELL = ['/index.html', '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;               // API, map tiles, WS — leave alone
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws')) return;

  // Navigations: network-first, fall back to the cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(req);
      } catch {
        const cache = await caches.open(CACHE);
        return (await cache.match('/index.html')) || Response.error();
      }
    })());
    return;
  }

  // Static assets: serve cache fast, refresh in the background.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    const network = fetch(req)
      .then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; })
      .catch(() => cached);
    return cached || network;
  })());
});
