// The tile slimmer works on raw protobuf bytes, so these tests build a tiny
// vector tile by hand and read the result back with the same reader.
import assert from "node:assert/strict";
import { test } from "node:test";
import { lenField, Reader, slimTile, tileResponse, varintBytes, varintField } from "../api/_ohm-slim.js";

const zigzag = (n) => (n < 0 ? -2 * n - 1 : 2 * n);
const str = (s) => lenField(1, Buffer.from(s));
const int = (n) => varintField(4, n);
const dbl = (n) => {
  const b = Buffer.alloc(9);
  b[0] = (3 << 3) | 1;
  b.writeDoubleLE(n, 1);
  return b;
};

/** One line from absolute points, as MVT commands. */
function lineGeometry(points) {
  const out = [9, zigzag(points[0][0]), zigzag(points[0][1]), ((points.length - 1) << 3) | 2];
  for (let i = 1; i < points.length; i++) out.push(zigzag(points[i][0] - points[i - 1][0]), zigzag(points[i][1] - points[i - 1][1]));
  return Buffer.concat(out.map(varintBytes));
}

/** A layer from features given as { props, type, geometry }. */
function layer(name, features) {
  const keys = [],
    values = [];
  const feats = features.map((f) => {
    const tags = [];
    for (const [k, v] of Object.entries(f.props)) {
      if (!keys.includes(k)) keys.push(k);
      values.push(v);
      tags.push(keys.indexOf(k), values.length - 1);
    }
    return lenField(
      2,
      Buffer.concat([
        lenField(2, Buffer.concat(tags.map(varintBytes))),
        varintField(3, f.type),
        lenField(
          4,
          f.geometry ??
            lineGeometry([
              [0, 0],
              [100, 0],
            ]),
        ),
      ]),
    );
  });
  return lenField(
    3,
    Buffer.concat([
      str(name),
      ...feats,
      ...keys.map((k) => lenField(3, Buffer.from(k))),
      ...values.map((v) => lenField(4, v)),
      varintField(5, 4096),
      varintField(15, 2),
    ]),
  );
}

/** Reads a tile back into { layerName: [{ props, geometryLength }] }. */
function readTile(buf) {
  const out = {};
  const r = new Reader(buf);
  while (!r.done) {
    r.varint();
    const lr = new Reader(r.bytes());
    let name = "";
    const raw = [],
      keys = [],
      vals = [];
    while (!lr.done) {
      const tag = lr.varint();
      const num = tag >> 3;
      if (num === 1) name = lr.bytes().toString();
      else if (num === 2) raw.push(lr.bytes());
      else if (num === 3) keys.push(lr.bytes().toString());
      else if (num === 4) vals.push(lr.bytes());
      else lr.varint();
    }
    out[name] = raw.map((fb) => {
      const fr = new Reader(fb);
      const props = {};
      let geometry = null;
      while (!fr.done) {
        const tag = fr.varint();
        const num = tag >> 3;
        if (num === 2) {
          const tr = new Reader(fr.bytes());
          while (!tr.done) {
            const k = tr.varint(),
              v = tr.varint();
            props[keys[k]] = new Reader(vals[v].subarray(1)).buf.toString("latin1");
          }
        } else if (num === 4) geometry = fr.bytes();
        else fr.varint();
      }
      return { props, geometry };
    });
  }
  return out;
}

const country = { type: str("administrative"), admin_level: int(2), start_decdate: dbl(1861.1), name_fr: str("drop me") };
const tile = Buffer.concat([
  layer("land_ohm_lines", [
    { props: country, type: 2 },
    { props: { type: str("administrative"), admin_level: int(8) }, type: 2 },
    { props: { type: str("boundary"), admin_level: int(2) }, type: 2 },
  ]),
  layer("transport_lines", [{ props: { type: str("railway") }, type: 2 }]),
  layer("land_ohm_centroids", [
    {
      props: { type: str("administrative"), admin_level: int(2), name: str("Bukhara"), name_uz: str("Buxoro"), name_de: str("x") },
      type: 1,
      geometry: Buffer.from([9, 2, 2]),
    },
  ]),
]);

test("only national borders and their labels survive, with only the fields the map uses", () => {
  const out = readTile(slimTile(tile, 3));
  assert.deepEqual(Object.keys(out).sort(), ["land_ohm_centroids", "land_ohm_lines"]);
  assert.equal(out.land_ohm_lines.length, 1);
  assert.deepEqual(Object.keys(out.land_ohm_lines[0].props).sort(), ["admin_level", "start_decdate", "type"]);
  assert.deepEqual(Object.keys(out.land_ohm_centroids[0].props).sort(), ["admin_level", "name", "name_uz", "type"]);
});

test("state lines are kept only from zoom 5", () => {
  const states = Buffer.concat([layer("land_ohm_lines", [{ props: { type: str("administrative"), admin_level: int(4) }, type: 2 }])]);
  assert.equal(readTile(slimTile(states, 4)).land_ohm_lines, undefined);
  assert.equal(readTile(slimTile(states, 5)).land_ohm_lines.length, 1);
});

test("low-zoom lines are snapped to the pixel grid and repeated points dropped", () => {
  const wiggly = lineGeometry([
    [0, 0],
    [3, 2],
    [5, 1],
    [800, 0],
  ]);
  const t = Buffer.concat([layer("land_ohm_lines", [{ props: country, type: 2, geometry: wiggly }])]);
  const low = readTile(slimTile(t, 2)).land_ohm_lines[0].geometry;
  const high = readTile(slimTile(t, 12)).land_ohm_lines[0].geometry;
  assert.ok(low.length < wiggly.length, "snapped line should be shorter");
  assert.deepEqual(high, wiggly, "above zoom 8 geometry is copied untouched");
});

test("bad tile addresses are refused before anything is fetched", async () => {
  for (const [z, x, y] of [
    ["3", "8", "0"],
    ["15", "0", "0"],
    ["a", "0", "0"],
    ["3", "-1", "0"],
  ]) {
    assert.equal((await tileResponse(z, x, y)).status, 400);
  }
});
