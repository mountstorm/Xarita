import { MAX_YEAR, MIN_YEAR, SNAPSHOTS } from "./constants.js";
import { fracToYear, parseYear, yearToFrac } from "./lib/time.js";
import { applyYear, map, updatePill } from "./map.js";
import { refreshMapsSoon } from "./panel.js";
import { announce, fmtYear, state, t } from "./state.js";
import { writeHash } from "./ui.js";
import { $, clamp } from "./util.js";

export function buildTicks() {
  const out = [];
  const KEY = [-3000, 1, 1000, 1500, 2000]; // the only labels kept on a narrow track
  const tick = (y, cls = "") => out.push(`<i class="${cls}" style="left:${yearToFrac(y) * 100}%"></i>`);
  const label = (y, txt, opt) =>
    out.push(
      `<span class="${opt ? "opt" : ""} ${KEY.includes(y) ? "key" : ""} ${y < 0 ? "deep" : ""}" style="left:${yearToFrac(y) * 100}%">${txt}</span>`,
    );
  for (let y = -3000; y < 0; y += 500) tick(y, y % 1000 === 0 ? "major" : "");
  for (let y = 100; y < 1000; y += 100) tick(y, y % 500 === 0 ? "major" : "");
  for (let y = 1000; y < 1500; y += 25) tick(y, y % 100 === 0 ? "major" : "");
  for (let y = 1500; y <= 2010; y += 10) tick(y, y % 50 === 0 ? "major" : "");
  tick(1, "era");
  label(-3000, fmtYear(-3000));
  if (state.lang === "en") label(-1500, fmtYear(-1500), true); // too long to fit in uz/ru
  label(1, t("year.ad1"));
  label(500, "500", true);
  label(1000, "1000");
  for (let y = 1100; y < 1500; y += 100) label(y, y, y % 200 === 100);
  for (let y = 1500; y <= 2000; y += 50) label(y, y, y % 100 === 50);
  $("#tl-ticks").innerHTML = out.join("");
  $("#tl-snaps").innerHTML = SNAPSHOTS.map((s) => `<b style="left:${yearToFrac(s) * 100}%"></b>`).join("");
  fitTicks();
}

// Label density follows the track's real width (it shrinks when the panel is open).
export function fitTicks() {
  const w = $("#tl-track").clientWidth;
  const tl = $("#timeline");
  tl.classList.toggle("tl-narrow", w < 600);
  tl.classList.toggle("tl-mid", w >= 600 && w < 1000);
}

// ───────── Timeline UI ─────────
const thumb = $("#tl-thumb");
export const yearInput = $("#year-input");

export function setYear(y, { refresh = true } = {}) {
  y = clamp(Math.round(y), MIN_YEAR, MAX_YEAR);
  if (y === 0) y = y < state.year ? -1 : 1;
  state.year = y;
  thumb.style.left = `${yearToFrac(y) * 100}%`;
  if (document.activeElement !== yearInput) yearInput.value = fmtYear(y);
  thumb.setAttribute("aria-valuenow", y);
  thumb.setAttribute("aria-valuetext", fmtYear(y));
  $("#swipe-left-label").textContent = fmtYear(y);
  applyYear(map, y);
  updatePill();
  writeHash();
  if (state.mode !== "landing" && !state.playing) announce(t("a11y.year", { year: fmtYear(y) }));
  if (refresh && !state.playing) refreshMapsSoon();
}

export function wireTimeline() {
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
export function startPlay() {
  if (state.year >= MAX_YEAR) setYear(MIN_YEAR, { refresh: false });
  state.playing = true;
  document.body.classList.add("playing");
  playTimer = setInterval(() => {
    const next = state.year + playStep(state.year);
    if (next >= MAX_YEAR) {
      setYear(MAX_YEAR, { refresh: false });
      stopPlay();
      return;
    }
    setYear(next, { refresh: false });
  }, 120);
}
export function stopPlay() {
  if (!state.playing) return;
  state.playing = false;
  clearInterval(playTimer);
  document.body.classList.remove("playing");
  refreshMapsSoon();
}
