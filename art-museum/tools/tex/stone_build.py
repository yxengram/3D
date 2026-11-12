"""Group `stone`: builds assets/tex/{travertine,paving,terrazzo,concrete,gravel,plaster}.webp from raw/stone/src_*.png.
   Run:  ROOT/.venv/bin/python ROOT/tools/tex/stone_build.py [name ...]
   Writes the final WebP files, raw/stone/preview_<name>.png (3x3 tiles) and raw/stone/manifest.json."""
import sys, os, glob, json, math
import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import textools as T

RAW = os.path.join(ROOT, 'raw', 'stone')
OUT = os.path.join(ROOT, 'assets', 'tex')
MODEL = 'gpt-image-2.6-sunburst'
Q = 88

PROMPTS = {
 'travertine': "Flat-lit albedo texture photograph of one single continuous slab of honed ivory-beige travertine, vein-cut, seen perfectly frontally like a flatbed scan (orthographic, no perspective). The image shows an area about 3.6 m wide by 2.4 m high of uninterrupted stone: fine horizontal sedimentary veining and soft linear banding in ivory, cream and pale beige running left to right across the whole image, with sparse tiny cement-filled pits. Matte honed finish, subtle low contrast, fine natural detail. Perfectly even, shadowless diffuse lighting: no highlights, no reflections, no shadows, no vignette, the same brightness from corner to corner. No joints, no seams, no panel lines, no tile edges, no cracks, no stains, no text. The stone fills the image edge to edge.",
 'granite': "Flat-lit albedo texture photograph of flamed (thermally roughened) warm-grey granite, seen from straight above like a flatbed scan (orthographic, no perspective). The image shows about 1.2 m by 1.2 m of one continuous uninterrupted stone surface: fine, uniform speckled grain of 2 to 4 mm crystals in warm mid grey, pale grey, a little beige and small dark flecks; matte rough flamed finish, low contrast, very even all over with no large patches or veins. Perfectly even, shadowless diffuse lighting: no highlights, no sparkle, no shadows, no vignette, the same brightness from corner to corner. No joints, no seams, no tiles, no cracks, no stains, no text. The stone fills the image edge to edge.",
 'terrazzo': "Flat-lit albedo texture photograph of a polished fine-chip terrazzo floor seen from straight above like a flatbed scan (orthographic, no perspective). The image shows about 1.25 m by 1.25 m of one continuous uninterrupted surface: a warm light-grey cement matrix evenly scattered with many small angular marble chips, each only 5 to 20 mm across (the largest chip is smaller than one sixtieth of the image width, several thousand chips in the image). Chip colours: mostly ivory and off-white, some ochre and honey, some charcoal, and a few terracotta. Even random distribution with no clusters and no large stones. Perfectly even, shadowless diffuse lighting: no reflections, no gloss highlights, no shadows, no vignette, the same brightness from corner to corner. No divider strips, no joints, no seams, no cracks, no text. The terrazzo fills the image edge to edge.",
 'concrete': "Flat-lit albedo texture photograph of smooth fair-faced cast architectural concrete, seen perfectly frontally like a flatbed scan (orthographic, no perspective). The image shows about 3 m by 3 m of one continuous uninterrupted wall surface: light warm grey, very smooth, with subtle soft cloudy mottling and a few scattered tiny air pores (pinholes 1 to 3 mm). Matte, low contrast, even all over. Perfectly even, shadowless diffuse lighting: no highlights, no shadows, no vignette, the same brightness from corner to corner. No panel lines, no formwork joints, no tie holes, no cracks, no stains, no streaks, no drips, no text. The concrete fills the image edge to edge.",
 'gravel': "Flat-lit albedo texture photograph of pale grey roof ballast gravel seen from straight above (orthographic top-down, no perspective). The image shows about 1.7 m by 1.7 m of a flat, level bed of loose rounded washed pebbles, each stone 2 to 4 cm across, so roughly 55 stones fit across the image width; densely packed several layers deep and completely covering the surface. Colours: pale grey and off-white with a few beige and mid-grey stones, matte and dry. Even size and even distribution all over, no large rocks. Overcast, shadowless diffuse lighting: no direct sun, no cast shadows, no highlights, no vignette, the same brightness from corner to corner; only soft darker gaps between the stones. No leaves, no debris, no plants, no edges, no text. The gravel fills the image edge to edge.",
 'plaster': "Flat-lit albedo texture photograph of a white painted gallery wall, seen perfectly frontally like a flatbed scan (orthographic, no perspective). The image shows about 2 m by 2 m of smooth plaster painted matte warm white with a paint roller: almost perfectly uniform, with only a very faint, fine, even roller stipple (slight orange-peel texture) that is barely visible. Perfectly even, shadowless diffuse lighting: no highlights, no shadows, no gradient, no vignette, the same brightness from corner to corner. No marks, no scuffs, no cracks, no joints, no brush strokes, no objects, no text. The wall fills the image edge to edge.",
}

# ---------------------------------------------------------------- helpers
def src(name):
    files = sorted(glob.glob(os.path.join(RAW, 'src_%s-*.png' % name)))
    if not files: raise SystemExit('missing raw/stone/src_%s-*.png' % name)
    return Image.open(files[-1]).convert('RGB'), os.path.basename(files[-1])

def d4(a, k):
    """k in 0..7: the 8 rotations/mirrors of a square patch."""
    a = np.rot90(a, k % 4, (0, 1))
    return a[:, ::-1] if k >= 4 else a

def flatten_wrap(a, sigma, strength=1.0):
    """Remove low-frequency brightness variation of a periodic image (keeps periodicity)."""
    lum = a.mean(2); low = ndimage.gaussian_filter(lum, sigma, mode='wrap')
    return a * ((low.mean() / np.maximum(low, 1e-3)) ** strength)[..., None]

def debanded(a, sigma=10):
    """Remove axis-aligned bands (smoothed row / column mean profiles) of a periodic image: they are what the eye picks up when a wall tile repeats."""
    lum = a.mean(2)
    for ax in (0, 1):
        prof = ndimage.gaussian_filter1d(lum.mean(1 - ax), sigma, mode='wrap')
        g = prof.mean() / prof
        a = a * (g[:, None, None] if ax == 0 else g[None, :, None]); lum = a.mean(2)
    return a

def detail_even(a, sigmas=(2.0, 10.0), smooth=5.0, lim=(0.8, 1.7)):
    """Even out the amplitude of fine and medium detail along rows and columns of a periodic image.
       make_tileable() cross-fades a band next to the top/left border; the blend lowers the local contrast there by 15-25 %,
       which repeats as a faint smoother stripe every tile. Each detail band (difference of wrap-Gaussians) is re-scaled per
       row and per column so its RMS profile is flat; the low-frequency remainder is left untouched (mean unchanged)."""
    lum = a.mean(2); prev = lum; out = None; bands = []
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

def quilt(s, N, g, overlap, seed, sharp=8.0, wobble=2.5, use_d4=True):
    """Periodic N x N texture from random (rotated/mirrored) crops of a stochastic source `s` laid on a g x g grid of a torus.
       Neighbouring crops overlap by `overlap` px; the seam is a noisy, almost hard cut (no ghosting, no straight line)."""
    rng = np.random.default_rng(seed)
    step = N // g; assert step * g == N
    P = step + overlap; H, W = s.shape[:2]; assert P <= min(H, W)
    r = np.minimum(np.arange(P) + 0.5, P - 0.5 - np.arange(P)) / overlap
    w1 = np.clip(r, 0, 1).astype(np.float32)
    w2 = np.outer(w1, w1)
    acc = np.zeros((N, N, 3), np.float32); wacc = np.zeros((N, N), np.float32)
    order = rng.permutation(8)
    n = 0
    for i in range(g):
        for j in range(g):
            k = int(order[(n + i) % 8]) if use_d4 else 0; n += 1
            t = d4(s, k)
            y = int(rng.integers(0, t.shape[0] - P + 1)); x = int(rng.integers(0, t.shape[1] - P + 1))
            patch = t[y:y + P, x:x + P]
            noise = ndimage.gaussian_filter(rng.standard_normal((P, P)).astype(np.float32), 7)
            noise /= noise.std() + 1e-6
            w = (w2 + 1e-4) ** sharp * np.exp(wobble * noise)
            iy = (np.arange(P) + i * step - overlap // 2) % N; ix = (np.arange(P) + j * step - overlap // 2) % N
            acc[np.ix_(iy, ix)] += patch * w[..., None]; wacc[np.ix_(iy, ix)] += w
    return acc / np.maximum(wacc, 1e-12)[..., None]

def resize_periodic(a, out):
    """Lanczos resize of a periodic square image; wrap-padding keeps the result exactly periodic."""
    N = a.shape[0]
    p = N // math.gcd(N, out)
    while p < 24: p *= 2
    q = p * out // N
    pad = np.pad(a, ((p, p), (p, p), (0, 0)), mode='wrap')
    im = T.to_im(pad).resize((out + 2 * q, out + 2 * q), Image.LANCZOS)
    return T.to_f(im)[q:q + out, q:q + out]

def fit_mean(a, target, fixed=None):
    """Scale `a` so the mean sRGB value (0..255) of the clipped result hits `target`. `fixed` = bool mask of pixels that are not scaled."""
    k = 1.0
    for _ in range(12):
        b = a * k
        if fixed is not None: b = np.where(fixed[..., None], a, b)
        m = np.clip(b, 0, 1).mean() * 255
        k *= target / m
    b = a * k
    if fixed is not None: b = np.where(fixed[..., None], a, b)
    return np.clip(b, 0, 1)

def finish(name, a, src_kind, prompt_keys, post, tile_m, q=Q):
    im = T.to_im(a)
    path = os.path.join(OUT, name + '.webp')
    T.save_webp(im, path, q=q)
    fin = Image.open(path).convert('RGB')
    T.tile_preview(fin, 3, 3).save(os.path.join(RAW, 'preview_%s.png' % name))
    f = T.to_f(fin)
    lum = f.mean(2)
    entry = dict(file='assets/tex/%s.webp' % name, source=src_kind, model=MODEL,
                 prompt=' | '.join(PROMPTS[k] for k in prompt_keys), post=post, px=list(fin.size), tile_m=list(tile_m),
                 mean_linear=T.mean_linear(fin))
    # seam metric: mean abs difference across the wrap border relative to the same metric inside the image
    def seam(ax):
        d_in = np.abs(np.diff(f, axis=ax)).mean()
        d_b = np.abs(np.take(f, 0, axis=ax) - np.take(f, -1, axis=ax)).mean()
        return d_b / max(d_in, 1e-6)
    print('%-11s %s mean sRGB %.1f  rgb %s  rel.std %.2f%%  seam ratio x %.2f y %.2f  %d kB' % (
        name, fin.size, f.mean() * 255, np.round(f.reshape(-1, 3).mean(0) * 255, 1), 100 * lum.std() / lum.mean(), seam(1), seam(0),
        os.path.getsize(path) // 1024))
    return entry

# ---------------------------------------------------------------- textures
def travertine():
    im, fn = src('travertine')                       # 1536x1024 = 3.6 x 2.4 m  ->  426.7 px/m, same as the final tile
    s = T.to_f(im)
    s = s * (s.mean((0, 1)).mean() / ndimage.gaussian_filter(s.mean(2), 220, mode='reflect'))[..., None] ** 0.5  # mild de-gradient
    rng = np.random.default_rng(11)
    PW, PH = 512, 256                                # panel 1.2 x 0.6 m
    cells = [(cx, cy) for cy in range(4) for cx in range(3)]         # 12 non-overlapping crops in the source
    pick = rng.permutation(len(cells))[:8]
    a = np.zeros((1024, 1024, 3), np.float32)
    base = None
    for n, ci in enumerate(pick):
        cx, cy = cells[ci]
        p = s[cy * PH:(cy + 1) * PH, cx * PW:(cx + 1) * PW].copy()
        if rng.random() < 0.5: p = p[:, ::-1]        # mirror keeps the veining horizontal
        if base is None: base = s.mean((0, 1))
        p *= (base / p.mean((0, 1)))                 # same mean colour for every panel ...
        p *= 1 + rng.uniform(-0.04, 0.04)            # ... then +-4 % panel-to-panel brightness
        r, c = n // 2, n % 2
        a[r * PH:(r + 1) * PH, c * PW:(c + 1) * PW] = p
    # 5 mm recessed joints, centred on panel edges (and therefore on the tile border)
    jw = 0.005 * 1024 / 2.4; hw = jw / 2
    yy = (np.arange(1024) + 0.5) % PH; dy = np.minimum(yy, PH - yy)
    xx = (np.arange(1024) + 0.5) % PW; dx = np.minimum(xx, PW - xx)
    cov = np.maximum(np.clip(hw + 0.5 - dy, 0, 1)[:, None], np.clip(hw + 0.5 - dx, 0, 1)[None, :])
    joint = np.array([58, 52, 46], np.float32) / 255
    # iterate the stone gain so the composite (joints included) hits the target mean
    k = 1.0
    for _ in range(10):
        comp = np.clip(a * k, 0, 1) * (1 - cov[..., None]) + joint * cov[..., None]
        k *= 200.0 / (comp.mean() * 255)
    comp = np.clip(a * k, 0, 1) * (1 - cov[..., None]) + joint * cov[..., None]
    return finish('travertine', comp, 'composed', ['travertine'],
                  '%s: mild de-gradient; 8 different 512x256 crops (1.2x0.6 m, native scale, some mirrored) stacked 2x4, per-panel mean equalised then +-4%% brightness; 5 mm (2.13 px, antialiased) dark joints centred on panel edges and tile border; mean set to 200' % fn, (2.4, 2.4))

def paving():
    im, fn = src('granite')
    s = T.to_f(T.flatten(im, 0.12))
    sc = 0.42                                        # 1024 px ~ 1.0 m of stone -> 426.7 px/m
    n = int(round(1024 * sc))
    s = T.to_f(T.to_im(s).resize((n, n), Image.LANCZOS))
    m = s.mean((0, 1)); s = m + (s - m) * 0.8        # low contrast
    rng = np.random.default_rng(23)
    PW, PH = 256, 128                                # paver 0.6 x 0.3 m
    a = np.zeros((1024, 1024, 3), np.float32)
    for r in range(8):
        off = (PW // 2) if r % 2 else 0
        for c in range(4):
            k = int(rng.integers(0, 8)); t = d4(s, k)
            y = int(rng.integers(0, n - PH + 1)); x = int(rng.integers(0, n - PW + 1))
            p = t[y:y + PH, x:x + PW].copy()
            p *= (m / p.mean((0, 1)))
            p *= 1 + rng.uniform(-0.05, 0.05)                         # +-5 % paver-to-paver
            p *= 1 + np.array([1, 0, -1], np.float32) * rng.uniform(-0.006, 0.006)   # tiny warm/cool shift
            ix = (np.arange(PW) + c * PW + off) % 1024
            a[r * PH:(r + 1) * PH, ix] = p
    # 4 mm joints, running bond
    jw = 0.004 * 1024 / 2.4; hw = jw / 2
    yy = (np.arange(1024) + 0.5) % PH; dy = np.minimum(yy, PH - yy)
    rows = np.arange(1024) // PH
    xo = (np.arange(1024)[None, :] + 0.5 - np.where(rows % 2 == 1, PW // 2, 0)[:, None]) % PW
    dx = np.minimum(xo, PW - xo)
    d = np.minimum(dy[:, None], dx)
    cov = np.clip(hw + 0.5 - d, 0, 1)
    a = a * (1 - 0.05 * np.exp(-(d / 2.2) ** 2))[..., None]           # slightly soiled arris next to the joint
    jn = ndimage.gaussian_filter(rng.standard_normal((1024, 1024)).astype(np.float32), 0.7)
    joint = (m * 0.50)[None, None, :] * (1 + 0.10 * jn / (jn.std() + 1e-6))[..., None]
    k = 1.0
    for _ in range(10):
        comp = np.clip(a * k, 0, 1) * (1 - cov[..., None]) + joint * k * cov[..., None]
        k *= 150.0 / (comp.mean() * 255)
    comp = np.clip(a * k, 0, 1) * (1 - cov[..., None]) + joint * k * cov[..., None]
    return finish('paving', comp, 'composed', ['granite'],
                  '%s: flatten, scale x0.42, contrast x0.8; 32 pavers 256x128 px (0.6x0.3 m) = random rotated/mirrored crops, running bond (odd rows offset 128 px), +-5%% brightness per paver; 4 mm (1.7 px, antialiased) sand-grey joints centred on tile border; mean set to 150' % fn, (2.4, 2.4))

def terrazzo():
    im, fn = src('terrazzo')
    s = T.to_f(T.flatten(im, 0.15))
    N = 2688                                         # source px across the 2.2 m tile -> chips ~5-20 mm after x0.381
    q = quilt(s, N, 4, 128, seed=5)
    q = flatten_wrap(q, 220)
    a = resize_periodic(q, 1024)
    a = a.mean(2, keepdims=True) + (a - a.mean(2, keepdims=True)) * 0.8   # saturation x0.8: matrix reads warm grey, not beige
    # brass divider: 3 px at each edge (6 px strip across the tile border when tiled)
    rng = np.random.default_rng(7)
    idx = np.arange(1024); e = np.minimum(idx, 1023 - idx)
    de = np.minimum(e[:, None], e[None, :])
    strip = de < 3
    brass = np.array([186, 152, 92], np.float32) / 255
    streak = 1 + 0.03 * ndimage.gaussian_filter(rng.standard_normal((1024, 1024)).astype(np.float32), 3) * 6
    b = brass[None, None, :] * streak[..., None]
    a = fit_mean(a, 185.0)
    a = a * np.where(de == 3, 0.90, 1.0)[..., None]  # hairline shadow line where matrix meets the strip
    for _ in range(4):
        comp = np.where(strip[..., None], b, a)
        a = np.clip(a * (185.0 / (comp.mean() * 255)), 0, 1)
    comp = np.where(strip[..., None], b, a)
    return finish('terrazzo', comp, 'composed', ['terrazzo'],
                  '%s: flatten; periodic 2688 px quilt of 16 random rotated/mirrored 800 px crops (noisy hard seams), periodic flatten, Lanczos to 1024 (chips ~5-20 mm at 2.2 m), saturation x0.8; brass strip 3 px on every edge; mean set to 185' % fn, (2.2, 2.2))

def concrete():
    im, fn = src('concrete')
    f = T.flatten(im, 0.22, 0.8)                     # keep the cloudy mottling, drop the frame-sized gradient
    t = T.to_f(T.make_tileable(f, band=0.12, seed=3))
    n = min(t.shape[:2]); t = t[:n, :n]
    t = flatten_wrap(t, 0.30 * n, 0.7)
    a = detail_even(debanded(resize_periodic(t, 1024)))
    m = a.mean((0, 1)); a = m + (a - m) * 1.35       # mottling a little more legible under the lightmap
    a = fit_mean(a, 165.0)
    return finish('concrete', a, 'generated', ['concrete'],
                  '%s: flatten (sigma 22%%, strength 0.8), make_tileable band 12%%, periodic flatten, periodic Lanczos to 1024, row/column band removal, detail amplitude evened along rows/columns (restores the contrast lost in the cross-fade band), contrast x1.35, mean set to 165' % fn, (3, 3))

def gravel():
    im, fn = src('gravel')
    s = T.to_f(T.flatten(im, 0.15))
    N = 2592                                         # source px across the 3 m tile -> stones 2-4 cm after x0.1975
    q = quilt(s, N, 6, 96, seed=9, wobble=3.0)
    q = flatten_wrap(q, 200)
    a = resize_periodic(q, 512)
    a = fit_mean(a, 160.0)
    return finish('gravel', a, 'generated', ['gravel'],
                  '%s: flatten; periodic 2592 px quilt of 36 random rotated/mirrored 528 px crops (noisy hard seams), periodic flatten, Lanczos to 512 (stones 2-4 cm at 3 m); mean set to 160' % fn, (3, 3))

def plaster():
    im, fn = src('plaster')
    f = T.flatten(im, 0.06)
    t = T.to_f(T.make_tileable(f, band=0.12, seed=4))
    n = min(t.shape[:2]); t = t[:n, :n]
    t = flatten_wrap(t, 40)
    t = detail_even(debanded(resize_periodic(t, 512)), sigmas=(1.5, 6.0), smooth=4.0)
    lum = t.mean(2); d = lum / lum.mean() - 1
    d = d * (0.011 / d.std())                        # roller stipple, relative std 1.1 %
    tint = np.array([236, 233, 227], np.float32) / 255              # warm white, mean 232
    a = np.clip(tint[None, None, :] * (1 + d)[..., None], 0, 1)
    a = fit_mean(a, 232.0)
    return finish('plaster', a, 'generated', ['plaster'],
                  '%s: flatten (sigma 6%%), make_tileable band 12%%, periodic flatten, periodic Lanczos to 512, row/column band removal, detail amplitude evened along rows/columns (restores the contrast lost in the cross-fade band); luminance detail rescaled to 1.1%% relative std on a fixed warm-white tint (236,233,227); mean 232; WebP q90' % fn, (2, 2), q=90)

ALL = dict(travertine=travertine, paving=paving, terrazzo=terrazzo, concrete=concrete, gravel=gravel, plaster=plaster)

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    names = sys.argv[1:] or list(ALL)
    mpath = os.path.join(RAW, 'manifest.json')
    old = {e['file']: e for e in json.load(open(mpath))} if os.path.exists(mpath) else {}
    for nme in names:
        e = ALL[nme](); old[e['file']] = e
    order = ['assets/tex/%s.webp' % k for k in ALL]
    json.dump([old[k] for k in order if k in old], open(mpath, 'w'), indent=1, ensure_ascii=False)
