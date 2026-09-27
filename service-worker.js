// Babe Games service worker: app-shell caching (installable/offline-capable)
// plus notification click handling. Paths are relative to this file's own
// location, so this works whether the site sits at a domain root or a
// GitHub Pages project subpath.

const CACHE_VERSION = "babe-games-v7";
const SHELL_FILES = [
  "./",
  "index.html",
  "manifest.json",
  "css/style.css",
  "js/common.js",
  "js/data.js",
  "js/profiles.js",
  "js/notify.js",
  "js/online.js",
  "js/game.js",
  "js/game-ui.js",
  "js/rules/ncho-rules.js",
  "js/rules/dots-rules.js",
  "js/rules/chain-rules.js",
  "js/rules/scramble-rules.js",
  "js/rules/categories-rules.js",
  "js/rules/puzzle-rules.js",
  "games/scramble.html",
  "games/scramble.js",
  "games/categories.html",
  "games/categories.js",
  "games/chain.html",
  "games/chain.js",
  "games/dots-and-boxes.html",
  "games/dots-and-boxes.js",
  "games/ncho.html",
  "games/ncho.js",
  "games/puzzle.html",
  "games/puzzle.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

const NETWORK_TIMEOUT_MS = 3500;
const ASSET_PATTERN = /\.(png|jpe?g|gif|svg|ico|webp|woff2?)$/i;

function putInCache(request, response) {
  const copy = response.clone();
  caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
}

// Pages, scripts and styles come from the network first so an update is
// picked up straight away — serving these from the cache first meant a
// phone could keep running an old copy of the game indefinitely. The cache
// is still there as a fallback, and a slow connection falls back to it
// rather than hanging.
function networkFirst(request) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (response) => {
      if (settled) return;
      settled = true;
      resolve(response);
    };

    const timer = setTimeout(() => {
      caches.match(request).then((cached) => {
        if (cached) done(cached);
      });
    }, NETWORK_TIMEOUT_MS);

    fetch(request)
      .then((response) => {
        clearTimeout(timer);
        if (response && response.ok) putInCache(request, response);
        done(response);
      })
      .catch(() => {
        clearTimeout(timer);
        caches.match(request).then((cached) => {
          done(cached || new Response("Offline", { status: 503, statusText: "Offline" }));
        });
      });
  });
}

// Pictures and icons never change under the same name, so cache is fine.
function cacheFirst(request) {
  return caches.match(request).then((cached) => {
    if (cached) return cached;
    return fetch(request).then((response) => {
      if (response && response.ok) putInCache(request, response);
      return response;
    });
  });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Leave anything cross-origin (the PeerJS library, its signalling) alone.
  if (url.origin !== self.location.origin) return;

  event.respondWith(ASSET_PATTERN.test(url.pathname) ? cacheFirst(request) : networkFirst(request));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      if (clients.length > 0) {
        clients[0].focus();
      } else {
        self.clients.openWindow("./");
      }
    })
  );
});
