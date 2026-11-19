// @ts-check
// Timeline maths: pure functions, no DOM, so they run in Node tests too.
// Years with a colour-tint snapshot in historical-basemaps (negative = BC).
/** @type {number[]} */
export const SNAPSHOTS = [
  -3000, -2000, -1500, -1000, -700, -500, -400, -323, -300, -200, -100, -1, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200,
  1279, 1300, 1400, 1492, 1500, 1530, 1600, 1650, 1700, 1715, 1783, 1800, 1815, 1878, 1880, 1900, 1914, 1920, 1930, 1938, 1945, 1960, 1994,
  2000, 2010,
];
export const MIN_YEAR = -3000;
export const MAX_YEAR = 2010;

// Piecewise timeline scale: deep time is squeezed, the print era gets room.
/** @type {[number, number][]} */
export const SCALE = [
  [-3000, 0],
  [0, 0.14],
  [1000, 0.34],
  [1500, 0.55],
  [2010, 1],
];

/**
 * Year to position on the timeline track, 0..1.
 * @param {number} y
 */
export function yearToFrac(y) {
  for (let i = 1; i < SCALE.length; i++) {
    const [y0, f0] = SCALE[i - 1],
      [y1, f1] = SCALE[i];
    if (y <= y1) return f0 + ((y - y0) / (y1 - y0)) * (f1 - f0);
  }
  return 1;
}

/**
 * Position on the track (0..1) to a whole year; there is no year 0.
 * @param {number} f
 */
export function fracToYear(f) {
  for (let i = 1; i < SCALE.length; i++) {
    const [y0, f0] = SCALE[i - 1],
      [y1, f1] = SCALE[i];
    if (f <= f1) {
      const y = Math.round(y0 + ((f - f0) / (f1 - f0)) * (y1 - y0));
      return y === 0 ? 1 : y;
    }
  }
  return MAX_YEAR;
}

/**
 * The latest colour-tint snapshot at or before a year.
 * @param {number} y
 */
export const snapshotFor = (y) => SNAPSHOTS.filter((s) => s <= y).pop() ?? SNAPSHOTS[0];

/** @param {number} s */
export const snapFile = (s) => (s < 0 ? `world_bc${-s}` : `world_${s}`);

/**
 * Reads a typed year in any UI language: "1862", "-200", "200 BC", "mil. avv. 200", "200 до н. э.".
 * @param {string} str
 * @returns {number | null}
 */
export function parseYear(str) {
  const m =
    String(str)
      .trim()
      .match(/^(-?\d{1,4})\s*(bce?|b\.c\.?|до н\.? ?э\.?|mil\.? ?avv\.?)?$/i) ||
    String(str)
      .trim()
      .match(/^(?:mil\.? ?avv\.?)\s*(\d{1,4})$/i);
  if (!m) return null;
  let y = parseInt(m[1], 10);
  if (m[2] || /avv/i.test(str)) y = -Math.abs(y);
  return y === 0 ? 1 : y;
}
