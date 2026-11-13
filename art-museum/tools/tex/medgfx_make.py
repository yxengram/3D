"""Labels and wall lettering for the medieval-painting gallery (group `medgfx`, brief: tools/tex/MED.md).

Run:  art-museum/.venv/bin/python tools/tex/medgfx_make.py [labels_med] [medtitle] [medsign]
Rebuilds assets/gfx/labels_med.webp, medtitle.webp, medsign.webp, the previews raw/medgfx/preview_<name>_<bg>.png and
raw/medgfx/manifest.json.  Nothing else is written (gfx_make.py and the existing files in assets/gfx/ are untouched).

Composed with Pillow only, no generated imagery.  The text engine (4x supersampled coverage masks, mixed CJK/Latin
runs, tracking, kinsoku wrapping, glyph check) is imported from gfx_make.py so both groups share the same conventions:
PingFang SC + Helvetica Neue for printed labels and vinyl wall text, Songti SC + Optima for bronze inscriptions.
RGBA outputs: the whole RGB plane is the text colour, only alpha carries the shapes (lossless WebP, exact=True).
"""
import json, os, sys
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gfx_make as g                                     # helpers only; its main() is not run
from gfx_make import St, Layer, width, ink, fit, wrap_zh, wrap_en, wrap_en_balanced, para_zh, para_en, hexrgb, \
    rgba_from_mask, PF, HN, SONG, OPT, SS

ROOT = g.ROOT
OUT = os.path.join(ROOT, 'assets', 'gfx')
RAW = os.path.join(ROOT, 'raw', 'medgfx')
META = os.path.join(ROOT, 'raw', 'medart', 'meta.json')

WALL = (38, 66, 70)            # deep blue-green gallery wall (med_wall.webp)
TRAVERTINE = (214, 200, 178)   # wall above the doorway
MANIFEST = []


def ink_box(mask):
    """Bounding box of everything drawn (final px), or None."""
    return mask.point(lambda v: 255 if v >= 8 else 0).getbbox()


def finish(name, im, bgs, shown, note, extra=None):
    """Save assets/gfx/<name>.webp (lossless, exact) + previews, verify the stored file, add the manifest entry."""
    path = os.path.join(OUT, name + '.webp')
    im.save(path, 'WEBP', lossless=True, quality=100, method=6, exact=True)
    back = Image.open(path); back.load()
    assert back.size == im.size and back.mode == im.mode, (name, back.size, back.mode)
    assert back.tobytes() == im.tobytes(), f'{name}: stored file differs from the composed image'
    if im.mode == 'RGBA':
        ex = back.convert('RGB').getextrema()
        assert all(lo == hi for lo, hi in ex), f'{name}: RGB plane is not one flat colour {ex}'
        assert back.getchannel('A').getextrema() == (0, 255), name
    pad = 0 if im.mode == 'RGBA' else 40
    previews = []
    for bg_name, bg in bgs:
        pv = Image.new('RGB', (back.size[0] + 2 * pad, back.size[1] + 2 * pad), bg)
        if im.mode == 'RGBA': pv.paste(back, (0, 0), back)
        else: pv.paste(back, (pad, pad))
        pp = os.path.join(RAW, f'preview_{name}_{bg_name}.png')
        pv.save(pp, optimize=True); previews.append(os.path.relpath(pp, ROOT))
    e = {'file': f'assets/gfx/{name}.webp', 'source': 'composed', 'fonts': sorted(g.USED), 'px': list(im.size),
         'mode': im.mode, 'shown_m': shown, 'webp': 'lossless, exact=True', 'bytes': os.path.getsize(path),
         'previews': previews, 'note': note}
    if extra: e.update(extra)
    MANIFEST.append(e); g.USED.clear()
    print(f'{name}.webp  {im.size[0]}x{im.size[1]} {im.mode}  {e["bytes"] / 1024:.0f} kB')


def ink_left(s, st):
    """True left ink edge of a string relative to the pen origin (final px).  gfx_make.ink() keeps a positive left
    side bearing (Pillow masks start at the origin), which is half an em for a full-width opening bracket."""
    f, t, _ = g.layout(s, st)[0][0]
    return (min(f.getbbox(t[0], anchor='ls')[0], 0) + f.getmask(t[0]).getbbox()[0]) / SS


# ------------------------------------------------------------------------------------------------ labels_med.webp
def fit_or_wrap(text, st, w, min_size, wrapper):
    """One line, shrunk down to min_size if needed; otherwise wrapped at the full size.  -> (lines, style)"""
    s = fit(text, st, w, min_size)
    if width(text, s) <= w: return [text], s
    return wrapper(text, st, w), st


_PREP = {'of', 'from', 'before', 'in', 'on', 'at', 'for', 'by', 'to'}
_WEAK_END = _PREP | {'a', 'an', 'the', 'with', 'and', 'his', 'her', 'its', 'their', 'two', 'three', 'four', 'five', 'six',
                     'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'}


def wrap_en_sense(text, st, w):
    """Two-line break by sense for a short English line (artist, title): after a colon, before a bracket, before
    'with' or another preposition; never after an article, preposition, possessive or numeral; ties go to the more
    even pair.  Falls back to the balanced wrap when no two-line break fits."""
    if width(text, st) <= w: return [text]
    words, best = text.split(), None
    for k in range(1, len(words)):
        a, b = ' '.join(words[:k]), ' '.join(words[k:])
        wa, wb = width(a, st), width(b, st)
        if wa > w or wb > w: continue
        cost, nxt = abs(wa - wb) / w, words[k].lower()
        if a.endswith(':'): cost -= 1.0
        elif b.startswith('('): cost -= 0.6
        elif nxt == 'with': cost -= 0.5
        elif nxt in _PREP: cost -= 0.4
        elif nxt == 'and': cost -= 0.15
        if words[k - 1].lower() in _WEAK_END: cost += 1.0
        if best is None or cost < best[0]: best = (cost, [a, b])
    return best[1] if best else wrap_en_balanced(text, st, w)


def split_title_zh(text, st, w):
    """Two-line break for a long Chinese title: before an opening bracket or after a colon, else plain wrapping."""
    for k, ch in enumerate(text):
        if ch == '（' and k > 0: parts = [text[:k], text[k:]]
        elif ch == '：' and k < len(text) - 1: parts = [text[:k + 1], text[k + 1:]]
        else: continue
        if all(width(p, st) <= w for p in parts): return parts
    return wrap_zh(text, st, w)


def make_labels():
    COLS, ROWS, CW, CH, M = 4, 3, 320, 256, 22
    W, H = COLS * CW, ROWS * CH
    CARD, DARK, SOFT = hexrgb('#F4F2EC'), hexrgb('#2A2A2A'), hexrgb('#55524C')
    with open(META, encoding='utf-8') as fh: meta = {p['id']: p for p in json.load(fh)}
    ids = [f'md{i:02d}' for i in range(1, 12)]
    A, B = Layer(W, H), Layer(W, H)                       # dark text / secondary text
    a_zh = St(HN('Medium'), PF('Semibold'), 16.5)
    a_en = St(HN('Medium'), PF('Semibold'), 14.5)
    date = St(HN('Regular'), PF('Regular'), 13.5)
    t_zh = St(HN('Medium'), PF('Medium'), 22, cjk_track=0.03)
    t_en = St(HN('Italic'), PF('Regular'), 16)
    cw = CW - 2 * M
    LEAD_AE, LEAD_TZ, LEAD_TE = 18.0, 25.5, 20.0      # line pitch of wrapped artist_en / title_zh / title_en
    cells = []
    for i, pid in enumerate(ids):
        p = meta[pid]
        col, row = i % COLS, i // COLS
        x, top = col * CW + M, row * CH
        az = fit(p['artist_zh'], a_zh, cw, 14)
        ae_lines, ae = fit_or_wrap(p['artist_en'], a_en, cw, 13.75, wrap_en_sense)
        d_txt = f"{p['date_zh']} · {p['date_en']}"
        ds = fit(d_txt, date, cw, 12)
        tz2 = t_zh.at(20)                                   # size used when the Chinese title takes two lines
        tz_lines, tz = fit_or_wrap(p['title_zh'], t_zh, cw, 19, lambda t, s, w: split_title_zh(t, tz2, w))
        if len(tz_lines) > 1: tz = tz2
        te_lines, te = fit_or_wrap(p['title_en'], t_en, cw, 15, wrap_en_sense)
        dims = f"{round(p['h_m'] * 100)} × {round(p['w_m'] * 100)} cm"
        # vertical flow; tighten the gaps and the small block step by step until the last baseline clears the margin
        for t in range(0, 7):
            small = St(HN('Regular'), PF('Regular'), 13 - 0.25 * min(t, 2))
            lead_s = 18.0 - 0.5 * min(t, 2)
            gap_title, gap_small = 31.0 - 1.0 * t, 29.0 - 1.0 * t
            sm_lines = wrap_zh(p['medium_zh'], small, cw, prefer_punct=8) + wrap_en_balanced(p['medium_en'], small, cw) + [dims]
            ys = {}
            y = top + 36.5; ys['az'] = y
            y += 19.5; ys['ae'] = y; y += LEAD_AE * (len(ae_lines) - 1)
            y += 20; ys['d'] = y
            y += gap_title; ys['tz'] = y; y += LEAD_TZ * (len(tz_lines) - 1)
            y += 24; ys['te'] = y; y += LEAD_TE * (len(te_lines) - 1)
            y += gap_small; ys['s'] = y; y_last = y + lead_s * (len(sm_lines) - 1)
            if y_last <= top + CH - M - 0.5: break
        else:
            raise SystemExit(f'label {pid} does not fit ({y_last - top:.1f})')
        A.text(x, ys['az'], p['artist_zh'], az)
        for k, ln in enumerate(ae_lines): A.text(x, ys['ae'] + LEAD_AE * k, ln, ae)
        A.text(x, ys['d'], d_txt, ds)
        for k, ln in enumerate(tz_lines):
            hang = ink_left(ln, tz) if ln[0] in '（《「' else 0.0            # hang an opening bracket on the margin
            A.text(x - hang, ys['tz'] + LEAD_TZ * k, ln, tz)
        for k, ln in enumerate(te_lines): A.text(x, ys['te'] + LEAD_TE * k, ln, te)
        for k, ln in enumerate(sm_lines): B.text(x, ys['s'] + lead_s * k, ln, small)
        cells.append({'cell': i, 'col': col, 'row': row, 'id': pid, 'uv_rect_px': [col * CW, row * CH, CW, CH],
                      'lines': {'artist_en': len(ae_lines), 'title_zh': len(tz_lines), 'title_en': len(te_lines), 'small': len(sm_lines)},
                      'breaks': {'artist_en': ae_lines, 'title_zh': tz_lines, 'title_en': te_lines},
                      'sizes_px': {'artist_zh': az.size, 'artist_en': ae.size, 'date': ds.size, 'title_zh': tz.size,
                                   'title_en': te.size, 'small': small.size},
                      'last_baseline_px': round(y_last - top, 1), 'tightened': t})
    ma, mb = A.mask(), B.mask()
    # every card: ink stays inside the 22 px margins (1 px tolerance for anti-aliasing / italic overhang)
    both = Image.composite(ma, mb, ma.point(lambda v: 255 if v > 0 else 0))
    for c in cells:
        cx, cy = c['uv_rect_px'][:2]
        bb = ink_box(both.crop((cx, cy, cx + CW, cy + CH)))
        assert bb and bb[0] >= M - 1 and bb[1] >= M - 1 and bb[2] <= CW - M + 1 and bb[3] <= CH - M + 1, (c['id'], bb)
        c['ink_box_px'] = list(bb)
    assert ink_box(both.crop((3 * CW, 2 * CH, W, H))) is None
    im = Image.new('RGB', (W, H), CARD)
    im.paste(SOFT, (0, 0), mb); im.paste(DARK, (0, 0), ma)
    finish('labels_med', im, [('grey', (128, 128, 128)), ('white', (255, 255, 255))], [0.25, 0.20],
           'Atlas 4 columns x 3 rows, cell 320x256 px = one 0.25 x 0.20 m wall label. Cell i (row-major, row 0 at the TOP of '
           'the image, column 0 left) = md01..md11 for i = 0..10, cell 11 = plain card colour #F4F2EC. Same card design as '
           'labels.webp: card fills the whole cell (no border), text margin 22 px, text #2A2A2A / small block #55524C. '
           'Lines: artist_zh, artist_en (semi-bold / medium), date zh · en, title_zh, title_en (italic), then small: '
           'medium_zh, medium_en, dimensions h x w in cm. Long English lines break by sense into two lines (after a colon, '
           'before a bracket or "with"/"of"), long Chinese titles shrink (md01 breaks before its bracket).',
           {'uses': ['raw/medart/meta.json'],
            'atlas': {'cols': COLS, 'rows': ROWS, 'cell_px': [CW, CH], 'cell_m': [0.25, 0.20], 'row0': 'top'},
            'card_colour': '#F4F2EC', 'cells': cells})


# ------------------------------------------------------------------------------------------------ medtitle.webp
T_ZH, T_EN = '金与光', 'Gold and Light'
T_SUB = '中世纪绘画 · Medieval Painting, c. 1200–1450'
T_GALLERY = '展厅 2 · Gallery 2'
INTRO_ZH = ('金地不是背景，而是光本身。十三至十五世纪的画师在木板上敷石膏底、贴金箔，再以蛋彩层层细笔描绘。'
            '这些画为烛光与祈祷而作：火苗摇曳，压印的光环与金地随之明灭。请先退后看整体，再走近看笔触与金上的纹样。')
INTRO_EN = ('A gold ground is not a background; it is light itself. Between about 1200 and 1450 painters laid gold leaf '
            'over gesso on wooden panels and built up figures in fine strokes of egg tempera. These pictures were made for '
            'candle-light and prayer, where tooled haloes flickered with the flame. Stand back for the whole, then come '
            'close for the brushwork and the patterns punched in the gold.')
NOTE_ZH = '本展厅的作品均为专为这个三维场景创作的图像，作者与年代为虚构。'
NOTE_EN = 'The works in this room are images made for this 3D scene; makers and dates are fictional.'


def para_zh_optical(L, x, y, text, st, w, lead):
    """gfx_make.para_zh with an optical right edge: on a justified line that ends in a punctuation mark the blank
    half of that full-width mark hangs outside the measure, so the ink of every full line ends on the same edge."""
    lines = wrap_zh(text, st, w)
    for i, ln in enumerate(lines):
        extra = 0.0
        if i < len(lines) - 1 and len(ln) > 1:
            blank = 0.0
            if ln[-1] in g.NO_START:
                f = g.layout(ln[-1], st)[0][0][0]
                right = min(f.getbbox(ln[-1], anchor='ls')[0], 0) + f.getmask(ln[-1]).getbbox()[2]   # true ink edge
                blank = max(0.0, f.getlength(ln[-1]) - right) / SS
            extra = (w - width(ln, st) + blank) / (len(ln) - 1)
        L.text(x, y + i * lead, ln, st, extra=extra)
    return y + (len(lines) - 1) * lead, len(lines)


def make_title():
    W, H, M = 1100, 1000, 44
    L = Layer(W, H); cw = W - 2 * M
    big = St(HN('Light'), PF('Light'), 170, cjk_track=0.16)
    y = L.text_top(M, M, T_ZH, big, optical=True)
    zh_bottom = y + ink(T_ZH, big)[3]
    en = St(HN('Light'), PF('Light'), 70)
    y = L.text_top(M, zh_bottom + 36, T_EN, en, optical=True)
    rule_y = y + 42
    L.rect(M, rule_y, W - M, rule_y + 2)
    sub = St(HN('Regular'), PF('Regular'), 29, cjk_track=0.04)
    y = L.text_top(M, rule_y + 2 + 32, T_SUB, sub, optical=True)
    n_chars, zs = 36, 28                                 # 36 characters per line span the column exactly
    body_zh = St(HN('Regular'), PF('Regular'), zs, cjk_track=(cw - n_chars * zs) / ((n_chars - 1) * zs))
    body_en = St(HN('Regular'), PF('Regular'), 26)
    y, n_zh = para_zh_optical(L, M, y + 78, INTRO_ZH, body_zh, cw, 50)
    y, n_en = para_en(L, M, y + 64, INTRO_EN, body_en, cw, 39)
    note_zh = St(HN('Regular'), PF('Regular'), 22, cjk_track=0.02)     # the disclosure: small, but plainly readable
    note_en = St(HN('Regular'), PF('Regular'), 21)
    assert width(NOTE_ZH, note_zh) <= cw and width(NOTE_EN, note_en) <= cw
    y += 61
    L.text(M, y, NOTE_ZH, note_zh)
    y += 31
    L.text(M, y, NOTE_EN, note_en)
    foot = St(HN('Regular'), PF('Regular'), 26, cjk_track=0.04)
    yb = H - M - ink(T_GALLERY, foot)[3]
    L.text(M, yb, T_GALLERY, foot, optical=True)
    assert y + 6 < yb - 26 - 30, ('medtitle body runs into the footer', y, yb)
    mask = L.mask()
    bb = ink_box(mask)
    assert bb[0] >= M - 1 and bb[1] >= M - 1 and bb[2] <= W - M + 1 and bb[3] <= H - M + 1, bb
    n_han = sum(1 for ch in INTRO_ZH if '一' <= ch <= '鿿')
    finish('medtitle', rgba_from_mask(mask, hexrgb('#E9DFC6')), [('wall', WALL), ('grey', (128, 128, 128))], [2.2, 2.0],
           f'Lettering on transparent for the dark blue-green wall, RGB plane uniformly warm cream #E9DFC6, left aligned, '
           f'44 px margins. Intro: {len(INTRO_ZH)} Chinese characters incl. punctuation ({n_han} Han, {n_zh} lines), '
           f'{len(INTRO_EN.split())} English words ({n_en} lines); then the plain note that works, makers and dates are '
           f'fictional; footer 展厅 2 · Gallery 2.',
           {'colour': '#E9DFC6', 'ink_box_px': list(bb), 'text_zh': INTRO_ZH, 'text_en': INTRO_EN,
            'note_zh': NOTE_ZH, 'note_en': NOTE_EN})


# ------------------------------------------------------------------------------------------------ medsign.webp
def make_sign():
    W, H, M = 1600, 200, 40
    col = hexrgb('#3A2E24')

    def pieces(S):
        zh = St(OPT('Regular'), SONG('Bold'), S, cjk_track=0.24)
        num = St(SONG('Bold'), SONG('Bold'), S)                    # the figure after 展厅: Songti's own numeral
        en = St(OPT('Regular'), SONG('Regular'), S * 0.70, track=0.20)
        grp, dot = 0.95 * S, 1.15 * S                               # gap between groups / on each side of the dot
        return zh, en, [('t', '展厅', zh), ('g', 0.36 * S), ('t', '2', num), ('g', grp), ('t', '中世纪绘画', zh),
                        ('g', dot), ('dot',), ('g', dot),
                        ('t', 'GALLERY 2', en), ('g', grp), ('t', 'MEDIEVAL PAINTING', en)]

    def total(S):
        return sum(width(p[1], p[2]) if p[0] == 't' else p[1] if p[0] == 'g' else 0.0 for p in pieces(S)[2])

    S = 50.0
    S *= (W - 2 * M) / total(S)                                    # widths are linear in S: fill the strip to its margins
    S = int(S * 4) / 4
    zh, en, ps = pieces(S)
    L = Layer(W, H)
    zb = ink('展厅中世纪绘画', zh)
    cy = H / 2                                                     # optical centre line of the whole inscription
    y_zh = cy - (zb[1] + zb[3]) / 2                                # Chinese: ink box centred on it
    cap = -ink('H', en)[1]
    y_en = cy + cap / 2                                            # capitals: cap height centred on it
    nb = ink('2', pieces(S)[2][2][2])
    y_num = cy - (nb[1] + nb[3]) / 2 + 0.02 * S
    x = (W - total(S)) / 2
    x0 = x
    for p in ps:
        if p[0] == 'g': x += p[1]
        elif p[0] == 'dot':
            r = 0.062 * S
            L.d.ellipse([(x - r) * SS, (cy - r) * SS, (x + r) * SS, (cy + r) * SS], fill=255)
        else:
            st = p[2]
            x += L.text(x, y_zh if st is zh else y_en if st is en else y_num, p[1], st)
    mask = L.mask()
    bb = ink_box(mask)
    assert bb[0] >= M - 2 and bb[2] <= W - M + 2 and bb[1] >= 30 and bb[3] <= H - 30, bb
    assert abs((bb[0] + bb[2]) / 2 - W / 2) <= 3, ('medsign not centred', bb)
    finish('medsign', rgba_from_mask(mask, col), [('travertine', TRAVERTINE), ('grey', (128, 128, 128))], [2.4, 0.3],
           f'One centred line on transparent, RGB plane uniformly dark bronze #3A2E24: 展厅 2 / 中世纪绘画 in Songti SC Bold '
           f'({S:g} px, tracked 0.24 em), centred dot, GALLERY 2 / MEDIEVAL PAINTING in Optima capitals ({S * 0.70:g} px, '
           f'tracked 0.20 em), all centred on the same horizontal axis; 40 px side margins.',
           {'colour': '#3A2E24', 'ink_box_px': list(bb), 'text': '展厅 2　中世纪绘画　·　GALLERY 2　MEDIEVAL PAINTING'})


def main():
    os.makedirs(OUT, exist_ok=True); os.makedirs(RAW, exist_ok=True)
    only = sys.argv[1:]
    for name, fn in (('labels_med', make_labels), ('medtitle', make_title), ('medsign', make_sign)):
        if not only or name in only: fn()
    g.check_glyphs()
    if not only:
        with open(os.path.join(RAW, 'manifest.json'), 'w', encoding='utf-8') as fh:
            json.dump(MANIFEST, fh, ensure_ascii=False, indent=1)
        print('manifest: raw/medgfx/manifest.json')


if __name__ == '__main__':
    main()
