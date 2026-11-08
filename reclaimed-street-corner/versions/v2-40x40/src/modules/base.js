// base — the plinth body: a torn-out block of city. Strata walls on all four sides (turf lip, buried asphalt,
// reinforced concrete with snapped rebar, rubble, earth), severed road ends on -x / -z, cut pipes and ducts,
// knotted banyan roots, and swaying vines / aerial root tips (instanced chains, CPU forward kinematics).
//
// The whole perimeter is addressed by a single coordinate s in [0,PER), PER = 8*BASE.half, SIDE = 2*BASE.half:
//   s in [0,SIDE)        +z side, x=-H+s          s in [SIDE,2SIDE)   +x side, z=H-(s-SIDE)
//   s in [2SIDE,3SIDE)   -z side, x=H-(s-2SIDE)   s in [3SIDE,PER)    -x side, z=-H+(s-3SIDE)
// and an inset d (distance inward from the square). Every point is W(s,d,y), scaled toward the centre, so outlines
// stay star-shaped however bitten they get, and roots can seat themselves on the same surface the strata were cut from.

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

class MB { // flat-shaded triangle soup with per-face colours
  constructor(THREE) { this.THREE = THREE; this.p = []; this.c = []; }
  tri(a, b, c, col) { this.p.push(...a, ...b, ...c); for (let i = 0; i < 3; i++) this.c.push(col.r, col.g, col.b); }
  quad(a, b, c, d, col) { this.tri(a, b, c, col); this.tri(a, c, d, col); }
  geo() {
    const { THREE } = this, g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((this.p.length / 3) * 2), 2));
    g.computeVertexNormals(); return g;
  }
}

export function build(ctx) {
  const { THREE, kit, P, layout } = ctx, rng = ctx.rng;
  const { BASE, RAIL, RIVER } = layout;
  const V = THREE.Vector3, C = (h) => new THREE.Color(h);
  const group = new THREE.Group(); group.name = 'base';

  // ---------- plinth dimensions ----------
  const H = BASE.half, SIDE = 2 * H, PER = 8 * H, N = (n) => Math.round((n * PER) / 96);
  /** The body grew taller than the first cut: depths below the slab stretch to BASE.height, the built courses above keep their size. */
  const Y = (y) => (y >= -1.66 ? y : -1.66 + (y + 1.66) * ((BASE.height - 1.66) / 1.74));
  // Layer boundaries [soil side, road-end side].
  const LY = {
    lipT: [0.03, 0.03], lipB: [-0.24, -0.1],
    asphT: [-0.2, -0.012], asphB: [-0.62, -0.42],
    concT: [-0.6, -0.4], concM: [-0.84, -0.84], concB: [-1.66, -1.5],
    rubB: [Y(-2.24), Y(-2.1)], clayB: [Y(-2.5), Y(-2.42)], e1B: [Y(-2.74), Y(-2.7)], e2B: [Y(-3.06), Y(-3.06)], e3B: [Y(-3.34), Y(-3.34)],
  };
  const TAPER = [[0, 0], [-0.8, 0], [-1.6, 0.04], [Y(-2.2), 0.2], [Y(-2.7), 0.55], [Y(-3.05), 1.15], [Y(-3.4), 2.05]];

  // s helpers for each side
  const S = { pz: (x) => x + H, px: (z) => SIDE + (H - z), nz: (x) => 2 * SIDE + (H - x), nx: (z) => 3 * SIDE + (z + H) };
  const ROADS = [[S.nz(9), S.nz(1.5)], [S.nx(0.5), S.nx(8)]];       // road + sidewalks reach the wall here
  const ASPHALT = [[S.nz(7.8), S.nz(3.2)], [S.nx(2.2), S.nx(6.8)]]; // asphalt proper
  const RAILS = [[S.pz(RAIL.bed.x[0]), S.pz(RAIL.bed.x[1])], [S.nz(RAIL.bed.x[1]), S.nz(RAIL.bed.x[0])]]; // the line runs off both ±z walls
  const OUT = RIVER.outfall, NOTCH = [S.pz(OUT.x[0]), S.pz(OUT.x[1])], SILL_Y = RIVER.y - 0.1; // the canal leaves through the +z wall
  const BARE = [...ROADS, ...RAILS, NOTCH].sort((a, b) => a[0] - b[0]);  // perimeter runs without a turf lip
  // Rebar bites in the concrete, [from,to,depth]
  const BITES = [
    [S.pz(-18.6), S.pz(-16.6), 0.6], [S.pz(-7.6), S.pz(-4.2), 0.85], [S.pz(-1.2), S.pz(1.8), 0.75], [S.pz(5.6), S.pz(8.4), 0.85], [S.pz(11.0), S.pz(12.8), 0.55],
    [S.px(17.6), S.px(15.0), 0.75], [S.px(9.6), S.px(6.2), 0.85], [S.px(2.2), S.px(-0.6), 0.75], [S.px(-5.6), S.px(-8.8), 0.85], [S.px(-12.4), S.px(-14.6), 0.6], [S.px(-17.2), S.px(-18.8), 0.55],
    [S.nz(12.6), S.nz(10.6), 0.5], [S.nz(6.9), S.nz(4.0), 1.0], [S.nz(-2.8), S.nz(-6.0), 0.8], [S.nz(-10.4), S.nz(-13.2), 0.75], [S.nz(-16.6), S.nz(-18.6), 0.55],
    [S.nx(-18.2), S.nx(-15.4), 0.8], [S.nx(-10.2), S.nx(-7.4), 0.7], [S.nx(-3.4), S.nx(-1.4), 0.55], [S.nx(3.0), S.nx(6.2), 1.0], [S.nx(10.4), S.nx(13.4), 0.8], [S.nx(16.6), S.nx(18.6), 0.5],
  ];
  // Washed-out gullies through the rubble and earth: [centre s, half-width, depth]
  const GULLIES = [
    [S.pz(-14.6), 1.5, 0.75], [S.pz(-3.0), 1.3, 0.7], [S.pz(3.8), 1.3, 0.7], [S.pz(10.0), 1.2, 0.8],
    [S.px(18.6), 1.2, 0.7], [S.px(11.6), 1.4, 0.7], [S.px(4.4), 1.6, 0.8], [S.px(-3.2), 1.3, 0.7], [S.px(-10.4), 1.5, 0.75], [S.px(-16.0), 1.2, 0.7],
    [S.nz(12.9), 1.0, 0.6], [S.nz(-1.0), 1.5, 0.7], [S.nz(-8.2), 1.4, 0.8], [S.nz(-14.8), 1.4, 0.7],
    [S.nx(-13.0), 1.6, 0.8], [S.nx(-5.6), 1.4, 0.7], [S.nx(8.9), 1.2, 0.6], [S.nx(14.8), 1.5, 0.75],
  ];

  // ---------- materials (each is one draw call) ----------
  const opaque = { vertexColors: true, color: '#ffffff' };
  const mats = {
    asph: ctx.surface('asphalt', { ...opaque, moss: 0, emissive: '#444a54', emissiveIntensity: 0.3 }),
    conc: ctx.surface('concrete', { ...opaque, moss: 0.1, emissive: '#56637a', emissiveIntensity: 0.42 }),
    soil: ctx.surface('soil', { ...opaque, moss: 0, emissive: '#463f36', emissiveIntensity: 0.2 }),
    rust: ctx.surface('rust', { vertexColors: true, color: '#ffffff', emissive: '#5a2a1a', emissiveIntensity: 0.3 }),
    flat: ctx.surface('flat', { vertexColors: true, emissive: '#3a4a50', emissiveIntensity: 0.3 }),
    root: ctx.toon({ vertexColors: true, emissive: '#5a4436', emissiveIntensity: 0.36 }),
    leaf: ctx.toon({ vertexColors: true, side: THREE.DoubleSide, translucent: 0.8, emissive: '#1d5a44', emissiveIntensity: 0.3 }),
  };
  mats.fol = mats.leaf;
  const parts = new Map(); // key → geometries
  const fillColor = (g, c) => {
    const n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  };
  const tint = (g, c) => { fillColor(g, C(c)); return g; };
  const add = (key, geo, o = {}) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (!g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(kit.xf(o));
    if (o.color != null || !g.attributes.color) fillColor(g, C(o.color ?? '#ffffff'));
    if (!parts.has(key)) parts.set(key, []);
    parts.get(key).push(g);
  };
  const faceted = (g) => { const h = g.index ? g.toNonIndexed() : g; h.computeVertexNormals(); return h; };
  const shard = (w, h, de) => { // irregular broken flake, thicker at one end
    const n = 5 + Math.floor(rng() * 3), o = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU + rng.range(-0.25, 0.25), k = rng.range(0.7, 1.1); o.push([(Math.cos(a) * w * k) / 2, (Math.sin(a) * h * k) / 2]); }
    const g = kit.wallPanel(o, [], de), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getZ(i) > 0) p.setZ(i, p.getZ(i) + (p.getX(i) / w) * de * 0.8);
    return faceted(g);
  };
  const chunk = (w, h, d, amt, sx = 1) => faceted(kit.chip(kit.box(w, h, d, sx, 1, 1), amt, rng));

  // ---------- perimeter coordinates ----------
  const modP = (s) => ((s % PER) + PER) % PER;
  const sideOf = (s) => Math.floor(modP(s) / SIDE) % 4;
  const outward = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  const tangent = [[1, 0], [0, -1], [-1, 0], [0, 1]];
  const yawOut = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  const sq = (s) => {
    const m = modP(s), side = Math.floor(m / SIDE) % 4, u = m - side * SIDE;
    return side === 0 ? [-H + u, H] : side === 1 ? [H, H - u] : side === 2 ? [H - u, -H] : [-H, -H + u];
  };
  const cornerCut = [0.6, 0.0, 0.5, 0.3]; // +z-x(0), +x+z(1), +x-z(2), -x-z(3) extra chamfer
  const chamfer = (s, y) => {
    const c = Math.max(0, -y - 0.75) * 0.92, k = Math.round(modP(s) / SIDE) % 4;
    return c > 0 ? c + cornerCut[k] * clamp(-y - 0.75) : 0;
  };
  /** World point at perimeter s, inset d (positive = inward), height y. */
  const W = (s, d, y) => {
    const [x, z] = sq(s), sum = Math.abs(x) + Math.abs(z), L = SIDE - chamfer(s, y), k = sum > L ? L / sum : 1, f = k * (1 - d / H);
    return [x * f, y, z * f];
  };
  const inRanges = (s, list) => { const m = modP(s); return list.some(([a, b]) => m >= a && m <= b); };
  const railAt = (s) => inRanges(s, RAILS), inNotch = (s) => inRanges(s, [NOTCH]);
  const crown = (s) => { // 1 on soil-covered sides, 0 at road ends, rail ends and the canal notch
    const m = modP(s); let v = 1;
    for (const [a, b] of BARE) v = Math.min(v, clamp((Math.abs(m - (a + b) / 2) - (b - a) / 2) / 0.35));
    return v;
  };
  const ang = (s) => (s / PER) * TAU, F = (k) => Math.round((k * PER) / 96); // F keeps the wave count whole, so the warps still close around the ring
  const UND = { // strata warp: the layers were bent when the block tore loose
    concB: (s) => 0.05 * Math.sin(ang(s) * F(11) + 0.6),
    rubB: (s) => 0.2 * Math.sin(ang(s) * F(7) + 1) + 0.1 * Math.sin(ang(s) * F(17) + 2),
    clayB: (s) => 0.2 * Math.sin(ang(s) * F(7) + 1.1) + 0.05 * Math.sin(ang(s) * F(23) + 1),
    e1B: (s) => 0.2 * Math.sin(ang(s) * F(9) + 2.2) + 0.09 * Math.sin(ang(s) * F(21)),
    e2B: (s) => 0.18 * Math.sin(ang(s) * F(6) + 4) + 0.08 * Math.sin(ang(s) * F(19) + 1),
  };
  const B = (k, s) => lerp(LY[k][1], LY[k][0], crown(s)) + (UND[k] ? UND[k](s) : 0);
  const taper = (y) => {
    for (let i = 1; i < TAPER.length; i++) if (y >= TAPER[i][0]) { const [y0, a] = TAPER[i - 1], [y1, b] = TAPER[i]; return lerp(a, b, (y0 - y) / (y0 - y1)); }
    return TAPER[TAPER.length - 1][1];
  };
  // periodic low-frequency wander of the lower block: it's torn, not machined
  const wob = (s) => 0.5 * Math.sin(ang(s) * F(5) + 1) + 0.3 * Math.sin(ang(s) * F(13) + 2.3) + 0.2 * Math.sin(ang(s) * F(27));
  const biteOf = (s) => { const m = modP(s); return BITES.find((b) => m >= b[0] && m <= b[1]) || null; };
  const bite = (s) => biteOf(s)?.[2] ?? 0;
  const circ = (a, b) => { const d = Math.abs(modP(a) - modP(b)); return Math.min(d, PER - d); };
  const gully = (s) => { let v = 0; for (const [c, h, de] of GULLIES) v = Math.max(v, de * clamp(1 - circ(s, c) / h)); return v; };
  const cave = (s) => { // the earth under the severed road ends has washed out
    const m = modP(s); let v = 0;
    for (const [a, b] of ASPHALT) v = Math.max(v, clamp(1 - (Math.abs(m - (a + b) / 2) - (b - a) / 2 + 1) / 1.6));
    return v;
  };

  // ---------- strata rings ----------
  const RINGS = [];
  const mbs = { asph: new MB(THREE), conc: new MB(THREE), soil: new MB(THREE), flat: new MB(THREE) };
  const allBreaks = [0, SIDE, 2 * SIDE, 3 * SIDE, PER, ...BITES.flatMap((b) => [b[0], b[1]]), ...ROADS.flat(), ...ASPHALT.flat(), ...RAILS.flat(), ...NOTCH].sort((a, b) => a - b);
  const stdRows = (q) => [[0, q.p0], [0.2, 0], [0.8, 0], [1, q.p1]];

  /**
   * One stratum as a closed (or open) band of broken blocks. Blocks sit at different depths, joined by steps. Each block
   * is `n` columns, each column a list of rows [u, extra inset]. Top and bottom caps run inward so ledges catch the sun.
   */
  function ring(o) {
    const { mb, y0, y1, from = 0, to = PER, len, step = 0.9, depth, color, cap = 1.0, capTo = null, capTop = null, jit = 0.05, yj = 0.05, prof = 0.08, breaks = allBreaks, under = 0.84, rows = stdRows, blockBot = null, rowColor = null, lobe = 0, shear = 0, gap: gapAt = null } = o;
    const closed = to - from >= PER - 1e-6, cols = [];
    let s = from, bi = 0, seam = rng.range(-shear, shear);
    const seam0 = seam;
    while (s < to - 1e-4) {
      let L = rng.range(len[0], len[1]);
      const nb = breaks.find((b) => b > s + 1e-4 && b <= to);
      if (nb !== undefined && s + L > nb - len[0] * 0.4) L = nb - s;
      if (to - s < L + len[0] * 0.4) L = to - s;
      const mid = s + L / 2, r = rng(), d = depth(mid, r), c = C(color(mid, r, bi)), ct = capTop ? C(capTop(mid, r, c) ?? c) : c;
      const p0 = prof * rng.range(0.3, 1), p1 = prof * rng.range(0.3, 1.3), st = typeof step === 'function' ? step(mid) : step;
      const n = Math.max(1, Math.round(L / st)), gap = Math.min(0.07, L * 0.1), bo = blockBot ? blockBot(rng()) : 0, rngL = rng.range(0.5, 1);
      const last = to - (s + L) < 1e-4, seamB = last && closed ? seam0 : rng.range(-shear, shear), seamA = seam;
      seam = seamB;
      for (let i = 0; i <= n; i++) {
        const q = { sh: lerp(seamA, seamB, i / n), s: s + gap + ((L - 2 * gap) * i) / n, d: d + rng.range(-jit, jit), tj: rng.range(-yj, yj), bj: rng.range(-yj, yj) + bo - lobe * rngL * Math.sin((Math.PI * i) / n), c, ct, bi, p0, p1 };
        q.rows = rows(q); cols.push(q);
      }
      s += L; bi++;
    }
    const vert = (q, ri) => {
      const [u, e] = q.rows[ri];
      return W(q.s + q.sh * (u - 0.5), q.d + e, lerp(y0(q.s) + q.tj, y1(q.s) + q.bj, u));
    };
    const m = cols.length, last = closed ? m : m - 1, nr = cols[0].rows.length;
    const inner = (q, y, e) => (capTo != null ? W(q.s, capTo, y) : W(q.s, q.d + e + cap, y));
    for (let i = 0; i < last; i++) {
      const a = cols[i], b = cols[(i + 1) % m], same = a.bi === b.bi;
      if (gapAt && gapAt((a.s + b.s) / 2)) continue;
      const c = same ? a.c : (a.d > b.d ? a.c : b.c).clone().multiplyScalar(0.8);
      for (let r = 0; r < nr - 1; r++) mb.quad(vert(a, r), vert(a, r + 1), vert(b, r + 1), vert(b, r), (rowColor && rowColor(a, b, r)) || c);
      const at = vert(a, 0), bt = vert(b, 0), ab = vert(a, nr - 1), bb = vert(b, nr - 1);
      mb.quad(at, bt, inner(b, bt[1], b.rows[0][1]), inner(a, at[1], a.rows[0][1]), same ? a.ct : c);
      mb.quad(ab, inner(a, ab[1], a.rows[nr - 1][1]), inner(b, bb[1], b.rows[nr - 1][1]), bb, c.clone().multiplyScalar(under));
    }
    const R = { y0, y1, cols, from: cols[0].s, to: cols[m - 1].s };
    R.lookup = (q) => {
      let lo = 0, hi = m - 1;
      while (hi - lo > 1) { const c = (lo + hi) >> 1; if (cols[c].s <= q) lo = c; else hi = c; }
      const a = cols[lo], b = cols[hi];
      return lerp(a.d, b.d, clamp((q - a.s) / Math.max(1e-3, b.s - a.s)));
    };
    RINGS.push(R); return R;
  }
  /** Outermost surface inset at (s,y), taken across every ring covering that height. */
  const insetAt = (s, y) => {
    const q = modP(s); let best = 1e9;
    for (const r of RINGS) {
      if (q < r.from || q > r.to) continue;
      if (y > r.y0(q) + 0.03 || y < r.y1(q) - 0.03) continue;
      best = Math.min(best, r.lookup(q));
    }
    return best < 1e8 ? best : taper(y);
  };

  const soilRanges = [];
  { let at = 0; for (const [a, b] of BARE) { if (a > at + 0.01) soilRanges.push([at, a]); at = b; } if (at < PER - 0.01) soilRanges.push([at, PER]); }
  const pick = (r, arr) => arr[Math.min(arr.length - 1, Math.floor(r * arr.length))];

  // Turf lip: scalloped green fringe spilling over the edge, then a thin soil course behind it.
  for (const [a, b] of soilRanges) {
    ring({ mb: mbs.soil, from: a, to: b, y0: (s) => B('lipT', s) - 0.04, y1: (s) => B('lipB', s), len: [0.8, 2.2], depth: (s, r) => -0.12 + r * 0.07, color: (s, r) => pick(r, ['#75654f', '#7f6e59', '#6b5c49']), capTo: 0.16, prof: 0.05, jit: 0.03, yj: 0.012 });
    ring({ mb: mbs.flat, from: a, to: b, y0: () => 0.035, y1: () => -0.05, len: [0.4, 1.3], step: 0.2, depth: (s, r) => -0.17 - r * 0.05, color: (s, r) => pick(r, [P.moss, P.grass, P.mossLit, P.moss, P.mossDeep]), capTo: 0.1, yj: 0.012, jit: 0.015, prof: 0, rows: () => [[0, 0], [0.6, 0], [1, 0.05]], lobe: 0.26 });
  }
  // Asphalt course
  ring({
    mb: mbs.asph, y0: (s) => (railAt(s) ? 0.045 : B('asphT', s)), y1: (s) => B('asphB', s) - 0.02, len: [0.6, 1.9], step: 0.6, shear: 0.16, capTo: 0.17, jit: 0.035, yj: 0.05, gap: inNotch,
    depth: (s, r) => (r < 0.3 ? -0.04 : r < 0.68 ? -0.1 : -0.21),
    color: (s, r) => { if (railAt(s)) return pick(r, ['#8f9290', '#a3a39b', '#7f8485', '#989a93']); if (crown(s) < 0.5 && !inRanges(s, ASPHALT)) return pick(r, ['#d9d6c8', '#cbc9bd', '#e2dfd0']); return pick(r, ['#5d626a', '#6c7078', '#7b8088', '#54595f', '#6c7078']); },
    capTop: (s) => (crown(s) > 0.5 ? '#7a7f86' : null),
  });
  // Grey binder seam between asphalt and slab, a thin bright line that tells the eye "built thing".
  ring({ mb: mbs.conc, y0: (s) => B('asphB', s) + 0.05, y1: (s) => B('concT', s) - 0.09, len: [1.2, 3.2], capTo: 0.17, jit: 0.015, yj: 0.018, prof: 0.02, gap: inNotch, depth: (s, r) => -0.06 + r * 0.03, color: (s, r) => (railAt(s) ? pick(r, ['#6d6a64', '#5f5e5a', '#77726a']) : pick(r, ['#b9b8ad', '#adada3', '#c6c4b6'])) });
  // Concrete slab: upper skin (thin, stays on the plate line), lower body (holed, with rebar inside).
  ring({
    mb: mbs.conc, y0: (s) => B('concT', s) - 0.05, y1: (s) => B('concM', s) - 0.03, len: [1.4, 3.6], capTo: 0.17, jit: 0.025, yj: 0.03,
    depth: (s, r) => (r < 0.35 ? -0.04 : -0.11), color: (s, r) => (railAt(s) ? pick(r, ['#a08d76', '#94826d', '#ab9880']) : pick(r, [P.concreteLit, P.concrete, P.concrete, '#e4e0d2'])),
  });
  const holeInner = C('#7c8a88'), holeEdge = C('#c4c1b4');
  ring({
    mb: mbs.conc, y0: (s) => B('concM', s) + 0.04, y1: (s) => B('concB', s), len: [1.0, 2.7], cap: 0.9, jit: 0.04, yj: 0.05, shear: 0.22,
    step: (s) => (biteOf(s) ? 0.34 : 1.0),
    depth: (s, r) => (r < 0.3 ? 0.17 : r < 0.8 ? 0.03 : -0.07),
    color: (s, r) => pick(r, [P.concrete, P.concreteLit, '#e2decf', P.concrete]),
    rows: (q) => {
      const b = biteOf(q.s), even = [[0, q.p0], [0.18, 0], [0.36, 0], [0.64, 0], [0.82, 0], [1, q.p1]];
      if (!b) return even;
      const t = clamp((q.s - b[0]) / (b[1] - b[0])), e = Math.pow(Math.sin(Math.PI * t), 0.55);
      if (e < 0.16) return even;
      const ht = clamp(0.46 - 0.42 * e * rng.range(0.7, 1.1), 0.04, 0.44), hb = clamp(0.5 + 0.62 * e * rng.range(0.7, 1.25), 0.56, 1), dep = b[2] * clamp(e * 1.7), open = hb > 0.96;
      q.hole = true;
      return open ? [[0, q.p0], [ht, 0], [ht + 0.05, dep], [0.7, dep], [0.9, dep], [1, dep]] : [[0, q.p0], [ht, 0], [ht + 0.05, dep], [hb - 0.05, dep], [hb, 0], [1, q.p1]];
    },
    rowColor: (a, b, r) => {
      if (!a.hole && !b.hole) return null;
      return r === 1 ? holeEdge : r === 2 || r === 3 ? holeInner : null;
    },
  });
  // Rubble / crushed-stone sub-base
  ring({
    mb: mbs.soil, y0: (s) => B('concB', s) + 0.07, y1: (s) => B('rubB', s), len: [0.8, 2.1], step: 0.7, cap: 1.0, jit: 0.07, yj: 0.08, shear: 0.4, blockBot: (r) => (r - 0.5) * 0.24,
    depth: (s, r) => taper(Y(-1.9)) + cave(s) * 0.85 + bite(s) * 0.4 + gully(s) * 0.55 + r * 0.26 + wob(s) * 0.08,
    color: (s, r) => pick(r, ['#c9bda6', '#bbae98', '#d3c7b0', '#ad9f8a']),
    capTop: (s, r) => (r < 0.45 ? P.mossLit : '#e0d4bc'),
  });
  // A buried older street: a thin dark clay seam with a course of pale setts, the block's own archaeology.
  ring({
    mb: mbs.soil, y0: (s) => B('rubB', s) + 0.08, y1: (s) => B('clayB', s), len: [0.6, 1.7], step: 0.6, cap: 1.0, jit: 0.05, yj: 0.05, shear: 0.3,
    depth: (s, r) => taper(Y(-2.3)) + cave(s) * 0.86 + gully(s) * 0.8 + r * 0.2 + wob(s) * 0.14 - 0.04,
    color: (s, r) => pick(r, ['#d8ccb2', '#c9bda5', '#e2d7be', '#7b6a5c', '#d0c4ab']),
    capTop: (s, r) => (r < 0.3 ? P.mossLit : '#ece1c8'),
  });
  // Earth, in three warm bands, tearing inward toward the bottom
  ring({
    mb: mbs.soil, y0: (s) => B('clayB', s) + 0.08, y1: (s) => B('e1B', s), len: [1.0, 2.8], step: 0.8, cap: 1.1, jit: 0.08, yj: 0.09, shear: 0.5, blockBot: (r) => (r - 0.5) * 0.28,
    depth: (s, r) => taper(Y(-2.6)) + cave(s) * 0.9 + gully(s) + r * 0.42 + wob(s) * 0.25,
    color: (s, r) => pick(r, ['#a07a58', '#94704f', '#ab8560']),
    capTop: (s, r) => (r < 0.5 ? P.moss : '#c2a079'),
  });
  ring({
    mb: mbs.soil, y0: (s) => B('e1B', s) + 0.1, y1: (s) => B('e2B', s), len: [0.9, 2.5], step: 0.8, cap: 1.2, jit: 0.1, yj: 0.11, shear: 0.45, blockBot: (r) => (r - 0.5) * 0.28,
    depth: (s, r) => taper(Y(-2.9)) + cave(s) * 0.7 + gully(s) * 1.1 + r * 0.55 + wob(s) * 0.42,
    color: (s, r) => pick(r, ['#86644a', '#7a5b45', '#8f6b4e']),
    capTop: (s, r) => (r < 0.4 ? P.mossDeep : '#a5825f'),
  });
  ring({
    mb: mbs.soil, y0: (s) => B('e2B', s) + 0.1, y1: (s) => B('e3B', s), len: [0.7, 2.0], step: 0.7, cap: 1.4, jit: 0.12, yj: 0.14, shear: 0.3,
    depth: (s, r) => taper(Y(-3.2)) + cave(s) * 0.5 + gully(s) * 1.1 + r * 0.7 + wob(s) * 0.55,
    color: (s, r) => pick(r, ['#6b5345', '#5f4a40', '#735a49']),
    capTop: () => '#856a53',
    blockBot: (r) => (r < 0.22 ? 0.34 : r > 0.8 ? -0.26 : 0),
  });
  // Underside: a shallow fan closing the block.
  {
    const r = RINGS[RINGS.length - 1], col = C('#57504a'), yU = Y(-3.05), c0 = [0, yU, 0];
    for (let i = 0; i < r.cols.length; i++) {
      const a = r.cols[i], b = r.cols[(i + 1) % r.cols.length], ya = r.y1(a.s) + a.bj, yb = r.y1(b.s) + b.bj;
      mbs.soil.tri(W(a.s, a.d + 1.2, yU), c0, W(b.s, b.d + 1.2, yU), col);
      mbs.soil.quad(W(a.s, a.d + 1.2, ya), W(a.s, a.d + 1.2, yU), W(b.s, b.d + 1.2, yU), W(b.s, b.d + 1.2, yb), col);
    }
    for (let i = 0, n = N(18); i < n; i++) { // big soft lobes so the underside isn't a flat lid
      const a = rng() * TAU, k = Math.sqrt(rng()) * H * 0.72, rr = rng.range(0.7, 1.7);
      add('soil', faceted(kit.rock(rr, rng, 0.34, 1)), { pos: [Math.cos(a) * k, Y(-3.08), Math.sin(a) * k], rot: [0, rng() * 6, 0], color: rng.pick(['#5f4a40', '#57504a', '#6b5345']) });
    }
  }

  // Hidden solid core, kept below the ground plates.
  const coreY = BASE.coreTopY, coreB = Y(-3.15);
  add('soil', kit.box(SIDE - 7.5, coreY - coreB, SIDE - 7.5).translate(0, (coreY + coreB) / 2, 0), { color: P.soilDark });
  add('soil', kit.box(SIDE - 2.8, 0.8, SIDE - 2.8).translate(0, coreY - 0.4, 0), { color: P.soilDark });

  const yawAt = (s) => yawOut[sideOf(s)];
  const atFace = (s, d, y, rx = 0, rz = 0, ry = 0) => kit.xf({ pos: W(s, d, y), rot: [rx, yawAt(s) + ry, rz] }); // +x along the wall, +z outward
  // ---------- broken chunks and embedded stones ----------
  const stoneCols = [P.concreteLit, P.concrete, P.concreteMid, '#d6ccb4', '#c7baa2'];
  for (let i = 0, n = N(124); i < n; i++) { // rubble-layer stones
    const s = rng.range(0, PER), y = rng.range(Y(-2.1), -1.5) + (1 - crown(s)) * 0.14, d = insetAt(s, y), r = Math.pow(rng(), 2) * 0.24 + 0.1;
    const col = rng.pick(stoneCols);
    add('flat', faceted(kit.rock(r, rng, rng.range(0.6, 0.9), 0)), { pos: W(s, d - r * 0.25, y), rot: [rng() * 3, rng() * 6, rng() * 3], color: col });
  }
  for (let i = 0, n = N(34); i < n; i++) { // brick fragments: this was somebody's wall
    const s = rng.range(0, PER), y = rng.range(Y(-2.05), -1.7), d = insetAt(s, y);
    add('flat', chunk(0.42, 0.16, 0.2, 0.03), { matrix: atFace(s, d - 0.05, y, rng.range(-0.4, 0.4), rng.range(-0.6, 0.6), rng.range(-0.5, 0.5)), color: rng.pick([P.fadedRed, '#b5614a', P.rust, '#c97a5e']) });
  }
  for (let i = 0, n = N(44); i < n; i++) { // stones in the earth
    const s = rng.range(0, PER), y = rng.range(Y(-3.0), Y(-2.3)), d = insetAt(s, y), r = rng.range(0.1, 0.32);
    add('flat', faceted(kit.rock(r, rng, 0.7, 0)), { pos: W(s, d - r * 0.2, y), rot: [rng() * 3, rng() * 6, 0], color: rng() < 0.3 ? '#b5ab98' : rng.pick(['#a58a70', '#94806c', '#7f6c5a']) });
  }
  for (let i = 0, n = N(46); i < n; i++) { // bottom clods: the block's underside drips soil
    const s = rng.range(0, PER), d = insetAt(s, Y(-3.2)), r = rng.range(0.16, 0.42);
    add('soil', faceted(kit.rock(r, rng, rng.range(1.0, 1.6), 0)), { pos: W(s, d + rng.range(0.05, 0.4), Y(-3.28) - r * rng.range(0, 0.7)), rot: [rng() * 3, rng() * 6, 0], color: rng.pick(['#6b5345', '#5f4a40', '#735a49']) });
  }
  for (let i = 0, n = N(74); i < n; i++) { // loose asphalt and concrete flakes slumped over the seams
    const s = rng.range(0, PER), asph = rng() < 0.45;
    if (bite(s) || inNotch(s) || railAt(s)) continue;
    const y = asph ? lerp(B('asphT', s), B('concT', s), rng.range(0.55, 1.1)) : lerp(B('concT', s), B('concB', s), rng.range(0.3, 0.95));
    const w = rng.range(0.6, 1.5), h = rng.range(0.24, asph ? 0.36 : 0.66), de = asph ? 0.2 : rng.range(0.24, 0.36);
    add(asph ? 'asph' : 'conc', shard(w, h, de), { matrix: atFace(s, Math.min(0.06, insetAt(s, y)) - 0.08, y, rng.range(-0.1, 0.24), rng.range(-0.22, 0.22), rng.range(-0.2, 0.2)), color: asph ? rng.pick(['#62676f', '#6c7078', '#757a82']) : rng.pick([P.concreteLit, P.concrete]) });
  }

  // ---------- rebar ----------
  const rust = [P.rust, P.rustLit, P.rustLit, '#c4633a', P.rust];
  const bar = (pts, r = 0.048) => add('rust', kit.tube(pts, r, r * 0.86, 4, Math.max(4, Math.ceil(pts.length * 1.4)), { capEnds: false }), { color: rng.pick(rust) });
  /** A transverse bar: runs out of the slab at (s,y), then bends. len = how far it pokes past the face. */
  const pokeBar = (s, y, len, base = insetAt(s, y)) => {
    const sw = rng.range(-0.3, 0.3), dropA = rng.range(0.1, 0.5), kind = rng();
    const pts = [W(s, base + 0.3, y), W(s, base - len * 0.3, y + 0.015), W(s + sw * 0.25, base - len * 0.62, y - dropA * 0.28)];
    if (kind < 0.55) pts.push(W(s + sw * 0.6, base - len * 0.86, y - dropA * 0.8), W(s + sw, base - len * 0.92, y - dropA * 1.6));      // bent down
    else if (kind < 0.8) pts.push(W(s + sw * 1.3, base - len, y - dropA * 0.5), W(s + sw * 2.2, base - len * 0.85, y - dropA * 0.3));  // bent sideways
    else pts.push(W(s + sw * 0.5, base - len, y - dropA * 0.3));                                                                        // straight, snapped
    bar(pts);
  };
  for (const [a, b, dep] of BITES) {
    const mid = (a + b) / 2, yA = B('concM', mid), yB = B('concB', mid), ys = [lerp(yA, yB, 0.3), lerp(yA, yB, 0.72)];
    for (const y of ys) { // longitudinal bars run across the void
      const cut = rng() < 0.45, pts = [], steps = Math.ceil((b - a + 1) / 0.7);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps, sag = Math.sin(t * Math.PI);
        pts.push(W(lerp(a - 0.5, b + 0.5, t), dep * 0.45 - sag * 0.12 + rng.range(-0.02, 0.02), y - sag * 0.09));
      }
      if (cut) { // snapped mid-span, both ends curling out
        const c = Math.floor(steps * rng.range(0.35, 0.65));
        bar([...pts.slice(0, c), W(lerp(a, b, c / steps) + 0.1, dep * 0.1, y - 0.2)]);
        bar([W(lerp(a, b, c / steps) + 0.5, dep * 0.15, y + 0.12), ...pts.slice(c + 1)]);
      } else bar(pts);
    }
    for (let q = a + 0.2; q < b; q += rng.range(0.42, 0.66)) { // stirrups across, some snapped outward
      const y = rng.pick(ys) + rng.range(-0.03, 0.03);
      if (rng() < 0.62) pokeBar(q, y, rng.range(0.55, 1.5) + dep * 0.3, dep * 0.75);
      else bar([W(q, dep * 0.8, ys[0] + 0.1), W(q, dep * 0.45, ys[0]), W(q + 0.03, dep * 0.45, ys[1]), W(q, dep * 0.8, ys[1] - 0.1)], 0.046);
    }
  }
  for (let i = 0, n = N(30); i < n; i++) { // strays wherever the slab has snapped
    const s = rng.range(0, PER); if (bite(s) || inNotch(s)) continue;
    pokeBar(s, lerp(B('concM', s), B('concB', s), rng.range(0.25, 0.75)), rng.range(0.25, 0.75));
  }

  // ---------- severed road ends ----------
  /** A snapped deck slab: asphalt over concrete, hinged on the wall, sagging out over the void. */
  function deckSlab({ s, w, len, tilt, roll = 0, d = -0.03, y = -0.03, paint = null, yaw = 0 }) {
    const M = atFace(s, d, y - Math.abs(roll) * w * 0.5 - 0.02, tilt, roll, yaw);
    const o = [[-w / 2, 0.02], [w / 2, 0.02], [w * 0.47, len * 0.72], [w * 0.2, len], [-w * 0.12, len * 0.78], [-w * 0.3, len * 0.92], [-w / 2, len * 0.5]];
    const a = kit.jag(o, 0.45, 0.1, rng), c = kit.jag(o.map(([x, z]) => [x * 0.93, z * 0.84 - 0.03]), 0.5, 0.12, rng);
    add('asph', faceted(kit.plate(a, [], 0, 0.3)), { matrix: M, color: '#6c7078' });
    add('asph', faceted(kit.plate(a, [], -0.3, 0.1)), { matrix: M, color: '#7d8087' });
    add('conc', faceted(kit.plate(c, [], -0.4, 0.5)), { matrix: M, color: P.concrete });
    if (paint) for (const [x0, x1, z0, z1, col = P.paint] of paint) add('flat', faceted(kit.plate(kit.jag([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], 0.3, 0.025, rng), [], 0.012, 0.012)), { matrix: M, color: col });
    const v = new V();
    for (let i = 0; i < 3; i++) { // rebar still tethering the slab to the wall
      const x = rng.range(-w * 0.4, w * 0.4), p = (z) => { v.set(x, -0.62, z).applyMatrix4(M); return [v.x, v.y, v.z]; };
      bar([W(s + x, 0.3, Math.min(-0.82, y - 0.82)), p(0.02), p(len * 0.4)]);
    }
    for (let i = 0; i < 5; i++) { // bars sticking out of the snapped front edge
      const x = rng.range(-w * 0.42, w * 0.42), l = rng.range(0.25, 0.7), p = (z, yy) => { v.set(x, yy, z).applyMatrix4(M); return [v.x, v.y, v.z]; };
      bar([p(len * 0.45, -0.62), p(len * 0.7 + l * 0.2, -0.62), p(len * 0.72 + l * 0.6, -0.68), p(len * 0.74 + l, -0.9)]);
    }
  }
  deckSlab({ s: S.nx(3.3), w: 2.0, len: 1.15, tilt: 0.3, roll: -0.05, paint: [[-0.92, -0.76, 0.02, 0.9]] });
  deckSlab({ s: S.nx(5.55), w: 2.3, len: 0.95, tilt: 0.42, roll: 0.09, y: -0.08, paint: [[-1.13, -0.99, 0.02, 0.24, P.fadedYellow], [-1.1, -0.96, 0.4, 0.72, P.fadedYellow]] });
  deckSlab({ s: S.nz(5.9), w: 2.3, len: 1.2, tilt: 0.34, roll: 0.06, paint: [[0.33, 0.47, 0.02, 0.42, P.fadedYellow], [0.35, 0.49, 0.64, 1.02, P.fadedYellow]] });
  deckSlab({ s: S.nz(3.95), w: 1.45, len: 0.8, tilt: 0.24, roll: -0.08, y: -0.05 });
  // A slab that fell and was caught in the roots.
  deckSlab({ s: S.nx(4.6), w: 1.4, len: 0.9, tilt: 0.86, roll: 0.3, d: 0.72, y: -1.74, yaw: 0.2 });
  // Curb cross-sections: pale stones at the road edges, the sidewalk paving between them.
  for (const s of [S.nz(7.8), S.nz(3.2), S.nx(2.2), S.nx(6.8)]) {
    add('conc', chunk(0.36, 0.52, 0.34, 0.03), { matrix: atFace(s, -0.16, -0.24, 0, rng.range(-0.04, 0.04)), color: P.concreteLit });
    add('conc', chunk(0.5, 0.2, 0.3, 0.03), { matrix: atFace(s, -0.12, -0.58, 0, rng.range(-0.04, 0.04)), color: P.concreteMid });
  }

  // ---------- cut services ----------
  const WALLDARK = '#2b4a4c';
  function drainPipe(s, y, r, len, col = P.concreteMid) {
    const M = atFace(s, insetAt(s, y) - 0.02, y), ri = r * 0.76;
    const prof = [[r, -0.9], [r, 0.02], [r * 1.14, 0.04], [r * 1.14, 0.3], [r, 0.33], [r, len], [ri, len], [ri, -0.9]].map(([a, b]) => new THREE.Vector2(a, b));
    const g = new THREE.LatheGeometry(prof, 20), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { // chew the rim
      if (p.getY(i) > len - 0.01) { const a = Math.atan2(p.getZ(i), p.getX(i)); p.setY(i, len - Math.max(0, 0.2 * Math.sin(a * 2 + 2.2) + 0.09 * Math.sin(a * 7 + 0.3))); }
    }
    g.rotateX(Math.PI / 2);
    add('conc', faceted(g), { matrix: M, color: col });
    add('flat', new THREE.CircleGeometry(ri, 16).translate(0, 0, len - 0.3), { matrix: M, color: WALLDARK });
  }
  function ductBank(s, y) { // poured duct with conduits, cables spilling out
    const w = 1.5, h = 0.86, M = atFace(s, insetAt(s, y) - 0.22, y);
    const holes = [[-0.42, 0.2], [0.02, 0.2], [0.46, 0.2], [-0.42, -0.2], [0.02, -0.2], [0.46, -0.2]];
    const outline = kit.jag([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]], 0.5, 0.05, rng);
    add('conc', faceted(kit.wallPanel(outline, holes.map(([x, yy]) => kit.circlePts(x, yy, 0.14, 8)), 0.7)), { matrix: M, color: P.concreteMid });
    add('flat', kit.box(w * 0.98, h * 0.98, 0.04).translate(0, 0, -0.18), { matrix: M, color: WALLDARK });
    const cols = [P.sunWarm, P.fadedBlue, P.concreteLit, P.sunWarm, P.fadedRed, P.fadedBlue];
    holes.forEach(([x, yy], i) => {
      if (i === 3) return;
      const l = rng.range(0.12, 0.42), g = kit.cyl(0.125, 0.125, l, 9, true).rotateX(Math.PI / 2).translate(x, yy, 0.3 + l / 2);
      add('flat', new THREE.BufferGeometry().copy(g), { matrix: M, color: cols[i] });
      add('flat', new THREE.CircleGeometry(0.115, 9).translate(x, yy, 0.3), { matrix: M, color: WALLDARK });
      if (i % 2 === 0) for (let k = 0; k < 3; k++) { // loose cable
        const v = new V(x + rng.range(-0.05, 0.05), yy + rng.range(-0.05, 0.05), 0.3 + l).applyMatrix4(M), o = outward[sideOf(s)], ox = o[0], oz = o[1], dr = rng.range(0.4, 1.0), t = tangent[sideOf(s)], lat = rng.range(-0.3, 0.3);
        add('flat', kit.tube([[v.x, v.y, v.z], [v.x + ox * 0.2, v.y + 0.02, v.z + oz * 0.2], [v.x + ox * 0.34 + t[0] * lat * 0.5, v.y - dr * 0.5, v.z + oz * 0.34 + t[1] * lat * 0.5], [v.x + ox * 0.3 + t[0] * lat, v.y - dr, v.z + oz * 0.3 + t[1] * lat]], 0.028, 0.024, 3, 8), { color: rng.pick([P.red, P.fadedYellow, '#3b6f76', P.sunGold]) });
      }
    });
  }
  function waterMain(s, y, r) { // cast-iron main: runs out of the wall, kinks down at a bolted joint, and ends in a snapped mouth
    const d0 = insetAt(s, y), lo = y - 0.5, pts = [W(s, d0 + 0.5, y), W(s, d0 - 0.14, y), W(s, d0 - 0.42, y - 0.04), W(s + 0.03, d0 - 0.58, y - 0.26), W(s + 0.04, d0 - 0.62, lo)];
    const g = kit.tube(pts, r, r, 10, 16, { capEnds: false }), E = new V(...pts[4]), D = new V(...pts[3]).sub(E).normalize();
    add('rust', g, { color: '#8e4e38' });
    const up = kit.xf({ pos: W(s, d0 - 0.1, y), rot: [0, yawAt(s), 0] }), low = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new V(0, 1, 0), D)).setPosition(E);
    add('rust', faceted(kit.cyl(r * 1.34, r * 1.34, 0.1, 12).rotateX(Math.PI / 2)), { matrix: up, color: P.rust });
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; add('rust', kit.cyl(0.045, 0.045, 0.16, 5).rotateX(Math.PI / 2).translate(Math.cos(a) * r * 1.16, Math.sin(a) * r * 1.16, 0), { matrix: up, color: P.rustDark }); }
    add('rust', faceted(kit.cyl(r * 1.16, r * 1.16, 0.12, 12).translate(0, 0.02, 0)), { matrix: low, color: P.rust }); // lip at the snapped end
    add('flat', new THREE.CircleGeometry(r * 0.96, 12).rotateX(Math.PI / 2).translate(0, -0.05, 0), { matrix: low, color: '#4a3230' });
  }
  const SERVICES = [
    [drainPipe, S.pz(3.7), Y(-1.98), 0.56, 0.72], [ductBank, S.pz(-15.0), Y(-1.86)], [ductBank, S.pz(9.8), Y(-1.92)],
    [waterMain, S.px(11.7), Y(-1.86), 0.25], [ductBank, S.px(4.5), Y(-1.92)], [drainPipe, S.px(-3.2), Y(-2.0), 0.5, 0.64], [waterMain, S.px(-10.5), Y(-1.86), 0.22], [ductBank, S.px(-16.0), Y(-1.88)],
    [drainPipe, S.nz(-1.0), Y(-1.95), 0.44, 0.55, '#bdbbaf'], [waterMain, S.nz(-8.3), Y(-1.84), 0.22], [ductBank, S.nz(-14.9), Y(-1.9)],
    [drainPipe, S.nx(-13.0), Y(-2.0), 0.48, 0.6], [ductBank, S.nx(-5.7), Y(-1.9)], [waterMain, S.nx(14.8), Y(-1.86), 0.24],
  ];
  for (const [fn, ...args] of SERVICES) fn(...args);

  // Footings: pale vertical piers break the horizontals on the sides under the old neighbourhood.
  for (const [s, w] of [[S.nx(-11), 0.9], [S.nz(-7.2), 0.9], [S.nz(-10), 0.75], [S.nx(-0.2), 0.8], [S.nz(-17.6), 0.85], [S.nx(-16.6), 0.7]]) {
    const y1 = Y(-2.7) - rng.range(0, 0.3), h = -0.8 - y1, hw = w / 2, flare = 0.22;
    const o = [[-hw - flare, 0], [hw + flare, 0], [hw, -0.3], [hw, -h * 0.72], [hw * 0.55, -h * 0.82], [hw * 0.75, -h], [hw * 0.1, -h * 0.9], [-hw * 0.4, -h * 1.02], [-hw * 0.5, -h * 0.84], [-hw, -h * 0.76], [-hw, -0.3]];
    add('conc', faceted(kit.wallPanel(kit.jag(o, 0.8, 0.04, rng), [], 0.55)), { matrix: atFace(s, insetAt(s, -1.3) + 0.12, -0.8), color: P.concrete });
    for (let i = 0; i < 4; i++) pokeBar(s + rng.range(-0.34, 0.34), y1 + 0.2, rng.range(0.2, 0.6), insetAt(s, -1.3) + 0.1);
  }

  // ---------- banyan roots (static mass) ----------
  const barkA = C('#a98f72'), barkB = C('#8e7760'), barkC = C('#c4ad8c'), mossT = C(P.moss), mossL = C(P.mossLit);
  /** Tube with a radius function and painted bark: pale ridges, moss on whatever faces up. */
  function rootGeo(pts, rFn, { radial = 5, perUnit = 3.4 } = {}) {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new V(...p)), false, 'centripetal');
    const len = curve.getLength(), n = Math.max(5, Math.ceil(len * perUnit)), fr = curve.computeFrenetFrames(n, false);
    const pos = [], nor = [], col = [], uv = [], idx = [], p = new V(), N = new V(), ph = rng() * 6, ph2 = rng() * 6, mossy = rng();
    for (let i = 0; i <= n; i++) {
      const t = i / n, r = rFn(t, t * len); curve.getPointAt(t, p);
      const band = Math.sin(t * len * 2.1 + ph) + 0.6 * Math.sin(t * len * 4.7 + ph2);
      const base = band > 0.75 ? barkC : band < -0.5 ? barkB : barkA;
      for (let j = 0; j <= radial; j++) {
        const a = (j / radial) * TAU;
        N.copy(fr.normals[i]).multiplyScalar(Math.cos(a)).addScaledVector(fr.binormals[i], Math.sin(a)).normalize();
        pos.push(p.x + N.x * r, p.y + N.y * r, p.z + N.z * r); nor.push(N.x, N.y, N.z); uv.push(j / radial, t);
        const c = N.y > 0.25 && Math.sin(t * len * 1.3 + ph2) > 0.2 - mossy * 0.9 ? (band > 0.2 ? mossL : mossT) : base;
        col.push(c.r, c.g, c.b);
      }
    }
    const w = radial + 1;
    for (let i = 0; i < n; i++) for (let j = 0; j < radial; j++) { const a = i * w + j, b = a + w, c = b + 1, d = a + 1; idx.push(a, b, d, b, c, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); return g;
  }
  const lumpy = (r0, r1, f = 1) => (t, l) => lerp(r0, r1, t) * (1 + 0.16 * Math.sin(l * 3.3 + r0 * 40) + 0.1 * Math.sin(l * 7.7)) * f;
  const hug = (s, y) => Math.min(insetAt(s, y), insetAt(s, y + 0.2), insetAt(s, y - 0.2));

  const chainSpots = { tip: [] }; // free root tips hang on from where static roots end
  /** Strands fan out at the lip, pull into a braid on the wall, wrap each other, then splay again near the bottom. */
  function bundle(s0, { n = 3, r = 0.17, yEnd: yEnd0 = -3.0, drift = 0, free = false, top = 0, lip = true, fan = 0.7 }) {
    r *= 0.74;
    const yEnd = Y(yEnd0), sp = []; let s = s0;
    for (let y = top - 0.3; y > yEnd; y -= 0.34) { s += drift * 0.34 + rng.range(-0.15, 0.15); sp.push({ s, y, d: hug(s, y) - r }); }
    if (free) sp.push({ s: s + rng.range(-0.1, 0.1), y: yEnd - 0.3, d: sp[sp.length - 1].d - 0.1 });
    const N = sp.length, phase0 = rng() * TAU, tw = rng.range(1.15, 1.6) * rng.sign(), a = r * 1.5;
    for (let k = 0; k < n; k++) {
      const c = n > 1 ? k / (n - 1) - 0.5 : 0, s1 = s0 + c * fan * rng.range(0.9, 3.2) + rng.range(-0.3, 0.3), ease = rng.range(0.2, 0.55), ph0 = phase0 + (k / n) * TAU, rk = r * (k === 0 ? 1.12 : rng.range(0.7, 0.95)), pts = [];
      if (lip) { // the crest stays under the moss: lumpy() swells a strand by up to 26%, and the lip's top is at LY.lipT
        const crest = Math.min(0, LY.lipT[0] - rk * 1.3);
        pts.push(W(s1, 0.08, crest - 0.1), W(s1, -0.1, crest), W(s1, -0.26, crest - 0.14));
      }
      for (let i = 0; i < N; i++) {
        const q = sp[i], u = i / (N - 1), inn = clamp(u / ease), out = clamp((u - 0.68) / 0.32), ph = ph0 + tw * i;
        pts.push(W(lerp(s1, q.s, inn * (2 - inn)) + a * Math.cos(ph) * inn + c * out * 1.3, q.d - a * 0.7 * (Math.sin(ph) * inn + 0.45), q.y));
      }
      if (!free) { const e = pts[pts.length - 1]; pts.push([e[0] * 0.965, e[1] - 0.24, e[2] * 0.965]); }
      add('root', rootGeo(pts, lumpy(rk, free ? rk * 0.42 : rk * 0.2)));
      if (free) chainSpots.tip.push({ pos: pts[pts.length - 1], r: rk * 0.42, s: s0 });
    }
    for (let m = 0, c = rng() < 0.6 ? 1 : 0; m < c; m++) { // a thin root lashed round the braid, the knot that holds it together
      const i0 = Math.floor(rng.range(0.25, 0.7) * N), q = sp[i0], turns = rng.range(1.3, 2), rw = a + r * 0.9, pts = [];
      for (let i = 0; i <= 10; i++) { const u = i / 10, ph = u * turns * TAU; pts.push(W(q.s + rw * Math.cos(ph), q.d - 0.08 - rw * 0.85 * Math.sin(ph), q.y + 0.42 - u * 0.84)); }
      add('root', rootGeo(pts, lumpy(r * 0.5, r * 0.3), { radial: 4, perUnit: 3.5 }));
    }
    for (let i = 2; i < N; i += 3) { // rootlets feeling their way across the wall
      if (rng() < 0.3) continue;
      const q = sp[i], dir = rng.sign(), L = rng.range(0.9, 2.4), pts = []; let ss = q.s, y = q.y;
      for (let j = 0; j < 5; j++) { pts.push(W(ss, hug(ss, y) - 0.05, y)); ss += (dir * L) / 4; y += rng.range(-0.34, 0.06); }
      add('root', rootGeo(pts, lumpy(r * 0.42, 0.018), { radial: 3, perUnit: 2.5 }));
    }
  }
  /** A belt root following a ledge around the block. */
  function belt(s0, s1, y, r) {
    const pts = [], n = Math.ceil(Math.abs(s1 - s0) / 0.9);
    for (let i = 0; i <= n; i++) { const s = lerp(s0, s1, i / n), yy = y + 0.2 * Math.sin(i * 1.7) + rng.range(-0.1, 0.1); pts.push(W(s, hug(s, yy) - r * 0.8, yy)); }
    add('root', rootGeo(pts, lumpy(r, r * 0.3), { radial: 5, perUnit: 2.6 }));
  }
  const BUNDLES = [
    // +z
    { s: S.pz(-19.0), n: 3, r: 0.17, drift: -0.2 }, { s: S.pz(-14.8), n: 3, r: 0.17, drift: 0.2, yEnd: -3.0, free: true }, { s: S.pz(-8.3), n: 2, r: 0.12, yEnd: -2.4 },
    { s: S.pz(-3.4), n: 3, r: 0.17, drift: 0.2, free: true }, { s: S.pz(2.6), n: 3, r: 0.16, drift: -0.3 }, { s: S.pz(6.1), n: 2, r: 0.12, yEnd: -2.4 },
    { s: S.pz(10.7), n: 4, r: 0.2, drift: 0.35, yEnd: -3.2, free: true }, { s: S.pz(13.0), n: 3, r: 0.15 },
    // +x
    { s: S.px(18.7), n: 3, r: 0.17, drift: -0.2 }, { s: S.px(14.4), n: 3, r: 0.16, free: true }, { s: S.px(10.0), n: 2, r: 0.13, yEnd: -2.5 }, { s: S.px(5.6), n: 3, r: 0.17, drift: 0.2 },
    { s: S.px(1.0), n: 3, r: 0.18, drift: 0.2, yEnd: -3.2, free: true }, { s: S.px(-3.9), n: 2, r: 0.12, yEnd: -2.5 }, { s: S.px(-7.2), n: 3, r: 0.17, drift: -0.3, free: true },
    { s: S.px(-11.2), n: 3, r: 0.18, drift: 0.3 }, { s: S.px(-15.2), n: 3, r: 0.17, free: true }, { s: S.px(-19.0), n: 3, r: 0.18, drift: 0.3 },
    // -z, the crown reaches this way, heaviest
    { s: S.nz(13.2), n: 2, r: 0.13 }, { s: S.nz(10), n: 3, r: 0.16 }, { s: S.nz(0.2), n: 3, r: 0.2, drift: 0.2, free: true }, { s: S.nz(-1.8), n: 2, r: 0.14 },
    { s: S.nz(-7.6), n: 4, r: 0.23, drift: -0.3, yEnd: -3.2, free: true }, { s: S.nz(-10.4), n: 3, r: 0.2, free: true }, { s: S.nz(-13.6), n: 3, r: 0.18 }, { s: S.nz(-17.6), n: 4, r: 0.2, drift: 0.2, yEnd: -3.2, free: true },
    // -x
    { s: S.nx(-19), n: 3, r: 0.2 }, { s: S.nx(-14.2), n: 3, r: 0.19, free: true }, { s: S.nx(-11), n: 3, r: 0.2 }, { s: S.nx(-6.6), n: 2, r: 0.14 }, { s: S.nx(-4.2), n: 3, r: 0.2, free: true, drift: 0.2 },
    { s: S.nx(-0.8), n: 4, r: 0.22, drift: -0.3, yEnd: -3.2, free: true }, { s: S.nx(8.6), n: 3, r: 0.17 }, { s: S.nx(11.8), n: 3, r: 0.18, free: true }, { s: S.nx(15.4), n: 3, r: 0.17 }, { s: S.nx(19.0), n: 3, r: 0.17, free: true },
    // out from under the severed road
    { s: S.nx(4.5), n: 3, r: 0.15, top: -0.7, lip: false, free: true, yEnd: -3.0 }, { s: S.nz(5.4), n: 3, r: 0.15, top: -0.7, lip: false, free: true, yEnd: -3.0 },
  ];
  for (const b of BUNDLES) bundle(b.s, b);
  belt(S.pz(8.5), S.pz(13.5), -1.72, 0.12);
  belt(S.px(19.0), S.px(9.5), -1.72, 0.12);
  belt(S.px(-4.4), S.px(-13.6), Y(-2.3), 0.12);
  belt(S.nz(9.4), S.nz(12.6), -1.8, 0.11);
  belt(S.nz(-3.4), S.nz(-17.8), Y(-2.28), 0.13);
  belt(S.nx(9.4), S.nx(19.2), -1.8, 0.12);
  belt(S.pz(-19.2), S.pz(-13.6), -1.8, 0.12);
  belt(S.nx(-18.6), S.nx(-7.8), Y(-2.3), 0.13);

  // ---------- the rail line runs off the block ----------
  // Cut square across the track: rust-flecked ballast over dark cinders, then the brown blanket on the deck slab. An old layer of sleepers,
  // buried under the present ballast and stripped of its plates, was caught in the section, and the stone keeps trickling down the wall below it.
  {
    const ballast = ['#a9a99f', '#94978f', '#b8b6aa', '#83878a', '#a0988a', '#c0bcae', '#8b8579'];
    for (const [a, b] of RAILS) {
      for (let q = a + 0.06; q < b; q += 0.2) for (let row = 0; row < 3; row++) {
        const s = q + rng.range(-0.1, 0.1), y = lerp(0.04, -0.4, (row + rng()) / 3), r = rng.range(0.1, 0.19), [wx] = W(s, 0, y);
        if (y > -0.34 && RAIL.tracks.some((t) => Math.abs(wx - t) < 1.2)) continue; // the sleepers show here
        add('flat', faceted(kit.rock(r, rng, 0.72, 0)), { pos: W(s, -0.1 - rng.range(0, 0.1), y), rot: [rng() * 3, rng() * 6, rng() * 3], color: rng.pick(ballast) });
      }
      for (let i = 0, n = Math.ceil((b - a) * 3.4); i < n; i++) { // spill down the wall, thinning out, and caught on the ledges
        const s = rng.range(a - 0.3, b + 0.3), y = lerp(-0.5, -2.3, Math.pow(rng(), 1.7)), r = rng.range(0.06, 0.14);
        add('flat', faceted(kit.rock(r, rng, 0.75, 0)), { pos: W(s, insetAt(s, y) - r * 0.4, y), rot: [rng() * 3, rng() * 6, 0], color: rng.pick(ballast) });
      }
    }
    for (const z of [H, -H]) for (const tx of RAIL.tracks) {
      const outZ = Math.sign(z), yS = -0.11, wid = 2.3, hgt = 0.22, dep = 0.62;
      add('flat', chunk(wid, hgt, dep, 0.018, 4), { pos: [tx + rng.range(-0.05, 0.05), yS, z + outZ * (dep / 2 - 0.32)], rot: [0, rng.range(-0.012, 0.012), rng.range(-0.02, 0.02)], color: rng.pick(['#7b5a42', '#6e5038', '#85634a']) });
      add('flat', chunk(wid * 0.98, 0.05, 0.05, 0.006, 3), { pos: [tx, yS + 0.02, z + outZ * 0.145], color: '#94785c' }); // sun-bleached arris along the cut
      for (let i = 0; i < 2; i++) { // an older sleeper, sunk and rotten, half out of the cinders
        const dx = rng.range(-0.9, 0.9), w = rng.range(0.9, 1.5);
        add('flat', chunk(w, 0.17, 0.36, 0.03, 3), { pos: [tx + dx, -0.47 - i * 0.06, z + outZ * -0.08], rot: [rng.range(-0.04, 0.04), rng.range(-0.08, 0.08), rng.range(-0.06, 0.06)], color: '#5d463a' });
      }
    }
  }

  // ---------- the canal notch ----------
  // Dressed-stone cheeks and a projecting sill. Upstream the river module builds the banks and bed; the water falls over this lip.
  {
    const x0 = OUT.x[0], x1 = OUT.x[1], stone = ['#e6e2d4', '#d6d4c8', '#efebdc', '#c9c8bc', '#ddd8c6'], oz = H + 0.16;
    const courses = 4, top = 0.13, hC = (top - SILL_Y) / courses;
    for (const [fx, sign] of [[x0, -1], [x1, 1]]) { // cheeks flank the opening, built back into the bank
      const inFace = fx + sign * 0.2;
      for (let c = 0; c < courses; c++) {
        let z = oz + (c % 2 ? -0.22 : 0);
        for (let k = 0; k < 4 && z > H - 1.75; k++) {
          const l = rng.range(0.56, 0.74), yy = SILL_Y + hC * (c + 0.5);
          add('conc', chunk(0.4 + rng.range(-0.02, 0.03), hC - 0.018, l, 0.014, 2), { pos: [inFace, yy, z - l / 2], rot: [0, rng.range(-0.015, 0.015), 0], color: rng.pick(stone) });
          z -= l + 0.016;
        }
      }
      add('conc', chunk(0.56, 0.1, 2.0, 0.012, 2), { pos: [inFace, top + 0.05, oz + 0.03 - 1.0], color: '#f4f1e4' }); // coping
      add('conc', chunk(0.56, 0.2, 0.42, 0.02, 2), { pos: [inFace + sign * 0.02, 0.2, oz - 0.14], color: '#efebdc' });      // a low head block closing the wall line
    }
    // Sill: five long stones, slightly proud of the wall, nose worn hollow where the water goes over.
    const n = 5, w = (x1 - x0) / n;
    for (let i = 0; i < n; i++) {
      const cx = x0 + w * (i + 0.5), m = 1 - Math.abs(i - 2) / 2.4;
      add('conc', chunk(w - 0.016, 0.34, 1.0, 0.012, 2, 1), { pos: [cx, SILL_Y - 0.17 - m * 0.015, H - 0.32], color: rng.pick(stone) });
      add('conc', chunk(w - 0.016, 0.52, 0.5, 0.012, 2), { pos: [cx, SILL_Y - 0.26 - 0.34, H - 0.04], color: rng.pick(stone) });
    }
    // Apron: the wall under the lip is lined too, so the fall has a clean stone backing, dark and wet at the middle.
    const rows = 4, hR = 0.34;
    for (let r = 0; r < rows; r++) {
      const yy = SILL_Y - 0.88 - hR * (r + 0.5), inset = 0.02 + r * 0.05, narrow = r * 0.14;
      let x = x0 + narrow + (r % 2 ? -0.2 : 0);
      while (x < x1 - narrow) {
        const l = rng.range(0.56, 0.9), a = Math.max(x, x0 + narrow), e = Math.min(x + l, x1 - narrow); x += l + 0.016;
        if (e - a < 0.2) continue;
        const wet = 1 - Math.abs((a + e) / 2 - (x0 + x1) / 2) / ((x1 - x0) / 2);
        add('conc', chunk(e - a, hR - 0.018, 0.34, 0.016, 2), { pos: [(a + e) / 2, yy, H + 0.02 - inset], color: C(rng.pick(stone)).lerp(C('#6d8a84'), 0.72 * Math.min(1, wet * 1.5)) });
      }
    }
    for (let i = 0; i < 26; i++) { // moss creeping in from both sides of the fall, and a little fringe of fern
      const side = rng.sign(), x = side > 0 ? rng.range(x1 - 0.3, x1 + 0.5) : rng.range(x0 - 0.5, x0 + 0.3), y = rng.range(SILL_Y - 2.0, SILL_Y - 0.2), r = rng.range(0.08, 0.2);
      add('flat', faceted(kit.rock(r, rng, 0.6, 0)), { pos: [x, y, H + 0.06], rot: [rng() * 3, rng() * 6, 0], color: rng.pick([P.moss, P.mossLit, P.mossDeep]) });
    }
  }

  // ---------- static greens ----------
  const grassCols = [P.grass, P.grassLit, P.moss, P.mossLit, P.fern];
  const mat4 = new THREE.Matrix4(), vX = new V(), vY = new V(), vZ = new V();
  for (const [a, b] of soilRanges) for (let i = 0, n = Math.floor((b - a) * 8); i < n; i++) {
    const s = rng.range(a, b), side = sideOf(s), o = outward[side], t = tangent[side];
    if (Math.sin(s * 0.9) + Math.sin(s * 2.3 + 1) < -0.6) continue; // bare patches
    vX.set(t[0], 0, t[1]); vY.set(o[0] * 0.8 + t[0] * rng.range(-0.3, 0.3), rng.range(0.25, 0.75), o[1] * 0.8 + t[1] * rng.range(-0.3, 0.3)).normalize(); vZ.crossVectors(vX, vY).normalize(); vX.crossVectors(vY, vZ).normalize();
    mat4.makeBasis(vX, vY, vZ).setPosition(...W(s, -0.08, 0.015));
    add('fol', kit.blade(rng.range(0.26, 0.56), rng.range(0.07, 0.11), rng.range(0.1, 0.34), 3), { matrix: mat4.clone(), color: rng.pick(grassCols) });
  }
  // Ferns tucked on ledges and in gullies
  for (let i = 0, n = N(40); i < n; i++) {
    const s = i < GULLIES.length ? GULLIES[i][0] + rng.range(-1, 1) : rng.range(0, PER), y = rng.pick([B('concB', s) - 0.02, B('rubB', s) + 0.05, B('e1B', s) + 0.05]);
    if ((bite(s) && y > -1.8) || inNotch(s)) continue;
    const d = insetAt(s, y + 0.1), base = W(s, d - 0.02, y), yaw = yawAt(s), col = rng.pick([P.fern, P.leafMid, P.ivy, P.leafDeep]);
    for (let k = 0, m = rng.int(3, 5); k < m; k++) add('fol', kit.frond(rng.range(0.55, 1.0), 6, 0.24), { pos: base, rot: [rng.range(-0.25, 0.35), yaw + (k / (m - 1) - 0.5) * 2.2 + rng.range(-0.15, 0.15), 0], color: col });
  }
  // Moss cushions on the ledges
  for (let i = 0, n = N(16); i < n; i++) {
    const s = rng.range(0, PER), y = rng.pick([B('concB', s), B('rubB', s)]), r = rng.range(0.14, 0.3);
    add('flat', faceted(kit.rock(r, rng, 0.62, 0)), { pos: W(s, insetAt(s, y + 0.06) + 0.05, y + 0.02), rot: [0, rng() * 6, 0], color: rng.pick([P.moss, P.mossLit, P.grass]) });
  }
  // Ivy sheets pressed against the wall around the roots
  const ivyCols = [P.ivy, P.ivyLit, P.leafMid, P.leafDeep, P.ivy];
  for (const c of BUNDLES) {
    if (rng() < 0.2) continue;
    const y0 = rng.range(-1.9, -0.3), dir = rng.sign();
    for (let k = 0; k < 26; k++) {
      const s = c.s + dir * rng.range(-0.2, 1.1), y = y0 + rng.range(-0.7, 0.5), l = kit.leaf(rng.range(0.2, 0.34), rng.range(0.15, 0.22), 0.3).rotateY(rng.range(-0.9, 0.9));
      add('fol', l, { pos: W(s, hug(s, y) - 0.05, y), rot: [Math.PI / 2 + rng.range(-0.4, 0.15), yawAt(s), 0], color: rng() < 0.05 ? P.ivyRed : rng.pick(ivyCols) });
    }
  }

  // ---------- group build ----------
  for (const [k, mb] of Object.entries(mbs)) add(k, mb.geo());
  for (const [k, geos] of parts) {
    const m = mats[k], g = kit.merge(geos);
    if (m.userData?.uv) kit.worldUV(g, m.userData.uv);
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = `base-${k}`;
    if (k === 'fol') ctx.softEdge(mesh);
    group.add(mesh);
  }

  // ---------- swaying chains (instanced, forward kinematics in update) ----------
  // Each chain is a pendulum of unit-length segments; each segment is one instance. Stems run exactly along local -y so
  // joints stay closed however the chain bends.
  const ivyLeaf = (l, w) => {
    const f = w * 0.14, h = w / 2;
    const v = [0, 0, 0, -h * 0.62, f, l * 0.02, -h, f * 0.6, l * 0.4, -h * 0.5, f * 0.6, l * 0.76, 0, 0, l, h * 0.5, f * 0.6, l * 0.76, h, f * 0.6, l * 0.4, h * 0.62, f, l * 0.02];
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(16), 2));
    g.setIndex([0, 2, 1, 0, 3, 2, 0, 4, 3, 0, 5, 4, 0, 6, 5, 0, 7, 6]); g.computeVertexNormals(); return g;
  };
  const vineGeo = (leaves, flowers) => {
    const list = [tint(kit.tube([[0, 0, 0], [0.035, -0.33, 0.02], [-0.03, -0.66, -0.02], [0, -1, 0]], 0.022, 0.02, 3, 3, { capEnds: false }), '#3f8a58')];
    for (let i = 0; i < leaves; i++) {
      const t = (i + 0.3) / leaves, a = i * 2.4 + rng() * 0.8, l = rng.range(0.17, 0.3), lf = ivyLeaf(l, l * rng.range(0.74, 0.92));
      lf.rotateX(rng.range(0.6, 1.25)); lf.rotateY(a); lf.translate(Math.sin(a) * 0.015, -t, Math.cos(a) * 0.015);
      list.push(tint(lf, rng() < 0.05 ? P.ivyRed : rng.pick([P.ivy, P.ivyLit, P.leafMid, P.leafLit, P.leafDeep, P.leafMid])));
    }
    for (let i = 0; i < flowers; i++) {
      const a = rng() * TAU, f = kit.flower(0.11, 5); f.rotateX(Math.PI / 2 - 0.4); f.rotateY(a); f.translate(Math.sin(a) * 0.1, -rng.range(0.1, 0.9), Math.cos(a) * 0.1);
      list.push(tint(f, rng.pick([P.bougain, P.bougainLit, P.flowerYellow])));
    }
    return kit.merge(list);
  };
  const tipGeo = () => { // self-similar taper: a child scaled by .62 continues exactly where its parent ends
    const g = kit.tube([[0, 0, 0], [0.04, -0.3, 0.015], [-0.03, -0.68, -0.015], [0, -1, 0]], 0.08, 0.05, 4, 5, { capEnds: true });
    const n = g.attributes.position.count, c = new Float32Array(n * 3), b = C('#a98f72'), l = C('#c4ad8c');
    for (let i = 0; i < n; i++) { const k = Math.sin(g.attributes.position.getY(i) * 13) > 0.4 ? l : b; c[i * 3] = k.r; c[i * 3 + 1] = k.g; c[i * 3 + 2] = k.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
  };
  const chainSets = {
    vine: { geo: vineGeo(10, 0), mat: mats.leaf, soft: true, chains: [] },
    bloom: { geo: vineGeo(8, 2), mat: mats.leaf, soft: true, chains: [] },
    tip: { geo: tipGeo(), mat: mats.root, soft: false, chains: [] },
  };
  const addChain = (set, pos, s, segs, scale, decay, amp) => {
    const side = sideOf(s), o = outward[side], t = tangent[side];
    chainSets[set].chains.push({
      pos: new V(...pos), segs, scale, decay, amp, ph: rng() * TAU,
      q0: new THREE.Quaternion().setFromAxisAngle(new V(0, 1, 0), rng() * TAU),
      axT: new V(t[0], 0, t[1]), axO: new V(o[0], 0, o[1]),
    });
  };
  // Vine curtains hang in the gaps between the showpieces, so the cut strata stay readable.
  const keepClear = [...BITES.map((b) => [b[0] - 0.3, b[1] + 0.3]), ...SERVICES.map(([, q]) => [q - 1, q + 1]), ...RAILS.map(([a, b]) => [a - 0.6, b + 0.6]), [NOTCH[0] - 0.7, NOTCH[1] + 0.7]];
  const curtains = [
    S.pz(-19.2), S.pz(-13.6), S.pz(-8.1), S.pz(-3.0), S.pz(2.9), S.pz(4.9), S.pz(9.6), S.pz(13.2),
    S.px(18.8), S.px(13.8), S.px(10.5), S.px(5.0), S.px(0.6), S.px(-1.6), S.px(-4.4), S.px(-9.6), S.px(-15.3), S.px(-19.2),
    S.nz(13.0), S.nz(9.8), S.nz(0.0), S.nz(-1.6), S.nz(-7.2), S.nz(-9.2), S.nz(-14.0), S.nz(-19.0),
    S.nx(-19.1), S.nx(-14.1), S.nx(-11.0), S.nx(-4.4), S.nx(-0.9), S.nx(8.8), S.nx(14.0), S.nx(19.2),
  ];
  for (const c of curtains) {
    for (let i = 0, n = rng.int(2, 5); i < n; i++) {
      const s = c + rng.range(-1.1, 1.1);
      if (inRanges(s, keepClear) || crown(s) < 0.8) continue;
      const segs = rng() < 0.16 ? rng.int(4, 5) : rng.int(1, 2);
      addChain(rng() < 0.2 ? 'bloom' : 'vine', W(s, -0.28, -0.02), s, segs, rng.range(0.8, 1.05), 0.96, rng.range(0.035, 0.06));
    }
  }
  for (const a of chainSpots.tip) addChain('tip', a.pos, a.s, rng.int(2, 3), a.r / 0.08, 0.625, rng.range(0.03, 0.05));
  for (const [a, b] of ASPHALT) for (let i = 0; i < 9; i++) { // thin aerial roots dangling from the undercut road ends
    const s = rng.range(a - 0.3, b + 0.3);
    addChain('tip', W(s, 0.3, -1.45), s, rng.int(2, 3), rng.range(0.6, 1.0), 0.625, rng.range(0.03, 0.05));
  }
  const dummyM = new THREE.Matrix4(), q = new THREE.Quaternion(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), p = new V(), st = new V(), sc = new V();
  const swing = [];
  for (const set of Object.values(chainSets)) {
    const total = set.chains.reduce((n, c) => n + c.segs, 0);
    if (!total) continue;
    const mesh = new THREE.InstancedMesh(set.geo, set.mat, total);
    mesh.castShadow = false; mesh.receiveShadow = false; mesh.frustumCulled = false; mesh.name = 'base-sway';
    let i0 = 0; const c = new THREE.Color();
    for (const ch of set.chains) {
      ch.i0 = i0; const k = rng.range(0.82, 1.1);
      for (let i = 0; i < ch.segs; i++) mesh.setColorAt(i0 + i, c.setRGB(k, k, k));
      i0 += ch.segs;
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (set.soft) ctx.softEdge(mesh);
    group.add(mesh); swing.push({ mesh, chains: set.chains });
  }
  const update = (t) => {
    for (const { mesh, chains } of swing) {
      for (const ch of chains) {
        p.copy(ch.pos); q.copy(ch.q0); let k = ch.scale;
        const w = ctx.wind(t, ch.pos.x, ch.pos.z);
        for (let i = 0; i < ch.segs; i++) {
          const g = 1 + i * 0.55;
          qa.setFromAxisAngle(ch.axT, -ch.amp * g * (0.2 + 0.45 * (0.5 + 0.5 * w) + 0.25 * Math.sin(t * 1.13 + ch.ph + i * 0.8))); // negative = away from the wall on every side
          qb.setFromAxisAngle(ch.axO, ch.amp * g * 0.55 * Math.sin(t * 0.79 + ch.ph * 2 + i * 0.6));
          q.premultiply(qa).premultiply(qb);
          mesh.setMatrixAt(ch.i0 + i, dummyM.compose(p, q, sc.setScalar(k)));
          p.add(st.set(0, -k, 0).applyQuaternion(q));
          k *= ch.decay;
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  };
  update(0);

  // ---------- contact glow under the block ----------
  const discTex = ctx.canvasTexture(512, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const glow = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    glow.addColorStop(0, 'rgba(34,84,96,.42)'); glow.addColorStop(0.5, 'rgba(38,96,104,.34)'); glow.addColorStop(0.68, 'rgba(60,130,130,.16)'); glow.addColorStop(0.84, 'rgba(120,190,170,.05)'); glow.addColorStop(1, 'rgba(190,235,205,0)');
    g.fillStyle = glow; g.fillRect(0, 0, w, h);
  }, { repeat: false });
  const discK = H / 12, disc = new THREE.Mesh(new THREE.PlaneGeometry(46 * discK, 46 * discK).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: discTex, transparent: true, depthWrite: false }));
  disc.position.set(-0.8 * discK, -BASE.height - 0.7, 0.8 * discK); disc.renderOrder = -1; disc.name = 'base-contact';
  ctx.noOutline(disc); group.add(disc);

  return { group, update };
}
