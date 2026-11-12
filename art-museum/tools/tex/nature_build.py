"""Group `nature`: builds assets/tex/{sky,tree_a,tree_b,tree_c,treeline,lawn,hedge}.webp, previews and manifest from raw/nature/*.png.
   Run:  ROOT/.venv/bin/python ROOT/tools/tex/nature_build.py [sky|trees|treeline|lawn|hedge ...]   (no argument = everything)
   Careful with `lawn` (and with no argument): tools/tex/final_adjust.py post-adjusts assets/tex/lawn.webp for the scene; after
   rebuilding the lawn, refresh raw/final_adjust/orig/lawn.webp and run final_adjust.py again."""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent))
import textools as T

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / 'raw' / 'nature'
OUT = ROOT / 'assets' / 'tex'
MODEL = 'gpt-image-2.6-sunburst'

SRC = {
    'lawn': 'lawn-20261112-064405.png',
    'hedge': 'hedge-20261112-064456.png',
    'tree_a': 'tree_a-20261112-064607.png',
    'tree_b': 'tree_b-20261112-092701.png',
    'tree_c': 'tree_c-20261112-093039.png',
    'treeline': 'treeline-20261112-093135.png',
    'sky': ['sky_1-20261112-092835.png', 'sky_2-20261112-092914.png', 'sky_3-20261112-092957.png'],
}

P_SKY = ("Wide photograph of sky only, looking level toward the horizon with the sun behind the viewer and out of frame. The bottom edge of the image is the level horizon, the top edge is high overhead. Late afternoon about 90 minutes before sunset: clear blue sky, deeper saturated blue toward the top, paling smoothly to a warm pale peach-cream haze along the very bottom edge. Many scattered small soft fair-weather cumulus clouds distributed evenly across the whole width, none of them large; they get smaller, flatter and more numerous toward the bottom (far distance). Thin wispy high cirrus streaks in the upper part. The clouds are softly lit with warm golden-cream light and have cool blue-grey bases. No sun disc, no glare spot, no lens flare, no rays. Absolutely no ground, no land, no sea, no mountains, no trees, no buildings, no birds, no aircraft, no text. Even exposure across the full width, no vignette. Photorealistic, natural colours, sharp cloud detail.")
PROMPT = {
    'sky': P_SKY,
    'lawn': "Top-down orthographic photograph of a freshly mown garden lawn, camera looking straight down, covering an area about 4 metres across. Uniform dense fine-bladed turf with an even texture from edge to edge: no mowing stripes, no clumps, no bare patches, no weeds, no clover, no flowers, no fallen leaves, no objects. Flat even overcast light, no shadows, no highlights, no vignette, no perspective. Natural medium grass green, slightly muted, not neon. The grass fills the entire frame.",
    'hedge': "Frontal orthographic close-up photograph of the flat clipped face of a boxwood hedge, covering an area about 1.5 metres across. Dense small oval boxwood leaves packed tightly, evenly sheared flat surface, even texture from edge to edge with no gaps, no deep dark holes, no visible branches, no flowers. Soft flat overcast light, no shadows, no glossy highlights, no vignette, no perspective. Natural dark-to-mid green. The foliage fills the entire frame.",
    'tree_a': "A single mature deciduous tree with a broad rounded crown, shown in straight side elevation (orthographic, eye level, no perspective). The whole tree is visible: the entire crown and the trunk down to its base, with a small empty margin at the top and the sides. The trunk base is exactly at the bottom centre of the image and is cut off flat at ground level where it touches the bottom edge. Soft even overcast daylight with no strong sun side, natural mid-green summer foliage, a few small gaps in the crown showing branches. The tree is isolated on a perfectly flat, uniform, pure magenta (#FF00FF) background that fills the whole image. No ground, no grass, no soil, no roots spreading, no shadow, no other plants, no text. Photorealistic.",
    'tree_b': "A single mature linden (lime) tree with a tall, upright, egg-shaped oval crown, clearly taller than wide, shown in straight side elevation (orthographic, eye level, no perspective), isolated cut-out on a fully transparent background, for use as an architectural-visualisation tree billboard. The whole tree is visible with a small empty margin at the top and at both sides. The trunk is vertical, centred horizontally, and its base is cut off flat exactly at the bottom-centre edge of the image: no ground, no grass, no soil, no roots, no shadow. Soft, even overcast daylight from all sides: no sunny side, no dark side, no strong highlights. Dense foliage in natural mid greens (not neon, not yellow-green), with a few small gaps where branches show through. Photorealistic, sharp leaf detail, clean edges, no fringe, no glow, no text.",
    'tree_c': "A single slender young field maple tree about six metres tall, as newly planted on a city plaza: thin straight vertical trunk, narrow light airy oval crown with fine branching, shown in straight side elevation (orthographic, eye level, no perspective), isolated cut-out on a fully transparent background, for use as an architectural-visualisation tree billboard. The whole tree is visible with a small empty margin at the top; the tree is much taller than wide. The trunk is centred horizontally and its base is cut off flat exactly at the bottom-centre edge of the image: no ground, no grass, no soil, no roots, no stake, no shadow. Soft, even overcast daylight from all sides: no sunny side, no dark side, no strong highlights. Fresh foliage in natural mid greens (not neon, not yellow-green), with gaps where thin branches show through. Photorealistic, sharp leaf detail, clean edges, no fringe, no glow, no text.",
    'treeline': "A distant mixed deciduous tree line seen from far away in straight side elevation (orthographic, no perspective): one continuous unbroken horizontal band of many tree crowns of varying heights and species (oak, ash, linden, poplar, a few darker conifers) running across the full width of the image from the left edge to the right edge, with an irregular bumpy top silhouette. Isolated cut-out on a fully transparent background: everything above the trees is transparent. The band of trees occupies only the bottom third of the image; the upper two thirds are empty and transparent. The foliage mass is completely solid and opaque all the way down to the bottom edge of the image: no trunks visible, no ground, no grass, no field, no fence, no buildings, no shadows. Trees are small in the frame (about forty crowns across the width). Slightly hazy, soft, desaturated grey-greens as if seen through several hundred metres of late-afternoon air, soft even light. Photorealistic, clean edges, no fringe, no glow, no text.",
}
GEN_ARGS = {  # tool arguments besides prompt (all: quality high, png, default model)
    'sky': 'size 1536x1024, three separate generations with the same prompt',
    'lawn': 'size 1024x1024', 'hedge': 'size 1024x1024',
    'tree_a': 'size 1024x1024, background transparent', 'tree_b': 'size 1024x1024, background transparent',
    'tree_c': 'size 1024x1024, background transparent', 'treeline': 'size 1536x1024, background transparent',
}
LANCZOS = Image.LANCZOS


# ---------------------------------------------------------------- helpers
def smoothstep(x):
    x = np.clip(x, 0, 1); return x * x * (3 - 2 * x)

def lum(a): return a[..., 0] * 0.2126 + a[..., 1] * 0.7152 + a[..., 2] * 0.0722

def saturate(a, s):
    l = lum(a)[..., None]; return l + (a - l) * s

def resize_f(a, size):
    """Lanczos resize of a float HxWxC array (any channel count)."""
    a = np.asarray(a, np.float32)
    return np.dstack([np.asarray(Image.fromarray(np.ascontiguousarray(a[..., c]), 'F').resize(size, LANCZOS)) for c in range(a.shape[2])])

def flatten_wrap(a, sigma, strength=1.0):
    """Like textools.flatten but periodic, so it can run on an already tileable texture."""
    l = a.mean(2); low = ndimage.gaussian_filter(l, sigma, mode='wrap')
    return a * ((low.mean() / np.maximum(low, 1e-3)) ** strength)[..., None]

def seam_mask(A, B, feather, margin=None, extra_cost=None, K=1):
    """Min-cost vertical seam through the overlap of A (kept left of the seam) and B (kept right). Returns weight of B, HxW."""
    H, W = A.shape[:2]
    cost = ((A - B) ** 2).sum(2); cost = ndimage.gaussian_filter(cost, 2) + 1e-4
    if extra_cost is not None: cost = cost + extra_cost
    m = int(3 * feather) + 2 if margin is None else margin
    cost[:, :m] = 1e6; cost[:, W - m:] = 1e6
    acc = cost.copy(); back = np.zeros((H, W), np.int8); idx = np.arange(W)
    for y in range(1, H):
        p = np.pad(acc[y - 1], K, constant_values=np.inf)
        cand = np.stack([p[K + d:K + d + W] + 1e-5 * abs(d) for d in range(-K, K + 1)])     # cand[j] = cost of coming from x + (j - K)
        k = cand.argmin(0); back[y] = k - K; acc[y] += cand[k, idx]
    x = int(acc[-1].argmin()); path = np.zeros(H, int)
    for y in range(H - 1, -1, -1):
        path[y] = x; x = x + int(back[y, x])
    mask = (np.arange(W)[None, :] > path[:, None]).astype(np.float32)
    return ndimage.gaussian_filter1d(mask, feather, axis=1, mode='nearest') if feather > 0 else mask

def seam_join(a, b, overlap, axis, feather=1.5):
    """Concatenate a and b along `axis`; inside the overlap switch from a to b along a min-cost seam (keeps full contrast, no blur band)."""
    if axis == 0: return seam_join(a.transpose(1, 0, 2), b.transpose(1, 0, 2), overlap, 1, feather).transpose(1, 0, 2)
    A, B = a[:, -overlap:], b[:, :overlap]; m = seam_mask(A, B, feather)[..., None]
    return np.concatenate([a[:, :-overlap], A * (1 - m) + B * m, b[:, overlap:]], 1)

def seam_tileable(a, overlap, feather=1.5):
    """Exact tiling on both axes by seam-cutting the overlap of opposite borders (result is `overlap` px smaller on each axis)."""
    for axis in (1, 0):
        t = a if axis == 1 else a.transpose(1, 0, 2)
        A, B = t[:, -overlap:], t[:, :overlap]; m = seam_mask(A, B, feather)[..., None]
        t = np.concatenate([A * (1 - m) + B * m, t[:, overlap:-overlap]], 1)
        a = t if axis == 1 else t.transpose(1, 0, 2)
    return a

def save_rgba(im, path, q=88):
    # exact=True keeps the bled RGB under fully transparent pixels (otherwise the encoder may zero it -> dark halos in mipmaps)
    im.save(path, 'WEBP', quality=q, method=6, exact=True)

def fill_rgb(rgb, known, iters=12, size=5):
    """Replace RGB where `known` is False by the average of nearby known pixels (grows outward from the known area)."""
    rgb = rgb.copy(); known = known.copy()
    for _ in range(iters):
        if known.all(): break
        w = ndimage.uniform_filter(known.astype(np.float32), size)
        s = np.dstack([ndimage.uniform_filter(rgb[..., c] * known, size) for c in range(3)])
        fill = (~known) & (w > 1e-3); rgb[fill] = (s / np.maximum(w, 1e-5)[..., None])[fill]; known = known | fill
    return rgb

def rgba_f(im): return np.asarray(im.convert('RGBA'), np.float32) / 255.0
def rgba_im(a): return Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')

def mean_linear_opaque(im):
    a = rgba_f(im); rgb, al = a[..., :3], a[..., 3:]
    lin = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    return [round(float(x), 4) for x in (lin * al).reshape(-1, 3).sum(0) / max(float(al.sum()), 1e-6)]

def on_bg(im, bg):
    b = Image.new('RGBA', im.size, tuple(bg) + (255,)); b.alpha_composite(im); return b.convert('RGB')

LAWN_SCENE_ADJUST = "tools/tex/final_adjust.py (scene side, not part of this group) replaces assets/tex/lawn.webp by a 512x512 version (contrast x0.9, saturation x0.78, mean sRGB 96) and keeps this group's 1024x1024 output in raw/final_adjust/orig/lawn.webp; px and mean_linear in this entry describe the group output"
MAN = {}
SEAMS = []
def entry(name, file, source, post, px, tile_m, im, **extra):
    e = dict(file=f'assets/tex/{file}', source=source, model=MODEL, prompt=PROMPT[name], post=post, px=list(px), tile_m=tile_m,
             mean_linear=T.mean_linear(im), raw=SRC[name], generation_args=GEN_ARGS[name])
    e.update(extra); MAN[file] = e


# ---------------------------------------------------------------- lawn
def build_lawn():
    im = Image.open(RAW / SRC['lawn']).convert('RGB')
    im = T.flatten(im, sigma_frac=0.10)
    im = T.make_tileable(im, band=0.10, seed=3).resize((1024, 1024), LANCZOS)
    a = flatten_wrap(T.to_f(im), 70)
    a = saturate(a, 0.50)                    # generated green is too vivid for a mean of 105 (would be neon)
    a = a * np.array([1.03, 1.0, 1.06], np.float32)   # a touch less yellow
    im = T.set_mean(T.to_im(a), 105); im = T.set_mean(im, 105)
    T.save_webp(im, OUT / 'lawn.webp', q=88)
    T.tile_preview(im).save(RAW / 'preview_lawn.png')
    entry('lawn', 'lawn.webp', 'generated', 'flatten(0.10) -> make_tileable(band 0.10) -> resize 1024 -> periodic flatten -> saturation x0.5, slight de-yellow -> set_mean 105',
          im.size, [4, 4], im, scene_adjust=LAWN_SCENE_ADJUST)
    return im


# ---------------------------------------------------------------- hedge
def build_hedge():
    src = T.to_f(T.flatten(Image.open(RAW / SRC['hedge']).convert('RGB'), sigma_frac=0.10))
    c = 760; ov = 140
    # 2x2 quilt of four different crops so that 1.5 m holds ~70 leaves across (leaf ~2.3 cm) instead of ~45 (3.4 cm)
    fl = src[:, ::-1]      # rotating changes the look of the foliage (visible columns), mirroring does not
    t = [src[:c, :c], fl[:c, :c], src[-c:, -c:], fl[-c:, -c:]]
    t = [np.ascontiguousarray(x) for x in t]
    top = seam_join(t[0], t[1], ov, 1); bot = seam_join(t[2], t[3], ov, 1)
    q = seam_join(top, bot, ov, 0)                                        # 1380 x 1380
    q = seam_tileable(q, ov)                                              # 1240 x 1240, periodic
    pad = 31; qp = np.pad(q, ((pad, pad), (pad, pad), (0, 0)), mode='wrap')   # periodic resize: pad with wrapped pixels, resize, crop
    n = q.shape[0]; sc = 512 / n; big = resize_f(qp, (int(round((n + 2 * pad) * sc)),) * 2); o = int(round(pad * sc))
    im = T.to_im(big[o:o + 512, o:o + 512])
    a = flatten_wrap(T.to_f(im), 40)
    a = saturate(a, 0.62)
    im = T.set_mean(T.to_im(a), 80); im = T.set_mean(im, 80)
    T.save_webp(im, OUT / 'hedge.webp', q=88)
    T.tile_preview(im).save(RAW / 'preview_hedge.png')
    entry('hedge', 'hedge.webp', 'generated', 'flatten(0.10) -> 2x2 quilt of four 760 px corner crops (two mirrored) joined along min-cost seams (140 px overlap) -> wrap on both axes by seam cut -> periodic Lanczos resize to 512 -> periodic flatten -> saturation x0.62 -> set_mean 80',
          im.size, [1.5, 1.5], im)
    return im


# ---------------------------------------------------------------- trees
TREE = {  # upper alpha level (generator alpha that becomes fully opaque), saturation, gain (rgb)
    'tree_a': dict(hi=0.80, sat=0.95, gain=(1.0, 1.0, 1.0)),
    'tree_b': dict(hi=0.80, sat=0.85, gain=(1.0, 1.0, 1.0)),
    'tree_c': dict(hi=0.60, sat=0.80, gain=(0.93, 0.97, 1.05)),   # its leaves came out partly see-through (alpha 0.5-0.9 inside the crown)
}
def build_tree(name, margin=24, size=1024):
    p = TREE[name]
    a = rgba_f(Image.open(RAW / SRC[name]))
    al = np.clip((a[..., 3] - 0.15) / (p['hi'] - 0.15), 0, 1)   # firm up the generator's soft alpha, drop its faint outer fringe
    ys, xs = np.where(al > 0.5)
    cols = np.where(al[-10:].mean(0) > 0.5)[0]; cx = (cols.min() + cols.max()) / 2.0     # trunk centre at the bottom edge
    x0, x1, y0 = xs.min(), xs.max(), ys.min()
    s = min(1.0, (size - margin) / (size - y0), (size / 2 - margin) / max(cx - x0, x1 - cx + 1))
    rgb = saturate(a[..., :3], p['sat']) * np.array(p['gain'], np.float32)
    pm = np.dstack([rgb * al[..., None], al])
    n = int(round(size * s)); pm = resize_f(pm, (n, n))
    canvas = np.zeros((size, size, 4), np.float32)
    dx = int(round(size / 2 - 0.5 - cx * s)); dy = size - n          # bottom rows stay on the bottom edge
    xs0, xs1 = max(0, -dx), min(n, size - dx)
    canvas[dy:, dx + xs0:dx + xs1] = pm[:, xs0:xs1]
    al2 = np.clip(canvas[..., 3], 0, 1)
    rgb2 = np.where(al2[..., None] > 1e-3, canvas[..., :3] / np.maximum(al2[..., None], 1e-3), 0)
    im = T.bleed_rgb(rgba_im(np.dstack([rgb2, al2])), iters=24)
    # fill what bleed did not reach with the mean foliage colour (never visible, keeps mip levels clean)
    b = rgba_f(im); far = (b[..., 3] <= 0.05) & (b[..., :3].sum(2) == 0)
    known = ndimage.uniform_filter((b[..., 3] > 0.05).astype(np.float32), 5) > 0
    mean_c = (rgb2 * al2[..., None]).reshape(-1, 3).sum(0) / al2.sum()
    arr = b.copy(); arr[..., :3][far] = mean_c; im = rgba_im(arr)
    save_rgba(im, OUT / f'{name}.webp', q=88)
    entry(name, f'{name}.webp', 'generated',
          f"native alpha from the generator (background transparent); alpha levels 0.15..{p['hi']:.2f} -> saturation x{p['sat']}, gain {p['gain']} -> premultiplied Lanczos scale x{s:.3f}, trunk centre moved to x={size/2:.0f}, base on bottom edge, margin {margin} px -> bleed_rgb -> lossy WebP q88 with exact RGB under alpha",
          im.size, None, im, mean_linear_opaque=mean_linear_opaque(im))
    return im

def build_trees():
    ims = [build_tree(n) for n in ('tree_a', 'tree_b', 'tree_c')]
    sheet = Image.new('RGB', (1024 * 3, 1024 * 2))
    for i, im in enumerate(ims):
        sheet.paste(on_bg(im, (150, 185, 225)), (i * 1024, 0)); sheet.paste(on_bg(im, (255, 0, 255)), (i * 1024, 1024))
    sheet.resize((1536, 1024), LANCZOS).save(RAW / 'preview_trees.png')
    return ims


# ---------------------------------------------------------------- treeline
def build_treeline(W=2048, H=256):
    a = rgba_f(Image.open(RAW / SRC['treeline']))
    al = np.clip((a[..., 3] - 0.15) / (0.80 - 0.15), 0, 1); rgb = a[..., :3]
    # bright, colourless flecks inside the crowns (almost all near the crown tops) are baked-in sky glints. Paint them over with
    # the foliage colour around them and keep the alpha solid: cutting them out as holes left pale, ringed, half-transparent
    # blobs that showed on any background other than a pale sky.
    l = lum(rgb); chroma = rgb.max(2) - rgb.min(2)
    fleck = smoothstep((l - 0.60) / 0.12) * smoothstep((0.12 - chroma) / 0.06)
    rgb = fill_rgb(rgb, (ndimage.grey_dilation(fleck, size=5) <= 0.05) & (al > 0.5), iters=10)
    top = int(np.where(al.max(1) > 0.5)[0].min())
    ov = 128; Wsrc = a.shape[1] - ov; s = W / Wsrc; rows = int(round(H / s))
    r0 = top - 8; crop = np.dstack([rgb * al[..., None], al])[r0:r0 + rows]          # premultiplied
    # wrap: cut a min-cost seam through the overlap of the right end (A) and the left end (B)
    A, B = crop[:, -ov:], crop[:, :ov]
    m = seam_mask(A, B, feather=1.5)[..., None]
    wrapped = np.concatenate([A * (1 - m) + B * m, crop[:, ov:-ov]], 1)                 # width Wsrc, periodic
    # resize periodically: pad with wrapped columns, resize, crop
    pad = 16; wp = np.concatenate([wrapped[:, -pad:], wrapped, wrapped[:, :pad]], 1)
    big = resize_f(wp, (int(round((Wsrc + 2 * pad) * s)), H)); off = int(round(pad * s)); pm = big[:, off:off + W]
    al2 = np.clip(pm[..., 3], 0, 1)
    solid = smoothstep((np.arange(H) - (H - 70)) / 40.0)[:, None]; al2 = np.maximum(al2, solid * (al2 > 0.3))   # no pinholes at the bottom
    al2[-24:] = 1.0
    rgb2 = np.where(al2[..., None] > 1e-3, pm[..., :3] / np.clip(pm[..., 3:], 1e-3, 1), 0)
    rgb2 = np.clip(rgb2, 0, 1)
    im = T.bleed_rgb(rgba_im(np.dstack([rgb2, al2])), iters=40)
    b = rgba_f(im); far = (b[..., 3] <= 0.05) & (b[..., :3].sum(2) == 0)
    mean_c = (rgb2 * al2[..., None]).reshape(-1, 3).sum(0) / al2.sum(); b[..., :3][far] = mean_c
    # make the bled RGB periodic too (bleed is not wrap-aware): copy is fine because alpha there is 0
    im = rgba_im(b)
    save_rgba(im, OUT / 'treeline.webp', q=88)
    prev = Image.new('RGBA', (W * 2, H)); prev.paste(im, (0, 0)); prev.paste(im, (W, 0))
    sky = Image.new('RGB', (W * 2, H * 2), (214, 190, 170))
    sky.paste(on_bg(prev, (214, 190, 170)), (0, 0)); sky.paste(on_bg(prev, (255, 0, 255)), (0, H))
    # readable preview: the wrap seam at full resolution (centre) + the whole strip tiled twice
    pv = Image.new('RGB', (2048, 256 + 256 + 128), (214, 190, 170))
    pv.paste(sky.crop((W - 1024, 0, W + 1024, 256)), (0, 0)); pv.paste(sky.crop((W - 1024, 256, W + 1024, 512)), (0, 256))
    pv.paste(sky.crop((0, 0, W * 2, H)).resize((2048, 128), LANCZOS), (0, 512))
    pv.save(RAW / 'preview_treeline.png')
    entry('treeline', 'treeline.webp', 'generated',
          f'native alpha (background transparent); alpha levels 0.15..0.80; baked-in pale sky flecks in the crowns painted over with the surrounding foliage colour (alpha kept solid, no holes); crop of the top {rows} rows of the band; wrap by min-cost seam through a {ov} px overlap of both ends; periodic Lanczos upscale x{s:.3f} to {W}x{H}; bottom rows forced opaque; bleed_rgb; lossy WebP q88 with exact RGB under alpha',
          im.size, None, im, mean_linear_opaque=mean_linear_opaque(im))
    return im


# ---------------------------------------------------------------- sky
def build_sky(W=3072, H=768, seg=1024, ov=256):
    sk = [resize_f(T.to_f(Image.open(RAW / f)), (seg + ov, H)) for f in SRC['sky']]     # each view = 120 deg + 30 deg overlap
    # 1. same clear-sky background in all three: per-row target colour from cloud-free pixels, then a smooth per-image gain field
    for _ in range(2):
        R = np.stack([x[..., 0] for x in sk])
        rsky = ndimage.gaussian_filter1d(np.percentile(R.transpose(1, 0, 2).reshape(H, -1), 30, axis=1), 15, mode='nearest')
        BR = np.stack([x[..., 2] - x[..., 0] for x in sk])                                   # blueness; grey cloud bases have little
        bsky = ndimage.gaussian_filter1d(np.percentile(BR.transpose(1, 0, 2).reshape(H, -1), 70, axis=1), 15, mode='nearest')
        w = [(1 - smoothstep((x[..., 0] - rsky[:, None] - 0.05) / 0.10)) * smoothstep((x[..., 2] - x[..., 0] - bsky[:, None] + 0.16) / 0.10)
             for x in sk]                                                                    # 1 = clear sky, 0 = cloud / cirrus / cloud shadow side
        num = sum((x * wi[..., None]).sum(1) for x, wi in zip(sk, w)); den = sum(wi.sum(1) for wi in w)
        target = ndimage.gaussian_filter1d(num / np.maximum(den, 1e-3)[:, None], 12, axis=0, mode='nearest')
        out = []
        for x, wi in zip(sk, w):
            # additive offset (a per-channel gain measured on dark blue sky would tint the bright clouds)
            wi = wi + 1e-3; d = target[:, None, :] - x
            off = ndimage.gaussian_filter(d * wi[..., None], (120, 90, 0), mode='nearest') / ndimage.gaussian_filter(wi, (120, 90), mode='nearest')[..., None]
            out.append(x + np.clip(off, -0.08, 0.08))
        sk = out
    # 2. stitch: switch from one view to the next along a min-cost seam that prefers clear sky in both (no ghost clouds)
    segs = []; SEAMS.clear()
    for i in range(3):
        A, B = sk[i - 1], sk[i]; At, Bh = A[:, seg:], B[:, :ov]
        cloud = (1 - w[i - 1][:, seg:]) + (1 - w[i][:, :ov])
        m = seam_mask(At, Bh, feather=8, extra_cost=0.15 * ndimage.maximum_filter(cloud, 15), K=4)[..., None]
        SEAMS.append(m[..., 0])
        segs.append(np.concatenate([At * (1 - m) + Bh * m, B[:, ov:seg]], 1))
    a = np.clip(np.concatenate(segs, 1), 0, 1)                                         # 3072 x 768, periodic
    assert a.shape[:2] == (H, W)
    # 3. grade: the generated horizon haze is rather salmon for 90 min before sunset -> a little paler towards the horizon
    y = np.arange(H, dtype=np.float32)[:, None, None]
    k = smoothstep((y - 0.60 * H) / (0.40 * H))                # 0 above 60 % of the height, 1 at the horizon
    a = saturate(a, 1 - 0.22 * k)
    # 4. bottom 8 %: one uniform haze colour; top 15 %: one uniform zenith blue
    nb, nt = int(round(0.08 * H)), int(round(0.15 * H))
    haze = a[H - nb:].reshape(-1, 3).mean(0)
    zen = target[:12].mean(0) * 0.97
    wb = smoothstep((y - (H - 1 - nb)) / nb); a = a * (1 - wb) + haze * wb
    wt = smoothstep((nt - y) / nt); a = a * (1 - wt) + zen * wt
    a[0] = zen; a[-1] = haze
    im = T.to_im(a)
    T.save_webp(im, OUT / 'sky.webp', q=90)
    # preview: whole strip rolled by half a turn (wrap seam in the middle) + the three seams at full resolution
    r = np.roll(np.asarray(im), W // 2, axis=1)
    pv = Image.new('RGB', (1536, 384 + 512))
    pv.paste(Image.fromarray(r).resize((1536, 384), LANCZOS), (0, 0))
    for i in range(3):
        c = (W // 2 + i * seg + ov // 2) % W                       # seam centre in the rolled strip
        cr = np.take(r, np.arange(c - 384, c + 384) % W, axis=1)
        pv.paste(Image.fromarray(cr).resize((512, 512), LANCZOS), (i * 512, 384))
    pv.save(RAW / 'preview_sky.png')
    Image.fromarray(np.concatenate([np.asarray(im)] * 2, 1)).resize((3072, 384), LANCZOS).save(RAW / 'preview_sky_tiled.png')
    entry('sky', 'sky.webp', 'composed',
          'three 1536x1024 generations (same prompt) each resized to 1280x768 = 120 deg + 30 deg overlap; clear-sky background equalised across the three (per-row target colour + smooth additive offset field from cloud-free pixels); joined at all three joins incl. the wrap along a min-cost seam through clear sky inside the 256 px overlap (8 px feather); saturation -22 % towards the horizon; bottom 8 % faded to a uniform haze colour, top 15 % to a uniform zenith blue; WebP q90',
          im.size, None, im, haze_srgb=[int(round(float(v) * 255)) for v in haze], zenith_srgb=[int(round(float(v) * 255)) for v in zen],
          layout='u = azimuth (360 deg, periodic), v: bottom row = horizon, top row = zenith; light on the clouds is azimuth-neutral (no sun side)')
    return im


BUILD = dict(sky=build_sky, trees=build_trees, treeline=build_treeline, lawn=build_lawn, hedge=build_hedge)
ORDER = ['sky.webp', 'tree_a.webp', 'tree_b.webp', 'tree_c.webp', 'treeline.webp', 'lawn.webp', 'hedge.webp']

if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    which = sys.argv[1:] or list(BUILD)
    for w in which: BUILD[w]()
    mf = RAW / 'manifest.json'
    old = {Path(e['file']).name: e for e in json.loads(mf.read_text())} if mf.exists() else {}
    old.update(MAN)
    mf.write_text(json.dumps([old[k] for k in ORDER if k in old], indent=1, ensure_ascii=False))
    for k, e in MAN.items(): print(k, e['px'], 'mean_linear', e['mean_linear'])
    if 'lawn.webp' in MAN and (ROOT / 'raw' / 'final_adjust' / 'orig' / 'lawn.webp').exists():
        print('WARNING: assets/tex/lawn.webp was rebuilt at 1024 px / mean 105. The scene uses the version made by tools/tex/final_adjust.py:\n'
              '         copy the new file over raw/final_adjust/orig/lawn.webp and run final_adjust.py again.')
