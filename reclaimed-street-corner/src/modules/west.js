// west — v3 ring, the shotengai quarter: an old covered shopping street continuing the core's z-arm, its partly fallen arcade, the lanes behind it,
// the riverside inn, the watermill on the race river.js cut for it, and the boathouse. Every position comes from layout; every house is told on purpose.
// Draws: 8 from the kit, then arcade skin (top + lit underside), one rewritten mesh for everything that sways, lanterns, the wheel, running water, light.
import * as THREE from 'three';
import { createHouseKit } from '../core/housekit.js';

const Q = Math.PI / 2, TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const bell = (x, c, w) => { const q = Math.abs(x - c) / w; return q >= 1 ? 0 : Math.cos(q * Q) ** 2; };
const fract = (x) => x - Math.floor(x);
const op = (t, x0, x1, y0, y1, o = {}) => ({ t, x0, x1, y0, y1, ...o });

/** One mesh whose vertices are rewritten each frame from closed-form motions. Banners, noren, laundry, loose tin, hanging signs, vines, the punt, drips. */
function makeRig(ctx, mat, name) {
  const P_ = [], N_ = [], U_ = [], C_ = [], I_ = [], parts = [], _v = new THREE.Vector3(), _n = new THREE.Vector3(), _c = new THREE.Color(), _m3 = new THREE.Matrix3();
  let attr = null, base = null, mesh = null;
  return {
    add(g, matrix, color, motion) {
      if (!g.attributes.normal) g.computeVertexNormals();
      const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv, c = g.attributes.color, start = P_.length / 3;
      _m3.getNormalMatrix(matrix); _c.set(color ?? '#ffffff');
      for (let i = 0; i < p.count; i++) {
        _v.fromBufferAttribute(p, i).applyMatrix4(matrix); _n.fromBufferAttribute(n, i).applyMatrix3(_m3).normalize();
        P_.push(_v.x, _v.y, _v.z); N_.push(_n.x, _n.y, _n.z); U_.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0);
        C_.push(_c.r * (c ? c.getX(i) : 1), _c.g * (c ? c.getY(i) : 1), _c.b * (c ? c.getZ(i) : 1));
      }
      if (g.index) for (let i = 0; i < g.index.count; i++) I_.push(start + g.index.getX(i));
      else for (let i = 0; i < p.count; i++) I_.push(start + i);
      if (motion) parts.push({ ...motion, start, count: p.count });
    },
    finish(group) {
      const g = new THREE.BufferGeometry();
      base = new Float32Array(P_);
      attr = new THREE.BufferAttribute(new Float32Array(P_), 3); attr.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('position', attr); g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(N_), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(U_), 2)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(C_), 3));
      g.setIndex(I_); mesh = new THREE.Mesh(g, mat); mesh.name = name; mesh.castShadow = false; mesh.receiveShadow = true; mesh.frustumCulled = false;
      group.add(mesh); return mesh;
    },
    update(t) {
      const a = attr.array, wind = ctx.wind;
      for (const m of parts) {
        const s = m.start * 3, e = s + m.count * 3;
        if (m.kind === 'cloth') { // weight grows with the drop below the hem; a travelling ripple along the cloth's width
          const g = wind(t, base[s], base[s + 2]), [nx, ny, nz] = m.n, [ux, uy, uz] = m.u;
          for (let i = s; i < e; i += 3) {
            const x = base[i], y = base[i + 1], z = base[i + 2], w = clamp((m.top - y) / m.drop), q = w ** 1.45, along = x * ux + y * uy + z * uz;
            const d = q * (m.amp * Math.sin(t * m.f + m.ph + along * 2.6 + w * 3.2) + m.gust * g * (0.7 + 0.3 * Math.sin(along * 3 + t * 0.7)));
            a[i] = x + nx * d; a[i + 1] = y + ny * d + q * m.lift * Math.abs(g); a[i + 2] = z + nz * d;
          }
        } else if (m.kind === 'hinge') { // rigid swing about a line; small enough that normals can stay
          const [ox, oy, oz] = m.o, [kx, ky, kz] = m.axis, g = m.wind ? wind(t, ox, oz) * m.wind : 0, th = m.amp * Math.sin(t * m.f + m.ph) + g + (m.bias || 0), c = Math.cos(th), sn = Math.sin(th), dy = m.dy ? m.dy * Math.sin(t * m.f * 0.7 + m.ph + 1) : 0;
          for (let i = s; i < e; i += 3) {
            const x = base[i] - ox, y = base[i + 1] - oy, z = base[i + 2] - oz, d = x * kx + y * ky + z * kz;
            a[i] = ox + x * c + (ky * z - kz * y) * sn + kx * d * (1 - c); a[i + 1] = oy + dy + y * c + (kz * x - kx * z) * sn + ky * d * (1 - c); a[i + 2] = oz + z * c + (kx * y - ky * x) * sn + kz * d * (1 - c);
          }
        } else if (m.kind === 'path') { // translation along a closed-form path (drips), parked out of sight while off duty
          const o = m.fn(t);
          for (let i = s; i < e; i += 3) { a[i] = base[i] + o[0]; a[i + 1] = base[i + 1] + o[1]; a[i + 2] = base[i + 2] + o[2]; }
        }
      }
      attr.needsUpdate = true;
    },
  };
}

export function build(ctx) {
  const { kit, layout: L, P, seeded } = ctx, { RIVER, RING_ROADS, BUILDINGS, buildingBox, SUN_DIR } = L;
  const SUN = new THREE.Vector3(...SUN_DIR);
  const group = new THREE.Group(); group.name = 'west';
  const H = createHouseKit(ctx, { name: 'west', seed: 'west' });
  H.density = 0.88;
  const W = BUILDINGS.filter((b) => b.o === 'west'), by = Object.fromEntries(W.map((b) => [b.id, b])), bx = (id) => buildingBox(by[id]);
  const R = seeded('west-arcade');
  const WS = H.world; // world-coordinates stage
  const M = (o) => kit.xf(o);
  let h0, wheelMesh, FLUME;

  /* ----------------------------------------------------- painted cells, all invented ---------------------------------- */
  const CH = { red: '#b5493f', cream: '#f4ecd8', teal: '#3b8088', mustard: '#dcbb66', ink: '#3a3a36', green: '#3f7a60', navy: '#3d5f7e' };
  H.atlas.paint('wGate', 384, 72, (g, w, h, T) => { g.fillStyle = '#e8dcbe'; g.fillRect(0, 0, w, h); g.fillStyle = CH.red; g.fillRect(0, 0, w, 8); g.fillRect(0, h - 8, w, 8); T.text('緑町中央商店街', w / 2, h / 2 + 1, 46, '#3f6a58', { font: T.SERIF, weight: 900 }); T.blot(w, h, 8, ['#b5522f', '#8b6a4c'], 2, 10, 0.5); T.wash(w, h, 0.1); });
  const BANNERS = [['夏まつり', CH.red, CH.cream], ['大売出し', CH.teal, CH.cream], ['手づくり', CH.mustard, '#5a4632'], ['みどり市', CH.green, CH.cream], ['福引大会', CH.navy, CH.cream], ['夕市', '#b47a36', '#3a3026']];
  BANNERS.forEach(([s, bg, ink], i) => H.atlas.paint(`wB${i}`, 60, 188, (g, w, h, T) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(0, 0, w, 12); T.text(s, w / 2, s.length > 2 ? 46 : 68, 36, ink, { font: T.SERIF, weight: 900, vertical: true, gap: 1.06 }); T.blot(w, h, 6, [bg, '#efe6d0'], 3, 10, 0.35); }));
  H.atlas.paint('wKissa', 70, 250, (g, w, h, T) => { g.fillStyle = '#e8dcbe'; g.fillRect(0, 0, w, h); g.fillStyle = CH.teal; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10); T.text('喫茶', w / 2, 48, 42, CH.red, { font: T.SERIF, weight: 900, vertical: true, gap: 1.05 }); T.text('こもれび', w / 2, 136, 28, CH.teal, { font: T.SERIF, weight: 900, vertical: true, gap: 1.08 }); T.blot(w, h, 8, ['#b5522f', '#8b6a4c'], 2, 9, 0.5); });
  H.atlas.paint('wMenu', 66, 94, (g, w, h, T) => { g.fillStyle = '#3f5a50'; g.fillRect(0, 0, w, h); g.strokeStyle = '#cdbf94'; g.lineWidth = 3; g.strokeRect(2, 2, w - 4, h - 4); T.text('本日', w / 2, 18, 17, '#f1ead6', { font: T.SERIF, weight: 900 }); for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(240,235,214,.7)'; g.fillRect(12, 38 + i * 13, 26 + (i % 3) * 6, 4); } });
  H.atlas.paint('wHon', 256, 128, (g, w, h, T) => { g.fillStyle = '#4a5a48'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(0, 0, w, 12); T.text('古本', w / 2, h / 2 + 2, 78, '#efe6d0', { font: T.SERIF, weight: 900 }); T.blot(w, h, 12, ['#4a5a48', '#efe6d0'], 4, 16, 0.3); for (let k = 1; k < 4; k++) { g.fillStyle = 'rgba(0,0,0,.1)'; g.fillRect((k * w) / 4 - 1, 0, 2, h); } });
  H.atlas.paint('wPost', 112, 72, (g, w, h, T) => { g.fillStyle = '#8a7a5e'; g.fillRect(0, 0, w, h); const pc = ['#e7d9a8', '#cfe0d8', '#e9c8ae', '#efe9d6']; for (let i = 0; i < 6; i++) { g.save(); g.translate(10 + (i % 3) * 35, 6 + (i > 2 ? 33 : 0)); g.rotate((i - 2.5) * 0.02); g.fillStyle = pc[i % 4]; g.fillRect(0, 0, 31, 28); g.fillStyle = 'rgba(70,70,60,.6)'; g.fillRect(3, 4, 24, 4); g.fillRect(3, 11, 16, 2); g.fillRect(3, 16, 21, 2); g.restore(); } T.blot(w, h, 6, ['#a89a70', '#5f7a55'], 2, 9, 0.4); });

  /* ----------------------------------------------------- what moves --------------------------------------------------- */
  const rigMat = ctx.toon({ map: H.atlas.tex, vertexColors: true, side: THREE.DoubleSide, translucent: 0.55 });
  const rig = makeRig(ctx, rigMat, 'west-sway');
  const white = (g) => { const [u, v] = H.atlas.cellUV('white', 0.5, 0.5), a = g.attributes.uv; if (a) for (let i = 0; i < a.count; i++) a.setXY(i, u, v); else g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2).map((_, i) => (i % 2 ? v : u)), 2)); return g; };
  const lanterns = [];
  /** A cloth hanging from a straight top edge. Local plane XY, top at y=0, faces local +z. */
  function hang(cell, w, h, { pos, rot = [0, 0, 0], nx = 3, ny = 6, amp = 0.05, gust = 0.1, f = 1.3, lift = 0, tint, wave = 0, twoSided = false }) {
    const g = kit.cloth(w, h, nx, ny), m = M({ pos, rot }), p = g.attributes.position;
    if (wave) for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 7 + pos[0]) * wave);
    g.computeVertexNormals(); H.atlas.uvTo(g, cell);
    const n = new THREE.Vector3(0, 0, 1).transformDirection(m), u = new THREE.Vector3(1, 0, 0).transformDirection(m);
    const motion = { kind: 'cloth', top: pos[1], drop: h, n: n.toArray(), u: u.toArray(), amp, gust, f, ph: pos[0] * 2.3 + pos[2], lift };
    rig.add(g, m, tint, motion);
    if (twoSided) { // a second skin a hair behind, its uvs flipped, so the far side reads the right way round
      const g2 = kit.cloth(w, h, nx, ny), a2 = g2.attributes.uv; for (let i = 0; i < a2.count; i++) a2.setX(i, 1 - a2.getX(i));
      g2.translate(0, 0, -0.008); g2.computeVertexNormals(); H.atlas.uvTo(g2, cell); rig.add(g2, m, tint, motion);
    }
  }
  /** A rigid board (or any geometry already in world space about the hinge). */
  const swing = (g, matrix, color, o) => rig.add(white(g), matrix, color, { kind: 'hinge', ...o });
  const leafG = () => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.5, 0.06, 0.45, 0, 0, 1, 0.5, 0.06, 0.45], 3)); g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals(); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(8), 2)); return white(g); };
  const LEAF = leafG(), VINE_C = [P.leafLit, P.leafMid, P.ivyLit, P.leafDeep, P.ivy];
  /** A vine strand hanging from `top`, swaying as one piece from its anchor. */
  function strand(top, len, rr = R, n = 13) {
    const o = top, wx = rr.range(-0.2, 0.2), wz = rr.range(-0.2, 0.2), pts = [o, [o[0] + wx * 0.5, o[1] - len * 0.5, o[2] + wz * 0.5], [o[0] + wx, o[1] - len, o[2] + wz]];
    const g = white(kit.tube(pts, 0.016, 0.008, 3, 4)), hinge = { o: top, axis: [1, 0, 0.2], amp: 0.025, f: 0.9 + rr() * 0.4, ph: rr() * 6, wind: 0.05 };
    swing(g, new THREE.Matrix4(), '#6a7a48', hinge);
    for (let i = 0; i < n; i++) {
      const t = rr() ** 0.8, ang = rr() * TAU, s = rr.range(0.14, 0.24), p = [lerp(o[0], o[0] + wx, t) + Math.cos(ang) * 0.05, o[1] - len * t, lerp(o[2], o[2] + wz, t) + Math.sin(ang) * 0.05];
      swing(LEAF.clone(), M({ pos: p, rot: [rr.range(-1.2, 0.4), ang, rr.range(-0.4, 0.4)], scale: s }), rr.pick(VINE_C), hinge);
    }
  }

  /* ----------------------------------------------------- props ------------------------------------------------------- */
  const metal = '#7d8b90', rustC = P.rust;
  function bladeSign(s, cell, x, y, w, h, out = 0.66, board = '#5e4634') { // a sign standing square off the wall, read from both ways down the street
    H.props.sign(s, cell, w, h, { pos: [x + 0.012, y, out], rot: [0, Q, 0], board, t: 0.024 }); H.props.sign(s, cell, w, h, { pos: [x - 0.012, y, out], rot: [0, -Q, 0], board, t: 0.024 });
    for (const q of [y + h / 2 - 0.1, y - h / 2 + 0.1]) s.box(x - 0.018, x + 0.018, q - 0.018, q + 0.018, 0, out - w / 2, 'worn', '#6f7a7e');
  }
  function bicycle(s, x, z, yaw, lean = 0.18, y = 0) {
    const t = s.sub({ pos: [x, y + 0.3, z], rot: [0, yaw, lean] });
    for (const a of [-0.48, 0.48]) { t.add(kit.torus(0.28, 0.02, 4, 16), 'worn', { pos: [a, 0, 0], color: rustC }); t.rod([a, 0, -0.03], [a, 0, 0.03], 0.04, 'worn', '#4a5056', 6); }
    const seat = [-0.18, 0.38, 0], bars = [0.34, 0.44, 0], bb = [-0.04, 0, 0];
    for (const [a, b] of [[[-0.48, 0, 0], bb], [[-0.48, 0, 0], seat], [bb, seat], [bb, bars], [seat, bars], [[0.48, 0, 0], bars]]) t.rod(a, b, 0.017, 'worn', rustC, 4);
    t.box(-0.26, -0.1, 0.38, 0.42, -0.05, 0.05, 'flat', '#4a4036'); t.rod([0.34, 0.44, -0.18], [0.34, 0.44, 0.18], 0.014, 'worn', metal, 4);
    t.box(0.42, 0.66, 0.34, 0.5, -0.12, 0.12, 'worn', '#8d9ba4'); // basket
  }
  function bottleCrates(s, x, z, y = 0, n = 2, col = '#c9b45a', rr = R) {
    for (let i = 0; i < n; i++) {
      const yy = y + i * 0.3, xx = x + rr.range(-0.05, 0.05), zz = z + rr.range(-0.05, 0.05);
      s.box(xx - 0.28, xx + 0.28, yy, yy + 0.3, zz - 0.2, zz + 0.2, 'wood', col); s.hbar(xx - 0.28, xx + 0.28, yy + 0.13, yy + 0.16, zz + 0.2, zz + 0.205, 'wood', '#8a6c3c');
      if (i === n - 1) for (let a = 0; a < 4; a++) for (let b = 0; b < 3; b++) if (rr() < 0.78) s.add(kit.cylBase(0.04, 0.05, 0.3, 6), 'flat', { pos: [xx - 0.2 + a * 0.13, yy + 0.16, zz - 0.12 + b * 0.12], color: rr() < 0.5 ? '#5f8a70' : '#a56a3e' });
    }
  }
  function stoneLantern(s, x, z, sc = 1, y = 0) {
    const t = s.sub({ pos: [x, y, z], scale: sc }), col = '#b8b6a6';
    t.add(kit.cylBase(0.3, 0.34, 0.14, 6), 'concrete', { color: col }); t.add(kit.cylBase(0.1, 0.13, 0.7, 6), 'concrete', { pos: [0, 0.14, 0], color: col });
    t.add(kit.cylBase(0.3, 0.2, 0.14, 6), 'concrete', { pos: [0, 0.84, 0], color: col });
    t.box(-0.17, 0.17, 0.98, 1.3, -0.17, 0.17, 'concrete', col); t.box(-0.09, 0.09, 1.05, 1.24, 0.17, 0.175, 'flat', '#3f5057');
    t.add(kit.cylBase(0.05, 0.42, 0.26, 6), 'concrete', { pos: [0, 1.3, 0], color: '#a9a796' }); t.add(kit.sphere(0.06, 6, 4), 'concrete', { pos: [0, 1.6, 0], color: col });
  }
  function chair(s, x, z, yaw, col = '#c8a884', tip = 0, y = 0) {
    const t = s.sub({ pos: [x, y, z], rot: [tip, yaw, 0] });
    t.box(-0.17, 0.17, 0.4, 0.44, -0.17, 0.17, 'wood', col); t.box(-0.17, 0.17, 0.62, 0.84, -0.18, -0.15, 'wood', col);
    for (const [a, b] of [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]]) t.box(a - 0.02, a + 0.02, 0, b < 0 ? 0.86 : 0.4, b - 0.02, b + 0.02, 'wood', '#8d6b48');
  }

  /* ----------------------------------------------------- the row houses ------------------------------------------------ */
  const ROW = { es: 0.06, ef: 0.36, eb: 0.3, hisashi: { out: 0.56 }, timbers: true };
  const ROWS = { ...ROW, hisashi: { out: 0.36 } };       // the south row keeps its pent roofs short so the arcade legs stand clear of them on the narrower walk
  const shopBack = (T, a = 'sash', b = 'boarded') => [op(a, -T.w / 2 + 0.5, -0.2, T.fl + 0.9, T.fl + 1.8), op(b, 0.25, T.w / 2 - 0.45, T.fl + 0.9, T.fl + 1.8)];
  const sideWin = (T, t = 'boarded') => [op(t, -0.45, 0.45, T.fl + 0.9, T.fl + 1.7)];

  // w01 丸三酒店: the sake shop at the street's mouth. Cedar ball still hanging, empties waiting for a truck that never came.
  {
    const b = by.w01, h = H.build(b, { ...ROW, party: ['left'], wall: 'board', wallCol: '#8f6e50', roof: 'kawara', band: { type: 'namako', h: 0.95 }, sign: { cell: 'h08', w: 2.5 }, decay: { level: 0.24, holes: 0, collapse: false, saplings: 0, vines: [{ side: 'right', cover: 0.62 }], bushes: 1 },
      open: (T) => { const a = -T.w / 2 + 0.22, z = T.w / 2 - 0.22, top = T.fl + 2.08; return { front: [op('shop', a, 0.25, T.fl + 0.02, top, { smashed: 2 }), op('sliding', 0.35, z, T.fl, top, { noren: 'n7' }), op('lattice', -1, 1, T.f2 + 0.42, T.eaveY - 0.14)], back: shopBack(T), left: [], right: [op('bars', -0.8, 0.2, T.fl + 1.1, T.fl + 1.9), op('boarded', 0.9, 1.9, T.fl + 0.9, T.fl + 1.8)] }; } });
    const f = h.front; bladeSign(f, 'v1', b.w / 2 - 0.2, 3.5, 0.42, 1.26); bottleCrates(f, -1.08, 0.5, 0, 3); bottleCrates(f, -0.42, 0.46, 0, 1, '#c8a884');
    // sugidama: a ball of browned cedar on a cord
    const m = f.mx({ pos: [0.84, 2.62, 0.5] }), o = new THREE.Vector3().setFromMatrixPosition(m).toArray();
    swing(kit.chip(kit.sphere(0.27, 8, 6), 0.05, R), m, '#8a8a4e', { o: [o[0], o[1] + 0.36, o[2]], axis: [1, 0, 0], amp: 0.03, f: 0.9, ph: 1, wind: 0.05 });
    f.rod([0.84, 2.62, 0.5], [0.84, 3, 0.5], 0.012, 'worn', '#4a5056', 4);
    h.grass(1.2, 3.1, 0.3, 8, { y: 0.14 });
    h0 = h;
  }
  // w02 みのり青果: greengrocer. The shutter stuck half up; last season's crates have gone to seed and climb the stand.
  {
    const b = by.w02, h = H.build(b, { ...ROW, party: ['right'], wall: 'mortar', wallCol: '#cdc5ae', roof: 'tin', sign: { cell: 'h07', w: 2.4 }, band: { type: 'board', h: 0.9 }, decay: { level: 0.45, holes: 1, saplings: 0, collapse: false, vines: [{ side: 'left', cover: 0.85 }], bushes: 2 },
      open: (T) => ({ front: [op('roll', -T.w / 2 + 0.22, T.w / 2 - 0.22, T.fl, T.fl + 2.04, { openAt: 0.56, graffiti: false }), op('broken', -0.8, 0.8, T.f2 + 0.28, Math.min(T.eaveY - 0.14, T.f2 + 1.1))], back: shopBack(T), left: sideWin(T, 'sash'), right: [] }) });
    const f = h.front;
    for (let tier = 0; tier < 3; tier++) f.box(-1.22, 1.22, 0.12 + tier * 0.3, 0.16 + tier * 0.3, 0.44 + (2 - tier) * 0.26, 0.74 + (2 - tier) * 0.26, 'wood', '#b89a72');
    f.box(-1.22, -1.16, 0, 1, 0.42, 1.25, 'wood', '#94785a'); f.box(1.16, 1.22, 0, 1, 0.42, 1.25, 'wood', '#94785a');
    const rr = H.rand('w02prod'); const fruit = ['#d9863a', '#e0c25a', '#c9653f', '#9dbb58'];
    for (let tier = 0; tier < 3; tier++) for (let i = 0; i < 6; i++) { if (rr() < 0.18) continue; const x = -1 + i * 0.4 + rr.range(-0.05, 0.05), z = 0.58 + (2 - tier) * 0.26, y = 0.19 + tier * 0.3, c = rr.pick(fruit); f.box(x - 0.17, x + 0.17, y, y + 0.1, z - 0.13, z + 0.13, 'wood', '#c8a884'); for (let k = 0; k < 2; k++) f.add(kit.sphere(0.075, 6, 4), 'flat', { pos: [x - 0.07 + k * 0.14, y + 0.15, z + rr.range(-0.04, 0.04)], color: c }); }
    h.clump([-1.05, 1.06, b.d / 2 + 0.62], 0.34, 0.3, 16, { s: 0.26 }); h.clump([1.0, 0.78, b.d / 2 + 0.9], 0.3, 0.24, 12, { s: 0.26 });
    hang('stripe2', 2.7, 0.62, { pos: h.S.w([0, 2.56, b.d / 2 + 0.5]).toArray(), rot: [-0.55, 0, 0], nx: 6, ny: 2, amp: 0.012, gust: 0.03, wave: 0.02, tint: '#f6f2e0' });
    bladeSign(f, 'wB3', -b.w / 2 + 0.22, 3.55, 0.36, 1.14);
  }
  // w03 喫茶こもれび: the tall brick cafe. Its tower sign still clears the arcade; a young tree has come up through the kitchen.
  {
    const b = by.w03, h = H.build(b, { ...ROW, party: ['left'], wall: 'brick', roof: 'kawara', falseFront: b.h + 0.1, sign: { cell: 'h03', w: 2.5 }, band: { type: 'tile', h: 0.8, col: '#9fc7bc' }, decay: { level: 0.62, holes: 2, collapse: { corner: 'br', r: 1.7 }, saplings: 1, vines: [{ side: 'right', cover: 0.92 }], bushes: 2 },
      open: (T) => { const a = -T.w / 2 + 0.22, z = T.w / 2 - 0.22, top = T.fl + 2.08; return { front: [op('shop', a, 0.45, T.fl + 0.02, top, { smashed: 1 }), op('door', 0.55, z, T.fl, top, { col: '#3b8088' }), op('sash', -1.15, -0.1, T.f2 + 0.42, T.f2 + 1.42, { curtain: true }), op('broken', 0.1, 1.15, T.f2 + 0.42, T.f2 + 1.42)], back: shopBack(T, 'broken'), left: [], right: [op('sash', -1.4, -0.4, T.fl + 0.95, T.fl + 1.85), op('broken', 0.5, 1.5, T.f2 + 0.3, T.f2 + 1.1)] }; } });
    const f = h.front;
    // the tower sign, on two steel legs from the parapet to above the canopy
    const tx = b.w / 2 - 0.15, ty = 6.1, sh2 = 2.5;
    for (const dz of [0.32, 0.92]) f.box(tx - 0.03, tx + 0.03, 3.1, ty + sh2 / 2 + 0.2, dz - 0.03, dz + 0.03, 'worn', '#6f7a7e');
    bladeSign(f, 'wKissa', tx, ty, 0.62, sh2, 0.62, '#4e7f8a');
    f.box(tx - 0.05, tx + 0.05, ty + sh2 / 2 + 0.04, ty + sh2 / 2 + 0.14, 0.16, 1.08, 'worn', P.rust);
    // terrace left out on the walk
    const c = h.S.sub({ pos: [-0.55, 0, b.d / 2 + 0.72] }); c.rod([0, 0, 0], [0, 0.72, 0], 0.03, 'worn', '#4a5056', 6); c.add(kit.cylBase(0.34, 0.34, 0.03, 12), 'flat', { pos: [0, 0.72, 0], color: '#e8dcbe' }); c.add(kit.cyl(0.22, 0.26, 0.02, 8), 'flat', { pos: [0, 0.01, 0], color: '#4a5056' });
    chair(c, -0.56, 0.04, Q + 0.3); chair(c, 0.44, 0.4, -2.2, '#c8a884', 1.45);
    c.add(kit.cylBase(0.05, 0.04, 0.08, 7), 'flat', { pos: [0.08, 0.75, -0.03], color: '#f1ead6' });
    H.props.sign(f, 'wMenu', 0.46, 0.66, { pos: [0.9, 0.56, 0.62], rot: [-0.2, 0.1, 0.03], board: '#6e5038' });
    // the kitchen tree
    h.S.tube([[0.9, 0.1, -1.6], [0.72, 1.8, -1.45], [0.95, 3.6, -1.3], [0.66, 6.1, -1.1]], 0.2, 0.08, 'flat', '#7a6248', 6, 12);
    h.S.tube([[0.95, 3.6, -1.3], [1.5, 5.1, -0.8]], 0.09, 0.04, 'flat', '#7a6248', 5);
    h.clump([0.66, 6.6, -1.1], 1.45, 1.08, 95, { s: 0.46 }); h.clump([1.5, 5.5, -0.7], 0.95, 0.72, 44, { s: 0.42 });
  }
  // w04 満月食堂: the last canteen. A roof sheet has worked loose and knocks in the wind; the noren is still out.
  {
    const b = by.w04, h = H.build(b, { ...ROW, party: ['right'], wall: 'tinsheet', wallCol: '#7f9a9a', roof: 'tin', sign: { cell: 'h12', w: 2.4 }, decay: { level: 0.82, holes: 3, sag: 0.22, collapse: { corner: 'bl', r: 1.5 }, vines: [{ side: 'left', cover: 1 }, { side: 'front', cover: 0.5, u0: -1.6, u1: -0.5 }], saplings: 1, bushes: 3 },
      open: (T) => { const a = -T.w / 2 + 0.22, z = T.w / 2 - 0.22, top = T.fl + 2.08; return { front: [op('sliding', a, 0.5, T.fl, top), op('shop', 0.58, z, T.fl + 0.6, top, {}), op('boarded', -0.8, 0.8, T.f2 + 0.18, Math.min(T.eaveY - 0.12, T.f2 + 1))], back: shopBack(T, 'boarded', 'broken'), left: sideWin(T, 'broken'), right: [] }; } });
    const f = h.front;
    hang('n6', 1.76, 0.72, { pos: h.front.w([-0.42, 2.32, 0.12]).toArray(), nx: 4, ny: 3 });
    // the loose sheet: hinged at its upper edge, on the front slope
    {
      const yTop = h.dims.h - 0.1, yEave = h.dims.eaveY, d2 = b.d / 2, pa = h.S.w([-0.1, yTop - 0.08, -0.25]), pb = h.S.w([0.86, yTop - 0.08, -0.25]);
      const g = new THREE.BufferGeometry(), pts = [], idx = [], cols = [], n = 8, lenZ = d2 * 0.8, a0 = Math.atan2(yTop - yEave, d2);
      for (let i = 0; i <= n; i++) for (let j = 0; j <= 1; j++) { const x = lerp(-0.1, 0.86, i / n), l = j * lenZ, y = yTop + 0.02 - (l * (yTop - yEave)) / d2 + 0.06 + (i % 2 ? 0.05 : 0), z = -0.25 + l; pts.push(x, y, z); const c = i % 2 ? 0.86 : 1; cols.push(c, c, c); }
      for (let i = 0; i < n; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); g.setIndex(idx); g.computeVertexNormals(); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((pts.length / 3) * 2), 2));
      const ax = new THREE.Vector3().subVectors(pb, pa).normalize();
      swing(g, h.S.m, '#b5724e', { o: pa.toArray(), axis: ax.toArray(), amp: 0.022, f: 0.8, ph: 0.4, wind: 0.05, bias: -0.04 });
    }
    bottleCrates(f, 1.1, 0.46, 0, 2, '#b5724e');
    for (let i = 0; i < 2; i++) { const t = f.sub({ pos: [0.72 + i * 0.42, 0, 0.42], rot: [0, 0.4 * i, 0] }); t.add(kit.cylBase(0.2, 0.17, 0.5, 8), 'worn', { color: '#6f7a7e' }); }
  }
  // w06 つばめ洋品店: the clothes shop. The sale rail stayed on the walk, one blouse still on its hanger.
  {
    const b = by.w06, h = H.build(b, { ...ROWS, party: ['right'], wall: 'plaster', wallCol: '#e5dfcf', roof: 'kawara', sign: { cell: 'h05', w: 2.5 }, band: { type: 'brick', h: 0.7 }, decay: { level: 0.2, holes: 0, collapse: false, saplings: 0, vines: [{ side: 'left', cover: 0.72 }, { side: 'front', cover: 0.3, u0: -1.7, u1: -1 }], bushes: 1 },
      open: (T) => { const a = -T.w / 2 + 0.22, z = T.w / 2 - 0.22, top = T.fl + 2.08; return { front: [op('shop', a, 0.6, T.fl + 0.02, top, {}), op('door', 0.7, z, T.fl, top, { col: '#c8705e' }), op('shoji', -1.1, 1.1, T.f2 + 0.3, T.f2 + 1.15)], back: shopBack(T), left: [op('sash', -0.9, -0.1, T.fl + 0.95, T.fl + 1.85)], right: [] }; } });
    const f = h.front;
    const rx = -0.65, rz = 0.72; for (const dx of [-0.85, 0.85]) { f.rod([rx + dx, 0, rz], [rx + dx, 1.56, rz], 0.024, 'worn', metal, 5); f.rod([rx + dx - 0.22, 0.03, rz], [rx + dx + 0.22, 0.03, rz], 0.02, 'worn', metal, 4); } f.rod([rx - 0.9, 1.56, rz], [rx + 0.9, 1.56, rz], 0.024, 'worn', metal, 5);
    const cells = ['sheet', 'stripe', 'futon', 'curtain2'];
    [-0.62, -0.2, 0.24, 0.66].forEach((dx, i) => hang(cells[i], 0.4, 0.74 + (i % 2) * 0.16, { pos: f.w([rx + dx, 1.5, rz]).toArray(), rot: [0, Math.PI, 0], nx: 2, ny: 4, amp: 0.024, gust: 0.06, f: 1 }));
    bladeSign(f, 'wB0', b.w / 2 - 0.24, 3.48, 0.34, 1.08);
  }
  // w07 ほたる書房: the second-hand bookshop. A cart of books left under the eave, pages fanned by years of draught.
  {
    const b = by.w07, h = H.build(b, { ...ROWS, party: ['left'], wall: 'board', wallCol: '#a98a6a', roof: 'kawara', sign: { cell: 'h02', w: 2.3 }, vsign: null, band: null, decay: { level: 0.5, holes: 1, saplings: 1, collapse: false, vines: [{ side: 'right', cover: 0.68 }], bushes: 2 },
      open: (T) => { const a = -T.w / 2 + 0.2, z = T.w / 2 - 0.2, top = T.fl + 2.04; return { front: [op('sliding', a, z, T.fl, top, { noren: 'wHon' }), T.f2 ? op('shoji', -0.85, 0.85, T.f2 + 0.14, T.eaveY - 0.1) : null].filter(Boolean), back: shopBack(T), left: [], right: sideWin(T, 'sash') }; } });
    const f = h.front, rr = H.rand('w07cart'); const cart = f.sub({ pos: [-0.5, 0, 0.72], rot: [0, 0.06, 0] });
    cart.box(-0.72, 0.72, 0.42, 0.5, -0.24, 0.24, 'wood', '#94785a'); for (const x of [-0.66, 0.66]) { cart.add(kit.cyl(0.14, 0.14, 0.05, 8), 'flat', { pos: [x, 0.14, 0.26], rot: [Q, 0, 0], color: '#4a5056' }); cart.add(kit.cyl(0.14, 0.14, 0.05, 8), 'flat', { pos: [x, 0.14, -0.26], rot: [Q, 0, 0], color: '#4a5056' }); cart.box(x - 0.03, x + 0.03, 0.14, 0.44, -0.2, 0.2, 'wood', '#6e5038'); }
    const BC = ['#b5493f', '#3f6a84', '#c9a24e', '#6a7a58', '#e6dfca', '#8f5f6a'];
    for (let x = -0.66; x < 0.6;) { const w = rr.range(0.06, 0.13), hh = rr.range(0.26, 0.4); cart.box(x, x + w - 0.012, 0.5, 0.5 + hh, -0.16, 0.13, 'flat', rr.pick(BC)); x += w; }
    for (let i = 0; i < 5; i++) { const t = f.sub({ pos: [-1.2 + rr() * 2, 0.02 + rr() * 0.02, 0.9 + rr() * 0.7], rot: [rr.range(-0.1, 0.1), rr() * 6, rr.range(-0.1, 0.1)] }); t.box(-0.13, 0.13, 0, 0.012, -0.09, 0.09, 'flat', '#efe9d6'); }
    h.grass(-1.2, b.d / 2 + 0.3, 0.3, 7, { y: 0.14 });
    bladeSign(f, 'v8', b.w / 2 - 0.22, 3.06, 0.32, 1.02);
  }
  // w08 ひばり時計店: the watchmaker, pale green tile and a big clock on a bracket, stopped; its pendulum still drifts.
  {
    const b = by.w08, h = H.build(b, { ...ROWS, party: ['right'], wall: 'tile', wallCol: '#c4dcd2', roof: 'kawara', falseFront: b.h + 0.15, sign: { cell: 'h11', w: 2.4 }, timbers: false, band: { type: 'mortar', h: 0.5, col: '#b5b09c' }, decay: { level: 0.34, holes: 1, collapse: false, vines: [{ side: 'left', cover: 0.55 }], saplings: 0, bushes: 1 },
      open: (T) => { const a = -T.w / 2 + 0.24, z = T.w / 2 - 0.24, top = T.fl + 2.06; return { front: [op('door', a, -0.5, T.fl, top, { col: '#6a4c38' }), op('shop', -0.4, z, T.fl + 0.34, top, {}), op('sash', -0.75, 0.75, T.f2 + 0.42, T.f2 + 1.3, { curtain: true })], back: shopBack(T), left: [op('bars', -0.4, 0.4, T.fl + 1.05, T.fl + 1.75)], right: [] }; } });
    const f = h.front, cx = b.w / 2 - 0.3, cy = 3.74;
    f.rod([cx, cy, 0.04], [cx, cy, 0.52], 0.03, 'worn', '#6f7a7e', 6);
    for (const s of [1, -1]) { const t = f.sub({ pos: [cx, cy, 0.68], rot: [0, s * Q, 0] }); t.add(kit.cyl(0.42, 0.42, 0.07, 18), 'worn', { pos: [0, 0, 0], rot: [Q, 0, 0], color: '#6a4c38' }); const q = new THREE.CircleGeometry(0.37, 18); q.translate(0, 0, 0.04); H.atlas.uvTo(q, 'clock'); t.add(q, 'atlas'); }
    // pendulum case under it, door hung open
    const g = kit.box(0.05, 0.4, 0.05); const pm = f.mx({ pos: [cx, cy - 0.66, 0.68] }), pp = f.w([cx, cy - 0.42, 0.68]).toArray(), ax = f.dir([0, 0, 1]);
    swing(g, pm, '#c9a24e', { o: pp, axis: ax.toArray(), amp: 0.12, f: 1.2, ph: 0 }); swing(kit.sphere(0.09, 8, 5), f.mx({ pos: [cx, cy - 0.9, 0.68] }), '#c9a24e', { o: pp, axis: ax.toArray(), amp: 0.12, f: 1.2, ph: 0 });
    f.rod([cx - 0.16, cy - 0.46, 0.68], [cx + 0.16, cy - 0.46, 0.68], 0.018, 'worn', '#6f7a7e', 4);
    const pots = f.sub({ pos: [-0.8, 0, 0.1] }); H.props.pots(pots, 0.2, 3, H.rand('w08pots'));
  }
  // w09 大福堂菓子舗: the sweet shop at the far end. A bench under a red paper parasol, and the shop quietly giving way to wisteria.
  {
    const b = by.w09, h = H.build(b, { ...ROWS, party: ['left'], wall: 'plaster', wallCol: '#e8dcc0', roof: 'kawara', sign: { cell: 'h06', w: 2.4 }, band: { type: 'board', h: 0.85 }, decay: { level: 0.78, holes: 2, collapse: { corner: 'br', r: 1.5 }, vines: [{ side: 'right', cover: 1 }, { side: 'front', cover: 0.62, u0: 0.5, u1: 1.6 }], saplings: 1, bushes: 3 },
      open: (T) => { const a = -T.w / 2 + 0.22, z = T.w / 2 - 0.22, top = T.fl + 2.06; return { front: [op('shop', a, 0.35, T.fl + 0.02, top, { smashed: 1 }), op('sliding', 0.45, z, T.fl, top, { noren: 'n3' }), op('broken', -0.7, 0.7, T.f2 + 0.3, Math.min(T.eaveY - 0.12, T.f2 + 1.1))], back: shopBack(T, 'boarded', 'broken'), left: [], right: sideWin(T, 'broken') }; } });
    const f = h.S, x = b.w / 2 + 0.72, z = b.d / 2 - 0.5;
    const pc = f.sub({ pos: [x, 0, z], rot: [0.05, 0, -0.04] });
    pc.rod([0, 0, 0], [0, 2.3, 0], 0.03, 'wood', '#c8a884', 6);
    const cone = kit.cyl(0.02, 1.15, 0.48, 12, true); pc.add(cone, 'atlas', { pos: [0, 2.3, 0], color: '#c8483c' }); // atlas 'flat' cell picks up tint
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; pc.rod([0, 2.5, 0], [Math.cos(a) * 1.12, 2.09, Math.sin(a) * 1.12], 0.008, 'wood', '#a83a30', 3); }
    const bn = f.sub({ pos: [x + 0.05, 0, z - 0.98] }); bn.box(-0.72, 0.72, 0.42, 0.48, -0.26, 0.26, 'wood', '#a83a30'); for (const dx of [-0.6, 0.6]) bn.box(dx - 0.03, dx + 0.03, 0, 0.42, -0.2, 0.2, 'wood', '#6e5038');
    H.props.sign(h.front, 'v5', 0.3, 0.96, { pos: [-b.w / 2 + 0.3, 3.2, 0.1], rot: [0, 0.3, 0] });
    bladeSign(h.front, 'v5', -b.w / 2 + 0.25, 3.05, 0.34, 1.1, 0.62, '#a83a30');
  }

  /* ----------------------------------------------------- the lanes behind ------------------------------------------- */
  // w10: thatched farmhouse-turned-cottage, the roof a meadow now, the well still has a bucket.
  {
    const b = by.w10, h = H.build(b, { roof: 'thatch', shape: 'hip', ridge: 'x', pitch: 1, es: 0.42, ef: 0.5, eb: 0.42, wall: 'boardv', wallCol: '#8d7a62', band: { type: 'mortar', h: 0.5 }, timbers: true, decay: { level: 0.68, holes: 2, saplings: 2, vines: [{ side: 'left', cover: 0.9 }], bushes: 3, grass: 1 } });
    const S = h.front.sub({ pos: [1.9, 0, 1.6] }); S.add(kit.cylBase(0.5, 0.52, 0.72, 12, true), 'concrete', { color: '#a9a796' }); S.add(kit.torus(0.5, 0.06, 5, 12), 'concrete', { pos: [0, 0.72, 0], rot: [Q, 0, 0], color: '#c6c1b0' });
    for (const x of [-0.58, 0.58]) S.rod([x, 0, 0], [x, 1.72, 0], 0.045, 'wood', '#86664c', 5); S.rod([-0.66, 1.68, 0], [0.66, 1.68, 0], 0.05, 'wood', '#6e5038', 6); S.rod([0, 1.68, 0], [0, 0.66, 0], 0.01, 'worn', '#4a5056', 3); S.add(kit.cylBase(0.15, 0.12, 0.22, 8), 'wood', { pos: [0, 0.5, 0], color: '#a98a6a' });
    h.bush(-b.w / 2 - 0.4, b.d / 2 + 0.2, 0.8);
  }
  // w11: a house under a faded blue tarp someone tied down for one more winter. The washing is still out.
  {
    const b = by.w11, h = H.build(b, { roof: 'tin', shape: 'gable', ridge: 'x', pitch: 0.5, es: 0.26, ef: 0.42, eb: 0.36, wall: 'board', wallCol: '#b39a78', band: { type: 'board', h: 0.8 }, porch: false, decay: { level: 0.38, holes: 1, collapse: false, saplings: 0, vines: [{ side: 'back', cover: 0.8 }], bushes: 2 }, props: ['meter', 'drain', 'pots'],
      open: (T) => ({ front: [op('sliding', -T.w / 2 + 0.4, -0.3, T.fl, T.fl + 1.98), op('sash', 0.2, T.w / 2 - 0.5, T.fl + 0.8, T.fl + 1.82)], back: [op('sash', -0.6, 0.6, T.fl + 1, T.fl + 1.8)], left: [op('boarded', -0.5, 0.5, T.fl + 0.9, T.fl + 1.7)], right: [op('sash', -0.5, 0.5, T.fl + 0.9, T.fl + 1.7)] }) });
    // the tarp: a sheet of quads pinned over the near slope, weighted with tyres and rope
    const S = h.S, y0 = h.dims.eaveY + 0.05, yR = b.h + 0.06, dz = b.d / 2 + 0.3, x0 = -b.w / 2 + 0.3, x1 = 0.6; const rr = H.rand('w11tarp');
    const grid = (i, j) => { const u = i / 6, v = j / 4, x = lerp(x0, x1, u), z = lerp(0, dz, v); return [x, lerp(yR + 0.02, y0, v) + Math.sin(u * 9 + v * 4) * 0.03 + rr.range(-0.012, 0.012) + 0.07, z + (j === 4 ? 0.06 : 0)]; };
    const pts = []; for (let j = 0; j <= 4; j++) { pts[j] = []; for (let i = 0; i <= 6; i++) pts[j][i] = grid(i, j); }
    for (let j = 0; j < 4; j++) for (let i = 0; i < 6; i++) S.quad(pts[j][i], pts[j + 1][i], pts[j + 1][i + 1], pts[j][i + 1], 'flat', (i + j) % 3 ? '#5d88a0' : '#507c95');
    for (const [i, j] of [[1, 3], [4, 2]]) S.add(kit.torus(0.2, 0.08, 5, 10), 'flat', { pos: [pts[j][i][0], pts[j][i][1] + 0.08, pts[j][i][2]], rot: [1.15, 0, 0], color: '#3e3a36' });
    // the pole, at the side of the house, two shirts and a towel
    const st = h.front.sub({ pos: [1.05, 0, 1.45] }); for (const x of [-1.2, 1.2]) st.rod([x, 0, 0], [x, 2.05, 0], 0.03, 'worn', metal, 5); st.rod([-1.5, 1.95, 0], [1.5, 1.92, 0], 0.024, 'wood', '#c8b67a', 6);
    [['sheet', 0.62, 0.78], ['stripe', 0.52, 0.6], ['futon', 0.7, 0.94], ['curtain', 0.34, 0.5]].forEach(([c, w, hh], i) => { const p = st.w([-0.8 + i * 0.58, 1.93, 0]).toArray(); hang(c, w, hh, { pos: p, rot: [0, by.w11.yaw, 0], nx: 3, ny: 4, amp: 0.03, gust: 0.1, f: 1.1, lift: 0.01 }); });
    bicycle(h.front, -1.5, 0.5, 0.1, 0.22);
  }
  // w12: a tin shed, door off its track, a handcart it never gave back.
  {
    const b = by.w12, h = H.build(b, { wall: 'tinsheet', wallCol: '#a56a4e', roof: 'tin', shape: 'mono', es: 0.14, decay: { level: 0.74, holes: 2, vines: [{ side: 'back', cover: 1 }, { side: 'right', cover: 0.8 }], bushes: 3, saplings: 1, collapse: false } });
    const c = h.front.sub({ pos: [0.15, 0.36, 1.05], rot: [0, 0.25, -0.2] }); c.box(-0.56, 0.56, 0, 0.05, -0.38, 0.38, 'wood', '#a98a6a'); c.box(-0.56, -0.5, 0, 0.26, -0.38, 0.38, 'wood', '#94785a'); c.box(0.5, 0.56, 0, 0.26, -0.38, 0.38, 'wood', '#94785a');
    for (const z of [-0.44, 0.44]) c.add(kit.torus(0.3, 0.03, 4, 12), 'wood', { pos: [0, -0.12, z], color: '#6e5038' });
    c.rod([0.56, 0.1, -0.2], [1.5, 0.3, -0.24], 0.024, 'wood', '#94785a', 4); c.rod([0.56, 0.1, 0.2], [1.5, 0.3, 0.24], 0.024, 'wood', '#94785a', 4);
    h.clump([0.8, 0.5, b.d / 2 + 0.9], 0.7, 0.5, 26, { s: 0.36 });
  }
  // w13 すみれ旅館: the inn by the lane. A futon forgotten on the rail, the paper lanterns that used to mean "room available".
  {
    const b = by.w13, h = H.build(b, { wall: 'plaster', wallCol: '#e9e1cd', band: { type: 'board', h: 0.92 }, roof: 'kawara', shape: 'hip', pitch: 0.46, es: 0.3, ef: 0.44, eb: 0.34, hisashi: true, balcony: true, timbers: true, sign: false, vsign: 'v4', signSide: 1, detail: 'hi', decay: { level: 0.3, holes: 1, collapse: false, saplings: 0, vines: [{ side: 'left', cover: 0.7 }, { side: 'back', cover: 0.8 }], bushes: 3 } });
    const f = h.front;
    // lanterns either side of the door
    for (const x of [-1.2, 1.2]) { f.rod([x, 2.46, 0], [x, 2.46, 0.42], 0.016, 'worn', '#4a5056', 4); lanterns.push({ p: f.w([x, 2.46, 0.42]).toArray(), s: 1.36, c: '#efe6cf' }); }
    // futon on the rail
    hang('futon', 1.3, 0.8, { pos: f.w([-1.1, h.dims.f2 + 0.92, 0.66]).toArray(), rot: [0, b.yaw, 0], nx: 4, ny: 4, amp: 0.012, gust: 0.04, f: 0.9 }); 
    const S = h.front.sub({ pos: [0, 0, 0] }); stoneLantern(S, -2.6, 1.3, 1); stoneLantern(S, 2.6, 1.3, 0.86);
    // stepping stones to the lane
    const rr = H.rand('w13path'); for (let i = 0; i < 5; i++) { const g = kit.chip(kit.cyl(0.32, 0.36, 0.08, 7), 0.02, rr); S.add(g, 'concrete', { pos: [rr.range(-0.1, 0.1), 0.05, 0.9 + i * 0.68], color: '#b9b5a8' }); }
    S.box(-2.9, -2.7, 0, 1.0, 0.86, 1.8, 'wood', '#6d5240'); // fence ends
    // the name stands on two posts by the lane, since the rail hides the wall
    const sg = S.sub({ pos: [-2.1, 0, 2.9], rot: [0, 0.32, 0] }); for (const x of [-1.15, 1.15]) sg.box(x - 0.07, x + 0.07, 0, 2.28, -0.07, 0.07, 'wood', '#6e5038'); H.props.sign(sg, 'inn', 2.6, 0.54, { pos: [0, 1.92, 0.075], board: '#5e4634', t: 0.06 }); sg.box(-1.5, 1.5, 2.26, 2.36, -0.1, 0.1, 'wood', '#6e5038');
    h.bush(-3.2, 2.6, 0.9); h.bush(3.1, 2.2, 0.8);
  }
  // w14: a tidy little house with a sunflower patch gone feral, its aerial finally down.
  {
    const b = by.w14, h = H.build(b, { roof: 'kawara', shape: 'gable', ridge: 'z', pitch: 0.62, es: 0.34, ef: 0.46, eb: 0.34, wall: 'plaster', wallCol: '#ddd6c2', band: { type: 'tile', h: 0.8, col: '#b9d3cb' }, timbers: false, porch: true, decay: { level: 0.3, holes: 1, collapse: false, saplings: 0, vines: [{ side: 'left', cover: 0.5 }], bushes: 2 } });
    const f = h.front, rr = H.rand('w14flo');
    for (let i = 0; i < 9; i++) { const x = rr.range(-2.2, -0.8), z = rr.range(0.9, 2.2), hh = rr.range(1.1, 1.9); f.tube([[x, 0, z], [x + 0.05, hh * 0.6, z], [x + rr.range(-0.1, 0.1), hh, z]], 0.024, 0.016, 'flat', '#5f9a4e', 3, 4); const s = f.sub({ pos: [x, hh, z], rot: [-0.5, rr() * 6, 0] }); for (let k = 0; k < 8; k++) s.add(kit.leaf(0.2, 0.09, 0), 'flat', { rot: [0, (k * TAU) / 8, 0], color: P.flowerYellow }); s.add(kit.cylBase(0.09, 0.09, 0.03, 8), 'flat', { color: '#6e5038' }); h.clump(f.w([x + 0.05, 0.55, z]).applyMatrix4(new THREE.Matrix4().copy(h.S.m).invert()).toArray(), 0.3, 0.3, 6, { s: 0.3 }); }
    const ae = f.sub({ pos: [2.1, 0.06, 1.0], rot: [0, 0, 0] }); ae.rod([-1.1, 0.04, 0], [1.3, 0.1, 0.5], 0.022, 'worn', metal, 4); for (let i = 0; i < 5; i++) { const t = i / 4, x = lerp(-0.7, 0.9, t), z = lerp(0.06, 0.4, t); ae.rod([x, 0.05, z - 0.5 + 0.1 * i], [x, 0.05, z + 0.5 - 0.1 * i], 0.01, 'worn', metal, 3); }
  }
  // w15: the last house before the mill: door painted to last, plum jars on the step, ivy finishing the job.
  {
    const b = by.w15, h = H.build(b, { roof: 'kawara', shape: 'hip', pitch: 0.58, es: 0.3, ef: 0.42, eb: 0.32, wall: 'boardv', wallCol: '#8b7e68', band: { type: 'brick', h: 0.6 }, timbers: true, decay: { level: 0.76, holes: 2, collapse: { corner: 'bl', r: 1.5 }, vines: [{ side: 'right', cover: 1 }, { side: 'back', cover: 0.9 }], bushes: 3, saplings: 1 },
      open: (T) => ({ front: [op('door', -0.5, 0.5, T.fl, T.fl + 2, { col: '#3f7a8a' }), op('sash', -T.w / 2 + 0.35, -0.75, T.fl + 0.85, T.fl + 1.85), op('boarded', 0.75, T.w / 2 - 0.35, T.fl + 0.85, T.fl + 1.85)], back: [op('broken', -0.6, 0.6, T.fl + 0.95, T.fl + 1.8)], left: [op('sash', -0.5, 0.5, T.fl + 0.9, T.fl + 1.7)], right: [] }) });
    const f = h.front; for (let i = 0; i < 3; i++) { f.add(kit.cylBase(0.15, 0.2, 0.36, 9), 'flat', { pos: [0.9 + i * 0.36, 0, 0.42], color: '#7a5a42' }); f.add(kit.cylBase(0.12, 0.15, 0.05, 9), 'flat', { pos: [0.9 + i * 0.36, 0.36, 0.42], color: '#a98a6a' }); }
  }

  // w17 緑町公民館: the community hall: every notice still up, the flag long gone from its pole, a bench and a bell.
  {
    const b = by.w17, h = H.build(b, { wall: 'mortar', wallCol: '#d4cdb8', decay: { level: 0.55, holes: 2, collapse: false, vines: [{ side: 'left', cover: 0.85 }, { side: 'back', cover: 0.7 }], bushes: 3, saplings: 1 } });
    const f = h.front.sub({ pos: [-b.w / 2 + 0.2, 0, 1.7] });
    f.rod([0, 0, 0], [0.02, 4.3, 0], 0.05, 'worn', metal, 8, 0.03); f.add(kit.sphere(0.07, 6, 4), 'flat', { pos: [0.02, 4.34, 0], color: '#d9a95a' });
    f.rod([0.02, 3.9, 0], [0.14, 3.3, 0], 0.012, 'worn', '#4a5056', 3);
    const nb = h.front.sub({ pos: [b.w / 2 - 0.1, 0, 1.2], rot: [0, -0.2, 0] }); for (const x of [-0.82, 0.82]) nb.box(x - 0.05, x + 0.05, 0, 1.8, -0.05, 0.05, 'wood', '#86664c'); nb.box(-0.9, 0.9, 1.0, 1.8, -0.03, 0.03, 'wood', '#6d5240'); H.props.sign(nb, 'wPost', 1.56, 0.74, { pos: [0, 1.42, 0.038], rot: [0, 0, 0], board: '#6d5240', t: 0.01 }); nb.box(-1.02, 1.02, 1.8, 1.86, -0.18, 0.18, 'wood', '#94785a');
    chair(h.S, 1.1, b.d / 2 + 0.7, 0.5, '#a98a6a');
  }

  /* ----------------------------------------------------- the arcade ------------------------------------------------ */
  const road = RING_ROADS.find((r) => r.id === 'shotengai'), zc = road.pts[0][1];
  const nRow = ['w01', 'w02', 'w03', 'w04'].map(bx), sRow = ['w06', 'w07', 'w08', 'w09'].map(bx);
  const fN = nRow[0].z[1], fS = sRow[0].z[0]; // building fronts; the columns stand on the walks, clear of the shops' pent roofs and signs
  const zA = fN + 1.05, zB = fS - ROWS.hisashi.out - 0.19, zM = (zA + zB) / 2, half = (zB - zA) / 2, RISE = 1.36, YS = 5.45, Ra = (half * half + RISE * RISE) / (2 * RISE), PHI = Math.asin(half / Ra);
  const mid = (a, b) => (a + b) / 2;
  const F = [Math.max(nRow[0].x[1], sRow[0].x[1]) - 0.25, mid(mid(nRow[0].x[0], nRow[1].x[1]), mid(sRow[0].x[0], sRow[1].x[1])), Math.min(nRow[1].x[0], sRow[1].x[0]), Math.max(nRow[2].x[1], sRow[2].x[1]), mid(mid(nRow[2].x[0], nRow[3].x[1]), mid(sRow[2].x[0], sRow[3].x[1])), Math.min(nRow[3].x[0], sRow[3].x[0]) - 0.1];
  const crash = { c: lerp(F[2], F[3], 0.62), w: 2.8, th: 0.84 };        // the fold: south half of the bay over the crossing has come down off its broken frame
  const zCrown = zM, yCrown = YS + RISE;
  const sag = (x, v) => 0.34 * bell(x, lerp(F[3], F[4], 0.55), 3) * Math.sin(Math.PI * v) ** 0.8 + 0.14 * bell(x, F[1] - 0.8, 2.4) * Math.sin(Math.PI * v) + 0.2 * bell(x, F[5] + 0.8, 3) * Math.sin(Math.PI * v);
  function arc(x, v, out = [0, 0, 0]) {
    const a = -PHI + 2 * PHI * v;
    let z = zM + Ra * Math.sin(a), y = YS + Ra * (Math.cos(a) - Math.cos(PHI)); y -= sag(x, v);
    const th = crash.th * bell(x, crash.c, crash.w);
    if (th > 0 && v > 0.5) { const dz = z - zCrown, dy = y - yCrown, c = Math.cos(th), s = Math.sin(th); z = zCrown + dz * c + dy * s; y = yCrown - dz * s + dy * c; }
    out[0] = x; out[1] = y; out[2] = z; return out;
  }
  const arcOff = (x, v, off) => { const a = -PHI + 2 * PHI * v, p = arc(x, v), th = v > 0.5 ? crash.th * bell(x, crash.c, crash.w) : 0, ny = Math.cos(a), nz = Math.sin(a), c = Math.cos(th), s = Math.sin(th); p[2] += off * (nz * c + ny * s); p[1] += off * (-nz * s + ny * c); return p; };

  const STEEL = '#8fb3a6', STEEL_D = '#6f958a', RIBS = 14;
  // gate at each end and the portal frames between
  F.forEach((x, fi) => {
    const fallen = fi === 3; // this frame's south leg gave way
    for (let k = 0; k < RIBS; k++) { const v0 = k / RIBS, v1 = (k + 1) / RIBS; WS.beam(arc(x, v0), arc(x, v1), 0.12, 0.17, 'worn', STEEL); WS.beam(arcOff(x, v0, -0.34), arcOff(x, v1, -0.34), 0.09, 0.1, 'worn', STEEL_D); const a = k % 2 ? arc(x, v0) : arcOff(x, v0, -0.34), b = k % 2 ? arcOff(x, v1, -0.34) : arc(x, v1); WS.beam(a, b, 0.05, 0.05, 'worn', STEEL_D); }
    for (const [zz, S2] of [[zA, 0], [zB, 1]]) {
      if (fallen && S2) { // broken: a stump, and the column's upper half fallen against the shop
        WS.beam([x, 0.12, zz], [x + 0.07, 2.2, zz + 0.02], 0.24, 0.24, 'worn', STEEL); WS.add(kit.boxBase(0.5, 0.2, 0.5), 'concrete', { pos: [x, 0.12, zz], color: '#b9b5a8' });
        for (let i = 0; i < 4; i++) WS.beam([x + 0.04, 2.2, zz], [x + 0.04 + R.range(-0.2, 0.2), 2.28 + R.range(0, 0.25), zz + R.range(-0.2, 0.2)], 0.05, 0.05, 'worn', P.rust);
        WS.beam([x - 0.5, 0.26, zz + 0.25], [x - 2.5, 2.05, fS - 0.1], 0.24, 0.24, 'worn', STEEL);
        continue;
      }
      const top = arc(x, S2)[1];
      WS.add(kit.boxBase(0.5, 0.2, 0.5), 'concrete', { pos: [x, 0.12, zz], color: '#b9b5a8' }); WS.beam([x, 0.3, zz], [x, top + 0.02, zz], 0.26, 0.26, 'worn', STEEL);
      WS.box(x - 0.16, x + 0.16, top - 0.06, top + 0.06, zz - 0.16, zz + 0.16, 'worn', STEEL_D);
      if (fi === 1 || fi === 4) WS.beam([x + 0.02, top - 0.46, zz + (S2 ? 0.02 : -0.02)], [x + 0.02, top - 0.46, zz + (S2 ? -1.0 : 1.0)], 0.08, 0.14, 'worn', STEEL_D); // lamp arms
      // ivy spiralling up the leg
      const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12, a = t * 9 + fi; pts.push([x + Math.cos(a) * 0.18, 0.2 + t * (top - 0.6), zz + Math.sin(a) * 0.18]); }
      if ((fi + S2) % 2 === 0) { WS.tube(pts, 0.05, 0.02, 'flat', '#6a6a42', 4, 28); for (let i = 1; i <= 7; i += 2) { const c = pts[i + 2] || pts[i]; h0.clump(toLocal(c), 0.3 + R() * 0.1, 0.3, 11, { s: 0.3, core: false }); } }
    }
  });
  function toLocal(p) { return new THREE.Vector3(...p).applyMatrix4(new THREE.Matrix4().copy(h0.S.m).invert()).toArray(); }
  // the gate plate, facing the old town
  {
    const x = F[0], y = YS + 0.34, s = WS.sub({ pos: [x + 0.09, y, zM], rot: [0, Q, 0] });
    s.box(-2.32, 2.32, -0.48, 0.48, -0.09, 0.02, 'worn', '#e7dcc2');
    s.add(H.atlas.quad(4.3, 0.74, 'wGate'), 'atlas', { pos: [0, 0, 0.026] });
    for (const dz of [-1.8, 1.8]) s.box(dz - 0.03, dz + 0.03, 0.48, 1.05, -0.04, 0.02, 'worn', STEEL_D);
    s.box(-2.32, 2.32, 0.48, 0.53, -0.09, 0.02, 'worn', STEEL_D);
    // the far side of the board, same name for those leaving town
    s.add(H.atlas.quad(4.3, 0.74, 'wGate'), 'atlas', { pos: [0, 0, -0.092], rot: [0, Math.PI, 0] });
  }
  // purlins and gutters, bay by bay
  const PV = [0, 0.17, 0.34, 0.5, 0.66, 0.83, 1];
  for (let b = 0; b < F.length - 1; b++) {
    const xa = F[b], xb = F[b + 1];
    PV.forEach((v) => {
      const spine = v === 0.5 || v === 0 || v === 1;
      const skip = (b === 4 && !spine && R() < 0.55) || (b === 2 && v > 0.5 && R() < 0.3);
      if (skip) return;
      const w = spine ? 0.14 : 0.08, h2 = spine ? 0.16 : 0.08, n = v === 0 || v === 1 ? 5 : 6, colorP = spine ? STEEL : STEEL_D;
      const stop = (b === 4 && v === 1) ? 2 : (b === 2 && v === 1) ? 1 : n; // the south gutter is torn out over the crossing and at the far end
      for (let k = 0; k < stop; k++) { const t0 = k / n, t1 = (k + 1) / n; WS.beam(arc(lerp(xa, xb, t0), v), arc(lerp(xa, xb, t1), v), w, h2, 'worn', colorP); }
    });
    const mx = lerp(xa, xb, 0.5); for (let k = 0; k < RIBS; k++) WS.beam(arc(mx, k / RIBS), arc(mx, (k + 1) / RIBS), 0.05, 0.09, 'worn', STEEL_D);
  }
  // gutter ferns
  for (let i = 0; i < 16; i++) { const x = R.range(F[5] + 0.3, F[0] - 0.3), v = R() < 0.5 ? 0 : 1, p = arc(x, v); p[1] += 0.2; h0.clump(toLocal(p), R.range(0.3, 0.55), 0.2, 14, { s: 0.26, core: false }); }

  /* the skin: ribbed sheets. Crown band amber, side bands green; gaps chosen so sun lands on the road and walks */
  const LAP = 0.012;
  const skin = { p: [], n: [], c: [], up: [], unp: [], unc: [] };
  const AMBER = ['#efb65a', '#e8a648', '#f3cd7c', '#eeb04e'], GREEN = ['#8ccf8e', '#6fbf88', '#9dd690', '#7cc68a'], BLEACH = ['#d8e7a8', '#f0e3b0'];
  const _c = new THREE.Color(), _A = new THREE.Vector3(), _B = new THREE.Vector3(), _C = new THREE.Vector3(), _N = new THREE.Vector3(), _E1 = new THREE.Vector3(), _E2 = new THREE.Vector3();
  function pushSheet(x0, x1, v0, v1, col, jag) {
    const m = 8, K = Math.max(2, Math.round((v1 - v0) * RIBS)), rib = 0.05, baseC = new THREE.Color(col), rr = R;
    const under = baseC.clone().lerp(new THREE.Color('#fff4c8'), 0.22).multiplyScalar(1.02);
    const yOff = (j) => (j % 2 ? rib : 0);
    for (let j = 0; j < m; j++) {
      const xa = lerp(x0, x1, j / m), xb = lerp(x0, x1, (j + 1) / m), vEnd = jag ? lerp(v0, v1, 0.32 + rr() * 0.5 * (j % 2 ? 1 : 0.85)) : v1;
      for (let k = 0; k < K; k++) {
        const va = lerp(v0, vEnd, k / K), vb = lerp(v0, vEnd, (k + 1) / K);
        const a = arc(xa, va), b = arc(xb, va), c = arc(xb, vb), d = arc(xa, vb); a[1] += yOff(j); d[1] += yOff(j); b[1] += yOff(j + 1); c[1] += yOff(j + 1);
        _A.set(...a); _E1.set(...b).sub(_A); _E2.set(...d).sub(_A); _N.crossVectors(_E2, _E1).normalize(); if (_N.y < 0) _N.multiplyScalar(-1);
        const sun = _N.dot(SUN), sh = (sun > 0.74 ? 1.06 : sun > 0.52 ? 0.96 : 0.86) * (j % 2 ? 1 : 0.9);
        _c.copy(baseC).multiplyScalar(sh);
        const q = [a, b, c, d];
        // top, wound to face up
        const topFirst = new THREE.Vector3().subVectors(_B.set(...b), _A).cross(_C.set(...c).sub(_A)).dot(_N) > 0;
        const idx = topFirst ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
        for (const i of idx) { skin.p.push(q[i][0], q[i][1], q[i][2]); skin.n.push(_N.x, _N.y, _N.z); skin.c.push(_c.r, _c.g, _c.b); }
        // underside: the light coming through, a touch below
        const g = under.clone().multiplyScalar(j % 2 ? 1.02 : 0.9), idU = topFirst ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
        for (const i of idU) { skin.up.push(q[i][0] - _N.x * LAP, q[i][1] - _N.y * LAP, q[i][2] - _N.z * LAP); skin.unp.push(-_N.x, -_N.y, -_N.z); skin.unc.push(g.r, g.g, g.b); }
      }
    }
  }
  const BAND = [[0.02, 0.36], [0.33, 0.67], [0.64, 0.98]], holes = [], lit = [];
  const P_GONE = [0.05, 0.2, 0.42, 0.3, 0.74];
  for (let b = 0; b < F.length - 1; b++) {
    const xa = F[b], xb = F[b + 1], n = Math.max(3, Math.round((xa - xb) / 0.84));
    let prev = false;
    for (let i = 0; i < n; i++) {
      const x0 = lerp(xa, xb, i / n) - 0.012, x1 = lerp(xa, xb, (i + 1) / n) + 0.012;
      for (let bandI = 0; bandI < 3; bandI++) {
        const [v0, v1] = BAND[bandI], isN = bandI === 0, isS = bandI === 2;
        let p = P_GONE[b] * (isN ? 1.5 : isS ? 0.6 : 1) * (prev ? 1.5 : 1);
        if (b === 2 && (isS || bandI === 1)) p *= 0.5;
        const gone = R() < p; prev = gone;
        if (gone) { if (b > 0 && b < 4 && bandI < 2 && !(b === 2 && bandI === 1)) holes.push({ x: (x0 + x1) / 2, w: x0 - x1, v: (v0 + v1) / 2, b }); continue; }
        const k = R(), crown = bandI === 1, col = k < 0.1 ? R.pick(BLEACH) : crown ? R.pick(AMBER) : R.pick(GREEN);
        pushSheet(x0, x1, v0, v1, col, R() < P_GONE[b] * 0.9); lit.push({ x0, x1, v0, v1, col });
      }
    }
  }
  const mkSkin = (p, n, c, mat, nm) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((p.length / 3) * 2), 2)); const m = new THREE.Mesh(g, mat); m.name = nm; m.castShadow = true; m.receiveShadow = true; group.add(m); return m; };
  mkSkin(skin.p, skin.n, skin.c, ctx.toon({ vertexColors: true, translucent: 0.35 }), 'west-skin');
  const under = mkSkin(skin.up, skin.unp, skin.unc, new THREE.MeshBasicMaterial({ vertexColors: true }), 'west-glow'); under.receiveShadow = false; under.castShadow = false;
  /* what the skin does to the light: the coloured sun it passes (additive pools on the road and walks, projected along the sun) and shafts through the gaps */
  {
    const lp = [], lc2 = [], tmp = new THREE.Color(), ky = SUN.x / SUN.y, kz = SUN.z / SUN.y;
    const road0 = zc - road.w / 2, road1 = zc + road.w / 2, zN = road0 - road.walk[0], zS = road1 + road.walk[1];
    const clip = (poly, lim, keepAbove) => { const out = []; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], ina = keepAbove ? a[1] >= lim : a[1] <= lim, inb = keepAbove ? b[1] >= lim : b[1] <= lim; if (ina) out.push(a); if (ina !== inb) { const t = (lim - a[1]) / (b[1] - a[1]); out.push([a[0] + (b[0] - a[0]) * t, lim]); } } return out; };
    const tri = (a, b, c, y, col) => { for (const q of [a, b, c]) { lp.push(q[0], y, q[1]); lc2.push(col.r, col.g, col.b); } };
    for (const s2 of lit) {
      const corners = [[s2.x0, s2.v0], [s2.x1, s2.v0], [s2.x1, s2.v1], [s2.x0, s2.v1]].map(([x, v]) => { const p = arc(x, v); return [p[0] - ky * p[1], p[2] - kz * p[1]]; });
      tmp.set(s2.col).multiplyScalar(0.17);
      for (const [z0, z1, y] of [[zN, road0, 0.135], [road0, road1, 0.012], [road1, zS, 0.135]]) {
        let poly = clip(clip(corners, z0, true), z1, false); if (poly.length < 3) continue;
        for (let i = 1; i < poly.length - 1; i++) tri(poly[0], poly[i], poly[i + 1], y, tmp);
      }
    }
    // Shafts through the gaps. Each is ONE bar turned about the sun's axis to face the camera, so it can never be seen edge-on as a hairline; the profile across it is smooth and
    // made in the fragment shader. They use the same lens and side fades as the Tyndall beams in atmos, and they fade where only open sky stands behind them. The bays at the open west end get none.
    const warm = new THREE.Color('#ffd98e').multiplyScalar(0.27);
    const pick = holes.filter((_, i) => i % 3 === 0).slice(0, 9).filter((h2) => h2.b < 3);
    const nPool = lp.length / 3, bar = new Float32Array(nPool * 4); // pools carry aBar = 0: they are plain additive vertex colour
    const pB = [], cB = [], aB = [];
    for (const h2 of pick) {
      const top = arc(h2.x, h2.v), len = Math.min(top[1] / SUN.y, 12), bot = [top[0] - SUN.x * len, top[1] - SUN.y * len, top[2] - SUN.z * len], hw = 0.62;
      const v = (side, along) => { const q = along ? bot : top; pB.push(q[0], q[1], q[2]); cB.push(warm.r, warm.g, warm.b); aB.push(side, along, hw, 1); };
      v(-1, 0); v(1, 0); v(1, 1); v(-1, 0); v(1, 1); v(-1, 1);
    }
    if (lp.length || pB.length) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([...lp, ...pB], 3)); g.setAttribute('aCol', new THREE.Float32BufferAttribute([...lc2, ...cB], 3));
      const all = new Float32Array(bar.length + aB.length); all.set(bar); all.set(aB, bar.length); g.setAttribute('aBar', new THREE.BufferAttribute(all, 4));
      const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        uniforms: { uSun: { value: SUN.clone() }, uStreet: { value: new THREE.Vector4(fN, fS, F[5] - 1, F[0] + 1) }, uRoof: { value: YS + 0.4 }, uEdge: { value: L.BASE.half } },
        vertexShader: /* glsl */`
          attribute vec3 aCol; attribute vec4 aBar; uniform vec3 uSun; varying vec3 vCol,vW; varying vec4 vBar;
          void main(){
            vec3 p=position;
            if(aBar.w>.5){ vec3 s=cross(uSun,cameraPosition-p); float l=length(s); p+=(l>1e-3?s/l:vec3(1.,0.,0.))*aBar.x*aBar.z; }
            vW=p; vCol=aCol; vBar=aBar; gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
          }`,
        fragmentShader: /* glsl */`
          uniform vec3 uSun; uniform vec4 uStreet; uniform float uRoof,uEdge; varying vec3 vCol,vW; varying vec4 vBar;
          void main(){
            if(vBar.w<.5){ gl_FragColor=vec4(vCol,1.); return; }
            float u=vBar.x, along=vBar.y, across=(1.-u*u); across*=across;
            float ends=smoothstep(0.,.16,along)*(1.-smoothstep(.5,1.,along));
            vec3 V=cameraPosition-vW; float dist=length(V), lens=smoothstep(4.,12.,dist), side=smoothstep(.35,.88,length(cross(V/dist,uSun)));
            // what stands behind this fragment along the view ray: the ground on the plinth, or a shop row; anything else is sky
            vec3 d=-V/dist; float ground=0.;
            if(d.y<-.001){ vec2 h=vW.xz+d.xz*(-vW.y/d.y); ground=1.-smoothstep(uEdge-1.,uEdge+1.,max(abs(h.x),abs(h.y))); }
            float wall=0.;
            if(abs(d.z)>.001){ float t=((d.z>0.?uStreet.y:uStreet.x)-vW.z)/d.z; if(t>0.){ vec3 w=vW+d*t; wall=(1.-smoothstep(uRoof-.6,uRoof+.6,w.y))*smoothstep(uStreet.z-.5,uStreet.z+.5,w.x)*(1.-smoothstep(uStreet.w-.5,uStreet.w+.5,w.x)); } }
            float backed=max(ground,wall);
            gl_FragColor=vec4(vCol*across*ends*lens*side*mix(.08,1.,backed),1.);
          }`,
      }));
      m.name = 'west-light'; m.renderOrder = 2; m.frustumCulled = false; group.add(ctx.noOutline(m));
    }
  }
  // loose sheets that have slipped from their purlins and hang, on the rig
  for (const [x, v, col, len, tilt] of [[lerp(F[1], F[2], 0.4), 0.2, GREEN[0], 1.3, 0.5], [lerp(F[3], F[4], 0.6), 0.28, AMBER[0], 1.5, -0.4], [lerp(F[4], F[5], 0.3), 0.8, GREEN[1], 1.2, 0.3]]) {
    const top = arc(x, v), g = new THREE.BufferGeometry(), n = 7, w = 0.76, pts = [], idx = [], cc = [], Cl = new THREE.Color(col);
    for (let i = 0; i <= n; i++) for (let j = 0; j <= 1; j++) { const xx = lerp(-w / 2, w / 2, i / n), yy = -len * j; pts.push(xx, yy, i % 2 ? 0.05 : 0); const s = i % 2 ? 1.04 : 0.86; cc.push(Cl.r * s, Cl.g * s, Cl.b * s); }
    for (let i = 0; i < n; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3)); g.setIndex(idx); g.computeVertexNormals(); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((pts.length / 3) * 2), 2));
    swing(g, M({ pos: [top[0], top[1] - 0.06, top[2]], rot: [tilt, 0.1, 0] }), '#ffffff', { o: [top[0], top[1] - 0.06, top[2]], axis: [1, 0, 0.1], amp: 0.03, f: 0.9, ph: x, wind: 0.06 });
  }

  // banners off the frames, read looking down the street
  let bi = 0;
  F.forEach((x, fi) => {
    if (fi === 0 || fi === 5) return;
    for (const v of [0.13, 0.84]) {
      if (v > 0.5 && (fi === 1 || fi === 3)) continue; // the south side of the first bay stays open, and that frame down the street has fallen
      const p = arc(x - 0.12, v), yt = p[1] - 0.16, cell = `wB${bi++ % BANNERS.length}`;
      WS.rod([x - 0.12, yt + 0.02, p[2] - 0.36], [x - 0.12, yt + 0.02, p[2] + 0.36], 0.018, 'worn', STEEL_D, 4);
      hang(cell, 0.56, 1.5, { pos: [x - 0.12, yt, p[2]], rot: [0, Q, 0], nx: 2, ny: 6, amp: 0.05, gust: 0.14, f: 1.2, twoSided: true });
    }
  });
  // lantern strings: along each side and down the crown, sagging between the frames
  const LANT = ['#c8483c', '#c8483c', '#efe6cf', '#e8b65a'];
  for (let b = 0; b < F.length - 1; b++) for (const v of [0.24, 0.5, 0.76]) {
    if (b === 4 && v !== 0.5) continue;
    const xa = F[b], xb = F[b + 1], n = 4, drop = v === 0.5 ? 0.42 : 0.3, yy = (x) => arc(x, v)[1] - 0.2;
    let lastP = null;
    for (let k = 0; k <= n; k++) {
      const t = k / n, x = lerp(xa, xb, t), p = [x, yy(x) - drop * 4 * t * (1 - t) * (b === 2 ? 2.2 : 1), arc(x, v)[2]];
      if (lastP) WS.rod(lastP, p, 0.009, 'worn', '#4a5056', 3);
      lastP = p;
      if (k > 0 && k < n) lanterns.push({ p: [p[0], p[1] - 0.01, p[2]], s: v === 0.5 ? 1.16 : 1, c: LANT[(b + k + (v === 0.5 ? 1 : 0)) % LANT.length] });
    }
  }
  // vines through the gaps and off the frames
  for (let i = 0; i < 18; i++) { const x = R.range(F[5] + 0.3, F[0] - 0.4), v = R.pick([0.12, 0.3, 0.5, 0.7, 0.88]), p = arc(x, v); strand([p[0], p[1] - 0.02, p[2]], R.range(1.2, 2.6)); }
  for (let b = 2; b < 5; b++) for (let i = 0; i < 6; i++) { const x = R.range(F[b + 1], F[b]), v = R.range(0.1, 0.9), p = arc(x, v); h0.clump(toLocal([p[0], p[1] + 0.06, p[2]]), R.range(0.5, 0.95), 0.16, 34, { s: 0.3, core: false, droop: 0.1 }); }

  // a young tree up through the torn bay, off the crown line, on the south walk corner
  {
    const x = lerp(F[2], F[3], 0.42), z = fS - 0.5, t = WS;
    t.tube([[x, 0.1, z], [x + 0.2, 2.4, z - 0.2], [x - 0.3, 5.2, z - 0.6], [x + 0.1, 7.2, z - 0.5]], 0.26, 0.11, 'flat', '#7a6248', 6, 12);
    t.tube([[x - 0.3, 5.2, z - 0.6], [x - 1.2, 6.9, z - 0.2]], 0.1, 0.05, 'flat', '#7a6248', 5, 6); t.tube([[x + 0.2, 3.4, z - 0.25], [x + 1.1, 5.8, z - 1.2]], 0.1, 0.05, 'flat', '#7a6248', 5, 6);
    h0.clump(toLocal([x, 7.8, z - 0.6]), 2.0, 1.3, 140, { s: 0.52 }); h0.clump(toLocal([x - 1.4, 7.2, z - 0.1]), 1.25, 0.9, 62, { s: 0.48 }); h0.clump(toLocal([x + 1.4, 6.3, z - 1.3]), 1.05, 0.8, 50, { s: 0.46 });
    h0.rubble && h0.rubble(toLocal([x - 0.6, 0, fS - 1.0])[0], toLocal([x - 0.6, 0, fS - 1.0])[2], 0.85, 0.42, 9);
  }
  // the panels that came off, in a slide along the south walk under the torn bay
  {
    const rr = H.rand('west-fall'), xBase = lerp(F[2], F[3], 0.35);
    for (let i = 0; i < 7; i++) {
      const x = xBase - i * 0.45 + rr.range(-0.1, 0.1), z = fS - 0.72 + rr.range(-0.18, 0.18), col = rr() < 0.7 ? rr.pick(GREEN) : rr.pick(AMBER), s = WS.sub({ pos: [x, 0.16 + i * 0.05, z], rot: [rr.range(-0.32, 0.32), rr.range(-0.5, 0.5), rr.range(-0.2, 0.2)] }), a = 0.46, l = 0.76, c0 = new THREE.Color(col), n = 6;
      for (let j = 0; j < n; j++) { const xa = lerp(-a, a, j / n), xb = lerp(-a, a, (j + 1) / n), ya = j % 2 ? 0.035 : 0, yb = j % 2 ? 0 : 0.035, k = j % 2 ? 1 : 0.86; s.quad([xa, ya, -l], [xb, yb, -l], [xb, yb, l], [xa, ya, l], 'flat', [c0.r * k, c0.g * k, c0.b * k]); }
    }
  }
  // street things, on the walks only
  {
    const rr = H.rand('west-walk'), s = WS;
    const zWalkS = (zc + road.w / 2 + fS) / 2;
    bicycle(s, lerp(F[0], F[1], 0.6), zWalkS, 0.12, -0.2, 0.12);
    // planter benches on the north walk, one of them a meadow
    const pl = (x, z, l = 1.6) => { s.box(x - l / 2, x + l / 2, 0.12, 0.62, z - 0.27, z + 0.27, 'concrete', '#bdb9ab'); s.box(x - l / 2 + 0.06, x + l / 2 - 0.06, 0.6, 0.64, z - 0.21, z + 0.21, 'flat', P.soil); h0.clump(toLocal([x, 0.92, z]), l * 0.48, 0.36, 24, { s: 0.32 }); for (let i = 0; i < 6; i++) { const f = s.sub({ pos: [x + rr.range(-l / 2.4, l / 2.4), 1.05 + rr() * 0.2, z + rr.range(-0.16, 0.16)], rot: [rr.range(-0.3, 0.3), rr() * 6, 0] }); f.add(kit.flower(0.09), 'flat', { color: rr.pick([P.flowerYellow, P.bougainLit, P.flowerWhite]) }); } };
    pl(lerp(F[1], F[2], 0.5), zA + 0.42); pl(lerp(F[3], F[4], 0.32), zA + 0.42, 1.2); pl(lerp(F[3], F[4], 0.7), zWalkS, 1.4);
    // old standing board
    const bd = s.sub({ pos: [lerp(F[1], F[2], 0.25), 0.12, zWalkS], rot: [0, 0.4, 0] }); for (const a of [-0.2, 0.2]) { bd.beam([a, 0, -0.18], [a, 1.0, -0.02], 0.04, 0.04, 'wood', '#94785a'); bd.beam([a, 0, 0.18], [a, 1.0, 0.02], 0.04, 0.04, 'wood', '#94785a'); } H.props.sign(bd, 'wMenu', 0.5, 0.7, { pos: [0, 0.62, 0.12], rot: [-0.18, 0, 0.02], board: '#6e5038' });
  }

  /* ----------------------------------------------------- the mill ----------------------------------------------------- */
  const mill = by.w16, mb = bx('w16');
  const wy = RIVER.y, outline = L.riverOutline(0.5), nO = outline.length / 2, bankW = outline.slice(0, nO), bankE = outline.slice(nO).reverse();
  const raceAt = (i) => { const c = [(bankW[i][0] + bankE[i][0]) / 2, (bankW[i][1] + bankE[i][1]) / 2]; return [lerp(c[0], bankW[i][0], 0.76), lerp(c[1], bankW[i][1], 0.76)]; };
  let iHub = 0, bd_ = 1e9; for (let i = 1; i < nO - 1; i++) { const p = raceAt(i), d = Math.abs(p[1] - (mill.z + 0.32)); if (d < bd_ && p[0] < mill.x + 5) { bd_ = d; iHub = i; } }
  const hub = raceAt(iHub), pa = raceAt(iHub - 2), pb = raceAt(iHub + 2), tx = pb[0] - pa[0], tz = pb[1] - pa[1], tl = Math.hypot(tx, tz), yawW = Math.atan2(tx / tl, tz / tl);
  const RW = 1.5, CY = wy - 0.3 + RW, WHALF = 0.27;
  const ST = WS.sub({ pos: [hub[0], 0, hub[1]], rot: [0, yawW, 0] }); // local z runs downstream, local x off the bank (toward +x side)
  const toWall = (mb.x[1] - hub[0]) / Math.cos(yawW);       // distance back along local x to the mill's canal wall (negative)
  // the mill: door on the land side, canal wall blank but for the axle and a vent, the wheel built here instead of the kit's
  const hm = H.build(mill, { wheel: false, wall: 'board', wallCol: '#8d7258', band: { type: 'mortar', h: 0.8, col: '#a9a596' }, roof: 'kawara', pitch: 0.5, es: 0.26, ef: 0.34, eb: 0.3, sign: { cell: 'mill', w: 2.2, y: 2.28 }, decay: { level: 0.46, holes: 1, saplings: 1, collapse: false, vines: [{ side: 'back', cover: 0.8 }], bushes: 2 }, props: ['drain'],
    open: (T) => ({ front: [op('mushiko', -1.25, -0.3, T.fl + 1.2, T.fl + 1.78)], back: [op('sliding', -0.7, 0.7, T.fl, T.fl + 1.96)], left: [op('sash', -0.45, 0.45, T.fl + 0.95, T.fl + 1.7)], right: [op('mushiko', -0.5, 0.5, T.fl + 1.1, T.fl + 1.8)] }) });
  {
    // axle, bearing posts, rims: rotationally symmetric, so they stay still and cast shadow; the moving spokes and floats are the mesh below
    ST.rod([toWall - 0.2, CY, 0], [WHALF + 0.5, CY, 0], 0.1, 'wood', '#5e4a3c', 10);
    for (const sx of [-1, 1]) {
      const x = sx * WHALF;
      ST.add(kit.torus(RW - 0.02, 0.055, 4, 28), 'wood', { pos: [x, CY, 0], rot: [0, Q, 0], color: '#6e5a48' });
      ST.add(kit.torus(RW - 0.42, 0.04, 4, 24), 'wood', { pos: [x, CY, 0], rot: [0, Q, 0], color: '#6e5a48' });
      ST.add(kit.cyl(0.24, 0.24, 0.1, 10), 'wood', { pos: [x, CY, 0], rot: [0, 0, Q], color: '#5e4a3c' });
    }
    // outboard A-frame standing on the training wall, inboard bearing against the bank
    const legs = (x, foot) => { for (const z of [-0.7, 0.7]) ST.beam([x, foot, z], [x, CY + 0.06, z * 0.08], 0.14, 0.14, 'wood', '#6d5240'); ST.beam([x, CY - 0.45, -0.5], [x, CY - 0.45, 0.5], 0.08, 0.1, 'wood', '#6d5240'); ST.box(x - 0.13, x + 0.13, CY - 0.17, CY - 0.05, -0.18, 0.18, 'wood', '#86664c'); };
    legs(WHALF + 0.36, -0.28); legs(-WHALF - 0.28, 0.02);
    // where the axle meets the wall
    const fw = hm.front; fw.box(-0.32, 0.72, 0.5, 1.5, 0, 0.05, 'wood', '#6d5240');
    // rotating part
    const rb = ctx.batch(), wc = ['#86664c', '#7a5c46', '#8d6b48'], wetC = '#6a5a4a';
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU, c = Math.cos(a), s = Math.sin(a), rM = RW - 0.2, tilt = a + 0.45;
      const g = kit.box(WHALF * 2 + 0.05, 0.42, 0.05);
      rb.add(g, 'flat', { pos: [0, c * rM, s * rM], rot: [tilt, 0, 0], color: i % 5 === 0 ? '#6f8a58' : wc[i % 3] });
      rb.add(kit.box(WHALF * 2 + 0.04, 0.05, 0.28), 'flat', { pos: [0, c * (rM - 0.2), s * (rM - 0.2)], rot: [a, 0, 0], color: wetC });
    }
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU, c = Math.cos(a), s = Math.sin(a); for (const sx of [-WHALF, WHALF]) rb.add(kit.box(0.05, RW - 0.28, 0.11), 'flat', { pos: [sx, c * (RW - 0.28) * 0.5, s * (RW - 0.28) * 0.5], rot: [a, 0, 0], color: '#86664c' }); }
    const hubCore = rb.build({ castShadow: false, receiveShadow: true });
    const wheelG = new THREE.Group(); wheelG.name = 'west-wheel'; wheelG.position.set(hub[0], CY, hub[1]); wheelG.rotation.y = yawW; hubCore.children[0].name = 'west-wheel-mesh'; wheelG.add(hubCore); group.add(wheelG);
    wheelMesh = hubCore;
    // the flume: comes in along the wheel's own plane, from a broken main upstream
    const mouthZ = -0.62 * RW, yMouth = CY + Math.sqrt(RW * RW - mouthZ * mouthZ) + 0.28, LEN = 5.4, slope = 0.045;
    const fy = (z) => yMouth + (mouthZ - z) * slope, BW = 0.26, Dp = 0.26, FT = 0.05;
    const n = Math.ceil(LEN / 0.42);
    for (let i = 0; i < n; i++) {
      const z0 = mouthZ - (i * LEN) / n, z1 = mouthZ - ((i + 1) * LEN) / n, y0 = fy(z0), y1 = fy(z1), c = i % 3 === 0 ? '#86664c' : i % 3 === 1 ? '#7a5c46' : '#8d6b48';
      ST.beam([0, y0 - FT / 2, z0], [0, y1 - FT / 2, z1], BW * 2 + FT, FT, 'wood', c);
      for (const sx of [-1, 1]) ST.beam([sx * (BW + FT / 2), y0 + Dp / 2, z0], [sx * (BW + FT / 2), y1 + Dp / 2, z1], FT, Dp, 'wood', c);
      if (i % 3 === 0) ST.box(-BW - 0.1, BW + 0.1, y0 - 0.1, y0 + Dp + 0.03, z0 - 0.05, z0 + 0.05, 'wood', '#5e4a3c');
    }
    // trestle bents
    for (const s of [1.0, 2.5, 4.0, 5.1]) {
      const z = mouthZ - s, top = fy(z) - 0.1, foot = 0.04;
      for (const sx of [-1, 1]) ST.beam([sx * 0.72, foot, z], [sx * 0.24, top, z], 0.13, 0.13, 'wood', '#6d5240');
      ST.beam([-0.46, top, z], [0.46, top, z], 0.1, 0.15, 'wood', '#5e4a3c'); ST.beam([-0.62, 0.72, z], [0.62, 1.3, z], 0.05, 0.11, 'wood', '#7a5c46');
      if (s < 3) ST.box(-0.72 - 0.14, 0.72 + 0.14, foot - 0.02, foot + 0.1, z - 0.2, z + 0.2, 'concrete', '#b9b5a8');
    }
    for (const a of [0, 1]) ST.beam([0, fy(mouthZ - 1 - a * 3) - 0.3, mouthZ - 1 - a * 3], [0, fy(mouthZ - 2.5 - a * 1.5) - 0.3, mouthZ - 2.5 - a * 1.5], 0.05, 0.1, 'wood', '#7a5c46');
    // the sluice: a pair of posts and a lift gate astride the flume, raised on its rack
    {
      const z = mouthZ - 1.5, y = fy(z);
      for (const sx of [-1, 1]) ST.box(sx * (BW + FT) - 0.05, sx * (BW + FT) + 0.05, y - 0.1, y + 0.95, z - 0.05, z + 0.05, 'wood', '#5e4a3c');
      ST.box(-BW - FT - 0.08, BW + FT + 0.08, y + 0.86, y + 0.96, z - 0.06, z + 0.06, 'wood', '#6d5240');
      ST.box(-BW + 0.01, BW - 0.01, y + 0.13, y + 0.5, z - 0.02, z + 0.02, 'wood', '#a98a6a'); // gate, half up
      ST.box(-0.03, 0.03, y + 0.5, y + 1.15, z - 0.02, z + 0.02, 'worn', '#6f7a7e'); ST.rod([-0.3, y + 1.15, z], [0.3, y + 1.15, z], 0.022, 'worn', '#b5522f', 5);
    }
    // head box and the burst main that fills it
    {
      const z = mouthZ - LEN - 0.32, y = fy(z);
      for (const [x0, x1, z0, z1] of [[-0.54, 0.54, z - 0.55, z - 0.5], [-0.54, 0.54, z + 0.5, z + 0.55], [-0.54, -0.5, z - 0.55, z + 0.55], [0.5, 0.54, z - 0.55, z + 0.55]]) ST.box(x0, x1, y - 0.5, y + 0.34 + 0.05, z0, z1, 'wood', '#7a5c46');
      ST.box(-0.54, 0.54, y - 0.56, y - 0.5, z - 0.55, z + 0.55, 'wood', '#5e4a3c');
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) ST.beam([sx * 0.46, 0.02, z + sz * 0.46], [sx * 0.46, y - 0.5, z + sz * 0.46], 0.14, 0.14, 'wood', '#5e4a3c');
      ST.rod([0.32, 0, z - 0.62], [0.32, y + 0.9, z - 0.62], 0.1, 'worn', P.rust, 8); ST.add(kit.torus(0.14, 0.07, 6, 10, Math.PI), 'worn', { pos: [0.32, y + 0.9, z - 0.48], rot: [Q, 0, Q], color: P.rust }); ST.rod([0.32, y + 0.9, z - 0.34], [0.32, y + 0.68, z - 0.34], 0.1, 'worn', P.rust, 8);
      ST.box(0.2, 0.44, y + 0.66, y + 0.7, z - 0.46, z - 0.22, 'worn', P.rustDark);
      hm.clump(toLocalM([ST.w([0.5, y + 0.1, z]).x, y + 0.2, ST.w([0.5, y + 0.1, z]).z]), 0.5, 0.42, 22, { s: 0.3, core: false });
    }
    function toLocalM(p) { return new THREE.Vector3(...p).applyMatrix4(new THREE.Matrix4().copy(hm.S.m).invert()).toArray(); }
    FLUME = { mouthZ, yMouth, fy, LEN, BW, Dp, ST };
  }

  /* ---- running water: one mesh, a streak texture scrolled along the flow ---- */
  const streak = ctx.canvasTexture(64, 256, (g, w, h) => {
    g.fillStyle = '#a4e9dc'; g.fillRect(0, 0, w, h); const rr = seeded('west-water');
    const dash = (x, y, l, wd, c) => { g.fillStyle = c; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + wd, y + l / 2, x, y + l); g.quadraticCurveTo(x - wd, y + l / 2, x, y); g.fill(); };
    for (let i = 0; i < 26; i++) { const x = rr() * w, y = rr() * h, l = rr.range(50, 130), wd = rr.range(2, 5), c = rr() < 0.7 ? '#eafff4' : '#4fbfae'; dash(x, y, l, wd, c); dash(x, y - h, l, wd, c); }
  }, { repeat: true, srgb: true });
  streak.wrapS = streak.wrapT = THREE.RepeatWrapping;
  const fxp = [], fxu = [], fxc = [], fxi = [];
  const ribbon = (pts, wdt, scale = 1, c = [1, 1, 1]) => {
    const start = fxp.length / 3; let s = 0;
    pts.forEach((p, i) => {
      if (i) s += Math.hypot(p[1] - pts[i - 1][1], p[2] - pts[i - 1][2]);
      for (const sx of [-1, 1]) { const q = FLUME.ST.w([sx * wdt, p[1], p[2]]); fxp.push(q.x, q.y, q.z); fxu.push(0.5 + sx * 0.5, s * scale * 0.5); fxc.push(...c); }
      if (i) { const a = start + (i - 1) * 2; fxi.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    });
  };
  {
    const { mouthZ, yMouth, fy, LEN, BW } = FLUME, surf = [];
    for (let i = 0; i <= 8; i++) { const z = mouthZ - LEN + (i / 8) * LEN; surf.push([0, fy(z) + 0.14, z]); }
    ribbon(surf, BW - 0.015, 1.4, [0.84, 0.96, 0.92]);
    const fall = []; for (let i = 0; i <= 7; i++) { const t = i / 7; fall.push([0, yMouth + 0.13 - 0.5 * t * t * 0.32, mouthZ + t * 0.16 - 0.02]); }
    const hitA = Math.acos(clamp((fall[7][1] - CY) / (RW + 0.1)));
    for (let i = 1; i <= 16; i++) { const t = i / 16, ang = lerp(hitA, Math.acos(clamp((wy - CY + 0.04) / (RW + 0.1), -1, 1)), t); fall.push([0, CY + Math.cos(ang) * (RW + 0.1), -Math.sin(ang) * (RW + 0.1)]); }
    ribbon(fall, 0.22, 1, [1, 1, 1]);
    { // the same fall seen edge-on: a band in the wheel's own plane, so it reads from the bank too
      const st2 = fxp.length / 3; let s2 = 0;
      fall.forEach((p, i) => { if (i) s2 += Math.hypot(p[1] - fall[i - 1][1], p[2] - fall[i - 1][2]); const dy = p[1] - CY, dz = p[2], l = Math.hypot(dy, dz) || 1, hw2 = 0.05 + 0.075 * Math.sin((Math.PI * i) / (fall.length - 1)); for (const sg of [-1, 1]) { const q = FLUME.ST.w([0, p[1] + (sg * hw2 * dy) / l, p[2] + (sg * hw2 * dz) / l]); fxp.push(q.x, q.y, q.z); fxu.push(0.5 + sg * 0.5, s2 * 0.5); fxc.push(1, 1, 1); } if (i) { const a = st2 + (i - 1) * 2; fxi.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } });
    }
    // the run-out in the race below the wheel
    ribbon([[0, wy + 0.012, -0.5], [0, wy + 0.012, 0.3], [0, wy + 0.012, 1.1], [0, wy + 0.012, 1.7]], 0.3, 0.9, [0.85, 0.98, 0.94]);
  }
  const fxg = new THREE.BufferGeometry(); fxg.setAttribute('position', new THREE.Float32BufferAttribute(fxp, 3)); fxg.setAttribute('uv', new THREE.Float32BufferAttribute(fxu, 2)); fxg.setAttribute('color', new THREE.Float32BufferAttribute(fxc, 3)); fxg.setIndex(fxi);
  const fx = new THREE.Mesh(fxg, new THREE.MeshBasicMaterial({ map: streak, vertexColors: true, transparent: true, opacity: 0.86, side: THREE.DoubleSide, depthWrite: false })); fx.name = 'west-water'; fx.renderOrder = 3; group.add(ctx.noOutline(fx));
  // foam where the wheel meets the race
  for (let i = 0; i < 10; i++) {
    const a = i / 10, zf = lerp(-0.95, 1.05, a), xf = R.range(-0.3, 0.3), r0 = R.range(0.07, 0.18), g = white(new THREE.CircleGeometry(1, 7)); g.rotateX(-Q); const p0 = FLUME.ST.w([xf, wy + 0.022, zf]), ph = R() * 6, out = [0, 0, 0];
    rig.add(g, M({ pos: p0.toArray(), scale: [r0, 1, r0 * 0.7] }), '#f4fff8', { kind: 'path', fn: (t) => { out[0] = 0.05 * Math.sin(t * 1.3 + ph); out[1] = 0; out[2] = 0.05 * Math.cos(t * 1.1 + ph); return out; } });
  }
  // drips flung off the floats
  for (let i = 0; i < 14; i++) {
    const a = 0.5 + (i / 14) * 1.3, p0 = FLUME.ST.w([R.range(-WHALF, WHALF), CY - Math.cos(a) * RW, Math.sin(a) * RW * 0.9]), ph = R(), sp = 0.7 + R() * 0.4, dropH = Math.max(0.12, p0.y - wy), g = white(new THREE.IcosahedronGeometry(0.035, 0));
    const T0 = Math.sqrt((2 * dropH) / 9.8) * 1.4, out = [0, 0, 0];
    rig.add(g, M({ pos: p0.toArray() }), '#e8fff8', { kind: 'path', fn: (t) => { const f = fract(t * sp * 0.5 + ph), tt = f * T0; out[0] = 0; out[1] = f < 0.98 ? -4.9 * 0.5 * tt * tt : -9; out[2] = tt * 0.3; return out; } });
  }

  /* ----------------------------------------------------- the boathouse --------------------------------------------------- */
  {
    const b = by.w18, hb = H.build(b, { wall: 'board', wallCol: '#9a917f', roof: 'tin', shape: 'gable', ridge: 'z', pitch: 0.42, es: 0.2, ef: 0.34, eb: 0.2, foundationH: 0.16, sign: { cell: 'boat', y: 2.14, w: 1.5, h: 0.34 }, decay: { level: 0.56, holes: 2, collapse: false, vines: [{ side: 'left', cover: 0.7 }], bushes: 1, saplings: 0 }, open: (T) => ({ front: [op('bigdoor', -1.25, 1.25, T.fl, T.fl + 1.78, { col: '#8d7a62' })], back: [], left: [op('sash', -0.5, 0.5, T.fl + 0.9, T.fl + 1.7)], right: [] }) });
    // jetty straight off the doors, over the strip of bank and out past it on piles
    const B0 = bx('w18'), xs = B0.x[1], zMid = b.z - 1.4, dy = 0.26, bank = (z) => { let best = -1e9; for (const [x, zz] of bankW) if (Math.abs(zz - z) < 0.5 && x > best) best = x; return best; };
    const xEdge = bank(zMid), xEnd = xEdge + 1.1, jw = 0.55;
    const planks = Math.ceil((xEnd - xs) / 0.22);
    for (let i = 0; i < planks; i++) { const x0 = lerp(xs + 0.02, xEnd, i / planks), x1 = lerp(xs + 0.02, xEnd, (i + 1) / planks) - 0.025, broken = i > planks * 0.65 && R() < 0.22; if (broken) continue; WS.box(x0, x1, dy, dy + 0.05, zMid - jw, zMid + jw, 'wood', R.pick(['#a89070', '#94785a', '#b39a78', '#8d8270'])); }
    for (const zo of [-jw + 0.04, jw - 0.04]) WS.box(xs, xEnd, dy - 0.12, dy, zMid + zo - 0.05, zMid + zo + 0.05, 'wood', '#6d5240');
    for (let x = xEdge + 0.1; x <= xEnd + 0.01; x += 0.7) for (const zo of [-jw + 0.04, jw - 0.04]) WS.rod([x, wy - 0.9, zMid + zo], [x, dy + 0.5, zMid + zo], 0.075, 'wood', '#5e4a3c', 7);
    WS.rod([xEnd - 0.1, wy - 0.7, zMid - jw + 0.04], [xEnd - 0.1, dy + 1.0, zMid - jw + 0.04], 0.09, 'wood', '#6e5038', 7); WS.rod([xEnd - 0.1, dy + 1.0, zMid - jw + 0.04], [xEnd - 0.1, dy + 1.14, zMid - jw + 0.04], 0.11, 'wood', '#efe6cf', 7);
    // the punt on its line, nudged by the current
    const pz = Math.max(zMid - jw - 0.42, L.CROSSINGS.canal.z + L.CROSSINGS.canal.width / 2 + 0.42), px = xEdge + 0.95, hullC = '#7a6a56', g0 = kit.box(0.74, 0.14, 2.4), pts0 = g0.attributes.position;
    for (let i = 0; i < pts0.count; i++) { const y = pts0.getY(i), z = pts0.getZ(i), xs2 = Math.max(0.2, 1 - (Math.abs(z) / 1.2) ** 2 * 0.72); pts0.setX(i, pts0.getX(i) * (y > 0 ? 1.06 : 0.86) * xs2); }
    g0.computeVertexNormals();
    const hy = Q + 0.08, along = (d) => [px + Math.sin(hy) * d, pz + Math.cos(hy) * d], seat = M({ pos: [px, wy + 0.08, pz], rot: [0, hy, 0] }), opivot = { o: [px, wy, pz], axis: [Math.sin(hy), 0, Math.cos(hy)], amp: 0.035, f: 0.7, ph: 1, dy: 0.012 };
    swing(g0, seat, hullC, opivot); const [a0, a1] = along(0.3), [b0, b1] = along(-0.4);
    swing(kit.box(0.46, 0.03, 0.14), M({ pos: [a0, wy + 0.19, a1], rot: [0, hy, 0] }), '#a98a6a', opivot); swing(kit.box(0.46, 0.03, 0.14), M({ pos: [b0, wy + 0.19, b1], rot: [0, hy, 0] }), '#a98a6a', opivot); swing(kit.box(0.5, 0.02, 1.8), M({ pos: [px, wy + 0.12, pz], rot: [0, hy, 0] }), '#3f5a50', opivot);
    const bow = along(1.05); WS.rod([bow[0], wy + 0.2, bow[1]], [xEnd - 0.1, dy + 0.9, zMid - jw + 0.04], 0.008, 'flat', '#d8c896', 3);
    const f = hb.front; f.box(1.45, 1.72, 0, 0.6, 0.1, 0.7, 'wood', '#94785a'); H.props.crates(f.sub({ pos: [-1.5, 0, 0.1] }), H.rand('w18c'));
    f.rod([-1.65, 1.6, 0.45], [-1.65, 0, 0.75], 0.022, 'wood', '#a98a6a', 4); f.rod([-1.65, 1.4, 0.5], [-0.9, 1.3, 0.55], 0.008, 'worn', '#a8b4b4', 3);
  }

  /* ----------------------------------------------------- close and animate ------------------------------------------- */
  const { tris: kitTris } = H.finish(group);
  rig.finish(group);
  // lanterns
  const lg = (() => {
    const body = new THREE.SphereGeometry(0.2, 10, 8); body.scale(1, 1.15, 1); const p = body.attributes.position, c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { const y = p.getY(i), f = Math.floor((y + 0.24) / 0.06) % 2 ? 0.86 : 1; c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = f; }
    body.setAttribute('color', new THREE.BufferAttribute(c, 3));
    const cap = (y, r, h2) => { const g = new THREE.CylinderGeometry(r, r, h2, 8, 1, false); g.translate(0, y, 0); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(0.34), 3)); return g; };
    const cord = cap(0.32, 0.008, 0.1), top = cap(0.25, 0.08, 0.045), bot = cap(-0.25, 0.08, 0.045);
    const g = kit.merge([body, top, bot, cord]); g.translate(0, -0.38, 0); return g;
  })();
  const lmat = ctx.toon({ color: '#ffffff', vertexColors: true, dapple: false, translucent: 0.9, emissive: '#3a2a12', emissiveIntensity: 0.6, glow: true });
  const lmesh = new THREE.InstancedMesh(lg, lmat, lanterns.length);
  lmesh.name = 'west-lanterns'; lmesh.castShadow = false; lmesh.receiveShadow = false; lmesh.frustumCulled = false;
  const lc = new THREE.Color(); lanterns.forEach((l, i) => { lmesh.setColorAt(i, lc.set(l.c)); l.ph = l.p[0] * 3.1 + l.p[2]; l.ph2 = l.p[0] * 1.7 - l.p[2]; }); lmesh.instanceColor.needsUpdate = true; lmesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); group.add(lmesh);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  const animLanterns = (t) => lanterns.forEach((l, i) => { const g = ctx.wind(t, l.p[0], l.p[2]); _e.set(0.03 * Math.sin(t * 1.1 + l.ph) + g * 0.055, 0, 0.034 * Math.sin(t * 0.93 + l.ph2) + g * 0.035); _q.setFromEuler(_e); lmesh.setMatrixAt(i, _m.compose(_p.set(l.p[0], l.p[1], l.p[2]), _q, _s.setScalar(l.s))); });
  animLanterns(0);
  rig.update(0);
  // night: the paper lanterns burn. The material's emissive carries the paper's own glow; the pools of light they throw are lamp slots at each cluster's centre.
  const E_DAY = new THREE.Color('#3a2a12'), E_NIGHT = new THREE.Color('#ff9440');
  { const strings = lanterns.filter((l) => l.s !== 1.36), inn = lanterns.filter((l) => l.s === 1.36), xs = strings.map((l) => l.p[0]), x0 = Math.min(...xs), x1 = Math.max(...xs);
    const pool = (list, r, power, ph) => { if (!list.length) return; const c = [0, 1, 2].map((i) => list.reduce((a, l) => a + l.p[i], 0) / list.length); ctx.shared.lamps.push({ pos: [c[0], c[1] - 2.2, c[2]], r, color: '#ff9c4a', power, halo: 0, k: (t) => 0.92 + 0.08 * Math.sin(t * 3.1 + ph) }); };
    for (let i = 0; i < 3; i++) pool(strings.filter((l) => l.p[0] >= x0 + (x1 - x0) * i / 3 - 1e-6 && l.p[0] <= x0 + (x1 - x0) * (i + 1) / 3 + 1e-6), 7.5, 0.42, i * 2.1);
    pool(inn, 5, 0.5, 5); }
  const OM = 0.32;
  group.userData.tris = kitTris + skin.p.length / 9 * 2;
  return {
    group,
    update(t) {
      animLanterns(t); lmesh.instanceMatrix.needsUpdate = true; rig.update(t);
      const n = ctx.shared.uNight.value; lmat.emissive.lerpColors(E_DAY, E_NIGHT, n); lmat.emissiveIntensity = 0.6 + 0.62 * n * n;
      wheelMesh.rotation.x = -t * OM;
      streak.offset.y = -t * 0.82;
    },
  };
}
