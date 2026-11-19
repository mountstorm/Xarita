import { BASE_TINT, PALETTE } from "./constants.js";
import { neighbours, outerRings, pointInRing } from "./lib/geo.js";
import { map } from "./map.js";
import { quiz, quizMapClick } from "./quiz.js";
import { fmtYear, state, t } from "./state.js";
import { $, esc } from "./util.js";

// ───────── Region cards (OHM entity or tint snapshot) ─────────
export let selectedId = null;
export function setSelectedId(id) {
  selectedId = id;
}
let hoverId = null;
let regionToken = 0;
const wikiCache = new Map();
const tip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: "hover-tip", offset: 12 });

export function clearSelection() {
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
export function wikiSummary(nameEn, nameLocal) {
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
      const r = await fetch(
        "https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=1&srsearch=" +
          encodeURIComponent(`${nameEn} history`),
      );
      const title = (await r.json()).query?.search?.[0]?.title;
      en = title ? await wikiFetchSummary("en", title) : null;
    }
    if (!en || lang === "en") return en;
    // Follow the interlanguage link to the Uzbek / Russian article.
    const r = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&prop=langlinks&format=json&origin=*&lllang=${lang}&titles=${encodeURIComponent(en.title)}`,
    );
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
  return new Intl.DateTimeFormat(
    locale,
    m[3] ? { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" } : { year: "numeric", month: "long", timeZone: "UTC" },
  ).format(date);
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
  body.innerHTML =
    '<span class="skeleton"></span><span class="skeleton" style="width:80%"></span><span class="skeleton" style="width:60%"></span>';
  const token = ++regionToken;
  const s = await wikiSummary(nameEn || name, nameLocal);
  if (token !== regionToken) return;
  if (!s) {
    body.innerHTML = `<p>${esc(t("region.noWiki"))}</p>`;
    return;
  }
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
    meta: `${t("region.exact", { from: fmtDate(p.start_date), to: fmtDate(p.end_date) })} · OpenHistoricalMap`,
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

export function wireRegionEvents() {
  // Hover lookups are throttled, and skipped while the map is moving.
  let hoverEvent = null;
  map.on("mousemove", (e) => {
    if (hoverEvent === null)
      setTimeout(() => {
        const ev = hoverEvent;
        hoverEvent = null;
        if (!map.isMoving()) hoverAt(ev);
      }, 60);
    hoverEvent = e;
  });
  function hoverAt(e) {
    if (state.mode === "landing" || quiz.clickTarget) {
      tip.remove();
      return;
    }
    const pad = 8;
    const box = [
      [e.point.x - pad, e.point.y - pad],
      [e.point.x + pad, e.point.y + pad],
    ];
    const label = state.borders && map.queryRenderedFeatures(box, { layers: ["ohm-label", "ohm-label-4"] })[0];
    const fill = !label && state.tint && map.queryRenderedFeatures(e.point, { layers: ["hist-fill"] })[0];
    const newHover = fill ? fill.id : null;
    if (hoverId !== newHover) {
      if (hoverId != null) map.setFeatureState({ source: "hist", id: hoverId }, { hover: false });
      hoverId = newHover;
      if (hoverId != null) map.setFeatureState({ source: "hist", id: hoverId }, { hover: true });
    }
    const name = label
      ? label.properties[`name_${state.lang}`] || label.properties.name_en || label.properties.name
      : fill?.properties?.NAME;
    map.getCanvas().style.cursor = name ? "pointer" : "";
    if (name && matchMedia("(hover: hover)").matches) tip.setLngLat(e.lngLat).setText(name).addTo(map);
    else tip.remove();
  }
  map.on("mouseout", () => tip.remove());
  map.on("click", (e) => {
    if (state.mode === "landing") return;
    if (quiz.clickTarget) return quizMapClick(e);
    const pad = 12;
    const box = [
      [e.point.x - pad, e.point.y - pad],
      [e.point.x + pad, e.point.y + pad],
    ];
    const label = state.borders && map.queryRenderedFeatures(box, { layers: ["ohm-label", "ohm-label-4"] })[0];
    if (label) return selectOhm(label);
    const fill = state.tint && map.queryRenderedFeatures(e.point, { layers: ["hist-fill"] })[0];
    if (fill) selectTint(fill, e.lngLat);
  });
}

function tintAt(pt) {
  return (map._snapData?.features || []).find((f) => f.properties.NAME && outerRings(f).some((r) => pointInRing(pt, r))) || null;
}

// Named regions that touch f (vertices within ~0.35°), from the current snapshot.
export function neighboursOf(f) {
  return neighbours(f, map._snapData?.features || []);
}
