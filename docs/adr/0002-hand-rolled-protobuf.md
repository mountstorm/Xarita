# ADR 0002: Hand-rolled protobuf instead of a vector-tile library

**Status:** accepted

## Context

OpenHistoricalMap's vector tiles were the main reason the site was slow: up to 2 MB
per tile, cacheable for only 60 seconds, and re-read by the browser every time the
year changed. We need a server function that keeps only the features and fields the
map draws.

The usual approach is to decode the tile into GeoJSON with a library
(`@mapbox/vector-tile` + `pbf`), filter it, and re-encode it (`vt-pbf`).

## Decision

Walk the Mapbox Vector Tile protobuf directly, in about 350 lines with comments (`api/_ohm-slim.js`):
read layers, features and tags; drop what we don't need; and write the rest back out.
Feature geometry is copied as raw bytes, except at low zoom, where lines are snapped
to the display grid in the encoded command form.

## Why

- **Speed.** Decoding to GeoJSON and re-encoding means touching every coordinate twice
  and allocating an object per point. Copying geometry bytes keeps a 2 MB tile at
  about 150–230 ms and small tiles at 1–30 ms on a cold function.
- **Fidelity.** Geometry we don't simplify comes out byte-for-byte identical, so there
  is no rounding drift from re-encoding.
- **Footprint.** The function has no dependencies, which keeps cold starts fast and
  removes a supply-chain surface from the only server-side code.

## Risks and how they're handled

- **Format mistakes.** A bug here produces tiles that MapLibre silently refuses.
  `test/ohm-slim.test.js` builds tiles by hand and reads the output back:
  feature filtering, key pruning, the zoom-5 rule for state lines, grid snapping, and
  untouched geometry above zoom 8.
- **Spec coverage.** We only read what MVT v2 uses (varint, length-delimited, 32/64-bit
  fixed) and throw on anything else, so an unexpected wire type fails loudly.
- **Upstream changes.** If OpenHistoricalMap renames layers or keys, features would be
  dropped silently. The keep-lists are at the top of the file, and `npm run bench`
  against live tiles shows the savings ratio; a sudden 100% would mean an empty tile.
- **Input safety.** Tile addresses are validated (integers, zoom ≤ 14, x and y in range)
  before anything is fetched, and the upstream host is fixed, so the function can't be
  turned into an open proxy.
