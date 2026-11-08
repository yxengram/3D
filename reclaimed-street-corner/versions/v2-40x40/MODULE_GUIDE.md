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
- The sun is one DirectionalLight with a static shadow map baked once after build (`shadowMap.autoUpdate=false`). Static casters: castShadow true. Its box in main.js is fitted to the model's vertices, so anything placed well outside the plinth's silhouette loses its shadow.
  **Anything that moves: castShadow=false.** Moving light on the ground comes from the canopy gobo in the shader, not from shadows.
- Wind must be CPU-side: rotate/translate Groups or Meshes, or rewrite positions on small meshes. **Don't displace vertices in shaders** (the ink pass wouldn't follow).
  So split swaying foliage into a modest number of Groups/InstancedMeshes, each pivoted at its attachment point, and rotate those a few degrees.
- Light intensities are physical-ish: sun ≈2.45, hemisphere ≈1.5. A PointLight needs intensity ~10–40 with distance ~6–10, decay 2.
- Sky fill is cool teal, sun is warm; shade should read cool, not black. No pure black anywhere; darkest values are deep teal/brown.
- Colors: use `ctx.P`. Anime look = flat clean color fields with few, deliberate value steps. Avoid noisy textures and busy high-frequency detail. Keep silhouettes clear.
- `kit.tube` is great for roots, vines, pipes, rebar, wires. `kit.chip` roughens boxes. `kit.jag` roughens broken outlines.
- Scale: 1 unit ≈ 1 m; a door is ~2.0 tall; floor height 2.7. Make things correctly scaled against that. Everything is a miniature viewed from ~90 units away, so
  small details need to be chunky enough to read but props should still look refined with several sub-parts (bevels, trims, handles, labels).
- three r187 details: use `mergeGeometries` from `three/addons/utils/BufferGeometryUtils.js` (kit.merge wraps it). Canvas color textures need `colorSpace=SRGBColorSpace` (ctx.canvasTexture does it). When unsure, grep `node_modules/three` rather than recalling an API.
- InstancedMesh is fine for many repeated pieces (`instanceColor` works with ctx.toon, without vertexColors).

## Verify your work — required
Run from the project root:
`node tools/shot.mjs --only <yourmodule>[,others] --cams hero,front --out <dir-of-your-choice> [--t 8]`
Cams: hero, front, east, west, top, back, low, lowback, shop, collapse, street, pond, corner, rail, station, town, platform, bathhouse, backlot, river, waterfall, playground, meadow. They land exactly where they say: `?shot`, `?cam=` and `setCam` bypass the camera limits a viewer has (pan box, floor, solids). `window.__diorama.constrain(true)` turns the limits on for a test.
It prints console errors/warnings then one JSON line (calls, triangles, modules status). calls/triangles are for one whole frame across all passes (beauty, ink, soft), about 2.2× the module's own count. Then LOOK at the PNGs with the Read tool. Use `--only` with neighbours to check contact/alignment.
A module isn't done until: no console errors, status "ok", it's within budget (`layout.BUDGET[name]`; tris and draws measured with --only yourmodule), and you've looked at renders and fixed what looks wrong.
Iterate visually at least 3 rounds: first get forms right, then detail, then polish.
