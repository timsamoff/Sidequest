// Offline cache for the installed PWA. The shell lists every app module, so the first launch after install works offline.
// Bump the version suffix whenever shipped files change, so activate's cleanup evicts the old cache.
var CACHE = "sidequest-shell-v8";
var SHELL = [
  "./", "index.html", "manifest.json",
  "../css/tokens.css", "../css/leather.css", "../css/styles.css", "../css/splash.css", "../assets/header-800.jpg",
  "app.js", "chart.js", "confetti.js", "dates.js", "dialogs.js", "dom.js", "errands.js", "export.js", "files.js", "help.js", "imports.js", "lifecycle.js",
  "model.js", "quest-page.js", "search.js", "settings.js", "splash.js", "state.js", "tutorial.js", "views.js"
];

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

// Network-first for same-origin GET requests, so a normal reload always gets the current files.
// The cache is only the offline fallback. Cross-origin requests (Google Fonts) are left alone.
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: "no-cache" }).then(function (res) {
      // The copy is taken before the response is handed back; afterward its body is in use and cannot be cloned.
      if (res.ok) { var copy = res.clone(); e.waitUntil(caches.open(CACHE).then(function (c) { return c.put(e.request, copy); })); }
      return res;
    }).catch(function () {
      // A stylesheet is asked for with ?v=, but the shell stores it without one.
      return caches.match(e.request).then(function (hit) { return hit || caches.match(e.request, { ignoreSearch: true }); });
    })
  );
});
