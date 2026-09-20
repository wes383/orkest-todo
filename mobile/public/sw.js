/*
 * The app shell, cached so the page opens from the home screen without a
 * network round trip.
 *
 * Two rules, and the split between them is the whole design:
 *
 *  - Same-origin GETs are cache-first, and the cached copy is refreshed in the
 *    background. The built assets are content-hashed, so a new deploy ships
 *    new filenames and the old ones simply stop being requested; the shell
 *    (`./`) is re-fetched in the background so the next launch has it.
 *  - Everything else — Supabase above all — goes straight to the network and
 *    is never stored. This page's payload is a switch and a clock; serving a
 *    stale one from a cache would show a session that is not running.
 */

const CACHE = "orkest-mobile-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(["./"])));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Another origin is another service's business — never cached here.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached ?? caches.match("./"));
      return cached ?? network;
    })
  );
});
