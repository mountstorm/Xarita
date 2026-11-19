import { LANGS } from "./constants.js";
import { I18N } from "./data/i18n.js";
import { $, debounce, store } from "./util.js";

// ───────── State ─────────
export const params = new URLSearchParams(location.hash.slice(1));
const browserLang = (navigator.language || "en").slice(0, 2);
export const state = {
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
export const favs = store.get("favs", {});
export const notes = store.get("notes", {});
document.documentElement.dataset.theme = state.theme;

// ───────── i18n ─────────
export function t(key, vars) {
  const dict = I18N[state.lang] || I18N.en;
  let s = dict[key] ?? I18N.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}
export const L = (obj) => (obj && typeof obj === "object" ? obj[state.lang] || obj.en : obj);
export const fmtYear = (y) => (y < 0 ? t("year.bc", { y: -y }) : String(y));

export function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (el.hidden = true), 2600);
}
// Screen readers hear a change once it settles, not every step of a drag.
export const announce = debounce((/** @type {string} */ text) => {
  $("#sr-status").textContent = text;
}, 700);

export function busy(msg) {
  const el = $("#busy");
  el.hidden = !msg;
  el.textContent = msg || "";
}
