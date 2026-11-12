"""Lettering, labels and banners for the art-museum scene (group `gfx`, brief: tools/tex/GFX.md).

Run:  art-museum/.venv/bin/python tools/tex/gfx_make.py
Rebuilds every file in assets/gfx/, the previews raw/gfx/preview_<name>_{grey,white}.png (desk and name also
_travertine) and raw/gfx/manifest.json.

Everything is composed with Pillow, no generated imagery.  Text is drawn 4x supersampled into 8-bit coverage
masks and box-filtered down, so edges are anti-aliased and metrics are exact (no hinting jitter).
RGBA outputs: the whole RGB plane is the text colour, only alpha carries the shapes (lossless WebP, exact=True).

Typography: PingFang SC + Helvetica Neue for everything printed (labels, vinyl wall texts, wayfinding, banners),
Songti SC + Optima for the two bronze architectural letterings (reception desk wall, facade name).
"""
import glob, json, os, sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'gfx')
RAW = os.path.join(ROOT, 'raw', 'gfx')
SS = 4  # supersampling factor

# ------------------------------------------------------------------------------------------------ fonts
FONT_FILES = {
    'PingFang SC': sorted(glob.glob('/System/Library/AssetsV2/com_apple_MobileAsset_Font*/*/AssetData/PingFang.ttc'))
                   + ['/System/Library/Fonts/PingFang.ttc', '/Library/Fonts/PingFang.ttc'],
    'Hiragino Sans GB': ['/System/Library/Fonts/Hiragino Sans GB.ttc'],
    'Songti SC': ['/System/Library/Fonts/Supplemental/Songti.ttc'],
    'Helvetica Neue': ['/System/Library/Fonts/HelveticaNeue.ttc'],
    'Optima': ['/System/Library/Fonts/Optima.ttc'],
}
FALLBACK = {  # only used if PingFang is not on this machine
    ('PingFang SC', 'Light'): ('Hiragino Sans GB', 'W3'), ('PingFang SC', 'Regular'): ('Hiragino Sans GB', 'W3'),
    ('PingFang SC', 'Medium'): ('Hiragino Sans GB', 'W6'), ('PingFang SC', 'Semibold'): ('Hiragino Sans GB', 'W6'),
}
_face, _font = {}, {}


def face(family, style):
    """-> (path, index, 'Family Style') of an installed face."""
    key = (family, style)
    if key in _face: return _face[key]
    for p in FONT_FILES.get(family, []):
        if not os.path.exists(p): continue
        for i in range(64):
            try: f = ImageFont.truetype(p, 20, index=i)
            except Exception: break
            if f.getname() == (family, style):
                _face[key] = (p, i, f'{family} {style}'); return _face[key]
    if key in FALLBACK:
        _face[key] = face(*FALLBACK[key]); return _face[key]
    raise SystemExit(f'font not found: {family} {style}')


def font(fc, size):
    key = (fc[0], fc[1], round(size * SS, 2))
    if key not in _font: _font[key] = ImageFont.truetype(fc[0], key[2], index=fc[1])
    return _font[key]


USED = set()      # font names used by the file being composed
GLYPHS = set()    # (face, char) pairs, checked for missing glyphs at the end


class St:
    """Text style: Latin face + CJK face at one size (px of the final image). track / cjk_track in em."""
    def __init__(self, lat, cjk, size, track=0.0, cjk_track=0.0, cjk_scale=1.0):
        self.lat, self.cjk, self.size, self.track, self.cjk_track, self.cjk_scale = lat, cjk, size, track, cjk_track, cjk_scale

    def at(self, size): return St(self.lat, self.cjk, size, self.track, self.cjk_track, self.cjk_scale)
    def tr(self, track=None, cjk_track=None):
        return St(self.lat, self.cjk, self.size, self.track if track is None else track,
                  self.cjk_track if cjk_track is None else cjk_track, self.cjk_scale)


def is_cjk(ch): return ord(ch) >= 0x2E80


def runs(s):
    """Split into ('c'|'l', text) runs.  A middle dot belongs to the CJK run only when it sits between two CJK characters."""
    out = []
    for i, ch in enumerate(s):
        if ch == '·':
            k = 'c' if (0 < i < len(s) - 1 and is_cjk(s[i - 1]) and is_cjk(s[i + 1])) else 'l'
        else:
            k = 'c' if is_cjk(ch) else 'l'
        if out and out[-1][0] == k: out[-1][1] += ch
        else: out.append([k, ch])
    return out


def layout(s, st, extra=0.0):
    """-> ([(font, text, x_ss)], width_ss).  extra: additional px (final image) added after every character."""
    items, x, last_gap = [], 0.0, 0.0
    for k, txt in runs(s):
        fc = st.cjk if k == 'c' else st.lat
        f = font(fc, st.size * (st.cjk_scale if k == 'c' else 1.0))
        USED.add(fc[2])
        for ch in txt:
            if not ch.isspace(): GLYPHS.add((fc, ch))
        gap = ((st.cjk_track if k == 'c' else st.track) * st.size + extra) * SS
        if gap == 0:
            items.append((f, txt, x)); x += f.getlength(txt); last_gap = 0.0
        else:
            for ch in txt:
                items.append((f, ch, x)); x += f.getlength(ch) + gap
            last_gap = gap
    return items, x - last_gap


def width(s, st, extra=0.0): return layout(s, st, extra)[1] / SS


def ink(s, st, extra=0.0):
    """Ink box (x0, y0, x1, y1) in final px relative to the pen origin on the baseline (y up is negative)."""
    items, _ = layout(s, st, extra)
    bs = []
    for f, t, x in items:
        if t.strip():
            l, tp, r, b = f.getbbox(t, anchor='ls'); bs.append((l + x, tp, r + x, b))
    return (min(b[0] for b in bs) / SS, min(b[1] for b in bs) / SS, max(b[2] for b in bs) / SS, max(b[3] for b in bs) / SS)


class Layer:
    """One coverage mask (one colour)."""
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.im = Image.new('L', (w * SS, h * SS), 0); self.d = ImageDraw.Draw(self.im)

    def text(self, x, y, s, st, anchor='l', extra=0.0, optical=False):
        """Draw with the baseline at y.  anchor l/c/r.  optical: align the ink edge (not the advance box) to x."""
        items, w = layout(s, st, extra)
        if optical:
            b = ink(s, st, extra)
            x0 = {'l': x - b[0], 'c': x - (b[0] + b[2]) / 2, 'r': x - b[2]}[anchor]
        else:
            x0 = {'l': x, 'c': x - w / SS / 2, 'r': x - w / SS}[anchor]
        for f, t, dx in items:
            self.d.text((x0 * SS + dx, y * SS), t, font=f, fill=255, anchor='ls')
        return w / SS

    def text_top(self, x, top, s, st, **kw):
        """Draw so that the top of the ink sits at `top`; returns the baseline y."""
        y = top - ink(s, st, kw.get('extra', 0.0))[1]
        self.text(x, y, s, st, **kw); return y

    def rect(self, x0, y0, x1, y1):
        self.d.rectangle([round(x0 * SS), round(y0 * SS), round(x1 * SS) - 1, round(y1 * SS) - 1], fill=255)

    def poly(self, pts):
        self.d.polygon([(px * SS, py * SS) for px, py in pts], fill=255)

    def mask(self): return self.im.reduce(SS)


# ------------------------------------------------------------------------------------------------ paragraphs
NO_START = set('，。、；：？！）》」』”’…')
NO_END = set('（《「『“‘')
BREAK_AFTER = set('，。、；：？！')


def wrap_zh(text, st, w, prefer_punct=0):
    """Character wrapping with kinsoku.  prefer_punct=n: break after a punctuation mark if one is within the last n characters."""
    lines, cur = [], ''
    for ch in text:
        if width(cur + ch, st) <= w + 0.01 or not cur:
            cur += ch; continue
        nxt = ch
        if nxt in NO_START or cur[-1] in NO_END:              # push the last character down with it
            nxt = cur[-1] + nxt; cur = cur[:-1]
            if cur and cur[-1] in NO_END: nxt = cur[-1] + nxt; cur = cur[:-1]
        elif prefer_punct:
            for k in range(1, min(prefer_punct, len(cur) - 1) + 1):
                if cur[-k - 1] in BREAK_AFTER:
                    nxt = cur[-k:] + nxt; cur = cur[:-k]; break
        lines.append(cur); cur = nxt
    if cur: lines.append(cur)
    return lines


def wrap_en(text, st, w):
    lines, cur = [], ''
    for word in text.split():
        t = (cur + ' ' + word) if cur else word
        if width(t, st) <= w or not cur: cur = t
        else: lines.append(cur); cur = word
    if cur: lines.append(cur)
    return lines


def wrap_en_balanced(text, st, w):
    """Same number of lines as the greedy wrap, but with the narrowest measure that still gives it (no orphan words)."""
    n = len(wrap_en(text, st, w))
    if n == 1: return wrap_en(text, st, w)
    lo, hi = 0.0, w
    while hi - lo > 0.5:
        mid = (lo + hi) / 2
        ok = len(wrap_en(text, st, mid)) == n and all(width(l, st) <= mid for l in wrap_en(text, st, mid))
        if ok: hi = mid
        else: lo = mid
    return wrap_en(text, st, hi)


def para_zh(L, x, y, text, st, w, lead, justify=True):
    """First baseline at y; returns (baseline of the last line, number of lines)."""
    lines = wrap_zh(text, st, w)
    for i, ln in enumerate(lines):
        extra = 0.0
        if justify and i < len(lines) - 1 and len(ln) > 1:
            extra = (w - width(ln, st)) / (len(ln) - 1)
        L.text(x, y + i * lead, ln, st, extra=extra)
    return y + (len(lines) - 1) * lead, len(lines)


def para_en(L, x, y, text, st, w, lead):
    lines = wrap_en(text, st, w)
    for i, ln in enumerate(lines): L.text(x, y + i * lead, ln, st)
    return y + (len(lines) - 1) * lead, len(lines)


def fit(s, st, w, min_size, step=0.25):
    """Shrink the style until the string fits the width."""
    while width(s, st) > w and st.size > min_size: st = st.at(st.size - step)
    return st


# ------------------------------------------------------------------------------------------------ output helpers
def hexrgb(h): h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def rgba_from_mask(mask, colour):
    im = Image.new('RGBA', mask.size, colour + (0,)); im.putalpha(mask); return im


MANIFEST = []


def finish(name, im, uses, shown, note, extra=None, quality=None):
    """Save assets/gfx/<name>.webp + both previews, verify the file, add the manifest entry."""
    path = os.path.join(OUT, name + '.webp')
    if im.mode == 'RGBA' or quality is None:
        im.save(path, 'WEBP', lossless=True, quality=100, method=6, exact=True)
    else:
        im.save(path, 'WEBP', quality=quality, method=6)
    back = Image.open(path); back.load()
    assert back.size == im.size and back.mode == im.mode, (name, back.size, back.mode)
    if im.mode == 'RGBA':
        ex = back.convert('RGB').getextrema()
        assert all(lo == hi for lo, hi in ex), f'{name}: RGB plane is not one flat colour {ex}'
        assert back.getchannel('A').getextrema() == (0, 255), name
    pad = 0 if im.mode == 'RGBA' else 40
    bgs = [('grey', (128, 128, 128)), ('white', (255, 255, 255))]
    if name in ('desk', 'name'): bgs.append(('travertine', (214, 200, 178)))   # the wall they are mounted on
    for bg_name, bg in bgs:
        pv = Image.new('RGB', (back.size[0] + 2 * pad, back.size[1] + 2 * pad), bg)
        if im.mode == 'RGBA': pv.paste(back, (0, 0), back)
        else: pv.paste(back, (pad, pad))
        pv.save(os.path.join(RAW, f'preview_{name}_{bg_name}.png'), optimize=True)
    e = {'file': f'assets/gfx/{name}.webp', 'source': 'composed', 'fonts': sorted(USED), 'uses': uses,
         'px': list(im.size), 'mode': im.mode, 'shown_m': shown,
         'webp': 'lossless, exact=True' if (im.mode == 'RGBA' or quality is None) else f'lossy q{quality}',
         'bytes': os.path.getsize(path), 'note': note}
    if extra: e.update(extra)
    MANIFEST.append(e); USED.clear()
    print(f'{name}.webp  {im.size[0]}x{im.size[1]} {im.mode}  {e["bytes"] / 1024:.0f} kB')


# ------------------------------------------------------------------------------------------------ faces / copy
PF = lambda w: face('PingFang SC', w)
HN = lambda w: face('Helvetica Neue', w)
SONG = lambda w: face('Songti SC', w)
OPT = lambda w: face('Optima', w)

INK = hexrgb('#2B2B2B')
MUSEUM_ZH, MUSEUM_EN = '栖云美术馆', 'QIYUN MUSEUM OF ART'
SHOW_ZH, SHOW_EN = '形与色之间', 'Between Form and Colour'
SUB_ZH, SUB_EN = '现代绘画藏品展', 'Modern Paintings from the Collection'
GALLERY = '展厅 1 · Gallery 1'

INTRO_ZH = ('本展自馆藏中遴选十六件作品，勾勒二十世纪中叶至今的一条线索：从挥洒淋漓的姿态抽象、澄明的色域与硬边几何，'
            '到重新回望山水的水墨与矿物设色。形是结构，色是气息；二者之间，是画家一次次的取舍与试探。'
            '愿你放慢脚步，在一幅画前多停留片刻。')
INTRO_EN = ('Between Form and Colour gathers sixteen works from the collection, tracing a path from the gestural '
            'abstraction of the 1950s through colour fields and hard-edged geometry to recent paintings that return to ink '
            'and mineral pigment. Form gives a picture its structure; colour gives it breath. Between the two lie the '
            'choices and hesitations of each painter. Take your time, and let one painting hold you a little longer.')
LOOK_ZH = ('看一幅画，不妨先退后几步，让整体的形与色在眼中安定下来；再慢慢走近，看笔触的方向、颜料的厚薄与画布的纹理。'
           '光线也在参与：日光缓缓移动，同一幅画会呈现不同的冷暖。请给每件作品多一点时间。')
LOOK_EN = ('Begin from a distance and let the whole picture settle; then step closer to follow the direction of a '
           'brushstroke, the weight of the paint, the weave of the canvas. Light takes part as well: as daylight moves '
           'through the room, the same painting turns warmer or cooler. Give each work a little more time than you planned.')


def load_meta():
    m = []
    for g in ('paintA', 'paintB'):
        with open(os.path.join(ROOT, 'raw', g, 'meta.json'), encoding='utf-8') as fh: m += json.load(fh)
    return {p['id']: p for p in m}


# ------------------------------------------------------------------------------------------------ labels.webp
def make_labels():
    W, H, CW, CH, M = 1600, 1024, 320, 256, 22
    CARD, DARK, SOFT = hexrgb('#F4F2EC'), hexrgb('#2A2A2A'), hexrgb('#55524C')
    meta = load_meta()
    ids = [f'p{i:02d}' for i in range(1, 17)] + ['m01']
    A, B = Layer(W, H), Layer(W, H)                     # dark text / secondary text
    artist = St(HN('Medium'), PF('Semibold'), 18)
    year = St(HN('Regular'), PF('Regular'), 18)
    t_zh = St(HN('Medium'), PF('Medium'), 24, cjk_track=0.03)
    t_en = St(HN('Italic'), PF('Regular'), 18)
    small0 = St(HN('Regular'), PF('Regular'), 13.5)
    cw = CW - 2 * M
    cells = []
    for i, pid in enumerate(ids):
        p = meta[pid]
        x, top = (i % 5) * CW + M, (i // 5) * CH
        # line 1: artist (semi-bold) + year
        a = fit(p['artist'], artist, cw - 14 - width(str(p['year']), year), 14)
        wa = A.text(x, top + 38, p['artist'], a)
        A.text(x + wa + 12, top + 38, str(p['year']), year.at(a.size))
        # titles
        tz = fit(p['title_zh'], t_zh, cw, 16)
        A.text(x, top + 78, p['title_zh'], tz)
        te = fit(p['title_en'], t_en, cw, 13)
        A.text(x, top + 105, p['title_en'], te)
        # small block: medium zh, medium en, dimensions (h x w, cm) -- shrink until it clears the bottom margin
        dims = f"{round(p['h_m'] * 100)} × {round(p['w_m'] * 100)} cm"
        s = small0
        while True:
            lead = round(s.size * 1.42 * 2) / 2
            lines = wrap_zh(p['medium_zh'], s, cw, prefer_punct=8) + wrap_en_balanced(p['medium_en'], s, cw) + [dims]
            y_last = top + 138 + (len(lines) - 1) * lead
            if y_last + s.size * 0.28 <= top + CH - M or s.size <= 11: break
            s = s.at(s.size - 0.5)
        for k, ln in enumerate(lines): B.text(x, top + 138 + k * lead, ln, s)
        cells.append({'cell': i, 'col': i % 5, 'row': i // 5, 'id': pid,
                      'uv_rect_px': [(i % 5) * CW, (i // 5) * CH, CW, CH],
                      'sizes_px': {'artist': a.size, 'title_zh': tz.size, 'title_en': te.size, 'small': s.size}})
    im = Image.new('RGB', (W, H), CARD)
    im.paste(SOFT, (0, 0), B.mask()); im.paste(DARK, (0, 0), A.mask())
    finish('labels', im, ['raw/paintA/meta.json', 'raw/paintB/meta.json'], [0.25, 0.20],
           'Atlas 5 columns x 4 rows, cell 320x256 px = one 0.25 x 0.20 m wall label. Cell i (row-major, row 0 at the TOP of '
           'the image, column 0 left) = p01..p16 for i = 0..15, cell 16 = m01, cells 17-19 = plain card colour #F4F2EC. '
           'Card fills the whole cell (no border), text margin 22 px. Dimensions are h x w in cm.',
           {'atlas': {'cols': 5, 'rows': 4, 'cell_px': [CW, CH], 'cell_m': [0.25, 0.20], 'row0': 'top'},
            'card_colour': '#F4F2EC', 'cells': cells})


# ------------------------------------------------------------------------------------------------ title.webp
def make_title():
    W, H, M = 1200, 1300, 48
    L = Layer(W, H); cw = W - 2 * M
    big = St(HN('Light'), PF('Light'), 190)
    # the five characters span the full column: distribute the remaining width as tracking
    b = ink(SHOW_ZH, big); extra = (cw - (b[2] - b[0])) / (len(SHOW_ZH) - 1)
    y = L.text_top(M, M, SHOW_ZH, big, extra=extra, optical=True)
    zh_bottom = y + ink(SHOW_ZH, big)[3]
    en = St(HN('Light'), PF('Light'), 84)
    y = L.text_top(M, zh_bottom + 46, SHOW_EN, en, optical=True)
    rule_y = y + 52
    L.rect(M, rule_y, W - M, rule_y + 2)
    sub = St(HN('Regular'), PF('Regular'), 34, cjk_track=0.04)
    y = L.text_top(M, rule_y + 2 + 36, f'{SUB_ZH} · {SUB_EN}', sub, optical=True)
    n_chars, zs = 31, 34                                # 31 characters per line span the column exactly
    body_zh = St(HN('Regular'), PF('Regular'), zs, cjk_track=(cw - n_chars * zs) / ((n_chars - 1) * zs))
    body_en = St(HN('Regular'), PF('Regular'), 30)
    y, n_zh = para_zh(L, M, y + 104, INTRO_ZH, body_zh, cw, 60)
    y, n_en = para_en(L, M, y + 80, INTRO_EN, body_en, cw, 45)
    foot = St(HN('Regular'), PF('Regular'), 28, cjk_track=0.04)
    yb = H - M - ink(GALLERY, foot)[3]
    L.text(M, yb, GALLERY, foot, optical=True)
    assert y + 12 < yb - 60, ('title body runs into the footer', y, yb)
    finish('title', rgba_from_mask(L.mask(), INK), [], [2.4, 2.6],
           f'Vinyl lettering #2B2B2B on transparent, left aligned, 48 px margins. Intro: {len(INTRO_ZH)} Chinese characters '
           f'({n_zh} lines), {len(INTRO_EN.split())} English words ({n_en} lines).',
           {'colour': '#2B2B2B', 'text_zh': INTRO_ZH, 'text_en': INTRO_EN})


# ------------------------------------------------------------------------------------------------ text.webp
def make_text():
    W, H, M = 800, 900, 44
    L = Layer(W, H); cw = W - 2 * M
    head = St(HN('Light'), PF('Light'), 92, cjk_track=0.08)
    y = L.text_top(M, M, '观看的方式', head, optical=True)
    head_en = St(HN('Light'), PF('Light'), 52)
    y = L.text_top(M, y + ink('观看的方式', head)[3] + 34, 'Ways of Looking', head_en, optical=True)
    rule_y = y + 46
    L.rect(M, rule_y, W - M, rule_y + 2)
    n_chars, zs = 23, 30                                # 23 characters per line span the column exactly
    body_zh = St(HN('Regular'), PF('Regular'), zs, cjk_track=(cw - n_chars * zs) / ((n_chars - 1) * zs))
    body_en = St(HN('Regular'), PF('Regular'), 28)
    top_zh = rule_y + 2 + 56
    y, n_zh = para_zh(L, M, top_zh - ink('看', body_zh)[1], LOOK_ZH, body_zh, cw, 60)
    y, n_en = para_en(L, M, y + 92, LOOK_EN, body_en, cw, 46)
    assert y + 10 <= H - M, ('text.webp body too long', y)
    finish('text', rgba_from_mask(L.mask(), INK), [], [1.6, 1.8],
           f'Wall text #2B2B2B on transparent, left aligned, 44 px margins. {len(LOOK_ZH)} Chinese characters ({n_zh} lines), '
           f'{len(LOOK_EN.split())} English words ({n_en} lines).',
           {'colour': '#2B2B2B', 'text_zh': LOOK_ZH, 'text_en': LOOK_EN})


# ------------------------------------------------------------------------------------------------ way.webp
def arrow_right(L, x0, x1, yc, head, w):
    """Line arrow pointing right: shaft x0..x1 at height yc, 45 degree chevron of half-height `head`, stroke w."""
    h = w / 2; r2 = 2 ** 0.5; d = h / r2
    ax, ay, bx, by = x1 - head, yc - head, x1 - head, yc + head
    L.poly([(x1 + h * r2, yc), (ax + d, ay - d), (ax - d, ay + d), (x1 - h * r2, yc), (bx - d, by - d), (bx + d, by + d)])
    L.rect(x0, yc - h, x1 - h * r2 + 1, yc + h)


def make_way():
    W, H, M = 1500, 500, 50
    L = Layer(W, H)
    strong = St(HN('Regular'), PF('Regular'), 150, cjk_track=0.06)
    light = St(HN('Light'), PF('Light'), 150, cjk_track=0.06)
    en_s, en_l = St(HN('Regular'), PF('Regular'), 60), St(HN('Light'), PF('Light'), 60)
    zb = ink('展厅现代绘画', light)
    zh_h = zb[3] - zb[1]; cap = -ink('G', en_l)[1]; gap = 62
    top = (H - (zh_h + gap + cap)) / 2
    y = top - zb[1]
    x = M - ink('展', strong)[0]
    x += L.text(x, y, '展厅', strong) + 0.20 * 150
    x += L.text(x, y, '1', strong) + 0.42 * 150
    x += L.text(x, y, '现代绘画', light)
    zh_right = x
    y2 = top + zh_h + gap + cap
    x = M - ink('G', en_s)[0]
    x += L.text(x, y2, 'Gallery 1', en_s)
    x += L.text(x, y2, '  ·  ', en_l)
    L.text(x, y2, 'Modern Paintings', en_l)
    # arrow at the right end, on the centre line of the Chinese characters, chevron about one character tall
    head, sw = 66, 10
    ax1 = W - M - sw / 2 * 2 ** 0.5
    ax0 = ax1 - 196
    assert ax0 - zh_right >= 60, ('arrow too close to the text', ax0, zh_right)
    arrow_right(L, ax0, ax1, top + zh_h / 2, head, sw)
    finish('way', rgba_from_mask(L.mask(), INK), [], [3.0, 1.0],
           'Wayfinding #2B2B2B on transparent: text block on the left, line arrow pointing RIGHT at the right end '
           '(+u of the texture = viewer\'s right; do not mirror the quad). 50 px margins.', {'colour': '#2B2B2B'})


# ------------------------------------------------------------------------------------------------ desk.webp
def make_desk():
    W, H = 1600, 320
    L = Layer(W, H)
    col = hexrgb('#3A2E24')
    zh = St(OPT('Regular'), SONG('Bold'), 128, cjk_track=0.34)
    en = St(OPT('Regular'), SONG('Regular'), 46, track=0.30)
    s_zh, s_en = '问询', '票务'
    # 问询 · 票务 composed from three pieces so the dot sits optically centred between the words
    zb = ink('问询票务', zh); zh_h = zb[3] - zb[1]
    cap = -ink('I', en)[1]; gap = 44
    top = (H - (zh_h + gap + cap)) / 2
    y = top - zb[1]
    w1, w2 = width(s_zh, zh), width(s_en, zh)
    dot_gap = 128 * 0.62
    total = w1 + w2 + 2 * dot_gap
    x = (W - total) / 2
    L.text(x, y, s_zh, zh)
    cx = x + w1 + dot_gap
    r = 128 * 0.055
    cy = top + zh_h / 2
    L.d.ellipse([(cx - r) * SS, (cy - r) * SS, (cx + r) * SS, (cy + r) * SS], fill=255)
    L.text(cx + dot_gap, y, s_en, zh)
    L.text(W / 2, top + zh_h + gap + cap, 'INFORMATION  ·  TICKETS', en, anchor='c', optical=True)
    finish('desk', rgba_from_mask(L.mask(), col), [], [4.0, 0.8],
           'Dark bronze #3A2E24 lettering on transparent, centred, widely tracked (English set in tracked capitals).',
           {'colour': '#3A2E24'})


# ------------------------------------------------------------------------------------------------ name.webp
def make_name():
    W, H, M = 2048, 342, 44
    L = Layer(W, H)
    col = hexrgb('#2E241C')
    zh = St(OPT('Regular'), SONG('Bold'), 236)
    zb = ink(MUSEUM_ZH, zh)
    zh_h = zb[3] - zb[1]
    en_lines = ['QIYUN', 'MUSEUM', 'OF ART']
    # English: three tracked lines whose cap-tops/baselines span exactly the height of the Chinese characters
    line_gap_ratio = 0.62                                    # gap between lines / cap height
    cap_h = zh_h / (3 + 2 * line_gap_ratio)
    probe = St(OPT('Regular'), SONG('Regular'), 100, track=0.16)
    en = probe.at(100 * cap_h / -ink('M', probe)[1])
    en_w = max(ink(t, en)[2] - ink(t, en)[0] for t in en_lines)
    sep_gap, rule_w = 64, 4
    zh_w_target = W - 2 * M - en_w - 2 * sep_gap - rule_w
    extra = (zh_w_target - (zb[2] - zb[0])) / (len(MUSEUM_ZH) - 1)
    assert extra > 236 * 0.04, ('name lock-up too wide', extra)
    top = (H - zh_h) / 2
    L.text_top(M, top, MUSEUM_ZH, zh, extra=extra, optical=True)
    rx = M + zh_w_target + sep_gap
    L.rect(rx, top, rx + rule_w, top + zh_h)
    ex = rx + rule_w + sep_gap
    for i, t in enumerate(en_lines):
        L.text(ex, top + cap_h + i * cap_h * (1 + line_gap_ratio), t, en, optical=True)
    finish('name', rgba_from_mask(L.mask(), col), [], [9.0, 1.5],
           'Facade lock-up, dark bronze #2E241C on transparent: Chinese name left, thin vertical rule, tracked capitals in '
           'three lines to its right, both blocks the same height; 44 px side margins.', {'colour': '#2E241C'})


# ------------------------------------------------------------------------------------------------ banners
ULTRA = hexrgb('#1A2A7E')
PAPER = hexrgb('#F3EFE6')


def crop_fill(path, box, size):
    im = Image.open(path).convert('RGB').crop(box)
    return im.resize(size, Image.LANCZOS)


def make_banner_a():
    W, H, M = 512, 1920, 44
    split = 1280                                           # painting above, ultramarine block = lower third
    im = Image.new('RGB', (W, H), ULTRA)
    # p01 is 1536x1024: a 410 px wide slice (full height) fills the visible 512x1280 area
    im.paste(crop_fill(os.path.join(ROOT, 'assets/art/p01.webp'), (600, 0, 1010, 1024), (W, split)), (0, 0))
    L = Layer(W, H); cw = W - 2 * M
    big = St(HN('Light'), PF('Regular'), 128)
    l1, l2 = '形与色', '之间'
    b = ink(l1, big); extra = (cw - (b[2] - b[0])) / 2
    y = L.text_top(M, split + 58, l1, big, extra=extra, optical=True)
    y += 128 + 26
    L.text(M, y, l2, big, extra=extra, optical=True)
    en = St(HN('Light'), PF('Light'), 35)
    y = L.text_top(M, y + ink(l2, big)[3] + 40, SHOW_EN, en, optical=True)
    # museum name at the foot
    foot_zh = St(HN('Regular'), PF('Medium'), 30, cjk_track=0.30)
    foot_en = St(HN('Regular'), PF('Regular'), 15.5, track=0.24)
    yb = H - 52
    L.text(M, yb, MUSEUM_EN, foot_en, optical=True)
    L.text(M, yb - 36, MUSEUM_ZH, foot_zh, optical=True)
    L.rect(M, yb - 36 - 64, W - M, yb - 36 - 62)
    im.paste((255, 255, 255), (0, 0), L.mask())
    finish('banner_a', im, ['assets/art/p01.webp'], [1.6, 6.0],
           'Vertical facade banner. Upper two thirds: vertical slice of p01 (x 600..1010 of 1536, full height, Lanczos x1.25); '
           'lower third: solid deep ultramarine #1A2A7E block with white text.',
           {'block_colour': '#1A2A7E', 'crop_px': [600, 0, 1010, 1024]}, quality=92)


def make_banner_b():
    W, H, M = 512, 1920, 44
    im = Image.new('RGB', (W, H), PAPER)
    img_h = 1000
    # p16 is 1536x1024: slice 524 px wide (full height) -> 512x1000
    im.paste(crop_fill(os.path.join(ROOT, 'assets/art/p16.webp'), (940, 0, 1464, 1024), (W, img_h)), (0, 0))
    L = Layer(W, H); cw = W - 2 * M
    big = St(HN('Light'), PF('Regular'), 100)
    l1, l2 = '现代绘画', '藏品展'
    b = ink(l1, big); extra = (cw - (b[2] - b[0])) / 3
    y = L.text_top(M, img_h + 84, l1, big, extra=extra, optical=True)
    y += 100 + 24
    L.text(M, y, l2, big, extra=extra, optical=True)
    en = St(HN('Light'), PF('Light'), 45)
    y = L.text_top(M, y + ink(l2, big)[3] + 52, 'Modern Paintings', en, optical=True)
    L.text(M, y + 56, 'from the Collection', en, optical=True)
    foot = St(HN('Regular'), PF('Regular'), 36, cjk_track=0.06)
    yb = H - 52
    L.text(M, yb, GALLERY, foot, optical=True)
    L.rect(M, yb - 72, W - M, yb - 70)
    im.paste(INK, (0, 0), L.mask())
    finish('banner_b', im, ['assets/art/p16.webp'], [1.6, 6.0],
           'Vertical facade banner. Warm off-white ground #F3EFE6; upper 1000 px: vertical slice of p16 (x 940..1464 of 1536, '
           'full height); dark #2B2B2B text below.',
           {'ground_colour': '#F3EFE6', 'crop_px': [940, 0, 1464, 1024]}, quality=92)


# ------------------------------------------------------------------------------------------------ glyph check
def check_glyphs():
    """Every character used must exist in the face it was set in (compare against the .notdef rendering)."""
    missing = []
    for fc, ch in sorted(GLYPHS, key=lambda t: (t[0][2], t[1])):
        f = ImageFont.truetype(fc[0], 48, index=fc[1])
        nd = f.getmask('\U000F1234'); g = f.getmask(ch)
        if g.size == nd.size and bytes(g) == bytes(nd): missing.append((fc[2], ch, hex(ord(ch))))
        elif g.size[0] == 0 or g.getbbox() is None: missing.append((fc[2], ch, hex(ord(ch)) + ' (empty)'))
    if missing: raise SystemExit(f'MISSING GLYPHS: {missing}')
    print(f'glyph check: {len(GLYPHS)} (face, character) pairs, none missing')


def main():
    os.makedirs(OUT, exist_ok=True); os.makedirs(RAW, exist_ok=True)
    only = sys.argv[1:]
    for name, fn in (('labels', make_labels), ('title', make_title), ('text', make_text), ('way', make_way),
                     ('desk', make_desk), ('name', make_name), ('banner_a', make_banner_a), ('banner_b', make_banner_b)):
        if not only or name in only: fn()
    check_glyphs()
    if not only:
        with open(os.path.join(RAW, 'manifest.json'), 'w', encoding='utf-8') as fh:
            json.dump(MANIFEST, fh, ensure_ascii=False, indent=1)
        print('manifest: raw/gfx/manifest.json')


if __name__ == '__main__':
    main()
