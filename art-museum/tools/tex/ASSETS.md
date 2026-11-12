# Asset brief — art museum scene (three.js, baked lighting)

ROOT = 本场景所在的文件夹（`art-museum/`）。
(The path contains spaces: always quote it.)

The scene is a contemporary art museum: exterior building on a plaza, a lobby, a modern-painting gallery. Geometry is very simple
(boxes and quads); **textures carry the detail**, lighting is baked into lightmaps and multiplied on top of these textures at runtime.
So every material texture must be a **flat-lit albedo**: no cast shadows, no highlights, no vignette, no perspective, strictly
top-down / frontal orthographic. Every tiling texture must repeat **exactly** (no visible seam, no obvious repeating blob).

## Rules for every group
- Images are generated with the tool `mcp__decision-model__image` (load it first: ToolSearch query `select:mcp__decision-model__image`).
  Leave `model` unset (the default model). `quality: "high"`, `outputFormat: "png"`, `outputDir` = absolute `ROOT/raw/<group>`.
  Sizes that always work: `1024x1024`, `1536x1024`, `1024x1536`. Other sizes (multiples of 16) may or may not be accepted — if one is rejected, fall back.
- Each image costs the user money. Budget per group is stated below; never exceed it. Look at every result (Read the file) before using it;
  regenerate only when a result is genuinely unusable.
- Prompts: describe material, colour, scale and lighting concretely. Never name a real artist, a real artwork, a brand, or a real museum. No text or
  lettering inside images unless the item says so. Never put any personal information in a prompt.
- Post-process with `ROOT/.venv/bin/python` (numpy, scipy, Pillow available) and `ROOT/tools/tex/textools.py` (read it first: flatten,
  make_tileable, set_mean, tile_preview, save_webp, key_alpha, bleed_rgb, mean_linear). Put your own scripts in `ROOT/tools/tex/<group>_*.py`
  so results are reproducible from `raw/`.
- Structured patterns (stone panels, pavers, herringbone, slats) are **not** generated as patterns: generate the plain material, make it
  tileable, then compose the pattern in code so joints are straight, the scale is exact and the tile repeats exactly.
- Final files: WebP (`save_webp`, quality 86–90; alpha textures keep alpha). Exact pixel sizes and file names as listed.
- For every tiling texture write a 3x3 tiled preview to `ROOT/raw/<group>/preview_<name>.png` and inspect it: no seam lines, no repeating
  bright/dark blobs, joints continuous across the tile border.
- Hit the stated mean sRGB value within ±6 (it keeps albedos physically plausible; lightmaps multiply them).
- Write `ROOT/raw/<group>/manifest.json`: a list of `{file, source: "generated"|"composed", model, prompt, post, px:[w,h], tile_m:[w,h]|null, mean_linear:[r,g,b]}`
  (`file` relative to ROOT; `prompt` = the exact prompt of the generation(s) used; `mean_linear` from `textools.mean_linear`).
- Touch nothing outside `raw/<group>/`, your own output files in `assets/tex/` or `assets/art/`, and `tools/tex/<group>_*.py`.

## Group `stone` (budget: 9 generations) → `assets/tex/`
| file | px | tile (m) | what | mean sRGB |
|---|---|---|---|---|
| travertine.webp | 1024x1024 | 2.4 x 2.4 | Honed ivory-beige travertine cladding: stacked panels 1.2 m wide x 0.6 m high (2 columns x 4 rows, joints aligned, no offset), 5 mm dark recessed joints (joint centred on the tile border so it stays 5 mm when tiled). Each panel is a different crop of the stone, veining horizontal, panel-to-panel brightness varies ±4 %. | 200 |
| paving.webp | 1024x1024 | 2.4 x 2.4 | Plaza paving: flamed warm-grey granite pavers 0.6 x 0.3 m, running bond (rows offset by half), 4 mm joints, paver-to-paver variation ±5 %, low contrast. | 150 |
| terrazzo.webp | 1024x1024 | 2.2 x 2.2 | Polished fine-chip terrazzo: warm light-grey matrix, chips 5–20 mm in ivory, ochre, charcoal and a few terracotta. A 6 mm brass divider strip runs along the tile border (3 px at each edge so it is 6 mm when tiled). | 185 |
| concrete.webp | 1024x1024 | 3 x 3 | Smooth fair-faced architectural concrete, light warm grey, subtle cloudy mottling, a few tiny air pores. No panel lines, no tie holes, no cracks. | 165 |
| gravel.webp | 512x512 | 3 x 3 | Pale grey roof ballast gravel seen from above (stones 2–4 cm). | 160 |
| plaster.webp | 512x512 | 2 x 2 | White painted gallery wall: almost uniform warm white with a very faint roller stipple (standard deviation under 2 %). | 232 |

## Group `wood` (budget: 8 generations) → `assets/tex/`
| file | px | tile (m) | what | mean sRGB |
|---|---|---|---|---|
| parquet.webp | 1024x1024 | 2.404 x 2.546 | Oiled natural oak herringbone, laid at 45° (zig-zag rows run along the tile's v axis), planks 600 x 100 mm. The tile must be exactly periodic: 17·(0.1·√2) m wide by 3·(0.6·√2) m high (so the texture is very slightly anisotropic — fine). Each plank is its own crop of straight-grain oak with grain along the plank, plank-to-plank tone variation ±6 %, hairline dark joints. Honey tone, not orange. | 150 |
| walnut_slats.webp | 512x1024 | 1.2 x 2.4 | Vertical timber slat wall: 24 walnut slats 30 mm wide with 20 mm gaps showing black felt; each slat shaded as a slightly rounded profile (lighter centre, darker edges), grain vertical, slat-to-slat variation. | 95 |
| oak.webp | 512x512 | 1.2 x 1.2 | Plain light oak veneer, straight grain running horizontally (u axis), satin, for benches/desks/frames. | 165 |
| bronze.webp | 256x256 | 1 x 1 | Dark anodised bronze architectural metal, finely brushed vertically, nearly uniform. | 60 |
| leather.webp | 512x512 | 1 x 1 | Dark cognac-brown upholstery leather, fine grain, uniform. | 80 |

## Group `nature` (budget: 10 generations) → `assets/tex/`
| file | px | what |
|---|---|---|
| sky.webp | 3072x768 RGB | Sky strip for a dome: left-right = 360° of azimuth, bottom row = horizon, top row = zenith. Late afternoon about 90 minutes before sunset, clear blue with scattered soft cumulus and high cirrus, warm light on the clouds, **no sun disc, no ground, no trees, no horizon objects**. Must tile exactly left-right. Bottom 8 % fades to one uniform warm haze colour (same at every azimuth); top 15 % fades to one uniform zenith blue (it is pinched at the pole). Cloud scale: the strip spans 360°, so stitch 3 generated wide skies of the same look side by side with cross-fades (or one very wide generation if the tool accepts e.g. 3072x1024), do not stretch one normal photo around the whole dome. |
| tree_a.webp, tree_b.webp, tree_c.webp | 1024x1024 RGBA | Three different single deciduous trees for billboard cards, straight side elevation, whole tree visible with a little margin, trunk base exactly at the bottom centre, soft even daylight (no hard sun side), natural mid greens (c may be a slender young tree). Transparent background: try `background: "transparent"`; if that is rejected generate on a flat pure magenta (#FF00FF) background and key it out (`key_alpha`), then `bleed_rgb`. No fringe, no ground patch, no shadow. |
| treeline.webp | 2048x256 RGBA | Distant mixed tree line for the horizon: continuous band of tree crowns, irregular top edge against transparent sky, solid at the bottom, slightly hazy/desaturated, tiles exactly left-right. |
| lawn.webp | 1024x1024 RGB, tile 4 x 4 m | Mown lawn from straight above, even, fine blades, no clumps, no shadows, no flowers; natural not neon green. mean sRGB 105. |
| hedge.webp | 512x512 RGB, tile 1.5 x 1.5 m | Clipped boxwood hedge foliage, frontal, flat-lit, dense small leaves. mean sRGB 80. |

## Groups `paintA` and `paintB` (budget: 11 generations each) → `assets/art/`
Original modern paintings for the gallery. Each image is **only the painted surface**, photographed frontally like a museum scan: it fills the image
edge to edge, no frame, no wall, no shadow, no signature, no text, no watermark, no border. Visible brushwork, impasto or canvas weave so it reads
as a real painting when a visitor walks up close. Original compositions in the broad vocabulary of 20th-century modernism and contemporary
abstraction — do not imitate any living artist and do not reproduce or paraphrase any existing famous work. The collection should feel curated:
varied in palette and method, all of museum quality.

Sizes: generate 3:2 at `1536x1024`, 2:3 at `1024x1536`, 1:1 at `1024x1024`. Final files `assets/art/<id>.webp`, quality 88, long side 1024 px
(long side 1536 px for p01, p16 and m01).

`paintA`:
- p01 (3:2, hangs 2.7 x 1.8 m, the hero piece on the title wall): large gestural abstraction — sweeping brush gestures in deep ultramarine, vermilion and raw sienna over an off-white ground, drips and scraped passages.
- p02 (3:2, 2.4 x 1.6 m): luminous atmospheric colour field — hazy fields of warm rose and saffron split by one off-centre vertical rift of deep maroon.
- p03 (2:3, 1.2 x 1.8 m): biomorphic abstraction — rounded organic forms in teal, mustard and coral on dove grey, tied together by thin black line drawing.
- p04 (1:1, 1.4 x 1.4 m): hard-edge geometric painting — interlocking arcs and circles in flat red, yellow, blue and black on cream.
- p05 (3:2, 1.8 x 1.2 m): abstracted coastal landscape in thick palette-knife impasto — slate blue, sage, sand.
- p06 (2:3, 1.0 x 1.5 m): ink-wash-inspired abstraction — sweeping black ink strokes with mineral green and cinnabar accents on a warm paper-toned ground.
- p07 (1:1, 1.2 x 1.2 m): minimalist white-on-white relief — subtle gridded texture in thick white paint with a single thin graphite line.
- p08 (3:2, 2.1 x 1.4 m): cubist-inspired fragmented still life (table, pitcher, fruit, a stringed instrument) in muted earth tones and teal.

`paintB`:
- p09 (2:3, 1.2 x 1.8 m): expressionist seated figure — abstracted, bold non-naturalistic colour, thick dark outlines.
- p10 (1:1, 1.5 x 1.5 m): optical painting — fine parallel curved lines producing a moiré vibration, indigo and orange.
- p11 (3:2, 1.8 x 1.2 m): abstract night cityscape — a grid of lit windows dissolving into blocks of cobalt and amber.
- p12 (2:3, 1.0 x 1.5 m): collage-like composition — torn-paper shapes and stencilled forms (no letters) in matte ochre, black and pale blue.
- p13 (3:2, 2.4 x 1.6 m): lyrical abstraction — floating translucent veils of poured paint, magenta, turquoise and lemon on raw canvas.
- p14 (1:1, 1.2 x 1.2 m): quiet dreamscape — simple geometric solids floating over a flat horizon in night blues with long shadows.
- p15 (2:3, 1.2 x 1.8 m): vertical totem of stacked rough rectangles in earthy reds and blacks, scraped and layered.
- p16 (3:2, hangs 3.0 x 2.0 m, the hero piece on the end wall): monumental mountain-and-water abstraction — layered ridgelines in gold, malachite green, azurite blue and ink black.
- m01 (3:2, hangs 5.4 x 3.6 m in the lobby): a large woven tapestry — abstract composition of broad interlocking shapes in terracotta, ochre, cream and deep blue; visible weave, frontal, flat-lit, edge to edge.

Besides the images each paint group writes `ROOT/raw/<group>/meta.json`: a list of
`{id, file, title_zh, title_en, artist, year, medium_zh, medium_en, w_m, h_m}` — invented titles; invented artist names (a mix of Chinese and
international names that, as far as you know, do not belong to any real well-known artist); years between 1948 and 2024; plausible media
(布面油画 / Oil on canvas, 布面丙烯, 综合材料 …). Also write a contact sheet `ROOT/raw/<group>/contact.png` (all works side by side, about 1600 px wide)
and the manifest described above (`mean_linear` included).
