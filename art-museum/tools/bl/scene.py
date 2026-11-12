# The museum. Metres, Z up, X east, Y north. Lobby interior X[-11,11] Y[0,15.4]; gallery interior X[11.4,37.4] Y[1,15]; plaza to the south.
import math, random, json, os
import lib as L
from lib import box, quad, plane_z, picture, prism, cyl, obox, plate, rod, bar, mesh, walk, block
from mathutils import Vector

M = 2.2                      # structural module
LX0, LX1, LY0, LY1 = -11.0, 11.0, 0.0, 15.4
LH, LS = 10.0, 10.8          # lobby: underside of ribs, underside of slab
GX0, GX1, GY0, GY1, GH = 11.4, 37.4, 1.0, 15.0, 5.6
PY0, PY1, PH = 5.7, 9.7, 3.6  # portal lobby -> gallery
SKY = (-4.4, 6.6, 4.4, 11.0)  # skylight opening in the lobby roof
SUN_AZ, SUN_EL = 112.0, 30.0
META = json.load(open(os.path.join(L.ROOT, 'assets', 'art', 'paintings.json'))) if os.path.exists(os.path.join(L.ROOT, 'assets', 'art', 'paintings.json')) else []
LABEL_GRID = (5, 4)          # label atlas cells (columns, rows); cell index = order in HANG + m01 last
SPOTS = []                   # (name, pos, target, watts, angle) collected while hanging pictures


def bench(name, x0, y0, x1, y1, zone):
    box(name + '_base', (x0 + 0.04, y0 + 0.04, 0), (x1 - 0.04, y1 - 0.04, 0.37), 'oak', zone, skip='z- z+')
    box(name + '_seat', (x0, y0, 0.37), (x1, y1, 0.46), 'leather', zone)
    block(x0, y0, x1, y1, 0.25)


# ---------------------------------------------------------------------------------------------------------------------
def lobby():
    Z = 'lobby'
    plane_z('lob_floor', LX0, LY0, LX1, LY1, 0, 'terrazzo', Z)
    # walls (inner faces). West: stone, north: slats below the mezzanine + plaster above, east: plaster with the portal
    box('lob_wW', (LX0 - 0.4, LY0, 0), (LX0, LY1, LS), 'travertine', Z, only='x+ y-')
    box('lob_wN_lo', (LX0, LY1, 0), (LX1, LY1 + 0.4, 4.2), 'slats', Z, only='y-')
    box('lob_wN_hi', (LX0, LY1, 4.6), (LX1, LY1 + 0.4, LS), 'plaster', Z, only='y-')
    box('lob_wE_s', (LX1, LY0, 0), (LX1 + 0.4, PY0, LS), 'plaster', Z, only='x- y-')
    box('lob_wE_n', (LX1, PY1, 0), (LX1 + 0.4, LY1, LS), 'plaster', Z, only='x-')
    box('lob_wE_top', (LX1, PY0, PH), (LX1 + 0.4, PY1, LS), 'plaster', Z, only='x-')
    # portal lining (oak) + threshold
    quad('portal_js', [(LX1, PY0, 0), (LX1 + 0.4, PY0, 0), (LX1 + 0.4, PY0, PH), (LX1, PY0, PH)], 'oak', Z, outward=(LX1 + 0.2, PY0 - 1, 1), uvrot=True)
    quad('portal_jn', [(LX1, PY1, 0), (LX1 + 0.4, PY1, 0), (LX1 + 0.4, PY1, PH), (LX1, PY1, PH)], 'oak', Z, outward=(LX1 + 0.2, PY1 + 1, 1), uvrot=True)
    quad('portal_top', [(LX1, PY0, PH), (LX1 + 0.4, PY0, PH), (LX1 + 0.4, PY1, PH), (LX1, PY1, PH)], 'oak', Z, outward=(LX1 + 0.2, 7.7, PH + 1))
    plane_z('portal_floor', LX1, PY0, LX1 + 0.4, PY1, 0, 'oak', Z)

    # coffered ceiling: ribs along Y continuous, ribs along X in segments between them
    xs = [LX0 + M * k for k in range(1, 10)]; ys = [M * j for j in range(1, 7)]
    for k, x in enumerate(xs): box('rib_y%d' % k, (x - 0.15, 0.15, LH), (x + 0.15, LY1, LS), 'concrete', Z, skip='y- y+')
    xe = [LX0] + xs + [LX1]
    for j, y in enumerate(ys):
        for k in range(10):
            a = xe[k] + (0.15 if k > 0 else 0); b = xe[k + 1] - (0.15 if k < 9 else 0)
            box('rib_x%d_%d' % (j, k), (a, y - 0.15, LH), (b, y + 0.15, LS), 'concrete', Z, skip='x- x+')
    box('rib_head', (LX0 - 0.4, -0.15, LH), (LX1 + 0.4, 0.15, LS), 'concrete', Z, skip='x- x+ z+')
    # slab underside (4 pieces around the skylight) + reveals of the opening
    sx0, sy0, sx1, sy1 = SKY
    for n, (a, b, c, d) in enumerate([(LX0, 0.15, LX1, sy0), (LX0, sy1, LX1, LY1), (LX0, sy0, sx0, sy1), (sx1, sy0, LX1, sy1)]):
        plane_z('slab_u%d' % n, a, b, c, d, LS, 'concrete', Z, up=False, lm=0.8)
    cz = LS + 0.25
    quad('sky_rs', [(sx0, sy0, LS), (sx1, sy0, LS), (sx1, sy0, LS + 0.5), (sx0, sy0, LS + 0.5)], 'concrete', Z, outward=(0, sy0 - 1, cz))
    quad('sky_rn', [(sx0, sy1, LS), (sx1, sy1, LS), (sx1, sy1, LS + 0.5), (sx0, sy1, LS + 0.5)], 'concrete', Z, outward=(0, sy1 + 1, cz))
    quad('sky_rw', [(sx0, sy0, LS), (sx0, sy1, LS), (sx0, sy1, LS + 0.5), (sx0, sy0, LS + 0.5)], 'concrete', Z, outward=(sx0 - 1, 8, cz))
    quad('sky_re', [(sx1, sy0, LS), (sx1, sy1, LS), (sx1, sy1, LS + 0.5), (sx1, sy0, LS + 0.5)], 'concrete', Z, outward=(sx1 + 1, 8, cz))
    plane_z('sky_glass', sx0, sy0, sx1, sy1, LS + 0.5, 'glass', Z)

    # recessed downlights in the coffers (checkerboard, none under the skylight): the lobby's artificial fill light
    for i in range(10):
        for j in range(7):
            cx, cy = LX0 + M * (i + 0.5), M * (j + 0.5)
            if (i + j) % 2 or (sx0 < cx < sx1 and sy0 < cy < sy1): continue
            cyl('cdl%d_%d' % (i, j), cx, cy, LS - 0.04, LS, 0.1, 'lamp', Z, segs=10, caps='b')
            SPOTS.append(('cdl%d_%d' % (i, j), (cx, cy, LS - 0.12), (cx, cy, 0), 400, 100, (1.0, 0.94, 0.86)))
    # south curtain wall: bronze mullions/transoms, glass, open doorway in the two middle bays
    for k in range(11):
        x = LX0 + M * k
        box('mull%d' % k, (x - 0.04, -0.1, 3.3 if k == 5 else 0), (x + 0.04, 0.1, LH), 'bronze', Z, skip='z+ z-' if k != 5 else 'z+')
    for n, z in enumerate((3.3, 6.65)): box('transom%d' % n, (LX0, -0.07, z - 0.04), (LX1, 0.07, z + 0.04), 'bronze', Z, skip='x- x+')
    box('sill_w', (LX0, -0.07, 0), (-M, 0.07, 0.06), 'bronze', Z, skip='z- x-'); box('sill_e', (M, -0.07, 0), (LX1, 0.07, 0.06), 'bronze', Z, skip='z- x+')
    box('door_jw', (-M - 0.1, -0.25, 0), (-M + 0.1, 0.25, 3.22), 'bronze', Z, skip='z- z+'); box('door_je', (M - 0.1, -0.25, 0), (M + 0.1, 0.25, 3.22), 'bronze', Z, skip='z- z+')
    box('door_head', (-M - 0.1, -0.25, 3.22), (M + 0.1, 0.25, 3.42), 'bronze', Z)
    for n, (a, b, c) in enumerate([(LX0, -M, 0), (M, LX1, 0), (-M, M, 3.3)]):
        quad('glass%d' % n, [(a, 0, c), (b, 0, c), (b, 0, LH), (a, 0, LH)], 'glass', Z)

    # mezzanine along the north wall, with glass balustrade
    MZ = 4.6; MY = 11.4
    box('mezz', (LX0, MY, MZ - 0.4), (LX1, LY1, MZ), 'concrete', Z, skip='z+ x- x+ y+')
    plane_z('mezz_top', LX0, MY, LX1, LY1, MZ, 'terrazzo', Z, lm=0.5)
    for n, (a, b) in enumerate([(LX0, -2.0), (0.0, LX1)]):
        quad('mezz_gl%d' % n, [(a, MY + 0.02, MZ), (b, MY + 0.02, MZ), (b, MY + 0.02, MZ + 1.08), (a, MY + 0.02, MZ + 1.08)], 'glass_rail', Z)
        box('mezz_rail%d' % n, (a, MY, MZ + 1.08), (b, MY + 0.05, MZ + 1.12), 'bronze', Z, skip='x- x+')
        box('mezz_shoe%d' % n, (a, MY + 0.005, MZ), (b, MY + 0.035, MZ + 0.03), 'bronze', Z, skip='z- x- x+', lm=0.5)
    for n, x in enumerate((-6.6, 6.6)):
        cyl('mezz_col%d' % n, x, MY + 0.45, 0, MZ - 0.4, 0.22, 'concrete', Z, segs=20); block(x - 0.22, MY + 0.23, x + 0.22, MY + 0.67, 0.25)
    for n in range(8):   # downlights under the mezzanine
        x = -9.1 + n * 2.6
        cyl('dl%d' % n, x, 13.4, MZ - 0.43, MZ - 0.4, 0.07, 'lamp', Z, segs=10, caps='b')
        SPOTS.append(('dl%d' % n, (x, 13.4, MZ - 0.52), (x, 13.4, 0), 220, 95, (1.0, 0.90, 0.76)))
    # doors on the slat wall (bronze leaves) and the tapestry above the mezzanine
    for n, x in enumerate((-8.9, 8.9)): box('door%d' % n, (x - 0.6, LY1 - 0.03, 0), (x + 0.6, LY1, 2.4), 'bronze', Z, skip='z- y+')
    picture('m01', (0, LY1, 7.35), 'S', 5.4, 3.6, 'm01', Z, off=0.05)
    picture('m01_label', (2.2, LY1, 1.3), 'S', 0.25, 0.20, 'labels', Z, off=0.008, uvrect=(1 / 5, 0, 2 / 5, 1 / 4), lm=1.5)
    box('m01_rod', (-2.85, LY1 - 0.09, 9.16), (2.85, LY1 - 0.03, 9.21), 'bronze', Z)
    SPOTS.append(('tap_a', (-2.0, 11.2, 9.9), (-1.2, LY1, 7.4), 700, 46, (1.0, 0.90, 0.78))); SPOTS.append(('tap_b', (2.0, 11.2, 9.9), (1.2, LY1, 7.4), 700, 46, (1.0, 0.90, 0.78)))

    # stair to the mezzanine: monolithic concrete flight along X in front of the mezzanine edge, landing at its top
    x0, x1 = -9.5, -2.0; n = 25; r = MZ / 26; t = (x1 - x0) / n; sy0, sy1 = 9.4, 11.4
    prof = [(x0, 0)]
    for i in range(n): prof += [(x0 + i * t, (i + 1) * r), (x0 + (i + 1) * t, (i + 1) * r)]
    prof += [(x1, n * r - 0.55), (x0 + 0.9, 0)]
    prism('stair', prof, 'y', sy0, sy1, 'concrete', Z)
    box('landing', (x1, sy0, MZ - 0.4), (0, sy1, MZ), 'concrete', Z, skip='y+')
    cyl('landing_col', -0.4, sy0 + 0.4, 0, MZ - 0.4, 0.16, 'concrete', Z, segs=16); block(-0.56, sy0 + 0.24, -0.24, sy0 + 0.56, 0.2)
    for s, y in (('s', sy0 + 0.03), ('n', sy1 - 0.03)):
        quad('st_gl' + s, [(x0, y, 0.15), (x1, y, MZ), (x1, y, MZ + 1.08), (x0, y, 1.15)], 'glass_rail', Z)
        bar('st_rail' + s, (x0, y, 1.17), (x1, y, MZ + 1.10), 0.05, 0.04, 'bronze', Z)
        bar('st_shoe' + s, (x0, y, 0.15), (x1, y, MZ), 0.03, 0.04, 'bronze', Z, lm=0.6)
        box('st_post' + s, (x0 - 0.02, y - 0.02, 0), (x0 + 0.02, y + 0.02, 1.19), 'bronze', Z, skip='z-', lm=0.6)
    quad('land_gl_s', [(x1, sy0 + 0.03, MZ), (0, sy0 + 0.03, MZ), (0, sy0 + 0.03, MZ + 1.08), (x1, sy0 + 0.03, MZ + 1.08)], 'glass_rail', Z)
    quad('land_gl_e', [(-0.03, sy0, MZ), (-0.03, sy1, MZ), (-0.03, sy1, MZ + 1.08), (-0.03, sy0, MZ + 1.08)], 'glass_rail', Z)
    box('land_shoe_s', (x1, sy0 + 0.015, MZ), (0, sy0 + 0.045, MZ + 0.03), 'bronze', Z, skip='z-', lm=0.5); box('land_shoe_e', (-0.045, sy0, MZ), (-0.015, sy1, MZ + 0.03), 'bronze', Z, skip='z-', lm=0.5)
    box('land_rail_s', (x1, sy0, MZ + 1.08), (0, sy0 + 0.05, MZ + 1.12), 'bronze', Z); box('land_rail_e', (-0.05, sy0, MZ + 1.08), (0, sy1, MZ + 1.12), 'bronze', Z)
    for n_, y in enumerate((sy0 + 0.2, sy1 - 0.2)): cyl('stan%d' % n_, x0 - 0.45, y, 0, 0.95, 0.025, 'bronze', Z, segs=8, caps='t', lm=0.5)
    bar('stan_rope', (x0 - 0.45, sy0 + 0.2, 0.86), (x0 - 0.45, sy1 - 0.2, 0.86), 0.03, 0.03, 'rope', Z, lm=0.5)
    block(x0 - 0.5, sy0, 0.0, sy1, 0.3)

    # reception desk on the west side, pendants above
    box('desk', (-9.4, 3.2, 0), (-8.5, 8.6, 1.05), 'slats', Z, skip='z- z+')
    box('desk_top', (-9.5, 3.1, 1.05), (-8.4, 8.7, 1.11), 'oak', Z, uvrot=True)
    box('desk_back', (LX0, 3.2, 0), (LX0 + 0.5, 8.6, 0.9), 'oak', Z, skip='z- x-')
    block(LX0, 3.0, -8.4, 8.8, 0.3)
    for n_, y in enumerate((4.3, 5.9, 7.5)):
        cyl('pend%d' % n_, -8.95, y, 2.55, 2.8, 0.1, 'lamp', Z, segs=12, caps='bt')
        rod('pend_w%d' % n_, (-8.95, y, 2.8), (-8.95, y, LH), 0.006, 'fixture', Z, segs=5, caps=False)
        SPOTS.append(('pend%d' % n_, (-8.95, y, 2.5), (-8.95, y, 0), 110, 120, (1.0, 0.78, 0.55)))
    # wall graphics (alpha decals)
    picture('gfx_desk', (LX0, 5.9, 2.75), 'E', 4.0, 0.8, 'gfx_desk', Z, off=0.012)
    picture('gfx_way', (LX1, 12.0, 2.2), 'W', 3.0, 1.0, 'gfx_way', Z, off=0.012)
    # benches
    bench('lb1', 4.4, 2.6, 8.4, 3.3, Z); bench('lb2', 3.0, 13.6, 7.0, 14.3, Z); bench('lb3', -7.5, 13.6, -3.5, 14.3, Z)
    # hanging mobile in the atrium
    rnd = random.Random(11); cols = ['mob_red', 'mob_ochre', 'mob_white', 'mob_red', 'mob_blue', 'mob_ochre', 'mob_white']
    for i in range(38):
        f = i / 37; a = f * math.pi * 4.6 + 0.6; rad = 1.0 + 2.6 * f
        c = (2.2 + rad * math.cos(a), 5.4 + rad * math.sin(a) * 0.9, 4.9 + 4.3 * (1 - f) + rnd.uniform(-0.15, 0.15))
        nrm = Vector((rnd.uniform(-0.7, 0.7), rnd.uniform(-0.7, 0.7), 1.0)); pr = rnd.uniform(0.26, 0.5)
        sq = rnd.uniform(0.55, 1.0)
        if SKY[0] < c[0] < SKY[2] and SKY[1] < c[1] < SKY[3]: c = (min(xs, key=lambda v: abs(v - c[0])), c[1], c[2])   # under the skylight: hang from a rib
        on_rib = min(abs(c[0] - v) for v in xs) < 0.15 or min(abs(c[1] - v) for v in ys) < 0.15
        plate('mob%d' % i, c, nrm, pr, cols[i % len(cols)], Z, lm=0.7, segs=20, squash=sq)
        rod('mobw%d' % i, c, (c[0], c[1], LH if on_rib else LS), 0.004, 'fixture', Z, segs=4, caps=False)
    walk(LX0 + 0.45, 0.5, LX1 - 0.45, LY1 - 0.45); walk(-1.9, -1.0, 1.9, 1.0); walk(LX1 - 0.8, PY0 + 0.45, GX0 + 0.8, PY1 - 0.45)


# ---------------------------------------------------------------------------------------------------------------------
# picture hanging: (id, wall, coordinate along the wall, width, height, frame material)
HANG = [
    ('p01', 'P1W', 6.9, 2.7, 1.8, 'black'), ('p02', 'N', 15.2, 2.4, 1.6, 'oak'), ('p03', 'N', 19.6, 1.2, 1.8, 'black'), ('p04', 'N', 23.2, 1.4, 1.4, 'white'),
    ('p05', 'N', 27.1, 1.8, 1.2, 'oak'), ('p06', 'N', 30.7, 1.0, 1.5, 'black'), ('p07', 'N', 34.2, 1.2, 1.2, 'oak'), ('p08', 'S', 15.2, 2.1, 1.4, 'oak'),
    ('p09', 'S', 19.4, 1.2, 1.8, 'black'), ('p10', 'S', 23.2, 1.5, 1.5, 'white'), ('p11', 'S', 27.1, 1.8, 1.2, 'black'), ('p12', 'S', 30.7, 1.0, 1.5, 'oak'),
    ('p13', 'P1E', 8.0, 2.4, 1.6, 'white'), ('p14', 'S', 34.2, 1.2, 1.2, 'black'), ('p15', 'P2W', 8.0, 1.2, 1.8, 'oak'), ('p16', 'E', 8.0, 3.0, 2.0, 'black'),
]
P1X, P2X, PT = 17.0, 27.0, 0.5   # partitions: west face x, thickness
WALLS = {  # wall -> (facing, plane coordinate, axis along the wall)
    'N': ('S', GY1), 'S': ('N', GY0), 'E': ('W', GX1), 'W': ('E', GX0), 'P1W': ('W', P1X), 'P1E': ('E', P1X + PT), 'P2W': ('W', P2X), 'P2E': ('E', P2X + PT),
}
NRM = {'N': Vector((0, 1, 0)), 'S': Vector((0, -1, 0)), 'E': Vector((1, 0, 0)), 'W': Vector((-1, 0, 0))}


def hang(idx, pid, wall, s, w, h, frame, zone='gallery', zc=1.56, track_z=5.12, spot_w=560.0):
    facing, plane = WALLS[wall]; n = NRM[facing]; t, up = L._frame(n)
    c = Vector((s, plane, zc)) if facing in 'NS' else Vector((plane, s, zc))
    picture(pid, tuple(c), facing, w, h, pid, zone, off=0.045)
    fw, fd = 0.035, 0.06
    def fbox(name, u0, u1, v0, v1, rot=False):
        a = c + t * u0 + up * v0; b = c + t * u1 + up * v1 + n * fd
        box(name, tuple(a), tuple(b), frame, zone, lm=0.6, skip={'N': 'y-', 'S': 'y+', 'E': 'x-', 'W': 'x+'}[facing], uvrot=rot)
    fbox(pid + '_fl', -w / 2 - fw, -w / 2, -h / 2 - fw, h / 2 + fw, True); fbox(pid + '_fr', w / 2, w / 2 + fw, -h / 2 - fw, h / 2 + fw, True)
    fbox(pid + '_ft', -w / 2, w / 2, h / 2, h / 2 + fw); fbox(pid + '_fb', -w / 2, w / 2, -h / 2 - fw, -h / 2)
    # label to the viewer's right
    gx, gy = LABEL_GRID; cx, cy = idx % gx, idx // gx
    lc = c + t * (w / 2 + 0.34) + up * (1.22 - zc)
    picture(pid + '_label', tuple(lc), facing, 0.25, 0.20, 'labels', zone, off=0.008, uvrect=(cx / gx, 1 - (cy + 1) / gy, (cx + 1) / gx, 1 - cy / gy), lm=1.5)
    # spots on the track 2.2 m in front of the wall
    k = 2 if w >= 2.3 else 1; dist = math.hypot(2.2, track_z - zc); diag = math.hypot(w / k, h) / 2
    ang = min(70, math.degrees(2 * math.atan(diag / dist)) * 1.15 + 5)
    for j in range(k):
        o = (j - (k - 1) / 2) * w / k
        p = c + n * 2.2 + t * o; p.z = track_z; tg = c + t * o * 0.8
        d = (tg - p).normalized()
        SPOTS.append(('spot_%s_%d' % (pid, j), tuple(p + d * 0.25), tuple(tg), spot_w * (w * h / k) ** 0.5 / 1.3, ang, (1.0, 0.94, 0.86)))   # lamp sits just outside the housing mouth
        rod('fx_%s_%d' % (pid, j), tuple(p + Vector((0, 0, 0.06))), tuple(p + d * 0.2), 0.045, 'fixture', zone, segs=8)
        rod('fxs_%s_%d' % (pid, j), tuple(p + Vector((0, 0, 0.06))), tuple(p + Vector((0, 0, 0.1))), 0.012, 'fixture', zone, segs=4, caps=False)


def gallery():
    Z = 'gallery'
    plane_z('gal_floor', GX0, GY0, GX1, GY1, 0, 'parquet', Z)
    box('gal_wN', (GX0, GY1, 0), (GX1, GY1 + 0.4, GH), 'plaster', Z, only='y-'); box('gal_wS', (GX0, GY0 - 0.4, 0), (GX1, GY0, GH), 'plaster', Z, only='y+')
    box('gal_wE', (GX1, GY0, 0), (GX1 + 0.4, GY1, GH), 'plaster', Z, only='x-')
    box('gal_wW_s', (GX0 - 0.4, GY0, 0), (GX0, PY0, GH), 'plaster', Z, only='x+'); box('gal_wW_n', (GX0 - 0.4, PY1, 0), (GX0, GY1, GH), 'plaster', Z, only='x+')
    box('gal_wW_t', (GX0 - 0.4, PY0, PH), (GX0, PY1, GH), 'plaster', Z, only='x+')
    # ceiling with two luminous lay-lights
    lx0, lx1 = 13.4, 35.4; lays = [(4.3, 6.3), (9.7, 11.7)]
    ys = [GY0, lays[0][0], lays[0][1], lays[1][0], lays[1][1], GY1]
    gx = [GX0, lx0, lx1, GX1]; gy = [GY0, lays[0][0], lays[0][1], lays[1][0], lays[1][1], GY1]
    cv = [(x, y, GH) for y in gy for x in gx]; cf = []
    for j in range(5):
        for i in range(3):
            if i == 1 and j in (1, 3): continue                                   # the two lay-light openings
            cf.append((j * 4 + i, (j + 1) * 4 + i, (j + 1) * 4 + i + 1, j * 4 + i + 1))
    mesh('gal_ceil', cv, cf, 'plaster', Z, outward=(24, 8, GH + 5))
    for n, (a, b) in enumerate(lays):
        plane_z('lay%d' % n, lx0, a, lx1, b, GH + 0.18, 'laylight', Z, up=False)
        cz = GH + 0.09; ym = (a + b) / 2
        quad('lay_rs%d' % n, [(lx0, a, GH), (lx1, a, GH), (lx1, a, GH + 0.18), (lx0, a, GH + 0.18)], 'white', Z, outward=(20, a - 1, cz))
        quad('lay_rn%d' % n, [(lx0, b, GH), (lx1, b, GH), (lx1, b, GH + 0.18), (lx0, b, GH + 0.18)], 'white', Z, outward=(20, b + 1, cz))
        quad('lay_rw%d' % n, [(lx0, a, GH), (lx0, b, GH), (lx0, b, GH + 0.18), (lx0, a, GH + 0.18)], 'white', Z, outward=(lx0 - 1, ym, cz))
        quad('lay_re%d' % n, [(lx1, a, GH), (lx1, b, GH), (lx1, b, GH + 0.18), (lx1, a, GH + 0.18)], 'white', Z, outward=(lx1 + 1, ym, cz))
        for k in range(1, 10):
            x = lx0 + k * M; box('lay_bar%d_%d' % (n, k), (x - 0.02, a, GH + 0.02), (x + 0.02, b, GH + 0.18), 'white', Z, lm=0.6, skip='z+ y- y+')
    # free-standing partitions
    for n, x in enumerate((P1X, P2X)):
        box('part%d' % n, (x, 4.5, 0), (x + PT, 11.5, 4.0), 'plaster', Z, skip='z-'); block(x, 4.5, x + PT, 11.5, 0.35)
    # suspended track grid
    tz = 5.2
    for n, y in enumerate((GY0 + 2.2, GY1 - 2.2)): box('track_x%d' % n, (12.2, y - 0.02, tz - 0.02), (36.6, y + 0.02, tz + 0.02), 'fixture', Z)
    for n, x in enumerate((P1X - 2.2, P1X + PT + 2.2, P2X - 2.2, GX1 - 2.2)): box('track_y%d' % n, (x - 0.02, GY0 + 2.2, tz - 0.02), (x + 0.02, GY1 - 2.2, tz + 0.02), 'fixture', Z)
    for n, (x, y) in enumerate([(x, y) for x in (12.6, 18.6, 24.6, 30.6, 36.2) for y in (GY0 + 2.2, GY1 - 2.2)]):
        rod('track_s%d' % n, (x, y, tz), (x, y, GH), 0.006, 'fixture', Z, segs=4, caps=False)
    for i, (pid, wall, s, w, h, fr) in enumerate(HANG): hang(i, pid, wall, s, w, h, fr)
    picture('gfx_title', (P1X, 9.85, 1.85), 'W', 2.4, 2.6, 'gfx_title', Z, off=0.012)
    picture('gfx_text', (GX0, 12.4, 1.75), 'E', 1.6, 1.8, 'gfx_text', Z, off=0.012)
    bench('gb1', 20.7, 7.65, 23.7, 8.35, Z); bench('gb2', 30.6, 7.65, 33.6, 8.35, Z)
    walk(GX0 + 0.45, GY0 + 0.45, GX1 - 0.45, GY1 - 0.45)


# ---------------------------------------------------------------------------------------------------------------------
def tree(name, x, y, h, mat, rot=0.0):
    """Billboard tree: three crossed cards. The trunk position goes into the spare LM UV set so the runtime can fade a whole tree at once."""
    w = h * 0.5
    for k in range(3):
        a = math.radians(rot + 60 * k); dx, dy = math.cos(a) * w, math.sin(a) * w
        ob = mesh('%s_%d' % (name, k), [(x - dx, y - dy, 0), (x + dx, y + dy, 0), (x + dx, y + dy, h), (x - dx, y - dy, h)], [(0, 1, 2, 3)], mat, 'ext', uv='fit')
        for l in ob.data.uv_layers['LM'].data: l.uv = (x, y)
    block(x - 0.35, y - 0.35, x + 0.35, y + 0.35, 0.3)


def exterior():
    Z = 'ext'; T = 'travertine'
    # --- masses (outer faces only) ---
    # west wing
    box('ww', (-33.4, -5.5, 0), (-11.4, 18, 8), T, Z, skip='z- z+ x+')
    quad('ww_e', [(-11.4, -5.5, 0), (-11.4, 0, 0), (-11.4, 0, 8), (-11.4, -5.5, 8)], T, Z, outward=(-20, -3, 4))
    plane_z('ww_top', -33.4, -5.5, -11.4, 18, 8, 'gravel', Z, lm=0.6)
    quad('ww_win', [(-24, -5.53, 5.0), (-13, -5.53, 5.0), (-13, -5.53, 6.2), (-24, -5.53, 6.2)], 'glass_dark', Z)
    for n, (a, b, c, d) in enumerate([(-24.06, -12.94, 4.94, 5.0), (-24.06, -12.94, 6.2, 6.26), (-24.06, -24, 5.0, 6.2), (-13, -12.94, 5.0, 6.2)]):
        box('ww_wf%d' % n, (a, -5.58, c), (b, -5.5, d), 'bronze', Z, skip='y+')
    for n, (x, m) in enumerate(((-30.6, 'banner_a'), (-28.2, 'banner_b'))):
        picture(m, (x, -5.5, 4.3), 'S', 1.6, 6.0, m, Z, off=0.07)
        for k, z in enumerate((7.3, 1.3)): box('ban_rod%d_%d' % (n, k), (x - 0.86, -5.6, z - 0.025), (x + 0.86, -5.52, z + 0.025), 'bronze', Z)
    picture('gfx_name', (-18.5, -5.5, 2.55), 'S', 9.0, 1.5, 'gfx_name', Z, off=0.02)
    # north block
    box('nb', (-11.4, 15.8, 0), (24, 27, 15), T, Z, skip='z- z+'); plane_z('nb_top', -11.4, 15.8, 24, 27, 15, 'gravel', Z, lm=0.6)
    for n, x in enumerate((-8, -3, 2, 7, 12, 17)): quad('nb_slot%d' % n, [(x + 0.35, 27.03, 2.5), (x - 0.35, 27.03, 2.5), (x - 0.35, 27.03, 12.5), (x + 0.35, 27.03, 12.5)], 'glass_dark', Z)
    for n, y in enumerate((19.5, 23.5)): quad('nb_slotE%d' % n, [(24.03, y - 0.35, 7.5), (24.03, y + 0.35, 7.5), (24.03, y + 0.35, 13), (24.03, y - 0.35, 13)], 'glass_dark', Z)
    # gallery wing shell
    box('gw', (GX0, GY0 - 0.4, 0), (GX1 + 0.4, GY1 + 0.4, 6.2), T, Z, skip='z- z+ x-'); plane_z('gw_top', GX0, GY0 - 0.4, GX1 + 0.4, GY1 + 0.4, 6.2, 'gravel', Z, lm=0.6)
    for n, yc in enumerate((5.3, 10.7)):   # saw-tooth north lights above the lay-lights
        a, b = 13.4, 35.4
        quad('saw_s%d' % n, [(a, yc - 1.6, 6.2), (b, yc - 1.6, 6.2), (b, yc + 1.6, 7.8), (a, yc + 1.6, 7.8)], 'zinc', Z, lm=0.6)
        quad('saw_n%d' % n, [(b, yc + 1.6, 6.2), (a, yc + 1.6, 6.2), (a, yc + 1.6, 7.8), (b, yc + 1.6, 7.8)], 'glass_dark', Z)
        quad('saw_w%d' % n, [(a, yc - 1.6, 6.2), (a, yc + 1.6, 7.8), (a, yc + 1.6, 6.2)], 'zinc', Z, outward=(a + 1, yc, 6.8), lm=0.6)
        quad('saw_e%d' % n, [(b, yc - 1.6, 6.2), (b, yc + 1.6, 6.2), (b, yc + 1.6, 7.8)], 'zinc', Z, outward=(b - 1, yc, 6.8), lm=0.6)
    # stone fins along the long south wall of the gallery wing (rhythm + raking shadows), copings and plinth bands on every mass
    for k in range(11):
        x = 13.6 + k * M; box('fin%d' % k, (x - 0.16, GY0 - 1.05, 0), (x + 0.16, GY0 - 0.4, 6.2), T, Z, skip='z- y+ y-', uvoff=(0.25, 0))
        quad('finf%d' % k, [(x - 0.16, GY0 - 1.05, 0), (x + 0.16, GY0 - 1.05, 0), (x + 0.16, GY0 - 1.05, 6.2), (x - 0.16, GY0 - 1.05, 6.2)], T, Z, uvoff=(0.25 - x / 2.4, 0))
    def trim(name, x0, y0, x1, y1, ztop, sides='x- x+ y- y+'):
        for sd in sides.split():
            a = {'x-': ((x0 - 0.06, y0 - 0.06), (x0, y1 + 0.06)), 'x+': ((x1, y0 - 0.06), (x1 + 0.06, y1 + 0.06)), 'y-': ((x0, y0 - 0.06), (x1, y0)), 'y+': ((x0, y1), (x1, y1 + 0.06))}[sd]
            box('%s_cop_%s' % (name, sd), (a[0][0], a[0][1], ztop - 0.22), (a[1][0], a[1][1], ztop + 0.06), 'concrete', Z, lm=0.7, skip='z-' if sd[0] == 'y' else 'z-')
            box('%s_pl_%s' % (name, sd), (a[0][0] + (0.03 if sd == 'x-' else 0), a[0][1] + (0.03 if sd == 'y-' else 0), 0), (a[1][0] - (0.03 if sd == 'x+' else 0), a[1][1] - (0.03 if sd == 'y+' else 0), 0.32), 'concrete', Z, lm=0.7, skip='z-')
    trim('ww', -33.4, -5.5, -11.4, 18, 8, 'x- y- y+'); trim('nb', -11.4, 15.8, 24, 27, 15); trim('gw', GX0, GY0 - 0.4, GX1 + 0.4, GY1 + 0.4, 6.2, 'x+ y+')
    box('gw_cop_s', (GX0, GY0 - 1.11, 5.98), (GX1 + 0.4, GY0 - 0.4, 6.26), 'concrete', Z, lm=0.7)
    # lobby block: skin above the lower wings, roof slab with fascia, portico ribs and columns
    quad('lb_e', [(GX0, GY0 - 0.4, 6.2), (GX0, LY1 + 0.4, 6.2), (GX0, LY1 + 0.4, LS), (GX0, GY0 - 0.4, LS)], T, Z, outward=(0, 8, 8))
    quad('lb_e2', [(GX0, 0, 0), (GX0, GY0 - 0.4, 0), (GX0, GY0 - 0.4, LS), (GX0, 0, LS)], T, Z, outward=(0, 0.3, 5))
    quad('lb_w', [(-11.4, 15.8, 8), (-11.4, 0, 8), (-11.4, 0, LS), (-11.4, 15.8, LS)], T, Z, outward=(0, 8, 9))
    rx0, rx1, ry0, ry1 = -11.9, 11.9, -5.5, 15.8
    box('roof_fascia', (rx0, ry0, LS), (rx1, ry1, LS + 0.5), 'concrete', Z, skip='z- z+')
    sx0, sy0, sx1, sy1 = SKY
    for n, (a, b, c, d) in enumerate([(rx0, ry0, rx1, sy0), (rx0, sy1, rx1, ry1), (rx0, sy0, sx0, sy1), (sx1, sy0, rx1, sy1)]):
        plane_z('roof_top%d' % n, a, b, c, d, LS + 0.5, 'gravel', Z, lm=0.6)
    plane_z('port_soffit', rx0, ry0, rx1, -0.15, LS, 'concrete', Z, up=False, lm=0.8)
    plane_z('roof_edge_w', rx0, -0.15, LX0 - 0.4, ry1, LS, 'concrete', Z, up=False, lm=0.5); plane_z('roof_edge_e', LX1 + 0.4, -0.15, rx1, ry1, LS, 'concrete', Z, up=False, lm=0.5)
    for k in range(11):
        x = LX0 + M * k; box('prib_y%d' % k, (x - 0.15, ry0 + 0.3, LH), (x + 0.15, -0.15, LS), 'concrete', Z, skip='z+ y+ y-')
    xe = [LX0 + M * k for k in range(11)]
    for j, y in enumerate((-2.2, -4.4)):
        for k in range(10): box('prib_x%d_%d' % (j, k), (xe[k] + 0.15, y - 0.15, LH), (xe[k + 1] - 0.15, y + 0.15, LS), 'concrete', Z, skip='z+ x- x+')
    box('prib_edge', (rx0, ry0, LH), (rx1, ry0 + 0.3, LS), 'concrete', Z, skip='z+')
    box('prib_side_w', (rx0, ry0 + 0.3, LH), (LX0 - 0.15, -0.15, LS), 'concrete', Z, skip='z+ y- y+'); box('prib_side_e', (LX1 + 0.15, ry0 + 0.3, LH), (rx1, -0.15, LS), 'concrete', Z, skip='z+ y- y+')
    for sgn, xa, xb in ((-1, rx0, LX0 - 0.4), (1, LX1 + 0.4, rx1)):   # close the beam ends at the lobby corners
        quad('prib_cap%d' % sgn, [(xa, -0.15, LH), (xb, -0.15, LH), (xb, -0.15, LS), (xa, -0.15, LS)], 'concrete', Z, outward=((xa + xb) / 2, -1, LH + 0.4), lm=0.6)
        xe_ = LX0 - 0.4 if sgn < 0 else LX1 + 0.4
        quad('prib_capx%d' % sgn, [(xe_, -0.15, LH), (xe_, 0.15, LH), (xe_, 0.15, LS), (xe_, -0.15, LS)], 'concrete', Z, outward=(0, 0, LH + 0.4), lm=0.6)
    plane_z('slot_cap', GX0, GY1 + 0.4, 24, 15.8, 6.2, 'gravel', Z, lm=0.6)
    quad('slot_e', [(24, GY1 + 0.4, 0), (24, 15.8, 0), (24, 15.8, 6.2), (24, GY1 + 0.4, 6.2)], T, Z, outward=(20, 15.6, 3))
    for i in range(6):
        x = LX0 + 2 * M * i; box('pcol%d' % i, (x - 0.2, -4.6, 0), (x + 0.2, -4.2, LH), 'concrete', Z, skip='z- z+'); block(x - 0.2, -4.6, x + 0.2, -4.2, 0.3)

    # --- ground ---
    quad('plaza', [(-48, -42, 0), (52, -42, 0), (52, 22, 0), (GX1 + 0.4, 22, 0), (GX1 + 0.4, GY0 - 0.4, 0), (GX0, GY0 - 0.4, 0), (GX0, 0, 0), (-11.4, 0, 0), (-11.4, -5.5, 0), (-48, -5.5, 0)], 'paving', Z)
    plane_z('path_s', -6, -90, 6, -42, 0, 'paving', Z, lm=0.35)
    plane_z('lawn', -150, -140, 150, 140, -0.03, 'lawn', Z, lm=0.11)
    for n, (a, b, c, d) in enumerate([(-700, -700, 700, -140), (-700, 140, 700, 700), (-700, -140, -150, 140), (150, -140, 700, 140)]):
        plane_z('lawn_far%d' % n, a, b, c, d, -0.03, 'lawn', Z, lm=0.012)
    # reflecting pool in front of the gallery wing
    px0, py0, px1, py1 = 15.0, -13.5, 35.0, -4.0
    for n, (a, b, c, d) in enumerate([(px0, py0, px1, py0 + 0.4), (px0, py1 - 0.4, px1, py1), (px0, py0 + 0.4, px0 + 0.4, py1 - 0.4), (px1 - 0.4, py0 + 0.4, px1, py1 - 0.4)]):
        box('pool_c%d' % n, (a, b, 0), (c, d, 0.3), 'concrete', Z, skip='z-')
    plane_z('pool_bed', px0 + 0.4, py0 + 0.4, px1 - 0.4, py1 - 0.4, 0.05, 'black', Z, lm=0.3)
    plane_z('water', px0 + 0.4, py0 + 0.4, px1 - 0.4, py1 - 0.4, 0.22, 'water', Z)
    block(px0, py0, px1, py1, 0.3)
    # plaza sculpture: three leaning red steel slabs on a low plinth
    box('sc_plinth', (-30, -27, 0), (-24, -21, 0.18), 'concrete', Z, skip='z-')
    obox('sc_a', (-27.6, -24.2, 3.3), (0.22, 2.6, 7.0), (0, 14, 20), 'red_steel', Z); obox('sc_b', (-26.2, -23.4, 2.7), (0.22, 2.2, 5.8), (0, -18, -40), 'red_steel', Z)
    obox('sc_c', (-27.0, -25.0, 2.0), (0.22, 3.4, 4.2), (10, 8, 95), 'red_steel', Z)
    block(-30, -27, -24, -21, 0.3)
    # a small grove in stone planters on the west half of the plaza (breaks up the paving, throws long shadows)
    gi = 0
    for gx in (-20.0, -12.5, -5.0):
        for gy in (-31.0, -22.5):
            box('planter%d' % gi, (gx - 1.3, gy - 1.3, 0), (gx + 1.3, gy + 1.3, 0.45), 'concrete', Z, skip='z-')
            box('planter_h%d' % gi, (gx - 1.05, gy - 1.05, 0.45), (gx + 1.05, gy + 1.05, 0.7), 'hedge', Z, skip='z-', lm=0.7)
            tree('grove%d' % gi, gx, gy, 7.2 + (gi % 3) * 0.7, ['tree_c', 'tree_a', 'tree_b'][gi % 3], 20.0 * gi); block(gx - 1.3, gy - 1.3, gx + 1.3, gy + 1.3, 0.3); gi += 1
    # stone benches, hedges
    for n, (x, y) in enumerate([(18, -16), (25, -16), (32, -16), (-38, -12), (-38, -20), (-38, -28)]):
        hor = n < 3
        a, b = ((x - 1.2, y - 0.3), (x + 1.2, y + 0.3)) if hor else ((x - 0.3, y - 1.2), (x + 0.3, y + 1.2))
        box('pbench%d' % n, (a[0], a[1], 0), (b[0], b[1], 0.45), 'concrete', Z, skip='z-'); block(a[0], a[1], b[0], b[1], 0.25)
    for n, (a, b, c, d) in enumerate([(-49, -42, -48, -5.5), (52, -42, 53, 22), (-49, -43, -6, -42), (6, -43, 53, -42)]):
        box('hedge%d' % n, (a, b, 0), (c, d, 1.15), 'hedge', Z, skip='z- y-' if n < 2 else 'z-', lm=0.7)
    # trees (billboard cards)
    rnd = random.Random(3); mats = ['tree_a', 'tree_b', 'tree_c']
    spots = [(-44, -37), (-44, -29), (-44, -21), (-44, -13), (47, -36), (47, -25), (47, -12), (46.5, 6), (46, 17), (-25, 27), (-39, 9), (-41, 24), (31, 25),
             (41, 31), (9, 36), (-9, 37), (-20, -52), (22, -51), (-37, -49), (39, -51), (-56, -30), (-58, -8), (60, -20), (61, 8), (-52, 40), (55, 42), (0, 48)]
    for n, (x, y) in enumerate(spots): tree('tree%d' % n, x + rnd.uniform(-1, 1), y + rnd.uniform(-1, 1), rnd.uniform(9, 13.5), mats[n % 3], rnd.uniform(0, 60))
    walk(-47.4, -41.4, 51.4, -6.0); walk(-10.9, -6.4, 51.4, -0.55); walk(-5.4, -88, 5.4, -41)


def lights(scale=1.0):
    L.setup_world(SUN_AZ, SUN_EL, sun_strength=12.5, sky_strength=0.42, sun_angle=1.6, sky_sat=0.5)
    for name, pos, tgt, w, ang, col in SPOTS: L.spot(name, pos, tgt, w * scale, ang, 0.75, col, 0.22 if name.startswith(('cdl', 'dl')) else 0.04)


def info():
    L.INFO.update(dict(
        sun=list(L.sun_dir(SUN_AZ, SUN_EL)), eye=1.62,
        zones=dict(lobby=[LX0, LY0, 0, LX1, LY1, LS], gallery=[GX0, GY0, 0, GX1, GY1, GH]),
        views=dict(exterior=dict(target=[3, 3, 4.5], pos=[36, -58, 15]), lobby=dict(pos=[0.6, 2.4, 1.62], look=[-2.5, 12, 4.4]), gallery=dict(pos=[13.0, 7.7, 1.62], look=[17, 7.3, 1.6])),
        hang=[dict(id=h[0], wall=h[1], s=h[2], w=h[3], h=h[4]) for h in HANG], label_grid=list(LABEL_GRID),
    ))


def build():
    lobby(); gallery(); exterior(); info()
