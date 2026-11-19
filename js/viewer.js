import { OSD_IMAGES, OSD_SCRIPT } from "./constants.js";
import { itemIndex, yearOf } from "./panel.js";
import { Sources } from "./sources.js";
import { favs, notes, state, t } from "./state.js";
import { writeHash } from "./ui.js";
import { $, esc, isPhone } from "./util.js";

// ───────── Viewer (OpenSeadragon over IIIF) ─────────
let osd = null;
export let currentItem = null;

export function syncViewerFav() {
  $("#v-fav").textContent = t(favs[currentItem.id] ? "viewer.saved" : "viewer.save");
}

// The deep-zoom library only loads once someone is about to open a map.
let osdScript = null;
export function loadOsd() {
  osdScript ??= new Promise((resolve, reject) => {
    const el = Object.assign(document.createElement("script"), { src: OSD_SCRIPT, onload: resolve, onerror: reject });
    document.head.append(el);
  });
  return osdScript;
}

export async function openViewer(it) {
  if (!it) return;
  currentItem = it;
  itemIndex[it.id] = it;
  const dlg = $("#viewer");
  const geo = it.src === "allmaps";
  $("#v-title").textContent = it.title || t("mapFrom", { provider: it.provider });
  $("#v-date").textContent = it.date || t("card.undated");
  $("#v-provider").textContent = it.provider;
  $("#v-by").textContent = it.by || "";
  $("#v-desc").textContent = it.desc || "";
  $("#v-tags").innerHTML = (it.tags || []).map((x) => `<span>${esc(x)}</span>`).join("");
  $("#v-pinned").hidden = !geo;
  $("#v-overlay").hidden = !geo;
  $("#v-source").hidden = !it.url;
  $("#v-source").href = it.url || "#";
  $("#v-source").textContent = t("viewer.source", { provider: it.provider });
  $("#v-allmaps").hidden = !it.viewer;
  $("#v-allmaps").href = it.viewer || "#";
  $("#v-full").href = it.full;
  $("#v-jump").hidden = !yearOf(it);
  $("#v-notes").value = notes[it.id] || "";
  syncViewerFav();
  $("#viewer-loading").hidden = false;
  $("#viewer-loading").textContent = t("viewer.loading");
  if (!dlg.open) dlg.showModal();

  try {
    await loadOsd();
  } catch {
    osdScript = null;
    $("#viewer-loading").textContent = t("viewer.failed");
    return;
  }
  if (currentItem !== it) return;
  if (!osd) {
    osd = OpenSeadragon({
      element: $("#osd"),
      prefixUrl: OSD_IMAGES,
      showNavigator: !isPhone(),
      navigatorPosition: "BOTTOM_RIGHT",
      gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: true },
      visibilityRatio: 0.6,
      maxZoomPixelRatio: 3,
    });
    osd.addHandler("open", () => ($("#viewer-loading").hidden = true));
    osd.addHandler("open-failed", () => {
      if (osd._triedFallback || !currentItem?.full) {
        $("#viewer-loading").textContent = t("viewer.failed");
        return;
      }
      osd._triedFallback = true;
      osd.open({ type: "image", url: currentItem.full });
    });
  }
  osd._triedFallback = false;
  osd.open(it.iiif ? `${it.iiif}/info.json` : { type: "image", url: it.full });
  state.openMap = it.id;
  writeHash();
}

export const closeViewer = () => $("#viewer").close();

export async function itemFromId(id) {
  if (itemIndex[id] || favs[id]) return itemIndex[id] || favs[id];
  return id.startsWith("am:") ? Sources.allmapsItem(id.slice(3)) : Sources.locItem(id);
}
