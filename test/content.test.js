// Translations, tours and the shipped border data: checks that catch content mistakes.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { I18N } from "../js/data/i18n.js";
import { TOURS } from "../js/data/tours.js";
import { SNAPSHOTS, snapFile } from "../js/lib/time.js";

const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test("Uzbek and Russian have every English string, with the same {placeholders}", () => {
  for (const lang of ["uz", "ru"]) {
    for (const [key, en] of Object.entries(I18N.en)) {
      assert.ok(key in I18N[lang], `${lang} is missing ${key}`);
      assert.deepEqual(placeholders(I18N[lang][key]), placeholders(en), `${lang}.${key} placeholders differ`);
    }
  }
});

test("every tour stop is written in all three languages and points somewhere real", () => {
  for (const tour of TOURS) {
    for (const lang of ["en", "uz", "ru"]) assert.ok(tour.name[lang] && tour.blurb[lang], `${tour.id} name/blurb ${lang}`);
    for (const stop of tour.stops) {
      for (const lang of ["en", "uz", "ru"]) assert.ok(stop.title[lang] && stop.text[lang], `${tour.id} ${stop.title.en} ${lang}`);
      const [lon, lat] = stop.center;
      assert.ok(Math.abs(lon) <= 180 && Math.abs(lat) <= 85, `${stop.title.en} center`);
      assert.ok(stop.year >= -3000 && stop.year <= 2010 && stop.year !== 0, `${stop.title.en} year`);
    }
  }
});

test("there is a border file for every snapshot year, and each one is well formed", () => {
  const dir = new URL("../data/v2/", import.meta.url);
  const files = new Set(readdirSync(dir));
  for (const year of SNAPSHOTS) {
    const name = `${snapFile(year)}.json`;
    assert.ok(files.has(name), `missing ${name}`);
    const d = JSON.parse(readFileSync(new URL(name, dir), "utf8"));
    assert.equal(d.polys.type, "FeatureCollection", name);
    assert.ok(d.polys.features.length > 10, `${name} has too few shapes`);
    for (const l of d.labels.features) {
      const [x, y] = l.geometry.coordinates;
      assert.ok(Math.abs(x) <= 180 && Math.abs(y) <= 90, `${name}: label ${l.properties.name} off the map`);
    }
  }
});

test("the service worker precaches every module the page loads", () => {
  const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const listed = new Set([...sw.matchAll(/"(js\/[^"]+\.js)"/g)].map((m) => m[1]));
  const onDisk = readdirSync(new URL("../js/", import.meta.url), { recursive: true })
    .map(String)
    .filter((f) => f.endsWith(".js"))
    .map((f) => `js/${f}`);
  for (const f of onDisk) assert.ok(listed.has(f), `sw.js PRECACHE is missing ${f}`);
  const css = html.match(/styles\.css\?v=\d+/)[0];
  assert.ok(sw.includes(`"${css}"`), `sw.js should precache ${css}`);
});
