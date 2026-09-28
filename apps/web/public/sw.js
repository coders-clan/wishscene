/* global self, caches, fetch, Request, Response, URL */
// wishscene service worker: a branded offline page for page loads, nothing more.
// It never stores API responses, page HTML or anything about the user; every request
// still goes to the network, and the cache holds only the static files listed below.
// Bump CACHE whenever offline.html or the icon changes: installed workers only re-fetch
// them when this file changes.
const CACHE = 'wishscene-offline-v1';
const OFFLINE_URL = '/offline.html';
const OFFLINE_ICON = '/icons/icon-192.png';
const PRECACHE = [OFFLINE_URL, OFFLINE_ICON];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('wishscene-') && key !== CACHE)
          .map((key) => caches.delete(key)),
      );
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  // The offline page's icon: network first, cached copy only when the network fails.
  if (new URL(request.url).pathname === OFFLINE_ICON) {
    event.respondWith(
      fetch(request).catch(async () => (await caches.match(OFFLINE_ICON)) || Response.error()),
    );
    return;
  }
  // Only page loads get the offline fallback; other assets, API calls and form posts are untouched.
  if (request.mode !== 'navigate') return;
  event.respondWith(
    (async () => {
      try {
        const preloaded = await event.preloadResponse;
        return preloaded || (await fetch(request));
      } catch {
        return (await caches.match(OFFLINE_URL)) || Response.error();
      }
    })(),
  );
});
