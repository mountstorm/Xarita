// @ts-check
// Parsers that turn library records (Allmaps, IIIF manifests, LoC) into one item shape.

/**
 * One scanned map, whichever library it came from.
 * @typedef {object} MapItem
 * @property {string} id "am:<hash>" for Allmaps, the LCCN for Library of Congress
 * @property {"allmaps" | "loc"} src
 * @property {string} provider library name
 * @property {string} badge short library label
 * @property {string} title
 * @property {string} date four-digit year, or ""
 * @property {string} by
 * @property {string} url page at the library
 * @property {string} desc
 * @property {string[]} tags
 * @property {string} thumb
 * @property {string} full
 * @property {string | null} iiif IIIF image service base
 * @property {string} [annotation] Allmaps georeference annotation (overlay-ready)
 * @property {[number, number, number, number]} [bbox] footprint, west/south/east/north
 * @property {string | null} [manifestId]
 * @property {string} [viewer]
 * @property {boolean} [pending] metadata still being read
 */
/** @typedef {{ title: string, date: string, by: string, url: string, desc: string }} ManifestMeta */

// Short badges for the libraries Allmaps aggregates.
/** @type {Record<string, string>} */
export const BADGES = {
  "www.davidrumsey.com": "Rumsey",
  "iiif.nypl.org": "NYPL",
  "map-view.nls.uk": "NLS",
  "gallica.bnf.fr": "BnF",
  "iiif.universiteitleiden.nl": "Leiden",
  "iiif.bodleian.ox.ac.uk": "Bodleian",
  "stacks.stanford.edu": "Stanford",
  "iiif.digitalcommonwealth.org": "BPL",
  "catalog.archives.gov": "NARA",
  "iiif.durham.ac.uk": "Durham",
  "service.archief.nl": "NL Arch.",
  "digital.zlb.de": "ZLB",
  "cdm21033.contentdm.oclc.org": "VU",
  "iiif.onb.ac.at": "ÖNB",
  "images.uba.uva.nl": "UvA",
  "www.nb.no": "NB.no",
  "iiif.archive.org": "Archive",
  "tile.loc.gov": "LoC",
};

// ───────── helpers ─────────
/** @param {unknown} s */
export const stripHtml = (s) =>
  String(s ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * IIIF v2 strings, v2 {@value} objects and v3 language maps all collapse to one string.
 * @param {any} v
 * @param {string} [lang]
 * @returns {string}
 */
export function langStr(v, lang = "en") {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v))
    return v
      .map((/** @type {any} */ x) => langStr(x, lang))
      .filter(Boolean)
      .join("; ");
  if (v["@value"]) return v["@value"];
  const pick = v[lang] || v.en || v.none || Object.values(v)[0];
  return Array.isArray(pick) ? pick.join("; ") : String(pick ?? "");
}

// ───────── Allmaps ─────────
// Libraries whose manifests aren't linked from the annotation but follow a known pattern.
/** @param {string} imageId @returns {string | null} */
export function guessManifest(imageId) {
  const u = new URL(imageId);
  if (u.host === "www.davidrumsey.com") return `https://www.davidrumsey.com/luna/servlet/iiif/m/${imageId.split("/iiif/")[1]}/manifest`;
  if (u.host === "stacks.stanford.edu") {
    const druid = decodeURIComponent(imageId.split("/iiif/")[1] || "").split("/")[0];
    if (druid) return `https://purl.stanford.edu/${druid}/iiif/manifest`;
  }
  return null;
}

/** @param {string} imageId */
export function guessHomepage(imageId) {
  const u = new URL(imageId);
  if (u.host === "map-view.nls.uk") {
    const id = decodeURIComponent(imageId.split("/iiif/2/")[1] || "")
      .split("/")
      .pop();
    if (id) return `https://maps.nls.uk/view/${id}`;
  }
  return "";
}

/**
 * @param {any} m a map from the Allmaps API
 * @returns {MapItem}
 */
export function normAllmaps(m) {
  const r = m.resource;
  const iiif = r.id.replace(/\/$/, "");
  const host = new URL(iiif).host;
  const manifest = (r.partOf || [])
    .flatMap((/** @type {any} */ c) => (c.type === "Manifest" ? [c] : c.partOf || []))
    .find((/** @type {any} */ p) => p.type === "Manifest");
  /** @type {number[]} */
  const xs = m.gcps.map((/** @type {any} */ g) => g.geo[0]);
  /** @type {number[]} */
  const ys = m.gcps.map((/** @type {any} */ g) => g.geo[1]);
  const hash = m.id.split("/").pop();
  const label = langStr(manifest?.label);
  const v3 = r.type === "ImageService3";
  return {
    id: `am:${hash}`,
    src: "allmaps",
    annotation: m.id,
    iiif,
    provider: langStr(r.provider?.[0]?.label) || host,
    badge: BADGES[host] || host.replace(/^(www|iiif|images?)\./, "").split(".")[0],
    bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
    manifestId: manifest?.id || guessManifest(iiif),
    title: /metadata/i.test(label) ? "" : label,
    date: "",
    by: "",
    url: guessHomepage(iiif),
    desc: "",
    tags: [],
    thumb: `${iiif}/full/!200,200/0/default.jpg`,
    full: `${iiif}/full/${v3 ? "max" : "full"}/0/default.jpg`,
    viewer: `https://viewer.allmaps.org/?url=${encodeURIComponent(m.id)}`,
  };
}

/**
 * @param {any} j a IIIF manifest, v2 or v3
 * @returns {ManifestMeta}
 */
export function parseManifest(j) {
  const label = stripHtml(langStr(j.label));
  const canvas = j.sequences?.[0]?.canvases?.[0] || j.items?.[0] || {};
  /** @type {[string, string][]} */
  const md = [...(j.metadata || []), ...(canvas.metadata || [])].map((e) => [
    stripHtml(langStr(e.label)).toLowerCase(),
    stripHtml(langStr(e.value)),
  ]);
  /** @param {RegExp} re */
  const find = (re) => md.find(([k]) => re.test(k))?.[1] || "";
  const dateStr =
    find(/^(date|dates|datum|year|jahr|année|issued|created|date of publication|publication date|pub(lication)? date)$/) ||
    find(/date|datum|jahr|année|year/);
  const yearRe = /\b(1[0-9]\d\d|20[0-2]\d)\b/;
  const year = (dateStr.match(yearRe) || label.match(yearRe) || [])[1] || "";
  const title = find(/^(short title|title|titel|titre)$/) || label;
  const homepage = j.homepage?.[0]?.id || (typeof j.related === "string" ? j.related : j.related?.["@id"] || j.related?.[0]?.["@id"]) || "";
  return {
    title: /metadata/i.test(title) ? "" : title,
    date: year,
    by: find(/author|creator|cartographer|maker|auteur|contributor|vervaardiger|urheber|engraver/),
    url: homepage,
    desc: stripHtml(langStr(j.summary || j.description) || find(/description|beschrijving|note|summary/)).slice(0, 600),
  };
}

// Approximate area of a lon/lat box in m², used to skip postage-stamp city plans when zoomed out.
/** @param {number[]} box west, south, east, north */
export function bboxAreaM2([w, s, e, n]) {
  if (e <= w || n <= s) return 0;
  const midLat = ((s + n) / 2) * (Math.PI / 180);
  return (e - w) * 111320 * Math.cos(midLat) * (n - s) * 110540;
}

/** @param {number[]} a @param {number[]} b */
export const intersect = (a, b) => [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];

// ───────── Library of Congress ─────────
/** @param {string} s */
export const titleCase = (s) => s.replace(/\b\p{L}/gu, (c) => c.toUpperCase());

/**
 * @param {any} r a result from the LoC JSON API
 * @returns {MapItem}
 */
export function normLoc(r) {
  const id = (String(r.id).match(/item\/([^/]+)/) || [])[1] || String(r.id);
  /** @type {string[]} */
  const imgs = (r.image_url || []).map((/** @type {string} */ u) => u.split("#")[0]);
  const iiifUrl = imgs.find((u) => u.includes("/iiif/"));
  const by = (r.contributor || r.contributor_names || [])
    .map((/** @type {string} */ c) =>
      titleCase(c.replace(/\s+(creator|annotator|cartographer|publisher|engraver|editor)\.?$/i, "")).replace(
        /\b(Of|And|The|De)\b/g,
        (/** @type {string} */ w) => w.toLowerCase(),
      ),
    )
    .join("; ");
  return {
    id,
    src: "loc",
    provider: "Library of Congress",
    badge: "LoC",
    title: String(Array.isArray(r.title) ? r.title[0] : r.title || "").replace(/[\s.]+$/, ""),
    date: (r.date || r.dates?.[0] || "").toString().slice(0, 4),
    by,
    thumb: imgs[0] || "",
    full: imgs[imgs.length - 1] || "",
    iiif: iiifUrl ? iiifUrl.split("/full/")[0] : null,
    url: (r.url || r.id || "").replace(/^http:/, "https:"),
    desc: (Array.isArray(r.description) ? r.description.join(" ") : r.description || "").slice(0, 600),
    tags: (r.location || []).slice(0, 8),
  };
}

/** @param {number} y */
export const pad4 = (y) => String(Math.max(1, Math.min(2030, y))).padStart(4, "0");
