// @ts-check
// Hero data, kept free of DOM code so tools/prerender-text.mjs can write the
// first frame into index.html and the page doesn't shift when JavaScript arrives.

/** Eras the landing globe steps through; each turns to where its story happens. */
export const SHOWCASE = [
  { year: -323, center: [48, 32] },
  { year: 100, center: [60, 35] },
  { year: 1279, center: [85, 42] },
  { year: 1400, center: [66, 38] },
  { year: 1492, center: [-40, 25] },
  { year: 1849, center: [-108, 37] },
  { year: 1914, center: [20, 45] },
  { year: 1991, center: [62, 48] },
];
// Starting points on every inhabited continent.
export const CITIES = [
  { key: "samarkand", year: 1400, center: [66.97, 39.65], zoom: 5.5 },
  { key: "sf", year: 1849, center: [-122.42, 37.77], zoom: 8 },
  { key: "tenochtitlan", year: 1519, center: [-99.13, 19.43], zoom: 6 },
  { key: "cusco", year: 1530, center: [-71.97, -13.53], zoom: 5 },
  { key: "timbuktu", year: 1350, center: [-3.0, 16.77], zoom: 4.5 },
  { key: "cairo", year: 1250, center: [31.24, 30.04], zoom: 5 },
  { key: "istanbul", year: 1453, center: [28.97, 41.01], zoom: 6 },
  { key: "delhi", year: 1650, center: [77.2, 28.6], zoom: 5 },
  { key: "kyoto", year: 1600, center: [135.77, 35.01], zoom: 6 },
  { key: "sydney", year: 1788, center: [151.21, -33.87], zoom: 6 },
];

/** The index of the era the landing page starts on (Timur's Samarkand, 1400). */
export const FIRST_ERA = 3;

/**
 * One starting-point chip. Text arguments must already be HTML-escaped.
 * @param {{ key: string }} city @param {string} name @param {string} year
 */
export const chipHTML = (city, name, year) => `<button class="chip-city" data-city="${city.key}">${name} <small>${year}</small></button>`;
