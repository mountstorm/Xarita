// Rebuilds data/v1/: slim border snapshots and the trimmed basemap style.
// Usage: node tools/build-data.mjs <scratch-dir>
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const COMMIT = "da7a4b735ecef70aebdc9c73e409d8a2500d50f3"; // aourednik/historical-basemaps, pinned for repeatable builds
const SOURCE = `https://raw.githubusercontent.com/aourednik/historical-basemaps/${COMMIT}/geojson/`;
const STYLE = "https://tiles.openfreemap.org/styles/positron";
const SIMPLIFY = process.env.SIMPLIFY || "18%";
const YEARS = [
  "bc3000", "bc2000", "bc1500", "bc1000", "bc700", "bc500", "bc400", "bc323", "bc300", "bc200", "bc100", "bc1",
  100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1279, 1300, 1400, 1492, 1500, 1530, 1600, 1650,
  1700, 1715, 1783, 1800, 1815, 1878, 1880, 1900, 1914, 1920, 1930, 1938, 1945, 1960, 1994, 2000, 2010,
];

const scratch = process.argv[2];
if (!scratch) throw new Error("pass a scratch directory");
const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(repo, "data", "v1");
const raw = join(scratch, "raw"), slim = join(scratch, "slim");
for (const d of [out, raw, slim]) mkdirSync(d, { recursive: true });

function ringArea(r) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return Math.abs(a / 2);
}
function pointInRing([x, y], r) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// A point actually inside the shape: the centroid if it works, else the middle
// of the widest horizontal run through it (handles crescents).
function labelPoint(r) {
  let cx = 0, cy = 0, a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const f = r[j][0] * r[i][1] - r[i][0] * r[j][1];
    cx += (r[j][0] + r[i][0]) * f; cy += (r[j][1] + r[i][1]) * f; a += f;
  }
  const c = a ? [cx / (3 * a), cy / (3 * a)] : r[0];
  if (pointInRing(c, r)) return c;
  const y = c[1], xs = [];
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [x1, y1] = r[j], [x2, y2] = r[i];
    if ((y1 > y) !== (y2 > y)) xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
  }
  xs.sort((p, q) => p - q);
  let best = r[0], w = -1;
  for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > w) { w = xs[i + 1] - xs[i]; best = [(xs[i] + xs[i + 1]) / 2, y]; }
  return best;
}

let before = 0, after = 0;
for (const year of YEARS) {
  const name = `world_${year}`;
  const src = join(raw, `${name}.geojson`), dst = join(slim, `${name}.geojson`);
  if (!existsSync(src)) {
    const r = await fetch(`${SOURCE}${name}.geojson`);
    if (!r.ok) throw new Error(`${name}: ${r.status}`);
    writeFileSync(src, Buffer.from(await r.arrayBuffer()));
  }
  // Shared borders are simplified once, so neighbours still meet exactly.
  execFileSync("npx", ["--yes", "mapshaper@0.7.101", src, "-filter-fields", "NAME,SUBJECTO",
    "-simplify", SIMPLIFY, "weighted", "keep-shapes", "-clean", "allow-overlaps", "-o", "precision=0.01", "force", dst], { stdio: "pipe" });

  const gj = JSON.parse(readFileSync(dst, "utf8"));
  const labels = [];
  for (const f of gj.features) {
    const p = f.properties || (f.properties = {});
    if (p.SUBJECTO === p.NAME || p.SUBJECTO == null) delete p.SUBJECTO;
    if (p.NAME == null) delete p.NAME;
    if (!p.NAME || !f.geometry) continue;
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    let big = null, bigA = 0, total = 0;
    for (const poly of polys) { const a = ringArea(poly[0]); total += a; if (a > bigA) { bigA = a; big = poly[0]; } }
    if (big) {
      const [x, y] = labelPoint(big);
      labels.push({ type: "Feature", properties: { name: p.NAME, area: +total.toFixed(2) }, geometry: { type: "Point", coordinates: [+x.toFixed(2), +y.toFixed(2)] } });
    }
  }
  const body = JSON.stringify({ polys: { type: "FeatureCollection", features: gj.features.filter((f) => f.geometry) }, labels: { type: "FeatureCollection", features: labels } });
  writeFileSync(join(out, `${name}.json`), body);
  before += readFileSync(src).length;
  after += body.length;
}
console.log(`borders: ${(before / 1e6).toFixed(1)} MB -> ${(after / 1e6).toFixed(1)} MB across ${YEARS.length} files`);

// Basemap: only what the atlas draws, so no road, rail or building data is parsed.
const KEEP = new Set(["background", "water", "landcover_ice_shelf", "landcover_glacier", "waterway", "waterway_line_label",
  "water_name_point_label", "water_name_line_label", "label_other", "label_village", "label_town", "label_city", "label_city_capital"]);
const style = await (await fetch(STYLE)).json();
style.layers = style.layers.filter((l) => KEEP.has(l.id));
style.sources = { openmaptiles: style.sources.openmaptiles };
delete style.sprite; // the one icon used (a city dot) is drawn in app.js
writeFileSync(join(out, "basemap.json"), JSON.stringify(style));
console.log(`basemap: ${style.layers.length} layers`);
