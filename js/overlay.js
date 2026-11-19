import { ALLMAPS_MAPLIBRE } from "./constants.js";
import { firstSymbolId, map } from "./map.js";
import { itemIndex, showFootprint, yearOf } from "./panel.js";
import { busy, state, t, toast } from "./state.js";
import { setYear } from "./timeline.js";
import { onAction, setMode, writeHash } from "./ui.js";
import { $, isPhone } from "./util.js";
import { closeViewer } from "./viewer.js";

// ───────── Overlay: warp a georeferenced scan onto today's map ─────────
export let warp = null;
export let overlayItem = null;
let warpModule = null;

export async function overlayMap(it) {
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

export function fitOverlay() {
  if (!overlayItem?.bbox) return;
  const [w, s, e, n] = overlayItem.bbox;
  const pad = isPhone()
    ? { top: 60, bottom: 260, left: 20, right: 20 }
    : { top: 80, bottom: 130, left: 80, right: state.mode === "maps" && state.panelOpen ? 60 : 80 };
  map.fitBounds(
    [
      [w, s],
      [e, n],
    ],
    { padding: pad, maxZoom: 13, duration: 1400 },
  );
}

export function removeOverlay() {
  warp?.clear();
  overlayItem = null;
  $("#overlay-bar").hidden = true;
  writeHash();
}
