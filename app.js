(() => {
  "use strict";

  // ───────── Constants ─────────
  const BASEMAP = "https://tiles.openfreemap.org/styles/positron";
  const OHM_TILES = "https://vtiles.openhistoricalmap.org/maps/ohm/{z}/{x}/{y}.pbf";
  const SNAPSHOT_CDN = "https://cdn.jsdelivr.net/gh/aourednik/historical-basemaps@master/geojson/";
  const ALLMAPS_MAPLIBRE = "https://cdn.jsdelivr.net/npm/@allmaps/maplibre@1.0.0-beta.43/+esm";
  const NOMINATIM = "https://nominatim.openstreetmap.org";
  const OSD_IMAGES = "https://cdnjs.cloudflare.com/ajax/libs/openseadragon/4.1.0/images/";
  const LANGS = ["en", "uz", "ru"];

  // Years with a colour-tint snapshot in historical-basemaps (negative = BC).
  const SNAPSHOTS = [
    -3000, -2000, -1500, -1000, -700, -500, -400, -323, -300, -200, -100, -1,
    100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1279, 1300, 1400,
    1492, 1500, 1530, 1600, 1650, 1700, 1715, 1783, 1800, 1815, 1878, 1880, 1900,
    1914, 1920, 1930, 1938, 1945, 1960, 1994, 2000, 2010,
  ];
  const MIN_YEAR = -3000;
  const MAX_YEAR = 2010;
  // OpenHistoricalMap is thin before the early modern era, so the snapshot's own
  // labels and outlines come back on to keep ancient maps readable.
  const SNAPSHOT_LINES_BEFORE = 1500;

  // Piecewise timeline scale: deep time is squeezed, the print era gets room.
  const SCALE = [[-3000, 0], [0, 0.14], [1000, 0.34], [1500, 0.55], [2010, 1]];

  const PALETTE = {
    light: ["#f2d7a6", "#e9b8a0", "#cfd9a8", "#b9d3c4", "#c9c1de", "#f0c7c4", "#e6d29a", "#bcd0e3", "#dcc1a5", "#d6e2b5", "#eac7dd", "#c4dcd0"],
    dark: ["#7a6440", "#7a4d3c", "#5e6b3f", "#46655a", "#5a5278", "#7a4e4c", "#6f6438", "#46607a", "#6b5640", "#5f6f45", "#6d4c62", "#4b6a5f"],
  };
  const BASE_TINT = {
    light: { land: "#f3ede1", water: "#cfe0e4", waterway: "#b4cfd6", ice: "#fbfaf6", text: "#6e5a45", halo: "#f6f2ea", waterText: "#5f8794", ink: "#4a3421", border: "#7a2e1c", unnamed: "#ddd3c2" },
    dark: { land: "#211c16", water: "#18272c", waterway: "#22383f", ice: "#2c2822", text: "#b8a68e", halo: "#1d1914", waterText: "#6d97a3", ink: "#e2cfb1", border: "#e08a6a", unnamed: "#3a3229" },
  };

  // ───────── Tiny helpers ─────────
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const hashStr = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
  const isPhone = () => matchMedia("(max-width: 767px)").matches;

  const store = {
    get(k, d) { try { const v = localStorage.getItem("xarita." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("xarita." + k, JSON.stringify(v)); } catch { /* private mode */ } },
  };

  // ───────── State ─────────
  const params = new URLSearchParams(location.hash.slice(1));
  const browserLang = (navigator.language || "en").slice(0, 2);
  const state = {
    mode: "landing",
    lang: LANGS.find((l) => l === params.get("lang")) || store.get("lang", LANGS.includes(browserLang) ? browserLang : "en"),
    year: 1862,
    compareYear: 1914,
    compare: false,
    borders: true,
    tint: true,
    globe: false,
    panelOpen: true,
    sheet: "half", // phone bottom sheet: peek | half | full
    tab: "all",
    windowYrs: 25,
    source: "all",
    sort: "near",
    query: null, // manual search term; null = follow the map
    theme: store.get("theme", matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
    tour: null,
    tourStop: 0,
    playing: false,
    openMap: null,
  };
  let favs = store.get("favs", {});
  let notes = store.get("notes", {});
  document.documentElement.dataset.theme = state.theme;

  // ───────── i18n ─────────
  function t(key, vars) {
    const dict = window.I18N[state.lang] || window.I18N.en;
    let s = dict[key] ?? window.I18N.en[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
    return s;
  }
  const L = (obj) => (obj && typeof obj === "object" ? obj[state.lang] || obj.en : obj);
  const fmtYear = (y) => (y < 0 ? t("year.bc", { y: -y }) : String(y));

  function parseYear(str) {
    const m = String(str).trim().match(/^(-?\d{1,4})\s*(bce?|b\.c\.?|до н\.? ?э\.?|mil\.? ?avv\.?)?$/i)
      || String(str).trim().match(/^(?:mil\.? ?avv\.?)\s*(\d{1,4})$/i);
    if (!m) return null;
    let y = parseInt(m[1], 10);
    if (m[2] || /avv/i.test(str)) y = -Math.abs(y);
    return y === 0 ? 1 : y;
  }

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (el.hidden = true), 2600);
  }
  function busy(msg) {
    const el = $("#busy");
    el.hidden = !msg;
    el.textContent = msg || "";
  }

  // ───────── Timeline maths ─────────
  function yearToFrac(y) {
    for (let i = 1; i < SCALE.length; i++) {
      const [y0, f0] = SCALE[i - 1], [y1, f1] = SCALE[i];
      if (y <= y1) return f0 + ((y - y0) / (y1 - y0)) * (f1 - f0);
    }
    return 1;
  }
  function fracToYear(f) {
    for (let i = 1; i < SCALE.length; i++) {
      const [y0, f0] = SCALE[i - 1], [y1, f1] = SCALE[i];
      if (f <= f1) {
        const y = Math.round(y0 + ((f - f0) / (f1 - f0)) * (y1 - y0));
        return y === 0 ? 1 : y;
      }
    }
    return MAX_YEAR;
  }
  const snapshotFor = (y) => SNAPSHOTS.filter((s) => s <= y).pop() ?? SNAPSHOTS[0];
  const snapFile = (s) => (s < 0 ? `world_bc${-s}` : `world_${s}`);

  function buildTicks() {
    const out = [];
    const KEY = [-3000, 1, 1000, 1500, 2000]; // the only labels kept on a narrow track
    const tick = (y, cls = "") => out.push(`<i class="${cls}" style="left:${yearToFrac(y) * 100}%"></i>`);
    const label = (y, txt, opt) => out.push(`<span class="${opt ? "opt" : ""} ${KEY.includes(y) ? "key" : ""} ${y < 0 ? "deep" : ""}" style="left:${yearToFrac(y) * 100}%">${txt}</span>`);
    for (let y = -3000; y < 0; y += 500) tick(y, y % 1000 === 0 ? "major" : "");
    for (let y = 100; y < 1000; y += 100) tick(y, y % 500 === 0 ? "major" : "");
    for (let y = 1000; y < 1500; y += 25) tick(y, y % 100 === 0 ? "major" : "");
    for (let y = 1500; y <= 2010; y += 10) tick(y, y % 50 === 0 ? "major" : "");
    tick(1, "era");
    label(-3000, fmtYear(-3000));
    if (state.lang === "en") label(-1500, fmtYear(-1500), true); // too long to fit in uz/ru
    label(1, t("year.ad1"));
    label(500, "500", true); label(1000, "1000");
    for (let y = 1100; y < 1500; y += 100) label(y, y, y % 200 === 100);
    for (let y = 1500; y <= 2000; y += 50) label(y, y, y % 100 === 50);
    $("#tl-ticks").innerHTML = out.join("");
    $("#tl-snaps").innerHTML = SNAPSHOTS.map((s) => `<b style="left:${yearToFrac(s) * 100}%"></b>`).join("");
    fitTicks();
  }

  // Label density follows the track's real width (it shrinks when the panel is open).
  function fitTicks() {
    const w = $("#tl-track").clientWidth;
    const tl = $("#timeline");
    tl.classList.toggle("tl-narrow", w < 600);
    tl.classList.toggle("tl-mid", w >= 600 && w < 1000);
  }

  // ───────── Map setup ─────────
  const initPos = (params.get("pos") || "").split("/").map(Number);
  const hasPos = initPos.length === 3 && initPos.every(Number.isFinite);

  const map = new maplibregl.Map({
    container: "map",
    style: BASEMAP,
    center: hasPos ? [initPos[2], initPos[1]] : [38, 44],
    zoom: hasPos ? initPos[0] : 2.9,
    maxZoom: 14,
    maxPitch: 0, // the Allmaps warped layer doesn't support pitch
    attributionControl: false,
  });
  map.addControl(new maplibregl.AttributionControl({
    compact: true,
    customAttribution: '<a href="https://www.openhistoricalmap.org/copyright" target="_blank">© OpenHistoricalMap</a> · <a href="https://github.com/aourednik/historical-basemaps" target="_blank">historical-basemaps</a> · <a href="https://allmaps.org" target="_blank">Allmaps</a> · <a href="https://www.loc.gov/maps/" target="_blank">LoC</a>',
  }), "bottom-right");
  let cmpMap = null;
  let mapReady = false;

  const EMPTY = { type: "FeatureCollection", features: [] };
  const firstSymbolId = (m) => m.getStyle().layers.find((l) => l.type === "symbol")?.id;

  function tintBasemap(m) {
    const c = BASE_TINT[state.theme];
    for (const l of m.getStyle().layers) {
      if (/^(hist|ohm|fp|warped)/.test(l.id)) continue;
      if (/^(highway|railway|tunnel|aeroway|road|building|park|landuse|airport|boundary|label_country|label_state)/.test(l.id)) {
        m.setLayoutProperty(l.id, "visibility", "none");
      }
    }
    m.setPaintProperty("background", "background-color", c.land);
    m.setPaintProperty("water", "fill-color", c.water);
    m.setPaintProperty("waterway", "line-color", c.waterway);
    for (const id of ["landcover_ice_shelf", "landcover_glacier"]) m.setPaintProperty(id, "fill-color", c.ice);
    m.setPaintProperty("landcover_wood", "fill-opacity", 0);
    const local = state.lang === "en"
      ? ["coalesce", ["get", "name:en"], ["get", "name:latin"], ["get", "name"]]
      : ["coalesce", ["get", `name:${state.lang}`], ["get", "name:en"], ["get", "name:latin"], ["get", "name"]];
    for (const id of ["label_city", "label_city_capital", "label_town", "label_village", "label_other", "water_name_point_label", "water_name_line_label"]) {
      m.setLayoutProperty(id, "text-field", local);
    }
    for (const id of ["label_city", "label_city_capital", "label_town", "label_village", "label_other"]) {
      m.setPaintProperty(id, "text-color", c.text);
      m.setPaintProperty(id, "text-halo-color", c.halo);
    }
    for (const id of ["water_name_point_label", "water_name_line_label", "waterway_line_label"]) {
      m.setPaintProperty(id, "text-color", c.waterText);
      m.setPaintProperty(id, "text-halo-color", c.water);
    }
    if (m.getLayer("hist-fill")) styleHistory(m);
  }

  function fillColorExpr() {
    const match = ["match", ["get", "_ci"]];
    PALETTE[state.theme].forEach((c, i) => match.push(i, c));
    match.push(BASE_TINT[state.theme].unnamed);
    return match;
  }

  function ohmNameExpr() {
    return ["coalesce", ["get", `name_${state.lang}`], ["get", "name_en"], ["get", "name"]];
  }
  // "Name\n1861–1865": the range comes from OHM's decimal dates, which also handles BC.
  function ohmLabelExpr() {
    const yr = (k) => ["case", ["has", k], ["to-string", ["floor", ["get", k]]], ""];
    return ["format", ohmNameExpr(), {}, "\n", {}, ["concat", yr("start_decdate"), "–", yr("end_decdate")], { "font-scale": 0.78 }];
  }

  function styleHistory(m) {
    const c = BASE_TINT[state.theme];
    m.setPaintProperty("hist-fill", "fill-color", fillColorExpr());
    m.setPaintProperty("hist-line", "line-color", ["case", ["boolean", ["feature-state", "sel"], false], "#b3200f", c.ink]);
    m.setPaintProperty("hist-label", "text-color", c.ink);
    m.setPaintProperty("hist-label", "text-halo-color", c.halo);
    for (const id of ["ohm-adm2", "ohm-adm4"]) m.setPaintProperty(id, "line-color", c.border);
    for (const id of ["ohm-label", "ohm-label-4"]) {
      m.setPaintProperty(id, "text-color", c.ink);
      m.setPaintProperty(id, "text-halo-color", c.halo);
      m.setLayoutProperty(id, "text-field", id === "ohm-label" ? ohmLabelExpr() : ohmNameExpr());
    }
    m.setPaintProperty("fp-line", "line-color", state.theme === "dark" ? "#f0a25c" : "#b3200f");
  }

  function addHistoryLayers(m) {
    const before = firstSymbolId(m);
    const sel = ["boolean", ["feature-state", "sel"], false];
    const hov = ["boolean", ["feature-state", "hover"], false];

    // Soft colour tint from dated snapshots
    m.addSource("hist", { type: "geojson", data: EMPTY, generateId: true });
    m.addSource("hist-labels", { type: "geojson", data: EMPTY });
    m.addLayer({
      id: "hist-fill", type: "fill", source: "hist",
      paint: { "fill-color": fillColorExpr(), "fill-opacity": ["case", sel, 0.75, hov, 0.62, ["get", "_op"]] },
    }, before);
    m.addLayer({
      id: "hist-line", type: "line", source: "hist",
      paint: { "line-color": "#4a3421", "line-opacity": ["case", sel, 1, 0.45], "line-width": ["case", sel, 2.5, 0.8] },
    }, before);

    // Footprint of the hovered georeferenced map
    m.addSource("fp", { type: "geojson", data: EMPTY });
    m.addLayer({ id: "fp-fill", type: "fill", source: "fp", paint: { "fill-color": "#b3200f", "fill-opacity": 0.08 } });
    m.addLayer({ id: "fp-line", type: "line", source: "fp", paint: { "line-color": "#b3200f", "line-width": 2, "line-dasharray": [2, 1.5] } });

    // Year-accurate borders from OpenHistoricalMap
    m.addSource("ohm", { type: "vector", tiles: [OHM_TILES], maxzoom: 14, attribution: "" });
    const adm = (lv) => ["all", ["==", ["get", "type"], "administrative"], lv];
    m.addLayer({
      id: "ohm-adm4", type: "line", source: "ohm", "source-layer": "land_ohm_lines", minzoom: 3.5,
      filter: adm(["==", ["get", "admin_level"], 4]),
      paint: { "line-color": "#7a2e1c", "line-opacity": 0.55, "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.5, 8, 1.2], "line-dasharray": [3, 2] },
    });
    m.addLayer({
      id: "ohm-adm2", type: "line", source: "ohm", "source-layer": "land_ohm_lines",
      filter: adm(["in", ["get", "admin_level"], ["literal", [1, 2]]]),
      paint: { "line-color": "#7a2e1c", "line-opacity": 0.85, "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.7, 6, 2] },
    });
    m.addLayer({
      id: "hist-label", type: "symbol", source: "hist-labels",
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Italic"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 1, ["case", [">", ["get", "area"], 150], 12, 9.5], 6, ["case", [">", ["get", "area"], 2], 16, 12]],
        "text-max-width": 7,
        "symbol-sort-key": ["-", 0, ["get", "area"]],
        "text-padding": 4,
      },
      paint: { "text-color": "#4a3421", "text-halo-color": "#f6f2ea", "text-halo-width": 1.6, "text-opacity": 0.85 },
    });
    m.addLayer({
      id: "ohm-label-4", type: "symbol", source: "ohm", "source-layer": "land_ohm_centroids", minzoom: 5,
      filter: adm(["==", ["get", "admin_level"], 4]),
      layout: { "text-field": ohmNameExpr(), "text-font": ["Noto Sans Italic"], "text-size": 11.5, "text-max-width": 8, "symbol-sort-key": ["-", 0, ["coalesce", ["get", "area"], 0]] },
      paint: { "text-color": "#4a3421", "text-halo-color": "#f6f2ea", "text-halo-width": 1.4 },
    });
    m.addLayer({
      id: "ohm-label", type: "symbol", source: "ohm", "source-layer": "land_ohm_centroids",
      filter: adm(["==", ["get", "admin_level"], 2]),
      layout: {
        "text-field": ohmLabelExpr(),
        "text-font": ["Noto Sans Italic"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 1, 11, 6, 16],
        "text-max-width": 8,
        "text-padding": 6,
        "symbol-sort-key": ["-", 0, ["coalesce", ["get", "area"], 0]],
      },
      paint: { "text-color": "#4a3421", "text-halo-color": "#f6f2ea", "text-halo-width": 1.8 },
    });
    m._baseFilters = {
      "ohm-adm4": adm(["==", ["get", "admin_level"], 4]),
      "ohm-adm2": adm(["in", ["get", "admin_level"], ["literal", [1, 2]]]),
      "ohm-label-4": adm(["==", ["get", "admin_level"], 4]),
      "ohm-label": adm(["==", ["get", "admin_level"], 2]),
    };
    styleHistory(m);
  }

  // Only features alive in the chosen year: start ≤ year < end (OHM decimal dates).
  function applyYear(m, year) {
    if (!m?._baseFilters) return;
    const d = year + 0.5;
    const alive = ["all",
      ["any", ["!", ["has", "start_decdate"]], ["<=", ["get", "start_decdate"], d]],
      ["any", ["!", ["has", "end_decdate"]], [">", ["get", "end_decdate"], d]]];
    for (const [id, base] of Object.entries(m._baseFilters)) m.setFilter(id, ["all", base, alive]);
    setTint(m, year);
    updateMix(m, year);
  }

  // Which layers are visible, given the toggles and how well OHM covers the era.
  function updateMix(m, year = state.year) {
    if (!m?.getLayer("hist-fill")) return;
    const vis = (id, on) => m.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    const ancient = year < SNAPSHOT_LINES_BEFORE;
    vis("hist-fill", state.tint);
    vis("hist-line", state.borders && ancient);
    vis("hist-label", state.borders && ancient);
    for (const id of ["ohm-adm2", "ohm-adm4", "ohm-label", "ohm-label-4"]) vis(id, state.borders);
  }

  // ───────── Colour-tint snapshots ─────────
  const geoCache = new Map();

  function ringArea(r) {
    let a = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
    return Math.abs(a / 2);
  }
  function pointInRing([x, y], r) {
    let inside = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i], [xj, yj] = r[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  // A point that's actually inside the shape: centroid if it works, else the
  // middle of the widest horizontal run through it (handles crescents).
  function labelPoint(r) {
    let cx = 0, cy = 0, a = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const f = r[j][0] * r[i][1] - r[i][0] * r[j][1];
      cx += (r[j][0] + r[i][0]) * f; cy += (r[j][1] + r[i][1]) * f; a += f;
    }
    const c = a ? [cx / (3 * a), cy / (3 * a)] : r[0];
    if (pointInRing(c, r)) return c;
    const y = c[1], xs = [];
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [x1, y1] = r[j], [x2, y2] = r[i];
      if ((y1 > y) !== (y2 > y)) xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
    }
    xs.sort((p, q) => p - q);
    let best = r[0], w = -1;
    for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > w) { w = xs[i + 1] - xs[i]; best = [(xs[i] + xs[i + 1]) / 2, y]; }
    return best;
  }

  function prepGeo(gj) {
    const labels = [];
    for (const f of gj.features) {
      const p = f.properties || (f.properties = {});
      const name = p.NAME || null;
      p._ci = name ? hashStr(name) % PALETTE.light.length : -1;
      p._op = name ? 0.42 : 0.2;
      if (!name || !f.geometry) continue;
      const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [];
      let big = null, bigA = 0, total = 0;
      for (const poly of polys) { const a = ringArea(poly[0]); total += a; if (a > bigA) { bigA = a; big = poly[0]; } }
      if (big) labels.push({ type: "Feature", properties: { name, area: total }, geometry: { type: "Point", coordinates: labelPoint(big) } });
    }
    return { polys: gj, labels: { type: "FeatureCollection", features: labels } };
  }

  function loadSnapshot(s) {
    if (!geoCache.has(s)) {
      geoCache.set(s, fetch(SNAPSHOT_CDN + snapFile(s) + ".geojson")
        .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(prepGeo)
        .catch((e) => { geoCache.delete(s); throw e; }));
    }
    return geoCache.get(s);
  }

  function setTint(m, year) {
    if (!m?.getSource("hist")) return;
    const s = snapshotFor(year);
    if (m._snap === s) return;
    m._snap = s;
    if (m === map) { updatePill(); $("#borders-loading").hidden = false; }
    loadSnapshot(s).then((d) => {
      if (m._snap !== s) return;
      if (m === map) clearSelection();
      m._snapData = d.polys;
      m.getSource("hist").setData(d.polys);
      m.getSource("hist-labels").setData(d.labels);
      if (m === map) $("#borders-loading").hidden = true;
      const i = SNAPSHOTS.indexOf(s);
      [SNAPSHOTS[i - 1], SNAPSHOTS[i + 1]].forEach((n) => n != null && loadSnapshot(n).catch(() => {}));
    }).catch(() => {
      if (m === map) { $("#borders-loading").hidden = true; toast(t("toast.bordersFailed", { y: fmtYear(s) })); }
      m._snap = null;
    });
  }

  function updatePill() {
    $("#pill-text").innerHTML = `${esc(t("pill.borders", { year: fmtYear(state.year) }))} <span class="muted">· ${esc(t("pill.tint", { snap: fmtYear(map._snap ?? snapshotFor(state.year)) }))}</span>`;
  }

  function setToggle(kind, on) {
    state[kind] = on;
    $(`#${kind === "borders" ? "borders" : "tint"}-btn`).classList.toggle("on", on);
    for (const m of [map, cmpMap]) updateMix(m, m === cmpMap ? state.compareYear : state.year);
  }

  // ───────── Region cards (OHM entity or tint snapshot) ─────────
  let selectedId = null;
  let hoverId = null;
  let regionToken = 0;
  const wikiCache = new Map();
  const tip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: "hover-tip", offset: 12 });

  function clearSelection() {
    if (selectedId != null) map.setFeatureState({ source: "hist", id: selectedId }, { sel: false });
    if (hoverId != null) map.setFeatureState({ source: "hist", id: hoverId }, { hover: false });
    selectedId = hoverId = null;
  }

  async function wikiFetchSummary(lang, title) {
    const r = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`);
    if (!r.ok) return null;
    const j = await r.json();
    return j.type === "disambiguation" ? null : j;
  }

  // Summary in the UI language when one exists, else English.
  function wikiSummary(nameEn, nameLocal) {
    const key = `${state.lang}|${nameEn}|${nameLocal || ""}`;
    if (wikiCache.has(key)) return wikiCache.get(key);
    const lang = state.lang;
    const p = (async () => {
      if (lang !== "en" && nameLocal) {
        const local = await wikiFetchSummary(lang, nameLocal);
        if (local) return local;
      }
      let en = await wikiFetchSummary("en", nameEn);
      if (!en) {
        const r = await fetch("https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=1&srsearch=" + encodeURIComponent(nameEn + " history"));
        const title = (await r.json()).query?.search?.[0]?.title;
        en = title ? await wikiFetchSummary("en", title) : null;
      }
      if (!en || lang === "en") return en;
      // Follow the interlanguage link to the Uzbek / Russian article.
      const r = await fetch(`https://en.wikipedia.org/w/api.php?action=query&prop=langlinks&format=json&origin=*&lllang=${lang}&titles=${encodeURIComponent(en.title)}`);
      const pages = Object.values((await r.json()).query?.pages || {});
      const local = pages[0]?.langlinks?.[0]?.["*"];
      return (local && (await wikiFetchSummary(lang, local))) || en;
    })().catch(() => null);
    wikiCache.set(key, p);
    return p;
  }

  function fmtDate(d) {
    if (!d) return t("region.now");
    const m = String(d).match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/);
    if (!m) return String(d).replace(/^-0*(\d+).*/, (_, y) => fmtYear(-y));
    if (!m[2]) return m[1];
    const date = new Date(Date.UTC(+m[1], +m[2] - 1, +(m[3] || 1)));
    const locale = { en: "en-GB", uz: "uz-Latn-UZ", ru: "ru-RU" }[state.lang];
    return new Intl.DateTimeFormat(locale, m[3] ? { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" } : { year: "numeric", month: "long", timeZone: "UTC" }).format(date);
  }

  async function showRegion({ name, nameEn, nameLocal, meta, swatch }) {
    const card = $("#region-card");
    card.hidden = false;
    card.dataset.name = nameEn || name;
    $("#region-name").textContent = name;
    $("#region-meta").textContent = meta;
    $("#region-swatch").style.background = swatch || "transparent";
    $("#region-swatch").hidden = !swatch;
    const body = $("#region-body");
    body.innerHTML = '<span class="skeleton"></span><span class="skeleton" style="width:80%"></span><span class="skeleton" style="width:60%"></span>';
    const token = ++regionToken;
    const s = await wikiSummary(nameEn || name, nameLocal);
    if (token !== regionToken) return;
    if (!s) { body.innerHTML = `<p>${esc(t("region.noWiki"))}</p>`; return; }
    // Snapshot names are English only; the localized article title is a better heading.
    if (state.lang !== "en" && s.lang === state.lang && !nameLocal) $("#region-name").textContent = s.title;
    const extract = s.extract || "";
    body.innerHTML = `${s.thumbnail ? `<img src="${esc(s.thumbnail.source)}" alt="">` : ""}
      <p>${esc(extract.slice(0, 420))}${extract.length > 420 ? "…" : ""}</p>
      <a href="${esc(s.content_urls?.desktop?.page)}" target="_blank" rel="noopener">${esc(t("region.readWiki"))}</a>`;
  }

  function selectOhm(f) {
    const p = f.properties;
    if (selectedId != null) map.setFeatureState({ source: "hist", id: selectedId }, { sel: false });
    selectedId = null;
    const pt = f.geometry.coordinates;
    state.region = {
      name: p[`name_${state.lang}`] || p.name_en || p.name,
      nameEn: p.name_en || p.name,
      nameLocal: p[`name_${state.lang}`],
      start: p.start_decdate != null ? Math.floor(p.start_decdate) : null,
      end: p.end_decdate != null ? Math.floor(p.end_decdate) : null,
      tint: tintAt(pt),
      point: pt,
    };
    showRegion({
      name: p[`name_${state.lang}`] || p.name_en || p.name,
      nameEn: p.name_en || p.name,
      nameLocal: p[`name_${state.lang}`],
      meta: t("region.exact", { from: fmtDate(p.start_date), to: fmtDate(p.end_date) }) + " · OpenHistoricalMap",
    });
  }

  function selectTint(f, lngLat) {
    const p = f.properties;
    if (!p.NAME) return;
    // Rendered features are tile-clipped; the quiz needs the full original shape.
    const full = tintAt([lngLat.lng, lngLat.lat]) || (map._snapData?.features || []).find((x) => x.properties.NAME === p.NAME);
    state.region = { name: p.NAME, nameEn: p.NAME, start: null, end: null, tint: full, point: [lngLat.lng, lngLat.lat] };
    if (selectedId != null) map.setFeatureState({ source: "hist", id: selectedId }, { sel: false });
    selectedId = f.id;
    map.setFeatureState({ source: "hist", id: f.id }, { sel: true });
    const partOf = p.SUBJECTO && p.SUBJECTO !== p.NAME ? ` · ${t("region.partOf", { name: p.SUBJECTO })}` : "";
    showRegion({
      name: p.NAME,
      nameEn: p.NAME,
      meta: t("region.tint", { y: fmtYear(map._snap) }) + partOf,
      swatch: p._ci >= 0 ? PALETTE[state.theme][p._ci] : BASE_TINT[state.theme].unnamed,
    });
  }

  function wireRegionEvents() {
    map.on("mousemove", (e) => {
      if (state.mode === "landing" || quiz.clickTarget) { tip.remove(); return; }
      const pad = 8;
      const box = [[e.point.x - pad, e.point.y - pad], [e.point.x + pad, e.point.y + pad]];
      const label = state.borders && map.queryRenderedFeatures(box, { layers: ["ohm-label", "ohm-label-4"] })[0];
      const fill = !label && state.tint && map.queryRenderedFeatures(e.point, { layers: ["hist-fill"] })[0];
      const newHover = fill ? fill.id : null;
      if (hoverId !== newHover) {
        if (hoverId != null) map.setFeatureState({ source: "hist", id: hoverId }, { hover: false });
        hoverId = newHover;
        if (hoverId != null) map.setFeatureState({ source: "hist", id: hoverId }, { hover: true });
      }
      const name = label ? (label.properties[`name_${state.lang}`] || label.properties.name_en || label.properties.name) : fill?.properties?.NAME;
      map.getCanvas().style.cursor = name ? "pointer" : "";
      if (name && matchMedia("(hover: hover)").matches) tip.setLngLat(e.lngLat).setText(name).addTo(map);
      else tip.remove();
    });
    map.on("mouseout", () => tip.remove());
    map.on("click", (e) => {
      if (state.mode === "landing") return;
      if (quiz.clickTarget) return quizMapClick(e);
      const pad = 12;
      const box = [[e.point.x - pad, e.point.y - pad], [e.point.x + pad, e.point.y + pad]];
      const label = state.borders && map.queryRenderedFeatures(box, { layers: ["ohm-label", "ohm-label-4"] })[0];
      if (label) return selectOhm(label);
      const fill = state.tint && map.queryRenderedFeatures(e.point, { layers: ["hist-fill"] })[0];
      if (fill) selectTint(fill, e.lngLat);
    });
  }

  // ───────── Snapshot geometry helpers (used by the quiz) ─────────
  const outerRings = (f) => !f?.geometry ? []
    : f.geometry.type === "Polygon" ? [f.geometry.coordinates[0]]
    : f.geometry.type === "MultiPolygon" ? f.geometry.coordinates.map((p) => p[0]) : [];

  function tintAt(pt) {
    return (map._snapData?.features || []).find((f) => f.properties.NAME && outerRings(f).some((r) => pointInRing(pt, r))) || null;
  }

  function bboxOf(f) {
    let w = 180, s = 90, e = -180, n = -90;
    for (const r of outerRings(f)) for (const [x, y] of r) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; }
    return [w, s, e, n];
  }

  function areaKm2(f) {
    return outerRings(f).reduce((sum, r) => {
      const lat = r.reduce((a, p) => a + p[1], 0) / r.length;
      return sum + ringArea(r) * 111.32 * 110.57 * Math.cos((lat * Math.PI) / 180);
    }, 0);
  }

  // Up to n evenly spaced vertices, so neighbour tests stay cheap on detailed coasts.
  function sampleVerts(f, n = 400) {
    const all = outerRings(f).flat();
    const step = Math.max(1, Math.floor(all.length / n));
    return all.filter((_, i) => i % step === 0);
  }

  // Named regions that touch f (vertices within ~0.35°), from the current snapshot.
  function neighboursOf(f) {
    const [w, s, e, n] = bboxOf(f);
    const mine = sampleVerts(f);
    return (map._snapData?.features || []).filter((g) => {
      const name = g.properties.NAME;
      if (!name || name === f.properties.NAME) return false;
      const [gw, gs, ge, gn] = bboxOf(g);
      if (gw > e + 0.4 || ge < w - 0.4 || gs > n + 0.4 || gn < s - 0.4) return false;
      const theirs = sampleVerts(g, 300);
      return mine.some(([x, y]) => theirs.some(([a, b]) => Math.abs(a - x) < 0.35 && Math.abs(b - y) < 0.35));
    });
  }

  // ───────── Timeline UI ─────────
  const thumb = $("#tl-thumb");
  const yearInput = $("#year-input");

  function setYear(y, { refresh = true } = {}) {
    y = clamp(Math.round(y), MIN_YEAR, MAX_YEAR);
    if (y === 0) y = y < state.year ? -1 : 1;
    state.year = y;
    thumb.style.left = yearToFrac(y) * 100 + "%";
    if (document.activeElement !== yearInput) yearInput.value = fmtYear(y);
    thumb.setAttribute("aria-valuenow", y);
    thumb.setAttribute("aria-valuetext", fmtYear(y));
    $("#swipe-left-label").textContent = fmtYear(y);
    applyYear(map, y);
    updatePill();
    writeHash();
    if (refresh && !state.playing) refreshMapsSoon();
  }

  function wireTimeline() {
    const track = $("#tl-track");
    let dragging = false;
    const fromEvent = (e) => {
      const r = track.getBoundingClientRect();
      setYear(fracToYear(clamp((e.clientX - r.left) / r.width, 0, 1)));
    };
    track.addEventListener("pointerdown", (e) => {
      if (e.target.closest("input, button")) return;
      dragging = true;
      track.setPointerCapture(e.pointerId);
      stopPlay();
      fromEvent(e);
    });
    track.addEventListener("pointermove", (e) => dragging && fromEvent(e));
    track.addEventListener("pointerup", () => (dragging = false));
    track.addEventListener("pointercancel", () => (dragging = false));

    yearInput.addEventListener("focus", () => yearInput.select());
    yearInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") yearInput.blur();
      e.stopPropagation();
    });
    yearInput.addEventListener("blur", () => {
      const y = parseYear(yearInput.value);
      if (y != null) setYear(y);
      yearInput.value = fmtYear(state.year);
    });
    thumb.addEventListener("keydown", (e) => {
      if (e.target === yearInput) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        setYear(state.year + (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 10 : 1));
      }
    });
  }

  // Play through time; the step widens in deep time so BC doesn't take forever.
  let playTimer = null;
  const playStep = (y) => (y < 0 ? 20 : y < 1000 ? 10 : y < 1500 ? 5 : 1);
  function startPlay() {
    if (state.year >= MAX_YEAR) setYear(MIN_YEAR, { refresh: false });
    state.playing = true;
    document.body.classList.add("playing");
    playTimer = setInterval(() => {
      const next = state.year + playStep(state.year);
      if (next >= MAX_YEAR) { setYear(MAX_YEAR, { refresh: false }); stopPlay(); return; }
      setYear(next, { refresh: false });
    }, 120);
  }
  function stopPlay() {
    if (!state.playing) return;
    state.playing = false;
    clearInterval(playTimer);
    document.body.classList.remove("playing");
    refreshMapsSoon();
  }

  // ───────── Nominatim (one request per second, per its policy) ─────────
  let lastNominatim = 0;
  const reverseCache = new Map();
  async function nominatim(path, lang = state.lang) {
    const wait = lastNominatim + 1100 - Date.now();
    lastNominatim = Date.now() + Math.max(0, wait);
    if (wait > 0) await sleep(wait);
    const r = await fetch(NOMINATIM + path + `&accept-language=${lang}`);
    if (!r.ok) throw new Error("nominatim " + r.status);
    return r.json();
  }

  // English place name under the crosshair, used as the LoC catalogue query.
  async function placeAtCenter() {
    const c = map.getCenter();
    const z = map.getZoom();
    const level = z < 4.3 ? 3 : z < 7 ? 5 : 10;
    const key = `${level}:${c.lat.toFixed(level === 3 ? 0 : 1)}:${c.lng.toFixed(level === 3 ? 0 : 1)}`;
    if (!reverseCache.has(key)) {
      reverseCache.set(key, nominatim(`/reverse?format=jsonv2&zoom=${level}&lat=${c.lat}&lon=${c.lng}`, "en")
        .then((j) => {
          const a = j.address || {};
          if (level === 3) return a.country || null;
          if (level === 5) return a.state || a.region || a.country || null;
          return a.city || a.town || a.county || a.state || a.country || null;
        })
        .catch(() => { reverseCache.delete(key); return null; }));
    }
    return reverseCache.get(key);
  }

  // ───────── Maps panel: Allmaps (by area) + Library of Congress (by name) ─────────
  let panelAbort = null;
  let panelToken = 0;
  let lastKey = null;
  const itemIndex = {};
  const refreshMapsSoon = debounce(() => refreshMaps(), 650);

  const yearOf = (it) => parseInt(it.date, 10) || null;

  function sortItems(list) {
    const k = state.sort;
    return list.sort((a, b) => {
      const ya = yearOf(a) ?? 1e9, yb = yearOf(b) ?? 1e9;
      if (k === "date") return ya - yb;
      if (k === "-date") return (yb === 1e9 ? -1e9 : yb) - (ya === 1e9 ? -1e9 : ya);
      return Math.abs(ya - state.year) - Math.abs(yb - state.year) || (a.src === "allmaps" ? -1 : 1);
    });
  }

  function viewBbox() {
    const b = map.getBounds();
    return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
  }

  // One area lookup at a time: moving to a new view cancels the old one's
  // record requests so they don't queue ahead of the new view's.
  let areaJob = null;
  function allmapsForView(onUpdate) {
    const bb = viewBbox();
    const z = map.getZoom();
    const r = z < 3 ? 10 : z < 5 ? 2 : z < 8 ? 0.5 : 0.05;
    const key = `${z.toFixed(0)}:${bb.map((v) => Math.round(v / r) * r).join(",")}`;
    if (areaJob?.key === key) { areaJob.onUpdate = onUpdate; return areaJob.promise; }
    areaJob?.ctl.abort();
    const job = { key, ctl: new AbortController(), onUpdate };
    job.promise = Sources.searchAllmaps(bb, { key, signal: job.ctl.signal, onUpdate: (it) => job.onUpdate?.(it) });
    job.promise.catch(() => { if (areaJob === job) areaJob = null; });
    areaJob = job;
    return job.promise;
  }

  function skeletonCards() {
    return Array.from({ length: 4 }, () => `<li class="card skel"><div><span class="skeleton"></span><span class="skeleton" style="width:70%"></span><span class="skeleton" style="width:40%;margin-top:14px"></span></div><div class="thumb"></div></li>`).join("");
  }

  const throttle = (fn, ms) => {
    let t = null;
    return () => { if (!t) t = setTimeout(() => { t = null; fn(); }, ms); };
  };

  async function refreshMaps() {
    if (state.mode !== "maps") return;
    if (state.tab === "saved") return renderSaved();
    const cards = $("#cards");
    const from = state.year - state.windowYrs, to = state.year + state.windowYrs;
    const bb = viewBbox().map((v) => v.toFixed(1));
    const key = JSON.stringify([bb, state.query, from, to, state.source, state.sort, state.lang]);
    if (key === lastKey && cards.dataset.filled === "1") return;
    lastKey = key;

    panelAbort?.abort();
    panelAbort = new AbortController();
    const signal = panelAbort.signal;
    const token = ++panelToken;

    $("#panel-place").textContent = t("panel.title", { place: state.query ? `“${state.query}”` : t("panel.thisArea") });
    $("#query-chip").hidden = !state.query;
    $("#export-saved").hidden = true;
    cards.dataset.filled = "0";
    cards.dataset.html = "";

    if (to < 1) {
      cards.innerHTML = `<li class="empty"><b>${esc(t("empty.beforeTitle"))}</b>${esc(t("empty.beforeBody", { year: fmtYear(state.year) }))}</li>`;
      $("#panel-sub").textContent = "";
      return;
    }
    cards.innerHTML = skeletonCards();
    cards.scrollTop = 0;
    $("#panel-sub").textContent = t("panel.reading", { done: 0, total: "…" });

    // Paint whenever anything arrives: either source's first answer, then each
    // catalogue record as it fills in.
    const view = { from, to, wantGeo: state.source !== "loc", wantLoc: state.source !== "allmaps", geo: null, loc: null, geoFailed: false, locFailed: false };
    const paint = () => { if (token === panelToken) renderPanel(view); };
    const paintSoon = throttle(paint, 250);

    if (view.wantGeo) {
      allmapsForView(paintSoon)
        .then((res) => { view.geo = res; paint(); return res.done; })
        .then(paint)
        .catch(() => { view.geoFailed = true; paint(); });
    }
    if (view.wantLoc) {
      (async () => {
        const q = state.query ?? (await placeAtCenter()) ?? "world";
        view.loc = await Sources.searchLoc({ q, from, to, signal });
        paint();
      })().catch(() => { view.locFailed = true; paint(); });
    }
  }

  function renderPanel(view) {
    const cards = $("#cards");
    const { from, to } = view;
    const geoSettled = !view.wantGeo || view.geoFailed || (view.geo && !view.geo.items.some((it) => it.pending));
    const locSettled = !view.wantLoc || view.loc || view.locFailed;
    const failedAll = (!view.wantGeo || view.geoFailed) && (!view.wantLoc || view.locFailed);

    if (failedAll) {
      lastKey = null;
      cards.innerHTML = `<li class="empty"><b>${esc(t("empty.downTitle"))}</b>${esc(t("empty.downBody"))}<br><br><button class="btn btn-ghost btn-sm" data-action="retry">${esc(t("empty.retry"))}</button></li>`;
      $("#panel-sub").textContent = "";
      return;
    }
    if (!view.geo && !view.loc) return; // still skeletons

    const all = view.geo?.items || [];
    const pending = all.filter((it) => it.pending);
    let geo = all.filter((it) => !it.pending);
    // A typed query also narrows the area results to matching titles.
    if (state.query) {
      const q = state.query.toLowerCase();
      geo = geo.filter((it) => `${it.title} ${it.by} ${it.desc}`.toLowerCase().includes(q));
    }
    const inWindow = (it) => { const y = yearOf(it); return y != null && y >= from && y <= to; };
    const list = sortItems([...geo.filter(inWindow), ...(view.loc?.items || [])]);
    const undated = geo.filter((it) => yearOf(it) == null).slice(0, 12);
    const libs = new Set([...list, ...undated, ...pending].map((it) => it.provider)).size;
    const settled = geoSettled && locSettled;

    let html = "";
    if (list.length) {
      html = list.map(cardHTML).join("");
    } else if (settled) {
      const near = geo.filter((it) => yearOf(it) != null)
        .sort((a, b) => Math.abs(yearOf(a) - state.year) - Math.abs(yearOf(b) - state.year))
        .slice(0, 12);
      html = near.length
        ? `<li class="group"><b>${esc(t("empty.nearestTitle", { from: fmtYear(Math.max(from, 1)), to }))}</b>${esc(t("empty.nearestBody"))}</li>${near.map(cardHTML).join("")}`
        : (undated.length ? "" : `<li class="empty"><b>${esc(t("empty.noneTitle"))}</b>${esc(t("empty.noneBody"))}</li>`);
      near.forEach((it) => (itemIndex[it.id] = it));
    } else {
      html = skeletonCards().split("</li>").slice(0, 2).join("</li>") + "</li>";
    }
    if (pending.length) {
      html += `<li class="group loading"><span class="loading-dot"></span> ${esc(t("panel.reading", { done: all.length - pending.length, total: all.length }))}</li>`;
    }
    if (undated.length) html += `<li class="group"><b>${esc(t("card.undated"))}</b>📍 ${esc(t("card.pinned"))}</li>${undated.map(cardHTML).join("")}`;

    [...list, ...undated].forEach((it) => (itemIndex[it.id] = it));
    // Skip identical repaints so a card being clicked isn't swapped out from under the pointer.
    if (cards.dataset.html !== html) {
      const scroll = cards.scrollTop;
      cards.innerHTML = html;
      cards.scrollTop = scroll;
      cards.dataset.html = html;
    }
    cards.dataset.filled = settled ? "1" : "0";
    const count = `${t("panel.count", { n: list.length, from: fmtYear(Math.max(from, 1)), to })} · ${t("panel.libs", { n: libs })}`;
    const progress = view.geo
      ? t("panel.reading", { done: all.length - pending.length, total: all.length })
      : t("panel.reading", { done: 0, total: "…" }); // area results not back yet
    $("#panel-sub").textContent = settled ? count : `${count} · ${progress}`;
  }

  function cardHTML(it) {
    const fav = !!favs[it.id];
    const title = it.title || t("mapFrom", { provider: it.provider });
    const geo = it.src === "allmaps";
    return `<li class="card" tabindex="0" data-id="${esc(it.id)}">
      <div>
        <h3>${esc(title)}</h3>
        <div class="meta">${esc(it.date || t("card.undated"))}${it.by ? " | " + esc(it.by) : ""}</div>
        <div class="row">
          <span class="badge" title="${esc(it.provider)}">${esc(it.badge)}</span>
          ${geo ? `<span class="pin" title="${esc(t("card.pinned"))}">📍</span>` : ""}
          <button class="fav ${fav ? "on" : ""}" data-fav="${esc(it.id)}" aria-label="${esc(t(fav ? "card.unsave" : "card.save"))}">${fav ? "♥" : "♡"}</button>
          ${notes[it.id] ? `<span class="has-note">${esc(t("card.note"))}</span>` : ""}
          <span class="card-actions">
            ${geo ? `<button class="btn btn-red btn-sm" data-overlay="${esc(it.id)}" title="${esc(t("card.overlayTitle"))}">◧ ${esc(t("card.overlay"))}</button>` : ""}
            <button class="btn btn-ghost btn-sm view">${esc(t("card.view"))}</button>
          </span>
        </div>
      </div>
      <img class="thumb" loading="lazy" src="${esc(it.thumb)}" alt="" onerror="this.style.visibility='hidden'">
    </li>`;
  }

  function renderSaved() {
    const list = sortItems(Object.values(favs));
    $("#panel-place").textContent = t("panel.title", { place: t("panel.yourCollection") });
    $("#query-chip").hidden = true;
    $("#panel-sub").textContent = t("panel.savedCount", { n: list.length });
    $("#cards").dataset.filled = "0";
    lastKey = null;
    $("#cards").innerHTML = list.length
      ? list.map(cardHTML).join("")
      : `<li class="empty"><b>${esc(t("empty.savedTitle"))}</b>${esc(t("empty.savedBody"))}</li>`;
    list.forEach((it) => (itemIndex[it.id] = it));
    $("#export-saved").hidden = !list.length;
  }

  function toggleFav(id) {
    const it = itemIndex[id] || favs[id];
    if (!it) return;
    if (favs[id]) delete favs[id];
    else favs[id] = it;
    store.set("favs", favs);
    updateFavCount();
    $$(`[data-fav="${CSS.escape(id)}"]`).forEach((b) => {
      const on = !!favs[id];
      b.classList.toggle("on", on);
      b.textContent = on ? "♥" : "♡";
    });
    if (currentItem?.id === id) syncViewerFav();
    if (state.tab === "saved") renderSaved();
    toast(t(favs[id] ? "toast.saved" : "toast.removed"));
  }
  const updateFavCount = () => ($("#fav-count").textContent = Object.keys(favs).length);

  function exportSaved() {
    const data = Object.values(favs).map((f) => ({ ...f, notes: notes[f.id] || "" }));
    const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), maps: data }, null, 2)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "xarita-my-maps.json" });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // Footprint of a georeferenced map while its card is hovered.
  function showFootprint(it) {
    const src = map.getSource("fp");
    if (!src) return;
    if (!it?.bbox) return src.setData(EMPTY);
    const [w, s, e, n] = it.bbox;
    src.setData({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] } });
  }

  // ───────── Overlay: warp a georeferenced scan onto today's map ─────────
  let warp = null;
  let overlayItem = null;
  let warpModule = null;

  async function overlayMap(it) {
    if (!it?.annotation) return;
    if ($("#viewer").open) closeViewer();
    if (state.mode === "landing") setMode("maps");
    if (state.globe) onAction("globe");
    busy(t("overlay.loading"));
    try {
      warpModule ??= await import(ALLMAPS_MAPLIBRE);
      if (!warp) {
        warp = new warpModule.WarpedMapLayer({ layerId: "warped" });
        map.addLayer(warp, firstSymbolId(map));
      } else {
        warp.clear();
      }
      overlayItem = it;
      itemIndex[it.id] = it;
      showFootprint(null);
      fitOverlay();
      await warp.addGeoreferenceAnnotationByUrl(it.annotation);
      warp.setOpacity(+$("#ov-opacity").value);
      $("#overlay-bar").hidden = false;
      $("#ov-thumb").src = it.thumb;
      $("#ov-title").textContent = it.title || t("mapFrom", { provider: it.provider });
      if (yearOf(it) && Math.abs(yearOf(it) - state.year) > 5) setYear(yearOf(it));
      writeHash();
    } catch (e) {
      console.warn(e);
      overlayItem = null;
      toast(t("overlay.failed"));
    } finally {
      busy(null);
    }
  }

  function fitOverlay() {
    if (!overlayItem?.bbox) return;
    const [w, s, e, n] = overlayItem.bbox;
    const pad = isPhone() ? { top: 60, bottom: 260, left: 20, right: 20 } : { top: 80, bottom: 130, left: 80, right: state.mode === "maps" && state.panelOpen ? 60 : 80 };
    map.fitBounds([[w, s], [e, n]], { padding: pad, maxZoom: 13, duration: 1400 });
  }

  function removeOverlay() {
    warp?.clear();
    overlayItem = null;
    $("#overlay-bar").hidden = true;
    writeHash();
  }

  // ───────── Viewer (OpenSeadragon over IIIF) ─────────
  let osd = null;
  let currentItem = null;

  function syncViewerFav() {
    $("#v-fav").textContent = t(favs[currentItem.id] ? "viewer.saved" : "viewer.save");
  }

  function openViewer(it) {
    if (!it) return;
    currentItem = it;
    itemIndex[it.id] = it;
    const dlg = $("#viewer");
    const geo = it.src === "allmaps";
    $("#v-title").textContent = it.title || t("mapFrom", { provider: it.provider });
    $("#v-date").textContent = it.date || t("card.undated");
    $("#v-provider").textContent = it.provider;
    $("#v-by").textContent = it.by || "";
    $("#v-desc").textContent = it.desc || "";
    $("#v-tags").innerHTML = (it.tags || []).map((x) => `<span>${esc(x)}</span>`).join("");
    $("#v-pinned").hidden = !geo;
    $("#v-overlay").hidden = !geo;
    $("#v-source").hidden = !it.url;
    $("#v-source").href = it.url || "#";
    $("#v-source").textContent = t("viewer.source", { provider: it.provider });
    $("#v-allmaps").hidden = !it.viewer;
    $("#v-allmaps").href = it.viewer || "#";
    $("#v-full").href = it.full;
    $("#v-jump").hidden = !yearOf(it);
    $("#v-notes").value = notes[it.id] || "";
    syncViewerFav();
    $("#viewer-loading").hidden = false;
    $("#viewer-loading").textContent = t("viewer.loading");
    if (!dlg.open) dlg.showModal();

    if (!osd) {
      osd = OpenSeadragon({
        element: $("#osd"),
        prefixUrl: OSD_IMAGES,
        showNavigator: !isPhone(),
        navigatorPosition: "BOTTOM_RIGHT",
        gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: true },
        visibilityRatio: 0.6,
        maxZoomPixelRatio: 3,
      });
      osd.addHandler("open", () => ($("#viewer-loading").hidden = true));
      osd.addHandler("open-failed", () => {
        if (osd._triedFallback || !currentItem?.full) {
          $("#viewer-loading").textContent = t("viewer.failed");
          return;
        }
        osd._triedFallback = true;
        osd.open({ type: "image", url: currentItem.full });
      });
    }
    osd._triedFallback = false;
    osd.open(it.iiif ? `${it.iiif}/info.json` : { type: "image", url: it.full });
    state.openMap = it.id;
    writeHash();
  }

  const closeViewer = () => $("#viewer").close();

  async function itemFromId(id) {
    if (itemIndex[id] || favs[id]) return itemIndex[id] || favs[id];
    return id.startsWith("am:") ? Sources.allmapsItem(id.slice(3)) : Sources.locItem(id);
  }

  // ───────── Search ─────────
  let searchItems = [];
  let searchActive = 0;
  const searchBox = $("#search");
  const searchList = $("#search-results");

  function renderSearch() {
    searchList.hidden = !searchItems.length;
    searchBox.setAttribute("aria-expanded", String(!!searchItems.length));
    searchList.innerHTML = searchItems.map((s, i) => `<li role="option" class="${i === searchActive ? "active" : ""}" data-i="${i}">
      <span class="kind">${esc(t(s.kind === "maps" ? "search.kindMaps" : "search.kindPlace"))}</span>
      <span>${esc(s.label)}${s.sub ? `<br><small>${esc(s.sub)}</small>` : ""}</span></li>`).join("");
  }

  const searchPlaces = debounce(async (text) => {
    if (text.length < 2) return;
    try {
      const res = await nominatim(`/search?format=jsonv2&limit=5&q=${encodeURIComponent(text)}`);
      if (searchBox.value.trim() !== text) return;
      searchItems = [searchItems[0], ...res.map((r) => ({ kind: "place", label: r.name || r.display_name.split(",")[0], sub: r.display_name, bbox: r.boundingbox.map(Number) }))];
      renderSearch();
    } catch { /* search is best effort */ }
  }, 450);

  function chooseSearch(i) {
    const s = searchItems[i];
    if (!s) return;
    searchItems = [];
    renderSearch();
    searchBox.blur();
    state.tab = "all";
    syncTabs();
    if (s.kind === "maps") {
      state.query = s.text;
      setMode("maps");
      openSheet();
      refreshMaps();
    } else {
      state.query = null;
      if (state.mode === "landing") setMode("maps");
      const [s1, n1, w1, e1] = s.bbox;
      map.fitBounds([[w1, s1], [e1, n1]], { padding: 60, maxZoom: 9, duration: 1800 });
    }
  }

  function wireSearch() {
    searchBox.addEventListener("input", () => {
      const text = searchBox.value.trim();
      searchActive = 0;
      searchItems = text ? [{ kind: "maps", label: t("search.maps", { q: text }), text }] : [];
      renderSearch();
      searchPlaces(text);
    });
    searchBox.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        searchActive = clamp(searchActive + (e.key === "ArrowDown" ? 1 : -1), 0, searchItems.length - 1);
        renderSearch();
      } else if (e.key === "Enter") {
        e.preventDefault();
        chooseSearch(searchActive);
      } else if (e.key === "Escape") {
        searchItems = [];
        renderSearch();
        searchBox.blur();
      }
      e.stopPropagation();
    });
    searchList.addEventListener("mousedown", (e) => {
      const li = e.target.closest("li");
      if (li) { e.preventDefault(); chooseSearch(+li.dataset.i); }
    });
    searchBox.addEventListener("blur", () => setTimeout(() => { searchItems = []; renderSearch(); }, 150));
  }

  // ───────── Compare (swipe between two years) ─────────
  let swipeX = null;

  function placeSwipe(x) {
    const w = $("#map").clientWidth;
    swipeX = clamp(x ?? w / 2, 40, w - 40);
    $("#swipe").style.left = swipeX + "px";
    $("#map-compare").style.clipPath = `inset(0 0 0 ${swipeX}px)`;
  }

  function setCompare(on) {
    state.compare = on;
    $("#compare-btn").classList.toggle("on", on);
    $("#compare-bar").hidden = !on;
    $("#swipe").hidden = !on;
    $("#map-compare").hidden = !on;
    if (on && state.mode === "landing") setMode("history");
    if (!on) { writeHash(); return; }
    $("#compare-year").value = fmtYear(state.compareYear);
    $("#swipe-right-label").textContent = fmtYear(state.compareYear);
    if (!cmpMap) {
      cmpMap = new maplibregl.Map({
        container: "map-compare",
        style: BASEMAP,
        center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(),
        maxZoom: 14,
        maxPitch: 0,
        attributionControl: false,
      });
      cmpMap.on("load", () => {
        tintBasemap(cmpMap);
        addHistoryLayers(cmpMap);
        if (state.globe) cmpMap.setProjection({ type: "globe" });
        applyYear(cmpMap, state.compareYear);
      });
      let syncing = false;
      const link = (a, b) => a.on("move", () => {
        if (syncing) return;
        syncing = true;
        b.jumpTo({ center: a.getCenter(), zoom: a.getZoom(), bearing: a.getBearing() });
        syncing = false;
      });
      link(map, cmpMap);
      link(cmpMap, map);
    } else {
      cmpMap.resize();
      cmpMap.jumpTo({ center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing() });
      applyYear(cmpMap, state.compareYear);
    }
    placeSwipe(swipeX);
    writeHash();
  }

  function setCompareYear(y) {
    y = clamp(y, MIN_YEAR, MAX_YEAR) || 1;
    state.compareYear = y;
    $("#compare-year").value = fmtYear(y);
    $("#swipe-right-label").textContent = fmtYear(y);
    applyYear(cmpMap, y);
    writeHash();
  }

  function wireSwipe() {
    const handle = $(".swipe-handle");
    let drag = false;
    handle.addEventListener("pointerdown", (e) => { drag = true; handle.setPointerCapture(e.pointerId); });
    handle.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const r = $("#map").getBoundingClientRect();
      placeSwipe(e.clientX - r.left);
    });
    handle.addEventListener("pointerup", () => (drag = false));
    $("#compare-year").addEventListener("change", (e) => setCompareYear(parseYear(e.target.value) ?? state.compareYear));
    $("#compare-year").addEventListener("keydown", (e) => { if (e.key === "Enter") e.target.blur(); e.stopPropagation(); });
  }

  // ───────── Tours ─────────
  function renderTourList() {
    $("#tour-list").innerHTML = window.TOURS.map((tr) => `<li><button data-tour="${tr.id}"><b>${esc(L(tr.name))}</b><span>${esc(L(tr.blurb))} · ${esc(t("tours.stops", { n: tr.stops.length }))}</span></button></li>`).join("");
    $("#hero-tour-name").textContent = L(window.TOURS[0].name);
  }

  function startTour(id) {
    const tr = window.TOURS.find((x) => x.id === id);
    if (!tr) return;
    $$("dialog[open]").forEach((d) => d.close());
    state.tour = tr;
    goStop(0);
  }

  function renderTourCard() {
    const tr = state.tour;
    if (!tr) return;
    const i = state.tourStop;
    const s = tr.stops[i];
    $("#tour-card").hidden = false;
    $("#tour-name").textContent = L(tr.name);
    $("#tour-title").textContent = L(s.title);
    $("#tour-year").textContent = `${fmtYear(s.year)} · ${t("tour.stopOf", { i: i + 1, n: tr.stops.length })}`;
    $("#tour-text").textContent = L(s.text);
    $("#tour-dots").innerHTML = tr.stops.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("");
    $("#tour-next").textContent = t(i === tr.stops.length - 1 ? "tour.finish" : "tour.next");
    $('[data-action="tour-prev"]').disabled = i === 0;
  }

  function goStop(i) {
    const tr = state.tour;
    if (!tr) return;
    if (i >= tr.stops.length) return endTour();
    state.tourStop = i = clamp(i, 0, tr.stops.length - 1);
    const s = tr.stops[i];
    stopPlay();
    state.query = s.query;
    state.tab = "all";
    syncTabs();
    setYear(s.year, { refresh: false });
    if (state.mode !== "maps") setMode("maps");
    if (!state.panelOpen) togglePanel(true);
    if (isPhone()) setSheet("peek");
    map.flyTo({ center: s.center, zoom: s.zoom, duration: 2400, essential: true });
    renderTourCard();
    // moveend after the flight refreshes the panel for the new area.
  }

  function endTour() {
    state.tour = null;
    $("#tour-card").hidden = true;
  }

  // ───────── Hero: a globe that steps through eras ─────────
  // Each era turns the globe to where that story happens and sets the real year,
  // so the borders on screen are the actual data, not a picture.
  const SHOWCASE = [
    { year: -323, center: [48, 32] },
    { year: 100, center: [60, 35] },
    { year: 1279, center: [85, 42] },
    { year: 1400, center: [66, 38] },
    { year: 1492, center: [-40, 25] },
    { year: 1849, center: [-108, 37] },
    { year: 1914, center: [20, 45] },
    { year: 1991, center: [62, 48] },
  ];
  // Starting points on every inhabited continent.
  const CITIES = [
    { key: "samarkand", year: 1400, center: [66.97, 39.65], zoom: 5.5 },
    { key: "sf", year: 1849, center: [-122.42, 37.77], zoom: 8 },
    { key: "tenochtitlan", year: 1519, center: [-99.13, 19.43], zoom: 6 },
    { key: "cusco", year: 1530, center: [-71.97, -13.53], zoom: 5 },
    { key: "timbuktu", year: 1350, center: [-3.0, 16.77], zoom: 4.5 },
    { key: "cairo", year: 1250, center: [31.24, 30.04], zoom: 5 },
    { key: "istanbul", year: 1453, center: [28.97, 41.01], zoom: 6 },
    { key: "delhi", year: 1650, center: [77.2, 28.6], zoom: 5 },
    { key: "kyoto", year: 1600, center: [135.77, 35.01], zoom: 6 },
    { key: "sydney", year: 1788, center: [151.21, -33.87], zoom: 6 },
  ];
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hero = { timer: null, idx: 3, paused: reduceMotion, touched: 0 };

  function renderHero() {
    $("#hero-chips").innerHTML = CITIES.map((c) => `<button class="chip-city" data-city="${c.key}">${esc(t(`city.${c.key}`))} <small>${esc(fmtYear(c.year))}</small></button>`).join("");
    $("#hero-year").textContent = fmtYear(SHOWCASE[hero.idx].year);
    $("#hero-caption").textContent = t(`show.${SHOWCASE[hero.idx].year}`);
    syncSpinButton();
  }

  function syncSpinButton() {
    const b = $("#hero-spin");
    b.textContent = hero.paused ? "▶" : "❚❚";
    const label = t(hero.paused ? "hero.play" : "hero.pause");
    b.title = label;
    b.setAttribute("aria-label", label);
  }

  // Size the globe to the room below the headline. It may rise a little behind the
  // text and sink behind the bottom row's empty middle; the vignette follows it.
  function layoutHero() {
    const stage = $(".stage").getBoundingClientRect();
    const textBottom = $(".hero-top").getBoundingClientRect().bottom - stage.top;
    const padTop = Math.round(textBottom * (isPhone() ? 0.85 : 0.6));
    const padBottom = isPhone() ? Math.round(stage.bottom - $(".hero-bottom").getBoundingClientRect().top) : 0;
    const avail = Math.max(140, stage.height - padTop - padBottom);
    const radius = Math.min(avail * 0.5, stage.width * 0.42);
    map.setPadding({ top: padTop, bottom: padBottom, left: 0, right: 0 });
    map.jumpTo({ zoom: Math.log2((radius * 2 * Math.PI) / 512) });
    const heroEl = $("#hero");
    heroEl.style.setProperty("--gy", `${padTop + avail / 2}px`);
    heroEl.style.setProperty("--gr", `${radius}px`);
  }

  function showEra(i, animate) {
    hero.idx = i;
    const s = SHOWCASE[i];
    setYear(s.year, { refresh: false });
    const y = $("#hero-year");
    y.classList.add("flip");
    setTimeout(() => {
      y.textContent = fmtYear(s.year);
      $("#hero-caption").textContent = t(`show.${s.year}`);
      y.classList.remove("flip");
    }, animate ? 260 : 0);
    if (animate) map.easeTo({ center: s.center, duration: 3000, easing: (k) => k * (2 - k) });
    else map.jumpTo({ center: s.center });
  }

  function scheduleHero() {
    clearTimeout(hero.timer);
    if (hero.paused || state.mode !== "landing") return;
    hero.timer = setTimeout(() => {
      // Let someone who is dragging the globe finish before moving it.
      if (Date.now() - hero.touched > 5000) showEra((hero.idx + 1) % SHOWCASE.length, true);
      scheduleHero();
    }, 4600);
  }

  function startHero() {
    if (!mapReady) return; // the load handler starts it
    map.setProjection({ type: "globe" });
    layoutHero();
    showEra(hero.idx, false);
    scheduleHero();
  }

  function stopHero() {
    clearTimeout(hero.timer);
    map.stop();
    map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
    if (!state.globe) map.setProjection({ type: "mercator" });
    const c = map.getCenter();
    map.jumpTo({ center: [c.lng, clamp(c.lat, -55, 65)], zoom: Math.max(map.getZoom(), isPhone() ? 1.6 : 2.6) });
  }

  function goCity(key) {
    const c = CITIES.find((x) => x.key === key);
    if (!c) return;
    state.query = null;
    state.tab = "all";
    syncTabs();
    setYear(c.year, { refresh: false });
    setMode("maps");
    if (isPhone()) setSheet("peek");
    map.flyTo({ center: c.center, zoom: c.zoom, duration: 2400, essential: true });
  }

  // ───────── Quiz about the selected region ─────────
  // Questions come from the data on screen: OpenHistoricalMap dates, snapshot
  // geometry (neighbours, size, where it is) and the region's Wikipedia text,
  // so any region in any era and language can be quizzed.
  const quiz = { questions: [], i: 0, score: 0, region: null, clickTarget: null, token: 0 };
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const locale = () => ({ en: "en-GB", uz: "uz-Latn-UZ", ru: "ru-RU" }[state.lang]);
  const fmtKm2 = (n) => new Intl.NumberFormat(locale()).format(n > 1e5 ? Math.round(n / 1e4) * 1e4 : Math.round(n / 100) * 100);

  // Russian Wikipedia marks stress with combining accents (Росси́йская), which
  // would stop the region's name from matching, so they're stripped first.
  const plain = (s) => s.normalize("NFD").replace(/́/g, "").normalize("NFC");

  function maskName(text, names) {
    const terms = [...new Set(names.filter(Boolean).map(plain).flatMap((n) => [n, ...n.split(/[\s,()–-]+/).filter((w) => w.length >= 4)]))]
      .sort((a, b) => b.length - a.length);
    return terms.reduce((out, term) => out.replace(new RegExp(escRe(term), "gi"), "▁▁▁"), plain(text));
  }
  const firstSentence = (text) => ((text.match(/^(.{40,}?[.!?])(\s|$)/) || [])[1] || text).slice(0, 240);
  const withTimeout = (p, ms) => Promise.race([p, sleep(ms).then(() => null)]);

  async function buildQuiz(r) {
    const snapYear = fmtYear(map._snap);
    const f = r.tint;
    const self = f?.properties.NAME;
    const neigh = f ? neighboursOf(f) : [];
    const neighNames = [...new Set(neigh.map((g) => g.properties.NAME))];
    const out = {};

    // When did it exist? (exact OpenHistoricalMap dates)
    if (r.start != null) {
      const now = new Date().getFullYear();
      const range = (a, b) => `${fmtYear(a)} – ${b == null || b >= now ? t("region.now") : fmtYear(b)}`;
      const span = Math.max(40, (r.end ?? now) - r.start);
      const answer = range(r.start, r.end);
      const opts = new Set([answer]);
      for (const k of shuffle([-1.5, -0.8, 0.8, 1.5, -2.3, 2.3])) {
        if (opts.size >= 4) break;
        const d = Math.round((k * span * 0.6) / 5) * 5 || Math.sign(k) * 10;
        const a = r.start + d;
        const b = r.end == null ? (d > 0 ? null : now + d) : r.end + d;
        if (a >= MIN_YEAR && (b == null || b <= now)) opts.add(range(a, b));
      }
      if (opts.size === 4) out.dates = { type: "choice", q: t("quiz.qDates", { name: r.name }), meta: "OpenHistoricalMap", options: shuffle([...opts]), answer, explain: "" };
    }

    // Which of these bordered it?
    if (neighNames.length) {
      const answer = pick(neighNames);
      const [w, s, e, n] = bboxOf(f);
      const far = shuffle([...new Set((map._snapData?.features || []).filter((g) => {
        const nm = g.properties.NAME;
        if (!nm || nm === self || neighNames.includes(nm)) return false;
        const [a, b, c, d] = bboxOf(g);
        return Math.hypot((a + c) / 2 - (w + e) / 2, (b + d) / 2 - (s + n) / 2) > 25;
      }).map((g) => g.properties.NAME))]).slice(0, 3);
      if (far.length === 3) {
        out.neighbour = {
          type: "choice", q: t("quiz.qNeighbour", { name: r.name, year: snapYear }), meta: t("quiz.source", { y: snapYear }),
          options: shuffle([answer, ...far]), answer, explain: t("quiz.neighbours", { list: neighNames.slice(0, 8).join(", ") }),
        };
      }
    }

    // Which was bigger?
    if (f) {
      const a1 = areaKm2(f);
      const others = neigh.filter((g) => { const k = areaKm2(g) / a1; return k > 1.5 || k < 0.67; });
      if (others.length) {
        const g = pick(others);
        const a2 = areaKm2(g);
        out.bigger = {
          type: "choice", q: t("quiz.qBigger", { year: snapYear }), meta: t("quiz.source", { y: snapYear }),
          options: shuffle([self, g.properties.NAME]), answer: a1 > a2 ? self : g.properties.NAME,
          explain: t("quiz.areaFact", { a: self, x: fmtKm2(a1), b: g.properties.NAME, y: fmtKm2(a2) }),
        };
      }
    }

    // Find a neighbour on the map, with labels hidden.
    if (neighNames.length) {
      const target = pick(neighNames.filter((x) => x !== out.neighbour?.answer)) || pick(neighNames);
      const g = neigh.find((x) => x.properties.NAME === target);
      const [w1, s1, e1, n1] = bboxOf(f), [w2, s2, e2, n2] = bboxOf(g);
      out.click = { type: "click", q: t("quiz.qClick", { target }), target, fit: [Math.min(w1, w2), Math.min(s1, s2), Math.max(e1, e2), Math.max(n1, n2)] };
    }

    // Text questions from Wikipedia, in the UI language.
    const summary = await withTimeout(wikiSummary(r.nameEn, r.nameLocal), 6000);
    const subjectNames = [r.name, r.nameEn, r.nameLocal, summary?.title];
    if (summary?.extract) {
      const cands = plain(summary.extract).split(/(?<=[.!?])\s+/).map((s) => {
        const m = s.match(/(?<![\d.,])(\d{3,4})(?![\d.,])/);
        return m && +m[1] >= 100 && +m[1] <= 2025 ? { s, y: +m[1] } : null;
      }).filter(Boolean);
      if (cands.length) {
        const c = pick(cands);
        const opts = new Set([c.y]);
        while (opts.size < 4) {
          const v = c.y + (Math.random() < 0.5 ? -1 : 1) * (8 + Math.floor(Math.random() * 140));
          if (v > 0 && v <= 2025) opts.add(v);
        }
        out.year = {
          type: "choice", q: t("quiz.qYear"), meta: "Wikipedia", quote: maskName(c.s, subjectNames).replace(String(c.y), "____"),
          options: shuffle([...opts].map(String)), answer: String(c.y), explain: c.s,
        };
      }

      // Which description is about it? Others come from neighbours or labels on screen.
      let others = neighNames.slice();
      if (others.length < 3) {
        others.push(...map.queryRenderedFeatures({ layers: ["ohm-label"] }).map((x) => x.properties.name_en || x.properties.name));
      }
      others = shuffle([...new Set(others)].filter((n) => n && n !== r.nameEn && n !== self)).slice(0, 5);
      const sums = (await Promise.all(others.map((n) => withTimeout(wikiSummary(n), 5000))))
        .filter((s) => s?.extract && s.title !== summary.title).slice(0, 3);
      if (sums.length === 3) {
        const mine = maskName(firstSentence(plain(summary.extract)), subjectNames);
        const opts = sums.map((s) => maskName(firstSentence(plain(s.extract)), [s.title, ...others]));
        out.desc = { type: "choice", q: t("quiz.qDesc", { name: r.name }), meta: "Wikipedia", options: shuffle([mine, ...opts]), answer: mine, explain: "" };
      }
    }

    return ["dates", "neighbour", "year", "click", "desc", "bigger"].map((k) => out[k]).filter(Boolean).slice(0, 5);
  }

  async function startQuiz() {
    const r = state.region;
    if (!r) return;
    endTour();
    stopPlay();
    endClick();
    const token = ++quiz.token;
    $("#quiz-card").hidden = false;
    if (isPhone()) $("#region-card").hidden = true;
    $("#quiz-name").textContent = t("quiz.title", { name: r.name });
    $("#quiz-bar").style.width = "0%";
    $("#quiz-body").innerHTML = `<p class="quiz-meta">${esc(t("quiz.preparing"))}</p><span class="skeleton"></span><span class="skeleton" style="width:70%"></span>`;
    let qs = [];
    try { qs = await buildQuiz(r); } catch (e) { console.warn(e); }
    if (token !== quiz.token) return;
    if (qs.length < 3) {
      $("#quiz-body").innerHTML = `<p>${esc(t("quiz.notEnough"))}</p><div class="quiz-actions"><button class="btn btn-ghost btn-sm" data-action="quiz-close">${esc(t("quiz.close"))}</button></div>`;
      return;
    }
    Object.assign(quiz, { questions: qs, i: 0, score: 0, region: r });
    renderQuestion();
  }

  function renderQuestion() {
    const q = quiz.questions[quiz.i];
    const n = quiz.questions.length;
    $("#quiz-bar").style.width = `${(quiz.i / n) * 100}%`;
    let html = `<p class="quiz-meta">${esc(t("quiz.qOf", { i: quiz.i + 1, n }))}${q.meta ? " · " + esc(q.meta) : ""}</p><p class="quiz-q">${esc(q.q)}</p>`;
    if (q.quote) html += `<p class="quiz-quote">${esc(q.quote)}</p>`;
    if (q.type === "click") {
      html += `<div id="quiz-ask"><p class="quiz-hint">${esc(t("quiz.qClickHint"))}</p><div class="quiz-actions"><button class="btn btn-ghost btn-sm" data-action="quiz-skip">${esc(t("quiz.skip"))}</button></div></div>`;
    } else {
      html += `<div class="quiz-opts">${q.options.map((o, k) => `<button class="q-opt" data-opt="${k}">${esc(o)}</button>`).join("")}</div>`;
    }
    $("#quiz-body").innerHTML = html + `<div id="quiz-after"></div>`;
    if (q.type === "click") beginClick(q);
  }

  function showAfter(ok, answer, explain) {
    const last = quiz.i === quiz.questions.length - 1;
    $("#quiz-after").innerHTML = `<p class="quiz-feedback"><b class="${ok ? "ok" : "no"}">${esc(t(ok ? "quiz.correct" : "quiz.wrong"))}</b>
      ${ok ? "" : esc(t("quiz.answerWas", { a: answer.length > 90 ? answer.slice(0, 90) + "…" : answer }))}
      ${explain ? `<br><span class="muted">${esc(explain)}</span>` : ""}</p>
      <div class="quiz-actions"><button class="btn btn-red btn-sm" data-action="quiz-next">${esc(t(last ? "quiz.finish" : "quiz.next"))}</button></div>`;
    $("#quiz-after [data-action]").focus();
  }

  function answerChoice(k) {
    const q = quiz.questions[quiz.i];
    const ok = q.options[k] === q.answer;
    if (ok) quiz.score++;
    $$("#quiz-body .q-opt").forEach((b, j) => {
      b.disabled = true;
      if (q.options[j] === q.answer) b.classList.add("right");
      else if (j === k) b.classList.add("wrong");
    });
    showAfter(ok, q.answer, q.explain);
  }

  function beginClick(q) {
    quiz.clickTarget = q.target;
    document.body.classList.add("quiz-clicking");
    for (const id of ["hist-label", "ohm-label", "ohm-label-4"]) map.setLayoutProperty(id, "visibility", "none");
    map.setLayoutProperty("hist-fill", "visibility", "visible");
    const [w, s, e, n] = q.fit;
    map.fitBounds([[w, s], [e, n]], { padding: isPhone() ? 40 : 90, duration: 1200, maxZoom: 7 });
  }

  function endClick() {
    if (!quiz.clickTarget) return;
    quiz.clickTarget = null;
    document.body.classList.remove("quiz-clicking");
    updateMix(map);
  }

  function highlightByName(name) {
    const f = map.querySourceFeatures("hist", { filter: ["==", ["get", "NAME"], name] })[0];
    if (f?.id == null) return;
    if (selectedId != null) map.setFeatureState({ source: "hist", id: selectedId }, { sel: false });
    selectedId = f.id;
    map.setFeatureState({ source: "hist", id: f.id }, { sel: true });
  }

  function quizMapClick(e) {
    const q = quiz.questions[quiz.i];
    const got = map.queryRenderedFeatures(e.point, { layers: ["hist-fill"] })[0]?.properties?.NAME;
    const ok = got === q.target;
    if (ok) quiz.score++;
    endClick();
    highlightByName(q.target);
    $("#quiz-ask")?.remove();
    showAfter(ok, q.target, ok ? "" : got ? t("quiz.clickedWrong", { got }) : t("quiz.clickedNothing"));
  }

  function nextQuestion() {
    quiz.i++;
    if (quiz.i < quiz.questions.length) return renderQuestion();
    const n = quiz.questions.length, s = quiz.score;
    const best = store.get("quizBest", {});
    const key = quiz.region.nameEn;
    best[key] = Math.max(best[key] || 0, s);
    store.set("quizBest", best);
    $("#quiz-bar").style.width = "100%";
    const msg = t(s / n >= 0.8 ? "quiz.great" : s / n >= 0.5 ? "quiz.good" : "quiz.low");
    $("#quiz-body").innerHTML = `<div class="quiz-score"><div class="big">${s}/${n}</div><p>${esc(msg)}</p><p class="muted">${esc(t("quiz.best", { b: best[key], n }))}</p></div>
      <div class="quiz-actions"><button class="btn btn-ghost btn-sm" data-action="quiz-close">${esc(t("quiz.close"))}</button><button class="btn btn-red btn-sm" data-action="quiz-start">${esc(t("quiz.again"))}</button></div>`;
  }

  function closeQuiz() {
    quiz.token++;
    endClick();
    $("#quiz-card").hidden = true;
  }

  // ───────── Modes, panel, sheet, theme, language ─────────
  const resizeMaps = () => setTimeout(() => { map.resize(); cmpMap?.resize(); fitTicks(); if (state.compare) placeSwipe(swipeX); }, 320);

  function setMode(m) {
    if (state.mode === m) return;
    const prev = state.mode;
    state.mode = m;
    document.body.dataset.mode = m;
    if (prev === "landing") stopHero();
    if (m === "landing") { closeQuiz(); endTour(); startHero(); }
    $("#panel-reopen").hidden = m !== "maps" || state.panelOpen;
    resizeMaps();
    if (m === "maps") refreshMaps();
    writeHash();
  }

  function togglePanel(force) {
    state.panelOpen = force ?? !state.panelOpen;
    document.body.classList.toggle("panel-closed", !state.panelOpen);
    $("#panel-reopen").hidden = state.panelOpen || state.mode !== "maps";
    resizeMaps();
  }

  function setSheet(s) {
    state.sheet = s;
    document.body.dataset.sheet = s;
  }
  function openSheet() { if (isPhone() && state.sheet === "peek") setSheet("half"); }

  function setTheme(th) {
    state.theme = th;
    document.documentElement.dataset.theme = th;
    $('meta[name="theme-color"]').content = th === "dark" ? "#1d1914" : "#f6f2ea";
    store.set("theme", th);
    for (const m of [map, cmpMap]) if (m?.isStyleLoaded()) tintBasemap(m);
  }

  function applyI18n() {
    document.documentElement.lang = state.lang === "uz" ? "uz-Latn" : state.lang;
    $("#lang").value = state.lang;
    $$("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
    $$("[data-i18n-html]").forEach((el) => (el.innerHTML = t(el.dataset.i18nHtml)));
    $$("[data-i18n-attr]").forEach((el) => el.dataset.i18nAttr.split(",").forEach((pair) => {
      const [attr, key] = pair.split(":");
      el.setAttribute(attr, t(key));
    }));
    buildTicks();
    renderTourList();
    renderTourCard();
    yearInput.value = fmtYear(state.year);
    $("#swipe-left-label").textContent = fmtYear(state.year);
    $("#swipe-right-label").textContent = fmtYear(state.compareYear);
    $("#compare-year").value = fmtYear(state.compareYear);
    updatePill();
    renderHero();
  }

  function setLang(lang) {
    if (!LANGS.includes(lang)) return;
    state.lang = lang;
    store.set("lang", lang);
    applyI18n();
    for (const m of [map, cmpMap]) if (m?.isStyleLoaded()) tintBasemap(m);
    $("#region-card").hidden = true;
    lastKey = null;
    if (state.mode === "maps") refreshMaps();
    writeHash();
  }

  const syncTabs = () => $$(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === state.tab));

  // ───────── URL hash (every view is shareable) ─────────
  const writeHash = debounce(() => {
    if (state.mode === "landing") { history.replaceState(null, "", location.pathname + location.search); return; }
    const c = map.getCenter();
    const p = new URLSearchParams();
    p.set("mode", state.mode);
    p.set("year", state.year);
    p.set("pos", `${map.getZoom().toFixed(2)}/${c.lat.toFixed(3)}/${c.lng.toFixed(3)}`);
    p.set("lang", state.lang);
    if (state.query) p.set("q", state.query);
    if (state.compare) p.set("cmp", state.compareYear);
    if (overlayItem) p.set("ov", overlayItem.id.replace(/^am:/, ""));
    if ($("#viewer").open && state.openMap) p.set("map", state.openMap);
    history.replaceState(null, "", "#" + p.toString());
  }, 250);

  // ───────── Event wiring ─────────
  function onAction(action, el) {
    switch (action) {
      case "zoom-in": map.zoomIn(); break;
      case "zoom-out": map.zoomOut(); break;
      case "north": map.easeTo({ bearing: 0, pitch: 0 }); break;
      case "globe":
        state.globe = !state.globe;
        $("#globe-btn").classList.toggle("on", state.globe);
        if (state.globe && overlayItem) removeOverlay(); // warped maps render in Mercator only
        for (const m of [map, cmpMap]) m?.setProjection({ type: state.globe ? "globe" : "mercator" });
        break;
      case "borders": setToggle("borders", !state.borders); break;
      case "tint": setToggle("tint", !state.tint); break;
      case "compare": setCompare(!state.compare); break;
      case "cmp-step": setCompareYear(state.compareYear + Number(el.dataset.step)); break;
      case "step": setYear(state.year + Number(el.dataset.step)); break;
      case "play": state.playing ? stopPlay() : startPlay(); break;
      case "help": $("#help-dialog").showModal(); break;
      case "about": $("#about-dialog").showModal(); break;
      case "tours": $("#tours-dialog").showModal(); break;
      case "dialog-close": el.closest("dialog").close(); break;
      case "theme": setTheme(state.theme === "dark" ? "light" : "dark"); break;
      case "share":
        navigator.clipboard?.writeText(location.href).then(() => toast(t("toast.copied")), () => toast(location.href));
        break;
      case "saved":
        state.tab = "saved";
        syncTabs();
        setMode("maps");
        if (!state.panelOpen) togglePanel(true);
        openSheet();
        renderSaved();
        break;
      case "panel-toggle":
        if (isPhone()) setSheet(state.sheet === "peek" ? "half" : "peek");
        else togglePanel();
        break;
      case "sheet-cycle": setSheet({ peek: "half", half: "full", full: "peek" }[state.sheet]); break;
      case "close-region":
        $("#region-card").hidden = true;
        if (selectedId != null) map.setFeatureState({ source: "hist", id: selectedId }, { sel: false });
        selectedId = null;
        break;
      case "region-maps":
        state.query = $("#region-card").dataset.name;
        state.tab = "all";
        syncTabs();
        setMode("maps");
        if (!state.panelOpen) togglePanel(true);
        openSheet();
        refreshMaps();
        break;
      case "retry": lastKey = null; refreshMaps(); break;
      case "viewer-close": closeViewer(); break;
      case "ov-fit": fitOverlay(); break;
      case "ov-remove": removeOverlay(); break;
      case "tour-next": goStop(state.tourStop + 1); break;
      case "tour-prev": goStop(state.tourStop - 1); break;
      case "tour-end": endTour(); break;
      case "hero-spin":
        hero.paused = !hero.paused;
        syncSpinButton();
        if (!hero.paused) showEra((hero.idx + 1) % SHOWCASE.length, true);
        scheduleHero();
        break;
      case "quiz-start": startQuiz(); break;
      case "quiz-close": closeQuiz(); break;
      case "quiz-next": nextQuestion(); break;
      case "quiz-skip": {
        const q = quiz.questions[quiz.i];
        endClick();
        highlightByName(q.target);
        $("#quiz-ask")?.remove();
        showAfter(false, q.target, "");
        break;
      }
    }
  }

  function wireUI() {
    document.addEventListener("click", (e) => {
      const go = e.target.closest("[data-go]");
      if (go) {
        e.preventDefault();
        if (go.dataset.go === "maps") { state.tab = "all"; syncTabs(); }
        setMode(go.dataset.go);
        return;
      }
      const tour = e.target.closest("[data-tour]");
      if (tour) { e.preventDefault(); startTour(tour.dataset.tour); return; }
      const city = e.target.closest("[data-city]");
      if (city) { e.preventDefault(); goCity(city.dataset.city); return; }
      const opt = e.target.closest("#quiz-body [data-opt]");
      if (opt) { e.preventDefault(); answerChoice(+opt.dataset.opt); return; }
      const act = e.target.closest("[data-action]");
      if (act) { e.preventDefault(); onAction(act.dataset.action, act); }
    });

    const cards = $("#cards");
    cards.addEventListener("click", (e) => {
      const fav = e.target.closest("[data-fav]");
      if (fav) { e.stopPropagation(); toggleFav(fav.dataset.fav); return; }
      const ov = e.target.closest("[data-overlay]");
      if (ov) { e.stopPropagation(); overlayMap(itemIndex[ov.dataset.overlay]); if (isPhone()) setSheet("peek"); return; }
      const card = e.target.closest(".card[data-id]");
      if (card) openViewer(itemIndex[card.dataset.id]);
    });
    cards.addEventListener("keydown", (e) => {
      const card = e.target.closest(".card[data-id]");
      if (card && e.key === "Enter") openViewer(itemIndex[card.dataset.id]);
    });
    cards.addEventListener("mouseover", (e) => {
      const card = e.target.closest(".card[data-id]");
      showFootprint(card ? itemIndex[card.dataset.id] : null);
    });
    cards.addEventListener("mouseleave", () => showFootprint(null));

    $("#export-saved").addEventListener("click", exportSaved);
    $("#query-chip").addEventListener("click", () => { state.query = null; refreshMaps(); writeHash(); });
    $$(".tab").forEach((b) => b.addEventListener("click", () => {
      state.tab = b.dataset.tab;
      syncTabs();
      lastKey = null;
      refreshMaps();
    }));
    $("#window").addEventListener("change", (e) => { state.windowYrs = +e.target.value; refreshMaps(); });
    $("#source").addEventListener("change", (e) => { state.source = e.target.value; refreshMaps(); });
    $("#sort").addEventListener("change", (e) => { state.sort = e.target.value; refreshMaps(); });
    $("#lang").addEventListener("change", (e) => setLang(e.target.value));
    $("#ov-opacity").addEventListener("input", (e) => warp?.setOpacity(+e.target.value));

    // Viewer
    $("#v-fav").addEventListener("click", () => toggleFav(currentItem.id));
    $("#v-overlay").addEventListener("click", () => overlayMap(currentItem));
    $("#v-jump").addEventListener("click", () => { setYear(yearOf(currentItem)); closeViewer(); toast(t("toast.timeline", { y: currentItem.date })); });
    const saveNote = debounce((id, v) => {
      if (v.trim()) notes[id] = v; else delete notes[id];
      store.set("notes", notes);
    }, 400);
    $("#v-notes").addEventListener("input", (e) => saveNote(currentItem.id, e.target.value));
    $("#v-notes").addEventListener("keydown", (e) => e.stopPropagation());
    $("#viewer").addEventListener("close", () => {
      state.openMap = null;
      writeHash();
      if (currentItem) $$(`.card[data-id="${CSS.escape(currentItem.id)}"]`).forEach((c) => (c.outerHTML = cardHTML(currentItem)));
    });
    $$("dialog").forEach((d) => d.addEventListener("click", (e) => { if (e.target === d) d.close(); }));

    // Swipe the bottom sheet on phones.
    const grip = $(".sheet-grip");
    let startY = null;
    grip.addEventListener("touchstart", (e) => (startY = e.touches[0].clientY), { passive: true });
    grip.addEventListener("touchend", (e) => {
      if (startY == null) return;
      const dy = e.changedTouches[0].clientY - startY;
      startY = null;
      if (Math.abs(dy) < 30) return;
      const order = ["peek", "half", "full"];
      const i = order.indexOf(state.sheet) + (dy < 0 ? 1 : -1);
      setSheet(order[clamp(i, 0, 2)]);
    });

    document.addEventListener("keydown", (e) => {
      if (e.target.closest("input, textarea, select") || e.metaKey || e.ctrlKey || e.altKey) return;
      if ($$("dialog[open]").length) return; // dialogs handle Esc themselves
      switch (e.key) {
        case "ArrowLeft": case "ArrowRight":
          if (state.mode === "landing") return;
          e.preventDefault();
          setYear(state.year + (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 10 : 1));
          break;
        case " ":
          if (state.mode === "landing") return;
          e.preventDefault();
          state.playing ? stopPlay() : startPlay();
          break;
        case "/": e.preventDefault(); searchBox.focus(); break;
        case "b": case "B": setToggle("borders", !state.borders); break;
        case "t": case "T": setToggle("tint", !state.tint); break;
        case "c": case "C": setCompare(!state.compare); break;
        case "m": case "M": setMode("maps"); break;
        case "h": case "H": setMode("history"); break;
        case "?": $("#help-dialog").showModal(); break;
        case "Escape":
          if (!$("#quiz-card").hidden) closeQuiz();
          else if (state.compare) setCompare(false);
          else if (!$("#region-card").hidden) onAction("close-region");
          else if (overlayItem) removeOverlay();
          else if (state.tour) endTour();
          break;
      }
    });

    addEventListener("resize", debounce(() => {
      fitTicks();
      if (state.compare) placeSwipe(swipeX);
      if (state.mode === "landing") layoutHero();
    }, 100));
    for (const ev of ["mousedown", "touchstart", "wheel"]) map.on(ev, () => { if (state.mode === "landing") hero.touched = Date.now(); });
  }

  // ───────── Boot ─────────
  setSheet("half");
  applyI18n();
  updateFavCount();
  wireTimeline();
  wireSearch();
  wireSwipe();
  wireUI();

  setYear(parseYear(params.get("year") || "") ?? 1862, { refresh: false });
  if (params.get("q")) state.query = params.get("q");
  const initCmp = parseYear(params.get("cmp") || "");
  if (initCmp != null) state.compareYear = initCmp;

  map.on("load", () => {
    mapReady = true;
    tintBasemap(map);
    addHistoryLayers(map);
    map._snap = null;
    applyYear(map, state.year);
    wireRegionEvents();
    const mode = params.get("mode");
    if (mode === "maps" || mode === "history") setMode(mode);
    else startHero();
    if (initCmp != null) setCompare(true);
    const ov = params.get("ov");
    if (ov) Sources.allmapsItem(ov).then(overlayMap).catch(() => toast(t("toast.reopenFailed")));
    const mapId = params.get("map");
    if (mapId) itemFromId(mapId).then(openViewer).catch(() => toast(t("toast.reopenFailed")));
  });
  map.on("moveend", () => {
    writeHash();
    if (state.mode === "maps" && state.tab === "all") refreshMapsSoon();
  });
})();
