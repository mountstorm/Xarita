import assert from "node:assert/strict";
import { test } from "node:test";
import { areaKm2, bboxOf, neighbours, outerRings, pointInRing, ringArea } from "../js/lib/geo.js";

/** A closed square ring with its south-west corner at (x, y). */
const square = (x, y, size = 1) => [
  [x, y],
  [x + size, y],
  [x + size, y + size],
  [x, y + size],
  [x, y],
];
const region = (name, ...rings) => ({
  properties: { NAME: name },
  geometry:
    rings.length === 1 ? { type: "Polygon", coordinates: [rings[0]] } : { type: "MultiPolygon", coordinates: rings.map((r) => [r]) },
});

test("ring area is in square degrees", () => {
  assert.equal(ringArea(square(0, 0, 2)), 4);
});

test("point-in-ring handles inside, outside and concave shapes", () => {
  assert.ok(pointInRing([0.5, 0.5], square(0, 0)));
  assert.ok(!pointInRing([1.5, 0.5], square(0, 0)));
  const ell = [
    [0, 0],
    [2, 0],
    [2, 1],
    [1, 1],
    [1, 2],
    [0, 2],
    [0, 0],
  ];
  assert.ok(pointInRing([0.5, 1.5], ell));
  assert.ok(!pointInRing([1.5, 1.5], ell));
});

test("multipolygons give one outer ring per part, and a bbox around all of them", () => {
  const f = region("Islands", square(0, 0), square(10, 5));
  assert.equal(outerRings(f).length, 2);
  assert.deepEqual(bboxOf(f), [0, 0, 11, 6]);
  assert.deepEqual(outerRings({ properties: {}, geometry: null }), []);
});

test("area shrinks towards the poles", () => {
  const equator = areaKm2(region("A", square(0, 0)));
  const north = areaKm2(region("B", square(0, 60)));
  assert.ok(equator > 12000 && equator < 12500, `1°×1° at the equator should be ~12,300 km², got ${equator}`);
  assert.ok(north < equator * 0.55);
});

test("neighbours are the regions that touch, never far ones or unnamed ones", () => {
  const a = region("A", square(0, 0));
  const b = region("B", square(1, 0));
  const far = region("Far", square(40, 40));
  const unnamed = { properties: {}, geometry: { type: "Polygon", coordinates: [square(0, 1)] } };
  const found = neighbours(a, [a, b, far, unnamed]).map((f) => f.properties.NAME);
  assert.deepEqual(found, ["B"]);
});
