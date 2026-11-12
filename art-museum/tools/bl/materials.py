# Material table: the single source of truth for Blender (bake albedo) and the runtime (exported into scene.json).
# kind: lit = albedo x lightmap | emit = self-lit | glass | unlit = flat colour, blocks light | cutout = alpha card | decal = alpha overlay | ghost = runtime-only surface
from lib import defmat

PAINTINGS = ['p%02d' % i for i in range(1, 17)]


def define():
    # tiling textures (size = metres covered by one repeat)
    defmat('travertine', (0.58, 0.50, 0.40), (2.4, 2.4), tex='tex/travertine.webp')
    defmat('paving', (0.30, 0.29, 0.28), (2.4, 2.4), tex='tex/paving.webp', tint=(1.22, 1.22, 1.25))
    defmat('terrazzo', (0.48, 0.47, 0.44), (2.2, 2.2), tex='tex/terrazzo.webp', reflect=0.5, env='lobby')
    defmat('concrete', (0.37, 0.37, 0.35), (3, 3), tex='tex/concrete.webp')
    defmat('gravel', (0.35, 0.35, 0.34), (3, 3), tex='tex/gravel.webp')
    defmat('plaster', (0.80, 0.79, 0.76), (2, 2), tex='tex/plaster.webp')
    defmat('parquet', (0.30, 0.21, 0.12), (2.404, 2.546), tex='tex/parquet.webp', reflect=0.28, env='gallery', bake=(0.42, 0.34, 0.26))
    defmat('slats', (0.11, 0.07, 0.045), (1.2, 2.4), tex='tex/walnut_slats.webp')
    defmat('oak', (0.38, 0.28, 0.17), (1.2, 1.2), tex='tex/oak.webp')
    defmat('bronze', (0.045, 0.035, 0.028), (1, 1), tex='tex/bronze.webp', tint=(0.5, 0.46, 0.44))
    defmat('leather', (0.08, 0.045, 0.03), (1, 1), tex='tex/leather.webp', tint=(0.55, 0.48, 0.44))
    defmat('lawn', (0.14, 0.20, 0.07), (4, 4), tex='tex/lawn.webp')
    defmat('hedge', (0.06, 0.10, 0.035), (1.5, 1.5), tex='tex/hedge.webp')
    # flat colours (lit)
    defmat('white', (0.82, 0.82, 0.80)); defmat('black', (0.02, 0.02, 0.02)); defmat('zinc', (0.22, 0.24, 0.25))
    defmat('red_steel', (0.50, 0.045, 0.025)); defmat('mob_red', (0.62, 0.07, 0.03)); defmat('mob_ochre', (0.72, 0.42, 0.06))
    defmat('mob_white', (0.85, 0.83, 0.78)); defmat('mob_blue', (0.05, 0.13, 0.42)); defmat('rope', (0.35, 0.03, 0.03))
    # glass, emitters, runtime-only
    defmat('glass', kind='glass', bake_tint=0.86)                    # lobby curtain wall, skylight
    defmat('glass_rail', kind='glass', bake_tint=1.0)               # balustrades
    defmat('glass_dark', (0.03, 0.035, 0.04), kind='unlit')          # blind windows of the closed wings (reflect the sky at runtime)
    defmat('laylight', (0.97, 0.98, 1.0), kind='emit', emit=4.6)      # gallery luminous ceiling
    defmat('lamp', (1.0, 0.80, 0.55), kind='emit', emit=30.0)         # pendants / downlight lenses
    defmat('fixture', (0.015, 0.015, 0.015), kind='unlit')           # tracks, spot housings, wires
    defmat('water', kind='ghost')
    for t in ('tree_a', 'tree_b', 'tree_c'): defmat(t, (0.10, 0.16, 0.05), kind='cutout', tex='tex/%s.webp' % t)
    # pictures
    for p in PAINTINGS + ['m01']: defmat(p, (0.35, 0.33, 0.30), kind='lit', tex='art/%s.webp' % p)
    defmat('labels', (0.85, 0.85, 0.83), kind='lit', tex='gfx/labels.webp')
    defmat('banner_a', (0.4, 0.3, 0.25), kind='lit', tex='gfx/banner_a.webp'); defmat('banner_b', (0.25, 0.3, 0.4), kind='lit', tex='gfx/banner_b.webp')
    ink, bronze = (0.024, 0.024, 0.024), (0.036, 0.024, 0.016)          # lettering colours (linear): #2B2B2B, dark bronze
    for d, c in (('gfx_name', bronze), ('gfx_title', ink), ('gfx_way', ink), ('gfx_desk', bronze), ('gfx_text', ink)): defmat(d, c, kind='decal', tex='gfx/%s.webp' % d[4:])
