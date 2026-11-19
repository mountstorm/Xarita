// @ts-check
// Polygon helpers for the snapshot shapes: area, hit testing, neighbours.
// Pure functions over plain GeoJSON, so they run in Node tests too.

/** @typedef {[number, number]} Point lon, lat */
/** @typedef {Point[]} Ring */
/** @typedef {[number, number, number, number]} BBox west, south, east, north */
/**
 * @typedef {object} Feature
 * @property {Record<string, any>} properties
 * @property {{ type: string, coordinates: any } | null} geometry
 */

/**
 * Shoelace area of a ring, in square degrees.
 * @param {Ring} r
 */
export function ringArea(r) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return Math.abs(a / 2);
}

/**
 * Even-odd test: is the point inside the ring?
 * @param {Point} point
 * @param {Ring} r
 */
export function pointInRing([x, y], r) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i],
      [xj, yj] = r[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * The outer ring of every polygon in a feature (holes ignored).
 * @param {Feature | null | undefined} f
 * @returns {Ring[]}
 */
export const outerRings = (f) =>
  !f?.geometry
    ? []
    : f.geometry.type === "Polygon"
      ? [f.geometry.coordinates[0]]
      : f.geometry.type === "MultiPolygon"
        ? f.geometry.coordinates.map((/** @type {Ring[]} */ p) => p[0])
        : [];

/**
 * @param {Feature} f
 * @returns {BBox}
 */
export function bboxOf(f) {
  let w = 180,
    s = 90,
    e = -180,
    n = -90;
  for (const r of outerRings(f))
    for (const [x, y] of r) {
      if (x < w) w = x;
      if (x > e) e = x;
      if (y < s) s = y;
      if (y > n) n = y;
    }
  return [w, s, e, n];
}

/**
 * Approximate area in km², scaling each ring by the cosine of its mean latitude.
 * @param {Feature} f
 */
export function areaKm2(f) {
  return outerRings(f).reduce((sum, r) => {
    const lat = r.reduce((a, p) => a + p[1], 0) / r.length;
    return sum + ringArea(r) * 111.32 * 110.57 * Math.cos((lat * Math.PI) / 180);
  }, 0);
}

/**
 * Up to n evenly spaced vertices, so neighbour tests stay cheap on detailed coasts.
 * @param {Feature} f
 * @param {number} [n]
 * @returns {Point[]}
 */
export function sampleVerts(f, n = 400) {
  const all = outerRings(f).flat();
  const step = Math.max(1, Math.floor(all.length / n));
  return all.filter((_, i) => i % step === 0);
}

/**
 * Named features that touch f: a sampled vertex of each lies within ~0.35° of the other.
 * The snapshots are approximate, so "touching" is deliberately forgiving.
 * @param {Feature} f
 * @param {Feature[]} features
 * @returns {Feature[]}
 */
export function neighbours(f, features) {
  const [w, s, e, n] = bboxOf(f);
  const mine = sampleVerts(f);
  return features.filter((g) => {
    const name = g.properties.NAME;
    if (!name || name === f.properties.NAME) return false;
    const [gw, gs, ge, gn] = bboxOf(g);
    if (gw > e + 0.4 || ge < w - 0.4 || gs > n + 0.4 || gn < s - 0.4) return false;
    const theirs = sampleVerts(g, 300);
    return mine.some(([x, y]) => theirs.some(([a, b]) => Math.abs(a - x) < 0.35 && Math.abs(b - y) < 0.35));
  });
}
