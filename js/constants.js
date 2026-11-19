// ───────── Constants ─────────
export const BASEMAP = new URL("data/v2/basemap.json", location.href).href;
export const OHM_TILES = `${location.origin}/tiles/ohm/{z}/{x}/{y}.pbf`; // slimmed and cached by api/ohm.js
export const SNAPSHOTS_URL = "data/v2/";
export const ALLMAPS_MAPLIBRE = "https://cdn.jsdelivr.net/npm/@allmaps/maplibre@1.0.0-beta.43/+esm";
export const NOMINATIM = "https://nominatim.openstreetmap.org";
export const OSD_SCRIPT = "vendor/openseadragon-4.1.0.min.js";
export const OSD_IMAGES = "https://cdnjs.cloudflare.com/ajax/libs/openseadragon/4.1.0/images/";
export const LANGS = ["en", "uz", "ru"];
export { MAX_YEAR, MIN_YEAR, SCALE, SNAPSHOTS } from "./lib/time.js";

// OpenHistoricalMap is thin before the early modern era, so the snapshot's own
// labels and outlines come back on to keep ancient maps readable.
export const SNAPSHOT_LINES_BEFORE = 1500;

export const PALETTE = {
  light: [
    "#f2d7a6",
    "#e9b8a0",
    "#cfd9a8",
    "#b9d3c4",
    "#c9c1de",
    "#f0c7c4",
    "#e6d29a",
    "#bcd0e3",
    "#dcc1a5",
    "#d6e2b5",
    "#eac7dd",
    "#c4dcd0",
  ],
  dark: [
    "#7a6440",
    "#7a4d3c",
    "#5e6b3f",
    "#46655a",
    "#5a5278",
    "#7a4e4c",
    "#6f6438",
    "#46607a",
    "#6b5640",
    "#5f6f45",
    "#6d4c62",
    "#4b6a5f",
  ],
};
export const BASE_TINT = {
  light: {
    land: "#f3ede1",
    water: "#cfe0e4",
    waterway: "#b4cfd6",
    ice: "#fbfaf6",
    text: "#6e5a45",
    halo: "#f6f2ea",
    waterText: "#5f8794",
    ink: "#4a3421",
    border: "#7a2e1c",
    unnamed: "#ddd3c2",
  },
  dark: {
    land: "#211c16",
    water: "#18272c",
    waterway: "#22383f",
    ice: "#2c2822",
    text: "#b8a68e",
    halo: "#1d1914",
    waterText: "#6d97a3",
    ink: "#e2cfb1",
    border: "#e08a6a",
    unnamed: "#3a3229",
  },
};
