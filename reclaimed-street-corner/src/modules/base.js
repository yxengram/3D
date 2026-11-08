// base — the plinth body: a torn-out block of city. Strata walls on all four sides (turf lip, buried asphalt,
// reinforced concrete with snapped rebar, rubble, earth), severed road ends on -x / -z, cut pipes and ducts,
// knotted banyan roots, and swaying vines / aerial root tips (instanced chains, CPU forward kinematics).
//
// The whole perimeter is addressed by a single coordinate s in [0,PER), PER = 8*BASE.half, SIDE = 2*BASE.half:
//   s in [0,SIDE)        +z side, x=-H+s          s in [SIDE,2SIDE)   +x side, z=H-(s-SIDE)
//   s in [2SIDE,3SIDE)   -z side, x=H-(s-2SIDE)   s in [3SIDE,PER)    -x side, z=-H+(s-3SIDE)
// and an inset d (distance inward from the square). Every point is W(s,d,y), scaled toward the centre, so outlines
// stay star-shaped however bitten they get, and roots can seat themselves on the same surface the strata were cut from.

import { plinthEdge } from './outskirts.js';

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
  const { THREE, kit, P, layout } = ctx;
  let rng = ctx.rng; // the strata keep this stream; every later section takes its own, so reshaping one can't reshuffle the rest
  const { BASE, RAIL, RIVER, RING_ROADS, WOODS } = layout;
  const V = THREE.Vector3, C = (h) => new THREE.Color(h);
  const group = new THREE.Group(); group.name = 'base';

  // ---------- plinth dimensions ----------
  const H = BASE.half, SIDE = 2 * H, PER = 8 * H, N = (n) => Math.round((n * PER) / 96);
  /** Depths in the old 3.4-unit section map onto the real 7-unit one. Not a stretch: each band gets its own thickness, the built courses above -1.66 keep theirs. */
  const YK = [[-1.66, -1.66], [-2.24, -2.8], [-2.5, -3.3], [-2.74, -4.15], [-3.06, -5.3], [-3.34, -6.55], [-3.8, -7.5]];
  const Y = (y) => { if (y >= YK[0][0]) return y; for (let i = 1; i < YK.length; i++) if (y >= YK[i][0]) return lerp(YK[i - 1][1], YK[i][1], (y - YK[i - 1][0]) / (YK[i][0] - YK[i - 1][0])); return YK[YK.length - 1][1]; };
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
  // Road sections: wherever a ring road actually reaches the plinth edge. Walk widths follow the layout convention (walk[0] toward the negative axis).
  const edgeEnds = RING_ROADS.flatMap((r) => [r.pts[0], r.pts[r.pts.length - 1]].filter(([x, z]) => Math.max(Math.abs(x), Math.abs(z)) >= H - 1e-3).map(([x, z]) => {
    const fn = z >= H - 1e-3 ? S.pz : x >= H - 1e-3 ? S.px : z <= -H + 1e-3 ? S.nz : S.nx, along = Math.abs(z) >= H - 1e-3 ? x : z;
    const span = (lo, hi) => [fn(lo), fn(hi)].sort((a, b) => a - b), hw = r.w / 2;
    return { id: r.id, r, s: fn(along), road: span(along - hw - r.walk[0], along + hw + r.walk[1]), asphalt: span(along - hw, along + hw) };
  }));
  const ROADS = edgeEnds.map((e) => e.road);        // road + sidewalks reach the wall here
  const ASPHALT = edgeEnds.map((e) => e.asphalt);   // carriageway proper
  const RAILS = [[S.pz(RAIL.bed.x[0]), S.pz(RAIL.bed.x[1])], [S.nz(RAIL.bed.x[1]), S.nz(RAIL.bed.x[0])]]; // the line runs off both ±z walls
  const OUT = RIVER.outfall, NOTCH = [S.pz(OUT.x[0]), S.pz(OUT.x[1])], SILL_Y = RIVER.y - 0.1; // the canal leaves through the +z wall
  const smoothstep01 = (t) => { const k = clamp(t); return k * k * (3 - 2 * k); };
  const BARE = [...ROADS, ...RAILS, NOTCH].sort((a, b) => a[0] - b[0]);  // perimeter runs without a turf lip
  // Hand-laid per side, in world coordinates along that wall. Helpers keep each list in ascending s.
  const onPz = (a, b, ...r) => [S.pz(Math.min(a, b)), S.pz(Math.max(a, b)), ...r], onPx = (a, b, ...r) => [S.px(Math.max(a, b)), S.px(Math.min(a, b)), ...r];
  const onNz = (a, b, ...r) => [S.nz(Math.max(a, b)), S.nz(Math.min(a, b)), ...r], onNx = (a, b, ...r) => [S.nx(Math.min(a, b)), S.nx(Math.max(a, b)), ...r];
  // Rebar bites in the concrete, [from,to,depth]: long ruins and small pulls, never evenly spaced
  const BITES = [
    onPz(-37.2, -34.6, 0.7), onPz(-29.5, -24.2, 1.05), onPz(-9.6, -5.6, 0.9), onPz(-1.4, 1.2, 0.7), onPz(5.2, 10.8, 1.1), onPz(23.0, 26.4, 0.8), onPz(30.6, 35.4, 1.0), onPz(37.1, 38.6, 0.5),
    onPx(36.8, 34.2, 0.7), onPx(27.6, 23.0, 1.0), onPx(18.2, 15.6, 0.75), onPx(9.4, 5.2, 1.1), onPx(-1.8, -4.6, 0.7), onPx(-11.4, -16.0, 1.05), onPx(-20.8, -23.2, 0.6), onPx(-34.0, -37.6, 0.85),
    onNz(36.4, 33.2, 0.8), onNz(28.2, 23.0, 1.05), onNz(12.8, 11.0, 0.5), onNz(-3.2, -6.8, 0.9), onNz(-13.0, -18.4, 1.1), onNz(-24.0, -26.6, 0.65), onNz(-33.8, -38.0, 0.9),
    onNx(-37.0, -34.6, 0.6), onNx(-29.4, -24.2, 1.05), onNx(-18.4, -15.2, 0.8), onNx(-8.0, -5.2, 0.7), onNx(10.6, 15.8, 1.1), onNx(19.0, 22.4, 0.75), onNx(34.8, 38.2, 0.85),
  ];
  // Washed-out gullies through the rubble and earth: [centre s, half-width, depth]
  const GULLIES = [
    [S.pz(-32), 2.6, 1.3], [S.pz(-21), 1.5, 0.8], [S.pz(-3.4), 3.2, 1.5], [S.pz(12.0), 1.3, 0.8], [S.pz(21), 2.0, 1.1], [S.pz(28), 1.2, 0.7], [S.pz(36), 2.2, 1.2],
    [S.px(38), 1.5, 0.9], [S.px(31), 2.8, 1.4], [S.px(20.6), 1.4, 0.8], [S.px(12.4), 3.0, 1.6], [S.px(2), 1.6, 0.9], [S.px(-8), 2.4, 1.3], [S.px(-18), 1.4, 0.8], [S.px(-27), 2.1, 1.1], [S.px(-33), 1.6, 0.9],
    [S.nz(38), 1.8, 1.0], [S.nz(31), 2.4, 1.2], [S.nz(21), 1.5, 0.8], [S.nz(-1), 2.8, 1.5], [S.nz(-9), 1.5, 0.8], [S.nz(-21), 2.2, 1.2], [S.nz(-31), 2.6, 1.3],
    [S.nx(-32.5), 2.6, 1.3], [S.nx(-21.5), 2.0, 1.1], [S.nx(-11.6), 1.6, 0.9], [S.nx(-2), 2.0, 1.1], [S.nx(16), 2.8, 1.5], [S.nx(24.6), 1.5, 0.8], [S.nx(33), 2.4, 1.2],
  ];
  // Faults: the deep bands jump here, [s, throw]. Everything above the slab rides over them.
  const FAULTS = [[S.pz(-26.8), 0.55], [S.pz(4.0), -0.4], [S.pz(28.8), 0.5], [S.px(21.6), -0.5], [S.px(-6.8), 0.6], [S.px(-30.2), -0.4], [S.nz(16.4), 0.5], [S.nz(-11), -0.6], [S.nx(-20), 0.5], [S.nx(26), -0.5]];
  const faultAt = (s) => { let v = 0; for (const [c, a] of FAULTS) { let d = s - c; if (d > PER / 2) d -= PER; if (d < -PER / 2) d += PER; v += a * (smoothstep01((d + 0.3) / 0.6) - 0.5) * Math.exp(-((d / 16) ** 2)); } return v; };

  // ---------- materials (each is one draw call) ----------
  const opaque = { vertexColors: true, color: '#ffffff' };
  const mats = {
    asph: ctx.surface('asphalt', { ...opaque, moss: 0, emissive: '#444a54', emissiveIntensity: 0.3 }),
    conc: ctx.surface('concrete', { ...opaque, moss: 0.1, emissive: '#56637a', emissiveIntensity: 0.42 }),
    soil: ctx.surface('soil', { ...opaque, moss: 0, emissive: '#6b5a48', emissiveIntensity: 0.34 }),
    rust: ctx.surface('rust', { vertexColors: true, color: '#ffffff', emissive: '#5a2a1a', emissiveIntensity: 0.3 }),
    flat: ctx.surface('flat', { vertexColors: true, emissive: '#3a4a50', emissiveIntensity: 0.3 }),
    root: ctx.toon({ vertexColors: true, emissive: '#5a4436', emissiveIntensity: 0.36 }),
    leaf: ctx.toon({ vertexColors: true, side: THREE.DoubleSide, translucent: 0.8, emissive: '#1d5a44', emissiveIntensity: 0.3 }),
  };
  mats.fol = mats.leaf;
  mats.under = ctx.toon({ vertexColors: true, emissive: '#16302f', emissiveIntensity: 0.3, dapple: false }); // the shaded belly, cool and flat
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
  const EDGE = plinthEdge(ctx), edgeFall = (y) => clamp(1 + (y + 0.3) / 2.6);   // the crumbled top edge, shared with outskirts.js; it slopes back out toward the sound body lower down
  const W = (s, d0, y) => {
    const d = d0 + EDGE.inset(s) * edgeFall(y), [x, z] = sq(s), sum = Math.abs(x) + Math.abs(z), L = SIDE - chamfer(s, y), k = sum > L ? L / sum : 1, f = k * (1 - d / H);
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
  const UND = { // strata warp: the layers were bent when the block tore loose, and the deep ones have faulted
    concB: (s) => 0.05 * Math.sin(ang(s) * F(11) + 0.6),
    rubB: (s) => 0.3 * Math.sin(ang(s) * F(7) + 1) + 0.14 * Math.sin(ang(s) * F(17) + 2) + faultAt(s) * 0.7,
    clayB: (s) => 0.3 * Math.sin(ang(s) * F(7) + 1.1) + 0.08 * Math.sin(ang(s) * F(23) + 1) + faultAt(s) * 0.75,
    e1B: (s) => 0.42 * Math.sin(ang(s) * F(9) + 2.2) + 0.15 * Math.sin(ang(s) * F(21)) + faultAt(s),
    e2B: (s) => 0.5 * Math.sin(ang(s) * F(6) + 4) + 0.16 * Math.sin(ang(s) * F(19) + 1) + faultAt(s),
    e3B: (s) => 0.12 * Math.sin(ang(s) * F(13) + 3),
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
    const endFace = (q, sign) => { // close a block where the band stops, so the end doesn't show the hollow behind it
      const c = q.c.clone().multiplyScalar(0.8);
      for (let r = 0; r < nr - 1; r++) {
        const v0 = vert(q, r), v1 = vert(q, r + 1), a = inner(q, v0[1], q.rows[r][1]), b = inner(q, v1[1], q.rows[r + 1][1]);
        if (sign < 0) mb.quad(v0, a, b, v1, c); else mb.quad(v0, v1, b, a, c);
      }
    };
    for (let i = 0; i < last; i++) {
      const a = cols[i], b = cols[(i + 1) % m], same = a.bi === b.bi;
      if (gapAt && gapAt((a.s + b.s) / 2)) { // a cut in the ring: both faces of the cut get closed
        if (!(i > 0 && gapAt((cols[i - 1].s + a.s) / 2))) endFace(a, 1);
        if (!gapAt((b.s + cols[(i + 2) % m].s) / 2)) endFace(b, -1);
        continue;
      }
      const c = same ? a.c : (a.d > b.d ? a.c : b.c).clone().multiplyScalar(0.8);
      for (let r = 0; r < nr - 1; r++) mb.quad(vert(a, r), vert(a, r + 1), vert(b, r + 1), vert(b, r), (rowColor && rowColor(a, b, r)) || c);
      const at = vert(a, 0), bt = vert(b, 0), ab = vert(a, nr - 1), bb = vert(b, nr - 1);
      mb.quad(at, bt, inner(b, bt[1], b.rows[0][1]), inner(a, at[1], a.rows[0][1]), same ? a.ct : c);
      mb.quad(ab, inner(a, ab[1], a.rows[nr - 1][1]), inner(b, bb[1], b.rows[nr - 1][1]), bb, c.clone().multiplyScalar(under));
    }
    if (!closed) { endFace(cols[0], -1); endFace(cols[m - 1], 1); }
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
    ring({ mb: mbs.flat, from: a, to: b, y0: () => 0.035, y1: () => -0.05, len: [0.4, 1.3], step: 0.34, depth: (s, r) => -0.17 - r * 0.05, color: (s, r) => pick(r, [P.moss, P.grass, P.mossLit, P.moss, P.mossDeep]), capTo: 0.1, yj: 0.012, jit: 0.015, prof: 0, rows: () => [[0, 0], [0.6, 0], [1, 0.05]], lobe: 0.26 });
  }
  // Asphalt course
  ring({
    mb: mbs.asph, y0: (s) => (railAt(s) ? 0.045 : B('asphT', s)), y1: (s) => B('asphB', s) - 0.02, len: [0.6, 1.9], step: 0.85, shear: 0.16, capTo: 0.17, jit: 0.035, yj: 0.05, gap: inNotch,
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
    mb: mbs.soil, y0: (s) => B('concB', s) + 0.07, y1: (s) => B('rubB', s), len: [0.8, 2.1], step: 0.95, cap: 1.0, jit: 0.07, yj: 0.08, shear: 0.4, blockBot: (r) => (r - 0.5) * 0.24,
    depth: (s, r) => taper(Y(-1.9)) + cave(s) * 0.85 + bite(s) * 0.4 + gully(s) * 0.55 + r * 0.26 + wob(s) * 0.08,
    color: (s, r) => pick(r, ['#c9bda6', '#bbae98', '#d3c7b0', '#ad9f8a']),
    capTop: (s, r) => (r < 0.45 ? P.mossLit : '#e0d4bc'),
  });
  // A buried older street: a thin dark clay seam with a course of pale setts, the block's own archaeology.
  ring({
    mb: mbs.soil, y0: (s) => B('rubB', s) + 0.08, y1: (s) => B('clayB', s), len: [0.7, 1.9], step: 0.85, cap: 1.0, jit: 0.05, yj: 0.05, shear: 0.3,
    depth: (s, r) => taper(Y(-2.3)) + cave(s) * 0.86 + gully(s) * 0.8 + r * 0.2 + wob(s) * 0.14 - 0.04,
    color: (s, r) => pick(r, ['#d8ccb2', '#c9bda5', '#e2d7be', '#7b6a5c', '#d0c4ab']),
    capTop: (s, r) => (r < 0.3 ? P.mossLit : '#ece1c8'),
  });
  // Earth, in three warm bands, tearing inward toward the bottom
  ring({
    mb: mbs.soil, y0: (s) => B('clayB', s) + 0.08, y1: (s) => B('e1B', s), len: [1.2, 3.2], step: 1.1, cap: 1.1, jit: 0.08, yj: 0.09, shear: 0.5, blockBot: (r) => (r - 0.5) * 0.28,
    depth: (s, r) => taper(Y(-2.6)) + cave(s) * 0.9 + gully(s) + r * 0.42 + wob(s) * 0.25,
    color: (s, r) => pick(r, ['#b98a5e', '#a97c53', '#c4966a', '#b1815a']),
    capTop: (s, r) => (r < 0.5 ? P.moss : '#c2a079'),
  });
  ring({
    mb: mbs.soil, y0: (s) => B('e1B', s) + 0.1, y1: (s) => B('e2B', s), len: [1.1, 3.0], step: 1.1, cap: 1.2, jit: 0.1, yj: 0.11, shear: 0.45, blockBot: (r) => (r - 0.5) * 0.28,
    depth: (s, r) => taper(Y(-2.9)) + cave(s) * 0.7 + gully(s) * 1.1 + r * 0.55 + wob(s) * 0.42,
    color: (s, r) => pick(r, ['#9c7350', '#8e6849', '#a87e56', '#7f5d45']),
    capTop: (s, r) => (r < 0.4 ? P.mossDeep : '#a5825f'),
  });
  const e3 = ring({
    mb: mbs.soil, y0: (s) => B('e2B', s) + 0.1, y1: (s) => B('e3B', s), len: [0.9, 2.4], step: 0.95, cap: 1.4, jit: 0.12, yj: 0.14, shear: 0.3,
    depth: (s, r) => taper(Y(-3.2)) + cave(s) * 0.5 + gully(s) * 1.1 + r * 0.7 + wob(s) * 0.55,
    color: (s, r) => pick(r, ['#7f6350', '#725849', '#8a6d57', '#664f43']),
    capTop: () => '#9a7d62',
    blockBot: (r) => (r < 0.22 ? 0.34 : r > 0.8 ? -0.26 : 0),
  });
  // Lenses of river gravel caught in the earth, in the warm bands: partial spans, so the section isn't a stack of parallel stripes.
  for (const [a, b] of [[S.pz(-38), S.pz(-22)], [S.pz(-8), S.pz(11)], [S.pz(22), S.pz(36)], [S.px(35), S.px(15)], [S.px(8), S.px(-3)], [S.px(-13), S.px(-33)], [S.nz(36), S.nz(23)], [S.nz(0), S.nz(-18)], [S.nx(-37), S.nx(-22)], [S.nx(11), S.nx(29)]]) {
    const yc = lerp(B('e1B', a), B('e2B', a), 0.42);
    ring({
      mb: mbs.soil, from: a, to: b, y0: (s) => yc + faultAt(s) * 0.9 + 0.2 * Math.sin(s * 0.2), y1: (s) => yc + faultAt(s) * 0.9 - 0.34 + 0.2 * Math.sin(s * 0.2), len: [0.5, 1.5], step: 0.6, cap: 0.5, jit: 0.04, yj: 0.05, shear: 0.2,
      depth: (s, r) => taper(Y(-2.72)) + gully(s) * 1.05 + r * 0.42 + wob(s) * 0.34 - 0.1,
      color: (s, r) => pick(r, ['#c6bca6', '#ae9f88', '#d5cab4', '#9d8c76']), capTop: (s, r) => (r < 0.4 ? P.mossLit : '#d6ccb4'),
    });
  }

  // Underside: not a lid but the torn root-ball of the block. Terraced, faceted earth in deep cool shade, sagging toward the middle, with clods and roots hanging out of it.
  rng = ctx.seeded('base-underside');
  const hash2 = (x, z) => { const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return h - Math.floor(h); };
  const vnoise = (x, z) => {
    const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi, sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
    return lerp(lerp(hash2(xi, zi), hash2(xi + 1, zi), sx), lerp(hash2(xi, zi + 1), hash2(xi + 1, zi + 1), sx), sz);
  };
  /** The relief proper, g = 0 at the wall, 1 well inside. Ledges come from terracing the noise: flat runs, then a short steep riser. */
  const underY = (x, z, g) => {
    const v = 0.6 * vnoise(x * 0.085 + 3, z * 0.085) + 0.3 * vnoise(x * 0.21, z * 0.21 + 7) + 0.1 * vnoise(x * 0.55 + 5, z * 0.55);
    const q = v * 5, f = q - Math.floor(q), n = (Math.floor(q) + smoothstep01((f - 0.7) / 0.3)) / 5;
    const ridge = Math.pow(1 - Math.abs(2 * vnoise(x * 0.16 + 9, z * 0.16 + 2) - 1), 3);
    return -5.7 - g * (0.25 + 4.6 * n) - g * ridge * 1.1 + (hash2(x * 3.1, z * 3.1) - 0.5) * 0.22;
  };
  const colAt = (s) => {
    const c = e3.cols, q = modP(s); let lo = 0, hi = c.length - 1;
    if (q < c[0].s || q > c[hi].s) return c[0];
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m].s <= q) lo = m; else hi = m; }
    return q - c[lo].s < c[hi].s - q ? c[lo] : c[hi];
  };
  const botAt = (s) => { const c = colAt(s); return e3.y1(c.s) + c.bj; }; // the deep band's real bottom edge at s
  const underFace = (mb, a, b, c, col) => { // always facing down
    const ux = b[0] - a[0], uz = b[2] - a[2], vx = c[0] - a[0], vz = c[2] - a[2], ny = uz * vx - ux * vz;
    if (ny < 0) mb.tri(a, b, c, col); else mb.tri(a, c, b, col);
  };
  const UNDER_COLS = ['#7a827e', '#68716d', '#59625e', '#4a5350', '#8c9186'].map(C); // lit only by the teal sky-bounce from below: these greys land near #243837 on screen
  const underCol = (a, b, c) => { // value steps by height and a coarse patch noise, so shapes read as planes of rock, not noise
    const y = (a[1] + b[1] + c[1]) / 3, x = (a[0] + b[0] + c[0]) / 3, z = (a[2] + b[2] + c[2]) / 3;
    const k = clamp((y + 9.6) / 3.8) + (vnoise(x * 0.3 + 1, z * 0.3) - 0.5) * 0.5;
    return UNDER_COLS[k < 0.22 ? 3 : k < 0.5 ? 2 : k < 0.78 ? 1 : k < 0.98 ? 0 : 4];
  };
  mbs.under = new MB(THREE);
  {
    const Ds = [-0.9, 0, 1.8, 3.6, 5.6, 7.8, 10.2, 12.8, 15.6, 18.6, 21.8, 25.2, 28.8, 32.4], nOf = (i) => (i < 6 ? 192 : i < 9 ? 96 : i < 12 ? 48 : 24);
    const rows = Ds.map((D, i) => {
      const n = nOf(i), row = [];
      for (let j = 0; j < n; j++) {
        const s = (PER * j) / n, c = colAt(s), d = Math.min(c.d + 1 + D, H * 0.97), p = W(s, d, -5.5), bot = botAt(s), jit = D > 0 ? 0.55 : 0;
        const x = p[0] + (hash2(i * 3.3, j * 1.7) - 0.5) * jit, z = p[2] + (hash2(i * 1.9, j * 4.3) - 0.5) * jit;
        const y = D < 0 ? bot + 0.5 : lerp(bot + 0.1, underY(x, z, 1), smoothstep01(D / 9));
        row.push([x, y, z]);
      }
      return row;
    });
    for (let i = 0; i < rows.length - 1; i++) {
      const a = rows[i], b = rows[i + 1], na = a.length, nb = b.length;
      if (na === nb) for (let j = 0; j < na; j++) {
        const a0 = a[j], a1 = a[(j + 1) % na], b0 = b[j], b1 = b[(j + 1) % nb];
        if ((i + j) % 2) { underFace(mbs.under, a0, a1, b1, underCol(a0, a1, b1)); underFace(mbs.under, a0, b1, b0, underCol(a0, b1, b0)); }
        else { underFace(mbs.under, a0, a1, b0, underCol(a0, a1, b0)); underFace(mbs.under, a1, b1, b0, underCol(a1, b1, b0)); }
      } else for (let j = 0; j < nb; j++) { // the outer row has twice the columns
        const a0 = a[j * 2], a1 = a[(j * 2 + 1) % na], a2 = a[(j * 2 + 2) % na], b0 = b[j], b1 = b[(j + 1) % nb];
        underFace(mbs.under, a0, a1, b0, underCol(a0, a1, b0)); underFace(mbs.under, a1, a2, b1, underCol(a1, a2, b1)); underFace(mbs.under, a1, b1, b0, underCol(a1, b1, b0));
      }
    }
    const last = rows[rows.length - 1], c0 = [0, underY(0, 0, 1), 0];
    for (let j = 0; j < last.length; j++) { const a = last[j], b = last[(j + 1) % last.length]; underFace(mbs.under, a, b, c0, underCol(a, b, c0)); }
  }
  // Clods torn out with the block, in clusters; each sits half inside the relief it hangs from.
  const underClusters = Array.from({ length: 9 }, () => { const a = rng() * TAU, k = rng.range(6, 27); return [Math.cos(a) * k, Math.sin(a) * k, rng.range(3, 7)]; });
  const underPoint = () => { const [cx, cz, rad] = rng.pick(underClusters), a = rng() * TAU, k = Math.sqrt(rng()) * rad, x = cx + Math.cos(a) * k, z = cz + Math.sin(a) * k; return [x, underY(x, z, 1), z]; };
  for (let i = 0; i < 52; i++) {
    const [x, y, z] = underPoint(), r = Math.pow(rng(), 1.8) * 1.5 + 0.35;
    add('under', faceted(kit.rock(r, rng, rng.range(0.85, 1.5), r > 1 ? 1 : 0)), { pos: [x, y - r * 0.3, z], rot: [rng() * 0.5, rng() * 6, rng() * 0.5], color: rng() < 0.18 ? '#7d7662' : rng.pick(['#5a635f', '#4c5551', '#3e4744']) });
  }

  // Hidden solid core, kept below the ground plates and above the relief.
  const coreY = BASE.coreTopY, coreB = -5.0;
  add('soil', kit.box(SIDE - 7.5, coreY - coreB, SIDE - 7.5).translate(0, (coreY + coreB) / 2, 0), { color: P.soilDark });
  add('soil', kit.box(SIDE - 13.5, 0.75, SIDE - 13.5).translate(0, coreB - 0.375, 0), { color: P.soilDark }); // backs the soil joints below the core. Inset, so it stays behind the deepest gullies in the wall (the big box would show in them); its bottom stays above the relief (highest point -5.84 inside this footprint)
  add('soil', kit.box(SIDE - 2.8, 0.8, SIDE - 2.8).translate(0, coreY - 0.4, 0), { color: P.soilDark });

  const yawAt = (s) => yawOut[sideOf(s)];
  const atFace = (s, d, y, rx = 0, rz = 0, ry = 0) => kit.xf({ pos: W(s, d, y), rot: [rx, yawAt(s) + ry, rz] }); // +x along the wall, +z outward
  rng = ctx.seeded('base-stones');
  // ---------- broken chunks and embedded stones ----------
  const stoneCols = [P.concreteLit, P.concrete, P.concreteMid, '#d6ccb4', '#c7baa2'];
  for (let i = 0, n = N(70); i < n; i++) { // rubble-layer stones
    const s = rng.range(0, PER), y = rng.range(Y(-2.1), -1.5) + (1 - crown(s)) * 0.14, d = insetAt(s, y), r = Math.pow(rng(), 2) * 0.24 + 0.1;
    const col = rng.pick(stoneCols);
    add('flat', faceted(kit.rock(r, rng, rng.range(0.6, 0.9), 0)), { pos: W(s, d - r * 0.25, y), rot: [rng() * 3, rng() * 6, rng() * 3], color: col });
  }
  for (let i = 0, n = N(24); i < n; i++) { // brick fragments: this was somebody's wall
    const s = rng.range(0, PER), y = rng.range(Y(-2.05), -1.7), d = insetAt(s, y);
    add('flat', chunk(0.42, 0.16, 0.2, 0.03), { matrix: atFace(s, d - 0.05, y, rng.range(-0.4, 0.4), rng.range(-0.6, 0.6), rng.range(-0.5, 0.5)), color: rng.pick([P.fadedRed, '#b5614a', P.rust, '#c97a5e']) });
  }
  for (let i = 0, n = N(56); i < n; i++) { // stones in the earth: some real boulders
    const s = rng.range(0, PER), y = rng.range(Y(-3.3), Y(-2.3)), d = insetAt(s, y), r = rng() < 0.2 ? rng.range(0.5, 0.95) : rng.range(0.14, 0.42);
    add('flat', faceted(kit.rock(r, rng, 0.7, 0)), { pos: W(s, d - r * 0.2, y), rot: [rng() * 3, rng() * 6, 0], color: rng() < 0.3 ? '#b5ab98' : rng.pick(['#a58a70', '#94806c', '#7f6c5a']) });
  }
  for (let i = 0, n = N(46); i < n; i++) { // bottom clods: the block's underside drips soil. Each one is seated on the deep band's real bottom edge, half inside it.
    const s = rng.range(0, PER), c = colAt(s), r = rng.range(0.16, 0.42);
    add('soil', faceted(kit.rock(r, rng, rng.range(1.0, 1.6), 0)), { pos: W(s, c.d + rng.range(0.15, 0.55), e3.y1(c.s) + c.bj - r * rng.range(0.05, 0.4)), rot: [rng() * 3, rng() * 6, 0], color: rng.pick(['#6b5345', '#5f4a40', '#735a49']) });
  }
  for (let i = 0, n = N(50); i < n; i++) { // loose asphalt and concrete flakes slumped over the seams
    const s = rng.range(0, PER), asph = rng() < 0.45;
    if (bite(s) || inNotch(s) || railAt(s)) continue;
    const y = asph ? lerp(B('asphT', s), B('concT', s), rng.range(0.55, 1.1)) : lerp(B('concT', s), B('concB', s), rng.range(0.3, 0.95));
    const w = rng.range(0.6, 1.5), h = rng.range(0.24, asph ? 0.36 : 0.66), de = asph ? 0.2 : rng.range(0.24, 0.36);
    add(asph ? 'asph' : 'conc', shard(w, h, de), { matrix: atFace(s, Math.min(0.06, insetAt(s, y)) - 0.08, y, rng.range(-0.1, 0.24), rng.range(-0.22, 0.22), rng.range(-0.2, 0.2)), color: asph ? rng.pick(['#62676f', '#6c7078', '#757a82']) : rng.pick([P.concreteLit, P.concrete]) });
  }

  rng = ctx.seeded('base-rebar');
  // ---------- rebar ----------
  const rust = [P.rust, P.rustLit, P.rustLit, '#c4633a', P.rust];
  const bar = (pts, r = 0.048) => add('rust', kit.tube(pts, r, r * 0.86, 3, Math.max(4, Math.ceil(pts.length * 1.4)), { capEnds: false }), { color: rng.pick(rust) });
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
    for (let q = a + 0.2, pitch = rng.range(0.4, 1.05); q < b; q += pitch * rng.range(0.5, 1.8)) { // stirrups across, some snapped outward
      const y = rng.pick(ys) + rng.range(-0.03, 0.03);
      if (rng() < 0.5) pokeBar(q, y, rng.range(0.55, 1.5) + dep * 0.3, dep * 0.75);
      else bar([W(q, dep * 0.8, ys[0] + 0.1), W(q, dep * 0.45, ys[0]), W(q + 0.03, dep * 0.45, ys[1]), W(q, dep * 0.8, ys[1] - 0.1)], 0.046);
    }
  }
  for (let i = 0, n = N(16); i < n; i++) { // strays wherever the slab has snapped
    const s = rng.range(0, PER); if (bite(s) || inNotch(s)) continue;
    pokeBar(s, lerp(B('concM', s), B('concB', s), rng.range(0.25, 0.75)), rng.range(0.25, 0.75));
  }

  // ---------- severed road ends ----------
  /** A snapped deck slab: asphalt over concrete, hinged on the wall, sagging out over the void. Every slab tears along its own line. */
  function deckSlab({ s, w, len, tilt, roll = 0, d = -0.03, y = -0.03, paint = null, yaw = 0, pitch = 0.36, tethers = 3 }) {
    const M = atFace(s, d, y - Math.abs(roll) * w * 0.5 - 0.02, tilt, roll, yaw);
    const nb = rng.int(3, 7), tear = [];
    for (let i = 0; i <= nb; i++) tear.push([lerp(w * 0.5, -w * 0.5, i / nb) + rng.range(-0.08, 0.08) * w, len * (i === 0 || i === nb ? rng.range(0.32, 0.74) : rng.range(0.55, 1.08))]);
    const o = [[-w / 2, 0.02], [w / 2, 0.02], ...tear];
    const a = kit.jag(o, 0.45, 0.1, rng), c = kit.jag(o.map(([x, z]) => [x * 0.93, z * rng.range(0.74, 0.9) - 0.03]), 0.5, 0.12, rng);
    add('asph', faceted(kit.plate(a, [], 0, 0.3)), { matrix: M, color: '#6c7078' });
    add('asph', faceted(kit.plate(a, [], -0.3, 0.1)), { matrix: M, color: '#7d8087' });
    add('conc', faceted(kit.plate(c, [], -0.4, 0.5)), { matrix: M, color: P.concrete });
    if (paint) for (const [x0, x1, z0, z1, col = P.paint] of paint) add('flat', faceted(kit.plate(kit.jag([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], 0.3, 0.025, rng), [], 0.012, 0.012)), { matrix: M, color: col });
    const v = new V();
    for (let i = 0; i < tethers; i++) { // rebar still tethering the slab to the wall
      const x = rng.range(-w * 0.45, w * 0.45), p = (z) => { v.set(x, -0.62, z).applyMatrix4(M); return [v.x, v.y, v.z]; };
      bar([W(s + x, 0.3, Math.min(-0.82, y - 0.82)), p(0.02), p(len * rng.range(0.3, 0.55))]);
    }
    for (let x = -w * 0.46 + rng.range(0, pitch); x < w * 0.46; x += pitch * rng.range(0.45, 1.9)) { // bars sticking out of the snapped front edge, on this road's own spacing, with gaps where they tore out
      if (rng() < 0.3) continue;
      const l = Math.pow(rng(), 1.6) * 0.8 + 0.14, z0 = len * rng.range(0.58, 0.8), droop = rng.range(0.03, 0.4), p = (z, yy) => { v.set(x, yy, z).applyMatrix4(M); return [v.x, v.y, v.z]; };
      bar([p(len * 0.42, -0.62), p(z0 + l * 0.2, -0.62), p(z0 + l * 0.6, -0.62 - droop * 0.3), p(z0 + l, -0.62 - droop)]);
    }
  }
  for (const e of edgeEnds) {
    rng = ctx.seeded(`base-roadend-${e.id}-${Math.round(e.s)}`); // each road end breaks its own way
    const [a, b] = e.asphalt, w = b - a, wide = w > 4, pitch = rng.range(0.16, 0.56), tethers = rng.int(1, 4);
    let f = rng.range(0, wide ? 0.14 : 0.1);
    while (f < 0.86) {
      const pw = rng.range(wide ? 0.14 : 0.26, wide ? 0.42 : 0.62), f1 = Math.min(0.98, f + pw);
      if (f1 - f > 0.12) {
        const sw = (f1 - f) * w, s = a + ((f + f1) / 2) * w, len = rng.range(0.42, 1.7) * (0.65 + sw * 0.28), tilt = rng.range(0.14, 0.66), roll = rng.range(-0.13, 0.13), lane = wide && f < 0.3 && rng() < 0.7;
        deckSlab({ s, w: sw * rng.range(0.82, 0.98), len, tilt, roll, pitch, tethers, yaw: rng.range(-0.08, 0.08), paint: lane ? [[-sw * 0.45, -sw * 0.33, 0.02, len * 0.85, e.id === 'north' ? P.fadedYellow : P.paint]] : null });
      }
      f = f1 + (rng() < 0.45 ? rng.range(0.03, 0.2) : 0.012);
    }
  }
  rng = ctx.seeded('base-services');
  // A slab that fell and was caught in the roots.
  deckSlab({ s: S.nx(-4.6), w: 1.8, len: 1.1, tilt: 0.86, roll: 0.3, d: 0.72, y: -1.74, yaw: 0.2 });
  deckSlab({ s: S.nz(-3.6), w: 1.5, len: 0.9, tilt: 0.7, roll: -0.25, d: 0.8, y: -1.9, yaw: -0.3 });
  // Curb cross-sections: pale stones at the road edges, the sidewalk paving between them.
  for (const s of edgeEnds.filter((e) => e.r.walk[0] || e.r.walk[1]).flatMap((e) => e.asphalt)) {
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
    const w = 2.3, h = 1.3, M = atFace(s, insetAt(s, y) - 0.22, y);
    const holes = [[-0.66, 0.3], [0.02, 0.3], [0.7, 0.3], [-0.66, -0.3], [0.02, -0.3], [0.7, -0.3]];
    const outline = kit.jag([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]], 0.5, 0.05, rng);
    add('conc', faceted(kit.wallPanel(outline, holes.map(([x, yy]) => kit.circlePts(x, yy, 0.21, 8)), 0.7)), { matrix: M, color: P.concreteMid });
    add('flat', kit.box(w * 0.98, h * 0.98, 0.04).translate(0, 0, -0.18), { matrix: M, color: WALLDARK });
    const cols = [P.sunWarm, P.fadedBlue, P.concreteLit, P.sunWarm, P.fadedRed, P.fadedBlue];
    holes.forEach(([x, yy], i) => {
      if (i === 3) return;
      const l = rng.range(0.15, 0.55), g = kit.cyl(0.19, 0.19, l, 9, true).rotateX(Math.PI / 2).translate(x, yy, 0.3 + l / 2);
      add('flat', new THREE.BufferGeometry().copy(g), { matrix: M, color: cols[i] });
      add('flat', new THREE.CircleGeometry(0.175, 9).translate(x, yy, 0.3), { matrix: M, color: WALLDARK });
      if (i % 2 === 0) for (let k = 0; k < 2; k++) { // loose cable
        const v = new V(x + rng.range(-0.05, 0.05), yy + rng.range(-0.05, 0.05), 0.3 + l).applyMatrix4(M), o = outward[sideOf(s)], ox = o[0], oz = o[1], dr = rng.range(0.4, 1.0), t = tangent[sideOf(s)], lat = rng.range(-0.3, 0.3);
        add('flat', kit.tube([[v.x, v.y, v.z], [v.x + ox * 0.2, v.y + 0.02, v.z + oz * 0.2], [v.x + ox * 0.34 + t[0] * lat * 0.5, v.y - dr * 0.5, v.z + oz * 0.34 + t[1] * lat * 0.5], [v.x + ox * 0.3 + t[0] * lat, v.y - dr, v.z + oz * 0.3 + t[1] * lat]], 0.04, 0.034, 3, 6), { color: rng.pick([P.red, P.fadedYellow, '#3b6f76', P.sunGold]) });
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
  // Under the slab: drains, ducts, mains. Deep down: a culvert or two, and the brick sewer of an older town.
  function brickArch(s, y, r, grille = false) {
    let d0 = 9; for (let q = -r - 0.6; q <= r + 0.6; q += 0.4) for (const dy of [-0.2, 0.3, r]) d0 = Math.min(d0, insetAt(s + q, y + dy));
    const M = atFace(s, d0 - 0.24, y), place = (g, o, color) => add('flat', g, { matrix: new THREE.Matrix4().multiplyMatrices(M, kit.xf(o)), color });
    const brick = [P.fadedRed, '#b5614a', '#c97a5e', P.rust, '#a9583f'];
    for (let ring = 0; ring < 2; ring++) for (let i = 0, n = 15 + ring * 5, R = r + ring * 0.3; i <= n; i++) {
      const a = lerp(-0.3, Math.PI + 0.3, i / n);
      place(chunk(0.28, (R * 3.4) / n, 0.42, 0.015), { pos: [Math.cos(a) * R, Math.sin(a) * R, 0.02 * ring], rot: [0, 0, a], }, rng.pick(brick));
    }
    for (let x = -r - 0.7; x < r + 0.7; x += 0.46) place(chunk(0.44, 0.22, 0.42, 0.015), { pos: [x + rng.range(-0.04, 0.04), -0.26 + rng.range(-0.02, 0.02), 0.02] }, rng.pick(brick));
    place(new THREE.CircleGeometry(r * 0.98, 20, 0, Math.PI), { pos: [0, -0.02, -0.14] }, WALLDARK);
    place(kit.box(2 * r * 0.98, 0.28, 0.02), { pos: [0, -0.16, -0.14] }, WALLDARK);
    for (let i = 0; i < 5; i++) { const x = rng.range(-r * 0.8, r * 0.8); place(faceted(kit.rock(rng.range(0.1, 0.22), rng, 0.5, 0)), { pos: [x, -0.08, 0.1] }, rng.pick([P.moss, P.mossDeep, '#5a4636'])); }
    for (let i = 0; i < 6; i++) { const a = rng.range(0.2, Math.PI - 0.2), l = rng.range(0.5, 1.3); place(kit.tube([[Math.cos(a) * r, Math.sin(a) * r, 0.05], [Math.cos(a) * r * 0.96, Math.sin(a) * r - l * 0.5, 0.1], [Math.cos(a) * r * 0.95, Math.sin(a) * r - l, 0.08]], 0.03, 0.012, 3, 6), {}, '#7c9b57'); }
    if (grille) for (let x = -r * 0.78; x <= r * 0.8; x += r * rng.range(0.24, 0.34)) { const top = Math.sqrt(Math.max(0.02, r * r - x * x)) - 0.04; if (rng() < 0.82) place(kit.cyl(0.05, 0.05, top + 0.3 - (rng() < 0.3 ? rng.range(0.2, 0.7) : 0), 5).translate(0, (top - 0.3) / 2, 0), { pos: [x, 0, 0.14] }, P.rustDark); } // a bent sewer grille, some bars gone
  }
  /** Depth of the outermost wall in a window around (s,y), so a landmark seats flush however bitten the face is. */
  const faceAt = (s, y, hw, hh) => { let d0 = 9; for (let q = -hw; q <= hw; q += 0.4) for (const dy of [-hh, 0, hh]) d0 = Math.min(d0, insetAt(s + q, y + dy)); return d0; };
  /** -z wall: the bored metro tunnel the block was torn across, ringed in precast segments, with its slab track running out into the air. */
  function shieldTunnel(s, y, r) {
    const M = atFace(s, faceAt(s, y, r + 0.8, r) - 0.2, y), place = (g, o, color, key = 'conc') => add(key, g, { matrix: new THREE.Matrix4().multiplyMatrices(M, kit.xf(o)), color });
    const R = r + 0.2, n = 13;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + 0.12, w = (TAU * R * rng.range(0.92, 1.02)) / n, k = i % 5 === 3 ? 0.08 : 0;
      place(chunk(w, 0.42, 1.1 + k, 0.02), { pos: [Math.cos(a) * R, Math.sin(a) * R, -0.32 + k], rot: [0, 0, a + Math.PI / 2] }, rng.pick([P.concreteLit, P.concrete, '#c9c6b7', P.concreteMid]));
      place(kit.box(0.14, 0.14, 0.03), { pos: [Math.cos(a + 0.24) * (R - 0.02), Math.sin(a + 0.24) * (R - 0.02), 0.25] }, WALLDARK, 'flat');
      if (i % 3 === 1) place(kit.box(0.12, rng.range(0.5, 1.1), 0.02), { pos: [Math.cos(a) * (R + 0.08), Math.sin(a) * (R + 0.08) - 0.5, 0.25] }, P.rust, 'flat'); // bolt weep
    }
    place(new THREE.CircleGeometry(r * 1.02, 20), { pos: [0, 0, -0.86] }, WALLDARK, 'flat');
    place(kit.box(1.9 * r, 0.3, 1.5), { pos: [0, -r * 0.82, -0.18] }, P.concreteMid);
    for (const x of [-0.42, 0.42]) place(kit.box(0.1, 0.12, 2.1), { pos: [x * r, -r * 0.82 + 0.2, 0.1], rot: [rng.range(0.02, 0.08), 0, 0] }, P.rust, 'rust');
    for (let k = 0; k < 3; k++) place(kit.tube([[-r * 0.82, 0.3 - k * 0.14, -0.3], [-r * 0.86, 0.22 - k * 0.14, 0.2], [-r * 0.98 + k * 0.05, -0.2 - k * 0.1, 0.5], [-r * 0.96, -0.7 - k * 0.25, 0.52]], 0.035, 0.03, 3, 6), {}, [P.sunWarm, P.fadedBlue, '#3b6f76'][k], 'flat');
  }
  /** +x wall: a tiled pedestrian subway, its stairs and handrail cut through. */
  function tiledSubway(s, y, w, h) {
    const M = atFace(s, faceAt(s, y, w / 2 + 0.6, h / 2) - 0.18, y), place = (g, o, color, key = 'flat') => add(key, g, { matrix: new THREE.Matrix4().multiplyMatrices(M, kit.xf(o)), color });
    const hw = w / 2, hh = h / 2, outline = kit.jag([[-hw - 0.5, -hh - 0.35], [hw + 0.5, -hh - 0.35], [hw + 0.42, hh + 0.5], [-hw - 0.46, hh + 0.44]], 0.5, 0.08, rng);
    add('conc', faceted(kit.wallPanel(outline, [[[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]], 0.6)), { matrix: M, color: P.concrete });
    place(kit.box(w, h, 0.04), { pos: [0, 0, -0.5] }, WALLDARK);
    for (const sx of [-1, 1]) {
      place(kit.box(0.05, h * 0.55, 0.6), { pos: [sx * (hw - 0.03), hh - h * 0.275, -0.22] }, '#ded9c8');
      place(kit.box(0.05, h * 0.12, 0.6), { pos: [sx * (hw - 0.03), -hh * 0.2, -0.22] }, P.fadedBlue);
      place(kit.box(0.05, h * 0.33, 0.6), { pos: [sx * (hw - 0.03), -hh + h * 0.165, -0.22] }, '#cfcabc');
    }
    for (let i = 0; i < 4; i++) place(chunk(w - 0.1, 0.16, 0.34, 0.012), { pos: [0, -hh + 0.08 + i * 0.17, 0.14 - i * 0.26] }, i % 2 ? P.concreteMid : P.concreteLit, 'conc');
    for (const sx of [-1, 1]) place(kit.tube([[sx * (hw - 0.22), -hh + 1.05, -0.4], [sx * (hw - 0.22), -hh + 0.72, 0.1], [sx * (hw - 0.2), -hh + 0.6, 0.45], [sx * (hw - 0.3), -hh + 0.2 * (sx > 0 ? 1 : 2), 0.72]], 0.035, 0.03, 4, 8), {}, P.rustLit, 'rust');
    const sign = kit.box(0.9, 0.3, 0.05);
    place(sign, { pos: [hw * 0.3, hh - 0.34, 0.1], rot: [0, 0, 0.1] }, P.fadedBlue);
    place(kit.box(0.5, 0.06, 0.02), { pos: [hw * 0.3, hh - 0.32, 0.135], rot: [0, 0, 0.1] }, P.concreteLit);
  }
  /** -x wall: an old stone well, cut in half down its whole depth. The one tall thing in a wall of horizontals. */
  function cutWell(s, yTop, yBot, r) {
    const yc = (yTop + yBot) / 2, H2 = (yTop - yBot) / 2, M = atFace(s, faceAt(s, yc, r + 0.5, H2) - 0.06, yc), place = (g, o, color, key = 'flat') => add(key, g, { matrix: new THREE.Matrix4().multiplyMatrices(M, kit.xf(o)), color });
    place(kit.box(2 * r + 0.1, 2 * H2, 0.05), { pos: [0, 0, -r - 0.05] }, WALLDARK);
    const stones = ['#b5ad9b', '#a39b8a', '#c4bcab', '#8f897a', '#7f8a76'], layers = Math.round((2 * H2) / 0.36);
    for (let l = 0; l < layers; l++) {
      const y = -H2 + ((l + 0.5) * 2 * H2) / layers, k = 7, off = l % 2 ? 0.5 : 0;
      for (let i = 0; i < k; i++) {
        const a = Math.PI + (((i + off) / (k - 1 + off * 0)) * Math.PI) * 0.999; if (a > TAU + 0.02) continue;
        const deep = Math.max(0, -Math.sin(a)); // the back of the shaft is in deep shade, its cut edges are in the light
        place(chunk(0.5 + rng.range(-0.05, 0.08), 0.32, 0.36, 0.03), { pos: [Math.cos(a) * r, y + rng.range(-0.02, 0.02), Math.sin(a) * r], rot: [0, -a + Math.PI / 2, 0] }, l < 3 && rng() < 0.4 ? P.moss : `#${C(rng.pick(stones)).lerp(C('#2f4544'), 0.82 * deep * deep).getHexString()}`);
      }
    }
    place(faceted(kit.cyl(0.055, 0.055, 2 * r + 0.9, 6).rotateZ(Math.PI / 2)), { pos: [0, H2 + 0.05, -0.25], rot: [0, 0, 0.04] }, '#7d5f44', 'flat');
    place(kit.tube([[0.1, H2 + 0.05, -0.25], [0.12, H2 - 0.6, -0.3], [0.08, -H2 * 0.15, -0.3]], 0.02, 0.018, 3, 6), {}, '#c9b48c');
    place(faceted(kit.cyl(0.22, 0.17, 0.3, 8)), { pos: [0.08, -H2 * 0.15 - 0.14, -0.3], rot: [0.1, 0, 0.14] }, P.rust, 'rust');
  }
  // Under the slab: drains, ducts, mains. Each wall carries its own mix at its own uneven spacing, and one thing nobody else has.
  const SERVICES = [
    // +z: the old brick sewer, a drain beside the track bed
    [ductBank, S.pz(-35.4), Y(-1.9)], [drainPipe, S.pz(-31.2), Y(-2.34), 0.44, 0.7], [waterMain, S.pz(-22.4), Y(-1.84), 0.3], [waterMain, S.pz(-3.6), Y(-1.9), 0.24], [brickArch, S.pz(2.6), Y(-2.9), 1.25, true], [drainPipe, S.pz(9.4), Y(-2.5), 0.95, 1.5, '#c3c1b5'], [waterMain, S.pz(24.8), Y(-1.86), 0.26], [drainPipe, S.pz(34.6), Y(-2.1), 0.6, 0.9],
    // +x: mains in pairs, the subway mouth
    [drainPipe, S.px(37.8), Y(-2.2), 0.4, 0.6], [waterMain, S.px(25.4), Y(-1.86), 0.22], [waterMain, S.px(23.2), Y(-2.2), 0.3], [drainPipe, S.px(14.6), Y(-2.0), 0.7, 1.1], [ductBank, S.px(4.2), Y(-1.92)], [tiledSubway, S.px(-5.4), Y(-2.72), 3.5, 2.0], [drainPipe, S.px(-18.2), Y(-2.5), 1.05, 1.6, '#c3c1b5'], [waterMain, S.px(-24.6), Y(-1.86), 0.2], [ductBank, S.px(-36.0), Y(-1.92)],
    // -z: cable country, and the metro
    [drainPipe, S.nz(37.2), Y(-1.98), 0.56, 0.8, '#bdbbaf'], [waterMain, S.nz(30.6), Y(-1.84), 0.24], [ductBank, S.nz(25.8), Y(-1.9)], [ductBank, S.nz(22.6), Y(-2.28)], [drainPipe, S.nz(11.4), Y(-2.4), 0.7, 1.05], [shieldTunnel, S.nz(-11.2), Y(-2.8), 1.65], [waterMain, S.nz(-23.0), Y(-1.84), 0.28], [drainPipe, S.nz(-33.4), Y(-2.5), 0.9, 1.4, '#c3c1b5'],
    // -x: drains and an old well
    [drainPipe, S.nx(-35.8), Y(-2.0), 0.6, 0.85], [waterMain, S.nx(-26.2), Y(-1.86), 0.26], [ductBank, S.nx(-22.0), Y(-1.9)], [cutWell, S.nx(-12.6), Y(-2.05), Y(-3.1), 0.95], [waterMain, S.nx(-2.9), Y(-1.9), 0.3], [drainPipe, S.nx(16.4), Y(-2.24), 0.75, 1.1], [ductBank, S.nx(23.4), Y(-1.88)], [drainPipe, S.nx(36.1), Y(-2.5), 0.85, 1.3, '#c3c1b5'],
  ];
  for (const [fn, ...args] of SERVICES) fn(...args);

  // Footings: pale vertical piers break the horizontals on the sides under the old neighbourhood, no two built alike.
  const pierOutline = { // local: x along the wall, y down from the top, h the full depth
    flared: (hw, h) => [[-hw - 0.22, 0], [hw + 0.22, 0], [hw, -0.3], [hw, -h * 0.72], [hw * 0.55, -h * 0.82], [hw * 0.75, -h], [hw * 0.1, -h * 0.9], [-hw * 0.4, -h * 1.02], [-hw * 0.5, -h * 0.84], [-hw, -h * 0.76], [-hw, -0.3]],
    footing: (hw, h) => [[-hw * 0.7, 0], [hw * 0.7, 0], [hw * 0.7, -h * 0.52], [hw * 1.45, -h * 0.6], [hw * 1.45, -h * 0.78], [hw * 1.8, -h * 0.82], [hw * 1.75, -h], [hw * 0.2, -h * 0.94], [-hw * 1.7, -h * 1.01], [-hw * 1.8, -h * 0.82], [-hw * 1.4, -h * 0.76], [-hw * 1.4, -h * 0.6], [-hw * 0.7, -h * 0.52]],
    snapped: (hw, h) => { const b = rng.range(0.42, 0.68); return [[-hw, 0], [hw * 1.05, 0], [hw, -h * b * 0.8], [hw * 0.3, -h * b * 1.12], [-hw * 0.1, -h * b * 0.9], [-hw * 0.6, -h * b * 1.2], [-hw, -h * b]]; },
    tapered: (hw, h) => [[-hw * 1.3, 0], [hw * 1.3, 0], [hw * 0.92, -h * 0.4], [hw * 0.6, -h * 0.9], [hw * 0.3, -h], [-hw * 0.5, -h * 0.97], [-hw * 0.72, -h * 0.8], [-hw * 0.95, -h * 0.4]],
  };
  const PIERS = [[S.nx(-29.6), 0.9, 'tapered'], [S.nx(-8.4), 1.3, 'footing'], [S.nx(20.2), 0.7, 'snapped'], [S.nz(-5.8), 0.9, 'snapped'], [S.nz(-30.4), 1.2, 'flared'], [S.nz(1.8), 0.6, 'flared'], [S.nz(26.9), 1.0, 'footing'], [S.nx(11.9), 0.8, 'tapered'], [S.nz(-18.1), 1.1, 'tapered'], [S.pz(-28.2), 0.95, 'flared'], [S.pz(18.4), 1.1, 'snapped'], [S.px(8.1), 1.2, 'tapered'], [S.px(-26.8), 0.8, 'footing'], [S.pz(-11.3), 0.55, 'tapered'], [S.px(19.3), 0.9, 'snapped']];
  for (const [s, w, kind] of PIERS) {
    const y1 = Y(-2.7) - rng.range(0, 0.45), h = -0.8 - y1, hw = w / 2, o = pierOutline[kind](hw, h), lean = kind === 'snapped' ? rng.range(-0.05, 0.05) : 0;
    add('conc', faceted(kit.wallPanel(kit.jag(o, 0.8, 0.04, rng), [], 0.55)), { matrix: atFace(s, insetAt(s, -1.3) + 0.12, -0.8, 0, lean), color: rng.pick([P.concrete, P.concreteLit, '#d8d3c4']) });
    const yb = kind === 'snapped' ? -0.8 - h * 0.62 : y1 + 0.2;
    for (let i = 0, n = kind === 'snapped' ? rng.int(4, 7) : rng.int(1, 4); i < n; i++) pokeBar(s + rng.range(-hw * 0.8, hw * 0.8), yb, rng.range(0.15, 0.7), insetAt(s, -1.3) + 0.1);
  }

  // ---------- banyan roots (static mass) ----------
  rng = ctx.seeded('base-roots');
  const barkA = C('#a98f72'), barkB = C('#8e7760'), barkC = C('#c4ad8c'), mossT = C(P.moss), mossL = C(P.mossLit);
  /** Corner-cutting: turns a handful of control points into a flowing line with no knees. End points stay put. */
  const chaikin = (src, k = 2) => {
    let a = src;
    for (let it = 0; it < k; it++) {
      const o = [a[0]];
      for (let i = 0; i < a.length - 1; i++) { const p = a[i], q = a[i + 1]; o.push([lerp(p[0], q[0], 0.25), lerp(p[1], q[1], 0.25), lerp(p[2], q[2], 0.25)], [lerp(p[0], q[0], 0.75), lerp(p[1], q[1], 0.75), lerp(p[2], q[2], 0.75)]); }
      o.push(a[a.length - 1]); a = o;
    }
    return a;
  };
  /** Tube with a radius function and painted bark: pale ridges, moss on whatever faces up. */
  function rootGeo(pts, rFn, { radial = 5, perUnit = 2.4, smooth = 2 } = {}) {
    const curve = new THREE.CatmullRomCurve3(chaikin(pts, smooth).map((p) => new V(...p)), false, 'centripetal');
    const len = curve.getLength(), n = Math.max(6, Math.ceil(len * perUnit)), fr = curve.computeFrenetFrames(n, false);
    const pos = [], nor = [], col = [], uv = [], idx = [], p = new V(), N = new V(), ph = rng() * 6, ph2 = rng() * 6, mossy = rng();
    for (let i = 0; i <= n; i++) {
      const t = i / n, r = rFn(t, t * len); curve.getPointAt(t, p);
      const band = Math.sin(t * len * 1.1 + ph) + 0.6 * Math.sin(t * len * 2.6 + ph2);
      const base = band > 0.75 ? barkC : band < -0.5 ? barkB : barkA;
      for (let j = 0; j <= radial; j++) {
        const a = (j / radial) * TAU;
        N.copy(fr.normals[i]).multiplyScalar(Math.cos(a)).addScaledVector(fr.binormals[i], Math.sin(a)).normalize();
        pos.push(p.x + N.x * r, p.y + N.y * r, p.z + N.z * r); nor.push(N.x, N.y, N.z); uv.push(j / radial, t);
        const c = N.y > 0.25 && Math.sin(t * len * 0.8 + ph2) > 0.2 - mossy * 0.9 ? (band > 0.2 ? mossL : mossT) : base;
        col.push(c.r, c.g, c.b);
      }
    }
    const w = radial + 1;
    for (let i = 0; i < n; i++) for (let j = 0; j < radial; j++) { const a = i * w + j, b = a + w, c = b + 1, d = a + 1; idx.push(a, d, b, b, d, c); } // N runs cos·normal + sin·binormal, so this order faces outward
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); return g;
  }
  /** Radius along a strand: tapers, with slow swellings where it has grown round something. */
  const gnarled = (r0, r1, knots = 0) => {
    const ks = Array.from({ length: knots }, () => [rng.range(0.12, 0.85), rng.range(0.25, 0.7), rng.range(0.05, 0.12)]);
    return (t, l) => { let k = 1 + 0.1 * Math.sin(l * 2.1 + r0 * 40) + 0.06 * Math.sin(l * 4.7); for (const [c, a, w] of ks) { const x = (t - c) / w; k += a * Math.exp(-x * x); } return lerp(r0, r1, t) * k; };
  };
  const hug = (s, y) => Math.min(insetAt(s, y), insetAt(s, y + 0.2), insetAt(s, y - 0.2));
  // Where roots break free below the block is a matter of old water and old trees: long swathes hang, long runs don't.
  const clump = (s) => (Math.sin(s * 0.083 + 1.3) + 0.7 * Math.sin(s * 0.21 + 4.1) + 0.35 * Math.sin(s * 0.53)) / 2.05;
  const hangChance = (s) => clamp(0.1 + 0.85 * smoothstep01((clump(s) + 0.35) / 0.9));

  const chainSpots = { tip: [] }; // free root tips hang on from where static roots end
  /** Strands leave the lip fanned out, close into one big twisted mass on the wall, then part again near the bottom. Slow curves, a fraction of a turn in all. */
  function bundle(s0, { n = 3, r = 0.17, yEnd: yEnd0 = -3.0, drift = 0, free = false, top = 0, lip = true, fan = 0.7 }) {
    r *= 0.82;
    const yEnd = Y(yEnd0), dy = 0.85, sp = [], wander = rng.range(0.5, 1.4), wf = rng.range(0.16, 0.34), wp = rng() * TAU;
    for (let y = top - 0.3; y > yEnd; y -= dy) { const h = top - y; sp.push({ s: s0 + drift * h + wander * (Math.sin(h * wf + wp) - Math.sin(wp)), y }); }
    sp.push({ s: sp[sp.length - 1].s + drift * dy * 0.5, y: yEnd });
    const N = sp.length, raw = sp.map((q) => hug(q.s, q.y) - r);
    const low = raw.map((_, i) => Math.min(raw[Math.max(0, i - 1)], raw[i], raw[Math.min(N - 1, i + 1)]));
    sp.forEach((q, i) => { q.d = (low[Math.max(0, i - 1)] + 2 * low[i] + low[Math.min(N - 1, i + 1)]) / 4; });
    const phase0 = rng() * TAU, turn = rng.range(0.3, 0.85) * rng.sign() * TAU, a = r * 1.55;
    for (let k = 0; k < n; k++) {
      const c = n > 1 ? k / (n - 1) - 0.5 : 0, s1 = s0 + c * fan * rng.range(0.9, 3.2) + rng.range(-0.3, 0.3), ease = rng.range(0.25, 0.55), ph0 = phase0 + (k / n) * TAU, main = k === 0;
      const rk = r * (main ? 1.25 : rng.range(0.66, 0.92)), part = rng.range(1.2, 2.4), pts = [];
      if (lip) { // the crest stays under the moss: a swelling strand can reach 1.3× its radius, and the lip's top is at LY.lipT
        const crest = Math.min(0, LY.lipT[0] - rk * 1.5);
        pts.push(W(s1, 0.08, crest - 0.1), W(s1, -0.1, crest), W(s1, -0.26, crest - 0.14));
      }
      for (let i = 0; i < N; i++) {
        const q = sp[i], u = i / (N - 1), inn = clamp(u / ease), out = smoothstep01((u - 0.62) / 0.38), ph = ph0 + turn * u, wrap = a * inn * (1 - out * 0.7);
        pts.push(W(lerp(s1, q.s, inn * (2 - inn)) + wrap * Math.cos(ph) + c * out * part, q.d - wrap * 0.7 * (Math.sin(ph) * 0.8 + 0.45), q.y));
      }
      const hang = free && rng() < hangChance(s0);
      if (hang) { const e = pts[pts.length - 1]; pts.push([e[0] * 0.998, e[1] - 0.34, e[2] * 0.998]); }
      else { const e = pts[pts.length - 1]; pts.push([e[0] * 0.965, e[1] - 0.2, e[2] * 0.965]); }
      const gn = gnarled(rk, hang ? rk * 0.42 : rk * 0.2, main ? 2 : rng.int(0, 1)), radius = lip ? (t, l) => gn(t, l) * lerp(0.55, 1, smoothstep01(t / 0.1)) : gn; // thin where it comes over the lip, so the crest stays under the turf
      add('root', rootGeo(pts, radius, rk > 0.2 ? { radial: 6, perUnit: 2.4 } : rk > 0.11 ? { radial: 5, perUnit: 2 } : { radial: 4, perUnit: 1.7 }));
      if (hang) chainSpots.tip.push({ pos: pts[pts.length - 1], r: rk * 0.42, s: s0 });
    }
    if (rng() < 0.6) { // now and then one strand strikes off across the wall, always falling, never a rung
      const q = sp[Math.floor(rng.range(0.15, 0.55) * N)], dir = rng.sign(), L = rng.range(2.6, 5.4), pts = []; let ss = q.s, y = q.y;
      for (let j = 0; j < 5; j++) { pts.push(W(ss, hug(ss, y) - r * 0.4, y)); ss += (dir * L) / 4; y = Math.max(Y(-3.2), y - rng.range(0.5, 1.1)); }
      add('root', rootGeo(pts, gnarled(r * 0.55, 0.03), { radial: 4, perUnit: 1.7 }));
    }
  }
  const noRoots = [...ROADS, ...RAILS, [NOTCH[0] - 0.8, NOTCH[1] + 0.8], ...[[S.pz(2.6), 2.4], [S.px(-5.4), 3.2], [S.nz(-11.2), 3.2], [S.nx(-12.6), 2.2]].map(([c, w]) => [c - w, c + w])]; // each wall's landmark stays clear
  const BUNDLES = [
    // +z
    { s: S.pz(-38.4), n: 3, r: 0.18, drift: -0.2 }, { s: S.pz(-30.2), n: 2, r: 0.17 }, { s: S.pz(-19.4), n: 3, r: 0.18, drift: 0.2, free: true }, { s: S.pz(-7.8), n: 2, r: 0.13, yEnd: -2.4 }, { s: S.pz(-2.0), n: 3, r: 0.2, drift: 0.2, free: true, yEnd: -3.1 }, { s: S.pz(7.0), n: 2, r: 0.16, drift: -0.3 }, { s: S.pz(24.5), n: 3, r: 0.18, free: true }, { s: S.pz(33.6), n: 2, r: 0.17, drift: 0.3, yEnd: -2.8 },
    // +x
    { s: S.px(36.4), n: 2, r: 0.17, drift: -0.2 }, { s: S.px(26), n: 2, r: 0.13, yEnd: -2.5 }, { s: S.px(17), n: 3, r: 0.18, drift: 0.2, free: true }, { s: S.px(-3.6), n: 3, r: 0.18, drift: -0.3, free: true }, { s: S.px(-12.2), n: 2, r: 0.17 }, { s: S.px(-22.4), n: 3, r: 0.18, drift: 0.3, free: true }, { s: S.px(-35.8), n: 2, r: 0.16 },
    // -z
    { s: S.nz(38.4), n: 2, r: 0.13 }, { s: S.nz(25.6), n: 2, r: 0.17 }, { s: S.nz(13.4), n: 2, r: 0.13, yEnd: -2.4 }, { s: S.nz(-4.4), n: 3, r: 0.2, free: true }, { s: S.nz(-15.6), n: 3, r: 0.2, drift: 0.2, free: true, yEnd: -3.1 }, { s: S.nz(-35.7), n: 3, r: 0.19, drift: -0.3 },
    // -x
    { s: S.nx(-35.6), n: 2, r: 0.18 }, { s: S.nx(-26.6), n: 3, r: 0.2, free: true }, { s: S.nx(-6.6), n: 2, r: 0.17, drift: 0.2 }, { s: S.nx(12), n: 3, r: 0.18, free: true }, { s: S.nx(21), n: 2, r: 0.17 }, { s: S.nx(36.5), n: 2, r: 0.17 },
  ].filter((b) => !inRanges(b.s, noRoots));
  // Out from under each severed carriageway
  for (const e of edgeEnds) BUNDLES.push({ s: e.s + rng.range(-0.4, 0.4), n: 2, r: 0.15, top: -0.7, lip: false, free: true, yEnd: -3.0 });
  // Giant hanging roots: every WOODS tree near an edge sends one or two great knotted masses down the wall beneath it, at uneven offsets.
  for (const t of WOODS) {
    const dPz = H - t.z, dPx = H - t.x, dNz = t.z + H, dNx = t.x + H, m = Math.min(dPz, dPx, dNz, dNx);
    if (m > 7.8) continue;
    const c = m === dPz ? S.pz(t.x) : m === dPx ? S.px(t.z) : m === dNz ? S.nz(t.x) : S.nx(t.z);
    const size = t.s * (t.kind === 'cedar' ? 0.85 : 1) * (1.15 - m / 16), reach = 1.2 + size * 2.2;
    for (let k = 0, n = 1 + (size > 0.95 ? 1 : 0) + (size > 1.25 && rng() < 0.5 ? 1 : 0); k < n; k++) {
      const s = c + (n > 1 ? rng.range(-reach, reach) : rng.range(-0.6, 0.6));
      if (inRanges(s, noRoots)) continue;
      BUNDLES.push({ s, n: rng.int(3, 4), r: (0.3 + rng.range(0, 0.16)) * Math.min(1.3, size), drift: rng.range(-0.5, 0.5), yEnd: rng.range(-3.5, -3.12), free: rng() < 0.75, fan: 1.3 });
    }
  }
  for (const b of BUNDLES) bundle(b.s, b);
  // From the underside's own clusters: roots that never reached a wall, hanging straight out of the earth.
  const underTips = [];
  for (let i = 0; i < 26; i++) {
    const [x, y, z] = underPoint(), a = rng() * TAU, L = Math.pow(rng(), 1.8) * 4.6 + 1.2, wob2 = rng.range(0.2, 0.7), r = rng.range(0.1, 0.24);
    const pts = [[x, y + 0.5, z], [x, y - L * 0.2, z], [x + Math.cos(a) * wob2, y - L * 0.55, z + Math.sin(a) * wob2], [x + Math.cos(a + 1) * wob2 * 1.4, y - L, z + Math.sin(a + 1) * wob2 * 1.4]];
    add('under', rootGeo(pts, gnarled(r, r * 0.3, 1), { radial: 4, perUnit: 1.7, smooth: 1 }));
    if (rng() < 0.6) underTips.push({ pos: pts[3], r: r * 0.3 });
  }

  rng = ctx.seeded('base-railcut');
  // ---------- the rail line runs off the block ----------
  // Cut square across the track: rust-flecked ballast over dark cinders, then the brown blanket on the deck slab. An old layer of sleepers,
  // buried under the present ballast and stripped of its plates, was caught in the section, and the stone keeps trickling down the wall below it.
  {
    const ballast = ['#a9a99f', '#94978f', '#b8b6aa', '#83878a', '#a0988a', '#c0bcae', '#8b8579'];
    for (const [a, b] of RAILS) {
      for (let q = a + 0.06; q < b; q += 0.36) for (let row = 0; row < 3; row++) {
        const s = q + rng.range(-0.1, 0.1), y = lerp(0.04, -0.4, (row + rng()) / 3), r = rng.range(0.1, 0.19), [wx] = W(s, 0, y);
        if (y > -0.34 && RAIL.tracks.some((t) => Math.abs(wx - t) < 1.2)) continue; // the sleepers show here
        add('flat', faceted(kit.rock(r, rng, 0.72, 0)), { pos: W(s, -0.1 - rng.range(0, 0.1), y), rot: [rng() * 3, rng() * 6, rng() * 3], color: rng.pick(ballast) });
      }
      for (let i = 0, n = Math.ceil((b - a) * 2.4); i < n; i++) { // spill down the wall, thinning out, and caught on the ledges
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

  rng = ctx.seeded('base-canal');
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

  rng = ctx.seeded('base-greens');
  // ---------- static greens ----------
  const grassCols = [P.grass, P.grassLit, P.moss, P.mossLit, P.fern];
  const mat4 = new THREE.Matrix4(), vX = new V(), vY = new V(), vZ = new V();
  for (const [a, b] of soilRanges) for (let i = 0, n = Math.floor((b - a) * 3); i < n; i++) {
    const s = rng.range(a, b), side = sideOf(s), o = outward[side], t = tangent[side];
    if (Math.sin(s * 0.9) + Math.sin(s * 2.3 + 1) < -0.6) continue; // bare patches
    vX.set(t[0], 0, t[1]); vY.set(o[0] * 0.8 + t[0] * rng.range(-0.3, 0.3), rng.range(0.25, 0.75), o[1] * 0.8 + t[1] * rng.range(-0.3, 0.3)).normalize(); vZ.crossVectors(vX, vY).normalize(); vX.crossVectors(vY, vZ).normalize();
    mat4.makeBasis(vX, vY, vZ).setPosition(...W(s, -0.08, 0.015));
    add('fol', kit.blade(rng.range(0.26, 0.56), rng.range(0.07, 0.11), rng.range(0.1, 0.34), 2), { matrix: mat4.clone(), color: rng.pick(grassCols) });
  }
  // Ferns tucked on ledges and in gullies
  for (let i = 0, n = N(24); i < n; i++) {
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
    for (let k = 0; k < 12; k++) {
      const s = c.s + dir * rng.range(-0.2, 1.1), y = y0 + rng.range(-0.7, 0.5), l = kit.leaf(rng.range(0.2, 0.34), rng.range(0.15, 0.22), 0.3).rotateY(rng.range(-0.9, 0.9));
      add('fol', l, { pos: W(s, hug(s, y) - 0.05, y), rot: [Math.PI / 2 + rng.range(-0.4, 0.15), yawAt(s), 0], color: rng() < 0.05 ? P.ivyRed : rng.pick(ivyCols) });
    }
  }

  rng = ctx.seeded('base-crust');
  // The top edge is a ragged crust: slabs of road and turf heaved up and left on the rim, bits of it hanging over the bites.
  const crustOK = (s) => !inRanges(s, [...ROADS, ...RAILS, [NOTCH[0] - 0.5, NOTCH[1] + 0.5]]);
  for (let i = 0, n = N(60); i < n; i++) {
    const s = rng.range(0, PER); if (!crustOK(s)) continue;
    const asph = rng() < 0.38, w = rng.range(0.6, 2.1), h = rng.range(0.3, 0.75), de = rng.range(0.12, 0.26);
    add(asph ? 'asph' : 'conc', shard(w, h, de), { matrix: atFace(s, rng.range(-0.1, 0.06), rng.range(-0.08, 0.05), rng.range(-0.75, -0.2), rng.range(-0.35, 0.35), rng.range(-0.4, 0.4)), color: asph ? rng.pick(['#62676f', '#6c7078', '#757a82']) : rng.pick([P.concreteLit, P.concrete, '#e2decf']) });
  }
  for (let i = 0, n = N(120); i < n; i++) { // clods and sods riding the rim, in clumps with bare runs between
    const s = rng.range(0, PER); if (!crustOK(s) || Math.sin(s * 0.33) + 0.7 * Math.sin(s * 0.87 + 1.3) < 0.35) continue;
    const r = rng.range(0.25, 0.55);
    add('flat', faceted(kit.rock(r, rng, 0.55, 1)), { pos: W(s, rng.range(-0.1, 0.12), r * 0.15), rot: [0, rng() * 6, 0], color: rng.pick([P.moss, P.mossLit, P.grass, '#6b7c45', '#75654f']) });
  }

  // ---------- group build ----------
  for (const [k, mb] of Object.entries(mbs)) add(k, mb.geo());
  // Wall-side culling without extra draw calls. Each material's triangles are binned: K (always drawn) and one bin per wall. The index runs A B K C D K A,
  // so any one or two adjacent walls plus K is a single contiguous draw range. Only deep face content goes in a wall bin: nothing on the rim, in the corners, or below the bottom edge,
  // so the bin is hidden behind the plinth from anywhere that passes the camera test in cullMask().
  const CULL = { A: 34.8, Us: 33, yMin: -6, yMax: -0.25, Kref: 0.75, m: 0.12 };
  const sFn = [S.pz, S.px, S.nz, S.nx], noCull = [[NOTCH[0] - 2.5, NOTCH[1] + 2.5]]; // the canal cuts the rim down: what's in the notch can be seen across it
  let wallReach = 0;
  const splitGeo = (g) => {
    const p = g.attributes.position, nT = p.count / 3, bins = [[], [], [], [], []], { A, Us, yMin, yMax, Kref, m } = CULL;
    for (let t = 0; t < nT; t++) {
      let side = -1, ok = true, reach = 0;
      for (let v = 0; v < 3 && ok; v++) {
        const i = t * 3 + v, x = p.getX(i), y = p.getY(i), z = p.getZ(i), ax = Math.abs(x), az = Math.abs(z), k = az >= ax ? (z > 0 ? 0 : 2) : x > 0 ? 1 : 3;
        const e = Math.max(ax, az), u = k % 2 === 0 ? x : z, h = e - (H - EDGE.inset(sFn[k](u)));
        if (inRanges(sFn[k](u), noCull) || y > yMax || y < yMin || Math.abs(u) > Us || e < A + 0.4 || h * Kref + y > -m || (side >= 0 && side !== k)) ok = false;
        side = k; reach = Math.max(reach, e);
      }
      if (ok) { wallReach = Math.max(wallReach, reach); bins[side + 1].push(t); } else bins[0].push(t);
    }
    const [K, Az, Bx, Cz, Dx] = bins, seq = [Az, Bx, K, Cz, Dx, K, Az], total = seq.reduce((n, b) => n + b.length, 0), index = new Uint32Array(total * 3);
    let q = 0;
    for (const b of seq) for (const t of b) { index[q++] = t * 3; index[q++] = t * 3 + 1; index[q++] = t * 3 + 2; }
    g.setIndex(new THREE.BufferAttribute(index, 1));
    const n = (b) => b.length * 3, oB = n(Az), oK = oB + n(Bx), oC = oK + n(K), oD = oC + n(Cz), oK2 = oD + n(Dx), r = new Array(16), all = [0, n(Az) + n(Bx) + n(K) + n(Cz) + n(Dx)];
    r.fill(all);
    r[0] = [oK, n(K)]; r[1] = [oK2, n(K) + n(Az)]; r[2] = [oB, n(Bx) + n(K)]; r[4] = [oK, n(K) + n(Cz)]; r[8] = [oD, n(Dx) + n(K)];
    r[3] = [0, n(Az) + n(Bx) + n(K)]; r[6] = [oB, n(Bx) + n(K) + n(Cz)]; r[12] = [oK, n(K) + n(Cz) + n(Dx)]; r[9] = [oD, n(Dx) + n(K) + n(Az)];
    g.setDrawRange(...all);
    return r;
  };
  const splitMeshes = [];
  let underMesh = null, underSlope = Infinity;
  for (const [k, geos] of parts) {
    const m = mats[k], g = kit.merge(geos);
    if (m.userData?.uv) kit.worldUV(g, m.userData.uv);
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = k !== 'under'; mesh.receiveShadow = k !== 'under'; mesh.name = `base-${k}`;
    if (k === 'fol') ctx.softEdge(mesh);
    if (k === 'under') { // hidden whenever the walls' bottom edge covers everything that hangs lower than it: how steep a sight line has to be for that
      underMesh = mesh; const p = g.attributes.position; underSlope = 0;
      for (let i = 0; i < p.count; i++) { const e = Math.max(Math.abs(p.getX(i)), Math.abs(p.getZ(i))), y = p.getY(i); if (y < -6) if (e < 35.4) underSlope = Math.max(underSlope, (-6 - y) / (36 - e)); }
    } else splitMeshes.push({ g, ranges: splitGeo(g) });
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
  const tipGeo = () => { // self-similar taper: a child scaled by .78 continues exactly where its parent ends
    const g = kit.tube([[0, 0, 0], [0.04, -0.3, 0.015], [-0.03, -0.68, -0.015], [0, -1, 0]], 0.08, 0.0624, 4, 3, { capEnds: false });
    const n = g.attributes.position.count, c = new Float32Array(n * 3), b = C('#7f6d5a'), l = C('#94816b'); // these take no shadow, so they're painted in the shade tone of the static root they continue
    for (let i = 0; i < n; i++) { const k = Math.sin(g.attributes.position.getY(i) * 13) > 0.4 ? l : b; c[i * 3] = k.r; c[i * 3 + 1] = k.g; c[i * 3 + 2] = k.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
  };
  const chainSets = {
    vine: { geo: vineGeo(5, 0), mat: mats.leaf, soft: true, chains: [] },
    bloom: { geo: vineGeo(4, 2), mat: mats.leaf, soft: true, chains: [] },
    tip: { geo: tipGeo(), mat: mats.root, soft: false, chains: [], culled: true },
  };
  const addChain = (set, pos, s, segs, scale, decay, amp) => {
    const side = sideOf(s), o = outward[side], t = tangent[side];
    chainSets[set].chains.push({
      pos: new V(...pos), segs, scale, decay, amp, ph: rng() * TAU, reach: (scale * (1 - decay ** segs)) / (1 - decay) + 0.6, k: 1,
      q0: new THREE.Quaternion().setFromAxisAngle(new V(0, 1, 0), rng() * TAU),
      axT: new V(t[0], 0, t[1]), axO: new V(o[0], 0, o[1]),
    });
  };
  rng = ctx.seeded('base-chains');
  // Vine curtains hang in the gaps between the showpieces, so the cut strata stay readable.
  const keepClear = [...BITES.map((b) => [b[0] - 0.3, b[1] + 0.3]), ...SERVICES.map(([, q]) => [q - 1, q + 1]), ...RAILS.map(([a, b]) => [a - 0.6, b + 0.6]), [NOTCH[0] - 0.7, NOTCH[1] + 0.7]];
  const curtains = []; for (let s = rng.range(0, 1); s < PER; s += rng.range(2.8, 6.2)) curtains.push(s);
  for (const c of curtains) {
    for (let i = 0, n = rng.int(1, 3); i < n; i++) {
      const s = c + rng.range(-1.1, 1.1);
      if (inRanges(s, keepClear) || crown(s) < 0.8) continue;
      const u = modP(s) % SIDE, nearCorner = Math.min(u, SIDE - u) < 9, segs = nearCorner ? 1 : rng() < 0.16 ? rng.int(4, 5) : rng.int(1, 2); // by a corner the lower block is cut away, so a long vine hangs alone in the sky
      addChain(rng() < 0.2 ? 'bloom' : 'vine', W(s, -0.28, -0.02), s, segs, rng.range(0.8, 1.05), 0.96, rng.range(0.035, 0.06));
    }
  }
  const hangSegs = () => { const q = rng(); return q < 0.42 ? 1 : q < 0.72 ? 2 : q < 0.9 ? rng.int(3, 4) : rng.int(5, 7); }; // most stubby, a few very long
  for (const a of chainSpots.tip) { const segs = hangSegs(); addChain('tip', a.pos, a.s, segs, Math.min(segs > 4 ? 1.05 : 2, clamp(a.r / 0.08, 0.5, 1.7) * rng.range(0.75, 1.35)), 0.78, rng.range(0.03, 0.05)); }
  for (const a of underTips) addChain('tip', a.pos, 0, hangSegs(), clamp(a.r / 0.08, 0.5, 1.4) * rng.range(0.8, 1.3), 0.78, rng.range(0.02, 0.04));
  for (const [a, b] of ASPHALT) { // thin aerial roots dangling from the undercut road ends: a couple of tufts, not a fringe
    for (let c = 0, tufts = rng.int(1, 2); c < tufts; c++) {
      const at = rng.range(a, b);
      for (let i = 0, n = rng.int(2, 5); i < n; i++) { const s = at + rng.range(-1.1, 1.1); addChain('tip', W(s, 0.3, -1.45), s, hangSegs(), rng.range(0.55, 1.05), 0.78, rng.range(0.03, 0.05)); }
    }
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
      ch.i0 = i0; const k = rng.range(0.82, 1.1); ch.k = k;
      for (let i = 0; i < ch.segs; i++) mesh.setColorAt(i0 + i, c.setRGB(k, k, k));
      i0 += ch.segs;
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (set.soft) ctx.softEdge(mesh);
    group.add(mesh); swing.push({ mesh, chains: set.chains, live: set.chains, culled: !!set.culled });
  }
  const update = (t, dt) => {
    if (dt !== undefined) applyCull();
    for (const { mesh, live } of swing) {
      for (const ch of live) {
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

  // ---------- view-dependent culling ----------
  // E is the user's pose from the last frame, not yet steered, hence the margin. Every test only ever hides what the plinth itself covers, so switching cannot show.
  const CULL_M = 1.2, tipSwing = swing.find((x) => x.culled), evalE = new V(1e9, 0, 0);
  let lastMask = 15;
  /** Is the line from E to (x,y,z) cut by the solid middle of the block? P is a convex body that the plates, walls and core all fill: the block's own taper and its chamfered corners. */
  const CORE_PLANES = [[1, -5 / 12, 0, 38], [-1, -5 / 12, 0, 38], [0, -5 / 12, 1, 38], [0, -5 / 12, -1, 38], [1, -2 / 3, 1, 78], [1, -2 / 3, -1, 78], [-1, -2 / 3, 1, 78], [-1, -2 / 3, -1, 78], [0, -1, 0, -CULL.yMin], [0, 1, 0, 0]];
  const coreHides = (E, x, y, z) => {
    let t0 = 0, t1 = 1;
    const dx = x - E.x, dy = y - E.y, dz = z - E.z;
    for (const [nx, ny, nz, d] of CORE_PLANES) {
      const den = nx * dx + ny * dy + nz * dz, val = d - (nx * E.x + ny * E.y + nz * E.z);
      if (Math.abs(den) < 1e-9) { if (val < 0) return false; continue; }
      const t = val / den; if (den > 0) t1 = Math.min(t1, t); else t0 = Math.max(t0, t);
      if (t0 > t1) return false;
    }
    return true;
  };
  /** Bit k set: wall k must be drawn. A wall is skipped only if its whole bin is proven hidden: the part below y=-3 from every corner of its box being behind P (P is convex, so corners suffice),
   *  the part above it because the bins were cut so that K <= Kref sends every ray in over the rim, and that high up it comes in over the top, not round the corner. */
  const cullMask = (E) => {
    if (E.y < CULL.yMin + CULL_M) return 15;
    let mask = 0;
    for (let k = 0; k < 4; k++) {
      const [nx, nz] = outward[k], eh = E.x * nx + E.z * nz, uE = k % 2 === 0 ? E.x : E.z, Dn = CULL.A - eh - CULL_M;
      let vis = Dn <= 0 || (Math.max(E.y, 0) + -CULL.yMin + CULL_M) / Dn > CULL.Kref;
      if (!vis) for (const u of [-CULL.Us, CULL.Us]) {
        const corners = (ys) => { for (const e of [CULL.A + 0.4, wallReach]) for (const y of ys) if (!coreHides(E, k % 2 === 0 ? u : nx * e, y, k % 2 === 0 ? nz * e : u)) return false; return true; };
        const overRim = E.y > 0 && Math.abs(u + (3 / (E.y + 3)) * (uE - u)) < 39;   // band above y=-3: comes in over the top, inside the corner
        if (!(overRim || corners([CULL.yMax, -3])) || !corners([-3, CULL.yMin])) vis = true;
      }
      if (vis) mask |= 1 << k;
    }
    return mask;
  };
  const underCovered = (E) => {
    if (E.y < 2) return false;
    for (let k = 0; k < 4; k++) { const eh = E.x * outward[k][0] + E.z * outward[k][1] + CULL_M; if (eh > 36 && (E.y - CULL_M + 6) / (eh - 36) < Math.max(1.05, underSlope)) return false; }
    return true;
  };
  const assignTips = (S0) => {
    let n = 0; const c = new THREE.Color();
    for (const ch of S0.live) { ch.i0 = n; for (let i = 0; i < ch.segs; i++) S0.mesh.setColorAt(n + i, c.setRGB(ch.k, ch.k, ch.k)); n += ch.segs; }
    S0.mesh.count = n; if (S0.mesh.instanceColor) S0.mesh.instanceColor.needsUpdate = true;
  };
  function applyCull() {
    const E = ctx.camera.position, on = group.userData.cull !== false && !ctx.renderer.shadowMap.needsUpdate;
    const mask = on ? cullMask(E) : 15;
    group.userData.cullState = { mask, wallReach, underSlope };
    if (mask !== lastMask) { for (const m of splitMeshes) m.g.setDrawRange(...m.ranges[mask]); lastMask = mask; }
    if (underMesh) underMesh.visible = !on || !underCovered(E);
    if (tipSwing && (!on || evalE.distanceToSquared(E) > 0.25)) {
      evalE.copy(E);
      const live = on ? tipSwing.chains.filter((ch) => !(coreHides(E, ch.pos.x, ch.pos.y, ch.pos.z) && coreHides(E, ch.pos.x, ch.pos.y - ch.reach, ch.pos.z))) : tipSwing.chains;
      if (live.length !== tipSwing.live.length || live.some((ch, i) => ch !== tipSwing.live[i])) { tipSwing.live = live; assignTips(tipSwing); }
    }
    // Soft under-shadow: square, and gone before it can turn edge-on.
    const dy = E.y - disc.position.y, dist = Math.hypot(E.x - disc.position.x, dy, E.z - disc.position.z), a = smoothstep01((dy / dist - 0.05) / 0.17);
    disc.material.opacity = a; disc.visible = a > 0.002;
  }
  update(0);

  // ---------- contact shadow under the block ----------
  const DISC = H + 22, discTex = ctx.canvasTexture(256, 256, (g, w, h) => { // teal, following the plinth's own rounded-off square
    const im = g.createImageData(w, h), hs = H - 7, rd = 6;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const x = Math.abs(((i + 0.5) / w) * 2 - 1) * DISC, z = Math.abs(((j + 0.5) / h) * 2 - 1) * DISC, qx = x - hs, qz = z - hs;
      const d = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - rd, k = 1 - smoothstep01((d - 1) / 15), o = (i + j * w) * 4;
      im.data[o] = 42; im.data[o + 1] = 96; im.data[o + 2] = 106; im.data[o + 3] = Math.round(255 * 0.26 * k);
    }
    g.putImageData(im, 0, 0);
  }, { repeat: false });
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(2 * DISC, 2 * DISC).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: discTex, transparent: true, depthWrite: false }));
  disc.position.set(-2, -BASE.height - 0.7, 2); disc.renderOrder = -1; disc.name = 'base-contact';
  ctx.noOutline(disc); group.add(disc);

  return { group, update };
}
