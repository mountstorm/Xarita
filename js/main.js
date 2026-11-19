import { setCompare, wireSwipe } from "./compare.js";
import { hero, SHOWCASE, startHero } from "./hero.js";
import { parseYear } from "./lib/time.js";
import { addHistoryLayers, applyYear, landing, map, markMapReady, tintBasemap } from "./map.js";
import { overlayMap } from "./overlay.js";
import { refreshMapsSoon, updateFavCount } from "./panel.js";
import { wireRegionEvents } from "./regions.js";
import { wireSearch } from "./search.js";
import { Sources } from "./sources.js";
import { params, state, t, toast } from "./state.js";
import { setYear, wireTimeline } from "./timeline.js";
import { applyI18n, setMode, setSheet, wireUI, writeHash } from "./ui.js";
import { $ } from "./util.js";
import { itemFromId, openViewer } from "./viewer.js";

// ───────── Boot ─────────
setSheet("half");
applyI18n();
updateFavCount();
wireTimeline();
wireSearch();
wireSwipe();
wireUI();

setYear(parseYear(params.get("year") || "") ?? (landing ? SHOWCASE[hero.idx].year : 1862), { refresh: false });
if (params.get("q")) state.query = params.get("q");
const initCmp = parseYear(params.get("cmp") || "");
if (initCmp != null) state.compareYear = initCmp;

// style.load, not load: colours and borders go on before the first tiles are drawn.
map.once("style.load", () => {
  markMapReady();
  tintBasemap(map);
  addHistoryLayers(map);
  map._snap = null;
  applyYear(map, state.year);
  wireRegionEvents();
  if (landing) startHero();
  else setMode(params.get("mode"));
  if (initCmp != null) setCompare(true);
  const op = params.get("op");
  if (op) $("#ov-opacity").value = op;
  const ov = params.get("ov");
  if (ov)
    Sources.allmapsItem(ov)
      .then(overlayMap)
      .catch(() => toast(t("toast.reopenFailed")));
  const mapId = params.get("map");
  if (mapId)
    itemFromId(mapId)
      .then(openViewer)
      .catch(() => toast(t("toast.reopenFailed")));
});
map.on("moveend", () => {
  writeHash();
  if (state.mode === "maps" && state.tab === "all") refreshMapsSoon();
});

// OHM tiles come through our own function; if it struggles, say so once instead of failing silently.
let warnedTiles = false;
map.on("error", (e) => {
  if (e.sourceId !== "ohm" || warnedTiles) return;
  warnedTiles = true;
  toast(t("toast.tilesSlow"));
});

// Offline support: the app and the borders you've seen keep working on bad school Wi-Fi.
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
