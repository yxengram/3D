// north — v3 outer ring: the quiet lanes north of the old corner (13 houses) and the shrine hill in the north-west corner of the plinth.
// Every position comes from layout: BUILDINGS with o === 'north', RING_ROADS, RING_ZONES.shrineHill, TORII, WOODS.
//
// Draw calls: the housekit's 8, one stone mesh, one earth mesh, one swinging mesh (everything that moves, rewritten on the CPU each frame).
import * as THREE from 'three';
import { createHouseKit } from '../core/housekit.js';

const Q = Math.PI / 2, TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (x) => { const t = clamp(x); return t * t * (3 - 2 * t); };
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const rgb = (hex, m = 1) => { const c = new THREE.Color(hex); return [c.r * m, c.g * m, c.b * m]; };

/** Plain triangles with flat normals, oriented by a reference direction. */
class Pile {
  constructor() { this.p = []; this.n = []; this.c = []; }
  tri(a, b, c, k, ref) {
    let n = cross(sub(b, a), sub(c, a)); if (ref && dot(n, ref) < 0) { const t = b; b = c; c = t; n = [-n[0], -n[1], -n[2]]; }
    n = norm(n); this.p.push(...a, ...b, ...c); for (let i = 0; i < 3; i++) { this.n.push(...n); this.c.push(k[0], k[1], k[2]); }
  }
  quad(a, b, c, d, k, ref) { this.tri(a, b, c, k, ref); this.tri(a, c, d, k, ref); }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    return g;
  }
}

/** Everything that moves, in one mesh: parts hinge about a pivot by a closed-form angle; the rest pose is kept and each frame is written from it. */
class Swing {
  constructor(ctx) { this.ctx = ctx; this.pos = []; this.nor = []; this.uv = []; this.col = []; this.parts = []; }
  /** geo: any BufferGeometry already in world coordinates. o: { pivot, axis, amp, speed, phase, mode, bend } */
  add(geo, o) {
    const g = geo.index ? geo.toNonIndexed() : geo, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, C = g.attributes.color, start = this.pos.length / 3, tone = rgb(o.color ?? '#ffffff');
    for (let i = 0; i < P.count; i++) {
      this.pos.push(P.getX(i), P.getY(i), P.getZ(i)); this.nor.push(N.getX(i), N.getY(i), N.getZ(i)); this.uv.push(U ? U.getX(i) : 0, U ? U.getY(i) : 0);
      this.col.push(tone[0] * (C ? C.getX(i) : 1), tone[1] * (C ? C.getY(i) : 1), tone[2] * (C ? C.getZ(i) : 1));
    }
    this.parts.push({ start, count: P.count, pivot: o.pivot, axis: norm(o.axis ?? [1, 0, 0]), amp: (o.amp ?? 0.1) * 0.7, speed: o.speed ?? 1, phase: o.phase ?? 0, mode: o.mode ?? 0, bend: o.bend ?? 0 });
  }
  finish(group, material) {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry(), rest = new Float32Array(this.pos);
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    const mesh = new THREE.Mesh(g, material); mesh.castShadow = false; mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.name = 'north-swing'; group.add(mesh);
    const P = g.attributes.position, A = P.array, wind = this.ctx.wind;
    const update = (t) => {
      for (const q of this.parts) {
        const [px, py, pz] = q.pivot, [ax, ay, az] = q.axis, sp = q.speed, ph = q.phase;
        const gust = wind(t, px, pz);
        let th;
        if (q.mode === 1) { const s = Math.max(0, Math.sin(t * 0.43 * sp + ph)); th = q.amp * (s * s * s * s * s * s * Math.sin(t * 7.1 + ph) + 0.1 * Math.sin(t * 1.1 + ph)); }   // a loose thing: still, then a little rattle
        else th = q.amp * (0.62 * Math.sin(t * 1.3 * sp + ph) + 0.28 * Math.sin(t * 2.9 * sp + ph * 1.7) + 0.5 * gust);
        for (let i = q.start * 3, e = i + q.count * 3; i < e; i += 3) {
          const rx = rest[i] - px, ry = rest[i + 1] - py, rz = rest[i + 2] - pz;
          let a = th;
          if (q.bend) { const d = Math.hypot(rx, ry, rz); a = th * (0.55 + q.bend * d) + q.amp * 0.3 * Math.sin(t * 3.7 * sp + ph + d * 5); }
          A[i] = rest[i] + a * (ay * rz - az * ry); A[i + 1] = rest[i + 1] + a * (az * rx - ax * rz); A[i + 2] = rest[i + 2] + a * (ax * ry - ay * rx);
        }
      }
      P.needsUpdate = true;
    };
    return { mesh, update };
  }
}

export function build(ctx) {
  const { layout, P, kit } = ctx, { BUILDINGS, RING_ZONES, TORII, WOODS, buildingBox, RING_ROADS } = layout;
  const group = new THREE.Group(); group.name = 'north';
  const H = createHouseKit(ctx, { name: 'north', seed: 'north' });
  H.density = 0.84;
  const byId = Object.fromEntries(BUILDINGS.filter((b) => b.o === 'north').map((b) => [b.id, b]));
  const stoneMat = ctx.surface('concrete', { vertexColors: true, color: '#ffffff' }), wallMat = ctx.surface('concrete', { vertexColors: true, color: '#ffffff', moss: 0.16 });   // the retaining wall takes its moss from hand-laid patches, not the world overlay, which filled whole stones with lime
  const earthMat = ctx.surface('soil', { vertexColors: true, color: '#ffffff', moss: 0.56 });
  const stones = ctx.batch(), hillStone = new Pile(), swing = new Swing(ctx), soft = ctx.batch(), softMat = ctx.toon({ vertexColors: true, side: THREE.DoubleSide, translucent: 0.6 });

  // ---------------------------------------------------------------- houses --------------------------------------------------------
  const op = (t, x0, x1, y0, y1, o = {}) => ({ t, x0, x1, y0, y1, ...o });
  const SPECS = {
    n01: { wall: 'plaster', wallCol: '#e7dcc4', band: { type: 'board', h: 1.0 }, roof: 'kawara', party: ['right'], ridge: 'x', pitch: 0.44, es: 0.06, ef: 0.36, eb: 0.3, hisashi: true, balcony: true, timbers: true, decay: { level: 0.28, holes: 0, collapse: false, saplings: 0 } },
    n02: { wall: 'tinsheet', roof: 'tin', party: ['left'], ridge: 'z', pitch: 0.62, es: 0.05, ef: 0.3, eb: 0.26, hisashi: false, balcony: false, timbers: false, decay: { level: 0.74, holes: 1, extraHoles: [{ slope: 'front', u: 0.602, v: 0.45, ru: 0.085, rv: 0.3 }] /* round the foot of the sapling growing out of the roof; the middle rafter lies under its stem */, collapse: { corner: 'bl', r: 1.7 }, saplings: 1 } },
    n03: { wall: 'board', roof: 'kawara', party: ['right'], ridge: 'x', pitch: 0.4, es: 0.06, ef: 0.4, eb: 0.3, hisashi: true, balcony: false, timbers: false, decay: { level: 0.44, holes: 1, collapse: false, saplings: 1 } },
    n04: { wall: 'mortar', wallCol: '#a9d0bb', band: { type: 'tile', h: 0.7, col: '#dfeae4' }, roof: 'kawara', party: ['left'], ridge: 'x', pitch: 0.42, es: 0.05, ef: 0.32, eb: 0.28, falseFront: true, hisashi: false, balcony: false, timbers: false, decay: { level: 0.62, holes: 2, collapse: false, saplings: 2 } },
    n05: { wall: 'mortar', wallCol: '#c6bfa8', band: { type: 'board', h: 0.8 }, roof: 'tin', shape: 'gable', party: ['left'], ridge: 'x', pitch: 0.46, es: 0.06, ef: 0.34, eb: 0.28, hisashi: { out: 0.6 }, balcony: false, timbers: false, props: ['meter', 'drain'], decay: { level: 0.35, holes: 0, collapse: false, saplings: 0 } },
    n06: { wall: 'plaster', wallCol: '#ded2b4', band: { type: 'mortar', h: 0.9 }, roof: 'kawara', tints: ['#a4674e', '#935a44', '#b67a5c', '#7a8e9c'], party: ['right'], ridge: 'x', pitch: 0.46, es: 0.06, ef: 0.36, eb: 0.3, hisashi: false, balcony: true, timbers: true, decay: { level: 0.52, holes: 1, collapse: false, saplings: 1 } },
    n07: { wall: 'board', band: null, roof: 'kawara', party: ['left'], ridge: 'z', pitch: 0.66, es: 0.05, ef: 0.4, eb: 0.3, hisashi: true, balcony: false, timbers: false, decay: { level: 0.46, sag: 0.3, holes: 1, collapse: false, saplings: 0 } },
    n08: { wall: 'tile', wallCol: '#b4d0cc', roof: 'flat', party: ['right'], es: 0, ef: 0, eb: 0, hisashi: { y: 2.5, out: 0.5 }, balcony: false, timbers: false, decay: { level: 0.3, holes: 0, collapse: { corner: 'fl', r: 0.72 }, saplings: 1 } },
    n09: { wall: 'plaster', wallCol: '#e5dfcf', band: { type: 'board', h: 0.85 }, roof: 'kawara', shape: 'hip', ridge: 'x', pitch: 0.54, es: 0.3, ef: 0.42, eb: 0.36, timbers: true, porch: true, decay: { level: 0.32, holes: 0, collapse: false, saplings: 0 } },
    n10: { wall: 'boardv', roof: 'tin', tints: ['#b5522f', '#a24a2e', '#c9683f', '#7d3a2a'], shape: 'gable', ridge: 'z', pitch: 0.6, es: 0.28, ef: 0.4, eb: 0.34, timbers: false, porch: false, decay: { level: 0.5, holes: 1, collapse: false, saplings: 1 } },
    n11: { wall: 'plaster', wallCol: '#ece1c8', band: { type: 'board', h: 0.9 }, roof: 'thatch', shape: 'hip', ridge: 'x', pitch: 1.0, es: 0.36, ef: 0.46, eb: 0.42, timbers: true, porch: false, decay: { level: 0.56, holes: 1, moss: 0.95, collapse: false, saplings: 2 } },
    n12: { wall: 'mortar', wallCol: '#d6cfbc', roof: 'kawara', shape: 'gable', ridge: 'x', pitch: 0.5, es: 0.26, ef: 0.36, eb: 0.32, timbers: false, porch: false, decay: { level: 0.92, holes: 2, collapse: { corner: 'fl', r: 2.8 }, saplings: 2, bushes: 4 } },
    n13: { wall: 'tinsheet', band: { type: 'mortar', h: 0.7 }, roof: 'tin', tints: ['#7fa0a0', '#6f9090', '#94b0ae', '#b5522f'], shape: 'mono', ridge: 'x', pitch: 0.3, es: 0.24, ef: 0.36, eb: 0.24, timbers: false, porch: false, decay: { level: 0.6, holes: 1, collapse: false, saplings: 1 } },
    n14: { tints: ['#6f9a8a', '#5f8a7c', '#80a896', '#8a6a58'], decay: { level: 0.5, moss: 0.9 } }, n15: { tints: ['#7d8a80', '#6f7d74', '#909b90', '#a0705a'], decay: { level: 0.55, moss: 0.9 } },
  };

  const OPEN = {
    n01: (T) => { const { w, fl, f2, d } = T, a = -w / 2 + 0.28, b = w / 2 - 0.28; return { front: [op('sliding', a, a + 1.5, fl, fl + 2.02), op('lattice', a + 1.72, b, fl + 0.82, fl + 1.92), op('sash', -1.08, -0.12, f2 + 0.3, f2 + 1.08), op('shoji', 0.12, 1.08, f2 + 0.3, f2 + 1.08)], left: [op('sash', -0.7, 0.3, fl + 0.9, fl + 1.8)], right: [], back: [op('door', a, a + 0.9, fl, fl + 1.98), op('sash', 0.2, 1.0, fl + 0.95, fl + 1.8)] }; },
    n02: (T) => { const { fl, f2 } = T; return { front: [op('door', 0.1, 1.05, fl, fl + 2.0, { col: '#6f9fb0' }), op('sash', -1.25, -0.25, fl + 0.9, fl + 1.9), op('broken', -0.42, 0.42, f2 + 0.3, f2 + 0.98)], left: [], right: [op('broken', 0, 0.9, fl + 0.9, fl + 1.8)], back: [op('boarded', -0.4, 0.4, fl + 0.95, fl + 1.75)] }; },
    n03: (T) => { const { w, fl, f2 } = T, a = -w / 2 + 0.28, b = w / 2 - 0.28; return { front: [op('lattice', a, a + 1.4, fl + 0.78, fl + 1.95), op('sliding', a + 1.6, b, fl, fl + 2.02), op('shoji', -1.1, 1.1, f2 + 0.26, f2 + 0.95)], left: [], right: [], back: [op('door', a, a + 0.9, fl, fl + 1.98), op('broken', 0.2, 1.0, fl + 0.95, fl + 1.8)] }; },
    n04: (T) => { const { w, fl, f2 } = T, a = -w / 2 + 0.28, b = w / 2 - 0.28; return { front: [op('sliding', a, a + 1.45, fl, fl + 2.02), op('sash', a + 1.65, b, fl + 0.85, fl + 1.95), op('sash', -1.15, -0.18, f2 + 0.28, f2 + 1.15), op('broken', 0.18, 1.15, f2 + 0.28, f2 + 1.15)], left: [], right: [op('sash', -0.5, 0.5, f2 + 0.3, f2 + 1.1)], back: [op('door', a, a + 0.9, fl, fl + 1.98), op('sash', 0.3, 1.1, fl + 0.95, fl + 1.8)] }; },
    n05: (T) => { const { w, fl, eaveY } = T, a = -w / 2 + 0.2, b = w / 2 - 0.2; return { front: [op('roll', a, b - 0.45, fl, fl + 2.1, { openAt: 0.5, graffiti: false }), op('sash', b - 0.35, b, fl + 0.9, fl + 1.9)], left: [], right: [op('sash', -0.5, 0.4, fl + 0.95, fl + 1.75)], back: [op('door', a + 0.2, a + 1.1, fl, fl + 1.98)] }; },
    n06: (T) => { const { w, fl, f2 } = T, a = -w / 2 + 0.28, b = w / 2 - 0.28; return { front: [op('sliding', 0.3, b, fl, fl + 2.02), op('lattice', a, 0.1, fl + 0.82, fl + 1.92), op('sash', -1.15, -0.1, f2 + 0.3, f2 + 1.1), op('sash', 0.1, 1.15, f2 + 0.3, f2 + 1.1)], left: [op('sash', -0.5, 0.5, fl + 0.95, fl + 1.85)], right: [], back: [op('door', a, a + 0.9, fl, fl + 1.98)] }; },
    n07: (T) => { const { w, fl, f2 } = T, a = -w / 2 + 0.26, b = w / 2 - 0.26; return { front: [op('sliding', -0.6, b, fl, fl + 2.02), op('lattice', a, -0.8, fl + 0.72, fl + 1.95), op('mushiko', -0.55, 0.55, f2 + 0.18, f2 + 0.72)], left: [], right: [], back: [op('door', a, a + 0.9, fl, fl + 1.98)] }; },
    n08: (T) => { if (T.col) { T.col.height = T.h; T.col.low = T.h - 1.0; } const { w, fl, f2 } = T, a = -w / 2 + 0.28, b = w / 2 - 0.28; return { front: [op('door', a, a + 1, fl, fl + 2.02, { col: '#7d8b90' }), op('sash', a + 1.2, b, fl + 0.85, fl + 1.95), op('sash', -1.1, -0.15, f2 + 0.3, f2 + 1.3), op('sash', 0.15, 1.1, f2 + 0.3, f2 + 1.3)], left: [op('bars', -1.35, -0.55, fl + 1.05, fl + 1.85), op('sash', 0.4, 1.3, fl + 0.95, fl + 1.95), op('sash', -1.35, -0.35, f2 + 0.3, f2 + 1.3), op('broken', 0.4, 1.3, f2 + 0.3, f2 + 1.3)], right: [], back: [op('door', a, a + 0.9, fl, fl + 1.98)] }; },
    n09: (T) => { const { fl } = T; return { front: [op('door', -1.15, -0.25, fl, fl + 1.98), op('sash', -2.0, -1.35, fl + 0.85, fl + 1.8), op('sash', 0.1, 1.2, fl + 0.85, fl + 1.8), op('lattice', 1.35, 1.95, fl + 0.82, fl + 1.78)], back: [op('door', 1.0, 1.9, fl, fl + 1.98), op('sliding', -1.9, 0.6, fl, fl + 1.98)], left: [op('sash', -0.5, 0.5, fl + 0.85, fl + 1.7)], right: [op('shoji', -0.9, 0.9, fl + 0.7, fl + 1.8)] }; },
    n10: (T) => { const { fl } = T; return { front: [op('door', 0.05, 0.95, fl, fl + 1.98, { col: '#7a5c46' }), op('sash', 1.15, 2.0, fl + 0.9, fl + 1.8), op('shoji', -2.0, -0.3, fl + 0.7, fl + 1.85)], back: [op('sliding', -2.0, -0.4, fl, fl + 1.98), op('sash', 1.0, 2.0, fl + 0.9, fl + 1.8)], left: [], right: [op('sash', -0.4, 0.4, fl + 0.9, fl + 1.7)] }; },
    n11: (T) => { const { fl } = T; return { front: [op('sliding', -0.95, 0.75, fl, fl + 1.86), op('shoji', -2.05, -1.15, fl + 0.55, fl + 1.72), op('shoji', 0.95, 2.05, fl + 0.55, fl + 1.72)], back: [op('door', 1.3, 2.1, fl, fl + 1.86), op('sash', -1.4, -0.4, fl + 0.85, fl + 1.65)], left: [], right: [op('sash', -0.5, 0.5, fl + 0.8, fl + 1.65)] }; },
    n12: (T) => { const { fl } = T; return { front: [op('broken', -1.8, -0.8, fl + 0.85, fl + 1.8), op('sliding', 0, 1.6, fl, fl + 1.98)], back: [op('sash', -1.5, -0.6, fl + 0.85, fl + 1.75)], left: [], right: [op('broken', -0.8, 0.2, fl + 0.85, fl + 1.75)] }; },
    n13: (T) => { const { fl } = T; return { front: [op('door', 1.1, 1.95, fl, fl + 1.95), op('sash', -1.4, 0.4, fl + 0.85, fl + 1.7)], back: [op('sash', -0.5, 0.5, fl + 0.85, fl + 1.65)], left: [op('sash', -0.45, 0.45, fl + 0.85, fl + 1.7)], right: [] }; },
  };
  for (const id of Object.keys(OPEN)) SPECS[id].open = OPEN[id];
  const H_ = {};
  for (const [id, b] of Object.entries(byId)) H_[id] = H.build(b, SPECS[id] || {});

  // ---------------------------------------------------------------- the hill ------------------------------------------------------
  const Z = RING_ZONES.shrineHill, Y = Z.y, ST = TORII.stair, R = ctx.seeded('north-hill');
  const CHEEK = 0.34, FOOT = -0.16, HT = Y - FOOT, BAT = 0.34, SET = 0.12;   // wall foot sits SET inside the outer plinth face so nothing is coplanar with base's strata
  const xW = Z.x[0] + SET, xE = Z.x[1], zN = Z.z[0] + SET, zS = Z.z[1];
  const top = { x0: xW + BAT, x1: xE - BAT, z0: zN + BAT, z1: zS - BAT };
  const STAIR_TOP = ST.x[0], STAIR_FOOT = ST.x[1];
  const CORE = rgb('#3d4a48');
  const PAL = { sun: ['#918a78', '#857f6f', '#787368', '#9c9380', '#716f65', '#8a7f6b'], shade: ['#a39d8d', '#979283', '#8b887c', '#aca593', '#83827a', '#9d9380'] };
  const MOSSY = [rgb('#7c8f64'), rgb('#6f8560'), rgb('#869a6c')];   // damp stone: a whole stone only ever goes this far toward green. The real moss is the patches laid over the joints below.
  const mossField = (s, t, ph) => 0.5 + 0.28 * Math.sin(s * 0.9 + ph) * Math.sin(t * 1.7 + ph * 2) + 0.22 * Math.sin(s * 2.3 + t * 1.1 + ph * 3);

  /** One dressed stone: a soft 8-gon on the wall plane, proud by `pro`. corners are [s,t] bl, br, tr, tl. */
  function stone(fr, c, k, pro) {
    const [bl, br, tr, tl] = c, cx = (bl[0] + br[0] + tr[0] + tl[0]) / 4, cy = (bl[1] + br[1] + tr[1] + tl[1]) / 4, gap = 0.016, r = Math.min(0.1, Math.min(br[0] - bl[0], tl[1] - bl[1]) * 0.24);
    const shr = (p) => { const dx = p[0] - cx, dy = p[1] - cy, l = Math.hypot(dx, dy) || 1; return [p[0] - (dx / l) * gap, p[1] - (dy / l) * gap]; };
    const B = shr(bl), C = shr(br), D = shr(tr), E = shr(tl), lerp2 = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u)], len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const ring = [lerp2(B, C, r / len(B, C)), lerp2(C, B, r / len(B, C)), lerp2(C, D, r / len(C, D)), lerp2(D, C, r / len(C, D)), lerp2(D, E, r / len(D, E)), lerp2(E, D, r / len(D, E)), lerp2(E, B, r / len(E, B)), lerp2(B, E, r / len(E, B))];
    const clipS = (p) => { const k0 = fr.k0 || 0, k1 = fr.k1 || 0, L = fr.L; return [clamp(p[0], k0 * p[1], L - k1 * p[1]), p[1]]; };
    const at = (p, d) => { const q = clipS(p); return add(add(add(fr.O, fr.U, q[0]), fr.V, q[1]), fr.N, d); };
    const inner = ring.map((p) => [lerp(p[0], cx, 0.17), lerp(p[1], cy, 0.17)]);
    const dk = [k[0] * 0.9, k[1] * 0.9, k[2] * 0.9];
    for (let i = 0; i < 8; i++) { const j = (i + 1) % 8; hillStone.quad(at(ring[i], -0.02), at(ring[j], -0.02), at(inner[j], pro), at(inner[i], pro), dk, fr.N); }
    for (let i = 1; i < 7; i++) hillStone.tri(at(inner[0], pro), at(inner[i], pro), at(inner[i + 1], pro), k, fr.N);
  }
  /** Lay random rubble on a wall by filling a skyline. s runs 0..L, t 0..topAt(s). */
  function layWall(fr, L, topAt, { pal = PAL.sun, cell = 0.14, moss = 0.68, h0 = 0.28, h1 = 0.56, w0 = 0.4, w1 = 1.1, ph = R() * 9, hide = null } = {}) {
    const n = Math.max(2, Math.round(L / cell)), cw = L / n, H0 = new Float32Array(n);
    for (let g = 0; g < 4000; g++) {
      let i0 = 0; for (let i = 1; i < n; i++) if (H0[i] < H0[i0] - 1e-4) i0 = i;
      const y = H0[i0], midTop = topAt((i0 + 0.5) * cw); if (y >= midTop - 0.04) { H0[i0] = 1e3; if (H0.every((v) => v > 900)) break; continue; }
      let run = 1, want = Math.max(2, Math.round(R.range(w0, w1) / cw)); while (i0 + run < n && Math.abs(H0[i0 + run] - y) < 1e-4 && run < want) run++;
      if (run < 3 && want > run && n > 3) { // a sliver: raise it to the lowest neighbour with a tall narrow stone
        const nb = Math.min(i0 > 0 ? H0[i0 - 1] : 1e3, i0 + run < n ? H0[i0 + run] : 1e3);
        if (nb < 900 && nb > y + 0.14 && nb - y < 0.9) { const top2 = nb; emit(i0, run, y, top2); for (let k = 0; k < run; k++) H0[i0 + k] = top2; continue; }
      }
      const big = R() < 0.12 ? 1.5 : 1, hh = Math.min(R.range(h0, h1) * big, 0.8);
      let t1 = y + hh; const midT = topAt((i0 + run * 0.5) * cw); if (t1 > midT - 0.16) t1 = midT;
      emit(i0, run, y, t1);
      for (let k = 0; k < run; k++) H0[i0 + k] = t1;
      function emit(a, m, b0, b1) {
        const s0 = a * cw, s1 = (a + m) * cw, jit = () => R.range(-0.05, 0.05), tilt = R.range(-0.04, 0.04);
        const t2 = Math.min(topAt(s0), b1 + tilt), t3 = Math.min(topAt(s1), b1 - tilt);
        const fld = mossField(s0, b0, ph), k = fld > moss && R() < 0.8 ? R.pick(MOSSY) : rgb(R.pick(pal), R.range(0.94, 1.03)), pro = R.range(0.05, 0.13);
        const corners = [[s0, b0], [s1, b0], [s1 + jit() * 0.3, t3], [s0 + jit() * 0.3, t2]]; if (!(hide && hide(s0, b1))) stone(fr, corners, k, pro);
        (fr.laid ||= []).push([s0, s1, b0, b1, pro]);
      }
    }
  }
  /** A wall frame from foot a to foot b, leaning by bat toward inward over the height hh. */
  const frame = (a, b, inward, y0, hh, bat) => {
    const O = [a[0], y0, a[1]], T = sub([b[0], y0, b[1]], O), L = Math.hypot(T[0], T[2]), U = [T[0] / L, 0, T[2] / L], V = [(inward[0] * bat) / hh, 1, (inward[1] * bat) / hh], N = norm(cross(V, U));
    const out = dot(N, [inward[0], 0, inward[1]]) > 0 ? [-N[0], -N[1], -N[2]] : N;
    return { O, U, V, N: out, L, hh };
  };
  const coreQuad = (fr, s0, s1, t0, t1) => { const at = (s, t) => add(add(add(fr.O, fr.U, s), fr.V, t), fr.N, -0.05), sl = (t) => (fr.k0 || 0) * t, sr = (t) => fr.L - (fr.k1 || 0) * t, a = (u, t) => at(u < 0.5 ? Math.max(s0, sl(t)) : Math.min(s1, sr(t)), t); hillStone.quad(a(0, t0), a(1, t0), a(1, t1), a(0, t1), CORE, fr.N); };

  // the four walls. The east wall is two runs either side of the stair notch.
  const N_ = frame([xE, zN], [xW, zN], [0, 1], FOOT, HT, BAT), W_ = frame([xW, zN], [xW, zS], [1, 0], FOOT, HT, BAT), S_ = frame([xW, zS], [xE, zS], [0, -1], FOOT, HT, BAT);
  const E1 = frame([xE, zS], [xE, ST.z[1]], [-1, 0], FOOT, HT, BAT), E2 = frame([xE, ST.z[0]], [xE, zN], [-1, 0], FOOT, HT, BAT);
  const KK = BAT / HT; N_.k0 = N_.k1 = KK; W_.k0 = W_.k1 = KK; S_.k0 = S_.k1 = KK; E1.k0 = KK; E1.k1 = 0; E2.k0 = 0; E2.k1 = KK;
  for (const [fr, pal] of [[N_, PAL.sun], [W_, PAL.shade], [S_, PAL.shade], [E1, PAL.sun], [E2, PAL.sun]]) { coreQuad(fr, 0, fr.L, 0, HT); layWall(fr, fr.L, () => HT - 0.02, { pal }); }
  // dressed quoins up the outer corners, long and short by turns: the edge the wall is read by
  const quoin = (fr, end, col) => { let t = 0.0, odd = end > 0; while (t < HT - 0.3) { const hh = Math.min(R.range(0.38, 0.52), HT - t - 0.02), w = odd ? R.range(0.62, 0.86) : R.range(0.34, 0.5); odd = !odd; const s0 = end > 0 ? 0 : fr.L - w, s1 = end > 0 ? w : fr.L; stone(fr, [[s0, t + 0.01], [s1, t + 0.01], [s1, t + hh], [s0, t + hh]], rgb(R.pick(['#b9b1a0', '#c2bba8', '#aaa494'])), 0.16); t += hh; } };
  for (const [fr, a, b] of [[N_, 1, 1], [W_, 1, 1], [S_, 1, 1], [E1, 1, 0], [E2, 0, 1]]) { if (a) quoin(fr, 1); if (b) quoin(fr, -1); }
  // moss: irregular patches laid over the stones, bridging the joints, heaviest along the top courses and into the corners
  {
    const Rm = ctx.seeded('north-moss'), TONES = ['#66815a', '#5a774f', '#728c5c', '#506c48'];
    const topOf = (fr, s, t) => { for (const [a, b, c, d, pro] of fr.laid) if (s >= a && s <= b && t >= c && t <= d) return pro; return 0.09; };
    const patch = (fr, cs, ct, rs, rt) => {
      const n = 9, ph = Rm() * 6, ph2 = Rm() * 6, at = (s, t) => { const tt = clamp(t, 0.02, HT - 0.02), ss = clamp(s, (fr.k0 || 0) * tt + 0.02, fr.L - (fr.k1 || 0) * tt - 0.02); return [ss, tt, topOf(fr, ss, tt)]; }, onWall = (q, d) => add(add(add(fr.O, fr.U, q[0]), fr.V, q[1]), fr.N, d);
      const C0 = at(cs, ct), ring0 = [];
      for (let i = 0; i < n; i++) { const a = (i / n) * TAU, k = (1 + 0.16 * Math.sin(2 * a + ph) + 0.11 * Math.sin(3 * a + ph2)) * Rm.range(0.9, 1.08); ring0.push(at(cs + Math.cos(a) * rs * k, ct + Math.sin(a) * rt * k)); }
      const lift = Math.max(C0[2], ...ring0.map((q) => q[2])) + 0.012, C = onWall(C0, lift), ring = ring0.map((q) => onWall(q, lift)); // one plane above every stone it crosses, so it bridges the joints instead of being cut by them
      const pos = [], nor = [], uv = [];
      for (let i = 0; i < n; i++) { pos.push(...C, ...ring[i], ...ring[(i + 1) % n]); for (let k = 0; k < 3; k++) { nor.push(fr.N[0], fr.N[1], fr.N[2]); uv.push(0, 0); } }
      // winding must face out of the wall
      const n0 = cross(sub(ring[0], C), sub(ring[1], C)); if (dot(n0, fr.N) < 0) for (let i = 0; i < pos.length; i += 9) for (let k = 0; k < 3; k++) { const t = pos[i + 3 + k]; pos[i + 3 + k] = pos[i + 6 + k]; pos[i + 6 + k] = t; }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      soft.add(g, softMat, { color: Rm.pick(TONES) });
    };
    for (const fr of [N_, W_, S_, E1, E2]) {
      const count = Math.max(2, Math.round(fr.L * 0.78));
      for (let i = 0; i < count; i++) {
        const corner = Rm() < 0.3, s = corner ? (Rm() < 0.5 ? Rm() * 1.6 : fr.L - Rm() * 1.6) : Rm() * fr.L, t = HT * (1 - Rm() ** 1.7 * 0.92);
        patch(fr, s, t, Rm.range(0.26, 0.58), Rm.range(0.15, 0.34));
      }
    }
  }
  // the stair: Y rises over the box's x run. Steps are solid down to the footing, so the stair is closed from every side.
  const nStep = Math.round(Y / 0.22), RISE = Y / nStep, RUN = (STAIR_FOOT - STAIR_TOP) / nStep;
  {
    const z0 = ST.z[0] + CHEEK, z1 = ST.z[1] - CHEEK, pale = ['#e3ddca', '#d6d0bc', '#ccc7b6', '#ded3b8'];
    for (let i = 0; i < nStep; i++) {
      const xa = STAIR_FOOT - i * RUN + 0.03, xb = STAIR_FOOT - (i + 1) * RUN - 0.01, y1 = (i + 1) * RISE, parts = [];
      let z = z0; while (z < z1 - 0.01) { const w = Math.min(z1 - z, R.range(0.48, 0.95)); parts.push([z, z + (z1 - z - w < 0.3 ? z1 - z : w)]); z = parts[parts.length - 1][1]; }
      for (const [a, b] of parts) {
        const g = kit.chip(kit.box(xa - xb, y1 - FOOT, b - a - 0.012, 1, 1, 2), 0.009, R);
        stones.add(g, stoneMat, { pos: [(xa + xb) / 2, (y1 + FOOT) / 2, (a + b) / 2], color: R.pick(pale) });
      }
    }
    // a backing behind the top step so the notch is closed, and the landing at the foot
    stones.add(kit.boxBase(0.3, HT, ST.z[1] - ST.z[0]), stoneMat, { pos: [STAIR_TOP - 0.16, FOOT, TORII.z], color: '#55605c' });
    for (const [x, zz, sx, sz, col] of [[STAIR_FOOT + 0.32, TORII.z - 0.46, 0.6, 0.9, '#d6d0bc'], [STAIR_FOOT + 0.32, TORII.z + 0.46, 0.58, 0.86, '#ccc7b6']]) stones.add(kit.chip(kit.box(sx, 0.2, sz, 1, 1, 1), 0.02, R), stoneMat, { pos: [x, 0.0, zz], color: col });
    // cheek walls: each is a sloped wedge, faced with stones on its outer side, capped with a long sloped kerb
    for (const side of [-1, 1]) {
      const zOut = side < 0 ? ST.z[0] : ST.z[1], zIn = zOut - side * CHEEK, xa = STAIR_FOOT, xb = STAIR_TOP - 0.16, yA = 0.42, yB = Y + 0.28;
      const topY = (x) => lerp(yA, yB, clamp((xa - x) / (xa - STAIR_TOP)));
      const prof = [[0, FOOT], [xa - xb, FOOT], [xa - xb, topY(xb)], [0, topY(xa)]];
      for (const zp of [zOut, zIn]) {
        const n = 10; for (let i = 0; i < n; i++) { const s0 = (i / n) * (xa - xb), s1 = ((i + 1) / n) * (xa - xb), P0 = [xa - s0, FOOT, zp], P1 = [xa - s1, FOOT, zp], P2 = [xa - s1, topY(xa - s1), zp], P3 = [xa - s0, topY(xa - s0), zp]; hillStone.quad(P0, P1, P2, P3, CORE, [0, 0, side * (zp === zOut ? 1 : -1)]); }
      }
      const O = [xa, FOOT, zOut], fr = { O, U: [-1, 0, 0], V: [0, 1, 0], N: [0, 0, side], L: xa - xb };
      layWall(fr, fr.L, (s) => topY(xa - s) - FOOT, { h0: 0.24, h1: 0.46, w0: 0.34, w1: 0.8, moss: 0.72 });
      layWall({ O: [xa, FOOT, zIn], U: [-1, 0, 0], V: [0, 1, 0], N: [0, 0, -side], L: xa - xb }, xa - xb, (s) => topY(xa - s) - FOOT, { h0: 0.24, h1: 0.46, w0: 0.34, w1: 0.8, moss: 0.72, hide: (s0, t1) => FOOT + t1 <= clamp(s0 / (xa - STAIR_TOP)) * Y - 0.1 });   // inner faces only show above the treads
      // the end facing the road
      hillStone.quad([xa, FOOT, zOut], [xa, FOOT, zIn], [xa, topY(xa), zIn], [xa, topY(xa), zOut], rgb('#b9b5a6'), [1, 0, 0]);
      // kerb
      const kA = [xa + 0.02, topY(xa) + 0.14, (zOut + zIn) / 2], kB = [xb - 0.1, topY(xb) + 0.14, (zOut + zIn) / 2], mid = add(kA, sub(kB, kA), 0.5), dir = sub(kB, kA), len = Math.hypot(...dir), pitch = Math.atan2(dir[1], Math.hypot(dir[0], dir[2]));
      stones.add(kit.chip(kit.box(len, 0.18, CHEEK + 0.1, 3, 1, 1), 0.012, R), stoneMat, { matrix: new THREE.Matrix4().makeRotationZ(-pitch).premultiply(new THREE.Matrix4().makeRotationY(Math.PI)).setPosition(mid[0], mid[1], mid[2]), color: '#d6d0bc' });
      // the foot post
      const px = xa + 0.06, pz = (zOut + zIn) / 2;
      stones.add(kit.boxBase(0.34, 1.04, 0.34), stoneMat, { pos: [px, 0, pz], color: '#d6d0bc' });
      stones.add(kit.boxBase(0.44, 0.12, 0.44), stoneMat, { pos: [px, 1.04, pz], color: '#c4c0ae' });
      stones.add(kit.sphere(0.17, 10, 7), stoneMat, { pos: [px, 1.29, pz], color: '#dfdaca' });
    }
  }
  // the earth on top: a height field flat wherever something stands. Grid lines fall on the notch so the stair cut is exact.
  let hAt = () => Y;
  {
    const keep = [...Object.values(byId).filter((b) => b.elev > 0).map((b) => buildingBox(b, 0.9)), { x: [STAIR_TOP - 0.2, top.x1], z: [ST.z[0] - 0.4, ST.z[1] + 0.4] }, { x: [-31.2, STAIR_TOP], z: [-35.1, -31.8] }, { x: [-31.4, -28.4], z: [-30, -27.4] }];
    const trees = WOODS.filter((t) => t.elev > 0 && t.x > Z.x[0] && t.x < Z.x[1] && t.z > Z.z[0] && t.z < Z.z[1]);
    const clear = (x, z) => {
      let d = 1e3; for (const r of keep) { const dx = Math.max(r.x[0] - x, x - r.x[1], 0), dz = Math.max(r.z[0] - z, z - r.z[1], 0); d = Math.min(d, Math.hypot(dx, dz)); }
      for (const t of trees) d = Math.min(d, Math.hypot(x - t.x, z - t.z) - 0.9);
      d = Math.min(d, x - top.x0 - 0.5, top.x1 - x - 0.5, z - top.z0 - 0.5, top.z1 - z - 0.5);
      return d;
    };
    hAt = (x, z) => Y + 0.3 * smooth(clear(x, z) / 1.5) * clamp(0.55 + 0.45 * Math.sin(x * 0.7 + 1.3) * Math.cos(z * 0.55 + 0.4));
    const line = (a, b, step, must) => { const n = Math.round((b - a) / step), o = Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n); for (const m of must) o.push(m); return [...new Set(o.map((v) => +v.toFixed(4)))].sort((p, q) => p - q); };
    const xs = line(top.x0, top.x1, 0.45, [STAIR_TOP]), zs = line(top.z0, top.z1, 0.45, [ST.z[0], ST.z[1]]);
    const pile = new Pile(), W = rgb('#7a6a4a'), P3 = (x, z) => [x, hAt(x, z), z];
    for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) {
      const x0 = xs[i], x1 = xs[i + 1], z0 = zs[j], z1 = zs[j + 1], cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      if (cx > STAIR_TOP && cz > ST.z[0] && cz < ST.z[1]) continue;
      pile.quad(P3(x0, z0), P3(x0, z1), P3(x1, z1), P3(x1, z0), W, [0, 1, 0]);
    }
    const g = pile.geometry(); kit.worldUV(g, earthMat.userData.uv || 0.3);
    const m = new THREE.Mesh(g, earthMat); m.castShadow = true; m.receiveShadow = true; m.name = 'north-earth'; group.add(m);
  }

  // ---------------------------------------------------------------- torii ---------------------------------------------------------
  {
    const T = H.local({ x: TORII.x, z: TORII.z, elev: 0, yaw: TORII.yaw, h: 4.4 }), RED = '#cc5a3e', DARK = '#3e4648', span = 1.5, h1 = 2.92, hKasa = 3.62;
    for (const s of [-1, 1]) {
      T.rod([s * span, 0, 0], [s * (span - 0.14), h1 + 0.5, 0], 0.17, 'worn', RED, 12, 0.145);
      T.rod([s * span, 0.02, 0], [s * (span - 0.012), 0.46, 0], 0.2, 'flat', DARK, 12, 0.195);
      T.add(kit.cylBase(0.32, 0.36, 0.12, 10), 'flat', { pos: [s * span, -0.02, 0], color: '#b9b5a6' });
    }
    T.box(-span - 0.42, span + 0.42, h1 - 0.1, h1 + 0.13, -0.08, 0.08, 'worn', RED);
    const arc = (x) => (x / 2.2) ** 2 * 0.2;
    const beam = (w0, y0, dy, zh, col, seg = 12, mat = 'worn') => {
      for (let i = 0; i < seg; i++) {
        const a = -w0 + (2 * w0 * i) / seg, b = a + (2 * w0) / seg, y = (x) => y0 + arc(x);
        T.quad([a, y(a) + dy, zh], [b, y(b) + dy, zh], [b, y(b) + dy, -zh], [a, y(a) + dy, -zh], mat, col);
        T.quad([a, y(a), -zh], [b, y(b), -zh], [b, y(b), zh], [a, y(a), zh], mat, col);
        T.quad([a, y(a), zh], [b, y(b), zh], [b, y(b) + dy, zh], [a, y(a) + dy, zh], mat, col);
        T.quad([b, y(b), -zh], [a, y(a), -zh], [a, y(a) + dy, -zh], [b, y(b) + dy, -zh], mat, col);
      }
      for (const s of [-1, 1]) { const x = s * w0, y2 = y0 + arc(x); T.quad([x, y2, s * zh], [x, y2, -s * zh], [x, y2 + dy, -s * zh], [x, y2 + dy, s * zh], mat, col); }
    };
    beam(2.05, hKasa - 0.26, 0.22, 0.11, RED, 12, 'worn'); beam(2.28, hKasa, 0.2, 0.17, DARK, 12, 'flat');
    T.box(-0.2, 0.2, h1 + 0.13, hKasa - 0.24, -0.09, 0.09, 'worn', RED);
    H.atlas.paint('north-gaku', 72, 128, (g, w, h, t) => { g.fillStyle = '#3b3a38'; g.fillRect(0, 0, w, h); g.strokeStyle = '#c9a24e'; g.lineWidth = 4; g.strokeRect(4, 4, w - 8, h - 8); t.text('緑乃社', w / 2, 30, 30, '#e7d9a8', { font: t.SERIF, weight: 900, vertical: true, gap: 1.12 }); });
    H.props.sign(T, 'north-gaku', 0.32, 0.58, { pos: [0, h1 + 0.4, 0.24], board: '#2f2e2c', t: 0.04 });
  }

  // ---------------------------------------------------------------- shared little makers -----------------------------------------
  const G = H_.n14, Ginv = G.S.m.clone().invert(), toG = (p) => new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(Ginv);
  const clumpW = (p, rx, ry, n, o) => G.clump(toG(p).toArray(), rx, ry, n, o);
  const grassW = (x, z, r, n, y = Y, o = {}) => { const q = toG([x, y, z]); G.grass(q.x, q.z, r, n, { y: q.y + 0.02, ...o }); };
  const bushW = (x, z, r, y = 0) => clumpW([x, y + r * 0.55, z], r, r * 0.86, Math.round(r * r * 44 + 10), { s: 0.44 });
  const WS = H.world;
  const anchor = (x, z, y = 0, yaw = 0, h = 2) => H.local({ x, z, elev: y, yaw, h });
  const fern = (x, y, z, s = 1, rot0 = 0, col = P.fern, n = 5) => { for (let i = 0; i < n; i++) soft.add(kit.frond(0.9 * s, 7, 0.26), softMat, { pos: [x, y, z], rot: [-0.25 - (i % 2) * 0.2, rot0 + (i / n) * TAU + i * 0.3, 0], color: i % 3 === 0 ? P.leafLit : col }); };
  const whiteUV = () => H.atlas.cellUV('white', 0.5, 0.5);

  /** A cloth hung from a line, in the swing mesh. st is any Stage, x,y,z the top centre there. */
  function hang(st, x, y, z, w, h, cell, o = {}) {
    const g = new THREE.PlaneGeometry(w, h, o.nx ?? 2, o.ny ?? 3); g.translate(0, -h / 2, 0); H.atlas.uvTo(g, cell);
    if (o.wave) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 6 + (o.phase ?? 0)) * o.wave * (0.2 - p.getY(i))); g.computeVertexNormals(); }
    g.applyMatrix4(st.mx({ pos: [x, y, z], rot: o.rot ?? [0, 0, 0] }));
    const pv = st.w([x, y, z]), ax = st.dir([1, 0, 0]); swing.add(g, { pivot: pv.toArray(), axis: ax.toArray(), amp: o.amp ?? 0.16, speed: o.speed ?? 1, phase: o.phase ?? R() * 6, bend: o.bend ?? 1.1, mode: o.mode ?? 0, color: o.color });
  }
  /** Noren of n strips cut from one atlas cell, each strip its own swinging cloth. */
  function norenSwing(st, x0, x1, y, cell, drop = 0.75, n = 3) {
    st.rod([x0 - 0.08, y + 0.02, 0.12], [x1 + 0.08, y + 0.02, 0.12], 0.02, 'wood', '#6e5038', 5);
    const [ax, ay, aw, ah] = H.atlas.cell(cell), sw = (x1 - x0) / n;
    for (let i = 0; i < n; i++) {
      const w = sw - 0.015, g = new THREE.PlaneGeometry(w, drop, 1, 3); g.translate(0, -drop / 2, 0);
      const u0 = i / n, uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) { const su = u0 + uv.getX(k) / n, tv = uv.getY(k), U = (ax + 1.5 + su * (aw - 3)) / 2048, V = 1 - (ay + 1.5 + (1 - tv) * (ah - 3)) / 2048; uv.setXY(k, U, V); }
      const xc = x0 + (i + 0.5) * sw; g.applyMatrix4(st.mx({ pos: [xc, y, 0.13] }));
      swing.add(g, { pivot: st.w([xc, y, 0.13]).toArray(), axis: st.dir([1, 0, 0]).toArray(), amp: 0.13, speed: 0.9, phase: 1.2 * i + xc, bend: 0.9 });
    }
  }
  /** A zigzag shide strip hanging from st at x,y,z. */
  function shide(st, x, y, z, o = {}) {
    const pieces = [], n = o.n ?? 4, sz = o.size ?? 0.11;
    for (let i = 0; i < n; i++) { const g = new THREE.PlaneGeometry(sz * 1.25, sz, 1, 1); g.translate(((i % 2) - 0.5) * sz * 0.7, -(i + 0.5) * sz * 1.02, 0); pieces.push(g); }
    const g = kit.merge(pieces); H.atlas.uvTo(g, 'white'); g.applyMatrix4(st.mx({ pos: [x, y, z] }));
    swing.add(g, { pivot: st.w([x, y, z]).toArray(), axis: st.dir([1, 0, 0]).toArray(), amp: 0.22, speed: 1.2, phase: x * 3 + R() * 2, bend: 1.4, color: '#f3eedd' });
  }
  /** A small hinged plate (hanging sign, loose tin) in the swing mesh. Hinges about its top edge. */
  function plateSwing(st, x, y, z, w, h, o = {}) {
    const g = new THREE.PlaneGeometry(w, h, o.nx ?? 1, 1); g.translate(0, -h / 2, 0);
    if (o.cell) H.atlas.uvTo(g, o.cell); else H.atlas.uvTo(g, 'white');
    if (o.corr) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, (i % 2 ? 0.03 : -0.03)); g.computeVertexNormals(); }
    g.applyMatrix4(st.mx({ pos: [x, y, z], rot: o.rot ?? [0, 0, 0] }));
    swing.add(g, { pivot: st.w([x, y, z]).toArray(), axis: st.dir([1, 0, 0]).toArray(), amp: o.amp ?? 0.1, speed: o.speed ?? 0.9, phase: o.phase ?? R() * 6, mode: o.mode ?? 0, color: o.color });
  }

  function bicycle(st, o = {}) {
    const s = st.sub({ rot: [o.lean ?? 0, 0, 0] }), col = o.col ?? '#a0543a', rust = '#7d3a2a', R0 = 0.31, xw = 0.52;
    for (const x of [-xw, xw]) {
      s.add(kit.torus(R0, 0.022, 4, 16), 'worn', { pos: [x, R0, 0], color: '#574a3f' });
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI + 0.4; s.rod([x - Math.cos(a) * R0, R0 - Math.sin(a) * R0, 0], [x + Math.cos(a) * R0, R0 + Math.sin(a) * R0, 0], 0.006, 'flat', '#8a7a62', 3, 0.006, true); }
    }
    const bb = [-0.04, 0.34, 0], seat = [-0.2, 0.86, 0], head = [0.38, 0.84, 0], fHub = [xw, R0, 0], rHub = [-xw, R0, 0];
    for (const [a, b] of [[bb, seat], [bb, head], [seat, head], [bb, rHub], [seat, rHub], [head, fHub]]) s.rod(a, b, 0.024, 'worn', col, 4, 0.024, true);
    s.rod(head, [0.35, 1.04, 0], 0.02, 'worn', col, 4, 0.02, true); s.rod([0.35, 1.05, -0.26], [0.35, 1.05, 0.26], 0.018, 'worn', rust, 4, 0.018, true);
    s.add(kit.boxBase(0.26, 0.06, 0.13), 'flat', { pos: [seat[0], seat[1], 0], color: '#4e4a44' });
    if (o.basket !== false) { s.box(0.42, 0.72, 0.82, 0.84, -0.14, 0.14, 'worn', rust); for (const zz of [-0.14, 0.14]) s.box(0.42, 0.72, 0.84, 1.0, zz - 0.005, zz + 0.005, 'worn', rust); s.box(0.42, 0.43, 0.84, 1.0, -0.14, 0.14, 'worn', rust); s.box(0.71, 0.72, 0.84, 1.0, -0.14, 0.14, 'worn', rust); }
    return s;
  }
  /** Concrete block wall along a→b. gaps are [s0,s1] openings, broken are [s0,s1,y] places where the top has come away. */
  function blockWall(a, b, h = 1.25, { gaps = [], broken = [], lean = 0, perf = true, col = '#bdb9aa' } = {}) {
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), yaw = Math.atan2(-dz, dx), s0 = anchor(a[0], a[1], 0, yaw, h).sub({ rot: [lean, 0, 0] });
    const stops = [0]; for (const [x0, x1] of gaps) stops.push(x0, x1); stops.push(L);
    for (let i = 0; i < stops.length; i += 2) {
      const x0 = stops[i], x1 = stops[i + 1]; if (x1 - x0 < 0.1) continue;
      const top = [[x0, -0.3], [x1, -0.3], [x1, h]];
      for (const [u0, u1, y] of [...broken].sort((p, q) => q[0] - p[0])) if (u1 > x0 && u0 < x1) { const m = (u0 + u1) / 2, j = R.range(-0.06, 0.06); top.push([u1, h], [u1 - 0.1, y + 0.2 + j], [m + 0.1, y], [m - 0.13, y + 0.12], [u0 + 0.12, y + 0.26 - j], [u0, h]); }
      top.push([x0, h]);
      s0.add(kit.wallPanel(top, [], 0.13), 'brick', { color: col });
      const tops = broken.filter(([u0, u1]) => u1 > x0 && u0 < x1).sort((p, q) => p[0] - q[0]); let c = x0;
      for (const [u0, u1] of [...tops, [x1, x1]]) { if (u0 > c + 0.02) { s0.box(c - 0.015, u0 + 0.015, h, h + 0.05, -0.085, 0.085, 'flat', '#cfcbba'); if (perf && u0 - c > 0.7) for (let k = c + 0.28; k < u0 - 0.2; k += 0.46) { for (const z2 of [-0.067, 0.067]) { const ss = s0.sub({ pos: [k, h - 0.19, z2], rot: z2 < 0 ? [0, Math.PI, 0] : [0, 0, 0] }); ss.rect(-0.14, 0.14, -0.14, 0.14, 0.001, 'flat', '#5b625c'); ss.quad([-0.02, -0.16, 0.002], [0.02, -0.16, 0.002], [0.02, 0.16, 0.002], [-0.02, 0.16, 0.002], 'flat', col); ss.quad([-0.16, -0.02, 0.002], [0.16, -0.02, 0.002], [0.16, 0.02, 0.002], [-0.16, 0.02, 0.002], 'flat', col); } } } c = u1; }
    }
    return s0;
  }
  H.atlas.paint('north-plate1', 96, 48, (g, w, h, t) => { g.fillStyle = '#d8d0b8'; g.fillRect(0, 0, w, h); t.text('田所', w / 2, h / 2 + 2, 34, '#3a3a38', { font: t.SERIF, weight: 900 }); });
  H.atlas.paint('north-plate2', 96, 48, (g, w, h, t) => { g.fillStyle = '#d0c7ad'; g.fillRect(0, 0, w, h); t.text('小春', w / 2, h / 2 + 2, 34, '#3a3a38', { font: t.SERIF, weight: 900 }); });
  H.atlas.paint('north-plate3', 96, 48, (g, w, h, t) => { g.fillStyle = '#dcd5bd'; g.fillRect(0, 0, w, h); t.text('松葉', w / 2, h / 2 + 2, 34, '#3a3a38', { font: t.SERIF, weight: 900 }); });
  /** A tiled gate. Origin at the centre on the street line, +z toward the street. */
  function tiledGate(st, w = 1.3, plate = 'north-plate1') {
    const hw = w / 2, ph = 1.74;
    for (const s of [-1, 1]) { st.box(s * hw - 0.13, s * hw + 0.13, -0.3, ph, -0.13, 0.13, 'brick', '#cbc4ae'); st.box(s * hw - 0.17, s * hw + 0.17, ph, ph + 0.07, -0.17, 0.17, 'flat', '#d6d0bc'); }
    st.box(-hw, hw, ph - 0.1, ph + 0.05, -0.08, 0.08, 'wood', '#6e5038');
    const y0 = ph + 0.1, yR = y0 + 0.36, ov = 0.34;
    for (const sg of [-1, 1]) {
      const a = [-hw - ov, yR, 0.0], b = [hw + ov, yR, 0.0], c = [hw + ov, y0, sg * 0.62], d = [-hw - ov, y0, sg * 0.62];
      st.quad(sg > 0 ? d : a, sg > 0 ? c : b, sg > 0 ? b : c, sg > 0 ? a : d, 'roof', '#6e8290');
      const n = Math.round((2 * hw + 2 * ov) / 0.2); for (let i = 0; i <= n; i++) { const x = -hw - ov + (i * (2 * hw + 2 * ov)) / n; st.rod([x, yR + 0.015, 0], [x, y0 + 0.015, sg * 0.64], 0.042, 'roof', i % 5 === 0 ? '#7a6e68' : '#7a8e9c', 4, 0.042, true); }
      st.box(-hw - ov, hw + ov, y0 - 0.05, y0 + 0.02, sg * 0.6, sg * 0.66, 'roof', '#566a78');
    }
    st.rod([-hw - ov - 0.06, yR + 0.04, 0], [hw + ov + 0.06, yR + 0.04, 0], 0.075, 'roof', '#5c6e7c', 6);
    for (const s of [-1, 1]) st.add(kit.sphere(0.1, 6, 5), 'roof', { pos: [s * (hw + ov + 0.05), yR + 0.05, 0], color: '#566a78' });
    st.box(hw + 0.01, hw + 0.05, 1.18, 1.34, 0.13, 0.2, 'wood', '#8a7a62'); st.add(H.atlas.quad(0.24, 0.12, plate), 'atlas', { pos: [-hw - 0.13 + 0.13, 1.25, 0.133] });
    return st;
  }
  /** A tin post box on a stalk or on a wall. */
  function mailbox(st, x, y, z, col = '#c0483e') {
    st.box(x - 0.15, x + 0.15, y, y + 0.32, z, z + 0.16, 'worn', col); st.box(x - 0.17, x + 0.17, y + 0.32, y + 0.34, z - 0.02, z + 0.18, 'worn', '#6f7a7e');
    st.rect(x - 0.1, x + 0.1, y + 0.2, y + 0.24, z + 0.162, 'flat', '#35302c');
    st.add(kit.box(0.06, 0.012, 0.02), 'flat', { pos: [x, y + 0.14, z + 0.165], color: '#efe9d6' });
    // letters nobody collected, curling out of the slot
    st.quad([x - 0.08, y + 0.24, z + 0.17], [x + 0.08, y + 0.24, z + 0.17], [x + 0.06, y + 0.33, z + 0.21], [x - 0.08, y + 0.32, z + 0.19], 'flat', '#efe9d6');
  }
  function hedge(a, b, h = 0.9, r = 0.38) {
    const n = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.56));
    for (let i = 0; i <= n; i++) { const t = i / n, x = lerp(a[0], b[0], t) + R.range(-0.07, 0.07), z = lerp(a[1], b[1], t) + R.range(-0.07, 0.07), hh = h * R.range(0.82, 1.1); clumpW([x, hh * 0.55, z], r * R.range(0.92, 1.16), hh * 0.62, 10, { s: 0.32 }); }
  }

  // ---------------------------------------------------------------- the top of the hill: sando, lanterns, foxes, ema, basin, hokora -
  // cap stones along the top of the retaining wall, with the odd gap where one has gone over the edge
  const caps = (ax, az, bx, bz, skip) => {
    const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L, yaw = Math.atan2(-uz, ux); let s = 0.1;
    while (s < L - 0.1) {
      const l = Math.min(L - s, R.range(0.72, 1.25)), cx = ax + ux * (s + l / 2), cz = az + uz * (s + l / 2);
      if (!(skip && skip(cx, cz)) && R() > 0.05) stones.add(kit.chip(kit.box(l - 0.03, 0.2, 0.46, 2, 1, 1), 0.014, R), stoneMat, { pos: [cx, Y - 0.03 + R.range(-0.015, 0.03), cz], rot: [R.range(-0.015, 0.015), yaw, R.range(-0.015, 0.015)], color: R.pick(PAL.sun) });
      else grassW(cx, cz, 0.32, 14);
      s += l + 0.012;
    }
  };
  const inN = 0.18, xa = top.x0 + inN, xb = top.x1 - inN, za = top.z0 + inN, zb = top.z1 - inN;
  caps(xa, za, xb, za); caps(xa, zb, xb, zb); caps(xa, za, xa, zb); caps(xb, za, xb, zb, (x, z) => z > ST.z[0] - 0.1 && z < ST.z[1] + 0.1);

  // the sando: a paved way from the stair top, bending to the shrine
  const sando = [[STAIR_TOP, TORII.z], [-28.7, TORII.z], [-29.7, -33.5], [-30.6, byId.n14.z]];
  {
    const seg = (i) => { const a = sando[i], b = sando[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]); return { a, ux: (b[0] - a[0]) / l, uz: (b[1] - a[1]) / l, l }; };
    for (let i = 0; i < sando.length - 1; i++) {
      const { a, ux, uz, l } = seg(i); let s = 0.02, yaw = Math.atan2(uz, ux);
      while (s < l) {
        const d = R.range(0.34, 0.46), cols = 3, off = R.range(-0.08, 0.08);
        for (let k = 0; k < cols; k++) {
          const v = (k - 1) * 0.42 + off, cx = a[0] + ux * (s + d / 2) - uz * v, cz = a[1] + uz * (s + d / 2) + ux * v, w = 0.4 + R.range(-0.03, 0.03);
          stones.add(kit.chip(kit.box(d, 0.09, w, 1, 1, 1), 0.012, R), stoneMat, { pos: [cx, Y + 0.02, cz], rot: [0, -yaw + R.range(-0.06, 0.06), 0], color: R.pick(['#c6bfa8', '#b8b19c', '#d0c8b2', '#a9a596']) });
        }
        s += d + 0.05;
      }
    }
    // stepping stones off to the pavilion
    for (let i = 0; i < 4; i++) { const t = i / 3, x = lerp(-29.0, -29.6, t), z = lerp(-32.0, -30.5, t); stones.add(kit.chip(kit.cyl(0.26, 0.28, 0.08, 7), 0.02, R), stoneMat, { pos: [x, hAt(x, z) + 0.03, z], rot: [0, R() * 3, 0], color: '#b8b19c' }); }
  }

  /** Stone lantern, tōrō. */
  const LANT = '#bdb7a6';
  function lanternParts(s = 1) {
    const list = [], push = (g, pos, rot, scale, col = LANT) => list.push({ g, pos, rot, scale, col });
    push(kit.cylBase(0.27 * s, 0.32 * s, 0.13 * s, 6), [0, 0, 0]);
    push(kit.cylBase(0.095 * s, 0.13 * s, 0.56 * s, 8), [0, 0.13 * s, 0]);
    push(kit.cylBase(0.3 * s, 0.17 * s, 0.13 * s, 6), [0, 0.69 * s, 0]);
    push(kit.boxBase(0.34 * s, 0.32 * s, 0.34 * s), [0, 0.82 * s, 0], null, null, '#c7c1b0');
    push(kit.cylBase(0.07 * s, 0.46 * s, 0.26 * s, 6), [0, 1.14 * s, 0], null, null, '#a8a595');
    push(kit.sphere(0.1 * s, 7, 5), [0, 1.44 * s, 0], null, [1, 1.15, 1]);
    return list;
  }
  function lantern(x, z, s = 1, { yaw = 0, y = hAt(x, z) } = {}) {
    const m0 = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y - 0.02, z);
    for (const p of lanternParts(s)) { const g = p.g; stones.add(g, stoneMat, { matrix: new THREE.Matrix4().copy(m0).multiply(kit.xf({ pos: p.pos, rot: p.rot || [0, 0, 0], scale: p.scale || 1 })), color: p.col }); }
    const s2 = anchor(x, z, y, yaw, 1.5); for (const a of [0, Q, 2 * Q, 3 * Q]) { const f = s2.sub({ rot: [0, a, 0] }); f.rect(-0.1 * s, 0.1 * s, 0.86 * s, 1.1 * s, 0.172 * s, 'flat', '#4b5a5a'); f.rect(-0.1 * s, 0.1 * s, 0.86 * s, 0.95 * s, 0.173 * s, 'flat', '#e8c777'); }
    clumpW([x, y + 0.14, z], 0.3, 0.17, 6, { s: 0.2, core: false });
    const ph = x * 2.3 + z; // night: a flame nobody lit
    ctx.shared.lamps.push({ pos: [x, y + 0.96 * s, z], r: 5, color: '#ffb057', power: 0.72, halo: 1.0 * s, lift: 0.3, k: (t) => 0.84 + 0.16 * Math.sin(t * 6.1 + ph) * Math.sin(t * 2.3 + ph * 1.7) });
  }
  lantern(-28.1, TORII.z - 1.35, 1.16); lantern(-28.1, TORII.z + 1.45, 1.16, { yaw: 0.26 });
  lantern(-31.0, -37.4, 1.05, { yaw: 0.5 });
  // this one has gone over, and lost its head to the ferns
  {
    const x = -29.6, z = -36.0, y = hAt(x, z), L = lanternParts(1.1), rot = new THREE.Matrix4().makeRotationZ(1.46).premultiply(new THREE.Matrix4().makeRotationY(0.5));
    L.slice(0, 4).forEach((p, i) => { const m = new THREE.Matrix4().copy(rot).multiply(kit.xf({ pos: p.pos, scale: p.scale || 1 })); m.setPosition(new THREE.Vector3().setFromMatrixPosition(m).add(new THREE.Vector3(x, y + 0.2, z))); stones.add(p.g, stoneMat, { matrix: m, color: p.col }); });
    stones.add(kit.cylBase(0.07 * 1.1, 0.46 * 1.1, 0.26 * 1.1, 6), stoneMat, { pos: [x - 1.1, y + 0.02, z - 0.5], rot: [0.3, 1, 0.85], color: '#a8a595' });
    stones.add(kit.sphere(0.11, 7, 5), stoneMat, { pos: [x - 1.5, y + 0.06, z + 0.2], color: LANT });
    fern(x - 0.5, y, z - 0.1, 0.9); fern(x + 0.35, y, z + 0.3, 0.72); fern(x - 1.2, y, z - 0.4, 0.8);
    clumpW([x - 0.1, y + 0.14, z], 0.5, 0.2, 10, { s: 0.22, core: false });
  }

  /** A stone fox on its plinth. dir is ±1 so the pair mirror each other. */
  function fox(x, z, yaw, dir, y0) {
    const st = anchor(x, z, y0, yaw, 1.6), sm = (g, o) => stones.add(g, stoneMat, { ...o, matrix: new THREE.Matrix4().multiplyMatrices(st.m, kit.xf(o)) });
    const C = '#b6b1a2', C2 = '#a8a595';
    sm(kit.chip(kit.boxBase(0.58, 0.14, 0.78, 1, 1, 1), 0.02, R), { pos: [0, 0, 0], color: '#9c9a8b' }); sm(kit.boxBase(0.48, 0.5, 0.66), { pos: [0, 0.14, 0], color: C2 }); sm(kit.boxBase(0.56, 0.1, 0.74), { pos: [0, 0.64, 0], color: C });
    const y1 = 0.74;
    sm(kit.sphere(0.2, 10, 7), { pos: [0, y1 + 0.3, -0.08], scale: [0.86, 1.25, 1], rot: [-0.2, 0, 0], color: C });
    sm(kit.sphere(0.13, 9, 6), { pos: [0, y1 + 0.52, 0.03], scale: [0.86, 1, 0.92], color: C });
    sm(kit.cyl(0.05, 0.09, 0.2, 8), { pos: [0, y1 + 0.58, 0.18], rot: [Q, 0, 0], color: C2 });
    for (const s of [-1, 1]) {
      sm(kit.cyl(0.015, 0.05, 0.17, 6), { pos: [s * 0.075, y1 + 0.72, -0.01], rot: [0, 0, s * -0.2], color: C2 });
      sm(kit.cyl(0.044, 0.05, 0.3, 7), { pos: [s * 0.08, y1 + 0.13, 0.13], rot: [0.1, 0, 0], color: C });
      sm(kit.sphere(0.05, 6, 4), { pos: [s * 0.08, y1 + 0.03, 0.19], color: C });
    }
    sm(kit.tube([[dir * 0.05, y1 + 0.1, -0.26], [dir * 0.2, y1 + 0.28, -0.36], [dir * 0.24, y1 + 0.58, -0.26], [dir * 0.17, y1 + 0.86, -0.28]], 0.075, 0.03, 6, 12), { pos: [0, 0, 0], color: C2 });
    // moss has climbed the south shoulder and settled on the back
    for (const [px, py, pz, rx, ry, rz] of [[0.1, y1 + 0.46, -0.16, 0.14, 0.12, 0.14], [dir * 0.14, y1 + 0.78, -0.26, 0.09, 0.08, 0.09], [-0.1, y1 + 0.26, -0.2, 0.12, 0.1, 0.12], [0, y1 + 0.62, 0.0, 0.08, 0.05, 0.08], [dir * -0.22, y1 + 0.02, 0.0, 0.14, 0.05, 0.22]]) {
      const p = st.w([px, py, pz]); soft.add(kit.chip(kit.sphere(1, 7, 4), 0.12, R), softMat, { pos: [p.x, p.y, p.z], scale: [rx, ry, rz], color: R.pick([P.moss, P.mossDeep, P.mossLit]) });
    }
    const bib = st.sub({ pos: [0, y1 + 0.47, 0.145], rot: [-0.18, 0, 0] });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-0.13, 0, 0, 0.13, 0, 0, 0, -0.26, 0], 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    const [u, v] = whiteUV(); g.setAttribute('uv', new THREE.Float32BufferAttribute([u, v, u, v, u, v], 2)); g.applyMatrix4(bib.m);
    swing.add(g, { pivot: bib.w([0, 0, 0]).toArray(), axis: bib.dir([1, 0, 0]).toArray(), amp: 0.12, speed: 1, phase: dir, bend: 2, color: '#c9573f' });
  }
  { const xf = -29.92, s = byId.n14.z, yf = Y - 0.02; fox(xf, s - 1.52, Q, 1, yf); fox(xf, s + 1.52, Q, -1, yf); }

  // the ema board by the pavilion: a low rack with a little roof, plaques hung in two rows
  H.atlas.paint('north-ema', 72, 72, (g, w, h, t) => { g.fillStyle = '#c9a97a'; g.fillRect(0, 0, w, h); t.grain(w, h, 'rgba(70,46,30,.35)', 8); g.fillStyle = '#b5493f'; g.beginPath(); g.arc(14, 54, 8, 0, 6.3); g.fill(); t.text('願', 26, 30, 36, '#2e2a26', { font: t.SERIF, weight: 900 }); t.text('合格', 54, 40, 22, '#2e2a26', { font: t.SERIF, weight: 900, vertical: true, gap: 1.02 }); });
  H.atlas.paint('north-ema2', 72, 72, (g, w, h, t) => { g.fillStyle = '#d6b98a'; g.fillRect(0, 0, w, h); t.grain(w, h, 'rgba(70,46,30,.3)', 8); t.text('家内', 20, 22, 22, '#2e2a26', { font: t.SERIF, weight: 900, vertical: true, gap: 1.02 }); t.text('安全', 52, 22, 22, '#2e2a26', { font: t.SERIF, weight: 900, vertical: true, gap: 1.02 }); g.fillStyle = '#b5493f'; g.fillRect(8, 60, 10, 8); });
  function plaque(st, x, y, z, w, h, cell, phase) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-w / 2, -h, 0, w / 2, -h, 0, w / 2, -h * 0.28, 0, 0, 0, 0, -w / 2, -h * 0.28, 0], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(15).fill(0).map((_, i) => (i % 3 === 2 ? 1 : 0)), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 0.72, 0.5, 1, 0, 0.72], 2)); g.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4]);
    H.atlas.uvTo(g, cell); g.applyMatrix4(st.mx({ pos: [x, y, z] }));
    swing.add(g, { pivot: st.w([x, y, z]).toArray(), axis: st.dir([1, 0, 0]).toArray(), amp: 0.16, speed: 0.9, phase, bend: 0, color: R.pick(['#ffffff', '#e6dcc8', '#d7cdb6']) });
  }
  {
    const pv = byId.n15, x = pv.x + pv.w / 2 + 0.55, z = pv.z - 0.2, y0 = hAt(x, z), s = anchor(x, z, y0 - 0.02, Q, 2.2);   // +x along the rack toward -z world; faces +x world
    for (const a of [-0.95, 0.95]) { s.rod([a, 0, 0], [a, 1.82, 0], 0.05, 'wood', '#7a5c46', 6); s.add(kit.cylBase(0.1, 0.13, 0.14, 7), 'concrete', { pos: [a, 0, 0] }); }
    for (const yy of [1.02, 1.42]) s.box(-1.0, 1.0, yy, yy + 0.05, -0.03, 0.03, 'wood', '#8a6a4e');
    s.box(-1.25, 1.25, 1.82, 1.86, -0.34, 0.34, 'wood', '#6e5038');
    for (const sg of [-1, 1]) s.quad([-1.3, 1.86, sg * 0.4], [1.3, 1.86, sg * 0.4], [1.3, 2.08, 0], [-1.3, 2.08, 0], 'wood', '#5e4634');
    s.box(-1.34, 1.34, 2.06, 2.12, -0.05, 0.05, 'wood', '#4e3a2c');
    for (const yy of [1.02, 1.42]) for (let a = -0.84; a < 0.86; a += 0.22) { if (R() < 0.12) continue; plaque(s, a + R.range(-0.02, 0.02), yy - 0.02, 0.05 + R.range(-0.01, 0.01), 0.2, 0.17, R() < 0.5 ? 'north-ema' : 'north-ema2', a * 3); }
    clumpW([x + 0.05, y0 + 0.55, z + 0.95], 0.32, 0.5, 8, { s: 0.26, core: false });
  }
  // the temizu: a stone trough, a bamboo pipe that still runs, rainwater and a floating leaf
  {
    const x = -28.05, z = -28.55, y = hAt(x, z), L = 1.0, W2 = 0.52;
    stones.add(kit.boxBase(L + 0.3, 0.18, W2 + 0.3), stoneMat, { pos: [x, y - 0.02, z], color: '#9c9a8b' });
    stones.add(kit.chip(kit.boxBase(L, 0.5, W2, 2, 1, 1), 0.02, R), stoneMat, { pos: [x, y + 0.14, z], color: '#b6b1a2' });
    WS.add(kit.box(L - 0.1, 0.02, W2 - 0.1), 'flat', { pos: [x, y + 0.66, z], color: P.waterDeep });
    soft.add(kit.leaf(0.2, 0.12, 0.2), softMat, { pos: [x + 0.15, y + 0.68, z + 0.05], rot: [0, 1.2, 0], color: P.ivyRed });
    const bam = '#c8b67a'; WS.tube([[x - 0.1, y + 1.22, z - 0.9], [x - 0.05, y + 1.15, z - 0.4], [x, y + 0.97, z - 0.04]], 0.05, 0.04, 'flat', bam, 6, 10);
    WS.rod([x - 0.16, y, z - 0.9], [x - 0.13, y + 1.28, z - 0.92], 0.055, 'wood', '#7a5c46', 6);
    for (const [dx, dz, cc] of [[-0.38, 0.32, '#8a6a4e'], [-0.5, 0.32, '#a98a6a']]) { WS.rod([x + dx, y + 0.28, z + dz], [x + dx + 0.28, y + 0.72, z + dz + 0.04], 0.012, 'wood', cc, 4); WS.add(kit.cylBase(0.07, 0.06, 0.08, 7, true), 'flat', { pos: [x + dx + 0.28, y + 0.7, z + dz + 0.04], rot: [0, 0, 0.6], color: cc }); }
    fern(x + 0.3, y, z - 0.75, 0.7);
  }
  // a stone marker at the foot of the steps, and the donors' pillars along the hill's front
  H.atlas.paint('north-stone', 56, 192, (g, w, h, t) => { g.fillStyle = '#b6b1a2'; g.fillRect(0, 0, w, h); t.text('緑乃社', w / 2, 34, 42, '#5d5e56', { font: t.SERIF, weight: 900, vertical: true, gap: 1.1 }); });
  {
    const x = ST.x[1] + 0.8, z = ST.z[1] + 0.85, y = 0;
    stones.add(kit.chip(kit.boxBase(0.5, 0.12, 0.5), 0.02, R), stoneMat, { pos: [x, y, z], color: '#9c9a8b' });
    stones.add(kit.boxBase(0.34, 1.52, 0.2), stoneMat, { pos: [x, y + 0.12, z], color: '#b6b1a2' });
    stones.add(kit.cylBase(0.0, 0.24, 0.12, 4), stoneMat, { pos: [x, y + 1.64, z], rot: [0, Q / 2, 0], scale: [1, 1, 0.7], color: '#b6b1a2' });
    WS.add(H.atlas.quad(0.28, 1.2, 'north-stone'), 'atlas', { pos: [x + 0.172, y + 0.92, z], rot: [0, Q, 0] });
  }

  // the little fox shrine behind the main hall, reached under a run of small red torii
  {
    const hx = -37.1, hz = -33.0, y = hAt(hx, hz), s = anchor(hx, hz, y, 0, 1.6), RED = '#cc5a3e', wd = '#7a4a3a';
    s.box(-0.55, 0.55, -0.1, 0.18, -0.55, 0.55, 'concrete', P.concreteMid); s.box(-0.42, 0.42, 0.18, 0.28, -0.42, 0.42, 'wood', '#6e5038');
    s.box(-0.36, 0.36, 0.28, 0.95, -0.34, 0.34, 'wood', wd); s.rect(-0.26, 0.26, 0.36, 0.86, 0.345, 'flat', '#4b5a5a');
    for (const x of [-0.13, 0.13]) { s.rect(x - 0.1, x + 0.1, 0.38, 0.84, 0.35, 'flat', '#8a5a44'); for (let yy = 0.46; yy < 0.84; yy += 0.11) s.hbar(x - 0.1, x + 0.1, yy, yy + 0.012, 0.35, 0.355, 'flat', '#c8b67a'); }
    for (const sg of [-1, 1]) { s.quad([-0.6, 0.98, sg * 0.56], [0.6, 0.98, sg * 0.56], [0.6, 1.34, 0], [-0.6, 1.34, 0], 'roof', '#6f9a8a'); }
    s.box(-0.66, 0.66, 1.33, 1.4, -0.05, 0.05, 'roof', '#5f8a7c'); for (const e of [-0.6, 0.6]) s.quad([e, 0.98, -0.56], [e, 0.98, 0.56], [e, 1.34, 0], [e, 1.34, 0], 'wood', '#6e5038');
    shide(s, -0.15, 0.95, 0.38, { n: 3, size: 0.08 }); shide(s, 0.15, 0.95, 0.38, { n: 3, size: 0.08 });
    // the run of mini-torii toward the south
    for (let i = 0; i < 5; i++) {
      const tz = hz + 1.25 + i * 0.68, tx = hx + 0.25 * Math.sin(i * 0.7), a = anchor(tx, tz, hAt(tx, tz) - 0.02, Q / 3 * Math.sin(i * 1.4) * 0.2, 1.3), span = 0.52, hh = 1.18 - i * 0.03;
      for (const sg of [-1, 1]) a.rod([sg * span, 0, 0], [sg * (span - 0.05), hh, 0], 0.05, 'worn', RED, 7, 0.042);
      a.box(-span - 0.1, span + 0.1, hh - 0.32, hh - 0.25, -0.03, 0.03, 'worn', RED); a.box(-span - 0.16, span + 0.16, hh - 0.04, hh + 0.02, -0.06, 0.06, 'worn', RED); a.box(-span - 0.2, span + 0.2, hh + 0.02, hh + 0.08, -0.08, 0.08, 'flat', '#3e4648');
    }
  }

  // ---- undergrowth and the reclaiming of the wall ----
  {
    // ferns and tufts across the floor, thick against the wall heads, thin on the path
    const inPath = (x, z) => sando.some((p, i) => { if (i === sando.length - 1) return false; const b = sando[i + 1], d = Math.hypot(b[0] - p[0], b[1] - p[1]), t = clamp(((x - p[0]) * (b[0] - p[0]) + (z - p[1]) * (b[1] - p[1])) / (d * d)); return Math.hypot(x - p[0] - (b[0] - p[0]) * t, z - p[1] - (b[1] - p[1]) * t) < 0.85; });
    const solids = Object.values(byId).filter((b) => b.elev > 0).map((b) => buildingBox(b, 0.3));
    const blocked = (x, z) => inPath(x, z) || solids.some((r) => x > r.x[0] && x < r.x[1] && z > r.z[0] && z < r.z[1]);
    for (let i = 0; i < 26; i++) { const x = R.range(top.x0 + 0.6, top.x1 - 0.5), z = R.range(top.z0 + 0.6, top.z1 - 0.5); if (blocked(x, z)) continue; fern(x, hAt(x, z), z, R.range(0.7, 1.05), R() * 6, R.pick([P.fern, P.leafDeep]), 5); }
    for (let i = 0; i < 44; i++) { const x = R.range(top.x0 + 0.3, top.x1 - 0.3), z = R.range(top.z0 + 0.3, top.z1 - 0.3); if (blocked(x, z)) continue; grassW(x, z, R.range(0.3, 0.7), 18, hAt(x, z)); }
    // the wall head grows a skirt of leaves at the corners and along the south-facing run
    const edgeBush = (ax, az, bx, bz, n, rr = 0.75) => { for (let i = 0; i < n; i++) { const t = (i + R()) / n, x = lerp(ax, bx, t), z = lerp(az, bz, t); bushW(x, z, rr * R.range(0.7, 1.15), Y + 0.06); } };
    edgeBush(xa + 0.1, zb - 0.1, -33, zb - 0.1, 5); edgeBush(-30, zb - 0.1, xb - 0.1, zb - 0.1, 3); edgeBush(xa + 0.1, za + 0.1, xa + 0.1, -28, 5); edgeBush(xa + 0.1, za + 0.1, -29, za + 0.1, 4);
    edgeBush(xb - 0.15, za + 0.1, xb - 0.15, ST.z[0] - 0.8, 2, 0.7); edgeBush(xb - 0.15, ST.z[1] + 0.8, xb - 0.15, zb - 0.3, 3, 0.7);
    // ivy curtains and roots over the stonework: one frame at a time, down to the plinth and, on the outside, over it
    const pad = '#378f58';
    const curtain = (fr, s0, s1, depth, over = 0) => {
      const n = Math.max(3, Math.round((s1 - s0) / 0.22)), ph = R() * 6, topT = fr.hh + 0.1;
      const lobes = Array.from({ length: Math.max(2, Math.round((s1 - s0) / 0.8)) }, () => [R(), R.range(0.5, 1), R.range(0.18, 0.4)]);
      const low = (a) => { let m = 0.12; for (const [c, hh, rd] of lobes) { const q = (a - c) / rd; if (q * q < 1) m = Math.max(m, hh * Math.sqrt(1 - q * q)); } return topT - depth * m * Math.min(1, Math.min(a, 1 - a) * 3 + 0.3); };
      const P3 = (s, t, d) => add(add(add(fr.O, fr.U, s), fr.V, t), fr.N, d);
      for (let i = 0; i < n; i++) { const a = i / n, b = (i + 1) / n, sa = lerp(s0, s1, a), sb = lerp(s0, s1, b); WS.quad(P3(sa, low(a), 0.13), P3(sb, low(b), 0.13), P3(sb, topT, 0.13), P3(sa, topT, 0.13), 'flat', pad); }
      const cnt = Math.round((s1 - s0) * depth * 13 * H.density);
      for (let i = 0; i < cnt; i++) { const a = R(), s = lerp(s0, s1, a), t = lerp(low(a), topT + 0.08, Math.pow(R(), 0.8)), p = P3(s, t, R.range(0.15, 0.25)); clumpW(p, 0.12, 0.11, 1, { s: 0.26, core: false, droop: 0.8 }); }
      // long runners past the foot on an outer face
      if (over) for (let i = 0; i < over; i++) { const s = R.range(s0, s1), o = P3(s, low(clamp((s - s0) / (s1 - s0))), 0.16), yEnd = R.range(-1.4, -0.4); WS.tube([o, add(o, fr.N, 0.1), [o[0] + fr.N[0] * 0.32, 0.1, o[2] + fr.N[2] * 0.32], [o[0] + fr.N[0] * 0.28, yEnd, o[2] + fr.N[2] * 0.28]], 0.03, 0.012, 'flat', '#6a6a42', 4, 14); for (let k = 0; k < 6; k++) { const yy = lerp(o[1], yEnd, k / 6 + R() * 0.1); clumpW([o[0] + fr.N[0] * (0.25 + R() * 0.1), yy, o[2] + fr.N[2] * (0.25 + R() * 0.1)], 0.14, 0.14, 2, { s: 0.28, core: false, droop: 0.7 }); } }
    };
    curtain(N_, 1.4, 3.6, 1.6, 2); curtain(N_, 7.2, 8.8, 1.1); curtain(W_, 2.4, 6.2, 2.0, 3); curtain(W_, 10.1, 12.5, 1.4, 2);
    curtain(S_, 1.1, 2.9, 1.5); curtain(S_, 8.4, 11.4, 1.7); curtain(E1, 1.2, 3.8, 1.3); curtain(E2, 0.5, 2.9, 1.1);
    // cedar roots that have prised the head of the wall
    const root = (fr, s, depth, wob) => {
      const P3 = (u, t, d) => add(add(add(fr.O, fr.U, u), fr.V, t), fr.N, d), pts = [add(P3(s, fr.hh + 0.06, 0.05), fr.N, -0.35)];
      for (let i = 0; i <= 3; i++) { const t = fr.hh + 0.02 - (depth * i) / 3; pts.push(P3(s + Math.sin(i * 2.2 + wob) * 0.28, t, 0.14 + 0.03 * Math.sin(i * 3 + wob))); }
      WS.tube(pts, 0.1, 0.035, 'flat', '#70604c', 6, 14);
    };
    root(N_, 4.6, 1.5, 1); root(N_, 6.1, 1.0, 2); root(W_, 7.6, 1.8, 3); root(W_, 8.8, 1.2, 4); root(W_, 12.9, 0.9, 5); root(S_, 4.2, 1.2, 6); root(S_, 6.5, 1.5, 7); root(E2, 3.6, 1.0, 8);
    // foot of the wall on the lane sides: shrubs, grass, one fallen cap
    const foot = (fr, n, rr) => { for (let i = 0; i < n; i++) { const s = R.range(0.5, fr.L - 0.5), o = add(add(fr.O, fr.U, s), fr.N, 0.55 * R.range(0.8, 1.3)); if (Math.max(Math.abs(o[0]), Math.abs(o[2])) > 39.7) continue; if (R() < 0.45) bushW(o[0], o[2], rr * R.range(0.72, 1.15), 0); grassW(o[0], o[2], R.range(0.5, 0.9), 26, 0.02); } };
    foot(S_, 8, 0.65); foot(E1, 4, 0.55); foot(E2, 5, 0.6);
    stones.add(kit.chip(kit.box(0.7, 0.2, 0.42, 2, 1, 1), 0.02, R), stoneMat, { pos: [-33, 0.1, zS + 0.55], rot: [0.2, 0.7, 0.14], color: PAL.shade[1] });
    stones.add(kit.chip(kit.box(0.6, 0.18, 0.4, 2, 1, 1), 0.02, R), stoneMat, { pos: [-30.2, 0.09, zS + 0.72], rot: [-0.1, 1.9, 0.1], color: PAL.shade[0] });
  }

  // ---------------------------------------------------------------- torii extras: the rope, the paper, the grass around its feet -----
  {
    const T = anchor(TORII.x, TORII.z, 0, TORII.yaw, 4.4), y0 = 2.84, span = 1.34, sag = 0.26, n = 60, rope = (ph, col) => {
      const pts = []; for (let i = 0; i <= n; i++) { const u = i / n, x = -span + 2 * span * u, y = y0 - sag * (1 - (2 * u - 1) ** 2) * 1, a = u * 22 + ph, r = 0.05 + 0.03 * Math.sin(Math.PI * u); pts.push([x, y + Math.sin(a) * r, 0.12 + Math.cos(a) * r]); }
      T.tube(pts, 0.07, 0.05, 'flat', col, 5, 60);
    };
    rope(0, '#d6c79f'); rope(Math.PI, '#b9a877');
    for (const x of [-0.72, 0.72]) { for (let i = 0; i < 4; i++) { const ox = x + (i - 1.5) * 0.018; T.rod([ox, y0 - 0.12 - 0.02 * Math.abs(x), 0.14], [ox + (i - 1.5) * 0.02, y0 - 0.46, 0.14], 0.012, 'flat', '#c9b98a', 3, 0.006, true); } }
    for (const x of [-0.95, -0.34, 0.34, 0.95]) shide(T, x, y0 - 0.2 - 0.16 * (1 - (x / span) ** 2), 0.16, { n: 4, size: 0.11 });
    // the base stones are sinking, the grass is coming up round them
    grassW(TORII.x + 0.2, TORII.z + 1.6, 0.7, 26, 0.02); grassW(TORII.x - 0.1, TORII.z - 1.6, 0.8, 30, 0.02); bushW(TORII.x + 0.5, TORII.z + 2.3, 0.55, 0); fern(TORII.x + 0.5, 0.03, TORII.z - 1.1, 0.8);
    // a long crack of paint gone from the south leg, wood showing
    const legS = anchor(TORII.x, TORII.z, 0, TORII.yaw, 4.4);
    legS.rect(1.46, 1.54, 0.8, 1.7, 0.185, 'flat', '#b89a7a');
  }

  // ---------------------------------------------------------------- the lanes -----------------------------------------------------
  {
    const ringN = RING_ROADS.find((r) => r.id === 'ringN'), roadZ = (x) => { const pts = ringN.pts; for (let i = 0; i < pts.length - 1; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1]; if (x >= ax && x <= bx) return lerp(az, bz, (x - ax) / (bx - ax)); } return pts[0][1]; };
    const edgeS = (x) => roadZ(x) + ringN.w / 2, edgeN = (x) => roadZ(x) - ringN.w / 2;

    // south of ringN: n09 and n10 sit behind a block wall with their gates on the lane
    const b09 = byId.n09, b10 = byId.n10;
    const gateX09 = b09.x + 0.7, gateX10 = b10.x - 0.5, wz = (x) => edgeS(x) + 0.26;
    blockWall([-5.3, wz(-5.3)], [gateX09 + 0.75, wz(gateX09 + 0.75)], 1.22, { perf: true });
    blockWall([gateX09 - 0.75, wz(gateX09 - 0.75)], [gateX10 + 0.75, wz(gateX10 + 0.75)], 1.28, { broken: [[1.1, 2.3, 0.45]] });
    blockWall([gateX10 - 0.75, wz(gateX10 - 0.75)], [-16.6, wz(-16.6)], 1.16, { broken: [[1.5, 2.1, 0.7]] });
    const G1 = anchor(gateX09, wz(gateX09), 0, Math.PI, 2.6), G2 = anchor(gateX10, wz(gateX10), 0, Math.PI, 2.6);
    tiledGate(G1, 1.3, 'north-plate1'); tiledGate(G2, 1.2, 'north-plate2');
    mailbox(G1, 0.62, 1.1, 0.13, '#b5493f'); mailbox(G2, -0.56, 1.05, 0.13, '#4e8a90');
    // one gate leaf hanging open, one still shut and swallowed
    G1.sub({ pos: [-0.62, 0, -0.05], rot: [0, 0.9, 0] }).box(0, 0.62, 0.02, 1.34, -0.02, 0.02, 'wood', '#7a5c46');
    G1.sub({ pos: [0.62, 0, -0.05], rot: [0, Math.PI - 0.4, 0] }).box(0, 0.62, 0.02, 1.34, -0.02, 0.02, 'wood', '#6e5038');
    for (let i = 0; i < 6; i++) G2.box(-0.6 + i * 0.2, -0.45 + i * 0.2, 0.04, 1.3, -0.02, 0.02, 'wood', i % 2 ? '#6e5038' : '#7a5c46');
    G2.sub({}).rod([-0.5, 0.2, 0.05], [-0.1, 0.9, 0.05], 0.02, 'flat', '#6a6a42', 4); clumpW(G2.w([-0.3, 0.75, 0.05]).toArray(), 0.45, 0.45, 12, { s: 0.3, core: false });

    // north of ringN: lower walls, a hedge where the wall has been given up
    const nZ = (x) => edgeN(x) - 0.2;
    const hedgeRun = (a, b, h, r) => hedge([a, nZ(a)], [b, nZ(b)], h, r);
    blockWall([-5.9, nZ(-5.9)], [-8.6, nZ(-8.6)], 1.05, { perf: false, col: '#c6c1b0' });
    hedgeRun(-9.9, -11.2, 0.85, 0.36);
    blockWall([-11.5, nZ(-11.5)], [-13.2, nZ(-13.2)], 0.98, { perf: false, col: '#bdb9aa', broken: [[0.6, 1.3, 0.3]] });
    blockWall([-14.7, nZ(-14.7)], [-16.2, nZ(-16.2)], 1.0, { perf: false, col: '#c6c1b0' });
    blockWall([-17.1, nZ(-17.1)], [-20.6, nZ(-20.6)], 1.08, { perf: false, col: '#bdb9aa', broken: [[2.0, 3.3, 0.35]] });

    // a bicycle gone into the hedge on the n11 frontage, and one chained to the n13 wall that the wall has outlived
    { const x = -10.45, z = nZ(-10.45) + 0.02, s = anchor(x, z, 0.02, 0.1, 1.1); bicycle(s, { lean: 0.22, col: '#9d5236' }); for (let i = 0; i < 5; i++) clumpW([x + R.range(-0.7, 0.7), R.range(0.2, 0.95), z + R.range(-0.12, 0.25)], 0.3, 0.26, 7, { s: 0.28, core: false }); }
    { const x = -19.2, z = nZ(-19.2) + 0.16, s = anchor(x, z, 0.02, 0, 1.1); bicycle(s, { lean: -0.18, col: '#5f8fa0' }); for (let i = 0; i < 3; i++) clumpW([x + R.range(-0.5, 0.5), R.range(0.1, 0.7), z + R.range(-0.1, 0.2)], 0.24, 0.22, 5, { s: 0.28, core: false }); }

    // poles and wires, the line everything hangs from
    const POLES = [[-10.65, wz(-10.65) + 0.04], [-4.9, wz(-4.9) - 0.05], [2.95, -27.6], [2.95, -21.6], [2.95, -33.6], [2.95, -38.6]];
    const chain = [[POLES[0], POLES[1]], [POLES[1], POLES[2]], [POLES[3], POLES[2]], [POLES[2], POLES[4]], [POLES[4], POLES[5]]];
    const poleTop = (p, i) => ({ x: p[0], z: p[1], y: 5.7 + (i % 3) * 0.18 });
    POLES.forEach((p, i) => {
      const tilt = [-0.04, 0.05, -0.02, 0.03, 0.05, -0.05][i], s = anchor(p[0], p[1], 0, 0.2 * i, 6).sub({ rot: [tilt, 0, tilt * 0.6] }), h = poleTop(p, i).y;
      s.rod([0, -0.1, 0], [0, h + 0.3, 0], 0.13, 'flat', '#b5b0a0', 7, 0.085); s.box(-0.72, 0.72, h - 0.08, h, -0.05, 0.05, 'worn', '#6f7a7e');
      for (const x of [-0.6, 0, 0.6]) s.add(kit.cylBase(0.04, 0.06, 0.14, 6), 'flat', { pos: [x, h, 0], color: '#d6d0bc' });
      if (i === 1 || i === 4) { s.add(kit.cylBase(0.21, 0.21, 0.58, 8), 'worn', { pos: [0, h - 1.5, 0.28], color: '#8d9ba4' }); s.box(-0.26, 0.26, h - 0.95, h - 0.9, -0.05, 0.42, 'worn', '#6f7a7e'); }
      const v0 = anchor(p[0], p[1], 0, 0, 6); v0.tube([[0.13, 0.05, 0.12], [0.08, 2.4, 0.14], [-0.06, 4.1, 0.12]], 0.035, 0.012, 'flat', '#6a6a42', 4, 14); for (let k = 0; k < 8; k++) { const pt = v0.w([R.range(-0.2, 0.25), R.range(0.3, 3.8), R.range(0.04, 0.28)]); clumpW(pt.toArray(), 0.2, 0.2, 3, { s: 0.28, core: false }); }
    });
    for (const [a, b] of chain) {
      const ia = POLES.indexOf(a), ib = POLES.indexOf(b), pA = poleTop(a, ia), pB = poleTop(b, ib), L = Math.hypot(b[0] - a[0], b[1] - a[1]), yawDir = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], perp = [-yawDir[1], yawDir[0]];
      for (const off of [-0.6, 0.6]) { const pts = []; const sag2 = 0.32 + R() * 0.12; for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push([lerp(a[0], b[0], t) + perp[0] * off, lerp(pA.y, pB.y, t) + 0.14 - sag2 * (1 - (2 * t - 1) ** 2), lerp(a[1], b[1], t) + perp[1] * off]); } WS.tube(pts, 0.009, 0.009, 'flat', '#3e4648', 3, 12); }
    }
    // a road mirror at the crossing and a stop sign that nobody is left to obey
    {
      const s = anchor(8.4, -31.9, 0, 0.3, 3.4), o = '#d9764a';
      s.rod([0, -0.1, 0], [0.02, 2.65, 0], 0.05, 'worn', o, 7); s.rod([0, 2.65, 0], [0.2, 2.92, 0.28], 0.03, 'worn', o, 5);
      s.add(kit.cyl(0.42, 0.42, 0.05, 16), 'worn', { pos: [0.2, 2.98, 0.32], rot: [1.25, 0.2, 0], color: o }); s.add(kit.torus(0.42, 0.04, 5, 18), 'worn', { pos: [0.2, 2.98, 0.32], rot: [1.25 + Q, 0.2, 0], color: '#c9653f' });
      s.add(kit.cyl(0.37, 0.37, 0.012, 16), 'flat', { pos: [0.22, 2.97, 0.35], rot: [1.25, 0.2, 0], color: '#bfe8e2' });
      s.tube([[0.08, 0.1, 0.04], [0.03, 1.4, 0.07], [0.05, 2.5, 0.03]], 0.024, 0.01, 'flat', '#6a6a42', 4, 10); for (let k = 0; k < 7; k++) { const pt = s.w([R.range(-0.2, 0.2), R.range(0.3, 2.3), R.range(0.03, 0.18)]); clumpW(pt.toArray(), 0.2, 0.2, 3, { s: 0.28, core: false }); }
    }
    H.atlas.paint('north-stop', 128, 112, (g, w, h, t) => { g.fillStyle = '#c0483e'; g.fillRect(0, 0, w, h); t.text('止まれ', w / 2, 36, 32, '#f4efdc', { font: t.FONT, weight: 900 }); t.blot(w, h, 8, ['#8f3a30'], 3, 9, 0.5); });
    {
      const s = anchor(2.15, -32.0, 0, 2.1, 3).sub({ rot: [0.06, 0, -0.07] });
      s.rod([0, -0.1, 0], [0, 2.3, 0], 0.035, 'worn', '#8d9ba4', 6);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-0.42, 0, 0, 0.42, 0, 0, 0, -0.74, 0], 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0.05, 1, 0.95, 1, 0.5, 0.05], 2)); H.atlas.uvTo(g, 'north-stop');
      s.add(g, 'atlas', { pos: [0, 2.34, 0.055] }); s.quad([-0.46, 2.38, 0.05], [0.46, 2.38, 0.05], [0, 1.54, 0.05], [0, 1.54, 0.05], 'worn', '#6f7a7e');
    }
    // hedges and pots along the narrow gaps
    hedge([b10.x - 2.6, b10.z + 2.4], [b10.x - 2.6, b10.z - 1.2], 1, 0.4); hedge([b09.x + 2.6, b09.z + 2.3], [b09.x + 2.6, b09.z - 1.6], 0.95, 0.38);
  }

  // ---------------------------------------------------------------- what happened at each house -----------------------------------
  {
    const R2 = ctx.seeded('north-stories'), props = H.props, sect = (st, x, y, z, rot) => st.sub({ pos: [x, y, z], rot: rot || [0, 0, 0] });
    const leafDrape = (st, x0, x1, ytop, z, depth, cols, n) => { // bracts in bunches along hanging stems, so the sheet has clots and gaps rather than confetti
      const stems = Math.round((x1 - x0) / 0.26);
      for (let s = 0; s < stems; s++) { const sx = lerp(x0, x1, (s + R2.range(0.15, 0.85)) / stems), len = depth * R2.range(0.45, 1), bunches = Math.round((len / depth) * 7 + 2); let xw = sx;
        for (let b = 0; b < bunches; b++) { const y = ytop - (b / bunches) * len - R2.range(0, 0.1), m = Math.round(n / stems / bunches) + R2.int(0, 2); xw += R2.range(-0.1, 0.1);
          for (let i = 0; i < m; i++) { const a = R2() * 6.3, q = R2() * 0.16, p = st.w([xw + Math.cos(a) * q, y + Math.sin(a) * q, z + R2.range(0, 0.16)]); soft.add(kit.leaf(0.14, 0.12, 0.2), softMat, { pos: p.toArray(), rot: [R2.range(0.6, 2), R2() * 6, R2.range(-0.5, 0.5)], scale: R2.range(0.95, 1.4), color: R2.pick(cols) }); } } } };

    // n01: the Tadokoros. Everything still arranged for a return that didn't come: a futon over the rail, shirts on the pole, the bicycle by the door.
    { const h = H_.n01, f = h.front, y = h.dims.f2 + 0.06, yl = y + 1.26;
      f.rod([-1.45, yl, 0.48], [1.45, yl + 0.02, 0.48], 0.018, 'wood', '#c8b67a', 5);
      hang(f, -0.88, yl, 0.48, 0.58, 0.82, 'stripe2', { phase: 0.2 }); hang(f, -0.16, yl, 0.48, 0.42, 0.62, 'sheet', { phase: 1.4, amp: 0.2 }); hang(f, 0.42, yl, 0.48, 0.5, 0.55, 'stripe', { phase: 2.1, amp: 0.17 }); hang(f, 1.02, yl, 0.48, 0.5, 0.42, 'white', { phase: 3, color: '#e6dcc4', amp: 0.2 });
      hang(f, 0.55, y + 0.88, 0.66, 1.3, 0.62, 'futon', { amp: 0.05, speed: 0.6, nx: 3, ny: 2, bend: 0.3 });
      f.box(-1.12, -1.06, 1.12, 1.44, 0.02, 0.26, 'wood', '#7a5c46');
      props.pots(sect(f, 0.35, 0, 0.02), 0, 4, h.rng); bicycle(sect(f, -0.5, 0.02, 0.5), { lean: -0.2, col: '#3f6a84' });
      props.ac(sect(h.left, 0.4, 3.2, 0), '#d8d4c2'); props.drain(h.left, 1.9, 0.25, 3.7); props.meter(sect(h.left, -1.4, 1.5, 0));
      h.ivy('left', 0.42, { u0: -1.9, u1: -0.5 }); }

    // n02: one good storm from coming down. The tin has let go at the top corner and raps on the wall when the wind gets up.
    { const h = H_.n02, f = h.front;
      plateSwing(f, -0.72, 2.8, 0.08, 1.05, 1.55, { corr: true, nx: 8, color: '#a85b3f', mode: 1, amp: 0.22, speed: 0.9, phase: 2 });
      for (let i = 0; i < 3; i++) f.sub({ pos: [-0.4 + i * 0.44, 2.86, 0.06] }).add(kit.cyl(0.018, 0.018, 0.05, 5), 'worn', { color: '#7d3a2a', rot: [Q, 0, 0] });
      props.sign(f, 'ad3', 0.42, 0.78, { pos: [0.94, 1.5, 0.03], board: '#7d3a2a' });
      { const s = sect(f, 1.1, 0.02, 0.45); for (let k = 0; k < 3; k++) { s.box(-0.24, 0.24, k * 0.17, k * 0.17 + 0.15, -0.16, 0.16, 'flat', ['#e0d7bd', '#d8cdb0', '#cfc4a5'][k]); s.box(-0.25, 0.25, k * 0.17 + 0.06, k * 0.17 + 0.075, -0.17, 0.17, 'flat', '#b5a271'); } }
      h.sapling(-1.0, h.dims.eaveY - 0.5, -1.2, 1.5); }

    // n03: the drying platform on the roof. Whoever did the laundry here could see the shrine from up there.
    { const h = H_.n03, S = h.S, ty = h.dims.h + 0.28, wd = '#8d6e50', x0 = -1.1, x1 = 1.1, z0 = -1.5, z1 = -0.3;
      for (const x of [x0, x1]) for (const z of [z0, z1]) S.rod([x, h.dims.eaveY + 0.12, z], [x, ty, z], 0.05, 'wood', wd, 5);
      S.box(x0 - 0.1, x1 + 0.1, ty, ty + 0.08, z0 - 0.1, z1 + 0.1, 'wood', '#a58a6a');
      for (const x of [x0 - 0.05, x1 + 0.05]) { S.rod([x, ty, z0], [x, ty + 1.3, z0], 0.03, 'wood', wd, 5); S.rod([x, ty, z1], [x, ty + 1.3, z1], 0.03, 'wood', wd, 5); }
      S.box(x0 - 0.1, x1 + 0.1, ty + 0.76, ty + 0.82, z1 - 0.02, z1 + 0.02, 'wood', '#a58a6a'); S.box(x0 - 0.1, x1 + 0.1, ty + 0.76, ty + 0.82, z0 - 0.02, z0 + 0.02, 'wood', '#a58a6a');
      S.rod([x0 - 0.3, ty + 1.32, (z0 + z1) / 2], [x1 + 0.3, ty + 1.32, (z0 + z1) / 2], 0.022, 'wood', '#c8b67a', 5);
      hang(S, -0.55, ty + 1.3, (z0 + z1) / 2, 0.7, 0.8, 'sheet', { phase: 4, amp: 0.22, bend: 1.2 }); hang(S, 0.28, ty + 1.3, (z0 + z1) / 2, 0.42, 0.55, 'futon', { phase: 5.1, amp: 0.2 });
      { const f = h.front; props.pots(sect(f, -0.6, 0, 0.02), 0, 2, h.rng); props.box(sect(f, 1.25, 0.9, 0)); props.drain(f, -1.46, 0.25, 3.5); }
      H.props.sign(h.front, 'ad2', 0.34, 0.62, { pos: [1.28, 2.25, 0.03], board: '#5e4634' }); }

    // n04: the bookbinder, taller than its neighbours, gone green from the street up. An antenna still points at a transmitter that went quiet.
    { const h = H_.n04, S = h.S, ty = h.dims.h - 0.1, m = '#8d9ba4';
      h.ivy('front', 0.92, { u0: -1.5, u1: 0.5 }); h.ivy('right', 0.8);
      S.rod([0.6, ty, -0.6], [0.6, ty + 1.75, -0.6], 0.025, 'worn', m, 5);
      for (let k = 0; k < 4; k++) { const y = ty + 0.65 + k * 0.32, w = 0.46 - k * 0.07; S.rod([0.6 - w, y, -0.6], [0.6 + w, y, -0.6], 0.012, 'worn', m, 4); }
      S.rod([0.6, ty + 0.45, -0.75], [0.6, ty + 0.45, -0.28], 0.012, 'worn', m, 4);
      const f = h.front; props.pots(sect(f, 0.7, 0, 0.02), 0, 3, h.rng); H.atlas.paint('north-binder', 240, 48, (g, w, hh, t) => { g.fillStyle = '#e4dcc6'; g.fillRect(0, 0, w, hh); g.fillStyle = '#4f7a68'; g.fillRect(0, 0, w, 6); t.text('緑川製本所', w / 2, hh / 2 + 3, 32, '#3f5f52', { font: t.SERIF, weight: 900 }); t.blot(w, hh, 5, ['#8b6a4c', '#a9d0bb'], 2, 7, 0.5); }); props.sign(f, 'north-binder', 1.7, 0.33, { pos: [0, h.dims.f2 + 0.12, 0.05], board: '#4e4a44' }); }

    // n05: the bicycle mender. The shutter stuck half up when the power went; the wheels are still on their hooks.
    { const h = H_.n05, f = h.front, b05 = byId.n05;
      H.atlas.paint('north-bike', 180, 48, (g, w, hh, t) => { g.fillStyle = '#e6dfca'; g.fillRect(0, 0, w, hh); g.fillStyle = '#3f6a84'; g.fillRect(0, 0, w, 7); t.text('自転車修理', w / 2, hh / 2 + 4, 30, '#3f6a84', { weight: 900 }); t.blot(w, hh, 5, ['#b5522f'], 2, 7, 0.5); });
      f.rod([0.86, 2.76, 0.1], [0.86, 2.36, 0.34], 0.012, 'worn', '#6f7a7e', 3); f.box(-0.3, 1.32, 2.76, 2.8, 0.1, 0.16, 'worn', '#6f7a7e');
      plateSwing(f, 0.86, 2.34, 0.34, 1.3, 0.36, { cell: 'north-bike', amp: 0.12, speed: 0.7, mode: 0 });
      for (const [x, y, s2] of [[-1.05, 2.3, 0.34], [-0.35, 2.32, 0.3]]) { f.add(kit.torus(s2, 0.025, 4, 18), 'worn', { pos: [x, y, 0.06], color: '#574a3f' }); f.rod([x, y + s2, 0], [x, y + s2 + 0.08, 0.06], 0.012, 'worn', '#6f7a7e', 3); }
      // the yard on the open side: tyres, an oil drum, a frame waiting for wheels, crates of parts
      { const s = sect(h.right, -1.15, 0, 0.5); s.add(kit.torus(0.3, 0.1, 6, 14), 'flat', { pos: [0, 0.12, 0], rot: [Q, 0, 0], color: '#3e4042' }); s.add(kit.torus(0.3, 0.1, 6, 14), 'flat', { pos: [0.05, 0.31, 0.02], rot: [Q, 0, 0], color: '#47494b' }); s.add(kit.torus(0.3, 0.1, 6, 14), 'flat', { pos: [-0.04, 0.5, -0.02], rot: [Q, 0.1, 0], color: '#3e4042' });
        const dr = sect(h.right, 1.35, 0, 0.42); dr.add(kit.cylBase(0.26, 0.26, 0.84, 10), 'worn', { color: '#7d4a36' }); dr.add(kit.torus(0.26, 0.02, 4, 12), 'worn', { pos: [0, 0.3, 0], rot: [Q, 0, 0], color: '#5e3a2c' }); dr.add(kit.torus(0.26, 0.02, 4, 12), 'worn', { pos: [0, 0.58, 0], rot: [Q, 0, 0], color: '#5e3a2c' });
        bicycle(sect(h.right, 0.15, 0, 0.34), { lean: -0.2, basket: false, col: '#3f6a84' });
        props.crates(sect(h.right, -0.4, 0, 0.06), h.rng); h.clump([b05.w / 2 + 0.62, 0.3, 1.5], 0.42, 0.3, 10, { s: 0.28 }); h.bush(1.6, -1.8, 0.6); }
      // the washing goes out behind the shop, close in against the back wall: the ballast starts just past it
      props.dryPole(sect(h.back, 0.6, 0, 0.26), h.rng, 1.4);
      props.gas(sect(h.back, -1.3, 0, 0)); }

    // n06: the balcony with the bougainvillea. It outgrew its pots years ago and came over the rail in a pink sheet that is still advancing down the wall.
    { const h = H_.n06, f = h.front, y = h.dims.f2 + 0.92;
      leafDrape(f, -1.32, 1.1, y + 0.02, 0.7, 2.0, [P.bougainLit, '#ff9cc4', P.bougain, P.bougainLit, '#ffb2d0', P.ivyLit], 260);
      f.tube([[-0.9, y - 0.05, 0.62], [-0.82, y - 0.8, 0.66], [-1.0, y - 1.6, 0.7]], 0.03, 0.012, 'flat', '#6a6a42', 4, 10); f.tube([[0.5, y - 0.05, 0.62], [0.45, y - 0.9, 0.66], [0.62, y - 1.5, 0.68]], 0.03, 0.012, 'flat', '#6a6a42', 4, 10);
      h.clump([-0.1, h.dims.f2 + 0.98, 0.52], 1.0, 0.42, 22, { s: 0.3 });
      for (const x of [-0.7, -0.05, 0.6]) f.add(kit.cylBase(0.17, 0.13, 0.2, 8), 'flat', { pos: [x, h.dims.f2 + 0.14, 0.38], color: '#b0694a' });
      plateSwing(f, 1.26, h.dims.eaveY + 0.1 - 0.12, 0.34, 0.08, 0.34, { color: '#7fae9a', amp: 0.28, speed: 1.2, cell: 'white' });
      f.add(kit.sphere(0.07, 8, 5), 'flat', { pos: [1.26, h.dims.eaveY - 0.03, 0.34], scale: [1, 0.62, 1], color: '#bfe0d8' });
      props.pots(sect(f, 1.1, 0, 0.02), 0, 2, h.rng); props.ac(sect(h.left, 0.2, 3.1, 0), '#d8d4c2'); props.drain(h.left, -1.8, 0.25, 3.5); }

    // n07: the sweet-maker's, cedar gone silver, and a noren nobody took in.
    { const h = H_.n07, f = h.front, o = h.openings.front.find((q) => q.t === 'sliding');
      if (o) norenSwing(f, o.x0 + 0.03, o.x1 - 0.03, o.y1 + 0.02, 'n5', 0.74, 4);
      f.box(-0.2, 0.2, 3.4, 3.5, 0.0, 0.5, 'wood', '#6e5038'); f.rod([0, 3.42, 0.45], [0, 3.2, 0.45], 0.012, 'flat', '#b5a271', 3);
      f.add(kit.chip(kit.sphere(0.26, 9, 7), 0.05, R2), 'flat', { pos: [0, 2.98, 0.45], color: '#7a7f4e' });
      props.pots(sect(f, -1.1, 0, 0.02), 0, 2, h.rng); props.sign(f, 'v5', 0.26, 0.9, { pos: [1.28, 1.62, 0.04], board: '#3a2a22' }); }

    // n08: tiled, flat-roofed, proud of it. The pigeon loft on the roof has a new tenant every spring; the water tank has none.
    { const h = H_.n08, b08 = byId.n08, S = h.S, ty = h.dims.h - 0.02, x0 = -1.2, x1 = 0.4, z0 = -1.3, z1 = -0.1, wd = '#8d8270';
      S.box(x0, x1, ty, ty + 1.1, z0, z1, 'wood', wd); S.box(x0 - 0.08, x1 + 0.08, ty + 1.1, ty + 1.16, z0 - 0.08, z1 + 0.08, 'worn', '#7fa0a0');
      S.rect(x0 + 0.1, x1 - 0.1, ty + 0.2, ty + 0.95, z1 + 0.003, 'flat', '#4b5a5a');
      for (let i = 0; i < 5; i++) { const x = lerp(x0 + 0.1, x1 - 0.1, i / 4); S.rod([x, ty + 0.2, z1 + 0.01], [x, ty + 0.95, z1 + 0.01], 0.008, 'worn', '#6f7a7e', 3, 0.008, true); }
      for (let i = 0; i < 4; i++) { const y = ty + 0.24 + i * 0.22; S.rod([x0 + 0.1, y, z1 + 0.01], [x1 - 0.1, y, z1 + 0.01], 0.008, 'worn', '#6f7a7e', 3, 0.008, true); }
      S.add(kit.cylBase(0.45, 0.45, 0.8, 12), 'worn', { pos: [0.92, ty + 0.3, 0.9], color: '#7fa0a0' }); S.add(kit.cylBase(0.02, 0.47, 0.18, 12), 'worn', { pos: [0.92, ty + 1.1, 0.9], color: '#6f9090' });
      for (const [a, b] of [[0.62, 0.6], [1.22, 0.6], [0.62, 1.2], [1.22, 1.2]]) S.rod([a, ty, b], [a, ty + 0.34, b], 0.03, 'worn', '#6f7a7e', 5);
      const f = h.front; props.pots(sect(f, -0.4, 0, 0.02), 0, 3, h.rng); props.sign(f, 'ad1', 0.34, 0.62, { pos: [1.1, 2.25, 0.03], board: '#3f7a60' }); props.meter(sect(f, -1.22, 1.5, 0));
      props.drain(h.left, -1.9, 0.25, h.dims.h - 0.3);
      { const rr = H.rand('n08break'), cx = -b08.w / 2, cz = b08.d / 2, yb = h.dims.h - 0.75; for (let i = 0; i < 5; i++) { const along = i < 3, u = 0.08 + i * 0.18; const p = along ? [cx + u, yb + rr.range(0, 0.35), cz] : [cx, yb + rr.range(0, 0.3), cz - u]; S.rod(p, [p[0] + rr.range(-0.05, 0.05), p[1] + rr.range(0.2, 0.42), p[2] + rr.range(-0.05, 0.05)], 0.014, 'worn', P.rust, 3); }
        h.rubble(cx - 0.05, cz + 0.2, 0.5, 0.38, 6); } }

    // n09: the Tadokoros' cousins. Tended right up to the end; the back garden still has its washing line and the frames for the sweet peas.
    { const h = H_.n09, bk = h.back; props.dryPole(sect(bk, -0.6, 0, 1.4), h.rng, 2.6);
      hang(bk, -0.95, 1.46, 1.4, 0.62, 0.86, 'sheet', { phase: 0.6, amp: 0.2, rot: [0, 0.03, 0] }); hang(bk, -0.1, 1.42, 1.4, 0.4, 0.5, 'stripe', { phase: 1.9, amp: 0.22 });
      for (let i = 0; i < 5; i++) { const x = 1.1 + i * 0.3, z = 1.1; bk.rod([x - 0.14, 0, z], [x + 0.03, 1.15, z], 0.012, 'wood', '#c8b67a', 3, 0.008); bk.rod([x + 0.14, 0, z], [x - 0.03, 1.15, z], 0.012, 'wood', '#c8b67a', 3, 0.008); h.clump([x, 0.6, z], 0.18, 0.5, 5, { s: 0.2, core: false }); }
      h.bush(2.6, -2.9, 0.62); props.pots(sect(h.front, 1.5, 0, 0.1), 0, 2, h.rng); props.meter(sect(h.left, 0, 1.4, 0)); }

    // n10: the man who kept bonsai. The rack's still standing. The trees are not what they were.
    { const h = H_.n10, bk = h.back, s = sect(bk, 0.3, 0, 1.15), wd = '#a98a6a', rw = 1.1;
      for (const x of [-rw, 0, rw]) { for (const z of [-0.26, 0.26]) s.rod([x, 0, z], [x, 0.74, z], 0.03, 'wood', '#7a5c46', 5); s.box(x - 0.03, x + 0.03, 0.3, 0.34, -0.26, 0.26, 'wood', '#7a5c46'); s.box(x - 0.03, x + 0.03, 0.72, 0.76, -0.26, 0.26, 'wood', '#7a5c46'); }
      for (const y of [0.34, 0.76]) for (const z of [-0.2, 0, 0.2]) s.box(-rw - 0.1, rw + 0.1, y, y + 0.025, z - 0.08, z + 0.08, 'wood', wd);
      const tree = (x, y, z, big) => { const c = ['#b0694a', '#a39a88', '#6f8a8a'][Math.floor(R2() * 3)]; s.add(kit.cylBase(0.12, 0.09, 0.09, 8), 'flat', { pos: [x, y, z], color: c }); const tw = [x + R2.range(-0.2, 0.2), y + 0.34 * big, z + R2.range(-0.1, 0.1)]; s.tube([[x, y + 0.08, z], [x + R2.range(-0.06, 0.06), y + 0.2 * big, z], tw], 0.035, 0.015, 'flat', '#7a6248', 4, 8); h.clump(s.w(tw).applyMatrix4(h.S.m.clone().invert()).toArray(), 0.28 * big, 0.2 * big, 12, { s: 0.2 }); };
      for (const [x, y, big] of [[-0.8, 0.77, 1.2], [-0.15, 0.77, 1.6], [0.6, 0.77, 1.1], [-0.55, 0.36, 1], [0.15, 0.36, 1.3], [0.8, 0.36, 1]]) tree(x, y, R2.range(-0.12, 0.12), big);
      props.crates(sect(bk, 1.7, 0, 0.3), h.rng); h.bush(-2.7, -2.7, 0.7); }

    // n11: the old farmhouse the street grew up around. Its well still has water in it, a long way down.
    { const h = H_.n11, st = sect(h.right, -0.2, 0, 1.25);
      st.add(kit.chip(kit.cylBase(0.5, 0.56, 0.7, 12, true), 0.02, R2), 'concrete', { pos: [0, 0, 0], color: '#a9a596' });
      st.add(kit.cyl(0.48, 0.48, 0.02, 12), 'flat', { pos: [0, 0.68, 0], color: P.waterDeep });
      for (const x of [-0.46, 0.46]) st.rod([x, 0.5, 0], [x, 1.85, 0], 0.03, 'wood', '#7a5c46', 5); st.box(-0.5, 0.5, 1.85, 1.95, -0.05, 0.05, 'wood', '#6e5038'); st.add(kit.torus(0.09, 0.02, 4, 10), 'worn', { pos: [0, 1.76, 0], color: '#6f7a7e' });
      st.rod([0.09, 1.76, 0], [0.09, 0.85, 0], 0.008, 'flat', '#b5a271', 3); st.add(kit.cylBase(0.09, 0.075, 0.16, 7), 'wood', { pos: [0.09, 0.72, 0], color: '#8a6a4e' });
      fern(st.w([-0.55, 0, 0.45]).x, 0.02, st.w([-0.55, 0, 0.45]).z, 0.85);
      const wp = sect(h.back, -1.4, 0, 1.0); wp.box(-0.7, 0.7, 0, 1.0, -0.22, 0.22, 'wood', '#8a6a4e'); for (let i = 0; i < 12; i++) { const y = 0.05 + (i % 4) * 0.23; wp.add(kit.cyl(0.08, 0.08, 0.5, 6), 'wood', { pos: [-0.56 + i * 0.1, y, 0], rot: [Q, 0, 0], color: i % 3 ? '#c8a884' : '#a98a6a' }); }
      props.dryPole(sect(h.back, 1.3, 0, 1.4), h.rng, 2.0); h.ivy('left', 0.5); }

    // n12: the roof came in one winter and the rest followed. Somebody had a greenhouse on the back; the tomatoes outlived it.
    { const h = H_.n12, bk = sect(h.back, 0.6, 0, 0), L = 2.2, D = 1.1, hh = 1.7, c = '#d6d0bc';
      for (const x of [-L / 2, 0, L / 2]) { bk.rod([x, 0.02, D], [x, 1.1, D], 0.02, 'worn', c, 4); bk.rod([x, 1.1, D], [x, hh, 0], 0.02, 'worn', c, 4); }
      bk.rod([-L / 2, 1.1, D], [L / 2, 1.1, D], 0.02, 'worn', c, 4); bk.rod([-L / 2, 0.45, D], [L / 2, 0.45, D], 0.02, 'worn', c, 4);
      for (const a of [-0.3, 0.15, 0.5]) bk.quad([a * L, 1.1, D], [(a + 0.18) * L, 1.1, D], [(a + 0.18) * L, hh, 0], [a * L, hh, 0], 'glass', [1.3, 1.5, 1.4]);
      bk.quad([-0.9, 1.1, D], [-0.4, 1.1, D], [-0.4, 0.52, D], [-0.9, 0.52, D], 'glass', [1.2, 1.4, 1.3]);
      for (let i = 0; i < 8; i++) { const x = -0.9 + i * 0.26, z = R2.range(0.2, 0.75); bk.rod([x, 0, z], [x + R2.range(-0.05, 0.05), 1.05, z], 0.01, 'wood', '#c8b67a', 3); h.clump(new THREE.Vector3(x, 0.72, z).applyMatrix4(new THREE.Matrix4().copy(h.S.m).invert().multiply(bk.m)).toArray(), 0.22, 0.32, 8, { s: 0.2, core: false }); }
      h.rubble(-1.6, 1.2, 1.5, 1.1, 8); }

    // n13: the dog was called Pochi. The kennel is at the end of the chain and the name is still on it.
    { const h = H_.n13, s = sect(h.left, 0.2, 0, 0.5), wd = '#a98a6a', w2 = 0.5, d2 = 0.4, h2 = 0.5;
      s.box(-w2, w2, 0, h2, -d2, d2, 'wood', wd); s.rect(-0.2, 0.2, 0.06, 0.5, d2 + 0.003, 'flat', '#37474c');
      for (const sg of [-1, 1]) s.quad([-w2 - 0.07, h2, sg * (d2 + 0.08)], [w2 + 0.07, h2, sg * (d2 + 0.08)], [w2 + 0.07, h2 + 0.3, 0], [-w2 - 0.07, h2 + 0.3, 0], 'worn', '#a85b3f');
      H.atlas.paint('north-pochi', 96, 40, (g, w, hh, t) => { g.fillStyle = '#d6c79f'; g.fillRect(0, 0, w, hh); t.text('ポチ', w / 2, hh / 2 + 2, 28, '#7d3a2a', { weight: 900 }); });
      s.add(H.atlas.quad(0.4, 0.13, 'north-pochi'), 'atlas', { pos: [0, 0.62, d2 + 0.008] });
      s.add(kit.cylBase(0.17, 0.13, 0.08, 10), 'worn', { pos: [0.55, 0, 0.9], color: '#8d9ba4' });
      const chain = []; for (let i = 0; i <= 8; i++) { const t = i / 8; chain.push([lerp(0.32, 0.9, t), 0.02 + 0.18 * Math.sin(t * Math.PI) * (1 - t), lerp(d2 - 0.12, 1.1, t)]); } s.tube(chain, 0.012, 0.012, 'worn', '#6f7a7e', 3, 16);
      h.ivy('front', 0.55, { u0: -2.2, u1: -1 }); props.gas(sect(h.back, 1.3, 0, 0)); props.box(sect(h.right, 0.8, 0.4, 0)); props.pots(sect(h.front, -1.5, 0, 0.1), 0, 2, h.rng); }

    // the shrine front: an offertory inscription for the box the kit gave us
    { H.atlas.paint('north-saisen', 96, 40, (g, w, hh, t) => { g.fillStyle = '#5e4634'; g.fillRect(0, 0, w, hh); t.text('奉納', w / 2, hh / 2 + 2, 28, '#e7d9a8', { font: t.SERIF, weight: 900 }); });
      const h = H_.n14, d = byId.n14.d; h.S.add(H.atlas.quad(0.4, 0.17, 'north-saisen'), 'atlas', { pos: [0, 0.86, d / 2 + 0.52] });
      // the kit's walls are the same dark brown on all sides, and from low behind the hill the whole building went to one dark shape. Weathered cedar boards over the back and side walls lift those faces.
      const b14 = byId.n14, hw = b14.w / 2 - 0.45, hd = b14.d / 2 - 0.5, fl = 0.85, y1 = Math.min(3.1, b14.h - 1.5) - 0.26, C14 = ['#a58c70', '#9a8267', '#ae9678'];
      const boards = (st, half, zz) => { const n = 8; for (let i = 0; i < n; i++) { const a = -half + (2 * half * i) / n + 0.01, b = -half + (2 * half * (i + 1)) / n - 0.01; st.rect(a, b, fl + 0.02, y1, zz, 'wood', C14[(i * 5) % 3]); } };
      boards(h.S.sub({ pos: [0, 0, -hd], rot: [0, Math.PI, 0] }), hw - 0.12, 0.012);
      for (const sg of [-1, 1]) boards(h.S.sub({ pos: [sg * hw, 0, 0], rot: [0, sg * Q, 0] }), hd - 0.12, 0.062); }
  }

  // ---------------------------------------------------------------- close up -------------------------------------------------------
  {
    // the wall stones carry their own colours, so they are a separate mesh from the batched solids
    const g = hillStone.geometry(); kit.worldUV(g, stoneMat.userData.uv || 0.22);
    const wall = new THREE.Mesh(g, wallMat); wall.castShadow = true; wall.receiveShadow = true; wall.name = 'north-wall'; group.add(wall);
    const b = stones.build({ castShadow: true, receiveShadow: true }); b.traverse((m) => { if (m.isMesh) m.name = 'north-stone'; }); group.add(b);
  }
  { const sg = soft.build({ castShadow: false, receiveShadow: true }); sg.traverse((m) => { if (m.isMesh) m.name = 'north-soft'; }); group.add(ctx.softEdge(sg)); }
  const kitInfo = H.finish(group);
  const swingMat = ctx.toon({ map: H.atlas.tex, vertexColors: true, side: THREE.DoubleSide, translucent: 0.5 });
  const sw = swing.finish(group, swingMat);
  group.userData.kitInfo = kitInfo.info;
  return { group, update: sw ? (t) => sw.update(t) : undefined };
}
