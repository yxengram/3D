# Modelling + lightmap helpers for the museum. Runs inside Blender (bpy). Units: metres, Z up, X east, Y north.
# Everything is authored in world coordinates (objects stay at the origin). Each object belongs to a zone
# ('ext' | 'lobby' | 'gallery') and gets two UV sets: UV0 = world-projected metres / material tile size,
# LM = a per-zone lightmap atlas packed by finalize().
import bpy, bmesh, math, json, os, sys, time
from mathutils import Vector

ZONES = ('ext', 'lobby', 'gallery')
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ASSETS = os.path.join(ROOT, 'assets')
WALK = []      # walkable rectangles [x0, y0, x1, y1] (Blender XY)
BLOCK = []     # obstacle rectangles inside walkable areas
INFO = {}      # anything else the runtime needs (camera presets, zone boxes, sun direction ...)


def walk(x0, y0, x1, y1): WALK.append([min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)])


def block(x0, y0, x1, y1, grow=0.0): BLOCK.append([min(x0, x1) - grow, min(y0, y1) - grow, max(x0, x1) + grow, max(y0, y1) + grow])


def tex_mean(rel):
    """Mean linear RGB of a texture in assets/ (cached), or None if the file does not exist yet."""
    import numpy as np
    path = os.path.join(ASSETS, rel)
    if not os.path.exists(path): return None
    cache = os.path.join(ROOT, 'build', 'texmean.json'); c = json.load(open(cache)) if os.path.exists(cache) else {}
    key = 'v2:' + rel + ':' + str(int(os.path.getmtime(path))) + ':' + str(os.path.getsize(path))
    if key not in c:
        img = bpy.data.images.load(path); n = img.size[0] * img.size[1]; a = np.empty(n * 4, np.float32); img.pixels.foreach_get(a); a = a.reshape(n, 4)
        w = a[:, 3:4] if img.channels == 4 else np.ones((n, 1), np.float32)
        rgb = a[:, :3]; lin = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)      # pixels are sRGB-encoded
        m = [round(float(x), 4) for x in (lin * w).sum(0) / max(float(w.sum()), 1e-6)]; bpy.data.images.remove(img)
        if sum(m) < 1e-4: print('[texmean] unreadable (being rewritten?):', rel); return None                  # never cache a failed read
        c[key] = m; os.makedirs(os.path.dirname(cache), exist_ok=True); json.dump(c, open(cache, 'w'))
    return c[key]
MATS = {}      # name -> dict(color, size, kind, tex, ...)  (filled by materials.py through defmat)
REG = []       # registered objects: dict(obj, zone, lm, kind)
_chart = [0]   # running id for explicit lightmap charts


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    REG.clear(); _chart[0] = 0
    for m in list(bpy.data.materials): bpy.data.materials.remove(m)


def defmat(name, color=(0.8, 0.8, 0.8), size=(1, 1), kind='lit', tex=None, emit=0.0, **extra):
    """kind: 'lit' (albedo x lightmap), 'emit' (self-lit, lights the bake), 'glass' (not in bake, transparent at runtime),
    'unlit' (not lightmapped, still blocks light), 'ghost' (not lightmapped, invisible to the bake)."""
    if tex and kind in ('lit', 'cutout'):
        m = tex_mean(tex)
        if m: color = m
        if extra.get('tint'): color = [c * t for c, t in zip(color, extra['tint'])]
    MATS[name] = dict(color=list(color), size=list(size), kind=kind, tex=tex, emit=emit, **extra)


def bmat(name):
    """Blender material for a MATS entry (pure diffuse so bakes stay clean)."""
    m = bpy.data.materials.get(name)
    if m: return m
    d = MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    if d['kind'] == 'cutout' and d.get('tex') and os.path.exists(os.path.join(ASSETS, d['tex'])):
        img = bpy.data.images.load(os.path.join(ASSETS, d['tex'])); t = nt.nodes.new('ShaderNodeTexImage'); t.image = img
        mix = nt.nodes.new('ShaderNodeMixShader'); tr = nt.nodes.new('ShaderNodeBsdfTransparent'); b = nt.nodes.new('ShaderNodeBsdfDiffuse')
        b.inputs['Color'].default_value = (*d['color'], 1); gt = nt.nodes.new('ShaderNodeMath'); gt.operation = 'GREATER_THAN'; gt.inputs[1].default_value = 0.4
        nt.links.new(t.outputs['Alpha'], gt.inputs[0]); nt.links.new(gt.outputs[0], mix.inputs[0]); nt.links.new(tr.outputs[0], mix.inputs[1]); nt.links.new(b.outputs[0], mix.inputs[2])
        nt.links.new(mix.outputs[0], out.inputs[0])
    elif d['kind'] in ('glass', 'ghost', 'decal', 'cutout'):
        t = nt.nodes.new('ShaderNodeBsdfTransparent'); tint = d.get('bake_tint', 1.0); t.inputs['Color'].default_value = (tint, tint, tint, 1); nt.links.new(t.outputs[0], out.inputs[0])
    elif d['kind'] == 'emit':
        e = nt.nodes.new('ShaderNodeEmission'); e.inputs['Color'].default_value = (*d['color'], 1); e.inputs['Strength'].default_value = d['emit']
        nt.links.new(e.outputs[0], out.inputs[0])
    else:
        b = nt.nodes.new('ShaderNodeBsdfDiffuse'); b.inputs['Color'].default_value = (*d.get('bake', d['color']), 1)   # 'bake': bounce colour override
        nt.links.new(b.outputs[0], out.inputs[0])
    return m


def _frame(n):
    """Tangent frame used for world-projected UVs: u runs to the viewer's right, v up."""
    if abs(n.z) > 0.999: return Vector((1, 0, 0)), Vector((0, 1, 0)) if n.z > 0 else Vector((0, -1, 0))
    t = Vector((0, 0, 1)).cross(n).normalized(); return t, n.cross(t).normalized()


def mesh(name, verts, faces, mat, zone='ext', lm=1.0, uv='world', outward=None, smooth=False, uvrot=False, uvoff=(0, 0), uvrect=(0, 0, 1, 1)):
    """Generic mesh. verts: list of xyz, faces: list of index tuples. uv: 'world' | 'fit' (0..1 over the whole mesh, for pictures).
    outward: optional point that all faces must face away from (fixes winding). lm: lightmap density factor (0 = none).
    Returns the object."""
    d = MATS[mat]
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    vs = [bm.verts.new(v) for v in verts]
    for f in faces:
        try: bm.faces.new([vs[i] for i in f])
        except ValueError: pass
    bm.normal_update()
    if outward is not None:
        c = Vector(outward)
        for f in bm.faces:
            if f.normal.dot(f.calc_center_median() - c) < 0: f.normal_flip()
        bm.normal_update()
    uvl = bm.loops.layers.uv.new('UVMap'); lml = bm.loops.layers.uv.new('LM'); cl = bm.faces.layers.int.new('chart')
    sx, sy = d['size']
    bm.faces.ensure_lookup_table()
    if uv == 'fit':
        n = bm.faces[0].normal; t, b = _frame(n)
        us = [l.vert.co.dot(t) for f in bm.faces for l in f.loops]; vv = [l.vert.co.dot(b) for f in bm.faces for l in f.loops]
        u0, u1, v0, v1 = min(us), max(us), min(vv), max(vv)
    for f in bm.faces:
        t, b = _frame(f.normal)
        for l in f.loops:
            u, v = l.vert.co.dot(t), l.vert.co.dot(b)
            if uv == 'fit': l[uvl].uv = (uvrect[0] + (u - u0) / (u1 - u0) * (uvrect[2] - uvrect[0]), uvrect[1] + (v - v0) / (v1 - v0) * (uvrect[3] - uvrect[1]))
            elif uvrot: l[uvl].uv = (v / sx + uvoff[0], -u / sy + uvoff[1])
            else: l[uvl].uv = (u / sx + uvoff[0], v / sy + uvoff[1])
        f.smooth = smooth
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    me.materials.append(bmat(mat))
    if d['kind'] != 'lit': lm = 0
    REG.append(dict(obj=ob, zone=zone, lm=lm, kind=d['kind'], mat=mat, fit=uv == 'fit'))
    return ob


def xform(ob, rot=(0, 0, 0), pivot=(0, 0, 0), move=(0, 0, 0)):
    """Rotate (XYZ euler, degrees) about a pivot, then translate. World UVs are re-projected afterwards (not for 'fit' pictures)."""
    from mathutils import Euler, Matrix
    M = Matrix.Translation(Vector(move) + Vector(pivot)) @ Euler([math.radians(a) for a in rot]).to_matrix().to_4x4() @ Matrix.Translation(-Vector(pivot))
    ob.data.transform(M); ob.data.update(); _reproject(ob)
    return ob


_BOXF = {'x-': (0, 4, 7, 3), 'x+': (1, 2, 6, 5), 'y-': (0, 1, 5, 4), 'y+': (3, 7, 6, 2), 'z-': (0, 3, 2, 1), 'z+': (4, 5, 6, 7)}


def box(name, p0, p1, mat, zone='ext', lm=1.0, skip='', only='', **kw):
    """Axis-aligned box between two corners. skip: space-separated faces to omit, e.g. 'z- y+' (hidden faces waste lightmap);
    only: keep just these faces (lets one wall put its two sides into different zones/materials)."""
    x0, x1 = sorted((p0[0], p1[0])); y0, y1 = sorted((p0[1], p1[1])); z0, z1 = sorted((p0[2], p1[2]))
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    sk = set(skip.split())
    if only: sk = set(_BOXF) - set(only.split())
    return mesh(name, v, [f for k, f in _BOXF.items() if k not in sk], mat, zone, lm, outward=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), **kw)


def quad(name, pts, mat, zone='ext', lm=1.0, **kw):
    """Single quad/polygon from a list of points (counter-clockwise seen from the visible side)."""
    return mesh(name, pts, [tuple(range(len(pts)))], mat, zone, lm, **kw)


def plane_z(name, x0, y0, x1, y1, z, mat, zone='ext', lm=1.0, up=True, **kw):
    p = [(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)]
    return quad(name, p if up else p[::-1], mat, zone, lm, **kw)


def picture(name, center, facing, w, h, mat, zone='gallery', lm=1.0, off=0.0, uvrect=(0, 0, 1, 1)):
    """Upright rectangle with 0..1 UVs (image upright, not mirrored). facing: 'N','S','E','W' = direction the picture looks toward.
    center = (x, y, z) of the rectangle centre; off pushes it along the facing direction."""
    n = {'N': Vector((0, 1, 0)), 'S': Vector((0, -1, 0)), 'E': Vector((1, 0, 0)), 'W': Vector((-1, 0, 0))}[facing]
    t, b = _frame(n); c = Vector(center) + n * off
    pts = [c - t * w / 2 - b * h / 2, c + t * w / 2 - b * h / 2, c + t * w / 2 + b * h / 2, c - t * w / 2 + b * h / 2]
    return mesh(name, [tuple(p) for p in pts], [(0, 1, 2, 3)], mat, zone, lm, uv='fit', uvrect=uvrect)


def prism(name, profile, axis, a0, a1, mat, zone='ext', lm=1.0, caps=True, **kw):
    """Extrude a 2D polygon along a world axis. axis 'x': profile points are (y, z); 'y': (x, z); 'z': (x, y)."""
    def P(p, a): return {'x': (a, p[0], p[1]), 'y': (p[0], a, p[1]), 'z': (p[0], p[1], a)}[axis]
    n = len(profile); v = [P(p, a0) for p in profile] + [P(p, a1) for p in profile]
    f = [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    if caps: f += [tuple(range(n)), tuple(range(n, 2 * n))]
    cx = sum(p[0] for p in profile) / n; cy = sum(p[1] for p in profile) / n
    ob = mesh(name, v, f, mat, zone, lm, **kw)
    _fix_outward_convexish(ob, P((cx, cy), (a0 + a1) / 2))
    return ob


def _fix_outward_convexish(ob, c):
    """Recalculate normals to point outward (works for closed and for concave extrusions)."""
    bm = bmesh.new(); bm.from_mesh(ob.data); bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.to_mesh(ob.data); bm.free()
    _reproject(ob)


def _reproject(ob):
    r = next(r for r in REG if r['obj'] is ob); d = MATS[r['mat']]; sx, sy = d['size']
    if r.get('fit'): return
    bm = bmesh.new(); bm.from_mesh(ob.data); bm.normal_update(); uvl = bm.loops.layers.uv['UVMap']
    for f in bm.faces:
        t, b = _frame(f.normal)
        for l in f.loops: l[uvl].uv = (l.vert.co.dot(t) / sx, l.vert.co.dot(b) / sy)
    bm.to_mesh(ob.data); bm.free()


def cyl(name, x, y, z0, z1, r, mat, zone='ext', lm=1.0, segs=20, caps='', r1=None):
    """Vertical cylinder (or cone frustum with r1 = top radius). caps: any of 'b','t'. The side is one unrolled lightmap chart."""
    r1 = r if r1 is None else r1
    v = []; f = []
    for i in range(segs):
        a = 2 * math.pi * i / segs
        v.append((x + r * math.cos(a), y + r * math.sin(a), z0)); v.append((x + r1 * math.cos(a), y + r1 * math.sin(a), z1))
    for i in range(segs):
        j = (i + 1) % segs; f.append((2 * i, 2 * j, 2 * j + 1, 2 * i + 1))
    nside = len(f)
    if 'b' in caps: f.append(tuple(2 * i for i in range(segs))[::-1])
    if 't' in caps: f.append(tuple(2 * i + 1 for i in range(segs)))
    ob = mesh(name, v, f, mat, zone, lm, smooth=True)
    # explicit unrolled charts: side = one chart, split into `segs` loops laid out by arc length
    _chart[0] += 1; cid = _chart[0]
    bm = bmesh.new(); bm.from_mesh(ob.data); bm.faces.ensure_lookup_table()
    uvl = bm.loops.layers.uv['UVMap']; lml = bm.loops.layers.uv['LM']; cl = bm.faces.layers.int['chart']
    sx, sy = MATS[mat]['size']; rm = (r + r1) / 2; L = math.hypot(z1 - z0, r - r1)
    for i in range(nside):
        fa = bm.faces[i]; fa[cl] = cid
        for l in fa.loops:
            k = l.vert.index // 2; top = l.vert.index % 2
            if k == 0 and i == segs - 1: k = segs
            u = 2 * math.pi * rm * k / segs; vv = L * top
            l[lml].uv = (u, vv); l[uvl].uv = (u / sx, (z0 + (z1 - z0) * top) / sy)
        fa.smooth = True
    for fa in bm.faces[nside:]: fa.smooth = False
    bm.to_mesh(ob.data); bm.free()
    return ob


def register(ob, mat, zone='ext', lm=1.0):
    """Register a mesh object made by other means (bpy ops, modifiers). Applies its transform, gives it world UVs and the material."""
    bpy.context.view_layer.update()
    me = ob.data; me.transform(ob.matrix_world); ob.matrix_world.identity()
    bm = bmesh.new(); bm.from_mesh(me)
    if 'UVMap' not in bm.loops.layers.uv: bm.loops.layers.uv.new('UVMap')
    if 'LM' not in bm.loops.layers.uv: bm.loops.layers.uv.new('LM')
    if 'chart' not in bm.faces.layers.int: bm.faces.layers.int.new('chart')
    bm.to_mesh(me); bm.free()
    me.materials.clear(); me.materials.append(bmat(mat))
    d = MATS[mat]
    REG.append(dict(obj=ob, zone=zone, lm=lm if d['kind'] == 'lit' else 0, kind=d['kind'], mat=mat))
    _reproject(ob)
    return ob


# ---------------------------------------------------------------------------------------------------------------------
# finalize: join per zone, build lightmap atlas

def _skyline_pack(rects, W, H):
    """rects: list of (w, h) ints. Returns list of (x, y, rotated) or None."""
    sky = [[0, 0, W]]; out = [None] * len(rects)
    for i in sorted(range(len(rects)), key=lambda i: (-max(rects[i]), -min(rects[i]))):
        w, h = rects[i]; best = None
        for rot in ((False, True) if w != h else (False,)):
            rw, rh = (h, w) if rot else (w, h)
            if rw > W or rh > H: continue
            for k in range(len(sky)):
                sx = sky[k][0]
                if sx + rw > W: break
                y = 0; j = k; xe = sx + rw
                while j < len(sky) and sky[j][0] < xe:
                    if sky[j][1] > y: y = sky[j][1]
                    j += 1
                if y + rh > H: continue
                sc = (y + rh, y, sx)
                if best is None or sc < best[0]: best = (sc, sx, y, rw, rh, rot)
        if best is None: return None
        _, sx, y, rw, rh, rot = best; out[i] = (sx, y, rot)
        xe = sx + rw; new = []
        for s in sky:
            s0, sy_, sw = s; s1 = s0 + sw
            if s1 <= sx or s0 >= xe: new.append(s); continue
            if s0 < sx: new.append([s0, sy_, sx - s0])
            if s1 > xe: new.append([xe, sy_, s1 - xe])
        new.append([sx, y + rh, rw]); new.sort()
        # merge neighbours of equal height
        sky = [new[0]]
        for s in new[1:]:
            if s[1] == sky[-1][1] and sky[-1][0] + sky[-1][2] == s[0]: sky[-1][2] += s[2]
            else: sky.append(s)
    return out


def _join(objs, name):
    """Merge registered objects into one mesh; keeps materials, UV layers, chart ids; stores lm factor per face."""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap'); lml = bm.loops.layers.uv.new('LM'); cl = bm.faces.layers.int.new('chart')
    fl = bm.faces.layers.float.new('lmf'); ol = bm.faces.layers.int.new('src')
    mats = []
    for oi, r in enumerate(objs):
        ob = r['obj']; n0 = len(bm.faces); bm.from_mesh(ob.data); bm.faces.ensure_lookup_table()
        idx = []
        for m in ob.data.materials:
            if m.name not in mats: mats.append(m.name)
            idx.append(mats.index(m.name))
        for f in bm.faces[n0:]:
            f.material_index = idx[f.material_index] if idx else 0; f[fl] = r['lm']; f[ol] = oi
    bm.to_mesh(me); bm.free()
    for m in mats: me.materials.append(bpy.data.materials[m])
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    for r in objs: bpy.data.objects.remove(r['obj'], do_unlink=True)
    return ob


def _atlas(ob, res, pad=3):
    """Build the LM UV layer: planar charts from coplanar connected faces (explicit charts keep their metre coords), skyline-packed."""
    me = ob.data; bm = bmesh.new(); bm.from_mesh(me); bm.normal_update(); bm.faces.ensure_lookup_table()
    lml = bm.loops.layers.uv['LM']; cl = bm.faces.layers.int['chart']; fl = bm.faces.layers.float['lmf']; ol = bm.faces.layers.int['src']
    charts = []; seen = set(); explicit = {}
    for f in bm.faces:
        if f[fl] <= 0 or f.index in seen: continue
        if f[cl] > 0:
            explicit.setdefault((f[ol], f[cl]), []).append(f); seen.add(f.index); continue
        grp = [f]; seen.add(f.index); st = [f]; n = f.normal
        while st:
            g = st.pop()
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen and h[cl] == 0 and h[fl] == f[fl] and h.normal.dot(n) > 0.9999:
                        seen.add(h.index); grp.append(h); st.append(h)
        t, b = _frame(n)
        for g in grp:
            for l in g.loops: l[lml].uv = (l.vert.co.dot(t), l.vert.co.dot(b))
        charts.append(grp)
    charts += list(explicit.values())
    info = []
    for grp in charts:
        us = [l[lml].uv.x for g in grp for l in g.loops]; vs = [l[lml].uv.y for g in grp for l in g.loops]
        info.append((min(us), min(vs), max(us) - min(us), max(vs) - min(vs), grp[0][fl]))
    area = sum(w * h * f * f for _, _, w, h, f in info)
    if not info: bm.free(); return 0
    lo, hi = 1.0, math.sqrt(res * res / area) * 1.05; best = None
    for it in range(14):
        T = (lo + hi) / 2
        rects = [(max(2, math.ceil(w * T * f)) + 2 * pad, max(2, math.ceil(h * T * f)) + 2 * pad) for _, _, w, h, f in info]
        pk = _skyline_pack(rects, res, res) if sum(a * b for a, b in rects) <= res * res else None
        if pk: best = (T, pk); lo = T
        else: hi = T
        if hi - lo < 0.01 * lo: break
    T, pk = best
    for (u0, v0, w, h, f), grp, (px, py, rot) in zip(info, charts, pk):
        for g in grp:
            for l in g.loops:
                u = (l[lml].uv.x - u0) * T * f; v = (l[lml].uv.y - v0) * T * f
                if rot: u, v = v, u
                l[lml].uv = ((px + pad + u) / res, (py + pad + v) / res)
    for f in bm.faces:
        if f[fl] <= 0:
            for l in f.loops: l[lml].uv = (0, 0)
    bm.to_mesh(me); bm.free()
    return T


def finalize(res=None):
    """Join objects per zone into '<zone>_lit' (lightmapped) and '<zone>_fx' (everything else). Returns {zone: texels per metre}."""
    res = res or {}
    dens = {}
    for z in ZONES:
        lit = [r for r in REG if r['zone'] == z and r['lm'] > 0]
        fx = [r for r in REG if r['zone'] == z and r['lm'] <= 0]
        if lit:
            ob = _join(lit, z + '_lit'); t0 = time.time(); dens[z] = _atlas(ob, res.get(z, 2048))
            print(f'[atlas] {z}: {len(ob.data.polygons)} faces, {dens[z]:.1f} texels/m ({100 / dens[z]:.1f} cm), {time.time() - t0:.1f}s')
        if fx:
            ob = _join(fx, z + '_fx')
            # hide from the bake what must not block or bounce light
            ob.hide_render = False
    REG.clear()
    return dens


# ---------------------------------------------------------------------------------------------------------------------
# world, bake, export

def sun_dir(az_deg, el_deg):
    """Unit vector pointing TO the sun. az: compass degrees (0 = north/+Y, 90 = east/+X)."""
    a, e = math.radians(az_deg), math.radians(el_deg)
    return Vector((math.sin(a) * math.cos(e), math.cos(a) * math.cos(e), math.sin(e)))


def setup_world(az=230, el=32, sun_strength=3.0, sky_strength=1.0, sun_angle=1.2, sun_color=(1.0, 0.86, 0.70), air=1.0, aerosol=1.0, sky_sat=1.0):
    """Sky texture without disc for ambient + a separate sun lamp (strength and softness under our control)."""
    sc = bpy.context.scene
    w = bpy.data.worlds.new('World'); sc.world = w; w.use_nodes = True; nt = w.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputWorld'); bg = nt.nodes.new('ShaderNodeBackground'); sky = nt.nodes.new('ShaderNodeTexSky')
    sky.sky_type = 'MULTIPLE_SCATTERING'; sky.sun_disc = False; sky.sun_elevation = math.radians(el); sky.sun_rotation = math.radians(az)
    sky.air_density = air; sky.aerosol_density = aerosol
    bg.inputs['Strength'].default_value = sky_strength
    hs = nt.nodes.new('ShaderNodeHueSaturation'); hs.inputs['Saturation'].default_value = sky_sat      # a fully saturated sky turns every shaded wall blue
    nt.links.new(sky.outputs[0], hs.inputs['Color']); nt.links.new(hs.outputs[0], bg.inputs['Color']); nt.links.new(bg.outputs[0], out.inputs[0])
    d = sun_dir(az, el)
    ld = bpy.data.lights.new('Sun', 'SUN'); ld.energy = sun_strength; ld.angle = math.radians(sun_angle); ld.color = sun_color
    lo = bpy.data.objects.new('Sun', ld); sc.collection.objects.link(lo)
    lo.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    return lo


def spot(name, pos, target, watts, angle_deg=40, blend=0.6, color=(1.0, 0.86, 0.72), radius=0.05):
    ld = bpy.data.lights.new(name, 'SPOT'); ld.energy = watts; ld.spot_size = math.radians(angle_deg); ld.spot_blend = blend; ld.color = color; ld.shadow_soft_size = radius
    lo = bpy.data.objects.new(name, ld); bpy.context.scene.collection.objects.link(lo); lo.location = pos
    lo.rotation_euler = (Vector(pos) - Vector(target)).to_track_quat('Z', 'Y').to_euler()
    return lo


def area(name, pos, target, watts, size=(1, 1), color=(1, 1, 1)):
    ld = bpy.data.lights.new(name, 'AREA'); ld.energy = watts; ld.shape = 'RECTANGLE'; ld.size, ld.size_y = size; ld.color = color
    lo = bpy.data.objects.new(name, ld); bpy.context.scene.collection.objects.link(lo); lo.location = pos
    lo.rotation_euler = (Vector(pos) - Vector(target)).to_track_quat('Z', 'Y').to_euler()
    return lo


def point(name, pos, watts, color=(1.0, 0.86, 0.72), radius=0.1):
    ld = bpy.data.lights.new(name, 'POINT'); ld.energy = watts; ld.color = color; ld.shadow_soft_size = radius
    lo = bpy.data.objects.new(name, ld); bpy.context.scene.collection.objects.link(lo); lo.location = pos
    return lo


def setup_cycles(samples=256, denoise=True, gpu=True, bounces=8):
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; c = sc.cycles
    if gpu:
        p = bpy.context.preferences.addons['cycles'].preferences; p.compute_device_type = 'METAL'; p.get_devices()
        for d in p.devices: d.use = d.type == 'METAL'
        c.device = 'GPU'
    c.samples = samples; c.use_adaptive_sampling = False; c.use_denoising = denoise
    c.max_bounces = bounces; c.diffuse_bounces = bounces; c.glossy_bounces = 2; c.transmission_bounces = 4; c.transparent_max_bounces = 8
    c.sample_clamp_indirect = 12; c.caustics_reflective = False; c.caustics_refractive = False
    sc.view_settings.view_transform = 'Standard'


def bake_zone(zone, res, outdir, margin=3):
    """Bake diffuse direct+indirect (no albedo) of '<zone>_lit' into a float image; saves <outdir>/lm_<zone>.npy (H, W, 3 float32, row 0 = bottom)."""
    import numpy as np
    ob = bpy.data.objects[zone + '_lit']
    img = bpy.data.images.new('lm_' + zone, res, res, alpha=True, float_buffer=True); img.colorspace_settings.name = 'Non-Color'
    # every material of the object needs its own active image node -> per-zone material copies
    for i, m in enumerate(ob.data.materials):
        c = bpy.data.materials.get(m.name + '@' + zone) or m.copy(); c.name = m.name.split('@')[0] + '@' + zone; ob.data.materials[i] = c
        n = c.node_tree.nodes.get('BAKE') or c.node_tree.nodes.new('ShaderNodeTexImage'); n.name = 'BAKE'; n.image = img
        uvn = c.node_tree.nodes.get('BAKEUV') or c.node_tree.nodes.new('ShaderNodeUVMap'); uvn.name = 'BAKEUV'; uvn.uv_map = 'LM'
        c.node_tree.links.new(uvn.outputs[0], n.inputs[0])
        for nn in c.node_tree.nodes: nn.select = False
        n.select = True; c.node_tree.nodes.active = n
    ob.data.uv_layers.active = ob.data.uv_layers['LM']
    for o in bpy.context.scene.objects: o.select_set(False)
    ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bk = bpy.context.scene.render.bake
    bk.use_pass_direct = True; bk.use_pass_indirect = True; bk.use_pass_color = False; bk.margin = margin; bk.margin_type = 'EXTEND'; bk.target = 'IMAGE_TEXTURES'; bk.use_clear = True
    t0 = time.time()
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, margin=margin, margin_type='EXTEND', use_clear=True, target='IMAGE_TEXTURES')
    a = np.empty(res * res * 4, dtype=np.float32); img.pixels.foreach_get(a); a = a.reshape(res, res, 4); valid = a[:, :, 3] > 0.5; a = a[:, :, :3].copy()
    a = np.nan_to_num(a, nan=0.0, posinf=0.0, neginf=0.0)
    os.makedirs(outdir, exist_ok=True); np.save(os.path.join(outdir, f'lm_{zone}_raw.npy'), a); np.save(os.path.join(outdir, f'lm_{zone}_valid.npy'), valid)
    print(f'[bake] {zone} {res}px {bpy.context.scene.cycles.samples}spp {time.time() - t0:.0f}s  mean={a.mean():.3f} p99={np.percentile(a, 99):.2f} max={a.max():.1f}')
    ob.data.uv_layers.active = ob.data.uv_layers['UVMap']
    return a


def export_glb(path):
    """GLB with two UV sets and material *names* only (textures are bound at runtime from the material table)."""
    sel = [o for o in bpy.context.scene.objects if o.type == 'MESH' and (o.name.endswith('_lit') or o.name.endswith('_fx'))]
    for o in bpy.context.scene.objects: o.select_set(o in sel)
    stub = {}
    for o in sel:
        o.data.uv_layers.active = o.data.uv_layers['UVMap']
        for i, m in enumerate(o.data.materials):
            if m.name not in stub:
                name = m.name; m.name = name + '__bake'; stub[name] = bpy.data.materials.new(name)
            o.data.materials[i] = stub.get(m.name.replace('__bake', ''), stub.get(m.name))
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_materials='EXPORT', export_yup=True,
                              export_texcoords=True, export_normals=True, export_cameras=False, export_lights=False, export_apply=False,
                              export_attributes=False, export_extras=False, export_animations=False)
    print('[glb]', path, os.path.getsize(path) // 1024, 'KB')


def args():
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    d = {}
    i = 0
    while i < len(a):
        if a[i].startswith('--'):
            if i + 1 < len(a) and not a[i + 1].startswith('--'): d[a[i][2:]] = a[i + 1]; i += 2
            else: d[a[i][2:]] = True; i += 1
        else: i += 1
    return d


def preview(path, cam_pos, target, lens=24, res=(1280, 800), samples=48, exposure=0.0, view='AgX'):
    """Quick Cycles render for visual checks while modelling (not used at runtime)."""
    sc = bpy.context.scene
    cd = bpy.data.cameras.new('pv'); cd.lens = lens; cd.clip_start = 0.05; cd.clip_end = 2000
    co = bpy.data.objects.new('pv', cd); sc.collection.objects.link(co); co.location = cam_pos
    co.rotation_euler = (Vector(cam_pos) - Vector(target)).to_track_quat('Z', 'Y').to_euler()
    sc.camera = co; sc.render.resolution_x, sc.render.resolution_y = res; sc.render.filepath = path
    old = sc.cycles.samples; sc.cycles.samples = samples; sc.view_settings.view_transform = view; sc.view_settings.exposure = exposure
    sc.render.image_settings.file_format = 'PNG'
    bpy.ops.render.render(write_still=True)
    sc.cycles.samples = old; bpy.data.objects.remove(co)


# ---------------------------------------------------------------------------------------------------------------------
# more shapes

def obox(name, center, size, rot, mat, zone='ext', lm=1.0, skip='', **kw):
    """Box of `size` centred at `center`, rotated by XYZ euler degrees about its centre."""
    c = Vector(center); h = Vector(size) / 2
    ob = box(name, tuple(c - h), tuple(c + h), mat, zone, lm, skip=skip, **kw)
    return xform(ob, rot=rot, pivot=center)


def plate(name, center, normal, radius, mat, zone='ext', lm=1.0, segs=10, thick=0.02, squash=1.0):
    """Thin double-sided disc (two n-gons back to back) facing `normal`; squash < 1 makes it elliptical."""
    n = Vector(normal).normalized(); t = n.orthogonal().normalized(); b = n.cross(t); c = Vector(center)
    ring = [c + (t * math.cos(2 * math.pi * i / segs) + b * math.sin(2 * math.pi * i / segs) * squash) * radius for i in range(segs)]
    v = [tuple(p + n * thick / 2) for p in ring] + [tuple(p - n * thick / 2) for p in ring]
    return mesh(name, v, [tuple(range(segs)), tuple(range(2 * segs - 1, segs - 1, -1))], mat, zone, lm)


def rod(name, a, b, r, mat, zone='ext', lm=0.0, segs=8, caps=True):
    """Cylinder between two arbitrary points (fixtures, rails, wires). Not lightmapped by default."""
    a, b = Vector(a), Vector(b); d = (b - a).normalized(); t = d.orthogonal().normalized(); u = d.cross(t)
    v = []; f = []
    for i in range(segs):
        o = (t * math.cos(2 * math.pi * i / segs) + u * math.sin(2 * math.pi * i / segs)) * r
        v.append(tuple(a + o)); v.append(tuple(b + o))
    for i in range(segs):
        j = (i + 1) % segs; f.append((2 * i, 2 * j, 2 * j + 1, 2 * i + 1))
    if caps: f += [tuple(2 * i for i in range(segs))[::-1], tuple(2 * i + 1 for i in range(segs))]
    return mesh(name, v, f, mat, zone, lm, smooth=False, outward=tuple((a + b) / 2))


def bar(name, a, b, w, h, mat, zone='ext', lm=1.0, **kw):
    """Rectangular bar from point a to point b (w = horizontal width, h = height). For sloped handrails, stringers, beams."""
    a, b = Vector(a), Vector(b); d = (b - a).normalized()
    side = Vector((0, 0, 1)).cross(d); side = side.normalized() if side.length > 1e-6 else Vector((1, 0, 0)); up = d.cross(side).normalized()
    v = []
    for p in (a, b):
        for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1)): v.append(tuple(p + side * sx * w / 2 + up * sz * h / 2))
    f = [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7), (0, 3, 2, 1), (4, 5, 6, 7)]
    return mesh(name, v, f, mat, zone, lm, outward=tuple((a + b) / 2), **kw)


# ---------------------------------------------------------------------------------------------------------------------
# lightmap post: fill gutters, denoise (OIDN via the compositor), encode

def dilate(a, valid, iters=96, smooth=8):
    """Fill the gutters between charts from their neighbours (8-connected average), then blur the filled part so the
    denoiser does not see streaks of replicated noise along chart borders."""
    import numpy as np
    a = a.copy(); v0 = valid.copy(); valid = valid.copy()
    sh = [(dy, dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx]
    for _ in range(iters):
        if valid.all(): break
        acc = np.zeros_like(a); cnt = np.zeros(valid.shape, np.float32)
        for dy, dx in sh:
            v = np.roll(valid, (dy, dx), (0, 1)); acc += np.roll(a, (dy, dx), (0, 1)) * v[..., None]; cnt += v
        fill = (~valid) & (cnt > 0); a[fill] = acc[fill] / cnt[fill][:, None]; valid |= fill
    for _ in range(smooth):
        acc = a.copy()
        for dy, dx in sh: acc += np.roll(a, (dy, dx), (0, 1))
        a[~v0] = (acc / 9.0)[~v0]
    return a


def denoise(a):
    """OIDN on a float RGB array (H, W, 3) using Blender's compositor in a scratch scene."""
    import numpy as np, tempfile
    H, W, _ = a.shape; cur = bpy.context.window.scene if bpy.context.window else bpy.context.scene
    sc = bpy.data.scenes.new('denoise')
    img = bpy.data.images.new('dn_in', W, H, alpha=False, float_buffer=True); img.colorspace_settings.name = 'Non-Color'
    px = np.ones((H, W, 4), np.float32); px[:, :, :3] = a; img.pixels.foreach_set(px.ravel())
    tree = bpy.data.node_groups.new('DN', 'CompositorNodeTree'); sc.compositing_node_group = tree
    n = tree.nodes.new('CompositorNodeImage'); n.image = img; d = tree.nodes.new('CompositorNodeDenoise')
    tree.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor'); o = tree.nodes.new('NodeGroupOutput')
    tree.links.new(n.outputs[0], d.inputs[0]); tree.links.new(d.outputs[0], o.inputs[0])
    for i in d.inputs:
        if i.name == 'HDR': i.default_value = True
        if i.name == 'Quality':
            try: i.default_value = 'High'
            except Exception as e: print('[denoise] quality:', e)
    cam = bpy.data.objects.new('dn_cam', bpy.data.cameras.new('dn_cam')); sc.collection.objects.link(cam); sc.camera = cam
    sc.render.engine = 'BLENDER_WORKBENCH'; sc.render.resolution_x = W; sc.render.resolution_y = H; sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'OPEN_EXR'; sc.render.image_settings.color_depth = '32'
    tmp = os.path.join(tempfile.gettempdir(), 'museum_dn.exr'); sc.render.filepath = tmp; sc.view_settings.view_transform = 'Raw'
    bpy.ops.render.render(write_still=True, scene=sc.name)
    r = bpy.data.images.load(tmp); r.colorspace_settings.name = 'Non-Color'
    b = np.empty(W * H * 4, np.float32); r.pixels.foreach_get(b); b = b.reshape(H, W, 4)[:, :, :3].copy()
    bpy.data.images.remove(r); bpy.data.images.remove(img); bpy.data.scenes.remove(sc); bpy.data.node_groups.remove(tree)
    return b


def _box(a, r):
    """(2r+1)^2 box mean with wrap-around (numpy only)."""
    import numpy as np
    out = np.zeros_like(a)
    for d in range(-r, r + 1): out += np.roll(a, d, 0)
    a2 = out; out = np.zeros_like(a)
    for d in range(-r, r + 1): out += np.roll(a2, d, 1)
    return out / float((2 * r + 1) ** 2)


def clean_residual(raw, dn, valid, thresh=0.02, keep=0.6):
    """OIDN leaves path-tracing grain untouched on thin or diagonal charts (stair stringers, bench bases). Where the denoised map
    still carries most of the raw map's high-frequency energy, replace it by a small chart-aware Gaussian of itself."""
    import numpy as np
    def energy(x):
        l = x.mean(2); m = _box(l, 1); return _box(np.abs(l - m) / (m + 1e-3), 3)
    e_dn, e_raw = energy(dn), energy(raw)
    mask = valid & (e_dn > thresh) & (e_dn > keep * e_raw)
    grow = _box(mask.astype(np.float32), 2) > 0.02; mask = grow & valid
    acc = np.zeros_like(dn); wsum = np.zeros(dn.shape[:2], np.float32); lum = dn.mean(2)
    for dy in range(-3, 4):
        for dx in range(-3, 4):
            g = math.exp(-(dx * dx + dy * dy) / (2 * 1.8 ** 2))
            nb = np.roll(dn, (dy, dx), (0, 1)); nl = np.roll(lum, (dy, dx), (0, 1)); nv = np.roll(valid, (dy, dx), (0, 1))
            w = g * nv * (np.abs(nl - lum) < 0.22 * lum + 0.01)        # range weight: never average across a shadow edge or into another chart
            acc += nb * w[..., None]; wsum += w
    out = dn.copy(); sel = mask & (wsum > 0); out[sel] = acc[sel] / wsum[sel][:, None]
    print('[clean] %.1f%% of valid texels smoothed' % (100.0 * sel.sum() / max(1, valid.sum())))
    return out


def encode_lightmap(a, path_png, rng):
    """sRGB-encode a / rng with a little dither into an 8-bit PNG (row 0 of `a` = bottom, as Blender stores it)."""
    import numpy as np
    x = np.clip(a / rng, 0, 1); s = np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)
    noise = (np.random.default_rng(7).random(s.shape[:2], dtype=np.float32) - 0.5)[..., None] / 255.0
    s = np.clip(s + noise, 0, 1)
    H, W, _ = a.shape; img = bpy.data.images.new('enc', W, H, alpha=False); img.colorspace_settings.name = 'Non-Color'
    px = np.ones((H, W, 4), np.float32); px[:, :, :3] = s; img.pixels.foreach_set(px.ravel())
    img.filepath_raw = path_png; img.file_format = 'PNG'; img.save(); bpy.data.images.remove(img)
