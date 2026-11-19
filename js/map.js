import { cmpMap } from "./compare.js";
import { BASE_TINT, BASEMAP, OHM_TILES, PALETTE, SNAPSHOT_LINES_BEFORE, SNAPSHOTS, SNAPSHOTS_URL } from "./constants.js";
import { snapFile, snapshotFor } from "./lib/time.js";

import { clearSelection } from "./regions.js";
import { fmtYear, params, state, t, toast } from "./state.js";
import { $, esc, hashStr } from "./util.js";

// ───────── Map setup ─────────
const initPos = (params.get("pos") || "").split("/").map(Number);
const hasPos = initPos.length === 3 && initPos.every(Number.isFinite);

export const MAP_OPTIONS = {
  style: BASEMAP,
  maxZoom: 14,
  maxPitch: 0, // the Allmaps warped layer doesn't support pitch
  attributionControl: false,
  validateStyle: false,
  fadeDuration: 150,
  pixelRatio: Math.min(devicePixelRatio, 2),
};
export const landing = !["maps", "history"].includes(params.get("mode"));
// Landing starts on the first era of the globe, so no tiles are fetched for a view that's about to move.
export const map = new maplibregl.Map({
  ...MAP_OPTIONS,
  container: "map",
  center: hasPos ? [initPos[2], initPos[1]] : landing ? [66, 38] : [38, 44],
  zoom: hasPos ? initPos[0] : landing ? 1.2 : 2.9,
});
// The trimmed basemap has no sprite; its one icon is the city dot.
export function drawCityDot(m) {
  m.on("styleimagemissing", (e) => {
    if (e.id !== "circle_11_black" || m.hasImage(e.id)) return;
    const size = 11,
      data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const d = Math.hypot(x - 5, y - 5);
        data[(y * size + x) * 4 + 3] = d < 2.2 ? 255 : d < 3 ? 120 : 0;
      }
    m.addImage(e.id, { width: size, height: size, data });
  });
}
drawCityDot(map);
map.addControl(
  new maplibregl.AttributionControl({
    compact: true,
    customAttribution:
      '<a href="https://www.openhistoricalmap.org/copyright" target="_blank">© OpenHistoricalMap</a> · <a href="https://github.com/aourednik/historical-basemaps" target="_blank">historical-basemaps</a> · <a href="https://allmaps.org" target="_blank">Allmaps</a> · <a href="https://www.loc.gov/maps/" target="_blank">LoC</a>',
  }),
  "bottom-right",
);

export let mapReady = false;
export function markMapReady() {
  mapReady = true;
}

export const EMPTY = { type: "FeatureCollection", features: [] };
export const firstSymbolId = (m) => m.getStyle().layers.find((l) => l.type === "symbol")?.id;

export function tintBasemap(m) {
  const c = BASE_TINT[state.theme];
  m.setPaintProperty("background", "background-color", c.land);
  m.setPaintProperty("water", "fill-color", c.water);
  m.setPaintProperty("waterway", "line-color", c.waterway);
  for (const id of ["landcover_ice_shelf", "landcover_glacier"]) m.setPaintProperty(id, "fill-color", c.ice);
  const local =
    state.lang === "en"
      ? ["coalesce", ["get", "name:en"], ["get", "name:latin"], ["get", "name"]]
      : ["coalesce", ["get", `name:${state.lang}`], ["get", "name:en"], ["get", "name:latin"], ["get", "name"]];
  for (const id of [
    "label_city",
    "label_city_capital",
    "label_town",
    "label_village",
    "label_other",
    "water_name_point_label",
    "water_name_line_label",
  ]) {
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

export function addHistoryLayers(m) {
  const before = firstSymbolId(m);
  const sel = ["boolean", ["feature-state", "sel"], false];
  const hov = ["boolean", ["feature-state", "hover"], false];

  // Soft colour tint from dated snapshots
  m.addSource("hist", { type: "geojson", data: EMPTY, generateId: true, maxzoom: 8, tolerance: 0.6, buffer: 32 });
  m.addSource("hist-labels", { type: "geojson", data: EMPTY, maxzoom: 6 });
  m.addLayer(
    {
      id: "hist-fill",
      type: "fill",
      source: "hist",
      paint: { "fill-color": fillColorExpr(), "fill-opacity": ["case", sel, 0.75, hov, 0.62, ["get", "_op"]] },
    },
    before,
  );
  m.addLayer(
    {
      id: "hist-line",
      type: "line",
      source: "hist",
      paint: { "line-color": "#4a3421", "line-opacity": ["case", sel, 1, 0.45], "line-width": ["case", sel, 2.5, 0.8] },
    },
    before,
  );

  // Footprint of the hovered georeferenced map
  m.addSource("fp", { type: "geojson", data: EMPTY });
  m.addLayer({ id: "fp-fill", type: "fill", source: "fp", paint: { "fill-color": "#b3200f", "fill-opacity": 0.08 } });
  m.addLayer({
    id: "fp-line",
    type: "line",
    source: "fp",
    paint: { "line-color": "#b3200f", "line-width": 2, "line-dasharray": [2, 1.5] },
  });

  // Year-accurate borders from OpenHistoricalMap
  m.addSource("ohm", { type: "vector", tiles: [OHM_TILES], maxzoom: 10, attribution: "" });
  const adm = (lv) => ["all", ["==", ["get", "type"], "administrative"], lv];
  m.addLayer({
    id: "ohm-adm4",
    type: "line",
    source: "ohm",
    "source-layer": "land_ohm_lines",
    minzoom: 5,
    filter: adm(["==", ["get", "admin_level"], 4]),
    paint: {
      "line-color": "#7a2e1c",
      "line-opacity": 0.55,
      "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.5, 8, 1.2],
      "line-dasharray": [3, 2],
    },
  });
  m.addLayer({
    id: "ohm-adm2",
    type: "line",
    source: "ohm",
    "source-layer": "land_ohm_lines",
    filter: adm(["in", ["get", "admin_level"], ["literal", [1, 2]]]),
    paint: { "line-color": "#7a2e1c", "line-opacity": 0.85, "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.7, 6, 2] },
  });
  m.addLayer({
    id: "hist-label",
    type: "symbol",
    source: "hist-labels",
    layout: {
      "text-field": ["get", "name"],
      "text-font": ["Noto Sans Italic"],
      "text-size": [
        "interpolate",
        ["linear"],
        ["zoom"],
        1,
        ["case", [">", ["get", "area"], 150], 12, 9.5],
        6,
        ["case", [">", ["get", "area"], 2], 16, 12],
      ],
      "text-max-width": 7,
      "symbol-sort-key": ["-", 0, ["get", "area"]],
      "text-padding": 4,
    },
    paint: { "text-color": "#4a3421", "text-halo-color": "#f6f2ea", "text-halo-width": 1.6, "text-opacity": 0.85 },
  });
  m.addLayer({
    id: "ohm-label-4",
    type: "symbol",
    source: "ohm",
    "source-layer": "land_ohm_centroids",
    minzoom: 5,
    filter: adm(["==", ["get", "admin_level"], 4]),
    layout: {
      "text-field": ohmNameExpr(),
      "text-font": ["Noto Sans Italic"],
      "text-size": 11.5,
      "text-max-width": 8,
      "symbol-sort-key": ["-", 0, ["coalesce", ["get", "area"], 0]],
    },
    paint: { "text-color": "#4a3421", "text-halo-color": "#f6f2ea", "text-halo-width": 1.4 },
  });
  m.addLayer({
    id: "ohm-label",
    type: "symbol",
    source: "ohm",
    "source-layer": "land_ohm_centroids",
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
// Changing a filter makes the map re-read every loaded tile, so a drag or Play
// updates the map a few times a second; the timeline itself still moves instantly.
export function applyYear(m, year) {
  if (!m?._baseFilters) return;
  m._wantYear = year;
  if (m._yearTimer) return;
  drawYear(m, year);
  m._yearTimer = setTimeout(() => {
    m._yearTimer = null;
    if (m._wantYear !== m._drawnYear) applyYear(m, m._wantYear);
  }, 200);
}

function drawYear(m, year) {
  m._drawnYear = year;
  const d = year + 0.5;
  const alive = [
    "all",
    ["any", ["!", ["has", "start_decdate"]], ["<=", ["get", "start_decdate"], d]],
    ["any", ["!", ["has", "end_decdate"]], [">", ["get", "end_decdate"], d]],
  ];
  for (const [id, base] of Object.entries(m._baseFilters)) m.setFilter(id, ["all", base, alive], { validate: false });
  setTint(m, year);
  updateMix(m, year);
}

// Which layers are visible, given the toggles and how well OHM covers the era.
export function updateMix(m, year = state.year) {
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

// Label positions come pre-computed in the data files (tools/build-data.mjs).
function prepGeo(d) {
  for (const f of d.polys.features) {
    const p = f.properties;
    p._ci = p.NAME ? hashStr(p.NAME) % PALETTE.light.length : -1;
    p._op = p.NAME ? 0.42 : 0.2;
  }
  return d;
}

function loadSnapshot(s) {
  if (!geoCache.has(s)) {
    geoCache.set(
      s,
      fetch(`${SNAPSHOTS_URL}${snapFile(s)}.json`)
        .then((r) => {
          if (!r.ok) throw new Error(r.status);
          return r.json();
        })
        .then(prepGeo)
        .catch((e) => {
          geoCache.delete(s);
          throw e;
        }),
    );
  }
  return geoCache.get(s);
}

// Quietly fetch what's likely next, unless the visitor asked to save data.
const whenIdle = window.requestIdleCallback || ((fn) => setTimeout(fn, 300));
export function warmSnapshots(list) {
  if (navigator.connection?.saveData) return;
  whenIdle(() => list.forEach((n) => n != null && loadSnapshot(n).catch(() => {})));
}

function setTint(m, year) {
  if (!m?.getSource("hist")) return;
  const s = snapshotFor(year);
  if (m._snap === s) return;
  m._snap = s;
  if (m === map) {
    updatePill();
    setTintStatus("loading");
  }
  loadSnapshot(s)
    .then((d) => {
      if (m._snap !== s) return;
      if (m === map) clearSelection();
      m._snapData = d.polys;
      m.getSource("hist").setData(d.polys);
      m.getSource("hist-labels").setData(d.labels);
      if (m === map) setTintStatus("ok");
      const i = SNAPSHOTS.indexOf(s);
      if (state.mode !== "landing") warmSnapshots([SNAPSHOTS[i - 1], SNAPSHOTS[i + 1]]);
    })
    .catch(() => {
      if (m === map) setTintStatus("failed", s);
      m._snap = null;
    });
}

// The year dims while its border file loads; a failure leaves a Retry button in the pill.
/** @param {"loading" | "ok" | "failed"} status @param {number} [snap] */
function setTintStatus(status, snap) {
  document.body.classList.toggle("tint-loading", status === "loading");
  $("#borders-loading").hidden = status !== "loading";
  $("#borders-retry").hidden = status !== "failed";
  if (status === "failed") {
    $("#pill-text").textContent = t("pill.failed", { year: fmtYear(/** @type {number} */ (snap)) });
    toast(t("toast.bordersFailed", { y: fmtYear(/** @type {number} */ (snap)) }));
  }
}

export function retryTint() {
  map._snap = null;
  map._drawnYear = null;
  applyYear(map, state.year);
}

export function updatePill() {
  $("#pill-text").innerHTML =
    `${esc(t("pill.borders", { year: fmtYear(state.year) }))} <span class="muted">· ${esc(t("pill.tint", { snap: fmtYear(snapshotFor(state.year)) }))}</span>`;
}

export function setToggle(kind, on) {
  state[kind] = on;
  $(`#${kind === "borders" ? "borders" : "tint"}-btn`).classList.toggle("on", on);
  for (const m of [map, cmpMap]) updateMix(m, m === cmpMap ? state.compareYear : state.year);
}
