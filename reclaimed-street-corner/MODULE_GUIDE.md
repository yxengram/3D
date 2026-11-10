# Scene module guide

The scene is a three.js r187 WebGLRenderer diorama. Each scene module is one file, `src/modules/<name>.js`, exporting
`export function build(ctx) { ...; return { group, update?(t, dt) }; }` (may be async).
`group` is added to the scene in WORLD coordinates (leave it at the origin). `update` runs each frame; `t` is seconds.

**Only edit your own module file.** Never edit `src/core/*`, `src/main.js`, `index.html`, `tools/*` or another module.
If core truly blocks you, say so in your final report; don't patch around it by editing core.
You may split helpers inside your module, but do not add files. No external assets, no network, no images: everything is procedural.

## ctx
- `ctx.THREE`, `ctx.layout` (read `src/core/layout.js` — THE spatial contract, use its coordinates, don't invent your own for
  anything it defines), `ctx.P` (palette, `src/core/palette.js`), `ctx.kit` (`src/core/kit.js`: box, boxBase, cyl, cylBase, sphere, ico, torus,
  chip, rock, tube, jag, plate, wallPanel, circlePts, leaf, blade, frond, flower, cloth, waterDisc, waterField, merge, xf, worldUV).
- `ctx.rng` IS the seeded generator: `ctx.rng()` returns a number; also `ctx.rng.range(a,b)`, `.int(a,b)`, `.pick(arr)`, `.sign()`. `ctx.seeded(str)` for more. Don't use Math.random in build.
- `ctx.batch()` → `b.add(geometry, surfaceNameOrMaterial, {pos,rot,scale,matrix,color})`; `b.build({castShadow,receiveShadow})` → Group
  with ONE merged mesh per material. **This is the default way to build static things**: keeps draw calls low.
  Surface names: flat (white, tint with `color`), concrete, concreteClean, plaster, asphalt, tile, rust, wood, soil, mossy.
  concrete/plaster/asphalt/tile/soil include a world-space moss overlay on upward faces and near the ground. Textures tile in world space automatically.
- `ctx.surface(name, overrides)` → cached toon material. `ctx.toon({color,map,side,transparent,opacity,emissive,dapple,moss,translucent,vertexColors})`:
  shared cel material. ALL opaque things must use these, never MeshStandardMaterial/Lambert.
  `dapple:false` for objects that must not take canopy light spots (the canopy itself). `moss:0..1` world overlay. `translucent:0..2` backlit glow (leaves, petals, thin cloth).
- `ctx.water({shallow,deep,hi,opacity,scale,indoor})` water ShaderMaterial; mesh needs uv.x = shore factor 0..1 (kit.waterDisc / waterField do this).
  `ctx.caustic({color,intensity,scale})` additive shimmering reflected-water light for ceilings. `ctx.addRipple(x,z)` triggers rings on all water.
- `ctx.canvasTexture(w,h,(g,w,h)=>{...},{srgb,repeat,filter})` for painted detail (graffiti, signs, labels, slogans, book pages).
- `ctx.noOutline(obj)`: REQUIRED for transparent things (water, glass, light shafts, particles, mist, sprites, Points, Lines). `ctx.softEdge(obj)`: opaque things that
  must occlude ink lines but draw none (dense leaves, grass, petals, small flowers). Everything else gets screen-space ink lines automatically from a depth+normal pass.
  That pass uses an override material: alphaTest cutouts are ignored there, so use real geometry for leaves, not alpha cards.
- `ctx.wind(t,x,z)` coherent gust in [-1,1]. `ctx.time()`. `ctx.scene`, `ctx.camera`, `ctx.renderer` (avoid unless needed).
- `ctx.layout.onSlab(level,x,z,margin)`, `pointInPoly`, `insideBuilding`, `wirePoint(wire,u)`, `SUN_DIR`.

## Rendering facts that bite
- The sun is one DirectionalLight with a static shadow map baked once after build (`shadowMap.autoUpdate=false`). Static casters: castShadow true. Its box is fitted from `SHADOW_BOUNDS` in main.js (the world box that casts or receives, ±40.3 × y -7.6..22.4 now), so anything well outside the plinth's silhouette loses its shadow. `node tools/shadow-fit.mjs` prints what the real vertices need against the box.
  **Anything that moves: castShadow=false.** Moving light on the ground comes from the canopy gobo in the shader, not from shadows.
- Wind must be CPU-side: rotate/translate Groups or Meshes, or rewrite positions on small meshes. **Don't displace vertices in shaders** (the ink pass wouldn't follow).
  So split swaying foliage into a modest number of Groups/InstancedMeshes, each pivoted at its attachment point, and rotate those a few degrees.
- Light intensities are physical-ish: sun ≈2.45, hemisphere ≈1.5. A PointLight needs intensity ~10–40 with distance ~6–10, decay 2.
- Sky fill is cool teal, sun is warm; shade should read cool, not black. No pure black anywhere; darkest values are deep teal/brown.
- Colors: use `ctx.P`. Anime look = flat clean color fields with few, deliberate value steps. Avoid noisy textures and busy high-frequency detail. Keep silhouettes clear.
- `kit.tube` is great for roots, vines, pipes, rebar, wires. `kit.chip` roughens boxes. `kit.jag` roughens broken outlines.
- Scale: 1 unit ≈ 1 m; a door is ~2.0 tall; floor height 2.7. Make things correctly scaled against that. Everything is a miniature; the hero camera is ~170 units away (the core ~170, the ring 110–230), so
  small details need to be chunky enough to read but props should still look refined with several sub-parts (bevels, trims, handles, labels).
- three r187 details: use `mergeGeometries` from `three/addons/utils/BufferGeometryUtils.js` (kit.merge wraps it). Canvas color textures need `colorSpace=SRGBColorSpace` (ctx.canvasTexture does it). When unsure, grep `node_modules/three` rather than recalling an API.
- InstancedMesh is fine for many repeated pieces (`instanceColor` works with ctx.toon, without vertexColors).

## Verify your work — required
Run from the project root:
`node tools/shot.mjs --only <yourmodule>[,others] --cams hero,front --out <dir-of-your-choice> [--t 8] [--w 1512 --h 860] [--dpr 2]`
Whole model: hero, front, east, west, top, back, low, lowback, ringNE, ringNW, ringSW, ringSE. Core: shop, collapse, street, pond, corner, rail, station, town, platform, bathhouse, backlot, river, waterfall (now south of the plinth at [-30, 3, 52], looking back at the outfall), playground, meadow. Ring: shotengai, shotengai2, shrine, houses, works, farm, paddies, school, gas, level, railN, canalS, waterfall2, watermill. They land exactly where they say: `?shot`, `?cam=` and `setCam` bypass the camera limits a viewer has (pan box, floor, solids). `window.__diorama.constrain(true)` turns the limits on for a test.
It prints console errors/warnings then one JSON line (calls, triangles, modules status). calls/triangles are for one whole frame across all passes (beauty, ink, soft), about 2.2× the module's own count. Then LOOK at the PNGs with the Read tool. Use `--only` with neighbours to check contact/alignment.
A module isn't done until: no console errors, status "ok", it's within budget (`layout.BUDGET[name]`; tris and draws measured with --only yourmodule), and you've looked at renders and fixed what looks wrong.
Iterate visually at least 3 rounds: first get forms right, then detail, then polish.

## v3: the 80×80 model
- **CORE vs BASE.** `CORE.half` (20) is the v2 area and stays where it was; `BASE.half` (40) is the plinth edge. "The old edge" reads CORE.half, "the plinth edge" reads BASE.half. The ring is 20 < max(|x|,|z|) < 40. BASE.height is 7. See EXPANSION_V3.md for who moved.
- **Ring layout is data.** Read `BUILDINGS` (with `buildingBox(b, pad)` for the axis-aligned footprint; `o` is the module that builds it, `b.elev + b.h` its ridge), `RING_ROADS` (`roadDist`, `nearRingRoad`), `CROSSINGS`, `RING_ZONES`, `TORII`, `WOODS`. Never copy their numbers. Camera solids in main.js are generated from `BUILDINGS`, `WOODS` and the shrine hill, so a building that stays inside its entry needs nothing else; one that overhangs it can be flown into.
- **housekit** (`src/core/housekit.js`) builds the ring's small buildings. `const H = createHouseKit(ctx, { name, seed })`, then `H.build(b, opts)` for each entry of `BUILDINGS` with `b.o === yourModule`, then `H.finish(group)` once at the end. `H.build` returns stages for details in the building's own frame (`h.S`, `h.front`, `h.right`, `h.back`, `h.left`) and `h.dims`. Walls fill the footprint exactly; a whole module merges into 8 meshes. The file's header documents the frame, the options and the Stage calls.
- **Budgets** (`layout.BUDGET`, scene triangles measured with `--only yourmodule`; a frame counts ~2.2×): outskirts 360k/24 draws; west, north, east, south 170k/18 each; woods 220k/24. Whole frame at hero: ≤ 6.3 M triangles, ≤ 950 calls, ≥ 60 fps, ≤ 11 s load, GPU ≤ 1.4 GB. One 4096 atlas for ring ground; no other large textures.
- **Build order is fixed.** Modules import in parallel but build one at a time in the `MODULES` order in main.js, so a render doesn't depend on load races. Surface textures have their own random stream each, so `--only` runs match the full scene. `window.__diorama.stats.loadMs` has import and build ms per module.
- **Shadows** are one 6144 map, rolled about the sun's axis so the plinth fills it; a texel is ~0.015 units.
- **Gobo** covers ±64 at 2048, so 16 texels per unit as before. Core dapples are v2's own, the ring has new ones. `WOODS` lobes in `CANOPIES` shade the ground whether or not the tree exists yet, so a missing tree shows as a dark blotch on bare ground.
- **Ink** fades with distance past 100 units (fully at 220): crease lines thin most, silhouettes stay. Nearer than 100 the lines are exactly v2's. Don't compensate with thicker geometry for the hero view.
- **Depth.** The near plane follows the camera from outside the model (it is 1 over the plinth), so depth stays precise at 2× hero. Birds or spray beyond 14 units past the plinth or above y=46 can be clipped from far away.
- **Viewer limits.** Pan box ±36, max distance 2.3× hero; a phone window fits itself by dolly.
- Tools: `shot.mjs` (`--root versions/v2-40x40` renders an archive, `--query` adds page params), `img.mjs` (diff, crop, side-by-side, contact sheet), `gpumem.mjs` (tally of what the page asked WebGL for), `perf.mjs`, `shadow-fit.mjs`.

## Night
`main.js` owns one number, `shared.uNight` (0 day, 1 night), eased over about 3 s. **N**, or a double click / double tap, switches; `?night` starts there; `__diorama.setNight(on, instant)` for tools. There is still no UI.
- The moon stands where the sun does, so the baked shadow map and the dapples serve both. Only the two lights' colours and strengths change.
- Lit (toon) materials need nothing. Their `emissive` is treated as daylight bounce and dims with `shared.uEmis`; pass `glow: true` to `toon()` when the emissive is a real light source.
- Unlit materials (ShaderMaterial, MeshBasicMaterial, sprites, points) get `gl_FragColor.rgb *= uUnlit` appended by main.js after all modules build. Set `material.userData.nightKeep = true` to opt out (a lamp's own glow).
- A lamp that burns at night: `ctx.shared.lamps.push({ pos: [x, y, z], r, color, power, halo, lift, at, k: (t) => 0..1 })` while building. `night.js` (built last) bakes all of them into `shared.uLampMap`, a 256² top-down map the toon shader reads once per fragment, and draws the halos. The light is unshadowed and reaches about 4 units above and below the lamp. Do not add per-fragment light loops or real PointLights: 16 lamps in the toon shader cost 30 fps.
- `night.js` also owns the fireflies. The night sky (gradient, the day's clouds from a mask, stars, moon) is `nightSky()` in `core/textures.js`.
- Check a view at night with `node tools/shot.mjs --cams hero --query night`; frame rate with `node tools/perf.mjs 2 1440 900 night`.
