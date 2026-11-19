// @ts-check
// Slim, cacheable OpenHistoricalMap tiles.
//
// An OHM tile holds every boundary ever mapped, each label carrying 200+ language
// names, at up to 2 MB per tile with a 60-second cache. Xarita only draws national
// and state borders, so this rewrites each tile once, keeping just those features
// and the fields the map uses. Low-zoom lines are snapped to the pixel grid; all
// other geometry is copied as-is, so no vector-tile library is needed.
// The leading underscore keeps Vercel from deploying this file as its own function.
import { gzipSync } from "node:zlib";

const UPSTREAM = "https://vtiles.openhistoricalmap.org/maps/ohm";
const LINE_KEYS = new Set(["type", "admin_level", "start_decdate", "end_decdate"]);
const LABEL_KEYS = new Set([...LINE_KEYS, "name", "name_en", "name_uz", "name_ru", "start_date", "end_date", "area"]);

/** @typedef {string | number | boolean | null} TagValue */
/** @typedef {(key: string) => TagValue | undefined} ReadTag */
/**
 * @typedef {object} Layer
 * @property {string} name
 * @property {string[]} keys
 * @property {Buffer[]} values raw Value messages
 * @property {Buffer[]} features raw Feature messages
 * @property {number} extent
 * @property {number} version
 */

// ───────── Minimal protobuf reader ─────────
export class Reader {
  /** @param {Buffer} buf */
  constructor(buf) {
    this.buf = buf;
    this.pos = 0;
  }
  get done() {
    return this.pos >= this.buf.length;
  }
  varint() {
    let result = 0,
      mul = 1,
      byte;
    do {
      byte = this.buf[this.pos++];
      result += (byte & 0x7f) * mul;
      mul *= 128;
    } while (byte >= 0x80);
    return result;
  }
  bytes() {
    const len = this.varint();
    const out = this.buf.subarray(this.pos, this.pos + len);
    this.pos += len;
    return out;
  }
  /** @param {number} wire */
  skip(wire) {
    if (wire === 0) this.varint();
    else if (wire === 1) this.pos += 8;
    else if (wire === 2) this.bytes();
    else if (wire === 5) this.pos += 4;
    else throw new Error(`unsupported wire type ${wire}`);
  }
}

// ───────── Minimal protobuf writer ─────────
/** @param {number} n */
export function varintBytes(n) {
  const out = [];
  while (n >= 128) {
    out.push((n % 128) | 0x80);
    n = Math.floor(n / 128);
  }
  out.push(n);
  return Buffer.from(out);
}
/** @param {number} num @param {number} wire */
const field = (num, wire) => varintBytes(num * 8 + wire);
/** @param {number} num @param {Buffer} payload */
export const lenField = (num, payload) => Buffer.concat([field(num, 2), varintBytes(payload.length), payload]);
/** @param {number} num @param {number} n */
export const varintField = (num, n) => Buffer.concat([field(num, 0), varintBytes(n)]);

/**
 * A vector-tile Value message, read just far enough to filter on.
 * @param {Buffer} raw
 * @returns {TagValue}
 */
function readValue(raw) {
  const r = new Reader(raw);
  while (!r.done) {
    const tag = r.varint();
    const num = tag >> 3,
      wire = tag & 7;
    if (num === 1) return r.bytes().toString("utf8");
    if (num === 2) {
      const v = raw.readFloatLE(r.pos);
      return v;
    }
    if (num === 3) {
      const v = raw.readDoubleLE(r.pos);
      return v;
    }
    if (num === 4 || num === 5) return r.varint();
    if (num === 6) {
      const v = r.varint();
      return v % 2 ? -(v + 1) / 2 : v / 2;
    }
    if (num === 7) return r.varint() === 1;
    r.skip(wire);
  }
  return null;
}

/**
 * @param {Buffer} raw
 * @returns {Layer}
 */
function parseLayer(raw) {
  const r = new Reader(raw);
  /** @type {Layer} */
  const layer = { name: "", keys: [], values: [], features: [], extent: 4096, version: 2 };
  while (!r.done) {
    const tag = r.varint();
    const num = tag >> 3,
      wire = tag & 7;
    if (num === 1) layer.name = r.bytes().toString("utf8");
    else if (num === 2) layer.features.push(r.bytes());
    else if (num === 3) layer.keys.push(r.bytes().toString("utf8"));
    else if (num === 4) layer.values.push(r.bytes());
    else if (num === 5) layer.extent = r.varint();
    else if (num === 15) layer.version = r.varint();
    else r.skip(wire);
  }
  return layer;
}

/** @param {Buffer} raw */
function parseFeature(raw) {
  const r = new Reader(raw);
  /** @type {{ id: number | null, tags: number[], type: number, geometry: Buffer | null }} */
  const f = { id: null, tags: [], type: 0, geometry: null };
  while (!r.done) {
    const tag = r.varint();
    const num = tag >> 3,
      wire = tag & 7;
    if (num === 1) f.id = r.varint();
    else if (num === 2) {
      const p = new Reader(r.bytes());
      while (!p.done) f.tags.push(p.varint());
    } else if (num === 3) f.type = r.varint();
    else if (num === 4) f.geometry = r.bytes();
    else r.skip(wire);
  }
  return f;
}

// Snaps a line's points to a coarser grid and drops the repeats. Low-zoom tiles
// keep far more vertices than a screen can show; this leaves the shape the same
// at the zoom the tile is drawn at, with far fewer points.
/**
 * @param {Buffer} geometry
 * @param {number} grid tile units per output pixel
 * @returns {Buffer | null}
 */
function snapLines(geometry, grid) {
  const r = new Reader(geometry);
  /** @type {[number, number][][]} */
  const lines = [];
  /** @type {[number, number][]} */
  let line = [];
  let x = 0,
    y = 0;
  while (!r.done) {
    const cmd = r.varint();
    const id = cmd & 7,
      count = cmd >> 3;
    if (id === 7) continue;
    for (let i = 0; i < count; i++) {
      const dx = r.varint(),
        dy = r.varint();
      x += dx % 2 ? -(dx + 1) / 2 : dx / 2;
      y += dy % 2 ? -(dy + 1) / 2 : dy / 2;
      const px = Math.round(x / grid) * grid,
        py = Math.round(y / grid) * grid;
      if (id === 1) {
        line = [[px, py]];
        lines.push(line);
        continue;
      }
      const last = line[line.length - 1];
      if (last[0] !== px || last[1] !== py) line.push([px, py]);
    }
  }
  /** @param {number} n */
  const zigzag = (n) => (n < 0 ? -2 * n - 1 : 2 * n);
  /** @type {number[]} */
  const out = [];
  let cx = 0,
    cy = 0;
  for (const pts of lines) {
    if (pts.length < 2) continue;
    out.push(9, zigzag(pts[0][0] - cx), zigzag(pts[0][1] - cy));
    cx = pts[0][0];
    cy = pts[0][1];
    out.push(((pts.length - 1) << 3) | 2);
    for (let i = 1; i < pts.length; i++) {
      out.push(zigzag(pts[i][0] - cx), zigzag(pts[i][1] - cy));
      cx = pts[i][0];
      cy = pts[i][1];
    }
  }
  return out.length ? Buffer.concat(out.map(varintBytes)) : null;
}

/**
 * Rewrites a layer, keeping features that pass `keep` and only the named fields.
 * @param {Layer} layer
 * @param {Set<string>} keepKeys
 * @param {(read: ReadTag) => boolean} keep
 * @param {number} grid snap grid for lines, or 0 to copy geometry as-is
 * @returns {Buffer | null}
 */
function slimLayer(layer, keepKeys, keep, grid) {
  /** @type {Map<string, number>} */
  const keyIndex = new Map();
  /** @type {Map<number, number>} */
  const valueIndex = new Map();
  /** @type {string[]} */
  const keys = [];
  /** @type {Buffer[]} */
  const values = [],
    features = [];

  for (const raw of layer.features) {
    const f = parseFeature(raw);
    /** @type {Record<string, number>} */
    const props = {};
    for (let i = 0; i + 1 < f.tags.length; i += 2) {
      const k = layer.keys[f.tags[i]];
      if (keepKeys.has(k)) props[k] = f.tags[i + 1];
    }
    /** @type {ReadTag} */
    const read = (k) => (props[k] == null ? undefined : readValue(layer.values[props[k]]));
    if (!keep(read)) continue;

    if (!f.geometry) continue;
    const geometry = grid && f.type === 2 ? snapLines(f.geometry, grid) : f.geometry;
    if (!geometry) continue;

    /** @type {number[]} */
    const tags = [];
    for (const [k, valueId] of Object.entries(props)) {
      if (!keyIndex.has(k)) {
        keyIndex.set(k, keys.length);
        keys.push(k);
      }
      if (!valueIndex.has(valueId)) {
        valueIndex.set(valueId, values.length);
        values.push(layer.values[valueId]);
      }
      tags.push(/** @type {number} */ (keyIndex.get(k)), /** @type {number} */ (valueIndex.get(valueId)));
    }
    /** @type {Buffer[]} */
    const parts = [];
    if (f.id != null) parts.push(varintField(1, f.id));
    parts.push(lenField(2, Buffer.concat(tags.map(varintBytes))));
    parts.push(varintField(3, f.type));
    parts.push(lenField(4, geometry));
    features.push(Buffer.concat(parts));
  }
  if (!features.length) return null;

  return Buffer.concat([
    lenField(1, Buffer.from(layer.name)),
    ...features.map((b) => lenField(2, b)),
    ...keys.map((k) => lenField(3, Buffer.from(k))),
    ...values.map((v) => lenField(4, v)),
    varintField(5, layer.extent),
    varintField(15, layer.version),
  ]);
}

/**
 * Slims one raw (uncompressed) vector tile.
 * @param {Buffer} buf
 * @param {number} z zoom of the tile
 * @returns {Buffer}
 */
export function slimTile(buf, z) {
  // States only appear once zoomed in, so low-zoom tiles carry national borders only.
  const maxLevel = z >= 5 ? 4 : 2;
  /** @param {number} level @returns {(read: ReadTag) => boolean} */
  const adminUpTo = (level) => (read) => {
    const l = Number(read("admin_level"));
    return read("type") === "administrative" && l >= 1 && l <= level;
  };
  /** @type {Record<string, [Set<string>, (read: ReadTag) => boolean]>} */
  const rules = {
    land_ohm_lines: [LINE_KEYS, adminUpTo(maxLevel)],
    land_ohm_centroids: [LABEL_KEYS, adminUpTo(z >= 5 ? 4 : 2)],
  };

  /** @type {Buffer[]} */
  const out = [];
  const r = new Reader(buf);
  while (!r.done) {
    const tag = r.varint();
    if (tag >> 3 !== 3) {
      r.skip(tag & 7);
      continue;
    }
    const layer = parseLayer(r.bytes());
    const rule = rules[layer.name];
    if (!rule) continue;
    const slim = slimLayer(layer, rule[0], rule[1], z <= 8 ? layer.extent / 512 : 0);
    if (slim) out.push(lenField(3, slim));
  }
  return Buffer.concat(out);
}

/**
 * Fetches one upstream tile and returns the slimmed HTTP response.
 * @param {string} z @param {string} x @param {string} y
 * @returns {Promise<{ status: number, headers: Record<string, string>, body: Buffer | string }>}
 */
export async function tileResponse(z, x, y) {
  const ok = [z, x, y].every((v) => /^\d{1,5}$/.test(v)) && +z <= 14 && +x < 2 ** +z && +y < 2 ** +z;
  if (!ok) return { status: 400, headers: { "Cache-Control": "no-store" }, body: "bad tile address" };

  const upstream = await fetch(`${UPSTREAM}/${+z}/${+x}/${+y}.pbf`);
  if (upstream.status === 404 || upstream.status === 204) {
    return { status: 204, headers: { "Cache-Control": "public, s-maxage=604800" }, body: "" };
  }
  if (!upstream.ok) return { status: 502, headers: { "Cache-Control": "no-store" }, body: "upstream error" };

  return {
    status: 200,
    headers: {
      "Content-Type": "application/x-protobuf",
      "Content-Encoding": "gzip",
      // A day in the browser, a month on the CDN, and refreshed in the background after that.
      "Cache-Control": "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=604800",
      "Access-Control-Allow-Origin": "*",
    },
    body: gzipSync(slimTile(Buffer.from(await upstream.arrayBuffer()), +z), { level: 9 }),
  };
}
