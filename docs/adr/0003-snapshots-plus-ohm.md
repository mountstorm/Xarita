# ADR 0003: Border snapshots plus OpenHistoricalMap tiles

**Status:** accepted

## Context

A history atlas lives or dies on one question: are the borders right for the year
on screen? There are two open sources, and neither is enough alone.

| | historical-basemaps snapshots | OpenHistoricalMap (OHM) tiles |
|---|---|---|
| Time resolution | 49 dated snapshots (3000 BC to 2010) | Exact start and end dates per feature |
| Shapes | Filled polygons | Lines and label points only, no polygons |
| Coverage | Whole world, every era (coarse) | Rich for Europe and the Americas; thin for Central Asia and antiquity |
| Names | English only | Many languages, including Uzbek and Russian |

Using only snapshots shows 1815 borders in 1862. Using only OHM leaves much of Asia
and the ancient world blank, and gives no filled shapes to click, colour or quiz on.

## Decision

Layer them, each doing what it's good at:

- **OHM draws the lines and labels**, filtered to the exact year on the map
  (`start ≤ year < end`), with names in the UI language.
- **The nearest earlier snapshot provides the colour tint**: a soft fill under the
  lines. It's what you click for a region card, and what the quiz measures
  (neighbours, area, "find it on the map").
- **Before 1500**, where OHM is thinnest, the snapshot's own outlines and labels come
  back on as well.
- **The UI says which is which.** The pill reads "Borders for 1862 · tint: 1815", and
  region cards say whether they come from OHM (with exact dates) or from a snapshot.

## Consequences

- Year accuracy where data exists, and something sensible everywhere else.
- Two datasets can disagree. A snapshot fill and an OHM line can sit a few km apart,
  or show a state the other doesn't know about. We accept this and label the sources
  rather than hide it.
- The quiz works on snapshot geometry, so its "which bordered X" answers follow the
  snapshot year, which the question states ("around 1815").
- Snapshot names are English-only, so some quiz answers stay in English in the Uzbek
  and Russian interfaces.
- The best long-term fix for thin regions is upstream: adding the khanates of Bukhara,
  Khiva and Kokand to OpenHistoricalMap would improve Xarita and every other OHM user.
