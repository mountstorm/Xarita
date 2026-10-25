// Map sources: Allmaps (georeferenced scans from many libraries, searched by
// area) and the Library of Congress catalogue (searched by place name).
// Every result is normalised to one item shape so the UI never cares where it came from.
window.Sources = (() => {
  "use strict";

  const ALLMAPS_API = "https://api.allmaps.org/maps";
  const LOC_API = "https://www.loc.gov/maps/";

  // Short badges for the libraries Allmaps aggregates.
  const BADGES = {
    "www.davidrumsey.com": "Rumsey",
    "iiif.nypl.org": "NYPL",
    "map-view.nls.uk": "NLS",
    "gallica.bnf.fr": "BnF",
    "iiif.universiteitleiden.nl": "Leiden",
    "iiif.bodleian.ox.ac.uk": "Bodleian",
    "stacks.stanford.edu": "Stanford",
    "iiif.digitalcommonwealth.org": "BPL",
    "catalog.archives.gov": "NARA",
    "iiif.durham.ac.uk": "Durham",
    "service.archief.nl": "NL Arch.",
    "digital.zlb.de": "ZLB",
    "cdm21033.contentdm.oclc.org": "VU",
    "iiif.onb.ac.at": "ÖNB",
    "images.uba.uva.nl": "UvA",
    "www.nb.no": "NB.no",
    "iiif.archive.org": "Archive",
    "tile.loc.gov": "LoC",
  };

  // ───────── helpers ─────────
  const stripHtml = (s) => String(s ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

  // IIIF v2 strings, v2 {@value} objects and v3 language maps all collapse to one string.
  function langStr(v, lang = "en") {
    if (v == null) return "";
    if (typeof v === "string") return v;
    if (Array.isArray(v)) return v.map((x) => langStr(x, lang)).filter(Boolean).join("; ");
    if (v["@value"]) return v["@value"];
    const pick = v[lang] || v.en || v.none || Object.values(v)[0];
    return Array.isArray(pick) ? pick.join("; ") : String(pick ?? "");
  }

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
        try { resolve(await fn()); } catch (e) { reject(e); } finally {
          q.active--;
          q.waiting.shift()?.();
        }
      };
      if (q.active < 2) run(); else q.waiting.push(run);
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
          if (r.status === 429 && attempt === 0) { await sleep(1500); continue; }
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
    let i = 0, done = 0;
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        try { await fn(items[k]); } catch { /* one bad record shouldn't sink the list */ }
        onProgress?.(++done, items.length);
      }
    }));
  }

  // ───────── metadata cache (survives reloads within the tab) ─────────
  // Catalogue records barely change, so they're kept across visits: 30 days for a
  // found record, 1 day for a failed lookup (the library may come back), and at
  // most 1,500 records so localStorage stays well under its quota.
  const META_KEY = "xarita.meta.v1";
  const META_TTL = 30 * 864e5, FAIL_TTL = 864e5, META_MAX = 1500;
  const loadJSON = (k) => { try { return JSON.parse(localStorage.getItem(k) || "{}"); } catch { return {}; } };
  const saveJSON = (k, v) => {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; }
  };
  let metaStore = loadJSON(META_KEY);
  const now = () => Date.now();
  const fresh = (rec) => rec && now() - rec.at < (rec.fail ? FAIL_TTL : META_TTL);
  let saveTimer;
  const persistMeta = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const ids = Object.keys(metaStore);
      if (ids.length > META_MAX) {
        ids.sort((a, b) => metaStore[a].at - metaStore[b].at).slice(0, ids.length - META_MAX).forEach((id) => delete metaStore[id]);
      }
      // On a full quota, drop the area cache (cheap to refetch) and try once more.
      if (!saveJSON(META_KEY, metaStore)) { localStorage.removeItem(AREA_KEY); saveJSON(META_KEY, metaStore); }
    }, 500);
  };
  const manifestCache = new Map();

  // Area results (which maps intersect a view) for 24 hours, last 25 views.
  const AREA_KEY = "xarita.am.v1";
  const AREA_TTL = 864e5, AREA_MAX = 25;
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

  // ───────── Allmaps ─────────
  // Libraries whose manifests aren't linked from the annotation but follow a known pattern.
  function guessManifest(imageId) {
    const u = new URL(imageId);
    if (u.host === "www.davidrumsey.com") return `https://www.davidrumsey.com/luna/servlet/iiif/m/${imageId.split("/iiif/")[1]}/manifest`;
    if (u.host === "stacks.stanford.edu") {
      const druid = decodeURIComponent(imageId.split("/iiif/")[1] || "").split("/")[0];
      if (druid) return `https://purl.stanford.edu/${druid}/iiif/manifest`;
    }
    return null;
  }
  function guessHomepage(imageId) {
    const u = new URL(imageId);
    if (u.host === "map-view.nls.uk") {
      const id = decodeURIComponent(imageId.split("/iiif/2/")[1] || "").split("/").pop();
      if (id) return `https://maps.nls.uk/view/${id}`;
    }
    return "";
  }

  function normAllmaps(m) {
    const r = m.resource;
    const iiif = r.id.replace(/\/$/, "");
    const host = new URL(iiif).host;
    const manifest = (r.partOf || [])
      .flatMap((c) => (c.type === "Manifest" ? [c] : c.partOf || []))
      .find((p) => p.type === "Manifest");
    const xs = m.gcps.map((g) => g.geo[0]);
    const ys = m.gcps.map((g) => g.geo[1]);
    const hash = m.id.split("/").pop();
    const label = langStr(manifest?.label);
    const v3 = r.type === "ImageService3";
    return {
      id: "am:" + hash,
      src: "allmaps",
      annotation: m.id,
      iiif,
      provider: langStr(r.provider?.[0]?.label) || host,
      badge: BADGES[host] || host.replace(/^(www|iiif|images?)\./, "").split(".")[0],
      bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
      manifestId: manifest?.id || guessManifest(iiif),
      title: /metadata/i.test(label) ? "" : label,
      date: "",
      by: "",
      url: guessHomepage(iiif),
      desc: "",
      tags: [],
      thumb: `${iiif}/full/!240,240/0/default.jpg`,
      full: `${iiif}/full/${v3 ? "max" : "full"}/0/default.jpg`,
      viewer: `https://viewer.allmaps.org/?url=${encodeURIComponent(m.id)}`,
    };
  }

  function parseManifest(j) {
    const label = stripHtml(langStr(j.label));
    const canvas = j.sequences?.[0]?.canvases?.[0] || j.items?.[0] || {};
    const md = [...(j.metadata || []), ...(canvas.metadata || [])]
      .map((e) => [stripHtml(langStr(e.label)).toLowerCase(), stripHtml(langStr(e.value))]);
    const find = (re) => md.find(([k]) => re.test(k))?.[1] || "";
    const dateStr = find(/^(date|dates|datum|year|jahr|année|issued|created|date of publication|publication date|pub(lication)? date)$/) || find(/date|datum|jahr|année|year/);
    const yearRe = /\b(1[0-9]\d\d|20[0-2]\d)\b/;
    const year = (dateStr.match(yearRe) || label.match(yearRe) || [])[1] || "";
    const title = find(/^(short title|title|titel|titre)$/) || label;
    const homepage = j.homepage?.[0]?.id
      || (typeof j.related === "string" ? j.related : j.related?.["@id"] || j.related?.[0]?.["@id"])
      || "";
    return {
      title: /metadata/i.test(title) ? "" : title,
      date: year,
      by: find(/author|creator|cartographer|maker|auteur|contributor|vervaardiger|urheber|engraver/),
      url: homepage,
      desc: stripHtml(langStr(j.summary || j.description) || find(/description|beschrijving|note|summary/)).slice(0, 600),
    };
  }

  // Fill in title/date/author from the library's IIIF manifest (cached).
  async function resolveMeta(item, signal) {
    if (!applyMeta(item).pending) return item;
    let failed = false;
    if (item.manifestId) {
      if (!manifestCache.has(item.manifestId)) {
        manifestCache.set(item.manifestId, fetchJSON(item.manifestId, { signal, timeout: 8000 }).then(parseManifest).catch((e) => {
          manifestCache.delete(item.manifestId);
          throw e;
        }));
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
    metaStore[item.id] = { at: now(), ...(failed && { fail: 1 }), title: item.title, date: item.date, by: item.by, url: item.url, desc: (item.desc || "").slice(0, 300) };
    persistMeta();
    return item;
  }

  // Approximate area of a lon/lat box in m², used to skip postage-stamp city plans when zoomed out.
  function bboxAreaM2([w, s, e, n]) {
    if (e <= w || n <= s) return 0;
    const midLat = ((s + n) / 2) * (Math.PI / 180);
    return (e - w) * 111320 * Math.cos(midLat) * (n - s) * 110540;
  }
  const intersect = (a, b) => [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];

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
    const done = pool(todo, 8, async (it) => { await resolveMeta(it, signal); onUpdate?.(it); });
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
      .slice(0, 60);
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

  // ───────── Library of Congress ─────────
  const titleCase = (s) => s.replace(/\b\p{L}/gu, (c) => c.toUpperCase());

  function normLoc(r) {
    const id = (String(r.id).match(/item\/([^/]+)/) || [])[1] || String(r.id);
    const imgs = (r.image_url || []).map((u) => u.split("#")[0]);
    const iiifUrl = imgs.find((u) => u.includes("/iiif/"));
    const by = (r.contributor || r.contributor_names || [])
      .map((c) => titleCase(c.replace(/\s+(creator|annotator|cartographer|publisher|engraver|editor)\.?$/i, "")).replace(/\b(Of|And|The|De)\b/g, (w) => w.toLowerCase()))
      .join("; ");
    return {
      id,
      src: "loc",
      provider: "Library of Congress",
      badge: "LoC",
      title: String(Array.isArray(r.title) ? r.title[0] : r.title || "").replace(/[\s.]+$/, ""),
      date: (r.date || r.dates?.[0] || "").toString().slice(0, 4),
      by,
      thumb: imgs[0] || "",
      full: imgs[imgs.length - 1] || "",
      iiif: iiifUrl ? iiifUrl.split("/full/")[0] : null,
      url: (r.url || r.id || "").replace(/^http:/, "https:"),
      desc: (Array.isArray(r.description) ? r.description.join(" ") : r.description || "").slice(0, 600),
      tags: (r.location || []).slice(0, 8),
    };
  }

  const pad4 = (y) => String(Math.max(1, Math.min(2030, y))).padStart(4, "0");

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
