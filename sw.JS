// Duplicity service worker: network-first for the site's own files, so updates show up right away
// (it also skips the browser's 10-minute GitHub Pages cache). Falls back to the saved copy when offline.
// Game files come from other servers and are never touched here.
const CACHE = "duplicity-shell-v1";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png"];
self.addEventListener("install", function(e) {
  e.waitUntil(caches.open(CACHE).then(function(c) { return c.addAll(SHELL); }).catch(function() {}));
  self.skipWaiting();
});
self.addEventListener("activate", function(e) {
  e.waitUntil(caches.keys().then(function(ks) {
    return Promise.all(ks.filter(function(k) { return k !== CACHE; }).map(function(k) { return caches.delete(k); }));
  }).then(function() { return self.clients.claim(); }));
});
self.addEventListener("fetch", function(e) {
  const r = e.request;
  if (r.method !== "GET") return;
  const u = new URL(r.url);
  if (u.origin !== location.origin) return;
  e.respondWith(
    fetch(r, { cache: "no-store" }).then(function(res) {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(function(c) { c.put(r, copy); }); }
      return res;
    }).catch(function() {
      return caches.match(r).then(function(m) { return m || caches.match("./index.html"); });
    })
  );
});
