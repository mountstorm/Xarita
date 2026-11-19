import assert from "node:assert/strict";
import { test } from "node:test";
import { bboxAreaM2, intersect, langStr, normAllmaps, normLoc, parseManifest } from "../js/lib/catalog.js";

test("IIIF labels collapse to one string, v2 or v3", () => {
  assert.equal(langStr("Plain"), "Plain");
  assert.equal(langStr({ "@value": "Wrapped" }), "Wrapped");
  assert.equal(langStr({ en: ["English"], fr: ["Français"] }), "English");
  assert.equal(langStr({ none: ["No language"] }), "No language");
  assert.equal(langStr({ nl: ["Kaart"] }), "Kaart");
  assert.equal(langStr(["a", { none: ["b"] }]), "a; b");
  assert.equal(langStr(null), "");
});

// Shaped like the real David Rumsey v2 manifests: metadata lives on the first canvas.
const rumsey = {
  label: "The World On Mercator's Projection.",
  related: { "@id": "https://www.davidrumsey.com/luna/servlet/detail/RUMSEY~8~1~3840~370032" },
  sequences: [
    {
      canvases: [
        {
          metadata: [
            { label: "Author", value: "Pinkerton, John, 1758-1826" },
            { label: "Date", value: "1812" },
            { label: "Short Title", value: "The World On Mercator's Projection." },
          ],
        },
      ],
    },
  ],
};

test("a v2 manifest yields title, year, author and homepage", () => {
  const m = parseManifest(rumsey);
  assert.equal(m.title, "The World On Mercator's Projection.");
  assert.equal(m.date, "1812");
  assert.equal(m.by, "Pinkerton, John, 1758-1826");
  assert.equal(m.url, "https://www.davidrumsey.com/luna/servlet/detail/RUMSEY~8~1~3840~370032");
});

test("a v3 manifest with language maps and HTML is cleaned up", () => {
  const m = parseManifest({
    label: { en: ["Carte de la Tartarie"] },
    summary: { en: ["<p>Engraved   map of <b>Central Asia</b></p>"] },
    homepage: [{ id: "https://gallica.bnf.fr/ark:/12148/x" }],
    metadata: [{ label: { fr: ["Date"] }, value: { none: ["vers 1706"] } }],
  });
  assert.equal(m.title, "Carte de la Tartarie");
  assert.equal(m.date, "1706");
  assert.equal(m.desc, "Engraved map of Central Asia");
  assert.equal(m.url, "https://gallica.bnf.fr/ark:/12148/x");
});

test("collection-level 'no metadata' labels are not used as titles", () => {
  // Some libraries label every map with the collection's placeholder name.
  assert.equal(parseManifest({ label: { nl: ["Alle UvA kaarten zonder metadata"] } }).title, "");
  assert.equal(parseManifest({ label: "Maps without metadata" }).title, "");
  assert.equal(parseManifest({ label: "Karta Turkestana" }).title, "Karta Turkestana");
});

test("an Allmaps record becomes an item with its footprint and library", () => {
  const item = normAllmaps({
    id: "https://annotations.allmaps.org/maps/4cda62f66f868e83",
    resource: {
      id: "https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~3840~370032",
      type: "ImageService2",
      provider: [{ label: { none: ["David Rumsey Map Collection"] } }],
    },
    gcps: [{ geo: [-3.3, 55.9] }, { geo: [-3.1, 56.0] }, { geo: [-3.2, 55.8] }],
  });
  assert.equal(item.id, "am:4cda62f66f868e83");
  assert.equal(item.badge, "Rumsey");
  assert.equal(item.provider, "David Rumsey Map Collection");
  assert.deepEqual(item.bbox, [-3.3, 55.8, -3.1, 56.0]);
  assert.equal(item.manifestId, "https://www.davidrumsey.com/luna/servlet/iiif/m/RUMSEY~8~1~3840~370032/manifest");
  assert.match(item.full, /\/full\/full\/0\/default\.jpg$/);
});

test("Library of Congress records are tidied: titles, roles, casing, https", () => {
  const item = normLoc({
    id: "http://www.loc.gov/item/2021668614/",
    title: "Iran. Eastern Half Including Afghanistan.",
    date: "1878-01-01",
    contributor: ["carnegie institution of washington creator.", "united states. department of state annotator"],
    image_url: [
      "https://tile.loc.gov/image-services/iiif/service:gdc:x/full/pct:6.25/0/default.jpg",
      "https://tile.loc.gov/image-services/iiif/service:gdc:x/full/pct:100/0/default.jpg#h=7990&w=6270",
    ],
  });
  assert.equal(item.id, "2021668614");
  assert.equal(item.title, "Iran. Eastern Half Including Afghanistan");
  assert.equal(item.date, "1878");
  assert.equal(item.by, "Carnegie Institution of Washington; United States. Department of State");
  assert.equal(item.iiif, "https://tile.loc.gov/image-services/iiif/service:gdc:x");
  assert.equal(item.url, "https://www.loc.gov/item/2021668614/");
});

test("view maths: box area and overlap", () => {
  assert.equal(bboxAreaM2([1, 1, 1, 2]), 0);
  const equatorDegree = bboxAreaM2([0, -0.5, 1, 0.5]);
  assert.ok(Math.abs(equatorDegree - 111320 * 110540) / equatorDegree < 0.001);
  assert.deepEqual(intersect([0, 0, 10, 10], [5, 5, 20, 20]), [5, 5, 10, 10]);
});
