// @ts-check
// Size budget: fails (exit 1) when a shipped file grows past its limit.
// Sizes are measured brotli-compressed, which is what visitors download.
// Usage: node tools/check-size.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants } from "node:zlib";

const root = fileURLToPath(new URL("..", import.meta.url));
const KB = 1024;
const br = (/** @type {Buffer} */ buf) => brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } }).length;

/** @param {string} dir */
const filesIn = (dir) =>
  readdirSync(join(root, dir), { recursive: true })
    .map(String)
    .filter((f) => statSync(join(root, dir, f)).isFile())
    .map((f) => join(dir, f));

/** @type {{ name: string, files: string[], each?: number, total?: number }[]} */
const BUDGETS = [
  // 1492 is the heaviest snapshot (about 175 KB); everything else is under 100 KB.
  { name: "border snapshot", files: filesIn("data/v2").filter((f) => f.includes("world_")), each: 200 * KB, total: 2.4 * 1024 * KB },
  { name: "app modules", files: filesIn("js"), total: 90 * KB },
  { name: "stylesheet", files: ["styles.css"], each: 15 * KB },
  { name: "page", files: ["index.html"], each: 10 * KB },
  { name: "basemap style", files: ["data/v2/basemap.json"], each: 4 * KB },
];

let failed = false;
for (const b of BUDGETS) {
  const sizes = b.files.map((f) => ({ f, size: br(readFileSync(join(root, f))) }));
  const total = sizes.reduce((sum, s) => sum + s.size, 0);
  const largest = sizes.reduce((a, s) => (s.size > a.size ? s : a), { f: "", size: 0 });
  const over = sizes.filter((s) => b.each && s.size > b.each);
  const totalOver = b.total && total > b.total;
  const ok = !over.length && !totalOver;
  failed ||= !ok;
  const limit = [b.each && `each ≤ ${Math.round(b.each / KB)} KB`, b.total && `total ≤ ${Math.round(b.total / KB)} KB`]
    .filter(Boolean)
    .join(", ");
  console.log(
    `${ok ? "✔" : "✖"} ${b.name.padEnd(16)} ${String(sizes.length).padStart(3)} file(s)  total ${(total / KB).toFixed(0).padStart(5)} KB  largest ${(largest.size / KB).toFixed(0).padStart(4)} KB (${largest.f})  [${limit}]`,
  );
  for (const s of over) console.log(`    over budget: ${s.f} is ${(s.size / KB).toFixed(0)} KB`);
}
process.exit(failed ? 1 : 0);
