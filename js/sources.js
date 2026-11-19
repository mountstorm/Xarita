import { bboxAreaM2, intersect, langStr, normAllmaps, normLoc, pad4, parseManifest } from "./lib/catalog.js";
// Map sources: Allmaps (georeferenced scans from many libraries, searched by
// area) and the Library of Congress catalogue (searched by place name).
// Every result is normalised to one item shape so the UI never cares where it came from.
export const Sources = (() => {
  const ALLMAPS_API = "https://api.allmaps.org/maps";
  const LOC_API = "https://www.loc.gov/maps/";

  // At most two requests in flight per library, so nobody's server (Rumsey's
  // especially) starts answering 429.
  const hostQueues = new Map();
  function perHost(url, fn) {
    const host = new URL(url).host;
    let q = hostQueues.get(host);
    if (!q) hostQueues.set(host, (q = { active: 0, waiting: [] }));
    return new Promise((resolve, reject) => {
      const run = async () => {
        q.active++;
        try {
          resolve(await fn());
        } catch (e) {
          reject(e);
        } finally {
          q.active--;
          q.waiting.shift()?.();
        }
      };
      if (q.active < 2) run();
      else q.waiting.push(run);
    });
  }

  async function fetchJSON(url, { signal, timeout = 10000, maxBytes = 3e6 } = {}) {
    return perHost(url, async () => {
      for (let attempt = 0; ; attempt++) {
        if (signal?.aborted) throw new DOMException("aborted", "AbortError");
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), timeout);
        const onAbort = () => ctl.abort();
        signal?.addEventListener("abort", onAbort);
        try {
          const r = await fetch(url, { signal: ctl.signal });
          if (r.status === 429 && attempt === 0) {
            await sleep(1500);
            continue;
          }
          if (!r.ok) throw new Error(`${r.status} ${url}`);
          const len = +r.headers.get("content-length");
          if (len && len > maxBytes) throw new Error("too large");
          return await r.json();
        } finally {
          clearTimeout(t);
          signal?.removeEventListener("abort", onAbort);
        }
      }
    });
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function pool(items, n, fn, onProgress) {
    let i = 0,
      done = 0;
    await Promise.all(
      Array.from({ length: Math.min(n, items.length) }, async () => {
        while (i < items.length) {
          const k = i++;
          try {
            await fn(items[k]);
          } catch {
            /* one bad record shouldn't sink the list */
          }
          onProgress?.(++done, items.length);
        }
      }),
    );
  }

  // ───────── metadata cache (survives reloads within the tab) ─────────
  // Catalogue records barely change, so they're kept across visits: 30 days for a
  // found record, 1 day for a failed lookup (the library may come back), and at
  // most 1,500 records so localStorage stays well under its quota.
  const META_KEY = "xarita.meta.v1";
  const META_TTL = 30 * 864e5,
    FAIL_TTL = 864e5,
    META_MAX = 1500;
  const loadJSON = (k) => {
    try {
      return JSON.parse(localStorage.getItem(k) || "{}");
    } catch {
      return {};
    }
  };
  const saveJSON = (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
      return true;
    } catch {
      return false;
    }
  };
  const metaStore = loadJSON(META_KEY);
  const now = () => Date.now();
  const fresh = (rec) => rec && now() - rec.at < (rec.fail ? FAIL_TTL : META_TTL);
  let saveTimer;
  const persistMeta = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const ids = Object.keys(metaStore);
      if (ids.length > META_MAX) {
        ids
          .sort((a, b) => metaStore[a].at - metaStore[b].at)
          .slice(0, ids.length - META_MAX)
          .forEach((id) => delete metaStore[id]);
      }
      // On a full quota, drop the area cache (cheap to refetch) and try once more.
      if (!saveJSON(META_KEY, metaStore)) {
        localStorage.removeItem(AREA_KEY);
        saveJSON(META_KEY, metaStore);
      }
    }, 500);
  };
  const manifestCache = new Map();

  // Area results (which maps intersect a view) for 24 hours, last 25 views.
  const AREA_KEY = "xarita.am.v1";
  const AREA_TTL = 864e5,
    AREA_MAX = 25;
  const META_FIELDS = ["title", "date", "by", "url", "desc"];
  function cachedArea(key) {
    const rec = loadJSON(AREA_KEY)[key];
    if (!rec || now() - rec.at > AREA_TTL) return null;
    return rec.items.map((it) => applyMeta({ ...it, pending: true }));
  }
  function storeArea(key, items) {
    const all = loadJSON(AREA_KEY);
    // Only the map-shape fields; metadata lives in the record cache.
    all[key] = { at: now(), items: items.map(({ pending, title, date, by, url, desc, ...rest }) => rest) };
    const keys = Object.keys(all).sort((a, b) => all[b].at - all[a].at);
    keys.slice(AREA_MAX).forEach((k) => delete all[k]);
    saveJSON(AREA_KEY, all);
  }
  // Fill an item from the record cache; returns it, still pending if there was no fresh record.
  function applyMeta(item) {
    const rec = metaStore[item.id];
    if (fresh(rec)) {
      for (const k of META_FIELDS) if (rec[k]) item[k] = rec[k];
      item.pending = false;
    }
    return item;
  }

  // Fill in title/date/author from the library's IIIF manifest (cached).
  async function resolveMeta(item, signal) {
    if (!applyMeta(item).pending) return item;
    let failed = false;
    if (item.manifestId) {
      if (!manifestCache.has(item.manifestId)) {
        manifestCache.set(
          item.manifestId,
          fetchJSON(item.manifestId, { signal, timeout: 8000 })
            .then(parseManifest)
            .catch((e) => {
              manifestCache.delete(item.manifestId);
              throw e;
            }),
        );
      }
      try {
        const meta = await manifestCache.get(item.manifestId);
        for (const k of ["title", "date", "by", "url", "desc"]) if (meta[k] && !item[k]) item[k] = meta[k];
        if (meta.title) item.title = meta.title;
      } catch {
        // An aborted request says nothing about the library; leave it uncached.
        if (signal?.aborted) return item;
        failed = true;
      }
    }
    item.pending = false;
    metaStore[item.id] = {
      at: now(),
      ...(failed && { fail: 1 }),
      title: item.title,
      date: item.date,
      by: item.by,
      url: item.url,
      desc: (item.desc || "").slice(0, 300),
    };
    persistMeta();
    return item;
  }

  // Returns the cards as soon as the area query answers (or straight from the
  // area cache), with cached records already applied. `done` settles once the
  // remaining records are read; onUpdate fires as each one arrives.
  async function searchAllmaps(bbox, { key, signal, onUpdate } = {}) {
    let items = key ? cachedArea(key) : null;
    if (!items) {
      items = await fetchArea(bbox, signal);
      if (key) storeArea(key, items);
    }
    const todo = items.filter((it) => it.pending);
    const done = pool(todo, 8, async (it) => {
      await resolveMeta(it, signal);
      onUpdate?.(it);
    });
    return { items, done };
  }

  async function fetchArea(bbox, signal) {
    const [w, s, e, n] = bbox.map((v, i) => (i % 2 ? Math.max(-85, Math.min(85, v)) : Math.max(-180, Math.min(180, v))));
    // Keep maps roughly the scale of the view: no postage-stamp city plans when
    // zoomed out, and no world maps when zoomed into one town. The API's own
    // area field is unreliable for large maps, so scale is judged from the
    // control points' footprint, and a map must substantially overlap the view
    // (which also drops the odd map with a stray control point an ocean away).
    const view = [w, s, e, n];
    const viewArea = bboxAreaM2(view);
    // Allmaps reads the box latitude-first: minLat,minLon,maxLat,maxLon.
    const box = [s, w, n, e].map((v) => v.toFixed(3)).join(",");
    const url = `${ALLMAPS_API}?intersects=${box}&limit=120&minArea=${Math.round(viewArea / 2000)}`;
    const list = await fetchJSON(url, { signal, timeout: 25000, maxBytes: 2e7 });
    const items = (Array.isArray(list) ? list : [])
      .filter((m) => m.gcps?.length >= 3 && m.resource?.id)
      .map(normAllmaps)
      .filter((it) => {
        const a = bboxAreaM2(it.bbox);
        const overlap = bboxAreaM2(intersect(it.bbox, view));
        return a <= viewArea * 60 && overlap >= Math.min(a, viewArea) * 0.25;
      })
      // Best scale match first, and only as many records as a panel can usefully show.
      .sort((a, b) => Math.abs(Math.log(bboxAreaM2(a.bbox) / viewArea)) - Math.abs(Math.log(bboxAreaM2(b.bbox) / viewArea)))
      .slice(0, 40);
    return items.map((it) => applyMeta(Object.assign(it, { pending: true })));
  }

  async function allmapsItem(hash) {
    const m = await fetchJSON(`https://annotations.allmaps.org/maps/${hash}`, { timeout: 10000 });
    // The annotation endpoint returns IIIF annotation JSON; adapt it to the API map shape.
    const src = m.target?.source || {};
    const gcps = (m.body?.features || []).map((f) => ({ geo: f.geometry.coordinates }));
    const item = normAllmaps({
      id: m.id,
      gcps,
      resource: { id: src.id, type: src.type, partOf: src.partOf, provider: src.provider },
    });
    return resolveMeta(item);
  }

  async function searchLoc({ q, from, to, signal }) {
    const p = new URLSearchParams({ fo: "json", c: "30", q });
    if (from != null) p.set("dates", `${pad4(from)}/${pad4(to)}`);
    let j;
    try {
      j = await fetchJSON(`${LOC_API}?${p}`, { signal, timeout: 15000, maxBytes: 2e7 });
    } catch (e) {
      if (signal?.aborted) throw e;
      // The LoC API is flaky under load; one smaller retry.
      p.set("c", "12");
      j = await fetchJSON(`${LOC_API}?${p}`, { signal, timeout: 15000, maxBytes: 2e7 });
    }
    return {
      items: (j.results || []).filter((x) => x.image_url?.length).map(normLoc),
      total: j.pagination?.of ?? 0,
    };
  }

  async function locItem(id) {
    const j = await fetchJSON(`https://www.loc.gov/item/${encodeURIComponent(id)}/?fo=json`, { timeout: 15000, maxBytes: 2e7 });
    const it = j.item || {};
    return normLoc({
      ...it,
      id: `https://www.loc.gov/item/${id}/`,
      url: `https://www.loc.gov/item/${id}/`,
      image_url: j.image_url || it.image_url || [],
      contributor: it.contributor_names || it.contributors || [],
      location: it.location || j.location || [],
    });
  }

  return { searchAllmaps, searchLoc, allmapsItem, locItem, langStr };
})();
