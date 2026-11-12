# Graphics brief — lettering, labels, banners (group `gfx`)

ROOT = 本场景所在的文件夹（`art-museum/`）。

All of these are **composed in code** (Pillow in `ROOT/.venv/bin/python`, helpers in `ROOT/tools/tex/textools.py`), not generated: typography must be
crisp and correct. Put the script in `ROOT/tools/tex/gfx_make.py` (one script that rebuilds everything), outputs in `ROOT/assets/gfx/` as WebP,
a manifest in `ROOT/raw/gfx/manifest.json` (`{file, source:"composed", fonts, uses:[...], px}`), previews of every file on a mid-grey and on a
white background in `ROOT/raw/gfx/preview_*.png`. No image generation is needed or allowed for this group.

Fonts: use fonts installed on this Mac (look in `/System/Library/Fonts`, `/System/Library/Fonts/Supplemental`, `/Library/Fonts`), e.g. PingFang SC /
Songti SC / STHeiti for Chinese and Helvetica Neue / Avenir Next / Didot / Optima for Latin. Check that every glyph renders (no tofu boxes):
render, look at the result. Typography should feel like a real contemporary museum: generous spacing, light/regular weights, restrained.

Names (fictional): museum **栖云美术馆 / QIYUN MUSEUM OF ART**; exhibition **形与色之间 / Between Form and Colour**, subtitle
**现代绘画藏品展 / Modern Paintings from the Collection**. Painting data: `ROOT/raw/paintA/meta.json` + `ROOT/raw/paintB/meta.json`
(ids p01…p16 and m01; fields title_zh, title_en, artist, year, medium_zh, medium_en, w_m, h_m). Never use the name of a real museum or person.

| file | px | shown as | content |
|---|---|---|---|
| labels.webp | 1600x1024 RGB | atlas of 5 columns x 4 rows, cell 320x256, each cell is one wall label 0.25 x 0.20 m | Cell index i (row-major, row 0 at the TOP, column 0 at the left) = painting p(i+1) for i = 0…15, cell 16 = m01, cells 17–19 = plain label colour. Each cell: off-white card (about #F4F2EC, fills the whole cell, no border), dark grey text with ~22 px margins: artist (semi-bold) + year on the first line, title_zh, title_en (italic), then small: medium_zh / medium_en and dimensions in cm (h x w). Must fit — shrink long titles. |
| title.webp | 1200x1300 RGBA | 2.4 x 2.6 m vinyl lettering on a white gallery wall | Transparent background, text colour #2B2B2B. Top: 形与色之间 (very large), Between Form and Colour (large, light), a thin rule, 现代绘画藏品展 · Modern Paintings from the Collection, then an introduction of about 110 Chinese characters and its English version of about 70 words (write them: the show gathers sixteen works from gestural abstraction to ink-inspired painting…), bottom small line: 展厅 1 · Gallery 1. Left aligned. |
| text.webp | 800x900 RGBA | 1.6 x 1.8 m wall text | Transparent, #2B2B2B. Section heading 观看的方式 / Ways of Looking, then two short paragraphs (zh ≈ 90 characters, en ≈ 60 words) about looking slowly, light and distance. |
| way.webp | 1500x500 RGBA | 3.0 x 1.0 m wayfinding on a white lobby wall; the gallery entrance is to the viewer's RIGHT | Transparent, #2B2B2B. Large: 展厅 1 现代绘画, below: Gallery 1 · Modern Paintings, and a clean arrow pointing right at the right end. |
| desk.webp | 1600x320 RGBA | 4.0 x 0.8 m lettering on a travertine wall behind the reception desk | Transparent, dark bronze #3A2E24. 问询 · 票务 and Information · Tickets, widely tracked, centred. |
| name.webp | 2048x342 RGBA | 9.0 x 1.5 m lettering on the sunlit travertine façade | Transparent, dark bronze #2E241C. 栖云美术馆 (large, left) and QIYUN MUSEUM OF ART (tracked capitals, to its right or beneath) — one elegant lock-up filling the strip with small margins. |
| banner_a.webp | 512x1920 RGB | 1.6 x 6.0 m vertical banner on the façade | Full-bleed crop of painting p01 (`ROOT/assets/art/p01.webp`, crop a strong vertical slice, scale to fill), lower third overlaid with a solid deep ultramarine block carrying white text: 形与色之间 set vertically or stacked, small Between Form and Colour, 栖云美术馆. |
| banner_b.webp | 512x1920 RGB | second banner | Solid warm off-white ground with a crop of painting p16 (`ROOT/assets/art/p16.webp`) in the upper half and dark text below: 现代绘画藏品展, Modern Paintings from the Collection, 展厅 1 · Gallery 1. |

Alpha files: anti-aliased text edges, RGB under transparent pixels filled with the text colour (so texture filtering shows no halo) — i.e. the
whole RGB plane is the text colour and only alpha carries the shapes.
