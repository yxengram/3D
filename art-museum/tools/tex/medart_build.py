"""Group medart: raw/medart/md??-*.webp -> assets/art/md01..md11.webp + raw/medart/{manifest,meta}.json + contact.png + previews
   Run: ROOT/.venv/bin/python ROOT/tools/tex/medart_build.py
   Eleven original works in generic medieval idioms for the medieval-painting gallery (see tools/tex/MED.md, group `medart`).
   Raw generations: image tool, default model, quality high, outputFormat webp; md01-md04 with background transparent (native alpha).
   11 generations used (budget 15): every first result was usable."""
import os, sys, json, glob
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import textools as T

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RAW = os.path.join(ROOT, 'raw', 'medart'); OUT = os.path.join(ROOT, 'assets', 'art')
MODEL = 'gpt-image-2.6-sunburst (tool default)'
WALL = (0x1F, 0x3A, 0x3D)

SHAPED_TAIL = (" The object is shown alone as an isolated cut-out on a fully transparent background: exactly frontal, orthographic straight-on view with no perspective and no tilt, {extra}centred, the whole {what} visible with a small empty margin on all sides{tall}. "
               "Even, diffuse, shadowless documentation light: no glare, no specular glints on the gold, no cast shadow, no ground shadow, no wall, {no}, no label, no text, no lettering, no inscription, {no2}no watermark. Clean crisp outer edge.")
PANEL_TAIL = (" The image shows only the painted surface itself, photographed perfectly frontally like a flat museum scan under even, diffuse, shadowless light, the painting filling the image edge to edge. "
              "No {frame}, no wall, no margin, no shadow, no glare, no reflections or glints on the gold, no vignette, no text, no lettering, no inscription, {extra}no watermark.")
LEAF_TAIL = (" Creamy, slightly yellowed vellum with soft mottling, a few follicle marks{stains} and worn edges. The image shows only the flat leaf itself, photographed perfectly frontally like a flat library scan under even, diffuse, shadowless light, "
             "the vellum filling the image edge to edge. No book gutter, no second page, no background, no wall, no table, no frame, no shadow, no glare, no glints on the gold, no vignette, no readable text, no watermark.")
AGED = " Aged surface: fine craquelure, worn gilding with red-brown bole showing through, small scattered paint losses."

PROMPTS = {
 'md01': "A museum documentation photograph of a large late-medieval polyptych altarpiece, an original work in a generic early-fourteenth-century style, egg tempera and gold leaf on wooden panels in a carved gilded frame. Five tall panels stand side by side, each with a pointed cusped (trefoil) gothic arch under a steep gable: the centre panel is clearly wider and taller than the others and shows an enthroned mother in a deep blue mantle holding a child on her lap, seated on a carved throne; on each side of it are two narrower panels, each with one full-length standing saint in long robes (rose, green, ochre and grey-blue, one holding a book, one a palm branch, one a staff, one a small model of a church), all with punched gold halos. Above each of the five gables sits a small pinnacle panel with a half-length figure, topped by carved leaf finials. Along the bottom runs a low predella strip across the full width, divided into five small narrative scenes with tiny figures and buildings. All backgrounds are burnished gold leaf with tooled and punched borders. The carved gilded wooden frame has slender twisted colonnettes with small capitals between the panels, leafy crockets along the gables and a moulded base. Aged surface: fine craquelure, worn gilding with red-brown bole showing through, small paint losses. The altarpiece is wider than tall and fills almost the full width of the image."
         + SHAPED_TAIL.format(extra='perfectly symmetrical, ', what='object', tall='', no='no altar table, no plinth', no2=''),
 'md02': "A museum documentation photograph of a large medieval painted wooden cross made to hang above an altar, an original work in a generic thirteenth-century style, egg tempera and gold leaf on wood. The panel itself is cut in the shape of a cross: a tall vertical shaft and a horizontal crossbar, with widened rectangular terminals at the top end and at the ends of both arms, a widened rectangular foot at the bottom, and two tall rectangular apron panels flanking the shaft directly below the crossbar. Painted on it is the slender, calm, stylised figure of the crucified Christ with a gold punched halo, in ochre and olive flesh tones with a white loincloth, set against a deep blue cross-shaped field edged in red. In the left and right terminals are small half-length mourning figures, in the top terminal a small half-length angel in a roundel, in the foot a small kneeling figure. The two apron panels are covered with a geometric textile pattern of diamonds and rosettes in red, dark blue and gold. Gold-leaf borders with punched ornament; a narrow raised gilded and red moulding runs around the whole outline of the cross. Aged surface: fine craquelure, worn gilding with red-brown bole showing through, small paint losses, a few old woodworm holes."
         + SHAPED_TAIL.format(extra='symmetrical, ', what='cross', tall=', taller than wide', no='no hanging chains or hardware, no plinth', no2='no title board with letters, '),
 'md03': "A museum documentation photograph of a tall late-medieval devotional panel painting with a pointed gabled top, an original work in a generic early-fourteenth-century style, egg tempera and gold leaf on a poplar panel. The panel is a tall rectangle that ends at the top in a steep pointed gable; its engaged carved and gilded frame follows this outline, with a plain moulded profile and small carved crockets along the gable. Painted subject: an enthroned mother in a deep ultramarine-blue mantle over a rose-red dress, seated frontally on a wide carved and inlaid wooden throne with a patterned cloth of honour, holding a small child in an ochre tunic on her lap; both have large gold halos decorated with rings of punched dots and rosettes. On each side of the throne three small angels stand one above the other, in pale rose, green and lilac robes with coloured wings. The whole background is burnished gold leaf with a tooled and punched border running along the inside of the frame. Aged surface: fine network of craquelure, worn gilding with red-brown bole showing through in places, a few small paint losses and old woodworm holes in the frame."
         + SHAPED_TAIL.format(extra='', what='object', tall=', much taller than wide', no='no hanging hardware, no plinth', no2=''),
 'md04': "A museum documentation photograph of a small portable medieval triptych shown fully open and flat, an original work in a generic fourteenth-century style, egg tempera and gold leaf on wood. Three panels joined by small iron hinges: a centre panel with a round-arched top, and two narrower hinged wings, each shaped as half of that arch so that together they would close over the centre. Centre panel: a seated mother in a dark blue mantle holding a child, with two small kneeling angels at her feet. Left wing: a standing bearded saint in a brown habit holding a book. Right wing: a standing young female saint in a green dress and red cloak holding a palm branch. Above the figures in each wing, a small half-length angel. All backgrounds are burnished gold leaf with punched halos and tooled borders. Each panel has its own engaged frame: a raised moulding painted vermilion red with gilded inner and outer edges and small gilded rosettes. Aged surface: fine craquelure, worn gilding with red-brown bole showing through, rubbed corners, small paint losses. The opened triptych is wider than tall and fills most of the image width."
         + SHAPED_TAIL.format(extra='the wings lying in the same plane as the centre, symmetrical, ', what='object', tall='', no='no table, no stand', no2=''),
 'md05': "An original medieval Byzantine-style icon, egg tempera and gold leaf on a wooden panel, vertical format, in a generic thirteenth-century idiom. A half-length elderly bearded saint, strictly frontal and symmetrical, with a high forehead, grey hair and a long grey beard, wearing a dark olive-brown mantle over an ochre tunic with fine gold-line highlights on the folds. He holds a closed book with a jewelled red-and-gold cover against his chest with his left hand and raises his right hand in blessing. The flesh is modelled in the traditional way: olive-green underpaint with ochre and warm pink lights and fine white highlight lines. The entire background is plain burnished gold leaf; around the head a large halo marked only by rings of punched dots and small punched rosettes in the gold. Aged surface: fine craquelure, worn gilding with red-brown bole showing through, small scattered paint losses, slightly darkened varnish."
         + PANEL_TAIL.format(frame='frame, no raised border', extra='no monogram, '),
 'md06': "An original medieval Byzantine-style icon, egg tempera and gold leaf on a wooden panel, vertical format, in a generic fourteenth-century idiom. A half-length archangel, frontal, with a youthful calm face, curly brown hair bound with a white ribbon whose ends flutter beside the ears, and large wings in brown and gold with fine gold feather lines rising behind the shoulders. The archangel wears a vermilion-red mantle over a deep blue tunic with a gold-embroidered, pearl-studded collar and cuffs. In the right hand a long slender staff, in the left hand a translucent pale-blue orb marked with a simple cross-shaped ornament (no letters). The flesh is modelled with olive-green underpaint, ochre and warm pink lights and fine white highlight lines. The entire background is plain burnished gold leaf; around the head a halo marked by a punched ring of dots in the gold." + AGED
         + PANEL_TAIL.format(frame='frame, no raised border', extra='no monogram, '),
 'md07': "An original medieval vita panel, egg tempera and gold leaf on a wooden panel, vertical format, in a generic late-thirteenth-century idiom. In the centre, occupying the full height, a tall standing male saint in a plain grey-brown hooded habit with a rope belt, frontal, with a short beard and a gold punched halo, holding a closed book in one hand and a small wooden cross in the other, set against burnished gold. On the left and on the right of the figure runs a vertical column of four small square narrative scenes (eight scenes in all), each framed by a red border with a thin white line: tiny figures in simple settings — the saint giving a cloak to a beggar, preaching to birds beside a tree, kneeling in prayer before a small chapel, healing a sick man in bed, calming a wolf at a town gate, crossing water in a small boat, receiving a visitor in a rocky cave, and his funeral with mourning friars. Small simple buildings with pink and green walls, rocky hills, gold skies. A red border also surrounds the whole panel." + AGED
         + PANEL_TAIL.format(frame='carved frame', extra='no captions, '),
 'md08': "An original illuminated manuscript leaf on vellum from a large medieval choir or prayer book, in a generic early-fourteenth-century gothic idiom, tempera, ink and burnished gold on parchment, vertical format. In the upper left, a large historiated initial about one third of the page high: a rounded letter shape painted in blue and rose with white filigree, on a square burnished-gold field, and inside the letter a small seated figure of a scribe monk in a grey habit writing at a sloped desk. From the initial a bar border in blue, rose and gold runs down the left margin and along the top and bottom, sprouting curling vine tendrils with small ivy leaves in blue, red and green and many small burnished gold dots and gold ivy leaves; a small bird perches in the lower border. The text block is two columns of dense, regular gothic book-hand in dark brown ink with a few small red and blue line-fillers and small coloured initials: the writing is illegible pseudo-script, rhythmic strokes that cannot be read as any real letters or words. Faint ruled lines."
         + LEAF_TAIL.format(stains=', slight cockling stains'),
 'md09': "An original illuminated calendar leaf on vellum from a medieval book of hours, in a generic early-fifteenth-century gothic idiom, tempera, ink and gold on parchment, vertical format. In the upper half, a framed rectangular miniature with a thin burnished-gold frame: a summer labour of the month, two peasants reaping a field of ripe golden wheat with sickles while a third binds sheaves, a low green hill with a small thatched barn behind them, under a deep blue sky patterned with fine gold tendrils; flat, bright colours, small doll-like figures, no perspective depth. Below the miniature, about twelve lines of gothic book-hand in dark brown ink, with some lines in red and blue and a few small gold initials: the writing is illegible pseudo-script, rhythmic strokes that cannot be read as any real letters, words or numerals. All around runs a wide foliate border of fine black-ink tendrils with small gold ivy leaves, blue and red flowers and strawberries, inhabited by small beasts: a hare, a snail, a small dragon with a curling tail, a bird and a monkey."
         + LEAF_TAIL.format(stains=''),
 'md10': "An original detached medieval wall painting, a fresco fragment transferred to a flat support, in a generic late-fourteenth-century idiom, horizontal format. Three angel musicians stand side by side, shown from the knees up: the left angel plays a lute, the middle angel bows a vielle (a medieval fiddle) held at the shoulder, the right angel plays a small portative organ held on the arm. They have gentle faces, curled fair hair, plain disc halos in dull yellow ochre with traces of gilding, large wings in soft rose, green and ochre, and long robes in pale rose, sage green and warm white. Behind them a dark blue ground (azurite, uneven and partly worn to a grey-black underlayer) scattered with small eight-pointed stars in worn gilt. Matt, dry, chalky fresco surface: visible plaster grain, fine cracks, abraded passages, a few areas of loss filled with plain neutral beige plaster, the joins of the day's work faintly visible. The fragment has irregular worn edges, but the pale plaster of the support continues to all four borders so that plaster and painting completely fill the image. The image shows only this flat surface, photographed perfectly frontally like a flat museum scan under even, diffuse, shadowless light, edge to edge. No frame, no wall beyond the plaster, no margin, no shadow, no glare, no highlights, no vignette, no text, no lettering, no inscription, no watermark.",
 'md11': "An original medieval predella panel, egg tempera and gold leaf on a wooden panel, in a generic fourteenth-century idiom: one single long, narrow, continuous scene with no divisions. The scene is composed as a wide panoramic band for a 3:1 crop: everything important lies in the middle half of the image height, in a horizontal band running across the full width from the left edge to the right edge. In this band a procession of many small figures moves from left to right along a pale road: riders on white, bay and grey horses with red and blue harness, men on foot in short tunics and pointed hoods carrying banners (plain coloured, no emblems or letters) and long trumpets, a pair of pack mules, two small dogs. Behind them, at the right, a walled town with crenellated pink and cream walls, an open gate, tall towers and red tiled roofs, and at the left rounded rocky hills with a few small dark trees. Small doll-like figures, flat bright colours, no real perspective. Above the band, the top quarter of the image is nothing but plain burnished gold-leaf sky; below the band, the bottom quarter is nothing but plain dark green-brown ground with a few tufts of grass and small stones." + AGED
         + PANEL_TAIL.format(frame='frame, no border', extra='no heraldry, '),
}

# id: (kind, generated at, final (w,h), hang (w_m,h_m))
WORKS = {
 'md01': ('shaped', '1536x1024', (1536, 1024), (3.9, 2.6)),
 'md02': ('shaped', '1024x1536', (683, 1024),  (1.5, 2.25)),
 'md03': ('shaped', '1024x1536', (683, 1024),  (1.3, 1.95)),
 'md04': ('shaped', '1536x1024', (1024, 683),  (1.35, 0.9)),
 'md05': ('rect',   '1024x1536', (683, 1024),  (0.7, 1.05)),
 'md06': ('rect',   '1024x1536', (683, 1024),  (0.7, 1.05)),
 'md07': ('rect',   '1024x1536', (683, 1024),  (1.1, 1.65)),
 'md08': ('leaf',   '1024x1536', (683, 1024),  (0.5, 0.75)),
 'md09': ('leaf',   '1024x1536', (683, 1024),  (0.5, 0.75)),
 'md10': ('rect',   '1536x1024', (1024, 683),  (1.8, 1.2)),
 'md11': ('rect',   '1536x1024', (1024, 341),  (2.1, 0.7)),
}
MARGIN = 8          # px of transparent margin kept around a shaped object in the final canvas
TRIM = {'md08': 8, 'md09': 8}   # px trimmed off every raw edge of rectangular works (default 4)
# md11: the brief asks for the middle 1536x512. In the generated image the scene band is 529 px high (tower tops y=216 .. lower edge of the road y=745),
# so a 512 px crop would cut either the battlements or the road. A 548 px band is used instead and squeezed vertically by 7 % to reach 3:1.
BOX = {'md11': (4, 204, 1532, 752)}

META = [  # id, title_zh, title_en, artist_zh, artist_en, date_zh, date_en, medium_zh, medium_en      (everything fictional)
 ('md01', '圣母子登座与四圣徒（多联祭坛画）', 'Enthroned Mother and Child with Four Saints (polyptych)', '螺旋柱祭坛画师', 'Master of the Twisted-Column Altarpiece', '约 1320–1330 年', 'c. 1320–30', '木板蛋彩、金箔', 'Tempera and gold leaf on panel'),
 ('md02', '彩绘木十字架', 'Painted Cross', '菱花围板十字架画师', 'Master of the Lozenge-Apron Cross', '约 1270–1280 年', 'c. 1270–80', '木板蛋彩、金箔', 'Tempera and gold leaf on panel'),
 ('md03', '圣母子登座与六天使', 'Enthroned Mother and Child with Six Angels', '团花光环画师作坊', 'Workshop of the Master of the Rosette Halos', '约 1330–1340 年', 'c. 1330–40', '木板蛋彩、金箔', 'Tempera and gold leaf on panel'),
 ('md04', '便携式三联画：圣母子与二圣徒', 'Portable Triptych: Mother and Child with Two Saints', '红框三联画画师', 'Master of the Red-Framed Triptych', '约 1350–1360 年', 'c. 1350–60', '木板蛋彩、金箔', 'Tempera and gold leaf on panel'),
 ('md05', '持书圣徒半身像', 'A Saint Holding a Book', '珠点光环圣像画师', 'Master of the Pearl-Dotted Halo', '约 1280–1300 年', 'c. 1280–1300', '木板蛋彩、金箔', 'Tempera and gold leaf on panel'),
 ('md06', '持杖与宝球的天使长', 'Archangel with Staff and Orb', '朱袍天使长画师', 'Master of the Vermilion Archangel', '约 1340–1360 年', 'c. 1340–60', '木板蛋彩、金箔', 'Tempera and gold leaf on panel'),
 ('md07', '修士圣徒立像及其生平八景', 'A Friar Saint with Eight Scenes from His Life', '八景生平画师', 'Master of the Eight-Scene Vita Panel', '约 1260–1280 年', 'c. 1260–80', '木板蛋彩、金箔', 'Tempera and gold leaf on panel'),
 ('md08', '首字母装饰页：写经的修士', 'Leaf with a Historiated Initial: A Monk Writing', '写经僧首字母画师', 'Master of the Scribe Initial', '约 1310–1330 年', 'c. 1310–30', '羊皮纸、蛋彩与金', 'Tempera and gold on vellum'),
 ('md09', '月历页：收割', 'Calendar Leaf: Reaping', '草莓边饰画师', 'Master of the Strawberry Borders', '约 1410–1420 年', 'c. 1410–20', '羊皮纸、蛋彩与金', 'Tempera and gold on vellum'),
 ('md10', '三位奏乐天使', 'Three Angel Musicians', '星空天使画师作坊', 'Workshop of the Master of the Star-Field Angels', '约 1380–1400 年', 'c. 1380–1400', '壁画揭取', 'Detached wall painting'),
 ('md11', '城门前的行列（祭坛座画）', 'Procession before a Walled Town (predella panel)', '红帽行列画师', 'Master of the Red-Hood Procession', '约 1340–1350 年', 'c. 1340–50', '木板蛋彩、金箔', 'Tempera and gold leaf on panel'),
]

def raw_path(wid):
    c = sorted(glob.glob(os.path.join(RAW, wid + '-*.webp')) + glob.glob(os.path.join(RAW, wid + '-*.png')))
    assert c, 'missing raw ' + wid; return c[-1]

def fit_crop(im, ar):
    w, h = im.size
    if w / h > ar: nw = int(round(h * ar)); x = (w - nw) // 2; return im.crop((x, 0, x + nw, h))
    nh = int(round(w / ar)); y = (h - nh) // 2; return im.crop((0, y, w, y + nh))

def resize_f(a, size):
    a = np.asarray(a, np.float32)
    return np.dstack([np.asarray(Image.fromarray(np.ascontiguousarray(a[..., c]), 'F').resize(size, Image.LANCZOS)) for c in range(a.shape[2])])

def build_shaped(wid, src, size):
    """native alpha -> levels, stray specks removed -> crop to the object -> premultiplied Lanczos fit into the final canvas -> bleed"""
    im = Image.open(src); assert im.mode == 'RGBA', (wid, im.mode)
    a = np.asarray(im, np.float32) / 255.0; rgb, al = a[..., :3], a[..., 3]
    al = np.clip((al - 13 / 255) / ((245 - 13) / 255), 0, 1)            # background noise (alpha <= 8/255) -> 0, object (250..254) -> 1
    lab, n = ndimage.label(al > 0.5); sizes = ndimage.sum(al > 0.5, lab, range(1, n + 1)); main = lab == 1 + int(np.argmax(sizes))
    al = al * ndimage.binary_dilation(main, iterations=3)                # nothing but the object and its anti-aliased edge
    ys, xs = np.where(al > 0.02); x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    pm = np.dstack([rgb * al[..., None], al])[y0:y1, x0:x1]
    W, H = size; s = min((W - 2 * MARGIN) / (x1 - x0), (H - 2 * MARGIN) / (y1 - y0)); nw, nh = int(round((x1 - x0) * s)), int(round((y1 - y0) * s))
    r = np.clip(resize_f(pm, (nw, nh)), 0, 1)
    canvas = np.zeros((H, W, 4), np.float32); ox, oy = (W - nw) // 2, (H - nh) // 2; canvas[oy:oy + nh, ox:ox + nw] = r
    A = canvas[..., 3]; A = np.where(A < 0.02, 0, np.where(A > 0.98, 1, A)); col = canvas[..., :3] / np.maximum(canvas[..., 3:4], 1e-3)
    # the Lanczos resize rings: it leaves isolated 1-3 px specks of alpha 2-3 % a few px outside the silhouette (31 of them in md01). Keep the object only.
    lab2, n2 = ndimage.label(A > 0)
    if n2 > 1: A = A * (lab2 == 1 + int(np.argmax(ndimage.sum(A > 0, lab2, range(1, n2 + 1)))))
    out = Image.fromarray((np.dstack([np.clip(col, 0, 1) * (A[..., None] > 0), A]) * 255 + 0.5).astype(np.uint8), 'RGBA')
    out = T.bleed_rgb(out, iters=10)
    # bleed_rgb reaches about 20 px; the rest of the transparent area gets the nearest bled colour, so that low mip levels stay gold-brown instead of black
    o = np.asarray(out).copy(); reached = ndimage.uniform_filter((o[..., 3] > 12).astype(np.float32), 41) > 0.02
    idx = ndimage.distance_transform_edt(~reached, return_distances=False, return_indices=True)
    o[..., :3] = np.where(reached[..., None], o[..., :3], o[..., :3][idx[0], idx[1]]); out = Image.fromarray(o, 'RGBA')
    post = ('native alpha from the generator (background transparent); alpha levels 13..245 -> 0..255, everything outside the main object removed (%d components kept: 1); '
            'crop to the object %dx%d, premultiplied Lanczos scale x%.3f, centred in %dx%d with >= %d px transparent margin (object box x=%d..%d y=%d..%d); '
            'isolated resize-ringing specks outside the silhouette removed (alpha is one connected component); bleed_rgb, remaining transparent area filled with the nearest bled colour; lossy WebP q90 method 6 exact (RGB kept under alpha)' % (1, x1 - x0, y1 - y0, s, W, H, MARGIN, ox, ox + nw, oy, oy + nh))
    return out, post, [ox, oy, ox + nw, oy + nh]

def fill_backing(im, thr=0.70, reach=40, grow=3, seed=3):
    """The generated vellum leaves sit on a pale backing that shows as a 2-8 px rim, rounded corners and small notches. Pixels of that backing
       (blue channel > thr, connected to the image border, within `reach` px of it) are replaced by colours diffused in from the vellum edge."""
    a = T.to_f(im); h, w = a.shape[:2]; yy, xx = np.mgrid[:h, :w]; dist = np.minimum(np.minimum(yy, h - 1 - yy), np.minimum(xx, w - 1 - xx))
    m = (a[..., 2] > thr) & (dist < reach); lab, n = ndimage.label(m)
    ids = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])); bm = ndimage.binary_dilation(np.isin(lab, ids[ids > 0]), iterations=grow)
    known = ~bm; rgb = a.copy()
    for _ in range(60):
        if known.all(): break
        wgt = ndimage.uniform_filter(known.astype(np.float32), 5); s = np.dstack([ndimage.uniform_filter(rgb[..., c] * known, 5) for c in range(3)])
        fill = (~known) & (wgt > 0); rgb[fill] = (s / np.maximum(wgt, 1e-5)[..., None])[fill]; known = known | fill
    grain = ndimage.gaussian_filter(np.random.default_rng(seed).standard_normal((h, w)).astype(np.float32), 0.8) * 0.02
    rgb[bm] += grain[bm][:, None]
    return T.to_im(rgb), int(bm.sum())

def build_rect(wid, kind, src, size):
    im = Image.open(src).convert('RGB'); post = []
    if kind == 'leaf':
        im, n = fill_backing(im); post.append('pale backing visible around the leaf (rim, rounded corners, notches: %d px) filled with colours diffused in from the vellum edge + fine grain' % n)
    if wid in BOX:
        b = BOX[wid]; im = im.crop(b)
        post.append('crop x=%d..%d y=%d..%d (%dx%d: the whole scene band from 12 px of gold above the tallest tower to 7 px of ground below the road; the middle 512 rows would cut one of them)'
                    % (b[0], b[2], b[1], b[3], b[2] - b[0], b[3] - b[1]))
        sq = 100 * (1 - (size[1] / (b[3] - b[1])) / (size[0] / (b[2] - b[0])))
        im = im.resize(size, Image.LANCZOS); post.append('non-uniform Lanczos resize to %dx%d (vertical squeeze %.1f %% relative to horizontal)' % (size + (sq,)))
    else:
        t = TRIM.get(wid, 4); im = im.crop((t, t, im.size[0] - t, im.size[1] - t)); post.append('trim %d px off every edge' % t)
        ar = size[0] / size[1]
        if abs(im.size[0] / im.size[1] - ar) > 1e-3: im = fit_crop(im, ar); post.append('centre crop to %s' % ('3:2' if ar > 1 else '2:3'))
        im = im.resize(size, Image.LANCZOS); post.append('Lanczos resize to %dx%d' % size)
    post.append('WebP q88'); return im, '; '.join(post)

def mean_linear_rgba(im):
    a = np.asarray(im, np.float32) / 255.0; c, al = a[..., :3], a[..., 3:4]
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4); return [round(float(x), 4) for x in (lin * al).sum((0, 1)) / al.sum()]

def on_wall(im):
    if im.mode != 'RGBA': return im.convert('RGB')
    bg = Image.new('RGBA', im.size, WALL + (255,)); bg.alpha_composite(im); return bg.convert('RGB')

def build():
    os.makedirs(OUT, exist_ok=True); manifest = []; finals = {}
    for wid, (kind, gen, size, hang) in WORKS.items():
        src = raw_path(wid); dst = os.path.join(OUT, wid + '.webp'); extra = {}
        if kind == 'shaped':
            im, post, box = build_shaped(wid, src, size); im.save(dst, 'WEBP', quality=90, method=6, exact=True)
            fin = Image.open(dst); assert fin.mode == 'RGBA' and fin.size == size, (fin.mode, fin.size)
            ml = mean_linear_rgba(fin); extra = {'object_box_px': box, 'object_m': [round(hang[0] * (box[2] - box[0]) / size[0], 3), round(hang[1] * (box[3] - box[1]) / size[1], 3)],
                                                 'mean_linear_note': 'alpha-weighted (object pixels only)'}
            on_wall(fin).save(os.path.join(RAW, 'preview_%s.png' % wid))     # the object on the gallery wall colour #1F3A3D (alpha / halo check)
        else:
            im, post = build_rect(wid, kind, src, size); T.save_webp(im, dst, 88)
            fin = Image.open(dst); assert fin.mode == 'RGB' and fin.size == size, (fin.mode, fin.size); ml = T.mean_linear(fin)
        finals[wid] = fin
        manifest.append(dict({'file': 'assets/art/%s.webp' % wid, 'source': 'generated', 'model': MODEL, 'prompt': PROMPTS[wid],
                              'gen_args': 'size %s, quality high, outputFormat webp%s' % (gen, ', background transparent' if kind == 'shaped' else ''),
                              'raw': 'raw/medart/' + os.path.basename(src), 'post': post, 'mode': fin.mode, 'px': list(size), 'tile_m': None, 'hang_m': list(hang),
                              'mean_linear': ml}, **extra))
        print(wid, fin.mode, size, os.path.getsize(dst) // 1024, 'kB', 'mean_linear', ml)
    json.dump(manifest, open(os.path.join(RAW, 'manifest.json'), 'w'), ensure_ascii=False, indent=1)
    assert [m[0] for m in META] == list(WORKS)
    meta = [{'id': i, 'file': 'assets/art/%s.webp' % i, 'title_zh': tz, 'title_en': te, 'artist_zh': az, 'artist_en': ae, 'date_zh': dz, 'date_en': de,
             'medium_zh': mz, 'medium_en': me, 'w_m': WORKS[i][3][0], 'h_m': WORKS[i][3][1]} for (i, tz, te, az, ae, dz, de, mz, me) in META]
    json.dump(meta, open(os.path.join(RAW, 'meta.json'), 'w'), ensure_ascii=False, indent=1)
    contact(finals)

def contact(finals, W=1800, gap=22, lab=26):
    rows = [(['md01', 'md10', 'md04'], W), (['md02', 'md03', 'md05', 'md06', 'md07', 'md08', 'md09'], W), (['md11'], 1150)]
    try: font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 17)
    except Exception: font = ImageFont.load_default()
    strips = []
    for r, rw in rows:
        ars = [finals[i].size[0] / finals[i].size[1] for i in r]
        h = int((rw - gap * (len(r) + 1)) / sum(ars)); strip = Image.new('RGB', (W, h + lab + gap), WALL); d = ImageDraw.Draw(strip); x = (W - rw) // 2 + gap
        for i, a in zip(r, ars):
            w = int(h * a); strip.paste(on_wall(finals[i]).resize((w, h), Image.LANCZOS), (x, gap))
            d.text((x, h + gap + 5), '%s   %dx%d %s' % ((i,) + finals[i].size + (finals[i].mode,)), fill=(233, 223, 198), font=font); x += w + gap
        strips.append(strip)
    out = Image.new('RGB', (W, sum(s.size[1] for s in strips) + gap), WALL); y = 0
    for s in strips: out.paste(s, (0, y)); y += s.size[1]
    out.save(os.path.join(RAW, 'contact.png')); print('contact', out.size)

if __name__ == '__main__':
    build()
