// rail.js — the forgotten local line along the east edge: ballast, two snapped tracks, the long platform and little
// station of みどり坂, two rusted cream-and-red commuter cars (the second off the rails), a flat wagon gone to garden,
// sagging catenary and a blind signal. All static parts go through a handful of batches; only three vine groups move.
import * as THREE from 'three';

const V3 = THREE.Vector3, M4 = THREE.Matrix4, Q = THREE.Quaternion;
const UP = new V3(0, 1, 0);
const v = (p) => (p instanceof V3 ? p.clone() : new V3(p[0], p[1], p[2]));
const FONT = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans CJK JP","Yu Gothic","Meiryo","Microsoft YaHei",sans-serif';
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Cylinder from a to b. */
function rod(a, b, r, seg = 6, r2 = r) {
  const A = v(a), d = v(b).sub(A), l = d.length(), g = new THREE.CylinderGeometry(r2, r, l, seg, 1);
  g.translate(0, l / 2, 0);
  g.applyMatrix4(new M4().compose(A, new Q().setFromUnitVectors(UP, d.normalize()), new V3(1, 1, 1)));
  return g;
}
/** Box from a to b, section w×h, h roughly along `up`. */
function beam(a, b, w, h, up = [0, 1, 0]) {
  const A = v(a), B = v(b), Z = B.clone().sub(A), l = Z.length(); Z.normalize();
  const X = new V3().crossVectors(v(up), Z).normalize(), Y = new V3().crossVectors(Z, X);
  const g = new THREE.BoxGeometry(w, h, l);
  g.applyMatrix4(new M4().makeBasis(X, Y, Z).setPosition(A.clone().lerp(B, 0.5)));
  return g;
}
const rrect = (x0, x1, y0, y1, r, n = 3) => {
  const p = [];
  for (const [cx, cy, q] of [[x1 - r, y1 - r, 0], [x0 + r, y1 - r, 1], [x0 + r, y0 + r, 2], [x1 - r, y0 + r, 3]])
    for (let i = 0; i <= n; i++) { const a = ((q + i / n) * Math.PI) / 2; p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return p;
};
/** Sweep a polygon section (u lateral, v up, CCW) through pts. Flat-shaded. */
function sweep(pts, section, rollFn = null) {
  const c = pts.map(v), pos = [], n = c.length, S = section.length;
  const ring = (i) => {
    const T = c[Math.min(n - 1, i + 1)].clone().sub(c[Math.max(0, i - 1)]).normalize();
    let R = new V3().crossVectors(T, UP); if (R.lengthSq() < 1e-4) R.set(1, 0, 0); R.normalize();
    const U = new V3().crossVectors(R, T).normalize();
    if (rollFn) { const a = rollFn(i / (n - 1)); R.applyAxisAngle(T, a); U.applyAxisAngle(T, a); }
    return section.map(([a, b]) => c[i].clone().addScaledVector(R, a).addScaledVector(U, b));
  };
  let A = ring(0); const tri = (p, q, r) => pos.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z);
  for (let k = 1; k < S - 1; k++) tri(A[0], A[k + 1], A[k]);
  for (let i = 1; i < n; i++) {
    const B = ring(i);
    for (let j = 0; j < S; j++) { const k = (j + 1) % S; tri(A[j], A[k], B[k]); tri(A[j], B[k], B[j]); }
    A = B;
  }
  for (let k = 1; k < S - 1; k++) tri(A[0], A[k], A[k + 1]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  return g;
}
const RAIL_SEC = [[-0.06, 0], [0.06, 0], [0.06, 0.022], [0.017, 0.045], [0.017, 0.092], [0.036, 0.1], [0.036, 0.135], [-0.036, 0.135], [-0.036, 0.1], [-0.017, 0.092], [-0.017, 0.045], [-0.06, 0.022]];

/* ------------------------------------------------------------------ painted atlas: signs ------------------------- */
function buildAtlas(ctx) {
  const S = 2048, R = {}, rr = ctx.seeded('rail-atlas'), { P } = ctx;
  const tex = ctx.canvasTexture(S, S, (g) => {
    const reg = (name, x, y, w, h, draw) => { R[name] = [x, y, w, h]; g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.translate(x, y); draw(w, h); g.restore(); };
    const text = (s, x, y, size, col, weight = 800, align = 'center') => { g.font = `${weight} ${size}px ${FONT}`; g.fillStyle = col; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(s, x, y); };
    const blot = (w, h, n, cols, r0, r1, a) => { for (let i = 0; i < n; i++) { g.fillStyle = rr.pick(cols); g.globalAlpha = a * (0.5 + rr() * 0.5); g.beginPath(); g.ellipse(rr() * w, rr() * h, rr.range(r0, r1), rr.range(r0, r1) * 0.7, rr() * 3, 0, 6.3); g.fill(); } g.globalAlpha = 1; };
    const drips = (w, h, n, y0 = 0) => { for (let i = 0; i < n; i++) { g.strokeStyle = rr.pick(['#a8553a', '#7d3a2a', '#c2703f']); g.globalAlpha = rr.range(0.25, 0.6); g.lineWidth = rr.range(1.5, 5); const x = rr() * w; g.beginPath(); g.moveTo(x, y0); g.lineTo(x + rr.range(-3, 3), y0 + rr.range(20, h * 0.5)); g.stroke(); } g.globalAlpha = 1; };

    g.fillStyle = '#d8d3bf'; g.fillRect(0, 0, S, S);
    // station name board (invented station on the invented みどり坂 line)
    reg('name', 0, 0, 1024, 340, (w, h) => {
      g.fillStyle = '#efead8'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#5a93a4'; g.fillRect(0, 214, w, 42);
      g.fillStyle = '#efead8'; g.beginPath(); g.moveTo(w - 96, 214); g.lineTo(w - 48, 235); g.lineTo(w - 96, 256); g.fill();
      text('みどり坂', w / 2, 96, 136, '#2f3f44', 900);
      text('MIDORIZAKA', w / 2, 184, 34, '#4e6066', 700);
      text('市民の森', 120, 290, 40, '#3f5358', 800); text('港口', w - 120, 290, 40, '#3f5358', 800);
      g.fillStyle = '#c8705e'; g.beginPath(); g.arc(w / 2, 235, 15, 0, 6.3); g.fill(); g.strokeStyle = '#efead8'; g.lineWidth = 5; g.stroke();
      blot(w, h, 34, ['#f3ecd9', '#cfc7ae'], 12, 62, 0.3); drips(w, h, 28); blot(w, 40, 12, ['#b5522f', '#7d3a2a'], 3, 13, 0.5); blot(w, h, 8, ['#8ab86a', '#5f9a60'], 10, 44, 0.32);
    });
    // timetable
    reg('time', 1024, 0, 300, 440, (w, h) => {
      g.fillStyle = '#e9e5d2'; g.fillRect(0, 0, w, h); g.fillStyle = '#c8705e'; g.fillRect(0, 0, w, 60);
      text('発車時刻表', w / 2, 32, 40, '#f8f3e2');
      for (let i = 0; i < 16; i++) { const y = 74 + i * 22; text(String(6 + i), 28, y + 7, 16, '#58626a', 700); g.fillStyle = '#58626a'; if (i % 3 !== 2) for (let k = 0; k < rr.int(1, 3); k++) g.fillRect(60 + k * 72, y, 48, 13); g.fillRect(8, y + 18, w - 16, 1); }
      g.fillStyle = 'rgba(245,238,214,.5)'; g.fillRect(0, 60, w, h); blot(w, h, 18, ['#f3ecd9', '#d8cfae'], 8, 40, 0.42); drips(w, h, 10);
    });
    // destination rolls
    reg('rollA', 1324, 0, 360, 96, (w, h) => { g.fillStyle = '#2f3b40'; g.fillRect(0, 0, w, h); text('普通  港口', w / 2, 50, 58, '#e9e5d0', 800); blot(w, h, 8, ['#4e5a5e', '#c7c1a8'], 4, 20, 0.2); });
    reg('rollB', 1684, 0, 360, 96, (w, h) => { g.fillStyle = '#2f3b40'; g.fillRect(0, 0, w, h); text('回送', w / 2, 50, 62, '#e9e5d0', 800); blot(w, h, 8, ['#4e5a5e', '#c7c1a8'], 4, 20, 0.2); });
    // tactile tile
    reg('tactile', 1324, 96, 128, 128, (w, h) => {
      g.fillStyle = '#d9b84e'; g.fillRect(0, 0, w, h); g.strokeStyle = '#b89a3e'; g.lineWidth = 3; g.strokeRect(1, 1, w - 2, h - 2);
      for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) { const x = 16 + i * 24, y = 16 + j * 24; g.fillStyle = '#b3953c'; g.beginPath(); g.arc(x + 1, y + 2, 8.5, 0, 6.3); g.fill(); g.fillStyle = '#ecd070'; g.beginPath(); g.arc(x, y, 7, 0, 6.3); g.fill(); }
    });
    reg('tactile2', 1452, 96, 128, 128, (w, h) => {
      g.fillStyle = '#c4a84c'; g.fillRect(0, 0, w, h);
      for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) { const x = 16 + i * 24, y = 16 + j * 24; g.fillStyle = '#d9bd5e'; g.beginPath(); g.arc(x, y, 7, 0, 6.3); g.fill(); }
      blot(w, h, 8, ['#8f9a5a', '#a8b16a', '#b5522f'], 6, 24, 0.5);
    });
    // numbers
    for (let i = 0; i < 6; i++) reg(`num${i}`, 1580 + i * 76, 96, 76, 96, (w, h) => {
      g.fillStyle = '#efe8d2'; g.fillRect(0, 0, w, h); g.fillStyle = '#5a93a4'; g.fillRect(0, 0, w, 16);
      text(String(i + 1), w / 2, 56, 62, '#2f3f44', 900); blot(w, h, 5, ['#b5522f', '#d8cfae'], 2, 10, 0.5);
    });
    // clock, stopped at 4:17
    reg('clock', 1324, 224, 256, 256, (w, h) => {
      g.fillStyle = '#ded8c0'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#f2ecd8'; g.beginPath(); g.arc(128, 128, 122, 0, 6.3); g.fill();
      g.fillStyle = '#3a474c'; for (let i = 0; i < 12; i++) { g.save(); g.translate(128, 128); g.rotate((i * Math.PI) / 6); g.fillRect(-4, -116, 8, i % 3 ? 16 : 30); g.restore(); }
      const hand = (a, l, t) => { g.save(); g.translate(128, 128); g.rotate(a); g.fillRect(-t / 2, -l, t, l + 16); g.restore(); };
      hand(((4 + 17 / 60) * Math.PI) / 6, 62, 10); hand((17 * Math.PI) / 30, 98, 6);
      g.beginPath(); g.fillStyle = '#c8705e'; g.arc(128, 128, 8, 0, 6.3); g.fill();
      blot(w, h, 12, ['#e6dcc0', '#c9bf9e'], 8, 40, 0.34); blot(w, h, 8, ['#b5522f', '#7d3a2a'], 3, 14, 0.4);
      g.strokeStyle = 'rgba(70,84,88,.55)'; g.lineWidth = 2; g.beginPath(); g.moveTo(60, 40); g.lineTo(118, 118); g.lineTo(90, 200); g.moveTo(118, 118); g.lineTo(200, 96); g.stroke();
    });
    // cracked signal lenses
    [['#7a2f30', '#b8574a'], ['#7f5d24', '#c29a48'], ['#1f625c', '#46a08e']].forEach(([d, l], i) => reg(`lens${i}`, 1580 + i * 112, 224, 112, 112, (w, h) => {
      g.fillStyle = d; g.fillRect(0, 0, w, h); g.fillStyle = l; g.beginPath(); g.ellipse(42, 38, 26, 15, -0.6, 0, 6.3); g.fill();
      g.strokeStyle = 'rgba(235,240,225,.8)'; g.lineWidth = 2.5; for (let k = 0; k < 6; k++) { g.beginPath(); let x = 60, y = 62, a = k * 1.1 + i; g.moveTo(x, y); for (let s = 0; s < 4; s++) { a += rr.range(-0.5, 0.5); x += Math.cos(a) * 16; y += Math.sin(a) * 16; g.lineTo(x, y); } g.stroke(); }
      if (i === 1) { g.fillStyle = '#28333a'; g.beginPath(); g.moveTo(58, 56); g.lineTo(96, 40); g.lineTo(104, 92); g.lineTo(70, 104); g.fill(); }
    }));
    // hanging ads inside the cars
    const ads = [['花の季節です', '市民の森 無料開放', '#d7e6cf', '#3f7a70'], ['夏、ふたたび。', '南風ソーダ', '#a8dcd8', '#c8605a'], ['お住まいは駅前に', 'みどり坂 第二団地', '#f2e0b8', '#7a5a42']];
    ads.forEach(([a, b, bg, ink], i) => reg(`ad${i}`, 0, 340 + i * 150, 320, 150, (w, h) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h); text(a, w / 2, 56, 44, ink, 900); text(b, w / 2, 112, 28, ink, 700); blot(w, h, 8, ['#f3ecd9', '#cdbf9f'], 6, 26, 0.4);
    }));
    // small signs
    reg('gate', 320, 340, 400, 100, (w, h) => { g.fillStyle = '#efe8d2'; g.fillRect(0, 0, w, h); g.fillStyle = '#5a93a4'; g.fillRect(0, 0, 18, h); text('改札口', 208, 52, 62, '#34464c', 900); blot(w, h, 8, ['#b5522f', '#d8cfae'], 3, 16, 0.42); });
    reg('noriba', 320, 440, 400, 100, (w, h) => { g.fillStyle = '#5a93a4'; g.fillRect(0, 0, w, h); text('1 番のりば', w / 2, 52, 56, '#f4efdc', 800); blot(w, h, 8, ['#f3ecd9', '#b5522f'], 3, 18, 0.34); });
    reg('speed', 320, 540, 110, 110, (w, h) => { g.fillStyle = '#efe8d2'; g.fillRect(0, 0, w, h); g.strokeStyle = '#c8705e'; g.lineWidth = 10; g.beginPath(); g.arc(55, 55, 44, 0, 6.3); g.stroke(); text('25', 55, 58, 46, '#2f3f44', 900); blot(w, h, 6, ['#b5522f'], 3, 12, 0.5); });
    reg('km', 430, 540, 110, 110, (w, h) => { g.fillStyle = '#efe8d2'; g.fillRect(0, 0, w, h); text('7', 36, 44, 58, '#2f3f44', 900); text('K', 80, 64, 34, '#2f3f44', 800); blot(w, h, 6, ['#8ab86a', '#b5522f'], 3, 14, 0.5); });
    reg('stop', 540, 540, 180, 110, (w, h) => { g.fillStyle = '#efe8d2'; g.fillRect(0, 0, w, h); text('発車案内', 90, 30, 26, '#34464c', 800); g.fillStyle = '#c8705e'; g.fillRect(16, 56, 148, 8); g.fillStyle = '#58626a'; g.fillRect(16, 76, 100, 8); });
  });
  const rect = (name) => { const [x, y, w, h] = R[name]; return [x / S, 1 - (y + h) / S, w / S, h / S]; };
  return { tex, rect };
}
/** Plane w×h facing +z textured with an atlas rectangle. */
function card(atlas, name, w, h) {
  const g = new THREE.PlaneGeometry(w, h), [u, vv, du, dv] = atlas.rect(name), uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u + uv.getX(i) * du, vv + uv.getY(i) * dv);
  return g;
}

/* ------------------------------------------------------------------ car skin: livery, rust streaks, faces --------- */
const ROW = 290, SK = 2048;
const LANES = { Ae: 0, Aw: 1, Be: 2, Bw: 3, roofA: 4, roofB: 5, fronts: 6 };
const CAR = { L: 13, W: 1.25, eave: 2.72, crest: 3.2, yb: 1.12, r: 0.36, dome: 1.2, belt: 1.84, stripe: 2.62 };
const WIN_Z = (() => { const o = []; for (const k of [-1, 0, 1]) for (const d of [-0.58, 0.58]) o.push({ z: k * 2.56 + d, w: 0.98 }); for (const s of [-1, 1]) o.push({ z: s * 5.42, w: 0.86 }); return o; })();
const DOOR_Z = [-4.35, 4.35];
const WIN_Y = [1.88, 2.54], DOOR_Y = [1.24, 2.6], DOOR_W = 0.98;

function buildSkin(ctx) {
  const rr = ctx.seeded('rail-skin'), { P } = ctx;
  const CREAM = '#f0e3c0', RED = '#c26a55', REDD = '#a9553f', tex = ctx.canvasTexture(SK, SK, (g) => {
    const blot = (x0, y0, w, h, n, cols, r0, r1, a) => { for (let i = 0; i < n; i++) { g.fillStyle = rr.pick(cols); g.globalAlpha = a * (0.5 + rr() * 0.5); g.beginPath(); g.ellipse(x0 + rr() * w, y0 + rr() * h, rr.range(r0, r1), rr.range(r0, r1) * rr.range(0.5, 1), rr() * 3, 0, 6.3); g.fill(); } g.globalAlpha = 1; };
    const streak = (x, y, l, w, a = 0.5, c = '#9a5436') => { const gr = g.createLinearGradient(0, y, 0, y + l); gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(154,84,54,0)'); g.fillStyle = gr; g.globalAlpha = a; g.beginPath(); g.moveTo(x - w, y); g.quadraticCurveTo(x - w * 0.6, y + l * 0.6, x + rr.range(-3, 3), y + l); g.quadraticCurveTo(x + w * 0.6, y + l * 0.6, x + w, y); g.fill(); g.globalAlpha = 1; };
    const yOf = (top, y) => top + (1 - (y - CAR.yb) / (CAR.eave - CAR.yb)) * ROW;
    const side = (row, name, wear) => {
      const top = row * ROW; g.save(); g.beginPath(); g.rect(0, top, SK, ROW); g.clip();
      g.fillStyle = CREAM; g.fillRect(0, top, SK, ROW);
      g.fillStyle = RED; g.fillRect(0, yOf(top, CAR.belt), SK, top + ROW - yOf(top, CAR.belt));
      g.fillStyle = RED; g.fillRect(0, top, SK, yOf(top, CAR.stripe) - top);
      g.fillStyle = REDD; g.fillRect(0, yOf(top, 1.34), SK, top + ROW - yOf(top, 1.34));
      // sun-bleached fields, kept broad so the livery stays two clean tones
      blot(0, yOf(top, 2.6), SK, 110, 40, ['#f8efd6', '#e4d5ae'], 40, 150, 0.2);
      blot(0, yOf(top, 1.8), SK, 110, 30, ['#d58a72', '#b45f4a'], 40, 170, 0.22);
      // panel seams
      g.strokeStyle = 'rgba(90,70,60,.35)'; g.lineWidth = 2; for (let z = -6; z <= 6; z += 1.28) { const x = ((z + 6.5) / 13) * SK; g.beginPath(); g.moveTo(x, top); g.lineTo(x, top + ROW); g.stroke(); }
      // rust runs below each window corner and door corner
      for (const w of WIN_Z) for (const d of [-1, 1]) if (rr() < 0.75) {
        const x = ((w.z + d * w.w * 0.48 + 6.5) / 13) * SK; streak(x, yOf(top, WIN_Y[0]) - 2, rr.range(30, 120) * wear, rr.range(5, 15), rr.range(0.4, 0.8));
      }
      for (const w of WIN_Z) if (rr() < 0.8) { const x = ((w.z + 6.5) / 13) * SK; streak(x + rr.range(-30, 30), yOf(top, WIN_Y[0]) - 2, rr.range(26, 70) * wear, rr.range(4, 10), 0.5); }
      for (let i = 0; i < 26 * wear; i++) streak(rr() * SK, top + rr.range(0, 12), rr.range(30, 120), rr.range(3, 9), rr.range(0.24, 0.5), '#8a5a3e');
      // skirt rot
      blot(0, top + ROW - 34, SK, 34, 90 * wear, ['#8c4a30', '#b5522f', '#7d3a2a', '#d9764a'], 8, 46, 0.72);
      blot(0, yOf(top, 1.8), SK, 80, 24 * wear, ['#8c4a30', '#b5522f'], 6, 26, 0.6);
      // flaked paint
      blot(0, top, SK, ROW, 16 * wear, ['#a8a79a', '#8b8f8a'], 5, 18, 0.55);
      // lettering
      g.font = `800 34px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = '#f2e9cf';
      const lx = ((-2.1 + 6.5) / 13) * SK; g.fillText(name, lx, yOf(top, 1.6));
      g.font = `900 40px ${FONT}`; g.fillStyle = 'rgba(242,233,207,.86)'; g.fillText('み', ((2.2 + 6.5) / 13) * SK, yOf(top, 1.6));
      g.restore();
    };
    side(LANES.Ae, 'モハ 1204', 1.1); side(LANES.Aw, 'モハ 1204', 0.8); side(LANES.Be, 'クハ 1351', 1.5); side(LANES.Bw, 'クハ 1351', 1.1);
    // roofs: canvas-grey sheet with soot, rust and water marks
    for (const row of [LANES.roofA, LANES.roofB]) {
      const top = row * ROW; g.save(); g.beginPath(); g.rect(0, top, SK, ROW); g.clip();
      g.fillStyle = '#8e9690'; g.fillRect(0, top, SK, ROW);
      blot(0, top, SK, ROW, 40, ['#9fa79e', '#7d8782'], 30, 130, 0.35);
      blot(0, top, SK, ROW, 34, ['#a9633f', '#8c4a30', '#b5724c'], 6, 34, 0.42);
      for (let i = 0; i < 90; i++) { const x = rr() * SK; g.fillStyle = rr.pick(['#8c4a30', '#b5522f', '#7d6a5a']); g.globalAlpha = rr.range(0.18, 0.5); g.fillRect(x, top + (rr() < 0.5 ? 0 : ROW * 0.7), rr.range(3, 12), ROW * 0.3); } g.globalAlpha = 1;
      g.fillStyle = 'rgba(120,70,50,.55)'; g.fillRect(0, top, SK, 16); g.fillRect(0, top + ROW - 16, SK, 16);
      g.strokeStyle = 'rgba(70,74,70,.4)'; g.lineWidth = 2; for (let x = 0; x < SK; x += 158) { g.beginPath(); g.moveTo(x, top); g.lineTo(x, top + ROW); g.stroke(); }
      g.restore();
    }
    // four end faces
    for (let i = 0; i < 4; i++) {
      const x0 = i * 512, top = LANES.fronts * ROW, W = 512, H = SK - top, y = (Y) => top + (1 - (Y - CAR.yb) / 2.1) * H;
      g.save(); g.beginPath(); g.rect(x0, top, W, H); g.clip();
      g.fillStyle = CREAM; g.fillRect(x0, top, W, H);
      g.fillStyle = RED; g.fillRect(x0, y(CAR.belt), W, top + H - y(CAR.belt));
      g.fillStyle = REDD; g.fillRect(x0, y(1.34), W, top + H - y(1.34));
      if (i % 2 === 0) { // cab face: a cream wedge rising under the windows, the line's only flourish
        g.fillStyle = CREAM; g.beginPath(); g.moveTo(x0 + W * 0.5, y(1.5)); g.lineTo(x0 + W, y(1.78)); g.lineTo(x0 + W, y(CAR.belt)); g.lineTo(x0, y(CAR.belt)); g.lineTo(x0, y(1.78)); g.fill();
      }
      blot(x0, top, W, H, 24, ['#f8efd6', '#d58a72'], 16, 60, 0.18);
      for (let k = 0; k < 16; k++) streak(x0 + rr() * W, y(2.0) + rr.range(-20, 40), rr.range(30, 110), rr.range(4, 11), rr.range(0.35, 0.7));
      blot(x0, y(1.3), W, 60, 24, ['#8c4a30', '#b5522f', '#7d3a2a'], 6, 30, 0.7);
      g.restore();
    }
  });
  return tex;
}
const skinV = (px) => 1 - px / SK;
function uvSide(g, row, flip = false) {
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, flip ? 1 - (p.getZ(i) + CAR.L / 2) / CAR.L : (p.getZ(i) + CAR.L / 2) / CAR.L, skinV(row * ROW + (1 - (p.getY(i) - CAR.yb) / (CAR.eave - CAR.yb)) * ROW));
  return g;
}
function uvFront(g, tile) {
  const p = g.attributes.position, uv = g.attributes.uv, top = LANES.fronts * ROW, H = SK - top;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (tile + (p.getX(i) + 1.0) / 2) * 0.25, skinV(top + (1 - (p.getY(i) - CAR.yb) / 2.1) * H));
  return g;
}

/* ------------------------------------------------------------------ the module ----------------------------------- */
export function build(ctx) {
  const { layout, P, kit, rng } = ctx, { RAIL, SUN_DIR, FLOWER_SPOTS, BASE } = layout;
  const SUN = new V3(...SUN_DIR), group = new THREE.Group();
  const H = ctx.batch();                                          // castShadow, ink lines
  const G = ctx.batch();                                          // glass
  const S = ctx.batch();                                          // soft: grass, ferns, petals, stones, moss cushions
  const atlas = buildAtlas(ctx), atlasMat = ctx.toon({ map: atlas.tex, vertexColors: true, moss: 0.12, dapple: false });
  const skinTex = buildSkin(ctx), skinMat = ctx.toon({ map: skinTex, vertexColors: true, moss: 0.3, dapple: false });
  const flatM = ctx.surface('flat', { vertexColors: true, dapple: false }), rustM = ctx.surface('rust', { vertexColors: true, dapple: false }), woodM = ctx.surface('wood', { vertexColors: true, dapple: false }), concM = ctx.surface('concrete', { vertexColors: true, moss: 0.24 });
  const sheetMat = ctx.surface('flat', { side: THREE.DoubleSide, vertexColors: true, dapple: false });
  const softMat = ctx.toon({ color: '#ffffff', side: THREE.DoubleSide, vertexColors: true, translucent: 0.65 });
  const glassTex = ctx.canvasTexture(1024, 256, (g) => {
    g.clearRect(0, 0, 1024, 256); const r = ctx.seeded('rail-glass');
    const base = (x) => { g.fillStyle = 'rgba(176,226,222,.42)'; g.fillRect(x, 0, 256, 256); };
    const glare = (x) => { g.fillStyle = 'rgba(246,255,246,.5)'; g.beginPath(); g.moveTo(x + 40, 256); g.lineTo(x + 120, 0); g.lineTo(x + 170, 0); g.lineTo(x + 90, 256); g.fill(); g.beginPath(); g.moveTo(x + 124, 256); g.lineTo(x + 204, 0); g.lineTo(x + 216, 0); g.lineTo(x + 136, 256); g.fill(); };
    base(0); glare(0);
    base(256); glare(256);
    g.strokeStyle = 'rgba(245,255,245,.85)'; g.lineWidth = 3; for (let k = 0; k < 8; k++) { let x = 256 + 96, y = 150, a = k * 0.8; g.beginPath(); g.moveTo(x, y); for (let s = 0; s < 5; s++) { a += r.range(-0.4, 0.4); x += Math.cos(a) * 40; y += Math.sin(a) * 40; g.lineTo(x, y); } g.stroke(); }
    // shards round a jagged hole
    const hole = (x, cx, cy, rx, ry) => { base(x); g.globalCompositeOperation = 'destination-out'; g.beginPath(); for (let k = 0; k < 16; k++) { const a = (k / 16) * 6.283, m = k % 2 ? 0.62 : 1.06; const px = x + cx + Math.cos(a) * rx * m, py = cy + Math.sin(a) * ry * m; k ? g.lineTo(px, py) : g.moveTo(px, py); } g.fill(); g.globalCompositeOperation = 'source-over'; };
    hole(512, 128, 140, 120, 130); hole(768, 110, 170, 150, 170);
  }, { repeat: false });
  const glassMat = ctx.toon({ map: glassTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, vertexColors: true, dapple: false });
  const pane = (w, h, tile) => { const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, (tile + uv.getX(i)) / 4, uv.getY(i)); return g; };

  /* ---------- clump-normal foliage ---------- */
  const shellMat = (() => {
    const m = ctx.toon({ color: '#ffffff', side: THREE.DoubleSide, vertexColors: true, dapple: false, translucent: 0.6 });
    const baseCompile = m.onBeforeCompile, key = m.customProgramCacheKey();
    m.onBeforeCompile = (sh, r) => {
      baseCompile(sh, r);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aShell;')
        .replace('#include <normal_vertex>', 'transformedNormal=normalize(mat3(viewMatrix)*aShell);\n#include <normal_vertex>');
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
    };
    m.customProgramCacheKey = () => key + '|shell';
    return m;
  })();
  const LEAF_P = (() => { const w = 0.8, c = 0.09; return [[0, 0, 0], [-w / 2, c, 0.3], [-w * 0.4, c, 0.68], [0, 0, 1], [w * 0.4, c, 0.68], [w / 2, c, 0.3]]; })();
  const LEAF_C = [0.72, 0.92, 1, 1.05, 1, 0.92], LEAF_I = [0, 2, 1, 0, 3, 2, 0, 4, 3, 0, 5, 4];
  const TONES = [[0.72, new THREE.Color(P.leafLit).lerp(new THREE.Color(P.leafMid), 0.3).multiplyScalar(0.84)], [0.6, new THREE.Color(P.leafMid).multiplyScalar(0.8)], [0.4, new THREE.Color(P.leafDeep).multiplyScalar(0.92)], [-9, new THREE.Color(P.leafShade).multiplyScalar(0.95)]];
  const toneOf = (x) => TONES.find(([min]) => x > min)[1];
  const leaves = [], LEAF_N = 0.56, LEAF_S = 1.2;                // static leaf list; density/size trade, tuned to the budget
  const bush = (c, radii, n, size = 0.16, { down = 0.3, list = leaves, top = -0.4, sunlit = 0 } = {}) => {
    const C = v(c), [rx, ry, rz] = typeof radii === 'number' ? [radii, radii, radii] : radii; n = Math.round(n * LEAF_N); size *= LEAF_S;
    for (let i = 0; i < n; i++) {
      const d = new V3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1); if (d.lengthSq() > 1 || d.lengthSq() < 0.01) { i--; continue; } d.normalize();
      if (d.y < top) { i--; continue; }
      const q = Math.cbrt(lerp(0.3, 1, rng())), p = new V3(C.x + d.x * rx * q, C.y + d.y * ry * q, C.z + d.z * rz * q);
      const shell = new V3(d.x / rx, d.y / ry, d.z / rz).normalize().lerp(UP, 0.12).normalize();
      const tip = d.clone().multiplyScalar(0.55).add(new V3(rng() - 0.5, rng() * 0.5 - 0.25 - down, rng() - 0.5)).normalize();
      list.push({ p, shell, tip, s: size * lerp(0.7, 1.15, rng()), tone: toneOf(shell.dot(SUN) * 0.5 + 0.5 + (rng() - 0.5) * 0.16 + sunlit) });
    }
  };
  const along = (pts, n, size, spread, { list = leaves, down = 0.5 } = {}) => {
    const c = new THREE.CatmullRomCurve3(pts.map(v)); n = Math.round(n * LEAF_N); size *= LEAF_S;
    for (let i = 0; i < n; i++) {
      const u = rng(), p = c.getPoint(u), d = new V3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize();
      const shell = d.clone().lerp(UP, 0.3).lerp(SUN, 0.25).normalize();
      list.push({ p: p.addScaledVector(d, spread * rng()), shell, tip: new V3(rng() - 0.5, -down - rng() * 0.3, rng() - 0.5).normalize(), s: size * lerp(0.7, 1.2, rng()), tone: toneOf(0.52 + d.dot(SUN) * 0.3 + (rng() - 0.5) * 0.2) });
    }
  };
  const leafGeometry = (list, pivot, extra = null) => {
    // non-instanced soup: one mesh per swaying group, with its stems in the same geometry
    const pos = [], col = [], shl = [], nor = [], uvs = [];
    const T = new V3(), Uu = new V3(), B = new V3(), P0 = new V3();
    for (const l of list) {
      T.copy(l.tip); Uu.copy(l.shell).addScaledVector(T, -l.shell.dot(T)).normalize(); B.crossVectors(Uu, T).normalize();
      for (const k of LEAF_I) {
        const [a, b, c] = LEAF_P[k]; P0.copy(l.p).addScaledVector(B, a * l.s).addScaledVector(Uu, b * l.s).addScaledVector(T, c * l.s);
        pos.push(P0.x - pivot[0], P0.y - pivot[1], P0.z - pivot[2]); shl.push(l.shell.x, l.shell.y, l.shell.z); nor.push(0, 1, 0); uvs.push(0, 0);
        const f = LEAF_C[k]; col.push(l.tone.r * f, l.tone.g * f, l.tone.b * f);
      }
    }
    if (extra) for (const { geo, color } of extra) {
      const g = geo.index ? geo.toNonIndexed() : geo, p = g.attributes.position, n = g.attributes.normal, c = new THREE.Color(color);
      for (let i = 0; i < p.count; i++) { pos.push(p.getX(i) - pivot[0], p.getY(i) - pivot[1], p.getZ(i) - pivot[2]); nor.push(n.getX(i), n.getY(i), n.getZ(i)); shl.push(n.getX(i), n.getY(i), n.getZ(i)); uvs.push(0, 0); col.push(c.r, c.g, c.b); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('aShell', new THREE.Float32BufferAttribute(shl, 3));
    return g;
  };

  /* ---------- soft plants ---------- */
  const GRASS = [P.grass, P.grassLit, P.moss, P.leafMid, P.mossLit];
  const bladeG = [kit.blade(0.42, 0.06, 0.12, 2), kit.blade(0.62, 0.06, 0.22, 2), kit.blade(0.3, 0.07, 0.1, 1)];
  const tuft = (x, y, z, n = 7, r = 0.14, s = 1, cols = GRASS) => {
    for (let i = 0; i < n; i++) S.add(rng.pick(bladeG), softMat, { pos: [x + rng.range(-r, r), y, z + rng.range(-r, r)], rot: [0, rng() * 6.28, 0], scale: s * rng.range(0.7, 1.25), color: rng.pick(cols) });
  };
  const frondG = [kit.frond(0.8, 5, 0.25), kit.frond(0.55, 4, 0.2)];
  const fern = (x, y, z, n = 6, s = 1, cols = [P.fern, P.leafMid, P.leafDeep], M = null) => {
    for (let i = 0; i < n; i++) {
      const o = { rot: [rng.range(-0.25, 0.1), (i / n) * 6.28 + rng() * 0.6, 0], pos: [x, y, z], scale: s * rng.range(0.8, 1.2), color: rng.pick(cols) };
      if (M) S.add(rng.pick(frondG), softMat, { matrix: M.clone().multiply(kit.xf(o)), color: o.color }); else S.add(rng.pick(frondG), softMat, o);
    }
  };
  const flowerG = kit.flower(0.09, 5), flowerG2 = kit.flower(0.065, 6), stemG = kit.cyl(0.006, 0.009, 1, 3, true).translate(0, 0.5, 0), eyeG = new THREE.TetrahedronGeometry(0.018, 0);
  const bloom = (x, y, z, h, col, big = false) => {
    const lean = [rng.range(-0.18, 0.18), 0, rng.range(-0.18, 0.18)];
    S.add(stemG, softMat, { pos: [x, y, z], rot: lean, scale: [1, h, 1], color: P.leafMid });
    const tx = x + Math.sin(lean[2]) * -h, tz = z + Math.sin(lean[0]) * h;
    S.add(big ? flowerG : flowerG2, softMat, { pos: [tx, y + h, tz], rot: [rng.range(-0.3, 0.3), rng() * 6.28, rng.range(-0.3, 0.3)], color: col });
    S.add(eyeG, softMat, { pos: [tx, y + h + 0.012, tz], scale: big ? 1.3 : 1, color: P.flowerYellow });
  };
  const mossG = kit.sphere(1, 7, 3);
  const moss = (x, y, z, r, sq = 0.3) => S.add(mossG, softMat, { matrix: kit.xf({ pos: [x, y, z], scale: [r, r * sq, r * rng.range(0.7, 1.5)], rot: [0, rng() * 6, 0] }), color: rng.pick([P.moss, P.mossDeep, '#6fae4c', P.moss]) });
  const sapling = (base, h, lean, cols = null) => {
    const b = v(base), top = b.clone().add(new V3(lean[0], h, lean[1])), mid = b.clone().lerp(top, 0.5); mid.x += rng.range(-0.12, 0.12); mid.z += rng.range(-0.12, 0.12);
    H.add(kit.tube([b, mid, top], 0.05 + h * 0.015, 0.016, 5, 10), flatM, { color: '#7a6048' });
    const tiers = 3 + Math.round(h);
    for (let i = 0; i < tiers; i++) {
      const t = 0.42 + (i / tiers) * 0.56, p = b.clone().lerp(top, t), a = rng() * 6.28, l = lerp(0.62, 0.34, t) * (0.6 + h * 0.22), e = p.clone().add(new V3(Math.cos(a) * l, l * 0.42, Math.sin(a) * l));
      H.add(kit.tube([p, p.clone().lerp(e, 0.5).add(new V3(0, 0.06, 0)), e], 0.016, 0.007, 4, 5, { capEnds: false }), flatM, { color: '#7a6048' });
      bush(e, [l * 0.8, l * 0.55, l * 0.8], Math.round(46 + l * 60), 0.13);
    }
    bush(top, [0.42, 0.42, 0.42], 70, 0.13);
  };

  /* ---------- ballast bed ---------- */
  { const B = RAIL.bed, [x0, x1] = B.x, nx = 22, nz = 90, y = B.y;
    const tex = ctx.canvasTexture(512, 512, (g, w, h) => {
      const r = ctx.seeded('rail-ballast'); g.fillStyle = '#868a84'; g.fillRect(0, 0, w, h);
      const cols = ['#a7a79c', '#969990', '#b7b3a4', '#8b9390', '#a39a8a', '#7f8a8a'];
      for (let i = 0; i < 620; i++) {
        const x = r() * w, yy = r() * h, s = r.range(11, 24), a = r() * 6.28, c = r.pick(cols);
        for (const [ox, oy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) { g.fillStyle = c; g.beginPath(); for (let k = 0; k < 6; k++) { const q = a + k * 1.05, m = s * (0.7 + 0.5 * Math.abs(Math.sin(k * 2.3 + i))); g.lineTo(x + ox + Math.cos(q) * m, yy + oy + Math.sin(q) * m * 0.8); } g.fill(); }
      }
    });
    const mat = ctx.toon({ map: tex, vertexColors: true, moss: 0.46 }); mat.userData.uv = 0.42;
    const hgt = (x, z) => {
      const e = Math.min(x - x0, x1 - x), sh = smooth(0, 0.7, e), n = 0.02 * Math.sin(x * 2.1 + z * 0.9) + 0.015 * Math.sin(z * 1.7 - x);
      return lerp(0.02, y - 0.01, sh) + n * sh;
    };
    const pos = [], put = (x, y2, z) => pos.push(x, y2, z);
    const X = (i) => lerp(x0, x1, i / nx), Z = (j) => lerp(-BASE.half, BASE.half, j / nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = [X(i), Z(j)], b = [X(i + 1), Z(j)], c = [X(i + 1), Z(j + 1)], d = [X(i), Z(j + 1)];
      for (const [px, pz] of [a, d, c, a, c, b]) put(px, hgt(px, pz), pz);
    }
    // end faces where the bed is cut by the plinth edge
    for (const z of [-BASE.half, BASE.half]) for (let i = 0; i < nx; i++) {
      const a = X(i), b = X(i + 1), f = z > 0 ? [[a, 1], [b, 0], [b, 1], [a, 1], [a, 0], [b, 0]] : [[a, 1], [b, 1], [b, 0], [a, 1], [b, 0], [a, 0]];
      for (const [px, k] of f) put(px, k ? hgt(px, z) : -0.05, z);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals(); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
    // rail stain: rust darkens the stones under each line, moisture cools the shoulder
    const c = new Float32Array(pos.length), warm = new THREE.Color('#d6b39a'), base = new THREE.Color('#ffffff'), cool = new THREE.Color('#cfe0d6'), tmp = new THREE.Color();
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i], d = Math.min(...RAIL.tracks.map((t) => Math.abs(Math.abs(x - t) - 0.535)));
      tmp.copy(base).lerp(warm, smooth(0.5, 0.05, d)).lerp(cool, smooth(0.9, 0.2, Math.min(x - x0, x1 - x))); c[i] = tmp.r; c[i + 1] = tmp.g; c[i + 2] = tmp.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    H.add(g, mat, {});
    // loose stones so the bed edge isn't a clean cut; concentrated at the shoulders and against the sleepers
    const st = new THREE.OctahedronGeometry(1, 0), stones = [new THREE.Color('#b7b3a4'), new THREE.Color('#9b9e96'), new THREE.Color('#a79d8c'), new THREE.Color('#858e8c')];
    for (let i = 0; i < 640; i++) {
      const k = rng(), x = k < 0.3 ? rng.range(x0 - 0.12, x0 + 0.55) : k < 0.55 ? rng.range(x1 - 0.5, x1 + 0.05) : rng.pick(RAIL.tracks) + rng.range(-1.35, 1.35), z = rng.range(-BASE.half + 0.02, BASE.half - 0.02), r = rng.range(0.05, 0.1);
      S.add(st, softMat, { pos: [x, hgt(Math.max(x0, Math.min(x1, x)), z) + r * 0.2, z], rot: [rng() * 3, rng() * 3, rng() * 3], scale: [r * rng.range(0.9, 1.5), r * 0.8, r * rng.range(0.9, 1.4)], color: rng.pick(stones) });
    }
  }

  /* ---------- tracks ---------- */
  const SLEEPER_TOP = RAIL.bed.y + 0.1, RAIL_Y = SLEEPER_TOP + 0.02, RAIL_TOP = RAIL_Y + 0.135, GAUGE = 1.07;
  const HALF = BASE.half;
  const tree = layout.GROVE.find((t) => t.kind === 'ginkgo' && t.x > 0), pier2 = layout.WRECK.footbridge.pier2;
  const blockedSleeper = (cx, z) => (cx > 17 && (Math.hypot(tree.x - cx, tree.z - z) < 1.15 || Math.abs(z - pier2.z) < 0.8));
  const WOODS = ['#94765a', '#86705c', '#a08466', '#7a6a58', '#8d7a62'];
  const railCol = ['#d78760', '#c9744e', '#b5623f'];
  /** x-offset of a rail away from true line, so a ginkgo can shoulder track 1 aside. */
  const railPath = (x, z0, z1) => {
    const near = Math.abs(x - (RAIL.tracks[1] - GAUGE / 2)) < 0.05 && tree;
    const n = near ? Math.max(2, Math.ceil(Math.abs(z1 - z0) / 0.5) + 1) : 2, pts = [];
    for (let i = 0; i < n; i++) { const z = lerp(z0, z1, i / (n - 1)), f = near ? Math.exp(-(((z - tree.z) / 1.25) ** 2)) : 0; pts.push([x - f * 0.5, RAIL_Y + f * 0.16, z]); }
    return pts;
  };
  const addRail = (pts, color) => H.add(sweep(pts, RAIL_SEC), rustM, { color });
  const curlTrack = (pts) => { const c = new THREE.CatmullRomCurve3(pts.map(v)); return c.getPoints(pts.length * 3); };
  for (let t = 0; t < 2; t++) {
    const cx = RAIL.tracks[t];
    // sleepers & tie plates
    for (let z = -HALF + 0.25, i = 0; z < HALF - 0.1; z += 0.62, i++) {
      if (blockedSleeper(cx, z)) continue;
      if (rng() < 0.05) continue;                                    // rotted away
      const sk = rng.range(-0.05, 0.05) + (rng() < 0.12 ? rng.range(-0.16, 0.16) : 0), dy = rng.range(-0.02, 0.012), g = kit.chip(kit.box(2.0, 0.11, 0.22, 2, 1, 1).toNonIndexed(), 0.012, rng), broken = rng() < 0.07;
      H.add(g, woodM, { pos: [cx + rng.range(-0.04, 0.04), SLEEPER_TOP - 0.055 + dy, z], rot: [rng.range(-0.02, 0.02), sk, rng.range(-0.02, 0.02)], scale: broken ? [0.66, 1, 1] : 1, color: rng.pick(WOODS) });
      if (broken) continue;
      for (const s of [-1, 1]) {
        H.add(kit.box(0.16, 0.02, 0.26), rustM, { pos: [cx + (s * GAUGE) / 2, SLEEPER_TOP + 0.008 + dy, z], rot: [0, sk, 0], color: '#e0b090' });
      }
    }
    // rail lengths with fishplated joints
    for (const s of [-1, 1]) {
      const x = cx + (s * GAUGE) / 2, joints = [];
      for (let z = -13 + t * 4 + (s > 0 ? 0.0 : 0.6); z < 19; z += 9.5) joints.push(z);
      const cuts = [-19.7, ...joints, 19.7];
      for (let i = 0; i < cuts.length - 1; i++) {
        let a = cuts[i] + 0.012, b = cuts[i + 1] - 0.012;
        if (t === 1 && s < 0) { // the footbridge pier landed on this rail: it was cut out around the footing
          if (a < pier2.z - 1 && b > pier2.z - 1 && b < pier2.z + 1) { b = pier2.z - 1; }
          else if (a < pier2.z + 1 && b > pier2.z + 1 && a > pier2.z - 1) { a = pier2.z + 1; }
          else if (a < pier2.z - 1 && b > pier2.z + 1) { addRail(railPath(x, a, pier2.z - 1), rng.pick(railCol)); a = pier2.z + 1; }
        }
        addRail(railPath(x, a, b), rng.pick(railCol));
      }
      for (const z of joints) if (!(t === 1 && s < 0 && Math.abs(z - pier2.z) < 1.2)) {
        for (const q of [-1, 1]) {
          H.add(kit.box(0.02, 0.07, 0.62), rustM, { pos: [x + q * 0.03, RAIL_Y + 0.07, z], color: '#d0a080' });
          for (const dz of [-0.2, 0.2]) H.add(kit.cyl(0.016, 0.016, 0.1, 5).rotateZ(1.57), rustM, { pos: [x + q * 0.03, RAIL_Y + 0.07, z + dz], color: '#b89070' });
        }
      }
    }
  }
  // rail ends: torn up, curling and hanging at both plinth edges
  { const T0 = RAIL.tracks[0], T1 = RAIL.tracks[1], g = GAUGE / 2, c = railCol, Y = RAIL_Y;
    // north edge
    addRail(curlTrack([[T0 - g, Y, -19.7], [T0 - g, Y, -20.05], [T0 - g - 0.04, Y - 0.2, -20.42], [T0 - g - 0.1, Y - 0.82, -20.68], [T0 - g - 0.22, Y - 1.5, -20.62], [T0 - g - 0.2, Y - 1.92, -20.34]]), c[0]);
    addRail(curlTrack([[T0 + g, Y, -19.7], [T0 + g, Y + 0.03, -20.05], [T0 + g + 0.05, Y + 0.2, -20.5], [T0 + g + 0.14, Y + 0.5, -20.95], [T0 + g + 0.2, Y + 0.88, -21.3]]), c[1]);
    addRail(curlTrack([[T1 - g, Y, -19.7], [T1 - g, Y - 0.02, -20.1], [T1 - g + 0.02, Y - 0.4, -20.5], [T1 - g + 0.05, Y - 1.22, -20.66], [T1 - g + 0.14, Y - 2.1, -20.6]]), c[2]);
    addRail(curlTrack([[T1 + g, Y, -19.7], [T1 + g, Y, -20.06], [T1 + g, Y - 0.34, -20.46], [T1 + g + 0.03, Y - 1.14, -20.6], [T1 + g + 0.03, Y - 1.86, -20.54]]), c[0]);
    // south edge
    addRail(curlTrack([[T0 - g, Y, 19.7], [T0 - g, Y + 0.03, 20.05], [T0 - g - 0.06, Y + 0.24, 20.5], [T0 - g - 0.16, Y + 0.58, 20.92], [T0 - g - 0.24, Y + 0.98, 21.24]]), c[1]);
    addRail(curlTrack([[T0 + g, Y, 19.7], [T0 + g, Y - 0.02, 20.05], [T0 + g + 0.08, Y - 0.42, 20.44], [T0 + g + 0.14, Y - 1.2, 20.6], [T0 + g + 0.12, Y - 1.98, 20.5], [T0 + g + 0.2, Y - 2.4, 20.2]]), c[2]);
    const dropL = [[T1 - g, Y, 19.7], [T1 - g, Y, 20.06], [T1 - g, Y - 0.32, 20.42], [T1 - g - 0.02, Y - 1.12, 20.58], [T1 - g - 0.02, Y - 2.0, 20.56], [T1 - g + 0.05, Y - 2.8, 20.42]];
    const dropR = dropL.map(([x, y, z]) => [x + GAUGE + 0.03, y + 0.02, z]);
    addRail(curlTrack(dropL), c[0]); addRail(curlTrack(dropR), c[1]);
    // a ladder of sleepers still spiked to the hanging rails, swung out over the drop
    [[1.06, 20.5], [1.72, 20.57], [2.36, 20.5]].forEach(([d, z], i) => H.add(kit.box(1.9, 0.1, 0.2), woodM, { pos: [T1 + (i ? 0.03 : 0), Y - d, z + 0.1], rot: [1.45, 0, i === 1 ? 0.06 : -0.05], color: WOODS[i] }));
    // north: one sleeper dangling from the drooping track 1 rails, half torn free
    H.add(kit.box(1.9, 0.1, 0.2), woodM, { pos: [T1 + 0.02, Y - 1.0, -20.7], rot: [1.42, 0, -0.14], color: WOODS[2] });
    // weeds hanging over the torn lip
    for (const x of [14.3, 15.9, 16.7, 17.7, 19.1]) for (const z of [-19.86, 19.86]) { fern(x, 0.24, z, 3, 0.8); tuft(x + 0.2, 0.24, z - Math.sign(z) * 0.2, 6, 0.2, 1.2); }
  }

  /* ---------- platform ---------- */
  const PF = RAIL.platform, PY = PF.y, [px0, px1] = PF.x, [pz0, pz1] = PF.z, EDGE = px1 - 0.13;
  { // retaining walls, the track wall stepped into bays
    H.add(kit.box(EDGE - px0 - 0.1, PY - 0.2, pz1 - pz0), concM, { pos: [(px0 + 0.1 + EDGE) / 2 - 0.06, (PY - 0.1) / 2 - 0.08, (pz0 + pz1) / 2], color: '#cfcbbf' });
    for (let z = pz0 + 0.4; z < pz1 - 1.2; z += 3.1) H.add(kit.chip(kit.box(0.14, PY - 0.08, 0.6, 1, 2, 1).toNonIndexed(), 0.012, rng), concM, { pos: [EDGE + 0.04, (PY - 0.08) / 2 - 0.02, z + 0.3], color: '#d9d6cb' });
    H.add(kit.box(0.18, PY - 0.08, pz1 - pz0), concM, { pos: [px0 + 0.09, (PY - 0.08) / 2 - 0.02, (pz0 + pz1) / 2], color: '#c6c4b8' });
    // deck: slabs with real gaps. `rampZ`: the south end ramps down to the ground.
    const rampZ = pz1 - 1.5; let z = pz0;
    const slabCols = ['#e0dccf', '#d7d4c8', '#e6e2d4', '#cfccc0'];
    while (z < rampZ - 0.2) {
      const l = Math.min(rng.range(1.5, 2.6), rampZ - z), kind = rng();
      const x0 = px0 + 0.02, x1 = EDGE - 0.2, gap = 0.035, tilt = [rng.range(-0.012, 0.012), 0, rng.range(-0.012, 0.012)];
      const addSlab = (poly, col, dy = 0, rot = tilt) => {
        const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length, cz = poly.reduce((s, p) => s + p[1], 0) / poly.length;
        const g = kit.plate(poly.map(([a, b]) => [a - cx, b - cz]), null, 0, 0.1);
        H.add(g, concM, { pos: [cx, PY + dy, cz], rot, color: col });
      };
      if (kind < 0.42) { // diagonal crack
        const a = lerp(z, z + l, rng.range(0.25, 0.5)), b = lerp(z, z + l, rng.range(0.5, 0.8)), mid = [(x0 + x1) / 2 + rng.range(-0.1, 0.1), (a + b) / 2 + rng.range(-0.08, 0.08)];
        addSlab([[x0, z], [x1, z], [x1, a - 0.03], [mid[0], mid[1] - 0.03], [x0, b - 0.03]], rng.pick(slabCols));
        addSlab([[x0, b + 0.03], [mid[0], mid[1] + 0.03], [x1, a + 0.03], [x1, z + l - gap], [x0, z + l - gap]], rng.pick(slabCols), -0.012, [rng.range(-0.03, 0.03), 0, rng.range(-0.025, 0.025)]);
        S.add(kit.box(x1 - x0, 0.02, 0.1), softMat, { pos: [(x0 + x1) / 2, PY - 0.07, mid[1]], rot: [0, 0.2, 0], color: P.moss });
        tuft(mid[0], PY - 0.03, mid[1], 7, 0.1, 0.9);
      } else addSlab([[x0, z], [x1, z], [x1, z + l - gap], [x0, z + l - gap]], rng.pick(slabCols));
      if (rng() < 0.7) tuft(rng.range(x0, x1), PY - 0.03, z + l - gap / 2, 5, 0.08, 0.8);
      z += l;
    }
    S.add(kit.box(EDGE - px0 - 0.2, 0.03, pz1 - pz0), softMat, { pos: [(EDGE + px0 - 0.1) / 2, PY - 0.105, (pz0 + pz1) / 2], color: P.mossDeep });
    // ramp at the south end
    { const a = [px0 + 0.02, EDGE + 0.11], y1 = PY, y0 = 0.06, sh = new THREE.BufferGeometry(), za = rampZ, zb = pz1;
      const p = [a[0], y1, za, a[1], y1, zb - 1.3 < za ? za : za, a[1], y0, zb, a[0], y1, za, a[1], y0, zb, a[0], y0, zb,
        a[1], y1, za, a[1], -0.05, zb, a[1], y0, zb, a[1], y1, za, a[1], -0.05, za, a[1], -0.05, zb,
        a[0], y1, za, a[0], y0, zb, a[0], -0.05, zb, a[0], y1, za, a[0], -0.05, zb, a[0], -0.05, za];
      sh.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); sh.computeVertexNormals(); sh.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(p.length / 3 * 2), 2));
      H.add(sh, concM, { color: '#d4d1c5' }); }
    // north end: three worn steps down to the ground, inside the platform's length
    H.add(kit.boxBase(px1 - px0 - 0.1, 0.56, 0.3), concM, { pos: [(px0 + px1) / 2 - 0.05, 0, pz0 - 0.15], color: '#d9d6cb' });
    H.add(kit.boxBase(px1 - px0 - 0.1, 0.28, 0.3), concM, { pos: [(px0 + px1) / 2 - 0.05, 0, pz0 - 0.45], color: '#cfccc0' });
    // coping along the track edge, pale and chipped, in lengths
    for (let z2 = pz0; z2 < rampZ; ) {
      const l = Math.min(rng.range(1.1, 2.2), rampZ - z2), g = kit.chip(kit.box(0.22, 0.1, l - 0.025, 1, 1, 3).toNonIndexed(), 0.012, rng);
      H.add(g, concM, { pos: [px1 - 0.11, PY - 0.05, z2 + l / 2], rot: [0, 0, rng.range(-0.015, 0.015)], color: rng.pick(['#f3efe2', '#ebe7d9', '#f6f2e6']) });
      z2 += l;
    }
    // tactile strip
    for (let z2 = pz0 + 0.17; z2 < rampZ - 0.1; z2 += 0.315) {
      const k = rng(); if (k < 0.05) continue;
      H.add(card(atlas, k < 0.3 ? 'tactile2' : 'tactile', 0.3, 0.3), atlasMat, { pos: [EDGE - 0.34 + rng.range(-0.004, 0.004), PY + 0.012 + (k > 0.96 ? 0.02 : 0), z2], rot: [-Math.PI / 2, 0, k > 0.9 ? rng.range(-0.1, 0.1) : 0], color: k < 0.3 ? '#efe6c8' : '#fff4d8' });
    }
    // number posts
    for (let i = 0; i < 6; i++) {
      const z2 = pz0 + 2.0 + i * 3.42, x = EDGE - 0.08;
      H.add(kit.boxBase(0.07, 0.8, 0.07), flatM, { pos: [x, PY, z2], rot: [rng.range(-0.05, 0.05), 0, rng.range(-0.06, 0.06)], color: '#b9b8ae' });
      H.add(kit.boxBase(0.2, 0.25, 0.015), flatM, { pos: [x, PY + 0.66, z2], rot: [0, Math.PI / 2, 0], color: '#6e7c80' });
      for (const s of [-1, 1]) H.add(card(atlas, `num${i}`, 0.17, 0.22), atlasMat, { pos: [x + s * 0.012, PY + 0.785, z2], rot: [0, (s * Math.PI) / 2, 0] });
    }
    // fence along the back, on concrete posts, one run fallen in
    const zs = []; for (let z2 = pz0 + 0.2; z2 < pz1 - 1.6; z2 += 1.9) zs.push(z2);
    zs.forEach((z2, i) => {
      const fallen = i >= 5 && i <= 6, tilt = fallen ? 0.9 : rng.range(-0.05, 0.05);
      H.add(kit.boxBase(0.09, 1.05, 0.09), concM, { pos: [px0 + 0.1, PY, z2], rot: [rng.range(-0.04, 0.04), 0, tilt], color: '#cfccc0' });
      if (i < zs.length - 1 && !fallen) for (const y of [0.42, 0.9]) if (rng() > 0.18) H.add(kit.box(0.04, 0.09, 1.92), woodM, { pos: [px0 + 0.14, PY + y + rng.range(-0.02, 0.02), z2 + 0.95], rot: [rng.range(-0.05, 0.05), 0, 0], color: rng.pick(['#f0dcb8', '#e6d0ac']) });
      if (rng() < 0.6) along([[px0 + 0.1, PY, z2], [px0 + 0.14, PY + 0.5, z2 + 0.06], [px0 + 0.08, PY + 1.05, z2 + 0.02], [px0 + 0.05, PY + 0.8, z2 + 0.4]], 34, 0.13, 0.13);
    });
    // grass and small bushes at the back and in the seams; cushions of moss on the deck
    for (let i = 0; i < 26; i++) moss(rng.range(px0 + 0.12, EDGE - 0.1), PY + 0.012, rng.range(pz0, rampZ), rng.range(0.1, 0.34), 0.14);
    for (let i = 0; i < 34; i++) tuft(rng.range(px0 + 0.1, px0 + 0.5), PY, rng.range(pz0, rampZ), 5, 0.12, 1.1);
    for (const z2 of [-6.2, -3.6, 1.2, 3.4]) bush([px0 + 0.38, PY + 0.3, z2], [0.5, 0.42, 0.9], 150, 0.13);
    for (const [z2, r] of [[-7.4, 1], [2.3, 0.9]]) { fern(px0 + 0.8, PY + 0.02, z2, 7, r); }
    // the track-side wall: weeds at its foot
    for (let i = 0; i < 26; i++) tuft(rng.range(13.72, 13.98), 0.28, rng.range(pz0, pz1), 5, 0.1, 1.15);
  }

  /* ---------- station: canopy, bench, gate, boards ---------- */
  { const st = RAIL.station, cx = st.x, RIDGE = 3.26, EAVE = 2.96, Xw = 11.92, Xe = 13.92, postC = '#5f6d70';
    const zP = [-14.6, -12.5, -10.5];
    // posts are old rails, with curved cantilever arms
    const rail2 = (a, b, r = 0.045) => H.add(rod(a, b, r, 6), flatM, { color: postC });
    zP.forEach((z, i) => {
      const bent = i === 2 ? 0.2 : 0, top = [cx + bent, RIDGE - 0.12 - bent * 0.8, z + bent * 0.4], pz = z;
      H.add(sweep([[cx, PY, pz], [cx + bent * 0.1, 1.7, pz], [cx + bent * 0.55, 2.5, pz + bent * 0.1], top], [[-0.05, -0.05], [0.05, -0.05], [0.05, 0.05], [-0.05, 0.05]].map(([a, b]) => [a, b])), flatM, { color: postC });
      H.add(kit.cylBase(0.09, 0.11, 0.1, 8), concM, { pos: [cx, PY, z] });
      if (i < 2) for (const s of [-1, 1]) {
        const X = s > 0 ? Xe : Xw;
        H.add(kit.tube([[cx, RIDGE - 0.08, z], [lerp(cx, X, 0.5), lerp(RIDGE, EAVE, 0.5) - 0.06, z], [X, EAVE - 0.05, z]], 0.035, 0.03, 5, 8), flatM, { color: postC });
        H.add(kit.tube([[cx, 2.42, z], [lerp(cx, X, 0.22), 2.62, z], [lerp(cx, X, 0.56), lerp(RIDGE, EAVE, 0.56) - 0.08, z]], 0.024, 0.024, 5, 8), flatM, { color: postC });
      }
    });
    // corrugated sheet, 1.05 wide, laid along the slope
    const corr = (len, w = 1.05, waves = 5) => {
      const n = waves * 4, pos = [], g = new THREE.BufferGeometry();
      for (let i = 0; i < n; i++) {
        const a = (i / n) * w - w / 2, b = ((i + 1) / n) * w - w / 2, ya = Math.sin((i / n) * waves * 6.283) * 0.022, yb = Math.sin(((i + 1) / n) * waves * 6.283) * 0.022;
        pos.push(a, ya, 0, b, yb, len, b, yb, 0, a, ya, 0, a, ya, len, b, yb, len);
      }
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
      return g;
    };
    const SHEET = ['#a9bcb8', '#94a9aa', '#c4835e', '#b8a48c', '#b4c4ba', '#a9633f'];
    const lay = (a, b, z, opt = {}) => { // sheet from point a to b, z centre
      const A = new V3(a[0], a[1], z), B = new V3(b[0], b[1], z + (opt.dz || 0)), l = A.distanceTo(B), Zd = B.clone().sub(A).normalize(), X = new V3().crossVectors(UP, Zd).normalize(), Y = new V3().crossVectors(Zd, X);
      const g = corr(l + (opt.over || 0.06)); H.add(g, sheetMat, { matrix: new M4().makeBasis(X, Y, Zd).setPosition(A).multiply(new M4().makeRotationZ(opt.roll || 0)), color: opt.color || rng.pick(SHEET) });
    };
    const slopeY = (x) => lerp(RIDGE, EAVE, Math.abs(x - cx) / (Xe - cx));
    // purlins of the standing north bay
    for (const x of [Xw + 0.05, lerp(Xw, cx, 0.5), cx, lerp(cx, Xe, 0.5), Xe - 0.05]) H.add(kit.box(0.05, 0.06, 4.55), flatM, { pos: [x, slopeY(x) - 0.02, -12.75], color: '#6a787a' });
    // north bay sheets, a few missing so light falls through
    for (let z = -14.98; z < -12.6; z += 1.0) {
      if (Math.abs(z + 13.98) > 0.2) lay([cx - 0.0, RIDGE + 0.04], [Xe + 0.1, EAVE - 0.0], z + 0.5);
      if (Math.abs(z + 12.98) > 0.2) lay([cx, RIDGE + 0.04], [Xw - 0.1, EAVE], z + 0.5);
    }
    H.add(kit.box(0.14, 0.05, 2.5), flatM, { pos: [cx, RIDGE + 0.09, -13.75], color: '#7f8f8e' });
    H.add(kit.box(0.05, 0.1, 2.42), rustM, { pos: [Xe + 0.08, EAVE - 0.02, -13.8], color: '#d8b090' });            // gutter
    H.add(kit.box(0.05, 0.1, 2.42), rustM, { pos: [Xw - 0.08, EAVE - 0.02, -13.8], color: '#d8b090' });
    // south bay gave way: east slope slid onto the car roof, west slope hinges down onto the fence
    for (let i = 0; i < 3; i++) {
      const z = -12.05 + i * 0.86;
      lay([cx + 0.06, RIDGE - 0.06 - i * 0.06], [14.72 + i * 0.08, 3.2 - i * 0.03], z, { dz: i * 0.08, roll: 0.02 * (i - 1), color: SHEET[i] });
      lay([cx - 0.06, RIDGE - 0.22 - i * 0.14], [12.05, 1.92 - i * 0.2], z + 0.05, { dz: -0.1 + i * 0.1, roll: (i - 1) * 0.08, color: SHEET[(i + 3) % 6] });
    }
    // sheets that fell clean off
    lay([12.4, PY + 0.34], [13.28, PY + 0.04], -9.8, { dz: 0.45, roll: 0.24, color: SHEET[2] });
    lay([14.9, 3.28], [15.9, 3.27], -13.2, { dz: -0.3, roll: 0.05, color: SHEET[1] });
    // broken rafter stubs
    H.add(kit.tube([[cx + 0.2, 2.98, -10.46], [lerp(cx, Xe, 0.6), 2.92, -10.56], [Xe + 0.02, 2.62, -10.84]], 0.03, 0.03, 5, 8), flatM, { color: postC });
    H.add(kit.tube([[cx + 0.15, 2.98, -10.46], [12.5, 2.54, -10.4], [12.14, 1.92, -10.3]], 0.03, 0.03, 5, 8), flatM, { color: postC });
    along([[12.05, 1.8, -11.6], [12.5, 2.6, -11.3], [12.9, 3.25, -11.2], [13.6, 3.28, -11.6], [14.4, 3.25, -11.5]], 180, 0.15, 0.32);
    bush([12.05, 1.6, -11.0], [0.5, 0.7, 1.1], 200, 0.14);
    // bench: slats on two iron frames, one end sunk
    { const bx = 12.42, bz = -13.55, seat = PY + 0.42;
      for (const dz of [-0.62, 0.62]) { H.add(kit.tube([[bx - 0.2, PY, bz + dz], [bx - 0.16, seat, bz + dz], [bx + 0.22, seat - 0.02, bz + dz]], 0.018, 0.018, 4, 6), rustM, { color: '#b0a090' }); H.add(rod([bx + 0.18, PY, bz + dz], [bx + 0.18, seat, bz + dz], 0.018, 4), rustM, { color: '#b0a090' }); H.add(kit.tube([[bx - 0.16, seat, bz + dz], [bx - 0.26, seat + 0.26, bz + dz], [bx - 0.3, seat + 0.5, bz + dz]], 0.018, 0.018, 4, 6), rustM, { color: '#b0a090' }); }
      for (let i = 0; i < 4; i++) H.add(kit.box(0.085, 0.024, 1.5), woodM, { pos: [bx - 0.14 + i * 0.1, seat + 0.012, bz], rot: [0, 0, 0.02], color: rng.pick(['#b8986e', '#a88a64']) });
      for (let i = 0; i < 3; i++) if (i !== 1) H.add(kit.box(0.02, 0.085, 1.5), woodM, { pos: [bx - 0.262 - i * 0.012, seat + 0.2 + i * 0.1, bz], rot: [0, 0, -0.16], color: rng.pick(['#b8986e', '#a88a64']) });
      moss(bx, seat + 0.03, bz + 0.3, 0.2, 0.2); tuft(bx + 0.1, PY, bz - 0.5, 8, 0.15, 1); fern(bx - 0.04, PY + 0.02, bz + 0.2, 4, 0.7);
    }
    // ticket gate: two steel wicket lanes across the platform's north end
    { const gz = -14.2, Y = PY, posts = [12.26, 12.86, 13.46];
      for (const x of posts) {
        H.add(kit.box(0.14, 0.92, 0.72), flatM, { pos: [x, Y + 0.46, gz], color: '#9fb0ac' });
        H.add(kit.box(0.2, 0.05, 0.8), flatM, { pos: [x, Y + 0.95, gz], color: '#7f908e' });
        H.add(kit.box(0.15, 0.3, 0.74), rustM, { pos: [x, Y + 0.16, gz], color: '#e6c0a0' });
        H.add(rod([x, Y + 0.97, gz - 0.28], [x, Y + 1.42, gz - 0.28], 0.016, 5), flatM, { color: '#7f908e' });
      }
      H.add(kit.box(0.46, 0.04, 0.03), rustM, { pos: [12.56, Y + 0.72, gz - 0.2], rot: [0, 0.62, 0], color: '#f0d0b0' });         // a little swing bar, left ajar
      H.add(kit.box(0.46, 0.04, 0.03), rustM, { pos: [13.16, Y + 0.72, gz - 0.33], color: '#f0d0b0' });
      H.add(kit.box(0.62, 0.2, 0.03), flatM, { pos: [12.86, 2.28, gz + 0.1], color: '#6f7f80' });
      H.add(rod([12.7, 2.38, gz + 0.1], [12.7, 3.1, gz + 0.1], 0.012, 4), flatM, { color: postC });
      H.add(rod([13.02, 2.38, gz + 0.1], [13.02, 3.1, gz + 0.1], 0.012, 4), flatM, { color: postC });
      for (const s of [0, Math.PI]) H.add(card(atlas, 'gate', 0.58, 0.16), atlasMat, { pos: [12.86, 2.28, gz + 0.1 + (s ? -0.018 : 0.018)], rot: [0, s, 0] });
      for (let i = 0; i < 12; i++) tuft(rng.range(12.2, 13.5), Y + 0.01, gz + rng.range(-0.5, 0.5), 5, 0.1, 1.0);
      along([[12.26, Y, gz + 0.3], [12.3, Y + 0.6, gz + 0.3], [12.26, Y + 1.0, gz + 0.1], [12.4, Y + 0.96, gz - 0.2]], 46, 0.12, 0.12);
    }
    // name board on two legs at the end of the platform, leaning a little and turned on its failed footing
    { const bx = 13.16, bz = -14.86, yaw = 0.62, tilt = 0.05, m = new M4().compose(new V3(bx, PY, bz), new Q().setFromEuler(new THREE.Euler(0, Math.PI + yaw, tilt, 'YXZ')), new V3(1, 1, 1));
      const at = (o) => ({ matrix: m.clone().multiply(kit.xf(o)), color: o.color });
      for (const x of [-0.72, 0.72]) H.add(kit.boxBase(0.08, 2.1, 0.08), flatM, at({ pos: [x, -0.02, 0], color: '#6a7a7c' }));
      H.add(kit.box(1.72, 0.62, 0.05), flatM, at({ pos: [0, 1.72, 0], color: '#5f7274' }));
      H.add(card(atlas, 'name', 1.64, 0.54), atlasMat, at({ pos: [0, 1.72, 0.03] }));
      H.add(card(atlas, 'name', 1.64, 0.54), atlasMat, at({ pos: [0, 1.72, -0.03], rot: [0, Math.PI, 0] }));
      H.add(kit.box(1.8, 0.05, 0.1), flatM, at({ pos: [0, 2.06, 0], color: '#7f8f8e' }));
      { const lg = (y, d = 0) => new V3(0.72 + d, y, 0).applyMatrix4(m); along([lg(0.02), lg(0.5, 0.04), lg(0.9, -0.03), lg(1.26, 0.03)], 70, 0.12, 0.09); H.add(kit.box(0.5, 0.05, 0.05), flatM, at({ pos: [0, 2.2, 0], rot: [0, 0, 0.0], color: '#7f8f8e' })); }
    }
    // timetable on the middle post, plus a platform sign hung under the standing roof
    H.add(kit.box(0.04, 0.84, 0.6), flatM, { pos: [cx + 0.07, PY + 1.08, -12.5], color: '#5f7274' });
    H.add(card(atlas, 'time', 0.54, 0.78), atlasMat, { pos: [cx + 0.093, PY + 1.08, -12.5], rot: [0, Math.PI / 2, 0] });
    H.add(card(atlas, 'time', 0.54, 0.78), atlasMat, { pos: [cx + 0.047, PY + 1.08, -12.5], rot: [0, -Math.PI / 2, 0] });
    H.add(kit.box(0.03, 0.2, 0.74), flatM, { pos: [13.5, 2.5, -13.5], color: '#6f7f80' });
    for (const s of [-1, 1]) H.add(card(atlas, 'noriba', 0.7, 0.17), atlasMat, { pos: [13.5 + s * 0.018, 2.5, -13.5], rot: [0, (s * Math.PI) / 2, 0] });
    for (const dz of [-0.28, 0.28]) H.add(rod([13.5, 2.6, -13.5 + dz], [13.5, 3.03, -13.5 + dz], 0.01, 4), flatM, { color: postC });
    // the stopped clock, on the platform where the gap between the cars shows it to the east
    { const x = 13.05, z = -2.3, top = 3.62, yaw = 0.8;
      H.add(kit.cylBase(0.14, 0.18, 0.14, 8), concM, { pos: [x, PY, z] });
      H.add(kit.cylBase(0.04, 0.055, top - PY, 8), flatM, { pos: [x, PY, z], rot: [0.012, 0, 0.03], color: '#6f8284' });
      const hx = x - 0.08, hy = top + 0.16, hz = z + 0.03;
      H.add(kit.cyl(0.3, 0.3, 0.13, 22).rotateX(Math.PI / 2), flatM, { pos: [hx, hy, hz], rot: [0, yaw, 0], color: '#5f7274' });
      H.add(kit.torus(0.3, 0.022, 6, 28), flatM, { pos: [hx, hy, hz], rot: [0, yaw, 0], color: '#8fa09c', scale: [1, 1, 3] });
      const face = (s) => { const g = new THREE.CircleGeometry(0.285, 24), [u, vv, du, dv] = atlas.rect('clock'), uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, u + uv.getX(i) * du, vv + uv.getY(i) * dv); return g; };
      H.add(face(), atlasMat, { pos: [hx + Math.sin(yaw) * 0.07, hy, hz + Math.cos(yaw) * 0.07], rot: [0, yaw, 0.04] });
      H.add(face(), atlasMat, { pos: [hx - Math.sin(yaw) * 0.07, hy, hz - Math.cos(yaw) * 0.07], rot: [0, yaw + Math.PI, 0.04] });
      along([[x, PY + 0.05, z + 0.06], [x + 0.08, PY + 0.9, z], [x - 0.06, PY + 1.7, z + 0.04], [x + 0.05, PY + 2.4, z - 0.02], [x - 0.02, top + 0.1, z + 0.03]], 90, 0.13, 0.1);
      H.add(kit.tube([[x, PY + 0.05, z + 0.06], [x + 0.06, PY + 0.8, z - 0.03], [x - 0.05, PY + 1.6, z + 0.05], [x + 0.05, PY + 2.4, z - 0.02]], 0.014, 0.01, 4, 16), flatM, { color: '#6e5a42' });
    }
    // a second bench on the open platform, gone to seed
    { const bx = 12.5, bz = 2.8, seat = PY + 0.4;
      for (const dz of [-0.55, 0.55]) H.add(kit.boxBase(0.34, 0.4, 0.05), rustM, { pos: [bx, PY, bz + dz], color: '#c0a890' });
      for (let i = 0; i < 3; i++) H.add(kit.box(0.1, 0.03, 1.4), woodM, { pos: [bx - 0.1 + i * 0.11, seat, bz], rot: [0, 0, i === 2 ? -0.1 : 0], color: '#a88a64' });
      bush([bx, seat + 0.1, bz - 0.2], [0.4, 0.3, 0.6], 120, 0.12);
    }
  }

  /* ---------- rolling stock ---------- */
  function bogie(M, zb = 0, { color = '#c88f70' } = {}) {
    const add = (g, mat, o) => H.add(g, mat, { matrix: M.clone().multiply(new M4().makeTranslation(0, 0, zb)).multiply(kit.xf(o)), color: o.color || color });
    const axle = RAIL_TOP + 0.285, GA = GAUGE / 2;
    for (const az of [-0.82, 0.82]) {
      add(kit.cyl(0.03, 0.03, 1.5, 6).rotateZ(Math.PI / 2), rustM, { pos: [0, axle, az], color: '#a87050' });
      for (const s of [-1, 1]) {
        add(kit.cyl(0.285, 0.285, 0.06, 14).rotateZ(Math.PI / 2), rustM, { pos: [s * GA, axle, az], color: '#b98668' });
        add(kit.cyl(0.32, 0.32, 0.02, 14).rotateZ(Math.PI / 2), rustM, { pos: [s * (GA - 0.035), axle, az], color: '#9f6c50' });
        add(kit.cyl(0.11, 0.13, 0.05, 10).rotateZ((s * Math.PI) / 2), rustM, { pos: [s * (GA + 0.05), axle, az], color: '#8a5a44' });
        add(kit.box(0.13, 0.2, 0.2), rustM, { pos: [s * (GA + 0.15), axle, az], color: '#b07a5c' });                 // journal box
        add(kit.box(0.05, 0.18, 0.1), rustM, { pos: [s * (GA + 0.02), axle - 0.02, az + (az > 0 ? -0.3 : 0.3)], rot: [az > 0 ? 0.2 : -0.2, 0, 0], color: '#8a5a44' }); // brake shoe
      }
    }
    for (const s of [-1, 1]) {
      // side frame: arched bar
      const x = s * (GA + 0.15), f = [[x, axle + 0.16, -1.2], [x, axle + 0.13, -0.82], [x, axle + 0.02, -0.34], [x, axle - 0.04, 0], [x, axle + 0.02, 0.34], [x, axle + 0.13, 0.82], [x, axle + 0.16, 1.2]];
      add(sweep(new THREE.CatmullRomCurve3(f.map(v)).getPoints(14), [[-0.035, -0.05], [0.035, -0.05], [0.035, 0.05], [-0.035, 0.05]]), rustM, { color: '#b58a70' });
      for (const dz of [-0.14, 0.14]) for (let i = 0; i < 3; i++) add(kit.cyl(0.05, 0.05, 0.03, 8), rustM, { pos: [x, axle + 0.02 + i * 0.05, dz], color: i % 2 ? '#8a5a44' : '#c29070' });  // coil spring
      add(kit.box(0.1, 0.04, 0.5), rustM, { pos: [x, axle + 0.16, 0], color: '#9c6c54' });
    }
    add(kit.box(2 * (GA + 0.15), 0.1, 0.34), rustM, { pos: [0, axle + 0.18, 0], color: '#a87458' });                 // bolster
    add(kit.box(2 * (GA + 0.15), 0.05, 0.12), rustM, { pos: [0, axle + 0.03, -0.42], color: '#8a5a44' });
    add(kit.box(2 * (GA + 0.15), 0.05, 0.12), rustM, { pos: [0, axle + 0.03, 0.42], color: '#8a5a44' });
  }

  function car(M, o) {
    const { L, W, eave, crest, yb, r, dome } = CAR, h = L / 2;
    const add = (g, mat, op = {}) => H.add(g, mat, { matrix: M.clone().multiply(kit.xf(op)), color: op.color });
    const lp = (x, y, z) => new V3(x, y, z).applyMatrix4(M);
    const glass = (g, op) => G.add(g, glassMat, { matrix: M.clone().multiply(kit.xf(op)), color: op.color || '#ffffff' });
    const prof = [[1.16, yb], [1.22, 1.16], [W, 1.22], [W, eave]];
    for (let i = 1; i <= 9; i++) { const a = (i / 9) * (Math.PI / 2); prof.push([W * Math.pow(Math.cos(a), 0.74), eave + (crest - eave) * Math.pow(Math.sin(a), 0.92)]); }
    const nE = prof.length, full = [...prof, ...prof.slice(0, -1).reverse().map(([x, y]) => [-x, y])], nP = full.length;
    const SIDE_J = 2, roofJ0 = 3, roofJ1 = nP - 4;                                    // j: cell index; 2 = east wall, nP-4+1.. = west wall
    // stations
    const st = new Set();
    for (let k = 0; k <= 5; k++) { const z = h - r + r * Math.sin((k / 5) * (Math.PI / 2)); st.add(+z.toFixed(4)); st.add(+(-z).toFixed(4)); }
    for (const d of [0.62, 0.86, dome]) { st.add(+(h - d).toFixed(4)); st.add(+(d - h).toFixed(4)); }
    const nM = 12; for (let i = 1; i < nM; i++) st.add(+lerp(dome - h, h - dome, i / nM).toFixed(4));
    if (o.hole) { st.add(o.hole.z[0]); st.add(o.hole.z[1]); }
    const zs = [...st].sort((a, b) => a - b), nZ = zs.length;
    const sx = (z) => { const d = Math.abs(z) - (h - r); return d > 0 ? (W - r + Math.sqrt(Math.max(0, r * r - d * d))) / W : 1; };
    const hz = (z) => { const d = Math.abs(z) - (h - dome); return d > 0 ? Math.sqrt(1 - (1 - 0.3) * (d / dome) ** 2) : 1; };
    const G0 = zs.map((z) => full.map(([x, y]) => new V3(x * sx(z), y > eave ? eave + (y - eave) * hz(z) : y, z)));
    const nor = (i, j) => { const a = G0[Math.min(nZ - 1, i + 1)][j].clone().sub(G0[Math.max(0, i - 1)][j]), b = G0[i][Math.min(nP - 1, j + 1)].clone().sub(G0[i][Math.max(0, j - 1)]); return b.cross(a).normalize(); };
    const N0 = G0.map((row, i) => row.map((_, j) => nor(i, j)));
    const inHole = (z0, z1, j) => o.hole && z0 >= o.hole.z[0] - 1e-3 && z1 <= o.hole.z[1] + 1e-3 && j >= o.hole.j[0] && j < o.hole.j[1];
    const emit = (pick, uvOf) => {
      const pos = [], nrm = [], uv = [], push = (i, j, u) => { const p = G0[i][j], n = N0[i][j]; pos.push(p.x, p.y, p.z); nrm.push(n.x, n.y, n.z); uv.push(u[0], u[1]); };
      for (let i = 0; i < nZ - 1; i++) for (let j = 0; j < nP - 1; j++) {
        if (!pick(i, j)) continue;
        const a = [i, j], b = [i, j + 1], c = [i + 1, j], d = [i + 1, j + 1];
        for (const [I, J] of [a, b, c, b, d, c]) push(I, J, uvOf(I, J, j));
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      return g;
    };
    const flatZ = h - r - 1e-3;
    const midSide = (i, j) => (j === SIDE_J || j === nP - 2 - SIDE_J) && Math.abs(zs[i]) < flatZ && Math.abs(zs[i + 1]) < flatZ + 2e-3 && Math.abs(zs[i]) < flatZ;
    const uvCell = (I, J, cell) => {
      const p = G0[I][J], u = (p.z + h) / L;
      if (cell >= roofJ0 && cell <= roofJ1 - 1 + 0) { const t = clamp((J - roofJ0) / (nP - 1 - 2 * roofJ0)); return [u, skinV((o.lanes.roof + 0.02 + t * 0.96) * ROW)]; }
      const row = cell < roofJ0 ? o.lanes.e : o.lanes.w;
      return [cell < roofJ0 ? 1 - u : u, skinV(row * ROW + (1 - (p.y - yb) / (eave - yb)) * ROW)];
    };
    add(emit((i, j) => !midSide(i, j) && !inHole(zs[i], zs[i + 1], j), uvCell), skinMat);

    // ceiling: the inner roof, pale, with the same hole
    const inner = (() => {
      const pos = [], nrm = [], uv = [], J0 = roofJ0, J1 = nP - 1 - roofJ0;
      for (let i = 0; i < nZ - 1; i++) {
        if (Math.abs(zs[i]) > h - 0.3 || Math.abs(zs[i + 1]) > h - 0.3) continue;
        for (let j = J0; j < J1; j++) {
          if (inHole(zs[i], zs[i + 1], j)) continue;
          const q = (I, J) => { const p = G0[I][J]; return [p.x * 0.955, eave + (p.y - eave) * 0.86, p.z]; }, n = (I, J) => N0[I][J];
          for (const [I, J] of [[i, j], [i + 1, j], [i, j + 1], [i, j + 1], [i + 1, j], [i + 1, j + 1]]) { pos.push(...q(I, J)); const m = n(I, J); nrm.push(-m.x, -m.y, -m.z); uv.push(0, 0); }
        }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      return g;
    })();
    add(inner, flatM, { color: '#dfe2cd' });
    if (o.hole) { // torn lip of the roof: a jagged rust ring mapped onto the curve
      const [z0, z1] = o.hole.z, jm = (o.hole.j[0] + o.hole.j[1]) / 2, sAt = (s, z) => { const i = clamp(Math.floor(s), 0, nP - 2), f = s - i, p = G0[zs.findIndex((q) => q >= z0)][i].clone().lerp(G0[zs.findIndex((q) => q >= z0)][i + 1], f); return [p.x, p.y]; };
      const cz = (z0 + z1) / 2, rz = (z1 - z0) / 2, rs = (o.hole.j[1] - o.hole.j[0]) / 2, n = 28, pos = [];
      const P2 = (a, k) => { const m = k ? 1.12 : lerp(0.72, 1.0, (Math.sin(a * 5.3 + 1) * 0.5 + 0.5) * 0.6 + rng() * 0.4); const s = jm + Math.sin(a) * rs * m, z = cz + Math.cos(a) * rz * m, [x, y] = sAt(s, z); const nn = 1.018; return [x * nn, eave + (y - eave) * nn + 0.008, z]; };
      const ring0 = [], ring1 = []; for (let k = 0; k < n; k++) { const a = (k / n) * 6.283; ring0.push(P2(a, 0)); ring1.push(P2(a, 1)); }
      for (let k = 0; k < n; k++) { const q = (k + 1) % n, A = ring0[k], B = ring0[q], C = ring1[k], Dd = ring1[q]; pos.push(...A, ...C, ...B, ...B, ...C, ...Dd); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
      H.add(g, sheetMat, { matrix: M, color: '#a9633f' });
    }

    /* side walls with real openings */
    const zr = flatZ, panel = [[-zr, 1.22], [zr, 1.22], [zr, eave], [-zr, eave]];
    const holes = [...WIN_Z.map((w) => rrect(w.z - w.w / 2, w.z + w.w / 2, WIN_Y[0], WIN_Y[1], 0.08)), ...DOOR_Z.map((z) => rrect(z - DOOR_W / 2, z + DOOR_W / 2, DOOR_Y[0], DOOR_Y[1], 0.05))];
    const linerShape = new THREE.Shape(panel.map(([x, y]) => new THREE.Vector2(x, y))); for (const hh of holes) linerShape.holes.push(new THREE.Path(hh.map(([x, y]) => new THREE.Vector2(x, y))));
    for (const s of [1, -1]) {
      const row = s > 0 ? o.lanes.e : o.lanes.w;
      const g = kit.wallPanel(panel, holes, 0.06);
      g.rotateY((s * Math.PI) / 2); g.translate(s * (W - 0.03), 0, 0);
      add(uvSide(g, row, s > 0), skinMat);
      const ln = new THREE.ShapeGeometry(linerShape); ln.rotateY((-s * Math.PI) / 2); ln.translate(s * (W - 0.066), 0, 0);
      add(ln, flatM, { color: '#b9c9bc' });
      // wainscot and rain gutter
      add(kit.box(0.06, 0.03, L - 2 * r - 0.02), flatM, { pos: [s * (W + 0.03), eave + 0.02, 0], color: '#a8655a' });
      add(kit.box(0.03, 0.05, L - 2 * r), rustM, { pos: [s * (W + 0.05), eave - 0.005, 0], color: '#e0b090' });
      // window frames, sash bars, glass
      const FR = ['#c7c5b2', '#b9b7a4', '#a9a998'];
      const ringOuter = (w) => rrect(-w / 2 - 0.035, w / 2 + 0.035, -0.365, 0.365, 0.1, 2), ringInner = (w) => rrect(-w / 2 + 0.03, w / 2 - 0.03, -0.3, 0.3, 0.05, 2);
      WIN_Z.forEach((w, wi) => {
        const yc = (WIN_Y[0] + WIN_Y[1]) / 2, fg = kit.wallPanel(ringOuter(w.w), [ringInner(w.w)], 0.05), side = [s * (W + 0.006), yc, w.z], rot = [0, (s * Math.PI) / 2, 0];
        const fc = rng.pick(FR); add(fg, flatM, { pos: side, rot, color: fc });
        add(kit.box(0.04, 0.035, w.w - 0.06), flatM, { pos: [s * (W - 0.01), yc + 0.08, w.z], color: fc });
        if (w.w > 0.9) add(kit.box(0.03, 0.34, 0.03), flatM, { pos: [s * (W - 0.01), yc + 0.17, w.z], color: fc });
        const state = o.win(s, wi), pw = w.w - 0.08;
        const up = [s * (W - 0.018), yc + 0.17, w.z], lo = [s * (W - 0.03), yc - 0.14, w.z];
        if (state === 0) { glass(pane(pw, 0.24, 0), { pos: up, rot }); glass(pane(pw, 0.36, 0), { pos: lo, rot }); }
        else if (state === 1) { glass(pane(pw, 0.24, 1), { pos: up, rot }); glass(pane(pw, 0.36, 2), { pos: lo, rot }); }
        else if (state === 2) { glass(pane(pw, 0.24, 3), { pos: up, rot }); }
        else if (state === 3) { /* both gone */ }
        // little sill drip of rust under frames
        add(kit.box(0.03, 0.022, w.w + 0.08), rustM, { pos: [s * (W + 0.008), WIN_Y[0] - 0.04, w.z], color: '#dfb498' });
      });
      // doors
      DOOR_Z.forEach((z, di) => {
        const open = o.door === `${s > 0 ? 'e' : 'w'}${di}`;
        for (const q of [-1, 1]) {
          const lw = DOOR_W / 2 - 0.005, dw = rrect(-lw / 2 + 0.07, lw / 2 - 0.07, 1.86, 2.46, 0.05), leaf = kit.wallPanel(rrect(-lw / 2, lw / 2, DOOR_Y[0], DOOR_Y[1], 0.012, 1), [dw], 0.03);
          leaf.rotateY((s * Math.PI) / 2);
          const slide = open ? 0.33 : 0, zc = z + q * (lw / 2 + 0.002 + slide);
          leaf.translate(s * (W - 0.045 - (open ? 0.03 : 0)), 0, zc);
          add(uvSide(leaf, row, s > 0), skinMat);
          if (!(open && q > 0)) glass(pane(lw - 0.16, 0.56, rng() < 0.4 ? 3 : 0), { pos: [s * (W - 0.045), 2.16, zc], rot: [0, (s * Math.PI) / 2, 0] });
        }
        add(kit.box(0.09, 0.03, DOOR_W + 0.06), flatM, { pos: [s * (W - 0.02), DOOR_Y[0], z], color: '#c7c5b2' });        // threshold
        add(kit.box(0.04, 0.04, DOOR_W + 0.22), rustM, { pos: [s * (W + 0.03), DOOR_Y[1] + 0.06, z], color: '#e0b090' });      // drip rail
        for (const q of [-1, 1]) add(rod([s * (W + 0.05), 1.5, z + q * (DOOR_W / 2 + 0.09)], [s * (W + 0.05), 2.28, z + q * (DOOR_W / 2 + 0.09)], 0.012, 4), rustM, { color: '#d8c0a0' }); // grab rail
        add(kit.box(0.18, 0.04, DOOR_W + 0.1), rustM, { pos: [s * (W + 0.04), 1.08, z], color: '#a87050' });                   // step
      });
      add(kit.box(0.02, 0.16, 0.3), flatM, { pos: [s * (W + 0.012), 2.3, 3.87 * (s > 0 ? -1 : 1) + 0.25], color: '#b7c2b0' });   // door-switch box
    }

    /* end faces */
    const endPoly = G0[nZ - 1].map((p) => [p.x, p.y]);                                  // closed by the bottom
    [1, -1].forEach((e, fi) => {
      const cab = (e > 0) === o.cabSouth, tile = fi + o.tile * 2;
      const hs = cab
        ? [rrect(-0.82, -0.3, 1.94, 2.62, 0.07), rrect(-0.22, 0.22, 1.94, 2.62, 0.07), rrect(0.3, 0.82, 1.94, 2.62, 0.07)]
        : [rrect(-0.42, 0.42, 1.24, 2.6, 0.05)];
      const f = kit.wallPanel(endPoly, hs, 0.06);
      uvFront(f, tile);
      if (e < 0) f.rotateY(Math.PI);
      f.translate(0, 0, e * (h - 0.03));
      add(f, skinMat);
      const zf = e * h, rot = [0, e > 0 ? 0 : Math.PI, 0], at = (x, y, d = 0.02) => [e > 0 ? x : -x, y, zf + e * d];
      if (cab) {
        for (const [a, b] of [[-0.82, -0.3], [-0.22, 0.22], [0.3, 0.82]]) {
          const w = b - a, c = (a + b) / 2, yc = 2.28;
          add(kit.wallPanel(rrect(-w / 2 - 0.03, w / 2 + 0.03, -0.37, 0.37, 0.09), [rrect(-w / 2 + 0.025, w / 2 - 0.025, -0.315, 0.315, 0.05)], 0.05), flatM, { pos: at(c, yc, 0.005), rot, color: '#c7c5b2' });
          glass(pane(w - 0.05, 0.63, a < -0.5 ? 2 : a > 0 ? 0 : 1), { pos: at(c, yc, -0.02), rot });
        }
        // roll sign box above the centre window
        add(kit.box(0.76, 0.2, 0.05), flatM, { pos: at(0, 2.83, 0.0), color: '#6a787a' });
        add(card(atlas, o.roll, 0.68, 0.15), atlasMat, { pos: at(0, 2.83, 0.03), rot });
        // headlamp, tail lamps, plate, wipers, coupler, anti-climber
        add(kit.cyl(0.14, 0.12, 0.14, 12).rotateX(Math.PI / 2), flatM, { pos: at(0, 3.0, -0.14), color: '#c26a55' });
        add(kit.torus(0.115, 0.018, 5, 16), rustM, { pos: at(0, 3.0, -0.07), rot, color: '#e8d0b0' });
        glass(new THREE.CircleGeometry(0.105, 12), { pos: at(0, 3.0, -0.065), rot });
        for (const q of [-0.66, 0.66]) { add(kit.cyl(0.07, 0.07, 0.05, 10).rotateX(Math.PI / 2), flatM, { pos: at(q, 1.66, 0.02), color: '#7a2f30' }); add(kit.torus(0.07, 0.012, 4, 12), rustM, { pos: at(q, 1.66, 0.045), rot, color: '#e8d0b0' }); }
        add(kit.box(1.75, 0.06, 0.05), rustM, { pos: at(0, 1.4, 0.02), color: '#d0a080' });
        for (const q of [-0.58, 0.58]) add(rod(at(q + 0.16, 1.98, 0.05), at(q - 0.05, 2.24, 0.05), 0.01, 4), flatM, { color: '#4e5a5e' });
        add(rod(at(0.88, 1.5, 0.06), at(0.88, 2.5, 0.06), 0.014, 4), rustM, { color: '#d8c0a0' }); add(rod(at(-0.88, 1.5, 0.06), at(-0.88, 2.5, 0.06), 0.014, 4), rustM, { color: '#d8c0a0' });
      } else {
        // gangway door + bellows frame
        add(kit.wallPanel(rrect(-0.46, 0.46, 1.18, 2.66, 0.05), [rrect(-0.4, 0.4, 1.26, 2.58, 0.04)], 0.08), flatM, { pos: [0, 0, zf + e * 0.02], rot, color: '#7f8a80' });
        const leaf = kit.wallPanel(rrect(-0.4, 0.4, 1.26, 2.58, 0.02, 1), [rrect(-0.24, 0.24, 1.9, 2.46, 0.05)], 0.03);
        add(leaf, flatM, { pos: [0, 0, zf - e * 0.05], rot: [0, e > 0 ? 0.28 : Math.PI - 0.28, 0], color: '#b9c9bc' });
        const nf = o.bellows; for (let i = 0; i < nf; i++) {
          const zz = zf + e * (0.04 + i * 0.055), wob = i * 0.012 * (i % 2 ? 1 : -1);
          add(kit.wallPanel(rrect(-0.56 + wob, 0.56 + wob, 1.16 + i * 0.015, 2.72 - i * 0.05, 0.08), [rrect(-0.47 + wob, 0.47 + wob, 1.24 + i * 0.015, 2.64 - i * 0.05, 0.05)], 0.05), flatM, { pos: [0, 0, zz], color: i % 2 ? '#6f7a76' : '#87918a' });
        }
      }
      // coupler
      add(kit.box(0.09, 0.09, 0.5), rustM, { pos: at(0, 1.0, 0.2), color: '#b0785a' });
      add(kit.box(0.2, 0.14, 0.1), rustM, { pos: at(0, 1.0, 0.46), color: '#c88f70' });
      add(kit.box(0.34, 0.08, 0.1), rustM, { pos: at(0, 1.1, 0.05), color: '#8a5a44' });
      add(kit.tube([at(0.32, 1.14, 0.05), at(0.42, 0.92, 0.26), at(0.3, 0.72, 0.22), at(0.2, 0.86, 0.08)], 0.02, 0.018, 4, 10), flatM, { color: '#3f4a4e' }); // hanging air hose
      // inner partition
      const zp = e * (cab ? h - 0.72 : h - 0.14), pPoly = rrect(-1.18, 1.18, 1.2, eave + 0.2, 0.2), dh = rrect(-0.38, 0.38, 1.24, 2.58, 0.03);
      const pg = new THREE.ShapeGeometry(new THREE.Shape(pPoly.map(([x, y]) => new THREE.Vector2(x, y)))); const ps = new THREE.Shape(pPoly.map(([x, y]) => new THREE.Vector2(x, y))); ps.holes.push(new THREE.Path(dh.map(([x, y]) => new THREE.Vector2(x, y))));
      for (const q of [0, Math.PI]) { const gg = new THREE.ShapeGeometry(ps); gg.rotateY(q); gg.translate(0, 0, zp + (q ? -0.012 : 0.012)); add(gg, flatM, { color: '#c6d2c2' }); }
      if (cab) { add(kit.box(0.6, 0.7, 0.3), flatM, { pos: at(-0.5, 1.56, -0.35), color: '#5f7274' }); add(kit.box(0.34, 0.5, 0.34), flatM, { pos: at(-0.5, 1.46, -0.72), color: '#8a7a68' }); }
    });

    /* interior */
    add(kit.box(2.4, 0.06, L - 0.2), woodM, { pos: [0, 1.17, 0], color: '#b49a78' });
    add(kit.box(2.3, 0.16, L - 0.3), rustM, { pos: [0, 1.06, 0], color: '#8a6a58' });           // underframe
    const SEAT = o.seat;
    const seat = (s, z0, z1, collapsed = 0) => {
      const c = (z0 + z1) / 2, l = z1 - z0;
      add(kit.box(0.46, 0.12, l), flatM, { pos: [s * 0.94, 1.58 - collapsed * 0.1, c], rot: [0, 0, s * collapsed * 0.12], color: SEAT });
      add(kit.box(0.42, 0.04, l), flatM, { pos: [s * 0.95, 1.5 - collapsed * 0.1, c], color: '#7c8a84' });
      add(kit.box(0.1, 0.34, l), flatM, { pos: [s * 1.13, 1.82, c], rot: [0, 0, s * -0.1], color: SEAT });
      add(kit.box(0.06, 0.38, l - 0.1), flatM, { pos: [s * 1.02, 1.36, c], color: '#8c9a92' });
    };
    for (const s of [-1, 1]) {
      [[-3.68, -1.2], [-1.15, 1.15], [1.2, 3.68]].forEach(([a, b], i) => seat(s, a, b, o.broken === `${s}${i}` ? 1 : 0));
      seat(s, -5.8, -4.98); seat(s, 4.98, 5.8);
      add(rod([s * 1.03, 2.64, -5.9], [s * 1.03, 2.64, 5.9], 0.012, 4), flatM, { color: '#b8c0b4' });      // luggage rack
      add(rod([s * 0.82, 2.66, -5.9], [s * 0.82, 2.66, 5.9], 0.012, 4), flatM, { color: '#b8c0b4' });
      for (let z = -5.5; z < 5.6; z += 1.4) add(kit.box(0.26, 0.012, 0.03), flatM, { pos: [s * 0.93, 2.65, z], color: '#a8b0a4' });
      add(rod([s * 0.62, 2.8, -3.7], [s * 0.62, 2.8, 3.7], 0.012, 5), flatM, { color: '#c8cdbf' });                 // strap bar
      for (let z = -3.5; z <= 3.5; z += 0.47) {
        const lost = rng() < 0.12; if (lost) continue;
        const sw = rng.range(-0.05, 0.05);
        add(kit.box(0.014, 0.2, 0.03), flatM, { pos: [s * 0.62, 2.68, z], rot: [sw, 0, 0], color: '#e8e0c8' });
        add(kit.torus(0.045, 0.01, 3, 8), flatM, { pos: [s * 0.62, 2.54, z - sw * 0.2], rot: [0, Math.PI / 2, 0], color: '#f0ead6' });
      }
      for (const z of [-3.86, 3.86]) add(rod([s * 0.72, 1.2, z], [s * 0.72, 2.86, z], 0.016, 5), flatM, { color: '#c8cdbf' });
    }
    for (let z = -4.8; z <= 4.9; z += 3.2) { add(kit.cyl(0.2, 0.2, 0.03, 10), flatM, { pos: [0, 2.99, z], color: '#c7ccb8' }); add(kit.box(0.42, 0.012, 0.05), flatM, { pos: [0, 2.96, z], rot: [0, 0.7, 0], color: '#8c9a92' }); }
    add(kit.box(0.14, 0.03, 8), flatM, { pos: [-0.32, 3.0, 0], color: '#f2f0dc' });
    add(kit.box(0.14, 0.03, 8), flatM, { pos: [0.32, 3.0, 0], color: '#f2f0dc' });
    [[-2.6, 0], [0.2, 1], [2.9, 2]].forEach(([z, i]) => { for (const s of [-1, 1]) add(card(atlas, `ad${i}`, 0.62, 0.3), atlasMat, { pos: [s * 0.012, 2.72, z], rot: [0, (s * Math.PI) / 2, 0] }); add(kit.box(0.02, 0.02, 0.64), flatM, { pos: [0, 2.88, z], color: '#a8b0a4' }); });

    /* under the floor */
    for (const [z, l, cc] of [[-1.7, 1.5, '#8a6a58'], [0.6, 1.1, '#7a5e50'], [2.1, 1.0, '#94705c']]) for (const s of [-1, 1]) {
      add(kit.box(0.5, 0.26, l), rustM, { pos: [s * 0.62, 0.86, z], color: cc });
      add(kit.box(0.52, 0.03, l + 0.04), rustM, { pos: [s * 0.62, 1.0, z], color: '#b08068' });
    }
    add(kit.cyl(0.13, 0.13, 1.5, 10).rotateX(Math.PI / 2), rustM, { pos: [0, 0.86, 0.3], color: '#a87458' });
    for (const z of [-3.1, -2.75]) add(kit.box(2.3, 0.05, 0.05), rustM, { pos: [0, 0.97, z], color: '#8a5a44' });

    /* roof gear */
    for (let i = 0; i < 6; i++) { // torpedo vents down the centre
      const z = -4.6 + i * 1.84; if (o.hole && z > o.hole.z[0] - 0.4 && z < o.hole.z[1] + 0.4) continue;
      add(kit.sphere(0.13, 10, 6), flatM, { pos: [0, crest + 0.055, z], scale: [1, 0.7, 2.1], color: rng.pick(['#b4bab0', '#a2aaa2', '#bdb6a6']) });
      add(kit.box(0.2, 0.02, 0.6), flatM, { pos: [0, crest - 0.006, z], color: '#8e9690' });
    }
    add(kit.box(0.34, 0.02, L - 3), woodM, { pos: [0.44, crest - 0.055, 0], rot: [0, 0, -0.16], color: '#8e8676' });  // walkway board
    if (o.panto) { // pantograph folded down, its head no higher than 3.38
      const zp = o.panto, base = crest + 0.05, A = '#6a7a7c', top = 3.33;
      for (const x of [-0.42, 0.42]) for (const z of [-0.5, 0.5]) { add(kit.cylBase(0.05, 0.065, 0.09, 8), flatM, { pos: [x, crest - 0.06 - Math.abs(x) * 0.1, zp + z], color: '#e8e0c8' }); }
      add(kit.box(0.92, 0.035, 1.16), flatM, { pos: [0, base, zp], color: A });
      const K = 0.12;
      for (const x of [-0.34, 0.34]) { add(rod([x, base + 0.02, zp - 0.5], [x * 0.6, base + K, zp + 0.05], 0.02, 5), flatM, { color: '#c26a55' }); add(rod([x, base + 0.02, zp + 0.5], [x * 0.6, base + K, zp - 0.05], 0.02, 5), flatM, { color: '#c26a55' }); add(rod([x * 0.6, base + K, zp], [x * 0.3, top - 0.03, zp - 0.46], 0.014, 5), flatM, { color: '#c26a55' }); add(rod([x * 0.6, base + K, zp], [x * 0.3, top - 0.03, zp + 0.46], 0.014, 5), flatM, { color: '#c26a55' }); }
      add(kit.box(1.52, 0.03, 0.05), flatM, { pos: [0, top, zp - 0.1], color: '#b6c0b8' }); add(kit.box(1.52, 0.03, 0.05), flatM, { pos: [0, top, zp + 0.1], color: '#b6c0b8' });
      for (const x of [-0.76, 0.76]) add(kit.tube([[x, top, zp - 0.1], [x * 1.14, top - 0.05, zp], [x, top, zp + 0.1]], 0.012, 0.012, 4, 6), flatM, { color: '#b6c0b8' });
    }
    return { lp, add, zs, roofY: (x) => eave + (crest - eave) * Math.sqrt(Math.max(0, 1 - (x / W) ** 2)) };
  }

  /* ---------- car A: on the rails, under the bridge ---------- */
  const carA = RAIL.train.cars[0], carB = RAIL.train.cars[1], tx = RAIL.tracks[RAIL.train.track];
  const zA = (carA.z[0] + carA.z[1]) / 2, MA = new M4().makeTranslation(tx, 0, zA);
  const stateA = (s, i) => (s > 0 ? [0, 2, 1, 3, 0, 1, 3, 2][i] : [1, 0, 3, 0, 2, 1, 0, 3][i]);
  const A = car(MA, { lanes: { e: LANES.Ae, w: LANES.Aw, roof: LANES.roofA }, tile: 0, roll: 'rollA', cabSouth: false, seat: '#6f9a92', win: stateA, door: 'e1', broken: '11', bellows: 4, hole: { z: [-3.4, -1.6], j: [10, 18] }, panto: 3.95 });
  for (const zb of [-4.3, 4.3]) bogie(MA, zb);

  /* ---------- car B: bogie off the rail, leaning east ---------- */
  const zB = (carB.z[0] + carB.z[1]) / 2, pivotZ = zB - 4.3, yawB = carB.yaw, tiltB = carB.tilt;
  const MB = new M4().makeTranslation(tx, RAIL_TOP, pivotZ).multiply(new M4().makeRotationY(yawB)).multiply(new M4().makeRotationX(0.0175)).multiply(new M4().makeRotationZ(-tiltB)).multiply(new M4().makeTranslation(0, -RAIL_TOP, 4.3));
  const stateB = (s, i) => (s > 0 ? [2, 3, 1, 0, 3, 2, 0, 1][i] : [0, 3, 2, 1, 3, 0, 2, 3][i]);
  const Bc = car(MB, { lanes: { e: LANES.Be, w: LANES.Bw, roof: LANES.roofB }, tile: 1, roll: 'rollB', cabSouth: true, seat: '#7f6f92', win: stateB, door: 'e0', broken: '-12', bellows: 3, hole: { z: [1.1, 3.1], j: [8, 16] } });
  bogie(new M4().makeTranslation(tx, 0, pivotZ).multiply(new M4().makeRotationY(0.012)));
  const MBs = MB.clone().multiply(new M4().makeTranslation(0, 0, 4.3)).multiply(new M4().makeRotationY(0.1)).multiply(new M4().makeRotationZ(0.055));
  bogie(MBs);
  // gouge of pushed-up ballast and splintered sleepers where the south bogie left the rail
  { const p = new V3(0, 0.3, 4.3).applyMatrix4(MB);
    for (let i = 0; i < 90; i++) { const a = rng() * 6.28, r = rng.range(0.9, 1.6); S.add(new THREE.OctahedronGeometry(1, 0), softMat, { pos: [p.x + Math.cos(a) * r * 0.7, 0.3 + rng() * 0.08, p.z + Math.sin(a) * r * 1.2], rot: [rng() * 3, rng() * 3, 0], scale: [0.1, 0.07, 0.1], color: '#a7a79c' }); }
    tuft(p.x + 1.1, 0.28, p.z - 0.5, 16, 0.3, 1.3);
  }

  /* ---------- planting on and in the cars ---------- */
  const inCar = (c, list) => list.map(([x, y, z]) => c.lp(x, y, z));
  // soil and moss drifts on the roofs
  for (const [c, hole] of [[A, -2.5], [Bc, 2.1]]) {
    for (let i = 0; i < 26; i++) { const x = rng.range(-1, 1), p = c.lp(x, c.roofY(x), hole + rng.range(-1.9, 1.9)); tuft(p.x, p.y, p.z, 7, 0.14, 1.1); }
  }
  // car A: sapling out of the roof hole (south of the bridge deck it stays under 4.1), ferns down the eave
  { let p = A.lp(0.1, 1.24, -2.5); sapling([p.x, p.y, p.z], 3.05, [0.3, -0.1]);
    p = A.lp(0.1, 1.22, -2.5); fern(p.x, p.y, p.z, 8, 1.2); fern(p.x - 0.5, p.y, p.z + 0.5, 6, 1);
    H.add(kit.sphere(0.7, 10, 6), 'soil', { matrix: kit.xf({ pos: [p.x, p.y, p.z], scale: [1, 0.24, 1.4] }) });
    bush(A.lp(0.3, 3.3, -2.4), [0.9, 0.38, 1.2], 300, 0.14, { down: 0.5 });
    for (const [z, x] of [[-4.6, 0.8], [4.9, -0.7]]) { const q = A.lp(x, A.roofY(x) + 0.02, z); fern(q.x, q.y, q.z, 6, 0.9); bush([q.x, q.y + 0.14, q.z], [0.42, 0.22, 0.6], 80, 0.12); }
    // a bushy little maple on the north end, clear of the bridge
    p = A.lp(-0.2, A.roofY(-0.2) - 0.02, -5.2); sapling([p.x, p.y, p.z], 1.2, [-0.2, -0.1]);
    bush(A.lp(1.26, 2.2, 1.7 - 2.56 * 0 - 0.0), [0.34, 0.32, 0.5], 110, 0.12, { down: 0.8 });
    // greens spilling from open windows, east side
    for (const i of [1, 3, 6]) { const w = WIN_Z[i]; const c = A.lp(1.3, 2.0, w.z); bush(c, [0.3, 0.42, 0.52], 140, 0.13, { down: 0.9 }); const q = A.lp(0.6, 1.22, w.z); fern(q.x, q.y, q.z, 5, 1.1); }
    // the jammed door: a burst of fern and a bush on the sill
    { const q = A.lp(0.8, 1.22, 4.35); fern(q.x, q.y, q.z, 8, 1.3); bush(A.lp(1.36, 1.5, 4.5), [0.44, 0.5, 0.42], 190, 0.13, { down: 0.8 }); }
  }
  // car B: bigger garden; a real young tree through the roof, windows brim with leaves
  { let p = Bc.lp(-0.1, 1.24, 2.1); sapling([p.x, p.y, p.z], 3.7, [0.55, 0.2]);
    H.add(kit.sphere(0.8, 10, 6), 'soil', { matrix: kit.xf({ pos: [p.x, p.y, p.z], scale: [1, 0.26, 1.5] }) }); fern(p.x + 0.4, p.y + 0.08, p.z - 0.6, 8, 1.3); fern(p.x - 0.4, p.y + 0.08, p.z + 0.6, 8, 1.2);
    bush(Bc.lp(0.3, 3.36, 2.2), [1.0, 0.42, 1.5], 380, 0.145, { down: 0.5 });
    bush(Bc.lp(-0.7, 3.2, -4.4), [0.6, 0.26, 1.0], 150, 0.13);
    p = Bc.lp(0.5, Bc.roofY(0.5) - 0.02, -4.6); sapling([p.x, p.y, p.z], 1.5, [0.2, 0.1]);
    p = Bc.lp(0.2, Bc.roofY(0.2) - 0.02, 5.6); fern(p.x, p.y, p.z, 7, 1.1);
    for (const i of [0, 1, 4, 7]) { const w = WIN_Z[i]; bush(Bc.lp(1.32, 2.02, w.z), [0.34, 0.5, 0.56], 170, 0.135, { down: 0.9 }); const q = Bc.lp(0.5, 1.22, w.z); fern(q.x, q.y, q.z, 5, 1.2); }
    { const q = Bc.lp(0.8, 1.22, -4.35); fern(q.x, q.y, q.z, 8, 1.3); bush(Bc.lp(1.4, 1.5, -4.5), [0.46, 0.56, 0.46], 200, 0.13, { down: 0.8 }); }
    // creeper down the east wall from the roof garden
    for (const z of [-1.7, 3.9]) along(inCar(Bc, [[1.0, 3.08, z], [1.32, 2.7, z + 0.08], [1.33, 2.2, z - 0.05], [1.34, 1.7, z + 0.04], [1.3, 1.25, z]]), 90, 0.125, 0.1);
    along(inCar(Bc, [[0.7, 2.78, 6.5], [0.74, 2.3, 6.56], [0.7, 1.8, 6.54], [0.72, 1.4, 6.56]]), 70, 0.125, 0.08);
  }
  // bellows torn: a strip of it hangs in the gap between the cars
  { const a = [tx - 0.3, 2.58, -2.86], b = [tx - 0.4, 1.9, -2.72], c = [tx - 0.2, 1.3, -2.64]; H.add(kit.tube([a, b, c], 0.06, 0.03, 5, 8), flatM, { color: '#4e5a5e' }); bush([tx + 0.1, 0.72, -2.3], [0.8, 0.48, 0.52], 170, 0.14); fern(tx + 0.5, 0.4, -2.3, 6, 1.1); }

  /* ---------- flat wagon, track 1 ---------- */
  { const zc = -1.2, Lw = 5.4, x0 = RAIL.tracks[1], M = new M4().makeTranslation(x0, 0, zc);
    const add = (g, mat, o = {}) => H.add(g, mat, { matrix: M.clone().multiply(kit.xf(o)), color: o.color });
    const deckY = 1.03;
    add(kit.box(2.2, 0.08, Lw), flatM, { pos: [0, deckY - 0.1, 0], color: '#a87050' });
    for (const s of [-1, 1]) add(kit.box(0.12, 0.26, Lw + 0.1), flatM, { pos: [s * 1.05, deckY - 0.17, 0], color: '#b58a70' });
    for (const s of [-1, 1]) add(kit.box(2.2, 0.26, 0.12), flatM, { pos: [0, deckY - 0.17, (s * Lw) / 2], color: '#a87050' });
    for (let i = 0; i < 12; i++) { const z = -Lw / 2 + 0.24 + i * 0.45; if (i === 3 || i === 8) continue; add(kit.chip(kit.box(2.14, 0.05, 0.42, 3, 1, 1).toNonIndexed(), 0.01, rng), woodM, { pos: [0, deckY - 0.03 + rng.range(-0.01, 0.01), z], rot: [0, rng.range(-0.01, 0.01), 0], color: rng.pick(WOODS) }); }
    for (const s of [-1, 1]) for (let z = -2.2; z <= 2.3; z += 1.1) { const miss = rng() < 0.3; add(kit.boxBase(0.08, miss ? 0.2 : 0.62, 0.1), flatM, { pos: [s * 1.1, deckY - 0.22, z], rot: [0, 0, s * rng.range(-0.06, 0.1)], color: '#c88f70' }); }
    for (const s of [-1, 1]) for (const q of [-1, 1]) { add(kit.cyl(0.075, 0.075, 0.22, 8).rotateX(Math.PI / 2), flatM, { pos: [q * 0.72, deckY - 0.2, s * (Lw / 2 + 0.14)], color: '#c88f70' }); add(kit.cyl(0.13, 0.13, 0.03, 10).rotateX(Math.PI / 2), flatM, { pos: [q * 0.72, deckY - 0.2, s * (Lw / 2 + 0.26)], color: '#8a5a44' }); }
    for (const s of [-1, 1]) add(kit.box(0.12, 0.1, 0.34), flatM, { pos: [0, deckY - 0.2, s * (Lw / 2 + 0.16)], color: '#a87050' });
    // two single axles in pedestals
    const axle = RAIL_TOP + 0.26;
    for (const az of [-1.75, 1.75]) {
      add(kit.cyl(0.03, 0.03, 1.4, 6).rotateZ(Math.PI / 2), flatM, { pos: [0, axle, az], color: '#a87050' });
      for (const s of [-1, 1]) {
        add(kit.cyl(0.26, 0.26, 0.06, 14).rotateZ(Math.PI / 2), flatM, { pos: [(s * GAUGE) / 2, axle, az], color: '#b98668' });
        add(kit.cyl(0.29, 0.29, 0.02, 14).rotateZ(Math.PI / 2), flatM, { pos: [s * (GAUGE / 2 - 0.035), axle, az], color: '#9f6c50' });
        add(kit.box(0.14, 0.22, 0.2), flatM, { pos: [s * 0.72, axle, az], color: '#b07a5c' });
        add(kit.box(0.06, 0.34, 0.44), flatM, { pos: [s * 0.86, axle + 0.1, az], color: '#9c6c54' });
        for (let i = 0; i < 4; i++) add(kit.box(0.1, 0.018, 0.9 - i * 0.16), flatM, { pos: [s * 0.86, axle + 0.28 + i * 0.022 - 0.06, az], color: i % 2 ? '#c29070' : '#8a5a44' }); // leaf spring
      }
    }
    // cargo: a stack of old rails, a rusted drum, and a heap of soil that took
    for (let i = 0; i < 4; i++) add(sweep([[-0.5 + i * 0.2, deckY, 0.6], [-0.5 + i * 0.2, deckY, 2.5]], RAIL_SEC), rustM, { color: rng.pick(railCol) });
    for (let i = 0; i < 3; i++) add(sweep([[-0.4 + i * 0.2, deckY + 0.14, 0.7], [-0.4 + i * 0.2, deckY + 0.14, 2.45]], RAIL_SEC), rustM, { color: rng.pick(railCol) });
    add(kit.cylBase(0.26, 0.26, 0.72, 14), rustM, { pos: [0.56, deckY, 0.7], color: '#cf8c62' });
    add(kit.torus(0.262, 0.012, 4, 16), flatM, { pos: [0.56, deckY + 0.36, 0.7], rot: [Math.PI / 2, 0, 0], color: '#a87050' });
    const wp = (x, y, z) => new V3(x, y, z).applyMatrix4(M);
    H.add(kit.sphere(1, 14, 8), 'soil', { matrix: kit.xf({ pos: wp(0, deckY - 0.02, -1.0).toArray(), scale: [0.96, 0.42, 1.5] }) });
    let q = wp(0.1, deckY + 0.3, -1.1); sapling([q.x, q.y, q.z], 2.1, [0.15, 0.2]);
    bush(wp(0.1, deckY + 0.55, -1.1), [0.92, 0.52, 1.44], 420, 0.145, { top: -0.25 });
    q = wp(-0.6, deckY + 0.3, -2.0); fern(q.x, q.y, q.z, 8, 1.15);
    q = wp(0.65, deckY + 0.26, 0.05); fern(q.x, q.y, q.z, 7, 1); q = wp(-0.7, deckY + 0.1, 0.1); fern(q.x, q.y, q.z, 5, 0.9);
    for (let i = 0; i < 30; i++) { q = wp(rng.range(-0.9, 0.9), deckY + 0.02, rng.range(-2.4, 2.4)); tuft(q.x, q.y, q.z, 5, 0.1, 1.1); }
    for (let i = 0; i < 16; i++) { q = wp(rng.range(-0.7, 0.8), deckY + 0.22, rng.range(-2.2, 0.2)); bloom(q.x, q.y, q.z, rng.range(0.24, 0.5), rng.pick([P.flowerWhite, P.flowerYellow, P.bougainLit]), rng() < 0.4); }
    // hanging over the side
    along([wp(1.1, deckY + 0.1, -1.6), wp(1.2, deckY - 0.3, -1.5), wp(1.16, deckY - 0.7, -1.62)], 60, 0.13, 0.1);
    along([wp(1.1, deckY + 0.1, -0.5), wp(1.2, deckY - 0.26, -0.42), wp(1.18, deckY - 0.56, -0.5)], 46, 0.13, 0.1);
  }

  /* ---------- weeds and flowers along the line ---------- */
  { const BL = [P.flowerWhite, P.flowerYellow, P.flowerPurple, P.bougainLit, P.flowerBlue];
    for (const cx of RAIL.tracks) for (let z = -19.6; z < 19.6; z += rng.range(0.34, 0.8)) { // between and beside the sleepers
      const x = cx + rng.range(-1.2, 1.2); tuft(x, 0.27, z, rng.int(4, 8), rng.range(0.08, 0.18), rng.range(0.8, 1.4));
      if (rng() < 0.13) fern(x, 0.28, z, rng.int(3, 5), rng.range(0.5, 0.8));
      if (rng() < 0.4) { const n = rng.int(1, 3), col = rng.pick(BL); for (let i = 0; i < n; i++) bloom(x + rng.range(-0.2, 0.2), 0.27, z + rng.range(-0.2, 0.2), rng.range(0.22, 0.46), col, rng() < 0.3); }
      if (rng() < 0.18) moss(x, 0.3, z, rng.range(0.14, 0.34), 0.2);
    }
    // the shoulder between the tracks and on the east edge runs to tall silver-gold grass
    const gold = ['#e8cf7a', '#d7b858', '#cfe080', '#f0dc92'], tall = kit.blade(1.2, 0.06, 0.42, 3);
    const plume = (x, z, n, r) => { for (let i = 0; i < n; i++) S.add(tall, softMat, { pos: [x + rng.range(-r, r), 0.26, z + rng.range(-r, r)], rot: [0, rng() * 6.28, 0], scale: rng.range(0.7, 1.2), color: rng.pick(gold) }); };
    for (let z = -19; z < 19; z += rng.range(0.9, 2.4)) {
      if (Math.abs(z + 9.1) > 1.4) plume(rng.range(16.75, 17.2), z, rng.int(4, 9), 0.2);
      if (rng() < 0.7) plume(rng.range(19.2, 19.62), z, rng.int(4, 9), 0.18);
    }
    for (const [x, z, n, s] of [[19.4, 2.2, 150, 0.6], [19.45, -14, 120, 0.5], [16.95, -0.8, 110, 0.42], [19.3, 13.4, 170, 0.6], [14.2, 13.6, 200, 0.7], [14.2, 18, 150, 0.56], [14.3, -18, 180, 0.66], [16.9, 14.6, 90, 0.4]])
      bush([x, 0.24 + s * 0.62, z], [s * 1.08, s * 0.82, s * 1.5], n, 0.14);
    // bloom patch at FLOWER_SPOTS: butterflies come here
    const F = FLOWER_SPOTS.find(([x, , z]) => x === 17.4 && z === 12.6) || [17.4, 0.6, 12.6];
    for (let i = 0; i < 90; i++) {
      const a = rng() * 6.28, r = Math.sqrt(rng()) * 1.05, x = F[0] + Math.cos(a) * r, z = F[2] + Math.sin(a) * r * 1.3;
      bloom(x, 0.27, z, rng.range(0.22, 0.42), rng.pick([P.bougainLit, P.flowerYellow, P.flowerWhite, P.flowerPurple, P.flowerWhite]), rng() < 0.65);
    }
    for (let i = 0; i < 24; i++) tuft(F[0] + rng.range(-1, 1), 0.27, F[2] + rng.range(-1.2, 1.2), 7, 0.14, 1.1);
    bush([F[0] - 0.3, 0.42, F[2] + 0.3], [0.62, 0.2, 0.8], 90, 0.13, { top: -0.2 });
  }

  /* ---------- trackside: cable trough, relay boxes, km post, speed sign ---------- */
  { for (let z = -19.5; z < 19.6; z += 1.0) {
      if (Math.abs(z + 9.1) < 0.9) continue;
      const tilt = rng() < 0.12 ? rng.range(-0.25, 0.25) : 0, miss = rng() < 0.08;
      H.add(kit.box(0.34, 0.1, 0.96), concM, { pos: [19.56, 0.1, z], color: '#c9c6ba' });
      if (!miss) H.add(kit.box(0.36, 0.035, 0.96), concM, { pos: [19.56 + (tilt ? 0.03 : 0), 0.17 + Math.abs(tilt) * 0.2, z], rot: [tilt, rng.range(-0.02, 0.02), tilt * 0.3], color: '#d9d6cb' });
    }
    const box = (x, z, yaw, c) => {
      H.add(kit.boxBase(0.5, 0.1, 0.46), concM, { pos: [x, 0.2, z] });
      H.add(kit.boxBase(0.46, 1.06, 0.36), flatM, { pos: [x, 0.3, z], rot: [0, yaw, 0], color: c });
      H.add(kit.box(0.54, 0.05, 0.44), rustM, { pos: [x, 1.38, z], rot: [0.04, yaw, 0], color: '#d8b090' });
      H.add(kit.box(0.38, 0.92, 0.02), rustM, { pos: [x + Math.sin(yaw) * 0.19, 0.84, z + Math.cos(yaw) * 0.19], rot: [0, yaw, 0], color: '#f0e0c8' });
      H.add(kit.box(0.03, 0.14, 0.03), rustM, { pos: [x + Math.sin(yaw) * 0.215 + 0.1, 0.84, z + Math.cos(yaw) * 0.215], color: '#c0a080' });
    };
    box(19.4, 7.2, 0.0, '#8fa8a0'); box(19.42, 6.5, 0.06, '#9fb2a8');
    H.add(kit.boxBase(0.12, 0.92, 0.12), concM, { pos: [14.05, 0.26, 7.9], rot: [0, 0.2, 0.06], color: '#d9d6cb' });
    H.add(card(atlas, 'km', 0.11, 0.11), atlasMat, { pos: [14.05 + 0.03, 1.06, 7.9 + 0.063], rot: [0, 0.2, 0.06] });
    H.add(rod([19.05, 0.26, 3.4], [19.03, 1.9, 3.4], 0.03, 6), rustM, { color: '#c8a080' });
    H.add(kit.box(0.5, 0.5, 0.02), flatM, { pos: [19.03, 1.9, 3.43], rot: [0, 0.1, 0.12], color: '#5f7274' });
    H.add(card(atlas, 'speed', 0.46, 0.46), atlasMat, { pos: [19.033, 1.9, 3.442], rot: [0, 0.1, 0.12] });
  }

  /* ---------- catenary ---------- */
  const POLES = [{ z: -18.6, lean: [0.012, 0.02], snap: true }, { z: -5.6, lean: [0.02, 0] }, { z: 4.4, lean: [0.03, -0.012] }, { z: 15.6, lean: [0.1, 0.02], snap: true }];
  const armY = 5.0, wireY = 4.3, armEnd = 14.9, PX = 19.42, T0 = RAIL.tracks[0], T1 = RAIL.tracks[1];
  const swayLists = [[], [], []], swayStems = [[], [], []];
  const wireCol = '#46555a', ins = '#ece4d0';
  for (const p of POLES) {
    const bx = PX, tx2 = bx + p.lean[0] * 5.6, tz = p.z + p.lean[1] * 5.6;
    H.add(kit.boxBase(0.62, 0.3, 0.62), concM, { pos: [bx, 0.02, p.z], color: '#cfccc0' });
    const P0 = [bx, 0.28, p.z], P1 = [tx2, 5.62, tz];
    // lattice-less steel pole: H-section with a cap, ribs at intervals
    H.add(beam(P0, P1, 0.2, 0.04, [0, 0, 1]), flatM, { color: '#94a6a2' });
    H.add(beam([bx - 0.08, 0.28, p.z], [tx2 - 0.08, 5.62, tz], 0.03, 0.2), flatM, { color: '#88999a' });
    H.add(beam([bx + 0.08, 0.28, p.z], [tx2 + 0.08, 5.62, tz], 0.03, 0.2), flatM, { color: '#88999a' });
    for (let y = 0.6; y < 2.6; y += 0.5) H.add(kit.box(0.24, 0.04 + rng() * 0.05, 0.26), rustM, { pos: [lerp(bx, tx2, y / 5.6), y + rng() * 0.2, p.z], color: '#d8a080' });
    H.add(kit.box(0.27, 0.05, 0.27), flatM, { pos: [tx2, 5.64, tz], color: '#7f8f8e' });
    const ay = armY + (p.lean[0] > 0.05 ? -0.08 : 0), armE = p.snap ? 17.4 : armEnd, dropE = p.snap ? -0.55 : 0;
    // cantilever: a top tie and a lower strut, truss diagonals between
    const A0 = [tx2 - 0.05, ay + 0.34, tz], A1 = [armE, ay + 0.02 + dropE, tz], B0 = [tx2 - 0.05, ay - 0.3, tz], B1 = [armE + 0.2, ay - 0.08 + dropE, tz];
    H.add(beam(A0, A1, 0.07, 0.07), rustM, { color: '#c8b0a0' }); H.add(beam(B0, B1, 0.07, 0.07), rustM, { color: '#c8b0a0' });
    for (let i = 0; i < 6; i++) { const a = i / 6, b = (i + 1) / 6, aa = (k) => lerp3(i % 2 ? B0 : A0, i % 2 ? B1 : A1, k), bb = (k) => lerp3(i % 2 ? A0 : B0, i % 2 ? A1 : B1, k); H.add(rod(aa(a), bb(b), 0.016, 4), rustM, { color: '#b89a88' }); }
    if (p.snap) { // torn truss end, hanging on a strap
      H.add(kit.tube([A1, [armE - 0.3, ay - 0.5, tz + 0.05], [armE - 0.34, ay - 1.15, tz + 0.08]], 0.016, 0.012, 4, 8), flatM, { color: wireCol });
    }
    // porcelain insulators and registration arms where the wire was held
    for (const x of [T1, T0]) if (x > armE) {
      const y0 = lerp(ay + 0.02 + dropE, ay + 0.34, (x - armE) / (tx2 - armE)) - 0.34 - 0.03;
      for (let i = 0; i < 3; i++) H.add(kit.cylBase(0.06, 0.06, 0.03, 8), flatM, { pos: [x, y0 - 0.1 - i * 0.05, tz], color: ins });
      H.add(rod([x, y0, tz], [x, y0 - 0.26, tz], 0.012, 4), flatM, { color: wireCol });
    }
    // climbing vine
    if (p.z !== -18.6) {
      const pts = Array.from({ length: 24 }, (_, i) => { const u = i / 23, a = u * 13; return [lerp(bx, tx2, u) + Math.cos(a) * 0.18, 0.3 + u * 4.7, lerp(p.z, tz, u) + Math.sin(a) * 0.18]; });
      H.add(kit.tube(pts, 0.022, 0.01, 4, 60, { capEnds: false }), flatM, { color: '#6e5a42' });
      along(pts, 240, 0.135, 0.16);
      bush([tx2 + 0.02, 4.9, tz], [0.48, 0.5, 0.5], 150, 0.14);
    } else bush([tx2, 0.9, tz], [0.5, 0.7, 0.5], 110, 0.14);
    tuft(bx - 0.2, 0.28, p.z + 0.3, 14, 0.24, 1.2);
  }
  function lerp3(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
  const wireAt = (a, b, sag) => (u) => { const p = lerp3(a, b, u); p[1] -= sag * 4 * u * (1 - u); return p; };
  const wire = (a, b, sag, r = 0.02, n = 18) => { const f = wireAt(a, b, sag), pts = Array.from({ length: n + 1 }, (_, i) => f(i / n)); H.add(kit.tube(pts, r, r, 4, n * 2, { capEnds: false }), flatM, { color: wireCol }); return f; };
  { const zz = POLES.map((p) => p.z), a0 = wireY, m0 = 4.82;
    // track 0: contact wire only under the bridge; messenger & droppers on the two open spans
    const f1 = wire([T0, a0, zz[0]], [T0, a0, zz[1]], 0.72);
    const c1 = wire([T0, a0, zz[1]], [T0, a0, zz[2]], 0.5), m1 = wire([T0, m0, zz[1]], [T0, m0, zz[2]], 0.45);
    for (let i = 1; i < 7; i++) { const u = i / 7; H.add(rod(c1(u), m1(u), 0.008, 3), flatM, { color: wireCol }); }
    const c2 = wire([T0, a0, zz[2]], [T0 + 0.1, a0 - 0.2, zz[3]], 0.82), m2 = wire([T0, m0, zz[2]], [T0 + 0.1, m0 - 0.2, zz[3]], 0.7);
    for (let i = 1; i < 8; i++) { const u = i / 8; H.add(rod(c2(u), m2(u), 0.008, 3), flatM, { color: wireCol }); }
    // track 1: wires snapped, tails hanging off the last poles
    wire([T1, a0, zz[1]], [T1, a0, zz[2]], 0.56);
    const m3 = wire([T1, m0, zz[1]], [T1, m0, zz[2]], 0.5);
    const tail = (pts) => H.add(kit.tube(pts, 0.02, 0.018, 4, pts.length * 5, { capEnds: false }), flatM, { color: wireCol });
    tail([[T1, m0 - 0.32, zz[2]], [T1 + 0.05, 4.1, zz[2] + 1.6], [T1 + 0.2, 2.9, zz[2] + 2.8], [T1 + 0.3, 1.5, zz[2] + 3.2], [T1 + 0.5, 0.42, zz[2] + 3.1], [T1 + 0.9, 0.3, zz[2] + 2.4]]);
    tail([[T1, a0, zz[0] + 0.1], [T1 - 0.05, 3.7, zz[0] + 2.3], [T1 - 0.2, 2.2, zz[0] + 3.6], [T1 - 0.2, 0.9, zz[0] + 3.9], [T1 - 0.1, 0.36, zz[0] + 4.5]]);
    // past the last pole the wires run off the edge and fall
    tail([[T0 + 0.1, a0 - 0.2, zz[3]], [T0 + 0.14, 3.6, 17.8], [T0 + 0.2, 2.2, 20.2], [T0 + 0.24, 0.1, 20.7], [T0 + 0.28, -1.6, 20.5]]);
    along([[T0 + 0.1, 3.9, 16.4], [T0 + 0.14, 3.3, 18], [T0 + 0.2, 2.1, 20.0], [T0 + 0.24, 0.2, 20.6]], 170, 0.135, 0.12);
    // vines riding the wires
    const lace = (f, u0, u1, n) => { const pts = Array.from({ length: 12 }, (_, i) => f(lerp(u0, u1, i / 11))); along(pts, n, 0.125, 0.09, { down: 0.75 }); const st = Array.from({ length: 28 }, (_, i) => { const p = f(lerp(u0, u1, i / 27)), a = i * 1.5; return [p[0] + Math.cos(a) * 0.03, p[1] + Math.sin(a) * 0.03, p[2]]; }); H.add(kit.tube(st, 0.013, 0.008, 3, 60, { capEnds: false }), flatM, { color: '#6e5a42' }); };
    lace(m1, 0.02, 0.62, 300); lace(c2, 0.04, 0.5, 230); lace(m2, 0.3, 0.94, 300); lace(m3, 0.1, 0.8, 240); lace(f1, 0.72, 0.98, 110);
    // three hanging groups, each pivoting where it leaves the wire
    const HANG = [{ at: m1(0.38), n: 5 }, { at: m2(0.56), n: 6 }, { at: m3(0.42), n: 5 }];
    HANG.forEach(({ at, n }, g) => {
      for (let i = 0; i < n; i++) {
        const dz = rng.range(-0.7, 0.7), L = rng.range(1.0, 2.3), pts = [[at[0] + rng.range(-0.06, 0.06), at[1], at[2] + dz]];
        for (let k = 1; k <= 5; k++) { const u = k / 5; pts.push([pts[0][0] + Math.sin(u * 3 + i) * 0.1 * u, at[1] - L * u, pts[0][2] + Math.cos(u * 2.4 + i) * 0.08 * u]); }
        swayStems[g].push({ geo: kit.tube(pts, 0.012, 0.006, 3, 18, { capEnds: false }), color: '#6e5a42' });
        along(pts, Math.round(L * 34), 0.12, 0.075, { list: swayLists[g], down: 0.9 });
      }
    });
  }

  /* ---------- signal mast ---------- */
  { const s = RAIL.signal, x = s.x, z = s.z, h = 4.55, W = 0.15, col = '#6f8284';
    H.add(kit.boxBase(0.74, 0.34, 0.74), concM, { pos: [x, 0.04, z] });
    const lean = 0.022, at = (dx, y, dz) => [x + dx + lean * y, y, z + dz];
    for (const [a, b] of [[-W, -W], [W, -W], [W, W], [-W, W]]) H.add(beam(at(a, 0.34, b), at(a * 0.72, h, b * 0.72), 0.04, 0.04), flatM, { color: col });
    for (let y = 0.5, i = 0; y < h - 0.2; y += 0.34, i++) {
      const k = lerp(1, 0.72, y / h), l = lerp(1, 0.72, (y + 0.34) / h), q = i % 2 ? 1 : -1;
      H.add(rod(at(-W * k * q, y, W * k), at(W * l * q, y + 0.34, W * l), 0.01, 3), flatM, { color: col });
      H.add(rod(at(W * k, y, -W * k * q), at(W * l, y + 0.34, W * l * q), 0.01, 3), flatM, { color: col });
      H.add(rod(at(-W * k * q, y, -W * k), at(W * l * q, y + 0.34, -W * l), 0.01, 3), flatM, { color: col });
    }
    // ladder up the west side
    for (const q of [-0.13, 0.13]) H.add(rod(at(-0.26, 0.34, q), at(-0.24, h - 0.5, q), 0.012, 4), rustM, { color: '#d0b8a0' });
    for (let y = 0.5; y < h - 0.6; y += 0.26) H.add(rod(at(-0.255, y, -0.13), at(-0.255, y, 0.13), 0.009, 3), rustM, { color: '#d0b8a0' });
    // head: backboard, three lenses with hoods, facing down the line to the south (and the default camera)
    const hy = h + 0.02, tp = at(0, hy, 0), Mh = new M4().compose(new V3(...tp), new Q().setFromEuler(new THREE.Euler(0.02, 0.42, 0.05, 'YXZ')), new V3(1, 1, 1));
    const hd = (g, mat, o = {}) => H.add(g, mat, { matrix: Mh.clone().multiply(kit.xf(o)), color: o.color });
    hd(kit.wallPanel(rrect(-0.36, 0.36, -0.86, 0.5, 0.33, 5), [], 0.05), flatM, { pos: [0, 0, 0.1], color: '#3e4c50' });
    hd(kit.box(0.24, 0.3, 0.2), flatM, { pos: [0, -0.86, 0], color: col });
    [0, 1, 2].forEach((i) => {
      const y = 0.2 - i * 0.44;
      const lens = new THREE.CircleGeometry(0.15, 16), [u, vv, du, dv] = atlas.rect(`lens${i}`), uv = lens.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, u + uv.getX(k) * du, vv + uv.getY(k) * dv);
      hd(lens, atlasMat, { pos: [0, y, 0.13] });
      hd(kit.torus(0.16, 0.014, 5, 18), rustM, { pos: [0, y, 0.13], color: '#c8c0b0' });
      const hood = new THREE.CylinderGeometry(0.175, 0.175, 0.13, 12, 1, true, -Math.PI * 0.5, Math.PI); hood.rotateX(Math.PI / 2);
      hd(hood, sheetMat, { pos: [0, y, 0.2], color: '#5f7274', rot: [0, 0, i === 1 ? 0.5 : 0] });
    });
    hd(kit.box(0.5, 0.04, 0.5), rustM, { pos: [0, -1.02, 0], color: '#d0b8a0' });
    // ivy up the mast, thick to about two-thirds, and a tuft on the head
    const pts = Array.from({ length: 26 }, (_, i) => { const u = i / 25, a = u * 15; return at(Math.cos(a) * 0.2, 0.34 + u * 3.4, Math.sin(a) * 0.2); });
    H.add(kit.tube(pts, 0.024, 0.009, 4, 70, { capEnds: false }), flatM, { color: '#6e5a42' });
    along(pts, 340, 0.135, 0.2, { down: 0.6 });
    bush(at(0, 0.9, 0), [0.5, 0.74, 0.5], 170, 0.14);
    bush([tp[0] + 0.1, tp[1] + 0.52, tp[2] - 0.08], [0.3, 0.2, 0.24], 60, 0.12);
    fern(x + 0.36, 0.34, z - 0.3, 5, 0.9);
  }

  /* ---------- assemble ---------- */
  const hard = H.build({ castShadow: true, receiveShadow: true }); group.add(hard);
  const soft = S.build({ castShadow: true, receiveShadow: true }); ctx.softEdge(soft); group.add(soft);
  const glassG = G.build({ castShadow: false, receiveShadow: false }); glassG.traverse((o) => { o.renderOrder = 2; }); ctx.noOutline(glassG); group.add(glassG);
  { const g = leafGeometry(leaves, [0, 0, 0]), m = new THREE.Mesh(g, shellMat); m.castShadow = true; m.receiveShadow = false; m.frustumCulled = false; ctx.softEdge(m); group.add(m); }
  const swayers = swayLists.map((list, i) => {
    const c = list[0].p, pivot = [c.x, c.y + 0.2, c.z], top = list.reduce((a, l) => (l.p.y > a.y ? l.p : a), c);
    const pv = [top.x, top.y, top.z], g = leafGeometry(list, pv, swayStems[i]), m = new THREE.Mesh(g, shellMat);
    m.position.set(...pv); m.castShadow = false; m.receiveShadow = false; ctx.softEdge(m); group.add(m);
    return { m, x: pv[0], z: pv[2], ph: i * 1.9 };
  });

  function update(t) {
    for (let i = 0; i < swayers.length; i++) {
      const s = swayers[i], a = ctx.wind(t, s.x, s.z), b = Math.sin(t * 0.73 + s.ph);
      s.m.rotation.x = a * 0.055 + b * 0.018;
      s.m.rotation.z = a * 0.03 + Math.sin(t * 0.51 + s.ph * 1.7) * 0.022;
    }
  }
  return { group, update };
}
