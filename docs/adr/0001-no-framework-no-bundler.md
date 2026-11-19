# ADR 0001: No framework, no bundler

**Status:** accepted

## Context

Xarita is one page: a map, a timeline, a side panel and a few dialogs. Most of the
heavy lifting happens inside MapLibre (WebGL) and in network requests to libraries.
The audience includes students on phones and school Wi-Fi in Uzbekistan, where every
kilobyte and every round trip shows.

## Decision

Plain HTML, CSS and native ES modules. No React or Vue, no Vite or webpack. Modules
are loaded directly by the browser, with `modulepreload` hints so they download in
parallel instead of as a waterfall. Pure logic lives in `js/lib/` so it can be tested
in Node without a browser.

## Consequences

**What we get**

- The whole app is about 56 KB brotli, including all three languages.
- Nothing to build: `npm run dev` serves the folder, and the deployed files are the
  files in the repo. Debugging in the browser shows the real source.
- No framework upgrades to chase; the only runtime dependencies are MapLibre and,
  lazily, OpenSeadragon and the Allmaps layer.

**What we give up**

- No component model. UI updates are explicit DOM code (`innerHTML` with escaping,
  `textContent`), which takes discipline as features grow. `ui.js` is the module
  most likely to need splitting next.
- No tree-shaking or minification. Brotli recovers most of the size; the app modules
  are still smaller than one MapLibre style request's worth of tiles.
- Modules aren't fingerprinted, so they're served with `max-age=0` and revalidated
  on each load (cheap 304s) instead of being cached for a year. If that cost ever
  matters, a build step that hashes file names is the fix.
- No type system by default. We use JSDoc and `// @ts-check` on the pure code instead
  of TypeScript, which keeps the no-build property.
