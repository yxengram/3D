// river.js — the pond's overflow: a concrete weir, a stone-banked canal with its bridge and drowned things, and the waterfall
// that pours off the plinth. Everything that moves is a pure function of t (t is frozen in verification shots).
// The falling water, spray and mist are ShaderMaterials on layer 1 (no ink pass), so they may animate in the vertex stage.

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const frac = (v) => v - Math.floor(v);
const hash = (a, b = 0) => frac(Math.sin(a * 127.1 + b * 311.7 + 1.7) * 43758.5453);
const vnoise = (x, z) => {
  const i = Math.floor(x), j = Math.floor(z), f = x - i, g = z - j, u = f * f * (3 - 2 * f), v = g * g * (3 - 2 * g);
  return lerp(lerp(hash(i, j), hash(i + 1, j), u), lerp(hash(i, j + 1), hash(i + 1, j + 1), u), v);
};

const GRAV = 6.0;        // miniature gravity: an 8 unit fall takes about 1.6 s

export function build(ctx) {
  const { THREE, layout, P, kit } = ctx;
  const { RIVER, WATER, BASE, riverOutline, SUN_DIR, CROSSINGS, RING_ROADS, BUILDINGS, buildingBox } = layout;
  let rng = ctx.rng;                                      // the v2 core keeps this stream exactly; v3's outer stretch swaps in its own for its blocks
  const CORE_RNG = rng, OUTER_RNG = ctx.seeded('river-outer'), outerBlock = (fn) => { rng = OUTER_RNG; fn(); rng = CORE_RNG; };
  const V3 = THREE.Vector3, M4 = THREE.Matrix4, Q = THREE.Quaternion;
  const group = new THREE.Group(); group.name = 'river';
  const UP = new V3(0, 1, 0), SUN = new V3(...SUN_DIR);
  const C = (hex) => new THREE.Color(hex);
  const WY = RIVER.y;

  /* ---------- soups: per-vertex coloured parts, one merged mesh per material ---------- */
  const stoneL = [], bedL = [], woodL = [], rustL = [], plantL = [];
  const put = (list, geo, o = {}, color = '#ffffff') => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (!g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(o.isMatrix4 ? o : kit.xf(o));
    const p = g.attributes.position, nn = g.attributes.normal, a = new Float32Array(p.count * 3), fn = typeof color === 'function', c0 = fn ? null : C(color);
    for (let i = 0; i < p.count; i++) {
      const c = fn ? color(p.getX(i), p.getY(i), p.getZ(i), nn.getX(i), nn.getY(i), nn.getZ(i)) : c0;
      a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    list.push(g);
  };
  const smooth = (g) => { g.computeVertexNormals(); return g; };

  /* ---------- the channel: stations along the layout outline, so banks, bed and water share one set of rails ---------- */
  const outline = riverOutline(0.22), NS = outline.length / 2;
  const L = outline.slice(0, NS), R = outline.slice(NS).reverse();
  const ST = [];
  for (let i = 0, d = 0; i < NS; i++) {
    const x = (L[i][0] + R[i][0]) / 2, z = (L[i][1] + R[i][1]) / 2, w = Math.hypot(L[i][0] - R[i][0], L[i][1] - R[i][1]) / 2;
    if (i) d += Math.hypot(x - ST[i - 1].x, z - ST[i - 1].z);
    ST.push({ x, z, w, d, nx: (L[i][0] - x) / w, nz: (L[i][1] - z) / w });
  }
  const TOTAL = ST[NS - 1].d;
  const coreEnd = RIVER.center[RIVER.coreSpan - 1], NC = ST.findIndex((s) => Math.abs(s.x - coreEnd[0]) < 1e-6 && Math.abs(s.z - coreEnd[1]) < 1e-6);
  // v2 ended its canal at the core's last centre point, so its spline, rail lengths and rng draws came from that shorter polyline.
  const v2Lens = (() => { const c0 = RIVER.center; RIVER.center = c0.slice(0, RIVER.coreSpan); const o2 = riverOutline(0.22); RIVER.center = c0; const n = o2.length / 2, a = o2.slice(0, n), b = o2.slice(n).reverse(); let d = 0, sL = 0, sR = 0; for (let i = 1; i < n; i++) { d += Math.hypot((a[i][0] + b[i][0] - a[i - 1][0] - b[i - 1][0]) / 2, (a[i][1] + b[i][1] - a[i - 1][1] - b[i - 1][1]) / 2); sL += Math.hypot(a[i][0] - a[i - 1][0], a[i][1] - a[i - 1][1]); sR += Math.hypot(b[i][0] - b[i - 1][0], b[i][1] - b[i - 1][1]); } return { d, sL, sR }; })();
  const LEN = v2Lens.d;                                   // the core's own length: every v2 loop stays inside it
  const FCX = ST[NS - 1].x, FHW = ST[NS - 1].w;           // the lip of the outfall: centre and half width
  const waterY = (d) => WY - 0.09 * Math.pow(sstep(TOTAL - 1.1, TOTAL + 0.14, d), 1.6);
  /** Point d along the centre line, u across (+1 = north/left wall, -1 = south/right). Writes to o; allocates nothing. */
  const chan = (d, u, o) => {
    let lo = 0, hi = NS - 1; const q = clamp(d, 0, TOTAL);
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ST[m].d < q) lo = m; else hi = m; }
    const a = ST[lo], b = ST[hi], f = (q - a.d) / Math.max(1e-5, b.d - a.d);
    o.w = lerp(a.w, b.w, f); o.nx = lerp(a.nx, b.nx, f); o.nz = lerp(a.nz, b.nz, f); o.tx = o.nz; o.tz = -o.nx;
    const over = d - q;                                    // past the end: carry on straight, over the lip
    o.x = lerp(a.x, b.x, f) + o.nx * o.w * u + o.tx * over; o.z = lerp(a.z, b.z, f) + o.nz * o.w * u + o.tz * over;
    return o;
  };
  const c1 = {}, c2 = {};

  // sand and silt bars heaped against the banks: reeds, iris and the boat stand on these
  const BARS = [
    { d: 4.7, len: 2.5, side: 1, wid: 0.62, h: 0.92 },
    { d: 11.2, len: 2.0, side: -1, wid: 0.66, h: 0.92 },
    { d: 1.0, len: 1.2, side: -1, wid: 0.42, h: 0.74 },
    { d: 9.4, len: 1.0, side: 1, wid: 0.34, h: 0.62 },
    // v3, past the core
    { d: 16.2, len: 1.7, side: -1, wid: 0.62, h: 0.88 },
    { d: 18.9, len: 1.9, side: 1, wid: 0.6, h: 0.9 },
    { d: 21.0, len: 1.1, side: -1, wid: 0.42, h: 0.74 },
    { d: 30.2, len: 1.5, side: -1, wid: 0.58, h: 0.82 },
    { d: 33.4, len: 1.6, side: 1, wid: 0.52, h: 0.86 },
    { d: 34.9, len: 2.0, side: -1, wid: 0.62, h: 0.92 },
    { d: 36.2, len: 0.9, side: 1, wid: 0.34, h: 0.64 },
  ];
  const bed = (d, u) => {
    let h = RIVER.bedY + 0.1 * (vnoise(d * 1.3, u * 2.4 + 3) - 0.5) + 0.16 * Math.pow(Math.abs(u), 5);
    for (const b of BARS) {
      const A = sstep(0, 1, 1 - Math.abs(d - b.d) / b.len), B = sstep(1 - 2 * b.wid, 1 - 0.2 * b.wid, b.side * u + 0.08 * (vnoise(d * 1.7, 4) - 0.5));
      h = Math.max(h, RIVER.bedY + b.h * A * B + 0.05 * (vnoise(d * 3, u * 3) - 0.5) * A * B);
    }
    const lip = sstep(TOTAL - 2.5, TOTAL - 1.0, d);            // the bed climbs to the sill
    return lerp(h, -0.6 + 0.06 * (vnoise(d * 2, u * 4) - 0.5), lip);
  };

  /* ---------- bed: sand through clear water, pebbles, drowned stones ---------- */
  {
    const COLS = 18, pos = [], idx = [], step = 2;
    const stations = []; for (let i = 0; i < NS; i += step) stations.push(ST[i].d); stations.push(TOTAL + 0.04);
    stations.forEach((d) => { for (let j = 0; j <= COLS; j++) { const u = -1.04 + (2.08 * j) / COLS; chan(d, u, c1); pos.push(c1.x, bed(d, clamp(u, -1, 1)), c1.z); } });
    for (let i = 0; i < stations.length - 1; i++) for (let j = 0; j < COLS; j++) { const a = i * (COLS + 1) + j, b = a + 1, c = a + COLS + 1, e = c + 1; idx.push(a, b, c, b, e, c); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2)); g.setIndex(idx); g.computeVertexNormals();
    { const n = g.attributes.normal; let s = 0; for (let i = 0; i < n.count; i++) s += n.getY(i); if (s < 0) { g.index.array.reverse(); g.computeVertexNormals(); } }
    const sand = C('#ecdcae'), silt = C('#c7b78a'), algae = C('#8fbf7e'), teal = C('#86dcc8'), t = new THREE.Color();
    put(bedL, g, {}, (x, y, z) => {
      const n = vnoise(x * 0.9 + 3, z * 1.2), m = vnoise(x * 3.1, z * 2.7 + 8);
      t.copy(sand); if (n < 0.42) t.copy(silt); if (m > 0.68 && n < 0.6) t.copy(algae);
      return t.lerp(teal, 0.34 * sstep(WY + 0.02, WY - 0.3, y));
    });
    const peb = ['#d9dccd', '#bcc8ba', '#e9e2cf', '#a4b6ab', '#cdbf9f'];
    for (let i = 0; i < 300; i++) {
      const d = rng.range(0.2, LEN - 0.3), u = rng.range(-0.96, 0.96); chan(d, u, c1);
      const y = bed(d, u), s = rng() < 0.12 ? rng.range(0.09, 0.15) : rng.range(0.035, 0.08), col = C(rng.pick(peb)).lerp(teal, y < WY ? 0.3 : 0);
      put(bedL, kit.rock(s, rng, 0.6, 0), { pos: [c1.x, y + s * 0.2, c1.z], rot: [0, rng() * 6, 0] }, col);
    }
  }

  /* ---------- banks: coursed cut stone with a mossy coping ---------- */
  const WALLT = ['#ffffff', '#f4f2e6', '#e3e2d6', '#d3d7cb', '#ece4cf'];
  const wet = C('#c3d3c6'), deepT = C('#a8d8cc');
  const stoneTint = (hex) => { const c0 = C(hex), t = new THREE.Color(); return (x, y, z) => (z > BASE.half - 0.45 ? t.copy(c0) : t.copy(c0).multiply(wet.clone().lerp(C('#ffffff'), sstep(WY - 0.02, WY + 0.42, y))).multiply(y < WY - 0.02 ? deepT : C('#ffffff'))); };
  const makeRail = (pts, sgn) => {
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return {
      len: cum[cum.length - 1], loop: cum[cum.length - 1],   // `loop` is how far the walls and plants draw from the rng; on the core rails it is v2's length
      at(s, o = {}) {
        let i = 1; while (i < pts.length - 1 && cum[i] < s) i++;
        const a = pts[i - 1], b = pts[i], l = cum[i] - cum[i - 1] || 1, f = (s - cum[i - 1]) / l;
        o.tx = (b[0] - a[0]) / l; o.tz = (b[1] - a[1]) / l; o.x = a[0] + (b[0] - a[0]) * f; o.z = a[1] + (b[1] - a[1]) * f; o.ix = o.tz * sgn; o.iz = -o.tx * sgn; o.yaw = Math.atan2(-o.tz, o.tx);
        return o;
      },
    };
  };
  const railL = makeRail(L.slice(0, NC + 1), 1), railR = makeRail(R.slice(0, NC + 1), -1); railL.loop = v2Lens.sL; railR.loop = v2Lens.sR;
  const railLo = makeRail(L.slice(NC), 1), railRo = makeRail(R.slice(Math.max(0, NC - 1)), -1);   // the outer stretch. The core's R rail is a little longer than v2's loop, so its outer rail starts one station back to close the gap
  const railH = makeRail([L[0], R[0]], Math.sign((R[0][1] - L[0][1]) * (ST[3].x - ST[0].x) * 1 - (R[0][0] - L[0][0]) * (ST[3].z - ST[0].z)) || 1);

  const br = RIVER.bridge, cy = Math.cos(br.yaw), sy = Math.sin(br.yaw);
  const brLocal = (x, z) => { const dx = x - br.x, dz = z - br.z; return [dx * cy - dz * sy, dx * sy + dz * cy]; }; // [across, along]
  // the road bridge at CROSSINGS.canal: its frame is pinned to where ringS really runs at each end of the span
  const CC_ = CROSSINGS.canal, RL_ = CC_.length / 2, HW_ = CC_.width / 2, ringS = RING_ROADS.find((r) => r.id === 'ringS');
  const roadZ = (x) => { const p = ringS.pts; for (let i = 0; i < p.length - 1; i++) if (x >= p[i][0] && x <= p[i + 1][0]) return lerp(p[i][1], p[i + 1][1], (x - p[i][0]) / (p[i + 1][0] - p[i][0])); return p[0][1]; };
  const BW_X = CC_.x - RL_, BE_X = CC_.x + RL_, BW_Z = roadZ(BW_X), BE_Z = roadZ(BE_X), BCX = (BW_X + BE_X) / 2, BCZ = (BW_Z + BE_Z) / 2, BYAW = -Math.atan2(BE_Z - BW_Z, BE_X - BW_X);
  const BM2 = new M4().compose(new V3(BCX, 0, BCZ), new Q().setFromAxisAngle(UP, BYAW), new V3(1, 1, 1));
  const br2Local = (x, z) => { const dx = x - BCX, dz = z - BCZ, c = Math.cos(BYAW), s = Math.sin(BYAW); return [dx * c - dz * s, dx * s + dz * c]; };   // [along the road, across it]
  const nearRoadBridge = (x, z, m = 0.4) => { const [a, b] = br2Local(x, z); return Math.abs(a) < RL_ + m && Math.abs(b) < HW_ + m; };
  const nearBridge = (x, z) => { const [a, b] = brLocal(x, z); return (Math.abs(a) < 1.02 && Math.abs(b) < 3.0) || nearRoadBridge(x, z); };
  // the road rides up and over on a low hump, so the arch under it can be a real one
  const HUMP = 0.6, deckTop = (X) => HUMP * (0.5 + 0.5 * Math.cos(Math.PI * clamp(X / RL_, -1, 1))), YD = -1.5, spring = WY - 0.2, soffit = HUMP - 0.38;
  // the barrel skews to follow the canal: its axis is read from the canal's own stations under the two faces, and its span from the banks
  const bankX = (Z, rail) => { let best = null; for (let i = 0; i < rail.length - 1; i++) { const a = br2Local(rail[i][0], rail[i][1]), b = br2Local(rail[i + 1][0], rail[i + 1][1]); if ((a[1] - Z) * (b[1] - Z) <= 0 && a[1] !== b[1]) { best = lerp(a[0], b[0], (Z - a[1]) / (b[1] - a[1])); break; } } return best; };
  const midAt = (Z) => (bankX(Z, L.slice(NC)) + bankX(Z, R.slice(NC))) / 2;
  const Xa_ = midAt(-HW_), Xb_ = midAt(HW_), archX = (Z) => lerp(Xa_, Xb_, (Z + HW_) / (2 * HW_));
  const ASP = (() => { let m = 0; for (let k = 0; k <= 8; k++) { const Z = lerp(-HW_, HW_, k / 8), l = bankX(Z, L.slice(NC)), r = bankX(Z, R.slice(NC)), c = archX(Z); m = Math.max(m, Math.abs(l - c), Math.abs(r - c)); } return m + 0.34; })();
  const rise = soffit - spring, aR = (ASP * ASP + rise * rise) / (2 * rise), aY = spring + rise - aR, thMax = Math.asin(ASP / aR);
  const asphL = [], signPlates = [], foamAt2 = [];
  const mill = BUILDINGS.find((b) => b.kind === 'watermill'), millB = mill ? buildingBox(mill, 0) : { x: [-1e3, -1e3], z: [1e3, 1e3] };
  const dAtZ = (z) => { for (const s of ST) if (s.z >= z) return s.d; return TOTAL; };
  const RACE = { d0: dAtZ(millB.z[0]) + 1.5, d1: dAtZ(millB.z[1]) - 0.2, u: 0.5 };     // the mill race: a stone training wall pens the west strip of the canal into a narrow fast run past the mill
  const keepMill = (x, z) => z > millB.z[0] - 0.8 && z < millB.z[1] + 0.8 && x < millB.x[1] + 3.2;  // west bank by the mill: kept clear of plants and clutter so its water reads
  const ROCKS2 = [[18.6, 0.18, 0.25], [22.0, -0.5, 0.22], [23.5, -0.2, 0.27], [30.8, 0.08, 0.25], [31.6, -0.3, 0.22], [35.4, 0.26, 0.3], [36.1, -0.34, 0.25]];
  const REEDS2 = [[15.6, 0.74, 2], [16.3, -0.78, 3], [19.0, 0.76, 3], [22.4, -0.82, 2], [29.9, -0.82, 2], [33.6, 0.8, 3], [34.8, -0.76, 3]];
  const gridGeo = (nr, nc, f, up) => {
    const pos = [], idx = [], p = [0, 0, 0];
    for (let r = 0; r <= nr; r++) for (let c = 0; c <= nc; c++) { f(r / nr, c / nc, p); pos.push(p[0], p[1], p[2]); }
    for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) { const a = r * (nc + 1) + c, b = a + 1, d = a + nc + 1, e = d + 1; idx.push(a, b, d, b, e, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 2), 2)); g.setIndex(idx); g.computeVertexNormals();
    let sum = 0; const n = g.attributes.normal; for (let i = 0; i < n.count; i++) sum += n.getY(i);
    if ((sum > 0) !== up) { g.index.array.reverse(); g.computeVertexNormals(); }
    return g;
  };
  const COURSES = [[0.06, -0.16], [-0.16, -0.42], [-0.42, -0.82], [-0.82, -1.26]];
  const STAIRS = [{ rail: railL, s: 1.25, dir: 1, n: 8 }, { rail: railR, s: 9.35, dir: 1, n: 8 }];
  const inStair = (r, s) => STAIRS.some((q) => q.rail === r && s > q.s - 0.1 && s < q.s + q.n * 0.25 + 0.3);

  /* ---------- the weir in plan: the pond spills down a sloping sill laid in RIVER.weirSlot and drops through a gap in the head wall.
     The head wall crosses the slot on the diagonal, so sill, film and streaks all hang on one map: f runs pond rim → lip, v runs west → east cheek. ---------- */
  const SLOT = RIVER.weirSlot, GAP = [0.36, 1.36];       // GAP: the opened span of the head wall, metres along railH. Its east end stays inside the slot
  const CHEEK_N = SLOT.z[0] - 0.05, CHEEK_X = [-0.33, 0.7];  // the cheeks' inner faces, where they stand in the pond
  const lipPt = (u, off, q) => { railH.at(lerp(GAP[0], GAP[1], u), q); q.x += q.ix * off; q.z += q.iz * off; return q; };
  const pondEdge = (a) => 1.006 * (0.972 + 0.018 * (Math.sin(a * 2 + 1.1) * 0.6 + Math.sin(a * 3 + 0.4) * 0.45 + Math.sin(a * 5 + 2.2) * 0.25));   // water.js's shoreline, at the disc's edge
  const pondRimZ = (x) => { // the disc's south shore at x
    const p = WATER.pond; let lo = 0.3, hi = 2.8;
    for (let i = 0; i < 24; i++) { const a = (lo + hi) / 2; if (p.x + Math.cos(a) * p.rx * pondEdge(a) > x) lo = a; else hi = a; }
    return p.z + Math.sin(lo) * p.rz * pondEdge(lo);
  };
  const weirP = (f, v, q) => { // film and sill in plan
    const k = (v + 1) / 2, nx = lerp(CHEEK_X[0], CHEEK_X[1], k), nz = pondRimZ(clamp(nx, CHEEK_X[0], CHEEK_X[1])) - 0.03;
    lipPt(k, 0.08, q); q.x = lerp(nx, q.x, f); q.z = lerp(nz, q.z, f); return q;
  };
  // the water surface along the sill: it leaves the pond at WATER.y, draws down over the crest and keeps falling to the lip
  const CREST_F = 0.12, FILM_CREST = WATER.y - 0.034, FILM_LIP = SLOT.y + 0.045, SILL_D = 0.016;
  const filmY = (f) => (f < CREST_F ? lerp(WATER.y - 0.003, FILM_CREST, sstep(0, CREST_F, f)) : lerp(FILM_CREST, FILM_LIP, Math.pow((f - CREST_F) / (1 - CREST_F), 1.25)));
  const spare = [];   // stones the gap removes still draw from rng, so everything seeded after them stays put; they land here and are dropped

  const o = {};
  const buildWall = (r, wallName) => {
    { // dark backing, so the gaps on the outside of a bend show wet stone instead of the raw plate
      const pos = [], cols = [], dark = C('#5f7a6d');
      for (const [s0, s1, top] of r === railH ? [[0, GAP[0], 0.08], [GAP[0], GAP[1], WY], [GAP[1], r.len, 0.08]] : [[0, r.len, 0.08]]) {
        const N = Math.ceil((s1 - s0) / 0.3);
        for (let i = 0; i < N; i++) {
          r.at(lerp(s0, s1, i / N), c1); const ax = c1.x + c1.ix * 0.04, az = c1.z + c1.iz * 0.04; r.at(lerp(s0, s1, (i + 1) / N), c1); const bx = c1.x + c1.ix * 0.04, bz = c1.z + c1.iz * 0.04;
          pos.push(ax, top, az, bx, top, bz, ax, -1.3, az, bx, top, bz, bx, -1.3, bz, ax, -1.3, az);
        }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
      put(stoneL, g, {}, dark);
    }
    COURSES.forEach(([y1, y0], k) => {
      let s = -rng() * 0.5;
      while (s < r.loop) {
        const l = rng.range(0.52, 1.02), a = s + l / 2; s += l;
        if (a < 0.02 || a > r.loop - 0.02) continue;
        if (k < 2 && inStair(r, a) && k === 0) continue;
        r.at(a, o); if (k < 2 && nearBridge(o.x, o.z)) continue;
        const ins = 0.05 + 0.028 * k + rng.range(-0.016, 0.016), h = y1 - y0 - 0.016, dp = 0.36, g = kit.box(l - 0.026, h, dp);
        kit.chip(g, 0.012, rng);
        put((r === railH && k < 2) || a > r.len - 0.02 || (r.repair && r.repair.some(([p, q]) => a > p && a < q)) ? spare : stoneL, g, { pos: [o.x + o.ix * (ins - dp / 2), (y0 + y1) / 2, o.z + o.iz * (ins - dp / 2)], rot: [0, o.yaw, 0] }, stoneTint(rng.pick(WALLT)));
      }
    });
    // coping: long caps, a few lost or slumped; the gaps fill with moss
    let s = -rng() * 0.6;
    while (s < r.loop) {
      const l = rng.range(0.72, 1.3), a = s + l / 2; s += l;
      if (a < 0.08 || a > r.loop - 0.06) continue;
      r.at(a, o); if (nearBridge(o.x, o.z) || inStair(r, a)) continue;
      const out = rng();
      const past = a > r.len - 0.06;
      if (out < 0.09) { for (let k = 0; k < 4; k++) put(r === railH || past ? spare : plantL, smooth(kit.sphere(0.13, 7, 4)), { pos: [o.x - o.ix * 0.05 + o.tx * (k - 1.5) * l * 0.24, 0.05, o.z - o.iz * 0.05 + o.tz * (k - 1.5) * l * 0.24], scale: [rng.range(0.9, 1.5), 0.5, rng.range(1, 1.7)], rot: [0, o.yaw, 0] }, rng.pick([P.moss, P.mossDeep, P.ivy])); continue; }
      const slump = out < 0.2 ? rng.range(0.05, 0.12) : 0, g = kit.box(l - 0.03, 0.13, 0.54); kit.chip(g, 0.016, rng);
      put(r === railH || past ? spare : stoneL, g, { pos: [o.x + o.ix * 0.03, 0.095 - slump * 0.5, o.z + o.iz * 0.03], rot: [slump * rng.sign(), o.yaw, rng.range(-0.02, 0.02) - slump * 0.3] }, rng.pick(WALLT));
    }
  };
  buildWall(railL, 'L'); buildWall(railR, 'R'); buildWall(railH, 'H');
  // the new stretch: the same coursed wall, with two lengths that were rebuilt in poured concrete when the banks failed
  railLo.repair = [[railLo.len * 0.28, railLo.len * 0.42]]; railRo.repair = [[railRo.len * 0.34, railRo.len * 0.52]];
  outerBlock(() => {
    buildWall(railLo, 'Lo'); buildWall(railRo, 'Ro');
    for (const r of [railLo, railRo]) for (const [p, q] of r.repair) {
      let s = p;
      while (s < q - 0.2) {
        const l = Math.min(q - s, rng.range(1.5, 2.1)), a = s + l / 2; s += l; r.at(a, o);
        const g = kit.box(l - 0.03, 1.32, 0.42); kit.chip(g, 0.014, rng);
        put(stoneL, g, { pos: [o.x + o.ix * (0.04 - 0.21), -0.58, o.z + o.iz * (0.04 - 0.21)], rot: [0, o.yaw, rng.range(-0.012, 0.012)] }, (px, py) => C('#d6d4c6').lerp(C('#7f9186'), sstep(WY + 0.46, WY - 0.05, py)).lerp(C('#8a7a62'), 0.25 * sstep(0.62, 0.78, vnoise(px * 2.2, py * 2.6))));
        const g2 = kit.box(l - 0.03, 0.14, 0.5); kit.chip(g2, 0.012, rng);
        put(stoneL, g2, { pos: [o.x + o.ix * 0.03, 0.1, o.z + o.iz * 0.03], rot: [rng.range(-0.01, 0.01), o.yaw, 0] }, rng.pick(['#e6e2d4', '#d8d6c8']));
      }
    }
  });

  // steps down to the water, run along the bank inside the cut, with a washing slab at the foot
  for (const q of STAIRS) {
    const run = 0.25, rise = 0.088, wd = 0.62;
    for (let i = 0; i < q.n; i++) {
      q.rail.at(q.s + i * run * q.dir, o);
      const top = 0.13 - i * rise, h = Math.min(0.3, top + 0.9), g = kit.box(run + 0.012, h, wd); kit.chip(g, 0.008, rng);
      put(stoneL, g, { pos: [o.x + o.ix * (wd / 2 + 0.06), top - h / 2, o.z + o.iz * (wd / 2 + 0.06)], rot: [0, o.yaw, 0] }, stoneTint(rng.pick(WALLT)));
    }
    { q.rail.at(q.s + (q.n * run) / 2 + 0.1, o); const l = q.n * run + 0.9, g = kit.box(l, 0.8, wd - 0.02); put(stoneL, g, { pos: [o.x + o.ix * (wd / 2 + 0.05), -0.9, o.z + o.iz * (wd / 2 + 0.05)], rot: [0, o.yaw, 0] }, stoneTint('#d3d7cb')); }
    q.rail.at(q.s + q.n * run * q.dir + 0.3, o);
    const g = kit.box(0.72, 0.1, wd + 0.12); kit.chip(g, 0.012, rng);
    put(stoneL, g, { pos: [o.x + o.ix * (wd / 2 + 0.08), WY + 0.0, o.z + o.iz * (wd / 2 + 0.08)], rot: [0, o.yaw, 0] }, stoneTint('#ece4cf'));
        // iron mooring ring let into the wall by the landing
    q.rail.at(q.s + q.n * run + 0.12, o);
    put(rustL, kit.torus(0.075, 0.014, 5, 12), { pos: [o.x + o.ix * 0.1, -0.2, o.z + o.iz * 0.1], rot: [0.3, o.yaw, 0] }, '#ffffff');
  }

  /* ---------- weir: a sloping concrete sill between stone cheeks, the head wall opened over it, a little sluice frame ---------- */
  {
    for (let i = 0; i < 6; i++) { rng(); rng(); for (const sgn of [-1, 1]) if (hash(i, sgn) > 0.22) { rng(); rng(); rng(); } }   // the curb blocks that stood here: their draws stay, for what is seeded after
    const wr = ctx.seeded('river-weir'), S = {};
    /** A convex block: ring [x,z] with a top height per corner, faces flat. */
    const prism = (ring, tops, bot) => {
      let area = 0; ring.forEach((p, i) => { const q = ring[(i + 1) % ring.length]; area += p[0] * q[1] - q[0] * p[1]; });
      const rr = area > 0 ? [...ring].reverse() : ring, tt = area > 0 ? [...tops].reverse() : tops, pos = [], n = rr.length, T = (i) => [rr[i][0], tt[i], rr[i][1]], B = (i) => [rr[i][0], bot, rr[i][1]];
      for (let i = 1; i < n - 1; i++) pos.push(...T(0), ...T(i), ...T(i + 1));
      for (let i = 0; i < n; i++) { const j = (i + 1) % n; pos.push(...T(i), ...B(i), ...B(j), ...T(i), ...B(j), ...T(j)); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 2), 2)); g.computeVertexNormals(); return g;
    };
    // the sill: cast slabs that fan from square-on at the pond to parallel with the lip. Their ends run into the cheeks.
    // The first is the flat crest, back under the pond; the last is the lip, carried down to the wall's lower courses.
    const SLABS = 6, joint = 0.006, wetC = ['#d6e2d6', '#e0e8dc', '#cfdcd2'];
    for (let i = 0; i < SLABS; i++) {
      const f0 = i ? lerp(CREST_F, 1, (i - 1) / (SLABS - 1)) : 0, f1 = lerp(CREST_F, 1, i / (SLABS - 1)), a = i ? f0 + joint : 0, b = i === SLABS - 1 ? 1 : f1 - joint;
      const ring = [], ys = [];
      for (const [f, v] of [[a, -1.08], [a, 1.08], [b, 1.08], [b, -1.08]]) { weirP(f, v, S); ring.push([S.x, i ? S.z : Math.min(S.z, f === a ? CHEEK_N : S.z)]); ys.push((i ? filmY(f) : FILM_CREST) - SILL_D); }
      put(stoneL, prism(ring, ys, i === SLABS - 1 ? WY - 0.04 : SLOT.y - 0.14), {}, wr.pick(wetC));
    }
    // the cheeks: solid stone from the soil down past the slot floor to the canal's water, so nothing beside or under the film is open.
    // West it closes on the head wall and the first stones of the bank; east it fills the corner of the slot behind the wall.
    lipPt(0, 0, S); const Ax = S.x, Az = S.z; lipPt(1, 0, S); const Bx = S.x, Bz = S.z;
    const CTOP = 0.066, CBOT = WY - 0.02, X0 = SLOT.x[0] - 0.04, X1 = SLOT.x[1] + 0.04, Z1 = SLOT.z[1] + 0.04;
    const headAtZ = (z) => { const t = (z - L[0][1]) / (R[0][1] - L[0][1]); return [lerp(L[0][0], R[0][0], t), z]; };
    put(stoneL, kit.plate([[CHEEK_X[0], CHEEK_N], [X0, CHEEK_N], [X0, L[0][1] + 0.08], [L[0][0], L[0][1]], [Ax, Az]], [], CTOP, CTOP - CBOT), {}, stoneTint('#d3d7cb'));
    put(stoneL, kit.plate([[CHEEK_X[1], CHEEK_N], [X1, CHEEK_N], [X1, Z1], headAtZ(Z1), [Bx, Bz]], [], CTOP, CTOP - CBOT), {}, stoneTint('#d3d7cb'));
    // ashlar facing on the channel side, and coping along the top of it; only the coping has come loose
    for (const k of [0, 1]) {
      const sgn = k ? 1 : -1, dx = (k ? Bx : Ax) - CHEEK_X[k], dz = (k ? Bz : Az) - CHEEK_N, len = Math.hypot(dx, dz), yaw = Math.atan2(-dz, dx), tx = dx / len, tz = dz / len;
      const at = (s, off) => [CHEEK_X[k] + tx * s + sgn * tz * off, CHEEK_N + tz * s - sgn * tx * off];
      const FB = SLOT.y - 0.04;
      for (let s = -wr() * 0.2; s < len;) {
        const e = Math.min(len, s + wr.range(0.42, 0.74)), a = (Math.max(s, 0) + e) / 2, w = e - Math.max(s, 0); s = e + 0.001;
        if (w < 0.1) continue;
        const [x, z] = at(a, 0.035), g = kit.box(w - 0.018, CTOP - FB, 0.1); kit.chip(g, 0.006, wr);
        put(stoneL, g, { pos: [x, (CTOP + FB) / 2, z], rot: [0, yaw, 0] }, stoneTint(wr.pick(WALLT)));
      }
      for (let s = -wr() * 0.3; s < len;) {
        const e = Math.min(len - 0.02, s + wr.range(0.56, 0.96)), a = (Math.max(s, 0) + e) / 2, w = e - Math.max(s, 0), lost = wr(); s = e + 0.03;
        if (w < 0.14) continue;
        const [x, z] = at(a, 0.095), slump = lost < 0.25 ? wr.range(0.02, 0.05) : 0;   // stops where the ground's own bank coping starts
        if (lost > 0.88) { for (let i = 0; i < 3; i++) put(plantL, smooth(kit.sphere(0.12, 7, 4)), { pos: [x + tx * (i - 1) * w * 0.3, 0.08, z + tz * (i - 1) * w * 0.3], scale: [wr.range(0.8, 1.3), 0.5, wr.range(0.9, 1.4)], rot: [0, yaw, 0] }, wr.pick([P.moss, P.mossDeep, P.ivy])); continue; }
        const g = kit.box(w - 0.03, 0.13, 0.2); kit.chip(g, 0.012, wr);
        put(stoneL, g, { pos: [x, 0.07 - slump * 0.5, z], rot: [slump * wr.sign(), yaw, wr.range(-0.02, 0.02)] }, wr.pick(WALLT));
      }
    }
    // what stands of the head wall either side of the gap: its top two courses, cut square at the jambs, with their coping
    for (const [s0, s1] of [[0.03, GAP[0] + 0.012], [GAP[1] - 0.012, railH.len - 0.03]]) {
      COURSES.slice(0, 2).forEach(([y1, y0], k) => {
        const cut = s1 - s0 > 0.5 ? lerp(s0, s1, k ? 0.36 : 0.62) : s1;
        for (const [a, b] of cut < s1 ? [[s0, cut], [cut, s1]] : [[s0, s1]]) {
          const dp = 0.16, ins = 0.05 + 0.028 * k, g = kit.box(b - a - 0.016, y1 - y0 - 0.016, dp); kit.chip(g, 0.01, wr);
          railH.at((a + b) / 2, o); put(stoneL, g, { pos: [o.x + o.ix * (ins - dp / 2), (y0 + y1) / 2, o.z + o.iz * (ins - dp / 2)], rot: [0, o.yaw, 0] }, stoneTint(wr.pick(WALLT)));
        }
      });
      const g = kit.box(s1 - s0 - 0.02, 0.13, 0.34); kit.chip(g, 0.014, wr);
      railH.at((s0 + s1) / 2, o); put(stoneL, g, { pos: [o.x + o.ix * 0.1, 0.095, o.z + o.iz * 0.1], rot: [0, o.yaw, wr.range(-0.02, 0.02)] }, wr.pick(WALLT));
    }
    // sluice frame over the head wall, its gate rusted fast half way up
    const mx = (L[0][0] + R[0][0]) / 2, mz = (L[0][1] + R[0][1]) / 2, ax = (R[0][0] - L[0][0]) / 2, az = (R[0][1] - L[0][1]) / 2, yaw = Math.atan2(-az, ax);
    const rust = (g, x, y, z, rot = [0, yaw, 0], col = '#ffffff') => put(rustL, g, { pos: [x, y, z], rot }, col);
    for (const k of [-0.74, 0.74]) { const px = mx + ax * k, pz = mz + az * k; rust(kit.box(0.09, 1.12, 0.09), px, 0.68, pz); rust(kit.box(0.2, 0.05, 0.2), px, 0.16, pz); stoneCap(px, pz); }
    rust(kit.box(1.72, 0.09, 0.1), mx, 1.2, mz);
    rust(kit.box(1.34, 0.36, 0.05), mx, 0.74, mz, [0, yaw, 0.03], P.rustLit);
    for (const k of [-0.42, 0, 0.42]) rust(kit.box(0.05, 0.4, 0.07), mx + ax * k * 0.8, 0.74, mz + az * k * 0.8, [0, yaw, 0.03]);
    rust(kit.cyl(0.018, 0.018, 0.7, 6), mx, 1.3, mz, [0, 0, 0]);
    rust(kit.torus(0.17, 0.017, 5, 14), mx, 1.54, mz, [Math.PI / 2, 0, 0.3]);
    for (let i = 0; i < 3; i++) rust(kit.box(0.34, 0.016, 0.022), mx, 1.54, mz, [0, 0.3 + (i * Math.PI) / 3, 0]);
    function stoneCap(px, pz) { const g = kit.box(0.34, 0.1, 0.34); kit.chip(g, 0.012, rng); put(stoneL, g, { pos: [px, 0.13, pz], rot: [0, yaw, 0] }, '#f4f2e6'); }
  }

  /* ---------- outfall sill: broken concrete apron with rebar, and the boulders that split the fall into chutes ---------- */
  const LIP = { y: RIVER.y - 0.11, z: BASE.half + 0.14 };
  {
    const a = [], b = []; const steps = 8;
    for (let i = 0; i <= steps; i++) { const d = lerp(TOTAL - 1.15, TOTAL, i / steps); chan(d, 1.02, c1); a.push([c1.x, c1.z]); chan(d, -1.02, c1); b.push([c1.x, c1.z]); }
    const edge = []; const n = 12, x0 = a[steps][0], x1 = b[steps][0];
    for (let i = 0; i <= n; i++) { const f = i / n; edge.push([lerp(x0, x1, f), LIP.z + (i === 0 || i === n ? -0.04 : (hash(i, 3) - 0.5) * 0.16)]); }
    const outl = [...a, ...edge, ...b.reverse()];
    // the base module's sill carries the lip at this end; only the rebar spilling from its broken front is ours
    for (let i = 0; i < 7; i++) {
      const x = lerp(x0 + 0.2, x1 - 0.2, (i + 0.5) / 7) + rng.range(-0.1, 0.1), yy = LIP.y - rng.range(0.25, 0.8), l = rng.range(0.14, 0.36);
      put(spare, kit.tube([[x, yy, LIP.z + 0.05], [x + rng.range(-0.04, 0.04), yy - 0.02, LIP.z + 0.1 + l * 0.6], [x + rng.range(-0.12, 0.12), yy - rng.range(0.02, 0.12), LIP.z + 0.1 + l]], 0.016, 0.012, 5, 6), {}, '#ffffff');
    }
  }
  // the two ends of the canal walls, where they meet the notch in the plinth
  for (const [r, sgn] of [[railLo, -1], [railRo, 1]]) {
    r.at(r.len - 0.2, o);
    const g = kit.box(0.62, 1.5, 0.5); kit.chip(g, 0.02, rng); put(stoneL, g, { pos: [o.x + sgn * 0.1, -0.62, BASE.half - 0.16], rot: [0, 0, 0] }, '#ece4cf');
    const cap = kit.box(0.74, 0.14, 0.62); kit.chip(cap, 0.018, rng); put(stoneL, cap, { pos: [o.x + sgn * 0.1, 0.12, BASE.half - 0.18], rot: [0.03, 0.03, sgn * 0.02] }, '#f4f2e6');
  }
  const kx = FHW / 1.5;   // v2's lip was three units wide; every sill stone and chute is re-laid in proportion on the new one
  const Y0 = LIP.y + 0.055, YF = -BASE.height - 2.6, T_END = Math.sqrt((2 * (Y0 - YF)) / GRAV), STAIN_END = -3.4;
  const CHUTES = [
    { x: FCX - 0.86 * kx, w: 0.98 * kx, vx: -0.08, vz: 0.64, z: LIP.z - 0.06 },
    { x: FCX + 0.14 * kx, w: 0.86 * kx, vx: 0.03, vz: 0.72, z: LIP.z - 0.05 },
    { x: FCX + 1.02 * kx, w: 0.42 * kx, vx: 0.1, vz: 0.54, z: LIP.z - 0.06 },
  ];
  for (const [dx, dz, r] of [[-0.34, -0.14, 0.34], [0.64, -0.26, 0.3], [-1.42, -0.5, 0.26], [1.38, -0.58, 0.24], [0, -0.92, 0.2], [1.0, -0.97, 0.16]]) {
    put(stoneL, kit.rock(r * 1.15, rng, 0.8, 1), { pos: [FCX + dx * kx, LIP.y + r * 0.42, LIP.z + dz * kx], rot: [0, rng() * 6, 0] }, (px, py) => (py < WY + 0.04 ? C('#9db9ad') : C('#e9e6d8')));
  }
  // a few big stones standing in the channel, for the flow to break around
  const ROCKS = [[2.6, 0.22, 0.24], [6.1, -0.34, 0.22], [8.5, -0.5, 0.27], [10.0, 0.42, 0.25], [12.5, 0.3, 0.28], [12.9, -0.5, 0.22]];
  for (const [d, u, r] of ROCKS) { chan(d, u, c1); put(stoneL, kit.rock(r, rng, 1.0, 1), { pos: [c1.x, bed(d, u) + r * 0.7, c1.z], rot: [0, rng() * 6, 0] }, (px, py) => (py < WY ? C('#bcd8cb') : C('#efece0'))); }

  /* ---------- the humped footbridge ---------- */
  const leafTuft = () => { const parts = []; for (let i = 0; i < 6; i++) { const b = kit.blade(rng.range(0.1, 0.2), 0.03, 0.05, 2); b.rotateY((i / 6) * 6.28 + rng()); b.translate(rng.range(-0.03, 0.03), 0, rng.range(-0.03, 0.03)); parts.push(b); } return kit.merge(parts); };
  const BM = new M4().compose(new V3(br.x, 0, br.z), new Q().setFromAxisAngle(UP, br.yaw), new V3(1, 1, 1));
  const BA = br.length / 2, BW = br.width / 2, SP = 1.34, SPRING = -0.3, RISE = 0.9;
  const deckY = (z) => 0.13 + 0.87 * Math.pow(Math.cos((Math.PI * clamp(z / BA, -1, 1)) / 2), 1.3);
  const bm = (x, y, z, rot = [0, 0, 0], scale = 1) => BM.clone().multiply(kit.xf({ pos: [x, y, z], rot, scale }));
  const archY = (z, e = 0) => SPRING + (RISE + e) * Math.sqrt(Math.max(0, 1 - (z / (SP + e)) ** 2));
  {
    const pr = [];
    for (let i = 0; i <= 26; i++) { const z = lerp(-BA, BA, i / 26); pr.push([z, deckY(z) - 0.05]); }
    pr.push([BA, -0.7], [SP, -0.7]);
    for (let i = 0; i <= 22; i++) { const a = (i / 22) * Math.PI; pr.push([SP * Math.cos(a), SPRING + RISE * Math.sin(a)]); }
    pr.push([-SP, -0.7], [-BA, -0.7]);
    const g = kit.wallPanel(pr.slice().reverse(), [], br.width - 0.04); g.rotateY(-Math.PI / 2); g.computeVertexNormals();
    put(stoneL, g, BM, '#d8d8cc');
    // voussoirs on both faces
    const NV = 17;
    for (const side of [-1, 1]) {
      for (let i = 0; i < NV; i++) {
        const a0 = ((i + 0.05) / NV) * Math.PI, a1 = ((i + 0.95) / NV) * Math.PI, e = i === (NV - 1) / 2 ? 0.42 : 0.3 + 0.04 * hash(i, side);
        const poly = [[SP * Math.cos(a0), SPRING + RISE * Math.sin(a0)], [(SP + e) * Math.cos(a0), SPRING + (RISE + e) * Math.sin(a0)], [(SP + e) * Math.cos(a1), SPRING + (RISE + e) * Math.sin(a1)], [SP * Math.cos(a1), SPRING + RISE * Math.sin(a1)]];
        const pg = kit.wallPanel(poly, [], 0.08); pg.rotateY(-Math.PI / 2); pg.computeVertexNormals();
        put(stoneL, pg, bm(side * (BW - 0.005), 0, 0), i === (NV - 1) / 2 ? '#f4f2e6' : rng.pick(['#e3e2d6', '#ece4cf', '#d3d7cb']));
      }
      // spandrel ashlar, a shade proud so the courses catch ink and light
      for (let y = -0.56; y < 1.0; y += 0.225) {
        let z = -BA + rng() * 0.3;
        while (z < BA) {
          const l = rng.range(0.42, 0.78), z1 = Math.min(BA, z + l), yt = y + 0.205;
          const ok = (zz, yy) => yy < deckY(zz) - 0.1 && (Math.abs(zz) > SP + 0.31 || yy > archY(zz, 0.33));
          if (ok(z + 0.02, yt) && ok(z1 - 0.02, yt) && ok(z + 0.02, y) && ok(z1 - 0.02, y)) {
            const b = kit.box(0.05, 0.2, z1 - z - 0.02); kit.chip(b, 0.008, rng);
            put(stoneL, b, bm(side * (BW - 0.008), y + 0.1, (z + z1) / 2), rng.pick(['#e3e2d6', '#d3d7cb', '#f0ece0', '#c9d0c4']));
          }
          z = z1;
        }
      }
    }
    // deck: cross slabs following the hump
    const NS2 = 17;
    for (let i = 0; i < NS2; i++) {
      const z = lerp(-BA + 0.13, BA - 0.13, i / (NS2 - 1)), dz = (2 * BA) / (NS2 - 1), a = Math.atan2(deckY(z + 0.1) - deckY(z - 0.1), 0.2), g = kit.box(br.width + 0.02, 0.09, dz / Math.cos(a) - 0.014);
      kit.chip(g, 0.01, rng); put(stoneL, g, bm(0, deckY(z) - 0.03, z, [-a, 0, 0]), rng.pick(['#f4f2e6', '#ece4cf', '#e3e2d6']));
    }
    // parapet: posts with cap stones, rails mostly gone
    const ZP = [-2.2, -1.46, -0.73, 0, 0.73, 1.46, 2.2];
    const postTop = (z) => deckY(z) + 0.42;
    for (const side of [-1, 1]) {
      const x = side * (BW - 0.06);
      ZP.forEach((z, i) => {
        const broken = (side === -1 && i === 4) || (side === 1 && i === 1), h = broken ? 0.18 : 0.42, g = kit.box(0.17, h, 0.17); kit.chip(g, 0.01, rng);
        put(stoneL, g, bm(x, deckY(z) + h / 2, z), rng.pick(['#f4f2e6', '#e3e2d6']));
        if (!broken) { put(stoneL, kit.cylBase(0.035, 0.145, 0.1, 4), bm(x, deckY(z) + h, z, [0, Math.PI / 4, 0]), '#ece4cf'); put(stoneL, kit.sphere(0.05, 6, 4), bm(x, deckY(z) + h + 0.12, z), '#ece4cf'); }
        if (i < ZP.length - 1) {
          const z1 = ZP[i + 1], gone = hash(i, side + 4) < 0.42 || broken || ((side === -1 && i === 3) || (side === 1 && i === 0));
          for (const [fy, ry] of [[0.32, 0.05], [0.13, 0.04]]) {
            const f = gone ? (fy > 0.2 ? 0.34 : 0.62) : 1, za = z + (z1 - z) * 0, zb = z + (z1 - z) * f, ya = deckY(za) + fy, yb = deckY(zb) + fy, len = Math.hypot(zb - za, yb - ya), a = Math.atan2(yb - ya, zb - za);
            if (broken) continue;
            const r = kit.box(0.08, ry * 2, len); kit.chip(r, 0.008, rng);
            put(stoneL, r, bm(x, (ya + yb) / 2, (za + zb) / 2, [-a, 0, 0]), rng.pick(['#e3e2d6', '#d3d7cb']));
          }
        }
      });
    }
    // grass and moss in the joints of the deck, thicker toward the parapet where nothing walked
    const tuftG = leafTuft();
    for (let i = 0; i < 46; i++) {
      const z = rng.range(-BA + 0.1, BA - 0.1), x = rng.sign() * rng.range(0.18, 0.66) * (rng() < 0.7 ? 1 : 0.6), y = deckY(z) + 0.02, sc = rng.range(0.7, 1.25);
      put(plantL, tuftG, bm(x, y, z, [0, rng() * 6.28, 0], sc), (px, py) => C(P.mossDeep).lerp(C(P.grassLit), clamp((py - new V3(x, y, z).applyMatrix4(BM).y) / (0.16 * sc))));
    }
    for (let i = 0; i < 16; i++) {
      const z = rng.range(-BA + 0.2, BA - 0.2), x = rng.sign() * rng.range(0.56, 0.68);
      put(plantL, smooth(kit.sphere(0.075, 10, 6)), bm(x, deckY(z) + 0.02, z, [0, rng() * 3, 0], [rng.range(0.8, 1.7), 0.32, rng.range(1, 2.2)]), rng.pick([P.moss, P.mossDeep, P.ivy]));
    }
    // two stone lanterns at the bridge ends, one leaning
    const lantern = (lx, lz, lean, turn) => {
      const M = bm(lx, deckY(lz) - 0.02, lz, [lean, turn, lean * 0.4]), s = (g, y, col = '#e3e2d6', rot = [0, 0, 0]) => put(stoneL, g, M.clone().multiply(kit.xf({ pos: [0, y, 0], rot })), col);
      s(kit.cylBase(0.27, 0.32, 0.1, 6), 0); s(kit.cylBase(0.14, 0.2, 0.08, 6), 0.1, '#d3d7cb');
      s(kit.cylBase(0.095, 0.115, 0.5, 8), 0.18, '#ece4cf'); s(kit.cyl(0.13, 0.13, 0.03, 8), 0.44, '#d3d7cb');
      s(kit.cylBase(0.27, 0.15, 0.1, 6), 0.68, '#e3e2d6');
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; put(stoneL, kit.box(0.05, 0.25, 0.05), M.clone().multiply(kit.xf({ pos: [Math.cos(a) * 0.17, 0.9, Math.sin(a) * 0.17] })), '#d3d7cb'); }
      s(kit.cylBase(0.15, 0.15, 0.24, 6), 0.78, '#6d8a84');
      const roof = kit.cylBase(0.05, 0.38, 0.22, 6); s(roof, 1.02, '#efece0'); s(kit.cylBase(0.27, 0.39, 0.04, 6), 1.0, '#d3d7cb');
      s(kit.sphere(0.075, 7, 5), 1.28, '#f4f2e6'); s(kit.cylBase(0.0, 0.05, 0.08, 6), 1.33, '#f4f2e6');
      put(plantL, smooth(kit.sphere(0.12, 8, 5)), M.clone().multiply(kit.xf({ pos: [0.14, 1.09, -0.08], scale: [1.2, 0.42, 1.05] })), P.mossDeep);
      const fire = new THREE.Vector3(0, 0.9, 0).applyMatrix4(M), ph = lx * 3.1; // night
      ctx.shared.lamps.push({ pos: fire.toArray(), r: 5, color: '#ffb057', power: 0.72, halo: 0.95, lift: 0.3, k: (t) => 0.84 + 0.16 * Math.sin(t * 5.7 + ph) * Math.sin(t * 2.1 + ph * 1.3) });
    };
    lantern(BW + 0.42, 2.0, 0, 0.3); lantern(-BW - 0.42, -2.05, 0.15, 1.1);
  }

  /* ---------- the half-sunk rowboat, reeds up through its broken strakes ---------- */
  const reedAt = [];
  const makeBoat = ({ d, u, y, yawAdd = 0.17, rx = 0.17, rz = 0.15, paint: paintC = '#7fb2b4', white: whiteC = '#efe7d4', stove = (side, k, i) => (side === 1 && k < 3 && i > 2 && i < 7) || (side === -1 && k === 3 && (i === 9 || i === 10)) || (k === 1 && i === 11), ring: withRing = false, reeds = true }) => {
    chan(d, u, c1);
    const fwd = Math.atan2(c1.tx, c1.tz) + yawAdd;  // long axis close to the bank, bow upstream on the bar
    const M = new M4().compose(new V3(c1.x, y, c1.z), new Q().setFromEuler(new THREE.Euler(rx, fwd, rz, 'YXZ')), new V3(1, 1, 1));
    const BL = 2.5, BB = 0.46, BD = 0.42, ST_N = 14, STRK = 5;
    const beam = (t) => BB * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * t - 1), 2.6)), 0.62) * (t < 0.5 ? lerp(0.74, 1, sstep(0, 0.5, t)) : 1) + (t < 0.5 ? (1 - sstep(0, 0.12, t)) * 0.25 : 0);
    const sheer = (t) => 0.09 * Math.pow(2 * t - 1, 2) + (t > 0.5 ? 0.09 * Math.pow(2 * t - 1, 2) : 0);
    const hull = (t, a, out) => { const b = beam(t), s = Math.pow(Math.sin(a * Math.PI * 0.5), 0.72); out[0] = b * s * 1; out[1] = sheer(t) - BD * (1 - Math.pow(a, 1.4)) * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.04))); out[2] = (t - 0.5) * BL; return out; };
    const paint = C(paintC), white = C(whiteC), rawW = C('#b58e62'), red = C('#c8705e');
    const a0 = [0, 0, 0], a1 = [0, 0, 0], b0 = [0, 0, 0], b1 = [0, 0, 0];
    for (const side of [-1, 1]) for (let k = 0; k < STRK; k++) {
      const col = k === 4 ? white : k === 3 ? paint : k === 2 ? paint : rawW;
      for (let i = 0; i < ST_N; i++) {
        if (stove(side, k, i)) continue; // stove-in planks
        const t0 = i / ST_N, t1 = (i + 1) / ST_N, u0 = k / STRK, u1 = (k + 0.98) / STRK;
        hull(t0, u0, a0); hull(t1, u0, a1); hull(t0, u1, b0); hull(t1, u1, b1);
        const lap = 0.012;
        const g = new THREE.BufferGeometry(); const q = [a0[0] * side, a0[1], a0[2], a1[0] * side, a1[1], a1[2], b1[0] * side + lap * side, b1[1], b1[2], a0[0] * side, a0[1], a0[2], b1[0] * side + lap * side, b1[1], b1[2], b0[0] * side + lap * side, b0[1], b0[2]];
        g.setAttribute('position', new THREE.Float32BufferAttribute(q, 3)); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(12), 2)); g.computeVertexNormals();
        const c = col.clone().multiplyScalar(0.88 + 0.2 * hash(i, k * side));
        put(woodL, g, M, hash(i + 9, k) < 0.18 ? rawW : c);
      }
    }
    const WM = (x, y, z, rot = [0, 0, 0]) => M.clone().multiply(kit.xf({ pos: [x, y, z], rot }));
    for (const side of [-1, 1]) { // gunwales, ribs
      const pts = []; for (let i = 0; i <= 12; i++) { hull(0.015 + (i / 12) * 0.97, 1, a0); pts.push([a0[0] * side, a0[1] + 0.012, a0[2]]); }
      put(woodL, kit.tube(pts, 0.027, 0.027, 5, 26), M, '#efe7d4');
    }
    for (let i = 2; i <= 12; i += 2) {
      const t = i / 14, pts = []; for (let j = 0; j <= 6; j++) { const a = -1 + j / 3, s = Math.sign(a) || 1; hull(t, Math.abs(a), a0); pts.push([a0[0] * s * 0.95, a0[1] + 0.02, a0[2]]); }
      put(woodL, kit.tube(pts, 0.016, 0.016, 4, 12, { capEnds: false }), M, '#8d6b48');
    }
    for (const [t, w] of [[0.33, 0.8], [0.66, 0.82]]) { hull(t, 1, a0); put(woodL, kit.box(a0[0] * 2 * w + 0.04, 0.035, 0.2), WM(0, a0[1] - 0.09, a0[2], [0, 0, t < 0.5 ? 0.05 : -0.1]), '#c19a6b'); }
    hull(0.985, 1, a0); put(woodL, kit.box(0.5, 0.36, 0.035), WM(0, a0[1] - 0.17, BL / 2 - 0.03), '#a8835a');   // transom
    hull(0.002, 1, a0); put(woodL, kit.tube([[0, a0[1] + 0.05, a0[2] - 0.04], [0, a0[1] - 0.15, a0[2] + 0.03], [0, a0[1] - 0.42, a0[2] + 0.26]], 0.03, 0.03, 5, 8), M, '#8d6b48');
    // snapped oar across the thwart, painter rope to a ring on the wall
    put(woodL, kit.tube([[-0.3, 0.09, 0.32], [0.3, 0.11, -0.06], [0.74, 0.12, -0.32]], 0.018, 0.016, 5, 6), M, '#c19a6b');
    put(woodL, kit.box(0.13, 0.015, 0.34), WM(0.82, 0.12, -0.42, [0, 0.6, 0]), '#efe7d4');
    if (withRing) {
      const bow = new V3(0, 0.26, -BL / 2).applyMatrix4(M); railL.at(5.9, o);
      put(rustL, kit.torus(0.08, 0.014, 5, 12), { pos: [o.x + o.ix * 0.1, -0.03, o.z + o.iz * 0.1], rot: [0.3, o.yaw, 0] }, '#ffffff');
      const ring = [o.x + o.ix * 0.1, -0.1, o.z + o.iz * 0.1], mid = [(bow.x + ring[0]) / 2, Math.min(bow.y, ring[1]) - 0.1, (bow.z + ring[2]) / 2];
      put(woodL, kit.tube([bow.toArray(), mid, ring], 0.013, 0.013, 4, 10), {}, '#dcc9a0');
    }
    if (reeds) for (const [x, z, s] of [[0.22, -0.34, 0.82], [0.05, 0.1, 0.92], [-0.12, 0.72, 0.8]]) { const p = new V3(x, -0.26, z).applyMatrix4(M); reedAt.push({ x: p.x, y: p.y, z: p.z, s: s * 1.02 }); }
  };
  makeBoat({ d: 4.72, u: 0.34, y: WY + 0.2, ring: true });

  /* ---------- drowned trolley and bicycle wheel ---------- */
  const rod = (list, a, b, r, col, M = null, seg = 5) => {
    const A = new V3(...a), B = new V3(...b), d = B.clone().sub(A), l = d.length(), g = kit.cyl(r, r, l, seg, true);
    const m = new M4().compose(A.clone().addScaledVector(d, 0.5), new Q().setFromUnitVectors(UP, d.clone().normalize()), new V3(1, 1, 1));
    put(list, g, M ? M.clone().multiply(m) : m, col);
  };
  {
    chan(8.92, 0.42, c1);
    const M = new M4().compose(new V3(c1.x, bed(8.92, 0.42) + 0.05, c1.z), new Q().setFromEuler(new THREE.Euler(-0.32, 1.1, 0.24, 'YXZ')), new V3(1, 1, 1));
    const T = '#f0c8ac', hw0 = 0.2, hw1 = 0.3, l0 = -0.46, l1 = 0.46, yb = 0.38, yt = 0.8;
    const P3 = (fu, fv, fy) => { const hw = lerp(hw0, hw1, fv), y = lerp(yb, yt, fy), w = lerp(hw * 0.86, hw, fy); return [lerp(-w, w, fu), y, lerp(l0, l1, fv)]; };
    for (let i = 0; i <= 8; i++) { const f = i / 8; rod(rustL, P3(0, f, 0), P3(0, f, 1), 0.009, T, M, 4); rod(rustL, P3(1, f, 0), P3(1, f, 1), 0.009, T, M, 4); rod(rustL, P3(0, f, 0), P3(1, f, 0), 0.009, T, M, 4); }
    for (let i = 0; i <= 5; i++) { const f = i / 5; rod(rustL, P3(f, 0, 0), P3(f, 0, 1), 0.009, T, M, 4); rod(rustL, P3(f, 1, 0), P3(f, 1, 1), 0.009, T, M, 4); rod(rustL, P3(f, 0, 0), P3(f, 1, 0), 0.009, T, M, 4); }
    for (const fy of [0.33, 0.66, 1]) { rod(rustL, P3(0, 0, fy), P3(0, 1, fy), fy === 1 ? 0.016 : 0.009, T, M, 4); rod(rustL, P3(1, 0, fy), P3(1, 1, fy), fy === 1 ? 0.016 : 0.009, T, M, 4); rod(rustL, P3(0, 0, fy), P3(1, 0, fy), fy === 1 ? 0.016 : 0.009, T, M, 4); rod(rustL, P3(0, 1, fy), P3(1, 1, fy), fy === 1 ? 0.016 : 0.009, T, M, 4); }
    for (const [x, z, xb, zb] of [[-0.18, -0.4, -0.22, -0.42], [0.18, -0.4, 0.22, -0.42], [-0.27, 0.4, -0.25, 0.4], [0.27, 0.4, 0.25, 0.4]]) {
      rod(rustL, [x, yb, z], [xb, 0.09, zb], 0.016, '#ffffff', M); put(rustL, kit.cyl(0.05, 0.05, 0.035, 8), M.clone().multiply(kit.xf({ pos: [xb, 0.05, zb], rot: [0, 0, Math.PI / 2] })), '#6d6a66');
    }
    rod(rustL, [-0.25, 0.09, 0.4], [-0.22, 0.09, -0.42], 0.014, '#ffffff', M); rod(rustL, [0.25, 0.09, 0.4], [0.22, 0.09, -0.42], 0.014, '#ffffff', M);
    rod(rustL, [-0.3, yt, 0.46], [-0.3, yt + 0.1, 0.62], 0.014, '#ffffff', M); rod(rustL, [0.3, yt, 0.46], [0.3, yt + 0.1, 0.62], 0.014, '#ffffff', M);
    put(rustL, kit.cyl(0.024, 0.024, 0.6, 7), M.clone().multiply(kit.xf({ pos: [0, yt + 0.1, 0.62], rot: [0, 0, Math.PI / 2] })), '#f4876e');
    // a little loop of ivy-green weed caught on the handle, and a seat flap
    put(plantL, kit.tube([[-0.2, yt + 0.1, 0.62], [-0.16, yt - 0.04, 0.72], [-0.1, yt - 0.3, 0.76]], 0.02, 0.008, 4, 6), M, P.mossDeep);

    chan(3.1, 0.66, c1);
    const WM = new M4().compose(new V3(c1.x, bed(3.1, 0.66) + 0.31, c1.z), new Q().setFromEuler(new THREE.Euler(0.2, Math.atan2(-c1.nz, c1.nx) + 1.45, 0.42, 'YXZ')), new V3(1, 1, 1));
    const Rw = 0.34;
    put(rustL, kit.torus(Rw, 0.016, 6, 26), WM, '#ffffff'); put(rustL, kit.torus(Rw + 0.018, 0.024, 6, 26), WM, '#5f5a58');
    put(rustL, kit.cyl(0.03, 0.03, 0.07, 8), WM.clone().multiply(kit.xf({ rot: [Math.PI / 2, 0, 0] })), '#ffffff');
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; if (i === 3 || i === 8) continue; rod(rustL, [0, 0, 0], [Math.cos(a) * Rw, Math.sin(a) * Rw, 0], 0.006, '#ffffff', WM, 3); }
    rod(rustL, [0.02, 0, 0.05], [0.2, 0.42, 0.06], 0.016, '#ffffff', WM); rod(rustL, [0.02, 0, -0.05], [0.2, 0.42, -0.06], 0.016, '#ffffff', WM);
  }

  /* ---------- plants on the bars, in the shallows and on the wall joints ---------- */
  const leafGrad = (lo, hi, h) => { const a = C(lo), b = C(hi), t = new THREE.Color(); return (x, y) => t.copy(a).lerp(b, clamp(y / h)); };
  // lily pads in the eddies
    const padGeo = (r) => {
      const pos = [], SEG = 12, notch = 0.22;
      for (let i = 0; i < SEG; i++) {
        const a0 = notch + (i / SEG) * (6.283 - 2 * notch), a1 = notch + ((i + 1) / SEG) * (6.283 - 2 * notch);
        pos.push(0, 0.012, 0, Math.cos(a1) * r, 0, Math.sin(a1) * r, Math.cos(a0) * r, 0, Math.sin(a0) * r);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 2), 2)); g.computeVertexNormals(); return g;
    };
    const padC = ['#6fbf63', '#58ad60', '#8ccb60', '#4fa268'];
    const bloom = (x, z, s, col, core = '#ffd84f') => {
      for (const [rows, tilt, len] of [[8, 0.5, 0.15], [6, 0.95, 0.11]]) for (let i = 0; i < rows; i++) {
        const a = ((i + (tilt > 0.6 ? 0.5 : 0)) / rows) * Math.PI * 2, l = kit.leaf(len * s, len * s * 0.52, 0.2).rotateX(-tilt).rotateY(a).translate(x, WY + 0.03, z);
        put(plantL, l, {}, (px, py) => C(col).lerp(C('#ffffff'), clamp((py - WY - 0.03) / (0.12 * s))));
      }
      put(plantL, kit.sphere(0.035 * s, 6, 4), { pos: [x, WY + 0.06 * s, z], scale: [1, 0.7, 1] }, core);
    };
    let flowers = 0;
    for (const [d, u, n, sp] of [[6.2, 0.62, 7, 0.5], [3.4, -0.18, 5, 0.42], [9.9, -0.38, 8, 0.52], [10.9, 0.5, 6, 0.42], [2.0, 0.52, 4, 0.32], [5.6, -0.6, 5, 0.38]]) {
      for (let i = 0; i < n; i++) {
        const dd = d + rng.range(-1, 1) * sp * 1.6, uu = clamp(u + rng.range(-1, 1) * sp * 0.5, -0.84, 0.84); chan(dd, uu, c1);
        if (bed(dd, uu) > WY - 0.12 || nearBridge(c1.x, c1.z)) continue;
        const r = rng.range(0.13, 0.26);
        put(plantL, padGeo(r), { pos: [c1.x, WY + 0.008, c1.z], rot: [rng.range(-0.03, 0.03), rng() * 6.28, rng.range(-0.03, 0.03)] }, rng.pick(padC));
        if (i % 3 === 1 && flowers < 7) { flowers++; chan(dd + 0.16, uu + 0.1, c2); bloom(c2.x, c2.z, rng.range(0.9, 1.2), rng.pick(['#ffc6dc', '#ffe8f0', '#f7a6c6'])); }
      }
    }
  const iris = (x, y, z, s) => {
    const g = leafGrad(P.leafDeep, P.leafLit, 0.8 * s);
    for (let i = 0; i < 7; i++) put(plantL, kit.blade(rng.range(0.55, 0.9) * s, 0.075 * s, 0.1, 3), { pos: [x + rng.range(-0.05, 0.05), y, z + rng.range(-0.05, 0.05)], rot: [rng.range(-0.1, 0.1), rng() * 6.28, rng.range(-0.1, 0.1)] }, (px, py) => g(px, py - y));
    for (let i = 0; i < 2; i++) {
      const fx = x + rng.range(-0.1, 0.1), fz = z + rng.range(-0.1, 0.1), fy = y + rng.range(0.68, 0.86) * s, col = rng.pick([P.flowerBlue, P.flowerPurple, '#8f7bf0']);
      put(plantL, kit.cyl(0.008, 0.012, fy - y, 4), { pos: [fx, (fy + y) / 2, fz] }, P.leafMid);
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * 6.283 + i; const fall = kit.leaf(0.16 * s, 0.11 * s, 0.2).rotateX(0.72).rotateY(a).translate(fx, fy, fz), std = kit.leaf(0.13 * s, 0.075 * s, 0.25).rotateX(-1.15).rotateY(a + 1.05).translate(fx, fy, fz);
        put(plantL, fall, {}, (px, py) => C(col).lerp(C(P.flowerYellow), py > fy - 0.015 ? 0.0 : 0)); put(plantL, std, {}, C(col).lerp(C('#ffffff'), 0.28));
      }
      put(plantL, kit.sphere(0.024 * s, 5, 4), { pos: [fx, fy + 0.012, fz] }, P.flowerYellow);
    }
  };
  { // reeds, iris and drowned weed
    const bars = [[4.0, 0.66, 3], [3.2, 0.76, 2], [6.0, 0.8, 2], [11.0, -0.64, 5], [10.3, -0.72, 2], [11.9, -0.74, 3], [1.0, -0.8, 3], [9.5, 0.82, 2]];
    for (const [d, u, n] of bars) for (let i = 0; i < n; i++) { const dd = d + rng.range(-0.34, 0.34), uu = clamp(u + rng.range(-0.1, 0.1), -0.93, 0.93); chan(dd, uu, c1); reedAt.push({ x: c1.x, y: Math.max(bed(dd, uu), WY - 0.2), z: c1.z, s: rng.range(0.78, 1.2) }); }
    for (const [d, u] of [[4.1, 0.86], [5.5, 0.86], [10.6, -0.84], [11.6, -0.56], [12.1, -0.86], [0.8, -0.9], [1.4, -0.86]]) { chan(d, u, c1); iris(c1.x, Math.max(bed(d, u), WY - 0.02), c1.z, rng.range(0.82, 1.08)); }
    // long weed combed by the current
    const weed = leafGrad('#2f8f6a', '#6fc06a', 0.55);
    for (let i = 0; i < 30; i++) {
      const d = rng.range(0.6, LEN - 2.6), u = rng.range(-0.85, 0.85); chan(d, u, c1); const y = bed(d, u); if (y > WY - 0.3) continue;
      const yaw = Math.atan2(c1.tx, c1.tz);
      for (let k = 0; k < 3; k++) put(plantL, kit.blade(rng.range(0.36, 0.56), 0.06, 0.34, 3), { pos: [c1.x + rng.range(-0.06, 0.06), y, c1.z + rng.range(-0.06, 0.06)], rot: [0, yaw + rng.range(-0.25, 0.25), 0] }, (px, py) => weed(px, py - y));
    }
    // ferns and moss beards in the joints of the bank; the north wall faces the default camera
    const frondG = kit.frond(0.62, 6, 0.2);
    const fernCol = leafGrad(P.leafDeep, P.leafLit, 0.34);
    for (const [r, n] of [[railL, 22], [railR, 12]]) for (let i = 0; i < n; i++) {
      const s = rng.range(0.3, r.loop - 0.5); r.at(s, o); if (nearBridge(o.x, o.z) || inStair(r, s)) continue;
      const y = rng.pick([-0.02, -0.16, 0.04]);
      for (let k = 0; k < 3; k++) {
        const sc = rng.range(0.7, 1.1), yaw = Math.atan2(o.ix, o.iz) + rng.range(-0.9, 0.9);
        put(plantL, frondG, { pos: [o.x + o.ix * 0.07, y, o.z + o.iz * 0.07], rot: [rng.range(-0.1, 0.45), yaw, 0], scale: sc }, (px, py) => fernCol(px, py - y + 0.12));
      }
    }
    for (const [r, n] of [[railL, 34], [railR, 22], [railH, 4]]) for (let i = 0; i < n; i++) {
      const s = rng.range(0.1, r.loop - 0.1); r.at(s, o); if (nearBridge(o.x, o.z)) continue;
      const hang = rng.range(0.18, 0.5), wd = rng.range(0.12, 0.3), y = rng.pick([0.02, -0.02, -0.15]);
      if (r === railH && s > GAP[0] - 0.1 && s < GAP[1] + 0.1) continue;
      put(plantL, smooth(kit.sphere(1, 8, 6)), { pos: [o.x + o.ix * 0.08, y - hang * 0.45, o.z + o.iz * 0.08], scale: [wd, hang * 0.7, 0.05], rot: [0, o.yaw, 0] }, (px, py) => C(P.moss).lerp(C(P.mossDeep), sstep(y, y - hang, py)));
    }
  }

  /* ---------- shell foliage: every leaf lit by the smooth normal of its clump, so the terminator draws broad bands ---------- */
  const shellMat = (() => {
    const m = ctx.toon({ color: '#ffffff', side: THREE.DoubleSide, vertexColors: true, dapple: false, translucent: 0.6 });
    const bc = m.onBeforeCompile, key = m.customProgramCacheKey();
    m.onBeforeCompile = (sh, r) => {
      bc(sh, r);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aShell;').replace('#include <normal_vertex>', 'transformedNormal=normalize(mat3(viewMatrix)*aShell);\n#include <normal_vertex>');
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
    };
    m.customProgramCacheKey = () => key + '|shell';
    return m;
  })();
  const shellLeaf = new THREE.BufferGeometry();
  { const w = 0.8, c = 0.09;
    shellLeaf.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -w / 2, c, 0.3, -w * 0.4, c, 0.68, 0, 0, 1, w * 0.4, c, 0.68, w / 2, c, 0.3], 3));
    shellLeaf.setAttribute('color', new THREE.Float32BufferAttribute([0.72, 0.74, 0.72, 0.92, 0.92, 0.9, 1, 1, 0.98, 1.05, 1.05, 1, 1, 1, 0.98, 0.92, 0.92, 0.9], 3));
    shellLeaf.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(18).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    shellLeaf.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(12).fill(0), 2));
    shellLeaf.setIndex([0, 2, 1, 0, 3, 2, 0, 4, 3, 0, 5, 4]); }
  const TONE = [[0.74, C(P.leafLit).lerp(C(P.leafMid), 0.3).multiplyScalar(0.84)], [0.6, C(P.leafMid).multiplyScalar(0.84)], [0.42, C(P.leafDeep).multiplyScalar(0.94)], [-9, C(P.leafShade).multiplyScalar(1.06)]];
  const leaves = [];
  /** A soft mass: leaves on an ellipsoid shell. droop>0 lets them hang like a curtain. flat squeezes it against a wall. */
  const mass = (cx, cy, cz, rx, ry, rz, n0, s0 = 0.17, droop = 0.4) => {
    s0 *= 0.68; const n = Math.round(n0 * 2);
    for (let i = 0; i < n; i++) {
      const q = new V3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1); if (q.lengthSq() > 1 || q.lengthSq() < 0.02) { i--; continue; } q.normalize();
      const k = rng.range(0.74, 1.02), p = new V3(cx + q.x * rx * k, cy + q.y * ry * k, cz + q.z * rz * k);
      const shell = new V3(q.x / rx, q.y / ry + 0.3 / ry, q.z / rz).normalize();
      const tip = new V3(rng() - 0.5, -droop - rng() * 0.3, rng() - 0.5).normalize();
      const v = shell.dot(SUN) * 0.5 + 0.5 + rng.range(-0.05, 0.05);
      leaves.push({ p, shell, tip, s: s0 * rng.range(0.8, 1.25), tone: TONE.find(([min]) => v > min)[1] });
    }
  };
  /** Ivy: a tube with leaf clumps strung along it. */
  const vine = (pts, r = 0.016, every = 0.24, cr = 0.13) => {
    put(woodL, kit.tube(pts, r, r * 0.5, 4, 0), {}, '#6b5a3e');
    const cv = new THREE.CatmullRomCurve3(pts.map((p) => new V3(...p))), l = cv.getLength(), n = Math.floor(l / every);
    for (let i = 0; i <= n; i++) { const p = cv.getPointAt(i / Math.max(1, n)); mass(p.x, p.y, p.z, cr, cr * 1.1, cr, 7, 0.1, 0.7); }
  };
  {
    const w = (x, y, z) => new V3(x, y, z).applyMatrix4(BM).toArray();
    // ivy over the north-side parapet of the bridge, spilling down the arch
    vine([w(0.84, -0.42, 1.42), w(0.86, 0.1, 1.2), w(0.9, 0.62, 0.72), w(0.82, 0.96, 0.18), w(0.82, 1.3, -0.3), w(0.86, 0.86, -0.72)]);
    vine([w(-0.86, 0.5, -1.7), w(-0.9, 0.62, -1.1), w(-0.84, 0.92, -0.7), w(-0.86, 0.52, -0.2), w(-0.92, 0.2, -0.05), w(-0.92, -0.2, 0.02)], 0.014);
    vine([w(0.86, 0.72, 0.3), w(0.92, 0.3, 0.28), w(0.92, 0.02, 0.32), w(0.94, -0.3, 0.3)], 0.012, 0.2, 0.1);
    { const a = w(1.0, 0.3, 1.9), b = w(-1.0, 0.25, -2.2), c = w(0.2, 0.28, 2.4); mass(a[0], a[1], a[2], 0.58, 0.42, 0.58, 170); mass(b[0], b[1], b[2], 0.62, 0.42, 0.56, 170); mass(c[0], c[1], c[2], 0.5, 0.26, 0.4, 90); }
    // overhanging bush on the north coping, its skirt trailing into the cut
    for (const [s, r0] of [[3.2, 0.5], [7.0, 0.42], [11.9, 0.46]]) { railL.at(s, o); mass(o.x - o.ix * 0.3, 0.34, o.z - o.iz * 0.3, 0.72, r0, 0.62, 200); mass(o.x + o.ix * 0.04, -0.03, o.z + o.iz * 0.04, 0.5, 0.34, 0.22, 90, 0.15, 0.8); }
    for (const s of [2.1, 12.05]) { railR.at(s, o); mass(o.x - o.ix * 0.28, 0.3, o.z - o.iz * 0.28, 0.68, 0.42, 0.6, 170); mass(o.x + o.ix * 0.04, -0.05, o.z + o.iz * 0.04, 0.44, 0.3, 0.2, 70, 0.15, 0.8); }
    // green shoulders at the notch, framing the lip
    railL.at(railL.loop - 0.8, o); mass(o.x - o.ix * 0.34, 0.34, o.z, 0.66, 0.42, 0.8, 200); mass(o.x - 0.05, -0.2, 20.02, 0.42, 0.55, 0.14, 110, 0.15, 0.9);
    railR.at(railR.loop - 0.7, o); mass(o.x - o.ix * 0.34, 0.3, o.z, 0.6, 0.38, 0.72, 180); mass(o.x + 0.03, -0.3, 20.02, 0.4, 0.62, 0.13, 110, 0.15, 0.9);
    // sluice post wrapped in creeper
    const k = 0.74, hx = (L[0][0] + R[0][0]) / 2 + ((R[0][0] - L[0][0]) / 2) * k, hz = (L[0][1] + R[0][1]) / 2 + ((R[0][1] - L[0][1]) / 2) * k;
    vine([[hx + 0.05, 0.12, hz + 0.05], [hx - 0.05, 0.45, hz + 0.05], [hx - 0.05, 0.8, hz - 0.05], [hx + 0.05, 1.1, hz + 0.04], [hx - 0.5, 1.24, hz - 0.4]], 0.012, 0.16, 0.1);
  }
  /* ---------- v3: the canal past the old edge. Everything here draws from its own seed, so the core above is untouched. ---------- */
  outerBlock(() => {
    const CC = CROSSINGS.canal, RL = CC.length / 2, HW = CC.width / 2;
    const stoneC = ['#ffffff', '#f4f2e6', '#e3e2d6', '#d3d7cb', '#ece4cf'];
    const mossPad = (x, y, z, rx, rz) => { const col = rng.pick([P.moss, P.mossDeep, P.mossLit]); for (let i = 0; i < 4; i++) { const a = rng() * 6.28, q = rng.range(0, 0.6), sc = rng.range(0.42, 0.72); put(plantL, kit.rock(1, rng, 0.5, 0), { pos: [x + Math.cos(a) * q * rx, y, z + Math.sin(a) * q * rz], rot: [0, rng() * 6, 0], scale: [rx * sc, 0.035, rz * sc] }, col); } };

    /* the road bridge: arch ring and ashlar spandrels in old stone, kerbs, string course and balustrade in weathered concrete */
    {
      const w2 = (X, Y, Z) => new V3(X, Y, Z).applyMatrix4(BM2).toArray();
      const bb = (X, Y, Z, rot = [0, 0, 0], scale = 1) => BM2.clone().multiply(kit.xf({ pos: [X, Y, Z], rot, scale }));
      // deck
      {
        const g = gridGeo(30, 4, (a, b, out) => { const X = lerp(-RL - 0.08, RL + 0.08, a), Z = lerp(-HW + 0.14, HW - 0.14, b); out[0] = X; out[1] = deckTop(X) + 0.012 - 0.03 * (Z / HW) ** 2; out[2] = Z; }, true);
        const base = C(P.asphalt), patch = C('#878b90'), moss = C(P.moss), t = new THREE.Color();
        put(asphL, g, BM2, (x, y, z) => { const n = vnoise(x * 1.3, z * 1.9), m = vnoise(x * 3.1 + 7, z * 3.7); t.copy(base); if (n > 0.6) t.copy(patch); if (m > 0.74) t.lerp(moss, 0.55); return t; });
      }
      // barrel soffit, darker and wetter toward the water
      {
        const g = gridGeo(20, 1, (a, b, out) => { const Z = lerp(-HW + 0.03, HW - 0.03, b), ang = lerp(-thMax, thMax, a); out[0] = archX(Z) + aR * Math.sin(ang); out[1] = aY + aR * Math.cos(ang); out[2] = Z; }, false);
        const top = C('#b9bdb0'), wet = C('#5f7a6d'), t = new THREE.Color();
        put(stoneL, g, BM2, (x, y) => t.copy(wet).lerp(top, sstep(WY - 0.05, 0.1, y)));
      }
      for (const side of [-1, 1]) {
        const Zf = side * (HW - 0.13), Xc = archX(Zf);
        // the wall itself, with the arch cut out
        const pts = [];
        for (let i = 0; i <= 24; i++) { const X = lerp(-RL, RL, i / 24); pts.push([X, deckTop(X) - 0.02]); }
        pts.push([RL, YD], [Xc + ASP, YD], [Xc + ASP, spring]);
        for (let i = 1; i < 22; i++) { const a = thMax - (i / 22) * 2 * thMax; pts.push([Xc + aR * Math.sin(a), aY + aR * Math.cos(a)]); }
        pts.push([Xc - ASP, spring], [Xc - ASP, YD], [-RL, YD]);
        const wg = kit.wallPanel(pts, [], 0.26); wg.computeVertexNormals();
        put(stoneL, wg, bb(0, 0, Zf), '#cfd0c4');
        // voussoirs, standing a little proud of the wall
        const NV = 17, Zv = side * (HW + 0.02);
        for (let i = 0; i < NV; i++) {
          const a0 = -thMax + ((i + 0.04) / NV) * 2 * thMax, a1 = -thMax + ((i + 0.96) / NV) * 2 * thMax, key = i === (NV - 1) / 2, e = key ? 0.5 : 0.32 + 0.05 * hash(i, side), P_ = (r, a) => [Xc + r * Math.sin(a), aY + r * Math.cos(a)];
          const pg = kit.wallPanel([P_(aR - 0.005, a0), P_(aR + e, a0), P_(aR + e, a1), P_(aR - 0.005, a1)], [], 0.12); pg.computeVertexNormals();
          put(stoneL, pg, bb(0, 0, Zv), key ? '#f6f2e4' : rng.pick(['#e6e4d6', '#efe9d6', '#d5d8cc', '#dcdccd']));
        }
        // coursed ashlar in the spandrels and over the abutments
        for (let y = YD + 0.02; y < HUMP + 0.3; y += 0.25) {
          let x = -RL + rng() * 0.25;
          while (x < RL) {
            const l = rng.range(0.46, 0.92), x1 = Math.min(RL, x + l), yt = y + 0.235, ok = (px, py) => py < deckTop(px) - 0.13 && Math.hypot(px - Xc, py - aY) > aR + 0.42;
            if (x1 - x > 0.2 && ok(x + 0.02, yt) && ok(x1 - 0.02, yt) && ok(x + 0.02, y) && ok(x1 - 0.02, y)) {
              const b = kit.box(x1 - x - 0.018, 0.232, 0.06); kit.chip(b, 0.008, rng);
              put(stoneL, b, bb((x + x1) / 2, y + 0.115, side * (HW - 0.0)), rng.pick(['#e3e2d6', '#d3d7cb', '#ece4cf', '#c6cdc0', '#e7dfca']));
            }
            x = x1;
          }
        }
        // string course and kerb, poured concrete, following the hump
        for (let X = -RL + 0.02; X < RL - 0.1; X += 0.66) {
          const mx = X + 0.33, a = Math.atan2(deckTop(mx + 0.1) - deckTop(mx - 0.1), 0.2), slump = hash(X * 7, side) > 0.82 ? 0.025 : 0;
          const g = kit.box(0.66 / Math.cos(a) - 0.012, 0.1, 0.34); kit.chip(g, 0.009, rng);
          put(stoneL, g, bb(mx, deckTop(mx) - 0.075 - slump, side * (HW - 0.07), [0, 0, a]), rng.pick(['#e0ddcf', '#cfd0c4', '#ecE6d2']));
          const k = kit.box(0.66 / Math.cos(a) - 0.014, 0.2, 0.2); kit.chip(k, 0.009, rng);
          put(stoneL, k, bb(mx, deckTop(mx) + 0.08, side * (HW - 0.14), [0, 0, a]), rng.pick(['#e8e4d4', '#d6d6c8', '#e0ddcf']));
        }
        // balustrade: seven posts a side, rails broken or missing in places, rebar showing where the concrete has spalled
        const N = 6, postX = (i) => lerp(-RL + 0.62, RL - 0.62, i / N), ZP = side * (HW - 0.14), postH = 0.64;
        for (let i = 0; i <= N; i++) {
          const X = postX(i), down = (side === 1 && i === 2) || (side === -1 && i === 5), h = down ? 0.2 : postH, g = kit.box(0.17, h, 0.17); kit.chip(g, 0.008, rng);
          put(stoneL, g, bb(X, deckTop(X) + 0.17 + h / 2, ZP, [0, hash(i, side) * 0.12, down ? side * 0.16 : side * 0.015]), rng.pick(['#f0ecdf', '#e3e2d6', '#d9dacc']));
          if (!down) { put(stoneL, kit.cylBase(0.03, 0.12, 0.08, 4), bb(X, deckTop(X) + 0.17 + h, ZP, [0, Math.PI / 4, 0]), '#ece4cf'); }
          else for (const dz of [-0.04, 0.04]) put(rustL, kit.tube([[X, deckTop(X) + 0.32, ZP + dz], [X + side * 0.05, deckTop(X) + 0.56, ZP + dz + 0.03], [X + side * 0.14, deckTop(X) + 0.7, ZP + dz - 0.02]], 0.014, 0.01, 4, 6), BM2, '#ffffff');
          if (i < N) {
            const X1 = postX(i + 1), gone = (side === 1 && (i === 1 || i === 2)) || (side === -1 && i >= 4);
            for (const [fy, ry] of [[0.62, 0.05], [0.35, 0.04]]) {
              const f = gone ? (fy > 0.5 ? rng.range(0.22, 0.4) : rng.range(0.1, 0.32)) : 1, Xa = X, Xb = lerp(X, X1, f), ya = deckTop(Xa) + 0.17 + fy, yb = deckTop(Xb) + 0.17 + fy, len = Math.hypot(Xb - Xa, yb - ya), a = Math.atan2(yb - ya, Xb - Xa);
              const r = kit.box(len, ry * 2, 0.09); kit.chip(r, 0.006, rng);
              put(stoneL, r, bb((Xa + Xb) / 2, (ya + yb) / 2, ZP, [0, 0, a]), rng.pick(['#e8e4d4', '#d6d6c8']));
              if (gone && f < 0.5) for (const rz of [-0.025, 0.025]) put(rustL, kit.tube([[Xb, yb, ZP + rz], [Xb + 0.2, yb - 0.06 * rng(), ZP + rz + 0.02], [Xb + 0.42, yb - 0.1 - 0.1 * rng(), ZP + rz * 2]], 0.01, 0.008, 4, 6), BM2, '#ffffff');
            }
          }
        }
        // end posts, with the bridge's name let into the approach face
        for (const e of [-1, 1]) {
          const X = e * (RL - 0.16), ht = 1.18, g = kit.box(0.5, ht, 0.5); kit.chip(g, 0.012, rng);
          put(stoneL, g, bb(X, deckTop(X) - 0.1 + ht / 2, Zf + side * 0.04, [0, e * side * 0.03, 0]), rng.pick(['#e3e2d6', '#d3d7cb']));
          put(stoneL, kit.box(0.6, 0.1, 0.6), bb(X, deckTop(X) - 0.05 + ht, Zf + side * 0.04), '#d9dacc');
          put(stoneL, kit.cylBase(0.05, 0.4, 0.26, 4), bb(X, deckTop(X) - 0.1 + ht + 0.1, Zf + side * 0.04, [0, Math.PI / 4, 0]), '#efece0');
          if ((e === 1) === (side === 1)) { const p = new V3(X + e * 0.262, deckTop(X) + 0.55, Zf + side * 0.04).applyMatrix4(BM2); signPlates.push({ slot: 2, w: 0.42, h: 0.18, pos: p, rot: [0.02, e * Math.PI / 2 + BYAW, 0] }); }
        }
        // moss under the string course and in the arch ring's joints, ferns in the courses
        for (let i = 0; i < 16; i++) { const X = rng.range(-RL + 0.2, RL - 0.2), yy = deckTop(X) - 0.18; put(plantL, smooth(kit.sphere(1, 6, 4)), bb(X, yy - 0.03, side * (HW + 0.04), [0, 0, rng.range(-0.2, 0.2)], [rng.range(0.14, 0.42), rng.range(0.06, 0.13), 0.05]), (px, py) => C(P.moss).lerp(C(P.mossDeep), sstep(yy, yy - 0.2, py))); }
        const fernCol = leafGrad(P.leafDeep, P.leafLit, 0.34), frondG = kit.frond(0.62, 5, 0.2);
        for (let i = 0; i < 8; i++) {
          const a = lerp(-thMax - 0.04, thMax + 0.04, (i + 0.4) / 8) + rng.range(-0.06, 0.06), r = aR + rng.range(0.1, 0.42), X = Xc + r * Math.sin(a), Y = Math.min(aY + r * Math.cos(a), deckTop(X) - 0.22);
          for (let k = 0; k < 3; k++) { const sc = rng.range(0.8, 1.25), yaw = side > 0 ? rng.range(-0.5, 0.5) : Math.PI + rng.range(-0.5, 0.5); put(plantL, frondG, bb(X, Y, side * (HW + 0.05), [rng.range(0.1, 0.5), yaw, 0], sc), (px, py) => fernCol(px, py - Y + 0.1)); }
        }
      }
      // deck joints: tufts and moss, thicker in the gutters where nothing drove
      const tuftG = leafTuft();
      for (let i = 0; i < 60; i++) { const X = rng.range(-RL + 0.1, RL - 0.1), Z = rng.sign() * rng.range(0.3, HW - 0.26) * (rng() < 0.7 ? 1 : 0.55), sc = rng.range(0.8, 1.4), yy = deckTop(X); put(plantL, tuftG, bb(X, yy + 0.01, Z, [0, rng() * 6.28, 0], sc), (px, py) => C(P.mossDeep).lerp(C(P.grassLit), clamp((py - yy) / (0.16 * sc)))); }
      for (let i = 0; i < 22; i++) { const X = rng.range(-RL + 0.15, RL - 0.15), side = rng.sign(), Z = side * (HW - rng.range(0.26, 0.36)), p = new V3(X, deckTop(X) + 0.03, Z).applyMatrix4(BM2); mossPad(p.x, p.y, p.z, rng.range(0.25, 0.5), rng.range(0.08, 0.14)); }
      // ivy down both faces and pushing through the railings, a fat shrub at the south-east abutment
      vine([w2(1.8, HUMP + 0.36, HW + 0.02), w2(2.3, 0.3, HW + 0.08), w2(1.2, -0.3, HW + 0.1), w2(0.9, -0.6, HW + 0.1)], 0.02, 0.28, 0.13);
      vine([w2(-1.4, HUMP + 0.3, HW + 0.02), w2(-1.0, 0.25, HW + 0.1), w2(-1.6, -0.3, HW + 0.1)], 0.016, 0.28, 0.12);
      vine([w2(0.4, HUMP + 0.3, -HW - 0.02), w2(-0.3, 0.2, -HW - 0.1), w2(-0.1, -0.4, -HW - 0.1), w2(-0.5, -0.7, -HW - 0.12)], 0.018, 0.28, 0.12);
      { const a = w2(RL - 0.3, 0.3, HW + 0.34), b = w2(RL - 1.05, 0.5, HW + 0.2), c = w2(-RL + 0.3, 0.26, -HW - 0.3), d = w2(-RL + 1.0, 0.42, -HW - 0.2); mass(a[0], a[1], a[2], 0.74, 0.5, 0.56, 100, 0.24); mass(b[0], b[1], b[2], 0.46, 0.4, 0.36, 50, 0.2); mass(c[0], c[1], c[2], 0.7, 0.5, 0.6, 95, 0.24); mass(d[0], d[1], d[2], 0.42, 0.34, 0.34, 50, 0.2); }
    }

    /* the mill race: a low stone training wall that pens a narrow fast run of water along the west bank, past the watermill */
    {
      const wallPts = [], STEPS = 16; for (let i = 0; i <= STEPS; i++) { chan(lerp(RACE.d0, RACE.d1, i / STEPS), RACE.u, c1); wallPts.push([c1.x, c1.z]); }
      const rr = makeRail(wallPts, 1);
      for (const [yt, yb, ins] of [[-0.3, -0.62, 0.02], [-0.62, -1.3, 0.05]]) {
        for (let s = 0; s < rr.len;) { const l = rng.range(0.56, 0.94), a = s + l / 2; s += l; rr.at(a, o); const g = kit.box(l - 0.022, yt - yb - 0.016, 0.34 - ins); kit.chip(g, 0.012, rng); put(stoneL, g, { pos: [o.x, (yt + yb) / 2, o.z], rot: [0, o.yaw, 0] }, stoneTint(rng.pick(stoneC))); }
      }
      for (let s = 0.06; s < rr.len - 0.1;) { const l = rng.range(0.7, 1.15), a = s + l / 2; s += l; rr.at(a, o); const lost = rng() < 0.12, g = kit.box(l - 0.03, 0.09, 0.42); kit.chip(g, 0.012, rng); if (lost) continue; put(stoneL, g, { pos: [o.x, -0.255 - rng() * 0.012, o.z], rot: [rng.range(-0.02, 0.02), o.yaw, rng.range(-0.03, 0.03)] }, rng.pick(stoneC)); if (rng() < 0.7) mossPad(o.x + rng.range(-0.05, 0.05), -0.205, o.z + rng.range(-0.05, 0.05), rng.range(0.2, 0.36), rng.range(0.1, 0.16)); }
      // the cut-water at its head, and the two posts of a sluice long gone
      rr.at(0.05, o); put(stoneL, kit.rock(0.34, rng, 0.8, 1), { pos: [o.x - o.tx * 0.1, -0.34, o.z - o.tz * 0.1], rot: [0, rng() * 6, 0] }, (px, py) => (py < WY ? C('#9fbeb0') : C('#e9e6d8')));
      for (const s of [0.34, 0.74]) { rr.at(s, o); for (const k of [-1, 1]) { const g = kit.box(0.09, 0.82, 0.12); kit.chip(g, 0.008, rng); put(woodL, g, { pos: [o.x + o.ix * k * 0.2, -0.03, o.z + o.iz * k * 0.2], rot: [rng.range(-0.05, 0.05), o.yaw, k * 0.05] }, '#8d6b48'); } }
    }

    /* walls, stones and reach ends along the new stretch: stepping stones at the old edge, a drain outfall through a concrete repair */
    {
      const STEP_D = 17.4, n = 6;
      for (let i = 0; i < n; i++) {
        const u = lerp(-0.76, 0.76, i / (n - 1)) + rng.range(-0.04, 0.04); chan(STEP_D + rng.range(-0.1, 0.1), u, c1);
        const r = rng.range(0.32, 0.4), g = kit.cyl(r * 0.96, r * 1.04, 0.9, 7); kit.chip(g, 0.022, rng); g.computeVertexNormals();
        put(stoneL, g, { pos: [c1.x, WY + 0.14 - 0.45, c1.z], rot: [rng.range(-0.04, 0.04), rng() * 6, rng.range(-0.04, 0.04)] }, (px, py) => (py < WY + 0.02 ? C('#9db9ad') : C(rng.pick(['#e9e6d8', '#dcd9c8', '#f0ece0']))));
        for (let k = 0; k < 3; k++) { foamAt2.push({ x: c1.x - c1.tx * (r + 0.05) * -1 + rng.range(-0.1, 0.1), z: c1.z - c1.tz * (r + 0.05) * -1 + rng.range(-0.1, 0.1), r: 0.2, sp: 0.5 }); }
        mossPad(c1.x + rng.range(-0.06, 0.06), WY + 0.155, c1.z + rng.range(-0.06, 0.06), r * 0.62, r * 0.5);
      }
      // big stones standing in the channel
      for (const [d, u, r] of ROCKS2) { chan(d, u, c1); put(stoneL, kit.rock(r, rng, 1.0, 1), { pos: [c1.x, bed(d, u) + r * 0.7, c1.z], rot: [0, rng() * 6, 0] }, (px, py) => (py < WY ? C('#bcd8cb') : C('#efece0'))); }
      // pebbles, sand scatter and drowned bits
      const peb = ['#d9dccd', '#bcc8ba', '#e9e2cf', '#a4b6ab', '#cdbf9f'], teal = C('#86dcc8');
      for (let i = 0; i < 180; i++) { const d = rng.range(LEN - 0.3, TOTAL - 0.4), u = rng.range(-0.96, 0.96); chan(d, u, c1); const y = bed(d, u), s = rng() < 0.12 ? rng.range(0.09, 0.15) : rng.range(0.035, 0.08), col = C(rng.pick(peb)).lerp(teal, y < WY ? 0.3 : 0), g = kit.rock(s, rng, 0.6, 0), rot = [0, rng() * 6, 0]; if (s > 0.08 || i % 3 === 0) put(bedL, g, { pos: [c1.x, y + s * 0.2, c1.z], rot }, col); }
      // drain outfall through the concrete repair on the east bank, its rust running down the wall
      const dpos = railRo.len * 0.42; railRo.at(dpos, o);
      put(rustL, kit.cyl(0.13, 0.13, 0.5, 10, true), new M4().compose(new V3(o.x + o.ix * 0.04, -0.6, o.z + o.iz * 0.04), new Q().setFromUnitVectors(UP, new V3(o.ix, 0, o.iz)), new V3(1, 1, 1)), '#7d4a33');
      put(rustL, kit.torus(0.135, 0.02, 5, 14), new M4().compose(new V3(o.x + o.ix * 0.27, -0.6, o.z + o.iz * 0.27), new Q().setFromUnitVectors(new V3(0, 0, 1), new V3(o.ix, 0, o.iz)), new V3(1, 1, 1)), '#b5522f');
      railLo.at(railLo.len * 0.15, o);
      put(rustL, kit.torus(0.08, 0.014, 5, 12), { pos: [o.x + o.ix * 0.1, -0.1, o.z + o.iz * 0.1], rot: [0.3, o.yaw, 0] }, '#ffffff');
    }

    /* the last reach: outfall sign, boulders */
    {
      railRo.at(railRo.len - 2.0, o);
      const sx = o.x - o.ix * 0.55, sz = o.z - o.iz * 0.55, yaw = Math.atan2(-o.iz, o.ix) + 0.25, cy2 = Math.cos(yaw), sy2 = Math.sin(yaw);
      signPlates.push({ slot: 1, w: 0.86, h: 0.54, pos: new V3(sx, 0.94, sz), rot: [0.03, yaw, -0.06] });
      for (const k of [-0.28, 0.28]) { put(rustL, kit.box(0.045, 1.05, 0.045), { pos: [sx + k * cy2, 0.47, sz - k * sy2], rot: [k * 0.05, yaw, -0.06] }, '#ffffff'); }
      put(stoneL, kit.rock(0.24, rng, 0.5, 1), { pos: [sx, 0.06, sz] }, '#d3d7cb');
      // moss and ferns creeping in from both cheeks; the lip stays bare and bright
      railLo.at(railLo.len - 0.9, o); mass(o.x - o.ix * 0.3, 0.3, o.z - o.iz * 0.3, 0.62, 0.42, 0.72, 110, 0.22);
      railRo.at(railRo.len - 1.0, o); mass(o.x - o.ix * 0.34, 0.28, o.z - o.iz * 0.34, 0.6, 0.4, 0.7, 100, 0.22);
      const fernW = kit.frond(0.8, 6, 0.26), fernCol = leafGrad(P.leafDeep, P.leafLit, 0.4);
      for (const [sx2, n] of [[-1, 5], [1, 5]]) for (let i = 0; i < n; i++) {
        const xx = FCX + sx2 * (FHW + rng.range(0.12, 0.42)), yy = rng.range(-3.4, -1.0);
        for (let k = 0; k < 3; k++) put(plantL, fernW, { pos: [xx, yy, BASE.half + 0.05 + rng() * 0.08], rot: [rng.range(0.6, 1.2), rng.range(-0.8, 0.8), 0], scale: rng.range(0.7, 1.15) }, (px, py) => fernCol(px, py - yy + 0.15));
        put(plantL, smooth(kit.sphere(1, 8, 6)), { pos: [FCX + sx2 * (FHW + rng.range(0.05, 0.6)), yy + rng.range(-0.3, 0.3), BASE.half + 0.1], scale: [rng.range(0.16, 0.34), rng.range(0.1, 0.24), 0.06], rot: [0, 0, rng() * 3] }, rng.pick([P.moss, P.mossDeep, P.mossLit]));
      }
      // The rock prow the fall once landed on is gone. Its eight rocks still draw from the stream, so the plants placed after them keep their seeded spots.
      for (let i = 0; i < 8; i++) { kit.rock(1, rng, 0.62, 1); rng(); rng(); rng(); }
    }

    /* moss, ferns, bushes and water plants along the new stretch */
    {
      const frondG = kit.frond(0.62, 5, 0.2), fernCol = leafGrad(P.leafDeep, P.leafLit, 0.34);
      for (const [r, n] of [[railLo, 12], [railRo, 11]]) for (let i = 0; i < n; i++) {
        const s = rng.range(0.3, r.len - 0.5); r.at(s, o); if (nearBridge(o.x, o.z) || keepMill(o.x, o.z)) continue;
        const y = rng.pick([-0.02, -0.16, 0.04]);
        for (let k = 0; k < 3; k++) { const sc = rng.range(0.7, 1.1), yaw = Math.atan2(o.ix, o.iz) + rng.range(-0.9, 0.9); put(plantL, frondG, { pos: [o.x + o.ix * 0.07, y, o.z + o.iz * 0.07], rot: [rng.range(-0.1, 0.45), yaw, 0], scale: sc }, (px, py) => fernCol(px, py - y + 0.12)); }
      }
      for (const [r, n] of [[railLo, 28], [railRo, 24]]) for (let i = 0; i < n; i++) {
        const s = rng.range(0.1, r.len - 0.1); r.at(s, o); if (nearBridge(o.x, o.z)) continue;
        const hang = rng.range(0.18, 0.55), wd = rng.range(0.14, 0.38), y = rng.pick([0.02, -0.02, -0.15]);
        put(plantL, smooth(kit.sphere(1, 6, 4)), { pos: [o.x + o.ix * 0.08, y - hang * 0.45, o.z + o.iz * 0.08], scale: [wd, hang * 0.7, 0.05], rot: [0, o.yaw, 0] }, (px, py) => C(P.moss).lerp(C(P.mossDeep), sstep(y, y - hang, py)));
      }
      // bushes on the coping, none on the west bank by the mill
      for (const [r, s, a] of [[railLo, 2.6, 0.52], [railRo, 4.2, 0.46], [railRo, 8.6, 0.5], [railLo, 15.8, 0.56], [railRo, 20.0, 0.46]]) { r.at(s, o); if (keepMill(o.x, o.z) || nearBridge(o.x, o.z)) continue; mass(o.x - o.ix * 0.3, 0.34, o.z - o.iz * 0.3, 0.74, a, 0.64, 85, 0.25); mass(o.x + o.ix * 0.04, -0.04, o.z + o.iz * 0.04, 0.5, 0.34, 0.22, 35, 0.2, 0.8); }
      // lily pads and a few blooms in the slack water, kept off the race and out from under the bridge
      let blooms = 0;
      for (const [d, u, n, sp] of [[16.1, -0.56, 7, 0.46], [19.1, 0.5, 8, 0.48], [20.6, -0.64, 6, 0.4], [29.9, -0.58, 7, 0.44], [31.6, 0.62, 6, 0.42], [34.6, -0.5, 9, 0.5], [35.6, 0.48, 6, 0.44]]) {
        for (let i = 0; i < n; i++) {
          const dd = d + rng.range(-1, 1) * sp * 1.6, uu = clamp(u + rng.range(-1, 1) * sp * 0.5, -0.86, 0.86); chan(dd, uu, c1);
          if (bed(dd, uu) > WY - 0.12 || nearBridge(c1.x, c1.z)) continue;
          const r = rng.range(0.14, 0.3);
          put(plantL, padGeo(r), { pos: [c1.x, WY + 0.008, c1.z], rot: [rng.range(-0.03, 0.03), rng() * 6.28, rng.range(-0.03, 0.03)] }, rng.pick(['#6fbf63', '#58ad60', '#8ccb60', '#4fa268']));
          if (i % 3 === 1 && blooms < 10) { blooms++; chan(dd + 0.16, uu + 0.1, c2); bloom(c2.x, c2.z, rng.range(0.9, 1.2), rng.pick(['#ffc6dc', '#ffe8f0', '#f7a6c6'])); }
        }
      }
      // reeds in the shallows and iris on the bars
      for (const [d, u, n] of REEDS2) for (let i = 0; i < n; i++) { const dd = d + rng.range(-0.34, 0.34), uu = clamp(u + rng.range(-0.1, 0.1), -0.93, 0.93); chan(dd, uu, c1); if (nearBridge(c1.x, c1.z)) continue; reedAt.push({ x: c1.x, y: Math.max(bed(dd, uu), WY - 0.2), z: c1.z, s: rng.range(0.78, 1.2) }); }
      for (const [d, u] of [[16.4, -0.84], [18.6, 0.84], [33.8, 0.8], [34.8, -0.82], [30.4, -0.8]]) { chan(d, u, c1); iris(c1.x, Math.max(bed(d, u), WY - 0.02), c1.z, rng.range(0.82, 1.08)); }
      // long weed combed by the current
      const weed = leafGrad('#2f8f6a', '#6fc06a', 0.55);
      for (let i = 0; i < 22; i++) { const d = rng.range(LEN + 0.2, TOTAL - 2.2), u = rng.range(-0.85, 0.85); chan(d, u, c1); const y = bed(d, u); if (y > WY - 0.3) continue; const yaw = Math.atan2(c1.tx, c1.tz); for (let k = 0; k < 3; k++) put(plantL, kit.blade(rng.range(0.36, 0.56), 0.06, 0.34, 3), { pos: [c1.x + rng.range(-0.06, 0.06), y, c1.z + rng.range(-0.06, 0.06)], rot: [0, yaw + rng.range(-0.25, 0.25), 0] }, (px, py) => weed(px, py - y)); }
    }

    /* the sunk rowing boat, stern under, near the boathouse landing */
    makeBoat({ d: 32.3, u: 0.3, y: WY - 0.1, yawAdd: -0.5, rx: -0.23, rz: 0.34, paint: '#c8705e', white: '#efe7d4', stove: (side, k, i) => (side === -1 && k < 4 && i > 1 && i < 8) || (side === 1 && k === 4 && i > 8), reeds: true });
  });

  let reedMesh, reedList;
  {
    const parts = [], gr = leafGrad('#3d9c62', '#c5ea72', 1.05);
    for (let i = 0; i < 12; i++) {
      const h = rng.range(0.72, 1.26), b = kit.blade(h, rng.range(0.042, 0.062), rng.range(0.14, 0.42), 4); b.rotateY(rng() * 6.28); b.translate(rng.range(-0.09, 0.09), 0, rng.range(-0.09, 0.09));
      put(parts, b, {}, (x, y) => gr(x, y));
    }
    for (const [x, z, h] of [[0.04, 0.03, 1.38], [-0.06, -0.05, 1.16]]) {
      put(parts, kit.cyl(0.008, 0.012, h, 4), { pos: [x, h / 2, z] }, '#6fae5c');
      put(parts, smooth(kit.cyl(0.032, 0.032, 0.18, 7)), { pos: [x, h - 0.08, z] }, '#8c5f3e');
    }
    const g = kit.merge(parts);
    reedMesh = new THREE.InstancedMesh(g, ctx.toon({ vertexColors: true, side: THREE.DoubleSide, translucent: 0.85 }), reedAt.length);
    reedMesh.name = 'reeds'; reedMesh.castShadow = false; reedMesh.receiveShadow = false; reedMesh.frustumCulled = false; ctx.softEdge(reedMesh);
    const tint = [C('#ffffff'), C('#e8f4c8'), C('#d2eab0'), C('#f4efc0')];
    reedList = reedAt.map((r, i) => { reedMesh.setColorAt(i, rng.pick(tint)); return { ...r, yaw: rng() * 6.28, ph: rng() * 6.28 }; });
    reedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(reedMesh);
  }

  /* ---------- signs, invented and sun-bleached: the weir's, the warning at the outfall, the bridge's name plate. One atlas, one mesh ---------- */
  {
    const AT_W = 512, AT_H = 256;
    const tex = ctx.canvasTexture(AT_W, AT_H, (g, w, h) => {
      const F = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans CJK JP","Yu Gothic","Meiryo","Microsoft YaHei",sans-serif';
      const panel = (ox, oy, pw, ph, bg, stroke, paint) => {
        g.save(); g.translate(ox, oy); g.beginPath(); g.rect(0, 0, pw, ph); g.clip();
        g.fillStyle = bg; g.fillRect(0, 0, pw, ph); g.strokeStyle = stroke; g.lineWidth = 7; g.strokeRect(9, 9, pw - 18, ph - 18); g.textAlign = 'center';
        paint(pw, ph);
        g.globalCompositeOperation = 'multiply'; for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(150,92,60,${0.08 + (i % 4) * 0.06})`; g.beginPath(); g.ellipse((i * 73) % pw, (i * 41) % ph + (i % 3) * 8, 6 + (i % 5) * 7, 3 + (i % 4) * 8, 0, 0, 6.3); g.fill(); }
        g.restore();
      };
      panel(0, 0, 256, 160, '#ece4cf', '#3f6f86', (pw) => { g.fillStyle = '#3f6f86'; g.font = `700 50px ${F}`; g.fillText('第七用水路', pw / 2, 66); g.fillStyle = '#b5522f'; g.font = `700 34px ${F}`; g.fillText('水門 立入禁止', pw / 2, 118); });
      panel(256, 0, 256, 160, '#e8c65a', '#3a3a34', (pw) => { g.fillStyle = '#3a3a34'; g.font = `800 58px ${F}`; g.fillText('危険', pw / 2, 74); g.fillStyle = '#b5522f'; g.font = `700 30px ${F}`; g.fillText('この先 滝', pw / 2, 116); g.fillStyle = '#3a3a34'; g.font = `700 20px ${F}`; g.fillText('近寄らないでください', pw / 2, 144); });
      panel(0, 160, 256, 96, '#d9dacc', '#6e6e60', (pw) => { g.fillStyle = '#4a4a42'; g.font = `700 54px ${F}`; g.fillText('七曲橋', pw / 2, 68); });
    }, { repeat: false });
    const slots = [[0, 0, 256, 160], [256, 0, 256, 160], [0, 160, 256, 96]];
    const plates = [{ slot: 0, w: 0.72, h: 0.45, pos: new V3(1.72, 0.72, 13.62), rot: [0.04, 0.62, -0.05] }, ...signPlates];
    const pos = [], uv = [], nor = [], idx = [];
    plates.forEach((pl, n) => {
      const [sx, sy, sw, sh] = slots[pl.slot], M = kit.xf({ pos: pl.pos.toArray(), rot: pl.rot }), v = new V3();
      const u0 = sx / AT_W, u1 = (sx + sw) / AT_W, v1 = 1 - sy / AT_H, v0 = 1 - (sy + sh) / AT_H;
      for (const [px, py, tu, tv] of [[-pl.w / 2, -pl.h / 2, u0, v0], [pl.w / 2, -pl.h / 2, u1, v0], [pl.w / 2, pl.h / 2, u1, v1], [-pl.w / 2, pl.h / 2, u0, v1]]) { v.set(px, py, 0).applyMatrix4(M); pos.push(v.x, v.y, v.z); uv.push(tu, tv); v.set(0, 0, 1).transformDirection(M); nor.push(v.x, v.y, v.z); }
      idx.push(n * 4, n * 4 + 1, n * 4 + 2, n * 4, n * 4 + 2, n * 4 + 3);
    });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx);
    const sign = new THREE.Mesh(g, ctx.toon({ map: tex, side: THREE.DoubleSide })); sign.name = 'river-signs'; sign.castShadow = true; group.add(sign);
    for (const dx of [-0.25, 0.25]) put(rustL, kit.box(0.04, 0.82, 0.04), { pos: [1.72 + dx * Math.cos(0.62), 0.42, 13.6 - dx * Math.sin(0.62)], rot: [0, 0.62, dx * 0.05] }, '#ffffff');
  }

  /* ---------- water: the canal ribbon and the film over the weir share one mesh ---------- */
  const waterMat = (() => {
    const m = ctx.water({ shallow: '#b4f6e4', deep: '#35bdb6', opacity: 0.36, scale: 3.4 });
    m.fragmentShader = m.fragmentShader.replace('smoothstep(.86,.90,', 'smoothstep(1.22,1.3,').replace('mix(.5,uOpacity,', 'mix(.3,uOpacity,').replace('rim*.55', 'rim*.3');
    return m;
  })();
  {
    const pos = [], uv = [], idx = [], RC = 22, ds = []; for (let i = 0; i < NS; i++) ds.push(ST[i].d); for (const e of [0.05, 0.1, 0.14]) ds.push(TOTAL + e);
    const lipY = waterY;
    ds.forEach((d) => {
      for (let j = 0; j <= RC; j++) {
        const u = -1.0 + (2 * j) / RC; chan(d, u, c1);
        const depth = (lipY(d) - bed(Math.min(d, TOTAL), clamp(u, -1, 1))), wall = (1 - Math.abs(u)) * c1.w;
        pos.push(c1.x, lipY(d), c1.z); uv.push(clamp(Math.min(depth / 0.52, 0.1 + wall / 0.5) * (1 - 0.72 * sstep(TOTAL - 0.1, TOTAL + 0.14, d))), 0);
      }
    });
    const nR = RC + 1;
    for (let i = 0; i < ds.length - 1; i++) for (let j = 0; j < RC; j++) { const a = i * nR + j, b = a + 1, c = a + nR, e = c + 1; idx.push(a, b, c, b, e, c); }
    // weir film: tucked just under the edge of the pond disc, then downhill all the way to the lip
    const base = pos.length / 3, FS = 16, FC = 6;
    for (let i = 0; i <= FS; i++) {
      const f = Math.pow(i / FS, 1.5);
      for (let j = 0; j <= FC; j++) { const v = -1.04 + (2.08 * j) / FC; weirP(f, v, c1); pos.push(c1.x, filmY(f), c1.z); uv.push(0.12 + 0.3 * (1 - Math.min(1, Math.abs(v))) * (1 - 0.8 * sstep(0.9, 1, f)), 0); }
    }
    for (let i = 0; i < FS; i++) for (let j = 0; j < FC; j++) { const a = base + i * (FC + 1) + j, b = a + 1, c = a + FC + 1, e = c + 1; idx.push(a, b, c, b, e, c); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    const m = new THREE.Mesh(g, waterMat); m.material.side = THREE.DoubleSide; m.name = 'canal-water'; m.renderOrder = 2; ctx.noOutline(m); group.add(m);
  }

  /* ---------- falling water: ribbons with streaks scrolled in flight time, so the pattern accelerates with the water ---------- */
  const streak = ctx.canvasTexture(256, 1024, (g, w, h) => {
    const r = ctx.seeded('streak');
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'lighter';
    const dab = (col, x, y, wd, ln, a) => { g.fillStyle = col; g.globalAlpha = a; for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) { g.beginPath(); g.ellipse(x + dx, y + dy, wd, ln, 0, 0, 6.3); g.fill(); } };
    for (let i = 0; i < 150; i++) dab('#f00', r() * w, r() * h, 0.8 + r() * 2.6, 50 + r() * 170, 0.45 + r() * 0.55);   // R: fine long lines
    for (let i = 0; i < 64; i++) dab('#0f0', r() * w, r() * h, 5 + r() * 15, 20 + r() * 80, 0.55 + r() * 0.45);        // G: clots, for tearing
    for (let i = 0; i < 26; i++) dab('#00f', r() * w, r() * h, 16 + r() * 30, 90 + r() * 240, 0.35 + r() * 0.4);       // B: broad wander
  }, { srgb: false });
  const fallMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: {
      uTime: ctx.shared.uTime, uS: { value: streak },
      cDeep: { value: C('#3fb9ae') }, cMid: { value: C('#9eeadb') }, cHi: { value: C('#f4fff6') }, cGold: { value: C(P.sunGold) },
    },
    vertexShader: /* glsl */`
      attribute float aTau; attribute vec3 aK; varying vec2 vUv; varying float vTau,vY; varying vec3 vK;
      void main(){ vUv=uv; vTau=aTau; vK=aK; vY=position.y; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform sampler2D uS; uniform vec3 cDeep,cMid,cHi,cGold;
      varying vec2 vUv; varying float vTau,vY; varying vec3 vK;
      void main(){
        float u=vUv.x,s=vUv.y,seed=vK.x,kind=vK.y,W=vK.z;
        if(kind>3.5){ // the foam line along the lip: a scalloped white band, churning slowly
          float n=texture2D(uS,vec2(u*W*1.9+.13,uTime*.09+seed)).g, m=texture2D(uS,vec2(u*W*3.7,-uTime*.16+seed*.3)).r;
          float edge=.42+n*.36+m*.32;
          float a=smoothstep(.0,.05,s)*(1.-smoothstep(edge,edge+.05,s));
          float shade=smoothstep(edge-.32,edge-.18,s);
          vec3 col=mix(cHi,cMid,shade*.75);
          if(a<.01) discard;
          gl_FragColor=vec4(col,a*.97);
          #include <colorspace_fragment>
          return;
        }
        if(kind>2.5){ // wet wall behind the fall: dark, streaked, with a green fringe of algae
          float n=texture2D(uS,vec2(u*.8+.1,s*.5)).b, r=texture2D(uS,vec2(u*2.1+.3,s*.22)).r, e=smoothstep(.0,.16,u)*smoothstep(1.,.84,u)*smoothstep(1.,.62-n*.25,s)*smoothstep(0.,.08,s);
          float sheen=step(.7,texture2D(uS,vec2(u*1.3,s*.8+uTime*.05)).g)*.3, fringe=1.-smoothstep(.03,.2,min(u,1.-u)+n*.1);
          vec3 c=mix(vec3(.05,.13,.14),vec3(.2,.42,.28),fringe*.7);
          gl_FragColor=vec4(mix(c,cMid,sheen*(1.-fringe)),e*(.42+.22*r));
          #include <colorspace_fragment>
          return;
        }
        float v=(vTau-uTime)*.74+seed;                           // moves with the water: pattern fixed in flight time
        float wob=texture2D(uS,vec2(seed*3.1,v*.17)).b-.28;
        float xx=abs(u-.5+wob*.3*smoothstep(.0,.6,s))*2.;
        vec3 tx=texture2D(uS,vec2(u*W*.46+seed*5.,v*.83)).rgb;
        vec3 ty=texture2D(uS,vec2(u*W*.2+seed*2.3,v*.31)).rgb;
        float edge=smoothstep(1.,.9,xx+(ty.b-.24)*.5*smoothstep(.04,.5,s)+(tx.g-.3)*.16);
        float tear=mix(-.3,1.3,pow(smoothstep(.3,.96,s),1.2));   // rises through the clots: the sheet opens, then breaks up
        float dis=1.-smoothstep(${(-BASE.height - 3).toFixed(2)},${(-BASE.height + 1.6).toFixed(2)},vY);   // past the foot of the wall the water stops being water
        tear+=dis*.55;
        float body=tx.g*.55+ty.g*.6+(1.-xx)*.2+ty.b*.28;
        float keep=smoothstep(tear-.015,tear+.03,body);
        float air=smoothstep(.04,.46,s);                         // glassy over the lip, aerated lower down
        float tone=tx.r*.66+ty.r*.34+(1.-xx)*.06+air*.34+ty.g*.16;
        float k2=step(1.5,kind);
        tone+=k2*.26;
        vec3 col=cDeep;
        col=mix(col,cMid,smoothstep(.27,.31,tone));
        col=mix(col,cHi,smoothstep(.58,.62,tone));
        col=mix(col,cGold*1.25,(1.-smoothstep(.0,.15,s))*step(.5,tx.r)*.8);    // the sun catches the roll-over
        col=mix(col,cHi,dis*.7);
        float a=edge*keep*pow(1.-dis,1.3);
        a*=kind<.5?mix(.42,.3,s):mix(.82,.97,smoothstep(.3,.74,tone));
        if(a<.01) discard;
        gl_FragColor=vec4(col,a);
        #include <colorspace_fragment>
      }`,
  });
  const fPos = [], fUv = [], fTau = [], fK = [], fIdx = [], maskIdx = [], MASK_Y = -BASE.height;
  const out3 = [0, 0, 0];
  const ribbon = ({ path, t0, t1, rows, cols, kind, seed, W, s0 = 0, s1 = 1, mask = false }) => {
    const base = fPos.length / 3;
    for (let r = 0; r <= rows; r++) {
      const f = r / rows, tau = lerp(t0, t1, f);
      for (let c = 0; c <= cols; c++) { const u = c / cols; path(tau, u, out3); fPos.push(out3[0], out3[1], out3[2]); fUv.push(u, lerp(s0, s1, f)); fTau.push(tau); fK.push(seed, kind, W); }
    }
    const n = cols + 1;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const a = base + r * n + c, b = a + 1, d = a + n, e = d + 1; fIdx.push(a, b, d, b, e, d); if (mask && fPos[d * 3 + 1] > MASK_Y) maskIdx.push(a, b, d, b, e, d); }
  };
  // A falling ribbon: a parabola out over the wall, wandering a little more the further it has dropped. tau<0 is the run across the sill.
  const fallPath = (c, offs, wide, zoff = 0, bulge = 0.1, ph = 0, nar = 0.3) => (tau, u, out) => {
    const f = Math.max(0, tau), spread = 1 + 0.2 * f, w = wide * (1 - nar * sstep(0.45, 1.6, f)) * (1 + 0.14 * Math.sin(f * 4.3 + ph * 7) * sstep(0.1, 0.7, f));
    out[0] = c.x + offs * c.w * spread + c.vx * f + (u - 0.5) * w + 0.075 * f * f * Math.sin(f * 2.7 + ph * 9) + 0.03 * Math.sin(f * 6.1 + ph * 4);
    out[1] = Y0 - 0.5 * GRAV * f * f + (tau < 0 ? 0.012 * tau : 0);
    out[2] = c.z + c.vz * tau + zoff + bulge * (1 - Math.pow(2 * u - 1, 2)) * sstep(0, 0.2, f);
    return out;
  };
  const H_ = BASE.half;
  // the wet stain on the wall
  ribbon({ path: (t, u, out) => { out[0] = lerp(FCX - FHW - 1.4, FCX + FHW + 1.4, u); out[1] = lerp(-0.72, STAIN_END, t); out[2] = H_ + 0.235; return out; }, t0: 0, t1: 1, rows: 1, cols: 1, kind: 3, seed: 0, W: 1 });
  // the back sheet: one thin, glassy curtain across the whole lip, close to the wall
  ribbon({ path: fallPath({ x: FCX, w: 1, vx: 0, vz: 0.54, z: LIP.z - 0.06 }, 0, 2 * FHW - 0.22, -0.02, 0.05, 0.3, 0.2), t0: -0.08, t1: T_END, rows: 28, cols: 14, kind: 0, seed: 0.13, W: 4.2, s1: 1.05, mask: true });
  // the chutes: thick glassy tongues that keep their body to the bottom, tearing a little as they go
  CHUTES.forEach((c, i) => ribbon({ path: fallPath(c, 0, c.w, 0, 0.17, 0.2 + i * 0.3, 0.3), t0: -0.14, t1: T_END * (0.98 + 0.02 * i), rows: 36, cols: 12, kind: 1, seed: 0.31 + i * 0.27, W: c.w * 3, s1: i === 1 ? 0.9 : 0.96, mask: true }));
  // strands laid over them, each ending at its own height
  for (let i = 0; i < 26; i++) {
    const c = CHUTES[i % CHUTES.length], off = rng.range(-0.46, 0.46), wd = rng.range(0.08, 0.26) * (c.w > 0.8 ? 1 : 0.7);
    ribbon({ path: fallPath(c, off, wd, rng.range(0.04, 0.14), 0.02, hash(i, 2), 0.1), t0: rng.range(0.03, 0.2), t1: T_END * rng.range(0.72, 1.0), rows: 26, cols: 2, kind: 2, seed: hash(i, 7), W: wd * 3.5, s0: 0.04, s1: 1 });
  }
  // the foam line curling over the lip, and streaks drawn into it on the last run of the canal
  for (const fo of [0, 1]) ribbon({ path: (t, u, out) => { const x = lerp(FCX - FHW + 0.04, FCX + FHW - 0.04, u); out[0] = x; out[1] = Y0 + (fo ? 0.03 : 0.015) - 0.1 * t * t + 0.01 * Math.sin(x * 9); out[2] = LIP.z - 0.14 + (fo ? 0.06 : -0.03) + t * 0.34; return out; }, t0: 0, t1: 1, rows: 3, cols: 42, kind: 4, seed: fo * 0.41, W: 2 * FHW });
  ribbon({ path: (tau, u, out) => { const f = clamp(tau / 2.2); chan(lerp(TOTAL - 2.3, TOTAL - 0.04, f), lerp(-0.86, 0.86, u), c1); out[0] = c1.x; out[1] = waterY(lerp(TOTAL - 2.3, TOTAL - 0.04, f)) + 0.006; out[2] = c1.z; return out; }, t0: 0, t1: 2.2, rows: 12, cols: 10, kind: 0, seed: 0.57, W: 5, s0: 0.1, s1: 0.3 });
  // the mill race: fast streaks in its narrow run of water
  ribbon({ path: (tau, u, out) => { const f = tau / 2.6; chan(lerp(RACE.d0 + 0.2, RACE.d1, f), lerp(RACE.u + 0.06, 0.96, u), c1); out[0] = c1.x; out[1] = WY + 0.006; out[2] = c1.z; return out; }, t0: 0, t1: 2.6, rows: 18, cols: 5, kind: 0, seed: 0.77, W: 5.2, s0: 0.2, s1: 0.32 });
  // streaks sliding down the sill, then the tiny cascade off the lip into the canal head, thrown square to the wall
  {
    const RUN = 1.7, Yc = filmY(1), tEnd = Math.sqrt(2 * (Yc - WY) / GRAV);
    ribbon({ path: (tau, u, out) => { const f = tau / RUN; weirP(f, u * 2 - 1, c1); out[0] = c1.x; out[1] = filmY(f) + 0.004; out[2] = c1.z; return out; }, t0: CREST_F * RUN, t1: RUN, rows: 14, cols: 6, kind: 0, seed: 0.57, W: 3, s0: 0.16, s1: 0.26 });
    const path = (u0, u1, off) => (tau, u, out) => { lipPt(lerp(u0, u1, u), 0.08 + off + 0.5 * tau, c1); out[0] = c1.x; out[1] = Yc - 0.5 * GRAV * tau * tau; out[2] = c1.z; return out; };
    ribbon({ path: path(0.02, 0.98, 0), t0: 0, t1: tEnd, rows: 8, cols: 6, kind: 1, seed: 0.73, W: 2.4, s0: 0.1, s1: 0.28 });
    ribbon({ path: path(0.28, 0.72, 0.03), t0: 0.02, t1: tEnd, rows: 8, cols: 3, kind: 2, seed: 0.41, W: 1.6, s0: 0.1, s1: 0.3 });
  }
  {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(fPos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(fUv, 2));
    g.setAttribute('aTau', new THREE.Float32BufferAttribute(fTau, 1)); g.setAttribute('aK', new THREE.Float32BufferAttribute(fK, 3)); g.setIndex(fIdx);
    const m = new THREE.Mesh(g, fallMat); m.name = 'waterfall'; m.renderOrder = 4; m.frustumCulled = false; ctx.noOutline(m); group.add(m);
    // The ink pass draws over the finished beauty image, so the wall's lines would show through the water. This invisible twin sits
    // on the soft layer: it writes nothing in the beauty pass, and in the ink pass it marks these pixels as carrying no ink.
    const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', g.attributes.position); g2.setIndex(maskIdx);
    const mask = new THREE.Mesh(g2, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide }));
    mask.name = 'waterfall-inkmask'; mask.frustumCulled = false; ctx.softEdge(mask); group.add(mask);
  }

  /* ---------- spray: droplets thrown off the breaking strands, the lip, the cascade, and the crash on the prow ---------- */
  const uH = { value: 800 };
  let sprayMat;
  {
    const N = 2400, pos = new Float32Array(N * 3), vel = new Float32Array(N * 4), a = new Float32Array(N * 4);
    const p = [0, 0, 0];
    for (let i = 0; i < N; i++) {
      const r = rng();
      let x, y, z, vx, vy, vz, g, life, size, kind = 0;
      if (r < 0.5) {             // breaking off the strands
        const c = rng.pick(CHUTES), t0 = rng.range(0.7, T_END); fallPath(c, rng.range(-0.7, 0.7), 0, rng.range(-0.1, 0.2), 0, rng(), 0)(t0, 0.5, p);
        [x, y, z] = p; const k = rng.range(0.4, 0.7);
        vx = c.vx + rng.range(-0.6, 0.6); vy = -GRAV * t0 * k; vz = c.vz + rng.range(-0.25, 0.75); g = GRAV * 0.62; life = rng.range(0.5, 1.15); size = rng() < 0.12 ? rng.range(0.05, 0.075) : rng.range(0.016, 0.042);
      } else if (r < 0.62) {     // kicked up where the flow hits the sill stones and goes over
        const c = rng.pick(CHUTES); x = c.x + rng.range(-0.5, 0.5) * c.w; y = LIP.y + 0.08; z = LIP.z + rng.range(-0.1, 0.1);
        vx = rng.range(-0.34, 0.34); vy = rng.range(0.2, 0.75); vz = rng.range(0.2, 0.7); g = GRAV; life = rng.range(0.3, 0.6); size = rng.range(0.016, 0.042);
      } else if (r < 0.66) {     // the crest of white water along the lip: fat, slow, staying put
        const c = rng.pick(CHUTES); x = c.x + rng.range(-0.56, 0.56) * c.w; y = Y0 + rng.range(-0.02, 0.05); z = LIP.z + rng.range(-0.14, 0.04);
        vx = rng.range(-0.03, 0.03); vy = rng.range(-0.04, 0.04); vz = rng.range(0, 0.12); g = 0; life = rng.range(0.5, 1.1); size = rng.range(0.06, 0.15);
      } else if (r < 0.7) {      // cascade foot at the weir
        const across = rng.range(-0.42, 0.42), off = rng.range(-0.1, 0.16); lipPt(0.5 + across / 0.92, 0.28 + off, c1); x = c1.x; y = WY + 0.03; z = c1.z;
        vx = rng.range(-0.25, 0.25); vy = rng.range(0.2, 0.62); vz = rng.range(-0.1, 0.32); g = GRAV; life = rng.range(0.25, 0.5); size = rng.range(0.018, 0.04);
      } else if (r < 0.9) {      // the fall coming apart below the wall: droplets dropping out of the thinning ribbons
        const c = rng.pick(CHUTES), sp = rng.range(-0.6, 0.6); x = c.x + sp * c.w; y = rng.range(-BASE.height - 2.2, -BASE.height + 1.8); z = c.z + c.vz * 1.5 + rng.range(-0.2, 0.3);
        vx = rng.range(-0.3, 0.3) + sp * 0.3; vy = rng.range(-0.9, -0.2); vz = rng.range(-0.1, 0.3); g = GRAV * 0.35; life = rng.range(0.6, 1.2); size = rng() < 0.15 ? rng.range(0.05, 0.075) : rng.range(0.018, 0.04);
      } else {                   // fine motes hanging in the mist
        x = FCX + rng.range(-3.2, 3.2); y = rng.range(-BASE.height - 3, -BASE.height + 2.6); z = H_ + 1.3 + rng.range(-0.5, 1.5);
        vx = rng.range(-0.14, 0.14); vy = rng.range(-0.4, -0.1); vz = rng.range(-0.1, 0.16); g = 0; life = rng.range(2.4, 5); size = rng.range(0.02, 0.05); kind = 1;
      }
      pos.set([x, y, z], i * 3); vel.set([vx, vy, vz, g], i * 4); a.set([rng(), 1 / life, size, kind], i * 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aV', new THREE.BufferAttribute(vel, 4)); g.setAttribute('aA', new THREE.BufferAttribute(a, 4));
    sprayMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: ctx.shared.uTime, uH, uB: { value: -BASE.height }, cA: { value: C('#bff4e6') }, cB: { value: C('#ffffff') } },
      vertexShader: /* glsl */`
        attribute vec4 aV,aA; uniform float uTime,uH,uB; varying float vA,vK;
        void main(){
          float a=fract(aA.x+uTime*aA.y), T=a/aA.y;
          vec3 p=position+aV.xyz*T; p.y-=.5*aV.w*T*T;
          vec4 mv=modelViewMatrix*vec4(p,1.);
          gl_Position=projectionMatrix*mv;
          float fall=smoothstep(uB-3.,uB-.4,p.y);                // nothing survives far below the plinth
          float sz=aA.z*(1.-a*.45)*(.5+.5*fall);
          gl_PointSize=max(1.6,sz*uH*projectionMatrix[1][1]*.5/-mv.z);
          vA=smoothstep(0.,.1,a)*(1.-smoothstep(.62,1.,a))*fall*(aA.w>.5?.5:1.); vK=aA.w;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 cA,cB; varying float vA,vK;
        void main(){ vec2 q=gl_PointCoord-.5; float r=length(q)*2.; float d=smoothstep(1.,.8,r);
          if(d*vA<.01) discard; gl_FragColor=vec4(mix(cB,cA,vK*.7+.15*step(.55,r)),d*vA);
          #include <colorspace_fragment>
        }`,
    });
    const pts = new THREE.Points(g, sprayMat); pts.name = 'spray'; pts.renderOrder = 5; pts.frustumCulled = false; ctx.noOutline(pts); group.add(pts);
  }

  /* ---------- mist, foam and the rainbow, camera-facing, in one mesh ---------- */
  // Mist quads are built on the CPU each frame, so the ink pass (an override material, no vertex shader of ours) can be masked by real geometry and the fragment knows its world position.
  let updateMist;
  {
    const list = [], Z = H_ + 1.1, YB = -BASE.height;
    for (let i = 0; i < 34; i++) {                                 // the veil the fall turns into: thickest beside the foot of the wall, then thinning away below it
      const t = i / 33, y = lerp(YB + 3.4, YB - 3.8, t) + rng.range(-0.35, 0.35), spread = lerp(1.5, 3.6, t);
      list.push({ c: [FCX + rng.range(-1, 1) * spread, y, Z + rng.range(-0.2, 0.9) * lerp(1, 2.8, t)], size: lerp(0.9, 3.0, t) * rng.range(0.7, 1.35), seed: rng(), kind: 0, rate: rng.range(0.03, 0.07), s: sstep(0, 0.18, t) * (1 - sstep(0.34, 0.92, t)) });
    }
    for (let i = 0; i < 8; i++) list.push({ c: [FCX + rng.range(-1, 1) * (FHW + 0.2), lerp(LIP.y - 1, YB + 2.0, rng()), LIP.z + rng.range(0.1, 0.9)], size: rng.range(0.45, 1.0), seed: rng(), kind: 0, rate: rng.range(0.03, 0.06), s: 0.35 });   // a thin breath of mist down the face of the fall
    const nMist = list.length;
    list.push({ c: [FCX + 0.8, -4.2, H_ + 2.0], size: 1.6, seed: 0.2, kind: 1, rate: 0, s: 1 });
    // foam: beads on the lip
    for (let i = 0; i < 46; i++) { const u = rng(); list.push({ c: [lerp(FCX - FHW + 0.06, FCX + FHW - 0.06, u), Y0 + rng.range(0.0, 0.05), LIP.z - 0.05 + rng.range(-0.05, 0.03)], size: rng.range(0.07, 0.15), seed: rng(), kind: 2, rate: 0, s: 1 }); }
    const pos = [], uv = [], m = [], aS = [], idx = [];
    list.forEach((q, i) => { for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { pos.push(...q.c); uv.push(a, b); m.push(q.size, q.seed, q.kind, q.rate); aS.push(q.s); } idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3); });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('aM', new THREE.Float32BufferAttribute(m, 4)); g.setAttribute('aS', new THREE.Float32BufferAttribute(aS, 1)); g.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, premultipliedAlpha: true,
      uniforms: { uTime: ctx.shared.uTime, uN: ctx.shared.uNoise, cA: { value: C('#bdf5e6') }, cB: { value: C('#ffffff') }, cS: { value: C('#a7dbd0') } },
      vertexShader: /* glsl */`
        attribute vec4 aM; attribute float aS; uniform float uTime; varying vec2 vQ; varying vec3 vM,vW; varying float vA;
        void main(){
          vQ=uv; vM=aM.xyz; float k=aM.z; vW=position;
          if(k<.5){ float a=fract(aM.y+uTime*aM.w); vA=aS*smoothstep(0.,.25,a)*(1.-smoothstep(.65,1.,a)); gl_Position=projectionMatrix*viewMatrix*vec4(position,1.); return; }
          vec3 c=position; float grow=1.;
          if(k>1.5){ vA=1.; grow=1.+.09*sin(uTime*(1.6+aM.y*2.)+aM.y*30.); c.y+=.03*sin(uTime*(2.3+aM.y)+aM.y*12.); } else vA=1.;
          vec4 mv=modelViewMatrix*vec4(c,1.); mv.xy+=uv*aM.x*grow; gl_Position=projectionMatrix*mv;
        }`,
      fragmentShader: /* glsl */`
        uniform float uTime; uniform sampler2D uN; uniform vec3 cA,cB,cS; varying vec2 vQ; varying vec3 vM,vW; varying float vA;
        // how far this point is from the plinth's solid: in front of its tapering wall, or below its underside. Mist thins out before it touches either, so a quad never shows the line where it cuts in.
        float solidGap(vec3 p){
          float y=p.y, ins=y>-4.01?mix(.2,.55,clamp((-2.72-y)/1.29,0.,1.)):y>-5.26?mix(.55,1.15,(-4.01-y)/1.25):mix(1.15,2.05,clamp((-5.26-y)/1.41,0.,1.));
          return max(p.z-(${H_.toFixed(1)}-ins),${(-BASE.height - 0.7).toFixed(2)}-y);
        }
        void main(){
          float r=length(vQ);
          if(vM.z>1.5){ // foam: a soft-edged blob in two flat tones, its shaded side toward the wall
            float n=texture2D(uN,vQ*.22+vec2(vM.y*3.+uTime*.02,vM.y*5.-uTime*.03)).g;
            float d=(1.-r)+(n-.5)*.8-.04;
            float a=smoothstep(.02,.08,d); if(a<.02) discard;
            float lit=vQ.y*.7-vQ.x*.28+(n-.5)*.6;
            vec3 c=mix(cS,cB,smoothstep(-.34,-.22,lit));
            gl_FragColor=vec4(c*a*.96,a*.96);
            #include <colorspace_fragment>
            return;
          }
          if(vM.z>.5){ // rainbow: a short arc that swells slowly, strongest where the mist is
            if(vQ.y<0.) discard;
            float b=(r-.68)/.3; if(b<0.||b>1.) discard;
            float ang=atan(vQ.y,vQ.x), f=smoothstep(.5,1.25,ang)*smoothstep(2.2,1.5,ang);
            vec3 c=b<.17?vec3(.72,.46,.98):b<.34?vec3(.42,.62,1.):b<.5?vec3(.42,.95,.74):b<.67?vec3(1.,.95,.5):b<.84?vec3(1.,.68,.34):vec3(1.,.42,.4);
            float n=texture2D(uN,vQ*.2+vec2(uTime*.011,.3)).r, a=f*(.3+.12*sin(uTime*.37))*smoothstep(.3,.56,n+.14);
            gl_FragColor=vec4(c*a,a);
            #include <colorspace_fragment>
            return;
          }
          vec2 q=vQ*.14+vec2(vM.y,vM.y*.7)+vec2(uTime*.006,uTime*.009);
          float n=texture2D(uN,q).g*.65+texture2D(uN,q*2.3).b*.35;
          float d=clamp((1.-r)*1.25+(n-.5)*.9,0.,1.);
          float a=d*d*(3.-2.*d); a*=a;                                  // one smooth falloff, no bands
          a*=vA*.21*smoothstep(0.,1.1,solidGap(vW));
          if(a<.003) discard;
          // Output is premultiplied, and thin mist adds light rather than covering: over the dark earth it brightens instead of turning grey.
          gl_FragColor=vec4(mix(cA,cB,smoothstep(.03,.14,a))*a,a*mix(.5,1.,smoothstep(.01,.12,a)));
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(g, mat); mesh.name = 'mist'; mesh.renderOrder = 6; mesh.frustumCulled = false; ctx.noOutline(mesh); group.add(mesh);
    // The ink mask for the mist's dense cores only, as discs that sit inside each sprite: lines stay on where the mist is thin, so the mask's edge never shows as a hard stop.
    const core = list.slice(0, nMist).filter((q) => q.s >= 0.45), RIM = 10, maskPos = new Float32Array(core.length * (RIM + 1) * 3), maskI = [];
    core.forEach((_, i) => { const b = i * (RIM + 1); for (let k = 0; k < RIM; k++) maskI.push(b, b + 1 + k, b + 1 + (k + 1) % RIM); });
    const g3 = new THREE.BufferGeometry(); g3.setAttribute('position', new THREE.BufferAttribute(maskPos, 3).setUsage(THREE.DynamicDrawUsage)); g3.setIndex(maskI);
    const mask = new THREE.Mesh(g3, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide })); mask.name = 'mist-inkmask'; mask.frustumCulled = false; ctx.softEdge(mask); group.add(mask);
    const R_ = new V3(), U_ = new V3(), P_ = g.attributes.position.array, CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const drift = (q, t, out) => { const a = frac(q.seed + t * q.rate); out.set(q.c[0] + Math.sin(q.seed * 40 + t * 0.21) * 0.28, q.c[1] + 0.2 - 0.7 * a, q.c[2] + Math.cos(q.seed * 31 + t * 0.17) * 0.2); return a; };
    const at = new V3();
    updateMist = (t) => {
      ctx.camera.updateMatrixWorld(); const e = ctx.camera.matrixWorld.elements; R_.set(e[0], e[1], e[2]); U_.set(e[4], e[5], e[6]);
      for (let i = 0; i < nMist; i++) {
        const q = list[i], a = drift(q, t, at), sz = q.size * (0.8 + 0.5 * a);
        for (let c = 0; c < 4; c++) { const [ux, uy] = CORNERS[c], o = (i * 4 + c) * 3; P_[o] = at.x + (R_.x * ux + U_.x * uy) * sz; P_[o + 1] = at.y + (R_.y * ux + U_.y * uy) * sz; P_[o + 2] = at.z + (R_.z * ux + U_.z * uy) * sz; }
      }
      g.attributes.position.needsUpdate = true;
      core.forEach((q, i) => {
        const a = drift(q, t, at), life = sstep(0, 0.25, a) * (1 - sstep(0.65, 1, a)), rad = q.size * (0.8 + 0.5 * a) * 0.62 * sstep(0.35, 0.8, life);
        let o = i * (RIM + 1) * 3; maskPos[o] = at.x; maskPos[o + 1] = at.y; maskPos[o + 2] = at.z;
        for (let k = 0; k < RIM; k++) { o += 3; const th = (k / RIM) * 6.2832, ux = Math.cos(th) * rad, uy = Math.sin(th) * rad; maskPos[o] = at.x + R_.x * ux + U_.x * uy; maskPos[o + 1] = at.y + R_.y * ux + U_.y * uy; maskPos[o + 2] = at.z + R_.z * ux + U_.z * uy; }
      });
      g3.attributes.position.needsUpdate = true;
    };
  }

  /* ---------- flecks on the current and foam at the broken places ---------- */
  const shard = (() => {
    const pos = [], l = 0.5, w = 0.5, ins = 0.14, rim = [[0, l], [ins, ins], [w, 0], [ins, -ins], [0, -l], [-ins, -ins], [-w, 0], [-ins, ins]];
    for (let i = 0; i < 8; i++) { const a = rim[i], b = rim[(i + 1) % 8]; pos.push(0, 0, 0, b[0], 0, b[1], a[0], 0, a[1]); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); return g;
  })();
  const N_FLOW = 190, N_FOAM = 86, N_RACE = 26, flecks = new THREE.InstancedMesh(shard, new THREE.MeshBasicMaterial({ color: C('#f6fff4'), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }), N_FLOW + N_FOAM + N_RACE);
  flecks.name = 'river-flecks'; flecks.frustumCulled = false; flecks.renderOrder = 3; flecks.castShadow = false; ctx.noOutline(flecks); group.add(flecks);
  const flow = Array.from({ length: N_FLOW }, (_, i) => ({ ph: hash(i, 1), u: (hash(i, 2) * 2 - 1) * 0.74, sp: lerp(0.34, 0.62, hash(i, 3)), wob: hash(i, 4) * 6.28, sz: lerp(0.1, 0.28, hash(i, 5)) }));
  const foamAt = [];
  for (const [d, u] of ROCKS) { chan(d + 0.14, u, c1); for (let k = 0; k < 3; k++) foamAt.push({ x: c1.x, z: c1.z, r: 0.2, sp: 0.5 }); }
  for (let i = 0; i < 12; i++) { lipPt(lerp(0.06, 0.94, i / 11), 0.34, c1); foamAt.push({ x: c1.x, z: c1.z, r: 0.24, sp: 0.8 }); }
  for (const [d, u] of ROCKS2) { chan(d + 0.14, u, c1); for (let k = 0; k < 2; k++) foamAt.push({ x: c1.x, z: c1.z, r: 0.2, sp: 0.5 }); }
  foamAt.push(...foamAt2);
  for (let i = 0; foamAt.length < N_FOAM; i++) { const c = CHUTES[i % 3]; foamAt.push({ x: c.x + (hash(i, 8) - 0.5) * c.w, z: LIP.z - 0.14 - hash(i, 9) * 0.3, r: 0.13, sp: 1.1 }); }
  const raceFlow = Array.from({ length: N_RACE }, (_, i) => ({ ph: hash(i, 21), u: lerp(RACE.u + 0.1, 0.94, hash(i, 22)), sp: lerp(1.1, 1.8, hash(i, 23)), sz: lerp(0.14, 0.32, hash(i, 24)) }));
  const fm = new M4(), fq = new Q(), fp = new V3(), fs = new V3();
  const setFleck = (i, x, y, z, yaw, sx, sz) => { fp.set(x, y, z); fq.setFromAxisAngle(UP, yaw); fs.set(Math.max(sx, 1e-4), 1, Math.max(sz, 1e-4)); fm.compose(fp, fq, fs); flecks.setMatrixAt(i, fm); };
  const updateFlecks = (t) => {
    for (let i = 0; i < N_FLOW; i++) {
      const f = flow[i], a = frac(f.ph + (t * f.sp) / TOTAL), d = a * TOTAL;
      chan(d, f.u + 0.04 * Math.sin(d * 2.1 + f.wob), c1);
      const fade = sstep(0, 0.06, a) * (1 - sstep(0.93, 1, a)), blink = 0.55 + 0.45 * Math.sin(t * 1.3 + f.wob), b = bed(d, f.u);
      const s = f.sz * fade * blink * sstep(WY - 0.03, WY - 0.15, b);
      setFleck(i, c1.x, waterY(d) + 0.012, c1.z, Math.atan2(c1.tx, c1.tz), s * 0.24, s * (1.2 + a * 0.8));
    }
    for (let i = 0; i < N_FOAM; i++) {
      const f = foamAt[i], p = hash(i, 11), a = frac(p + t * f.sp * 0.9), ang = hash(i, 12) * 6.28, rr = f.r * (0.2 + a), s = f.r * 0.5 * Math.sin(Math.PI * a) * (0.5 + 0.5 * hash(i, 13));
      setFleck(N_FLOW + i, f.x + Math.cos(ang) * rr, WY + 0.016, f.z + Math.sin(ang) * rr, ang, s, s);
    }
    for (let i = 0; i < N_RACE; i++) {
      const f = raceFlow[i], a = frac(f.ph + (t * f.sp) / (RACE.d1 - RACE.d0)), d = lerp(RACE.d0 + 0.1, RACE.d1, a), fade = sstep(0, 0.1, a) * (1 - sstep(0.88, 1, a));
      chan(d, f.u, c1);
      setFleck(N_FLOW + N_FOAM + i, c1.x, WY + 0.014, c1.z, Math.atan2(c1.tx, c1.tz), f.sz * fade * 0.22, f.sz * fade * 3.2);
    }
    flecks.instanceMatrix.needsUpdate = true;
  };

  /* ---------- fish: a few of the pond's koi that got over the weir, and some little silver dace ---------- */
  const FISH = [
    { d: 2.4, ad: 0.8, u: -0.12, au: 0.3, len: 0.46, y: -0.78, cols: ['#f58a3c', '#fff4e4'], ph: 0.4 },
    { d: 6.9, ad: 0.9, u: 0.12, au: 0.34, len: 0.4, y: -0.86, cols: ['#fff4e4', '#ee6a3a'], ph: 2.1 },
    { d: 10.0, ad: 0.7, u: 0.1, au: 0.3, len: 0.3, y: -0.7, cols: ['#a8cfd0', '#e4f6ec'], ph: 4.0 },
    { d: 9.0, ad: 0.8, u: -0.3, au: 0.24, len: 0.26, y: -0.8, cols: ['#a8cfd0', '#e4f6ec'], ph: 1.2 },
    { d: 3.4, ad: 0.9, u: -0.34, au: 0.22, len: 0.28, y: -0.66, cols: ['#b6d6c8', '#eef8ee'], ph: 5.1 },
    // v3: a few more below the road bridge and up the race's tail
    { d: 19.4, ad: 1.1, u: -0.1, au: 0.3, len: 0.42, y: -0.82, cols: ['#fff4e4', '#f58a3c'], ph: 1.7 },
    { d: 31.4, ad: 1.0, u: -0.2, au: 0.28, len: 0.46, y: -0.78, cols: ['#f58a3c', '#fff4e4'], ph: 3.3 },
    { d: 34.6, ad: 0.8, u: 0.2, au: 0.26, len: 0.28, y: -0.76, cols: ['#a8cfd0', '#e4f6ec'], ph: 0.8 },
  ];
  const fishG = {};
  {
    const pos = [], nor = [], col = [], idx = [], ranges = [], kind = [];
    FISH.forEach((f, fi) => {
      const parts = [], rows = 7, seg = 6, a = C(f.cols[0]), b = C(f.cols[1]), start = pos.length / 3, rad = (t) => 0.5 * Math.pow(Math.sin(Math.PI * Math.pow(0.04 + t * 0.92, 0.72)), 0.9) * 0.24 + 0.002;
      for (let r = 0; r <= rows; r++) for (let s = 0; s < seg; s++) {
        const t = r / rows, an = (s / seg) * 6.283, ca = Math.cos(an), sa = Math.sin(an), rr = rad(t) * f.len;
        pos.push(ca * rr * 0.72, sa * rr, (0.5 - t) * f.len); nor.push(ca, sa, 0.05);
        const patch = fi < 2 ? (hash(r * 0.4 | 0, s + fi) > 0.5 ? a : b) : (sa > 0.2 ? a : b); col.push(patch.r, patch.g, patch.b); kind.push(t);
      }
      for (let r = 0; r < rows; r++) for (let s = 0; s < seg; s++) { const p = start + r * seg + s, q = start + r * seg + (s + 1) % seg, u = p + seg, v = q + seg; idx.push(p, u, q, q, u, v); }
      const tb = pos.length / 3, tl = -0.5 * f.len;
      for (const [x, y, z, t] of [[0, 0.002, tl, 1], [0, 0.1 * f.len, tl - 0.2 * f.len, 1.3], [0, -0.1 * f.len, tl - 0.2 * f.len, 1.3]]) { pos.push(x, y, z); nor.push(1, 0, 0); col.push(a.r, a.g, a.b); kind.push(t); }
      idx.push(tb, tb + 1, tb + 2);
      ranges.push([start, pos.length / 3]);
    });
    fishG.base = new Float32Array(pos); fishG.baseN = new Float32Array(nor); fishG.t = new Float32Array(kind); fishG.ranges = ranges;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
    const m = new THREE.Mesh(g, ctx.toon({ vertexColors: true, side: THREE.DoubleSide, emissive: '#ffffff', emissiveIntensity: 0.0, translucent: 0.25 }));
    m.name = 'river-fish'; m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false; ctx.softEdge(m); group.add(m); fishG.mesh = m;
  }
  const fishD = (f, q) => f.d + f.ad * Math.sin(q * 0.23 + f.ph) + 0.25 * f.ad * Math.sin(q * 0.57 + f.ph * 2.3);
  const fishU = (f, q) => f.u + f.au * Math.sin(q * 0.31 + f.ph * 1.7);
  const updateFish = (t) => {
    const pa = fishG.mesh.geometry.attributes.position, na = fishG.mesh.geometry.attributes.normal;
    for (let i = 0; i < FISH.length; i++) {
      const f = FISH[i];
      chan(fishD(f, t), fishU(f, t), c1); chan(fishD(f, t + 0.3), fishU(f, t + 0.3), c2);
      // fish hold their heads to the current and let it carry them; the heading only leans into the drift
      const hx = -c1.tx * 0.34 + (c2.x - c1.x) * 3.2, hz = -c1.tz * 0.34 + (c2.z - c1.z) * 3.2, yaw = Math.atan2(hx, hz), cy2 = Math.cos(yaw), sy2 = Math.sin(yaw), ph = t * 7 + f.ph * 3;
      const a = fishG.ranges[i][0], b = fishG.ranges[i][1];
      for (let v = a; v < b; v++) {
        const k = fishG.t[v], bend = 0.09 * f.len * k * k * Math.sin(ph - k * 3.4) * 2.2;
        const px = fishG.base[v * 3] + bend, py = fishG.base[v * 3 + 1], pz = fishG.base[v * 3 + 2], nx = fishG.baseN[v * 3], nz = fishG.baseN[v * 3 + 2];
        pa.setXYZ(v, c1.x + px * cy2 + pz * sy2, f.y + py + 0.02 * Math.sin(t * 0.7 + f.ph), c1.z - px * sy2 + pz * cy2);
        na.setXYZ(v, nx * cy2 + nz * sy2, fishG.baseN[v * 3 + 1], -nx * sy2 + nz * cy2);
      }
    }
    pa.needsUpdate = true; na.needsUpdate = true;
  };

  /* ---------- reeds in the wind ---------- */
  const rm = new M4(), rq = new Q(), rp = new V3(), rs = new V3(), re = new THREE.Euler(0, 0, 0, 'XZY');  // yaw goes on first, so a gust leans every clump the same world way, as the pond's reeds do
  const updateReeds = (t) => {
    for (let i = 0; i < reedList.length; i++) {
      const r = reedList[i], w = ctx.wind(t, r.x, r.z), lean = 0.07 * w + 0.022 * Math.sin(t * 1.7 + r.ph);
      re.set(0.6 * lean + 0.03 * Math.sin(r.ph), r.yaw, 0.9 * lean); rq.setFromEuler(re); rp.set(r.x, r.y, r.z); rs.setScalar(r.s); rm.compose(rp, rq, rs);
      reedMesh.setMatrixAt(i, rm);
    }
    reedMesh.instanceMatrix.needsUpdate = true;
  };

  /* ---------- assemble ---------- */
  const addMesh = (list, mat, { cast = true, receive = true, soft = false, uv = 0, name = '' } = {}) => {
    if (!list.length) return null;
    const g = kit.merge(list); if (uv) kit.worldUV(g, uv);
    const m = new THREE.Mesh(g, mat); m.castShadow = cast; m.receiveShadow = receive; m.name = name;
    if (soft) ctx.softEdge(m);
    group.add(m); return m;
  };
  const concrete = ctx.surface('concrete', { vertexColors: true, moss: 0.2 }), wood = ctx.surface('wood', { vertexColors: true, side: THREE.DoubleSide, color: '#ffffff' }), rust = ctx.surface('rust', { vertexColors: true });
  addMesh(stoneL, concrete, { uv: concrete.userData.uv, name: 'river-stone' });
  { const asphalt = ctx.surface('asphalt', { vertexColors: true, color: '#ffffff' }); addMesh(asphL, asphalt, { uv: asphalt.userData.uv, name: 'river-bridge-deck' }); }
  addMesh(bedL, ctx.toon({ vertexColors: true }), { cast: false, name: 'river-bed' });
  addMesh(woodL, wood, { uv: wood.userData.uv, name: 'river-wood' });
  addMesh(rustL, rust, { uv: rust.userData.uv, name: 'river-rust' });
  addMesh(plantL, ctx.toon({ vertexColors: true, side: THREE.DoubleSide, translucent: 0.7 }), { cast: true, receive: false, soft: true, name: 'river-plants' });
  {
    const kept = leaves.filter((l, i) => l.p.z < 21 || i % 4 !== 0); leaves.length = 0; leaves.push(...kept);
    const n = leaves.length, g = new THREE.BufferGeometry(), m = new M4(), T = new V3(), U = new V3(), B = new V3(), sh = new Float32Array(n * 3);
    for (const k of ['position', 'normal', 'uv', 'color']) g.setAttribute(k, shellLeaf.attributes[k]);
    g.setIndex(shellLeaf.index);
    const mesh = new THREE.InstancedMesh(g, shellMat, n);
    leaves.forEach((l, i) => {
      T.copy(l.tip); U.copy(l.shell).addScaledVector(T, -l.shell.dot(T)).normalize(); B.crossVectors(U, T).normalize();
      m.makeBasis(B, U, T).scale(fs.set(l.s, l.s, l.s)); m.setPosition(l.p.x, l.p.y, l.p.z);
      mesh.setMatrixAt(i, m); mesh.setColorAt(i, l.tone); sh[i * 3] = l.shell.x; sh[i * 3 + 1] = l.shell.y; sh[i * 3 + 2] = l.shell.z;
    });
    g.setAttribute('aShell', new THREE.InstancedBufferAttribute(sh, 3));
    mesh.castShadow = true; mesh.receiveShadow = false; mesh.frustumCulled = false; mesh.name = 'river-leaves'; ctx.softEdge(mesh); group.add(mesh);
  }

  /* ---------- per frame ---------- */
  const size = new THREE.Vector2();
  let lastRip = -1;
  const update = (t) => {
    ctx.renderer.getDrawingBufferSize(size); uH.value = size.y;
    updateFlecks(t); updateFish(t); updateReeds(t); updateMist(t);
    const k = Math.floor(t / 2.9);
    if (k !== lastRip) {
      lastRip = k;
      if (k % 2 === 0) { lipPt(0.12 + 0.76 * hash(k, 1), 0.48 + hash(k, 2) * 0.3, c1); ctx.addRipple(c1.x, c1.z); }
      else { const d = 1.2 + hash(k, 3) * (TOTAL - 3.2), u = (hash(k, 4) - 0.5) * 1.2; chan(d, u, c1); if (bed(d, u) < WY - 0.12) ctx.addRipple(c1.x, c1.z); }
    }
  };
  update(0); lastRip = -1;
  return { group, update };
}
