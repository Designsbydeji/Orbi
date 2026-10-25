// Orbi service worker: keeps the app shell available offline.
// Database and sign-in calls go straight to Supabase and are never cached here.
var CACHE = "orbi-shell-v15";
var SHELL = ["./", "index.html", "styles.css", "app.js", "config.js", "manifest.webmanifest"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  // Songs and anything fetched in pieces (audio/video ranges) go straight to the network.
  if (req.headers.has("range") || /\/audio\//.test(url.pathname)) return;
  if (url.origin === location.origin) {
    // Our own files: try the network first so updates show up, fall back to the cache offline.
    e.respondWith(fetch(req).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
      return res;
    }).catch(function () {
      return caches.match(req).then(function (m) { return m || caches.match("index.html"); });
    }));
  } else if (url.hostname === "cdn.jsdelivr.net" || url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    // Library and fonts: serve the saved copy and refresh it in the background.
    e.respondWith(caches.open(CACHE).then(function (c) {
      return c.match(req).then(function (m) {
        var fresh = fetch(req).then(function (res) { if (res && res.ok) c.put(req, res.clone()); return res; }).catch(function () { return m; });
        return m || fresh;
      });
    }));
  }
});
