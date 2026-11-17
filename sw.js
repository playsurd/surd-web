// Duplicity service worker: network-first for the site's own files, so updates show up right away
// (it also skips the browser's 10-minute GitHub Pages cache). Falls back to the saved copy when offline.
// Game files come from other servers and are never touched here.
const CACHE = "duplicity-shell-v2";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png"];

// ---- My Games: files the player saved in this browser are served from IndexedDB ----
let mgDb = null;
function mgOpen() {
  if (mgDb) return mgDb;
  mgDb = new Promise(function(res, rej) {
    const r = indexedDB.open("duplicity-mygames", 1);
    r.onupgradeneeded = function() {
      const d = r.result;
      if (!d.objectStoreNames.contains("games")) d.createObjectStore("games", { keyPath: "id" });
      if (!d.objectStoreNames.contains("files")) d.createObjectStore("files", { keyPath: "key" }).createIndex("gid", "gid");
    };
    r.onsuccess = function() { r.result.onversionchange = function() { r.result.close(); mgDb = null; }; res(r.result); };
    r.onerror = function() { mgDb = null; rej(r.error); };
  });
  return mgDb;
}
function mgReq(r) { return new Promise(function(res, rej) { r.onsuccess = function() { res(r.result); }; r.onerror = function() { rej(r.error); }; }); }
async function mgServe(req, rel) {
  const parts = rel.split("/").slice(1);
  const nostore = { "Cache-Control": "no-store" };
  if (parts[0] === "__ping__") return new Response("duplicity-mygames-v1", { headers: Object.assign({ "Content-Type": "text/plain" }, nostore) });
  let gid, path;
  try { gid = decodeURIComponent(parts[0]); path = parts.slice(1).map(decodeURIComponent).join("/"); }
  catch (e) { return new Response("Bad path", { status: 400 }); }
  if (!path || /\/$/.test(path)) path += "index.html";
  let rec;
  try {
    const d = await mgOpen();
    const st = d.transaction("files").objectStore("files");
    rec = await mgReq(st.get(gid + "/" + path));
    if (!rec) {   // same name with different capitals
      const keys = await mgReq(st.getAllKeys(IDBKeyRange.bound(gid + "/", gid + "/￿")));
      const want = (gid + "/" + path).toLowerCase();
      const hit = keys.filter(function(k) { return k.toLowerCase() === want; })[0];
      if (hit) rec = await mgReq(st.get(hit));
    }
  } catch (e) { return new Response("Storage error", { status: 500 }); }
  if (!rec) return new Response("Not found in this game: " + path, { status: 404, headers: { "Content-Type": "text/plain" } });
  const blob = rec.blob, size = blob.size;
  const h = Object.assign({ "Content-Type": rec.type || "application/octet-stream", "Accept-Ranges": "bytes" }, nostore);
  const enc = /\.gz$/i.test(path) ? "gzip" : /\.br$/i.test(path) ? "br" : "";
  if (enc) { h["Content-Encoding"] = enc; return new Response(blob, { status: 200, headers: h }); }
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("Range") || "");
  if (m && (m[1] !== "" || m[2] !== "")) {
    let start, end;
    if (m[1] === "") { start = Math.max(0, size - Number(m[2])); end = size - 1; }
    else { start = Number(m[1]); end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1); }
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { "Content-Range": "bytes */" + size } });
    h["Content-Range"] = "bytes " + start + "-" + end + "/" + size;
    return new Response(blob.slice(start, end + 1), { status: 206, headers: h });
  }
  return new Response(blob, { status: 200, headers: h });
}
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
  const scopePath = new URL(self.registration.scope).pathname;
  if (u.pathname.indexOf(scopePath + "mygames/") === 0) { e.respondWith(mgServe(r, u.pathname.slice(scopePath.length))); return; }
  e.respondWith(
    fetch(r, { cache: "no-store" }).then(function(res) {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(function(c) { c.put(r, copy); }); }
      return res;
    }).catch(function() {
      return caches.match(r).then(function(m) { return m || caches.match("./index.html"); });
    })
  );
});
