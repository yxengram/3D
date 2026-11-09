# v3: 40×40 → 80×80, with small buildings

`src/core/layout.js` is the contract. CORE.half (20) is the v2 area, BASE.half (40) is the new plinth edge.
The v2 core stays at its coordinates and should look the same up close. The new ring is 20 < max(|x|,|z|) < 40.

## Frame and load budget (hard targets for the full scene at hero, 2880×1800 on M1 Max)
≤ 6.3 M frame triangles, ≤ 950 draw calls, ≥ 60 fps, ≤ 11 s load, GPU memory ≤ 1.4 GB. Module budgets are in layout.BUDGET (scene triangles; a frame measures about 1.97× the scene, so the frame target corresponds to about 3.2 M scene triangles and the module budgets are upper limits, not an allocation that adds up to it).
The ring is seen from about 170 units, so spend triangles on silhouette, not fine scatter. No 8192 textures. One 4096 atlas for ring ground.

## Migration table: what `BASE.half` meant before
| Reader | Verdict |
|---|---|
| ground.js SPAN, E, atlas, plates, edgeJag | Stays at CORE.half (same rng stream). The rim at ±20 becomes a seam: the plate edge, rim turf and rim lip must go, the surface must meet outskirts.js flush. |
| ground.js RIVER.outfall use | Reads RIVER.coreCrossing (same numbers as the old outfall) |
| ground.js road-arm tongues at x=-20, z=-20 | Seam: continue flush into RING_ROADS shotengai and north |
| base.js perimeter, walls, notch, section sleepers | Moves to BASE.half. Re-lay hand features for the new perimeter, BASE.height 7. Road sections appear where ring roads meet the edge. |
| outskirts.js (new) | All ring ground: plates, RING_ROADS, sidewalks, soil, turf, keep-outs from BUILDINGS, RING_ZONES, WOODS, river hole |
| rail.js HALF, nz, ballast, curls, dangling sleepers | Moves to BASE.half. Bed runs z ∈ [-40,40]. Curls and sleepers go to the new ends. Level crossings at CROSSINGS.railN/railS. |
| river.js waterfall, spray, sign, rocks at the outfall | Moves to RIVER.outfall at z=40, drop now BASE.height 7. Canal continues with RIVER.center and widthOuter. Road bridge at CROSSINGS.canal. |
| meadow.js onPlinth | Stays: CORE.half |
| main.js floor slab, footprint ramp, dollyToFit, pan box, SOLIDS | BASE.half. Add SOLIDS from BUILDINGS and WOODS. |
| atmos.js survey grid, LIMIT, H, VIEWS, bird radius | BASE.half, new viewpoints |
| grove.js willow strands past z=20, blocked() | Check only |
| town.js, street.js, building.js, interior.js, water.js, wreck.js, banyan.js | Stay. banyan re-derives hero sky holes from HERO_CAM. |

Rules for ring modules: read BUILDINGS, RING_ROADS, RING_ZONES, WOODS; never copy literals. Buildings have a foundation at their own elev; ground under them is plain. No people, no UI.
