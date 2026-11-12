"""Group paintA: raw/paintA/* -> assets/art/p01..p08.webp, raw/paintA/{manifest.json, meta.json, contact.png}.
Run: ROOT/.venv/bin/python tools/tex/paintA_build.py
(p03 was a code-composed fallback at first; the QA pass replaced it with a generation. tools/tex/paintA_p03_compose.py and
raw/paintA/p03_composed.png are retired and no longer used by this build.)"""
import os, sys, json
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import textools as T

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RAW = os.path.join(ROOT, 'raw', 'paintA'); OUT = os.path.join(ROOT, 'assets', 'art')
os.makedirs(OUT, exist_ok=True)
MODEL = 'gpt-image-2.6-sunburst'
TAIL = ' Even, flat, shadowless diffuse lighting, perfectly frontal orthographic view. No frame, no wall, no border, no margin, no signature, no text, no watermark.'

P = {}
P['p01'] = ('A flat frontal museum scan of an original abstract painting, the painted canvas surface filling the entire image edge to edge. Large gestural abstraction in oil on canvas: broad sweeping brush gestures made with wide house-painter brushes in deep ultramarine blue, vermilion red and raw sienna brown over a warm off-white ground. Energetic diagonal and arcing strokes crossing the whole canvas, with thin drips running down, dry-brush drags, scraped-back passages revealing underlayers, a few splatters, areas of bare off-white ground left to breathe. Visible bristle marks, thick impasto ridges and canvas weave. Balanced asymmetrical composition, museum-quality mid-century abstract expressionist vocabulary but an original composition.' + TAIL)
P['p02'] = ('A flat frontal museum scan of an original abstract colour-field painting, the painted canvas surface filling the entire image edge to edge. Luminous atmospheric colour field in thin layered oil glazes on canvas: soft hazy fields of warm rose pink and saffron yellow-orange that glow and drift into each other with feathered, cloudy transitions, split by one single off-centre vertical rift of deep maroon placed about one third from the left, running from the top edge to the bottom edge, its edges slightly ragged and bleeding into the surrounding colour. Subtle variations of stain density, soft brush scumbling, visible fine canvas weave showing through the thin paint. Calm, contemplative, museum-quality, original composition.' + TAIL)
P['p03'] = ('A flat frontal museum scan of an original abstract painting in portrait format, the painted canvas surface filling the entire image edge to edge. Biomorphic abstraction in oil on canvas: a loose cluster of rounded, pebble-like, seed-like and gourd-like organic forms of varied sizes in teal, mustard yellow and coral, floating on a dove-grey ground, some overlapping, some just touching, tied together by thin wandering black line drawing made with a fine brush — looping contours, tendrils and connecting threads that pass across and between the forms. Purely abstract: no faces, no eyes, no stars, no figures, no animals. Clearly hand-painted: opaque matte oil colour with visible brushstrokes following each shape, slightly uneven hand-drawn edges, the grey ground scumbled in several close tones with earlier layers showing through, fine canvas weave and faint craquelure visible up close. Balanced asymmetrical composition, a few forms running off the edges of the canvas. Museum-quality mid-century modernist vocabulary, but an original composition.' + TAIL)
P['p04'] = ('A flat frontal museum scan of an original hard-edge geometric abstract painting in square format, the painted canvas surface filling the entire image edge to edge. Interlocking arcs, half-circles, quarter-circles and full circles of different sizes in flat opaque red, warm yellow, cobalt blue and black on a cream ground. Crisp taped edges, shapes overlapping and cut by each other so colours switch where forms intersect, a dynamic asymmetrical composition with large shapes running off the edges of the canvas. Acrylic on canvas: perfectly flat matte colour, but with faint roller texture, fine canvas weave and tiny ridges of paint along the taped edges visible up close. Museum-quality, original composition. Even, flat, shadowless diffuse lighting, perfectly frontal orthographic view. No frame, no wall, no border, no margin, no signature, no text, no letters, no watermark.')
P['p06'] = ('A flat frontal museum scan of an original contemporary abstract painting in portrait format, the painted surface filling the entire image edge to edge. Ink-wash-inspired abstraction: a few bold sweeping black ink strokes made with a very large brush — wet pooling blacks, dry flying-white streaks where the brush ran out of ink, soft grey washes bleeding at the edges — arranged with generous empty space on a warm paper-toned ground the colour of aged cream rice paper. Sparse accents of mineral malachite green and cinnabar red: a small washed patch of green and two or three short red marks. Purely abstract, no characters, no calligraphy, no writing, no seals, no stamps. Visible paper fibre texture and subtle ink bloom. Serene, powerful, museum-quality, original composition. Even, flat, shadowless diffuse lighting, perfectly frontal orthographic view. No frame, no mount, no scroll borders, no wall, no margin, no signature, no text, no watermark.')
P['p07'] = ('A flat frontal museum scan of an original minimalist painting in square format, the painted surface filling the entire image edge to edge. White-on-white relief: the whole canvas covered in thick white oil paint applied with a knife and comb into a subtle, slightly irregular hand-made grid of small squares — low ridges and shallow furrows of paint that read as a quiet gridded texture, with tiny tonal shifts between warm white, cool white and pale ivory. One single thin, hand-ruled graphite pencil line runs horizontally across the full width, slightly above the centre, faint grey and delicately uneven. Extremely restrained and calm; the texture is revealed only by very soft, low-contrast raking light, with no strong shadows. Museum-quality, original composition. Perfectly frontal orthographic view. No frame, no wall, no border, no margin, no signature, no text, no watermark.')
P['sheet'] = ('A layout sheet with two completely separate, unrelated museum scans of paintings placed one above the other, like two image files stacked in a catalogue layout. A single straight horizontal band of pure flat white (#FFFFFF), about 3 percent of the image height, with perfectly sharp straight edges, runs across the full width exactly at mid-height and separates them. Each scan is a wide landscape-format rectangle that fills its half completely: it touches the left edge, the right edge and the outer (top or bottom) edge of the image and ends exactly at the white band. No frames, no margins, no drop shadows, no wall, no captions, no text, no signatures, no watermark. Both are photographed perfectly frontally in even, flat, soft diffuse light.\n\n'
    'UPPER scan — an abstracted coastal landscape painted entirely in thick palette-knife impasto oil paint: broad horizontal slabs and wedges of paint suggesting a pale overcast sky, a slate-blue sea, sage-green headlands and dunes, and a band of sand-coloured beach, simplified to near-abstract planes with a high horizon. Palette limited to slate blue, sage green and sand beige with small touches of chalk white and warm grey. Heavy buttery knife strokes with crisp ridges, scraped areas showing underpainting, wet-in-wet smears. Quiet, windswept mood. No figures, no boats.\n\n'
    'LOWER scan — by a different hand, in a completely different style: a cubist-inspired fragmented still life in matte, chalky oil paint: a tilted table top, a pitcher, a bowl of fruit (pears and apples) and a stringed instrument resembling a mandolin, broken into overlapping angular facets and planes seen from several viewpoints at once, with a few curved contours. Muted earth tones — ochre, umber, burnt sienna, warm grey, cream — set against passages of deep teal. Dark contour lines, some hatched and stippled facets, visible brushstrokes. No letters, no newspaper lettering.\n\n'
    'Both are original, museum-quality compositions.')

SHEET = 'p05_p08_sheet-20261112-093904.webp'
# id: (raw file, crop box l,t,r,b in raw px, final px, source, prompt key, post note, generation size/format)
W = {
 'p01': ('p01-20261112-093648.webp', (15, 10, 1521, 1014), (1536, 1024), 'generated', 'p01', 'generated 1536x1024 webp; trimmed 15/10 px canvas-edge rim; Lanczos to 1536x1024; webp q88'),
 'p02': ('p02-20261112-092624.png', (6, 4, 1530, 1020), (1024, 683), 'generated', 'p02', 'generated 1536x1024 png; trimmed 6/4 px; Lanczos to 1024x683; webp q88'),
 'p03': ('p03-20261112-094911.webp', (8, 12, 1016, 1524), (683, 1024), 'generated', 'p03', 'generated 1024x1536 webp (QA pass; replaces the earlier code-composed fallback); trimmed 8/12 px canvas-edge rim; Lanczos to 683x1024; webp q88'),
 'p04': ('p04-20261112-092815.png', (8, 8, 1016, 1016), (1024, 1024), 'generated', 'p04', 'generated 1024x1024 png; trimmed 8 px; Lanczos to 1024x1024; webp q88'),
 'p05': (SHEET, (3, 4, 1021, 683), (1024, 683), 'generated', 'sheet', 'upper panel of one 1024x1408 webp generation holding two stacked 3:2 scans (rows 0-688; lower panel is p08); cropped 1018x679; Lanczos to 1024x683; webp q88'),
 'p06': ('p06-20261112-093009.png', (4, 6, 1020, 1530), (683, 1024), 'generated', 'p06', 'generated 1024x1536 png; trimmed 4/6 px; Lanczos to 683x1024; webp q88'),
 'p07': ('p07-20261112-093106.png', (4, 4, 1020, 1020), (1024, 1024), 'generated', 'p07', 'generated 1024x1024 png; trimmed 4 px; Lanczos to 1024x1024; webp q88'),
 'p08': (SHEET, (3, 723, 1021, 1402), (1024, 683), 'generated', 'sheet', 'lower panel of one 1024x1408 webp generation holding two stacked 3:2 scans (rows 716-1407; upper panel is p05); cropped 1018x679; Lanczos to 1024x683; webp q88'),
}

META = [
 ('p01', '潮汐来信', 'Letters from the Tide', 'Ilse Varnholt', 1958, '布面油画', 'Oil on canvas', 2.7, 1.8),
 ('p02', '暮色之隙', 'Rift at Dusk', '顾闻笙 Gu Wensheng', 1971, '布面油画', 'Oil on canvas', 2.4, 1.6),
 ('p03', '浮游的午后', 'Drifting Afternoon', 'Tomás Erdély', 1964, '布面油画', 'Oil on canvas', 1.2, 1.8),
 ('p04', '四色轨道', 'Orbits in Four Colours', 'Henrik Solvang', 1967, '布面丙烯', 'Acrylic on canvas', 1.4, 1.4),
 ('p05', '岬角·退潮', 'Headland, Ebb Tide', 'Moira Kelleghan', 1983, '布面油画', 'Oil on canvas', 1.8, 1.2),
 ('p06', '行云', 'Passing Clouds', '陆青岚 Lu Qinglan', 2009, '纸本水墨设色', 'Ink and mineral pigment on paper', 1.0, 1.5),
 ('p07', '静默之格 第七号', 'Grid of Silence No. 7', '韩素微 Han Suwei', 1996, '布面油画、石墨', 'Oil and graphite on canvas', 1.2, 1.2),
 ('p08', '水罐、梨与琴', 'Pitcher, Pears and Strings', 'Émile Vautrin', 1951, '布面油画', 'Oil on canvas', 2.1, 1.4),
]

manifest, finals = [], {}
for pid, (raw, box, px, source, pk, post) in W.items():
    im = Image.open(os.path.join(RAW, raw)).convert('RGB').crop(box).resize(px, Image.LANCZOS)
    path = os.path.join(OUT, pid + '.webp'); T.save_webp(im, path, q=88)
    back = Image.open(path).convert('RGB'); assert back.size == px
    finals[pid] = back
    manifest.append({'file': 'assets/art/%s.webp' % pid, 'source': source, 'model': MODEL if source == 'generated' else None,
                     'prompt': P[pk] if pk else None, 'post': post, 'raw': 'raw/paintA/' + raw, 'px': list(px), 'tile_m': None,
                     'mean_linear': T.mean_linear(back)})
    print(pid, px, os.path.getsize(path) // 1024, 'kB', manifest[-1]['mean_linear'])

json.dump(manifest, open(os.path.join(RAW, 'manifest.json'), 'w'), ensure_ascii=False, indent=1)
meta = [dict(id=i, file='assets/art/%s.webp' % i, title_zh=tz, title_en=te, artist=a, year=y, medium_zh=mz, medium_en=me, w_m=w, h_m=h)
        for i, tz, te, a, y, mz, me, w, h in META]
json.dump(meta, open(os.path.join(RAW, 'meta.json'), 'w'), ensure_ascii=False, indent=1)
for m in meta:   # hanging aspect must match the file aspect
    w, h = finals[m['id']].size; assert abs(w / h - m['w_m'] / m['h_m']) < 0.01, m['id']

# contact sheet: all works side by side, scaled to their hanging size, ~1600 px wide
gap, pad = 14, 16
scale = (1600 - 2 * pad - gap * (len(META) - 1)) / sum(m['w_m'] for m in meta)      # px per metre
hmax = max(m['h_m'] for m in meta) * scale
sheet = Image.new('RGB', (1600, int(hmax + 2 * pad + 18)), (236, 234, 230)); d = ImageDraw.Draw(sheet); x = pad
for m in meta:
    w, h = int(round(m['w_m'] * scale)), int(round(m['h_m'] * scale))
    sheet.paste(finals[m['id']].resize((w, h), Image.LANCZOS), (int(x), int(pad + (hmax - h) / 2)))
    d.text((int(x), int(pad + hmax + 4)), '%s  %.1fx%.1f m' % (m['id'], m['w_m'], m['h_m']), fill=(60, 60, 60))
    x += w + gap
sheet.save(os.path.join(RAW, 'contact.png')); print('contact', sheet.size)
