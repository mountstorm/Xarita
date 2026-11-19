import assert from "node:assert/strict";
import { test } from "node:test";
import { fracToYear, MAX_YEAR, MIN_YEAR, parseYear, SNAPSHOTS, snapFile, snapshotFor, yearToFrac } from "../js/lib/time.js";

test("the timeline runs from 3000 BC to 2010, left to right", () => {
  assert.equal(yearToFrac(MIN_YEAR), 0);
  assert.equal(yearToFrac(MAX_YEAR), 1);
  let last = -1;
  for (let y = MIN_YEAR; y <= MAX_YEAR; y += 7) {
    const f = yearToFrac(y);
    assert.ok(f > last, `position should grow at ${y}`);
    last = f;
  }
});

test("dragging to a year's position lands back on that year in the print era", () => {
  for (let y = 1450; y <= MAX_YEAR; y++) assert.equal(fracToYear(yearToFrac(y)), y);
});

test("there is no year 0", () => {
  for (let f = 0.13; f <= 0.15; f += 0.0001) assert.notEqual(fracToYear(f), 0);
});

test("typed years are understood in all three languages", () => {
  assert.equal(parseYear("1862"), 1862);
  assert.equal(parseYear("  1400 "), 1400);
  assert.equal(parseYear("-200"), -200);
  assert.equal(parseYear("200 BC"), -200);
  assert.equal(parseYear("200 bce"), -200);
  assert.equal(parseYear("mil. avv. 329"), -329);
  assert.equal(parseYear("329 до н. э."), -329);
  assert.equal(parseYear("0"), 1);
  assert.equal(parseYear("Samarkand"), null);
  assert.equal(parseYear("12345"), null);
});

test("each year uses the latest snapshot at or before it", () => {
  assert.equal(snapshotFor(1862), 1815);
  assert.equal(snapshotFor(1914), 1914);
  assert.equal(snapshotFor(1913), 1900);
  assert.equal(snapshotFor(-5000), SNAPSHOTS[0]);
  assert.equal(snapshotFor(2026), 2010);
});

test("snapshot file names match the data folder", () => {
  assert.equal(snapFile(1400), "world_1400");
  assert.equal(snapFile(-323), "world_bc323");
  assert.equal(snapFile(-1), "world_bc1");
});
