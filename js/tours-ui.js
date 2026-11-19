import { TOURS } from "./data/tours.js";
import { map } from "./map.js";
import { announce, fmtYear, L, state, t } from "./state.js";
import { setYear, stopPlay } from "./timeline.js";
import { setMode, setSheet, syncTabs, togglePanel } from "./ui.js";
import { $, $$, clamp, esc, isPhone } from "./util.js";

// ───────── Tours ─────────
export function renderTourList() {
  $("#tour-list").innerHTML = TOURS.map(
    (tr) =>
      `<li><button data-tour="${tr.id}"><b>${esc(L(tr.name))}</b><span>${esc(L(tr.blurb))} · ${esc(t("tours.stops", { n: tr.stops.length }))}</span></button></li>`,
  ).join("");
  $("#hero-tour-name").textContent = L(TOURS[0].name);
}

export function startTour(id) {
  const tr = TOURS.find((x) => x.id === id);
  if (!tr) return;
  $$("dialog[open]").forEach((d) => d.close());
  state.tour = tr;
  goStop(0);
}

export function renderTourCard() {
  const tr = state.tour;
  if (!tr) return;
  const i = state.tourStop;
  const s = tr.stops[i];
  $("#tour-card").hidden = false;
  $("#tour-name").textContent = L(tr.name);
  $("#tour-title").textContent = L(s.title);
  announce(t("a11y.tour", { title: L(s.title) }));
  $("#tour-year").textContent = `${fmtYear(s.year)} · ${t("tour.stopOf", { i: i + 1, n: tr.stops.length })}`;
  $("#tour-text").textContent = L(s.text);
  $("#tour-dots").innerHTML = tr.stops.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("");
  $("#tour-next").textContent = t(i === tr.stops.length - 1 ? "tour.finish" : "tour.next");
  $('[data-action="tour-prev"]').disabled = i === 0;
}

export function goStop(i) {
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

export function endTour() {
  state.tour = null;
  $("#tour-card").hidden = true;
}
