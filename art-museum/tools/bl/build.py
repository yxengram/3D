# Model -> lightmap atlas -> bake -> denoise -> encode -> GLB + scene.json.
#   blender -b --factory-startup -P tools/bl/build.py -- [--res 2048] [--spp 192] [--zones lobby,gallery,ext] [--out build/v1] [--nobake] [--preview name,name] [--ship]
# --ship copies results into assets/ (scene.glb, scene.json, lm_*.webp). Without it everything stays in --out.
import sys, os, json, time, subprocess, shutil
sys.path.insert(0, os.path.dirname(__file__))
import bpy, numpy as np
import lib as L, materials, scene
a = L.args(); out = os.path.join(L.ROOT, a.get('out', 'build/v1')); os.makedirs(out, exist_ok=True)
res = int(a.get('res', 1024)); spp = int(a.get('spp', 64)); zones = a.get('zones', 'lobby,gallery,ext').split(',')
resz = {z: int(a.get('res_' + z, res)) for z in L.ZONES}
t0 = time.time()
L.reset(); materials.define(); scene.build()
nobj = len(L.REG); dens = L.finalize(resz); scene.lights(); L.setup_cycles(spp)
tris = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in bpy.data.objects if o.type == 'MESH'}
print('[model] %d objects -> %s  total %d tris  (%.1fs)' % (nobj, tris, sum(tris.values()), time.time() - t0))

PV = {  # name: (camera, target, lens mm, exposure)
    'ext_se': ((38, -60, 14), (3, 2, 5), 28, -2.6), 'ext_sw': ((-46, -48, 9), (-2, 2, 5), 28, -2.6), 'ext_top': ((10, -30, 95), (6, 4, 0), 30, -2.6),
    'ext_ne': ((60, 52, 22), (6, 8, 5), 30, -2.6), 'ext_door': ((3, -16, 1.7), (-1, 4, 4.5), 22, -2.6),
    'lob_in': ((0.6, 1.6, 1.62), (-2.5, 12, 4.6), 16, 0.3), 'lob_e': ((-9, 2.0, 1.62), (8, 9, 4.0), 16, 0.3), 'lob_w': ((9.5, 12.5, 1.62), (-6, 4, 3.6), 16, 0.3),
    'gal_in': ((12.2, 7.7, 1.62), (17, 7.2, 1.7), 16, 0.6), 'gal_mid': ((22.3, 5.0, 1.62), (30, 13, 1.8), 16, 0.6), 'gal_e': ((36.4, 13.8, 1.62), (24, 4, 1.5), 16, 0.6),
}
if a.get('preview'):
    for n in (PV if a['preview'] is True or a['preview'] == 'all' else a['preview'].split(',')):
        c, t, lens, ex = PV[n]; L.preview(os.path.join(out, 'pv_%s.png' % n), c, t, lens, samples=int(a.get('pvspp', 40)), exposure=ex + float(a.get('pvexp', 0)))

lm = {}
if not a.get('nobake'):
    for z in zones:
        bpy.context.scene.cycles.samples = int(a.get('spp_' + z, spp))
        r = resz[z]; raw = L.bake_zone(z, r, out); valid = np.load(os.path.join(out, 'lm_%s_valid.npy' % z))
        d = L.dilate(L.clean_residual(raw, L.denoise(L.dilate(raw, valid)), valid), valid); np.save(os.path.join(out, 'lm_%s.npy' % z), d)
for z in L.ZONES:
    f = os.path.join(out, 'lm_%s.npy' % z)
    if not os.path.exists(f): continue
    d = np.load(f); valid = np.load(os.path.join(out, 'lm_%s_valid.npy' % z)); v = d[valid]
    rng = float(min(np.percentile(v, 99.8) * 1.04, 16 * np.median(v.mean(1)))); med = float(np.median(v.mean(1)))
    png = os.path.join(out, 'lm_%s.png' % z); L.encode_lightmap(d, png, rng)
    nl = a.get('nl_' + z)     # near-lossless for a zone whose dim smooth walls show lossy chroma blocks (lobby)
    enc = ['-near_lossless', nl, '-z', '8'] if nl else ['-q', a.get('lmq', '96'), '-m', '6', '-sharp_yuv']
    subprocess.run(['cwebp', '-quiet', *enc, png, '-o', os.path.join(out, 'lm_%s.webp' % z)], check=True)
    lm[z] = dict(file='lm_%s.webp' % z, range=round(rng, 4), median=round(med, 4), res=d.shape[0], texels_per_m=round(dens.get(z, 0), 2))
    print('[lm] %s range %.2f median %.3f webp %d KB' % (z, rng, med, os.path.getsize(os.path.join(out, 'lm_%s.webp' % z)) // 1024))
L.export_glb(os.path.join(out, 'scene.glb'))
mats = {k: {kk: vv for kk, vv in v.items() if kk != 'size'} for k, v in L.MATS.items()}
json.dump(dict(mats=mats, lm=lm, walk=L.WALK, block=L.BLOCK, tris=tris, **L.INFO), open(os.path.join(out, 'scene.json'), 'w'), indent=1)
if a.get('ship'):
    for f in ['scene.glb', 'scene.json'] + [v['file'] for v in lm.values()]: shutil.copy(os.path.join(out, f), os.path.join(L.ASSETS, f))
    print('[ship] copied to assets/')
if a.get('blend'): bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, 'museum.blend'))
print('[done] %.0fs' % (time.time() - t0))
