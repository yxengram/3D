"""Group paintB: raw/paintB/*.{png,webp} -> assets/art/<id>.webp + raw/paintB/{manifest,meta}.json + contact.png
   Run: ROOT/.venv/bin/python ROOT/tools/tex/paintB_build.py [--edges]
   Raw generations were saved as WebP (see NOTE in manifest 'post'): PNG replies above ~3 MB failed in the image tool."""
import os, sys, json, glob
import numpy as np
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import textools as T

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RAW = os.path.join(ROOT, 'raw', 'paintB'); OUT = os.path.join(ROOT, 'assets', 'art')
MODEL = 'gpt-image-2.6-sunburst (tool default)'
TAIL = (" The image shows only the painted surface, photographed perfectly frontally like a flat museum scan under even diffuse light, "
        "the painting filling the image edge to edge. No frame, no wall, no shadow, no signature, no text, no lettering, no watermark, no border.")

PROMPTS = {
 'p09': "An original expressionist oil painting of a single seated figure, abstracted and simplified: a person sitting on a plain wooden chair, hands resting in the lap, head slightly tilted, face reduced to a few planes with no detailed features. Bold non-naturalistic colour: the skin in viridian green and lemon yellow, the clothing in crimson and violet, the background in broad slabs of orange and deep turquoise. Thick dark Prussian-blue-black outlines around every form, drawn with a loaded brush. Vigorous visible brushwork, thick impasto ridges, canvas weave showing through in thinly painted areas. Vertical format." + TAIL,
 'p10': "An original optical abstract painting in acrylic on canvas, square format. Hundreds of fine, evenly spaced parallel curved lines sweep across the whole surface in gentle S-shaped waves; a second set of fine curved lines at a slightly different curvature overlaps the first, producing a shimmering moire interference pattern that seems to vibrate and bulge. Only two colours: deep indigo blue lines and saturated orange lines on an indigo and orange ground, crisp hand-painted edges with very slight irregularities, matte paint, faint canvas weave visible." + TAIL,
 'p11': "An original abstract oil painting of a city at night, horizontal format. A loose grid of small lit windows — rows of little rectangular dabs in amber, warm yellow and pale orange — covers the centre of the canvas and gradually dissolves towards the edges into large, soft-edged blocks and slabs of deep cobalt blue, ultramarine and midnight blue-black, with a few broad amber and burnt-orange blocks glowing among them. No recognisable buildings, no skyline silhouette, no sky, no street: only the rhythm of windows breaking apart into colour blocks. Thick square brush strokes and palette-knife patches, layered paint with visible ridges, some scumbled thin passages where canvas weave shows." + TAIL,
 'pair': "A flat frontal museum scan showing two different, unrelated abstract paintings side by side. Each painting fills exactly one half of the image from top to bottom; they meet along one straight vertical line at the exact centre of the image, with no gap, no margin, no frame and no border between them or around them. Each painting's composition is centred within its own half. LEFT HALF: a collage-like composition on board — overlapping torn-paper shapes with ragged, fibrous torn edges and a few crisp stencilled forms (simple leaf, disc and crescent silhouettes sprayed through a stencil, with soft overspray), in matte ochre, black and pale blue on an off-white paper ground; layered, slightly wrinkled glued paper, dry matte gouache, absolutely no letters or numbers. RIGHT HALF: an oil painting of a tall totem of five rough, slightly irregular rectangles stacked one above another up the centre, in earthy reds — iron oxide, brick red, burnt sienna — and dense matte blacks over a warm umber and smoky grey ground; paint heavily layered and scraped back with a blade so earlier layers show as ragged scars, dry-brush drags, thick impasto ridges. Even diffuse light, no wall, no shadow, no signature, no text, no lettering, no watermark.",
 'p13': "An original lyrical abstract painting, horizontal format: thinned acrylic paint poured and stained onto unprimed raw beige cotton canvas. Large floating translucent veils of colour — magenta, turquoise and lemon yellow — drift across the surface, overlapping so that new hues appear where they cross (violet, green, orange), with soft feathered bleeding edges, tide lines where the pours dried, and a few thin runs. Generous areas of bare raw canvas remain around and between the veils, its woven texture clearly visible. Airy, weightless, luminous, no hard shapes, no brush drawing." + TAIL,
 'p14': "An original quiet dreamlike oil painting, square format. A perfectly flat, empty plain meets the sky at a low, straight horizon. Above the plain float a few simple geometric solids — a sphere, a cone, a cube and a slender cylinder — hovering motionless at different heights, each casting a long, soft painted shadow that stretches across the ground. Everything is in night blues: deep indigo sky grading to a paler band of blue-grey at the horizon, slate-blue ground, the solids in muted blue-greys with one pale moon-white sphere. Smooth, patient, matte brushwork with fine visible strokes and faint canvas weave; still, silent, mysterious mood. No people, no buildings, no stars. The image shows only the painted surface, photographed perfectly frontally like a flat museum scan under even diffuse light, the painting filling the image edge to edge. No frame, no wall, no signature, no text, no lettering, no watermark, no border.",
 'p16': "An original monumental abstract painting of mountains and water, horizontal format, in mineral pigments and ink on a large canvas. Layer upon layer of overlapping mountain ridgelines sweep across the whole width, reduced to bold abstract bands and jagged silhouettes: ridges of malachite green, ridges of azurite blue, ridges of dense ink black with wet ink washes bleeding at their edges, and ridges and mist bands of burnished gold leaf and gold pigment. In the lower third the ridges give way to a calm horizontal expanse of water suggested by pale gold and thin blue washes with a few black ink strokes. Granular mineral-pigment texture, pooled and crackled colour, splashed ink, flecks of gold. Grand, serene, contemporary, entirely non-photographic. No sun, no moon, no trees, no boats, no buildings, no seals, no calligraphy." + TAIL,
 'm01': "A large hand-woven wool tapestry seen perfectly frontally and flat, horizontal format, the woven surface filling the image edge to edge. Abstract composition of broad interlocking shapes — big curved lobes, arches, wedges and bars that lock into one another like a puzzle — in terracotta, ochre, cream and deep blue, with flat areas of colour and crisp woven edges that step slightly along the weave. The weave is clearly visible everywhere: fine horizontal ribs of weft, slight colour variation of hand-dyed yarn within each shape, small slits and hatching where colours meet. Matte wool, even flat diffuse lighting, no folds, no wrinkles, no fringe, no hanging rod, no wall, no shadow, no signature, no text, no lettering, no watermark, no border.",
}

# id: (raw stem, prompt key, crop box in raw px or None, final (w,h), hang (w_m,h_m))
WORKS = {
 'p09': ('p09',          'p09',  None,                 (683, 1024),  (1.2, 1.8)),
 'p10': ('p10',          'p10',  None,                 (1024, 1024), (1.5, 1.5)),
 'p11': ('p11',          'p11',  None,                 (1024, 683),  (1.8, 1.2)),
 'p12': ('p12_p15_pair', 'pair', 'L',                  (683, 1024),  (1.0, 1.5)),
 'p13': ('p13',          'p13',  None,                 (1024, 683),  (2.4, 1.6)),
 'p14': ('p14',          'p14',  None,                 (1024, 1024), (1.2, 1.2)),
 'p15': ('p12_p15_pair', 'pair', 'R',                  (683, 1024),  (1.2, 1.8)),
 'p16': ('p16',          'p16',  None,                 (1536, 1024), (3.0, 2.0)),
 'm01': ('m01',          'm01',  None,                 (1536, 1024), (5.4, 3.6)),
}
TRIM = {k: 4 for k in WORKS}   # px trimmed off every raw edge before the aspect crop (--edges shows a 1-3 px brighter line along the top edge of most raws)
PAIR_X = {'L': 72, 'R': 796}   # left x of the 683 px wide crop inside the 1536x1024 pair image (seam at x=768)
# QC pass: the 683 px crop at x=72 cut the stencilled leaf sprig of p12 along its stem. The whole left half is used instead
# (x=22..756: sprig, disc and crescent complete, clear of the seam) and squeezed horizontally by 7.7 % to reach 2:3.
PAIR_BOX = {'L': (22, 4, 756, 1020)}   # explicit raw box, resized straight to the final size (replaces PAIR_X + trim for that half)

META = [
 ('p09', '坐着的人（绿与紫）', 'Seated Figure in Green and Violet', 'Marit Halvorsrud', 1957, '布面油画', 'Oil on canvas'),
 ('p10', '振荡 第7号', 'Oscillation No. 7', 'Tomás Echeverri Lund', 1966, '布面丙烯', 'Acrylic on canvas'),
 ('p11', '万窗灯火', 'Ten Thousand Windows', '沈以澄 Shen Yicheng', 1988, '布面油画', 'Oil on canvas'),
 ('p12', '撕纸与新月', 'Torn Paper with Crescent', 'Odile Brennecke', 1972, '综合材料（纸本拼贴、水粉、镂版喷绘，裱于木板）', 'Mixed media (paper collage, gouache and stencil on board)'),
 ('p13', '浮纱', 'Drifting Veils', 'Aroha Tindall', 1974, '布面丙烯（未涂底画布）', 'Acrylic on unprimed canvas'),
 ('p14', '静夜几何', 'Geometry of a Quiet Night', '陆霁川 Lu Jichuan', 1995, '布面油画', 'Oil on canvas'),
 ('p15', '赤土图腾', 'Red Earth Totem', 'Kofi Asare-Whitlock', 1961, '布面油画', 'Oil on canvas'),
 ('p16', '层峦·金碧', 'Layered Ridges in Gold and Blue-Green', '顾青岚 Gu Qinglan', 2019, '布面矿物颜料、水墨、金箔', 'Mineral pigments, ink and gold leaf on canvas'),
 ('m01', '合流', 'Confluence', 'Paloma Iturralde Sanz', 1978, '手工羊毛挂毯', 'Hand-woven wool tapestry'),
]

def raw_path(stem):
    c = sorted(glob.glob(os.path.join(RAW, stem + '-*.png')) + glob.glob(os.path.join(RAW, stem + '-*.webp')))
    assert c, 'missing raw ' + stem; return c[-1]

def fit_crop(im, ar):
    """largest centred crop with aspect ar = w/h"""
    w, h = im.size
    if w / h > ar: nw = int(round(h * ar)); x = (w - nw) // 2; return im.crop((x, 0, x + nw, h))
    nh = int(round(w / ar)); y = (h - nh) // 2; return im.crop((0, y, w, y + nh))

def edges_report():
    for stem in sorted({v[0] for v in WORKS.values()}):
        a = T.to_f(Image.open(raw_path(stem))).mean(2); h, w = a.shape
        def prof(v): return ' '.join('%.3f' % x for x in v)
        print(stem, a.shape)
        print('  top rows   ', prof(a[:8].mean(1)), '| ref', '%.3f' % a[8:40].mean())
        print('  bottom rows', prof(a[-8:].mean(1)), '| ref', '%.3f' % a[-40:-8].mean())
        print('  left cols  ', prof(a[:, :8].mean(0)), '| ref', '%.3f' % a[:, 8:40].mean())
        print('  right cols ', prof(a[:, -8:].mean(0)), '| ref', '%.3f' % a[:, -40:-8].mean())
        if 'pair' in stem:
            g = np.abs(np.diff(T.to_f(Image.open(raw_path(stem))), axis=1)).mean((0, 2))
            x = 700 + int(np.argmax(g[700:836])); print('  seam at x =', x, 'grad', g[x - 3:x + 4].round(3))

def build():
    os.makedirs(OUT, exist_ok=True); manifest = []; finals = {}
    for wid, (stem, pk, crop, size, hang) in WORKS.items():
        src = raw_path(stem); im = Image.open(src).convert('RGB'); post = []
        if crop in PAIR_BOX:
            b = PAIR_BOX[crop]; im = im.crop(b).resize(size, Image.LANCZOS)
            post.append('one 1536x1024 generation holds p12 (left half) and p15 (right half); crop x=%d..%d y=%d..%d (%dx%d: the whole half, clear of the seam at x=768, '
                        'so that the leaf sprig, disc and crescent are all complete); non-uniform Lanczos resize to %dx%d (horizontal squeeze %.1f %% relative to vertical)'
                        % (b[0], b[2], b[1], b[3], b[2] - b[0], b[3] - b[1], size[0], size[1], 100 * (1 - (size[0] / (b[2] - b[0])) / (size[1] / (b[3] - b[1])))))
        elif crop in ('L', 'R'):
            x = PAIR_X[crop]; im = im.crop((x, 0, x + 683, 1024))
            post.append('one 1536x1024 generation holds p12 (left half) and p15 (right half); crop x=%d..%d (683x1024, clear of the seam at x=768)' % (x, x + 683))
        t = 0 if crop in PAIR_BOX else TRIM.get(wid, 0)
        if t: im = im.crop((t, t, im.size[0] - t, im.size[1] - t)); post.append('trim %d px off every edge' % t)
        ar = size[0] / size[1]
        if abs(im.size[0] / im.size[1] - ar) > 1e-3: im = fit_crop(im, ar); post.append('centre crop to %d:%d' % ((3, 2) if ar > 1 else (2, 3) if ar < 1 else (1, 1)))
        if im.size != size: im = im.resize(size, Image.LANCZOS); post.append('Lanczos resize to %dx%d' % size)
        post.append('WebP q88')
        dst = os.path.join(OUT, wid + '.webp'); T.save_webp(im, dst, q=88)
        fin = Image.open(dst).convert('RGB'); assert fin.size == size; finals[wid] = fin
        manifest.append({'file': 'assets/art/%s.webp' % wid, 'source': 'generated', 'model': MODEL, 'prompt': PROMPTS[pk],
                         'raw': 'raw/paintB/' + os.path.basename(src),
                         'post': '; '.join(post) + ' (raw generation saved as WebP, not PNG: PNG replies failed in the image tool)' * src.endswith('.webp'),
                         'px': list(size), 'tile_m': None, 'mean_linear': T.mean_linear(fin)})
        print(wid, size, os.path.getsize(dst) // 1024, 'kB', 'mean sRGB %.0f' % (T.to_f(fin).mean() * 255))
    json.dump(manifest, open(os.path.join(RAW, 'manifest.json'), 'w'), ensure_ascii=False, indent=1)
    meta = [{'id': i, 'file': 'assets/art/%s.webp' % i, 'title_zh': tz, 'title_en': te, 'artist': ar, 'year': yr, 'medium_zh': mz, 'medium_en': me,
             'w_m': WORKS[i][4][0], 'h_m': WORKS[i][4][1]} for (i, tz, te, ar, yr, mz, me) in META]
    assert [m['id'] for m in meta] == list(WORKS)
    json.dump(meta, open(os.path.join(RAW, 'meta.json'), 'w'), ensure_ascii=False, indent=1)
    contact(finals)

def contact(finals, W=1600, gap=10, lab=18):
    rows = [['p09', 'p10', 'p11', 'p12', 'p13'], ['p14', 'p15', 'p16', 'm01']]
    try: font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 14)
    except Exception: font = ImageFont.load_default()
    strips = []
    for r in rows:
        ars = [finals[i].size[0] / finals[i].size[1] for i in r]
        h = int((W - gap * (len(r) + 1)) / sum(ars)); strip = Image.new('RGB', (W, h + lab + gap), (236, 234, 230)); d = ImageDraw.Draw(strip); x = gap
        for i, a in zip(r, ars):
            w = int(h * a); strip.paste(finals[i].resize((w, h), Image.LANCZOS), (x, gap)); d.text((x, h + gap + 2), '%s  %dx%d' % ((i,) + finals[i].size), fill=(40, 40, 40), font=font); x += w + gap
        strips.append(strip)
    out = Image.new('RGB', (W, sum(s.size[1] for s in strips) + gap), (236, 234, 230)); y = 0
    for s in strips: out.paste(s, (0, y)); y += s.size[1]
    out.save(os.path.join(RAW, 'contact.png'))

if __name__ == '__main__':
    edges_report() if '--edges' in sys.argv else build()
