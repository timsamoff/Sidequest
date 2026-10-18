// Minimal offline cache for the installed PWA shell -- app/*.js files are cached as fetched, not listed here, so new files need no update to this list.
// Bump the version suffix whenever shipped files change, so activate's own
// cleanup (below) evicts the old cache instead of serving it forever.
var CACHE = "sidequest-shell-v3";
var SHELL = ["./", "index.html", "css/tokens.css", "css/styles.css", "manifest.json"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }));
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

// Network-first for same-origin GET requests, so a normal reload always gets
// the current files; the cache is only the offline fallback. (Cache-first served
// stale files forever and could mix old scripts with new styles.) Cross-origin
// requests (Google Fonts) are left alone.
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: "no-cache" }).then(function (res) {
      if (res.ok) caches.open(CACHE).then(function (c) { c.put(e.request, res.clone()); });
      return res;
    }).catch(function () { return caches.match(e.request); })
  );
});
