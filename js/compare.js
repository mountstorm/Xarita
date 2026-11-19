import { MAX_YEAR, MIN_YEAR } from "./constants.js";
import { parseYear } from "./lib/time.js";
import { addHistoryLayers, applyYear, drawCityDot, MAP_OPTIONS, map, tintBasemap } from "./map.js";
import { fmtYear, state } from "./state.js";
import { setMode, writeHash } from "./ui.js";
import { $, clamp } from "./util.js";

// ───────── Compare (swipe between two years) ─────────
export let swipeX = null;
export let cmpMap = null;

export function placeSwipe(x) {
  const w = $("#map").clientWidth;
  swipeX = clamp(x ?? w / 2, 40, w - 40);
  $("#swipe").style.left = `${swipeX}px`;
  $("#map-compare").style.clipPath = `inset(0 0 0 ${swipeX}px)`;
}

export function setCompare(on) {
  state.compare = on;
  $("#compare-btn").classList.toggle("on", on);
  $("#compare-bar").hidden = !on;
  $("#swipe").hidden = !on;
  $("#map-compare").hidden = !on;
  if (on && state.mode === "landing") setMode("history");
  if (!on) {
    writeHash();
    return;
  }
  $("#compare-year").value = fmtYear(state.compareYear);
  $("#swipe-right-label").textContent = fmtYear(state.compareYear);
  if (!cmpMap) {
    cmpMap = new maplibregl.Map({
      ...MAP_OPTIONS,
      container: "map-compare",
      center: map.getCenter(),
      zoom: map.getZoom(),
      bearing: map.getBearing(),
    });
    drawCityDot(cmpMap);
    cmpMap.once("style.load", () => {
      tintBasemap(cmpMap);
      addHistoryLayers(cmpMap);
      if (state.globe) cmpMap.setProjection({ type: "globe" });
      applyYear(cmpMap, state.compareYear);
    });
    let syncing = false;
    const link = (a, b) =>
      a.on("move", () => {
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

export function setCompareYear(y) {
  y = clamp(y, MIN_YEAR, MAX_YEAR) || 1;
  state.compareYear = y;
  $("#compare-year").value = fmtYear(y);
  $("#swipe-right-label").textContent = fmtYear(y);
  applyYear(cmpMap, y);
  writeHash();
}

export function wireSwipe() {
  const handle = $(".swipe-handle");
  let drag = false;
  handle.addEventListener("pointerdown", (e) => {
    drag = true;
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const r = $("#map").getBoundingClientRect();
    placeSwipe(e.clientX - r.left);
  });
  handle.addEventListener("pointerup", () => (drag = false));
  $("#compare-year").addEventListener("change", (e) => setCompareYear(parseYear(e.target.value) ?? state.compareYear));
  $("#compare-year").addEventListener("keydown", (e) => {
    if (e.key === "Enter") e.target.blur();
    e.stopPropagation();
  });
}
