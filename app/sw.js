// Offline cache for the installed PWA. The shell lists every app module, so the first launch after install works offline.
// Bump the version suffix whenever shipped files change, so activate's cleanup evicts the old cache.
var CACHE = "sidequest-shell-v9";
// Google Fonts are cached on first use so a launch with no network does not wait on them.
var FONTS = "sidequest-fonts-v1", FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"], WAIT = 2000, deadUntil = 0;
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
      return Promise.all(keys.filter(function (k) { return k !== CACHE && k !== FONTS; }).map(function (k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

// Same-origin files are network-first, so a normal reload gets the current files, but a slow or dead connection
// falls back to the cached copy after a short wait. Google Fonts are cache-first. Everything else is left alone.
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  var url = new URL(e.request.url);
  if (FONT_HOSTS.indexOf(url.hostname) >= 0) { e.respondWith(fontsFirst(e.request)); return; }
  if (url.origin !== location.origin) return;
  e.respondWith(networkFirst(e.request));
});

function fromCache(request) {
  // A stylesheet is asked for with ?v=, but the shell stores it without one.
  return caches.match(request).then(function (hit) { return hit || caches.match(request, { ignoreSearch: true }); });
}

function fontsFirst(request) {
  return caches.open(FONTS).then(function (c) {
    return c.match(request).then(function (hit) {
      if (hit) return hit;
      return fetch(request).then(function (res) {
        if (res.ok || res.type === "opaque") { var copy = res.clone(); c.put(request, copy); }
        return res;
      });
    });
  });
}

function networkFirst(request) {
  return new Promise(function (resolve) {
    var answered = false;
    function answer(res) { if (!answered && res) { answered = true; resolve(res); } }
    // After WAIT the cached copy is served if there is one; the fetch carries on and refreshes the cache.
    // Once one request has timed out, the next 30 seconds go to the cache at once, since a page loads in waves.
    if (Date.now() < deadUntil) fromCache(request).then(answer);
    var timer = setTimeout(function () { deadUntil = Date.now() + 30000; fromCache(request).then(answer); }, WAIT);
    fetch(request, { cache: "no-cache" }).then(function (res) {
      clearTimeout(timer); deadUntil = 0;
      // The copy is taken before the response is handed back; afterward its body is in use and cannot be cloned.
      if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { return c.put(request, copy); }).catch(function () {}); }
      answer(res);
    }, function () {
      clearTimeout(timer);
      fromCache(request).then(function (hit) { answer(hit || Response.error()); });
    });
  });
}
