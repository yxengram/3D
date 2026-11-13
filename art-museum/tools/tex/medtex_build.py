"""Group `medtex` (medieval painting gallery): builds assets/tex/{med_wall,med_floor,med_stone}.webp from raw/medtex/src_*.webp.
   Run:  ROOT/.venv/bin/python ROOT/tools/tex/medtex_build.py [name ...]
   Writes the final WebP files, raw/medtex/preview_<name>.png (3x3 tiles), raw/medtex/contact.png and raw/medtex/manifest.json."""
import sys, os, glob, json, math
import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import textools as T

RAW = os.path.join(ROOT, 'raw', 'medtex')
OUT = os.path.join(ROOT, 'assets', 'tex')
MODEL = 'gpt-image-2.6-sunburst'
Q = 88

PROMPTS = {
 'wall': "Flat-lit albedo texture photograph of a wall painted in deep blue-green matt distemper (limewash paint brushed over smooth plaster), seen perfectly frontally like a flatbed scan (orthographic, no perspective). The image shows about 2 m by 2 m of one continuous uninterrupted painted surface. Colour: dark muted teal blue-green, close to sRGB (38, 66, 70), the same hue everywhere. Very subtle, soft, brushy mottling left by a wide brush used in short criss-cross strokes: barely visible tone variation of only a few percent, fine and even all over, with no large patches and no streaks. Chalky dead-matt finish. Perfectly even, shadowless diffuse lighting: no highlights, no sheen, no shadows, no gradient, no vignette, the same brightness from corner to corner. No cracks, no stains, no drips, no joints, no marks, no objects, no text. The painted wall fills the image edge to edge.",
 'terracotta': "Flat-lit albedo texture photograph of one single continuous surface of worn unglazed handmade terracotta (fired red clay, like the face of one enormous old floor tile), seen from straight above like a flatbed scan (orthographic, no perspective). The image shows about 1.2 m by 1.2 m of uninterrupted material: warm terracotta red with orange-brown and brick tones, completely matt, fine sandy grain, many small darker and paler mineral specks, soft cloudy tonal variation from firing, gentle foot wear and a few tiny pits. Even character all over with no large patches. Perfectly even, shadowless diffuse lighting: no highlights, no gloss, no shadows, no gradient, no vignette, the same brightness from corner to corner. No joints, no grout lines, no tile edges, no grid, no cracks, no stains, no objects, no text. The terracotta fills the image edge to edge.",
 'slate': "Flat-lit albedo texture photograph of one single continuous surface of dark slate-green, almost black, unglazed floor stone (honed dark slate with a slight green cast, like the face of one enormous old floor tile), seen from straight above like a flatbed scan (orthographic, no perspective). The image shows about 1.2 m by 1.2 m of uninterrupted material: very dark greenish charcoal, completely matt, fine grain, faint cloudy tonal variation, sparse tiny paler flecks, soft dull scuffs from foot wear. Even character all over with no large patches, no veins. Perfectly even, shadowless diffuse lighting: no highlights, no gloss, no reflections, no shadows, no gradient, no vignette, the same brightness from corner to corner. No joints, no grout lines, no tile edges, no grid, no cracks, no layered cleft ridges, no stains, no objects, no text. The slate fills the image edge to edge.",
 'limestone': "Flat-lit albedo texture photograph of one single continuous face of warm cream-grey fine-grained limestone, hand-dressed, seen perfectly frontally like a flatbed scan (orthographic, no perspective). The image shows an area about 3.6 m wide by 2.4 m high of uninterrupted stone: pale warm cream to light grey-beige, matt, fine even grain with tiny fossil specks and a few small pores, and faint fine parallel tooling marks (shallow close-set diagonal chisel strokes, each only a few millimetres wide) covering the whole surface evenly. Subtle low contrast, soft cloudy tonal variation, no large patches, no veins. Perfectly even, shadowless diffuse lighting: no highlights, no shadows, no gradient, no vignette, the same brightness from corner to corner. No joints, no mortar lines, no block edges, no courses, no cracks, no stains, no lichen, no objects, no text. The stone fills the image edge to edge.",
}

# ---------------------------------------------------------------- helpers (same methods as stone_build.py, kept local so this file stands alone)
def src(name):
    files = sorted(glob.glob(os.path.join(RAW, 'src_%s-*.webp' % name)))
    if not files: raise SystemExit('missing raw/medtex/src_%s-*.webp' % name)
    return Image.open(files[-1]).convert('RGB'), os.path.basename(files[-1])

def d4(a, k):
    """k in 0..7: the 8 rotations/mirrors of a square patch."""
    a = np.rot90(a, k % 4, (0, 1))
    return a[:, ::-1] if k >= 4 else a

def flatten_wrap(a, sigma, strength=1.0):
    lum = a.mean(2); low = ndimage.gaussian_filter(lum, sigma, mode='wrap')
    return a * ((low.mean() / np.maximum(low, 1e-3)) ** strength)[..., None]

def debanded(a, sigma=10):
    """Remove axis-aligned bands (smoothed row / column mean profiles) of a periodic image."""
    lum = a.mean(2)
    for ax in (0, 1):
        prof = ndimage.gaussian_filter1d(lum.mean(1 - ax), sigma, mode='wrap')
        g = prof.mean() / prof
        a = a * (g[:, None, None] if ax == 0 else g[None, :, None]); lum = a.mean(2)
    return a

def detail_even(a, sigmas=(2.0, 10.0), smooth=5.0, lim=(0.8, 1.7)):
    """Even out the amplitude of fine and medium detail along rows and columns of a periodic image (undoes the contrast
       loss inside the cross-fade band of make_tileable, which would repeat as a smoother stripe)."""
    lum = a.mean(2); prev = lum; bands = []
    for sg in sigmas:
        low = ndimage.gaussian_filter(lum, sg, mode='wrap'); bands.append(prev - low); prev = low
    out = prev
    for b in bands:
        for ax in (0, 1):
            prof = np.sqrt(ndimage.gaussian_filter1d((b ** 2).mean(1 - ax), smooth, mode='wrap'))
            g = np.clip(np.median(prof) / np.maximum(prof, 1e-6), *lim)
            b = b * (g[:, None] if ax == 0 else g[None, :])
        out = out + b
    return a * (out / np.maximum(lum, 1e-4))[..., None]

def resize_periodic(a, out):
    """Lanczos resize of a periodic square image; wrap-padding keeps the result exactly periodic."""
    N = a.shape[0]
    p = N // math.gcd(N, out)
    while p < 24: p *= 2
    q = p * out // N
    pad = np.pad(a, ((p, p), (p, p), (0, 0)), mode='wrap')
    im = T.to_im(pad).resize((out + 2 * q, out + 2 * q), Image.LANCZOS)
    return T.to_f(im)[q:q + out, q:q + out]

def pnoise(rng, n, sigma):
    """Periodic smooth noise, unit std."""
    x = ndimage.gaussian_filter(rng.standard_normal((n, n)).astype(np.float32), sigma, mode='wrap')
    return x / (x.std() + 1e-6)

def declump(vals, labels, rng, sigmas, iters=6000):
    """Hand the values out to the elements of a periodic label map (coarse grid, one int per cell) so that the low-passed map
       of values is as flat as possible: no group of dark or light neighbours that would show as a blob once the texture repeats.
       Hill climbing over swaps; returns the values in element order."""
    v = np.array(vals, np.float64); n = len(v)
    G = np.zeros((n, n))
    for sg in sigmas:
        B = np.stack([ndimage.gaussian_filter((labels == i).astype(np.float32), sg, mode='wrap').ravel() for i in range(n)]).astype(np.float64)
        B -= B.mean(1, keepdims=True); G += B @ B.T / B.shape[1]
    v = v[rng.permutation(n)]; cost = v @ G @ v
    for _ in range(iters):
        i, j = rng.integers(0, n, 2)
        if i == j: continue
        v[[i, j]] = v[[j, i]]; c = v @ G @ v
        if c < cost: cost = c
        else: v[[i, j]] = v[[j, i]]
    return v

def finish(name, a, src_kind, prompt_keys, post, tile_m, q=Q):
    im = T.to_im(a)
    path = os.path.join(OUT, name + '.webp')
    T.save_webp(im, path, q=q)
    fin = Image.open(path).convert('RGB')
    T.tile_preview(fin, 3, 3).save(os.path.join(RAW, 'preview_%s.png' % name))
    f = T.to_f(fin); lum = f.mean(2)
    entry = dict(file='assets/tex/%s.webp' % name, source=src_kind, model=MODEL,
                 prompt=' | '.join(PROMPTS[k] for k in prompt_keys), post=post, px=list(fin.size), tile_m=list(tile_m),
                 mean_linear=T.mean_linear(fin))
    def seam(ax):   # mean abs difference across the wrap border relative to the same metric inside the image
        d_in = np.abs(np.diff(f, axis=ax)).mean()
        d_b = np.abs(np.take(f, 0, axis=ax) - np.take(f, -1, axis=ax)).mean()
        return d_b / max(d_in, 1e-6), d_b * 255
    (sx, bx), (sy, by) = seam(1), seam(0)
    print('%-10s %s %s mean sRGB %.1f  rgb %s  rel.std %.2f%%  seam ratio x %.2f y %.2f (border step %.2f / %.2f levels)  %d kB' % (
        name, fin.mode, fin.size, f.mean() * 255, np.round(f.reshape(-1, 3).mean(0) * 255, 1), 100 * lum.std() / lum.mean(), sx, sy, bx, by,
        os.path.getsize(path) // 1024))
    return entry

# ---------------------------------------------------------------- textures
def med_wall():
    im, fn = src('wall')                             # 1024 px = 2 m
    f = T.flatten(im, 0.10)                          # keeps the brush mottling (< ~20 cm), drops frame-sized clouds
    t = T.to_f(T.make_tileable(f, band=0.12, seed=6))
    n = min(t.shape[:2]); t = t[:n, :n]
    t = flatten_wrap(t, 70)
    t = detail_even(debanded(resize_periodic(t, 512)), sigmas=(1.5, 6.0), smooth=4.0)
    lum = t.mean(2); d = lum / lum.mean() - 1
    d = np.clip(d / d.std(), -3.5, 3.5); d = d * (0.031 / d.std())   # brushy mottling, relative std ~3 %
    tint = np.array([38, 66, 70], np.float32) / 255
    a = np.clip(tint[None, None, :] * (1 + d)[..., None], 0, 1)
    a = a * (58.0 / (a.mean() * 255))
    return finish('med_wall', a, 'generated', ['wall'],
                  '%s: flatten (sigma 10%%), make_tileable band 12%%, periodic flatten, periodic Lanczos to 512, row/column band removal, detail amplitude evened along rows/columns; luminance detail (clipped at 3.5 sigma) rescaled to 3%% relative std on the fixed tint sRGB (38,66,70); mean 58; WebP q100 (lossy): at q88 the encoder flattens this +-2-level detail into 4 kB of blocks (rel. std 2.2%%, visible 8 px blocking when the lightmap brightens it)' % fn, (2, 2), q=100)

FLOOR_SCALE = 0.75

def _tile_source(key, flat=0.12, scale=FLOOR_SCALE, sat=1.0, tintmul=(1, 1, 1)):
    im, fn = src(key)                                # 1024 px, nominally 1.2 m; x0.75 = 768 px = 6 x 6 tile-sized cells (see med_floor)
    s = T.flatten(im, flat)
    n = int(round(im.size[0] * scale))
    s = T.to_f(s.resize((n, n), Image.LANCZOS))
    g = s.mean(2, keepdims=True); s = (g + (s - g) * sat) * np.array(tintmul, np.float32)
    return s, fn

def med_floor():
    N, G, P = 1024, 8, 128                           # 8 x 8 tiles of 30 cm
    terr, fn_t = _tile_source('terracotta', sat=0.80, tintmul=(1.0, 0.94, 0.92))   # worn brick red rather than fresh orange
    slat, fn_s = _tile_source('slate')
    rng = np.random.default_rng(41)
    mats = [terr, slat]; mmean = [m.mean((0, 1)) for m in mats]
    # every tile its own crop: the source is used at x0.75 (1.5 x the nominal 426.7 px/m; the fine sandy grain has no readable
    # scale) so that it holds 6 x 6 = 36 non-overlapping 128 px cells, of which each material needs 32. No cell is used twice.
    nc = mats[0].shape[0] // P
    assert nc * nc >= G * G // 2
    cells = [[(c // nc, c % nc) for c in rng.permutation(nc * nc)[:G * G // 2]] for _ in mats]
    lab = np.kron(np.arange(G * G).reshape(G, G), np.ones((4, 4), int))             # 4 x 4 coarse cells per tile
    tone = declump(rng.uniform(-0.06, 0.06, G * G), lab, rng, sigmas=(3, 6, 12))      # +-6 % tone, light and dark tiles spread evenly
    a = np.zeros((N, N, 3), np.float32)
    cnt = [0, 0]
    for i in range(G):
        for j in range(G):
            m = (i + j) % 2
            cy, cx = cells[m][cnt[m]]; cnt[m] += 1
            p = d4(mats[m][cy * P:(cy + 1) * P, cx * P:(cx + 1) * P], int(rng.integers(0, 8))).copy()
            p *= mmean[m] / p.mean((0, 1))           # equal mean colour per tile ...
            p *= 1 + tone[i * G + j]                 # ... then +-6 % tone
            p *= 1 + np.array([1, 0, -1], np.float32) * rng.uniform(-0.012, 0.012)   # slight firing warm/cool shift
            a[i * P:(i + 1) * P, j * P:(j + 1) * P] = p
    # tile outline: rounded-rectangle distance field per tile, edge wobbled by periodic noise (softly worn arrises)
    jw = 0.004 * N / 2.4; hw = jw / 2                # 4 mm joint = 1.71 px, centred on the tile border (and the texture border)
    u = (np.arange(N) + 0.5) % P - P / 2
    px, py = np.abs(u)[None, :], np.abs(u)[:, None]
    rad = np.repeat(np.repeat(rng.uniform(2.0, 4.5, (G, G)).astype(np.float32), P, 0), P, 1)   # worn corner radius 5-10 mm
    half = P / 2 - hw
    qx, qy = px - (half - rad), py - (half - rad)
    sdf = np.sqrt(np.maximum(qx, 0) ** 2 + np.maximum(qy, 0) ** 2) + np.minimum(np.maximum(qx, qy), 0) - rad   # < 0 inside the tile
    sdf = sdf + 0.30 * pnoise(rng, N, 3.0) + 0.15 * pnoise(rng, N, 1.0)   # chipped, wobbly edge
    cov = np.clip(sdf + 0.5, 0, 1)                   # joint coverage
    lime = np.array([198, 190, 172], np.float32) / 255
    joint = lime[None, None, :] * (1 + 0.07 * pnoise(rng, N, 1.2))[..., None]
    e = np.maximum(-sdf, 0)                          # depth inside the tile, px
    wear = np.exp(-e / 2.6) * np.clip(0.55 + 0.45 * pnoise(rng, N, 6.0), 0, 1.5)   # pale lime-dusted, rubbed band ~1 cm along each edge
    k = 1.0
    def comp_(k):
        t = np.clip(a * k, 0, 1)
        t = t * (1 - 0.30 * wear[..., None]) + (0.55 * lime + 0.45 * t) * (0.30 * wear[..., None])
        return t * (1 - cov[..., None]) + joint * cov[..., None]
    for _ in range(12):
        k *= 92.0 / (comp_(k).mean() * 255)
    comp = comp_(k)
    return finish('med_floor', comp, 'composed', ['terracotta', 'slate'],
                  '%s + %s: each flattened (sigma 12%%) and scaled x0.75 (terracotta saturation x0.80, G x0.94, B x0.92: worn brick red); 64 tiles of 128 px (30 cm) in a checkerboard, every tile its own crop (32 of the 36 non-overlapping 128 px cells of each material, none used twice, random rotation/mirror), per-tile mean equalised then +-6%% tone (values handed out so that light and dark tiles do not cluster) and +-1.2%% warm/cool; rounded-rectangle tile outline with noise-wobbled edge and 5-10 mm worn corners, ~1 cm pale rubbed band along the edges; 4 mm (1.71 px, antialiased) pale lime joints centred on tile borders and on the texture border; tile gain iterated so the composite mean is 92' % (fn_t, fn_s), (2.4, 2.4))

def _courses(rng, N=1024, lo=192, hi=384, n_courses=8, min_stagger=48):
    """Joint x-positions (px, periodic) per course: block lengths lo..hi (45-90 cm), vertical joints at least `min_stagger` (11 cm)
       away from every joint of the course above and below (cyclically, so it also holds across the texture border)."""
    def one():
        while True:
            nb = int(rng.choice([3, 3, 4, 4, 4]))
            cuts = np.sort(rng.integers(0, N // 8, nb) * 8)          # 8 px grid = 1.9 cm
            L = np.diff(np.concatenate([cuts, [cuts[0] + N]]))
            if L.min() >= lo and L.max() <= hi: return cuts
    def far(c1, c2):
        d = np.abs(c1[:, None] - c2[None, :]); d = np.minimum(d, N - d); return d.min() >= min_stagger
    while True:
        rows = [one()]
        ok = True
        for r in range(1, n_courses):
            for _ in range(400):
                c = one()
                if far(c, rows[-1]) and (r < n_courses - 1 or far(c, rows[0])): rows.append(c); break
            else: ok = False; break
        if ok: return rows

def med_stone():
    im, fn = src('limestone')                        # 1536x1024 = 3.6 x 2.4 m  ->  426.7 px/m, same as the final tile
    s = T.to_f(T.flatten(im, 0.14))
    # tooling marks a little fainter: damp the finest detail band only
    lum = s.mean(2); g1 = ndimage.gaussian_filter(lum, 1.5, mode='reflect'); g2 = ndimage.gaussian_filter(lum, 5.0, mode='reflect')
    s = s * ((lum - 0.45 * (lum - g1) - 0.40 * (g1 - g2)) / np.maximum(lum, 1e-4))[..., None]
    base = s.mean((0, 1))
    N, CH = 1024, 128                                # 8 courses of 30 cm
    rng = np.random.default_rng(58)
    rows = _courses(rng)
    a = np.zeros((N, N, 3), np.float32)
    bands = rng.permutation(8)                       # each course uses its own 128 px band of the source: no detail appears twice
    nblocks = 0; lens = []; todo = []
    lab = np.zeros((N // 8, N // 8), int)            # block index on the 8 px grid of the joints
    for r, cuts in enumerate(rows):
        L = np.diff(np.concatenate([cuts, [cuts[0] + N]]))
        band = s[bands[r] * CH:(bands[r] + 1) * CH]
        # consecutive, non-overlapping segments of the band, handed out in shuffled order so neighbours are not continuous
        order = rng.permutation(len(L)); Ls = L[order]
        gap = (band.shape[1] - L.sum()) // len(L)
        starts = np.concatenate([[0], np.cumsum(Ls + gap)[:-1]]) + int(rng.integers(0, gap + 1))
        for sl, b in enumerate(order):
            x0 = int(starts[sl]); p = band[:, x0:x0 + L[b]].copy()
            if rng.random() < 0.5: p = p[:, ::-1]    # mirrors turn the diagonal tooling: every block dressed on its own
            if rng.random() < 0.5: p = p[::-1]
            p *= base / p.mean((0, 1))               # same mean colour for every block (tone is applied below)
            ix = (np.arange(L[b]) + cuts[b]) % N
            lab[r * CH // 8:(r + 1) * CH // 8, ix[::8] // 8] = nblocks
            todo.append((r, ix, p))
            nblocks += 1; lens.append(int(L[b]))
    # block-to-block variation within +-4 % and a slight warm/cool shift. The values are handed out so that their low-passed map
    # is flat: a chance stack of dark blocks next to a light one shows as a repeating blotch once the wall repeats every 2.4 m.
    tone = declump(np.clip(rng.normal(0, 0.022, nblocks), -0.04, 0.04), lab, rng, sigmas=(6, 12, 24))
    warm = declump(rng.uniform(-0.008, 0.008, nblocks), lab, rng, sigmas=(6, 12, 24))
    for i, (r, ix, p) in enumerate(todo):
        a[r * CH:(r + 1) * CH, ix] = p * (1 + tone[i]) * (1 + np.array([1, 0, -1], np.float32) * warm[i])
    # 3 mm joints (1.28 px, antialiased): bed joints on course borders (incl. the texture border), staggered perpends
    jw = 0.003 * N / 2.4; hw = jw / 2
    yy = (np.arange(N) + 0.5) % CH; dy = np.minimum(yy, CH - yy)
    dx = np.full((N, N), 1e3, np.float32); xs = np.arange(N) + 0.5
    for r, cuts in enumerate(rows):
        d = np.abs(xs[None, :] - cuts[:, None]); d = np.minimum(d, N - d).min(0)
        dx[r * CH:(r + 1) * CH] = d[None, :]
    d = np.minimum(dy[:, None], dx)
    cov = np.clip(hw + 0.5 - d, 0, 1)
    a = a * (1 - 0.05 * np.exp(-(d / 2.5) ** 2))[..., None]          # faintly soiled arris beside the joint
    jn = pnoise(rng, N, 0.8)
    joint = (base * np.array([0.80, 0.79, 0.77], np.float32))[None, None, :] * (1 + 0.05 * jn)[..., None]   # slightly darker lime mortar
    k = 1.0
    for _ in range(12):
        comp = np.clip(a * k, 0, 1) * (1 - cov[..., None]) + joint * k * cov[..., None]
        k *= 172.0 / (comp.mean() * 255)
    comp = np.clip(a * k, 0, 1) * (1 - cov[..., None]) + joint * k * cov[..., None]
    print('           blocks %d, lengths %d..%d px = %.0f..%.0f cm' % (nblocks, min(lens), max(lens), min(lens) / N * 240, max(lens) / N * 240))
    return finish('med_stone', comp, 'composed', ['limestone'],
                  '%s: flatten (sigma 14%%), detail below 1.5 px x0.55 and 1.5-5 px x0.6 (fainter tooling marks); 8 courses of 128 px (30 cm) along u, %d blocks of %.0f-%.0f cm = non-overlapping crops at native scale (each course from its own source band, segment order shuffled, random mirrors), perpends at least 11 cm from those of the courses above and below (cyclic), per-block mean equalised then brightness varied within +-4%% (normal, sigma 2.2%%, clipped) and +-0.8%% warm/cool, both handed out so that light/dark and warm/cool blocks do not cluster (no repeating blotch); 3 mm (1.28 px, antialiased) joints ~20%% darker than the stone, centred on course borders and on the texture border, faint soiled arris; mean set to 172' % (fn, nblocks, min(lens) / N * 240, max(lens) / N * 240), (2.4, 2.4))

ALL = dict(med_wall=med_wall, med_floor=med_floor, med_stone=med_stone)

def contact():
    """raw/medtex/contact.png: the three textures side by side, each 2 x 2 repeats, captioned, on the gallery wall colour."""
    from PIL import ImageDraw, ImageFont
    names = list(ALL); cell = 560; pad = 30; cap = 34
    sheet = Image.new('RGB', (pad + len(names) * (cell + pad), pad + cell + cap + pad), (31, 58, 61))
    dr = ImageDraw.Draw(sheet)
    try: font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 18)
    except Exception: font = ImageFont.load_default()
    for i, nme in enumerate(names):
        im = Image.open(os.path.join(OUT, nme + '.webp')).convert('RGB')
        t = T.tile_preview(im, 2, 2, max_side=cell).resize((cell, cell), Image.LANCZOS)
        x = pad + i * (cell + pad); sheet.paste(t, (x, pad))
        f = T.to_f(im)
        dr.text((x, pad + cell + 8), '%s  %dx%d  2x2 repeats  mean %.0f' % (nme, im.size[0], im.size[1], f.mean() * 255), fill=(233, 223, 198), font=font)
    sheet.save(os.path.join(RAW, 'contact.png'))

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    names = sys.argv[1:] or list(ALL)
    mpath = os.path.join(RAW, 'manifest.json')
    old = {e['file']: e for e in json.load(open(mpath))} if os.path.exists(mpath) else {}
    for nme in names:
        e = ALL[nme](); old[e['file']] = e
    order = ['assets/tex/%s.webp' % k for k in ALL]
    json.dump([old[k] for k in order if k in old], open(mpath, 'w'), indent=1, ensure_ascii=False)
    if all(os.path.exists(os.path.join(OUT, k + '.webp')) for k in ALL): contact()
