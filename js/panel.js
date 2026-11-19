import { NOMINATIM } from "./constants.js";
import { EMPTY, map } from "./map.js";
import { Sources } from "./sources.js";
import { announce, favs, fmtYear, notes, state, t, toast } from "./state.js";
import { $, $$, debounce, esc, sleep, store } from "./util.js";
import { currentItem, syncViewerFav } from "./viewer.js";

// ───────── Nominatim (one request per second, per its policy) ─────────
let lastNominatim = 0;
const reverseCache = new Map();
export async function nominatim(path, lang = state.lang) {
  const wait = lastNominatim + 1100 - Date.now();
  lastNominatim = Date.now() + Math.max(0, wait);
  if (wait > 0) await sleep(wait);
  const r = await fetch(`${NOMINATIM + path}&accept-language=${lang}`);
  if (!r.ok) throw new Error(`nominatim ${r.status}`);
  return r.json();
}

// English place name under the crosshair, used as the LoC catalogue query.
async function placeAtCenter() {
  const c = map.getCenter();
  const z = map.getZoom();
  const level = z < 4.3 ? 3 : z < 7 ? 5 : 10;
  const key = `${level}:${c.lat.toFixed(level === 3 ? 0 : 1)}:${c.lng.toFixed(level === 3 ? 0 : 1)}`;
  if (!reverseCache.has(key)) {
    reverseCache.set(
      key,
      nominatim(`/reverse?format=jsonv2&zoom=${level}&lat=${c.lat}&lon=${c.lng}`, "en")
        .then((j) => {
          const a = j.address || {};
          if (level === 3) return a.country || null;
          if (level === 5) return a.state || a.region || a.country || null;
          return a.city || a.town || a.county || a.state || a.country || null;
        })
        .catch(() => {
          reverseCache.delete(key);
          return null;
        }),
    );
  }
  return reverseCache.get(key);
}

// ───────── Maps panel: Allmaps (by area) + Library of Congress (by name) ─────────
let panelAbort = null;
let panelToken = 0;
let lastKey = null;
export function resetPanelKey() {
  lastKey = null;
}
export const itemIndex = {};
export const refreshMapsSoon = debounce(() => refreshMaps(), 650);

export const yearOf = (it) => parseInt(it.date, 10) || null;

function sortItems(list) {
  const k = state.sort;
  return list.sort((a, b) => {
    const ya = yearOf(a) ?? 1e9,
      yb = yearOf(b) ?? 1e9;
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
  if (areaJob?.key === key) {
    areaJob.onUpdate = onUpdate;
    return areaJob.promise;
  }
  areaJob?.ctl.abort();
  const job = { key, ctl: new AbortController(), onUpdate };
  job.promise = Sources.searchAllmaps(bb, { key, signal: job.ctl.signal, onUpdate: (it) => job.onUpdate?.(it) });
  job.promise.catch(() => {
    if (areaJob === job) areaJob = null;
  });
  areaJob = job;
  return job.promise;
}

function skeletonCards() {
  return Array.from(
    { length: 4 },
    () =>
      `<li class="card skel"><div><span class="skeleton"></span><span class="skeleton" style="width:70%"></span><span class="skeleton" style="width:40%;margin-top:14px"></span></div><div class="thumb"></div></li>`,
  ).join("");
}

const throttle = (fn, ms) => {
  let t = null;
  return () => {
    if (!t)
      t = setTimeout(() => {
        t = null;
        fn();
      }, ms);
  };
};

export async function refreshMaps() {
  if (state.mode !== "maps") return;
  if (state.tab === "saved") return renderSaved();
  const cards = $("#cards");
  const from = state.year - state.windowYrs,
    to = state.year + state.windowYrs;
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
  const view = {
    from,
    to,
    wantGeo: state.source !== "loc",
    wantLoc: state.source !== "allmaps",
    geo: null,
    loc: null,
    geoFailed: false,
    locFailed: false,
  };
  const paint = () => {
    if (token === panelToken) renderPanel(view);
  };
  const paintSoon = throttle(paint, 250);

  if (view.wantGeo) {
    allmapsForView(paintSoon)
      .then((res) => {
        view.geo = res;
        paint();
        return res.done;
      })
      .then(paint)
      .catch(() => {
        view.geoFailed = true;
        paint();
      });
  }
  if (view.wantLoc) {
    (async () => {
      const q = state.query ?? (await placeAtCenter()) ?? "world";
      view.loc = await Sources.searchLoc({ q, from, to, signal });
      paint();
    })().catch(() => {
      view.locFailed = true;
      paint();
    });
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
    const offline = !navigator.onLine;
    cards.innerHTML = `<li class="empty"><b>${esc(t(offline ? "empty.offlineTitle" : "empty.downTitle"))}</b>${esc(t(offline ? "empty.offlineBody" : "empty.downBody"))}<br><br><button class="btn btn-ghost btn-sm" data-action="retry">${esc(t("empty.retry"))}</button></li>`;
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
  const inWindow = (it) => {
    const y = yearOf(it);
    return y != null && y >= from && y <= to;
  };
  const list = sortItems([...geo.filter(inWindow), ...(view.loc?.items || [])]);
  const undated = geo.filter((it) => yearOf(it) == null).slice(0, 12);
  const libs = new Set([...list, ...undated, ...pending].map((it) => it.provider)).size;
  const settled = geoSettled && locSettled;

  let html = "";
  if (list.length) {
    html = list.map(cardHTML).join("");
  } else if (settled) {
    const near = geo
      .filter((it) => yearOf(it) != null)
      .sort((a, b) => Math.abs(yearOf(a) - state.year) - Math.abs(yearOf(b) - state.year))
      .slice(0, 12);
    html = near.length
      ? `<li class="group"><b>${esc(t("empty.nearestTitle", { from: fmtYear(Math.max(from, 1)), to }))}</b>${esc(t("empty.nearestBody"))}</li>${near.map(cardHTML).join("")}`
      : undated.length
        ? ""
        : `<li class="empty"><b>${esc(t("empty.noneTitle"))}</b>${esc(t("empty.noneBody"))}</li>`;
    near.forEach((it) => (itemIndex[it.id] = it));
  } else {
    html = `${skeletonCards().split("</li>").slice(0, 2).join("</li>")}</li>`;
  }
  if (pending.length) {
    html += `<li class="group loading"><span class="loading-dot"></span> ${esc(t("panel.reading", { done: all.length - pending.length, total: all.length }))}</li>`;
  }
  if (undated.length)
    html += `<li class="group"><b>${esc(t("card.undated"))}</b>📍 ${esc(t("card.pinned"))}</li>${undated.map(cardHTML).join("")}`;

  [...list, ...undated].forEach((it) => (itemIndex[it.id] = it));
  // Skip identical repaints so a card being clicked isn't swapped out from under the pointer.
  if (cards.dataset.html !== html) {
    const scroll = cards.scrollTop;
    cards.innerHTML = html;
    cards.scrollTop = scroll;
    cards.dataset.html = html;
  }
  if (settled && cards.dataset.filled !== "1") announce(`${list.length} · ${t("panel.title", { place: "" }).trim()}`);
  cards.dataset.filled = settled ? "1" : "0";
  const count = `${t("panel.count", { n: list.length, from: fmtYear(Math.max(from, 1)), to })} · ${t("panel.libs", { n: libs })}`;
  const progress = view.geo
    ? t("panel.reading", { done: all.length - pending.length, total: all.length })
    : t("panel.reading", { done: 0, total: "…" }); // area results not back yet
  $("#panel-sub").textContent = settled || (view.geo && !pending.length) ? count : `${count} · ${progress}`;
}

export function cardHTML(it) {
  const fav = !!favs[it.id];
  const title = it.title || t("mapFrom", { provider: it.provider });
  const geo = it.src === "allmaps";
  return `<li class="card" tabindex="0" data-id="${esc(it.id)}">
    <div>
      <h3>${esc(title)}</h3>
      <div class="meta">${esc(it.date || t("card.undated"))}${it.by ? ` | ${esc(it.by)}` : ""}</div>
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
    <img class="thumb" loading="lazy" decoding="async" src="${esc(it.thumb)}" alt="" onerror="this.style.visibility='hidden'">
  </li>`;
}

export function renderSaved() {
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

export function toggleFav(id) {
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
export const updateFavCount = () => {
  const n = Object.keys(favs).length;
  $("#fav-count").textContent = String(n);
  // Its accessible name must contain the visible text, count included.
  $("#my-maps-btn").setAttribute("aria-label", `${t("top.myMaps")} ${n}`);
};

export function exportSaved() {
  const data = Object.values(favs).map((f) => ({ ...f, notes: notes[f.id] || "" }));
  const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), maps: data }, null, 2)], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "xarita-my-maps.json" });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Footprint of a georeferenced map while its card is hovered.
export function showFootprint(it) {
  const src = map.getSource("fp");
  if (!src) return;
  if (!it?.bbox) return src.setData(EMPTY);
  const [w, s, e, n] = it.bbox;
  src.setData({
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [w, s],
          [e, s],
          [e, n],
          [w, n],
          [w, s],
        ],
      ],
    },
  });
}
