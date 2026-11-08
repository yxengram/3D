// building.js — the half-collapsed four-storey concrete shell: slabs, facades, stairs, rubble, overgrowth, cloth.
// Walls are generated as vertical "strips" so a broken skyline and any opening (rect window or jagged hole)
// compose without polygon booleans. Coplanar strips draw no ink lines, and painted skins tile across them.

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const hash2 = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x, y) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const a = fx * fx * (3 - 2 * fx), b = fy * fy * (3 - 2 * fy);
  return lerp(lerp(hash2(i, j), hash2(i + 1, j), a), lerp(hash2(i, j + 1), hash2(i + 1, j + 1), a), b);
}
const fbm = (x, y) => vnoise(x, y) * 0.58 + vnoise(x * 2.1 + 7.3, y * 2.1 + 3.1) * 0.3 + vnoise(x * 4.3 + 1.7, y * 4.3 + 9.2) * 0.12;

/** Piecewise-linear y(u) through points sorted by u. */
function polyline(pts) {
  return (u) => {
    if (u <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) if (u <= pts[i][0]) {
      const [a, ya] = pts[i - 1], [b, yb] = pts[i];
      return b - a < 1e-6 ? yb : lerp(ya, yb, (u - a) / (b - a));
    }
    return pts[pts.length - 1][1];
  };
}
/** Subdivide a polyline and jitter y (never above `cap`). Keeps u monotonic. */
function saw(pts, step, amt, rng, cap = 1e9) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, ya] = pts[i], [b, yb] = pts[i + 1], n = Math.max(1, Math.round((b - a) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, y = lerp(ya, yb, t), j = (k === 0 || y >= cap) ? 0 : (rng() - 0.5) * amt;
      out.push([a + (b - a) * (t + (k ? (rng() - 0.5) * 0.45 / n : 0)), y + j]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Broken masonry skyline: little flat treads and sharp risers, like bricks that sheared along their courses. */
function teeth(pts, step, amt, rng, cap = 1e9) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, ya] = pts[i], [b, yb] = pts[i + 1], n = Math.max(1, Math.round((b - a) / step)), du = (b - a) / n;
    for (let k = 0; k < n; k++) {
      const u = a + du * k, y = lerp(ya, yb, k / n), j = y >= cap ? 0 : (rng() - 0.5) * amt;
      out.push([u, y + j]);
      if (y < cap) out.push([u + du * (0.55 + rng() * 0.35), y + j + (rng() - 0.5) * 0.04]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Triangle soup with flat normals; each face is oriented away from a reference center. */
class Soup {
  constructor(THREE) { this.THREE = THREE; this.p = []; this.n = []; this.uv = []; }
  tri(a, b, c, ctr, ua, ub, uc) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz); if (l < 1e-9) return;
    nx /= l; ny /= l; nz /= l;
    const mx = (a[0] + b[0] + c[0]) / 3 - ctr[0], my = (a[1] + b[1] + c[1]) / 3 - ctr[1], mz = (a[2] + b[2] + c[2]) / 3 - ctr[2];
    if (nx * mx + ny * my + nz * mz < 0) { [b, c] = [c, b]; [ub, uc] = [uc, ub]; nx = -nx; ny = -ny; nz = -nz; }
    this.p.push(...a, ...b, ...c); this.n.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    this.uv.push(...(ua || [0, 0]), ...(ub || [0, 0]), ...(uc || [0, 0]));
  }
  quad(a, b, c, d, ctr, ua, ub, uc, ud) { this.tri(a, b, c, ctr, ua, ub, uc); this.tri(a, c, d, ctr, ua, uc, ud); }
  geometry() {
    const T = this.THREE, g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(this.uv, 2));
    return g;
  }
}

/** Subtract closed intervals `cut` from [a,b]. */
function subtract(a, b, cut) {
  let out = [[a, b]];
  for (const [c, d] of cut) {
    const nx = [];
    for (const [p, q] of out) {
      if (d <= p || c >= q) { nx.push([p, q]); continue; }
      if (c > p) nx.push([p, c]);
      if (d < q) nx.push([d, q]);
    }
    out = nx;
  }
  return out.filter(([p, q]) => q - p > 1e-3);
}

/**
 * Wall run as strips. f.map(u,y,w)→[x,y,z].
 * o: {u0,u1,sky(u),breaks[],ops[{u0,u1,bot(u),top(u),breaks[]}],base,w0,w1,uv(u,y),back(bool)}
 */
function strips(soup, f, o) {
  const { u0, u1, sky, ops = [], base = 0, w0, w1, uv = null, back = true } = o;
  const set = new Set([u0, u1]);
  for (const v of o.breaks || []) if (v > u0 && v < u1) set.add(v);
  for (const op of ops) for (const v of [op.u0, op.u1, ...(op.breaks || [])]) if (v > u0 && v < u1) set.add(v);
  const us = [...set].sort((a, b) => a - b);
  const cols = [];
  for (let i = 0; i < us.length - 1; i++) {
    const ua = us[i], ub = us[i + 1]; if (ub - ua < 1e-4) continue;
    const uc = (ua + ub) / 2;
    let spans = [{ bA: base, bB: base, tA: sky(ua), tB: sky(ub) }];
    for (const op of ops) {
      if (uc <= op.u0 || uc >= op.u1) continue;
      const lA = op.bot(ua), lB = op.bot(ub), hA = op.top(ua), hB = op.top(ub), nx = [];
      for (const s of spans) {
        nx.push({ bA: s.bA, bB: s.bB, tA: Math.min(s.tA, lA), tB: Math.min(s.tB, lB) });
        nx.push({ bA: Math.max(s.bA, hA), bB: Math.max(s.bB, hB), tA: s.tA, tB: s.tB });
      }
      spans = nx;
    }
    spans = spans.map((s) => ({ ...s, tA: Math.max(s.tA, s.bA), tB: Math.max(s.tB, s.bB) })).filter((s) => s.tA - s.bA > 1e-3 || s.tB - s.bB > 1e-3);
    cols.push({ ua, ub, spans });
  }
  const T = (u, y) => (uv ? uv(u, y) : null);
  cols.forEach((c, i) => {
    const prev = cols[i - 1], next = cols[i + 1];
    for (const s of c.spans) {
      const ctr = f.map((c.ua + c.ub) / 2, (s.bA + s.bB + s.tA + s.tB) / 4, (w0 + w1) / 2);
      const q = (ua, ya, wa, ub, yb, wb, uc, yc, wc, ud, yd, wd, tex = true) => soup.quad(f.map(ua, ya, wa), f.map(ub, yb, wb), f.map(uc, yc, wc), f.map(ud, yd, wd), ctr,
        tex ? T(ua, ya) : null, tex ? T(ub, yb) : null, tex ? T(uc, yc) : null, tex ? T(ud, yd) : null);
      q(c.ua, s.bA, w1, c.ub, s.bB, w1, c.ub, s.tB, w1, c.ua, s.tA, w1);
      if (back) q(c.ua, s.bA, w0, c.ub, s.bB, w0, c.ub, s.tB, w0, c.ua, s.tA, w0);
      q(c.ua, s.tA, w0, c.ub, s.tB, w0, c.ub, s.tB, w1, c.ua, s.tA, w1);                      // top
      if (s.bA > base + 1e-3 || s.bB > base + 1e-3) q(c.ua, s.bA, w0, c.ub, s.bB, w0, c.ub, s.bB, w1, c.ua, s.bA, w1); // underside
      const sideL = subtract(s.bA, s.tA, prev && Math.abs(prev.ub - c.ua) < 1e-6 ? prev.spans.map((p) => [p.bB, p.tB]) : []);
      for (const [p, r] of sideL) q(c.ua, p, w0, c.ua, p, w1, c.ua, r, w1, c.ua, r, w0);
      const sideR = subtract(s.bB, s.tB, next && Math.abs(next.ua - c.ub) < 1e-6 ? next.spans.map((p) => [p.bA, p.tA]) : []);
      for (const [p, r] of sideR) q(c.ub, p, w0, c.ub, p, w1, c.ub, r, w1, c.ub, r, w0);
    }
  });
}

const rectOp = (u0, u1, y0, y1, extra = {}) => ({ u0, u1, bot: () => y0, top: () => y1, y0, y1, rect: true, ...extra });
/** Jagged hole from lower and upper profiles over the same u range. */
function holeOp(lower, upper, grow, rng) {
  const lo = saw(lower, 0.26, 0.14, rng).map(([u, y]) => [u, y - grow]);
  const hi = saw(upper, 0.26, 0.14, rng).map(([u, y]) => [u, y + grow]);
  const l = polyline(lo), h = polyline(hi);
  return { u0: lower[0][0] - grow, u1: lower[lower.length - 1][0] + grow, bot: l, top: h, breaks: [...lo.map((p) => p[0]), ...hi.map((p) => p[0])], rect: false };
}

// ---------------------------------------------------------------------------------------------------------------
export function build(ctx) {
  const { THREE, layout, P, kit, rng, toon } = ctx;
  const { BUILDING: B, TREE, onSlab } = layout;
  const L = B.levelY, WT = B.wallT, PAR = 11.72, group = new THREE.Group();
  const b = ctx.batch();
  const addBox = (mat, w, h, d, pos, rot = [0, 0, 0], color = '#ffffff') => b.add(kit.box(w, h, d), mat, { pos, rot, color });
  const R = (a, c) => rng.range(a, c);

  // ------------------------------------------------------------------------------------------------ slabs
  const onEdge = (p) => Math.abs(p[0] - B.x[0]) < 1e-6 || Math.abs(p[0] - B.x[1]) < 1e-6 || Math.abs(p[1] - B.z[0]) < 1e-6 || Math.abs(p[1] - B.z[1]) < 1e-6;
  const sameSide = (p, q) => (Math.abs(p[0] - q[0]) < 1e-6 && (Math.abs(p[0] - B.x[0]) < 1e-6 || Math.abs(p[0] - B.x[1]) < 1e-6))
    || (Math.abs(p[1] - q[1]) < 1e-6 && (Math.abs(p[1] - B.z[0]) < 1e-6 || Math.abs(p[1] - B.z[1]) < 1e-6));
  function jagCollapse(outline, step, amt) {
    const out = [];
    outline.forEach((p, i) => {
      const q = outline[(i + 1) % outline.length];
      if (sameSide(p, q)) { out.push({ p, broken: false }); return; }
      const seg = kit.jag([p, q], step, amt, rng, false);
      seg.slice(0, -1).forEach((s, k) => out.push({ p: s, broken: k > 0 || !onEdge(p) }));
    });
    return out;
  }
  const signedArea = (poly) => poly.reduce((a, p, i) => { const q = poly[(i + 1) % poly.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0);
  /** Pull broken vertices inward a random amount so slab layers terrace at the break. */
  function inset(pts, a0, a1) {
    const raw = pts.map((e) => e.p), s = signedArea(raw) > 0 ? 1 : -1;
    return pts.map((e, i) => {
      if (!e.broken) return e.p;
      const a = raw[(i + raw.length - 1) % raw.length], c = raw[(i + 1) % raw.length];
      let nx = (c[1] - a[1]) * s, nz = -(c[0] - a[0]) * s; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
      const d = R(a0, a1); return [e.p[0] - nx * d, e.p[1] - nz * d];
    });
  }
  const tileTint = ['#f4fff8', '#ecd9bb', '#d4e6ea', '#dfe6c8'];
  const slabEdges = [];
  B.slabs.forEach((s, i) => {
    const edge = jagCollapse(s.outline, 0.42, 0.26), body = edge.map((e) => e.p);
    const hole = (d) => s.holes.map((h) => kit.circlePts(h.x, h.z, h.r + d, 22, rng, 0.2));
    const roof = i === 4;
    if (i === 0) {
      b.add(kit.plate(body, [], L[0] - 0.05, 0.35), 'concrete');
      b.add(kit.plate(body, [], L[0], 0.05), 'tile', { color: tileTint[0] });
    } else {
      const h1 = hole(0);
      b.add(kit.plate(body, h1, s.y - 0.075, 0.125), 'concreteClean', { color: '#efece2' });
      b.add(kit.plate(inset(edge, 0.05, 0.2), hole(0.08), s.y - 0.2, B.slabT - 0.2), 'concreteClean', { color: '#d4d2c6' });
      b.add(kit.plate(inset(edge, 0.0, 0.05), hole(0.03), s.y - 0.03, 0.06), 'flat', { color: '#a89f8a' }); // screed
      if (roof) b.add(kit.plate(inset(edge, 0.03, 0.2), hole(0.1), s.y, 0.03), 'concrete', { color: '#cdd0c2' });
      else b.add(kit.plate(inset(edge, 0.03, 0.17), hole(0.08), s.y, 0.03), 'tile', { color: tileTint[i] });
    }
    slabEdges[i] = edge;
  });

  // ------------------------------------------------------------------------------------------------ rebar
  const steelCols = ['#ffffff', '#f2d6c8', '#d8b8a8'];
  function rebar(p, d, len, droop = 0, r = 0.032, rnd = rng) {
    const m = [p[0] + d[0] * len * 0.55, p[1] + d[1] * len * 0.55 - droop * 0.25, p[2] + d[2] * len * 0.55];
    const e = [p[0] + d[0] * len, p[1] + d[1] * len - droop, p[2] + d[2] * len];
    b.add(kit.tube([p, m, e], r, r * 0.85, 3, 4, { capEnds: false }), 'rust', { color: rnd.pick(steelCols) });
    return e;
  }
  B.slabs.forEach((s, i) => {
    if (i === 0) return;
    const e = slabEdges[i], raw = e.map((v) => v.p), sgn = signedArea(raw) > 0 ? 1 : -1;
    e.forEach((v, k) => {
      if (!v.broken) return;
      const a = raw[(k + raw.length - 1) % raw.length], c = raw[(k + 1) % raw.length];
      let nx = (c[1] - a[1]) * sgn, nz = -(c[0] - a[0]) * sgn; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
      const tx = -nz, tz = nx;
      const n = rng() < 0.55 ? 2 : 1;
      for (let j = 0; j < n; j++) {
        const o = R(-0.16, 0.16), base = [v.p[0] + tx * o - nx * 0.1, s.y - R(0.09, 0.2), v.p[1] + tz * o - nz * 0.1];
        const dir = [nx + tx * R(-0.35, 0.35), R(-0.25, 0.1), nz + tz * R(-0.35, 0.35)];
        const ln = Math.hypot(...dir); dir[0] /= ln; dir[1] /= ln; dir[2] /= ln;
        rebar(base, dir, R(0.3, 0.95), R(0.0, 0.3));
      }
      if (rng() < 0.3) { // a cross bar tying a couple of ends together: reads as a mesh
        const bx = v.p[0] + nx * 0.32, bz = v.p[1] + nz * 0.32, y = s.y - 0.16;
        b.add(kit.tube([[bx - tx * 0.42, y, bz - tz * 0.42], [bx, y - 0.05, bz], [bx + tx * 0.42, y - 0.02, bz + tz * 0.42]], 0.028, 0.026, 3, 4, { capEnds: false }), 'rust', { color: '#e8c8b4' });
      }
    });
  });

  // ------------------------------------------------------------------------------------------------ facades
  const skyS = teeth([[-11, PAR], [-9.3, PAR], [-9.05, 11.25], [-8.75, 10.95], [-8.3, 10.5], [-7.95, 9.65], [-7.5, 9.35], [-7.25, 8.45], [-6.4, 8.25], [-6.05, 7.3], [-5.5, 6.9],
    [-5.2, 5.9], [-4.7, 5.5], [-4.1, 5.25], [-3.5, 4.5], [-2.9, 4.25], [-2.2, 3.6], [-1.4, 3.35], [-0.7, 3.05], [-0.4, 2.7], [0.05, 2.2], [0.6, 1.75], [1.1, 1.0], [1.5, 0.7]], 0.3, 0.36, rng, PAR - 0.01);
  const skyE = teeth([[-11, PAR], [-9.75, PAR], [-9.45, 11.2], [-9.1, 10.95], [-8.6, 10.2], [-8.0, 10.05], [-7.6, 9.0], [-7.1, 8.45], [-6.5, 8.1], [-6.1, 7.0], [-5.6, 6.6],
    [-5.3, 5.6], [-4.6, 5.3], [-3.9, 4.4], [-3.3, 4.0], [-2.85, 3.0], [-2.3, 2.75], [-1.6, 2.2], [-0.9, 1.9], [-0.3, 1.25], [0.5, 0.8]], 0.3, 0.36, rng, PAR - 0.01);
  const skyN = saw([[-11, PAR], [-0.2, PAR], [0.15, 11.42], [0.55, 11.5], [0.95, 11.3], [1.5, 11.42]], 0.26, 0.12, rng, PAR - 0.01);
  const skyW = saw([[-11, PAR], [-1.1, PAR], [-0.7, 11.4], [-0.25, 11.55], [0.1, 11.3], [0.5, 11.15]], 0.26, 0.12, rng, PAR - 0.01);

  const win = (s, u0, u1, sill = 0.84, head = 2.16) => rectOp(u0, u1, L[s] + sill, L[s] + head, { storey: s, win: true });
  const shop = rectOp(B.shopWindow.x[0], B.shopWindow.x[1], B.shopWindow.y[0], B.shopWindow.y[1]);
  const eastLo = [[-6.5, 1.6], [-6.35, 0.72], [-6.15, 0.36], [-5.1, 0.3], [-4.0, 0.3], [-3.75, 0.6], [-3.6, 1.5]];
  const eastHi = [[-6.5, 1.6], [-6.3, 2.0], [-6.0, 2.22], [-5.4, 2.45], [-4.7, 2.4], [-4.2, 2.3], [-3.85, 2.05], [-3.6, 1.5]];
  const southLo = [[-7.5, 4.1], [-7.2, 3.52], [-6.8, 3.3], [-6.2, 3.2], [-5.85, 3.55], [-5.6, 4.2]];
  const southHi = [[-7.5, 4.1], [-7.2, 4.72], [-6.7, 4.92], [-6.1, 5.0], [-5.8, 4.72], [-5.6, 4.2]];
  const holeE = holeOp(eastLo, eastHi, 0, rng), holeE2 = holeOp(eastLo, eastHi, 0.2, rng);
  const holeS = holeOp(southLo, southHi, 0, rng), holeS2 = holeOp(southLo, southHi, 0.18, rng);

  const F = {
    south: { name: 'south', u0: -11, u1: 1.5, map: (u, y, w) => [u, y, B.z[1] + w], n: [0, 0, 1], t: [1, 0, 0], flip: false, skyPts: skyS,
      ops: [shop, holeS, win(1, -10.35, -9.05), win(1, -4.3, -3.0), win(1, -2.45, -1.25), win(2, -10.35, -9.05, 0.16, 2.2), win(2, -7.95, -6.65), win(3, -10.35, -9.05), win(3, -7.95, -6.75)],
      skinOps: [holeS2] },
    east: { name: 'east', u0: -11, u1: 0.5, map: (u, y, w) => [B.x[1] + w, y, u], n: [1, 0, 0], t: [0, 0, 1], flip: true, skyPts: skyE,
      ops: [holeE, win(0, -10.3, -8.3, 0.9, 2.2), win(1, -7.6, -6.4), win(2, -10.2, -8.9), win(2, -7.6, -6.4), win(3, -10.4, -9.4), win(1, -5.0, -3.9)],
      skinOps: [holeE2] },
    north: { name: 'north', u0: -11, u1: 1.5, map: (u, y, w) => [u, y, B.z[0] - w], n: [0, 0, -1], t: [1, 0, 0], flip: true, skyPts: skyN,
      ops: [win(0, -10.3, -9.2, 1.1, 2.2), win(0, -7.4, -6.2, 1.1, 2.2), win(0, -2.9, -1.8, 0.0, 2.1), win(0, 0.0, 0.9, 1.1, 2.2),
        win(1, -10.3, -9.1), win(1, -7.7, -6.3), win(1, -5.0, -3.6), win(1, -2.4, -1.0), win(1, 0.0, 0.9),
        win(2, -10.3, -9.1), win(2, -7.7, -6.3), win(2, -5.0, -3.6), win(2, -2.4, -1.0), win(2, 0.0, 0.9),
        win(3, -10.3, -9.1), win(3, -5.0, -3.6), win(3, -2.4, -1.0), win(3, 0.0, 0.9)] },
    west: { name: 'west', u0: -11, u1: 0.5, map: (u, y, w) => [B.x[0] - w, y, u], n: [-1, 0, 0], t: [0, 0, 1], flip: false, skyPts: skyW,
      ops: [win(0, -9.4, -8.2, 1.0, 2.2), win(0, -3.6, -2.4, 1.0, 2.2),
        win(1, -9.6, -8.2), win(1, -6.4, -5.2), win(1, -3.6, -2.2), win(1, -1.0, -0.1),
        win(2, -9.6, -8.2), win(2, -6.4, -5.2), win(2, -3.6, -2.2), win(2, -1.0, -0.1),
        win(3, -9.6, -8.2), win(3, -3.6, -2.2), win(3, -1.0, -0.1)] },
  };
  const FS = Object.values(F);
  // Indoor walls get a warm bounce term: the ruin's interior must read bright against the cool street shade.
  const indoorPlaster = ctx.surface('plaster', { vertexColors: true, moss: 0.16, emissive: '#ffc890', emissiveIntensity: 0.3 });
  const rgb = (r, g, c) => new THREE.Color(r, g, c);
  const roomTint = [rgb(1.25, 1.25, 1.2), rgb(0.72, 1.25, 1.22), rgb(1.55, 1.05, 0.86), rgb(0.86, 1.3, 0.98)];
  const roomDado = [rgb(0.62, 1.05, 0.95), rgb(0.45, 0.85, 0.9), rgb(1.1, 0.7, 0.55), rgb(0.6, 0.95, 0.68)];
  for (const f of FS) {
    f.sky = polyline(f.skyPts);
    const seed = f.u0 * 3 + f.n[0] * 5 + f.n[2] * 11;
    f.solid = (u, y, m = 0) => u > f.u0 && u < f.u1 && y > 0 && y < f.sky(u) - m && !f.ops.some((o) => u > o.u0 - m && u < o.u1 + m && y > o.bot(u) - m && y < o.top(u) + m);
    // Skin stops short of the structural break so raw concrete rims every broken edge.
    f.sky2 = (u) => { const y = f.sky(u); return y >= PAR - 0.02 ? y : y - 0.05 - 0.3 * vnoise(u * 2.3 + seed, 3.7) - 0.12 * vnoise(u * 8 + seed, 1.2); };
    f.skinPts = (() => { const a = []; for (let u = f.u0; u < f.u1; u += 0.17) if (f.sky(u) < PAR - 0.02) a.push([u + 0.02 * Math.sin(u * 91), 0]); return a.map((p) => p[0]); })();
    f.w = 1536; f.px = (u) => (f.flip ? (f.u1 - u) : (u - f.u0)) / (f.u1 - f.u0);
    f.uv = (u, y) => [f.px(u), y / 12];
    f.br = f.skyPts.map((p) => p[0]);
    strips(f.soup = new Soup(THREE), f, { u0: f.u0, u1: f.u1, sky: f.sky, breaks: f.br, ops: f.ops, base: -0.1, w0: -WT, w1: 0.002 });
    b.add(f.soup.geometry(), 'concrete', { color: '#d8d4c8' });
    // interior skin: every storey its own faded colour, so the exposed floors read like stacked stage sets
    for (let s = 0; s < 4; s++) {
      const top = L[s + 1] - B.slabT, br = [...f.skinPts, ...f.skyPts.map((p) => p[0])];
      if (f.sky(f.u0 + 0.5) < L[s] && f.sky(f.u1 - 0.5) < L[s] && s > 0 && f.name !== 'south' && f.name !== 'east') continue;
      const wall = new Soup(THREE), dado = new Soup(THREE);
      strips(wall, f, { u0: f.u0, u1: f.u1, sky: (u) => Math.min(f.sky2(u) - 0.02, top), breaks: br, ops: f.ops, base: L[s], w0: -WT - 0.018, w1: -WT });
      strips(dado, f, { u0: f.u0, u1: f.u1, sky: (u) => Math.min(f.sky2(u) - 0.02, L[s] + 0.82), breaks: br, ops: f.ops, base: L[s], w0: -WT - 0.034, w1: -WT - 0.01 });
      b.add(wall.geometry(), indoorPlaster, { color: roomTint[s] });
      b.add(dado.geometry(), indoorPlaster, { color: roomDado[s] });
    }
  }

  // ------------------------------------------------------------------------------------------------ painted skins
  const painted = {
    south: (g, W, H, h) => {
      h.tiles(0, 0.42, h.U(-11), h.U(1.5), ['#8fb8a8', '#a0c6b4', '#84ad9f'], 0.2);       // shopfront riser
      h.band(2.5, 2.86, '#e4dcc6');
      h.tiles(5.25, 5.82, h.U(-11), h.U(1.5), ['#b9674a', '#c67a57', '#a9583f'], 0.17);    // terracotta tile belt
      h.tiles(10.7, 11.2, h.U(-11), h.U(1.5), ['#8ab7b4', '#9cc7c2', '#7eaaa8'], 0.15);
      h.band(11.45, 12, '#f3ecd9');
      h.paintBlock(-10.95, -9.62, 0.42, 2.5, '#a9cabb');
      h.slogan('保持街道整潔  人人有責', -10.7, 8.56, 3.9, 0.36, '#b5473a');
      h.circled('拆', -8.32, 4.25, 0.5);
      h.vertical('緑化推進', -8.42, 8.9, 0.5, '#2f7f78');
      h.tag('KAZE', -4.95, 4.2, 0.42, '#3aa0a5', '#f3eedc', -0.08);
      h.tag('KAZE', -1.9, 3.0, 0.3, '#e0c25a', '#3b6d72', 0.05);
      h.heart(-10.25, 1.5, 0.42, '#d0507a');
      h.tag('24', -10.75, 0.95, 0.7, '#e0c25a', '#3b6d72', 0.1);
    },
    east: (g, W, H, h) => {
      h.tiles(0, 0.34, h.U(-11), h.U(0.5), ['#8fb8a8', '#a0c6b4', '#84ad9f'], 0.2);
      h.tiles(5.25, 5.82, h.U(-11), h.U(0.5), ['#b9674a', '#c67a57', '#a9583f'], 0.17);
      h.tiles(10.7, 11.2, h.U(-11), h.U(0.5), ['#8ab7b4', '#9cc7c2', '#7eaaa8'], 0.15);
      h.band(11.45, 12, '#f3ecd9');
      h.vertical('立入禁止', -8.45, 8.1, 0.62, '#c0483a');
      h.slogan('節約用水 愛護環境', -6.2, 8.65, 3.3, 0.0, '#2f7f78', 'sans');
      h.tag('MIDORI', -3.75, 2.85, 1.05, '#d0507a', '#fff3c9', -0.05);
      h.tag('MIDORI', -2.2, 1.2, 0.8, '#e0a040', '#3b6d72', 0.06);
      h.heart(-7.4, 3.5, 0.4, '#3aa0a5');
    },
    north: (g, W, H, h) => {
      h.tiles(0, 0.42, h.U(-11), h.U(1.5), ['#8fb8a8', '#a0c6b4', '#84ad9f'], 0.2);
      h.tiles(5.25, 5.82, h.U(-11), h.U(1.5), ['#b9674a', '#c67a57', '#a9583f'], 0.17);
      h.tiles(10.7, 11.2, h.U(-11), h.U(1.5), ['#8ab7b4', '#9cc7c2', '#7eaaa8'], 0.15);
      h.band(11.45, 12, '#f3ecd9');
      h.slogan('都市再生計画区域', -0.6, 8.25, 7.4, 0.36, '#3f7f96', 'sans');
      h.tag('ROOTS', -4.3, 1.1, 1.1, '#3aa0a5', '#fff3c9', 0.04);
    },
    west: (g, W, H, h) => {
      h.tiles(0, 0.42, h.U(-11), h.U(0.5), ['#8fb8a8', '#a0c6b4', '#84ad9f'], 0.2);
      h.tiles(5.25, 5.82, h.U(-11), h.U(0.5), ['#b9674a', '#c67a57', '#a9583f'], 0.17);
      h.tiles(10.7, 11.2, h.U(-11), h.U(0.5), ['#8ab7b4', '#9cc7c2', '#7eaaa8'], 0.15);
      h.band(11.45, 12, '#f3ecd9');
      h.vertical('緑の街', -7.1, 8.0, 0.74, '#b5473a');
      h.tag('NEKO', -6.8, 1.15, 1.0, '#e0a040', '#2f7f78', -0.06);
    },
  };
  const JP = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans CJK JP","PingFang SC","Microsoft YaHei",sans-serif';
  const JM = '"Hiragino Mincho ProN","Noto Serif CJK JP","Songti SC","SimSun",serif';

  function eroded(ctx2, W, H, draw, r, alpha, chips = 300) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); draw(g);
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < chips; i++) {
      g.fillStyle = `rgba(0,0,0,${0.45 + r() * 0.55})`; g.beginPath();
      g.ellipse(r() * W, r() * H, 3 + r() * 18, 1.5 + r() * 7, r() * 3, 0, 6.3); g.fill();
    }
    ctx2.globalAlpha = alpha; ctx2.drawImage(c, 0, 0); ctx2.globalAlpha = 1;
  }

  function paintSkin(f) {
    const r = ctx.seeded('skin' + f.name), W = f.w, H = 1536;
    return ctx.canvasTexture(W, H, (g) => {
      const U = (u) => f.px(u) * W, Y = (y) => H * (1 - y / 12), S = H / 12;
      // base colour fields: cream lower floors, pale sea-green upper floors
      g.fillStyle = '#efe5cf'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#c9dfd2'; g.fillRect(0, Y(10.7), W, Y(5.82) - Y(10.7));
      // large faded paint patches with crisp painted edges
      for (let i = 0; i < 16; i++) {
        const x = r() * W, y = r() * H, c = r() < 0.5 ? 'rgba(255,250,236,.32)' : 'rgba(150,170,160,.14)';
        g.fillStyle = c; g.beginPath();
        const n = 9, rx = 60 + r() * 180, ry = 40 + r() * 120;
        for (let k = 0; k < n; k++) { const a = (k / n) * 6.283, q = 0.65 + r() * 0.5; g.lineTo(x + Math.cos(a) * rx * q, y + Math.sin(a) * ry * q); }
        g.fill();
      }
      const h = {
        U,
        band: (y0, y1, c) => { g.fillStyle = c; g.fillRect(0, Y(y1), W, Y(y0) - Y(y1)); },
        paintBlock: (u0, u1, y0, y1, c) => { g.fillStyle = c; const a = Math.min(U(u0), U(u1)), b2 = Math.max(U(u0), U(u1)); g.fillRect(a, Y(y1), b2 - a, Y(y0) - Y(y1)); },
        tiles: (y0, y1, x0, x1, cols, sz) => {
          const a = Math.min(x0, x1), e = Math.max(x0, x1), s = sz * S, t = Y(y1), bt = Y(y0);
          g.fillStyle = '#e6e2d4'; g.fillRect(a, t, e - a, bt - t);
          for (let yy = t; yy < bt - 1; yy += s * 0.62) for (let xx = a; xx < e; xx += s) {
            if (r() < 0.05) continue;
            g.fillStyle = cols[(r() * cols.length) | 0]; g.fillRect(xx + 1.5, yy + 1.5, s - 3, Math.min(s * 0.62, bt - yy) - 3);
          }
        },
      };
      h.slogan = (text, uA, y, span, plate, col) => {
        const x0 = U(uA), wpx = span * S, hpx = 0.46 * S;
        eroded(g, W, H, (c) => {
          if (plate) { c.fillStyle = '#f6f0df'; c.fillRect(x0 - 8, Y(y) - hpx * 0.9, wpx + 16, hpx * 1.2); }
          c.fillStyle = col; c.font = `700 ${hpx * 0.8}px ${JP}`; c.textBaseline = 'alphabetic';
          const m = c.measureText(text).width, sx = Math.min(1, wpx / m); c.save(); c.translate(x0, Y(y) - hpx * 0.1); c.scale(sx, 1); c.fillText(text, 0, 0); c.restore();
        }, r, 0.82, 320);
      };
      h.vertical = (text, u, yTop, size, col) => {
        const s = size * S;
        eroded(g, W, H, (c) => {
          c.fillStyle = col; c.font = `800 ${s}px ${JM}`; c.textAlign = 'center'; c.textBaseline = 'top';
          [...text].forEach((ch, i) => c.fillText(ch, U(u), Y(yTop) + i * s * 1.06));
        }, r, 0.78, 420);
      };
      h.circled = (ch, u, y, rad, col = '#c0483a') => {
        eroded(g, W, H, (c) => {
          c.strokeStyle = col; c.fillStyle = col; c.lineWidth = rad * S * 0.14; c.beginPath(); c.arc(U(u), Y(y), rad * S, 0, 6.3); c.stroke();
          c.font = `900 ${rad * S * 1.32}px ${JP}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ch, U(u), Y(y));
        }, r, 0.86, 200);
      };
      h.tag = (text, u, y, size, fillC, line, rot) => {
        eroded(g, W, H, (c) => {
          const s = size * S; c.save(); c.translate(U(u), Y(y)); c.rotate(rot); c.transform(1, 0, -0.22, 1, 0, 0);
          c.font = `italic 900 ${s}px "Arial Black","Helvetica Neue",Impact,sans-serif`; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
          c.lineJoin = 'round'; c.lineWidth = s * 0.2; c.strokeStyle = line; c.strokeText(text, 0, 0);
          c.lineWidth = s * 0.06; c.strokeStyle = '#2f4a50'; c.strokeText(text, 0, 0);
          c.fillStyle = fillC; c.fillText(text, 0, 0);
          const tw = c.measureText(text).width;
          c.strokeStyle = fillC; c.lineCap = 'round'; c.lineWidth = s * 0.035;
          for (let i = 0; i < 6; i++) { const dx = -tw / 2 + r() * tw; c.beginPath(); c.moveTo(dx, s * 0.02); c.lineTo(dx, s * (0.2 + r() * 0.55)); c.stroke(); }
          c.restore();
        }, r, 0.8, 240);
      };
      h.heart = (u, y, size, col) => {
        eroded(g, W, H, (c) => {
          const s = size * S, x = U(u), yy = Y(y);
          c.strokeStyle = col; c.lineWidth = s * 0.16; c.lineCap = 'round';
          c.beginPath(); c.moveTo(x, yy + s * 0.9); c.bezierCurveTo(x - s * 1.5, yy - s * 0.2, x - s * 0.7, yy - s, x, yy - s * 0.3); c.bezierCurveTo(x + s * 0.7, yy - s, x + s * 1.5, yy - s * 0.2, x, yy + s * 0.9); c.stroke();
        }, r, 0.8, 90);
      };
      painted[f.name](g, W, H, h);
      // exposed-brick wounds where the plaster has fallen off
      for (let i = 0; i < 7; i++) {
        const x = r() * W, y = Y(R(1, 11)), rx = 40 + r() * 80, ry = 28 + r() * 60;
        g.save(); g.beginPath(); const n = 11;
        for (let k = 0; k < n; k++) { const a = (k / n) * 6.283, q = 0.6 + r() * 0.6; g.lineTo(x + Math.cos(a) * rx * q, y + Math.sin(a) * ry * q); }
        g.closePath(); g.fillStyle = '#c7b9a1'; g.fill(); g.strokeStyle = 'rgba(110,105,92,.5)'; g.lineWidth = 2; g.stroke(); g.clip();
        const bh = 15, bw = 34;
        for (let yy = y - ry * 1.2, row = 0; yy < y + ry * 1.2; yy += bh, row++) for (let xx = x - rx * 1.3 - (row % 2) * bw / 2; xx < x + rx * 1.3; xx += bw) {
          g.fillStyle = ['#b9674a', '#a9583f', '#c67a57'][(r() * 3) | 0]; g.fillRect(xx + 1, yy + 1, bw - 2, bh - 2);
        }
        g.restore();
      }
      // window surrounds, then rain stains from sills and the cornice (cool-toned, soft lower end)
      const streak = (x, y, w2, len, a) => {
        const l = g.createLinearGradient(0, y, 0, y + len);
        l.addColorStop(0, `rgba(82,104,104,${a * 0.5})`); l.addColorStop(0.6, `rgba(82,104,104,${a * 0.28})`); l.addColorStop(1, 'rgba(82,104,104,0)');
        g.fillStyle = l; g.beginPath(); g.moveTo(x, y); g.lineTo(x + w2, y); g.lineTo(x + w2 * 0.8, y + len); g.lineTo(x + w2 * 0.2, y + len); g.closePath(); g.fill();
      };
      for (const o of f.ops) {
        if (!o.rect) continue;
        const a = Math.min(U(o.u0), U(o.u1)), e = Math.max(U(o.u0), U(o.u1));
        if (o.win) {
          g.strokeStyle = 'rgba(255,252,240,.8)'; g.lineWidth = 14; g.strokeRect(a - 7, Y(o.y1) - 7, e - a + 14, Y(o.y0) - Y(o.y1) + 14);
          const n = 3 + ((r() * 4) | 0);
          for (let i = 0; i < n; i++) streak(a + r() * (e - a), Y(o.y0) + 8, 8 + r() * 26, 60 + r() * 150, 0.2 + r() * 0.22);
          g.fillStyle = 'rgba(160,80,50,.28)';
        }
      }
      for (let i = 0; i < 26; i++) streak(r() * W, Y(11.42), 10 + r() * 34, 70 + r() * 240, 0.16 + r() * 0.2);
      for (const y of [8.26, 2.86]) for (let i = 0; i < 9; i++) streak(r() * W, Y(y), 8 + r() * 26, 50 + r() * 130, 0.1 + r() * 0.16);
      // ground grime
      const l = g.createLinearGradient(0, Y(1.0), 0, H);
      l.addColorStop(0, 'rgba(70,100,92,0)'); l.addColorStop(1, 'rgba(70,100,92,.34)'); g.fillStyle = l; g.fillRect(0, Y(1.0), W, H - Y(1.0));
    }, { repeat: false });
  }

  for (const f of FS) {
    const s = new Soup(THREE), o = { u0: f.u0, u1: f.u1, uv: f.uv, back: false };
    const ops = [...f.ops.filter((p) => p.rect), ...(f.skinOps || [])];
    strips(s, f, { ...o, sky: f.sky2, breaks: f.skinPts, ops, base: -0.1, w0: 0.002, w1: 0.028 });
    // Pilasters, string courses, cornice: same painted skin so paint wraps over them.
    const nPil = f.name === 'south' ? [-10.98, -8.65, -5.4, -2.85] : f.name === 'east' ? [-10.98, -8.15, -6.2, -3.4] : [-10.98, -8.7, -5.75, -3.1, -0.45];
    for (const u of nPil) strips(s, f, { ...o, u0: u, u1: u + 0.4, sky: f.sky2, breaks: f.skinPts, ops, base: L[0], w0: 0.02, w1: 0.09 });
    const course = (y0, y1, w) => strips(s, f, { ...o, sky: (u) => Math.min(f.sky2(u), y1), breaks: f.skinPts, ops, base: y0, w0: 0.02, w1: w });
    course(5.27, 5.8, 0.075); course(2.86, 3.02, 0.11); course(8.26, 8.42, 0.11); course(10.7, 10.86, 0.08); course(11.42, PAR + 0.02, 0.13); course(11.5, PAR + 0.05, 0.2);
    for (const op of f.ops) {
      if (!op.win || f.sky2((op.u0 + op.u1) / 2) < op.y0 + 0.1) continue;
      strips(s, f, { ...o, u0: op.u0 - 0.1, u1: op.u1 + 0.1, sky: (u) => Math.min(f.sky2(u), op.y0), breaks: f.skinPts, base: op.y0 - 0.1, w0: 0.02, w1: 0.13 });           // sill
      if (f.sky2((op.u0 + op.u1) / 2) > op.y1 + 0.14) strips(s, f, { ...o, u0: op.u0 - 0.07, u1: op.u1 + 0.07, sky: (u) => Math.min(f.sky2(u), op.y1 + 0.12), breaks: f.skinPts, base: op.y1, w0: 0.02, w1: 0.08 }); // hood
    }
    const tex = paintSkin(f), m = new THREE.Mesh(s.geometry(), toon({ map: tex, moss: 0.22 }));
    m.castShadow = false; m.receiveShadow = true; group.add(m);
  }

  // ------------------------------------------------------------------------------------------------ frame: columns, beams, partitions
  const nearTrunk = (x, z, r = 3.1) => Math.hypot(x - TREE.x, z - TREE.z) < r;
  for (const [x, z] of [[-8.6, -7.4], [-8.6, -3.3], [-1.4, -7.4], [-1.4, -3.3], [-5.1, -9.5], [-5.3, -1.2]]) {
    for (let s = 0; s < 4; s++) {
      if (!onSlab(s, x, z, 0.24) || nearTrunk(x, z)) continue;
      const full = onSlab(s + 1, x, z, 0.24), hg = full ? B.floorH - B.slabT : R(0.8, 1.75);
      const g = kit.boxBase(0.42, hg, 0.42, 1, full ? 1 : 3, 1);
      if (!full) kit.chip(g, 0.06, rng);
      b.add(g, 'concrete', { pos: [x, L[s], z], color: '#e4dfd2' });
      if (full) addBox('concrete', 0.56, 0.16, 0.56, [x, L[s + 1] - B.slabT - 0.08, z], [0, 0, 0], '#e4dfd2');
      else for (const [dx, dz] of [[-0.14, -0.14], [0.14, -0.13], [0.13, 0.14], [-0.13, 0.13]]) rebar([x + dx, L[s] + hg - 0.05, z + dz], [dx * 1.5, 1, dz * 1.5], R(0.35, 0.8), R(0, 0.14));
    }
  }
  const beamLine = (lv, along, c, a, e) => {
    let st = null;
    for (let u = a; u <= e + 1e-6; u += 0.2) {
      const [x, z] = along === 'x' ? [u, c] : [c, u], ok = onSlab(lv, x, z, 0.16) && u < e;
      if (ok && st === null) st = u;
      if (!ok && st !== null) {
        const len = u - st, m = (st + u) / 2 - 0.1;
        if (len > 0.5) addBox('concrete', along === 'x' ? len : 0.24, 0.3, along === 'x' ? 0.24 : len, along === 'x' ? [m, L[lv] - B.slabT - 0.15, c] : [c, L[lv] - B.slabT - 0.15, m], [0, 0, 0], '#ded9cc');
        st = null;
      }
    }
  };
  for (let lv = 1; lv <= 4; lv++) {
    beamLine(lv, 'x', -7.4, -10.72, 1.22); beamLine(lv, 'x', -3.3, -10.72, 1.22);
    beamLine(lv, 'z', -8.6, -10.72, 0.22); beamLine(lv, 'z', -1.4, -10.72, 0.22);
  }
  const partSoups = new Soup(THREE);
  const partition = (axis, c, a, e, s, tops) => {
    const f2 = axis === 'x' ? { map: (u, y, w) => [u, y, c + w] } : { map: (u, y, w) => [c + w, y, u] };
    const pts = saw(tops, 0.3, 0.2, rng);
    strips(partSoups, f2, { u0: a, u1: e, sky: polyline(pts), breaks: pts.map((p) => p[0]), base: L[s], w0: -0.075, w1: 0.075 });
  };
  const flr = (s, t) => L[s] + t;
  partition('z', -8.6, -10.72, -8.6, 0, [[-10.72, flr(0, 2.5)], [-9.6, flr(0, 2.45)], [-9.2, flr(0, 1.7)], [-8.6, flr(0, 0.5)]]);
  partition('x', -8.3, 0.0, 1.22, 1, [[0.0, flr(1, 0.6)], [0.5, flr(1, 1.5)], [1.22, flr(1, 2.45)]]);
  partition('z', -8.7, -2.9, -1.1, 1, [[-2.9, flr(1, 2.45)], [-2.3, flr(1, 2.3)], [-1.8, flr(1, 1.4)], [-1.1, flr(1, 0.4)]]);
  partition('x', -3.2, -10.72, -9.1, 2, [[-10.72, flr(2, 2.45)], [-10.1, flr(2, 2.2)], [-9.6, flr(2, 1.1)], [-9.1, flr(2, 0.3)]]);
  partition('x', -8.8, -0.4, 1.22, 2, [[-0.4, flr(2, 0.5)], [0.3, flr(2, 1.2)], [1.22, flr(2, 2.45)]]);
  partition('z', -3.9, -10.72, -9.5, 3, [[-10.72, flr(3, 2.45)], [-10.2, flr(3, 1.9)], [-9.5, flr(3, 0.5)]]);
  b.add(partSoups.geometry(), indoorPlaster, { color: rgb(1.25, 1.2, 1.05) });

  // ------------------------------------------------------------------------------------------------ stair flight, level 1 → 2
  {
    const n = 13, rise = (L[2] - L[1]) / n, tread = 0.277, zTop = -5.45, keep = 10, x0 = 0.3, x1 = 1.2, xm = (x0 + x1) / 2;
    const yAt = (i) => L[2] - i * rise, zAt = (i) => zTop + i * tread;
    for (let i = 0; i < keep; i++) {
      const w = i < keep - 2 ? x1 - x0 : (x1 - x0) * R(0.55, 0.85);
      addBox('concrete', w, rise + 0.03, tread + 0.02, [x1 - w / 2, yAt(i) - (rise + 0.03) / 2, zAt(i) + tread / 2], [0, 0, 0], '#e7e2d6');
      addBox('flat', w - 0.02, 0.018, 0.05, [x1 - w / 2, yAt(i) + 0.01, zAt(i) + tread - 0.03], [0, 0, 0], '#b8b09c'); // worn nosing
    }
    const th = Math.atan2(rise, tread), ln = (keep + 0.4) * Math.hypot(rise, tread);
    const ym = (yAt(0) + yAt(keep)) / 2 - 0.22, zm = (zAt(0) + zAt(keep)) / 2;
    b.add(kit.box(x1 - x0, 0.15, ln), 'concrete', { pos: [xm, ym, zm], rot: [th, 0, 0], color: '#d4cfc2' });
    const tipY = yAt(keep), tipZ = zAt(keep);
    for (let i = 0; i < 6; i++) rebar([x0 + 0.08 + i * 0.15, tipY - 0.12, tipZ], [R(-0.25, 0.25), -0.75, 0.7], R(0.4, 1.05), R(0.05, 0.35));
    // balusters + rail on the open side, one section twisted free
    const rail = [];
    for (let i = 0; i <= keep; i += 2) {
      const y = yAt(i), z = zAt(i) + tread / 2, bent = i >= keep - 2 ? 0.2 : 0;
      b.add(kit.box(0.035, 0.9, 0.035), 'rust', { pos: [x0 + 0.05 - bent * 0.5, y + 0.45, z], rot: [0, 0, bent], color: '#ffffff' });
      rail.push([x0 + 0.05 - bent, y + 0.9 - bent * 0.5, z]);
    }
    b.add(kit.tube(rail, 0.035, 0.03, 4, 14, { capEnds: false }), 'rust', { color: '#f4dccb' });
  }

  // ------------------------------------------------------------------------------------------------ rubble
  const rubbleMat = ctx.surface('concrete', { vertexColors: true, moss: 0.24 });
  const block = (r, squash = 0.7) => kit.chip(kit.box(r * R(1.2, 2), r * squash * R(1.1, 1.7), r * R(1.1, 1.7)), r * 0.42, rng);
  const brickCols = ['#b9674a', '#a9583f', '#c67a57', '#a24e3a', '#d0906c'];
  const brick = (pos, rot, s = 1) => b.add(kit.box(0.27 * s, 0.1 * s, 0.14 * s), 'flat', { pos, rot, color: rng.pick(brickCols) });
  const slabChunk = (w, d, matrix, tint = '#e9f0e4') => {
    const poly = kit.jag([[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2 * R(0.7, 1), d / 2], [-w / 2 * R(0.7, 1), d / 2]], 0.32, 0.2, rng);
    b.add(kit.plate(poly, [], -0.02, 0.2), 'concrete', { matrix, color: '#dcd8cb' });
    b.add(kit.plate(poly.map(([x, z]) => [x * 0.93, z * 0.93]), [], 0.0, 0.04), 'tile', { matrix, color: tint });
    const v = new THREE.Vector3(), q = new THREE.Vector3();
    for (let i = 0; i < 4; i++) {
      const p = poly[(rng() * poly.length) | 0];
      v.set(p[0], -0.1, p[1]).applyMatrix4(matrix);
      q.set(p[0], R(-0.05, 0.1), p[1]).normalize().transformDirection(matrix);
      rebar(v.toArray(), q.toArray(), R(0.3, 0.75), R(0, 0.2));
    }
  };
  const mounds = [[1.85, 1.0, 1.5, 1.85], [-0.6, 1.3, 0.7, 1.7], [2.55, -0.35, 0.7, 1.0], [0.7, 0.05, 1.3, 1.5], [-1.7, 0.95, 0.42, 1.2]];
  const moundH = (x, z) => {
    let h = 0;
    for (const [cx, cz, a, r] of mounds) { const d = Math.hypot(x - cx, z - cz) / r; if (d < 1) h += a * (1 - d * d) * (1 - d * d); }
    return Math.min(h, 1.75) * (0.72 + 0.56 * fbm(x * 1.5 + 4, z * 1.5 + 1)) - 0.04;
  };
  {
    const g = new THREE.PlaneGeometry(7.2, 5.0, 44, 30); g.rotateX(-Math.PI / 2); g.translate(0.5, 0, 0.6);
    const p = g.attributes.position, keep = [], idx = g.index.array;
    for (let i = 0; i < p.count; i++) { const h = moundH(p.getX(i), p.getZ(i)); p.setY(i, h > 0 ? h + 0.1 : -0.06); }
    for (let i = 0; i < idx.length; i += 3) if ([0, 1, 2].some((k) => p.getY(idx[i + k]) > 0)) keep.push(idx[i], idx[i + 1], idx[i + 2]);
    g.setIndex(keep); g.computeVertexNormals();
    b.add(g, rubbleMat, { color: '#d8cfbf' });
    let placed = 0;
    for (let i = 0; i < 3200 && placed < 380; i++) {
      const x = R(-2.7, 3.7), z = R(-1.5, 2.9), h = moundH(x, z);
      if (h < 0.03) continue; placed++;
      const y = h + 0.12, k = rng();
      if (k < 0.5) { const r = R(0.07, 0.24); b.add(block(r), rubbleMat, { pos: [x, y + r * 0.2, z], rot: [R(0, 3), R(0, 3), R(0, 3)], color: rng.pick(['#e6e1d4', '#cfc9bb', '#bdbcb0']) }); }
      else brick([x, y + 0.05, z], [R(-0.6, 0.6), R(0, 3), R(-0.6, 0.6)], R(0.9, 1.25));
    }
    const chunks = [[1.7, 1.15, 2.0, 1.5, 0.5, 0.45, -0.55], [0.6, 0.9, 1.7, 1.2, -0.45, 1.6, 0.4], [2.45, 0.5, 1.4, 1.0, 0.75, 2.5, 0.3], [-0.75, 1.25, 1.5, 1.1, 0.25, -0.5, 0.2], [2.25, 1.7, 1.1, 0.9, -0.2, 0.9, 0.5], [1.0, -0.1, 1.5, 1.0, 0.6, 3.6, -0.5]];
    for (const [x, z, w, d, tx, ry, tz] of chunks) slabChunk(w, d, kit.xf({ pos: [x, moundH(x, z) + 0.22, z], rot: [tx, ry, tz] }));
  }
  // rubble spilled through the east hole and along the terraces
  const hz = (lo, hi) => lo + (hi - lo) * rng();
  for (let i = 0; i < 60; i++) {
    const out = rng() < 0.45, x = out ? hz(1.55, 2.9) : hz(-0.2, 1.2), z = hz(-6.6, -3.5);
    if (rng() < 0.6) brick([x, 0.2 + rng() * 0.12, z], [R(-0.4, 0.4), R(0, 3), R(-0.4, 0.4)]);
    else { const r = R(0.06, 0.16); b.add(block(r), rubbleMat, { pos: [x, 0.2, z], rot: [R(0, 3), R(0, 3), 0], color: '#d8d3c6' }); }
  }
  for (let lv = 1; lv <= 3; lv++) {
    const e = slabEdges[lv].filter((v) => v.broken);
    let done = 0;
    for (let i = 0; i < 400 && done < 46; i++) {
      const v = e[(rng() * e.length) | 0], x = v.p[0] + R(-0.6, 0.6), z = v.p[1] + R(-0.6, 0.6);
      if (!onSlab(lv, x, z, 0.08)) continue; done++;
      if (rng() < 0.5) brick([x, L[lv] + 0.06, z], [R(-0.25, 0.25), R(0, 3), R(-0.25, 0.25)]);
      else { const r = R(0.05, 0.15); b.add(block(r, 0.6), rubbleMat, { pos: [x, L[lv] + 0.04, z], rot: [0, R(0, 3), 0], color: '#dfdace' }); }
    }
  }
  // bare courses of brick along the broken wall tops
  for (const f of [F.south, F.east]) {
    const alongX = Math.abs(f.t[0]) > 0.5;
    for (let u = f.u0 + 0.2; u < f.u1; u += 0.27) {
      const y = f.sky(u); if (y > PAR - 0.2 || rng() < 0.3) continue;
      const n = 1 + ((rng() * 3) | 0);
      for (let i = 0; i < n; i++) {
        const c = u + (i % 2) * 0.13, yy = f.sky(c) - 0.06 - i * 0.115;
        const pos = f.map(c, yy, -WT / 2 + R(-0.03, 0.03)), color = rng.pick(brickCols); // draw first so a skipped brick doesn't reshuffle what follows
        if (f.solid(c, yy)) b.add(kit.box(alongX ? 0.26 : 0.2, 0.105, alongX ? 0.2 : 0.26), 'flat', { pos, color }); // never inside a window opening
      }
    }
  }
  // collapsed brick lip around the east hole: toothed courses standing proud of the core
  {
    const f = F.east, lo = holeE.bot, hi = holeE.top, rows = 20;
    for (let r = 0; r < rows; r++) {
      const y = 0.34 + r * 0.135;
      let a = null, e = null;
      for (let u = holeE.u0; u < holeE.u1; u += 0.04) if (y > lo(u) && y < hi(u)) { if (a === null) a = u; e = u; }
      const row = (u, dir, n) => { for (let i = 0; i < n; i++) { const c = u + dir * (0.15 + i * 0.29 + (r % 2) * 0.14); if (f.sky(c) < y) continue; b.add(kit.box(0.09, 0.115, 0.27), 'flat', { pos: f.map(c, y, 0.03), color: rng.pick(brickCols) }); } };
      if (a === null) { const u = lerp(holeE.u0, holeE.u1, rng()); for (let i = -3; i <= 3; i++) if (rng() < 0.75) row(u + i * 0.29, 1, 1); continue; }
      row(a, -1, 1 + ((rng() * 3) | 0)); row(e, 1, 1 + ((rng() * 3) | 0));
    }
  }
  {
    const f = F.south, lo = holeS.bot, hi = holeS.top;
    for (let r = 0; r < 14; r++) {
      const y = 3.18 + r * 0.135; let a = null, e = null;
      for (let u = holeS.u0; u < holeS.u1; u += 0.04) if (y > lo(u) && y < hi(u)) { if (a === null) a = u; e = u; }
      if (a === null) continue;
      for (const [u, d] of [[a, -1], [e, 1]]) for (let i = 0; i < 1 + ((rng() * 2) | 0); i++) b.add(kit.box(0.27, 0.115, 0.09), 'flat', { pos: f.map(u + d * (0.15 + i * 0.29 + (r % 2) * 0.13), y, 0.03), color: rng.pick(brickCols) });
    }
  }

  // ------------------------------------------------------------------------------------------------ tilted slab pieces hanging by rebar
  // Each piece tears differently and sits in shade tones: pale and all alike, they read as shields and out-shine the rooms behind.
  const hr = ctx.seeded('hanging-slabs'); // private stream: re-cutting these pieces must not re-roll the ivy, bougainvillea and rubble that draw after them
  const HANG_SHAPES = {
    shard: (w, l) => [[-w / 2, 0], [w / 2, 0], [w * 0.34, l * 0.46], [w * 0.1, l * 1.0], [-w * 0.2, l * 0.56]],
    tooth: (w, l) => [[-w / 2, 0], [w / 2, 0], [w * 0.16, l * 0.36], [-w * 0.14, l * 1.0], [-w * 0.44, l * 0.62]],
    torn: (w, l) => [[-w / 2, 0], [w / 2, 0], [w * 0.58, l * 0.5], [w * 0.22, l * 0.62], [w * 0.08, l * 0.34], [-w * 0.18, l * 0.42], [-w * 0.56, l * 0.74]],
    corner: (w, l) => [[-w / 2, 0], [w / 2, 0], [w * 0.54, l * 0.4], [w * 0.04, l * 0.44], [-w * 0.04, l * 1.0], [-w * 0.42, l * 0.92]],
    stub: (w, l) => [[-w / 2, 0], [w / 2, 0], [w * 0.62, l * 0.34], [w * 0.14, l * 0.5], [-w * 0.3, l * 0.4], [-w * 0.6, l * 0.52]],
  };
  const hang = (lv, a, c, len, tilt, roll, shape, tone, gap = 0.18) => {
    const y = L[lv], dx = c[0] - a[0], dz = c[1] - a[1], ln = Math.hypot(dx, dz), mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
    let ox = dz / ln, oz = -dx / ln;
    if (onSlab(lv, mx + ox * 0.5, mz + oz * 0.5)) { ox = -ox; oz = -oz; }
    const phi = Math.atan2(ox, oz), matrix = kit.xf({ pos: [mx + ox * gap, y - 0.1, mz + oz * gap], rot: [tilt, phi, roll] });
    const w = ln, poly = kit.jag(HANG_SHAPES[shape](w, len), 0.3, 0.16, hr);
    b.add(kit.plate(poly, [], -0.03, B.slabT - 0.05), 'concrete', { matrix, color: tone });
    b.add(kit.plate(poly.map(([x, z]) => [x * 0.94, z * 0.94 + 0.02]), [], 0, 0.035), 'tile', { matrix, color: new THREE.Color(tileTint[Math.min(lv, 3)]).multiplyScalar(0.46) });
    const v = new THREE.Vector3();
    for (let i = 0; i < 6; i++) {
      const t = (i + 0.5) / 6 - 0.5, sx = mx + (dx / ln) * t * w * 0.9, sz = mz + (dz / ln) * t * w * 0.9;
      v.set(t * w * 0.9, -0.1, 0.04).applyMatrix4(matrix);
      b.add(kit.tube([[sx - ox * 0.12, y - 0.13, sz - oz * 0.12], [(sx + v.x) / 2 + ox * 0.03, (y - 0.13 + v.y) / 2 + 0.05, (sz + v.z) / 2 + oz * 0.03], v.toArray()], 0.034, 0.03, 3, 5, { capEnds: false }), 'rust', { color: hr.pick(steelCols) });
    }
    for (const p of poly.slice(3, 9)) {
      v.set(p[0], -0.1, p[1]).applyMatrix4(matrix);
      rebar(v.toArray(), [Math.sin(phi) * 0.5, -0.6, Math.cos(phi) * 0.5], hr.range(0.2, 0.55), 0.04, 0.032, hr);
    }
  };
  hang(3, [-1.6, -4.6], [-1.0, -5.9], 1.5, 0.46, -0.34, 'shard', '#a6a498');
  hang(3, [-5.0, -0.9], [-6.1, -0.72], 1.05, 1.34, 0.26, 'torn', '#9c9a8f');
  hang(4, [-5.6, -1.6], [-6.5, -0.7], 1.45, 0.62, -0.28, 'tooth', '#aaa79a');
  hang(1, [0.4, -1.0], [0.68, -0.3], 0.95, 1.22, 0.42, 'stub', '#a39f92');
  hang(4, [0.2, -7.7], [-0.8, -7.4], 1.2, 1.1, 0.3, 'corner', '#a09e93');
  hang(2, [-0.7, -3.9], [-1.4, -3.6], 1.15, 0.38, -0.3, 'shard', '#a8a598');
  for (let i = 0; i < 328; i++) rng(); // what this block used to draw from the module stream, so everything after it keeps its layout

  // ------------------------------------------------------------------------------------------------ facade hardware
  const fBox = (f, u, y, w, du, dy, dw, mat, color = '#ffffff', rot = [0, 0, 0]) => {
    const alongX = Math.abs(f.t[0]) > 0.5;
    b.add(kit.box(alongX ? du : dw, dy, alongX ? dw : du), mat, { pos: f.map(u, y, w), rot, color });
  };
  // rusted window frames, some with a broken sash
  const glass = new Soup(THREE);
  const G = (p, q, r2) => { const n = [(p[0] + q[0] + r2[0]) / 3, (p[1] + q[1] + r2[1]) / 3 - 1, (p[2] + q[2] + r2[2]) / 3]; glass.tri(p, q, r2, n, [p[0] * 0.5 + p[2] * 0.5, p[1] * 0.5], [q[0] * 0.5 + q[2] * 0.5, q[1] * 0.5], [r2[0] * 0.5 + r2[2] * 0.5, r2[1] * 0.5]); };
  const shard = (f, ua, ya, du, dy, w, s) => { // triangle fan wedged into a frame corner; du,dy point into the pane
    const c = f.map(ua, ya, w), rim = [];
    for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI * 0.5, r0 = s * (i % 2 ? R(0.22, 0.42) : R(0.62, 1.15)); rim.push(f.map(ua + du * Math.cos(a) * r0 * (i === 6 ? 0 : 1), ya + dy * Math.sin(a) * r0 * (i === 0 ? 0 : 1), w)); }
    for (let i = 0; i < 6; i++) G(c, rim[i], rim[i + 1]);
  };
  for (const f of FS) for (const o of f.ops) {
    if (!o.win) continue;
    const cu = (o.u0 + o.u1) / 2, wd = o.u1 - o.u0, ht = o.y1 - o.y0;
    if (f.sky(o.u0) < o.y1 + 0.1 || f.sky(o.u1) < o.y1 + 0.1 || rng() < 0.28) continue;
    const w = -WT / 2, bar = 0.055;
    fBox(f, cu, o.y1 - bar / 2, w, wd, bar, bar * 1.3, 'rust'); fBox(f, cu, o.y0 + bar / 2, w, wd, bar, bar * 1.3, 'rust');
    fBox(f, o.u0 + bar / 2, (o.y0 + o.y1) / 2, w, bar, ht, bar * 1.3, 'rust'); fBox(f, o.u1 - bar / 2, (o.y0 + o.y1) / 2, w, bar, ht, bar * 1.3, 'rust');
    if (ht > 1.2) fBox(f, cu, (o.y0 + o.y1) / 2 + R(-0.2, 0.3), w, bar * 0.8, ht - 0.05, bar, 'rust', '#f0d0be', [0, 0, 0]);
    if (rng() < 0.7) shard(f, o.u0 + bar, o.y0 + bar, 1, 1, w, R(0.4, 0.7));
    if (rng() < 0.55) shard(f, o.u1 - bar, o.y1 - bar, -1, -1, w, R(0.3, 0.6));
  }
  // burglar-bar cages (very much part of an old Asian street)
  const cage = (f, op, depth = 0.3) => {
    const cu = (op.u0 + op.u1) / 2, wd = op.u1 - op.u0 + 0.2, y0 = op.y0 - 0.06, y1 = op.y1 + 0.06, n = 7;
    for (const y of [y0, (y0 + y1) / 2, y1]) { fBox(f, cu, y, depth, wd, 0.04, 0.04, 'rust'); fBox(f, cu - wd / 2, y, depth / 2, 0.04, 0.04, depth, 'rust'); fBox(f, cu + wd / 2, y, depth / 2, 0.04, 0.04, depth, 'rust'); }
    for (let i = 0; i <= n; i++) fBox(f, cu - wd / 2 + (i / n) * wd, (y0 + y1) / 2, depth, 0.028, y1 - y0, 0.028, 'rust', '#f0d0be', i === 3 ? [0, 0, 0.09] : [0, 0, 0]);
  };
  cage(F.south, F.south.ops[2]); cage(F.south, F.south.ops[8]); cage(F.east, F.east.ops[1]); cage(F.north, F.north.ops[9]); cage(F.west, F.west.ops[7]);
  // air-conditioner boxes on rusty brackets
  const acUnit = (f, u, y) => {
    fBox(f, u, y, 0.2, 0.74, 0.5, 0.3, 'flat', '#c9cec6');
    fBox(f, u, y + 0.27, 0.2, 0.78, 0.04, 0.34, 'rust');
    b.add(kit.cyl(0.19, 0.19, 0.03, 12), 'flat', { pos: f.map(u - 0.12, y, 0.36), rot: Math.abs(f.n[2]) > 0.5 ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2], color: '#7d8b90' });
    fBox(f, u + 0.27, y, 0.35, 0.12, 0.34, 0.012, 'flat', '#8b8f8a');
    for (const s of [-0.28, 0.28]) { fBox(f, u + s, y - 0.28, 0.2, 0.04, 0.04, 0.38, 'rust'); fBox(f, u + s, y - 0.17, 0.06, 0.04, 0.26, 0.04, 'rust'); }
  };
   acUnit(F.south, -9.7, 9.0 - 0.75); acUnit(F.east, -8.3, 8.75); acUnit(F.north, -5.9, 7.4); acUnit(F.west, -7.2, 4.1);
  // downpipe with brackets, torn off below storey two
  const pipeS = [[-10.72, 11.45, 0.62], [-10.72, 8.0, 0.62], [-10.72, 4.9, 0.62], [-10.55, 4.2, 0.74]];
  b.add(kit.tube(pipeS, 0.07, 0.07, 6, 12), 'rust', { color: '#e8cdb8' });
  for (const y of [10.6, 8.6, 6.6, 5.0]) addBox('rust', 0.2, 0.05, 0.16, [-10.72, y, 0.57]);
  // balcony on the second floor (south-west) with a rusty rail
  {
    const x0 = -10.72, x1 = -8.76, z1 = 1.28, y = L[2];
    b.add(kit.plate(kit.jag([[x0, B.z[1]], [x0, z1], [x1, z1], [x1, B.z[1]]], 0.5, 0.08, rng), [], y + 0.02, 0.2), 'concrete', { color: '#dfdace' });
    addBox('concrete', x1 - x0 + 0.1, 0.05, z1 - B.z[1] + 0.06, [(x0 + x1) / 2, y - 0.2, (B.z[1] + z1) / 2 + 0.02], [0, 0, 0], '#c9c8bd');
    for (let i = 0; i <= 12; i++) { const x = lerp(x0 + 0.04, x1 - 0.04, i / 12); if (i === 8) continue; addBox('rust', 0.03, 0.86, 0.03, [x, y + 0.45, z1 - 0.05], [i === 9 ? 0.26 : 0, 0, i === 7 ? -0.12 : 0]); }
    for (let i = 1; i < 6; i++) addBox('rust', 0.03, 0.86, 0.03, [x0 + 0.04, y + 0.45, lerp(B.z[1], z1 - 0.05, i / 6)]);
    addBox('rust', x1 - x0, 0.05, 0.05, [(x0 + x1) / 2, y + 0.88, z1 - 0.05]);
    addBox('rust', 0.05, 0.05, z1 - B.z[1], [x0 + 0.04, y + 0.88, (B.z[1] + z1) / 2]);
  }
  // roof: rusted water tank on legs, bent antenna, remnant handrail
  {
    const x = -9.6, z = -9.6, y = L[4];
    for (const [dx, dz] of [[-0.55, -0.55], [0.55, -0.55], [0.55, 0.55], [-0.55, 0.55]]) addBox('rust', 0.07, 1.2, 0.07, [x + dx, y + 0.6, z + dz], [dx * 0.07, 0, dz * 0.07]);
    b.add(kit.cylBase(0.82, 0.82, 1.15, 20), 'rust', { pos: [x, y + 1.2, z], color: '#f3e0cf' });
    b.add(kit.cylBase(0.03, 0.86, 0.22, 20), 'rust', { pos: [x, y + 2.35, z], color: '#e8c8b4' });
    for (const k of [0.3, 0.8]) b.add(kit.torus(0.83, 0.025, 4, 22), 'rust', { pos: [x, y + 1.2 + k, z], rot: [Math.PI / 2, 0, 0], color: '#d0a890' });
    b.add(kit.tube([[-2.4, y, -10.3], [-2.4, y + 1.6, -10.3], [-2.5, y + 2.7, -10.2], [-2.9, y + 3.0, -10.0]], 0.035, 0.018, 4, 10), 'rust');
    for (const k of [1.6, 2.1]) addBox('rust', 0.9, 0.025, 0.025, [-2.4, y + k, -10.3], [0, 0.5, 0.1]);
  }

  // ------------------------------------------------------------------------------------------------ shopfront: mullions, shards, fascia
  {
    const f = F.south, [x0, x1] = B.shopWindow.x, [y0, y1] = B.shopWindow.y, bays = 7, zc = B.z[1] - 0.12, bw = (x1 - x0) / bays, trans = 2.02;
    addBox('rust', x1 - x0, 0.08, 0.12, [(x0 + x1) / 2, y1 - 0.04, zc]);
    b.add(kit.box(x1 - x0, 0.09, 0.13), 'rust', { pos: [(x0 + x1) / 2, y0 + 0.05, zc] });
    for (let i = 0; i <= bays; i++) {
      const x = x0 + i * bw;
      if (i === 4) { // this mullion is torn out and bent into the shop
        b.add(kit.tube([[x, y1, zc], [x + 0.05, 1.9, zc - 0.05], [x + 0.26, 1.2, zc - 0.5], [x + 0.2, 0.62, zc - 0.95]], 0.05, 0.04, 4, 10), 'rust');
        b.add(kit.box(0.08, 0.5, 0.1), 'rust', { pos: [x, 0.7, zc] });
        continue;
      }
      if (i === 2) { addBox('rust', 0.08, 1.4, 0.1, [x, y0 + 0.75, zc], [0.05, 0, 0.04]); addBox('rust', 0.08, 0.32, 0.1, [x, y1 - 0.2, zc]); continue; }
      addBox('rust', 0.08, y1 - y0, 0.1, [x, (y0 + y1) / 2, zc], [0, 0, i === 5 ? 0.012 : 0]);
    }
    for (let i = 0; i < bays; i++) if (i !== 3) { const a = x0 + i * bw, l = bw * (i === 1 ? 0.55 : 1); addBox('rust', l, 0.06, 0.09, [a + l / 2, trans, zc], [0, 0, i === 1 ? -0.05 : 0], '#f4dccb'); }
    const gl = (i, u, y, du, dy, s) => shard(f, x0 + (i + u) * bw + du * 0.04, y + dy * 0.04, du, dy, -0.12, s);
    [[0, 0, y0, 1, 1, 0.9], [0, 0, trans, 1, -1, 0.7], [0, 1, trans, -1, -1, 0.55], [1, 1, y0, -1, 1, 0.75], [2, 0, y1, 1, -1, 0.8], [2, 1, y1, -1, -1, 0.6], [2, 1, trans, -1, -1, 0.45], [3, 0, y0, 1, 1, 0.7], [4, 1, y0, -1, 1, 1.0], [4, 0, trans, 1, -1, 0.5], [5, 0, y1, 1, -1, 0.5], [5, 1, y0, -1, 1, 0.65], [6, 0, y0, 1, 1, 0.95], [6, 1, trans, -1, -1, 0.85], [6, 0, y1, 1, -1, 0.4], [1, 0, y1, 1, -1, 0.42], [3, 1, y1, -1, -1, 0.42]].forEach((a) => gl(...a));
    for (let i = 0; i < 44; i++) { // fragments glittering on the pavement and the sill
      const x = R(x0, x1), z = R(0.6, 1.9), s = R(0.06, 0.18), y = 0.135 + rng() * 0.02, a = R(0, 6.28);
      G([x, y, z], [x + Math.cos(a) * s, y, z + Math.sin(a) * s], [x + Math.cos(a + 1.6) * s, y + 0.01, z + Math.sin(a + 1.6) * s]);
    }
  }
  const glassTex = ctx.canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(190,240,232,1)'; g.lineWidth = 16;
    for (let i = -2; i < 4; i++) { g.beginPath(); g.moveTo(i * 44, 0); g.lineTo(i * 44 + 64, h); g.stroke(); }
  });
  const glassMesh = new THREE.Mesh(glass.geometry(), toon({ color: '#d6fff4', map: glassTex, transparent: true, opacity: 0.36, side: THREE.DoubleSide, depthWrite: false, dapple: false, emissive: '#6fc9c0', emissiveIntensity: 0.25 }));
  glassMesh.castShadow = false; glassMesh.receiveShadow = false; glassMesh.renderOrder = 2; ctx.noOutline(glassMesh); group.add(glassMesh);

  const signTex = ctx.canvasTexture(1024, 512, (g, W, H) => {
    const r = ctx.seeded('sign');
    // fascia, top 1024×200
    const panel = (x, y, w, h, bg) => { g.fillStyle = bg; g.fillRect(x, y, w, h); };
    panel(0, 0, 1024, 200, '#3f8f8b');
    g.fillStyle = '#f4e8c6'; g.fillRect(0, 12, 1024, 10); g.fillRect(0, 178, 1024, 10);
    eroded(g, W, H, (c) => {
      c.fillStyle = '#fbf2d4'; c.font = `900 118px ${JP}`; c.textBaseline = 'middle'; c.fillText('青 葉 ス ト ア', 60, 96);
      c.font = `700 30px ${JP}`; c.fillStyle = '#ffd77a'; c.fillText('生鮮・日用品  朝7時から', 690, 148);
      c.fillText('TEL 04-55-0192', 734, 44);
    }, r, 0.95, 90);
    for (let i = 0; i < 30; i++) { const x = r() * W, l = 30 + r() * 120; const gr = g.createLinearGradient(0, 8, 0, 8 + l); gr.addColorStop(0, 'rgba(125,58,42,.7)'); gr.addColorStop(1, 'rgba(125,58,42,0)'); g.fillStyle = gr; g.fillRect(x, 8, 6 + r() * 16, l); }
    // vertical sign, bottom-left 170×300
    panel(0, 212, 170, 300, '#f0e6cc'); g.strokeStyle = '#c8705e'; g.lineWidth = 8; g.strokeRect(10, 222, 150, 280);
    eroded(g, W, H, (c) => {
      c.fillStyle = '#b5473a'; c.font = `900 72px ${JM}`; c.textAlign = 'center'; c.textBaseline = 'top';
      ['喫', '茶', '森', '宿'].forEach((ch, i) => c.fillText(ch, 85, 228 + i * 68));
      c.textAlign = 'left';
    }, r, 0.92, 70);
    panel(190, 212, 834, 300, '#7d8b90');
  }, { repeat: false });
  {
    const m = toon({ map: signTex, color: '#ffffff' }), s = new Soup(THREE);
    const quad = (a, c, d, e, uv0, uv1) => s.quad(a, c, d, e, [(a[0] + d[0]) / 2 - 0.0, (a[1] + d[1]) / 2, -50], [uv0[0], uv1[1]], [uv1[0], uv1[1]], [uv1[0], uv0[1]], [uv0[0], uv0[1]]);
    const v0 = 1 - 200 / 512, xa = -8.75, xb = -2.1, ya = 2.66, yb = 3.42, z = B.z[1] + 0.14, tilt = 0.032;
    const dyB = (xb - xa) * Math.sin(tilt) * -1, top = (x) => (x - xa) * Math.sin(-tilt);
    quad([xa, ya, z], [xb, ya + dyB, z], [xb, yb + dyB, z], [xa, yb, z], [0, 1], [1, v0]);
    addBox('rust', xb - xa + 0.12, 0.06, 0.14, [(xa + xb) / 2, ya - 0.02 + dyB / 2, z - 0.06], [0, 0, -tilt]);
    addBox('rust', xb - xa + 0.12, 0.06, 0.14, [(xa + xb) / 2, yb + 0.02 + dyB / 2, z - 0.06], [0, 0, -tilt]);
    addBox('rust', 0.06, yb - ya, 0.14, [xa - 0.03, (ya + yb) / 2, z - 0.06]);
    addBox('rust', 0.06, yb - ya, 0.14, [xb + 0.03, (ya + yb) / 2 + dyB, z - 0.06]);
    b.add(kit.box(xb - xa, yb - ya - 0.02, 0.1), 'flat', { pos: [(xa + xb) / 2, (ya + yb) / 2 + dyB / 2, z - 0.06], rot: [0, 0, -tilt], color: '#2f6f6c' });
    // hanging bolt where the right end let go
    b.add(kit.tube([[xb - 0.2, 3.1, B.z[1]], [xb - 0.1, 2.9, B.z[1] + 0.08], [xb, yb + dyB, z - 0.04]], 0.02, 0.02, 3, 4, { capEnds: false }), 'rust');
    // projecting vertical shop sign, facing ±x
    const sx = -8.36, sy0 = 5.95, sy1 = 8.05, sz0 = B.z[1] + 0.2, sz1 = sz0 + 0.62, u1 = 170 / 1024, v1 = 1 - 212 / 512, v2 = 0;
    const t1 = [sx + 0.05, sy0, sz1], t2 = [sx + 0.05, sy0, sz0], t3 = [sx + 0.05, sy1, sz0], t4 = [sx + 0.05, sy1, sz1];
    s.quad(t1, t2, t3, t4, [sx - 3, 7, sz0], [0, v2], [u1, v2], [u1, v1], [0, v1]);
    const q1 = [sx - 0.05, sy0, sz0], q2 = [sx - 0.05, sy0, sz1], q3 = [sx - 0.05, sy1, sz1], q4 = [sx - 0.05, sy1, sz0];
    s.quad(q1, q2, q3, q4, [sx + 3, 7, sz0], [0, v2], [u1, v2], [u1, v1], [0, v1]);
    addBox('flat', 0.09, sy1 - sy0, sz1 - sz0, [sx, (sy0 + sy1) / 2, (sz0 + sz1) / 2], [0, 0, 0], '#c7bda6');
    for (const y of [sy0 + 0.25, sy1 - 0.25]) addBox('rust', 0.05, 0.05, 0.3, [sx, y, B.z[1] + 0.12]);
    addBox('rust', 0.13, 0.05, sz1 - sz0 + 0.1, [sx, sy1 + 0.02, (sz0 + sz1) / 2]); addBox('rust', 0.13, 0.05, sz1 - sz0 + 0.1, [sx, sy0 - 0.02, (sz0 + sz1) / 2]);
    const sg = new THREE.Mesh(s.geometry(), m); sg.castShadow = false; sg.receiveShadow = true; group.add(sg);
  }
  // awning frame: arms from the wall to a front rail, the east half stripped to bare steel
  {
    const yA = 2.54, zA = B.z[1] + 0.04, yF = 2.08, zF = 1.46, x0 = -8.9, x1 = -1.4, n = 7;
    for (let i = 0; i <= n; i++) {
      const x = lerp(x0, x1, i / n), bend = i === n ? 0.3 : i === n - 1 ? 0.12 : 0;
      b.add(kit.tube([[x, yA, zA], [x, (yA + yF) / 2 + 0.04, (zA + zF) / 2], [x + bend * 0.5, yF - bend, zF - bend * 0.4]], 0.028, 0.026, 4, 5, { capEnds: false }), 'rust', { color: '#f0d0be' });
    }
    b.add(kit.tube([[x0 - 0.04, yF, zF], [-5.6, yF - 0.02, zF], [-3.2, yF, zF], [-2.2, yF - 0.14, zF - 0.1], [x1 + 0.05, yF - 0.32, zF - 0.14]], 0.035, 0.03, 4, 16, { capEnds: true }), 'rust', { color: '#e8c0a8' });
  }

  // ------------------------------------------------------------------------------------------------ build static batch
  group.add(b.build());

  // ------------------------------------------------------------------------------------------------ cloth (CPU flutter)
  const clothTex = ctx.canvasTexture(512, 512, (g, W, H) => {
    const c = W / 2, r = ctx.seeded('cloth');
    g.fillStyle = '#efe7d3'; g.fillRect(0, 0, c, c); // cream, faint sprigs
    g.fillStyle = 'rgba(180,120,110,.5)'; for (let i = 0; i < 70; i++) { g.beginPath(); g.ellipse(r() * c, r() * c, 5, 3, r() * 3, 0, 6.3); g.fill(); }
    g.fillStyle = '#9dc4c6'; g.fillRect(c, 0, c, c); // faded blue check
    g.strokeStyle = 'rgba(240,245,235,.6)'; g.lineWidth = 7; for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(c + i * 30, 0); g.lineTo(c + i * 30, c); g.moveTo(c, i * 30); g.lineTo(W, i * 30); g.stroke(); }
    g.fillStyle = '#e5b6a2'; g.fillRect(0, c, c, c); // salmon stripes
    g.fillStyle = 'rgba(255,240,225,.55)'; for (let i = 0; i < 8; i++) g.fillRect(i * 32 + 6, c, 12, c);
    for (let i = 0; i < 11; i++) { g.fillStyle = i % 2 ? '#efe4cb' : '#c9604c'; g.fillRect(c + (i * c) / 11, c, c / 11 + 1, c); } // awning stripes
    g.fillStyle = 'rgba(90,70,50,.14)'; for (let i = 0; i < 26; i++) g.fillRect(r() * W, r() * H, 6 + r() * 30, 40 + r() * 120);
  }, { repeat: false });
  const CELL = { cream: [0.01, 0.51, 0.49, 0.99], blue: [0.51, 0.51, 0.99, 0.99], salmon: [0.01, 0.01, 0.49, 0.49], awning: [0.51, 0.01, 0.99, 0.49] };
  class Cloth {
    constructor() { this.pos = []; this.rest = []; this.dir = []; this.tan = []; this.w = []; this.ph = []; this.uv = []; this.idx = []; }
    add({ nx, ny, P: at, n, t, amp, phase = rng() * 6.28, speed = 1.7, cell = CELL.cream, keep = null }) {
      const o = this.rest.length / 3, s0 = nx + 1;
      for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
        const s = i / nx, v = j / ny, p = at(s, v), nn = typeof n === 'function' ? n(s, v) : n;
        this.rest.push(...p); this.dir.push(...nn); this.tan.push(...t); this.w.push(amp(s, v), s, v, speed); this.ph.push(phase);
        this.uv.push(lerp(cell[0], cell[2], s), lerp(cell[3], cell[1], v));
      }
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        if (keep && !keep(i, j)) continue;
        const a = o + j * s0 + i, c = a + 1, d = a + s0, e = d + 1; this.idx.push(a, d, c, c, d, e);
      }
    }
    mesh(mat) {
      const g = new THREE.BufferGeometry();
      this.arr = new Float32Array(this.rest); this.R = new Float32Array(this.rest);
      g.setAttribute('position', new THREE.BufferAttribute(this.arr, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
      g.setIndex(this.idx); g.computeVertexNormals();
      this.g = g; const m = new THREE.Mesh(g, mat); m.castShadow = false; m.receiveShadow = true; m.frustumCulled = false; return m;
    }
    update(t, gust) {
      const { arr, R: re, dir, tan, w, ph } = this, n = re.length / 3;
      for (let i = 0; i < n; i++) {
        const k = i * 3, q = i * 4, a = w[q], s = w[q + 1], v = w[q + 2], sp = w[q + 3], p = ph[i];
        const d = a * (Math.sin(t * sp + s * 3.2 + v * 4.1 + p) * 0.6 + Math.sin(t * sp * 1.93 + v * 7.3 + s * 5 + p * 2) * 0.28 + gust * 0.45 + 0.2);
        const e = a * 0.45 * Math.sin(t * sp * 0.8 + v * 3 + p);
        arr[k] = re[k] + dir[k] * d + tan[k] * e; arr[k + 1] = re[k + 1] + dir[k + 1] * d + tan[k + 1] * e; arr[k + 2] = re[k + 2] + dir[k + 2] * d + tan[k + 2] * e;
      }
      this.g.attributes.position.needsUpdate = true; this.g.computeVertexNormals();
    }
  }
  const curtains = new Cloth(), awning = new Cloth();
  const curtain = (f, op, frac, side, cell, blow = 0.3, drop = 0.92) => {
    const wd = op.u1 - op.u0, ht = (op.y1 - op.y0) * drop, top = op.y1 - 0.06, ua = side < 0 ? op.u0 + 0.05 : op.u1 - 0.05, w = wd * frac, wz = -0.15;
    const seed = rng() * 10, len = (s) => 0.62 + 0.38 * Math.abs(Math.sin(s * 5.1 + seed)) * (0.7 + 0.3 * Math.sin(s * 13 + seed));
    fBox(f, (op.u0 + op.u1) / 2, top + 0.02, wz, wd, 0.03, 0.03, 'rust');
    curtains.add({
      nx: 6, ny: 8, n: f.n, t: f.t, cell, amp: (s, v) => 0.2 * v * v + 0.012, speed: rng.range(1.3, 2.1),
      P: (s, v) => {
        const fold = Math.sin(s * 14 + seed) * 0.05 * (1 - v * 0.5), gather = 1 - 0.32 * v, u = ua - side * s * w * gather;
        return f.map(u, top - v * ht * len(s), wz + fold + blow * v * v);
      },
      keep: (i, j) => !(j >= 5 && hash2(i + seed, j) < 0.3),
    });
  };
  const so = F.south.ops, eo = F.east.ops, no = F.north.ops, wo = F.west.ops;
  curtain(F.south, so[2], 0.62, -1, CELL.salmon, 0.42); curtain(F.south, so[3], 0.35, 1, CELL.cream, 0.5); curtain(F.south, so[6], 0.55, 1, CELL.blue, 0.5);
  curtain(F.south, so[7], 0.6, -1, CELL.cream, 0.36, 0.78); curtain(F.south, so[5], 0.5, -1, CELL.cream, 0.0, 0.8);
  curtain(F.east, eo[2], 0.64, 1, CELL.blue, 0.46); curtain(F.east, eo[3], 0.7, -1, CELL.salmon, 0.42); curtain(F.east, eo[4], 0.52, 1, CELL.cream, 0.5); curtain(F.east, eo[5], 0.9, -1, CELL.cream, 0.34);
  curtain(F.north, no[5], 0.6, 1, CELL.cream, 0.4); curtain(F.north, no[11], 0.7, -1, CELL.blue, 0.44); curtain(F.west, wo[5], 0.66, -1, CELL.salmon, 0.42); curtain(F.west, wo[10], 0.6, 1, CELL.cream, 0.4);
  const rag = (p, n, t, w, h, cell, sw = 0.28) => {
    const seed = rng() * 9;
    curtains.add({ nx: 3, ny: 6, n, t, cell, speed: rng.range(1.5, 2.4), amp: (s, v) => sw * v * v + 0.015,
      P: (s, v) => { const taper = 1 - 0.75 * v, x = (s - 0.5) * w * taper; return [p[0] + t[0] * x + n[0] * v * 0.08, p[1] - v * h * (0.72 + 0.28 * Math.sin(s * 7 + seed) ** 2), p[2] + t[2] * x + n[2] * v * 0.08]; },
      keep: (i, j) => !(j >= 3 && hash2(i + seed, j) < 0.3) });
  };
  rag([-1.1, 2.0, 1.3], [0.2, 0, 1], [1, 0, 0], 0.55, 1.0, CELL.awning, 0.2);
  rag([-2.2, 2.0, 1.42], [0, 0, 1], [1, 0, 0], 0.5, 0.8, CELL.awning, 0.2);
  rag([-3.1, 2.07, 1.45], [0, 0, 1], [1, 0, 0], 0.46, 0.66, CELL.awning, 0.2);
  rag([0.72, 2.7, -0.75], [1, 0, 0.3], [0, 0, 1], 0.5, 1.0, CELL.salmon);
  rag([-2.75, 5.2, -1.6], [1, 0, 0], [0, 0, 1], 0.42, 0.9, CELL.blue);
  rag([-5.6, 7.4, -0.15], [0, 0, 1], [1, 0, 0], 0.5, 1.05, CELL.cream);
  rag([-0.7, 7.9, -5.7], [1, 0, 0.5], [0, 0, 1], 0.44, 0.9, CELL.salmon);
  rag([-10.0, 6.45, 1.25], [0, 0, 1], [1, 0, 0], 0.5, 0.74, CELL.blue, 0.16);
  rag([0.32, 3.9, -3.5], [1, 0, 0], [0, 0, 1], 0.4, 0.7, CELL.cream);
  const clothM = toon({ map: clothTex, side: THREE.DoubleSide, transparent: true, opacity: 0.88, translucent: 1.3, dapple: true });
  const clothMesh = curtains.mesh(clothM); ctx.noOutline(clothMesh); clothMesh.renderOrder = 1; group.add(clothMesh);
  { // Awning: an opaque sheet, torn on a diagonal so the east half shows bare frame.
    const yA = 2.54, zA = B.z[1] + 0.05, yF = 2.08, zF = 1.46, x0 = -8.9, x1 = -3.55, seed = 3.1;
    const reach = (s) => clamp(1.12 - 0.7 * Math.pow(s, 3) + 0.12 * Math.sin(s * 19 + seed) + 0.08 * Math.sin(s * 47), 0.3, 1.14);
    awning.add({ nx: 36, ny: 6, n: [0, 0.75, 0.66], t: [1, 0, 0], cell: CELL.awning, speed: 1.2, amp: (s, v) => 0.05 * v * Math.max(0.2, s),
      P: (s, v) => {
        const r = reach(s) * v, sag = Math.sin(Math.PI * ((s * 7) % 1)) * 0.035 * Math.min(1, r);
        const lip = Math.max(0, r - 1); // past the rail the cloth falls as a valance
        const k = Math.min(r, 1);
        return [lerp(x0, x1, s), lerp(yA, yF, k) - sag - lip * 2.4, lerp(zA, zF, k) + lip * 0.05];
      } });
    const m = awning.mesh(toon({ map: clothTex, side: THREE.DoubleSide, translucent: 0.9 }));
    group.add(m);
  }

  // ------------------------------------------------------------------------------------------------ Boston ivy
  const SUN = new THREE.Vector3(...layout.SUN_DIR);
  // Light each leaf with a smooth per-instance clump normal (banyan's technique), so the cel terminator draws broad masses instead of confetti.
  const shellMat = (opts) => {
    const m = toon(opts), base = m.onBeforeCompile, key = m.customProgramCacheKey();
    m.onBeforeCompile = (s, r) => {
      base(s, r);
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aShell;')
        .replace('#include <normal_vertex>', 'transformedNormal=normalize(mat3(viewMatrix)*aShell);\n#include <normal_vertex>')
        .replace('vWNorm=normalize(mat3(modelMatrix)*wn_);', 'vWNorm=aShell;');
      s.fragmentShader = s.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
    };
    m.customProgramCacheKey = () => key + '|shell';
    return m;
  };
  const leafTop = new THREE.BufferGeometry();
  {
    const pts = [[0, 0, 0], [-0.5, 0.06, 0.58], [-0.15, 0, 0.62], [0, 0.05, 1], [0.15, 0, 0.62], [0.5, 0.06, 0.58]], c = [0, -0.05, 0.5], p = [];
    pts.forEach((a, i) => { const e = pts[(i + 1) % pts.length]; p.push(...c, ...e, ...a); });
    leafTop.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    leafTop.computeVertexNormals();
  }
  const ivyStatic = [], ivyMoving = [];
  const mkLeaf = (pos, n, tip, size, color, sway, shell, axis = n) => {
    const Y = new THREE.Vector3(...n).normalize(), Z = new THREE.Vector3(...tip), X = new THREE.Vector3();
    Z.addScaledVector(Y, -Z.dot(Y)).normalize(); X.crossVectors(Y, Z).normalize();
    const e = { m: [X.x * size, X.y * size, X.z * size, 0, Y.x * size, Y.y * size, Y.z * size, 0, Z.x * size, Z.y * size, Z.z * size, 0, pos[0], pos[1], pos[2], 1], color, sway, axis, shell, ph: rng() * 6.28 };
    (sway > 0 ? ivyMoving : ivyStatic).push(e);
  };
  const pal = { under: new THREE.Color(P.leafShade).lerp(new THREE.Color(P.leafDeep), 0.3), deep: new THREE.Color(P.leafDeep), mid: new THREE.Color(P.ivy), lit: new THREE.Color(P.ivyLit), gold: new THREE.Color(P.leafGold), red: new THREE.Color(P.ivyRed), shade: new THREE.Color(P.leafShade) };
  // `lit` (about -0.5..0.5) is how much this leaf faces the sun on its cushion: tone follows the form, so crests read light and sheet edges sink into the wall.
  const ivyColor = (u, y, lit, s0, shadeGain) => {
    const tone = fbm(u * 0.55 + s0, y * 0.55 + 2.1) * 0.45 + 0.3 + lit * 0.6 + rng() * 0.08 - 0.04;
    const red = fbm(u * 0.33 + s0 * 2, y * 0.33 + 9) > 0.65 && rng() < 0.42;
    const c = (red ? pal.red : rng() < 0.04 && tone > 0.56 ? pal.gold : tone > 0.56 ? pal.lit : tone > 0.43 ? pal.mid : tone > 0.34 ? pal.deep : pal.shade).clone();
    return c.multiplyScalar(shadeGain * (0.94 + rng() * 0.12) * (red ? 0.86 + lit * 0.5 : 1));
  };
  const litOf = (s, depth = 0) => (s[0] * SUN.x + s[1] * SUN.y + s[2] * SUN.z) / Math.hypot(...s) * 0.5 + depth;
  const ivyUnder = [];
  const ivySheet = (f, blobs, gain, cell = 0.14, big = 1) => {
    const s0 = f.u0 * 0.3 + f.n[0] * 3 + f.n[2] * 7, [nx, , nz] = f.n, [tx, , tz] = f.t;
    const field = (u, y) => { let v = -1; for (const [cu, cy, ru, ry] of blobs) v = Math.max(v, 1 - Math.hypot((u - cu) / ru, (y - cy) / ry)); return v + (fbm(u * 0.85 + s0, y * 0.85 + 5) - 0.5) * 1.2; };
    // Cushion height over the wall: a domed sheet carrying broad lumps. Its slope tilts the shell, which is what gives the sheet volume.
    const flat = litOf([nx * 0.6, 0.3, nz * 0.6]);
    const height = (u, y) => { const d = clamp(field(u, y) / 0.6, 0, 1); return d * (2 - d) * (0.72 + 0.56 * vnoise(u * 0.8 + s0, y * 0.8 + 3)); };
    for (let u = f.u0; u < f.u1; u += cell) for (let y = 0.05; y < 12; y += cell) {
      const ju = u + (rng() - 0.5) * cell * 1.1, jy = y + (rng() - 0.5) * cell * 1.1, v = field(ju, jy);
      if (v <= 0 || !f.solid(ju, jy, 0.03) || (v < 0.13 && rng() > v / 0.13)) continue;
      const e = 0.2, H = height(ju, jy) * (f.solid(ju, jy, 0.2) ? 1 : 0.5), K = 1.3;
      const su = -K * (height(ju + e, jy) - height(ju - e, jy)) / (2 * e), sy = 0.3 - K * (height(ju, jy + e) - height(ju, jy - e)) / (2 * e);
      const shell = [nx * 0.6 + tx * su, sy, nz * 0.6 + tz * su]; // the wall normal is damped so slopes swing the shell across the terminator on all four walls
      const pos = f.map(ju, jy, 0.04 + 0.3 * H);
      const n = [nx * 0.82 + (rng() - 0.5) * 0.5 + f.t[0] * (rng() - 0.5) * 0.6, 0.5 + rng() * 0.25, nz * 0.82 + (rng() - 0.5) * 0.5 + f.t[2] * (rng() - 0.5) * 0.6];
      const tip = [f.t[0] * (rng() - 0.5) * 0.8 + nx * 0.2, -1, f.t[2] * (rng() - 0.5) * 0.8 + nz * 0.2];
      const size = R(0.21, 0.31) * big;
      mkLeaf(pos, n, tip, size, ivyColor(ju, jy, (litOf(shell) - flat) * 1.5 + (H - 0.55) * 0.33, s0, gain), v < 0.2 ? R(0.02, 0.05) : 0, shell);
      // A dark sheet under the leaves, slipped down the wall: gaps show depth rather than bare plaster, and the sheet stops reading as a paper cut-out.
      if (hash2(ju * 7.3, jy * 3.1) < 0.46) ivyUnder.push([f.map(ju + tx * 0.03, jy - 0.14, 0.02 + 0.1 * H), n, tip, size * 1.28, pal.under.clone().multiplyScalar(gain * (0.9 + 0.2 * hash2(jy, ju))), [nx * 0.6 - SUN.x, -0.5, nz * 0.6 - SUN.z]]);
    }
  };
  ivySheet(F.south, [[-10.5, 2.4, 1.3, 4.0], [-10.7, 7.0, 0.9, 3.0], [-8.6, 7.6, 0.75, 2.2], [-6.2, 7.4, 0.8, 0.9], [-5.9, 5.9, 0.55, 1.1], [0.7, 0.9, 1.0, 1.4], [-1.6, 3.15, 1.0, 0.32], [-9.0, 10.4, 1.2, 1.0]], 1.18);
  ivySheet(F.east, [[-10.1, 5.4, 1.5, 6.6], [-8.8, 10.2, 1.4, 1.8], [-0.4, 0.5, 1.2, 0.9], [-7.3, 1.4, 1.0, 1.7], [-8.0, 3.9, 0.75, 1.2]], 1.0);
  ivySheet(F.north, [[-9.6, 2.8, 2.6, 5.0], [-0.4, 6.2, 2.6, 6.4], [-5.2, 10.8, 3.2, 1.2]], 1.15, 0.185, 1.3);
  ivySheet(F.west, [[-10.0, 5.0, 1.7, 5.4], [-2.2, 2.6, 2.9, 3.0], [-5.6, 9.9, 2.4, 1.9]], 1.15, 0.185, 1.3);

  const vb = ctx.batch(), stemC = P.woodDark;
  const climb = (f, u, y0, y1, wob, r = 0.04) => {
    const pts = [], n = Math.round((y1 - y0) / 0.7);
    for (let i = 0; i <= n; i++) { const t = i / n, y = lerp(y0, y1, t), c = u + Math.sin(t * 6 + u) * wob + (rng() - 0.5) * 0.14; pts.push(f.map(c, y, 0.045)); }
    vb.add(kit.tube(pts, r, r * 0.4, 3, n * 2, { capEnds: false }), 'flat', { color: stemC });
  };
  for (const [f, u, a, e, w] of [[F.south, -10.4, 0, 8.3, 0.5], [F.south, -9.9, 0, 5.4, 0.4], [F.south, 0.7, 0, 1.6, 0.25], [F.south, -8.3, 5.4, 9.2, 0.3], [F.east, -10.1, 0, 10.6, 0.6], [F.east, -9.3, 0, 8.4, 0.5], [F.east, -7.2, 0, 2.8, 0.3], [F.east, -0.3, 0, 1.1, 0.2], [F.north, -9.5, 0, 7.4, 0.7], [F.north, -0.3, 0, 11, 0.7], [F.west, -10, 0, 9.9, 0.6], [F.west, -2.2, 0, 5.2, 0.7]]) climb(f, u, a, e, w);
  // Exploratory runners that reach out across bare plaster, each with its own leaflets.
  const runner = (f, u, y, du, dy, n) => {
    const pts = [f.map(u, y, 0.04)]; let cu = u, cy = y;
    for (let i = 1; i <= n; i++) {
      cu += du * 0.42 + (rng() - 0.5) * 0.2; cy += dy * 0.42 + (rng() - 0.5) * 0.16; if (cy > f.sky(cu) - 0.08) break;
      pts.push(f.map(cu, cy, 0.04));
      for (let k = 0; k < 3; k++) {
        const [nx, , nz] = f.n, off = R(-0.1, 0.1), p = f.map(cu + off, cy + R(-0.1, 0.1), 0.09);
        const shell = [nx, 0.5, nz];
        mkLeaf(p, [nx * 0.8 + R(-0.3, 0.3), 0.55, nz * 0.8 + R(-0.3, 0.3)], [f.t[0] * R(-0.5, 0.5), -1, f.t[2] * R(-0.5, 0.5)], R(0.17, 0.26), ivyColor(cu, cy, litOf(shell, -0.2), 2, 1.1), R(0.02, 0.045), shell);
      }
    }
    if (pts.length > 2) vb.add(kit.tube(pts, 0.022, 0.012, 3, pts.length * 2, { capEnds: false }), 'flat', { color: stemC });
  };
  runner(F.south, -9.7, 2.9, 0.9, 0.35, 7); runner(F.south, -9.0, 8.4, 0.5, -0.8, 5); runner(F.south, 0.0, 1.4, -0.7, 0.8, 5);
  runner(F.east, -8.8, 6.6, 0.9, 0.2, 5); runner(F.east, -7.0, 2.8, 0.75, 0.3, 6); runner(F.east, -8.4, 9.0, 1, -0.3, 4);
  runner(F.north, -7.2, 4.0, 0.9, 0.3, 8); runner(F.west, -8.6, 6.6, 1, 0.2, 7);
  // Vines hanging off the broken slab lips: they stir with the wind. Leaves don't receive the shadow map (the wall would blacken every shell on its
  // far side), so a strand tucked under a higher slab is steered off the sun here instead.
  const sunBlocked = (x, y, z) => { for (let l = 1; l <= 4; l++) { if (L[l] < y + 0.1) continue; const d = (L[l] - y) / SUN.y; if (onSlab(l, x + SUN.x * d, z + SUN.z * d)) return true; } return false; };
  const strand = (p, len, curl = 0.25) => {
    const dx = R(-curl, curl), dz = R(-curl, curl), pts = [p, [p[0] + dx * 0.4, p[1] - len * 0.45, p[2] + dz * 0.4], [p[0] + dx, p[1] - len, p[2] + dz]];
    vb.add(kit.tube(pts, 0.018, 0.01, 3, 4, { capEnds: false }), 'flat', { color: stemC });
    const n = Math.round(len / 0.085);
    for (let i = 0; i < n; i++) {
      const t = i / n, a = R(0, 6.28), rr = 0.06 + 0.05 * rng(), px = lerp(p[0], p[0] + dx, t) + Math.cos(a) * rr, pz = lerp(p[2], p[2] + dz, t) + Math.sin(a) * rr;
      const ly = p[1] - t * len, shell = [Math.cos(a), 0.45, Math.sin(a)];
      if (sunBlocked(px, ly, pz)) { const d = shell[0] * SUN.x + shell[1] * SUN.y + shell[2] * SUN.z + 0.8; shell[0] -= SUN.x * d; shell[1] -= SUN.y * d; shell[2] -= SUN.z * d; }
      mkLeaf([px, ly, pz], [Math.cos(a), 0.7, Math.sin(a)], [Math.cos(a) * 0.4, -1, Math.sin(a) * 0.4], R(0.17, 0.27), ivyColor(px, ly, litOf(shell, -0.1), 4, 1.05), 0.03 + t * t * 0.12, shell);
    }
  };
  for (let lv = 1; lv <= 4; lv++) {
    const e = slabEdges[lv].filter((v) => v.broken);
    for (let i = 0; i < 12 + lv; i++) { const v = e[(rng() * e.length) | 0]; strand([v.p[0], L[lv] - 0.05, v.p[1]], R(0.5, 1.7)); }
  }

  for (const [p, n, tip, size, color, shell] of ivyUnder) mkLeaf(p, n, tip, size, color, 0, shell);

  const buildLeaves = (list, geo, mat, moving, cast = false) => {
    const g = geo.clone(), m = new THREE.InstancedMesh(g, mat, list.length), mtx = new THREE.Matrix4(), shell = new Float32Array(list.length * 3);
    list.forEach((e, i) => {
      mtx.fromArray(e.m); m.setMatrixAt(i, mtx); m.setColorAt(i, e.color);
      const l = Math.hypot(...e.shell) || 1; shell[i * 3] = e.shell[0] / l; shell[i * 3 + 1] = e.shell[1] / l; shell[i * 3 + 2] = e.shell[2] / l;
    });
    g.setAttribute('aShell', new THREE.InstancedBufferAttribute(shell, 3));
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.castShadow = cast; m.receiveShadow = false; m.frustumCulled = false;
    if (moving) m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    ctx.softEdge(m); group.add(m); return m;
  };
  const leafMat = shellMat({ color: '#ffffff', side: THREE.DoubleSide, translucent: 0.8 });
  buildLeaves(ivyStatic, leafTop, leafMat, false, true);
  const ivySway = buildLeaves(ivyMoving, leafTop, leafMat, true);

  // ------------------------------------------------------------------------------------------------ bougainvillea
  // Two unequal masses, each a pile of ellipsoid lobes that pours over a broken edge and runs out in long trailing canes.
  // The room behind the collapse (x -3..0, y 3..5.5) stays open: nothing is planted on the lips above it.
  const V3 = THREE.Vector3, sat = (v) => clamp(v, 0, 1);
  const MASSES = [
    { // left of the south facade: the heavy one, slumped low and wide mid-facade over the balcony, with a skirt running out along the level-2 lip
      c: [-9.0, 5.9, 0.7], ph: 0.4,
      lobes: [[-8.9, 6.9, 1.05, 2.05, 1.4, 1.15], [-10.1, 5.6, 1.25, 1.3, 1.5, 1.0], [-7.3, 6.45, 1.0, 1.1, 0.85, 0.85], [-9.25, 7.95, 0.8, 1.25, 0.55, 0.85], [-10.4, 4.1, 1.2, 0.85, 1.05, 0.75], [-8.7, 5.0, 1.0, 0.95, 0.7, 0.7], [-6.15, 5.95, 0.8, 0.7, 0.45, 0.6]],
      trails: [
        { pts: [[-7.65, 5.9, 1.3], [-7.9, 5.1, 1.4], [-7.7, 4.3, 1.3], [-7.95, 3.5, 1.3], [-7.8, 2.75, 1.25]], r: 0.42 },
        { pts: [[-10.55, 3.5, 1.3], [-10.8, 2.7, 1.35], [-10.6, 1.8, 1.2], [-10.75, 0.8, 1.15]], r: 0.36 },
      ] },
    { // high on the right: much smaller, cresting the stepped roof corner, with one long tail down the east wall end
      c: [1.0, 10.0, -7.9], ph: 2.7,
      lobes: [[0.9, 10.3, -8.5, 1.05, 0.95, 1.2], [0.25, 11.25, -8.6, 0.9, 0.55, 0.85], [1.7, 9.5, -7.7, 0.8, 0.95, 0.85], [0.6, 9.1, -6.9, 0.75, 0.55, 0.7], [1.95, 8.4, -7.0, 0.5, 0.75, 0.6]],
      trails: [{ pts: [[1.95, 8.6, -6.7], [2.15, 7.5, -6.4], [2.0, 6.3, -6.25], [2.15, 5.1, -6.0], [2.05, 3.9, -5.85]], r: 0.42 }] },
  ];
  for (const l of MASSES[0].lobes) { l[3] *= 0.84; l[4] *= 0.84; l[5] *= 0.9; } // keep the accent an accent: greens stay dominant
  const bractList = [], BT = [new THREE.Color(P.bougainLit), new THREE.Color(P.bougain), new THREE.Color('#b82a78')];
  const bc = { l: new THREE.Color(P.ivy), d: new THREE.Color(P.leafDeep) }, hsl = {};
  // Three pinks by clump height; the side turned from the sun loses 10% saturation.
  const pink = (h, shell, gain) => {
    const c = BT[h > 0.68 ? 0 : h > 0.4 ? 1 : 2].clone().multiplyScalar(gain);
    if (shell.dot(SUN) < 0.02) { c.getHSL(hsl, THREE.SRGBColorSpace); c.setHSL(hsl.h, hsl.s * 0.9, hsl.l, THREE.SRGBColorSpace); }
    return c;
  };
  const dY = new V3(), dZ = new V3(), dX = new V3();
  // Bracts lie along the shell with their tips hanging down it, like shingles.
  const bract = (p, shell, h, sway, ph, gain = 1) => {
    if (rng() < 0.11) {
      const sv = [shell.x, shell.y, shell.z];
      mkLeaf([p.x, p.y, p.z], [shell.x, shell.y + 0.2, shell.z], [R(-0.4, 0.4), -1, R(-0.4, 0.4)], R(0.2, 0.28), (litOf(sv) > 0.05 ? bc.l : bc.d).clone(), Math.max(sway, 0.006), sv);
      return;
    }
    dY.set(shell.x + R(-0.26, 0.26), shell.y + R(-0.26, 0.26), shell.z + R(-0.26, 0.26)).normalize();
    dZ.set(R(-0.55, 0.55), -1, R(-0.55, 0.55)); dZ.addScaledVector(dY, -dZ.dot(dY));
    if (dZ.lengthSq() < 0.04) dZ.set(R(-1, 1), 0, R(-1, 1)); // bract faces straight up or down: any tip direction will do
    dZ.addScaledVector(dY, -dZ.dot(dY)).normalize(); dX.crossVectors(dY, dZ).normalize();
    const s = R(0.31, 0.42);
    bractList.push({ m: [dX.x * s, dX.y * s, dX.z * s, 0, dY.x * s, dY.y * s, dY.z * s, 0, dZ.x * s, dZ.y * s, dZ.z * s, 0, p.x, p.y, p.z, 1], color: pink(h, shell, gain * (0.97 + rng() * 0.06)), shell: [shell.x, shell.y, shell.z], sway, ph });
  };
  // Bracts inside a slab, or behind the facade below its broken top, would be wasted.
  const buried = (p) => {
    if (p.z < B.z[1] && p.x > B.x[0] && p.z > B.z[0] + 1 && p.x < -4 && p.y < F.south.sky(p.x) - 0.05) return true;
    for (let l = 1; l <= 4; l++) if (p.y < L[l] + 0.03 && p.y > L[l] - B.slabT - 0.03 && onSlab(l, p.x, p.z)) return true;
    return false;
  };
  const inLobe = (o, p, k) => { const dx = (p.x - o.c.x) / o.rx, dy = (p.y - o.c.y) / o.ry, dz = (p.z - o.c.z) / o.rz; return dx * dx + dy * dy + dz * dz < k * k; };
  const area = (o) => 4.19 * (o.rx * o.ry + o.rx * o.rz + o.ry * o.rz);
  const fibDir = (k, n, q) => { const y = 1 - (2 * (k + 0.5)) / n, r = Math.sqrt(Math.max(0, 1 - y * y)), a = k * 2.39996; return q.set(Math.cos(a) * r, y, Math.sin(a) * r); };
  const coreParts = [], cTop = new THREE.Color('#c23a80'), cBot = new THREE.Color('#7c2c70'), cTmp = new THREE.Color();
  const DENS = 15;
  for (const m of MASSES) {
    const C = new V3(...m.c), lobes = m.lobes.map(([x, y, z, rx, ry, rz]) => ({ c: new V3(x, y, z), rx, ry, rz, main: true })), d = new V3();
    let y0 = 1e9, y1 = -1e9;
    for (const t of m.trails) for (const q of t.pts) y0 = Math.min(y0, q[1]);
    for (const o of lobes) y1 = Math.max(y1, o.c.y + o.ry * 0.6);
    const heightOf = (y) => sat((y - y0) / (y1 - y0));
    // Smaller clumps budding off the big lobes break the outline into florets of bloom.
    for (const o of lobes.slice()) {
      const n = Math.round(area(o) * 0.6);
      for (let k = 0; k < n; k++) {
        fibDir(k, n, d); if (rng() > 0.72) continue;
        const rc = R(0.42, 0.74), q = new V3(o.c.x + d.x * o.rx * 0.88, o.c.y + d.y * o.ry * 0.88, o.c.z + d.z * o.rz * 0.88);
        if (!buried(q)) lobes.push({ c: q, rx: rc, ry: rc * R(0.74, 0.92), rz: rc, main: false });
      }
    }
    for (const a of lobes) for (const o of lobes) if (a !== o && !a.main && !a.dead && inLobe(o, a.c, 0.72) && o.rx > a.rx * 0.9) a.dead = true;
    const LB = lobes.filter((o) => !o.dead);
    LB.forEach((o, li) => {
      const near = LB.filter((q) => q !== o && q.c.distanceTo(o.c) < Math.max(q.rx, q.ry, q.rz) + Math.max(o.rx, o.ry, o.rz) + 0.2);
      const seed = li * 3.7 + m.ph, tone = heightOf(o.c.y) + (hash2(li, m.ph) - 0.5) * 0.14;
      const n = Math.round(area(o) * DENS), p = new V3(), nC = new V3(), nL = new V3(), shell = new V3();
      for (let k = 0; k < n; k++) {
        fibDir(k, n, d); d.x += R(-0.06, 0.06); d.y += R(-0.06, 0.06); d.z += R(-0.06, 0.06); d.normalize();
        const bump = 1 + 0.26 * (vnoise(d.x * 2.4 + seed, d.y * 2.4 + d.z * 1.7) - 0.5);
        p.set(o.c.x + d.x * o.rx * bump, o.c.y + d.y * o.ry * bump, o.c.z + d.z * o.rz * bump);
        if (near.some((q) => inLobe(q, p, 0.9)) || buried(p)) continue;
        if (d.y < -0.6 && rng() < 0.2) continue;
        nC.set(d.x / o.rx, d.y / o.ry, d.z / o.rz).normalize();
        nL.set(p.x - C.x, (p.y - C.y) * 1.25, p.z - C.z).normalize();
        shell.copy(nC).lerp(nL, 0.34).normalize();
        let crease = 9; for (const q of near) { const dx = (p.x - q.c.x) / q.rx, dy = (p.y - q.c.y) / q.ry, dz = (p.z - q.c.z) / q.rz; crease = Math.min(crease, dx * dx + dy * dy + dz * dz); }
        bract(p, shell, tone, 0.012 + sat((y1 - p.y) / 6) * 0.025, m.ph + li * 0.3, crease < 1.3 ? 0.84 + 0.16 * sat((crease - 0.81) / 0.49) : 1);
      }
      const g = kit.sphere(1, o.main ? 10 : 7, o.main ? 8 : 5).scale(o.rx * 0.8, o.ry * 0.8, o.rz * 0.8).translate(o.c.x, o.c.y, o.c.z);
      const pa = g.attributes.position, col = new Float32Array(pa.count * 3);
      for (let i = 0; i < pa.count; i++) {
        const f = sat(((pa.getX(i) - o.c.x) / o.rx * SUN.x + (pa.getY(i) - o.c.y) / o.ry * SUN.y + (pa.getZ(i) - o.c.z) / o.rz * SUN.z) * 0.7 + 0.5);
        cTmp.copy(cBot).lerp(cTop, f); col[i * 3] = cTmp.r; col[i * 3 + 1] = cTmp.g; col[i * 3 + 2] = cTmp.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3)); coreParts.push(g);
    });
    // Trailing canes: full under the mass, thinning to a tip, with side shoots peeling off.
    const chain = (pts, r, ph, depth) => {
      vb.add(kit.tube(pts, 0.03 + r * 0.03, 0.012, 3, 10, { capEnds: false }), 'flat', { color: '#7a5a3c' });
      const crv = new THREE.CatmullRomCurve3(pts.map((q) => new V3(...q))), v = new V3(), seed = ph * 5, len = crv.getLength(), n = Math.round(len * (depth ? 26 : 42) * (0.5 + r));
      const p = new V3(), shell = new V3(), nP = new V3(), q = new V3();
      for (let k = 0; k < n; k++) {
        const u = Math.pow(rng(), 1.15); crv.getPoint(u, v);
        const a = R(0, 6.28), body = r * Math.pow(1 - u, 0.6) + 0.07, rad = body * (0.72 + 0.62 * vnoise(u * 5.5 + seed, seed)) * (0.72 + 0.28 * rng());
        p.set(v.x + Math.cos(a) * rad, v.y + R(-0.1, 0.1), v.z + Math.sin(a) * rad * 0.8);
        if (buried(p)) continue;
        nP.copy(v).sub(C).normalize();
        shell.set(Math.cos(a) * 0.82, 0.14, Math.sin(a) * 0.82).addScaledVector(nP, 0.32).normalize();
        const clump = Math.floor(u * 5) / 5; crv.getPoint(clump + 0.1, q);
        bract(p, shell, heightOf(q.y) + (hash2(clump * 5, seed) - 0.5) * 0.12, 0.014 + u * u * 0.13, ph + u * 1.5);
      }
      if (depth) return;
      for (let j = 0; j < 3; j++) {
        const u0 = 0.14 + j * 0.2 + rng() * 0.08, u1 = Math.min(0.97, u0 + R(0.3, 0.46)), a = crv.getPoint(u0), e = crv.getPoint(u1), o = (j % 2 ? 1 : -1) * R(0.3, 0.55), oz = R(-0.1, 0.25);
        chain([[a.x, a.y, a.z], [lerp(a.x, e.x, 0.45) + o * 0.7, lerp(a.y, e.y, 0.45), lerp(a.z, e.z, 0.45) + oz * 0.7], [e.x + o, e.y, e.z + oz]], r * 0.42, ph + 0.5 + j, 1);
      }
    };
    m.trails.forEach((t, i) => chain(t.pts, t.r, m.ph + i * 1.3, 0));
  }
  { const core = new THREE.Mesh(kit.merge(coreParts), toon({ vertexColors: true, dapple: false, emissive: '#c23a80', emissiveIntensity: 0.62 })); core.castShadow = false; core.receiveShadow = false; group.add(ctx.softEdge(core)); }
  // Papery trio of bracts around a floret: slightly cupped, dark at the throat and light at the tip, so overlaps stay legible inside one cel band.
  const bractGeo = new THREE.BufferGeometry();
  { const l = 0.62, w = 0.56, c = 0.05, out = { p: [], c: [], i: [] }, tilt = 0.36, v = new V3();
    const outline = [[0, 0, 0], [-w / 2, c, l * 0.34], [-w * 0.36, c, l * 0.72], [0, 0, l], [w * 0.36, c, l * 0.72], [w / 2, c, l * 0.34]], shade = [0.6, 0.88, 1, 1.08, 1, 0.88];
    [0, 2.2, 4.15].forEach((yaw, pi) => {
      const b0 = pi * 6;
      outline.forEach((q, i) => { v.set(...q).applyAxisAngle(new V3(1, 0, 0), -tilt).applyAxisAngle(new V3(0, 1, 0), yaw); out.p.push(v.x, v.y, v.z); out.c.push(shade[i], shade[i], shade[i]); });
      out.i.push(b0, b0 + 2, b0 + 1, b0, b0 + 3, b0 + 2, b0, b0 + 4, b0 + 3, b0, b0 + 5, b0 + 4);
    });
    bractGeo.setAttribute('position', new THREE.Float32BufferAttribute(out.p, 3));
    bractGeo.setAttribute('color', new THREE.Float32BufferAttribute(out.c, 3));
    bractGeo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(54).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    bractGeo.setIndex(out.i); }
  const bractMat = shellMat({ color: '#ffffff', vertexColors: true, side: THREE.DoubleSide, dapple: false, translucent: 0.45, emissive: '#a01a58', emissiveIntensity: 0.26 });
  const bougain = buildLeaves(bractList, bractGeo, bractMat, true);
  group.add(vb.build({ castShadow: false }));

  // ------------------------------------------------------------------------------------------------ animation
  const baseI = new Float32Array(ivySway.instanceMatrix.array), baseB = new Float32Array(bougain.instanceMatrix.array);
  const ivyAxis = new Float32Array(ivyMoving.length * 3); ivyMoving.forEach((e, i) => { const a = e.axis, l = Math.hypot(...a) || 1; ivyAxis[i * 3] = a[0] / l; ivyAxis[i * 3 + 1] = a[1] / l; ivyAxis[i * 3 + 2] = a[2] / l; });
  const update = (t) => {
    const gust = ctx.wind(t, -2, -2);
    curtains.update(t, gust); awning.update(t, gust * 0.6);
    const ai = ivySway.instanceMatrix.array, k0 = gust * 0.5 + 0.5;
    for (let i = 0, n = ivyMoving.length; i < n; i++) {
      const e = ivyMoving[i], o = i * 16, d = e.sway * (Math.sin(t * 1.6 + e.ph) * 0.6 + k0);
      ai[o + 12] = baseI[o + 12] + ivyAxis[i * 3] * d; ai[o + 13] = baseI[o + 13] + d * 0.3; ai[o + 14] = baseI[o + 14] + ivyAxis[i * 3 + 2] * d;
    }
    ivySway.instanceMatrix.needsUpdate = true;
    const ab = bougain.instanceMatrix.array;
    for (let i = 0, n = bractList.length; i < n; i++) {
      const e = bractList[i], o = i * 16, p = e.ph, d = e.sway * (Math.sin(t * 1.05 + p) + gust * 0.9 + 0.3);
      ab[o + 12] = baseB[o + 12] + d; ab[o + 14] = baseB[o + 14] + d * 0.55 * Math.cos(t * 0.8 + p);
    }
    bougain.instanceMatrix.needsUpdate = true;
  };
  update(0);
  return { group, update };
}
