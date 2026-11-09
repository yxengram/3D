// outskirts.js — all ground of the outer ring, CORE.half < max(|x|,|z|) < BASE.half.
//
// How it is put together
//  · Roads live in their own (s,t) coordinates: s along the centre line, t across it. Fracture cells are convex there, and bends cost nothing.
//  · The soil plate is whatever is left: road cuts, the canal, the core and the bitten plinth outline are painted into a small mask and contoured.
//    Roads, canal and plinth edge therefore always agree, and the seam at ±CORE.half falls exactly on a lattice line.
//  · One 4096 atlas, ±41 world units. Turf is thresholded from the same noise as ground.js, so its bands run straight across the seam;
//    a lattice is bilinearly expanded row by row (no per-pixel noise). Everything else on it is vector paint.
//  · Walk widths: RING_ROADS.walk[0] is the side toward the negative axis, matching GROUND's innerSidewalk (shotengai -z, north -x).

const TAU = Math.PI * 2;
const smooth = (t) => { const k = Math.min(1, Math.max(0, t)); return k * k * (3 - 2 * k); };
const lerp = (a, b, t) => a + (b - a) * t;
const hyp = Math.hypot;
const area = (p) => { let s = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) s += p[j][0] * p[i][1] - p[i][0] * p[j][1]; return s / 2; };

/** The same noise table and turf function as ground.js: the string seed is what makes the two sides of the seam agree. */
function makeNoise(rng) {
  const T = new Float32Array(65536).map(() => rng());
  return (x, z) => {
    const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi;
    const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    const X0 = xi & 255, X1 = (xi + 1) & 255, Z0 = (zi & 255) << 8, Z1 = ((zi + 1) & 255) << 8;
    const a = T[X0 | Z0], b = T[X1 | Z0], c = T[X0 | Z1], d = T[X1 | Z1];
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
  };
}

/**
 * The broken outline of the plinth top, shared with base.js. Perimeter coordinate s as in base.js:
 * [0,2H) +z side x=-H+s, then +x side z=H-u, -z side x=H-u, -x side z=-H+u. inset(s) is how far the top edge has crumbled inward there.
 * Crumbling stops short of buildings, zones, trunks, road ends, the rail bed and the canal notch, and stays small at the corners so the square still reads.
 */
export function plinthEdge(ctx) {
  const { BASE, RAIL, RIVER, RING_ROADS, RING_ZONES, WOODS, BUILDINGS, buildingBox } = ctx.layout;
  const H = BASE.half, SIDE = 2 * H, PER = 8 * H, STEP = 0.5, N = Math.round(PER / STEP), rng = ctx.seeded('plinth-edge');
  const mod = (s) => ((s % PER) + PER) % PER;
  const sq = (s) => { const m = mod(s), k = Math.floor(m / SIDE) % 4, u = m - k * SIDE; return k === 0 ? [-H + u, H, k] : k === 1 ? [H, H - u, k] : k === 2 ? [H - u, -H, k] : [-H, -H + u, k]; };
  const lim = new Float32Array(N).fill(2.3);
  const rects = [...BUILDINGS.map((b) => buildingBox(b, 0.55)), ...Object.values(RING_ZONES).map((r) => ({ x: [r.x[0] - 0.3, r.x[1] + 0.3], z: [r.z[0] - 0.3, r.z[1] + 0.3] }))];
  const ends = RING_ROADS.flatMap((r) => [r.pts[0], r.pts[r.pts.length - 1]].filter(([x, z]) => Math.max(Math.abs(x), Math.abs(z)) >= H - 1e-3).map((p) => ({ p, h: r.w / 2 + Math.max(r.walk[0], r.walk[1]) + 0.9 })));
  for (let i = 0; i < N; i++) {
    const [x, z, k] = sq(i * STEP), along = k % 2 ? z : x, l = lim;
    const depthOf = (r) => (k === 0 ? H - r.z[1] : k === 1 ? H - r.x[1] : k === 2 ? r.z[0] + H : r.x[0] + H);
    for (const r of rects) { const a = k % 2 ? r.z : r.x; if (along > a[0] && along < a[1]) l[i] = Math.min(l[i], Math.max(0, depthOf(r))); }
    for (const t of WOODS) { const d = k === 0 ? H - t.z : k === 1 ? H - t.x : k === 2 ? t.z + H : t.x + H, a = k % 2 ? t.z : t.x; if (Math.abs(along - a) < 2.4) l[i] = Math.min(l[i], Math.max(0, d - t.trunkR - 1.3)); }
    for (const e of ends) { const a = Math.max(Math.abs(e.p[0] - x), Math.abs(e.p[1] - z)); if (a < e.h) l[i] = 0; }
    if (k % 2 === 0 && x > RAIL.bed.x[0] - 0.8 && x < RAIL.bed.x[1] + 0.8) l[i] = 0;
    if (k === 0 && x > RIVER.outfall.x[0] - 1.2 && x < RIVER.outfall.x[1] + 1.2) l[i] = 0;
    const c = Math.min(Math.abs(along - H), Math.abs(along + H)); if (c < 2.2) l[i] = Math.min(l[i], 0.35 * c);
  }
  const eroded = lim.map((_, i) => { let m = 9; for (let k = -3; k <= 3; k++) m = Math.min(m, lim[(i + k + N) % N]); return m; });
  const safe = eroded.map((_, i) => (eroded[(i + N - 1) % N] + 2 * eroded[i] + eroded[(i + 1) % N]) / 4);
  const raw = new Float32Array(N);
  for (let b = 0; b < 58; b++) {
    const c = rng() * N, hw = rng.range(2.5, 11), de = rng.range(0.3, 1) ** 1.6 * 2.1;
    for (let k = -Math.ceil(hw); k <= hw; k++) { const u = k / hw, i = (Math.round(c) + k + N) % N; raw[i] = Math.max(raw[i], de * (1 - u * u) * rng.range(0.72, 1)); }
  }
  const table = raw.map((v, i) => Math.min(safe[i], v + rng.range(0.0, 0.14)));
  const inset = (s) => { const q = mod(s) / STEP, i = Math.floor(q) % N, f = q - Math.floor(q); return lerp(table[i], table[(i + 1) % N], f); };
  return { PER, SIDE, STEP, N, sq, inset, point: (s) => { const [x, z] = sq(s), k = 1 - inset(s) / H; return [x * k, z * k]; } };
}

export function build(ctx) {
  const { THREE, layout, P, kit } = ctx;
  const { BASE, CORE, GROUND: G, RAIL, RIVER, RING_ROADS, CROSSINGS, RING_ZONES, WOODS, BUILDINGS, TORII, buildingBox, roadDist, pointInPoly } = layout;
  const H = BASE.half, CH = CORE.half, group = new THREE.Group(); group.name = 'outskirts';
  const rng = ctx.rng, vn = makeNoise(ctx.seeded('ground-noise'));
  const edge = plinthEdge(ctx);
  const turf = (x, z) => 0.62 * vn(x * 0.55 + 11, z * 0.55 + 4) + 0.28 * vn(x * 1.6, z * 1.6 + 9) + 0.1 * vn(x * 4.3 + 5, z * 4.3);
  const col = (c) => new THREE.Color(c);

  // ---- soups: one big array per material, far cheaper than one geometry per stone --------------------------------------
  class Soup {
    constructor() { this.p = []; this.c = []; }
    tri(a, b, c, k, ref) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, flip = nx * ref[0] + ny * ref[1] + nz * ref[2] < 0;
      this.p.push(a[0], a[1], a[2], ...(flip ? c : b), ...(flip ? b : c));
      for (let i = 0; i < 3; i++) this.c.push(k.r, k.g, k.b);
    }
    quad(a, b, c, d, k, ref) { this.tri(a, b, c, k, ref); this.tri(a, c, d, k, ref); }
    geo() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((this.p.length / 3) * 2), 2)); g.computeVertexNormals(); return g;
    }
  }
  const UP = [0, 1, 0], WHITE = new THREE.Color(1, 1, 1);
  const atlasS = new Soup(), flatS = new Soup(), stoneS = new Soup(), tileS = new Soup(), rootB = ctx.batch();
  const polyOrient = (p) => (area(p) >= 0 ? p : [...p].reverse());
  const triTop = (s, poly, yAt, k) => { const v = poly.map((q) => new THREE.Vector2(q[0], q[1])), y = poly.map(yAt); for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(v, [])) s.tri([poly[a][0], y[a], poly[a][1]], [poly[b][0], y[b], poly[b][1]], [poly[c][0], y[c], poly[c][1]], k, UP); };
  const skirt = (s, poly, yA, yB, k) => { const o = polyOrient(poly), n = o.length; for (let i = 0; i < n; i++) { const a = o[i], b = o[(i + 1) % n]; s.quad([a[0], yA(a), a[1]], [b[0], yA(b), b[1]], [b[0], yB(b), b[1]], [a[0], yB(a), a[1]], k, [b[1] - a[1], 0, a[0] - b[0]]); } };
  /** Chamfered four-cornered stone; corners in order, top from topY(p). */
  const stone = (S, q, topY, bot, ch, k) => {
    const o = polyOrient(q), c = o.reduce((a, p) => [a[0] + p[0] / o.length, a[1] + p[1] / o.length], [0, 0]);
    const inner = o.map((p) => { const dx = c[0] - p[0], dz = c[1] - p[1], l = hyp(dx, dz) || 1; return [p[0] + (dx / l) * ch * 1.4, p[1] + (dz / l) * ch * 1.4]; });
    triTop(S, inner, topY, k);
    for (let i = 0; i < o.length; i++) { const j = (i + 1) % o.length; S.quad([o[i][0], topY(o[i]) - ch, o[i][1]], [o[j][0], topY(o[j]) - ch, o[j][1]], [inner[j][0], topY(inner[j]), inner[j][1]], [inner[i][0], topY(inner[i]), inner[i][1]], k, UP); }
    skirt(S, o, (p) => topY(p) - ch, () => bot, k);
  };

  // ---- road frames ------------------------------------------------------------------------------------------------------
  const KIND = { shotengai: 'tile', north: 'asphalt', ringN: 'asphalt', ringS: 'asphalt', alley: 'concrete', ringW: 'earth', ringE: 'earth' };
  const riverPoly = layout.riverOutline(0.5), inRiver = (x, z, pad = 0) => z > CH - 1 && (pointInPoly(x, z, riverPoly) || (pad > 0 && [[pad, 0], [-pad, 0], [0, pad], [0, -pad]].some(([a, c]) => pointInPoly(x + a, z + c, riverPoly))));
  const roads = RING_ROADS.map((def) => {
    const p = def.pts, lens = p.slice(1).map((q, i) => hyp(q[0] - p[i][0], q[1] - p[i][1])), cum = [0];
    lens.forEach((l, i) => cum.push(cum[i] + l));
    const segN = lens.map((l, i) => [-(p[i + 1][1] - p[i][1]) / l, (p[i + 1][0] - p[i][0]) / l]);
    const vtxN = p.map((_, i) => { const a = segN[Math.max(0, i - 1)], b = segN[Math.min(segN.length - 1, i)]; let x = a[0] + b[0], z = a[1] + b[1]; const l = hyp(x, z) || 1, m = 1 / Math.max(0.5, (x / l) * a[0] + (z / l) * a[1]); return [(x / l) * m, (z / l) * m]; });
    const at = (s, t) => {
      s = Math.max(0, Math.min(cum[cum.length - 1], s));
      let i = 0; while (i < lens.length - 1 && s > cum[i + 1]) i++;
      const f = (s - cum[i]) / lens[i], a = p[i], b = p[i + 1], na = vtxN[i], nb = vtxN[i + 1];
      return [lerp(a[0] + na[0] * t, b[0] + nb[0] * t, f), lerp(a[1] + na[1] * t, b[1] + nb[1] * t, f)];
    };
    // walk sides: t>0 follows segN, so its width is walk[0] when that normal points at a negative axis
    const n0 = segN[0], plusIsFirst = n0[0] < -0.5 || n0[1] < -0.5, walkP = def.walk[plusIsFirst ? 0 : 1], walkM = def.walk[plusIsFirst ? 1 : 0];
    return { def, id: def.id, kind: KIND[def.id], w: def.w, hw: def.w / 2, L: cum[cum.length - 1], cum, at, walkP, walkM, spans: [] };
  });
  // Where each road actually has a surface: not inside a stronger road or its walks, not over the canal or the rail bed.
  const bedPad = 0.05, canal = CROSSINGS.canal;
  roads.forEach((r, ri) => {
    const blocked = (x, z) => {
      for (let j = 0; j < ri; j++) { if (roadDist(x, z, roads[j].def) < 0) return true; }
      if (x > RAIL.bed.x[0] - bedPad && x < RAIL.bed.x[1] + bedPad) return true;
      if (r.id === 'ringS' && Math.abs(x - canal.x) < canal.length / 2) return true;
      return inRiver(x, z, 0.1);
    };
    let a = null;
    for (let s = 0, n = Math.ceil(r.L / 0.08); ; s = Math.min(r.L, s + r.L / n)) {
      const [x, z] = r.at(s, 0), b = blocked(x, z);
      if (!b && a === null) a = s;
      if ((b || s >= r.L) && a !== null) { const e = b ? s - r.L / n : s; if (e - a > 0.6) r.spans.push([a, e]); a = null; }
      if (s >= r.L) break;
    }
  });
  const onSeam = (r, s) => s < 1e-3 && (r.id === 'shotengai' || r.id === 'north');
  // what ground.js left at the seam: where its slab borders reach it and which of its mossy cracks run into it (absent in an --only run without ground)
  const seam = ctx.shared.groundSeam || { n: [], w: [], ends: [], holes: { n: [], w: [] }, tones: { n: [], w: [] } };
  const seamKey = (r) => (r.id === 'north' ? 'n' : 'w');
  const seamAlong = (r, t) => (r.id === 'north' ? r.def.pts[0][0] + t : r.def.pts[0][1] - t);   // road t → the coordinate along the seam ground.js works in
  const seamCuts = (r) => (r.id === 'north' ? seam.n.map((x) => x - r.def.pts[0][0]) : r.id === 'shotengai' ? seam.w.map((z) => r.def.pts[0][1] - z) : []);
  /** One seed per stretch between the seam cuts; neighbours mirror across the cut between them, so a Voronoi border starts exactly where the core's crack ends. */
  const seamSeeds = (cuts, hw) => {
    const c = cuts.filter((v) => Math.abs(v) < hw - 0.2), edges = [-hw, ...c, hw]; let best = null, bad = 1e9;
    for (let k = 1; k < 24; k++) {
      const ts = [lerp(edges[0], edges[1], k / 24)]; for (let i = 0; i < c.length; i++) ts.push(2 * c[i] - ts[i]);
      let v = 0; ts.forEach((q, i) => { v += Math.max(0, edges[i] + 0.2 - q) ** 2 + Math.max(0, q - edges[i + 1] + 0.2) ** 2; });
      if (v < bad) { bad = v; best = ts; }
    }
    return c.length ? best : [];
  };
  const tileMouth = 7.4;   // how far the corner's asphalt can run up the shotengai before the tiles have taken over
  const onAnyRoad = (x, z, pad = 0) => roads.some((r) => roadDist(x, z, r.def) < pad);

  // ---- roots that heave the road: from the near trees, and a few from out of sight -------------------------------------
  const rootR = ctx.seeded('outskirts-roots'), rootLines = [];
  const growRoot = (x, z, r, tx, tz, far) => {
    const dx = tx - x, dz = tz - z, l = hyp(dx, dz) || 1, nx = -dz / l, nz = dx / l, ux = dx / l, uz = dz / l, pts = [], n = Math.max(4, Math.round((l + far) / 0.8));
    const wob = rootR.range(0.3, 0.8), ph = rootR() * TAU;
    for (let i = 0; i <= n; i++) { const d = ((l + far) * i) / n, off = Math.sin(d * 0.7 + ph) * wob * Math.min(1, d / 2); pts.push([x + ux * d + nx * off, z + uz * d + nz * off]); }
    rootLines.push({ pts, r });
  };
  for (const t of WOODS) {
    if (t.elev > 0) continue;
    let best = null, bd = 6.5;
    for (const r of roads) { if (r.kind === 'earth') continue; const d = roadDist(t.x, t.z, r.def); if (d < bd && d > -0.5) { bd = d; best = r; } }
    if (!best) continue;
    let bs = 0, bq = 1e9;
    for (let s = 0; s < best.L; s += 0.5) { const [x, z] = best.at(s, 0), q = hyp(x - t.x, z - t.z); if (q < bq) { bq = q; bs = s; } }
    for (const off of [rootR.range(-2.4, -0.8), rootR.range(0.8, 2.4)]) { const [x, z] = best.at(bs + off, 0); growRoot(t.x, t.z, 0.14 + 0.08 * t.s + rootR.range(0, 0.05), x, z, best.hw + rootR.range(0.3, 1.2)); }
  }
  for (const r of roads) {
    if (r.kind === 'earth') continue;
    for (let s = 5; s < r.L - 3; s += rootR.range(9, 17)) { // a root from something long gone, crossing at an angle
      const sgn = rootR.sign(), a = r.at(s - 1.4, sgn * (r.hw + rootR.range(1.5, 3.5))), b = r.at(s + 1.6, -sgn * r.hw * 0.4);
      if (a[0] > RAIL.bed.x[0] - 1 && a[0] < RAIL.bed.x[1] + 1) continue;
      growRoot(a[0], a[1], rootR.range(0.11, 0.2), b[0], b[1], rootR.range(0.4, 1.2));
    }
  }
  const segDist = (px, pz, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / (dx * dx + dz * dz || 1e-9))); return { d: hyp(px - a[0] - dx * t, pz - a[1] - dz * t), x: a[0] + dx * t, z: a[1] + dz * t }; };
  const rootNear = (x, z) => { let best = { d: 1e9, x, z, r: 0 }; for (const l of rootLines) for (let i = 0; i + 1 < l.pts.length; i++) { if (Math.abs(l.pts[i][0] - x) > 4 || Math.abs(l.pts[i][1] - z) > 4) continue; const c = segDist(x, z, l.pts[i], l.pts[i + 1]); if (c.d < best.d) best = { ...c, r: l.r }; } return best; };

  // ---- fractured surfaces -----------------------------------------------------------------------------------------------
  const crackEdges = [], holes = [], stains = [], patchPolys = [];
  const dark = col('#50555d'), bindC = col('#a7a397');
  const fracture = (r, a, b, cellL, { keep = null, kept = null } = {}) => {
    const seeds = [], hw = r.hw, rows = Math.max(2, Math.round(r.w / 1.25)), concrete = r.kind === 'concrete';
    const pins = onSeam(r, a) ? seamSeeds(seamCuts(r), hw) : [], pinOff = cellL * 0.5;   // the first row of slabs lines up with the core's
    for (const t of pins) seeds.push({ s: a + pinOff, t });
    for (let s = a + cellL * 0.5; s < b; s += cellL * rng.range(0.82, 1.2)) for (let j = 0; j < (concrete ? 1 : rows); j++) {
      const q = concrete ? 0 : ((j + 0.5) / rows - 0.5) * r.w * rng.range(0.9, 1.1), ss = s + (concrete ? rng.range(-0.1, 0.1) : rng.range(-0.42, 0.42) * cellL), tt = q + rng.range(-0.22, 0.22);
      if (pins.length && ss < a + pinOff * 2.05) continue;
      seeds.push({ s: ss, t: tt });
    }
    seeds.sort((u, v) => u.s - v.s);
    const clip = (poly, ms, mt, ns, nt) => { const out = []; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length], dp = (p[0] - ms) * ns + (p[1] - mt) * nt, dq = (q[0] - ms) * ns + (q[1] - mt) * nt; if (dp <= 0) out.push(p); if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) { const u = dp / (dp - dq); out.push([p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u]); } } return out; };
    seeds.forEach((u, i) => {
      let poly = [[a, -hw], [b, -hw], [b, hw], [a, hw]];
      for (let j = Math.max(0, i - 16); j < Math.min(seeds.length, i + 17); j++) { if (j === i) continue; const o = seeds[j]; poly = clip(poly, (u.s + o.s) / 2, (u.t + o.t) / 2, o.s - u.s, o.t - u.t); if (poly.length < 3) return; }
      const fine = [];
      for (let k = 0; k < poly.length; k++) { const p = poly[k], q = poly[(k + 1) % poly.length], n = Math.max(1, Math.round(hyp(q[0] - p[0], q[1] - p[1]) / 0.32)); for (let m = 0; m < n; m++) fine.push([lerp(p[0], q[0], m / n), lerp(p[1], q[1], m / n)]); }
      if (Math.abs(area(fine)) < 0.05) return;
      // wobble in (s,t), so neighbouring slabs share it; road edges and the seam stay true
      const pts = fine.map(([s, t]) => {
        const free = Math.abs(t) < hw - 1e-3 && s > a + 1e-3 && s < b - 1e-3;
        const ds = free ? (vn(s * 0.9 + r.L, t * 0.9) - 0.5) * 0.5 + (vn(s * 2.7, t * 2.7 + 9) - 0.5) * 0.18 : 0, dt = free ? (vn(s * 0.9, t * 0.9 + r.L) - 0.5) * 0.5 + (vn(s * 2.7 + 3, t * 2.7) - 0.5) * 0.18 : 0;
        return { s: s + ds, t: Math.max(-hw, Math.min(hw, t + dt)), free };
      });
      if (keep && !keep(u.s, u.t)) return;
      const world = pts.map((q) => r.at(q.s, q.t)), n = world.length;
      if (kept) kept.push(world);
      // a slab's corners on the seam stay on the seam, but take a crack's width along it, so the core's crack doesn't pinch shut there
      const seamV = pts.map((q) => onSeam(r, a) && q.s < a + 1e-3 && Math.abs(q.t) < hw - 1e-3), corner = seamV.map((v, k) => v && (!seamV[(k + 1) % n] || !seamV[(k + n - 1) % n]));
      const [cx, cz] = r.at(u.s, u.t);
      const seamTs = pts.filter((_, k) => seamV[k]).map((q) => seamAlong(r, q.t)), seamMid = seamTs.length ? (Math.min(...seamTs) + Math.max(...seamTs)) / 2 : null;
      const seamHole = seamMid !== null && seam.holes[seamKey(r)].some((q) => seamMid > q[0] && seamMid < q[1]), seamTone = seamMid === null ? null : seam.tones[seamKey(r)].find((q) => seamMid > q[0] && seamMid < q[1])?.[2];
      const root = rootNear(cx, cz), I = Math.exp(-((root.d / 1.5) ** 2)), wild = smooth((vn(cx * 0.31 + 3, cz * 0.31) - 0.42) / 0.3);
      // crack width: hairline on quiet road, wide where the road has heaved
      const widths = pts.map((q, k) => { if (!q.free && !corner[k]) return 0; const w0 = 0.022 + 0.05 * wild + 0.08 * I; return w0 * (0.6 + 0.9 * vn(world[k][0] * 1.7, world[k][1] * 1.7)); });
      const top = polyOrient(world.map((p, k) => { const c = world[(k + 1) % n], o = world[(k + n - 1) % n]; let tx = c[0] - o[0], tz = c[1] - o[1]; const l = hyp(tx, tz) || 1; tx /= l; tz /= l; const q = [p[0] - tz * widths[k], p[1] + tx * widths[k]]; return corner[k] ? (r.id === 'north' ? [q[0], p[1]] : [p[0], q[1]]) : q; }));
      if (Math.abs(area(top)) < 0.04) return;
      for (let k = 0; k < n; k++) { const m = (k + 1) % n; if (Math.max(widths[k], widths[m]) > 0.02 && !(seamV[k] && seamV[m])) crackEdges.push({ a: world[k], c: world[m], w: Math.max(widths[k], widths[m]) }); }
      const missing = seamHole || rng() < 0.03 + 0.2 * I + 0.05 * wild * (concrete ? 0.4 : 1);   // a pothole on the core side of the seam carries on across it
      if (missing) { holes.push(top); triTop(flatS, top, () => -0.016, col(rng.pick([P.mossDeep, '#4f9f58', '#63853f']))); return; }
      // Plane: a slab near a root rears up facing away from it; elsewhere it barely moves.
      const lx = root.x - cx, lz = root.z - cz, l = hyp(lx, lz) || 1;
      let gx = rng.range(-0.012, 0.012) + wild * rng.range(-0.04, 0.04), gz = rng.range(-0.012, 0.012) + wild * rng.range(-0.04, 0.04), h = rng.range(-0.006, 0.01) + wild * 0.02;
      if (I > 0.02) { const tilt = I * rng.range(0.1, 0.26) * (rng() < 0.82 ? 1 : -1); gx += (lx / l) * tilt; gz += (lz / l) * tilt; h += I * rng.range(0.04, 0.16); }
      const yAt0 = (q) => h + gx * (q[0] - cx) + gz * (q[1] - cz);
      let lo = Math.min(...top.map(yAt0)), hi = Math.max(...top.map(yAt0));
      if (lo < -0.018) h += -0.018 - lo;
      hi = Math.max(...top.map(yAt0)); if (hi > 0.42) h -= hi - 0.42;
      const seamK = onSeam(r, a), seamAt = r.id === 'north' ? (q) => Math.abs(q[1] + CH) : (q) => Math.abs(q[0] + CH), yAt = seamK ? (q) => yAt0(q) * smooth(seamAt(q) / 0.45) : yAt0;
      const sun = (gx * 0.42 - gz * 0.42) * 2.6, tone = col('#ffffff').multiplyScalar(seamTone ?? (1 + sun + rng.range(-0.018, 0.018)));   // a slab on the seam takes its neighbour's tone
      triTop(atlasS, top, yAt, tone);
      skirt(flatS, top, yAt, (q) => yAt(q) - 0.045, concrete ? col('#8d8a7f') : dark);
      skirt(flatS, top, (q) => yAt(q) - 0.045, () => -0.1, bindC);
      if (concrete && rng() < 0.3) patchPolys.push(top);
    });
  };
  // subgrade under every paved road
  const subC = col('#6a5a47');
  for (const r of roads) if (r.kind !== 'earth') for (const [a, b] of r.spans) {
    const st = Math.max(2, Math.ceil((b - a) / 1.5)), L = [], Rr = [];
    for (let i = 0; i <= st; i++) { const s = lerp(a, b, i / st); L.push(r.at(s, -r.hw - 0.01)); Rr.push(r.at(s, r.hw + 0.01)); }
    for (let i = 0; i < st; i++) flatS.quad([L[i][0], -0.035, L[i][1]], [L[i + 1][0], -0.035, L[i + 1][1]], [Rr[i + 1][0], -0.035, Rr[i + 1][1]], [Rr[i][0], -0.035, Rr[i][1]], subC, UP);
    if (r.kind === 'asphalt') fracture(r, a, b, 1.75);
    else if (r.kind === 'concrete') fracture(r, a, b, 2.6);
  }

  // ---- shotengai: worn coloured tile, in a pattern people chose once ----------------------------------------------------
  const shotengai = roads[0], tileRow = 8, tileW = shotengai.w / tileRow;
  {
    const cream = ['#ded0ae', '#e3d7b9', '#d5c6a4'], teal = ['#7fa6a5', '#6f9fb0', '#8bb0a8'], red = [P.fadedRed, '#be6450', '#cc7d63'], gold = [P.fadedYellow, '#d9bb62'];
    const grime = col('#8d8a76'), S = rng;
    for (const [a, b] of shotengai.spans) {
      // No apron: the corner's cracked asphalt simply runs on up the street and gives out along a ragged line of slabs, the tiles starting wherever it stops.
      const startAt = (t) => a + 1.3 + 3.4 * vn(t * 0.7 + 13, 7.7);
      const mouthPolys = [];
      fracture(shotengai, a, Math.min(b, a + tileMouth), 1.75, { keep: (s, t) => s < startAt(t), kept: mouthPolys });
      const overMouth = (pts) => mouthPolys.some((p) => pts.some(([x, z]) => pointInPoly(x, z, p)));
      let cols = Math.floor((b - a) / tileW);
      for (let c = 0; c < cols; c++) for (let j = 0; j < tileRow; j++) {
        const s0 = a + c * tileW, s1 = s0 + tileW, t0 = -shotengai.hw + j * tileW, t1 = t0 + tileW, sm = (s0 + s1) / 2, tm = (t0 + t1) / 2;
        const [cx, cz] = shotengai.at(sm, tm), root = rootNear(cx, cz), I = Math.exp(-((root.d / 1.3) ** 2));
        const lost = vn(cx * 0.75 + 41, cz * 0.75 + 17), past = sm - startAt(tm);
        if (s0 < a + tileMouth && overMouth([shotengai.at(s0, t0), shotengai.at(s1, t0), shotengai.at(s1, t1), shotengai.at(s0, t1), [cx, cz]])) continue;
        if (past < 1.9 && S() < 0.55 * (1 - Math.max(0, past) / 1.9)) { const sq = polyOrient([[cx - tileW / 2, cz - tileW / 2], [cx + tileW / 2, cz - tileW / 2], [cx + tileW / 2, cz + tileW / 2], [cx - tileW / 2, cz + tileW / 2]]); holes.push(sq); triTop(flatS, sq, () => -0.016, col(S.pick([P.mossDeep, '#4f9f58', P.moss]))); continue; }
        if (lost > 0.73 - I * 0.1 || (I > 0.5 && S() < 0.35)) { holes.push(polyOrient([[cx - tileW / 2, cz - tileW / 2], [cx + tileW / 2, cz - tileW / 2], [cx + tileW / 2, cz + tileW / 2], [cx - tileW / 2, cz + tileW / 2]])); continue; }
        // border rows in red, a repeating lozenge of teal and gold down the middle, cream field
        const mid = Math.abs(j - (tileRow - 1) / 2), u = ((c % 10) + 10) % 10, lozenge = mid + Math.abs(u - 4.5) * 0.9 < 3.1;
        const pal = j === 0 || j === tileRow - 1 ? red : lozenge ? ((u + j) % 2 ? teal : gold) : cream;
        const k = col(S.pick(pal)).lerp(grime, S.range(0, 0.2) + 0.32 * smooth((lost - 0.45) / 0.3));
        const tilt = I * S.range(0.05, 0.14), lx = root.x - cx, lz = root.z - cz, ll = hyp(lx, lz) || 1, base = S.range(0.0, 0.028) + I * S.range(0.03, 0.14) + 0.03 * smooth((lost - 0.55) / 0.15);
        const gapT = 0.016, q = [shotengai.at(s0 + gapT, t0 + gapT), shotengai.at(s1 - gapT, t0 + gapT), shotengai.at(s1 - gapT, t1 - gapT), shotengai.at(s0 + gapT, t1 - gapT)];
        const yAt = (p) => base + ((p[0] - cx) * lx + (p[1] - cz) * lz) * (tilt / ll);
        stone(tileS, q, yAt, -0.08, 0.016, k);
        if (lost > 0.6) crackEdges.push({ a: q[0], c: q[1], w: 0.04 });
      }
    }
  }

  // ---- kerbs and sidewalks, on the walk widths of the layout --------------------------------------------------------------
  const stoneTones = ['#ffffff', '#f4f3ec', '#fbf9f0', '#ebebe4', '#fffcf0'], curbH = 0.145, cw = 0.17;
  const paveHoles = [], joints = [];
  const onOtherRoad = (r, x, z) => roads.some((o) => o !== r && roadDist(x, z, o.def) < 0.05);
  for (const r of roads) {
    if (!(r.walkP || r.walkM)) continue;
    for (const [a, b] of r.spans) for (const side of [1, -1]) {
      const walk = side > 0 ? r.walkP : r.walkM; if (!walk) continue;
      // kerb
      for (let s = a; s < b;) {
        const l = rng.range(0.82, 1.02), e = Math.min(b, s + l), m = (s + e) / 2, [cx, cz] = r.at(m, side * (r.hw + cw / 2)), root = rootNear(cx, cz), I = Math.exp(-((root.d / 0.9) ** 2));
        const s0 = s; s = e + 0.04;
        if (e - s0 < 0.2 || (I > 0.55 && rng() < 0.6) || vn(cx * 0.9 + 77, cz * 0.9) > 0.8 || onOtherRoad(r, cx, cz)) continue;
        const shove = 0.01 + I * 0.06, q = [r.at(s0, side * (r.hw - shove)), r.at(e, side * (r.hw - shove)), r.at(e, side * (r.hw + cw - shove)), r.at(s0, side * (r.hw + cw - shove))];
        const tx = rng.range(-0.014, 0.014), lf = I * rng.range(0.03, 0.14);
        stone(stoneS, q, (p) => curbH + lf + tx * (p[0] - cx), -0.06, 0.022, col(rng.pick(['#ffffff', '#f8f6ee', '#fffdf4', '#efeee6'])));
      }
      // pavers: two courses, staggered, as on the arms inside the corner
      const rows = 2, ds = 0.46, t0 = r.hw + cw, t1 = r.hw + walk;
      for (let row = 0; row < rows; row++) {
        const v0 = lerp(t0, t1, row / rows), v1 = lerp(t0, t1, (row + 1) / rows);
        for (let i = -(row % 2); ; i += 2) {
          const s0 = Math.max(a, a + i * ds), s1 = a + (i + 2) * ds; if (s0 >= b - 0.1) break;
          const e = Math.min(b, s1), [cx, cz] = r.at((s0 + e) / 2, side * (v0 + v1) / 2), root = rootNear(cx, cz), I = Math.exp(-((root.d / 1.0) ** 2));
          if (onOtherRoad(r, cx, cz)) continue;
          const lost = vn(cx * 1.1 + 71, cz * 1.1 + 9);
          const q = [r.at(s0 + 0.018, side * (v0 + 0.016)), r.at(e - 0.018, side * (v0 + 0.016)), r.at(e - 0.018, side * (v1 - 0.016)), r.at(s0 + 0.018, side * (v1 - 0.016))];
          if (lost > 0.7 - I * 0.08 || rng() < 0.05) { paveHoles.push(q); continue; }
          joints.push(q[0]);
          const nearSeam = onSeam(r, a) && s0 - a < 0.93, tx = nearSeam ? 0 : rng.range(-0.05, 0.05) * (0.3 + I * 2.2), tz = nearSeam ? 0 : rng.range(-0.05, 0.05) * (0.3 + I * 2.2), base = nearSeam ? G.sidewalkY - 0.02 : G.sidewalkY + rng.range(-0.05, 0.004) + I * rng.range(0.02, 0.14);
          const tint = rng() < 0.1 ? '#dcece4' : rng() < 0.07 ? '#f0d9cc' : rng.pick(stoneTones);
          const ySeam = nearSeam && seam.pavers ? seam.pavers[seamKey(r)].find((p) => { const al = seamAlong(r, (side * (v0 + v1)) / 2); return al > p.a - 0.05 && al < p.b + 0.05; })?.y : undefined;
          const seamOff = r.id === 'north' ? (p) => Math.abs(p[1] + CH) : (p) => Math.abs(p[0] + CH);   // a paver on the seam starts at the height of the one across it
          stone(stoneS, q, ySeam === undefined ? (p) => base + tx * (p[0] - cx) + tz * (p[1] - cz) : (p) => lerp(ySeam, base, smooth(seamOff(p) / 0.6)), -0.03, 0.014, col(tint));
        }
      }
    }
  }

  // ---- roots on the surface ---------------------------------------------------------------------------------------------
  for (const l of rootLines) {
    const pts = l.pts.filter((_, i) => i % 2 === 0 || i === l.pts.length - 1).map(([x, z], i, a) => [x, i === 0 || i === a.length - 1 ? -0.14 : lerp(0.15, 0.08, smooth((i / (a.length - 1) - 0.7) / 0.3)), z]);
    if (pts.length < 3) continue;
    rootB.add(kit.tube(pts, l.r, l.r * 0.34, 6, Math.min(36, pts.length * 3)), 'flat', { color: rootR.pick(['#9a7a5c', '#8a6b50', '#a1835f']) });
    for (let i = 2; i < pts.length - 1; i += 3) { // side roots, feeling for the cracks
      const q = pts[i], sgn = rootR.sign(), a = rootR.range(0.7, 1.3) * sgn, d0 = pts[i + 1], base = Math.atan2(d0[2] - q[2], d0[0] - q[0]) + a, L = rootR.range(0.6, 1.4);
      rootB.add(kit.tube([q, [q[0] + Math.cos(base) * L * 0.5, 0.07, q[2] + Math.sin(base) * L * 0.5], [q[0] + Math.cos(base + 0.5) * L, 0.0, q[2] + Math.sin(base + 0.5) * L]], l.r * 0.42, l.r * 0.12, 5, 8), 'flat', { color: '#8a6b50' });
    }
  }

  // ---- packed earth lanes: a few old concrete patches and stones ---------------------------------------------------------
  {
    const R = ctx.seeded('outskirts-lanes');
    for (const r of roads) {
      if (r.kind !== 'earth') continue;
      for (const [a, b] of r.spans) {
        for (let s = a + R.range(2, 6); s < b - 1;) {
          const l = R.range(1.1, 2.6), [t0, t1] = R() < 0.5 ? [-r.hw, R.range(-0.4, 0.2)] : [R.range(-0.2, 0.4), r.hw], e = Math.min(b, s + l), m = (s + e) / 2;
          const q = kit.jag([r.at(s, t0), r.at(e, t0), r.at(e, t1), r.at(s, t1)], 0.5, 0.14, R);
          const [cx, cz] = r.at(m, (t0 + t1) / 2), h = R.range(0.075, 0.1), gx = R.range(-0.03, 0.03), gz = R.range(-0.03, 0.03);
          stone(stoneS, q, (p) => h + gx * (p[0] - cx) + gz * (p[1] - cz), -0.02, 0.02, col(R.pick(['#d7d3c4', '#c9c6b8', '#dfdccf'])));
          s += l + R.range(3, 9);
        }
      }
    }
  }

  // ---- masks: 10 per unit over ±41, so ±20 and ±40 fall on pixel edges -----------------------------------------------------
  const MK = 10, MO = 41, MS = (2 * MO * MK);
  const m2p = (v) => (v + MO) * MK;
  const maskCanvas = () => { const c = document.createElement('canvas'); c.width = c.height = MS; const g = c.getContext('2d', { willReadFrequently: true }); g.fillStyle = '#000'; g.fillRect(0, 0, MS, MS); g.lineJoin = 'round'; return g; };
  const trace = (g, pts) => { g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(m2p(x), m2p(z)) : g.moveTo(m2p(x), m2p(z)))); g.closePath(); };
  const outline = []; for (let i = 0; i < edge.N; i++) outline.push(edge.point(i * edge.STEP));
  const roadPoly = (r, a, b, t0, t1) => { const st = Math.max(2, Math.ceil((b - a) / 1.2)), L = [], R = []; for (let i = 0; i <= st; i++) { const s = lerp(a, b, i / st); L.push(r.at(s, t0)); R.push(r.at(s, t1)); } return [...L, ...R.reverse()]; };
  const riverRing = () => riverPoly;
  // soil: inside the outline, outside the core, the canal and the road cuts
  const cut = maskCanvas();
  cut.fillStyle = '#fff'; trace(cut, outline); cut.fill();
  cut.fillStyle = '#000'; cut.fillRect(m2p(-CH), m2p(-CH), CH * 2 * MK, CH * 2 * MK);
  trace(cut, riverRing()); cut.fill();
  cut.fillRect(m2p(RIVER.outfall.x[0]), m2p(H - 0.7), (RIVER.outfall.x[1] - RIVER.outfall.x[0]) * MK, (MO - H + 0.7) * MK);   // the canal leaves the plinth here: no plate, no skirt, right across the mouth
  for (const r of roads) if (r.kind !== 'earth') for (const [a, b] of r.spans) { trace(cut, roadPoly(r, a, b, -r.hw, r.hw)); cut.fill(); }
  const cutD = cut.getImageData(0, 0, MS, MS).data;
  // free ground: keep-out mask for everything grown on the ring
  const keep = maskCanvas();
  keep.fillStyle = '#fff'; trace(keep, outline.map(([x, z]) => [x * 0.993, z * 0.993])); keep.fill();
  keep.fillStyle = '#000'; keep.fillRect(m2p(-CH + 0.02), m2p(-CH + 0.02), (CH - 0.02) * 2 * MK, (CH - 0.02) * 2 * MK);
  const padRect = (r, p) => keep.fillRect(m2p(r.x[0] - p), m2p(r.z[0] - p), (r.x[1] - r.x[0] + 2 * p) * MK, (r.z[1] - r.z[0] + 2 * p) * MK);
  trace(keep, riverRing()); keep.fill(); keep.lineWidth = 0.5 * MK; keep.strokeStyle = '#000'; keep.stroke();
  padRect(RAIL.bed, 0.08);
  padRect({ x: [TORII.stair.x[0], TORII.stair.x[1] + 0.85], z: TORII.stair.z }, 0.24);   // the shrine stair and the landing at its foot
  for (const b of BUILDINGS) padRect(buildingBox(b, 0.2), 0);
  for (const z of Object.values(RING_ZONES)) padRect(z, 0.05);
  for (const t of WOODS) { keep.beginPath(); keep.arc(m2p(t.x), m2p(t.z), (t.trunkR + 0.35) * MK, 0, TAU); keep.fill(); }
  for (const r of roads) { const wP = r.walkP ? r.hw + r.walkP : r.hw, wM = r.walkM ? r.hw + r.walkM : r.hw; for (const [a, b] of r.spans) { trace(keep, roadPoly(r, a, b, -wM - 0.02, wP + 0.02)); keep.fill(); } }
  const keepD = keep.getImageData(0, 0, MS, MS).data;
  const free = (x, z) => { const i = Math.round(m2p(x) - 0.5), j = Math.round(m2p(z) - 0.5); return i >= 0 && j >= 0 && i < MS && j < MS && keepD[(j * MS + i) * 4] > 200; };

  // ---- the soil plate: contour the mask -------------------------------------------------------------------------------
  {
    const W = MS, V = new Float32Array(W * W); for (let i = 0; i < V.length; i++) V[i] = cutD[i * 4];
    const iso = 127.5, keyH = (i, j) => (j * W + i) * 2, keyV = (i, j) => (j * W + i) * 2 + 1;
    const interp = (a, b) => (iso - a) / (b - a);
    const pos = (k) => { const v = k % 2, id = (k - v) / 2, i = id % W, j = (id - i) / W; return v ? [i + 0.5, j + 0.5 + interp(V[j * W + i], V[(j + 1) * W + i])] : [i + 0.5 + interp(V[j * W + i], V[j * W + i + 1]), j + 0.5]; };
    const TABLE = [[], [[0, 3]], [[1, 0]], [[1, 3]], [[2, 1]], [[0, 3], [2, 1]], [[2, 0]], [[2, 3]], [[3, 2]], [[0, 2]], [[1, 0], [3, 2]], [[1, 2]], [[3, 1]], [[0, 1]], [[3, 0]], []];
    const next = new Map(), edgeK = (i, j, e) => (e === 0 ? keyH(i, j) : e === 1 ? keyV(i + 1, j) : e === 2 ? keyH(i, j + 1) : keyV(i, j));
    for (let j = 0; j < W - 1; j++) for (let i = 0; i < W - 1; i++) {
      const v0 = V[j * W + i] > iso ? 1 : 0, v1 = V[j * W + i + 1] > iso ? 2 : 0, v2 = V[(j + 1) * W + i + 1] > iso ? 4 : 0, v3 = V[(j + 1) * W + i] > iso ? 8 : 0, c = v0 | v1 | v2 | v3;
      if (!c || c === 15) continue;
      for (const [a, b] of TABLE[c]) next.set(edgeK(i, j, a), edgeK(i, j, b));
    }
    const loops = [];
    while (next.size) {
      const start = next.keys().next().value, l = []; let k = start, guard = 0;
      do { l.push(pos(k)); const n = next.get(k); next.delete(k); k = n; } while (k !== undefined && k !== start && guard++ < 2e6);
      if (l.length > 8) loops.push(l.map(([x, z]) => [x / MK - MO, z / MK - MO]));
    }
    // Douglas-Peucker, closed
    const simp = (l, tol) => {
      const far = (a) => { let d = -1, id = 0; for (let i = 0; i < l.length; i++) { const q = hyp(l[i][0] - a[0], l[i][1] - a[1]); if (q > d) { d = q; id = i; } } return id; };
      const i0 = far(l[0]), i1 = far(l[i0]), [a, b] = i0 < i1 ? [i0, i1] : [i1, i0];
      const dp = (pts) => { const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1; const st = [[0, pts.length - 1]]; while (st.length) { const [lo, hi] = st.pop(); let md = 0, mi = -1; for (let i = lo + 1; i < hi; i++) { const q = segDist(pts[i][0], pts[i][1], pts[lo], pts[hi]).d; if (q > md) { md = q; mi = i; } } if (md > tol) { keep[mi] = 1; st.push([lo, mi], [mi, hi]); } } return pts.filter((_, i) => keep[i]); };
      const x = dp(l.slice(a, b + 1)), y = dp([...l.slice(b), ...l.slice(0, a + 1)]);
      return [...x.slice(0, -1), ...y.slice(0, -1)];
    };
    const outers = [], inners = [];
    for (const l of loops) { const s = simp(l, 0.016); (area(s) > 0 ? outers : inners).push(s); }
    const soilY = G.soilY, sideC = col('#ffffff');
    for (const o of outers) {
      const hs = inners.filter((h) => pointInPoly(h[0][0], h[0][1], o));
      const v = o.map((q) => new THREE.Vector2(q[0], q[1])), holesV = hs.map((h) => h.map((q) => new THREE.Vector2(q[0], q[1]))), all = [...o, ...hs.flat()];
      for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(v, holesV)) atlasS.tri([all[a][0], soilY, all[a][1]], [all[b][0], soilY, all[b][1]], [all[c][0], soilY, all[c][1]], WHITE, UP);
      for (const loop of [o, ...hs]) {
        const n = loop.length; for (let i = 0; i < n; i++) { const a = loop[i], b = loop[(i + 1) % n], out = [-(b[1] - a[1]), b[0] - a[0]]; atlasS.quad([a[0], soilY, a[1]], [b[0], soilY, b[1]], [b[0], -1.35, b[1]], [a[0], -1.35, a[1]], sideC, [-out[0], 0, -out[1]]); }
      }
    }
  }

  // ---- atlas -------------------------------------------------------------------------------------------------------------
  const AS = 4096, AK = AS / (2 * MO), a2p = (v) => (v + MO) * AK;
  const FN = 1024, FK = FN / (2 * MO), F1 = new Float32Array((FN + 1) * (FN + 1)), F2 = new Float32Array(F1.length);
  // bareness: buildings' yards and the zones others build on are worn earth, fading out into the turf
  const BN = 256, BK = BN / (2 * MO);
  const bareG = (() => { const c = document.createElement('canvas'); c.width = c.height = BN + 1; const g = c.getContext('2d', { willReadFrequently: true }); g.fillStyle = '#000'; g.fillRect(0, 0, BN + 1, BN + 1); g.fillStyle = '#fff'; g.filter = `blur(${0.55 * BK}px)`; const f2p = (v) => (v + MO) * BK;
    for (const b of BUILDINGS) { const r = buildingBox(b, 0.45); g.fillRect(f2p(r.x[0]), f2p(r.z[0]), (r.x[1] - r.x[0]) * BK, (r.z[1] - r.z[0]) * BK); }
    for (const z of Object.values(RING_ZONES)) g.fillRect(f2p(z.x[0]), f2p(z.z[0]), (z.x[1] - z.x[0]) * BK, (z.z[1] - z.z[0]) * BK);
    g.strokeStyle = '#fff'; g.lineCap = 'round';
    for (const r of roads) if (r.walkP || r.walkM) { g.lineWidth = (r.w + (r.walkP + r.walkM) + 1.2) * BK; g.beginPath(); r.def.pts.forEach(([x, z], i) => (i ? g.lineTo(f2p(x), f2p(z)) : g.moveTo(f2p(x), f2p(z)))); g.stroke(); }
    const d = g.getImageData(0, 0, BN + 1, BN + 1).data, a = new Float32Array((BN + 1) * (BN + 1)); for (let i = 0; i < a.length; i++) a[i] = d[i * 4] / 255; return a; })();
  const bareAt = (x, z) => { const u = (x + MO) * BK, v = (z + MO) * BK, i = Math.min(BN - 1, u | 0), j = Math.min(BN - 1, v | 0), fu = u - i, fv = v - j, a = (BN + 1) * j + i, b = a + BN + 1; return (bareG[a] * (1 - fu) + bareG[a + 1] * fu) * (1 - fv) + (bareG[b] * (1 - fu) + bareG[b + 1] * fu) * fv; };
  for (let j = 0, q = 0; j <= FN; j++) {
    const z = j / FK - MO;
    for (let i = 0; i <= FN; i++, q++) {
      const x = i / FK - MO, m = Math.max(Math.abs(x), Math.abs(z)), r = m < CH - 1 ? 0 : bareAt(x, z);
      F1[q] = m < CH - 1 ? 0 : turf(x, z) + 0.05 + 0.05 + 0.1 * smooth((m - CH) / 5) * (vn(x * 0.13 + 2, z * 0.13 + 8) - 0.42) * 3 - r * 0.42;
      F2[q] = vn(x * 3.4, z * 3.4 + 20);
    }
  }
  const hex = (h) => { const c = parseInt(h.slice(1), 16); return 0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | (c >> 16); };
  const CS0 = hex('#927c64'), CS1 = hex('#826e5a'), CGD = hex('#3f9458'), CGM = hex('#63b24f'), CGL = hex(P.grass), CGS = hex(P.grassLit);
  const atlas = ctx.canvasTexture(AS, AS, (g) => {
    // Turf: the same bands as ground.js, off the lattice, a cell of it at a time.
    const img = g.createImageData(AS, AS), d = new Uint32Array(img.data.buffer), cell = AS / FN;
    for (let y = 0; y < AS; y++) {
      const fy = y / cell, j = Math.min(FN - 1, Math.floor(fy)), v = fy - j, a = j * (FN + 1), b = a + FN + 1;
      const py = y * AS;
      for (let i = 0; i < FN; i++) {
        const L1 = F1[a + i] + (F1[b + i] - F1[a + i]) * v, R1 = F1[a + i + 1] + (F1[b + i + 1] - F1[a + i + 1]) * v, L2 = F2[a + i] + (F2[b + i] - F2[a + i]) * v, R2 = F2[a + i + 1] + (F2[b + i + 1] - F2[a + i + 1]) * v;
        const x0 = Math.round(i * cell), x1 = Math.round((i + 1) * cell), n = x1 - x0;
        for (let x = x0; x < x1; x++) {
          const u = (x - x0) / n, t = L1 + (R1 - L1) * u;
          d[py + x] = t < 0.4 ? (L2 + (R2 - L2) * u > 0.5 ? CS0 : CS1) : t < 0.46 ? CGD : t < 0.56 ? CGM : t < 0.72 ? CGL : CGS;
        }
      }
    }
    g.putImageData(img, 0, 0);
    const R = ctx.seeded('outskirts-atlas');
    const pth = (pts) => { g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(a2p(x), a2p(z)) : g.moveTo(a2p(x), a2p(z)))); g.closePath(); };
    const line = (pts) => { g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(a2p(x), a2p(z)) : g.moveTo(a2p(x), a2p(z)))); };
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.fillStyle = '#8f7a61'; g.fillRect(a2p(-5), a2p(-5), AK * 10, AK * 10);                 // swatch for vertical plate faces, in the unused middle
    // plain pads under buildings and flat earth for the zones
    const zoneC = { shrineHill: '#90846d', paddies: '#8d7f62', kitchenFields: '#8a7358', orchard: '#7f8a55', schoolYard: '#c2ab82', pool: '#b5b0a0', bamboo: '#7a6a54', scrub: '#857a5e' };
    const raggedRect = (r, pad) => kit.jag([[r.x[0] - pad, r.z[0] - pad], [r.x[1] + pad, r.z[0] - pad], [r.x[1] + pad, r.z[1] + pad], [r.x[0] - pad, r.z[1] + pad]], 0.8, 0.24, R);
    for (const [k, z] of Object.entries(RING_ZONES)) { pth(raggedRect(z, 0.05)); g.fillStyle = zoneC[k]; g.fill(); }
    for (const b of BUILDINGS) { pth(raggedRect(buildingBox(b, 0.3), 0)); g.fillStyle = R.pick(['#9a8870', '#8f7d66', '#a3917a']); g.fill(); }
    // rail bed, continuing ground.js's flat finish
    g.fillStyle = '#77736a'; g.fillRect(a2p(RAIL.bed.x[0] - 0.1), a2p(-MO), AK * (RAIL.bed.x[1] - RAIL.bed.x[0] + 0.2), AS);
    // sidewalk beds under the pavers
    const walkBed = '#7d7a68';
    for (const r of roads) for (const [a, b] of r.spans) { for (const [wa, wb] of [[r.hw, r.hw + r.walkP], [-r.hw - r.walkM, -r.hw]]) if (wb - wa > 0.1) { pth(roadPoly(r, a, b, wa, wb)); g.fillStyle = walkBed; g.fill(); } }
    // packed earth lanes, a grass stripe down the crown
    for (const r of roads) {
      if (r.kind !== 'earth') continue;
      for (const [a, b] of r.spans) {
        pth(roadPoly(r, a, b, -r.hw, r.hw)); g.fillStyle = '#a48d72'; g.fill();
        g.save(); pth(roadPoly(r, a, b, -r.hw, r.hw)); g.clip();
        for (let i = 0; i < r.L * 0.9; i++) { const [x, z] = r.at(R.range(a, b), R.range(-r.hw, r.hw)), rr = R.range(0.5, 1.5), o = kit.jag(kit.circlePts(x, z, rr, 9, R, rr * 0.4), 0.5, 0.2, R); pth(o); g.fillStyle = R.pick(['#957e65', '#b39c80', '#8c7a60']); g.fill(); }
        g.restore();
        g.strokeStyle = '#5c9a4f'; g.lineWidth = AK * 0.34; g.setLineDash([AK * 1.6, AK * 0.9]);
        const c = []; for (let s = a; s <= b; s += 0.5) c.push(r.at(s, R.range(-0.08, 0.08))); line(c); g.stroke(); g.setLineDash([]);
        g.strokeStyle = '#7f6c54'; g.lineWidth = AK * 0.2;
        for (const off of [-0.66, 0.66]) { const q = []; for (let s = a; s <= b; s += 0.6) q.push(r.at(s, off + R.range(-0.05, 0.05))); line(q); g.stroke(); }
      }
    }
    // asphalt and concrete
    /** ground.js's asphalt, carried past the seam with its own noise and thresholds: same tones, same moss along the kerbs and along cracks that run across, ending raggedly. */
    const seamPaint = (r, a, L) => {
      const [p0, p1] = r.def.pts, len = hyp(p1[0] - p0[0], p1[1] - p0[1]), dx = (p1[0] - p0[0]) / len, dz = (p1[1] - p0[1]) / len, nx = -dz, nz = dx;
      const hex3 = (c) => { const v = new THREE.Color(c); return [v.r, v.g, v.b].map((q) => { const k = new THREE.Color(q, q, q).convertLinearToSRGB().r; return Math.round(k * 255); }); };
      const Ca = ['#868b92', '#8d9197', '#7c8189'].map(hex3), mD = hex3(P.mossDeep), mM = hex3(P.moss), mL = hex3(P.mossLit);
      const erf = (x) => { const s = Math.sign(x); x = Math.abs(x); return s * (1 - 1 / (1 + (0.278393 + (0.230389 + (0.000972 + 0.078108 * x) * x) * x) * x) ** 4); };
      const blurBox = (d, hw, s) => 0.5 * (erf((d + hw) / (s * Math.SQRT2)) - erf((d - hw) / (s * Math.SQRT2)));
      // the cracks that reached the seam keep going, wandering, and fade out
      const tails = (seam.ends || []).filter((e) => (r.id === 'north' ? e.z < -CH + 1 && e.x > 0 : e.x < -CH + 1)).map((e, ei) => {
        const RT = ctx.seeded('seam-tail' + r.id + ei), lim = [p0[r.id === 'north' ? 0 : 1] - r.hw + 0.45, p0[r.id === 'north' ? 0 : 1] + r.hw - 0.45];
        let x = e.x, z = e.z, l0 = hyp(e.dx, e.dz) || 1, ux = e.dx / l0, uz = e.dz / l0; if (ux * dx + uz * dz < 0) { ux = -ux; uz = -uz; }
        const pts = [[x, z]], n = Math.round(RT.range(5, 8));
        for (let i = 0; i < n; i++) { const a2 = RT.range(-0.65, 0.65), ca = Math.cos(a2), sa = Math.sin(a2), vx = ux * ca - uz * sa, vz = ux * sa + uz * ca, ll = hyp(vx, vz); ux = vx / ll; uz = vz / ll; if (ux * dx + uz * dz < 0.3) { ux += dx; uz += dz; const q = hyp(ux, uz); ux /= q; uz /= q; } x += ux * 0.9; z += uz * 0.9; if (r.id === 'north') x = Math.max(lim[0], Math.min(lim[1], x)); else z = Math.max(lim[0], Math.min(lim[1], z)); pts.push([x, z]); }
        return pts;
      });
      const crossBand = (x, z) => { let v = 0; for (const pts of tails) { let d = 1e9, u = 0, acc = 0; const tot = pts.slice(1).reduce((s, q, i) => s + hyp(q[0] - pts[i][0], q[1] - pts[i][1]), 0); for (let i = 0; i + 1 < pts.length; i++) { const c = segDist(x, z, pts[i], pts[i + 1]), sl = hyp(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); if (c.d < d) { d = c.d; u = (acc + hyp(c.x - pts[i][0], c.z - pts[i][1])) / tot; } acc += sl; } v = Math.max(v, blurBox(d, 0.17, 0.188) * (1 - smooth((u - 0.55) / 0.45) * 1.1)); } return Math.max(0, v); };
      const c0 = r.at(a, -r.hw), c1 = r.at(a + L, r.hw), xs = [c0[0], c1[0]], zs = [c0[1], c1[1]], X0p = Math.floor(a2p(Math.min(...xs))) - 1, Y0p = Math.floor(a2p(Math.min(...zs))) - 1, Wp = Math.ceil(a2p(Math.max(...xs))) - X0p + 2, Hp = Math.ceil(a2p(Math.max(...zs))) - Y0p + 2;
      const im = g.getImageData(X0p, Y0p, Wp, Hp), d = im.data;
      for (let y = 0; y < Hp; y++) for (let x = 0; x < Wp; x++) {
        const wx = (x + X0p + 0.5) / AK - MO, wz = (y + Y0p + 0.5) / AK - MO, ox = wx - p0[0], oz = wz - p0[1], s = ox * dx + oz * dz - a, t = ox * nx + oz * nz;
        if (s < -0.1 || s > L || Math.abs(t) > r.hw + 0.02) continue;
        if (r.id === 'north' && s / L + (vn(wx * 0.7 + 5, wz * 0.7 + 13) - 0.5) * 0.7 > 1) continue;   // an irregular edge where this paint gives way to the road's own
        const nA = 0.7 * vn(wx * 0.33, wz * 0.33 + 40) + 0.3 * vn(wx * 1.1 + 7, wz * 1.1), nM = 0.6 * vn(wx * 1.7 + 3, wz * 1.7) + 0.4 * vn(wx * 5.1, wz * 5.1 + 3);
        const edgeBand = blurBox(r.hw - Math.abs(t), 0.18, 0.105), mossy = crossBand(wx, wz) * 1.7 + edgeBand * 0.86 + (nM - 0.5) * 0.95 + 0.13;
        const c = mossy > 0.84 ? mL : mossy > 0.64 ? mM : mossy > 0.5 ? mD : nA > 0.58 ? Ca[1] : nA < 0.43 ? Ca[2] : Ca[0];
        const k = (y * Wp + x) * 4; d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255;
      }
      g.putImageData(im, X0p, Y0p);
    };
    for (const r of roads) {
      if (r.kind === 'earth') continue;
      const concrete = r.kind === 'concrete', bases = concrete ? ['#c9c6b9', '#bfbcaf', '#d2cfc2'] : ['#868b92', '#8d9197', '#7c8189'], tile = r.kind === 'tile';
      for (const [a, b0] of r.spans) {
        const b = tile ? Math.min(b0, a + tileMouth) : b0;   // of the shotengai only the asphalt at its mouth samples the atlas
        const shape = roadPoly(r, a, b, -r.hw, r.hw);
        pth(shape); g.fillStyle = bases[0]; g.fill();
        if (onSeam(r, a)) { const [x0, z0] = r.at(0, 0), [x1, z1] = r.at(1, 0), ox = (x0 - x1) * 0.4, oz = (z0 - z1) * 0.4, p = r.at(0, -r.hw - 0.3), q = r.at(0, r.hw + 0.3); pth([p, q, [q[0] + ox, q[1] + oz], [p[0] + ox, p[1] + oz]]); g.fill(); }   // past the seam, so the atlas filter never reaches turf at the slab edge
        g.save(); pth(shape); g.clip();
        for (let i = 0; i < (b - a) * 1.1; i++) { const [x, z] = r.at(R.range(a, b), R.range(-r.hw, r.hw)), rr = R.range(0.5, 1.7), o = kit.jag(kit.circlePts(x, z, rr, 9, R, rr * 0.45), 0.5, 0.2, R); pth(o); g.fillStyle = R.pick(bases); g.fill(); }
        for (let i = 0; i < (b - a) * 0.09; i++) { const [x, z] = r.at(R.range(a, b), R.range(-r.hw, r.hw)), rr = R.range(0.6, 1.8), o = kit.jag(kit.circlePts(x, z, rr, 10, R, rr * 0.4), 0.5, 0.2, R); pth(o); g.fillStyle = concrete ? '#9fa39d' : '#5e6b73'; g.fill(); } // old damp patches
        // mossy road edges, broken
        for (const side of [-1, 1]) for (let s = a; s < b;) { const l = R.range(0.8, 3.2), e = Math.min(b, s + l); if (R() < 0.62) { const q = [r.at(s, side * r.hw), r.at(e, side * r.hw), r.at(e, side * (r.hw - R.range(0.1, 0.42))), r.at(s, side * (r.hw - R.range(0.1, 0.42)))]; pth(q); g.fillStyle = R.pick([P.mossDeep, P.moss, '#4f9f58']); g.fill(); } s = e + R.range(0.1, 1.4); }
        g.restore();
        if (onSeam(r, a)) seamPaint(r, a, tile ? b - a : 8.5);
        if (concrete) continue;
        // faded paint: centre line and edge lines in broken lengths
        const paint = (off, wid, color, dash, gap) => {
          g.strokeStyle = color; g.lineWidth = AK * wid; g.lineCap = 'butt';
          for (let s = a + 0.05; s < b;) { const l = R.range(dash[0], dash[1]), e = Math.min(b, s + l); if (R() > 0.2) { const [x0, z0] = r.at(s, off), [x1, z1] = r.at(e, off); const n = vn(x0 * 0.5, z0 * 0.5); if (n > 0.26) { g.globalAlpha = R.range(0.55, 0.9); line([[x0, z0], [x1, z1]]); g.stroke(); } } s = e + (gap || R.range(0.1, 0.7)); }
          g.globalAlpha = 1; g.lineCap = 'round';
        };
        if (r.id === 'north' || tile) { paint(0, 0.13, '#e6c462', [0.9, 2.8]); paint(r.hw - 0.3, 0.09, '#f3edd9', [0.8, 2.6]); paint(-r.hw + 0.3, 0.09, '#f3edd9', [0.8, 2.6]); }
        else { paint(0, 0.1, '#ece6d2', [1.1, 1.3], 1.5); paint(r.hw - 0.22, 0.07, '#ece6d2', [0.6, 2], null); paint(-r.hw + 0.22, 0.07, '#ece6d2', [0.6, 2], null); }
      }
    }
    // north road: a zebra either side of the crossing with ringN, and a legend out on the straight
    {
      const n = roads[1]; const cross = -layout.RING_ROADS[1].pts[0][1]; void cross;
      let sN = n.spans[0]?.[0] ?? 0;
      for (let s = 0; s < n.L; s += 0.1) { const [, z] = n.at(s, 0); if (z < -29.7) { sN = s; break; } }
      g.fillStyle = '#f1ead6'; g.globalAlpha = 0.72;
      for (const dir of [-1, 1]) for (let t = -n.hw + 0.3; t < n.hw - 0.3; t += 0.74) { const q = [n.at(sN + dir * 2.3, t), n.at(sN + dir * 3.6, t), n.at(sN + dir * 3.6, t + 0.4), n.at(sN + dir * 2.3, t + 0.4)]; if (R() > 0.25) { pth(q); g.fill(); } }
      g.globalAlpha = 0.8;
      for (const [t, text, s] of [[-1.15, '徐行', 8.8], [1.15, '通学路', 15.0]]) {
        const [x, z] = n.at(s, t);
        g.save(); g.translate(a2p(x), a2p(z)); g.rotate(Math.PI); g.scale(1, 1.75); g.fillStyle = '#f3edd9';
        g.font = `900 ${AK * 0.62}px "Hiragino Sans","Noto Sans CJK JP","Yu Gothic",sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 0, 0); g.restore();
      }
      g.globalAlpha = 1;
    }
    // concrete patches on the alley
    for (const p of patchPolys) { const [cx, cz] = [p.reduce((a, q) => a + q[0], 0) / p.length, p.reduce((a, q) => a + q[1], 0) / p.length]; const d = 0.5; pth(p.map(([x, z]) => [lerp(x, cx, d), lerp(z, cz, d)])); g.fillStyle = R.pick(['#a6a79d', '#d9d5c6', '#b5b2a4']); g.fill(); }
    // grass and moss in the cracks, in close tones
    {
      const inks = [P.mossDeep, P.moss, '#4f9f58'], paths = inks.map(() => [new Path2D(), new Path2D(), new Path2D()]), wClass = [0.09, 0.14, 0.22];
      for (const e of crackEdges) { if (e.w < 0.03) continue; const p = paths[Math.floor(R() * inks.length)][e.w > 0.075 ? 2 : e.w > 0.05 ? 1 : 0]; p.moveTo(a2p(e.a[0]), a2p(e.a[1])); p.lineTo(a2p(e.c[0]), a2p(e.c[1])); }
      inks.forEach((ink, i) => wClass.forEach((w, k) => { g.strokeStyle = ink; g.lineWidth = AK * w; g.stroke(paths[i][k]); }));
    }
  }, { repeat: false });
  const atlasMat = ctx.toon({ map: atlas, vertexColors: true });
  const atlasUV = (geo) => {
    const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) { const up = n.getY(i) > 0.4, x = up ? p.getX(i) : 0, z = up ? p.getZ(i) : 0; uv.setXY(i, a2p(x) / AS, 1 - a2p(z) / AS); }
    return geo;
  };

  // ---- static meshes ----------------------------------------------------------------------------------------------------
  const flatMat = ctx.surface('flat', { vertexColors: true });
  const stoneMat = ctx.surface('concrete', { moss: 0.26, vertexColors: true });
  const tileMat = ctx.toon({ vertexColors: true, moss: 0.24 });
  const addMesh = (geo, mat, name) => { const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; m.name = name; group.add(m); return m; };
  addMesh(atlasUV(atlasS.geo()), atlasMat, 'outskirts-ground');
  addMesh(flatS.geo(), flatMat, 'outskirts-sides');
  addMesh(kit.worldUV(stoneS.geo(), stoneMat.userData.uv), stoneMat, 'outskirts-stone');
  addMesh(tileS.geo(), tileMat, 'outskirts-tile');
  group.add(rootB.build({ castShadow: true, receiveShadow: true }));

  // ---- ground cover -------------------------------------------------------------------------------------------------------
  const flatUp = (m) => { const base = m.onBeforeCompile, key = m.customProgramCacheKey(); m.onBeforeCompile = (s, r) => { base(s, r); s.fragmentShader = s.fragmentShader.replace('#include <normal_fragment_begin>', 'float faceDirection=1.; vec3 normal=normalize((viewMatrix*vec4(0.,1.,0.,0.)).xyz); vec3 nonPerturbedNormal=normal;'); }; m.customProgramCacheKey = () => key + '|up'; return m; };
  const leafMat = flatUp(ctx.toon({ side: THREE.DoubleSide, vertexColors: true, translucent: 0.55 }));
  const flowerMat = flatUp(ctx.toon({ side: THREE.DoubleSide, translucent: 0.8 }));
  const gradient = (g, lo, hi) => { g.computeBoundingBox(); const p = g.attributes.position, c = new Float32Array(p.count * 3), top = g.boundingBox.max.y; for (let i = 0; i < p.count; i++) { const t = p.getY(i) / top, k = lo + (hi - lo) * t * t; c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = k; } g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g; };
  const tuftGeo = (n, seg, spread, name) => { const parts = [], r = ctx.seeded('otuft' + name); for (let i = 0; i < n; i++) { const a = (i / n) * TAU + r() * 0.5, h = r.range(0.72, 1.02), g = kit.blade(h, r.range(0.12, 0.18), r.range(0.16, 0.36) * spread, seg); g.rotateY(a); g.translate(Math.sin(a) * 0.05, 0, Math.cos(a) * 0.05); parts.push(g); } return gradient(kit.merge(parts), 0.5, 1.14); };
  const tallGeo = tuftGeo(3, 2, 1.1, 'tall'), shortGeo = tuftGeo(3, 1, 1.3, 'short');
  const grassC = [P.leafDeep, '#4fae59', P.leafMid, P.grass, P.grass, P.grassLit].map(col);
  const pickGrass = (x, z) => { const n = vn(x * 0.8, z * 0.8 + 3) + (rng() - 0.5) * 0.16; return grassC[Math.max(0, Math.min(grassC.length - 1, Math.floor((n - 0.28) * 2.3 * grassC.length)))]; };
  const Q = new THREE.Quaternion(), EU = new THREE.Euler(0, 0, 0, 'YXZ'), V3 = THREE.Vector3;
  const mat4 = (x, y, z, rx, ry, rz, sx, sy = sx, sz = sx) => { EU.set(rx, ry, rz); return new THREE.Matrix4().compose(new V3(x, y, z), Q.clone().setFromEuler(EU), new V3(sx, sy, sz)); };
  const tall = [], short = [], heads = [], stems = [], cush = [], clover = [];
  const tuftAt = (x, y, z, h, list = tall, c = pickGrass(x, z)) => list.push({ m: mat4(x, y, z, rng.range(-0.12, 0.12), rng() * TAU, rng.range(-0.12, 0.12), h * rng.range(0.85, 1.25), h, h * rng.range(0.85, 1.25)), c, x, z });
  const yS = G.soilY - 0.01;
  // turf: follows the painted bands, sized to read from the hero distance
  const fAt = (x, z) => F1[Math.round((z + MO) * FK) * (FN + 1) + Math.round((x + MO) * FK)];
  for (let i = 0; i < 120000 && tall.length < 6400; i++) {
    const x = rng.range(-H, H), z = rng.range(-H, H); if (!free(x, z)) continue;
    const t = fAt(x, z); if (t < 0.45 || rng() > smooth((t - 0.43) / 0.12) * 0.9) continue;
    tuftAt(x, yS, z, rng.range(0.5, 0.95) * (0.75 + t * 0.7));
  }
  for (let i = 0; i < 90000 && short.length < 11000; i++) {
    const x = rng.range(-H, H), z = rng.range(-H, H); if (!free(x, z)) continue;
    const t = fAt(x, z); if (t < 0.39) continue;
    tuftAt(x, yS, z, rng.range(0.3, 0.5), short);
  }
  // weeds: every crack, every lost tile
  const edgeSum = crackEdges.reduce((a, e) => a + e.w, 0);
  for (const e of crackEdges) {
    const count = Math.round((e.w / edgeSum) * 3100 + rng());
    for (let i = 0; i < count; i++) { const u = rng(), x = lerp(e.a[0], e.c[0], u) + rng.range(-0.05, 0.05), z = lerp(e.a[1], e.c[1], u) + rng.range(-0.05, 0.05); if (rng() < 0.46) tuftAt(x, -0.03, z, rng.range(0.32, 0.72)); else tuftAt(x, -0.03, z, rng.range(0.18, 0.34), short); }
  }
  for (const poly of holes) {
    const xs = poly.map((q) => q[0]), zs = poly.map((q) => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    const n = Math.min(26, Math.round((x1 - x0) * (z1 - z0) * 14) + 2);
    for (let i = 0, k = 0; i < n * 6 && k < n; i++) { const x = rng.range(x0, x1), z = rng.range(z0, z1); if (pointInPoly(x, z, poly)) { k++; tuftAt(x, -0.03, z, rng.range(0.34, 0.8)); } }
  }
  for (const q of paveHoles) { for (let i = 0; i < 7; i++) { const x = lerp(q[0][0], q[2][0], rng()), z = lerp(q[0][1], q[2][1], rng()); tuftAt(x, 0.04, z, rng.range(0.26, 0.6), i % 2 ? tall : short); } }
  for (const j of joints) if (rng() < 0.14) tuftAt(j[0], 0.09, j[1], rng.range(0.16, 0.3), short);
  // strips: grass banked against walls and along the kerbless road edges, the silhouettes that say this place has been left
  const strip = (ax, az, bx, bz, n, y, h) => { for (let i = 0; i < n; i++) { const u = rng(), x = lerp(ax, bx, u) + rng.range(-0.14, 0.14), z = lerp(az, bz, u) + rng.range(-0.14, 0.14); if (!free(x, z)) continue; if (vn(x * 0.9 + 3, z * 0.9) < 0.4) continue; tuftAt(x, y, z, rng.range(h[0], h[1])); } };
  for (const b of BUILDINGS) {
    if (b.elev) continue;
    const r = buildingBox(b, 0.42), per = (r.x[1] - r.x[0]) * 2 + (r.z[1] - r.z[0]) * 2, n = Math.round(per * 2.4);
    strip(r.x[0], r.z[0], r.x[1], r.z[0], n / 4, yS, [0.55, 1.05]); strip(r.x[1], r.z[0], r.x[1], r.z[1], n / 4, yS, [0.55, 1.05]); strip(r.x[1], r.z[1], r.x[0], r.z[1], n / 4, yS, [0.55, 1.05]); strip(r.x[0], r.z[1], r.x[0], r.z[0], n / 4, yS, [0.55, 1.05]);
  }
  for (const r of roads) for (const [a, b] of r.spans) for (const side of [-1, 1]) {
    const off = r.hw + (side > 0 ? r.walkP : r.walkM) + 0.26;
    for (let s = a; s < b; s += 0.45) { const [x, z] = r.at(s, side * off); if (rng() < 0.46 && free(x + rng.range(-0.1, 0.1), z + rng.range(-0.1, 0.1)) && vn(x * 0.7, z * 0.7 + 30) > 0.38) tuftAt(x + rng.range(-0.2, 0.2), yS, z + rng.range(-0.2, 0.2), rng.range(0.5, 1.0)); }
  }
  // cushions and clover
  const mossC = [P.mossDeep, P.moss, P.moss, P.mossLit].map(col), cloverC = ['#58b45a', '#6fc456', P.leafMid, P.ivyLit, P.leafDeep].map(col);
  for (let i = 0, n = 0; i < 26000 && n < 700; i++) { const x = rng.range(-H, H), z = rng.range(-H, H); if (!free(x, z) || vn(x * 1.3 + 8, z * 1.3) < 0.55) continue; n++; const r = rng.range(0.2, 0.5); cush.push({ m: mat4(x, yS, z, rng.range(-0.1, 0.1), rng() * TAU, rng.range(-0.1, 0.1), r, r * rng.range(0.5, 0.78), r * rng.range(0.8, 1.15)), c: rng.pick(mossC) }); }
  for (const e of crackEdges) if (e.w > 0.05 && rng() < 0.14) { const u = rng(), x = lerp(e.a[0], e.c[0], u), z = lerp(e.a[1], e.c[1], u), r = rng.range(0.1, 0.22); cush.push({ m: mat4(x, -0.01, z, 0, rng() * TAU, 0, r, r * 0.62, r), c: rng.pick(mossC) }); }
  for (let i = 0, n = 0; i < 30000 && n < 1500; i++) { const x = rng.range(-H, H), z = rng.range(-H, H); if (!free(x, z) || vn(x * 0.9 + 21, z * 0.9 + 2) < 0.52) continue; n++; for (let k = 0; k < 2; k++) clover.push({ m: mat4(x + rng.range(-0.2, 0.2), yS + 0.01, z + rng.range(-0.2, 0.2), rng.range(-0.15, 0.15), rng() * TAU, rng.range(-0.15, 0.15), rng.range(1.4, 2.3)), c: rng.pick(cloverC), x, z }); }
  // wildflowers in drifts: small heads, stems whose shear follows the grass
  const kinds = [[P.flowerYellow, '#f49b2e'], [P.flowerWhite, P.flowerYellow], [P.flowerBlue, P.flowerWhite], [P.flowerPurple, P.flowerYellow], [P.bougainLit, P.flowerYellow], [P.bougain, P.sunGold]].map(([a, b]) => [col(a), col(b)]);
  for (let i = 0, n = 0; i < 40000 && n < 1500; i++) {
    const x = rng.range(-H, H), z = rng.range(-H, H); if (!free(x, z) || vn(x * 0.7 + 40, z * 0.7) < 0.55 || fAt(x, z) < 0.42) continue;
    n++; const h = rng.range(0.34, 0.78), lean = [rng.range(-0.2, 0.2), rng() * TAU, rng.range(-0.2, 0.2)], tip = new V3(0, h, 0.08 * h).applyEuler(new THREE.Euler(lean[0], lean[1], lean[2], 'YXZ')), [c] = rng.pick(kinds);
    stems.push({ m: mat4(x, yS, z, lean[0], lean[1], lean[2], 1, h, h), c: rng.pick(grassC), x, z });
    heads.push({ m: mat4(x + tip.x, yS + tip.y, z + tip.z, rng.range(-0.45, 0.45), rng() * TAU, rng.range(-0.45, 0.45), rng.range(1.4, 2.1)), c, x, z });
  }
  const instanced = (geo, mat, items, { soft = true } = {}) => { const m = new THREE.InstancedMesh(geo, mat, items.length); items.forEach((it, i) => { m.setMatrixAt(i, it.m); m.setColorAt(i, it.c); }); m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = true; if (soft) ctx.softEdge(m); return m; };
  const sway = [], WN = 17, WO = 40, WC = 80 / (WN - 1), WP = 16, windL = new Float32Array(WN * WN), wobble = new Float32Array(WP);   // the gust is read off a coarse lattice each frame, per-instance flutter off a small phase table: both are cheap enough for every tuft
  /** One instanced mesh per list, each instance sheared by the gust where it stands and its own phase: no rigid blocks, and fewer draws than the old quadrants. */
  const swaying = (geo, mat, items, amp) => {
    const mesh = instanced(geo, mat, items); mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const n = items.length, x = new Float32Array(n), z = new Float32Array(n), ph = new Uint8Array(n);
    items.forEach((it, i) => { x[i] = (it.x + WO) / WC; z[i] = (it.z + WO) / WC; const h = Math.sin(it.x * 12.9898 + it.z * 78.233) * 43758.5453; ph[i] = Math.floor((h - Math.floor(h)) * WP) % WP; });
    sway.push({ mesh, base: mesh.instanceMatrix.array.slice(), x, z, ph, amp }); group.add(mesh);
  };
  swaying(tallGeo, leafMat, tall, 0.085);
  group.add(instanced(shortGeo, leafMat, short));
  group.add(instanced(new THREE.SphereGeometry(1, 6, 2, 0, TAU, 0, Math.PI / 2), ctx.toon({ vertexColors: false }), cush));
  const cloverGeo = (() => { const parts = []; for (let k = 0; k < 3; k++) { const l = kit.leaf(0.15, 0.13, 0.15); l.rotateX(-0.2); l.rotateY((k / 3) * TAU + 0.3); l.translate(0, 0.05, 0); parts.push(l); } return kit.merge(parts); })();
  group.add(instanced(cloverGeo, flatUp(ctx.toon({ side: THREE.DoubleSide, translucent: 0.55 })), clover));
  const stemGeo = gradient(kit.blade(1, 0.05, 0.1, 2), 0.7, 1.1), headGeo = kit.flower(0.1, 5);
  swaying(stemGeo, leafMat, stems, 0.075); swaying(headGeo, flowerMat, heads, 0.075);

  return {
    group,
    update(t) {
      for (let j = 0, q = 0; j < WN; j++) for (let i = 0; i < WN; i++, q++) windL[q] = ctx.wind(t, i * WC - WO, j * WC - WO);
      for (let k = 0; k < WP; k++) wobble[k] = Math.sin(t * 1.7 + (k / WP) * TAU);
      for (const s of sway) {
        const a = s.mesh.instanceMatrix.array, b = s.base, { x, z, ph, amp } = s, ax = amp * 0.72, az = amp * -0.36, af = amp * 0.14;
        for (let n = 0, o = 0; n < x.length; n++, o += 16) {
          const u = Math.min(WN - 1.001, Math.max(0, x[n])), v = Math.min(WN - 1.001, Math.max(0, z[n])), iu = u | 0, iv = v | 0, fu = u - iu, fv = v - iv, c = iv * WN + iu;
          const f = wobble[ph[n]], w = 0.5 + (windL[c] * (1 - fu) + windL[c + 1] * fu) * (1 - fv) + (windL[c + WN] * (1 - fu) + windL[c + WN + 1] * fu) * fv + f * 0.22;
          const kx = w * ax, kz = w * az + f * af;
          a[o] = b[o] + kx * b[o + 1]; a[o + 2] = b[o + 2] + kz * b[o + 1]; a[o + 4] = b[o + 4] + kx * b[o + 5]; a[o + 6] = b[o + 6] + kz * b[o + 5]; a[o + 8] = b[o + 8] + kx * b[o + 9]; a[o + 10] = b[o + 10] + kz * b[o + 9];
          a[o + 12] = b[o + 12] + kx * (b[o + 13] - 0.02); a[o + 14] = b[o + 14] + kz * (b[o + 13] - 0.02);
        }
        s.mesh.instanceMatrix.needsUpdate = true;
      }
    },
  };
}
