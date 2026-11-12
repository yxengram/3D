"""Scene-side adjustments applied on top of the generated/composed textures after seeing them lit in the scene.
Keeps the originals in raw/final_adjust/orig/ so the step is repeatable.  .venv/bin/python tools/tex/final_adjust.py"""
import os, sys, shutil
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__)); import textools as T
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')); A = os.path.join(ROOT, 'assets', 'tex'); O = os.path.join(ROOT, 'raw', 'final_adjust', 'orig'); os.makedirs(O, exist_ok=True)
def orig(name):
    src = os.path.join(A, name); keep = os.path.join(O, name)
    if not os.path.exists(keep): shutil.copy(src, keep)
    return Image.open(keep).convert('RGB')
def contrast(im, k, sat=1.0):
    a = T.to_f(im); m = a.mean((0, 1), keepdims=True); a = m + (a - m) * k
    g = a.mean(2, keepdims=True); a = g + (a - g) * sat
    return T.to_im(a)
log = {}
# concrete: the cloudy mottling read as marble on beams and stairs -> damp only the large-scale clouds, keep the fine grain for close views
from scipy import ndimage
a = T.to_f(orig('concrete.webp')); low = np.dstack([ndimage.gaussian_filter(a[..., c], 40, mode='wrap') for c in range(3)]); m = a.mean((0, 1), keepdims=True)
im = T.to_im(m + (low - m) * 0.3 + (a - low)); T.save_webp(im, os.path.join(A, 'concrete.webp'), 88); log['concrete.webp'] = 'large-scale mottling x0.3, fine grain and pores kept, 1024px'
# lawn: only ever seen from a distance -> 512 px, a little less saturated and darker so it does not read as a golf green
im = contrast(orig('lawn.webp'), 0.9, 0.78).resize((512, 512), Image.LANCZOS); im = T.set_mean(im, 96); T.save_webp(im, os.path.join(A, 'lawn.webp'), 86); log['lawn.webp'] = 'saturation x0.78, mean 96, 512px'
# sky: soft content, 2048x512 is enough for the dome (saves 5 MB of GPU memory)
im = orig('sky.webp').resize((2048, 512), Image.LANCZOS); T.save_webp(im, os.path.join(A, 'sky.webp'), 90); log['sky.webp'] = '2048x512'
# tree cards: 768 px (they are seen from mid distance; saves 7 MB of GPU memory)
for n in ('tree_a.webp', 'tree_b.webp', 'tree_c.webp'):
    src = os.path.join(A, n); keep = os.path.join(O, n)
    if not os.path.exists(keep): shutil.copy(src, keep)
    Image.open(keep).convert('RGBA').resize((768, 768), Image.LANCZOS).save(src, 'WEBP', quality=88, method=6, exact=True); log[n] = '768px'
print(log)
