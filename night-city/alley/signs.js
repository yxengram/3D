import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------- Neon tube glyphs (single-stroke, unit height) ----------
const arc = (cx, cy, rx, ry, a0, a1, n = 18) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
  });
const P = Math.PI;

// Each glyph: { w: advance width, strokes: [[ [x,y], ... ], ...], closed: indices of closed strokes }
const GLYPHS = {
  B: { w: 0.62, strokes: [[[0, 0], [0, 1], [0.3, 1], ...arc(0.3, 0.76, 0.24, 0.24, P / 2, -P / 2), [0, 0.52]], [[0, 0.52], [0.34, 0.52], ...arc(0.34, 0.26, 0.26, 0.26, P / 2, -P / 2), [0, 0]]] },
  A: { w: 0.66, strokes: [[[0, 0], [0.33, 1], [0.66, 0]], [[0.12, 0.36], [0.54, 0.36]]] },
  R: { w: 0.62, strokes: [[[0, 0], [0, 1], [0.32, 1], ...arc(0.32, 0.75, 0.25, 0.25, P / 2, -P / 2), [0, 0.5]], [[0.27, 0.5], [0.62, 0]]] },
  O: { w: 0.66, strokes: [arc(0.33, 0.5, 0.33, 0.5, 0, 2 * P, 40)], closed: [0] },
  P: { w: 0.58, strokes: [[[0, 0], [0, 1], [0.32, 1], ...arc(0.32, 0.74, 0.26, 0.26, P / 2, -P / 2), [0, 0.48]]] },
  E: { w: 0.55, strokes: [[[0.55, 1], [0, 1], [0, 0], [0.55, 0]], [[0, 0.5], [0.45, 0.5]]] },
  N: { w: 0.62, strokes: [[[0, 0], [0, 1], [0.62, 0], [0.62, 1]]] },
  H: { w: 0.6, strokes: [[[0, 0], [0, 1]], [[0.6, 0], [0.6, 1]], [[0, 0.5], [0.6, 0.5]]] },
  T: { w: 0.62, strokes: [[[0, 1], [0.62, 1]], [[0.31, 1], [0.31, 0]]] },
  L: { w: 0.5, strokes: [[[0, 1], [0, 0], [0.5, 0]]] },
  2: { w: 0.6, strokes: [[...arc(0.3, 0.7, 0.29, 0.29, P * 0.92, -P * 0.22), [0, 0], [0.62, 0]]] },
  4: { w: 0.62, strokes: [[[0.46, 0], [0.46, 1], [0, 0.32], [0.64, 0.32]]] },
  ' ': { w: 0.35, strokes: [] },
  // katakana
  リ: { w: 1, strokes: [[[0.28, 0.86], [0.28, 0.42]], [[0.72, 0.92], [0.72, 0.45], [0.66, 0.24], [0.5, 0.1], [0.36, 0.03]]] },
  ン: { w: 1, strokes: [[[0.14, 0.84], [0.36, 0.68]], [[0.1, 0.12], [0.42, 0.24], [0.7, 0.48], [0.9, 0.8]]] },
  バ: { w: 1, strokes: [[[0.38, 0.74], [0.3, 0.44], [0.1, 0.12]], [[0.58, 0.74], [0.74, 0.44], [0.95, 0.12]], [[0.78, 0.99], [0.84, 0.87]], [[0.9, 0.99], [0.96, 0.87]]] },
  ー: { w: 1, strokes: [[[0.08, 0.5], [0.92, 0.5]]] },
  ラ: { w: 1, strokes: [[[0.26, 0.9], [0.74, 0.9]], [[0.14, 0.66], [0.84, 0.66], [0.78, 0.44], [0.62, 0.22], [0.36, 0.04]]] },
  メ: { w: 1, strokes: [[[0.78, 0.92], [0.64, 0.6], [0.42, 0.3], [0.14, 0.06]], [[0.3, 0.64], [0.6, 0.4], [0.9, 0.14]]] },
};

// Chaikin corner cutting so tube bends look like heated glass rather than mitred joints
function soften(points, closed, iterations = 2) {
  let pts = points;
  for (let k = 0; k < iterations; k++) {
    const out = closed ? [] : [pts[0]];
    const n = pts.length;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      out.push(a.clone().lerp(b, 0.22), a.clone().lerp(b, 0.78));
    }
    if (!closed) out.push(pts[n - 1]);
    pts = out;
  }
  return pts;
}

function tubeFromPoints(points, closed, radius) {
  const curve = new THREE.CatmullRomCurve3(soften(points, closed), closed, 'centripetal');
  const len = curve.getLength();
  return new THREE.TubeGeometry(curve, Math.max(8, Math.ceil(len * 160)), radius, 7, closed);
}

// Collects tube geometries per colour and merges them into one mesh per colour.
class TubeBatch {
  constructor(intensity) {
    this.intensity = intensity;
    this.byColor = new Map();
  }
  add(color, geometry) {
    if (!this.byColor.has(color)) this.byColor.set(color, []);
    this.byColor.get(color).push(geometry);
  }
  build(group) {
    const materials = [];
    for (const [color, geos] of this.byColor) {
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(this.intensity) });
      mat.userData.baseColor = mat.color.clone();
      materials.push(mat);
      group.add(new THREE.Mesh(mergeGeometries(geos), mat));
      geos.forEach((g) => g.dispose());
    }
    group.userData.materials = materials;
  }
}

// Builds glowing neon text from GLYPHS. Returns a group facing +z, centred at the origin.
// color: one colour for all glyphs, or an array with a colour per glyph.
export function neonText(text, { height = 0.4, color = 0xff2bd6, intensity = 7, radius = 0.011, spacing = 0.18, backing = true } = {}) {
  const group = new THREE.Group();
  const glyphs = [...text].map((c) => GLYPHS[c] || GLYPHS[' ']);
  const width = glyphs.reduce((s, g) => s + g.w, 0) * height + spacing * height * (glyphs.length - 1);
  const batch = new TubeBatch(intensity);
  let x = -width / 2;
  glyphs.forEach((g, gi) => {
    const col = Array.isArray(color) ? color[gi % color.length] : color;
    g.strokes.forEach((stroke, si) => {
      const closed = g.closed?.includes(si) ?? false;
      const pts = stroke.map(([px, py]) => new THREE.Vector3(x + px * height, (py - 0.5) * height, 0));
      batch.add(col, tubeFromPoints(pts, closed, radius));
    });
    x += g.w * height + spacing * height;
  });
  batch.build(group);
  if (backing) addBacking(group, width + height * 0.5, height * 1.5);
  group.userData.size = new THREE.Vector2(width, height);
  return group;
}

// Free-form neon symbol from strokes in a unit square; strokes: [{ points, closed, color }]
export function neonSymbol(strokes, { size = 0.8, intensity = 7, radius = 0.013, backing = true } = {}) {
  const group = new THREE.Group();
  const batch = new TubeBatch(intensity);
  for (const s of strokes) {
    const pts = s.points.map(([px, py]) => new THREE.Vector3((px - 0.5) * size, (py - 0.5) * size, 0));
    batch.add(s.color, tubeFromPoints(pts, !!s.closed, radius));
  }
  batch.build(group);
  if (backing) addBacking(group, size * 1.15, size * 1.15);
  return group;
}

export const SYMBOLS = {
  noEntry: (ring, slash) => [
    { points: arc(0.5, 0.5, 0.5, 0.5, 0, 2 * P, 48), closed: true, color: ring },
    { points: arc(0.5, 0.5, 0.42, 0.42, 0, 2 * P, 44), closed: true, color: ring },
    { points: [[0.2, 0.8], [0.8, 0.2]], color: slash },
  ],
  cocktail: (glass, olive) => [
    { points: [[0.12, 0.92], [0.88, 0.92], [0.5, 0.46]], closed: true, color: glass },
    { points: [[0.5, 0.46], [0.5, 0.1]], color: glass },
    { points: [[0.28, 0.08], [0.72, 0.08]], color: glass },
    { points: arc(0.62, 0.8, 0.07, 0.07, 0, 2 * P, 14), closed: true, color: olive },
    { points: [[0.62, 0.8], [0.8, 1.02]], color: olive },
  ],
  arrow: (c) => [
    { points: [[0.02, 0.5], [0.85, 0.5]], color: c },
    { points: [[0.6, 0.78], [0.9, 0.5], [0.6, 0.22]], color: c },
  ],
};

const backingMat = new THREE.MeshStandardMaterial({ color: 0x050507, roughness: 0.18, metalness: 0.2 });
const bracketMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.5, metalness: 0.8 });

function addBacking(group, w, h) {
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02), backingMat);
  board.position.z = -0.045;
  group.add(board);
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.04, 6), bracketMat);
      post.rotation.x = Math.PI / 2;
      post.position.set(sx * w * 0.4, sy * h * 0.35, -0.02);
      group.add(post);
    }
  }
}

// ---------- Lightbox signs with canvas-rendered text ----------
const JP_FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans JP", sans-serif';
const JP_SERIF = '"Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif';

function signCanvas({ w, h, bg, fg, text, sub, vertical, serif, border = '#ffffff', ppm = 360 }) {
  const c = document.createElement('canvas');
  c.width = Math.round(w * ppm);
  c.height = Math.round(h * ppm);
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, vertical ? c.width : 0, vertical ? 0 : c.height);
  grad.addColorStop(0, bg[0]);
  grad.addColorStop(0.5, bg[1] ?? bg[0]);
  grad.addColorStop(1, bg[0]);
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
  // light falloff of the tubes inside the box
  const glow = g.createRadialGradient(c.width / 2, c.height / 2, 0, c.width / 2, c.height / 2, Math.max(c.width, c.height) * 0.7);
  glow.addColorStop(0, 'rgba(255,255,255,0.18)');
  glow.addColorStop(1, 'rgba(0,0,0,0.25)');
  g.fillStyle = glow;
  g.fillRect(0, 0, c.width, c.height);
  // grime
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`;
    const s = Math.random() * c.width * 0.08;
    g.fillRect(Math.random() * c.width, Math.random() * c.height, s, s);
  }
  const m = Math.min(c.width, c.height) * 0.06;
  g.strokeStyle = border;
  g.lineWidth = m * 0.35;
  g.strokeRect(m, m, c.width - 2 * m, c.height - 2 * m);

  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,0.35)';
  g.shadowBlur = m * 0.5;
  const font = serif ? JP_SERIF : JP_FONT;
  if (vertical) {
    const chars = [...text];
    const area = c.height - 2 * m - (sub ? c.width * 0.5 : 0);
    const step = area / chars.length;
    const size = Math.min(c.width * 0.68, step * 0.9);
    g.font = `bold ${size}px ${font}`;
    chars.forEach((ch, i) => g.fillText(ch, c.width / 2, m + step * (i + 0.5)));
    if (sub) {
      g.font = `bold ${c.width * 0.16}px ${JP_FONT}`;
      g.fillText(sub, c.width / 2, c.height - m - c.width * 0.22);
    }
  } else {
    let size = (c.height - 2 * m) * (sub ? 0.56 : 0.7);
    g.font = `bold ${size}px ${font}`;
    const tw = g.measureText(text).width;
    if (tw > c.width - 3 * m) {
      size *= (c.width - 3 * m) / tw;
      g.font = `bold ${size}px ${font}`;
    }
    g.fillText(text, c.width / 2, sub ? c.height * 0.42 : c.height / 2);
    if (sub) {
      g.font = `bold ${(c.height - 2 * m) * 0.2}px ${JP_FONT}`;
      g.fillText(sub, c.width / 2, c.height * 0.78);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const frameMat = new THREE.MeshStandardMaterial({ color: 0x1b1b20, roughness: 0.35, metalness: 0.7 });

// A box sign lit from inside; both large faces carry the artwork. Faces ±z.
export function lightbox({ w, h, d = 0.14, bg, fg = '#ffffff', text, sub, vertical = false, serif = false, intensity = 2.2, border }) {
  const tex = signCanvas({ w, h, bg, fg, text, sub, vertical, serif, border });
  // kept moderate so the artwork stays saturated after tone mapping; bloom supplies the glow
  const face = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1, 1, 1).multiplyScalar(intensity * 0.6) });
  face.userData.baseColor = face.color.clone();
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMat));
  for (const side of [1, -1]) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), face);
    plane.position.z = side * (d / 2 + 0.002);
    if (side < 0) plane.rotation.y = Math.PI;
    group.add(plane);
  }
  // frame lip around the face
  const lip = 0.025;
  for (const [sx, sy, bw, bh] of [[0, 1, w + lip * 2, lip], [0, -1, w + lip * 2, lip], [1, 0, lip, h], [-1, 0, lip, h]]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, d + 0.02), frameMat);
    bar.position.set((sx * (w + lip)) / 2, (sy * (h + lip)) / 2, 0);
    group.add(bar);
  }
  group.userData.materials = [face];
  return group;
}

// Projecting wall bracket for signs that stick out from a wall (arm along +x of the group).
export function bracket(length, y0, y1) {
  const g = new THREE.Group();
  for (const y of [y0, y1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(length, 0.04, 0.04), bracketMat);
    arm.position.set(length / 2, y, 0);
    g.add(arm);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.16, 0.12), bracketMat);
    plate.position.set(0.01, y, 0);
    g.add(plate);
  }
  return g;
}

// Neon flicker: mostly on, with occasional stutters. Returns brightness 0..1.
export function flicker(t, seed) {
  const s = Math.sin(t * 0.7 + seed * 13.1) + Math.sin(t * 1.9 + seed * 7.7);
  if (s < 1.55) return 1;
  const k = Math.floor(t * 22 + seed * 3);
  const r = Math.abs(Math.sin(k * 12.9898 + seed * 78.233) * 43758.5453) % 1;
  return r < 0.45 ? 0.08 : 1;
}

export function setSignBrightness(group, b) {
  for (const m of group.userData.materials || []) m.color.copy(m.userData.baseColor).multiplyScalar(b);
}
