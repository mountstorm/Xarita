// @ts-check
// Writes the English UI text into index.html, so the first paint already has the
// headline and buttons instead of empty elements waiting for JavaScript.
// The app still swaps in Uzbek or Russian on load. Run after editing strings:
//   node tools/prerender-text.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { CITIES, chipHTML, FIRST_ERA, SHOWCASE } from "../js/data/hero.js";
import { I18N } from "../js/data/i18n.js";

const file = new URL("../index.html", import.meta.url);
let html = readFileSync(file, "utf8");
const en = /** @type {Record<string, string>} */ (I18N.en);
const escHtml = (/** @type {string} */ s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

let filled = 0;
// <tag ... data-i18n="key" ...>anything without child tags</tag>
html = html.replace(/(<(\w+)\b[^>]*\sdata-i18n="([\w.-]+)"[^>]*>)([^<]*)(<\/\2>)/g, (m, open, _tag, key, _old, close) => {
  if (!(key in en)) return m;
  filled++;
  return `${open}${escHtml(en[key])}${close}`;
});
// placeholder / title / aria-label from data-i18n-attr="attr:key,attr:key"
html = html.replace(/<[^>]*data-i18n-attr="([^"]+)"[^>]*>/g, (tag, spec) => {
  for (const pair of spec.split(",")) {
    const [attr, key] = pair.split(":");
    if (!(key in en)) continue;
    const value = escHtml(en[key]).replace(/"/g, "&quot;");
    tag = new RegExp(`\\s${attr}="[^"]*"`).test(tag)
      ? tag.replace(new RegExp(`(\\s${attr}=")[^"]*(")`), `$1${value}$2`)
      : tag.replace(/\s*\/?>$/, (end) => ` ${attr}="${value}"${end}`);
    filled++;
  }
  return tag;
});
// The hero's starting era and city chips, exactly as hero.js will render them.
const era = SHOWCASE[FIRST_ERA].year;
const chips = CITIES.map((c) => chipHTML(c, escHtml(en[`city.${c.key}`]), String(c.year))).join("");
html = html
  .replace(/(<div class="hero-chips" id="hero-chips">)[\s\S]*?(<\/div>)/, `$1${chips}$2`)
  .replace(/(<output class="hero-year" id="hero-year">)[^<]*(<\/output>)/, `$1${era}$2`)
  .replace(/(<p class="hero-caption" id="hero-caption">)[^<]*(<\/p>)/, `$1${escHtml(en[`show.${era}`])}$2`);
filled += CITIES.length + 2;

writeFileSync(file, html);
console.log(`prerendered ${filled} strings into index.html`);
