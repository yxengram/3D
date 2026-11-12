"""Texture helpers (run with art-museum/.venv/bin/python). All images are PIL RGB/RGBA.
   flatten()       remove uneven lighting / large-scale gradients so a texture does not show a repeating bright or dark blob
   make_tileable() exact seamless tiling by cross-fading opposite borders (for stochastic textures: stone, concrete, grass, plaster)
   set_mean()      scale so the mean sRGB value hits a target (keeps all materials' albedo in a known range)
   tile_preview()  n x m repeats for checking seams by eye
   save_webp()     final runtime format
   key_alpha()     turn a flat background colour into alpha (trees, lettering)"""
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

def to_f(im): return np.asarray(im.convert('RGB'), np.float32) / 255.0
def to_im(a): return Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8))

def flatten(im, sigma_frac=0.18, strength=1.0):
    a = to_f(im); lum = a.mean(2)
    s = sigma_frac * min(lum.shape)
    low = ndimage.gaussian_filter(lum, s, mode='reflect'); g = (low.mean() / np.maximum(low, 1e-3)) ** strength
    return to_im(a * g[..., None])

def make_tileable(im, band=0.14, seed=1):
    """Returns an image slightly smaller than the input (by `band` on each axis) that tiles exactly; resize afterwards."""
    a = to_f(im); rng = np.random.default_rng(seed)
    for axis in (0, 1):
        n = a.shape[axis]; b = int(n * band)
        w = np.linspace(0, 1, b, dtype=np.float32)
        # noise-modulated weights hide the blur of a plain linear cross-fade
        shape = (b, a.shape[1]) if axis == 0 else (a.shape[0], b)
        noise = ndimage.gaussian_filter(rng.standard_normal(shape).astype(np.float32), 6); noise /= (np.abs(noise).max() + 1e-6)
        ww = w[:, None] if axis == 0 else w[None, :]
        m = np.clip((ww + noise * 0.35 * (1 - np.abs(2 * ww - 1)) - 0.5) * 3.0 + 0.5, 0, 1)[..., None]
        if axis == 0:
            head, tail = a[:b], a[n - b:]; a = np.concatenate([m * head + (1 - m) * tail, a[b:n - b]], 0)
        else:
            head, tail = a[:, :b], a[:, n - b:]; a = np.concatenate([m * head + (1 - m) * tail, a[:, b:n - b]], 1)
    return to_im(a)

def set_mean(im, target):
    """target: mean sRGB value 0..255 (per-channel balance kept)."""
    a = to_f(im); k = (target / 255.0) / max(a.mean(), 1e-4)
    return to_im(a * k)

def tile_preview(im, nx=3, ny=3, max_side=1536):
    w, h = im.size; out = Image.new(im.mode, (w * nx, h * ny))
    for i in range(nx):
        for j in range(ny): out.paste(im, (i * w, j * h))
    s = max_side / max(out.size)
    return out.resize((int(out.size[0] * s), int(out.size[1] * s)), Image.LANCZOS) if s < 1 else out

def save_webp(im, path, q=86, lossless=False):
    im.save(path, 'WEBP', quality=q, method=6, lossless=lossless)

def key_alpha(im, bg=None, lo=0.10, hi=0.30):
    """Alpha from distance to a flat background colour (default: colour of the top-left corner); also removes the colour fringe."""
    a = np.asarray(im.convert('RGB'), np.float32) / 255.0
    bgc = np.array(bg, np.float32) / 255.0 if bg is not None else a[:8, :8].reshape(-1, 3).mean(0)
    d = np.sqrt(((a - bgc) ** 2).sum(2)); al = np.clip((d - lo) / (hi - lo), 0, 1)
    rgb = np.where(al[..., None] > 0.02, (a - bgc * (1 - al[..., None])) / np.maximum(al[..., None], 0.02), a)
    out = np.dstack([np.clip(rgb, 0, 1), al]); return Image.fromarray((out * 255 + 0.5).astype(np.uint8), 'RGBA')

def bleed_rgb(im, iters=8):
    """Fill RGB under transparent pixels with neighbouring colours so mipmaps/filters do not show dark or bright halos."""
    a = np.asarray(im, np.float32) / 255.0; rgb, al = a[..., :3].copy(), a[..., 3]
    known = al > 0.05
    for _ in range(iters):
        w = ndimage.uniform_filter(known.astype(np.float32), 5); s = np.dstack([ndimage.uniform_filter(rgb[..., c] * known, 5) for c in range(3)])
        fill = (~known) & (w > 0); rgb[fill] = (s / np.maximum(w, 1e-5)[..., None])[fill]; known = known | fill
    return Image.fromarray((np.dstack([rgb, al]) * 255 + 0.5).astype(np.uint8), 'RGBA')

def mean_linear(im):
    a = to_f(im); lin = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4); return [round(float(x), 4) for x in lin.reshape(-1, 3).mean(0)]
