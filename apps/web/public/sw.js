/* global self, caches, fetch, Request, Response */
// wishscene service worker: a branded offline page for page loads, nothing more.
// It never stores API responses, page HTML or anything about the user; every request
// still goes to the network, and the cache holds only the static files listed below.
const CACHE = 'wishscene-offline-v1';
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png'];

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
  // Only page loads get the offline fallback; assets, API calls and form posts are untouched.
  if (request.mode !== 'navigate' || request.method !== 'GET') return;
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
