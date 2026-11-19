// @ts-check
// Measures what the tile function saves on 10 real OpenHistoricalMap tiles.
// Needs network access. Usage: node tools/bench.mjs
import { gzipSync } from "node:zlib";
import { slimTile } from "../api/_ohm-slim.js";

// A spread of zooms and regions, including the heaviest tiles we found (Europe at z0, z3, z4).
const TILES = ["0/0/0", "1/1/0", "2/2/1", "3/4/2", "3/5/3", "4/8/5", "4/11/6", "5/17/11", "6/43/24", "7/88/48"];

console.log("tile      upstream   slimmed   saved   time");
let before = 0,
  after = 0;
for (const addr of TILES) {
  const z = Number(addr.split("/")[0]);
  const raw = Buffer.from(await (await fetch(`https://vtiles.openhistoricalmap.org/maps/ohm/${addr}.pbf`)).arrayBuffer());
  const t0 = performance.now();
  const slim = gzipSync(slimTile(raw, z), { level: 9 });
  const ms = performance.now() - t0;
  const up = gzipSync(raw, { level: 6 }).length;
  before += up;
  after += slim.length;
  console.log(
    `${addr.padEnd(9)} ${`${(up / 1024).toFixed(0)} KB`.padStart(8)} ${`${(slim.length / 1024).toFixed(0)} KB`.padStart(9)} ${`${(100 - (slim.length / up) * 100).toFixed(0)}%`.padStart(6)} ${`${ms.toFixed(0)} ms`.padStart(7)}`,
  );
}
console.log(
  `total     ${`${(before / 1024).toFixed(0)} KB`.padStart(8)} ${`${(after / 1024).toFixed(0)} KB`.padStart(9)} ${`${(100 - (after / before) * 100).toFixed(0)}%`.padStart(6)}`,
);
