# Asset brief — medieval painting gallery (groups `medart`, `medtex`, `medgfx`)

ROOT = the scene folder `art-museum/` (its absolute path is given in your task; it contains spaces — always quote it).

The museum scene gets a fourth part: a gallery of medieval painting. It is a long, dim, vaulted hall (19 m x 6 m, pointed barrel vault with
stone ribs, deep blue-green walls, terracotta-and-slate tile floor, concealed warm up-lighting and focused spots). Geometry is very simple; textures
carry the detail and all lighting is baked into a lightmap that is multiplied onto these textures at runtime. So every texture must be a
**flat-lit albedo**: no cast shadows, no highlights or glints, no vignette, no perspective, strictly frontal / top-down.

## Rules for all groups
- Read `ROOT/tools/tex/textools.py` first (flatten, make_tileable, set_mean, tile_preview, save_webp, key_alpha, bleed_rgb, mean_linear) and use
  `ROOT/.venv/bin/python` (numpy, scipy, Pillow). Put your scripts in `ROOT/tools/tex/<group>_build.py` so results rebuild from `raw/<group>/`.
- Images are generated with the tool `mcp__decision-model__image` (load it: ToolSearch `select:mcp__decision-model__image`). Leave `model` unset.
  `quality: "high"`, **`outputFormat: "webp"`** (PNG replies above about 3 MB fail in this tool), `outputDir` = absolute `ROOT/raw/<group>`.
  Sizes: `1024x1024`, `1536x1024`, `1024x1536` only. Each image costs the user money: stay inside the budget, look at every result before using it,
  regenerate only what is genuinely unusable. A call that returns "not JSON" saved nothing; count it against the budget.
- Prompts: concrete material, colour, scale, lighting. Never name a real artist, a real artwork, a real church, museum or collection, or a brand.
  Never put any personal information in a prompt. No readable text in images (pseudo-script that cannot be read is fine for manuscripts).
- Final files are WebP: RGB with `textools.save_webp(im, path, 88)`; RGBA with `im.save(path, 'WEBP', quality=90, method=6, exact=True)` after `bleed_rgb`.
- Write `ROOT/raw/<group>/manifest.json`: list of `{file, source: "generated"|"composed", model, prompt, post, px:[w,h], tile_m:[w,h]|null, mean_linear:[r,g,b]}`
  (`file` relative to ROOT, `prompt` = exact prompt(s) used).
- Write only inside `raw/<group>/`, your own outputs in `assets/`, and `tools/tex/<group>_*.py`. Never touch other files. You are a subagent: do not
  call update_plan or wrap_up.

## Group `medart` (budget: 15 generations) → `assets/art/md01.webp … md11.webp`
Eleven **original** works in the forms and techniques of European and Byzantine medieval painting, about 1200–1450: egg tempera and gold leaf on
wooden panel, tooled and punched gold grounds, gabled and cusped frames, polyptychs, icons, manuscript illumination, detached wall painting.
They must be new compositions in a generic period idiom: **do not copy, paraphrase or recognisably imitate any specific surviving work or any
named master**. Typical generic subjects are fine (an enthroned mother and child with angels, standing saints, an archangel, an annunciation,
scenes from a saint's life, labours of the months, beasts and foliage). Each should look like a photographed museum object: fine craquelure,
worn gilding, bole showing through, slight losses — but evenly lit, no glare, no shadow.

Two kinds of image:
- **Shaped objects (RGBA, transparent background)**: the whole object including its carved gilded frame, exactly frontal, orthographic, centred with
  a small margin, nothing else in the image. Generate with `background: "transparent"`; if a result comes back opaque, key it out (`key_alpha`)
  or regenerate. Clean alpha edge, no halo, no ground shadow; `bleed_rgb` before saving.
- **Rectangular works (RGB)**: only the painted surface, edge to edge, no frame, no wall, no border (a simple frame is added in 3D).

| id | kind | generate at | final long side | hangs (w x h, m) | what |
|---|---|---|---|---|---|
| md01 | shaped | 1536x1024 | 1536 | 3.9 x 2.6 | The hero piece on the end wall: a large polyptych altarpiece of five gabled, cusped panels (a wider, taller centre panel with an enthroned mother and child; two standing saints on each side), small pinnacle panels above, a predella strip of small scenes below, all on tooled gold ground in a carved gilded frame with slender colonnettes. |
| md02 | shaped | 1024x1536 | 1024 | 1.5 x 2.25 | A painted wooden cross (the shape of the panel is the cross itself with widened terminals and side aprons), tempera and gold, small figures in the terminals, patterned apron panels. |
| md03 | shaped | 1024x1536 | 1024 | 1.3 x 1.95 | A tall panel with a pointed gabled top: enthroned mother and child flanked by small angels, tooled gold ground, engaged gilded frame. |
| md04 | shaped | 1536x1024 | 1024 | 1.35 x 0.9 | A small portable triptych shown open: arched centre panel and two narrower hinged wings with standing figures, gold ground, red-and-gold frame. |
| md05 | rect 2:3 | 1024x1536 | 1024 | 0.7 x 1.05 | Icon: half-length bearded saint holding a closed book, frontal, gold ground with a punched halo, olive and ochre flesh modelling. |
| md06 | rect 2:3 | 1024x1536 | 1024 | 0.7 x 1.05 | Icon: an archangel in half length with a staff and orb, vermilion and deep blue garments, gold ground. |
| md07 | rect 2:3 | 1024x1536 | 1024 | 1.1 x 1.65 | Vita panel: a tall standing saint in the centre, flanked on both sides by a column of small square narrative scenes, gold ground, red borders. |
| md08 | rect 2:3 | 1024x1536 | 1024 | 0.5 x 0.75 | Illuminated manuscript leaf on vellum: a large historiated initial (a figure inside the letter shape), ivy-leaf and vine border with burnished gold dots, two columns of unreadable pseudo-script. |
| md09 | rect 2:3 | 1024x1536 | 1024 | 0.5 x 0.75 | Illuminated calendar leaf on vellum: a framed miniature of a seasonal labour (reaping or sowing) above lines of unreadable pseudo-script, foliate border with small beasts. |
| md10 | rect 3:2 | 1536x1024 | 1024 | 1.8 x 1.2 | Detached wall painting (fresco fragment): three angel musicians with lute, vielle and portative organ against a dark blue ground with gilt stars, matt chalky surface, worn edges of plaster filling the image to its borders. |
| md11 | rect 3:1 | 1536x1024, crop the middle 1536x512 | 1024 | 2.1 x 0.7 | Predella panel: one long narrow scene, a procession of small figures and horses before a walled town under a gold sky. Compose it for a 3:1 crop. |

Also write:
- `ROOT/raw/medart/meta.json`: list of `{id, file, title_zh, title_en, artist_zh, artist_en, date_zh, date_en, medium_zh, medium_en, w_m, h_m}`. Everything is
  **fictional and must read as such on inspection but plausible in form**: use invented workshop names in the convention of anonymous medieval
  makers (for example an invented "…祭坛画师 / Master of the … Altarpiece" or "…作坊 / Workshop of …" built from an invented place or attribute, not a
  real town or real notname), approximate dates ("约 1310–1320 年 / c. 1310–20"), media such as 木板蛋彩、金箔 / Tempera and gold leaf on panel,
  羊皮纸、蛋彩与金 / Tempera and gold on vellum, 壁画揭取 / Detached wall painting. Do not use the name of any real artist, town school, church or collection.
- `ROOT/raw/medart/contact.png`: all eleven works on a dark blue-green background (#1F3A3D), about 1800 px wide, each captioned with its id.

## Group `medtex` (budget: 6 generations) → `assets/tex/`
| file | px | tile (m) | what | mean sRGB |
|---|---|---|---|---|
| med_wall.webp | 512x512 | 2 x 2 | Deep blue-green matt wall paint (distemper / limewash over plaster): close to sRGB (38, 66, 70), subtle brushy mottling, standard deviation about 3 %. | 58 |
| med_floor.webp | 1024x1024 | 2.4 x 2.4 | Medieval-style tile pavement: 30 cm square unglazed tiles laid as a checkerboard (8 x 8 tiles per repeat) of worn terracotta red and dark slate-green/black, each tile its own crop of the generated material with ±6 % tone variation and softly worn edges, 4 mm pale lime joints centred on the tile border. Composed in code from generated terracotta and slate surfaces; must tile exactly. | 92 |
| med_stone.webp | 1024x1024 | 2.4 x 2.4 | Warm cream-grey dressed limestone ashlar: 8 courses 30 cm high, blocks of irregular length 45–90 cm with staggered vertical joints, fine 3 mm joints slightly darker, faint tooling marks, block-to-block variation ±4 %. Composed in code from one generated limestone surface; must tile exactly, courses run along u. | 172 |
For each texture write a 3x3 tiled preview to `ROOT/raw/medtex/preview_<name>.png` and inspect it (no seam, joints continuous across the border, no repeating blob). Hit the mean within ±6.

## Group `medgfx` (no generation: composed with Pillow, crisp typography) → `assets/gfx/`
Read `ROOT/tools/tex/GFX.md` and `ROOT/tools/tex/gfx_make.py` first and follow the same conventions, fonts and quality checks (render previews on
the stated background, zoom in, no missing glyphs, nothing clipped). Put the code in a new script `ROOT/tools/tex/medgfx_make.py` (do not change
gfx_make.py or the existing files in assets/gfx/). Previews in `ROOT/raw/medgfx/`, manifest `ROOT/raw/medgfx/manifest.json` (`{file, source:"composed", fonts, px}`).
Data for the labels: `ROOT/raw/medart/meta.json` (written by the medart group).

| file | px | shown as | content |
|---|---|---|---|
| labels_med.webp | 1280x768 RGB | atlas 4 columns x 3 rows, cell 320x256, each cell one wall label 0.25 x 0.20 m | Cell i (row-major, row 0 at the TOP) = md(i+1) for i = 0…10, cell 11 = plain card colour. Same card design as the existing `labels.webp` (off-white #F4F2EC card filling the cell, dark grey text, about 22 px margins): artist_zh / artist_en on the first lines (semi-bold), date, title_zh, title_en (italic), then small: medium_zh / medium_en and dimensions in cm (h x w). Must fit — shrink long lines. |
| medtitle.webp | 1100x1000 RGBA | 2.2 x 2.0 m lettering on a dark blue-green wall | Transparent background; the whole RGB plane is one colour, warm cream #E9DFC6, only alpha carries the shapes. Top: 金与光 (very large), Gold and Light (large, light), thin rule, 中世纪绘画 · Medieval Painting, c. 1200–1450, then an introduction of about 100 Chinese characters and an English version of about 65 words (gold grounds, tempera, panels made for candle-light and prayer, how to look at them), and a last small line stating plainly: 本展厅的作品均为专为这个三维场景创作的图像，作者与年代为虚构。/ The works in this room are images made for this 3D scene; makers and dates are fictional. Bottom small: 展厅 2 · Gallery 2. Left aligned. |
| medsign.webp | 1600x200 RGBA | 2.4 x 0.3 m inscription on a travertine wall above a pointed stone doorway | Transparent; RGB plane uniformly dark bronze #3A2E24. One centred line, widely tracked: 展厅 2　中世纪绘画　·　GALLERY 2　MEDIEVAL PAINTING (Chinese in a Song/serif face, Latin in tracked capitals). |
