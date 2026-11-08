// south.js — v3 ring, the south side: civic life that stopped. The wooden school and its yard and pool, the clinic, the post office, a stationery shop
// at the school gate, a filling station with a tree through its forecourt, the fire brigade's lookout. Every building is H.build with deliberate opts plus its own moment.
// Static extras go through the kit's stages so they stay inside its 8 meshes. What moves lives in two CPU-rewritten meshes: cloth (flag, laundry, awning, curtains, hose) and rigid (swing seats, tin sheet, price board, lamp, bell rope).
import * as THREE from 'three';
import { createHouseKit } from '../core/housekit.js';

const Q = Math.PI / 2, TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const op = (t, x0, x1, y0, y1, o = {}) => ({ t, x0, x1, y0, y1, ...o });
const centres = (a, b, n) => Array.from({ length: n }, (_, i) => lerp(a, b, (i + 0.5) / n));

export function build(ctx) {
  const { layout, P, kit, shared } = ctx;
  const { BUILDINGS, RING_ZONES, RING_ROADS, GROUND } = layout;
  const group = new THREE.Group(); group.name = 'south';
  const H = createHouseKit(ctx, { name: 'south', seed: 'south' });
  H.density = 0.85;
  const A = H.atlas, W = H.world, gy = GROUND.soilY, rng = ctx.seeded('south-props');
  const byId = (id) => BUILDINGS.find((b) => b.id === id);
  const ringS = RING_ROADS.find((r) => r.id === 'ringS');
  /** World (x,z) into building b's local frame. */
  const toL = (b, wx, wz) => { const dx = wx - b.x, dz = wz - b.z, c = Math.cos(b.yaw), s = Math.sin(b.yaw); return [dx * c - dz * s, dx * s + dz * c]; };

  /* ------------------------------------------------------------------ painted cells, all small, all invented ------------------ */
  const ink = '#3a3026', cream = '#efe6cf';
  const own = [], FONT = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans CJK JP","Yu Gothic","Meiryo",sans-serif', SERIF = '"Hiragino Mincho ProN","Yu Mincho","Noto Serif CJK JP",' + FONT;
  const paintK = (name, w, h, k, draw) => own.push({ name, w: Math.round(w * k), h: Math.round(h * k), k, draw, nw: w, nh: h });
  paintK('s-hours', 128, 168, 0.75, (g, w, h, T) => { g.fillStyle = '#e9e3cf'; g.fillRect(0, 0, w, h); g.strokeStyle = '#4e7f6a'; g.lineWidth = 5; g.strokeRect(5, 5, w - 10, h - 10); T.text('診療時間', w / 2, 34, 25, '#3f6a58', { font: T.SERIF, weight: 900 }); T.text('午前 九時', w / 2, 78, 19, ink, { weight: 700 }); T.text('午後 二時', w / 2, 106, 19, ink, { weight: 700 }); T.text('日曜休診', w / 2, 140, 21, '#a8413a', { weight: 800 }); T.blot(w, h, 8, ['#a89a70', '#b5522f'], 3, 13, 0.4); });
  paintK('s-gate', 64, 320, 0.66, (g, w, h, T) => { g.fillStyle = '#8f8a78'; g.fillRect(0, 0, w, h); g.fillStyle = '#d9d4c0'; g.fillRect(5, 5, w - 10, h - 10); T.text('緑ヶ丘小学校', w / 2, 30, 45, '#3a4640', { font: T.SERIF, weight: 900, vertical: true, gap: 1.13 }); T.blot(w, h, 10, ['#7dbb4a', '#6a7a5a'], 3, 14, 0.5); });
  paintK('s-flag', 128, 86, 0.75, (g, w, h, T) => { g.fillStyle = '#cfdcae'; g.fillRect(0, 0, w, h); g.fillStyle = '#4e8a64'; g.beginPath(); g.arc(w / 2, h / 2, 30, 0, TAU); g.fill(); T.text('緑', w / 2, h / 2 + 2, 42, '#e9eed0', { font: T.SERIF, weight: 900 }); T.blot(w, h, 8, ['#a89a70', '#8f9a70'], 5, 20, 0.35); });
  paintK('s-brand', 256, 256, 0.75, (g, w, h, T) => { g.fillStyle = '#2f8a5e'; g.fillRect(0, 0, w, h); g.save(); g.translate(w / 2, h / 2); g.scale(0.876, 0.876); g.translate(-w / 2, -h / 2); /* fills the board disc: 0.876 keeps the printed emblem its old size inside the green rim */ g.fillStyle = cream; g.beginPath(); g.arc(w / 2, h / 2, 124, 0, TAU); g.fill(); g.fillStyle = '#2f9a63'; g.beginPath(); g.arc(w / 2, h / 2, 108, 0, TAU); g.fill(); g.fillStyle = cream; g.beginPath(); g.moveTo(128, 34); g.bezierCurveTo(206, 84, 182, 156, 128, 162); g.bezierCurveTo(74, 156, 50, 84, 128, 34); g.fill(); g.strokeStyle = '#2f9a63'; g.lineWidth = 9; g.beginPath(); g.moveTo(128, 60); g.lineTo(128, 160); g.stroke(); T.text('ミドリ', w / 2, 200, 44, cream, { weight: 900 }); T.blot(w, h, 12, ['#b5522f', '#7d3a2a'], 3, 14, 0.5); g.restore(); });
  paintK('s-price', 128, 192, 0.75, (g, w, h, T) => { g.fillStyle = '#efe6cf'; g.fillRect(0, 0, w, h); g.fillStyle = '#b5493f'; g.fillRect(0, 0, w, 36); T.text('本日の価格', w / 2, 19, 19, '#f6eeda', { weight: 900 }); [['レギュラー', '一〇八'], ['ハイオク', '一一九'], ['軽油', '八十九']].forEach(([a, b], i) => { T.text(a, w / 2, 58 + i * 48, 16, '#3f6a58', { weight: 800 }); T.text(b, w / 2, 80 + i * 48, 24, ink, { font: T.SERIF, weight: 900 }); }); T.blot(w, h, 16, ['#b5522f', '#7d3a2a'], 2, 13, 0.55); });
  paintK('s-zone', 96, 96, 0.67, (g, w, h, T) => { g.fillStyle = '#dcb84e'; g.beginPath(); g.moveTo(48, 2); g.lineTo(94, 48); g.lineTo(48, 94); g.lineTo(2, 48); g.closePath(); g.fill(); g.strokeStyle = ink; g.lineWidth = 3; g.stroke(); T.text('通学路', 48, 48, 22, ink, { weight: 900 }); T.blot(w, h, 8, ['#b5522f'], 2, 9, 0.5); });
  paintK('s-yflag', 96, 64, 0.67, (g, w, h, T) => { g.fillStyle = '#e8c94e'; g.fillRect(0, 0, w, h); T.text('横断中', w / 2, h / 2 + 1, 26, ink, { weight: 900 }); T.blot(w, h, 5, ['#b89a4a'], 3, 12, 0.4); });
  paintK('s-fire', 72, 300, 0.66, (g, w, h, T) => { g.fillStyle = '#6a4c38'; g.fillRect(0, 0, w, h); T.text('火の用心', w / 2, 44, 58, '#efe2c0', { font: T.SERIF, weight: 900, vertical: true, gap: 1.2 }); T.grain(w, h, 'rgba(40,30,20,.4)', 8); });
  paintK('s-brigade', 256, 56, 0.75, (g, w, h, T) => { g.fillStyle = '#e9e1cb'; g.fillRect(0, 0, w, h); T.text('緑町消防団 第三分団', w / 2, h / 2 + 2, 26, '#a8413a', { font: T.SERIF, weight: 900 }); T.blot(w, h, 6, ['#a89a70'], 3, 12, 0.4); });
  paintK('s-line', 192, 48, 0.72, (g, w, h, T) => { g.fillStyle = '#e4dcc4'; g.fillRect(0, 0, w, h); T.text('保線区 詰所', w / 2, h / 2 + 2, 28, '#3f6a84', { font: T.SERIF, weight: 900 }); T.blot(w, h, 5, ['#b5522f'], 2, 9, 0.5); });
  paintK('s-board', 256, 112, 0.75, (g, w, h, T) => { g.fillStyle = '#3f6a5a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#a98a6a'; g.lineWidth = 8; g.strokeRect(0, 0, w, h); T.text('卒業おめでとう', w / 2, 46, 32, '#efeadb', { font: T.SERIF, weight: 800 }); T.text('また あした', w / 2, 86, 20, '#e8c9a0', { weight: 700 }); T.blot(w, h, 8, ['#5a8070', '#4e7a68'], 6, 26, 0.3); });
  paintK('s-vpost', 112, 400, 0.55, (g, w, h, T) => { g.fillStyle = '#c0483e'; g.fillRect(0, 0, w, h); T.text('〒', w / 2, 66, 84, cream, { weight: 900 }); T.text('郵便局', w / 2, 174, 72, cream, { font: T.SERIF, weight: 900, vertical: true, gap: 1.08 }); T.blot(w, h, 12, ['#8f3a30', '#7d3a2a'], 3, 13, 0.45); });
  paintK('s-pool', 128, 64, 0.75, (g, w, h, T) => { g.fillStyle = '#e9e1cb'; g.fillRect(0, 0, w, h); g.strokeStyle = '#a8413a'; g.lineWidth = 4; g.strokeRect(3, 3, w - 6, h - 6); T.text('飛込禁止', w / 2, h / 2 + 2, 28, '#a8413a', { font: T.SERIF, weight: 900 }); T.blot(w, h, 6, ['#b5522f'], 2, 10, 0.5); });
  for (let n = 1; n <= 4; n++) paintK('s-num' + n, 48, 48, 0.75, (g, w, h, T) => { g.fillStyle = '#ece6d2'; g.fillRect(0, 0, w, h); T.text(String(n), w / 2, h / 2 + 1, 36, '#3f7f88', { weight: 900 }); });

  paintK('s-blade', 72, 220, 1, (g, w, h, T) => { g.fillStyle = '#efe4c4'; g.fillRect(0, 0, w, h); g.fillStyle = '#3f6a84'; g.fillRect(0, 0, w, 12); T.text('文', w / 2, 52, 56, '#3f6a84', { font: T.SERIF, weight: 900 }); T.text('あおば', w / 2, 112, 34, '#3f6a84', { font: T.SERIF, weight: 900, vertical: true, gap: 1.06 }); T.blot(w, h, 8, ['#b5522f'], 2, 9, 0.5); });
  paintK('s-white', 8, 8, 1, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); });
  const O = (() => { // painted into the shared atlas in the old order, with this module's own random stream so the rest of the district stays put
    const tools = (g) => ({
      SERIF, FONT, wash: () => {},
      text: (t, tx, ty, size, col, { font = FONT, weight = 800, align = 'center', vertical = false, gap = 1.08 } = {}) => { g.font = `${weight} ${size}px ${font}`; g.fillStyle = col; g.textAlign = align; g.textBaseline = 'middle'; if (vertical) [...t].forEach((ch, i) => g.fillText(ch, tx, ty + i * size * gap)); else g.fillText(t, tx, ty); },
      blot: (w, h, n, cols, r0, r1, a) => { for (let i = 0; i < n; i++) { g.fillStyle = rng.pick(cols); g.globalAlpha = a * (0.5 + rng() * 0.5); g.beginPath(); g.ellipse(rng() * w, rng() * h, rng.range(r0, r1), rng.range(r0, r1) * 0.7, rng() * 3, 0, 6.3); g.fill(); } g.globalAlpha = 1; },
      grain: (w, h, c, n = 14) => { g.strokeStyle = c; for (let i = 0; i < n; i++) { const yy = rng() * h; g.lineWidth = rng.range(1, 2.4); g.beginPath(); g.moveTo(0, yy); g.bezierCurveTo(w * 0.3, yy + rng.range(-6, 6), w * 0.6, yy + rng.range(-6, 6), w, yy); g.stroke(); } },
    });
    for (const c of own) A.paint(c.name, c.w, c.h, (g) => { g.scale(c.k, c.k); c.draw(g, c.nw, c.nh, tools(g)); });
    return { tex: A.tex, cellUV: A.cellUV, quad: A.quad };
  })();
  const sign = (st, w, h, cell, o = {}) => st.add(O.quad(w, h, cell), 'atlas', o);
  const boardSign = (st, cell, w, h, o = {}) => H.props.sign(st, cell, w, h, o);

  /* ------------------------------------------------------------------ cloth: one mesh, rest pose rewritten on the CPU ----------- */
  const cl = { pos: [], nor: [], uv: [], col: [], idx: [], w: [], ph: [], sheets: [] }, clO = { pos: [], nor: [], uv: [], col: [], idx: [], w: [], ph: [], sheets: [] };
  function cloth({ o, U, D, w, h, nx = 3, ny = 5, cell, u0 = 0, u1 = 1, v0 = 0, v1 = 1, amp = 0.1, tear = 0, N = null, tint = [1, 1, 1], pinU = false }) {
    const P0 = new THREE.Vector3(...o), Uu = new THREE.Vector3(...U).normalize(), Dd = new THREE.Vector3(...D).normalize(), Nn = N ? new THREE.Vector3(...N).normalize() : Uu.clone().cross(Dd).normalize(), isOwn = cell.startsWith('s-'), cl_ = isOwn ? clO : cl, base = cl_.pos.length / 3, ph = rng() * TAU;
    const bottom = Array.from({ length: nx + 1 }, () => 1 - rng() * tear), p = new THREE.Vector3();
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      const a = i / nx, b = (j / ny) * (j === ny ? bottom[i] : 1);
      p.copy(P0).addScaledVector(Uu, a * w).addScaledVector(Dd, b * h);
      cl_.pos.push(p.x, p.y, p.z); cl_.nor.push(Nn.x, Nn.y, Nn.z); cl_.col.push(...tint);
      const [us, vs] = (isOwn ? O : A).cellUV(cell, lerp(u0, u1, a), lerp(v0, v1, b)); cl_.uv.push(us, vs);
      cl_.w.push(Math.pow(pinU ? a : j / ny, 1.25)); cl_.ph.push(ph + j * 0.95 + i * 0.7);
    }
    const r = nx + 1; for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = base + j * r + i, c = a + r; cl_.idx.push(a, c, a + 1, a + 1, c, c + 1); }
    cl_.sheets.push({ i0: base, i1: cl_.pos.length / 3, x: P0.x, z: P0.z, nx: Nn.x, nz: Nn.z, amp });
  }

  /* ------------------------------------------------------------------ rigid pieces on pivots, one mesh ---------------------------- */
  const rg = { pos: [], nor: [], uv: [], col: [], parts: [] }, white = O.cellUV('s-white', 0.5, 0.5);
  function rigid(pivot, axis, angle, geos) {
    const base = rg.pos.length / 3, ax = new THREE.Vector3(...axis).normalize(), c = new THREE.Color();
    for (const { g, color = '#ffffff', cell, uvKeep } of geos) {
      const gg = g.index ? g.toNonIndexed() : g; 
      c.set(color); const P_ = gg.attributes.position, N_ = gg.attributes.normal, U_ = gg.attributes.uv;
      for (let i = 0; i < P_.count; i++) { rg.pos.push(P_.getX(i), P_.getY(i), P_.getZ(i)); rg.nor.push(N_.getX(i), N_.getY(i), N_.getZ(i)); rg.uv.push(...(cell || uvKeep ? [U_.getX(i), U_.getY(i)] : white)); rg.col.push(c.r, c.g, c.b); }
    }
    rg.parts.push({ i0: base, i1: rg.pos.length / 3, px: pivot[0], py: pivot[1], pz: pivot[2], ax: ax.x, ay: ax.y, az: ax.z, angle });
  }
  const gBox = (x0, x1, y0, y1, z0, z1) => kit.box(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  function gRod(a, b, r, seg = 5) {
    const A0 = new THREE.Vector3(...a), B0 = new THREE.Vector3(...b), d = B0.clone().sub(A0), len = d.length(), g = kit.cyl(r, r, len, seg, true);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); g.translate((A0.x + B0.x) / 2, (A0.y + B0.y) / 2, (A0.z + B0.z) / 2); return g;
  }

  /* ------------------------------------------------------------------ small kit of props, each drawn on a Stage ------------------ */
  const RUST = P.rust, RUSTD = P.rustDark;
  function wheelOn(st, x, y, z, r, axis = 'x', col = '#6a5a4c', spokes = 8, rimT = 0.024) {
    st.add(kit.torus(r, rimT, 4, 18), 'worn', { pos: [x, y, z], rot: axis === 'x' ? [0, Q, 0] : [0, 0, 0], color: col });
    for (let i = 0; i < spokes; i++) { const a = (i / spokes) * TAU, c = Math.cos(a) * r, s = Math.sin(a) * r; st.rod(axis === 'x' ? [x, y, z] : [x, y, z], axis === 'x' ? [x, y + s, z + c] : [x + c, y + s, z], 0.007, 'flat', col, 3, 0.007, true); }
    st.add(kit.cyl(r * 0.12, r * 0.12, 0.08, 7), 'worn', { pos: [x, y, z], rot: axis === 'x' ? [0, 0, Q] : [Q, 0, 0], color: col });
  }
  function wheelchair(st) {
    for (const x of [-0.27, 0.27]) { wheelOn(st, x, 0.3, -0.08, 0.3, 'x', '#8d7a68', 10); st.add(kit.torus(0.07, 0.02, 4, 10), 'worn', { pos: [x * 0.9, 0.08, 0.34], rot: [0, Q, 0], color: '#6a6054' }); st.rod([x, 0.5, -0.2], [x, 0.98, -0.3], 0.018, 'worn', P.metal, 5); st.rod([x, 0.98, -0.3], [x, 0.98, -0.45], 0.022, 'flat', '#3f3a3a', 5); st.rod([x, 0.48, -0.2], [x * 0.95, 0.46, 0.28], 0.018, 'worn', P.metal, 5); st.rod([x * 0.95, 0.46, 0.28], [x * 0.9, 0.12, 0.34], 0.018, 'worn', P.metal, 5); st.rod([x, 0.68, -0.25], [x, 0.68, 0.14], 0.016, 'worn', P.metal, 4); }
    st.box(-0.26, 0.26, 0.45, 0.5, -0.2, 0.25, 'flat', '#4e5a5e'); st.box(-0.26, 0.26, 0.56, 0.92, -0.32, -0.28, 'flat', '#4e5a5e');
    st.box(-0.2, 0.2, 0.2, 0.23, 0.34, 0.5, 'worn', P.metalDark);
  }
  function moped(st) { // the rural postman's little red cub
    wheelOn(st, 0, 0.24, 0.56, 0.24, 'x', '#4e5052', 8, 0.034); wheelOn(st, 0, 0.24, -0.56, 0.24, 'x', '#4e5052', 8, 0.034);
    const R = '#c04a3a';
    st.rod([0, 0.26, 0.54], [0, 0.86, 0.34], 0.024, 'worn', P.metal, 5); st.rod([0, 0.74, 0.32], [0, 0.34, -0.1], 0.052, 'worn', R, 7); st.rod([0, 0.34, -0.1], [0, 0.3, -0.54], 0.03, 'worn', R, 5);
    st.add(kit.chip(kit.sphere(0.2, 8, 5), 0.02, rng), 'worn', { pos: [0, 0.42, -0.14], scale: [0.72, 0.62, 1.16], color: '#6f7a7e' });
    st.box(-0.11, 0.11, 0.62, 0.72, -0.5, -0.04, 'flat', '#3f3a3a');
    st.box(-0.04, 0.04, 0.4, 0.62, 0.08, 0.26, 'worn', R); st.rod([-0.3, 0.92, 0.3], [0.3, 0.92, 0.3], 0.02, 'worn', P.metal, 5);
    st.box(-0.2, 0.2, 0.64, 0.92, 0.42, 0.66, 'worn', '#7d6a5a'); st.add(kit.chip(kit.sphere(0.08, 7, 4), 0.01, rng), 'flat', { pos: [0, 0.88, 0.71], color: '#e6dcae' });
    st.box(-0.24, 0.24, 0.72, 1.14, -0.84, -0.42, 'worn', R); st.box(-0.26, 0.26, 1.13, 1.17, -0.86, -0.4, 'worn', RUSTD); st.add(A.quad(0.26, 0.26, 'mark'), 'atlas', { pos: [0, 0.94, -0.839], rot: [0, Math.PI, 0] });
  }
  function postbox(st, h, S) { // the round red pillar box
    st.add(kit.cylBase(0.37, 0.41, 0.1, 14), 'concrete', { color: P.concreteMid });
    st.add(kit.cylBase(0.285, 0.3, 1.1, 16), 'worn', { pos: [0, 0.1, 0], color: '#c9463a' });
    st.add(kit.cyl(0.33, 0.33, 0.05, 16), 'worn', { pos: [0, 1.24, 0], color: '#a23a30' });
    st.add(kit.sphere(0.3, 16, 8), 'worn', { pos: [0, 1.27, 0], scale: [1, 0.52, 1], color: '#c9463a' });
    st.add(kit.cyl(0.32, 0.32, 0.04, 16), 'worn', { pos: [0, 0.2, 0], color: '#8f3a30' });
    st.box(-0.17, 0.17, 0.86, 1.0, 0.255, 0.3, 'flat', '#3a3030'); st.box(-0.2, 0.2, 1.0, 1.04, 0.25, 0.34, 'worn', '#a23a30');
    st.box(-0.11, 0.11, 0.42, 0.68, 0.27, 0.31, 'flat', '#efe6cf'); st.add(A.quad(0.2, 0.2, 'mark'), 'atlas', { pos: [0, 0.55, 0.312] });
  }
  function bucket(st, x, y, z, col = '#b5493f') { st.add(kit.cylBase(0.17, 0.13, 0.26, 9, true), 'worn', { pos: [x, y, z], color: col }); st.add(kit.torus(0.17, 0.012, 3, 12), 'worn', { pos: [x, y + 0.26, z], rot: [Q, 0, 0], color: '#6f7a7e' }); }
  function desk(st, x, z, yaw, tip = 0) {
    const s = st.sub({ pos: [x, 0.3, z], rot: [tip, yaw, 0] });
    s.box(-0.28, 0.28, 0.6, 0.64, -0.18, 0.18, 'wood', '#b89a72');
    for (const [a, b] of [[-0.24, -0.15], [0.24, -0.15], [-0.24, 0.15], [0.24, 0.15]]) s.rod([a, 0, b], [a, 0.6, b], 0.016, 'worn', P.metal, 4);
    s.box(-0.14, 0.14, 0.36, 0.39, -0.46, -0.24, 'wood', '#a98a6a'); for (const [a, b] of [[-0.12, -0.44], [0.12, -0.44], [-0.12, -0.26], [0.12, -0.26]]) s.rod([a, 0, b], [a, 0.36, b], 0.012, 'worn', P.metal, 3);
    s.box(-0.14, 0.14, 0.42, 0.64, -0.46, -0.43, 'wood', '#a98a6a');
  }
  /** Bigger than the kit's forked sapling: a three-mass young tree, drawn in the building's frame. */
  const sapling = (h, x, y, z, ht = 1.8) => { const q = rng.range(-0.22, 0.22), e = rng.range(-0.22, 0.22); h.S.tube([[x, y - 0.05, z], [x + q * 0.5, y + ht * 0.42, z + e * 0.5], [x + q, y + ht * 0.8, z + e]], 0.06, 0.028, 'flat', '#7a6248', 4); for (const [dx, dy, dz, k] of [[0, 0.98, 0, 1], [-0.3, 0.74, 0.14, 0.72], [0.26, 0.78, -0.16, 0.66]]) h.clump([x + q + dx * Math.sqrt(ht), y + ht * dy, z + e + dz * Math.sqrt(ht)], 0.42 * k * Math.sqrt(ht), 0.34 * k * Math.sqrt(ht), Math.round(20 * k * ht), { s: 0.32, core: false }); };
  const scatterFlowers = (st, x0, x1, y0, y1, z0, z1, n, cols) => { for (let i = 0; i < n; i++) st.add(kit.flower(rng.range(0.06, 0.11), 5), 'flat', { pos: [rng.range(x0, x1), rng.range(y0, y1), rng.range(z0, z1)], rot: [rng.range(-0.5, 0.5), rng() * TAU, rng.range(-0.5, 0.5)], color: rng.pick(cols) }); };
  const PINKS = [P.bougain, P.bougainLit, P.flowerWhite], WILD = [P.flowerYellow, P.flowerWhite, P.flowerPurple, P.bougainLit];

  /* ================================================================== s01: the clinic. Mint plaster, a wheelchair left facing the sun ===== */
  {
    const b = byId('s01');
    const h = H.build(b, {
      wall: 'mortar', wallCol: '#a9d0bb', band: { type: 'tile', h: 0.82, col: '#dfeae4' }, roof: 'kawara', shape: 'hip', pitch: 0.46, es: 0.3, ef: 0.42, eb: 0.32, timbers: false,
      tints: ['#5f8088', '#54727a', '#6f9098', '#a0705a'], sign: { cell: 'clinic', y: 2.62, w: 2.1, h: 0.42 }, props: ['drain', 'ac', 'meter'],
      open: (T) => { const { w, d, fl } = T, a = -w / 2 + 0.4, e = w / 2 - 0.4; return { front: [op('door', -0.55, 0.55, fl, fl + 2.08), op('sash', a, -0.95, fl + 0.85, fl + 2.02, { curtain: true }), op('broken', 0.95, e, fl + 0.85, fl + 2.02, { curtain: false })], back: [op('door', e - 0.95, e - 0.1, fl, fl + 1.98), op('boarded', a, a + 0.9, fl + 0.95, fl + 1.85), op('sash', -0.5, 0.5, fl + 0.95, fl + 1.85)], left: [op('sash', -0.5, 0.5, fl + 0.9, fl + 1.9, { curtain: true })], right: [op('broken', -0.5, 0.5, fl + 0.9, fl + 1.9, { curtain: false })] }; },
      decay: { level: 0.34, sag: 0.08, holes: 0, collapse: false, saplings: 0, vines: [{ side: 'right', cover: 0.62 }, { side: 'front', cover: 0.3, u0: -2.4, u1: -1.2 }], bushes: 3 },
    });
    const { w, d, fl } = h.dims, f = h.front;
    sign(f, 0.5, 0.66, 's-hours', { pos: [-0.84, fl + 1.32, 0.012] });
    // the frosted globe lamp over the door, and the step ramp they added late
    f.rod([0.72, fl + 2.26, 0.02], [0.72, fl + 2.26, 0.28], 0.018, 'worn', P.metal, 4); f.add(kit.sphere(0.13, 10, 6), 'flat', { pos: [0.72, fl + 2.14, 0.28], color: '#eef1dc' }); f.add(kit.cyl(0.07, 0.1, 0.05, 8), 'worn', { pos: [0.72, fl + 2.26, 0.28], color: '#6f7a7e' });
    const s = h.S; s.quad([-0.6, gy + 0.02, d / 2 + 0.75], [0.6, gy + 0.02, d / 2 + 0.75], [0.6, fl, d / 2 + 0.05], [-0.6, fl, d / 2 + 0.05], 'concrete', P.concreteMid);
    // the moment: a wheelchair by the broken window, a fern in the seat
    const ch = s.sub({ pos: [1.6, gy, d / 2 + 0.42], rot: [0, 0.22, 0] }); wheelchair(ch);
    const cw = ch.w([0, 0.5, 0.02]), [fxl, fzl] = toL(b, cw.x, cw.z); h.clump([fxl, 0.58, fzl], 0.2, 0.2, 22, { s: 0.3, core: false });
    scatterFlowers(s, 1.2, 2.0, 0.1, 0.55, d / 2 + 0.2, d / 2 + 0.72, 6, WILD);
    // the net curtain that got out through the broken window
    const q = f.w([1.45, fl + 1.98, 0.08]); cloth({ o: q.toArray(), U: f.dir([1, 0, 0]).toArray(), D: [0, -1, 0.1], w: 0.58, h: 1.05, nx: 4, ny: 6, cell: 'curtain2', amp: 0.16, tear: 0.35, N: f.dir([0, 0, 1]).toArray() });
    sapling(h, w / 2 - 0.5, 0.05, -d / 2 - 0.5, 1.8); h.grass(-w / 2 - 0.2, d / 2 + 0.3, 0.5, 26, { h: 0.7 });
    scatterFlowers(h.right, -1.6, 1.6, 0.8, 2.6, 0.14, 0.26, 12, PINKS);
    h.bush(-w / 2 - 0.4, 0.5, 0.75);
  }

  /* ================================================================== s02: the post office. Flat parapet, tile skirt, a round red box, the last round's letters ===== */
  {
    const b = byId('s02');
    const h = H.build(b, {
      wall: 'mortar', wallCol: '#d9cdb4', band: { type: 'tile', h: 0.62, col: '#c9dcd6' }, roof: 'flat', es: 0, ef: 0, eb: 0, f2Off: true, timbers: false, foundationH: 0.26, sign: { cell: 'post', y: 2.7, w: 2.5, h: 0.5 }, vsign: null, props: ['drain', 'box'],
      open: (T) => { const { w, fl } = T; return { front: [op('sliding', -0.82, 0.82, fl, fl + 2.08), op('sash', -w / 2 + 0.34, -1.05, fl + 0.85, fl + 2.05, { curtain: false }), op('sash', 1.05, w / 2 - 0.34, fl + 0.85, fl + 2.05, { curtain: true })], back: [op('door', -w / 2 + 0.4, -w / 2 + 1.3, fl, fl + 2), op('bars', 0.2, 1.3, fl + 1.1, fl + 2)], left: [op('sash', -0.5, 0.5, fl + 0.95, fl + 1.95, { curtain: false })], right: [op('boarded', -0.5, 0.5, fl + 0.95, fl + 1.95)] }; },
      decay: { level: 0.5, holes: 1, collapse: false, saplings: 1, vines: [{ side: 'left', cover: 0.7 }, { side: 'back', cover: 0.55 }], bushes: 3 },
    });
    const { w, d, h: hh } = h.dims, s = h.S;
    { const sx = -(w / 2 - 0.1), y = Math.min(h.dims.eaveY - 0.25, 3.5); boardSign(h.front, 's-vpost', 0.4, 1.34, { pos: [sx, y - 0.25, 0.46], rot: [0, 0.08, 0], board: '#6e5038' }); h.front.box(sx - 0.02, sx + 0.02, y + 0.3, y + 0.42, 0, 0.5, 'worn', '#6f7a7e'); }
    // the box stands where the walk meets the road. Read from the carriageway, not by eye.
    let zb = d / 2 + 0.5; while (zb > d / 2 + 0.3 && layout.roadDist(b.x + 1.72, b.z + zb, ringS) < 0.38) zb -= 0.02;
    const pb = s.sub({ pos: [1.72, gy, zb], rot: [0, -0.14, 0] }); postbox(pb);
    h.clump([1.72, 1.55, zb], 0.24, 0.1, 12, { s: 0.22, core: false }); h.clump([1.72 + 0.06, 1.0, zb + 0.34], 0.14, 0.14, 9, { s: 0.2, core: false }); h.grass(1.72, zb, 0.42, 16, { h: 0.5 });
    // the last round: bundles and loose letters on the step
    for (let i = 0; i < 16; i++) { const x = rng.range(-1.05, 1.05), z = d / 2 + rng.range(0.12, 0.72), a = rng() * TAU, u = rng.range(0.1, 0.15), v = u * 0.62, sub = s.sub({ pos: [x, gy + 0.024 + i * 0.0006, z], rot: [rng.range(-0.08, 0.08), a, rng.range(-0.08, 0.08)] }); sub.quad([-u, 0, v], [u, 0, v], [u, 0, -v], [-u, 0, -v], 'flat', rng.pick(['#efe9d9', '#e6dcbe', '#f0e6d0', '#d9e0c9'])); }
    const bn = s.sub({ pos: [-0.5, gy, d / 2 + 0.5], rot: [0, 0.4, 0] }); bn.box(-0.22, 0.22, 0, 0.16, -0.14, 0.14, 'flat', '#e9dfc6'); bn.box(-0.23, 0.23, 0.05, 0.08, -0.15, 0.15, 'flat', '#a8895e');
    // the postman's red moped, in the gap by the east wall
    const m = s.sub({ pos: [w / 2 + 0.95, gy, 0.6], rot: [0, -0.2, 0.2] }); moped(m);
    h.bush(w / 2 + 1.3, -0.3, 0.55); h.grass(w / 2 + 0.95, 0.4, 0.9, 40, { h: 0.7 });
    // on the flat roof a bent aerial and a water box, for the outline
    s.rod([-1.5, hh - 0.3, -0.8], [-1.46, hh + 1.4, -0.8], 0.028, 'worn', P.metal, 5); for (let i = 0; i < 4; i++) s.rod([-1.9 + i * 0.05, hh + 0.75 + i * 0.2, -0.8], [-1.02 - i * 0.05, hh + 0.75 + i * 0.2, -0.8], 0.012, 'worn', P.metal, 3);
    s.box(1.1, 1.75, hh - 0.32, hh + 0.28, -1.1, -0.45, 'worn', '#a8b4b4'); for (const a of [[1.15, -1.05], [1.7, -1.05], [1.15, -0.5], [1.7, -0.5]]) s.rod([a[0], hh - 0.35, a[1]], [a[0], hh - 0.15, a[1]], 0.02, 'worn', P.metalDark, 4);
  }

  /* ================================================================== s03: the stationery and sweet shop at the school gate. A signboard front, a torn awning ===== */
  {
    const b = byId('s03');
    const h = H.build(b, {
      party: [], wall: 'board', wallCol: '#8a6e58', sides: { left: 'tinsheet', right: 'board' }, roof: 'kawara', pitch: 0.4, es: 0.1, ef: 0.32, eb: 0.28, falseFront: 3.72, hisashi: false, timbers: false, foundationH: 0.18, sign: { cell: 'h09', y: 2.92, w: 2.5, h: 0.52 }, vsign: null, props: ['drain', 'meter', 'crates'],
      tints: ['#a4674e', '#935a44', '#b67a5c', '#7a8e9c'],
      open: (T) => { const { w, fl } = T, a = -w / 2 + 0.2, e = w / 2 - 0.2, top = fl + 2.1; return { front: [op('shop', a, 0.6, fl + 0.02, top, { smashed: 1 }), op('sliding', 0.72, e, fl, top)], back: [op('door', a + 0.1, a + 1, fl, fl + 1.95), op('sash', 0.2, 1.1, fl + 0.95, fl + 1.8)], left: [], right: [op('sash', -0.5, 0.45, fl + 0.95, fl + 1.85, { curtain: false })] }; },
      decay: { level: 0.42, holes: 1, collapse: false, saplings: 1, vines: [{ side: 'left', cover: 0.7 }], bushes: 2 },
    });
    const { w, d, fl } = h.dims, f = h.front, s = h.S, top = fl + 2.1;
    // the shelves behind the glass, laid over the kit's own (its goods2 cell runs into the clock and mark cells of the atlas): exercise books and sweets
    { const a = -w / 2 + 0.2, e = 0.6, mx = (a + e) / 2, wd = e - a, D = Math.min(1.2, d * 0.3); for (let i = 0; i < 3; i++) f.add(A.quad(wd - 0.12, 0.54, 'goods' + (i % 2)), 'atlas', { pos: [mx, fl + 0.36 + i * 0.62 + 0.27, -D + 0.036] }); }
    // the awning: stiff stripes on a pipe frame with one bay torn and hanging
    const awnA = f.w([-w / 2 + 0.1, top + 0.28, 0.02]).toArray(), U = f.dir([1, 0, 0]).toArray(), Da = f.dir([0, -0.42, 0.9]).toArray(), n = f.dir([0, 0.9, 0.42]).toArray();
    cloth({ o: awnA, U, D: Da, w: w - 0.2, h: 0.86, nx: 8, ny: 3, cell: 'stripe', amp: 0.018, tear: 0.03, N: n });
    const v0 = f.w([-w / 2 + 0.1, top + 0.28 - 0.42 * 0.86, 0.9 * 0.86 + 0.02]).toArray();
    cloth({ o: v0, U, D: [0, -1, 0], w: 1.1, h: 0.42, nx: 4, ny: 3, cell: 'stripe2', amp: 0.08, tear: 0.2, N: f.dir([0, 0, 1]).toArray() });
    for (const x of [-w / 2 + 0.12, w / 2 - 0.12]) f.rod([x, top + 0.28, 0], [x, top + 0.28 - 0.36, 0.78], 0.016, 'worn', '#6f7a7e', 4);
    // the shop front: a soft-drink chest with moss on it, a capsule machine, a low bench for after school
    const cf = s.sub({ pos: [-0.85, gy, d / 2 + 0.42] }); cf.box(-0.5, 0.5, 0.05, 0.72, -0.26, 0.26, 'worn', '#6f9fb0'); cf.box(-0.5, 0.5, 0.72, 0.78, -0.28, 0.28, 'worn', '#e9e4d0'); cf.rect(-0.42, 0.42, 0.14, 0.62, 0.262, 'flat', '#d9e4d4');
    for (const x of [-0.46, 0.46]) cf.box(x - 0.03, x + 0.03, 0, 0.05, -0.22, 0.22, 'worn', P.metalDark);
    h.clump([-0.85, 0.86, d / 2 + 0.42], 0.42, 0.12, 22, { s: 0.22, core: false });
    const cap = s.sub({ pos: [1.25, gy, d / 2 + 0.34] }); cap.box(-0.2, 0.2, 0, 0.58, -0.17, 0.17, 'worn', '#c0483e'); cap.add(kit.sphere(0.22, 10, 6), 'glass', { pos: [0, 0.8, 0] }); cap.add(kit.cyl(0.24, 0.24, 0.05, 10), 'worn', { pos: [0, 0.6, 0], color: '#d9bb58' });
    // a tin sign on one bracket, knocking gently
    const sp = f.w([w / 2 - 0.08, top + 0.68, 0.44]).toArray();
    rigid(sp, f.dir([1, 0, 0]).toArray(), (t) => 0.06 * ctx.wind(t, b.x, b.z) + 0.02 * Math.sin(t * 1.9), [
      { g: gBox(-0.03, 0.03, -0.02, 0.0, -0.2, 0.2), color: '#6f7a7e' },
      { g: gBox(-0.012, 0.012, -1.14, -0.02, -0.17, 0.17), color: '#5e4634' },
      { g: O.quad(0.36, 1.1, 's-blade').rotateY(Q).translate(0.014, -0.58, 0), uvKeep: true },
    ]);
    // the crossing flags the mothers kept by the kerb
    const fx = -1.35, fz = d / 2 + 0.42; s.rod([fx, gy, fz], [fx, gy + 0.72, fz], 0.05, 'worn', '#8d9ba4', 7); s.add(kit.cyl(0.08, 0.06, 0.1, 8, true), 'worn', { pos: [fx, gy + 0.76, fz], color: '#6f7a7e' });
    [[-0.05, -0.04, 1.42], [0.05, 0.02, 1.28], [-0.02, 0.05, 1.5]].forEach(([dx, dz, l], i) => { const a = [fx + dx, gy + 0.3, fz + dz], e = [fx + dx * 3 + (i - 1) * 0.22, gy + l, fz + dz * 2.5]; s.rod(a, e, 0.011, 'wood', '#e0cf9c', 4); const o = s.w(e).toArray(); cloth({ o, U: [1, 0, 0], D: [0, -1, 0], w: 0.36, h: 0.24, nx: 3, ny: 2, cell: 's-yflag', amp: 0.05, pinU: true, N: [0, 0, 1] }); });
    h.bush(w / 2 + 0.3, d / 2 - 0.2, 0.6); h.grass(0.2, d / 2 + 0.7, 1.3, 24, { h: 0.5, rz: 0.4 });
  }

  /* ================================================================== s04: the line-man's cottage by the crossing. A tin sheet with one nail left ===== */
  {
    const b = byId('s04');
    const h = H.build(b, {
      wall: 'board', sides: { right: 'tinsheet' }, roof: 'tin', tints: ['#b5522f', '#a24a2e', '#c9683f', '#7d3a2a'], shape: 'gable', ridge: 'x', pitch: 0.56, es: 0.28, ef: 0.42, eb: 0.36, timbers: false, porch: false, band: { type: 'mortar', h: 0.55, col: '#a9a596' }, props: ['drain', 'gas', 'crates'],
      open: (T) => { const { w, d, fl } = T; return { front: [op('door', -w / 2 + 0.42, -w / 2 + 1.34, fl, fl + 1.98, { col: '#6f9fb0' }), op('sash', 0.0, w / 2 - 0.4, fl + 0.9, fl + 1.85, { curtain: true })], back: [op('boarded', -0.5, 0.5, fl + 1, fl + 1.85)], left: [op('sash', -0.42, 0.42, fl + 0.95, fl + 1.85)], right: [] }; },
      decay: { level: 0.56, sag: 0.16, moss: 0.34, holes: [{ slope: 'back', u: 0.4, v: 0.5, ru: 0.2, rv: 0.34 }], collapse: false, saplings: 1, vines: [{ side: 'back', cover: 0.7 }, { side: 'left', cover: 0.45 }], bushes: 3 },
    });
    const { w, d, h: hh, eaveY, fl } = h.dims, s = h.S, f = h.front;
    sign(f, 0.82, 0.2, 's-line', { pos: [0.65, fl + 2.08, 0.02] });
    // spare sleepers stacked along the wall, grey and split
    for (let i = 0; i < 5; i++) { const y = gy + (i > 2 ? 0.2 : 0) + 0.1, col = i > 2 ? i - 3 : i, x = -w / 2 - 0.34 - col * 0.28 - (i > 2 ? 0.14 : 0); s.box(x - 0.13, x + 0.13, y - 0.1, y + 0.1, -0.95, 0.85, 'wood', i % 2 ? '#8a7a66' : '#7a6a58'); }
    h.grass(-w / 2 - 0.5, 1.1, 0.5, 18, { h: 0.6, rz: 0.35 });
    // the hand lamp he left on the hook
    const lp = f.w([-w / 2 + 1.55, fl + 1.84, 0.24]).toArray(), R = '#c04a3a';
    f.rod([-w / 2 + 1.55, fl + 1.86, 0], [-w / 2 + 1.55, fl + 1.86, 0.25], 0.012, 'worn', P.metal, 3);
    rigid(lp, f.dir([1, 0, 0]).toArray(), (t) => 0.1 * ctx.wind(t, b.x, b.z) + 0.03 * Math.sin(t * 2.1), [
      { g: gRod([0, 0, 0], [0, -0.14, 0], 0.01, 3), color: '#4e5a5e' }, { g: kit.cyl(0.075, 0.09, 0.22, 8).translate(0, -0.25, 0), color: R }, { g: kit.cyl(0.04, 0.075, 0.07, 8).translate(0, -0.11, 0), color: '#6a3a30' }, { g: kit.cyl(0.05, 0.05, 0.08, 8).translate(0.08, -0.26, 0).rotateZ(Q).translate(0, -0.34, 0), color: '#efe4b0' },
    ]);
    // the loose tin sheet: pivots on its one remaining nail along the upper edge of the front slope
    const ef = h.spec.ef, slopeLen = Math.hypot(d / 2 + ef, hh - eaveY), sz = 0.55, x0 = 0.1, x1 = 0.95, dirD = [0, -(hh - eaveY) / slopeLen, (d / 2 + ef) / slopeLen], a = sz, y1 = hh - (a * (hh - eaveY)) / slopeLen + 0.08, z1 = (a * (d / 2 + ef)) / slopeLen;
    const pvt = s.w([(x0 + x1) / 2, y1, z1]).toArray(), lenS = 1.05, g = new THREE.BufferGeometry(), hw = (x1 - x0) / 2, nn = 12, pos = [], nor = [], uv = [], idx = [];
    for (let i = 0; i <= nn; i++) for (const sg of [-1, 1]) { const u = (i / nn) * 2 - 1, up = i % 2 ? 1 : -1, tilt = i % 2 ? 0.34 : -0.34; pos.push(u * hw, 0.018 * up + dirD[1] * (sg > 0 ? lenS : 0), dirD[2] * (sg > 0 ? lenS : 0)); nor.push(tilt, dirD[2], -dirD[1]); uv.push(...white); }
    for (let i = 0; i < nn; i++) { const q = i * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); } g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    g.rotateY(b.yaw);
    rigid(pvt, f.dir([1, 0, 0]).toArray(), (t) => -0.02 - 0.09 * Math.max(0, ctx.wind(t, b.x + 1, b.z)) - 0.012 * Math.sin(t * 3.1), [{ g, color: '#b86a44' }]);
    s.rod([x0, y1 - 0.03, z1 - 0.1], [x0, y1 + 0.03, z1 - 0.1], 0.012, 'flat', '#4e5a5e', 3);
    sapling(h, -w / 2 + 0.7, gy, -d / 2 - 0.6, 2.0);
  }

  /* ================================================================== s05: the filling station. Kit canopy and kiosk; a tree up through the apron, and the brand on a tall pole ===== */
  {
    const b = byId('s05');
    const h = H.build(b, { decay: { level: 0.5 } });
    const { w, d } = h.dims, s = h.S, hh = b.h;
    // the pumps get their glass globes and the islands a rust stain
    for (const x of [0.8, w / 2 - 1.5]) for (const z of [0.18, -0.25]) { s.add(kit.sphere(0.12, 8, 6), 'flat', { pos: [x, 1.46, z], color: '#ebe6cd' }); s.add(kit.cyl(0.14, 0.17, 0.05, 8), 'worn', { pos: [x, 1.34, z], color: '#b5493f' }); }
    // the tree: it came up where the kiosk's apron was thinnest. Roots lift the slabs, the crown leans out over the canopy's end.
    const tx = -3.05, tz = 1.82, trunkTop = [[tx, 0, tz], [tx + 0.05, 1.2, tz - 0.02], [tx + 0.34, 2.6, tz - 0.3], [tx + 0.72, 4.05, tz - 0.42], [tx + 0.92, 5.2, tz - 0.55]];
    s.tube(trunkTop, 0.38, 0.16, 'flat', '#7b604a', 8, 22);
    for (const [ax, ay, az, bx, by, bz, r0] of [[tx + 0.34, 2.6, tz - 0.3, tx - 1.15, 4.25, tz + 0.32, 0.12], [tx + 0.72, 4.05, tz - 0.42, tx + 2.3, 4.85, tz - 1.05, 0.1], [tx + 0.82, 4.8, tz - 0.5, tx + 0.15, 5.9, tz + 0.5, 0.08], [tx + 0.88, 4.9, tz - 0.55, tx + 1.9, 6.1, tz - 0.05, 0.07]]) s.tube([[ax, ay, az], [(ax + bx) / 2 + 0.1, (ay + by) / 2 + 0.2, (az + bz) / 2], [bx, by, bz]], r0, 0.03, 'flat', '#6e5642', 6, 12);
    const roots = [[-1.2, 0.4], [-0.5, 1.15], [0.9, 0.2], [1.1, 0.95], [0.3, -0.9], [-0.95, -0.55]];
    for (const [rx, rz] of roots) s.tube([[tx, 0.28, tz], [tx + rx * 0.4, 0.2, tz + rz * 0.4], [tx + rx * 0.8, 0.14, tz + rz * 0.8], [tx + rx * 1.15, 0.02, tz + rz * 1.15]], 0.15, 0.03, 'flat', '#6e5642', 6, 10);
    // the slabs it lifted
    for (const [cx, cz, sw, sd, y, rx, ry, rz] of [[-0.95, 0.5, 1.15, 0.9, 0.22, 0.2, 0.2, -0.14], [0.85, 0.55, 1.0, 1.05, 0.19, -0.05, -0.15, 0.22], [-0.2, -0.85, 1.3, 0.75, 0.16, -0.17, 0.05, 0.08], [1.3, -0.7, 0.8, 0.7, 0.14, -0.1, 0.25, 0.12]]) { const q = s.sub({ pos: [tx + cx, y, tz + cz], rot: [rx, ry, rz] }); q.box(-sw / 2, sw / 2, -0.09, 0.09, -sd / 2, sd / 2, 'concrete', P.concreteMid); q.box(-sw / 2 + 0.05, sw / 2 - 0.05, 0.09, 0.095, -sd / 2 + 0.05, sd / 2 - 0.05, 'flat', '#d0ccbe'); }
    const lobes = [[-2.15, 5.5, 1.3, 2.3, 1.45, 150], [-0.75, 5.0, 0.6, 2.0, 1.15, 110], [-3.35, 4.7, 1.0, 1.55, 1.15, 90], [-1.95, 6.5, 0.5, 1.7, 0.95, 90], [-3.4, 3.9, 0.3, 1.4, 0.9, 60], [-0.4, 4.1, 0.05, 1.3, 0.7, 50], [-2.65, 5.8, -1.0, 1.5, 0.95, 70]];
    for (const [x, y, z, rx, ry, n] of lobes) h.clump([x, y, z], rx, ry, Math.round(n * 1.6), { s: 0.38 });
    h.grass(tx, tz, 1.6, 60, { y: 0.14, h: 0.7 });
    // the tall pole: emblem above, prices on a hanger below (one chain left, so it knocks about)
    const px = -4.2, poleH = 4.75; // lower than the old 6.3, so from the low camera the emblem lands on the station's own tree, not on the banyan behind it
    let pz = d / 2 + 0.42; while (pz > d / 2 - 0.4 && layout.roadDist(b.x + px, b.z + pz, ringS) < 0.42) pz -= 0.02; s.add(kit.cylBase(0.32, 0.36, 0.26, 10), 'concrete', { pos: [px, gy - 0.02, pz], color: P.concreteMid });
    s.rod([px, 0.1, pz], [px, poleH - 0.1, pz], 0.08, 'worn', '#a8b4b4', 8);
    const em = s.sub({ pos: [px, poleH, pz], rot: [0, 0.26, 0] });
    // the board is a drum with an emblem disc for each face; rim vertices line up, and the drum needs no caps of its own
    const emblem = () => { const g = new THREE.CircleGeometry(0.84, 22, -Q), p = g.attributes.position, uv = g.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, ...O.cellUV('s-brand', 0.5 + (p.getX(i) / 0.84) * 0.485, 0.5 - (p.getY(i) / 0.84) * 0.485)); return g; };
    em.add(kit.cyl(0.84, 0.84, 0.12, 22, true), 'worn', { rot: [Q, 0, 0], color: '#2f8a5e' }); em.add(emblem(), 'atlas', { pos: [0, 0, 0.06] }); em.add(emblem(), 'atlas', { pos: [0, 0, -0.06], rot: [0, Math.PI, 0] });
    em.rod([0, -0.86, 0], [0, -1.3, 0], 0.045, 'worn', '#8d9ba4', 6);
    em.box(-0.64, 0.64, -1.38, -1.3, -0.04, 0.04, 'worn', '#6f7a7e');
    const pp = em.w([-0.5, -1.38, 0]).toArray();
    rigid(pp, em.dir([0, 0, 1]).toArray(), (t) => -0.32 + 0.1 * ctx.wind(t, b.x + 4, b.z + 3) + 0.035 * Math.sin(t * 1.4), [
      { g: gBox(-0.03, 0.9, -1.04, -0.08, -0.03, 0.03).applyMatrix4(new THREE.Matrix4().makeRotationY(0.26)), color: '#5e6a6e' },
      { g: O.quad(0.82, 0.86, 's-price').translate(0.46, -0.56, 0.034).applyMatrix4(new THREE.Matrix4().makeRotationY(0.26)), uvKeep: true },
      { g: gRod([0, 0, 0], [0, -0.08, 0], 0.012, 3).applyMatrix4(new THREE.Matrix4().makeRotationY(0.26)), color: '#3a3f42' },
    ]);
    // the things a station accumulates: stacked tyres, an oil-can pyramid, a drum for the rain
    const yard = s.sub({ pos: [-4.1, 0.1, 2.15] }); [0, 1, 2].forEach((i) => yard.add(kit.torus(0.34, 0.14, 6, 14), 'flat', { pos: [0.03 * i, 0.13 + i * 0.25, 0.04 * i], rot: [Q, 0, 0], color: '#3f4246' }));
    const drum = s.sub({ pos: [-4.92, 0.1, 1.9], rot: [0, 0.4, 0] }); drum.add(kit.cylBase(0.32, 0.32, 0.92, 12), 'worn', { color: '#3f7f88' }); for (const y of [0.28, 0.62]) drum.add(kit.cyl(0.335, 0.335, 0.04, 12, true), 'worn', { pos: [0, y, 0], color: '#2f6a70' });
    for (let lay = 0; lay < 3; lay++) for (let i = 0; i < 3 - lay; i++) { const x = 0.62 + (i + lay * 0.5) * 0.22, y = 0.1 + lay * 0.26; s.add(kit.cylBase(0.095, 0.095, 0.25, 8), 'worn', { pos: [-2.0 + x, y, 2.65], color: lay % 2 ? '#d9bb58' : '#c98a5a' }); }
    // the kiosk, given a bit more than the kit's box: glazed tile skirt, a band of side windows, a parapet's worth of canopy edge
    { const kx0 = -w / 2 + 0.2, kx1 = -w / 2 + 3.6, kz0 = -d / 2 + 0.2, kz1 = -d / 2 + 3.8, tc = '#9fb9ae', cap = '#6f8a84', t0 = 0.1, t1 = 1.02;
      s.box(kx1, kx1 + 0.03, t0, t1, kz0 + 0.02, kz1 - 0.02, 'tile', tc); s.box(kx0 - 0.03, kx0, t0, t1, kz0 + 0.02, kz1 - 0.02, 'tile', tc); s.box(kx0, kx1, t0, t1, kz0 - 0.03, kz0, 'tile', tc);
      s.box(kx1, kx1 + 0.05, t1, t1 + 0.05, kz0, kz1, 'flat', cap); s.box(kx0 - 0.05, kx0, t1, t1 + 0.05, kz0, kz1, 'flat', cap); s.box(kx0 - 0.05, kx1 + 0.05, t1, t1 + 0.05, kz0 - 0.05, kz0, 'flat', cap);
      const band = (x, sg, z0, z1, n) => { const y0 = 1.32, y1 = 2.42, fx = x + sg * 0.012, f2 = '#6f8088', q = (x + sg * 0.03); s.quad([fx, y0, sg > 0 ? z1 : z0], [fx, y0, sg > 0 ? z0 : z1], [fx, y1, sg > 0 ? z0 : z1], [fx, y1, sg > 0 ? z1 : z0], 'flat', '#33474d');
        for (let i = 0; i < n; i++) { if (i === 1) continue; const a = lerp(z0, z1, i / n) + 0.04, e = lerp(z0, z1, (i + 1) / n) - 0.04, c = i % 2 ? '#7fa0a6' : '#8fb0b2', xg = x + sg * 0.02; s.quad([xg, y0 + 0.04, sg > 0 ? e : a], [xg, y0 + 0.04, sg > 0 ? a : e], [xg, y1 - 0.04, sg > 0 ? a : e], [xg, y1 - 0.04, sg > 0 ? e : a], 'flat', c); }
        s.box(Math.min(x, q), Math.max(x, q), y0 - 0.06, y0, z0 - 0.04, z1 + 0.04, 'worn', f2); s.box(Math.min(x, q), Math.max(x, q), y1, y1 + 0.06, z0 - 0.04, z1 + 0.04, 'worn', f2); for (let i = 0; i <= n; i++) { const zz = lerp(z0, z1, i / n); s.box(Math.min(x, q), Math.max(x, q), y0, y1, zz - 0.022, zz + 0.022, 'worn', f2); } };
      band(kx1, 1, kz0 + 0.4, kz0 + 2.75, 4); band(kx0, -1, kz0 + 0.3, kz0 + 1.5, 2);
      // oil drums against the kiosk's forecourt side, one on its side
      const oil = (x, z, col, rx = 0, y = 0.1) => { const q = s.sub({ pos: [x, y, z], rot: [rx, rng() * 3, 0] }); q.add(kit.cylBase(0.3, 0.3, 0.88, 11), 'worn', { color: col }); for (const yy of [0.29, 0.59]) q.add(kit.cyl(0.315, 0.315, 0.035, 11, true), 'worn', { pos: [0, yy, 0], color: '#5e6a6e' }); q.add(kit.cyl(0.27, 0.27, 0.012, 11), 'worn', { pos: [0, 0.885, 0], color: '#3f4a4e' }); };
      oil(kx1 + 0.42, kz0 + 0.42, '#b5493f'); oil(kx1 + 0.42, kz0 + 1.1, '#2f8a5e'); oil(kx1 + 1.02, kz0 + 0.62, '#c9a24e'); oil(kx1 + 0.95, kz0 + 1.55, P.rust, Q * 0.98, 0.42);
      // a proper canopy edge: a deep fascia round all four sides, red over cream, stood proud of the kit's thin slab
      const cy = hh - 0.28, cx0 = -1.2, cx1 = w / 2 - 0.1, cz0 = -d / 2 + 0.3, cz1 = d / 2 - 0.1, o = 0.16, red = '#b5493f', crm = '#e8dfc8', ring = (ya, yb, c) => { s.box(cx0 - o, cx1 + o, ya, yb, cz1 + 0.03, cz1 + o, 'worn', c); s.box(cx0 - o, cx1 + o, ya, yb, cz0 - o, cz0 - 0.03, 'worn', c); s.box(cx0 - o, cx0 - 0.03, ya, yb, cz0 - 0.03, cz1 + 0.03, 'worn', c); s.box(cx1 + 0.03, cx1 + o, ya, yb, cz0 - 0.03, cz1 + 0.03, 'worn', c); };
      ring(cy + 0.16, cy + 0.44, red); ring(cy - 0.12, cy + 0.16, crm); H.props.sign(s, 'gas', 2.6, 0.26, { pos: [(cx0 + cx1) / 2, cy + 0.3, cz1 + o + 0.02], board: red }); }
    // a strip of soffit that came loose and swings from the canopy's rear edge
    const gp = s.w([3.1, hh - 0.34, -1.6]).toArray();
    rigid(gp, [1, 0, 0], (t) => 0.5 + 0.08 * ctx.wind(t, b.x, b.z - 2), [{ g: gBox(-0.55, 0.55, -0.9, 0, -0.012, 0.012), color: '#e8e0ca' }]);
    s.rod([1.2, 0.1, 2.35], [1.2, 1.15, 2.42], 0.02, 'worn', '#a8b4b4', 5); s.add(kit.chip(kit.sphere(0.13, 8, 5), 0.02, rng), 'worn', { pos: [1.2, 1.15, 2.42], color: '#c04a3a' });
    h.grass(2.6, 2.4, 2, 34, { y: 0.1, h: 0.5, rz: 0.4 });
    // the canopy roof has held its own soil for years
    const cTop = hh + 0.06; for (const [cx, cz, rx, rz] of [[0.4, -1.4, 1.5, 1.05], [3.5, 1.5, 1.2, 1.0], [2.0, -0.2, 0.9, 0.7], [4.2, -1.8, 0.7, 0.8]]) { s.add(kit.chip(kit.sphere(1, 8, 4), 0.1, rng), 'flat', { pos: [cx, cTop, cz], scale: [rx, 0.07, rz], color: rng() < 0.5 ? P.moss : P.mossDeep }); h.grass(cx, cz, rx * 0.8, 18, { y: cTop, h: 0.42, rz: rz * 0.8 }); }
    h.clump([3.9, cTop + 0.28, 1.2], 0.55, 0.3, 24, { s: 0.32 });
  }

  /* ================================================================== s06: the wooden school. One long storey, a corridor of windows on both faces, a clock that stopped ===== */
  const school = byId('s06');
  let schoolH;
  {
    const b = school, w0 = b.w, bays = (x0, x1, n, y0, y1, broken = []) => centres(x0, x1, n).map((x, i) => { const half = (x1 - x0) / n / 2 - 0.05; return op(broken.includes(i) ? 'broken' : 'sash', x - half, x + half, y0, y1, { curtain: false }); });
    const h = schoolH = H.build(b, {
      wall: 'board', wallCol: '#9a7a5e', band: { type: 'board', h: 0.92, col: '#7a6450' }, roof: 'kawara', detail: 'hi', ridge: 'x', pitch: 0.5, es: 0.3, ef: 0.5, eb: 0.5, eaveY: 3.28, f2Off: true, timbers: false, porch: true, foundationH: 0.3,
      tints: ['#6b7f8c', '#5e7380', '#7c909c', '#8c6a58'],
      open: (T) => { const { fl } = T, y0 = fl + 0.92, y1 = fl + 2.62, half = T.w / 2 - 0.42;
        return { front: [op('sliding', -0.78, 0.78, fl, fl + 2.08), ...bays(-half, -2.05, 5, y0, y1, [1]), ...bays(2.05, half, 5, y0, y1, [3])],
          back: bays(-half, half, 11, y0, y1, [2, 3, 7]), left: [op('sash', -0.6, 0.6, y0, y1, { curtain: false })], right: [op('door', -0.5, 0.5, fl, fl + 2.05), op('sash', -d0(T), -0.75, y0, y1, { curtain: false })] }; },
      decay: { level: 0.42, sag: 0.12, holes: 2, collapse: { corner: 'bl', r: 2.9 }, moss: 0.26, saplings: 0, vines: [{ side: 'left', cover: 0.72 }, { side: 'back', cover: 0.42, u0: -8.2, u1: -4.4 }], bushes: 6, grass: 0.9 },
      props: ['drain', 'drain', 'gas'],
    });
    function d0(T) { return T.d / 2 - 0.35; }
    const { w, d, h: hh, fl, eaveY } = h.dims, s = h.S;
    // the clock turret on the ridge: seen from the yard and from the plinth edge alike
    const y0 = hh - 0.5, y1 = hh + 0.85, cw = 0.72, cd = 0.6;
    s.box(-cw, cw, y0, y1, -cd, cd, 'wood', '#a68a68'); s.box(-cw - 0.06, cw + 0.06, y1 - 0.06, y1 + 0.04, -cd - 0.06, cd + 0.06, 'wood', '#6e5038'); s.box(-cw - 0.03, cw + 0.03, y0 + 0.5, y0 + 0.56, -cd - 0.03, cd + 0.03, 'wood', '#6e5038');
    const rt = hh + 1.48; for (const [a, e] of [[[-cw - 0.2, -cd - 0.2], [cw + 0.2, -cd - 0.2]], [[cw + 0.2, -cd - 0.2], [cw + 0.2, cd + 0.2]], [[cw + 0.2, cd + 0.2], [-cw - 0.2, cd + 0.2]], [[-cw - 0.2, cd + 0.2], [-cw - 0.2, -cd - 0.2]]]) s.quad([a[0], y1 + 0.03, a[1]], [e[0], y1 + 0.03, e[1]], [0, rt, 0], [0, rt, 0], 'worn', '#b5522f');
    s.rod([0, rt - 0.05, 0], [0, rt + 0.55, 0], 0.022, 'worn', P.metal, 5); s.add(kit.sphere(0.07, 7, 5), 'worn', { pos: [0, rt + 0.55, 0], color: '#d9bb58' });
    for (const sg of [1, -1]) s.add(A.quad(0.98, 0.98, 'clock'), 'atlas', { pos: [0, y1 - 0.62, sg * (cd + 0.012)], rot: [0, sg > 0 ? 0 : Math.PI, 0] });
    // the school's name, over the porch
    h.porchSign('school', 1.9, 0.38);
    // stove pipes through the roof, one per classroom
    for (const x of [-5.6, -1.9, 2.4, 6.2]) { const dz = -1.3; s.rod([x, eaveY + 0.3, dz], [x, hh + 0.5, dz], 0.075, 'worn', '#4e5a5e', 7); s.add(kit.cyl(0.14, 0.09, 0.1, 7), 'worn', { pos: [x, hh + 0.56, dz], color: '#3f474c' }); s.add(kit.cyl(0.1, 0.15, 0.1, 7), 'worn', { pos: [x, eaveY + 0.32, dz], color: '#3f474c' }); }
    // through the fallen corner: rows of desks, and the board the last class left
    const inner = s.sub({ pos: [-6.5, 0, -0.08], rot: [0, Math.PI, 0] }); sign(inner, 2.3, 1.0, 's-board', { pos: [0, 1.7, 0.012] }); inner.box(-1.15, 1.15, 1.13, 1.16, 0, 0.12, 'wood', '#a98a6a');
    for (const [x, z, yw, tip] of [[-7.3, -1.25, 0.08, 0], [-6.1, -1.3, -0.12, 0], [-4.9, -1.2, 0.12, 0], [-6.7, -0.65, 0.3, 0], [-5.5, -0.7, -0.08, 0.5], [-4.4, -0.55, 2.8, 0]]) desk(s, x, z, yw, tip);
    h.clump([-7.0, 0.4, -1.8], 0.5, 0.3, 22, { s: 0.3, core: false }); h.clump([-5.0, 0.4, -0.9], 0.4, 0.26, 14, { s: 0.28, core: false }); scatterFlowers(s, -7.8, -4.8, 0.32, 0.4, -2.0, -0.4, 16, WILD);
    sapling(h, -7.7, 0.3, -1.0, 1.3); sapling(h, 4.7, 3.86, 1.05, 1.5); sapling(h, -3.2, 3.82, -1.25, 1.2);
    // the moment that stays in the frame: a torn curtain blown out of the broken corridor window, a second one facing the yard
    const bk = h.back, rib = h.openings.back.filter((o) => o.t === 'broken'); for (const o of rib.slice(0, 3)) { const c = bk.w([o.x0 + 0.06, o.y1 - 0.08, 0.05]).toArray(); cloth({ o: c, U: bk.dir([1, 0, 0]).toArray(), D: [0, -1, bk.dir([0, 0, 1]).z * 0.2], w: (o.x1 - o.x0) * 0.42, h: (o.y1 - o.y0) * 0.72, nx: 3, ny: 6, cell: 'curtain', amp: 0.13, tear: 0.4, N: bk.dir([0, 0, 1]).toArray() }); }
    const ft = h.front, rif = h.openings.front.filter((o) => o.t === 'broken'); for (const o of rif) { const c = ft.w([o.x1 - (o.x1 - o.x0) * 0.46, o.y1 - 0.08, 0.05]).toArray(); cloth({ o: c, U: ft.dir([1, 0, 0]).toArray(), D: [0, -1, ft.dir([0, 0, 1]).z * 0.2], w: (o.x1 - o.x0) * 0.4, h: (o.y1 - o.y0) * 0.8, nx: 3, ny: 6, cell: 'curtain2', amp: 0.12, tear: 0.32, N: ft.dir([0, 0, 1]).toArray() }); }
    for (const [x, y, z, rx, ry, n] of [[-7.9, 1.2, 2.5, 0.5, 0.95, 44], [-7.5, 2.5, 2.45, 0.7, 0.55, 40], [-6.9, 2.95, 2.5, 0.5, 0.3, 22]]) h.clump([x, y, z], rx, ry, n, { s: 0.28, core: false });
    // a row of ivy pots at the plinth side, wash basins on the back wall
    H.props.pots(bk, 5.4, 3, rng); bk.box(-2.2, 2.2, 0, 0.7, 0, 0.42, 'concrete', P.concreteMid); bk.box(-2.1, 2.1, 0.7, 0.705, 0.05, 0.37, 'flat', '#6e7a78'); for (let i = 0; i < 6; i++) { const x = -2 + i * 0.8; bk.rod([x, 0.62, 0.03], [x, 0.96, 0.03], 0.016, 'worn', '#a8b4b4', 4); bk.rod([x, 0.96, 0.03], [x, 0.9, 0.2], 0.016, 'worn', P.metal, 4); }
  }

  /* ================================================================== the yard: gate, wall, swings, frame, bars, tyres, flag ===== */
  {
    const Y = RING_ZONES.schoolYard, zm = (Y.z[0] + Y.z[1]) / 2, gR = gy + 0.016;
    const toLS = (wx, wz) => toL(school, wx, wz);
    const grassW = (wx, wz, r, n, o) => { const [lx, lz] = toLS(wx, wz); schoolH.grass(lx, lz, r, n, o); };
    const clumpW = (wx, y, wz, rx, ry, n, o) => { const [lx, lz] = toLS(wx, wz); schoolH.clump([lx, y, lz], rx, ry, n, o); };
    // the gate and its name plate, and the low wall the bindweed took
    const gateX = school.x, gateZ = Y.z[0] + 0.1;
    for (const sg of [-1, 1]) { const x = gateX + sg * 1.4, q = W.sub({ pos: [x, gy, gateZ] }); q.box(-0.27, 0.27, 0, 1.62, -0.27, 0.27, 'concrete', P.concreteMid); q.box(-0.32, 0.32, 1.62, 1.72, -0.32, 0.32, 'concrete', P.concreteLit); q.box(-0.22, 0.22, 1.72, 1.82, -0.22, 0.22, 'concrete', P.concreteLit); }
    sign(W, 0.34, 1.3, 's-gate', { pos: [gateX - 1.4, gy + 0.95, gateZ - 0.272], rot: [0, Math.PI, 0] });
    sign(W, 0.34, 1.3, 's-gate', { pos: [gateX - 1.4, gy + 0.95, gateZ + 0.272] });
    const leaf = W.sub({ pos: [gateX + 1.05, gy, gateZ + 0.3], rot: [0, -1.1, 0.02] }); leaf.box(0, 1.1, 0.05, 0.1, -0.02, 0.02, 'worn', '#7d5a48'); leaf.box(0, 1.1, 0.95, 1.0, -0.02, 0.02, 'worn', '#7d5a48'); for (let i = 0; i < 8; i++) leaf.vbar(0.06 + i * 0.14, 0.09 + i * 0.14, 0.05, 1.0, -0.015, 0.015, 'worn', '#7d5a48');
    let x = Y.x[0] + 0.05; const wallZ = Y.z[0] + 0.02;
    while (x < Y.x[1] - 0.3) { const len = rng.range(0.9, 2.1), stop = Math.min(Y.x[1], x + len), gate = (x < gateX + 1.5 && stop > gateX - 1.5), gap = rng() < 0.3; if (!gate && !gap) { const top = rng.range(0.34, 0.7), q = W.sub({ pos: [(x + stop) / 2, gy, wallZ], rot: [0, 0, rng.range(-0.02, 0.02)] }), hw = (stop - x) / 2; q.box(-hw, hw, 0, top, -0.08, 0.08, 'concrete', P.concreteMid); q.box(-hw - 0.02, hw * 0.62, top, top + 0.05, -0.1, 0.1, 'concrete', P.concreteLit); if (rng() < 0.55) clumpW((x + stop) / 2 + rng.range(-0.4, 0.4), top + 0.08, wallZ, 0.5, 0.22, 16, { s: 0.3, core: false }); } x = stop + rng.range(0, 0.18); }
    // the sports-field lines, almost gone
    const chalk = '#d7c9a8';
    for (let k = 0; k < 2; k++) { const cz = lerp(Y.z[0], Y.z[1], k ? 0.7 : 0.29), curve = k ? 0.0015 : -0.0022; let xx = Y.x[0] + 0.4; while (xx < Y.x[1] - 0.4) { const len = rng.range(0.5, 1.6), xe = Math.min(Y.x[1] - 0.2, xx + len), zf = (a) => cz + curve * (a - gateX) * (a - gateX), hw = rng.range(0.034, 0.05); W.quad([xx, gR, zf(xx) + hw], [xe, gR, zf(xe) + hw], [xe, gR, zf(xe) - hw], [xx, gR, zf(xx) - hw], 'flat', chalk); xx = xe + rng.range(0.12, 0.7); } }

    // the swings: a tall A-frame, rust through the red, one seat hanging from one chain
    const sx0 = Y.x[0] + 0.6, sx1 = sx0 + 3.5, sz = zm + 0.05, top = gy + 2.3, red = '#b4503a';
    for (const x2 of [sx0, sx1]) { for (const sg of [-1, 1]) { W.rod([x2, gy, sz + sg * 0.74], [x2, top - 0.05, sz], 0.05, 'worn', red, 6); W.box(x2 - 0.13, x2 + 0.13, gy - 0.05, gy + 0.1, sz + sg * 0.74 - 0.13, sz + sg * 0.74 + 0.13, 'concrete', P.concreteMid); } W.rod([x2, gy + 0.9, sz - 0.46], [x2, gy + 0.9, sz + 0.46], 0.022, 'worn', red, 4); }
    W.rod([sx0 - 0.12, top, sz], [sx1 + 0.12, top, sz], 0.052, 'worn', red, 7);
    const chain = (L) => gBox(-0.008, 0.008, -L, 0, -0.008, 0.008), seat = gBox(-0.26, 0.26, -0.022, 0.022, -0.1, 0.1);
    const swingOk = sx0 + 0.95;
    rigid([swingOk, top - 0.02, sz], [1, 0, 0], (t) => 0.1 * ctx.wind(t, swingOk, sz) + 0.05 * Math.sin(t * 1.15), [{ g: chain(1.72).translate(-0.24, 0, 0), color: '#6a5a4c' }, { g: chain(1.72).translate(0.24, 0, 0), color: '#6a5a4c' }, { g: seat.clone().translate(0, -1.74, 0), color: '#9c6a4a' }]);
    const snapX = sx0 + 2.45, seatLen = 0.56;
    rigid([snapX - 0.24, top - 0.02, sz], [0.05, 0, 1], (t) => 0.13 + 0.09 * ctx.wind(t, snapX, sz) + 0.05 * Math.sin(t * 0.95 + 1), [{ g: chain(1.42), color: '#6a5a4c' }, { g: gBox(-0.022, 0.022, -1.42 - seatLen, -1.42, -0.1, 0.1), color: '#9c6a4a' }]);
    rigid([snapX + 0.24, top - 0.02, sz], [0, 0, 1], (t) => -0.08 + 0.14 * ctx.wind(t, snapX + 0.5, sz) + 0.06 * Math.sin(t * 1.5), [{ g: chain(0.72), color: '#6a5a4c' }]);
    grassW(sx0 + 1.7, sz, 1.4, 34, { h: 0.5, rz: 0.5 }); clumpW(sx1 + 0.05, 0.5, sz + 0.5, 0.55, 0.42, 18, { s: 0.3 });

    // the tyres, half-buried in a row, faded
    const tx0 = sx1 + 0.55, tz = zm + 0.3, tc = ['#b5493f', '#3f7f88', '#d9bb58', '#efe6cf', '#7fae7a'];
    for (let i = 0; i < 5; i++) W.add(kit.torus(0.27, 0.095, 6, 12), 'flat', { pos: [tx0 + i * 0.44, gy - 0.02, tz + Math.sin(i * 1.3) * 0.05], rot: [0, Q + rng.range(-0.1, 0.1), 0], color: tc[i] });
    grassW(tx0 + 0.9, tz, 1.1, 18, { h: 0.5, rz: 0.26 });

    // the flag, and the concrete step the principal stood on
    const fx = tx0 + 0.9, fz = Y.z[0] + 0.32, fH = 6.5; W.add(kit.cylBase(0.24, 0.28, 0.24, 8), 'concrete', { pos: [fx, gy, fz], color: P.concreteMid });
    W.rod([fx, gy, fz], [fx, gy + fH, fz], 0.045, 'worn', '#b9b8ae', 8, 0.028); W.add(kit.sphere(0.075, 8, 6), 'worn', { pos: [fx, gy + fH + 0.05, fz], color: '#d9bb58' });
    cloth({ o: [fx + 0.05, gy + fH - 0.32, fz], U: [1, 0, 0.1], D: [0, -1, 0], w: 1.05, h: 0.68, nx: 7, ny: 4, cell: 's-flag', amp: 0.22, tear: 0.3, pinU: true, N: [-0.1, 0, 1] });
    W.tube([[fx + 0.05, gy + 0.9, fz], [fx + 0.1, gy + fH * 0.5, fz + 0.02], [fx + 0.05, gy + fH - 0.25, fz]], 0.008, 0.008, 'flat', '#e6dcbe', 3, 12);

    const asmX = gateX + 2.4, asmZ = zm - 0.1, pod = W.sub({ pos: [asmX, gy, asmZ] }); pod.box(-0.55, 0.55, 0, 0.72, -0.42, 0.42, 'concrete', P.concreteMid); pod.box(-0.6, 0.6, 0.72, 0.78, -0.47, 0.47, 'concrete', P.concreteLit);
    for (let i = 0; i < 2; i++) pod.box(-0.42, 0.42, 0, 0.24 + i * 0.24, 0.42 + (1 - i) * 0.2, 0.42 + (1 - i) * 0.2 + 0.2, 'concrete', P.concreteMid);
    clumpW(asmX + 0.5, 0.82, asmZ - 0.2, 0.24, 0.1, 10, { s: 0.22, core: false });

    // the climbing frame: three bays of rusted bars, one corner sagging, bindweed up the far leg
    const jx = asmX + 1.0, jz = zm + 0.02, bay = 0.62, nX = 4, nZ = 2, nY = 3, col = (i) => ['#b86a44', '#7a9aa0', '#c9a24e', '#a85a44'][i % 4], rust = '#8a5238';
    const node = (ix, iy, iz) => { const sag = ix === nX && iz === 0 ? 0.16 * iy : 0; return [jx + ix * bay + (ix === nX ? sag * 0.3 : 0), gy + iy * bay - (iy > 0 ? sag : 0), jz + (iz - nZ / 2) * bay]; };
    for (let ix = 0; ix <= nX; ix++) for (let iz = 0; iz <= nZ; iz++) for (let iy = 0; iy <= nY; iy++) {
      const here = node(ix, iy, iz), c = col(ix + iy + iz);
      if (iy < nY) W.rod(here, node(ix, iy + 1, iz), 0.03, 'worn', c, 5, 0.03, true);
      if (ix < nX && iy > 0 && !(iy === nY && ix === nX - 1 && iz === 0)) W.rod(here, node(ix + 1, iy, iz), 0.026, 'worn', rust, 4, 0.026, true);
      if (iz < nZ && iy > 0 && !(ix === nX && iy === nY && iz === 0)) W.rod(here, node(ix, iy, iz + 1), 0.026, 'worn', rust, 4, 0.026, true);
    }
    for (let i = 0; i < 2; i++) W.tube([node(nX, 0, 2), [jx + bay * nX - 0.05, gy + bay, jz + bay * 0.9], node(nX - 1, 2, 2), node(nX - 2, 3, 1)], 0.022, 0.008, 'flat', '#6a6a42', 4, 16);
    clumpW(jx + bay * nX, 0.7, jz + bay, 0.48, 0.55, 28, { s: 0.3 }); clumpW(jx + bay * 2.4, bay * 3 + 0.05, jz + 0.3, 0.46, 0.22, 16, { s: 0.28, core: false });
    grassW(jx + bay * 2, jz, 1.2, 28, { h: 0.45, rz: 0.55 });

    // the iron bars, three heights
    const bx0 = jx + bay * nX + 0.42, bw = 0.42, heights = [0.92, 1.2, 1.5];
    for (let i = 0; i <= 3; i++) { const px = bx0 + i * bw, top2 = heights[Math.min(i, 2)]; W.rod([px, gy, jz], [px, gy + top2 + 0.02, jz], 0.03, 'worn', '#8a6a4e', 6); W.add(kit.cylBase(0.09, 0.1, 0.06, 7), 'concrete', { pos: [px, gy, jz], color: P.concreteMid }); }
    heights.forEach((ht, i) => W.rod([bx0 + i * bw, gy + ht, jz], [bx0 + (i + 1) * bw, gy + ht, jz], 0.017, 'worn', '#6a5a4c', 6));
    clumpW(bx0 + bw * 1.5, 0.3, jz, 0.42, 0.28, 12, { s: 0.3 });

    // weeds taking back the beaten earth, more at the ends
    for (let i = 0; i < 16; i++) { const wx = rng.range(Y.x[0] + 0.2, Y.x[1] - 0.2), wz = rng.range(Y.z[0] + 0.12, Y.z[1] - 0.05); grassW(wx, wz, rng.range(0.15, 0.4), rng.int(5, 12), { y: gy, h: rng.range(0.3, 0.55) }); }
    for (let i = 0; i < 18; i++) W.add(kit.flower(rng.range(0.05, 0.09), 5), 'flat', { pos: [rng.range(Y.x[0], Y.x[1]), gy + rng.range(0.25, 0.42), rng.range(Y.z[0] + 0.1, Y.z[1] - 0.1)], rot: [rng.range(-0.3, 0.3), rng() * 6, rng.range(-0.3, 0.3)], color: rng.pick(WILD) });

    // the street furniture: 'school route' diamond at the corner of the yard
    const sn = W.sub({ pos: [Y.x[1] + 0.32, gy, Y.z[0] + 0.05] }); sn.rod([0, 0, 0], [0.02, 2.3, 0], 0.03, 'worn', '#a8b4b4', 6); const dm = sn.sub({ pos: [0.02, 2.24, -0.04], rot: [0.05, Math.PI - 0.18, 0.04] }); dm.box(-0.42, 0.42, -0.42, 0.42, -0.015, 0.015, 'worn', '#7a6a4e'); sign(dm, 0.8, 0.8, 's-zone', { pos: [0, 0, 0.017] });
  }

  /* ================================================================== the pool: raised concrete, green and still ===== */
  let poolWater, poolReflect, poolCaustic;
  {
    const Z = RING_ZONES.pool, x0 = Z.x[0], x1 = Z.x[1], z0 = Z.z[0], z1 = Z.z[1], t = 0.34, yR = 0.92, yF = 0.1, yW = 0.66, cW = '#c6c2b2', cI = '#a6cfc0', cAlg = '#5e8f6a';
    // outer shell
    W.box(x0, x1, -0.1, yR, z0, z0 + t, 'concrete', cW); W.box(x0, x1, -0.1, yR, z1 - t, z1, 'concrete', cW); W.box(x0, x0 + t, -0.1, yR, z0 + t, z1 - t, 'concrete', cW); W.box(x1 - t, x1, -0.1, yR, z0 + t, z1 - t, 'concrete', cW);
    W.box(x0 + t, x1 - t, -0.1, yF, z0 + t, z1 - t, 'concrete', '#90b6a6');
    // inner paint: a pale blue-green wall with a waterline of algae
    const ix0 = x0 + t, ix1 = x1 - t, iz0 = z0 + t, iz1 = z1 - t;
    W.quad([ix0, yF, iz0 + 0.002], [ix1, yF, iz0 + 0.002], [ix1, yR, iz0 + 0.002], [ix0, yR, iz0 + 0.002], 'flat', cI); W.quad([ix1, yF, iz1 - 0.002], [ix0, yF, iz1 - 0.002], [ix0, yR, iz1 - 0.002], [ix1, yR, iz1 - 0.002], 'flat', cI);
    W.quad([ix0 + 0.002, yF, iz1], [ix0 + 0.002, yF, iz0], [ix0 + 0.002, yR, iz0], [ix0 + 0.002, yR, iz1], 'flat', cI); W.quad([ix1 - 0.002, yF, iz0], [ix1 - 0.002, yF, iz1], [ix1 - 0.002, yR, iz1], [ix1 - 0.002, yR, iz0], 'flat', cI);
    W.quad([ix0, yW - 0.05, iz0 + 0.005], [ix1, yW - 0.05, iz0 + 0.005], [ix1, yW + 0.09, iz0 + 0.005], [ix0, yW + 0.09, iz0 + 0.005], 'flat', cAlg); W.quad([ix1, yW - 0.05, iz1 - 0.005], [ix0, yW - 0.05, iz1 - 0.005], [ix0, yW + 0.09, iz1 - 0.005], [ix1, yW + 0.09, iz1 - 0.005], 'flat', cAlg);
    W.quad([ix0 + 0.005, yW - 0.05, iz1], [ix0 + 0.005, yW - 0.05, iz0], [ix0 + 0.005, yW + 0.09, iz0], [ix0 + 0.005, yW + 0.09, iz1], 'flat', cAlg); W.quad([ix1 - 0.005, yW - 0.05, iz0], [ix1 - 0.005, yW - 0.05, iz1], [ix1 - 0.005, yW + 0.09, iz1], [ix1 - 0.005, yW + 0.09, iz0], 'flat', cAlg);
    // lane paint on the floor, cracked into runs, showing through the green
    const nLane = 4, laneW = (ix1 - ix0) / nLane;
    for (let k = 1; k < nLane; k++) { const lx = ix0 + k * laneW; let z = iz0 + 0.25; while (z < iz1 - 0.3) { const len = rng.range(0.45, 1.1), ze = Math.min(iz1 - 0.2, z + len), dx = rng.range(-0.02, 0.02); W.quad([lx - 0.06 + dx, yF + 0.012, ze], [lx + 0.06 + dx, yF + 0.012, ze], [lx + 0.06 - dx, yF + 0.012, z], [lx - 0.06 - dx, yF + 0.012, z], 'flat', '#e9e3c8'); z = ze + rng.range(0.06, 0.32); } }
    for (let k = 0; k < 3; k++) { const a = rng.range(ix0, ix1), b2 = rng.range(iz0, iz1); W.quad([a, yF + 0.014, b2], [a + 0.5, yF + 0.014, b2 + 0.12], [a + 0.46, yF + 0.014, b2 + 0.16], [a - 0.02, yF + 0.014, b2 + 0.03], 'flat', '#4f8a78'); }
    // coping: slabs along the top of the wall, some missing, one tipped
    function coping(ax, az, bx, bz, nx2, nz2) { const len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len; let s = 0; while (s < len - 0.05) { const l = Math.min(len - s, rng.range(0.7, 1.35)), e = s + l, gap = rng() < 0.07; if (!gap) { const q = W.sub({ pos: [ax + dx * (s + e) / 2, yR, az + dz * (s + e) / 2], rot: [0, Math.atan2(-dz, dx), rng() < 0.12 ? rng.range(-0.06, 0.06) : 0] }); q.box(-l / 2 + 0.012, l / 2 - 0.012, 0, 0.07, -t / 2 - 0.05, t / 2 + 0.03, 'concrete', P.concreteLit); } s = e; } }
    coping(x0, z0 + t / 2, x1, z0 + t / 2); coping(x1, z1 - t / 2, x0, z1 - t / 2); coping(x0 + t / 2, z1 - t, x0 + t / 2, z0 + t); coping(x1 - t / 2, z0 + t, x1 - t / 2, z1 - t);
    // a crack down the road-side wall with ferns in it
    const toLS = (wx, wz) => toL(school, wx, wz);
    W.quad([x0 + 1.25, 0.06, z0 - 0.003], [x0 + 1.1, 0.06, z0 - 0.003], [x0 + 1.46, yR, z0 - 0.003], [x0 + 1.55, yR, z0 - 0.003], 'flat', '#6a6a60');
    { const [lx, lz] = toLS(x0 + 1.3, z0 - 0.15); schoolH.clump([lx, 0.3, lz], 0.34, 0.3, 14, { s: 0.3, core: false }); schoolH.grass(lx, lz, 0.28, 14, { h: 0.5 }); }
    for (const [wx, wz, rx] of [[x0 + 0.18, z1 - 0.2, 0.42], [x1 - 0.15, z0 + 0.2, 0.3], [x0 + 2.6, z1 + 0.05, 0.28], [x1 + 0.1, z0 + 2.8, 0.34]]) { const [lx, lz] = toLS(wx, wz); schoolH.clump([lx, yR + 0.08, lz], rx, 0.2, 12, { s: 0.28, core: false }); schoolH.grass(lx, lz, rx + 0.25, 12, { h: 0.55 }); }
    // a rusted ladder over the west side
    const lz = z0 + 1.55; for (const dz of [-0.2, 0.2]) W.tube([[x0 + 0.06, yR + 0.07, lz + dz], [x0 + 0.12, yR + 0.55, lz + dz], [x0 + t + 0.02, yR + 0.62, lz + dz], [x0 + t + 0.14, yR + 0.3, lz + dz], [x0 + t + 0.14, yF + 0.12, lz + dz]], 0.028, 0.028, 'worn', '#a85a3a', 5, 22);
    for (const y of [0.34, 0.56, 0.78]) W.box(x0 + t + 0.1, x0 + t + 0.19, y - 0.018, y + 0.018, lz - 0.2, lz + 0.2, 'worn', RUSTD);
    // four starting blocks on the road end, numbers facing the water
    for (let k = 0; k < nLane; k++) { const bx = ix0 + (k + 0.5) * laneW, bz = z0 + t / 2, q = W.sub({ pos: [bx, yR + 0.07, bz] }); q.box(-0.17, 0.17, 0, 0.3, -0.16, 0.16, 'concrete', '#d9d4c0'); q.quad([-0.2, 0.3, -0.19], [0.2, 0.3, -0.19], [0.2, 0.42, 0.2], [-0.2, 0.42, 0.2], 'flat', '#e9e3d0'); sign(q, 0.2, 0.2, 's-num' + (k + 1), { pos: [0, 0.17, 0.165] }); }
    // reeds crowding the deep end corners
    for (const [wx, wz, r2, n] of [[ix0 + 0.5, iz1 - 0.5, 0.45, 22], [ix1 - 0.45, iz1 - 0.42, 0.42, 22], [ix0 + 0.42, iz0 + 0.45, 0.3, 10]]) { const [lx, lz] = toLS(wx, wz); schoolH.grass(lx, lz, r2, n, { y: yW, h: 1.05 }); }
    // lily pads, more near the shaded corners, and a handful of flowers
    const padGeo = (r2) => { const seg = 14, pos = [0, 0, 0], idx = [], notch = 0.22; for (let i = 0; i <= seg; i++) { const a = notch + (i / seg) * (TAU - 2 * notch); pos.push(Math.cos(a) * r2, 0, Math.sin(a) * r2); } for (let i = 1; i <= seg; i++) idx.push(0, i + 1, i); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2)); g.setIndex(idx); g.computeVertexNormals(); return g; };
    const pads = []; let tries = 0; while (pads.length < 34 && tries++ < 400) { const near = rng() < 0.6, wx = near ? (rng() < 0.5 ? rng.range(ix0 + 0.2, ix0 + 1.1) : rng.range(ix1 - 1.1, ix1 - 0.2)) : rng.range(ix0 + 0.2, ix1 - 0.2), wz = near ? rng.range(iz1 - 2.3, iz1 - 0.2) : rng.range(iz0 + 0.3, iz1 - 0.3), r2 = rng.range(0.12, 0.27); if (pads.some((q) => Math.hypot(q[0] - wx, q[1] - wz) < q[2] + r2 + 0.02)) continue; pads.push([wx, wz, r2]); W.add(padGeo(r2), 'flat', { pos: [wx, yW + 0.012, wz], rot: [rng.range(-0.02, 0.02), rng() * TAU, rng.range(-0.02, 0.02)], color: rng.pick([P.leafMid, P.leafDeep, P.leafLit, P.fern, P.leafDeep]) }); }
    for (const [wx, wz, r2] of pads.filter((q) => q[2] > 0.17).slice(0, 8)) { const col = rng.pick(['#f6c4d4', P.flowerWhite, P.bougainLit, P.flowerWhite]); const fl2 = kit.flower(0.13, 7); W.add(fl2, 'flat', { pos: [wx + 0.04, yW + 0.05, wz - 0.03], rot: [0, rng() * 6, 0], color: col }); W.add(kit.sphere(0.04, 6, 4), 'flat', { pos: [wx + 0.04, yW + 0.07, wz - 0.03], color: P.flowerYellow }); }

    // the water, in the palette's greens
    const shore = (x, z) => Math.min(x - ix0, ix1 - x, z - iz0, iz1 - z) / 0.9;
    const wg = kit.waterField(ix0, ix1, iz0, iz1, 10, 14, (x, z) => Math.max(0.02, Math.min(1, shore(x, z))));
    poolWater = new THREE.Mesh(wg, ctx.water({ shallow: '#7ec48a', deep: '#2f8366', hi: '#e6f6c6', opacity: 0.76, scale: 1.1 })); poolWater.position.y = yW; poolWater.castShadow = false; poolWater.receiveShadow = false; poolWater.name = 'south-pool-water'; ctx.noOutline(poolWater); group.add(poolWater);
    // what it reflects: a slab of sky, the cherry at the east wall and the school's dark eave, painted, wobbling slightly under the noise
    const tex = ctx.canvasTexture(180, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      // lane paint seen through the green, cracked into runs
      g.fillStyle = 'rgba(236,230,202,.62)'; for (let k = 1; k < 4; k++) { const lx = (k * w) / 4; for (let y = 8; y < h - 8;) { const l = rng.range(18, 54), dx = rng.range(-1.2, 1.2); g.beginPath(); g.moveTo(lx - 3 + dx, y); g.lineTo(lx + 3 + dx, y); g.lineTo(lx + 3 - dx, y + l); g.lineTo(lx - 3 - dx, y + l); g.fill(); y += l + rng.range(4, 22); } }
      // sky: a few long sheared bands, as still water takes it
      g.fillStyle = 'rgba(206,240,232,.34)'; for (const [x, y, l, t] of [[36, 188, 118, 12], [64, 142, 94, 8], [28, 96, 84, 9], [80, 56, 70, 6], [20, 226, 72, 7]]) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y - 16); g.lineTo(x + l, y - 16 + t); g.lineTo(x, y + t); g.fill(); }
      // the eave along the road end, the cherry down the east wall
      g.fillStyle = 'rgba(30,96,88,.42)'; g.fillRect(0, 0, w, 11);
      for (let i = 0; i < 18; i++) { const y = 18 + i * 13 + (i % 2) * 5, r = 8 + (i % 3) * 5; g.beginPath(); g.ellipse(w - 4 - (i % 4) * 6, y, r * 1.1, r * 0.8, 0, 0, TAU); g.fill(); }
      g.fillStyle = 'rgba(238,186,198,.5)'; for (let i = 0; i < 14; i++) { g.beginPath(); g.ellipse(w - 8 - (i % 5) * 7, 22 + i * 16, 2.6, 1.8, 0, 0, TAU); g.fill(); }
    }, { srgb: true, repeat: false });
    const rmat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uMap: { value: tex }, uNoise: shared.uNoise, uTime: shared.uTime }, vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }', fragmentShader: `uniform sampler2D uMap,uNoise; uniform float uTime; varying vec2 vUv;
      void main(){ vec2 d=vec2(texture2D(uNoise,vUv*vec2(.6,.9)+uTime*vec2(.008,.006)).r,texture2D(uNoise,vUv*vec2(.6,.9)-uTime*vec2(.006,.009)).g)-.5;
        vec2 e=min(vUv,1.-vUv); float fade=smoothstep(0.,.05,min(e.x,e.y)); vec4 c=texture2D(uMap,vUv+d*.018); gl_FragColor=vec4(c.rgb,c.a*fade);
        #include <colorspace_fragment>
      }` });
    poolReflect = new THREE.Mesh(new THREE.PlaneGeometry(ix1 - ix0, iz1 - iz0).rotateX(-Q), rmat); poolReflect.position.set((ix0 + ix1) / 2, yW + 0.006, (iz0 + iz1) / 2); poolReflect.castShadow = false; poolReflect.receiveShadow = false; poolReflect.name = 'south-pool-reflect'; ctx.noOutline(poolReflect); group.add(poolReflect);
    // the shimmer the water throws low on its own walls
    const band = 0.2;
    const ws = [new THREE.PlaneGeometry(ix1 - ix0, band).translate((ix0 + ix1) / 2, yW + band / 2 + 0.02, iz0 + 0.012), new THREE.PlaneGeometry(ix1 - ix0, band).rotateY(Math.PI).translate((ix0 + ix1) / 2, yW + band / 2 + 0.02, iz1 - 0.012), new THREE.PlaneGeometry(iz1 - iz0, band).rotateY(Q).translate(ix0 + 0.012, yW + band / 2 + 0.02, (iz0 + iz1) / 2), new THREE.PlaneGeometry(iz1 - iz0, band).rotateY(-Q).translate(ix1 - 0.012, yW + band / 2 + 0.02, (iz0 + iz1) / 2)];
    poolCaustic = new THREE.Mesh(kit.merge(ws), ctx.caustic({ color: '#dff7c8', intensity: 0.55, scale: 1.7 })); poolCaustic.name = 'south-pool-caustic'; poolCaustic.castShadow = false; poolCaustic.receiveShadow = false; ctx.noOutline(poolCaustic); group.add(poolCaustic);
    // a low rail along the road side, leaning; the 'no diving' board on it, unread for years
    for (let i = 0; i <= 4; i++) { const px = lerp(x0, x1, i / 4), tilt = i % 3 ? 0.03 : -0.05; W.rod([px, 0.05, z0 - 0.14], [px + tilt, 1.32, z0 - 0.14], 0.024, 'worn', '#8a7a68', 5); }
    W.rod([x0, 1.3, z0 - 0.14], [x1 + 0.05, 1.28, z0 - 0.14], 0.018, 'worn', '#8a7a68', 4); W.rod([x0, 0.72, z0 - 0.14], [x1, 0.76, z0 - 0.14], 0.016, 'worn', '#8a7a68', 4);
    boardSign(W, 's-pool', 0.72, 0.36, { pos: [x0 + 2.7, 1.08, z0 - 0.18], rot: [0.04, Math.PI, 0.05], board: '#6a5a4c', t: 0.03 });
  }

  /* ================================================================== s07: the cottage with the washing still out ===== */
  {
    const b = byId('s07');
    const h = H.build(b, {
      wall: 'plaster', wallCol: '#e7dcc4', timbers: true, band: { type: 'board', h: 0.85 }, roof: 'tin', tints: ['#b5522f', '#c0704a', '#a24a2e', '#7d3a2a'], shape: 'hip', pitch: 0.72, es: 0.34, ef: 0.42, eb: 0.42, porch: false, props: ['drain', 'gas', 'pots'],
      open: (T) => { const { w, d, fl } = T, a = -w / 2 + 0.34, e = w / 2 - 0.34; return { front: [op('sliding', a, a + 1.55, fl, fl + 1.98), op('shoji', 0.1, e, fl + 0.72, fl + 1.86)], back: [op('door', a + 0.1, a + 1, fl, fl + 1.98), op('sash', 0, e - 0.1, fl + 0.92, fl + 1.86, { curtain: true })], left: [op('sash', -0.5, 0.5, fl + 0.95, fl + 1.85)], right: [op('sash', -0.45, 0.45, fl + 0.95, fl + 1.85, { curtain: false })] }; },
      decay: { level: 0.28, sag: 0.06, holes: 0, collapse: false, saplings: 0, vines: [{ side: 'right', cover: 0.55 }, { side: 'front', cover: 0.25, u0: 1.0, u1: 2.0 }], bushes: 3 },
    });
    const { w, d } = h.dims, bk = h.back, s = h.S, poleZ = 1.25, poleY = 1.62, x0 = -1.5, x1 = 1.5;
    for (const x of [x0, x1]) { bk.rod([x, gy, poleZ], [x + 0.02, poleY + 0.05, poleZ], 0.03, 'worn', '#7d8b90', 5); bk.rod([x - 0.2, poleY - 0.12, poleZ], [x + 0.2, poleY - 0.12, poleZ], 0.012, 'worn', '#7d8b90', 4); bk.add(kit.cyl(0.14, 0.17, 0.07, 7), 'concrete', { pos: [x, gy + 0.03, poleZ] }); }
    bk.rod([x0 - 0.3, poleY - 0.1, poleZ], [x1 + 0.34, poleY - 0.18, poleZ], 0.026, 'wood', '#c8b67a', 6);
    const Ub = bk.dir([1, 0, 0]).toArray(), Nb = bk.dir([0, 0, 1]).toArray();
    [[-1.3, 0.78, 1.06, 'sheet'], [-0.42, 0.58, 0.72, 'stripe2'], [0.28, 0.52, 0.86, 'futon'], [0.92, 0.42, 0.62, 'stripe']].forEach(([x, wd, ht, cell]) => cloth({ o: bk.w([x, poleY - 0.13, poleZ + 0.012]).toArray(), U: Ub, D: [0, -1, 0], w: wd, h: ht, nx: 5, ny: 6, cell, amp: 0.13, tear: 0.08, N: Nb }));
    h.grass(0, d / 2 + 1.4, 1.8, 42, { h: 0.65, rz: 0.55 }); h.bush(-w / 2 - 0.4, -d / 2 - 0.5, 0.7);
    scatterFlowers(h.right, -1.4, 1.4, 0.7, 2.1, 0.14, 0.24, 8, PINKS);
  }

  /* ================================================================== s08: the volunteer fire brigade post, its hand pump left out the back ===== */
  {
    const b = byId('s08');
    const h = H.build(b, {
      wall: 'board', sides: { left: 'tinsheet' }, roof: 'kawara', tints: ['#7a8e9c', '#6b808f', '#8c9ea8', '#a0705a'], shape: 'gable', ridge: 'x', pitch: 0.6, es: 0.26, ef: 0.42, eb: 0.36, band: { type: 'mortar', h: 0.6, col: '#b9b5a8' }, timbers: false, porch: false, props: ['drain', 'crates'],
      open: (T) => { const { w, fl } = T, a = -w / 2 + 0.34; return { front: [op('bigdoor', a, a + 2.25, fl, fl + 2.15, { col: '#a8413a' }), op('sash', 0.55, w / 2 - 0.34, fl + 0.95, fl + 1.85, { curtain: false })], back: [op('broken', -0.45, 0.45, fl + 0.95, fl + 1.85, { curtain: false })], left: [], right: [op('sash', -0.45, 0.45, fl + 0.95, fl + 1.85)] }; },
      decay: { level: 0.74, sag: 0.24, holes: 2, collapse: { corner: 'bl', r: 1.75 }, saplings: 2, moss: 0.78, vines: [{ side: 'back', cover: 0.7 }, { side: 'right', cover: 0.5 }], bushes: 4, grass: 1 },
    });
    const { w, d, fl } = h.dims, f = h.front, bk = h.back;
    boardSign(f, 's-brigade', 1.7, 0.36, { pos: [-w / 2 + 1.48, fl + 2.34, 0.03], board: '#6e5038', t: 0.02 });
    // the hand-pumped engine: two tall wheels, a brass barrel, long pump handles, a coil of flat hose
    const c = bk.sub({ pos: [0.72, gy, 1.2], rot: [0, 0.34, 0] }), Rw = 0.46, red = '#a8413a';
    for (const z of [-0.34, 0.34]) wheelOn(c, 0, Rw, z, Rw, 'z', '#7a5a46', 10, 0.03);
    c.rod([0, Rw, -0.42], [0, Rw, 0.42], 0.028, 'worn', P.metalDark, 6);
    c.box(-0.6, 0.6, Rw - 0.04, Rw + 0.34, -0.26, 0.26, 'worn', red); c.box(-0.65, 0.65, Rw + 0.34, Rw + 0.38, -0.3, 0.3, 'wood', '#6e5038');
    c.add(kit.cylBase(0.13, 0.13, 0.5, 10), 'worn', { pos: [0.18, Rw + 0.38, 0], color: '#c9a24e' }); c.add(kit.sphere(0.13, 10, 6), 'worn', { pos: [0.18, Rw + 0.88, 0], color: '#c9a24e' });
    c.rod([-0.72, Rw + 0.98, 0], [0.8, Rw + 0.68, 0], 0.024, 'wood', '#a98a6a', 5); c.rod([-0.6, 0.06, 0.05], [-0.95, 0.5, 0.05], 0.02, 'wood', '#a98a6a', 4);
    c.add(kit.torus(0.22, 0.08, 6, 14), 'flat', { pos: [-0.3, Rw + 0.55, 0.05], rot: [Q, 0.3, 0], color: '#d9d2bc' });
    h.grass(0.6, -d / 2 - 1.1, 1.2, 34, { h: 0.75, rz: 0.7 });
  }

  /* ================================================================== s09: the fire lookout. Kit lattice and bell; the hose left to dry and the striker on its rope ===== */
  {
    const b = byId('s09');
    const h = H.build(b, { decay: { level: 0.5 } });
    const { w, h: hh } = h.dims, s = h.S, deck = hh - 2.3, wt = w * 0.5, e = wt / 2 + 0.5;
    // the bell gets a stout frame, verdigris ribs, and a striker that still moves
    s.box(-0.5, 0.5, deck + 1.42, deck + 1.52, -0.08, 0.08, 'wood', '#6e5038');
    s.add(kit.cylBase(0.27, 0.34, 0.08, 10), 'worn', { pos: [0, deck + 0.94, 0], color: '#6a8a70' });
    for (const a of [deck + 1.04, deck + 1.18]) s.add(kit.cyl(0.235, 0.255, 0.018, 10), 'flat', { pos: [0, a, 0], color: '#6a8a70' });
    const pvt = s.w([0.05, deck + 1.05, 0]).toArray();
    rigid(pvt, [0, 0, 1], (t) => 0.09 * ctx.wind(t, b.x, b.z) + 0.05 * Math.sin(t * 1.25), [{ g: gRod([0, 0, 0], [0, -0.82, 0], 0.011, 3), color: '#c9b98f' }, { g: gBox(-0.05, 0.05, -1.08, -0.82, -0.05, 0.05), color: '#7a5a46' }]);
    // the hose, hung from the rail to dry and never taken in
    cloth({ o: s.w([0.56, deck + 0.82, e + 0.04]).toArray(), U: [1, 0, 0], D: [0, -1, 0.012], w: 0.1, h: 4.3, nx: 1, ny: 16, cell: 'sheet', amp: 0.12, N: [0, 0, 1], tint: [0.86, 0.82, 0.68] });
    cloth({ o: s.w([0.36, deck + 0.82, e + 0.04]).toArray(), U: [1, 0, 0], D: [0, -1, 0.012], w: 0.1, h: 3.5, nx: 1, ny: 14, cell: 'sheet', amp: 0.1, N: [0, 0, 1], tint: [0.78, 0.76, 0.66] });
    // a storm pennant on the finial rod, the warning board on the leg, the bucket pyramid
    s.rod([0, hh - 0.05, 0], [0, hh + 0.75, 0], 0.016, 'worn', P.metalDark, 4);
    cloth({ o: s.w([0, hh + 0.68, 0]).toArray(), U: [1, 0, 0.2], D: [0, -1, 0], w: 0.62, h: 0.26, nx: 5, ny: 2, cell: 'n2', v1: 0.6, amp: 0.16, tear: 0.4, pinU: true, N: [-0.2, 0, 1] });
    boardSign(s, 's-fire', 0.3, 1.2, { pos: [-0.56, 1.72, 1.17], rot: [-0.1, 0, 0.02], board: '#5e4634' });
    for (const [x, z, y] of [[-0.7, 1.55, 0], [-0.42, 1.55, 0], [-0.14, 1.55, 0], [-0.56, 1.55, 0.26], [-0.28, 1.55, 0.26]]) bucket(s, x, gy + y, z);
    h.grass(0, 1.6, 1.0, 22, { h: 0.6, rz: 0.4 });
  }

  /* ================================================================== s10: the clinic's lean-to, a bed frame put out with the weeds ===== */
  {
    const b = byId('s10');
    const h = H.build(b, {
      wall: 'tinsheet', sides: { back: 'boardv' }, roof: 'tin', tints: ['#8f8f86', '#7f7f78', '#a0a096', '#b5522f'], shape: 'mono', pitch: 0.34, es: 0.14, ef: 0.3, eb: 0.2, f2Off: true, foundationH: 0.1, props: [],
      open: (T) => { const { fl } = T; return { front: [op('door', -0.62, 0.42, fl, fl + 1.9, { col: '#7d8b90' })], back: [], left: [], right: [op('sash', -0.42, 0.42, fl + 0.95, fl + 1.65, { curtain: false })] }; },
      decay: { level: 0.62, holes: 1, collapse: false, saplings: 0, vines: [{ side: 'left', cover: 0.7 }], bushes: 2 },
    });
    const { w, d } = h.dims, s = h.S, f = h.front;
    // the bed frame leaning, mattress springs still in it
    const bd = f.sub({ pos: [1.05, gy, 0.98], rot: [-0.46, 0.08, 0.03] });
    for (const x of [-0.44, 0.44]) bd.rod([x, 0, 0], [x, 1.95, 0], 0.024, 'worn', '#b9b8ae', 5);
    for (const y of [0.02, 0.5, 1.0, 1.5, 1.95]) bd.rod([-0.44, y, 0], [0.44, y, 0], 0.014, 'worn', '#a8b4b4', 4);
    bd.rod([-0.44, 2.0, 0], [-0.44, 2.0, 0.34], 0.024, 'worn', '#b9b8ae', 5); bd.rod([0.44, 2.0, 0], [0.44, 2.0, 0.34], 0.024, 'worn', '#b9b8ae', 5); bd.rod([-0.44, 2.0, 0.34], [0.44, 2.0, 0.34], 0.024, 'worn', '#b9b8ae', 5);
    // two oxygen cylinders, chained, green shoulders fading
    for (const x of [-1.05, -0.72]) { f.add(kit.cylBase(0.13, 0.13, 1.05, 9), 'worn', { pos: [x, gy, 0.2], color: '#6a7a78' }); f.add(kit.sphere(0.13, 9, 4), 'worn', { pos: [x, gy + 1.05, 0.2], scale: [1, 0.62, 1], color: '#4e7a64' }); f.add(kit.cyl(0.03, 0.04, 0.12, 6), 'flat', { pos: [x, gy + 1.2, 0.2], color: '#c9a24e' }); }
    h.grass(w / 2 + 0.7, 0, 1.1, 40, { h: 0.7, rz: 0.9 }); h.bush(0.9, d / 2 + 0.75, 0.7);
    scatterFlowers(s, w / 2 + 0.2, w / 2 + 1.2, 0.15, 0.55, -0.8, 0.8, 8, WILD);
  }

  /* ------------------------------------------------------------------ finish: kit meshes, then the two moving meshes ------------- */
  const { info, meshes } = H.finish(group);
  // the kit tips rubble out from a fallen corner; what would land beyond the plinth edge is dropped
  { const H0 = layout.BASE.half + 0.05; for (const m of meshes) { if (m.isInstancedMesh) continue; const p = m.geometry.attributes.position; for (let i = 0; i < p.count; i += 3) { let out = true; for (let k = 0; k < 3; k++) if (Math.max(Math.abs(p.getX(i + k)), Math.abs(p.getZ(i + k))) < H0 || p.getY(i + k) > 0.7) out = false; if (out) for (let k = 0; k < 3; k++) p.setXYZ(i + k, 0, -9, 0); } } }
  // kit leaves and blades that reach past the plinth edge or over the canal: dropped whole, tested on their real outline
  { const edge = layout.BASE.half - 0.02, canal = layout.riverOutline(0.3), mg = 0.14, v = new THREE.Vector3(), mm = new THREE.Matrix4(), cc = new THREE.Color();
    const bad = (x, z) => Math.max(Math.abs(x), Math.abs(z)) > edge || (x < -6 && z > 14 && [[0, 0], [mg, 0], [-mg, 0], [0, mg], [0, -mg]].some(([a, c]) => layout.pointInPoly(x + a, z + c, canal)));
    for (const m of meshes) { if (!m.isInstancedMesh) continue; const pos = m.geometry.attributes.position, keep = [];
      for (let i = 0; i < m.count; i++) { m.getMatrixAt(i, mm); let out = false; for (let k = 0; k < pos.count && !out; k++) { v.fromBufferAttribute(pos, k).applyMatrix4(mm); out = bad(v.x, v.z); } if (!out) keep.push(i); }
      if (keep.length === m.count) continue;
      const extra = Object.values(m.geometry.attributes).filter((a) => a.isInstancedBufferAttribute);
      keep.forEach((o, j) => { if (o === j) return; m.getMatrixAt(o, mm); m.setMatrixAt(j, mm); if (m.instanceColor) { m.getColorAt(o, cc); m.setColorAt(j, cc); } for (const a of extra) for (let c = 0; c < a.itemSize; c++) a.setComponent(j, c, a.getComponent(o, c)); });
      m.count = keep.length; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; for (const a of extra) a.needsUpdate = true; } }
  // cloth, one mesh per atlas
  const clothMesh = (c, map, name) => {
    const m = ctx.toon({ map, vertexColors: true, side: THREE.DoubleSide, translucent: 0.7, dapple: false }), g = new THREE.BufferGeometry(), pos = new Float32Array(c.pos), rest = pos.slice(), wts = new Float32Array(c.w), phs = new Float32Array(c.ph);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(c.nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(c.uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(c.col, 3)); g.setIndex(c.idx);
    g.attributes.position.setUsage(THREE.DynamicDrawUsage);
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true; mesh.name = name; group.add(mesh);
    return { sheets: c.sheets, pos, rest, w: wts, ph: phs, attr: g.attributes.position };
  };
  const clothLayers = [clothMesh(cl, A.tex, 'south-cloth'), clothMesh(clO, O.tex, 'south-flags')];
  // rigid
  const rg2 = new THREE.BufferGeometry(), rp = new Float32Array(rg.pos), rn = new Float32Array(rg.nor), rpOut = new Float32Array(rp.length), rnOut = new Float32Array(rn.length);
  rg2.setAttribute('position', new THREE.BufferAttribute(rpOut, 3)); rg2.setAttribute('normal', new THREE.BufferAttribute(rnOut, 3)); rg2.setAttribute('uv', new THREE.Float32BufferAttribute(rg.uv, 2)); rg2.setAttribute('color', new THREE.Float32BufferAttribute(rg.col, 3));
  rg2.attributes.position.setUsage(THREE.DynamicDrawUsage); rg2.attributes.normal.setUsage(THREE.DynamicDrawUsage);
  const rigidMesh = new THREE.Mesh(rg2, ctx.toon({ map: O.tex, vertexColors: true, side: THREE.DoubleSide })); rigidMesh.frustumCulled = false; rigidMesh.castShadow = false; rigidMesh.receiveShadow = true; rigidMesh.name = 'south-rigid'; group.add(rigidMesh);

  const tick = (t) => {
    for (const L of clothLayers) {
      const { sheets, pos, rest, w: W_, ph } = L;
      for (const s of sheets) {
        const g = ctx.wind(t, s.x, s.z), base = s.amp * (0.5 + 0.8 * g);
        for (let i = s.i0; i < s.i1; i++) { const w = W_[i], d = w * (base + s.amp * 0.42 * Math.sin(t * 2.3 + ph[i])), k = i * 3; pos[k] = rest[k] + s.nx * d; pos[k + 1] = rest[k + 1] + Math.abs(d) * w * 0.3; pos[k + 2] = rest[k + 2] + s.nz * d; }
      }
      L.attr.needsUpdate = true;
    }
    for (const p of rg.parts) {
      const a = p.angle(t), c = Math.cos(a), s = Math.sin(a), k = 1 - c, { ax, ay, az, px, py, pz } = p;
      for (let i = p.i0; i < p.i1; i++) {
        const j = i * 3, x = rp[j], y = rp[j + 1], z = rp[j + 2], nx = rn[j], ny = rn[j + 1], nz = rn[j + 2], dp = ax * x + ay * y + az * z, dn = ax * nx + ay * ny + az * nz;
        rpOut[j] = px + x * c + (ay * z - az * y) * s + ax * dp * k; rpOut[j + 1] = py + y * c + (az * x - ax * z) * s + ay * dp * k; rpOut[j + 2] = pz + z * c + (ax * y - ay * x) * s + az * dp * k;
        rnOut[j] = nx * c + (ay * nz - az * ny) * s + ax * dn * k; rnOut[j + 1] = ny * c + (az * nx - ax * nz) * s + ay * dn * k; rnOut[j + 2] = nz * c + (ax * ny - ay * nx) * s + az * dn * k;
      }
    }
    rg2.attributes.position.needsUpdate = true; rg2.attributes.normal.needsUpdate = true;
  };
  tick(0);
  group.userData.south = { kitTris: info.tris, clothTris: (cl.idx.length + clO.idx.length) / 3, rigidTris: rp.length / 9, perBuilding: info.perBuilding };

  return { group, update(t) { tick(t); } };
}
