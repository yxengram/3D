// east — the east ring behind the rail: Shinonome Works (sawtooth shed, warehouse, water tower, office), then the farming hamlet, terraced paddies, kitchen rows and an old orchard.
// Everything static goes through housekit's 8 meshes. Extras: soil terraces (1), paddy water (1), rice (1), a single small motion mesh rewritten each frame (1), orchard net lines (1).
import * as THREE from 'three';
import { createHouseKit } from '../core/housekit.js';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sq = (x) => x * x;
const Q = Math.PI / 2, TAU = Math.PI * 2;

/* ---- one small mesh, rewritten every frame: noren, laundry, tarp, loose tin, lamp and hook. p = p0 + dir * weight * signal(t) ---- */
function createMotion(ctx, H) {
  const pos = [], nor = [], uv = [], col = [], parts = [], white = H.atlas.cellUV('white', 0.5, 0.5);
  const v = new THREE.Vector3(), n3 = new THREE.Matrix3();
  /** o: { color, shadeAt(x,y,z) local triangle centre → colour multiplier, cell (atlas cell), uvMap(s,t)→[u,v], dir [x,y,z] local, amp, weight(x,y,z) local → 0..1, signal 'wind'|'gust', freq, ph, flutter } */
  function add(geo, M, o) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone(), P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    const c = new THREE.Color(o.color ?? '#ffffff'), start = pos.length / 3, nm = n3.getNormalMatrix(M), dir = new THREE.Vector3(...(o.dir || [0, 0, 1])).transformDirection(M);
    const w = [];
    let tint = 1;
    for (let i = 0; i < P.count; i++) {
      if (o.shadeAt && i % 3 === 0) tint = o.shadeAt((P.getX(i) + P.getX(i + 1) + P.getX(i + 2)) / 3, (P.getY(i) + P.getY(i + 1) + P.getY(i + 2)) / 3, (P.getZ(i) + P.getZ(i + 1) + P.getZ(i + 2)) / 3);
      w.push(o.weight ? o.weight(P.getX(i), P.getY(i), P.getZ(i)) : 1);
      v.fromBufferAttribute(P, i).applyMatrix4(M); pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z);
      if (o.uvMap && U) { const q = o.uvMap(U.getX(i), 1 - U.getY(i)); uv.push(q[0], q[1]); } else uv.push(white[0], white[1]);
      col.push(c.r * tint, c.g * tint, c.b * tint);
    }
    parts.push({ start, count: P.count, w, dir, amp: o.amp ?? 0.1, signal: o.signal || 'wind', freq: o.freq ?? 1.7, ph: o.ph ?? 0, flutter: o.flutter ?? 0.2, cx: pos[start * 3], cz: pos[start * 3 + 2] });
    return parts[parts.length - 1];
  }
  function finish(group) {
    if (!pos.length) return null;
    const g = new THREE.BufferGeometry(), base = new Float32Array(pos), cur = new Float32Array(pos);
    g.setAttribute('position', new THREE.BufferAttribute(cur, 3)); g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
    const m = new THREE.Mesh(g, ctx.toon({ map: H.atlas.tex, vertexColors: true, side: THREE.DoubleSide, translucent: 0.3 }));
    m.castShadow = false; m.receiveShadow = true; m.frustumCulled = false; m.name = 'east-motion'; group.add(m);
    const update = (t) => {
      for (const p of parts) {
        const base1 = p.signal === 'gust' ? Math.pow(Math.max(0, Math.sin(t * 0.43 + p.ph)), 6) * (0.75 + 0.25 * Math.sin(t * 6.1 + p.ph * 3)) : 0.68 * ctx.wind(t, p.cx, p.cz) + 0.32 * Math.sin(t * p.freq + p.ph);
        const { start, count, w, dir, amp, flutter, ph } = p;
        for (let i = 0; i < count; i++) {
          const j = (start + i) * 3, x0 = base[j], y0 = base[j + 1], z0 = base[j + 2];
          const d = w[i] * amp * (base1 + flutter * Math.sin(t * 3.1 + ph + (x0 + z0) * 3.3 + y0 * 2.1));
          cur[j] = x0 + dir.x * d; cur[j + 1] = y0 + dir.y * d; cur[j + 2] = z0 + dir.z * d;
        }
      }
      g.attributes.position.needsUpdate = true;
    };
    return { mesh: m, update, tris: pos.length / 9 };
  }
  return { add, finish, vertexCount: () => pos.length / 3 };
}

/* ---- triangle soup with its own colours, for the soil terraces ---- */
function createSoup() {
  const pos = [], nor = [], col = [];
  const put = (p, n, c) => { pos.push(p[0], p[1], p[2]); nor.push(n[0], n[1], n[2]); col.push(c[0], c[1], c[2]); };
  const tri = (a, b, c, ca, cb = ca, cc = ca) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    put(a, [nx, ny, nz], ca); put(b, [nx, ny, nz], cb); put(c, [nx, ny, nz], cc);
  };
  const quad = (a, b, c, d, ca, cb = ca, cc = cb, cd = ca) => { tri(a, b, c, ca, cb, cc); tri(a, c, d, ca, cc, cd); };
  const geometry = () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3)); g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3)); return g;
  };
  return { tri, quad, geometry, tris: () => pos.length / 9 };
}
const rgbOf = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const tone = (c, m) => [c[0] * m, c[1] * m, c[2] * m];
const mixC = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export function build(ctx) {
  const { layout, P, kit } = ctx, { BUILDINGS, RING_ZONES, WOODS } = layout;
  const group = new THREE.Group(); group.name = 'east';
  const H = createHouseKit(ctx, { name: 'east', seed: 'east' });
  H.density = 0.85;
  const motion = createMotion(ctx, H), W = H.world, rng = ctx.rng;
  const BY = Object.fromEntries(BUILDINGS.filter((b) => b.o === 'east').map((b) => [b.id, b]));

  /* painted cells */
  H.atlas.paint('e-tank', 256, 128, (g, w, h, T) => { g.fillStyle = '#d7d3bf'; g.fillRect(0, 0, w, h); g.fillStyle = '#3f7f88'; g.fillRect(0, 86, w, 26); T.text('東雲', w / 2, 44, 72, '#3f6a84', { font: T.SERIF, weight: 900 }); T.blot(w, h, 20, ['#b5522f', '#7d3a2a'], 2, 12, 0.55); });
  H.atlas.paint('e-safe', 256, 128, (g, w, h, T) => { g.fillStyle = '#efe9d6'; g.fillRect(0, 0, w, h); g.fillStyle = '#3f8a58'; g.fillRect(16, 42, 56, 18); g.fillRect(35, 22, 18, 58); T.text('安全第一', 166, 52, 40, '#3f6a58', { font: T.SERIF, weight: 900 }); T.text('東雲製作所', 166, 100, 22, '#5a4632', { font: T.SERIF, weight: 800 }); T.blot(w, h, 16, ['#b5522f', '#a89a70'], 2, 12, 0.5); });
  H.atlas.paint('e-crest', 128, 128, (g, w, h, T) => { g.fillStyle = '#ece6d6'; g.fillRect(0, 0, w, h); g.strokeStyle = '#3a4a4c'; g.lineWidth = 9; g.beginPath(); g.arc(64, 64, 50, 0, 6.3); g.stroke(); T.text('米', 64, 66, 72, '#3a4a4c', { font: T.SERIF, weight: 900 }); T.blot(w, h, 10, ['#b9b08e', '#8d8a70'], 3, 13, 0.32); });
  H.atlas.paint('e-seed', 128, 192, (g, w, h, T) => { g.fillStyle = '#e4dbb8'; g.fillRect(0, 0, w, h); g.fillStyle = '#b5493f'; g.fillRect(0, 0, w, 40); T.text('種苗', w / 2, 21, 30, '#f6eeda', { font: T.SERIF, weight: 900 }); g.fillStyle = '#7fae7a'; g.beginPath(); g.ellipse(64, 112, 36, 44, 0, 0, 6.3); g.fill(); g.fillStyle = '#d0473a'; g.beginPath(); g.ellipse(64, 112, 20, 24, 0, 0, 6.3); g.fill(); T.blot(w, h, 12, ['#a89a70'], 3, 13, 0.3); });

  H.atlas.paint('e-coop', 256, 128, (g, w, h, T) => { g.fillStyle = '#4c6478'; g.fillRect(0, 0, w, h); g.fillStyle = '#3f5569'; g.fillRect(0, 0, w, 14); T.text('農', 96, 66, 50, '#e6e2d2', { font: T.SERIF, weight: 900 }); T.text('協', 160, 66, 50, '#e6e2d2', { font: T.SERIF, weight: 900 }); T.blot(w, h, 12, ['#7f8e8e', '#5e7384'], 3, 14, 0.4); });

  /* ---- shared props ---- */
  const drum = (st, x, z, col, tip = 0) => { const s2 = st.sub({ pos: [x, tip ? 0.3 : 0, z], rot: [tip, rng() * 3, 0] }); s2.add(kit.cylBase(0.3, 0.3, 0.88, 11), 'worn', { color: col }); for (const y of [0.3, 0.58]) s2.add(kit.cyl(0.315, 0.315, 0.035, 11, true), 'worn', { pos: [0, y, 0], color: '#6f7a7e' }); s2.add(kit.cyl(0.26, 0.26, 0.012, 11), 'worn', { pos: [0, 0.885, 0], color: '#4e5a5e' }); };
  const bamboo = (st, a, b, r = 0.026, col = '#b7c26a') => st.rod(a, b, r, 'flat', col, 5);
  const stone = (st, x, y, z, rx, ry, rz, col = '#a9a596') => st.add(kit.chip(kit.sphere(1, 6, 4), 0.28, rng), 'flat', { pos: [x, y, z], scale: [rx, ry, rz], rot: [0, rng() * 6, 0], color: col });
  const hanging = (st, x, y, z, len, parts) => { for (const p of parts) motion.add(p.g, st.mx({ pos: [x + (p.x || 0), y + (p.y || 0), z + (p.z || 0)], rot: p.rot || [0, 0, 0] }), { color: p.color, uvMap: p.uvMap, dir: p.dir || [1, 0, 0], amp: p.amp ?? 0.1, weight: p.weight, signal: p.signal, freq: p.freq, ph: p.ph ?? rng() * 6, flutter: p.flutter ?? 0.15 }); };
  const atlasUV = (cell, u0 = 0, u1 = 1) => (s, t) => H.atlas.cellUV(cell, lerp(u0, u1, s), t);
  /** Cloth hanging from y=0 down to y=-h, width w across local x. */
  function hangCloth(st, x, y, z, w, h, o = {}) { const g = new THREE.PlaneGeometry(w, h, o.nx ?? 3, o.ny ?? 4); g.translate(0, -h / 2, 0); const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 7 + (o.fold ?? 0)) * 0.03); g.computeVertexNormals(); motion.add(g, st.mx({ pos: [x, y, z], rot: o.rot || [0, 0, 0] }), { color: o.color ?? '#ffffff', uvMap: o.cell ? atlasUV(o.cell, o.u0 ?? 0, o.u1 ?? 1) : undefined, dir: o.dir || [0, 0, 1], amp: o.amp ?? 0.14, weight: (px, py) => Math.pow(clamp(-py / h), 1.5), freq: o.freq ?? 1.6, ph: o.ph ?? rng() * 6, flutter: o.flutter ?? 0.3 }); }
  /** Noren strips, hanging from a rod at y. */
  function noren(st, x0, x1, y, z, cell, drop = 0.7) { const n = Math.max(3, Math.round((x1 - x0) / 0.42)), sw = (x1 - x0) / n; st.rod([x0 - 0.08, y, z], [x1 + 0.08, y, z], 0.022, 'wood', '#6e5038', 5); for (let i = 0; i < n; i++) hangCloth(st, x0 + (i + 0.5) * sw, y, z, sw - 0.02, drop * (0.92 + rng() * 0.14), { cell, u0: i / n, u1: (i + 1) / n, nx: 1, ny: 3, amp: 0.16, ph: i * 0.9, fold: i }); }
  /** A sheet of tin held at one edge, lifting in gusts: hinge along local x at y=0, free edge at y=-len or +len on the wall plane. */
  function looseTin(st, x, y, z, w, len, col, o = {}) { const g = new THREE.PlaneGeometry(w, len, Math.max(2, Math.round(w / 0.16)), 2); g.translate(0, -len / 2, 0); const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, (Math.round((p.getX(i) + w) / 0.16) % 2) * 0.03); g.computeVertexNormals(); motion.add(g, st.mx({ pos: [x, y, z], rot: o.rot || [0, 0, 0] }), { color: col, dir: o.dir || [0, 0, 1], amp: o.amp ?? 0.28, weight: (px, py) => clamp(-py / len), signal: 'gust', ph: o.ph ?? 1, flutter: 0.1 }); }
  const swingBits = (g, st, o) => motion.add(g, st.mx(o.at), { color: o.color, dir: o.dir || [1, 0, 0], amp: o.amp ?? 0.08, weight: o.weight, freq: o.freq ?? 1.1, ph: o.ph ?? rng() * 6, flutter: 0.05 });

  /* ---- buildings ---- */
  const op = (t, x0, x1, y0, y1, o = {}) => ({ t, x0, x1, y0, y1, ...o });
  const rustTints = ['#a24a2e', '#b5522f', '#8a4a34', '#c0704a'], greyTints = ['#8f8f86', '#7f8a86', '#a0a096', '#b5522f'];

  /* e01: Shinonome Works. Three sawteeth, brick to the street, one shutter half up with a sapling walking out of it */
  const e01 = H.build(BY.e01, {
    wall: 'brick', sides: { back: 'tinsheet', right: 'tinsheet' }, band: { type: 'concrete', h: 0.55 }, roof: 'sawtooth', eaveY: 3.3, tints: rustTints, party: ['left', 'right'], props: ['box'],
    sign: { cell: 'works', y: 3.55, w: 3.2, h: 0.56 },
    open: (T) => ({ front: [op('roll', -4.2, -1.5, T.fl, T.fl + 2.75, { openAt: 0.5, graffiti: false }), op('sash', -0.75, 0.75, T.fl + 1.05, T.fl + 2.3, { curtain: false }), op('roll', 1.5, 4.2, T.fl, T.fl + 2.75, { openAt: 0.04, graffiti: true })], back: [-3, 0, 3].map((x) => op('broken', x - 0.7, x + 0.7, T.fl + 1.2, T.fl + 2.3)), left: [], right: [] }),
    decay: { level: 0.55, holes: 2, saplings: 2, bushes: 2, moss: 0.15, vines: [{ side: 'front', cover: 0.55, u0: -4.8, u1: -2.9 }, { side: 'back', cover: 0.8 }] },
  });
  { const f = e01.front, S = e01.S, y = e01.dims.fl;
    // concrete apron, cracked, reaching toward ring road north
    S.box(-4.6, 4.6, -0.1, 0.08, 3.3, 4.6, 'flat', '#b6b2a4');
    // rust staining and a sagging shutter overlay on the half-open door
    const rustPatch = (st, x0, x1, y0, y1) => { st.rect(x0, x1, y0, y1, -0.012, 'flat', P.rust); for (let i = 0, n = Math.round((y1 - y0) / 0.14); i < n; i++) { const yy = y0 + (i + 0.5) * 0.14; st.hbar(x0, x1, yy, yy + 0.03, -0.012, 0.004, 'flat', i % 3 ? P.rustDark : '#a24a2e'); } };
    rustPatch(f, 1.52, 4.18, y + 0.14, y + 2.72); rustPatch(f, -4.18, -1.52, y + 1.7, y + 2.72);
    // sapling come out of the half-open bay, a mound of weeds under the shutter
    e01.sapling(-3, 0.05, 3.6, 2.6); e01.grass(-2.9, 3.9, 1.2, 60, { h: 0.7 });
    // fallen pallets and drums at the sash
    drum(S, -0.55, 4.05, '#7f9a9a'); drum(S, -1.05, 3.72, '#b5522f', 0.08); drum(S, 0.1, 3.72, P.rust);
    // jib beam and chain hoist over the bay: hook sways
    const jx = -2.85; f.beam([jx, 3.9, -0.1], [jx, 3.9, 1.4], 0.14, 0.2, 'worn', '#6f7a7e');
    const chain = new THREE.BoxGeometry(0.045, 1.5, 0.045); chain.translate(0, -0.75, 0);
    swingBits(chain, f, { at: { pos: [jx, 3.8, 1.25] }, color: '#4e5a5e', dir: [1, 0, 0.5], amp: 0.1, weight: (x, py) => clamp(-py / 1.5) });
    const hook = new THREE.TorusGeometry(0.11, 0.035, 5, 10, 4.6); swingBits(hook, f, { at: { pos: [jx, 2.2, 1.25] }, color: '#6f7a7e', dir: [1, 0, 0.5], amp: 0.1, weight: () => 1 });
    // smokestack and roof vents
    S.add(kit.cylBase(0.22, 0.32, 3.4, 10), 'brick', { pos: [-3.9, 3.2, -2.6], color: P.rustLit }); S.add(kit.cyl(0.33, 0.33, 0.14, 10, true), 'flat', { pos: [-3.9, 6.55, -2.6], color: P.concreteMid });
    S.add(kit.cylBase(0.12, 0.14, 0.7, 8), 'worn', { pos: [0.4, 4.7, 1.1], color: P.metal }); S.add(kit.cyl(0.26, 0.18, 0.26, 8), 'worn', { pos: [0.4, 5.4, 1.1], color: P.metalDark });
    // the three-wheeler, its bed full of grass
    const tk = S.sub({ pos: [2.5, 0, 3.92], rot: [0, 0, 0] }), teal = '#6fa39a', tealD = '#558a86';
    tk.box(0.5, 1.28, 0.44, 1.04, -0.56, 0.56, 'worn', teal); tk.box(-1.62, 0.5, 0.42, 0.56, -0.6, 0.6, 'worn', '#6f7a7e');
    tk.quad([1.28, 1.02, -0.5], [1.28, 1.02, 0.5], [1.02, 1.6, 0.46], [1.02, 1.6, -0.46], 'flat', '#2f6e78'); tk.box(0.5, 1.06, 1.58, 1.66, -0.54, 0.54, 'worn', tealD);
    tk.quad([0.5, 1.04, 0.56], [1.28, 1.04, 0.56], [1.02, 1.58, 0.54], [0.5, 1.58, 0.54], 'worn', tealD); tk.quad([0.5, 1.04, -0.56], [0.5, 1.58, -0.54], [1.02, 1.58, -0.54], [1.28, 1.04, -0.56], 'worn', tealD); tk.rect(0.56, 0.98, 1.1, 1.52, 0.565, 'flat', '#2f6e78'); tk.quad([0.5, 1.04, -0.562], [0.5, 1.58, -0.542], [0.5, 1.58, 0.542], [0.5, 1.04, 0.562], 'worn', teal);
    tk.box(0.5, 0.52, 0.56, 1.04, -0.56, 0.56, 'worn', teal); // cab back
    for (const [zz, sg] of [[0.62, 1], [-0.62, -1]]) tk.box(-1.62, 0.5, 0.56, 0.9, zz - 0.02, zz + 0.02, 'worn', teal); tk.box(-1.66, -1.62, 0.56, 0.9, -0.6, 0.6, 'worn', teal); tk.box(-1.1, -1.0, 0.56, 0.95, -0.62, 0.62, 'worn', tealD);
    tk.add(kit.cyl(0.24, 0.24, 0.13, 12), 'flat', { pos: [1.56, 0.24, 0], rot: [Q, 0, 0], color: '#3f4a4e' }); tk.add(kit.torus(0.3, 0.05, 5, 12, 2.4), 'worn', { pos: [1.56, 0.24, 0], rot: [0, 0, 0.35], color: teal }); tk.rod([1.28, 0.8, 0], [1.56, 0.26, 0], 0.035, 'worn', '#6f7a7e', 5); tk.add(kit.sphere(0.1, 8, 5), 'flat', { pos: [1.3, 0.92, 0.3], color: '#d9d2bc' });
    for (const sg of [-1, 1]) tk.add(kit.cyl(0.26, 0.26, 0.13, 12), 'flat', { pos: [-0.9, 0.26, sg * 0.64], rot: [Q, 0, 0], color: '#3f4a4e' });
    tk.box(0.1, 0.34, 0.88, 1.04, -0.5, -0.1, 'flat', '#d9d2bc'); // a dead pennant board on the cab
    e01.grass(1.8, 3.9, 0.5, 24, { y: 0.56, h: 0.55 }); e01.clump([2.3, 0.8, 4.0], 0.3, 0.28, 12, { s: 0.3 }); e01.grass(2.4, 4.2, 1.3, 26, { h: 0.65 });
}

  /* e02: the warehouse, tin all round, one corner opened to the sky, a sheet that lifts in the wind */
  const e02 = H.build(BY.e02, {
    wall: 'tinsheet', wallCol: '#8f9896', roof: 'tin', shape: 'gable', ridge: 'z', pitch: 0.3, tints: rustTints, party: ['left'], sign: { cell: 'ware', y: 3.05, w: 2.2, h: 0.48 }, props: ['drain'],
    open: (T) => ({ front: [op('roll', -1.5, 1.5, T.fl, T.fl + 2.5, { openAt: 0.3, graffiti: false })], back: [], left: [], right: [op('sash', -0.8, 0.8, T.fl + 1.3, T.fl + 2.1)] }),
    decay: { level: 0.82, holes: 2, sag: 0.28, collapse: { corner: 'br', r: 1.8 }, saplings: 1, bushes: 2, vines: [{ side: 'right', cover: 0.7 }, { side: 'front', cover: 0.4, u0: 0.8, u1: 2.3 }] },
  });
  { const f = e02.front, S = e02.S;
    // pallets stacked at the open door, a sack hoist, one loose sheet on the east wall
    for (let i = 0; i < 4; i++) { const y = 0.05 + i * 0.16, c = i % 2 ? '#c8a884' : '#b89a72'; for (let k = 0; k < 5; k++) S.box(0.85 + k * 0.22, 0.85 + k * 0.22 + 0.16, y, y + 0.06, 3.5, 4.5, 'wood', c); S.box(0.8, 1.98, y + 0.07, y + 0.12, 3.5, 4.5, 'wood', c); }
    looseTin(e02.right, 1.2, e02.dims.eaveY - 0.15, 0.1, 1, 1.6, '#b5522f', { ph: 2.1 });
    f.box(-2.3, -2.05, 0, 2.5, -0.1, 0.1, 'worn', '#6f7a7e'); // bent column of the old canopy
    e02.grass(0, 3.9, 1.6, 30, { h: 0.6 }); }

  /* e03: the water tower */
  const e03 = H.build(BY.e03, { party: ['left', 'right'], decay: { level: 0.5, bushes: 2 } });
  { const S = e03.S, r = Math.min(1.25, BY.e03.w * 0.45), legH = BY.e03.h - 2.3 - 0.5;
    // painted works name around the tank, turned to the sun side
    const g = new THREE.CylinderGeometry(r + 0.018, r + 0.018, 1.5, 12, 1, true, Q * 0.2, Q * 1.6); H.atlas.uvTo(g, 'e-tank'); S.add(g, 'atlas', { pos: [0, legH + 1.25, 0] });
    // a catwalk with a sagging rail, a hose hanging from it
    const cw = r + 0.55; S.add(kit.torus(cw, 0.035, 5, 28), 'worn', { pos: [0, legH + 0.9, 0], rot: [Q, 0, 0], color: '#7d3a2a' });
    for (let i = 0; i < 12; i++) { if (i === 8) continue; const a = (i / 12) * TAU; S.rod([Math.cos(a) * r, legH + 0.14, Math.sin(a) * r], [Math.cos(a) * cw, legH + 0.14, Math.sin(a) * cw], 0.024, 'worn', '#6f7a7e', 4); S.rod([Math.cos(a) * cw, legH + 0.14, Math.sin(a) * cw], [Math.cos(a) * cw, legH + 0.9, Math.sin(a) * cw], 0.018, 'worn', '#7d3a2a', 4); }
    const ph0 = 2.4, hose = new THREE.CylinderGeometry(0.03, 0.03, 3.8, 5, 6); hose.translate(0, -1.9, 0);
    motion.add(hose, S.mx({ pos: [Math.cos(ph0) * (r + 0.1), legH - 0.1, Math.sin(ph0) * (r + 0.1)] }), { color: '#4e5a5e', dir: [1, 0, 0.4], amp: 0.22, weight: (x, py) => Math.pow(clamp(-py / 3.8), 1.4), freq: 0.9, ph: 1.1, flutter: 0.1 });
    e03.clump([0.2, legH + 2.9, 0.1], 0.95, 0.5, 26, { s: 0.3 }); e03.clump([-0.5, legH + 2.5, 0.8], 0.6, 0.6, 16, { s: 0.28 }); }

  /* e04: the works office, a concrete box with a steel stair to the roof and a tank nobody emptied */
  const e04 = H.build(BY.e04, { wall: 'concrete', wallCol: '#c6c5ba', roof: 'flat', foundationH: 0.14, props: ['ac', 'meter', 'drain'], decay: { level: 0.42, holes: 1, saplings: 1, bushes: 3, vines: [{ side: 'left', cover: 0.75 }, { side: 'back', cover: 0.5 }] }, open: (T) => ({ front: [op('door', -1.3, -0.4, T.fl, T.fl + 2.05, { col: '#6f9fb0' }), op('sash', 0.1, 1.35, T.fl + 0.82, T.fl + 2.1, { curtain: true })], back: [op('sash', -0.7, 0.7, T.fl + 1, T.fl + 2, { curtain: false })], left: [op('sash', -0.6, 0.6, T.fl + 1, T.fl + 2)], right: [op('broken', -0.6, 0.6, T.fl + 1, T.fl + 2)] }) });
  { const { S, front: f, left: l } = e04;
    H.props.sign(f, 'e-safe', 1.5, 0.76, { pos: [0.7, 2.6, 0.06], board: '#4e5a5e', t: 0.04 });
    // steel stair on the east side
    const st = l, c = '#7d8b90'; for (let i = 0; i < 8; i++) { const yy = 0.32 + i * 0.36, x = 1.1 - i * 0.26; st.box(x - 0.15, x + 0.15, yy, yy + 0.04, 0.08, 0.5, 'worn', c); }
    for (const z of [0.08, 0.5]) { st.beam([1.2, 0, z], [-0.95, 3.1, z], 0.07, 0.13, 'worn', P.rustDark); st.beam([1.2, 1.05, z], [-0.95, 4.1, z], 0.03, 0.03, 'worn', c); }
    // roof tank and antenna
    S.add(kit.cylBase(0.5, 0.5, 0.9, 12), 'worn', { pos: [-0.8, 3.0, 0.2], color: '#a8b4b4' }); S.add(kit.cyl(0.53, 0.53, 0.04, 12, true), 'worn', { pos: [-0.8, 3.5, 0.2], color: '#6f7a7e' });
    S.beam([0.9, 3.4, -0.9], [1.05, 5.3, -1.05], 0.04, 0.04, 'worn', P.metalDark); S.beam([0.72, 4.9, -0.88], [1.28, 4.9, -1.18], 0.02, 0.02, 'worn', P.metalDark); S.beam([0.78, 4.45, -0.9], [1.24, 4.45, -1.14], 0.02, 0.02, 'worn', P.metalDark);
    // safety pennant on the roof corner
    hangCloth(S, 1.0, 4.7, -0.98, 0.62, 0.42, { color: '#d9d2bc', rot: [0, 0.6, 0], dir: [0, 0, 1], amp: 0.2, flutter: 0.4, ph: 0.3 });
    e04.sapling(-1, 3.0, -0.9, 1.3);
    // the stair head on the roof: a little concrete hut with a steel door, the tallest thing on the building
    { const q = S.sub({ pos: [0.2, 3.0, -0.7] }), c0 = '#b9b8ac'; q.box(-0.55, 0.55, 0, 1.5, -0.55, 0.55, 'concrete', c0); q.box(-0.68, 0.68, 1.5, 1.6, -0.68, 0.68, 'concrete', '#d3d1c4'); q.box(-0.6, -0.56, 0.05, 1.3, -0.3, 0.3, 'flat', '#3a4a4e'); q.box(-0.62, -0.56, 0.08, 1.26, -0.26, 0.26, 'worn', '#6f9fb0'); q.box(-0.65, -0.62, 0.62, 0.72, 0.12, 0.2, 'worn', P.metalDark); q.box(-0.1, 0.1, 0.98, 1.22, -0.58, -0.55, 'flat', '#d9d2bc'); q.box(-0.72, -0.5, 1.5, 1.42, -0.42, 0.42, 'worn', '#7d8b90');
      e04.clump([0.1, 4.68, -0.9], 0.42, 0.14, 12, { s: 0.24, core: false }); }
    // a tin awning over the back window, the one face the street ever saw, and a downpipe beside it
    { const b2 = e04.back, ay = e04.dims.fl + 2.3; for (let i = 0; i < 9; i++) { const x0 = -1 + i * 0.222; b2.quad([x0, ay, 0.02], [x0 + 0.222, ay, 0.02], [x0 + 0.222, ay - 0.3, 0.56], [x0, ay - 0.3, 0.56], 'worn', i % 2 ? '#8fa8a4' : '#7d9896'); } b2.box(-1.02, 1, ay - 0.35, ay - 0.3, 0.52, 0.58, 'worn', P.rustDark); for (const x of [-0.96, 0.94]) b2.rod([x, ay - 0.02, 0.03], [x, ay - 0.32, 0.54], 0.018, 'worn', P.metalDark, 4); b2.rod([1.5, 0.1, 0.06], [1.5, 3.3, 0.06], 0.04, 'worn', '#8f9a9a', 6); b2.box(-0.8, 0.8, 0, 0.14, 0, 0.5, 'concrete', P.concreteMid); } }

  const later = []; // greenery that needs the zone anchor (e07), queued until it exists
  /* e05: the big thatched house. Engawa, strings of drying persimmon under the eaves, a noren still up */
  const e05 = H.build(BY.e05, {
    wall: 'plaster', wallCol: '#e7dcc4', band: { type: 'board', h: 0.95 }, roof: 'thatch', shape: 'hip', ridge: 'x', pitch: 1.05, timbers: true, foundationH: 0.42, eaveY: 2.5, props: ['drain', 'gas', 'crates'],
    open: (T) => ({ front: [op('sliding', -3.4, -1.7, T.fl, T.fl + 1.82), op('shoji', -1.5, 0.7, T.fl + 0.08, T.fl + 1.82), op('shoji', 0.85, 2.5, T.fl + 0.08, T.fl + 1.82), op('lattice', 2.75, 3.55, T.fl + 0.82, T.fl + 1.7)], back: [op('sliding', -2.6, -1.1, T.fl, T.fl + 1.82), op('sash', 0.2, 1.2, T.fl + 0.95, T.fl + 1.75), op('broken', 2, 3, T.fl + 0.95, T.fl + 1.75)], left: [op('lattice', -1, 1, T.fl + 0.85, T.fl + 1.65)], right: [op('shoji', -0.9, 0.9, T.fl + 0.1, T.fl + 1.8)] }),
    decay: { level: 0.32, holes: 1, moss: 0.05, saplings: 1, bushes: 3, vines: [{ side: 'left', cover: 0.5 }, { side: 'back', cover: 0.28, u0: 2.2, u1: 3.8 }] },
  });
  { const f = e05.front, S = e05.S, fl = e05.dims.fl;
    // engawa
    f.box(-1.55, 2.7, fl - 0.12, fl - 0.04, 0, 0.82, 'wood', '#c8a884'); for (let x = -1.3; x < 2.7; x += 0.3) f.vbar(x - 0.008, x + 0.008, fl - 0.12, fl - 0.04, 0.82, 0.84, 'wood', '#86664c');
    for (const x of [-1.5, 0.4, 2.65]) { f.box(x - 0.05, x + 0.05, 0, fl - 0.12, 0.72, 0.82, 'wood', '#7a5c46'); f.box(x - 0.05, x + 0.05, fl - 0.04, 2.25, 0.74, 0.82, 'wood', '#7a5c46'); }
    f.box(-1.6, 2.72, 2.2, 2.32, 0.68, 0.84, 'wood', '#86664c');
    noren(f, -3.34, -1.78, fl + 1.84, 0.14, 'e-coop', 0.62); // the farm co-op's cloth, the only shop this house ever kept
    // hoshigaki: four strings of drying persimmon, swaying
    for (const [x, n] of [[-1.05, 7], [-0.55, 8], [0.75, 8], [1.3, 6], [1.85, 7]]) {
      const len = n * 0.17; const string = new THREE.CylinderGeometry(0.008, 0.008, len, 3, 1); string.translate(0, -len / 2, 0); const ph = x * 2.2;
      motion.add(string, f.mx({ pos: [x, 2.16, 0.58] }), { color: '#c9b06a', dir: [1, 0, 0.3], amp: 0.05, weight: (_, py) => clamp(-py / len), ph, freq: 1.3 });
      for (let i = 0; i < n; i++) { const s = kit.ico(0.056 + (i % 2) * 0.008, 1); const yy = 2.16 - (i + 0.6) * 0.17; motion.add(s, f.mx({ pos: [x + (i % 2 ? 0.016 : -0.016), yy, 0.58] }), { color: i % 5 === 4 ? '#e8743a' : '#f59a3a', dir: [1, 0, 0.3], amp: 0.05 * (2.16 - yy) / len + 0.002, weight: () => 1, ph, freq: 1.3 }); }
    }
    // a stone well in the open yard, west of the tool shed
    { const r = W.sub({ pos: [BY.e07.x - 3.4, 0, BY.e07.z - 0.4] }), wx = 0, wz = 0; for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; r.box(wx + Math.cos(a) * 0.5 - 0.16, wx + Math.cos(a) * 0.5 + 0.16, 0, 0.62 + (i % 3) * 0.04, wz + Math.sin(a) * 0.5 - 0.11, wz + Math.sin(a) * 0.5 + 0.11, 'flat', ['#a9a596', '#b9b5a8', '#8b8f8a'][i % 3]); } r.add(kit.cylBase(0.42, 0.42, 0.08, 12), 'flat', { pos: [wx, 0.45, wz], color: '#3a5a60' });
      r.rod([wx - 0.55, 0, wz], [wx - 0.55, 1.5, wz], 0.04, 'wood', '#7a5c46', 5); r.rod([wx + 0.55, 0, wz], [wx + 0.55, 1.5, wz], 0.04, 'wood', '#7a5c46', 5); r.beam([wx - 0.62, 1.5, wz], [wx + 0.62, 1.5, wz], 0.06, 0.09, 'wood', '#6e5038');
      const pail = new THREE.CylinderGeometry(0.09, 0.075, 0.13, 8); pail.translate(0, -0.56, 0); const rope = new THREE.CylinderGeometry(0.008, 0.008, 0.5, 3, 1); rope.translate(0, -0.25, 0);
      for (const [g, c] of [[rope, '#c9b06a'], [pail, '#a98a6a']]) motion.add(g, r.mx({ pos: [wx, 1.45, wz] }), { color: c, dir: [1, 0, 0.4], amp: 0.08, weight: () => 1, freq: 1.2, ph: 2 });
      r.add(kit.chip(kit.sphere(0.5, 7, 4), 0.3, rng), 'flat', { pos: [wx + 0.95, 0.04, wz + 0.2], scale: [1, 0.3, 0.7], color: '#a39a88' }); later.push(() => grassW(BY.e07.x - 3.4, 0.05, BY.e07.z - 0.4, 0.9, 46, 0.6)); }
    // a kamado chimney through the thatch back
    S.add(kit.cylBase(0.13, 0.16, 1.3, 8), 'worn', { pos: [1.3, 3.5, -1.1], color: P.metalDark }); S.add(kit.cylBase(0.22, 0.13, 0.13, 8), 'worn', { pos: [1.3, 4.8, -1.1], color: P.metal });
    e05.clump([-2.3, 4.05, 0.5], 0.55, 0.32, 20, { s: 0.3 }); e05.grass(-1.2, 1.1, 0.6, 16, { y: 4.1, h: 0.5 }); }

  /* e06: the kura. Thick white plaster, a namako skirt, a big door a hand's width open, a fallen plaster patch showing the bamboo lath */
  const e06 = H.build(BY.e06, { wall: 'plaster', wallCol: '#ece6d6', band: { type: 'namako', h: 1.05 }, roof: 'kawara', pitch: 0.52, es: 0.22, ef: 0.3, eb: 0.3, thick: true, foundationH: 0.32, props: ['drain'], decay: { level: 0.2, holes: 0, moss: 0.4, saplings: 0, bushes: 2, vines: [{ side: 'right', cover: 0.3, u0: -1.6, u1: -0.2 }] }, open: (T) => ({ front: [op('bars', -0.4, 0.4, T.eaveY - 1.05, T.eaveY - 0.42)], back: [], left: [op('bars', -0.4, 0.4, T.eaveY - 1.05, T.eaveY - 0.42)], right: [op('bigdoor', -0.15, 1.05, T.fl, T.fl + 1.9, { col: '#5a5247' })] }) });
  { const f = e06.front, r = e06.right, b = e06.back, fl = e06.dims.fl, ey = e06.dims.eaveY;
    // a heavy plaster leaf standing ajar
    const cls = r.sub({ pos: [1.05, fl, 0.06], rot: [0, 0.55, 0] }); cls.box(-1.2, 0, 0, 1.9, 0, 0.2, 'plaster', '#d9d2bc'); cls.box(-1.1, -0.1, 0.1, 1.8, 0.2, 0.22, 'flat', '#b5ab90');
    // a small tiled pent over the door, on two black brackets
    r.box(-0.4, 1.3, fl + 2.08, fl + 2.14, 0, 0.5, 'wood', '#4e4a44'); for (let i = 0; i < 6; i++) { const x0 = -0.42 + i * 0.32; r.quad([x0, fl + 2.34, 0.02], [x0 + 0.32, fl + 2.34, 0.02], [x0 + 0.32, fl + 2.12, 0.58], [x0, fl + 2.12, 0.58], 'flat', i % 2 ? '#7f8f9c' : '#70808d'); }
    // fallen patch: lath behind, chunks at the foot
    const pts = [[-1.3, 1.25], [-0.5, 1.2], [-0.32, 1.95], [-0.8, 2.3], [-1.35, 2.05]]; for (let i = 1; i < pts.length - 1; i++) r.quad([pts[0][0], pts[0][1], 0.03], [pts[i][0], pts[i][1], 0.03], [pts[i + 1][0], pts[i + 1][1], 0.03], [pts[i + 1][0], pts[i + 1][1], 0.03], 'flat', '#b89f74');
    for (let i = 0; i < 7; i++) { const x = lerp(-1.25, -0.38, i / 6); r.beam([x, 1.27, 0.04], [x + 0.03, 2.2, 0.04], 0.03, 0.02, 'flat', '#7a6a52'); } for (let i = 0; i < 6; i++) { const y = 1.3 + i * 0.16; r.beam([-1.25, y, 0.05], [-0.4, y, 0.05], 0.02, 0.02, 'flat', '#8a7a5a'); }
    e06.rubble(1.9, 0.85, 0.25, 0.4, 4);
    // crest under the gable on the sun side
    H.props.sign(b, 'e-crest', 0.78, 0.78, { pos: [0, Math.min(ey - 0.5, 3), 0.06], board: '#ece6d6', t: 0.02 });
    // two granite steps
    for (let i = 0; i < 2; i++) r.box(-0.4 + i * 0.1, 1.3 - i * 0.1, i * 0.14, (i + 1) * 0.14, 0, 0.72 - i * 0.2, 'flat', '#b9b5a8'); }

  /* e07: tool shed, walls of tin, a little tiller left mid-furrow, a sheet of the roof shifting */
  const e07 = H.build(BY.e07, { wall: 'tinsheet', wallCol: '#8d8270', roof: 'tin', shape: 'mono', tints: greyTints, pitch: 0.36, foundationH: 0.1, props: ['gas'], decay: { level: 0.6, holes: 2, saplings: 1, bushes: 2, vines: [{ side: 'back', cover: 0.7 }] }, open: (T) => ({ front: [op('door', -1.5, -0.4, T.fl, T.fl + 1.9, { col: '#8d8270' }), op('roll', 0.2, 1.7, T.fl, T.fl + 2, { openAt: 0.5, graffiti: false })], back: [], left: [], right: [op('broken', -0.5, 0.5, T.fl + 1, T.fl + 1.7)] }) });
  { const f = e07.front, S = e07.S;
    // walk-behind tiller
    const t = S.sub({ pos: [0.95, 0, 2.7], rot: [0, 0.25, 0] }); t.box(-0.32, 0.32, 0.26, 0.62, -0.34, 0.34, 'worn', '#6fa39a'); t.add(kit.cyl(0.27, 0.27, 0.16, 10), 'flat', { pos: [0, 0.28, -0.42], rot: [Q, 0, 0], color: '#3f4a4e' }); t.add(kit.cyl(0.27, 0.27, 0.16, 10), 'flat', { pos: [0, 0.28, 0.42], rot: [Q, 0, 0], color: '#3f4a4e' });
    t.rod([0, 0.6, -0.1], [-0.9, 1.25, -0.5], 0.028, 'worn', P.metal, 5); t.rod([0, 0.6, 0.1], [-0.9, 1.25, 0.5], 0.028, 'worn', P.metal, 5); t.beam([-0.9, 1.25, -0.5], [-0.9, 1.25, 0.5], 0.04, 0.04, 'worn', P.metal); t.box(0.1, 0.55, 0.6, 0.86, -0.24, 0.24, 'worn', '#c0704a');
    e07.grass(0.95, 2.7, 0.8, 20, { h: 0.65 });
    // roof sheet coming loose, on the high side
    looseTin(e07.back, 0.4, e07.dims.h - 0.4, 0.05, 1.05, 1.5, P.rust, { ph: 4.1 }); }

  /* e08: the second farmhouse, further gone: the thatch has fallen in on one side, a tarp nobody came back to tighten */
  const e08 = H.build(BY.e08, {
    wall: 'board', band: { type: 'board', h: 0.9 }, roof: 'thatch', shape: 'hip', ridge: 'x', pitch: 1.0, foundationH: 0.38, eaveY: 2.35, props: ['drain', 'pots'], timbers: true,
    open: (T) => ({ front: [op('sliding', -3, -1.5, T.fl, T.fl + 1.82), op('broken', -1.1, 0.5, T.fl + 0.1, T.fl + 1.82), op('boarded', 0.9, 2.5, T.fl + 0.1, T.fl + 1.82)], back: [op('door', -2.7, -1.8, T.fl, T.fl + 1.8), op('broken', -0.6, 0.6, T.fl + 0.9, T.fl + 1.7)], left: [op('sash', -0.5, 0.5, T.fl + 0.9, T.fl + 1.6)], right: [op('boarded', -1, 1, T.fl + 0.1, T.fl + 1.8)] }),
    decay: { level: 0.78, holes: 3, sag: 0.34, moss: 0.3, saplings: 2, bushes: 3, vines: [{ side: 'front', cover: 0.55 }, { side: 'right', cover: 0.7 }] },
  });
  { const R = e08.S, f = e08.front, b = BY.e08, ey = e08.dims.eaveY, X = b.w / 2 + 0.5, Z = b.d / 2 + 0.5;
    // the tarp: laid over the back slope, roped down, its loose hem lifting
    const thatchY = (zL) => { const t = clamp((Z - 0.1 - Math.abs(zL)) / (Z - 0.2)); return lerp(ey + 0.26, b.h, Math.pow(t, 0.92)); };
    const nx = 12, nz = 8, tx0 = -1.2, tx1 = 1.6, tz0 = -0.5, tz1 = -Z + 0.4, g = new THREE.BufferGeometry(), P2 = [], I = [], UV = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const rim = i === 0 || i === nx || j === 0 || j === nz, zig = rim ? (((i + j) % 2 ? 0.1 : -0.07) + (rng() - 0.5) * 0.12) : 0, x = lerp(tx0, tx1, i / nx) + 0.06 * Math.sin(j * 1.4 + i) + (i === 0 ? -zig : i === nx ? zig : 0), z = lerp(tz0, tz1, j / nz) + (j === 0 ? zig : j === nz ? -zig : 0); P2.push(x, thatchY(z) + 0.14 + 0.09 * Math.sin(i * 1.3 + j) * Math.cos(j * 0.8 + i * 0.5) + (rim ? 0.03 * Math.sin(i * 2.7 + j * 1.9) : 0), z); UV.push(i / nx, j / nz); }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b2 = a + 1, c = a + nx + 1, d = c + 1; I.push(a, c, b2, b2, c, d); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(P2, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setIndex(I); g.computeVertexNormals();
    const foldAt = (x, z) => Math.sin(x * 4.4 + z * 1.7 + 0.6) + 0.6 * Math.sin(z * 7.3 - x * 2.3);
    motion.add(g, R.mx({}), { color: '#74889c', shadeAt: (x, y, z) => { const n = foldAt(x, z); return n > 0.72 ? 1.14 : n < -0.55 ? 0.76 : 1; }, dir: [0, 1, 0], amp: 0.07, weight: (x, y, z) => sq(clamp((z - tz0) / (tz1 - tz0))) * (0.5 + 0.5 * Math.sin((x - tx0) * 2.2)), freq: 1.4, ph: 0.7, flutter: 0.25 });
    const ropeC = '#b9ad86', ropeY = (z, v) => thatchY(z) + 0.27 + 0.08 * v * v;
    for (const x of [-0.82, 0.22, 1.24]) { const pts = []; for (let i = 0; i <= 6; i++) { const v = i / 6, z = lerp(tz0 + 0.14, tz1 - 0.02, v); pts.push([x + 0.05 * Math.sin(v * 5), ropeY(z, v), z]); } R.tube(pts, 0.02, 0.02, 'flat', ropeC, 3, 8); R.beam(pts[6], [x + 0.1, 0.5, -b.d / 2 - 0.7], 0.022, 0.022, 'flat', ropeC); R.add(kit.ico(0.14, 0), 'flat', { pos: [x + 0.1, 0.42, -b.d / 2 - 0.7], color: '#a39a88' }); }
    { const z = lerp(tz0, tz1, 0.5), yy = ropeY(z, 0.5) + 0.01; R.tube([[tx0 - 0.1, yy - 0.06, z + 0.05], [(tx0 + tx1) / 2, yy, z - 0.03], [tx1 + 0.1, yy - 0.06, z + 0.04]], 0.018, 0.018, 'flat', ropeC, 3, 6); }
    // the veranda post collapsing, laundry forgotten on a bamboo pole in the yard
    f.box(-1.1, 0.5, 0.06, 0.14, 0, 0.5, 'wood', '#86664c');
    const yard = e08.back; bamboo(yard, [-2, 1.72, 1.45], [1.7, 1.68, 1.5], 0.024); for (const x of [-2, 1.7]) { yard.rod([x, 0, 1.42], [x, 1.78, 1.45], 0.03, 'wood', '#86664c', 5); yard.rod([x - 0.2, 1.42, 1.45], [x + 0.2, 1.74, 1.45], 0.02, 'wood', '#86664c', 4); }
    hangCloth(yard, -1.05, 1.68, 1.5, 0.76, 1.05, { cell: 'stripe2', ph: 0.2, flutter: 0.3 }); hangCloth(yard, -0.02, 1.68, 1.5, 0.66, 0.92, { cell: 'sheet', ph: 1.2, flutter: 0.3 }); hangCloth(yard, 0.88, 1.66, 1.5, 0.6, 1.14, { cell: 'futon', ph: 2.4, flutter: 0.25 });
    // a shed stove pipe, bucket, a path of stones to the road
    H.props.pots(f, -3.2, 2, rng); for (let i = 0; i < 6; i++) stone(f, -1.8 - i * 0.25, 0.06, 0.8 + i * 0.5, 0.26, 0.08, 0.2, i % 2 ? '#b9b5a8' : '#a9a596'); }

  /* e09: the barn. Silver boards, a hay door hanging off one hinge, and a rack of rice sheaves still up */
  const e09 = H.build(BY.e09, { wall: 'boardv', wallCol: '#a89a82', roof: 'tin', pitch: 0.55, tints: rustTints, foundationH: 0.14, props: ['drain'], decay: { level: 0.5, holes: 1, saplings: 1, bushes: 2, vines: [{ side: 'left', cover: 0.6 }] }, open: (T) => ({ front: [op('bigdoor', -0.95, 0.95, T.fl, T.fl + 2.3, { col: '#8d8270' })], back: [], left: [op('broken', -0.4, 0.4, T.fl + 1.5, T.fl + 2.05)], right: [] }) });
  { const f = e09.front, S = e09.S, y = e09.dims.eaveY - 0.15;
    // the hay door, up in the gable end over the rack, hanging off one hinge, and the beam they hoisted the bales on
    { const r2 = e09.right, top = e09.dims.h - 0.42, y0 = top - 0.72, hw = 0.4, c = '#6e5a48'; r2.rect(-hw, hw, y0, top, 0.012, 'flat', '#3e4c4e'); r2.box(-hw - 0.07, hw + 0.07, top, top + 0.07, 0, 0.05, 'wood', c); r2.box(-hw - 0.07, hw + 0.07, y0 - 0.07, y0, 0, 0.07, 'wood', c); for (const sg of [-1, 1]) r2.box(sg * (hw + 0.035) - 0.035, sg * (hw + 0.035) + 0.035, y0, top, 0, 0.05, 'wood', c);
      const dr = r2.sub({ pos: [-hw, y0 + 0.02, 0.06], rot: [0.1, -1.95, -0.06] }); dr.box(0, 0.8, 0, 0.68, 0, 0.04, 'wood', '#b9a784'); for (const yy of [0.14, 0.52]) dr.box(0.03, 0.77, yy, yy + 0.06, 0.04, 0.06, 'wood', '#8d7a5e');
      r2.beam([0, e09.dims.h - 0.2, -0.1], [0, e09.dims.h - 0.2, 0.75], 0.09, 0.11, 'wood', '#5e4a3c'); r2.add(kit.torus(0.07, 0.018, 4, 10), 'worn', { pos: [0, e09.dims.h - 0.34, 0.66], color: P.metalDark }); r2.rod([0, e09.dims.h - 0.3, 0.66], [0.04, 1.75, 0.68], 0.009, 'flat', '#c9b06a', 3); }
    // hazagi rack: bamboo rails on tripods, bundles of straw hanging over them, along the south side
    const r = e09.right; for (const [x0, y0] of [[-1.6, 0], [1.6, 0]]) { for (const dz of [-0.35, 0.35]) r.rod([x0, 0, 1 + dz], [x0, 1.55, 1], 0.03, 'wood', '#a89a70', 4); r.rod([x0, 0, 1], [x0, 1.55, 1], 0.03, 'wood', '#a89a70', 4); }
    for (const y1 of [1.05, 1.4]) bamboo(r, [-1.9, y1, 1], [1.9, y1 + 0.02, 1], 0.024, '#c0c47a');
    for (let i = 0; i < 12; i++) { const x = -1.6 + (i + 0.5) * 3.2 / 12; for (const sg of [-1, 1]) r.add(kit.cylBase(0.09, 0.22, 0.6, 6), 'flat', { pos: [x + sg * 0.02, 0.52, 1 + sg * 0.1], rot: [sg * 0.26, 0, 0], color: i % 3 ? '#d6b86e' : '#c6a65e' }); }
    e09.grass(0, 0.7, 2, 20, { h: 0.5 }); }

  /* e10: the crossing-keeper's hut: a railway lamp at the door, a bench that still faces the line */
  const e10 = H.build(BY.e10, { wall: 'board', roof: 'kawara', shape: 'gable', ridge: 'x', pitch: 0.55, es: 0.28, ef: 0.5, eb: 0.3, timbers: false, props: ['pots', 'meter'], decay: { level: 0.34, holes: 0, moss: 0.55, saplings: 0, bushes: 3, vines: [{ side: 'left', cover: 0.45 }, { side: 'back', cover: 0.35 }] }, open: (T) => ({ front: [op('sliding', -0.9, 0.7, T.fl, T.fl + 1.95), op('sash', 0.95, 1.5, T.fl + 0.95, T.fl + 1.75, { curtain: true })], back: [op('sash', -0.5, 0.5, T.fl + 0.9, T.fl + 1.7)], left: [], right: [op('sash', -0.5, 0.5, T.fl + 1, T.fl + 1.7)] }) });
  { const f = e10.front, S = e10.S, fl = e10.dims.fl;
    // lamp on a bracket, swinging slightly
    const bracket = f.sub({ pos: [1, 2.3, 0.1] }); bracket.box(-0.03, 0.03, -0.2, 0.2, -0.08, 0, 'worn', P.metalDark); bracket.beam([0, 0.18, 0], [0, 0.18, 0.5], 0.04, 0.04, 'worn', P.metalDark);
    const lamp = kit.cylBase(0.13, 0.1, 0.34, 6); lamp.translate(0, -0.36, 0); motion.add(lamp, f.mx({ pos: [1, 2.48, 0.6] }), { color: P.rust, dir: [1, 0, 0.2], amp: 0.05, weight: () => 1, freq: 1.3, ph: 0.9 }); const glass = kit.sphere(0.075, 6, 4); glass.translate(0, -0.2, 0); motion.add(glass, f.mx({ pos: [1, 2.48, 0.6] }), { color: P.fadedRed, dir: [1, 0, 0.2], amp: 0.05, weight: () => 1, freq: 1.3, ph: 0.9 });
    // bench and a stack of old sleepers
    { const bk = e10.back; bk.box(-0.55, 0.55, 0.42, 0.48, 0.06, 0.41, 'wood', '#c8a884'); bk.box(-0.5, -0.4, 0, 0.42, 0.08, 0.39, 'wood', '#86664c'); bk.box(0.4, 0.5, 0, 0.42, 0.08, 0.39, 'wood', '#86664c'); }
    for (let i = 0; i < 3; i++) for (let k = 0; k < 3 - i; k++) S.box(1.85 + k * 0.32 + i * 0.16, 2.11 + k * 0.32 + i * 0.16, i * 0.2, i * 0.2 + 0.2, -0.7, 1.05, 'wood', '#5e4a3c');
    e10.grass(2.6, -0.2, 0.7, 16, { h: 0.6 }); }

  /* e11: the kitchen rows' tool shed. Seed packets on a nail, bamboo stood against the wall */
  const e11 = H.build(BY.e11, { wall: 'boardv', wallCol: '#bcae96', roof: 'tin', shape: 'mono', tints: greyTints, pitch: 0.4, foundationH: 0.1, props: ['pots'], decay: { level: 0.46, holes: 1, saplings: 0, bushes: 2, vines: [{ side: 'left', cover: 1, u0: -1.25, u1: 1.25 }, { side: 'right', cover: 0.5, u0: -1.2, u1: 0.1 }] }, open: (T) => ({ front: [op('door', -0.9, -0.05, T.fl, T.fl + 1.85, { col: '#7d8b90' }), op('sash', 0.3, 1.1, T.fl + 0.95, T.fl + 1.6, { curtain: false })], back: [op('sash', 0.45, 1.25, T.fl + 0.95, T.fl + 1.6, { curtain: false })], left: [], right: [] }) });
  e11.ivy('left', 1, { u0: -0.45, u1: 0.55 });
  { const f = e11.front; H.props.sign(f, 'e-seed', 0.3, 0.45, { pos: [0.7, 0.72, 0.03], board: '#c8a884', t: 0.012 });
    for (let i = 0; i < 6; i++) bamboo(f, [-1.4 + i * 0.1, 0, 0.5 - i * 0.04], [-1.35 + i * 0.07, 2.0 + (i % 2) * 0.3, 0.05], 0.022, i % 2 ? '#b7c26a' : '#a8b45a');
    f.add(kit.cylBase(0.15, 0.12, 0.3, 8), 'worn', { pos: [0.1, 0, 0.45], color: '#6f9fb0' }); f.rod([0.25, 0.26, 0.45], [0.46, 0.36, 0.45], 0.012, 'worn', '#6f9fb0', 4);
    // on the long back wall, a lean-to for the firewood: tin on two poles, the stack still under it
    { const k = e11.back, x0 = -1.4, x1 = 0.2, n = 7, dx = (x1 - x0) / n; for (let i = 0; i < n; i++) k.quad([x0 + i * dx, 1.95, 0.02], [x0 + (i + 1) * dx, 1.95, 0.02], [x0 + (i + 1) * dx, 1.5, 0.98], [x0 + i * dx, 1.5, 0.98], 'worn', i % 3 === 1 ? '#b5522f' : i % 2 ? '#8f8f86' : '#7f8a86'); for (const x of [x0 + 0.08, x1 - 0.08]) { k.rod([x, 0, 0.92], [x, 1.52, 0.92], 0.04, 'wood', '#86664c', 5); k.rod([x, 1.5, 0.92], [x, 1.9, 0.08], 0.022, 'wood', '#6e5038', 4); }
      for (let row = 0; row < 3; row++) for (let i = 0; i < 6 - row; i++) { const z = 0.28 + row * 0.03; k.rod([x0 + 0.2 + (i + row * 0.5) * 0.23, 0.14 + row * 0.2, z], [x0 + 0.2 + (i + row * 0.5) * 0.23, 0.14 + row * 0.2, z + 0.42], 0.09, 'wood', (i + row) % 2 ? '#a98a6a' : '#8c6e52', 5); } } }

  /* ---- the paddies: soil cross-sections stitched along z, one tier per contour ---- */
  const A = e07, invA = A.S.m.clone().invert();
  const toA = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(invA);
  const grassW = (x, y, z, r, n, h = 0.55) => { const c = toA(x, 0, z); A.grass(c.x, c.z, r, n, { y, h }); };
  const clumpW = (x, y, z, rx, ry, n, o) => A.clump(toA(x, y, z).toArray(), rx, ry, n, o);
  later.forEach((fn) => fn());
  const zone = RING_ZONES.paddies, soil = createSoup(), rP = ctx.seeded('east-paddies');
  const N = 6, RISE = 0.42, CREST = 0.24, BW = 0.34, y0T = 0.1, step = (zone.x[1] - zone.x[0]) / N;
  const tierY = (k) => y0T + k * RISE, zC = (zone.z[0] + zone.z[1]) / 2 + 0.3;
  const trees = WOODS.filter((t) => t.x > zone.x[0] - 1 && t.x < zone.x[1] + 1 && t.z > zone.z[0] - 1 && t.z < zone.z[1] + 1).map((t) => { const cap = Math.min(...t.lobes.map((l) => l[1] - l[4])) - 0.55; let kc = N - 1; while (kc > 0 && tierY(kc) + CREST > cap) kc--; return { x: t.x, z: t.z, kc, cap, R: 1.5 * Math.sqrt(t.s), ph: t.x * 3.1 + t.z }; });
  const islandR = (t, a) => t.R * (1 + 0.09 * Math.sin(3 * a + t.ph) + 0.05 * Math.sin(5 * a - t.ph * 0.7));
  const ph = Array.from({ length: N }, () => [rP() * TAU, rP() * TAU]);
  const rawB = (k, z) => zone.x[0] + step * (k + 1) + 0.075 * sq(z - zC) + 0.24 * Math.sin(z * 0.62 + ph[k][0]) + 0.13 * Math.sin(z * 1.7 + ph[k][1]);
  const B = (k, z) => { if (k >= N - 1) return zone.x[1]; let b = rawB(k, z); for (const t of trees) if (k >= t.kc) b = Math.max(b, lerp(b, t.x + 1.45, Math.exp(-sq((z - t.z) / 2.1)))); return Math.min(zone.x[1], b); };
  const xStart = (k, z) => (k === 0 ? zone.x[0] : B(k - 1, z));
  const zD = zC + 0.85; // the stone ditch
  const zs = new Set([zone.z[0], zone.z[1], zD - 0.3, zD + 0.3]); for (let z = zone.z[0]; z < zone.z[1]; z += 0.36) zs.add(+z.toFixed(3));
  const Zs = [...zs].sort((a, b) => a - b).filter((z, i, a) => i === 0 || z - a[i - 1] > 0.08);

  // paddies per tier, split by cross bunds
  const paddies = [];
  for (let k = 0; k < N; k++) {
    let z = zone.z[0]; const cuts = [];
    while (z < zone.z[1] - 2) { z += rP.range(2.6, 5.2); if (z < zone.z[1] - 1.1 && Math.abs(z - zD) > 0.9) cuts.push(z); }
    const edges = [zone.z[0], ...cuts, zone.z[1]];
    for (let i = 0; i < edges.length - 1; i++) { const z0 = edges[i], z1 = edges[i + 1], r = rP(), type = r < 0.56 ? 'rice' : r < 0.72 ? 'mirror' : r < 0.88 ? 'reed' : 'dry'; paddies.push({ k, z0, z1, type }); }
  }
  const paddyAt = (k, z) => paddies.find((p) => p.k === k && z >= p.z0 && z <= p.z1);
  const C_MUD = rgbOf('#5a4a3c'), C_MUD_DRY = rgbOf('#8a7558'), C_RISER = rgbOf('#7a6246'), C_CREST = rgbOf('#7d9a48'), C_BANK = rgbOf('#6a7a44'), C_GROUND = rgbOf('#8d7f62');
  const station = (z, inDitch) => {
    const pts = []; let lastY = 0.03;
    for (let k = 0; k < N; k++) {
      const xa = xStart(k, z), xb = B(k, z), y = tierY(k), active = xb - xa > 0.12, crest = inDitch ? y + 0.02 : y + CREST;
      if (!active) { for (let i = 0; i < 5; i++) pts.push([zone.x[1], lastY]); continue; }
      const bw = Math.min(BW, (xb - xa) * 0.6);
      pts.push([xa - 0.07, lastY]); pts.push([xa + 0.03, crest]); pts.push([xa + bw - 0.03, crest]); pts.push([xa + bw + 0.05, y]); pts.push([Math.max(xa + bw + 0.06, xb - 0.12), y]);
      lastY = y;
    }
    return { pts, lastY };
  };
  for (let j = 0; j < Zs.length - 1; j++) {
    const z0 = Zs[j], z1 = Zs[j + 1], zm = (z0 + z1) / 2, ditch = Math.abs(zm - zD) < 0.3, a = station(z0, ditch), b = station(z1, ditch);
    for (let i = 0; i < a.pts.length - 1; i++) {
      const [ax, ay] = a.pts[i], [ax2, ay2] = a.pts[i + 1], [bx, by] = b.pts[i], [bx2, by2] = b.pts[i + 1], seg = i % 5, k = Math.floor(i / 5);
      if (ax2 - ax < 1e-3 && bx2 - bx < 1e-3 && Math.abs(ay2 - ay) < 1e-3) continue;
      const pd = paddyAt(k, zm);
      let c = seg === 0 ? C_RISER : seg === 1 ? C_CREST : seg === 2 ? C_BANK : pd?.type === 'dry' ? C_MUD_DRY : pd?.type === 'reed' ? mixC(C_MUD, C_BANK, 0.5) : C_MUD;
      c = tone(c, 0.92 + rP() * 0.14);
      soil.quad([ax, ay, z0], [bx, by, z1], [bx2, by2, z1], [ax2, ay2, z0], c, c, c, c);
    }
    // the end of the top: a closed back wall behind the last tier
    const ax = zone.x[1], yA = a.lastY, yB = b.lastY, c = tone(C_RISER, 0.9);
    soil.quad([ax, -0.1, z0], [ax, yA, z0], [ax, yB, z1], [ax, -0.1, z1], c);
    // top strip so the last tier doesn't show a gap past xb
    const last = a.pts[a.pts.length - 1], lastB = b.pts[b.pts.length - 1];
    if (ax - last[0] > 1e-3 || ax - lastB[0] > 1e-3) soil.quad([last[0], last[1], z0], [lastB[0], lastB[1], z1], [ax, yB, z1], [ax, yA, z0], C_MUD);
  }
  // end skirts on z = zone edges
  for (const [z, sgn] of [[zone.z[0], -1], [zone.z[1], 1]]) {
    const { pts } = station(z, false); let px = zone.x[0] - 0.07, py = 0.03;
    for (const [x, y] of pts) { if (x <= px) { if (y !== py) py = y; continue; } const c = tone(C_RISER, 0.92 + rP() * 0.14); if (sgn > 0) soil.quad([px, -0.1, z], [x, -0.1, z], [x, y, z], [px, py, z], c); else soil.quad([x, -0.1, z], [px, -0.1, z], [px, py, z], [x, y, z], c); px = x; py = y; }
  }
  // dry stone facing on the three outer walls and on the +z risers
  const stoneCols = ['#a9a596', '#b9b5a8', '#8b8f8a', '#c6c1b0', '#9a9a8a', '#a39a88'];
  const heightAtBack = (z) => station(z, false).lastY;
  for (let row = 0; row < 8; row++) { const h0 = 0.14 + row * 0.26; let z = zone.z[0] + (row % 2) * 0.28 + 0.05; while (z < zone.z[1] - 0.2) { const len = rP.range(0.4, 0.74), top = heightAtBack(z + len / 2); if (h0 < top - 0.03) W.box(zone.x[1] - 0.08, zone.x[1] + 0.1 + rP() * 0.05, h0 - 0.13, h0 + 0.1, z, z + len - 0.05, 'flat', rP.pick(stoneCols)); z += len; } }
  for (const [z, sgn] of [[zone.z[0], -1], [zone.z[1], 1]]) { const { pts } = station(z, false); const heightAt = (x) => { let y = 0.03; for (const [px, py] of pts) { if (px > x) break; y = py; } return y; }; for (let row = 0; row < 6; row++) { const h0 = 0.14 + row * 0.26; let x = zone.x[0] + 0.1 + (row % 2) * 0.28; while (x < zone.x[1] - 0.2) { const len = rP.range(0.4, 0.78); if (h0 < heightAt(x + len / 2) - 0.03) W.box(x, x + len - 0.05, h0 - 0.13, h0 + 0.1, sgn > 0 ? z - 0.06 : z - 0.1 - rP() * 0.05, sgn > 0 ? z + 0.1 + rP() * 0.05 : z + 0.06, 'flat', rP.pick(stoneCols)); x += len; } } }
  // creeper over the top of the outer walls
  for (let z = zone.z[0] + 0.5; z < zone.z[1]; z += rP.range(1.1, 2.1)) { const top = heightAtBack(z); if (top < 0.3) continue; clumpW(zone.x[1] + 0.12, top - rP.range(0.1, 0.5), z, 0.36, 0.42 + rP() * 0.4, 16, { s: 0.28, core: rP() < 0.5, droop: 0.7 }); grassW(zone.x[1] - 0.1, top, z, 0.2, 8, 0.5); }
  // cross bunds
  for (const p of paddies) if (p.z0 > zone.z[0] + 0.01) { const z = p.z0, xa = xStart(p.k, z), xb = B(p.k, z), y = tierY(p.k), c = tone(C_CREST, 0.95); if (xb - xa < 0.6) continue; const x0 = xa + 0.1, x1 = xb - 0.1, h = CREST * 0.85, hw = 0.13; soil.quad([x0, y, z - hw], [x0, y + h, z - hw * 0.6], [x1, y + h, z - hw * 0.6], [x1, y, z - hw], C_BANK); soil.quad([x0, y + h, z - hw * 0.6], [x0, y + h, z + hw * 0.6], [x1, y + h, z + hw * 0.6], [x1, y + h, z - hw * 0.6], c); soil.quad([x0, y + h, z + hw * 0.6], [x0, y, z + hw], [x1, y, z + hw], [x1, y + h, z + hw * 0.6], C_BANK); }
  // tree islands
  const C_ISLE = rgbOf('#9a8360'), C_ISLE_TOP = rgbOf('#a8906a');
  for (const t of trees) {
    const y = tierY(t.kc), n = 22, ring = (a, k, yy) => { const r = islandR(t, a) * k; return [Math.min(zone.x[1] - 0.02, t.x + Math.cos(a) * r), yy, t.z + Math.sin(a) * r]; }, Y1 = y + 0.34, Y2 = y + 0.4;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU, c = tone(C_RISER, 0.92 + 0.14 * ((i * 7) % 3) / 2), cc = tone(C_ISLE, 0.94 + 0.12 * ((i * 5) % 4) / 3);
      soil.quad(ring(a0, 1.04, y - 0.04), ring(a0, 0.86, Y1), ring(a1, 0.86, Y1), ring(a1, 1.04, y - 0.04), c);
      soil.quad(ring(a0, 0.86, Y1), ring(a0, 0.5, Y2), ring(a1, 0.5, Y2), ring(a1, 0.86, Y1), cc);
      soil.tri(ring(a0, 0.5, Y2), [t.x, Y2 + 0.02, t.z], ring(a1, 0.5, Y2), C_ISLE_TOP);
    }
    // a kerb of field stones, and the grass only round the rim so the earth reads
    for (let i = 0; i < 13; i++) { const a = (i / 13) * TAU + rP() * 0.25, p = ring(a, 0.93, y + 0.16); if (rP() > 0.82) continue; W.add(kit.chip(kit.sphere(1, 6, 4), 0.28, rP), 'flat', { pos: p, scale: [0.2 + rP() * 0.1, 0.14, 0.17 + rP() * 0.1], rot: [0, rP() * 6, 0], color: rP.pick(['#a9a596', '#b9b5a8', '#8b8f8a']) }); }
    for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU + rP() * 0.4, p = ring(a, 0.82, Y1); grassW(p[0], Y1 - 0.02, p[2], 0.24, 9, rP.range(0.4, 0.68)); }
  }

  /* ---- water: one mesh, heights baked in, shore in uv.x ---- */
  const wPos = [], wUv = [], wIdx = [], inTree = (x, z, m = 0) => trees.some((t) => Math.hypot(x - t.x, z - t.z) < islandR(t, Math.atan2(z - t.z, x - t.x)) + m);
  function waterPatch(k, z0, z1, { x: xaF, b: xbF, y }, nu, wv) {
    const list = Zs.filter((z) => z > z0 + 0.14 && z < z1 - 0.14); if (list.length < 2) return; list.unshift(z0 + 0.14); list.push(z1 - 0.14);
    const nv = list.length, nb = wPos.length / 3, idx = (i, j) => nb + j * (nu + 1) + i, shoreAt = (u, j) => { const xa = xaF(list[j]), xb = xbF(list[j]), x = lerp(xa, xb, u), d = Math.min((xb - xa) * Math.min(u, 1 - u), list[j] - (z0 + 0.14), (z1 - 0.14) - list[j], Math.max(0, ...trees.map((t) => Math.hypot(x - t.x, list[j] - t.z) - islandR(t, Math.atan2(list[j] - t.z, x - t.x))))); return clamp(d / 0.85); };
    for (let j = 0; j < nv; j++) for (let i = 0; i <= nu; i++) { const u = i / nu, xa = xaF(list[j]), xb = xbF(list[j]); wPos.push(lerp(xa, xb, u), y, list[j]); wUv.push(shoreAt(u, j) * wv, 0); }
    for (let j = 0; j < nv - 1; j++) for (let i = 0; i < nu; i++) { const u0 = i / nu, u1 = (i + 1) / nu, zm = (list[j] + list[j + 1]) / 2, xm = lerp(xaF(zm), xbF(zm), (u0 + u1) / 2); if (inTree(xm, zm, -0.32)) continue; const a = idx(i, j), b = idx(i + 1, j), c = idx(i, j + 1), d = idx(i + 1, j + 1); wIdx.push(a, c, b, b, c, d); }
  }
  for (const p of paddies) {
    if (p.type === 'dry') continue;
    const y = tierY(p.k) + 0.1, inner = { x: (z) => xStart(p.k, z) + BW + 0.05, b: (z) => Math.max(xStart(p.k, z) + BW + 0.2, B(p.k, z) - 0.08), y };
    const avg = (inner.b((p.z0 + p.z1) / 2) - inner.x((p.z0 + p.z1) / 2)); if (avg < 0.4) continue;
    waterPatch(p.k, p.z0 + 0.13, p.z1 - 0.13, inner, Math.max(2, Math.round(avg / 0.7)), p.type === 'reed' ? 0.5 : 1);
  }
  // the ditch water
  for (let k = 0; k < N; k++) { const xaF = (z) => (k === 0 ? zone.x[0] : xStart(k, z)) + 0.02, xbF = (z) => B(k, z) - 0.02; const xa = xaF(zD), xb = xbF(zD); if (xb - xa < 0.1) continue; const y = tierY(k) + 0.18; const n = wPos.length / 3, zA = zD - 0.13, zB = zD + 0.13; wPos.push(xa, y, zA, xb, y, zA, xa, y, zB, xb, y, zB); wUv.push(0.75, 0, 0.75, 0, 0.75, 0, 0.75, 0); wIdx.push(n, n + 2, n + 1, n + 1, n + 2, n + 3); if (k > 0) { const prevY = tierY(k - 1) + 0.18, n2 = wPos.length / 3; wPos.push(xa + 0.02, y, zA, xa - 0.12, prevY, zA, xa + 0.02, y, zB, xa - 0.12, prevY, zB); wUv.push(0.4, 0, 0.4, 0, 0.4, 0, 0.4, 0); wIdx.push(n2, n2 + 2, n2 + 1, n2 + 1, n2 + 2, n2 + 3); } }
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wPos, 3)); wg.setAttribute('uv', new THREE.Float32BufferAttribute(wUv, 2)); wg.setIndex(wIdx); wg.computeVertexNormals();
  const wmat = ctx.water({ shallow: '#a6a678', deep: '#6a9ca4', hi: '#dfe6da', opacity: 0.86, scale: 5.6 });
  wmat.fragmentShader = wmat.fragmentShader.replace('smoothstep(.86,.90,', 'smoothstep(1.3,1.37,').replace('mix(.5,uOpacity,', 'mix(.7,uOpacity,').replace('rim*.55', 'rim*.2').replace('col+=cHi*caust*(.08+.14*lit);', 'col+=cHi*caust*(.015+.03*lit);').replace('col+=cHi*sparkle*.7;', `col+=cHi*sparkle*.1;
        { vec3 V=normalize(cameraPosition-vW); float fr=pow(1.-clamp(V.y,0.,1.),2.4); float cl=smoothstep(.6,.64,texture2D(uNoise,vW.xz*.019+vec2(t*.003,t*.002)).r+texture2D(uNoise,vW.zx*.043-vec2(t*.002,0.)).g*.26-.14); float mud=smoothstep(.5,.66,texture2D(uNoise,vW.xz*.083).g+texture2D(uNoise,vW.zx*.21).r*.18); col=mix(col,vec3(.36,.36,.2),mud*.3); col=mix(col,mix(vec3(.3,.56,.82),vec3(.92,.94,.92),cl*.8),clamp(.2+fr*.6+cl*.24,0.,.7)); }`);
  const wm = new THREE.Mesh(wg, wmat); wm.renderOrder = 2; wm.name = 'east-water'; group.add(ctx.noOutline(wm));

  /* ---- the ditch: stone lining and the sluice ---- */
  for (let k = 0; k < N; k++) { const xa = xStart(k, zD), xb = B(k, zD); if (xb - xa < 0.1) continue; const y = tierY(k); for (const sg of [-1, 1]) { let x = xa; while (x < xb - 0.04) { const len = Math.min(xb - x, rP.range(0.45, 0.8)); W.box(x, x + len - 0.03, y - 0.06, y + 0.3 + rP() * 0.04, zD + sg * 0.14 + (sg < 0 ? -0.15 : 0), zD + sg * 0.14 + (sg > 0 ? 0.15 : 0), 'flat', rP.pick(stoneCols)); x += len; } } W.box(xa, xb, y - 0.05, y + 0.04, zD - 0.15, zD + 0.15, 'flat', '#6d6a60'); }
  // sluice at the riser of tier 3: posts, gate, screw and handwheel, a bead of vine
  { const k = 3, x = B(k - 1, zD), y0 = tierY(k), S = W, xL = x + 0.02, zL = zD - 0.22, zR = zD + 0.22;
    for (const zz of [zL, zR]) { S.box(xL - 0.09, xL + 0.09, y0 - 0.2, y0 + 1.15, zz - 0.09, zz + 0.09, 'flat', '#a9a596'); S.box(xL - 0.09, xL + 0.09, y0 + 1.15, y0 + 1.22, zz - 0.13, zz + 0.13, 'flat', '#d9d6cb'); }
    S.box(xL - 0.08, xL + 0.08, y0 + 1.2, y0 + 1.3, zL - 0.15, zR + 0.15, 'flat', P.concreteMid);
    S.box(xL - 0.035, xL + 0.035, y0 - 0.1, y0 + 0.42, zL + 0.05, zR - 0.05, 'wood', '#7a5c46'); for (let z = zL + 0.1; z < zR - 0.05; z += 0.13) S.box(xL - 0.038, xL + 0.038, y0 - 0.1, y0 + 0.42, z - 0.008, z + 0.008, 'wood', '#5e4a3c'); // the gate, stuck
    S.rod([xL, y0 + 1.3, zD], [xL, y0 + 2.02, zD], 0.024, 'worn', P.rust, 6); S.add(kit.torus(0.2, 0.024, 6, 14), 'worn', { pos: [xL, y0 + 1.92, zD], rot: [Q, 0, 0], color: P.rust }); for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU; S.rod([xL, y0 + 1.92, zD], [xL + Math.cos(a) * 0.2, y0 + 1.92, zD + Math.sin(a) * 0.2], 0.018, 'worn', P.rustDark, 4); }
    S.box(xL - 0.12, xL + 0.12, y0 + 1.5, y0 + 1.58, zL - 0.13, zR + 0.13, 'worn', '#6f7a7e');
    A.clump(toA(xL, y0 + 0.7, zR + 0.1).toArray(), 0.28, 0.5, 18, { s: 0.22 }); W.tube([[xL, y0 - 0.1, zR + 0.12], [xL + 0.12, y0 + 0.5, zR + 0.16], [xL - 0.08, y0 + 1.1, zR + 0.12], [xL + 0.06, y0 + 1.5, zR + 0.04], [xL, y0 + 1.95, zR - 0.08]], 0.02, 0.008, 'flat', '#6a6a42', 3, 20);
    // rusted inlet pipe at the top of the ditch
    W.rod([zone.x[1] - 0.2, tierY(N - 1) + 0.4, zD], [B(N - 2, zD) + 0.6, tierY(N - 1) + 0.28, zD], 0.075, 'worn', P.rust, 8); }

  /* ---- the small things left on the banks ---- */
  { const k = 1, x = xStart(k, zD) + 1, y = tierY(k) + 0.28; for (let i = 0; i < 3; i++) { const c = ['#8a7a64', '#7a6a54', '#94846a'][i]; W.box(x + i * 0.2 - 0.09, x + i * 0.2 + 0.09, y, y + 0.05, zD - 0.42, zD + 0.42, 'wood', c); }
    // field number stakes
    for (const [kk, zz] of [[2, zone.z[0] + 3.4], [0, zone.z[1] - 2.8], [4, zD - 2.6]]) { const xa = xStart(kk, zz) + 0.17, yy = tierY(kk) + CREST; W.rod([xa, yy - 0.05, zz], [xa, yy + 0.9, zz], 0.022, 'wood', '#86664c', 4); const m = new THREE.PlaneGeometry(0.3, 0.14); H.atlas.uvTo(m, 'farm'); W.add(m, 'atlas', { pos: [xa + 0.024, yy + 0.8, zz], rot: [0, Q, 0] }); }
    // a stack of seedling trays and a bucket on the top bund
    const tx = B(N - 2, zD) - 0.1, ty = tierY(N - 2) + CREST, tz = zD + 0.65;
    for (let i = 0; i < 5; i++) W.box(tx - 0.28 + i * 0.012, tx + 0.28 + i * 0.012, ty + i * 0.05, ty + i * 0.05 + 0.04, tz - 0.14, tz + 0.14, 'flat', i % 2 ? '#3f4a4e' : '#5f8fb0');
    W.add(kit.cylBase(0.13, 0.1, 0.22, 8), 'worn', { pos: [tx + 0.42, ty, tz + 0.05], color: '#6f9fb0' });
    // two straw stacks on the verge before the first bund
    for (const [zz, s] of [[zone.z[0] + 2.6, 1], [zone.z[0] + 4.9, 0.8]]) { const x0 = zone.x[0] - 0.9; for (let i = 0; i < 4; i++) W.add(kit.chip(kit.cylBase(0.62 - i * 0.1, 0.72 - i * 0.1, 0.5, 9), 0.05, rP), 'flat', { pos: [x0, i * 0.42, zz], scale: s, color: i % 2 ? '#d6b86e' : '#c6a65e' }); W.add(kit.chip(new THREE.ConeGeometry(0.42, 0.75, 9), 0.05, rP), 'flat', { pos: [x0, 1.78 * s + 0.2, zz], scale: s, color: '#b9985e' }); grassW(x0, 0.05, zz, 0.9, 20, 0.6); } }

  /* ---- rice ---- */
  const rc = kit.merge([0, 1, 2, 3].map((i) => { const b = kit.blade(1, 0.1, 0.16, 2); b.rotateZ((i % 2 ? 1 : -1) * (0.08 + i * 0.05)); b.rotateY(i * 1.57 + 0.4); return b; })); { const nr = rc.attributes.normal; for (let i = 0; i < nr.count; i++) nr.setXYZ(i, 0, 1, 0); }
  // hand-set hills, not rows: each paddy thins and thickens in soft patches, a hill is one to three tufts of one colour
  const tufts = [], patchAt = (x, z) => 0.5 + 0.27 * Math.sin(x * 1.37 + z * 0.71 + 1.3) + 0.23 * Math.sin(x * 0.53 - z * 1.19 + 4.1);
  for (const p of paddies) {
    if (p.type !== 'rice') continue; const yw = tierY(p.k) + 0.1, D = 0.42;
    for (let z = p.z0 + 0.3; z < p.z1 - 0.22; z += D * (0.82 + rP() * 0.4)) {
      if (Math.abs(z - zD) < 0.42) continue;
      const xa = xStart(p.k, z) + BW + 0.18, xb = B(p.k, z) - 0.2;
      for (let x = xa + rP() * 0.3; x < xb; x += D * (0.78 + rP() * 0.56)) {
        const pc = patchAt(x, z); if (rP() > 0.5 + pc * 0.75 || inTree(x, z, 0.16)) continue;
        const hx = x + (rP() - 0.5) * 0.22, hz = z + (rP() - 0.5) * 0.22, n = 2 + (rP() < pc ? 1 : 0) + (rP() < pc * 0.6 ? 1 : 0), base = 0.42 + 0.2 * pc + (p.k % 2) * 0.03, ci = Math.floor(rP() * 4) + (pc > 0.62 ? 1 : 0);
        for (let i = 0; i < n; i++) tufts.push({ x: hx + (rP() - 0.5) * 0.17, y: yw, z: hz + (rP() - 0.5) * 0.17, s: base * (0.8 + rP() * 0.42), yaw: rP() * TAU, lean: (rP() - 0.5) * 0.3, ci });
      }
    }
  }
  const riceMat = ctx.toon({ color: '#ffffff', side: THREE.DoubleSide, translucent: 0.5 });
  const rice = new THREE.InstancedMesh(rc, riceMat, tufts.length), mm = new THREE.Matrix4(), qq = new THREE.Quaternion(), ee = new THREE.Euler(), pp = new THREE.Vector3(), ss = new THREE.Vector3(), cc = new THREE.Color();
  const RICEC = ['#9bc25c', '#86b257', '#aec86a', P.grassLit, '#c6cf72'].map((h) => new THREE.Color(h));
  tufts.forEach((t, i) => { ee.set(t.lean, t.yaw, 0, 'YXZ'); qq.setFromEuler(ee); mm.compose(pp.set(t.x, t.y, t.z), qq, ss.set(t.s, t.s, t.s)); rice.setMatrixAt(i, mm); cc.copy(RICEC[t.ci]); rice.setColorAt(i, cc); });
  rice.instanceMatrix.setUsage(THREE.DynamicDrawUsage); rice.castShadow = false; rice.receiveShadow = true; rice.name = 'east-rice'; group.add(ctx.softEdge(rice));
  const riceArr = rice.instanceMatrix.array, riceBase = riceArr.slice(), tuftS = tufts.map((t) => t.s);

  /* ---- weeds in fallow paddies, turf on the bunds ---- */
  for (const p of paddies) {
    const y = tierY(p.k), area = (B(p.k, (p.z0 + p.z1) / 2) - xStart(p.k, (p.z0 + p.z1) / 2)) * (p.z1 - p.z0);
    if (p.type === 'reed' || p.type === 'dry') for (let i = 0; i < Math.round(area * (p.type === 'reed' ? 0.9 : 0.55)); i++) { const z = rP.range(p.z0 + 0.3, p.z1 - 0.3), xa = xStart(p.k, z) + BW, xb = B(p.k, z) - 0.15; if (xb <= xa || inTree(lerp(xa, xb, 0.5), z, 0)) continue; grassW(rP.range(xa, xb), y + 0.04, z, 0.32, 9, p.type === 'reed' ? rP.range(0.7, 1.05) : 0.5); }
    if (p.type === 'mirror') for (let i = 0; i < 3; i++) { const z = rP.range(p.z0 + 0.6, p.z1 - 0.6), xa = xStart(p.k, z) + BW + 0.3, xb = B(p.k, z) - 0.3; if (xb <= xa) continue; const x = rP.range(xa, xb); if (inTree(x, z, 0.35)) continue; for (let q = 0; q < 5; q++) W.add(kit.cylBase(rP.range(0.08, 0.15), rP.range(0.08, 0.15), 0.01, 7), 'flat', { pos: [x + rP.range(-0.3, 0.3), y + 0.105, z + rP.range(-0.3, 0.3)], color: q % 2 ? P.moss : P.mossLit }); }
    // turf along the downhill bund crest
    for (let z = p.z0 + 0.4; z < p.z1 - 0.3; z += 0.8) { const xa = xStart(p.k, z); if (B(p.k, z) - xa < 0.3) continue; grassW(xa + 0.15, y + CREST, z + rP.range(-0.2, 0.2), 0.14, 7, rP.range(0.34, 0.62)); }
  }

  /* ---- kitchen fields ---- */
  { const Kz = RING_ZONES.kitchenFields, rK = ctx.seeded('east-kitchen'), x0 = Kz.x[0] + 0.15, x1 = Kz.x[1] - 0.05, n = 5, dx = (x1 - x0) / n, plots = [[Kz.z[0] + 0.1, Kz.z[0] + 4], [Kz.z[0] + 4.3, Kz.z[0] + 8.3], [Kz.z[0] + 8.6, Kz.z[1] - 0.1]];
    const ridge = (cx, z0, z1, h = 0.2, w = 0.28) => { const c = tone(rgbOf('#6e5a48'), 0.95 + rK() * 0.2), T = (y, zz, hw) => [[cx - hw, y, zz], [cx + hw, y, zz]]; const seg = 8; for (let i = 0; i < seg; i++) { const za = lerp(z0, z1, i / seg), zb = lerp(z0, z1, (i + 1) / seg); soil.quad([cx - w, 0.05, za], [cx - w * 0.3, 0.05 + h, za], [cx - w * 0.3, 0.05 + h, zb], [cx - w, 0.05, zb], c); soil.quad([cx - w * 0.3, 0.05 + h, za], [cx + w * 0.3, 0.05 + h, za], [cx + w * 0.3, 0.05 + h, zb], [cx - w * 0.3, 0.05 + h, zb], c); soil.quad([cx + w * 0.3, 0.05 + h, za], [cx + w, 0.05, za], [cx + w, 0.05, zb], [cx + w * 0.3, 0.05 + h, zb], c); } };
    plots.forEach(([zA, zB], pi) => {
      for (let i = 0; i < n; i++) {
        const cx = x0 + (i + 0.5) * dx; ridge(cx, zA, zB);
        const y = 0.27;
        if (pi === 0) { // cabbages gone to seed and bolting daikon
          for (let z = zA + 0.3; z < zB - 0.1; z += 0.48) { if (rK() < 0.12) continue; clumpW(cx + rK.range(-0.05, 0.05), y + 0.08, z, 0.2, 0.15, 7, { s: 0.2, coreCol: i % 2 ? '#a6d060' : '#7fae4a' }); if (rK() < 0.28) { const yy = y + rK.range(0.55, 0.9); W.rod([cx, y, z], [cx + rK.range(-0.05, 0.05), yy, z], 0.009, 'flat', '#8bb65a', 3); W.add(kit.ico(0.05, 0), 'flat', { pos: [cx, yy, z], color: i % 2 ? P.flowerYellow : P.flowerWhite }); } }
        } else if (pi === 1) { // tomato A-frames, bamboo
          for (let z = zA + 0.15; z <= zB; z += 0.8) { W.rod([cx - 0.14, 0.05, z], [cx + 0.02, 1.7, z], 0.018, 'flat', '#b7c26a', 4); W.rod([cx + 0.14, 0.05, z], [cx - 0.02, 1.7, z], 0.018, 'flat', '#b7c26a', 4); }
          W.rod([cx, 1.62, zA + 0.1], [cx, 1.62, zB - 0.05], 0.018, 'flat', '#b7c26a', 4);
          for (let z = zA + 0.3; z < zB - 0.1; z += 0.35) { clumpW(cx, rK.range(0.5, 1.45), z, 0.26, 0.5, 14, { s: 0.22, core: false }); if (rK() < 0.5) W.add(kit.ico(0.06, 1), 'flat', { pos: [cx + rK.range(-0.14, 0.14), rK.range(0.5, 1.3), z], color: rK() < 0.6 ? P.red : P.rustLit }); }
        } else { // pumpkins sprawl, weeds winning
          for (let z = zA + 0.4; z < zB - 0.1; z += 0.8) { clumpW(cx + rK.range(-0.1, 0.1), y + 0.04, z, 0.34, 0.14, 9, { s: 0.3, core: false }); if (rK() < 0.32) W.add(kit.chip(kit.sphere(0.16, 8, 5), 0.02, rK), 'flat', { pos: [cx + rK.range(-0.2, 0.2), y + 0.1, z + rK.range(-0.2, 0.2)], scale: [1, 0.72, 1], color: P.sunWarm }); }
          grassW(cx, 0.05, (zA + zB) / 2, 0.4, 26, 0.7);
        }
        for (let q = 0; q < 3; q++) grassW(cx + dx / 2 + rK.range(-0.1, 0.1), 0.05, zA + rK() * (zB - zA), 0.2, 16, rK.range(0.45, 0.8)); if (pi === 2 && rK() < 0.6) grassW(cx, 0.28, zA + rK() * (zB - zA), 0.35, 20, 0.7);
      }
    });
    // a low post-and-string fence
    for (let z = Kz.z[0]; z <= Kz.z[1]; z += 2.2) W.rod([Kz.x[1] + 0.15, 0, z], [Kz.x[1] + 0.15, 0.8, z], 0.024, 'wood', '#86664c', 4); W.rod([Kz.x[1] + 0.15, 0.72, Kz.z[0]], [Kz.x[1] + 0.15, 0.7, Kz.z[1]], 0.008, 'flat', '#c9b06a', 3); }

  /* ---- orchard ---- */
  { const Oz = RING_ZONES.orchard, rO = ctx.seeded('east-orchard'), netPts = [];
    const xL = Oz.x[0] + 0.9, xR = Oz.x[1] - 0.8;
    const net = (a, b, c, d, nu, nv) => { for (let i = 0; i <= nu; i++) { const u = i / nu; let prev = null; for (let j = 0; j <= nv; j++) { const v = j / nv, p = [lerp(lerp(a[0], b[0], u), lerp(d[0], c[0], u), v), lerp(lerp(a[1], b[1], u), lerp(d[1], c[1], u), v) - 0.12 * Math.sin(v * Math.PI) * Math.sin(u * Math.PI), lerp(lerp(a[2], b[2], u), lerp(d[2], c[2], u), v)]; if (prev) netPts.push(...prev, ...p); prev = p; } } for (let j = 0; j <= nv; j++) { const v = j / nv; let prev = null; for (let i = 0; i <= nu; i++) { const u = i / nu, p = [lerp(lerp(a[0], b[0], u), lerp(d[0], c[0], u), v), lerp(lerp(a[1], b[1], u), lerp(d[1], c[1], u), v) - 0.12 * Math.sin(v * Math.PI) * Math.sin(u * Math.PI), lerp(lerp(a[2], b[2], u), lerp(d[2], c[2], u), v)]; if (prev) netPts.push(...prev, ...p); prev = p; } } };
    function persimmon(x, z, s) {
      const lean = rO.range(-0.3, 0.3), yt = 1.9 * s, t = [x + lean * 0.5, yt, z + rO.range(-0.2, 0.2)];
      W.tube([[x, -0.08, z], [x + lean * 0.2, 0.7 * s, z], t], 0.17 * s, 0.09 * s, 'flat', '#6e5a48', 7, 8);
      for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + rO(), r = rO.range(0.7, 1.1) * s, y = yt + rO.range(0.4, 1.1) * s, m = [t[0] + Math.cos(a) * r * 0.55, yt + 0.5 * (y - yt), t[2] + Math.sin(a) * r * 0.55], e = [t[0] + Math.cos(a) * r, y, t[2] + Math.sin(a) * r]; W.tube([t, m, e], 0.085 * s, 0.03 * s, 'flat', '#7a6248', 5, 6); clumpW(e[0], e[1], e[2], 0.66 * s, 0.52 * s, 42, { s: 0.3, core: false }); for (let k = 0; k < 3; k++) W.add(kit.ico(0.075, 1), 'flat', { pos: [e[0] + rO.range(-0.55, 0.55), e[1] + rO.range(-0.42, 0.25), e[2] + rO.range(-0.55, 0.55)], color: P.sunWarm }); }
      clumpW(t[0], yt + 0.6 * s, t[2], 0.5 * s, 0.4 * s, 16, { s: 0.3, coreCol: P.leafDeep }); clumpW(t[0], yt + 0.7 * s, t[2], 1.0 * s, 0.75 * s, 44, { s: 0.34, core: false });
      for (const sg of [-1, 1]) W.rod([x + sg * 0.7, -0.05, z + 0.1], [t[0] + sg * 0.35, yt + 0.25, t[2]], 0.026, 'wood', '#a89a70', 4);
      grassW(x, 0.05, z, 0.9, 26, 0.6);
    }
    persimmon(xL, Oz.z[0] + 1.3, 1.15); persimmon(xR, Oz.z[0] + 1.6, 1); persimmon(xL + 0.4, Oz.z[0] + 3.4, 0.9);
    // pear trellis: a flat wire table with netting
    const xA = Oz.x[0] + 0.2, xB = Oz.x[1] - 0.15, zA = Oz.z[0] + 4.6, zB = Oz.z[1] - 0.1, y = 1.75;
    for (const x of [xA, xB]) for (const z of [zA, (zA + zB) / 2, zB]) W.rod([x, 0, z], [x, y, z], 0.04, 'wood', '#86664c', 5);
    for (const z of [zA, (zA + zB) / 2, zB]) W.rod([xA, y, z], [xB, y, z], 0.02, 'wood', '#86664c', 4); W.rod([xA, y, zA], [xA, y, zB], 0.02, 'wood', '#86664c', 4); W.rod([xB, y, zA], [xB, y, zB], 0.02, 'wood', '#86664c', 4);
    net([xA - 0.05, y + 0.05, zA - 0.1], [xB + 0.05, y + 0.05, zA - 0.1], [xB + 0.05, y + 0.05, zB + 0.1], [xA - 0.05, y + 0.05, zB + 0.1], 10, 12);
    for (const [x, z] of [[lerp(xA, xB, 0.3), lerp(zA, zB, 0.3)], [lerp(xA, xB, 0.72), lerp(zA, zB, 0.65)]]) {
      W.tube([[x, -0.05, z], [x + 0.1, 0.8, z], [x, y - 0.1, z]], 0.13, 0.08, 'flat', '#6e5a48', 6, 6);
      for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + rO(), e = [x + Math.cos(a) * rO.range(0.8, 1.2), y, z + Math.sin(a) * rO.range(0.6, 1)]; W.tube([[x, y - 0.1, z], e], 0.06, 0.03, 'flat', '#7a6248', 5, 4); clumpW(e[0], y + 0.1, e[2], 0.76, 0.26, 34, { s: 0.28, core: false }); for (let k = 0; k < 4; k++) W.add(kit.boxBase(0.09, 0.12, 0.09), 'flat', { pos: [e[0] + rO.range(-0.5, 0.5), y - 0.24, e[2] + rO.range(-0.5, 0.5)], color: '#efe4c4' }); }
      grassW(x, 0.05, z, 1, 24, 0.55);
    }
    // the trellis's bird scarers: strips of faded tape still tied to the wire
    for (const [x, z, c, l] of [[xA + 0.4, zA + 0.2, '#e0c25a', 0.72], [xB - 0.5, zA + 0.3, '#d9764a', 0.6], [(xA + xB) / 2, zB - 0.1, '#e0c25a', 0.68], [xB - 0.2, zB - 0.2, '#c8705e', 0.55]]) hangCloth(H.world, x, y + 0.02, z, 0.05, l, { color: c, nx: 1, ny: 4, dir: [0.6, 0, 0.8], amp: 0.22, flutter: 0.5, ph: x * 2 + z });
    // net slipped off one side, sagging from the rail to the ground
    net([xA - 0.05, y + 0.02, zB + 0.12], [xB + 0.05, y + 0.02, zB + 0.12], [xB - 0.1, 0.05, zB + 0.34], [xA + 0.1, 0.05, zB + 0.3], 10, 7);
    for (let i = 0; i < 26; i++) grassW(rO.range(Oz.x[0], Oz.x[1]), 0.05, rO.range(Oz.z[0], Oz.z[1]), rO.range(0.3, 0.6), 12, rO.range(0.45, 0.8));
    if (netPts.length) { const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(netPts, 3)); const ln = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#e9e2c6', transparent: true, opacity: 0.55 })); ln.name = 'east-net'; group.add(ctx.noOutline(ln)); }
  }

  /* ---- soil mesh ---- */
  const g = soil.geometry(); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); kit.worldUV(g, 0.3);
  const soilMat = ctx.surface('soil', { vertexColors: true, color: '#ffffff', moss: 0.42 });
  const soilMesh = new THREE.Mesh(g, soilMat); soilMesh.castShadow = true; soilMesh.receiveShadow = true; soilMesh.name = 'east-terraces'; group.add(soilMesh);

  /* ---- finish ---- */
  const kitInfo = H.finish(group);
  const mo = motion.finish(group);
  group.userData.east = { tufts: tufts.length, soilTris: soil.tris(), waterTris: wIdx.length / 3, motionVerts: motion.vertexCount(), kitTris: kitInfo.tris };

  return {
    group,
    update(t) {
      if (mo) mo.update(t);
      for (let i = 0; i < tufts.length; i++) {
        const f = tufts[i], w = ctx.wind(t, f.x, f.z) * 0.85 + 0.18 * Math.sin(t * 1.9 + f.x * 1.3 + f.z * 2.1), s = tuftS[i], k = i * 16;
        riceArr[k + 4] = riceBase[k + 4] + 0.16 * w * s; riceArr[k + 6] = riceBase[k + 6] + 0.05 * w * s;
      }
      rice.instanceMatrix.needsUpdate = true;
    },
  };
}
