// ground.js — the whole top surface of the plinth: broken L-road, curbs and paving lifted by roots, soil bands,
// raised terrace with retaining wall, mossy steps, planters, pushed-open manhole, pond hole, and all ground cover.
//
// Technique notes
//  · One 2D "atlas" canvas covers the 24×24 plinth top: asphalt tones, wet stain, moss, paint, turf. Every road slab and
//    soil plate samples it in world XZ, so paint and moss stay continuous across cracks.
//  · The road is a Voronoi fracture. Seeds are mirrored across the crack polylines so cell borders run along them.
//    Each cell becomes a separately tilted slab; gaps show the dark subgrade, where the grass grows.
//  · Grass sways by shearing whole InstancedMeshes about their base height (bases stay planted, no shader displacement).

import { streamLine } from './water.js';

const E = 11.97; // plates stop just inside the plinth edge
const TAU = Math.PI * 2;
const smooth = (t) => { const k = Math.min(1, Math.max(0, t)); return k * k * (3 - 2 * k); };
const lerp = (a, b, t) => a + (b - a) * t;
const hyp = Math.hypot;

// ---- noise -------------------------------------------------------------------------------------------------------
function makeNoise(rng) {
  const T = new Float32Array(65536).map(() => rng());
  const vn = (x, z) => {
    const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi;
    const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    const X0 = xi & 255, X1 = (xi + 1) & 255, Z0 = (zi & 255) << 8, Z1 = ((zi + 1) & 255) << 8;
    const a = T[X0 | Z0], b = T[X1 | Z0], c = T[X0 | Z1], d = T[X1 | Z1];
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
  };
  return vn;
}

// ---- 2D polygon helpers (points are [x,z]) -------------------------------------------------------------------------
const arcPts = (cx, cz, r, a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => {
  const a = a0 + ((a1 - a0) * i) / n; return [cx + Math.cos(a) * r, cz + Math.sin(a) * r];
});
const area = (p) => { let s = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) s += p[j][0] * p[i][1] - p[i][0] * p[j][1]; return s / 2; };
const oriented = (p) => (area(p) >= 0 ? p : [...p].reverse());
const centroid = (p) => { let x = 0, z = 0; for (const q of p) { x += q[0]; z += q[1]; } return [x / p.length, z / p.length]; };
function clipHalf(poly, mx, mz, nx, nz) { // keep the side where (p-m)·n <= 0
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const da = (a[0] - mx) * nx + (a[1] - mz) * nz, db = (b[0] - mx) * nx + (b[1] - mz) * nz;
    if (da <= 0) out.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}
const dedupe = (p, eps = 1e-3) => p.filter((q, i) => { const r = p[(i + 1) % p.length]; return hyp(q[0] - r[0], q[1] - r[1]) > eps; });
function subdivide(poly, step, open = false) {
  const out = [];
  for (let i = 0; i < poly.length - (open ? 1 : 0); i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], l = hyp(b[0] - a[0], b[1] - a[1]), c = Math.max(1, Math.round(l / step));
    for (let k = 0; k < c; k++) out.push([a[0] + ((b[0] - a[0]) * k) / c, a[1] + ((b[1] - a[1]) * k) / c]);
  }
  if (open) out.push(poly[poly.length - 1]);
  return out;
}
/** Move each vertex of an oriented polygon inward by w(i). */
function insetVar(poly, wAt) {
  const n = poly.length;
  return poly.map((p, i) => {
    const a = poly[(i + n - 1) % n], b = poly[(i + 1) % n];
    let tx = b[0] - a[0], tz = b[1] - a[1]; const l = hyp(tx, tz) || 1; tx /= l; tz /= l;
    const w = wAt(i);
    return [p[0] - tz * w, p[1] + tx * w];
  });
}
function distSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1e-9;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return { d: hyp(px - ax - dx * t, pz - az - dz * t), t, x: ax + dx * t, z: az + dz * t };
}
/** Nearest point on a polyline: {d, u∈[0,1] along length, x, z}. */
function distLine(line, px, pz) {
  let best = { d: 1e9, u: 0, x: 0, z: 0 }, run = 0, total = 0;
  for (let i = 0; i + 1 < line.length; i++) total += hyp(line[i + 1][0] - line[i][0], line[i + 1][1] - line[i][1]);
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i], b = line[i + 1], l = hyp(b[0] - a[0], b[1] - a[1]), s = distSeg(px, pz, a[0], a[1], b[0], b[1]);
    if (s.d < best.d) best = { d: s.d, u: (run + s.t * l) / total, x: s.x, z: s.z };
    run += l;
  }
  return best;
}

export function build(ctx) {
  const { THREE, layout, P, kit } = ctx;
  const { GROUND: G, WATER: W, STREET: ST, WRECK, pointInPoly } = layout;
  const group = new THREE.Group();
  const rng = ctx.rng, vn = makeNoise(ctx.seeded('ground-noise'));
  const col = (c) => new THREE.Color(c);
  const gray = (k) => new THREE.Color().setRGB(k, k, k);
  const mixc = (a, b, t) => col(a).lerp(col(b), t);

  // ---- region polygons -------------------------------------------------------------------------------------------
  const IC = [G.road.innerCorner.x - G.road.innerCorner.radius, G.road.innerCorner.z - G.road.innerCorner.radius], IR = G.road.innerCorner.radius;
  const OC = [G.road.outerCorner.x - G.road.outerCorner.radius, G.road.outerCorner.z - G.road.outerCorner.radius], OR = G.road.outerCorner.radius;
  const X0 = G.road.xArm.x[0], X1 = G.road.xArm.x[1], Z0 = G.road.zArm.z[0], Z1 = G.road.zArm.z[1];
  const innerArc = arcPts(IC[0], IC[1], IR, Math.PI / 2, 0, 8);    // (2,2.2) → (3.2,1)
  const outerArc = arcPts(OC[0], OC[1], OR, 0, Math.PI / 2, 10);   // (7.8,5) → (6,6.8)
  const walkOuterX = G.outerSidewalk.eastX[1], walkOuterZ = G.outerSidewalk.southZ[1];
  const outerArcBig = arcPts(OC[0], OC[1], walkOuterX - OC[0], 0, Math.PI / 2, 10);
  const roadPoly = oriented([[-E, Z0], ...innerArc, [X0, -E], [X1, -E], ...outerArc, [-E, Z1]]);
  const innerWalk = [[-E, 0.5], [1.5, 0.5], [1.5, -E], [X0, -E], ...[...innerArc].reverse(), [-E, Z0]];
  const outerWalk = [[-E, Z1], ...[...outerArc].reverse(), [X1, -E], [walkOuterX, -E], ...outerArcBig, [-E, walkOuterZ]];
  const gapX = [W.sidewalkGap.x[0] - 0.05, W.sidewalkGap.x[1] + 0.05];
  const pond = W.pond;
  const pondR = (x, z) => hyp((x - pond.x) / pond.rx, (z - pond.z) / pond.rz);
  const ellZ = (x) => pond.z - pond.rz * Math.sqrt(1 - ((x - pond.x) / pond.rx) ** 2);
  // the stream as it actually runs, meander included; the road's fracture seeds alone keep the coarse layout polyline
  const stream = streamLine(THREE, W).filter((q, i, all) => q.d >= 0 && (i % 3 === 0 || i === all.length - 1)).map((q) => [q.x, q.z]);
  const streamHW = (u) => lerp(W.streamWidth[0], W.streamWidth[1], u) / 2;
  const cracks = G.cracks.filter((_, i) => i !== 1);   // cracks[1] is the stream line, handled wider
  const curbLines = [[[-E, Z0], ...innerArc, [X0, -E]], [[-E, Z1], ...[...outerArc].reverse(), [X1, -E]]];
  const distCurb = (x, z) => Math.min(distLine(curbLines[0], x, z).d, distLine(curbLines[1], x, z).d);

  const roots = [
    { p: [[-3.3, 0.14, 0.45], [-2.7, 0.15, 0.95], [-1.8, 0.14, 1.3], [-0.95, 0.13, 1.7], [-0.15, 0.04, 2.15]], r: 0.19 },
    { p: [[-8.4, 0.13, 0.45], [-8.05, 0.14, 1.05], [-7.35, 0.14, 1.45], [-7.0, 0.04, 2.08]], r: 0.16 },
    { p: [[1.45, 0.14, -4.2], [2.05, 0.15, -4.6], [2.55, 0.14, -4.4], [3.08, 0.04, -4.95]], r: 0.17 },
    { p: [[1.45, 0.12, -8.7], [2.15, 0.14, -8.95], [2.65, 0.12, -9.6], [3.1, 0.03, -9.75]], r: 0.14 },
  ];
  const rootLines = roots.map((r) => r.p.map((q) => [q[0], q[2]]));
  const rootDist = (x, z) => Math.min(...rootLines.map((l) => distLine(l, x, z).d));
  const lift = (x, z) => { const d = rootDist(x, z); return 0.17 * Math.exp(-((d / 0.5) ** 2)); };

  const bumps = [ // low soil mounds: [x,z,rx,rz,h]
    [10.35, -0.9, 2.3, 2.9, 0.26], [10.7, 6.4, 1.5, 1.9, 0.3], [9.9, 7.2, 0.9, 0.9, 0.22], [10.7, 2.7, 1.2, 1.5, 0.2],
    [7.4, 10.4, 2.2, 1.5, 0.34], [-2.55, 11.25, 0.8, 0.62, 0.2], [10.8, 10.9, 1.1, 1.0, 0.22], [10.6, -10.8, 1.3, 1.1, 0.24], [0.4, 11.75, 2.2, 0.5, 0.12],
  ];
  const bandEdge = (x, z) => Math.max(x - walkOuterX, z - walkOuterZ);
  const mound = (x, z) => {
    let h = 0;
    for (const [bx, bz, rx, rz, a] of bumps) { const d = hyp((x - bx) / rx, (z - bz) / rz); if (d < 1) h += a * smooth(1 - d); }
    return h * smooth(bandEdge(x, z) / 0.5) * smooth((pondR(x, z) - 1.1) / 0.28) * smooth((E - Math.abs(x)) / 0.4) * smooth((E - Math.abs(z)) / 0.4) * (0.8 + 0.4 * vn(x * 1.3, z * 1.3));
  };
  const turf = (x, z) => 0.62 * vn(x * 0.55 + 11, z * 0.55 + 4) + 0.28 * vn(x * 1.6, z * 1.6 + 9) + 0.1 * vn(x * 4.3 + 5, z * 4.3);

  // Moss and clover over the open earth of the front band. One mask, read by the atlas paint and by the scatter that plants it.
  const SOIL = ['#927c64', '#826e5a', '#a08d77'];   // P.soil and friends, a step cooler and lighter so bare ground sits with the greens: light, dark, plate side
  const soilPatches = [ // [x, z, rx, rz, yaw, kind]
    [9.5, 11.0, 1.3, 0.62, 0.2, 'moss'], [6.7, 11.35, 1.15, 0.46, -0.1, 'clover'], [6.4, 9.6, 0.56, 0.8, 0.25, 'moss'], [8.75, 9.2, 0.62, 0.82, -0.2, 'clover'],
    [5.3, 8.3, 0.95, 0.3, 0.05, 'moss'], [-1.3, 11.55, 1.0, 0.36, 0.1, 'clover'], [3.2, 11.8, 0.85, 0.24, -0.04, 'moss'], [6.15, 10.72, 0.66, 0.24, -0.35, 'clover'],
  ].map(([x, z, rx, rz, yaw, kind]) => ({ x, z, rx, rz, cos: Math.cos(yaw), sin: Math.sin(yaw), kind }));
  /** Depth inside the nearest patch: > 0 inside, wobbling at the rim so it never reads as an ellipse. */
  const cover = (x, z) => {
    let v = -1, kind = null;
    for (const p of soilPatches) {
      const dx = x - p.x, dz = z - p.z, d = hyp((dx * p.cos + dz * p.sin) / p.rx, (dz * p.cos - dx * p.sin) / p.rz);
      if (d > 1.6) continue;
      const q = 1 - d + 0.8 * (vn(x * 1.5 + 31, z * 1.5 + 7) - 0.5) + 0.34 * (vn(x * 4.1 + 2, z * 4.1 + 53) - 0.5);
      if (q > v) { v = q; kind = p.kind; }
    }
    return { v, kind };
  };

  const T = G.terrace;
  const onTerrace = (x, z, m = 0) => x > T.x[0] - 1 && x < T.x[1] - m && z > T.z[0] + m && z < T.z[1] + 1;
  const inPlanter = (x, z, m = 0) => G.planters.some((p) => Math.abs(x - p.x) < p.w / 2 + m && Math.abs(z - p.z) < p.d / 2 + m);

  // Other modules' footprints: keep cover and litter short of them.
  const blockers = [];
  const addB = (x, z, r) => blockers.push([x, z, r]);
  addB(ST.lamp.x, ST.lamp.z, 0.4); addB(ST.trafficLight.x, ST.trafficLight.z, 0.35); addB(ST.utilityPole.x, ST.utilityPole.z, 0.35);
  addB(ST.vending.x, ST.vending.z, 0.75); addB(ST.kiosk.x, ST.kiosk.z, 1.5); addB(ST.tires.x, ST.tires.z, 0.65); addB(ST.bicycle.x, ST.bicycle.z, 0.55);
  addB(ST.neonWreck.x, ST.neonWreck.z, 0.8); for (const b of ST.barricades) addB(b.x, b.z, 0.65);
  for (let i = 0; i < 4; i++) addB(ST.busStop.x - 1.2 + i * 0.8, ST.busStop.z, 0.55);
  for (let i = 0; i <= 7; i++) addB(lerp(ST.billboard.baseX, ST.billboard.tipX, i / 7), lerp(ST.billboard.baseZ, ST.billboard.tipZ, i / 7), 0.6);
  addB(WRECK.footbridge.pier.x, WRECK.footbridge.pier.z, 0.6);
  /** The stair and the worn line leading to it stay clear of grass, litter and cushions. */
  const atStair = (x, z, pad = 0) => (x > G.steps.x[0] - 0.05 && x < G.steps.x[1] + 0.24 + pad && z > G.steps.z[0] - 0.3 - pad && z < G.steps.z[1] + 0.3 + pad) || distLine(G.steps.path, x, z).d < 0.4 + pad;
  const blocked = (x, z, pad = 0) => {
    if (atStair(x, z, pad)) return true;
    if (x > WRECK.footbridge.stairs.x[0] - pad && x < WRECK.footbridge.stairs.x[1] + pad && z > WRECK.footbridge.stairs.z[0] - pad && z < WRECK.footbridge.stairs.z[1] + pad) return true;
    if (Math.abs(x - WRECK.car.x) < 1.2 + pad && Math.abs(z - WRECK.car.z) < 2.3 + pad) return true;
    return blockers.some(([bx, bz, r]) => hyp(x - bx, z - bz) < r + pad);
  };

  // ---- atlas -----------------------------------------------------------------------------------------------------
  const S = 2048;
  const u2p = (v) => ((v + 12) / 24) * S;
  const mapPath = (g, pts, close = false) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(u2p(p[0]), u2p(p[1])) : g.moveTo(u2p(p[0]), u2p(p[1])))); if (close) g.closePath(); };
  const mask = (blur, draw) => {
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S); g.filter = blur ? `blur(${blur}px)` : 'none';
    g.strokeStyle = g.fillStyle = '#fff'; g.lineCap = g.lineJoin = 'round'; draw(g);
    const d = g.getImageData(0, 0, S, S).data, out = new Uint8Array(S * S);
    for (let i = 0; i < out.length; i++) out[i] = d[i * 4];
    return out;
  };
  const px = (s) => (s / 24) * S;
  const rgb = (c) => { const k = col(c).convertLinearToSRGB(); return [k.r * 255, k.g * 255, k.b * 255]; };
  const atlas = ctx.canvasTexture(S, S, (g) => {
    const mRoad = mask(0, (m) => { mapPath(m, roadPoly, true); m.fill(); });
    const mCrack = mask(16, (m) => { m.lineWidth = px(0.34); for (const l of G.cracks) { mapPath(m, l); m.stroke(); } });
    const mWet = mask(20, (m) => { m.lineWidth = px(0.95); mapPath(m, stream); m.stroke(); m.lineWidth = px(1.7); mapPath(m, stream.filter((q) => q[1] > W.stream[1][1] && q[1] < W.stream[3][1])); m.stroke(); });
    const mEdge = mask(9, (m) => { m.lineWidth = px(0.36); for (const l of curbLines) { mapPath(m, l); m.stroke(); } });
    const C = {
      a0: rgb('#868b92'), a1: rgb('#8d9197'), a2: rgb('#7c8189'), w0: rgb('#5e6b73'), w1: rgb('#4a5a65'),
      mD: rgb(P.mossDeep), mM: rgb(P.moss), mL: rgb(P.mossLit),
      s0: rgb(SOIL[0]), s1: rgb(SOIL[1]), gD: rgb('#3f9458'), gM: rgb('#63b24f'), gL: rgb(P.grass), gS: rgb(P.grassLit),
    };
    const img = g.createImageData(S, S), d = img.data;
    const keepPaint = new Uint8Array(S * S);
    for (let y = 0, i = 0; y < S; y++) {
      const z = (y / S) * 24 - 12;
      for (let x = 0; x < S; x++, i++) {
        const wx = (x / S) * 24 - 12;
        let c;
        if (mRoad[i] > 127) {
          const nA = 0.7 * vn(wx * 0.33, z * 0.33 + 40) + 0.3 * vn(wx * 1.1 + 7, z * 1.1);
          const nM = 0.6 * vn(wx * 1.7 + 3, z * 1.7) + 0.4 * vn(wx * 5.1, z * 5.1 + 3);
          const wet = mWet[i] / 255 + (nM - 0.5) * 0.5;
          const mossy = (mCrack[i] / 255) * 1.2 + (mEdge[i] / 255) * 0.62 + (nM - 0.5) * 0.95;
          c = nA > 0.58 ? C.a1 : nA < 0.43 ? C.a2 : C.a0;
          keepPaint[i] = 1;
          if (wet > 0.62) { c = C.w1; keepPaint[i] = 0; } else if (wet > 0.42) c = C.w0;
          if (mossy > 0.5) {
            keepPaint[i] = 0;
            c = mossy > 0.84 ? C.mL : mossy > 0.64 ? C.mM : C.mD;
          }
        } else {
          let t = turf(wx, z);
          const pr = pondR(wx, z);
          t -= 0.22 * (1 - smooth((pr - 1) / 0.26));                // a collar of bank stays bare
          t += T.x[0] <= wx && wx <= T.x[1] && z >= T.z[0] ? 0.07 : 0.05;
          const n2 = vn(wx * 3.4, z * 3.4 + 20);
          if (t < 0.4) {
            const { v, kind } = z > 7.8 ? cover(wx, z) : { v: -1 };
            const tone = v + 0.9 * (vn(wx * 2.3 + 9, z * 2.3 + 17) - 0.5);   // light falls in drifts, not rings around the middle
            if (v <= 0) c = n2 > 0.5 ? C.s0 : C.s1;
            else if (kind === 'moss') c = tone > 0.42 ? C.mL : tone > 0.12 ? C.mM : C.mD;
            else c = tone > 0.42 ? C.gL : tone > 0.12 ? C.gM : C.gD;
          }
          else if (t < 0.46) c = C.gD;
          else if (t < 0.56) c = C.gM;
          else if (t < 0.72) c = C.gL;
          else c = C.gS;
        }
        const k = i * 4; d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    g.fillStyle = SOIL[2]; g.fillRect(u2p(-5.2), u2p(-5.2), px(0.4), px(0.4));   // swatch for vertical plate faces (under the building)

    // Road paint on its own layer so it can be chipped and hidden by moss.
    const pc = document.createElement('canvas'); pc.width = pc.height = S;
    const m = pc.getContext('2d', { willReadFrequently: true });
    const paint = '#f3edd9', yellow = '#e6c462';
    m.lineCap = 'butt'; m.lineJoin = 'round';
    const lineXZ = (fn, w, color, dash) => { m.strokeStyle = color; m.lineWidth = px(w); m.setLineDash((dash || []).map(px)); m.beginPath(); fn(); m.stroke(); m.setLineDash([]); };
    const M = u2p, MS = (r) => (r / 24) * S;
    lineXZ(() => { m.moveTo(M(-12), M(4.5)); m.lineTo(M(IC[0]), M(4.5)); m.arc(M(IC[0]), M(IC[1]), MS(3.5), Math.PI / 2, 0, true); m.lineTo(M(5.5), M(-12)); }, 0.13, yellow);
    const e = 0.3;
    lineXZ(() => { m.moveTo(M(-12), M(Z0 + e)); m.lineTo(M(IC[0]), M(Z0 + e)); m.arc(M(IC[0]), M(IC[1]), MS(IR + e), Math.PI / 2, 0, true); m.lineTo(M(X0 + e), M(-12)); }, 0.09, paint);
    lineXZ(() => { m.moveTo(M(-12), M(Z1 - e)); m.lineTo(M(OC[0]), M(Z1 - e)); m.arc(M(OC[0]), M(OC[1]), MS(OR - e), Math.PI / 2, 0, true); m.lineTo(M(X1 - e), M(-12)); }, 0.09, paint);
    // Crosswalks bracket the turn: one on each arm, right where the curbs start bending.
    const xwA = [0.5, 2.0], xwB = [-3.5, -1.95];
    m.clearRect(M(xwA[0] - 0.22), M(Z0 + 0.1), MS(xwA[1] - xwA[0] + 0.44), MS(Z1 - Z0 - 0.2));
    m.clearRect(M(X0 + 0.1), M(xwB[0] - 0.22), MS(X1 - X0 - 0.2), MS(xwB[1] - xwB[0] + 0.44));
    m.fillStyle = paint;
    for (let z = Z0 + 0.28; z < Z1 - 0.3; z += 0.7) m.fillRect(M(xwA[0]), M(z), MS(xwA[1] - xwA[0]), MS(0.38));
    for (let x = X0 + 0.28; x < X1 - 0.3; x += 0.7) m.fillRect(M(x), M(xwB[0]), MS(0.38), MS(xwB[1] - xwB[0]));
    m.fillRect(M(-0.05), M(Z0 + 2.3), MS(0.16), MS(2.0));              // stop bars
    m.fillRect(M(5.6), M(-4.05), MS(2.0), MS(0.16));
    // 止まれ, reading toward the default camera (traffic heading -x in the near lane)
    m.save(); m.translate(M(-3.5), M(5.62)); m.rotate(-Math.PI / 2); m.scale(1, 1.75);
    m.font = `900 ${MS(0.72)}px "Hiragino Sans","Noto Sans CJK JP","Yu Gothic",sans-serif`; m.textAlign = 'center'; m.textBaseline = 'middle';
    m.fillText('止まれ', 0, 0); m.restore();
    // arrow and limit on the x arm
    m.save(); m.translate(M(4.35), M(-8.9)); m.scale(1, 1.8);
    m.font = `800 ${MS(0.8)}px "Helvetica Neue",Arial,sans-serif`; m.textAlign = 'center'; m.textBaseline = 'middle'; m.fillText('40', 0, 0); m.restore();
    const pd = m.getImageData(0, 0, S, S), q = pd.data;
    for (let y = 0, i = 0; y < S; y++) {
      const z = (y / S) * 24 - 12;
      for (let x = 0; x < S; x++, i++) {
        const a = q[i * 4 + 3]; if (!a) continue;
        const wx = (x / S) * 24 - 12;
        const wear = 0.55 * vn((wx + z * 0.6) * 2.1 + 5, (z - wx * 0.6) * 2.1) + 0.45 * vn((wx - z * 0.8) * 6.7, (z + wx * 0.8) * 6.7 + 2);
        q[i * 4 + 3] = !keepPaint[i] || wear < 0.33 ? 0 : wear < 0.41 ? a * 0.5 : a * 0.84;
      }
    }
    m.putImageData(pd, 0, 0);
    g.drawImage(pc, 0, 0);
  }, { repeat: false });
  const atlasMat = ctx.toon({ map: atlas, vertexColors: true });
  const atlasUV = (geo) => {
    const p = geo.attributes.position, uv = new Float32Array(p.count * 2);
    const n = geo.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const up = !n || n.getY(i) > 0.4;
      uv[i * 2] = ((up ? p.getX(i) : -5) + 12) / 24; uv[i * 2 + 1] = 1 - ((up ? p.getZ(i) : -5) + 12) / 24;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return geo;
  };

  // ---- materials and batches -------------------------------------------------------------------------------------
  const b = ctx.batch();
  const stoneMat = ctx.surface('concrete', { moss: 0.26, vertexColors: true });
  const wallMat = ctx.surface('concrete', { moss: 0.5, vertexColors: true });
  const stepMat = ctx.surface('concrete', { moss: 0.3, vertexColors: true }); // sparse: the treads are stone first, moss second
  const flatMat = ctx.surface('flat', { vertexColors: true });
  const flatUp = (m) => { // ground cover shades as one flat field: no per-blade terminators, no back-face darkening
    const base = m.onBeforeCompile, key = m.customProgramCacheKey();
    m.onBeforeCompile = (s, r) => {
      base(s, r);
      s.fragmentShader = s.fragmentShader.replace('#include <normal_fragment_begin>',
        'float faceDirection=1.; vec3 normal=normalize((viewMatrix*vec4(0.,1.,0.,0.)).xyz); vec3 nonPerturbedNormal=normal;');
    };
    m.customProgramCacheKey = () => key + '|up';
    return m;
  };
  const leafMat = flatUp(ctx.toon({ side: THREE.DoubleSide, vertexColors: true, translucent: 0.55 }));

  /** Triangle-soup helper that orients each face toward a reference direction. */
  class Soup {
    constructor() { this.p = []; }
    tri(a, c, d, ref) {
      const ux = c[0] - a[0], uy = c[1] - a[1], uz = c[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const flip = nx * ref[0] + ny * ref[1] + nz * ref[2] < 0;
      this.p.push(...a, ...(flip ? d : c), ...(flip ? c : d));
    }
    quad(a, c, d, e, ref) { this.tri(a, c, d, ref); this.tri(a, d, e, ref); }
    geo() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.computeVertexNormals(); return g; }
  }
  const UP = [0, 1, 0];
  const triTop = (s, poly, yAt) => {
    const idx = THREE.ShapeUtils.triangulateShape(poly.map((q) => new THREE.Vector2(q[0], q[1])), []);
    for (const [i, j, k] of idx) s.tri([poly[i][0], yAt(poly[i], i), poly[i][1]], [poly[j][0], yAt(poly[j], j), poly[j][1]], [poly[k][0], yAt(poly[k], k), poly[k][1]], UP);
  };
  const walls = (s, poly, yA, yB) => { // oriented polygon, skirt from yA(p,i) to yB(p,i)
    const sgn = area(poly) >= 0 ? 1 : -1, n = poly.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, a = poly[i], c = poly[j], ref = [(c[1] - a[1]) * sgn, 0, (a[0] - c[0]) * sgn];
      s.quad([a[0], yA(a, i), a[1]], [c[0], yA(c, j), c[1]], [c[0], yB(c, j), c[1]], [a[0], yB(a, i), a[1]], ref);
    }
  };
  /** Chamfered solid from a footprint polygon. topY(p) gives the height of the rim; yBot the bottom. */
  const block = (poly, topY, yBot, ch = 0.018) => {
    const o = oriented(poly), s = new Soup(), inner = insetVar(o, () => ch);
    triTop(s, inner, (q) => topY(q));
    const n = o.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      s.quad([o[i][0], topY(o[i]) - ch, o[i][1]], [o[j][0], topY(o[j]) - ch, o[j][1]], [inner[j][0], topY(inner[j]), inner[j][1]], [inner[i][0], topY(inner[i]), inner[i][1]], UP);
    }
    walls(s, o, (q) => topY(q) - ch, () => yBot);
    return s.geo();
  };

  // ---- soil plates ------------------------------------------------------------------------------------------------
  const plateTo = (outline, holes, y) => atlasUV(kit.plate(outline, holes, y, y + 0.8));
  const edgeJag = (a, c) => kit.jag([a, c], 0.9, 0.05, rng, false).slice(0, -1);
  const th1 = -Math.PI + Math.acos((pond.x - gapX[0]) / pond.rx), th2 = -Math.PI + Math.acos((pond.x - gapX[1]) / pond.rx);
  const pondWest = Array.from({ length: 73 }, (_, i) => { // from the gap's west side all the way round to its east side
    const a = lerp(th1, th2 - TAU, i / 72); return [pond.x + Math.cos(a) * pond.rx, pond.z + Math.sin(a) * pond.rz];
  });
  const pondGapArc = Array.from({ length: 9 }, (_, i) => {
    const a = lerp(th2, th1, i / 8); return [pond.x + Math.cos(a) * pond.rx, pond.z + Math.sin(a) * pond.rz];
  });
  const plateOuter = [
    [-E, Z1], [gapX[0], Z1], ...pondWest, [gapX[1], Z1], ...[...outerArc].reverse(),
    ...edgeJag([X1, -E], [E, -E]), ...edgeJag([E, -E], [E, E]), ...edgeJag([E, E], [-E, E]), [-E, E],
  ];
  const plateInner = [...edgeJag([-E, -E], [X0, -E]), [X0, -E], ...[...innerArc].reverse(), [-E, Z0]];
  b.add(plateTo(plateOuter, [], G.soilY), atlasMat);
  b.add(plateTo(plateInner, [], G.soilY), atlasMat);
  // stream bed through the sidewalk gap, down to the pond rim
  b.add(kit.plate([[gapX[0], Z1 - 0.02], [gapX[1], Z1 - 0.02], ...pondGapArc], [], -0.012, 0.8), flatMat, { color: '#4a5a5e' });
  // road subgrade: dark rubble seen through the cracks
  const mh = G.manhole;
  b.add(kit.plate(roadPoly, [kit.circlePts(mh.x, mh.z, mh.r + 0.03, 20)], -0.035, 0.77), flatMat, { color: '#6a5a47' });
  // wet gravel ribbon under the stream film
  {
    const l = [], r = [], last = stream.length - 1;
    for (let i = 0; i <= last; i++) {
      const [x, z] = stream[i], a = stream[Math.max(0, i - 1)], c = stream[Math.min(last, i + 1)];
      if (z > Z1) break;
      const tl = hyp(c[0] - a[0], c[1] - a[1]), nx = -(c[1] - a[1]) / tl, nz = (c[0] - a[0]) / tl, h = streamHW(i / last) + 0.04;
      l.push([x + nx * h, z + nz * h]); r.push([x - nx * h, z - nz * h]);
    }
    b.add(kit.plate(oriented([...l, ...r.reverse()]), [], -0.028, 0.05), flatMat, { color: '#3e5158' });
  }

  // ---- soil mounds (heightfield laid on the plate) --------------------------------------------------------------
  {
    const s = new Soup(), st = 0.2;
    const h = (x, z) => G.soilY + mound(x, z);
    for (let x = -6; x < 12 - 1e-6; x += st) for (let z = -12; z < 12 - 1e-6; z += st) {
      const x1 = Math.min(x + st, E), z1 = Math.min(z + st, E), c = [[x, z], [x1, z], [x1, z1], [x, z1]].map(([a, d]) => [a, h(a, d), d]);
      if (c.every((q) => q[1] <= G.soilY + 0.0015)) continue;
      s.tri(c[0], c[1], c[2], UP); s.tri(c[0], c[2], c[3], UP);
    }
    if (s.p.length) b.add(atlasUV(s.geo()), atlasMat);
  }

  // ---- fractured road ---------------------------------------------------------------------------------------------
  const crackEdges = [], potholes = [], cells = [];
  {
    const seeds = [];
    const near = (x, z, r) => seeds.some((q) => hyp(q.x - x, q.z - z) < r);
    const inRoad = (x, z) => pointInPoly(x, z, roadPoly);
    const polySeeds = (line, spacing, d) => {
      for (let i = 0; i + 1 < line.length; i++) {
        const a = line[i], c = line[i + 1], l = hyp(c[0] - a[0], c[1] - a[1]), n = Math.max(1, Math.round(l / spacing));
        const tx = (c[0] - a[0]) / l, tz = (c[1] - a[1]) / l;
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n, x = lerp(a[0], c[0], t), z = lerp(a[1], c[1], t);
          if (hyp(x - mh.x, z - mh.z) < 1.3) continue;
          for (const s of [-1, 1]) {
            const dd = d * rng.range(0.92, 1.08), sx = x - tz * s * dd, sz = z + tx * s * dd;
            if (inRoad(sx, sz) && !near(sx, sz, 0.38)) seeds.push({ x: sx, z: sz });
          }
        }
      }
    };
    polySeeds(W.stream, 1.1, 1.0);
    for (const c of cracks) polySeeds(c, 1.05, 0.5);
    seeds.push({ x: mh.x, z: mh.z, hole: true });
    for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU + 0.3; seeds.push({ x: mh.x + Math.cos(a) * 1.5, z: mh.z + Math.sin(a) * 1.5 }); }
    for (let i = 0, tries = 0; tries < 900 && i < 70; tries++) {
      const x = rng.range(-E, X1), z = rng.range(-E, Z1);
      if (!inRoad(x, z) || near(x, z, 1.95)) continue;
      seeds.push({ x, z }); i++;
    }
    // Potholes: a few cells are simply gone.
    for (const [x, z] of [[-2.9, 2.8], [6.45, -6.5], [-7.9, 5.2], [4.6, 2.9]]) {
      let best = null, bd = 1e9;
      for (const s of seeds) { const d = hyp(s.x - x, s.z - z); if (d < bd && !s.hole) { bd = d; best = s; } }
      if (best) best.pothole = true;
    }

    const warp = (x, z, w) => {
      const dx = (vn(x * 1.15 + 3, z * 1.15) - 0.5) * 0.42 + (vn(x * 3.3, z * 3.3 + 7) - 0.5) * 0.16;
      const dz = (vn(x * 1.15, z * 1.15 + 31) - 0.5) * 0.42 + (vn(x * 3.3 + 17, z * 3.3) - 0.5) * 0.16;
      return [Math.max(-E, x + dx * w), Math.max(-E, z + dz * w)];
    };
    for (let i = 0; i < seeds.length; i++) {
      const s = seeds[i];
      let poly = roadPoly;
      for (let j = 0; j < seeds.length; j++) {
        if (j === i) continue;
        const o = seeds[j]; poly = clipHalf(poly, (s.x + o.x) / 2, (s.z + o.z) / 2, o.x - s.x, o.z - s.z);
        if (poly.length < 3) break;
      }
      if (poly.length < 3) continue;
      poly = dedupe(poly);
      if (poly.length < 3 || Math.abs(area(poly)) < 0.03) continue;
      if (s.hole) continue;
      const fine = subdivide(oriented(poly), 0.26);
      const meta = fine.map(([x, z]) => {
        const st = distLine(stream, x, z), hw = streamHW(st.u);
        let w = 0.01;
        for (const l of cracks) { const c = distLine(l, x, z); if (c.d < 0.3) w = Math.max(w, 0.095 * (1 - c.d / 0.3) * smooth(Math.min(c.u, 1 - c.u) * 7 + 0.15)); }
        if (st.d < 0.55) w = Math.max(w, (hw + 0.03) * (1 - smooth(st.d / 0.55)));
        return { w, warpAmt: smooth(distCurb(x, z) / 0.45) * (0.4 + 0.6 * smooth(st.d / 0.9)), st };
      });
      const warped = fine.map(([x, z], k) => warp(x, z, meta[k].warpAmt));
      if (s.pothole) {
        potholes.push(warped);
        const floor = insetVar(warped, () => 0.05);
        b.add(atlasUV(block(floor.map(([x, z]) => [x, z]), () => -0.012, -0.06, 0.01)), flatMat, { color: rng.pick([P.mossDeep, '#4f9f58']) });
        continue;
      }
      const top = insetVar(warped, (k) => meta[k].w);
      fine.forEach((_, k) => {
        const n = (k + 1) % fine.length, w = Math.max(meta[k].w, meta[n].w);
        if (w > 0.03) crackEdges.push({ a: warped[k], c: warped[n], w });
      });

      // Plane: near cracks the slab rears up at its crack edge; everywhere else it barely moves.
      const [cx, cz] = centroid(top);
      let cBest = { d: 1e9, x: cx, z: cz };
      for (const l of cracks) { const c = distLine(l, cx, cz); if (c.d < cBest.d) cBest = c; }
      const dm = hyp(cx - mh.x, cz - mh.z), Im = 1 - smooth((dm - 1) / 1.5);
      const I = Math.max(1 - smooth((cBest.d - 0.45) / 1.15), Im);
      let gx = rng.range(-0.008, 0.008), gz = rng.range(-0.008, 0.008), h = rng.range(-0.004, 0.006);
      if (I > 0.01) {
        const px_ = Im > 0.3 ? mh.x : cBest.x, pz_ = Im > 0.3 ? mh.z : cBest.z, l = hyp(px_ - cx, pz_ - cz) || 1;
        const tilt = I * rng.range(0.05, 0.14) * (Im > 0.3 || rng() > 0.22 ? 1 : -1);
        gx += ((px_ - cx) / l) * tilt; gz += ((pz_ - cz) / l) * tilt; h += I * rng.range(0.01, 0.06);
      }
      let yAt = (q) => h + gx * (q[0] - cx) + gz * (q[1] - cz);
      const nearStream = top.some(([x, z]) => { const c = distLine(stream, x, z); return c.d < streamHW(c.u) + 0.45; });
      const touchesCurb = top.some(([x, z]) => distCurb(x, z) < 0.06);
      if (nearStream) { gx *= 0.25; gz *= 0.25; }
      let ys = top.map(yAt), lo = Math.min(...ys), hi = Math.max(...ys);
      if (nearStream) h += 0.02 - hi;
      else { if (lo < -0.016) h += -0.016 - lo; if (touchesCurb) { const m = Math.max(...top.filter(([x, z]) => distCurb(x, z) < 0.08).map(yAt)); if (m > 0.075) h -= m - 0.075; } }
      ys = top.map(yAt); lo = Math.min(...ys); hi = Math.max(...ys);
      if (hi > 0.26) h -= hi - 0.26;
      cells.push({ poly: top, yAt, cx, cz });

      const sun = (gx * 0.42 - gz * 0.42) * 2.6, tone = 1 + sun + rng.range(-0.018, 0.018);
      const so = new Soup(); triTop(so, top, yAt);
      b.add(atlasUV(so.geo()), atlasMat, { color: gray(tone) });
      const sideA = new Soup(), sideB = new Soup(), o = oriented(top);
      walls(sideA, o, yAt, (q) => yAt(q) - 0.045);
      walls(sideB, o, (q) => yAt(q) - 0.045, () => -0.1);
      if (I > 0.05 || s.pothole) {
        b.add(sideA.geo(), flatMat, { color: '#5b6068' });
        b.add(sideB.geo(), flatMat, { color: '#a7a397' });
      } else b.add(sideA.geo(), flatMat, { color: '#50555d' });
    }
  }
  const roadTop = (x, z) => {
    for (const c of cells) if (hyp(c.cx - x, c.cz - z) < 3.5 && pointInPoly(x, z, c.poly)) return c.yAt([x, z]);
    return null;
  };

  // ---- curbs ------------------------------------------------------------------------------------------------------
  const cw = 0.17, curbTop = 0.145;
  const curbRun = (line, side, skip) => {
    // Walk the road edge; each stone extends `side`-ward by cw (the sidewalk side of the direction of travel).
    const pts = subdivide(line, 0.06, true);
    const off = (k, d) => {
      const a = pts[Math.max(0, k - 1)], c = pts[Math.min(pts.length - 1, k + 1)], l = hyp(c[0] - a[0], c[1] - a[1]) || 1;
      return [pts[k][0] - ((c[1] - a[1]) / l) * d * side, pts[k][1] + ((c[0] - a[0]) / l) * d * side];
    };
    for (let i = 0, id = 0; i < pts.length - 2; id++) {
      const curved = hyp(pts[i][0] - IC[0], pts[i][1] - IC[1]) < IR + 0.2 || hyp(pts[i][0] - OC[0], pts[i][1] - OC[1]) < OR + 0.3;
      const steps = Math.round((curved ? 0.42 : rng.range(0.82, 1.02)) / 0.06), j = Math.min(pts.length - 1, i + steps), mi = (i + j) >> 1, mid = pts[mi];
      const start = i; i = j;
      if (skip(mid[0], mid[1])) continue;
      const rd = rootDist(mid[0], mid[1]), lf = rd < 0.5 ? 0.09 * (1 - rd / 0.5) : 0;
      const shove = 0.008 + (rd < 0.6 ? 0.05 : 0) + (id % 7 === 3 ? 0.012 : 0), sink = id % 5 === 2 ? -0.012 : 0;
      const q = [off(start + 1, -shove), off(mi, -shove), off(j - 1, -shove), off(j - 1, cw - shove), off(mi, cw - shove), off(start + 1, cw - shove)];
      const tx = rng.range(-0.012, 0.012) + (lf > 0 ? rng.range(-0.04, 0.04) : 0), tz = rng.range(-0.012, 0.012) + (lf > 0 ? rng.range(-0.04, 0.04) : 0);
      const [cx, cz] = centroid(q);
      const tone = rng.pick(['#ffffff', '#f8f6ee', '#fffdf4', '#efeee6']);
      b.add(block(q, ([x, z]) => curbTop + sink + lf + tx * (x - cx) + tz * (z - cz), -0.06, 0.022), stoneMat, { color: tone });
    }
  };
  const inGap = (x, z) => x > gapX[0] - 0.05 && x < gapX[1] + 0.05 && z > Z1 - 0.3 && z < walkOuterZ + 0.3;
  const curbBreaks = [[-4.3, 2.2, 0.5], [3.2, -6.9, 0.45], [7.8, -8.9, 0.5], [-9.4, 6.8, 0.45], [7.8, 0.9, 0.35]];
  const curbSkip = (x, z) => inGap(x, z) || curbBreaks.some(([a, d, r]) => hyp(x - a, z - d) < r) || rootDist(x, z) < 0.13;
  // Road edge lines travel so that "left" is the sidewalk side.
  curbRun(curbLines[0], -1, curbSkip);
  curbRun(curbLines[1], 1, curbSkip);

  // ---- paving -----------------------------------------------------------------------------------------------------
  const joints = [], paveHoles = [];
  const pavers = (stations, rows, stepN, y, skip) => {
    // stations: [{a:[x,z], c:[x,z]}]; rows across a→c; every paver spans stepN station intervals, rows staggered.
    for (let r = 0; r < rows; r++) {
      const t0 = r / rows, t1 = (r + 1) / rows, shift = r % 2 ? stepN >> 1 : 0;
      for (let i = -shift; i < stations.length - 1; i += stepN) {
        const lo = Math.max(0, i), hi = Math.min(stations.length - 1, i + stepN);
        if (hi - lo < 1) continue;
        const P_ = (k, t) => [lerp(stations[k].a[0], stations[k].c[0], t), lerp(stations[k].a[1], stations[k].c[1], t)];
        const poly = [];
        for (let k = lo; k <= hi; k++) poly.push(P_(k, t0));
        for (let k = hi; k >= lo; k--) poly.push(P_(k, t1));
        const [cx, cz] = centroid(poly);
        const f = oriented(dedupe(poly));
        if (f.length < 3 || Math.abs(area(f)) < 0.02) continue;
        const sk = skip(cx, cz, f);
        if (sk) { if (sk !== 'gap') paveHoles.push(f); continue; }
        joints.push(f[0], f[Math.floor(f.length / 2)]);
        const shr = insetVar(f, () => 0.016);
        const rd = rootDist(cx, cz), near = rd < 0.6 ? 1 - rd / 0.6 : 0;
        const tx = rng.range(-0.012, 0.012) + near * rng.range(-0.12, 0.12), tz = rng.range(-0.012, 0.012) + near * rng.range(-0.12, 0.12);
        const base = y + rng.range(-0.012, 0.004);
        const tone = mixc(rng.pick(['#ffffff', '#f4f3ec', '#fbf9f0', '#ebebe4', '#fffcf0']), '#dcecE4', rng() < 0.14 ? 0.8 : 0);
        b.add(block(shr, ([x, z]) => base + lift(cx, cz) * 0.5 + lift(x, z) * 0.5 + tx * (x - cx) + tz * (z - cz), -0.03, 0.014), stoneMat, { color: tone });
      }
    }
  };
  const missInner = [[-9.6, 1.2], [-5.0, 1.0], [-2.9, 1.9], [2.2, -1.0], [2.6, -5.9], [2.2, -7.7], [2.4, -10.9], [0.3, 1.3]];
  const missOuter = [[-8.2, 7.6], [-2.8, 7.75], [-1.2, 7.35], [2.2, 7.7], [4.8, 7.65], [8.45, 1.2], [8.5, -2.3], [8.3, -6.2], [8.5, -10.0]];
  const skipFn = (miss) => (x, z) => {
    if (rootDist(x, z) < 0.15) return 'root';
    if (miss.some(([a, d]) => hyp(x - a, z - d) < 0.42)) return 'miss';
    const c = distLine(stream, x, z);
    if (x > gapX[0] && x < gapX[1] - 0.32 && z > Z1 - 0.1) return 'gap';
    if (c.d < streamHW(c.u) + 0.16 && z > Z1 - 0.1) return 'gap';
    return false;
  };
  {
    const st = [], ds = 0.5, A = 0.52;
    for (let x = -E; x < 1.5; x += ds) st.push({ a: [x, A], c: [x, Z0 - cw] });
    st.push({ a: [1.52, A], c: [1.52, Z0 - cw] });
    for (let i = 0; i <= 5; i++) { const t = Math.PI / 2 - (i / 5) * (Math.PI / 2); st.push({ a: [1.52, A], c: [IC[0] + Math.cos(t) * (IR - cw), IC[1] + Math.sin(t) * (IR - cw)] }); }
    for (let z = IC[1] - 0.48; z > -E + 0.01; z -= ds) st.push({ a: [1.52, Math.min(z, A)], c: [X0 - cw, z] });
    st.push({ a: [1.52, -E], c: [X0 - cw, -E] });
    pavers(st, 2, 2, G.sidewalkY, skipFn(missInner));
  }
  {
    const st = [], ds = 0.42;
    for (let x = -E; x < OC[0]; x += ds) st.push({ a: [x, Z1 + cw], c: [x, walkOuterZ] });
    for (let i = 0; i <= 6; i++) { const t = Math.PI / 2 - (i / 6) * (Math.PI / 2); st.push({ a: [OC[0] + Math.cos(t) * (OR + cw), OC[1] + Math.sin(t) * (OR + cw)], c: [OC[0] + Math.cos(t) * (walkOuterX - OC[0]), OC[1] + Math.sin(t) * (walkOuterX - OC[0])] }); }
    for (let z = OC[1] - 0.42; z > -E + 0.01; z -= ds) st.push({ a: [X1 + cw, z], c: [walkOuterX, z] });
    st.push({ a: [X1 + cw, -E], c: [walkOuterX, -E] });
    pavers(st, 2, 2, G.sidewalkY, skipFn(missOuter));
  }
  // Remnant at the gap's east edge: what the bicycle stands on.
  b.add(block(kit.jag([[0.98, 7.06], [1.38, 7.06], [1.38, 7.86], [1.08, 7.72]], 0.3, 0.05, rng), ([x, z]) => 0.1 + (x - 1.2) * 0.04 + (z - 7.4) * -0.03, -0.02, 0.012), stoneMat, { color: '#f6f3ea' });

  // Roots shoulder up through the paving.
  for (const r of roots) {
    b.add(kit.tube(r.p, r.r, r.r * 0.42, 7, 18), flatMat, { color: '#9a7a5c' });
    const m = r.p[1], e = r.p[2];
    b.add(kit.tube([m, [m[0] + 0.2, 0.14, m[2] - 0.3], [m[0] + 0.5, 0.08, m[2] - 0.36]], r.r * 0.55, r.r * 0.2, 6), flatMat, { color: '#8a6b50' });
    b.add(kit.tube([e, [e[0] - 0.35, 0.13, e[2] + 0.32], [e[0] - 0.62, 0.07, e[2] + 0.34]], r.r * 0.5, r.r * 0.2, 6), flatMat, { color: '#8a6b50' });
  }

  // ---- manhole ----------------------------------------------------------------------------------------------------
  const mhTop = 0.12;
  {
    const wedges = 7, ra = mh.r + 0.06;
    for (let i = 0, a0 = rng() * TAU; i < wedges; i++) {
      const a1 = a0 + (TAU / wedges) * rng.range(0.82, 1.1), rb = rng.range(0.86, 1.04), arc = 5, q = [];
      for (let k = 0; k <= arc; k++) { const t = lerp(a0 + 0.035, a1 - 0.035, k / arc); q.push([mh.x + Math.cos(t) * ra, mh.z + Math.sin(t) * ra]); }
      for (let k = arc; k >= 0; k--) { const t = lerp(a0 + 0.035, a1 - 0.035, k / arc), w = rb + (k % 2 ? 0.04 : -0.05) * rng(); q.push([mh.x + Math.cos(t) * w, mh.z + Math.sin(t) * w]); }
      const tilt = rng.range(0.05, 0.16), up = rng.range(0.0, 0.05), am = (a0 + a1) / 2, dx = Math.cos(am), dz = Math.sin(am);
      b.add(block(q, ([x, z]) => mhTop + up + ((x - mh.x) * dx + (z - mh.z) * dz - 0.6) * -tilt * 1.2, -0.12, 0.02), stoneMat, { color: rng.pick(['#f4f1e6', '#e8e6dc', '#fbf7ea']) });
      a0 = a1 + 0; 
    }
    b.add(kit.torus(mh.r + 0.03, 0.045, 6, 26), ctx.surface('rust', { vertexColors: true }), { pos: [mh.x, mhTop + 0.012, mh.z], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.75], color: '#ffffff' });
    const shaft = ctx.toon({ color: '#ffffff', side: THREE.BackSide, vertexColors: true, dapple: false });
    b.add(new THREE.CylinderGeometry(mh.r + 0.03, mh.r + 0.03, 0.82, 22, 1, true), shaft, { pos: [mh.x, -0.31, mh.z], color: '#2c4a4c' });
    b.add(kit.cyl(mh.r + 0.03, mh.r + 0.03, 0.02, 22), flatMat, { pos: [mh.x, -0.7, mh.z], color: '#203a3c' });
    // rungs
    for (let i = 0; i < 3; i++) b.add(kit.torus(0.1, 0.012, 4, 10, Math.PI), ctx.surface('rust', { vertexColors: true }), { pos: [mh.x - mh.r + 0.03, -0.1 - i * 0.16, mh.z + 0.05], rot: [0, Math.PI / 2, 0], color: '#c9a080' });

    const coverTex = ctx.canvasTexture(256, 256, (g, w) => {
      const c = w / 2, R = w / 2 - 2;
      g.fillStyle = '#b55a36'; g.fillRect(0, 0, w, w);
      g.strokeStyle = '#7d3a2a'; g.fillStyle = '#7d3a2a'; g.lineWidth = 5;
      for (const r of [R - 2, R * 0.78, R * 0.34]) { g.beginPath(); g.arc(c, c, r, 0, TAU); g.stroke(); }
      g.lineWidth = 7;
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; g.beginPath(); g.moveTo(c + Math.cos(a) * R * 0.34, c + Math.sin(a) * R * 0.34); g.lineTo(c + Math.cos(a + 0.26) * R * 0.78, c + Math.sin(a + 0.26) * R * 0.78); g.moveTo(c + Math.cos(a) * R * 0.34, c + Math.sin(a) * R * 0.34); g.lineTo(c + Math.cos(a - 0.26) * R * 0.78, c + Math.sin(a - 0.26) * R * 0.78); g.stroke(); }
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + 0.2; g.beginPath(); g.ellipse(c + Math.cos(a) * R * 0.17, c + Math.sin(a) * R * 0.17, R * 0.1, R * 0.05, a, 0, TAU); g.fill(); }
      g.fillStyle = 'rgba(217,118,74,.55)';
      for (let i = 0; i < 14; i++) { g.beginPath(); g.ellipse(rng() * w, rng() * w, 8 + rng() * 22, 6 + rng() * 14, rng() * 3, 0, TAU); g.fill(); }
      g.fillStyle = 'rgba(125,187,74,.8)';
      for (let i = 0; i < 6; i++) { const a = 1.9 + rng() * 1.3, r = R * (0.72 + rng() * 0.26); g.beginPath(); g.ellipse(c + Math.cos(a) * r, c + Math.sin(a) * r, 10 + rng() * 16, 6 + rng() * 9, a, 0, TAU); g.fill(); }
    }, { repeat: false });
    const coverMat = ctx.toon({ map: coverTex, vertexColors: true });
    const cover = new THREE.CylinderGeometry(mh.r, mh.r, 0.075, 24, 1);
    // top cap uv is already polar-mapped by CylinderGeometry
    const dir = new THREE.Vector2(-0.34, 0.94).normalize(), ang = Math.atan2(dir.y, dir.x);
    const pos = [mh.x + dir.x * 1.24, 0.3, mh.z + dir.y * 1.24];
    b.add(cover, coverMat, { matrix: new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(Math.sin(ang), 0, -Math.cos(ang)).normalize(), 0.5), new THREE.Vector3(1, 1, 1)), color: '#ffffff' });
    // lifting rubble under the raised edge
    for (let i = 0; i < 5; i++) { const a = ang + rng.range(-0.8, 0.8), r = rng.range(0.7, 1.15); b.add(kit.rock(rng.range(0.07, 0.15), rng), stoneMat, { pos: [mh.x + Math.cos(a) * r, 0.14, mh.z + Math.sin(a) * r], color: '#f0ede2' }); }
  }

  // ---- terrace, retaining wall, steps, planters --------------------------------------------------------------------
  const brokenCorner = [T.x[1], T.z[0]];
  {
    const tOutline = [[T.x[0] + 0.2, T.z[0]], [T.x[1] - 1.05, T.z[0]], [T.x[1] - 0.72, T.z[0] + 0.16], [T.x[1] - 0.42, T.z[0] + 0.3], [T.x[1] - 0.3, T.z[0] + 0.58], [T.x[1], T.z[0] + 0.86], [T.x[1], E - 0.2], [T.x[0] + 0.2, E - 0.2]];   // the stone courses wrap this core
    b.add(plateTo(tOutline, [], T.y), atlasMat);

    const course = (ax, az, cx, cz, nx, nz, fo, skip) => {
      // one wall run from a to c; n is the outward face direction
      const L = hyp(cx - ax, cz - az), tx = (cx - ax) / L, tz = (cz - az) / L, H = (T.y - 0.02) / 3;
      for (let row = 0; row < 3; row++) {
        let s = row % 2 ? -0.28 : 0;
        while (s < L) {
          const l = rng.range(0.6, 0.86), a = Math.max(0, s), e = Math.min(L, s + l); s += l + 0.012;
          if (e - a < 0.14) continue;
          const m = (a + e) / 2, x = ax + tx * m, z = az + tz * m, y = 0.02 + H * (row + 0.5);
          if (skip(x, y, z)) continue;
          const dep = 0.26, out = rng.range(-0.018, 0.022), g = kit.chip(kit.box(e - a - 0.016, H - 0.016, dep, 2, 2, 1), 0.016, rng);
          const yaw = Math.atan2(tx, tz) - Math.PI / 2;
          b.add(g, wallMat, { pos: [x + nx * (out - dep / 2 + fo), y, z + nz * (out - dep / 2 + fo)], rot: [rng.range(-0.012, 0.012), yaw, 0], color: rng.pick(['#f4f1e6', '#e8e6dc', '#fbf7ea', '#dfded5', '#f0e9d6']) });
        }
      }
      // coping
      let s = 0;
      while (s < L) {
        const l = rng.range(0.9, 1.25), e = Math.min(L, s + l), m = (s + e) / 2, x = ax + tx * m, z = az + tz * m; const a0 = s; s += l + 0.02;
        if (skip(x, 1, z) || e - a0 < 0.18) continue;
        const g = kit.chip(kit.box(e - a0 - 0.02, 0.09, 0.36, 3, 1, 1), 0.011, rng);
        b.add(g, stoneMat, { pos: [x + nx * (fo - 0.13), T.y + 0.035, z + nz * (fo - 0.13)], rot: [0, Math.atan2(tx, tz) - Math.PI / 2, rng.range(-0.012, 0.012)], color: rng.pick(['#ffffff', '#fbf8ee', '#fffdf2']) });
      }
    };
    const corner = (x, y, z) => { const d = hyp(x - brokenCorner[0], z - brokenCorner[1]); return d < 0.62 + y * 0.42; };
    course(T.x[0] + 0.02, T.z[0], T.x[1], T.z[0], 0, -1, 0.1, (x, y, z) => corner(x, y, z));
    course(T.x[1], T.z[0], T.x[1], G.steps.z[0] - 0.02, 1, 0, 0.1, (x, y, z) => corner(x, y, z)); // the east wall breaks for the stair
    course(T.x[1], G.steps.z[1] + 0.02, T.x[1], E, 1, 0, 0.1, (x, y, z) => corner(x, y, z));
    course(T.x[1], E, T.x[0] + 0.02, E, 0, 1, -0.01, () => false);
    course(T.x[0] + 0.02, E, T.x[0] + 0.02, T.z[0], -1, 0, -0.03, () => false);
    // collapse at the corner: fallen blocks and spilled earth
    const fallen = [[-5.0, 8.32, 0.62, 0.3, 0.38, 0.5], [-5.55, 8.42, 0.5, 0.26, 0.34, -0.5], [-4.6, 8.74, 0.56, 0.26, 0.34, 1.2], [-4.74, 9.3, 0.44, 0.24, 0.3, 0.3], [-5.35, 8.5, 0.34, 0.2, 0.26, 1.0]];
    fallen.forEach(([x, z, w, h, d, yaw], i) => b.add(kit.chip(kit.box(w, h, d, 2, 2, 2), 0.02, rng), wallMat, { pos: [x, 0.05 + h / 2 + (i === 4 ? 0.2 : 0), z], rot: [rng.range(-0.25, 0.25), yaw, rng.range(-0.3, 0.3)], color: '#efebdf' }));
    b.add(kit.rock(0.62, rng, 0.42, 2), flatMat, { pos: [-5.3, 0.2, 9.0], rot: [0, 0.6, 0], scale: [1.3, 1, 1], color: '#8a6d50' });
    b.add(kit.rock(0.42, rng, 0.42, 2), flatMat, { pos: [-4.72, 0.1, 8.72], rot: [0, 2.1, 0], scale: [1.2, 1, 1], color: P.soil });

    // Steps: worn stones climbing west up the east wall. They face the sun and the default camera, so every nose reads.
    const stp = G.steps, rise = (T.y - G.soilY) / stp.count, run = (stp.x[1] - stp.x[0]) / stp.count, wide = stp.z[1] - stp.z[0];
    for (let i = 0; i < stp.count; i++) {
      const top = G.soilY + rise * (i + 1) + 0.012, nose = stp.x[1] - i * run, back = stp.x[0] - 0.02;
      let z = stp.z[0];
      const pieces = i % 2 ? [0.36, 0.64] : [0.59, 0.41];
      pieces.forEach((w) => {
        const z1 = z + w * wide, jx = rng.range(-0.022, 0.022), tilt = rng.range(-0.012, 0.012), mz = (z + z1) / 2, n = nose + jx;
        const q = [[n, z + 0.012], [n + 0.018, mz], [n - 0.008, z1 - 0.012], [back, z1 - 0.012], [back, z + 0.012]];
        b.add(block(q, ([, c]) => top + tilt * (c - mz) - 0.018 * Math.exp(-(((c - stp.z[0] - wide / 2) / 0.45) ** 2)), 0.02, 0.03), stepMat, { color: rng.pick(['#f1efe4', '#f8f4e8', '#e6e5da']) });
        z = z1;
      });
    }
    // cheek walls: a stepped kerb, the north one whole, the south one low and partly gone so it hides no tread from the camera
    for (let i = 0; i < stp.count; i++) {
      const nose = stp.x[1] - i * run, top = G.soilY + rise * (i + 1);
      const h = top + 0.09 - 0.03;
      b.add(kit.chip(kit.box(run + 0.012, h, 0.22, 2, 2, 1), 0.012, rng), stoneMat, { pos: [nose - run / 2, 0.03 + h / 2, stp.z[0] - 0.12], rot: [0, 0.012 * (i % 2 ? 1 : -1), 0], color: '#f4f1e6' });
      if (i === 1 || i === 2) continue;
      const hs = top - 0.03;
      b.add(kit.chip(kit.box(run + 0.012, hs, 0.2, 2, 2, 1), 0.014, rng), stoneMat, { pos: [nose - run / 2, 0.03 + hs / 2, stp.z[1] + 0.11], rot: [0, 0.02 * (i % 2 ? -1 : 1), 0], color: '#e4e2d6' });
    }
    // stepping stones: stair foot back to the sidewalk, and from the stair head around the planter across the terrace
    for (const [x, z, r] of [[-3.42, 10.72, 0.3], [-3.14, 10.12, 0.34], [-2.78, 9.56, 0.3], [-2.4, 9.02, 0.33], [-2.28, 8.4, 0.28]]) b.add(block(kit.circlePts(x, z, r, 7, rng, r * 0.45), () => G.soilY + 0.05, -0.05, 0.02), stoneMat, { color: '#f4f1e6' });
    const flags = [[-5.46, 10.2, 0.32], [-5.95, 9.72, 0.34], [-6.5, 9.42, 0.36], [-7.05, 9.15, 0.42], [-7.6, 9.75, 0.36], [-8.25, 9.45, 0.34], [-8.95, 9.5, 0.4], [-7.75, 10.55, 0.34], [-8.2, 11.2, 0.38], [-9.7, 9.32, 0.34]];
    for (const [x, z, r] of flags) b.add(block(kit.circlePts(x, z, r, 7, rng, r * 0.5), () => T.y + 0.04, T.y - 0.05, 0.02), stoneMat, { color: '#f4f1e6' });

    // Planters
    const brick = ['#c8705e', '#b5603f', '#cf8066', '#a9583f', '#d38d70'];
    G.planters.forEach((p, idx) => {
      const y0 = T.y + 0.01, cols = 4, bh = 0.075, x0 = p.x - p.w / 2, x1 = p.x + p.w / 2, z0 = p.z - p.d / 2, z1 = p.z + p.d / 2;
      const brickRun = (ax, az, cx, cz, yaw, drop) => {
        const L = hyp(cx - ax, cz - az), tx = (cx - ax) / L, tz = (cz - az) / L;
        for (let r = 0; r < cols; r++) {
          for (let s = r % 2 ? -0.13 : 0; s < L; s += 0.27) {
            const a = Math.max(0, s), e = Math.min(L, s + 0.26), m = (a + e) / 2, x = ax + tx * m, z = az + tz * m;
            if (e - a < 0.06 || drop(x, r, z)) continue;
            b.add(kit.chip(kit.box(e - a - 0.008, bh - 0.008, 0.13, 1, 1, 1), 0.004, rng), stoneMat, { pos: [x, y0 + bh * (r + 0.5), z], rot: [0, yaw + rng.range(-0.015, 0.015), 0], color: rng.pick(brick) });
          }
        }
      };
      const crack = (x, r, z) => idx === 0 && hyp(x - x1, z - z0) < 0.26 + r * 0.1;
      brickRun(x0, z0, x1, z0, 0, crack); brickRun(x0, z1, x1, z1, 0, () => false);
      brickRun(x0, z0, x0, z1, Math.PI / 2, () => false); brickRun(x1, z0, x1, z1, Math.PI / 2, crack);
      const capH = 0.05, capY = y0 + cols * bh + capH / 2 + 0.003;
      const cap = (x, z, w, d, ry) => b.add(kit.chip(kit.box(w, capH, d, 3, 1, 1), 0.006, rng), stoneMat, { pos: [x, capY, z], rot: [0, ry, rng.range(-0.008, 0.008)], color: '#ffffff' });
      if (idx === 0) { cap(p.x - 0.22, z0, p.w - 0.34, 0.2, 0); cap(x1 - 0.02, p.z + 0.14, p.d - 0.2, 0.2, Math.PI / 2); } else { cap(p.x, z0, p.w + 0.16, 0.2, 0); cap(x1, p.z, p.d - 0.02, 0.2, Math.PI / 2); }
      cap(p.x, z1, p.w + 0.16, 0.2, 0); cap(x0, p.z, p.d - 0.02, 0.2, Math.PI / 2);
      b.add(kit.box(p.w - 0.1, 0.32, p.d - 0.1), flatMat, { pos: [p.x, T.y + 0.1, p.z], color: '#5a4636' });
      for (let i = 0; i < 9; i++) b.add(kit.rock(rng.range(0.05, 0.1), rng, 0.6, 0), flatMat, { pos: [p.x + rng.range(-p.w / 2, p.w / 2) * 0.9, T.y + 0.27, p.z + rng.range(-p.d / 2, p.d / 2) * 0.9], color: P.soilDark });
    });
    // spilled bricks at the broken planter
    const p0 = G.planters[0];
    for (let i = 0; i < 4; i++) b.add(kit.chip(kit.box(0.25, 0.07, 0.12), 0.004, rng), stoneMat, { pos: [p0.x + p0.w / 2 + rng.range(0.14, 0.42), T.y + 0.04, p0.z - p0.d / 2 - rng.range(0.1, 0.34)], rot: [rng.range(-0.3, 0.3), rng.range(0, 3), rng.range(-0.3, 0.3)], color: rng.pick(brick) });
  }

  const statics = b.build({ castShadow: true, receiveShadow: true });
  group.add(statics);

  // ---- scatter ----------------------------------------------------------------------------------------------------
  const inRoad = (x, z) => pointInPoly(x, z, roadPoly);
  const inWalk = (x, z) => pointInPoly(x, z, innerWalk) || pointInPoly(x, z, outerWalk);
  const nearStream = (x, z, pad = 0.1) => { // the round pool at the spring reaches upstream of where the line starts
    if (hyp(x - W.spring[0], z - W.spring[1]) < 0.42 + pad) return true;
    const c = distLine(stream, x, z); return c.d < streamHW(c.u) + pad;
  };
  /** Height and zone for ground-cover placement. null where nothing may grow. */
  const site = (x, z) => {
    if (Math.abs(x) > 11.93 || Math.abs(z) > 11.93) return null;
    if (x > -11.02 && x < 1.48 && z > -11.02 && z < 0.48) return null;
    if (pondR(x, z) < 1.05 || nearStream(x, z, 0.1)) return null;
    if (x < T.x[1] + 0.12 && z > T.z[0] - 0.16) {
      return x < T.x[1] - 0.3 && z > T.z[0] + 0.22 && x > T.x[0] + 0.24 && z < 11.8 ? { y: T.y, zone: 'terrace' } : null;
    }
    if (atStair(x, z, 0.04)) return null;
    if (inRoad(x, z)) return { y: -0.03, zone: 'road' };
    if (inWalk(x, z)) return { y: 0.04, zone: 'walk' };
    return { y: G.soilY + mound(x, z), zone: 'soil' };
  };
  const pickC = (x, z, list, salt = 0) => { const n = vn(x * 0.8 + salt, z * 0.8 + 3 + salt) + (rng() - 0.5) * 0.16, k = Math.max(0, Math.min(list.length - 1, Math.floor((n - 0.28) * 2.3 * list.length))); return list[k]; };
  const Q = new THREE.Quaternion(), EU = new THREE.Euler(0, 0, 0, 'YXZ');
  const mat4 = (x, y, z, rx, ry, rz, sx, sy = sx, sz = sx) => { EU.set(rx, ry, rz); return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), Q.clone().setFromEuler(EU), new THREE.Vector3(sx, sy, sz)); };
  const instanced = (geo, mat, items, { soft = true, shadow = false } = {}) => {
    const m = new THREE.InstancedMesh(geo, mat, items.length);
    items.forEach((it, i) => { m.setMatrixAt(i, it.m); m.setColorAt(i, it.c); });
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.frustumCulled = false; m.castShadow = shadow; m.receiveShadow = true;
    if (soft) ctx.softEdge(m);
    return m;
  };
  const gradient = (g, lo, hi) => { // darker roots, lighter tips
    g.computeBoundingBox(); const p = g.attributes.position, c = new Float32Array(p.count * 3), top = g.boundingBox.max.y;
    for (let i = 0; i < p.count; i++) { const t = p.getY(i) / top, k = lo + (hi - lo) * t * t; c[i * 3] = k; c[i * 3 + 1] = k; c[i * 3 + 2] = k; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
  };
  const tuftGeo = (n, seg, spread) => {
    const parts = [], r = ctx.seeded('tuft' + n);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + r() * 0.5, h = r.range(0.72, 1.02), g = kit.blade(h, r.range(0.1, 0.15), r.range(0.14, 0.34) * spread, seg);
      g.rotateY(a); g.translate(Math.sin(a) * 0.05, 0, Math.cos(a) * 0.05); parts.push(g);
    }
    return gradient(kit.merge(parts), 0.5, 1.14);
  };
  const tallGeo = tuftGeo(5, 2, 1), shortGeo = tuftGeo(4, 1, 1.3);

  const grassC = [P.leafDeep, '#4fae59', P.leafMid, P.grass, P.grass, P.grassLit].map(col);
  const tall = [], short = [], clover = [], cush = [], litter = [], chunks = [], fernItems = [];
  const tuftAt = (x, y, z, h, list = tall, c = pickC(x, z, grassC)) => {
    list.push({ m: mat4(x, y, z, rng.range(-0.12, 0.12), rng() * TAU, rng.range(-0.12, 0.12), h * rng.range(0.85, 1.25), h, h * rng.range(0.85, 1.25)), c, x, z, y });
  };
  const cushionAt = (x, y, z, r, c) => cush.push({ m: mat4(x, y, z, rng.range(-0.1, 0.1), rng() * TAU, rng.range(-0.1, 0.1), r, r * rng.range(0.5, 0.78), r * rng.range(0.8, 1.15)), c });
  const mossC = [P.mossDeep, P.moss, P.moss, P.mossLit].map(col);
  const lerpEdge = (e, t) => [lerp(e.a[0], e.c[0], t), lerp(e.a[1], e.c[1], t)];

  // soil and terrace: dense, following the painted turf
  for (let i = 0; i < 26000 && tall.length < 1560; i++) {
    const x = rng.range(-12, 12), z = rng.range(-12, 12), s = site(x, z);
    if (!s || s.zone === 'road' || s.zone === 'walk') continue;
    if (s.zone === 'terrace' && inPlanter(x, z, 0.12)) continue;
    if (blocked(x, z, 0.02)) continue;
    const t = turf(x, z);
    if (t < 0.43 || rng() > smooth((t - 0.41) / 0.14) * 0.85 + 0.1) continue;
    tuftAt(x, s.y - 0.01, z, rng.range(0.3, 0.55) * (0.8 + t * 0.7));
  }
  for (let i = 0; i < 22000 && short.length < 2700; i++) {
    const x = rng.range(-12, 12), z = rng.range(-12, 12), s = site(x, z);
    if (!s || s.zone === 'road' || s.zone === 'walk') continue;
    if (s.zone === 'terrace' && inPlanter(x, z, 0.12)) continue;
    const t = turf(x, z);
    if (t < 0.37) continue;
    tuftAt(x, s.y - 0.01, z, rng.range(0.16, 0.28), short);
  }
  // cracks: tufts seated exactly in the gaps
  const edgeW = crackEdges.reduce((a, e) => a + e.w, 0);
  for (const e of crackEdges) {
    const count = Math.round((e.w / edgeW) * 1050 + rng());
    for (let i = 0; i < count; i++) {
      const [x, z] = lerpEdge(e, rng()); const px_ = x + rng.range(-0.05, 0.05), pz = z + rng.range(-0.05, 0.05);
      if (nearStream(px_, pz, 0.12) || blocked(px_, pz, -0.2)) continue;
      if (rng() < 0.42) tuftAt(px_, -0.03, pz, rng.range(0.22, 0.48) * (e.w > 0.07 ? 1.15 : 0.85));
      else tuftAt(px_, -0.03, pz, rng.range(0.14, 0.26), short);
      if (rng() < 0.12) cushionAt(px_, 0.0, pz, rng.range(0.07, 0.14), rng.pick(mossC));
    }
  }
  // potholes filled with green
  for (const poly of potholes) {
    const [cx, cz] = centroid(poly); let n = 0;
    for (let i = 0; i < 300 && n < 34; i++) {
      const x = cx + rng.range(-1, 1), z = cz + rng.range(-1, 1);
      if (!pointInPoly(x, z, poly) || nearStream(x, z, 0.12)) continue;
      n++; tuftAt(x, -0.03, z, rng.range(0.2, 0.46));
      if (n % 3 === 0) cushionAt(x, -0.02, z, rng.range(0.1, 0.2), rng.pick(mossC));
      if (n % 2 === 0) tuftAt(x + 0.05, -0.03, z - 0.05, 0.2, short);
    }
  }
  // gutter: a thin rumour of green along the curbs
  for (const l of curbLines) {
    for (const p of subdivide(l, 0.28, true)) {
      const t = vn(p[0] * 0.8, p[1] * 0.8), off = 0.09;
      if (t < 0.52 || rng() > 0.62) continue;
      const x = p[0] + rng.range(-off, off), z = p[1] + rng.range(-off, off), s = site(x, z);
      if (!s || s.zone !== 'road' || blocked(x, z, -0.3)) continue;
      tuftAt(x, 0, z, rng.range(0.12, 0.22), short);
      if (rng() < 0.35) cushionAt(x, 0.0, z, rng.range(0.06, 0.12), rng.pick(mossC));
    }
  }
  // road: an occasional defiant tuft
  for (let i = 0; i < 26; i++) {
    const x = rng.range(-12, 8), z = rng.range(-12, 7), s = site(x, z);
    if (!s || s.zone !== 'road' || blocked(x, z)) continue;
    const y = roadTop(x, z); if (y === null) continue;
    tuftAt(x, y - 0.01, z, rng.range(0.1, 0.18), short);
  }
  // paving: holes fill up, joints get whiskers
  for (const f of paveHoles) {
    const [cx, cz] = centroid(f);
    for (let i = 0; i < 12; i++) {
      const x = cx + rng.range(-0.34, 0.34), z = cz + rng.range(-0.3, 0.3);
      if (!pointInPoly(x, z, f) || blocked(x, z, -0.15) || nearStream(x, z, 0.1)) continue;
      if (i % 3 === 0) cushionAt(x, 0.05, z, rng.range(0.1, 0.17), rng.pick(mossC));
      else tuftAt(x, 0.04, z, rng.range(0.18, 0.4), i % 3 === 1 ? tall : short);
    }
  }
  joints.forEach((j) => {
    if (rng() > 0.22 || blocked(j[0], j[1], -0.25)) return;
    const s = site(j[0], j[1]); if (!s) return;
    tuftAt(j[0], 0.1, j[1], rng.range(0.1, 0.2), short);
    if (rng() < 0.25) cushionAt(j[0], 0.115, j[1], rng.range(0.05, 0.1), rng.pick(mossC));
  });
  // wall feet: a green skirt along the building and terrace
  const skirt = (ax, az, cx, cz, n, y) => {
    for (let i = 0; i < n; i++) {
      const t = rng(), x = lerp(ax, cx, t) + rng.range(-0.06, 0.06), z = lerp(az, cz, t) + rng.range(-0.06, 0.06);
      if (blocked(x, z, -0.2) || vn(x * 0.9 + 3, z * 0.9) < 0.42) continue;
      const k = rng();
      if (k < 0.46) tuftAt(x, y, z, rng.range(0.2, 0.45));
      else if (k < 0.8) cushionAt(x, y + 0.04, z, rng.range(0.09, 0.18), rng.pick(mossC));
      else tuftAt(x, y, z, rng.range(0.14, 0.24), short);
    }
  };
  skirt(-11, 0.58, 1.5, 0.58, 150, 0.1); skirt(1.58, 0.5, 1.58, -11, 120, 0.1);
  skirt(-12, 8.62, -5.1, 8.62, 94, G.soilY); skirt(-4.86, 9.2, -4.86, 11.9, 50, G.soilY);
  skirt(gapX[0] - 0.05, Z1 + 0.05, gapX[0] - 0.05, walkOuterZ, 16, 0.02); skirt(-12, walkOuterZ + 0.03, gapX[0], walkOuterZ + 0.03, 90, G.soilY);
  skirt(gapX[1] + 0.05, walkOuterZ + 0.03, 6, walkOuterZ + 0.03, 40, G.soilY); skirt(walkOuterX + 0.03, 4.8, walkOuterX + 0.03, -12, 90, G.soilY);

  // moss cushions on turf, steps, wall heads
  for (let i = 0; i < 5000 && cush.length < 300; i++) {
    const x = rng.range(-12, 12), z = rng.range(-12, 12), s = site(x, z);
    if (!s || s.zone === 'road' || s.zone === 'walk' || blocked(x, z, 0.1) || (s.zone === 'terrace' && inPlanter(x, z, 0.1))) continue;
    if (vn(x * 1.3 + 8, z * 1.3) < 0.56) continue;
    cushionAt(x, s.y, z, rng.range(0.12, 0.3), rng.pick(mossC));
  }
  {
    // On the steps moss only holds the sheltered ends and the back of each tread: the noses and the walking line stay bare stone.
    const stp = G.steps, rise = (T.y - G.soilY) / stp.count, run = (stp.x[1] - stp.x[0]) / stp.count;
    for (let i = 0; i < stp.count; i++) {
      const y = G.soilY + rise * (i + 1), nose = stp.x[1] - i * run;
      for (let k = 0; k < 3; k++) {
        const north = k !== 1, zc = north ? stp.z[0] + rng.range(0.02, 0.26) * (0.4 + rng()) : stp.z[1] - rng.range(0.02, 0.22);
        cushionAt(nose - rng.range(0.17, 0.27), y + 0.002, zc, rng.range(0.05, 0.1), rng.pick(mossC));
      }
    }
    // moss spilling over the coping
    for (let i = 0; i < 60; i++) {
      const front = rng() < 0.6, x = front ? rng.range(T.x[0], T.x[1] - 0.9) : T.x[1] - 0.08, z = front ? T.z[0] + 0.02 : rng.range(9.6, 11.9);
      if (!front && z > G.steps.z[0] - 0.1 && z < G.steps.z[1] + 0.1) continue;
      if (vn(x * 0.7, z * 0.7 + 6) < 0.54) continue;
      cushionAt(x, T.y + 0.075, z, rng.range(0.07, 0.17), rng.pick(mossC));
    }
  }

  // clover and low leafy cover
  const cloverGeo = (() => {
    const parts = [];
    for (let k = 0; k < 3; k++) { const l = kit.leaf(0.15, 0.13, 0.15); l.rotateX(-0.2); l.rotateY((k / 3) * TAU + 0.3); l.translate(0, 0.05, 0); parts.push(l); }
    const st = kit.blade(0.06, 0.012, 0, 1); parts.push(st);
    return kit.merge(parts);
  })();
  const cloverC = ['#58b45a', '#6fc456', P.leafMid, P.ivyLit, P.leafDeep].map(col);
  for (let i = 0; i < 26000 && clover.length < 1000; i++) {
    const x = rng.range(-12, 12), z = rng.range(-12, 12), s = site(x, z);
    if (!s || s.zone === 'road' || (s.zone === 'terrace' && inPlanter(x, z, 0.1))) continue;
    if (vn(x * 0.9 + 21, z * 0.9 + 2) < 0.5 || blocked(x, z, -0.1) || s.zone === 'walk') continue;
    for (let k = 0; k < 3; k++) {
      const a = x + rng.range(-0.14, 0.14), d = z + rng.range(-0.14, 0.14), sc = rng.range(0.7, 1.15);
      clover.push({ m: mat4(a, s.y, d, rng.range(-0.15, 0.15), rng() * TAU, rng.range(-0.15, 0.15), sc), c: pickC(x, z, cloverC, 5) });
    }
  }

  // ivy strands over the retaining wall: clover clusters walking down the face
  const ivyStrand = (x, z, nx, nz, drop) => {
    let px_ = x, y = T.y + 0.08;
    while (y > T.y + 0.08 - drop && y > 0.08) {
      const left = 1 - (T.y + 0.08 - y) / drop;
      for (let k = 0; k < 1 + Math.round(left * 2.4); k++) {
        const j = rng.range(-0.15, 0.15) * (0.4 + left), ax = nx !== 0 ? 0 : j, az = nx !== 0 ? j : 0, yaw = Math.atan2(nx, nz);
        clover.push({ m: mat4(px_ + nx * 0.03 + ax, y + rng.range(-0.05, 0.05), z + nz * 0.03 + az, 1.25, yaw + rng.range(-0.5, 0.5), rng.range(-0.5, 0.5), rng.range(0.7, 1.05)), c: rng.pick(cloverC) });
      }
      y -= 0.12; px_ += nx === 0 ? rng.range(-0.09, 0.09) : 0;
    }
  };
  for (const x of [-11.4, -11.0, -10.55, -9.5, -9.1, -8.45, -7.3, -6.7, -5.75]) ivyStrand(x, T.z[0] - 0.12, 0, -1, rng.range(0.35, 0.8));
  for (const z of [9.62, 11.8]) ivyStrand(T.x[1] + 0.12, z, 1, 0, rng.range(0.35, 0.8));
  for (const z of [9.3, 10.6, 11.1]) ivyStrand(T.x[0] - 0.02, z, -1, 0, rng.range(0.3, 0.7));
  for (const x of [-11.2, -10.1, -8.9, -7.6, -6.4]) ivyStrand(x, E + 0.0, 0, 1, rng.range(0.3, 0.75));

  // leaves and rubble
  const litGeo = kit.leaf(0.15, 0.085, 0.3);
  const litC = ['#d9c56a', P.leafGold, '#c9a556', '#c98a58', P.leafMid, '#a9c45a', '#d9b45a'].map(col);
  const litterAt = (x, z, y) => litter.push({ m: mat4(x, y + 0.012, z, rng.range(-0.25, 0.25), rng() * TAU, rng.range(-0.25, 0.25), rng.range(0.75, 1.35)), c: rng.pick(litC) });
  for (let i = 0; i < 6000 && litter.length < 300; i++) {
    const x = rng.range(-12, 12), z = rng.range(-12, 8.5), s = site(x, z);
    if (!s || blocked(x, z, 0.02)) continue;
    let y = s.y;
    if (s.zone === 'road') {
      const near = distCurb(x, z);
      if (rng() > 0.02 + 0.75 * Math.exp(-near * 2.6) || nearStream(x, z, 0.18)) continue;
      const t = roadTop(x, z); if (t === null) continue; y = t;
    } else if (s.zone === 'walk') { if (rng() > 0.6) continue; y = G.sidewalkY + lift(x, z) + 0.004; } else if (rng() > 0.2) continue;
    litterAt(x, z, y);
  }
  const chunkGeo = (() => { const r = ctx.seeded('chunk'); return kit.rock(1, r, 0.68, 0); })();
  const chunkC = ['#d9d6cb', '#c6c4b9', '#b9b8ae', '#e5e0d2', '#8f9398'].map(col);
  const chunkAt = (x, y, z, r) => chunks.push({ m: mat4(x, y + r * 0.2, z, rng() * 3, rng() * 3, rng() * 3, r, r * rng.range(0.55, 0.9), r * rng.range(0.7, 1.2)), c: rng.pick(chunkC) });
  for (const [x, z, r] of curbBreaks) for (let i = 0; i < 7; i++) { const a = rng() * TAU, d = rng.range(0.05, r + 0.15), px_ = x + Math.cos(a) * d, pz = z + Math.sin(a) * d; if (!blocked(px_, pz, -0.2)) chunkAt(px_, 0.03, pz, rng.range(0.05, 0.13)); }
  for (let i = 0; i < 36; i++) { // rubble at the broken sidewalk lips, clear of the stream
    const side = i % 2, x = side ? gapX[1] + rng.range(-0.28, 0.1) : gapX[0] + rng.range(-0.1, 0.22), z = rng.range(Z1 - 0.05, walkOuterZ + 0.15);
    if (nearStream(x, z, 0.14)) continue;
    chunkAt(x, 0.05, z, rng.range(0.05, 0.13));
  }
  for (let i = 0; i < 30; i++) { const x = rng.range(-6.2, -4.5), z = rng.range(8.2, 9.3), s = site(x, z); chunkAt(x, s ? s.y : 0.05, z, rng.range(0.05, 0.14)); }
  for (let i = 0; i < 44; i++) { // scatter along the building foot and the gutter
    const t = rng(), onS = rng() < 0.55, x = onS ? lerp(-10.8, 1.4, t) : rng.range(1.65, 3.1), z = onS ? rng.range(0.62, 2.0) : lerp(-11, 0.4, t);
    if (blocked(x, z, 0.05)) continue;
    chunkAt(x, G.sidewalkY, z, rng.range(0.035, 0.08));
  }
  for (let i = 0; i < 40; i++) {
    const x = rng.range(-12, 8), z = rng.range(-12, 7), s = site(x, z);
    if (!s || s.zone !== 'road' || blocked(x, z, 0.05) || nearStream(x, z, 0.25)) continue;
    const y = roadTop(x, z); if (y === null || distCurb(x, z) > 1.3) continue;
    chunkAt(x, y, z, rng.range(0.03, 0.075));
  }

  // ---- ferns ------------------------------------------------------------------------------------------------------
  const frondGeo = (() => {
    // Slender overlapping leaflets on an arching spine that droops at the tip.
    const parts = [], pairs = 15, spine = (t) => [0.62 * Math.sin(Math.PI * Math.min(1, t * 0.88)) - 0.16 * t * t, t * (1 - 0.12 * t)];
    for (let i = 0; i < pairs; i++) {
      const t = (i + 1.2) / (pairs + 0.8), [y, z] = spine(t), [y2, z2] = spine(t + 0.04), slope = Math.atan2(y2 - y, z2 - z);
      const l = 0.27 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.6)), 0.75) + 0.035;
      for (const d of [-1, 1]) {
        const lf = kit.leaf(l, Math.max(0.05, l * 0.34), 0.2); lf.rotateY(d * 1.2); lf.rotateX(-slope); lf.translate(0, y, z); parts.push(lf);
      }
    }
    const pts = [];
    for (let i = 0; i <= 5; i++) { const [y, z] = spine(i / 5); pts.push(-0.012, y, z, 0.012, y, z); }
    const st = new THREE.BufferGeometry(); st.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    st.setIndex(Array.from({ length: 5 }, (_, i) => [i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2]).flat());
    parts.push(st);
    const g = kit.merge(parts), p = g.attributes.position, c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { const k = 0.66 + 0.52 * Math.min(1, p.getZ(i)); c[i * 3] = k; c[i * 3 + 1] = k; c[i * 3 + 2] = k; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  })();
  const fernC = [P.fern, '#3f9f62', P.leafMid, '#62c25f', P.ivyLit].map(col);
  const fernClump = (x, y, z, n, len, pitch, ring = 0.06) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rng.range(-0.3, 0.3), l = len * rng.range(0.72, 1.18), pt = pitch * rng.range(0.7, 1.25);
      fernItems.push({ m: mat4(x + Math.sin(a) * ring, y, z + Math.cos(a) * ring, -pt, a, rng.range(-0.22, 0.22), l, l * rng.range(0.95, 1.2), l), c: rng.pick(fernC) });
    }
  };
  fernClump(mh.x, -0.08, mh.z, 13, 1.7, 0.3, 0.3);                       // the burst: long fronds arching out over the rim
  fernClump(mh.x + 0.05, -0.05, mh.z - 0.04, 10, 1.35, 0.62, 0.22);
  fernClump(mh.x - 0.08, 0, mh.z + 0.02, 7, 0.95, 0.95, 0.14);
  for (const [x, z, n, l] of [[-5.05, 8.52, 6, 0.72], [-11.5, 8.52, 6, 0.7], [-9.3, 8.5, 5, 0.6], [-4.55, 9.62, 6, 0.7], [1.72, -9.9, 4, 0.55], [2.0, 0.72, 5, 0.6], [-10.2, 0.78, 5, 0.6], [8.6, -7.4, 4, 0.5], [-11.5, -11.5, 6, 0.7], [11.3, -11.3, 5, 0.7], [11.4, 7.6, 5, 0.7]]) {
    const s = site(x, z); fernClump(x, s ? s.y : 0.06, z, n, l * 1.3, 0.34);
  }

  // ---- flowers ----------------------------------------------------------------------------------------------------
  const fb = ctx.batch();
  const flowerMat = flatUp(ctx.toon({ side: THREE.DoubleSide, vertexColors: true, translucent: 0.8 }));
  const stemG = kit.blade(1, 0.035, 0.1, 2), bladeLeaf = kit.leaf(0.2, 0.075, 0.2);
  const daisy = kit.flower(0.115, 6), cosmos = kit.flower(0.15, 8), small = kit.flower(0.07, 5);
  const centre = kit.ico(0.034, 0);
  const paletteF = [
    [P.flowerYellow, daisy, '#f49b2e'], [P.flowerWhite, daisy, P.flowerYellow], [P.flowerBlue, small, P.flowerWhite],
    [P.flowerPurple, cosmos, P.flowerYellow], [P.bougainLit, cosmos, P.flowerYellow], [P.flowerWhite, small, P.flowerYellow], [P.bougain, small, P.sunGold],
  ];
  const addFlower = (x, y, z, h, kindA) => {
    const [c, g, ce] = kindA, yaw = rng() * TAU, lean = [rng.range(-0.22, 0.22), yaw, rng.range(-0.22, 0.22)];
    const tip = new THREE.Vector3(0, h, 0.08 * h).applyEuler(new THREE.Euler(lean[0], lean[1], lean[2], 'YXZ'));
    fb.add(stemG, flowerMat, { pos: [x, y, z], rot: lean, scale: [1, h, h], color: rng.pick(['#58ad58', P.grass, '#3f9458']) });
    if (h > 0.2) fb.add(bladeLeaf, flowerMat, { pos: [x, y + h * 0.35, z], rot: [-0.3, rng() * TAU, 0], scale: 0.9, color: P.leafMid });
    const s = rng.range(0.85, 1.35), rx = rng.range(-0.45, 0.45), rz = rng.range(-0.45, 0.45);
    fb.add(g, flowerMat, { pos: [x + tip.x, y + tip.y, z + tip.z], rot: [rx, rng() * TAU, rz], scale: s, color: c });
    fb.add(centre, flowerMat, { pos: [x + tip.x, y + tip.y + 0.012, z + tip.z], color: ce });
  };
  const clump = (cx, cz, rad, n, hLo, hHi, kinds, fixedY = null) => {
    for (let i = 0, k = 0; i < n * 8 && k < n; i++) {
      const a = rng() * TAU, r = rad * Math.sqrt(rng()), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r * 0.9;
      const s = fixedY === null ? site(x, z) : { y: fixedY, zone: 'x' };
      if (!s || s.zone === 'road' || s.zone === 'walk' || (fixedY === null && (blocked(x, z, -0.1) || inPlanter(x, z, 0.1)))) continue;
      k++; addFlower(x, s.y, z, rng.range(hLo, hHi), rng.pick(kinds));
    }
  };
  const kF = paletteF;
  G.planters.forEach((p, i) => {
    const kinds = i === 0 ? [kF[0], kF[1], kF[3], kF[6]] : [kF[4], kF[1], kF[2], kF[5]];
    for (let k = 0; k < 66; k++) {
      const x = p.x + rng.range(-p.w / 2 + 0.1, p.w / 2 - 0.1), z = p.z + rng.range(-p.d / 2 + 0.1, p.d / 2 - 0.1);
      addFlower(x, T.y + 0.26, z, rng.range(0.12, 0.34), rng.pick(kinds));
    }
    for (let k = 0; k < 30; k++) {
      const x = p.x + rng.range(-p.w / 2 + 0.1, p.w / 2 - 0.1), z = p.z + rng.range(-p.d / 2 + 0.1, p.d / 2 - 0.1);
      tuftAt(x, T.y + 0.26, z, rng.range(0.18, 0.34));
    }
  });
  clump(4.4, 8.75, 0.75, 34, 0.2, 0.4, [kF[0], kF[1], kF[5]]);
  clump(-1.45, 11.25, 0.55, 26, 0.16, 0.34, [kF[3], kF[1], kF[2]]);       // FLOWER_SPOT sits inside the pond ellipse; planted on the rim instead
  clump(9.9, 7.2, 0.85, 34, 0.3, 0.6, [kF[4], kF[3], kF[0]]);
  clump(-3.2, 8.4, 0.72, 32, 0.35, 0.6, [kF[0], kF[4], kF[1]]);
  // loose scatter of wildflowers through the turf
  for (let i = 0; i < 900; i++) {
    const x = rng.range(-12, 12), z = rng.range(-12, 12), s = site(x, z);
    if (!s || s.zone === 'road' || s.zone === 'walk' || blocked(x, z, -0.05) || (s.zone === 'terrace' && inPlanter(x, z, 0.1))) continue;
    if (vn(x * 0.7 + 40, z * 0.7) < 0.56 || turf(x, z) < 0.42) continue;
    addFlower(x, s.y, z, rng.range(0.12, 0.3), rng.pick(kF));
  }
  group.add(ctx.softEdge(fb.build({ castShadow: false, receiveShadow: true })));

  // ---- soil patches ------------------------------------------------------------------------------------------------
  // Runs last with its own seed: nothing above shifts, and the capped turf scatter keeps its share of the budget.
  {
    const R = ctx.seeded('soil-patches'), patchClover = ['#4fa85a', P.leafMid, '#5fb45a'].map(col), patchMoss = [P.moss, P.moss, P.mossLit].map(col);
    const inBand = (x, z) => {
      const s = site(x, z);
      return s && s.zone === 'soil' && pondR(x, z) > 1.2 && !blocked(x, z, 0.02) ? s : null;
    };
    for (const p of soilPatches) {
      const tries = Math.round(Math.PI * p.rx * p.rz * 60);
      for (let i = 0; i < tries; i++) {
        const a = R() * TAU, q = Math.sqrt(R()) * 1.2, lx = Math.cos(a) * q * p.rx, lz = Math.sin(a) * q * p.rz;
        const x = p.x + lx * p.cos - lz * p.sin, z = p.z + lx * p.sin + lz * p.cos, { v, kind } = cover(x, z);
        if (v < 0.12 || kind !== p.kind || R() > 0.15 + v) continue;
        const s = inBand(x, z); if (!s) continue;
        // the paint carries the patch: leaves only break its surface, in tones close to it, so it stays one quiet shape
        if (kind === 'clover') clover.push({ m: mat4(x, s.y, z, R.range(-0.15, 0.15), R() * TAU, R.range(-0.15, 0.15), R.range(0.7, 1.05)), c: R.pick(patchClover) });
        else if (R() < 0.14) cushionAt(x, s.y - 0.02, z, R.range(0.08, 0.17), R.pick(patchMoss));
        if (R() < 0.1) tuftAt(x, s.y - 0.01, z, R.range(0.16, 0.26), short);
      }
    }
    // what stays bare keeps a few stragglers, so it reads as thin ground rather than a filled shape
    for (let i = 0, n = 0; i < 3000 && n < 70; i++) {
      const x = R.range(-4.8, 11.9), z = R.range(8.05, 11.9);
      if (turf(x, z) >= 0.43 || cover(x, z).v > 0) continue;
      const s = inBand(x, z); if (!s) continue;
      n++; tuftAt(x, s.y - 0.01, z, R.range(0.14, 0.28), short);
      if (n % 4 === 0) tuftAt(x + R.range(-0.08, 0.08), s.y - 0.01, z + R.range(-0.08, 0.08), R.range(0.26, 0.42), tall);
    }
  }

  // ---- instanced meshes -------------------------------------------------------------------------------------------
  const grassMat = leafMat;
  const dome = (() => {
    const a = new THREE.SphereGeometry(1, 6, 3, 0, TAU, 0, Math.PI / 2), c = new THREE.SphereGeometry(0.66, 6, 3, 0.4, TAU, 0, Math.PI / 2).translate(0.62, 0, 0.3).scale(1, 1.05, 1);
    return gradient(kit.merge([a, c]), 0.72, 1.14);
  })();
  const cushMat = ctx.toon({ vertexColors: true });
  group.add(instanced(shortGeo, grassMat, short));
  group.add(instanced(cloverGeo, flatUp(ctx.toon({ side: THREE.DoubleSide, translucent: 0.55 })), clover));
  group.add(instanced(dome, cushMat, cush));
  group.add(instanced(litGeo, flatUp(ctx.toon({ side: THREE.DoubleSide })), litter));
  group.add(instanced(chunkGeo, ctx.toon({ }), chunks, { soft: false, shadow: true }));

  // Tall grass: split into spatial groups, each sheared as one.
  const sway = [];
  const groupsN = 3, buckets = new Map();
  for (const it of tall) {
    const key = it.y > 0.7 ? 'T' : `${Math.floor(((it.x + 12) / 24) * groupsN)}_${Math.floor(((it.z + 12) / 24) * 2)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(it);
  }
  for (const [key, items] of buckets) {
    const mesh = instanced(tallGeo, grassMat, items);
    mesh.matrixAutoUpdate = false;
    const n = items.length, cx = items.reduce((a, q) => a + q.x, 0) / n, cz = items.reduce((a, q) => a + q.z, 0) / n;
    sway.push({ mesh, cx, cz, y0: key === 'T' ? T.y : 0.02, amp: 0.085 });
    group.add(mesh);
  }
  const fernMesh = instanced(frondGeo, grassMat, fernItems);
  fernMesh.matrixAutoUpdate = false;
  sway.push({ mesh: fernMesh, cx: mh.x, cz: mh.z, y0: 0.05, amp: 0.035 });
  group.add(fernMesh);

  return {
    group,
    update(t) {
      for (const s of sway) {
        const w = ctx.wind(t, s.cx, s.cz), kx = (0.5 + w) * s.amp * 0.72, kz = (0.5 + w) * s.amp * -0.36 + Math.sin(t * 1.3 + s.cx) * s.amp * 0.14;
        s.mesh.matrix.set(1, kx, 0, -kx * s.y0, 0, 1, 0, 0, 0, kz, 1, -kz * s.y0, 0, 0, 0, 1);
        s.mesh.matrixWorldNeedsUpdate = true;
      }
    },
  };
}
