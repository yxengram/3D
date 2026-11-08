"""Make a real-time version of a Poly Haven tree with Blender (run headless).

Poly Haven's scanned trees have millions of triangles. This keeps the look but thins them out:
  - leaves are individual little meshes ("islands"): a random subset is kept, each one decimated
    and scaled up a little so the canopy stays dense,
  - branches and trunk are decimated.

Usage:
  blender -b -P tools/reduce_tree.py -- <source.gltf> <out.gltf> <leaf_tris> <branch_tris> <trunk_tris> [leaf_scale]
"""
import sys

import bpy
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1:]
src, out = argv[0], argv[1]
budget = {"leaves": int(argv[2]), "branch": int(argv[3]), "trunk": int(argv[4])}
leaf_scale = float(argv[5]) if len(argv) > 5 else 0.0  # 0 = automatic

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
obj = next(o for o in bpy.context.scene.objects if o.type == "MESH")
bpy.context.view_layer.objects.active = obj
obj.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.separate(type="MATERIAL")
bpy.ops.object.mode_set(mode="OBJECT")


def kind(o):
    name = o.active_material.name.lower()
    if "lea" in name:
        return "leaves"
    if "branch" in name:
        return "branch"
    return "trunk"


def tri_count(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def decimate(o, target):
    tris = tri_count(o)
    if tris <= target:
        return
    m = o.modifiers.new("dec", "DECIMATE")
    m.ratio = target / tris
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier=m.name)


def thin_leaves(o, target):
    me = o.data
    nv, ne = len(me.vertices), len(me.edges)
    co = np.empty(nv * 3, np.float32)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    ev = np.empty(ne * 2, np.int64)
    me.edges.foreach_get("vertices", ev)
    a, b = ev[0::2], ev[1::2]
    # connected components by repeated min-label propagation (leaves are tiny, so this converges fast)
    labels = np.arange(nv)
    for _ in range(200):
        m = np.minimum(labels[a], labels[b])
        new = labels.copy()
        np.minimum.at(new, a, m)
        np.minimum.at(new, b, m)
        new = new[new]
        if np.array_equal(new, labels):
            break
        labels = new
    ids, inv = np.unique(labels, return_inverse=True)
    n_islands = len(ids)
    tris = tri_count(o)
    per = tris / n_islands
    # after decimation a leaf keeps ~40% of its triangles (at least 2)
    per_after = max(2.0, per * 0.4)
    keep = min(1.0, target / (n_islands * per_after))
    rng = np.random.default_rng(7)
    kept = rng.random(n_islands) < keep
    scale = leaf_scale or min(1.9, keep ** -0.22)
    cnt = np.bincount(inv, minlength=n_islands).astype(np.float32)
    cen = np.stack([np.bincount(inv, weights=co[:, k], minlength=n_islands) for k in range(3)], 1) / cnt[:, None]
    c = cen[inv]
    co = c + (co - c) * scale
    me.vertices.foreach_set("co", co.ravel())
    sel = (~kept[inv]).astype(bool)
    me.vertices.foreach_set("select", sel)
    print(f"  leaves: {n_islands} islands, {per:.1f} tris each, keep {keep:.3f}, scale {scale:.2f}")
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_mode(type="VERT")
    bpy.ops.object.mode_set(mode="OBJECT")
    me.vertices.foreach_set("select", sel)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.delete(type="VERT")
    bpy.ops.object.mode_set(mode="OBJECT")
    decimate(o, target)


parts = [o for o in bpy.context.scene.objects if o.type == "MESH"]
for o in parts:
    k = kind(o)
    before = tri_count(o)
    if k == "leaves":
        thin_leaves(o, budget[k])
    else:
        decimate(o, budget[k])
    print(f"  {o.active_material.name}: {before} -> {tri_count(o)} tris")

for o in parts:
    o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
bpy.ops.export_scene.gltf(
    filepath=out,
    export_format="GLTF_SEPARATE",
    export_texture_dir="textures",
    export_image_format="JPEG",
    export_jpeg_quality=88,
    export_yup=True,
    export_apply=True,
    export_animations=False,
    export_extras=False,
)
print("written", out)
