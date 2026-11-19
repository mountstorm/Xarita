# Data

`v2/world_*.json` are simplified versions of the border snapshots from
[aourednik/historical-basemaps](https://github.com/aourednik/historical-basemaps),
licensed GPL-3.0 (see `LICENSE`). `v2/basemap.json` is a trimmed copy of the
OpenFreeMap Positron style.

Rebuild both with `node tools/build-data.mjs <scratch-dir>`. Put new builds in a new
folder (`v3/`), because `data/` is served with a one-year cache.
