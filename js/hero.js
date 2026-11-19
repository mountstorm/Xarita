import { CITIES, chipHTML, FIRST_ERA, SHOWCASE } from "./data/hero.js";
import { snapshotFor } from "./lib/time.js";
import { map, mapReady, warmSnapshots } from "./map.js";
import { fmtYear, state, t } from "./state.js";
import { setYear } from "./timeline.js";
import { setMode, setSheet, syncTabs } from "./ui.js";
import { $, clamp, esc, isPhone } from "./util.js";

// ───────── Hero: a globe that steps through eras ─────────
// Each era turns the globe to where that story happens and sets the real year,
// so the borders on screen are the actual data, not a picture.
export { SHOWCASE };

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
export const hero = { timer: null, idx: FIRST_ERA, paused: reduceMotion, touched: 0 };

export function renderHero() {
  $("#hero-chips").innerHTML = CITIES.map((c) => chipHTML(c, esc(t(`city.${c.key}`)), esc(fmtYear(c.year)))).join("");
  $("#hero-year").textContent = fmtYear(SHOWCASE[hero.idx].year);
  $("#hero-caption").textContent = t(`show.${SHOWCASE[hero.idx].year}`);
  syncSpinButton();
}

export function syncSpinButton() {
  const b = $("#hero-spin");
  b.textContent = hero.paused ? "▶" : "❚❚";
  const label = t(hero.paused ? "hero.play" : "hero.pause");
  b.title = label;
  b.setAttribute("aria-label", label);
}

// Size the globe to the room below the headline. It may rise a little behind the
// text and sink behind the bottom row's empty middle; the vignette follows it.
export function layoutHero() {
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

export function showEra(i, animate) {
  hero.idx = i;
  const s = SHOWCASE[i];
  setYear(s.year, { refresh: false });
  const y = $("#hero-year");
  y.classList.add("flip");
  setTimeout(
    () => {
      y.textContent = fmtYear(s.year);
      $("#hero-caption").textContent = t(`show.${s.year}`);
      y.classList.remove("flip");
    },
    animate ? 260 : 0,
  );
  if (animate) map.easeTo({ center: s.center, duration: 3000, easing: (k) => k * (2 - k) });
  else map.jumpTo({ center: s.center });
  warmSnapshots([snapshotFor(SHOWCASE[(i + 1) % SHOWCASE.length].year)]);
}

export function scheduleHero() {
  clearTimeout(hero.timer);
  if (hero.paused || state.mode !== "landing") return;
  hero.timer = setTimeout(() => {
    // Let someone who is dragging the globe finish before moving it.
    if (!document.hidden && Date.now() - hero.touched > 5000) showEra((hero.idx + 1) % SHOWCASE.length, true);
    scheduleHero();
  }, 4600);
}

export function startHero() {
  if (!mapReady) return; // the load handler starts it
  map.setProjection({ type: "globe" });
  layoutHero();
  showEra(hero.idx, false);
  scheduleHero();
}

export function stopHero() {
  clearTimeout(hero.timer);
  map.stop();
  map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
  if (!state.globe) map.setProjection({ type: "mercator" });
  const c = map.getCenter();
  map.jumpTo({ center: [c.lng, clamp(c.lat, -55, 65)], zoom: Math.max(map.getZoom(), isPhone() ? 1.6 : 2.6) });
}

export function goCity(key) {
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
