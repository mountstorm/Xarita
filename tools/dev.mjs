// @ts-check
// Local dev server with no dependencies: serves the site and runs the tile
// function in-process, so `npm run dev` works without a Vercel account.

import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync } from "node:zlib";
import { tileResponse } from "../api/_ohm-slim.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const port = Number(process.env.PORT || 5173);
/** @type {Record<string, string>} */
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
};

createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  const tile = url.pathname.match(/^\/tiles\/ohm\/(\d+)\/(\d+)\/(\d+)\.pbf$/);
  try {
    if (tile) {
      const { status, headers, body } = await tileResponse(tile[1], tile[2], tile[3]);
      res.writeHead(status, headers).end(body);
      return;
    }
    let file = normalize(join(root, decodeURIComponent(url.pathname)));
    if (!file.startsWith(root)) return res.writeHead(403).end();
    if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, "index.html");
    const body = await readFile(file);
    const type = TYPES[extname(file)] || "application/octet-stream";
    // Compress text like Vercel does, so local measurements match production.
    const compress = /text|json|svg/.test(type) && /br/.test(String(req.headers["accept-encoding"]));
    res
      .writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache", ...(compress && { "Content-Encoding": "br" }) })
      .end(compress ? brotliCompressSync(body) : body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("not found");
  }
}).listen(port, () => console.log(`Xarita on http://localhost:${port}`));
