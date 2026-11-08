// Geometry kit. Everything returns a BufferGeometry with position/normal/uv.
// Geometries are centered unless the name says otherwise.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const V = THREE.Vector3;
const v3 = (p) => (p instanceof V ? p.clone() : new V(p[0], p[1], p[2]));

export const box = (w, h, d, sx = 1, sy = 1, sz = 1) => new THREE.BoxGeometry(w, h, d, sx, sy, sz);
/** Box resting on y=0. */
export const boxBase = (w, h, d, sx = 1, sy = 1, sz = 1) => box(w, h, d, sx, sy, sz).translate(0, h / 2, 0);
export const cyl = (rt, rb, h, seg = 8, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
export const cylBase = (rt, rb, h, seg = 8, open = false) => cyl(rt, rb, h, seg, open).translate(0, h / 2, 0);
export const sphere = (r, ws = 8, hs = 6) => new THREE.SphereGeometry(r, ws, hs);
export const ico = (r, detail = 1) => new THREE.IcosahedronGeometry(r, detail);
export const torus = (r, t, rs = 6, ts = 16, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, rs, ts, arc);

/** Displace vertices by a position hash so shared corners stay welded. amt in units. */
export function chip(geo, amt, rng) {
  const p = geo.attributes.position, m = new Map(), seed = rng() * 1000;
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!m.has(k)) { const h = (a) => { const s = Math.sin(a * 91.7 + seed + k.length) * 43758.5453; return s - Math.floor(s) - 0.5; }; const b = p.getX(i) * 3.1 + p.getY(i) * 5.7 + p.getZ(i) * 7.3; m.set(k, [h(b) * amt, h(b + 1) * amt, h(b + 2) * amt]); }
    const d = m.get(k); p.setXYZ(i, p.getX(i) + d[0], p.getY(i) + d[1], p.getZ(i) + d[2]);
  }
  geo.computeVertexNormals(); return geo;
}
/** Faceted boulder/pebble. */
export function rock(r, rng, squash = 0.7, detail = 1) {
  const g = new THREE.IcosahedronGeometry(r, detail); chip(g, r * 0.45, rng); g.scale(1, squash, 1); g.computeVertexNormals(); return g;
}
/** Tapered tube through points. r0 at start, r1 at end; points may be arrays or Vector3. */
export function tube(points, r0, r1 = r0, radial = 6, tubular = 0, { capEnds = true, tension = 0.5 } = {}) {
  const pts = points.map(v3);
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', tension);
  const n = tubular || Math.max(4, pts.length * 4);
  const fr = curve.computeFrenetFrames(n, false);
  const pos = [], nor = [], uv = [], idx = [];
  const P = new V(), N = new V();
  for (let i = 0; i <= n; i++) {
    const t = i / n; curve.getPointAt(t, P);
    const r = r0 + (r1 - r0) * t;
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2, c = Math.cos(a), s = -Math.sin(a);
      N.copy(fr.normals[i]).multiplyScalar(c).addScaledVector(fr.binormals[i], s).normalize();
      pos.push(P.x + N.x * r, P.y + N.y * r, P.z + N.z * r); nor.push(N.x, N.y, N.z); uv.push(j / radial, t * curve.getLength() * 0.5);
    }
  }
  const w = radial + 1;
  for (let i = 0; i < n; i++) for (let j = 0; j < radial; j++) { const a = i * w + j, b = a + w, c = b + 1, d = a + 1; idx.push(a, b, d, b, c, d); }
  if (capEnds) for (const end of [0, 1]) { // fan caps
    const i = end ? n : 0, cidx = pos.length / 3; curve.getPointAt(end, P); const T = curve.getTangentAt(end).multiplyScalar(end ? 1 : -1);
    pos.push(P.x, P.y, P.z); nor.push(T.x, T.y, T.z); uv.push(0.5, 0.5);
    for (let j = 0; j < radial; j++) { const a = i * w + j, b = a + 1; end ? idx.push(cidx, a, b) : idx.push(cidx, b, a); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); return g;
}
/** Subdivide a polygon's edges and jitter: rough broken outline. pts [[x,z],…]. */
export function jag(pts, step, amt, rng, closed = true) {
  const out = [], n = pts.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = pts[i], b = pts[(i + 1) % n], l = Math.hypot(b[0] - a[0], b[1] - a[1]), c = Math.max(1, Math.round(l / step));
    for (let k = 0; k < c; k++) {
      const t = k / c, j = k === 0 ? 0 : amt;
      out.push([a[0] + (b[0] - a[0]) * t + (rng() - 0.5) * j, a[1] + (b[1] - a[1]) * t + (rng() - 0.5) * j]);
    }
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
}
/** Horizontal slab from an [x,z] polygon with optional holes (arrays of [x,z]). Top at y, thickness down. */
export function plate(outline, holes, y, thick) {
  const sh = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, z)));
  for (const h of holes || []) sh.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, z))));
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false, curveSegments: 6 });
  g.rotateX(Math.PI / 2); g.translate(0, y, 0); return g;
}
/** Vertical wall panel in local XY with rect/poly openings. outline/holes as [x,y]. Extruded thickness centered on z=0. */
export function wallPanel(outline, holes, thick) {
  const sh = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes || []) sh.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false });
  g.translate(0, 0, -thick / 2); return g;
}
export const circlePts = (cx, cz, r, n = 18, rng = null, wob = 0) => Array.from({ length: n }, (_, i) => {
  const a = -(i / n) * Math.PI * 2, rr = r + (rng ? (rng() - 0.5) * wob : 0);
  return [cx + Math.cos(a) * rr, cz + Math.sin(a) * rr];
});
/** Single leaf lying in XZ, base at origin, tip toward +z, slight center fold. */
export function leaf(l = 0.2, w = 0.11, fold = 0.25) {
  const f = w * 0.5 * fold;
  const p = [0, 0, 0, -w / 2, f, l * 0.42, 0, 0, l * 0.5, w / 2, f, l * 0.42, 0, 0, l];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0.5, 0, 0, 0.45, 0.5, 0.5, 1, 0.45, 0.5, 1], 2));
  g.setIndex([0, 2, 1, 0, 3, 2, 1, 2, 4, 2, 3, 4]); g.computeVertexNormals(); return g;
}
/** Grass blade, base at origin, tapering up with a bend toward +z. */
export function blade(h = 0.5, w = 0.06, bend = 0.2, seg = 3) {
  const p = [], uv = [], idx = [];
  for (let i = 0; i <= seg; i++) { const t = i / seg, x = (w / 2) * (1 - t * t), y = h * t, z = bend * t * t; p.push(-x, y, z, x, y, z); uv.push(0, t, 1, t); }
  for (let i = 0; i < seg; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}
/** Fern frond: arching spine with paired leaflets. Base at origin, arches toward +z. */
export function frond(len = 0.8, pairs = 7, width = 0.28) {
  const parts = [];
  for (let i = 0; i < pairs; i++) {
    const t = (i + 1) / (pairs + 1), z = len * t * (1 - 0.18 * t), y = len * 0.75 * t * (1 - 0.9 * t), s = Math.sin(Math.PI * Math.pow(t, 0.7)) * width + 0.03;
    for (const dir of [-1, 1]) {
      const l = leaf(s, s * 0.34, 0.2); l.rotateY(dir * 1.25); l.rotateZ(dir * -0.2); l.translate(0, y, z); parts.push(l);
    }
  }
  return merge(parts);
}
/** Five-ish petal flower facing +y. */
export function flower(r = 0.08, petals = 5) {
  const parts = [];
  for (let i = 0; i < petals; i++) { const l = leaf(r, r * 0.8, 0.1); l.rotateX(-0.35); l.rotateY((i / petals) * Math.PI * 2); parts.push(l); }
  return merge(parts);
}
/** Cloth/curtain grid hanging down from y=0 in the XY plane (top row at y=0). Animate positions yourself; uv in 0..1. */
export function cloth(w, h, nx = 8, ny = 10) { const g = new THREE.PlaneGeometry(w, h, nx, ny); g.translate(0, -h / 2, 0); return g; }
/** Flat elliptical water disc: uv.x=shore factor as water shaders require. Lies in XZ at y=0. */
export function waterDisc(rx, rz, seg = 48, rings = 8, wob = 0.12, rng = Math.random) {
  const ph = [rng() * 6, rng() * 6, rng() * 6], pos = [0, 0, 0], uv = [1, 0], idx = [];
  const edge = (a) => 1 + wob * (Math.sin(a * 2 + ph[0]) * 0.6 + Math.sin(a * 3 + ph[1]) * 0.4 + Math.sin(a * 5 + ph[2]) * 0.2);
  for (let r = 1; r <= rings; r++) for (let s = 0; s < seg; s++) {
    const a = (s / seg) * Math.PI * 2, f = (r / rings), e = edge(a);
    pos.push(Math.cos(a) * rx * f * e, 0, Math.sin(a) * rz * f * e); uv.push(1 - f, 0);
  }
  for (let s = 0; s < seg; s++) idx.push(0, 1 + (s + 1) % seg, 1 + s);
  for (let r = 1; r < rings; r++) for (let s = 0; s < seg; s++) {
    const a = 1 + (r - 1) * seg + s, b = 1 + (r - 1) * seg + (s + 1) % seg, c = a + seg, d = b + seg; idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}
/** Water over an arbitrary region: grid in XZ at y=0; shoreFn(x,z)→ ≤0 outside, 0..1 inside. */
export function waterField(x0, x1, z0, z1, nx, nz, shoreFn) {
  const pos = [], uv = [], idx = [], at = (i, j) => [x0 + ((x1 - x0) * i) / nx, z0 + ((z1 - z0) * j) / nz];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const [x, z] = at(i, j); pos.push(x, 0, z); uv.push(Math.max(0, shoreFn(x, z)), 0); }
  const id = (i, j) => j * (nx + 1) + i;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const c = [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]].map(([a, b]) => { const [x, z] = at(a, b); return shoreFn(x, z); });
    if (Math.max(...c) <= 0) continue;
    idx.push(id(i, j), id(i, j + 1), id(i + 1, j), id(i + 1, j), id(i, j + 1), id(i + 1, j + 1));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}
/** Merge geometries of mixed index-ness; keeps position/normal/uv/color only. */
export function merge(geos) {
  const fixed = geos.map((g) => {
    const h = g.index ? g.toNonIndexed() : g.clone();
    if (!h.attributes.normal) h.computeVertexNormals();
    if (!h.attributes.uv) h.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(h.attributes.position.count * 2), 2));
    for (const k of Object.keys(h.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) h.deleteAttribute(k);
    h.morphAttributes = {}; h.clearGroups(); return h;
  });
  const hasColor = fixed.some((g) => g.attributes.color);
  if (hasColor) for (const g of fixed) if (!g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
  return mergeGeometries(fixed, false);
}
/** Compose a Matrix4 from {pos,rot:[x,y,z],scale,matrix}. */
export function xf({ pos = [0, 0, 0], rot = [0, 0, 0], scale = 1, matrix = null } = {}) {
  if (matrix) return matrix;
  const s = typeof scale === 'number' ? [scale, scale, scale] : scale;
  return new THREE.Matrix4().compose(new V(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot, 'YXZ')), new V(...s));
}
/** Project positions to world-tiling UVs by dominant normal axis (no seams across parts). */
export function worldUV(g, s = 0.25) {
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  // Assign per-triangle for non-indexed geometry
  for (let i = 0; i < p.count; i += 3) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
    for (let k = 0; k < 3; k++) {
      const j = i + k;
      if (ny >= nx && ny >= nz) { uv[j * 2] = p.getX(j) * s; uv[j * 2 + 1] = p.getZ(j) * s; }
      else if (nx >= nz) { uv[j * 2] = p.getZ(j) * s; uv[j * 2 + 1] = p.getY(j) * s; }
      else { uv[j * 2] = p.getX(j) * s; uv[j * 2 + 1] = p.getY(j) * s; }
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g;
}
