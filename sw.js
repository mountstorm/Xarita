// Offline support for Xarita.
//
// - App shell (page, modules, styles): network first, so a new deploy always wins;
//   the cached copy is the fallback when the connection drops.
// - data/ and vendor/: cache first. Those paths are versioned and served immutable,
//   so a cached copy is always correct.
// - Map tiles and fonts: stale-while-revalidate, capped so storage can't grow forever.
// - Library and Wikipedia APIs: never cached here; the panel caches records itself.
const VERSION = "2026-11-19";
const SHELL = `xarita-shell-${VERSION}`;
const DATA = "xarita-data-v2";
const TILES = "xarita-tiles-v1";
const MAX_TILES = 600;

// Everything the first screen needs, so a second visit works with no connection at all.
const PRECACHE = [
  "./",
  "index.html",
  "styles.css?v=11",
  "assets/logo-mark.svg",
  "vendor/maplibre-gl-5.6.0.js",
  "vendor/maplibre-gl-5.6.0.css",
  "data/v2/basemap.json",
  "data/v2/world_1400.json",
  "js/main.js",
  "js/constants.js",
  "js/util.js",
  "js/state.js",
  "js/timeline.js",
  "js/map.js",
  "js/regions.js",
  "js/panel.js",
  "js/overlay.js",
  "js/viewer.js",
  "js/search.js",
  "js/compare.js",
  "js/tours-ui.js",
  "js/hero.js",
  "js/quiz.js",
  "js/ui.js",
  "js/sources.js",
  "js/data/i18n.js",
  "js/data/tours.js",
  "js/data/hero.js",
  "js/lib/time.js",
  "js/lib/geo.js",
  "js/lib/text.js",
  "js/lib/catalog.js",
];

const TILE_HOSTS = ["tiles.openfreemap.org", "fonts.gstatic.com", "fonts.googleapis.com"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  const keep = new Set([SHELL, DATA, TILES]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    if (url.pathname.startsWith("/tiles/")) return event.respondWith(staleWhileRevalidate(req, TILES));
    if (url.pathname.startsWith("/data/") || url.pathname.startsWith("/vendor/")) return event.respondWith(cacheFirst(req, DATA));
    if (url.pathname.startsWith("/api/")) return;
    return event.respondWith(networkFirst(req));
  }
  if (TILE_HOSTS.includes(url.hostname)) event.respondWith(staleWhileRevalidate(req, TILES));
});

/** @param {Request} req */
async function networkFirst(req) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit =
      (await cache.match(req, { ignoreSearch: req.mode === "navigate" })) || (req.mode === "navigate" && (await cache.match("index.html")));
    return hit || Response.error();
  }
}

/** @param {Request} req @param {string} name */
async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

/** @param {Request} req @param {string} name */
async function staleWhileRevalidate(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  const fresh = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone()).then(() => trim(cache));
      return res;
    })
    .catch(() => hit || Response.error());
  return hit || fresh;
}

// Oldest-first trim once in a while, so a long session can't fill the disk.
let trimming = false;
/** @param {Cache} cache */
async function trim(cache) {
  if (trimming) return;
  trimming = true;
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_TILES))) await cache.delete(k);
  trimming = false;
}
