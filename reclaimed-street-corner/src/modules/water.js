// water.js — the spring in the road crack, the stream, the cascade and the koi pond with its rim of cobbles and marsh plants.
// Everything animated is a pure function of t (t is frozen in verification shots while dt keeps running).
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const frac = (v) => v - Math.floor(v);
const hash = (a, b = 0) => frac(Math.sin(a * 127.1 + b * 311.7 + 1.7) * 43758.5453);

const PRE = 0.4;  // the ribbon begins behind the spring so it wraps it in a round pool

/**
 * The stream's centre line: the layout curve plus its meander. One source for the water here and for what ground.js lays
 * under it (wet paint, road crack width, sidewalk gap, scatter clearance), so the two cannot drift apart.
 * Each sample: {cx,cz: unmeandered, x,z: meandered, tx,tz: tangent of the meandered line, L, d: distance past the spring, inGap}.
 * From the default camera the flow runs almost straight along the view axis, so the swing across it is what keeps the
 * stream lying on the road. The phase puts the westward bend in the sidewalk gap: clear of the bicycle, and back on the
 * layout line by the lip, so the cascade stays where the pond expects it.
 */
export function streamLine(THREE, WATER, NS = 110) {
  const SP = WATER.spring, ctrl = WATER.stream.map(([x, z]) => new THREE.Vector2(x, z));
  const dir0 = ctrl[1].clone().sub(ctrl[0]).normalize();
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(SP[0] - dir0.x * PRE, 0, SP[1] - dir0.y * PRE), ...ctrl.map((p) => new THREE.Vector3(p.x, 0, p.y))], false, 'centripetal');
  const samples = [];
  let L = 0, prev = null;
  for (let i = 0; i <= NS; i++) {
    const q = curve.getPointAt(i / NS), t = curve.getTangentAt(i / NS);
    if (prev) L += Math.hypot(q.x - prev.x, q.z - prev.z);
    prev = q; samples.push({ cx: q.x, cz: q.z, tx: t.x, tz: t.z, L });
  }
  const L0 = samples.reduce((b, s) => (Math.hypot(s.cx - SP[0], s.cz - SP[1]) < Math.hypot(b.cx - SP[0], b.cz - SP[1]) ? s : b), samples[0]).L;
  const dEnd = samples[NS].L - L0;
  for (const s of samples) {
    const d = s.L - L0, window = sstep(0.2, 1.3, d) * (1 - sstep(dEnd - 1.2, dEnd - 0.3, d));
    s.inGap = sstep(6.55, 6.85, s.cz) * (1 - sstep(8.05, 8.35, s.cz));
    const m = (0.31 * Math.sin(d * 2.1 - 0.34) + 0.05 * Math.sin(d * 4.7 + 2.0)) * window * (1 - 0.25 * s.inGap);
    s.d = d; s.x = s.cx - s.tz * m; s.z = s.cz + s.tx * m;
  }
  // cross-sections, bank pebbles and flecks all hang off the tangent, so it has to be the bent line's own
  const bent = samples.map((_, i) => {
    const a = samples[Math.max(0, i - 2)], b = samples[Math.min(NS, i + 2)], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    return [dx / l, dz / l];
  });
  samples.forEach((s, i) => { [s.tx, s.tz] = bent[i]; });
  return samples;
}

export function build(ctx) {
  const { THREE, layout, P, kit } = ctx;
  const { WATER, FLOWER_SPOTS } = layout;
  const rng = ctx.rng;
  const group = new THREE.Group(); group.name = 'water';
  const C = (hex) => new THREE.Color(hex);
  const pond = WATER.pond;

  /* ---------- soup: per-face / per-vertex coloured triangle list ---------- */
  class Soup {
    constructor() { this.p = []; this.n = []; this.c = []; this.u = []; this.mute = false; }
    /** color: Color | (x,y,z,nx,ny,nz)=>Color. perVertex evaluates the function at each vertex, else once per face (crisp cel patches). */
    add(geo, matrix = null, color = C('#ffffff'), { perVertex = false, uv = null } = {}) {
      if (this.mute) return this;   // a muted soup still lets its caller draw from rng, so what is seeded after stays put
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      if (!g.attributes.normal) g.computeVertexNormals();
      if (matrix) g.applyMatrix4(matrix);
      const a = g.attributes.position, n = g.attributes.normal, t = g.attributes.uv, own = color === 'attr' ? g.attributes.color : null, fn = typeof color === 'function';
      for (let i = 0; i < a.count; i += 3) {
        let fc = color;
        if (fn && !perVertex) {
          fc = color((a.getX(i) + a.getX(i + 1) + a.getX(i + 2)) / 3, (a.getY(i) + a.getY(i + 1) + a.getY(i + 2)) / 3, (a.getZ(i) + a.getZ(i + 1) + a.getZ(i + 2)) / 3,
            (n.getX(i) + n.getX(i + 1) + n.getX(i + 2)) / 3, (n.getY(i) + n.getY(i + 1) + n.getY(i + 2)) / 3, (n.getZ(i) + n.getZ(i + 1) + n.getZ(i + 2)) / 3);
        }
        for (let k = i; k < i + 3; k++) {
          const c = own ? { r: own.getX(k), g: own.getY(k), b: own.getZ(k) } : fn && perVertex ? color(a.getX(k), a.getY(k), a.getZ(k), n.getX(k), n.getY(k), n.getZ(k), t ? t.getX(k) : 0, t ? t.getY(k) : 0) : fc;
          this.p.push(a.getX(k), a.getY(k), a.getZ(k)); this.n.push(n.getX(k), n.getY(k), n.getZ(k)); this.c.push(c.r, c.g, c.b);
          if (uv) { const q = uv(a.getX(k), a.getY(k), a.getZ(k)); this.u.push(q[0], q[1]); } else this.u.push(t ? t.getX(k) : 0, t ? t.getY(k) : 0);
        }
      }
      return this;
    }
    get verts() { return this.p.length / 3; }
    geometry() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
      return g;
    }
  }
  const M4 = (pos, rot = [0, 0, 0], scale = 1) => kit.xf({ pos, rot, scale });

  /* ---------- pond shape: one shoreline shared by the bed, the disc, and the rim ---------- */
  const edge = (a) => 0.972 + 0.018 * (Math.sin(a * 2 + 1.1) * 0.6 + Math.sin(a * 3 + 0.4) * 0.45 + Math.sin(a * 5 + 2.2) * 0.25);
  const polar = (x, z) => { const u = (x - pond.x) / pond.rx, v = (z - pond.z) / pond.rz, a = Math.atan2(v, u); return { a, f: Math.hypot(u, v) / edge(a) }; };
  const rim = (a, f) => { const e = edge(a) * f; return [pond.x + Math.cos(a) * pond.rx * e, pond.z + Math.sin(a) * pond.rz * e]; };
  const deg = (d) => (d * Math.PI) / 180;
  const Z_MIN = 8.03, Z_MAX = 11.93;   // bed lip and stones stay on the soil band, inside the base edge

  const TAB = [[0, -0.7], [0.22, -0.7], [0.42, -0.6], [0.62, -0.41], [0.8, -0.26], [0.93, -0.145], [1.0, WATER.y], [1.05, 0.03], [1.12, 0.074], [1.5, 0.074]];
  const profile = (f) => {
    for (let i = 1; i < TAB.length; i++) if (f <= TAB[i][0]) { const [f0, y0] = TAB[i - 1], [f1, y1] = TAB[i], t = (f - f0) / (f1 - f0); return lerp(y0, y1, t * t * (3 - 2 * t) * 0.5 + t * 0.5); }
    return TAB[TAB.length - 1][1];
  };

  /* ---------- stream centre line ---------- */
  const SP = WATER.spring;
  const dir0 = new THREE.Vector2(WATER.stream[1][0] - WATER.stream[0][0], WATER.stream[1][1] - WATER.stream[0][1]).normalize();
  const NS = 110;
  const samples = streamLine(THREE, WATER, NS);
  {
    // heights: nearest control index along the curve
    const ctrlL = WATER.stream.map(([x, z]) => samples.reduce((b, s) => (Math.hypot(s.cx - x, s.cz - z) < Math.hypot(b.cx - x, b.cz - z) ? s : b), samples[0]).L);
    const yAt = (L) => {
      if (L <= ctrlL[0]) return WATER.streamY[0];
      for (let i = 1; i < ctrlL.length; i++) if (L <= ctrlL[i]) return lerp(WATER.streamY[i - 1], WATER.streamY[i], sstep(ctrlL[i - 1], ctrlL[i], L));
      return WATER.streamY[WATER.streamY.length - 1];
    };
    for (const s of samples) {
      const d = s.d, inGap = s.inGap;
      // width: round pool at the spring, tapered run, held through the gap, flared over the lip
      let w = lerp(WATER.streamWidth[0], 0.56, sstep(0.3, 3.6, d));
      if (s.cz > 7.9) w = lerp(0.56, WATER.streamWidth[1], sstep(7.9, 8.7, s.cz));
      w *= 1 + 0.08 * Math.sin(d * 3.3 + 1.2) * (1 - 0.6 * inGap);
      if (d < 0) w = 2 * Math.sqrt(Math.max(0, PRE * PRE - d * d)) * 1.02 + 0.002;
      else if (d < 0.75) w = lerp(PRE * 2.04, w, sstep(0.05, 0.75, d));
      s.w = w; s.y = yAt(s.L); s.f = polar(s.x, s.z).f;
      s.sFrac = (s.L) / samples[NS].L;
    }
    // lip where the centre line crosses the rim; the ribbon drapes over it and ends under the surface
    let lip = samples.findIndex((s) => s.d > 1 && s.f < 1.02);
    if (lip < 0) lip = NS - 12;
    samples.lip = lip;
    const Ll = samples[lip].L, Le = Ll + 0.36;
    for (const s of samples) {
      if (s.L > Ll) { const u = clamp((s.L - Ll) / (Le - Ll)); s.y = lerp(samples[lip].y, WATER.y - 0.012, Math.pow(u, 1.5)); }
      s.u = clamp((s.L - Ll) / (Le - Ll));
    }
    samples.end = samples.findIndex((s) => s.L >= Le);
    if (samples.end < 0) samples.end = NS;
  }
  const SL = samples[samples.lip];
  const SE = samples[samples.end];
  const streamDist = (x, z) => { let b = 1e9, q = samples[0]; for (let i = 0; i <= samples.end; i++) { const s = samples[i], d = Math.hypot(s.x - x, s.z - z); if (d < b) { b = d; q = s; } } return { d: b, s: q }; };

  // The spillway: where the pond runs out through RIVER.weirSlot into the film river.js lays on its sill. The bed ducks under the sill
  // and the slot floor here (its painted bank would show through the sill's joints), and nothing stands on the shore in front of it.
  // mouthX ramps out under the stone cheeks either side of the channel.
  const SLOT = layout.RIVER.weirSlot, MOUTH_BED = SLOT.y - 0.02, MOUTH_Z = [11.3, 11.4];
  const mouthX = (x) => sstep(SLOT.x[0] + 0.02, SLOT.x[0] + 0.1, x) * (1 - sstep(SLOT.x[1] - 0.1, SLOT.x[1] - 0.02, x));
  const inMouth = (x, z, r = 0) => x + r > SLOT.x[0] && x - r < SLOT.x[1] && z > pond.z && polar(x, z).f + r / pond.rz > 0.93;

  // the bed is lifted into a little delta under the lip, so water spills over it, not through thin air
  const bedAt = (x, z) => {
    const { f } = polar(x, z);
    let y = profile(f);
    y += (Math.sin(x * 2.3 + z * 1.7) * 0.5 + Math.sin(x * 4.1 - z * 3.3 + 1) * 0.3) * 0.028 * (1 - sstep(0.75, 0.95, f));
    const dl = Math.hypot((x - SL.x) * 0.8, (z - SL.z - 0.06));
    const g = Math.exp(-(dl * dl) / 0.13);
    y = lerp(y, Math.max(y, 0.055), g);
    return Math.min(y, lerp(y, MOUTH_BED, mouthX(x) * sstep(MOUTH_Z[0], MOUTH_Z[1], z)));
  };
  const groundAt = (x, z) => {
    if (z < 6.8) return 0;
    if (z < 8.0) return 0.05;
    return bedAt(x, z);
  };

  /* ---------- pond bed: painted flat colour fields ---------- */
  const bx0 = pond.x - pond.rx * 1.25, bx1 = pond.x + pond.rx * 1.25, bz0 = pond.z - pond.rz * 1.25, bz1 = pond.z + pond.rz * 1.25;
  const bedUV = (x, z) => [(x - bx0) / (bx1 - bx0), (z - bz0) / (bz1 - bz0)];
  const bedTex = ctx.canvasTexture(1024, 640, (g, W, H) => {
    const R = ctx.seeded('water-bed');
    const px = (x) => ((x - bx0) / (bx1 - bx0)) * W, py = (z) => (1 - (z - bz0) / (bz1 - bz0)) * H;
    const contour = (fv, wob = 1) => {
      g.beginPath();
      for (let i = 0; i <= 140; i++) {
        const a = (i / 140) * Math.PI * 2, f = fv * (1 + wob * (0.035 * Math.sin(a * 3 + fv * 9) + 0.022 * Math.sin(a * 7 + 2 + fv * 5) + 0.012 * Math.sin(a * 13 + fv * 3)));
        const [x, z] = rim(a, f); i ? g.lineTo(px(x), py(z)) : g.moveTo(px(x), py(z));
      }
      g.closePath();
    };
    g.fillStyle = '#8f7a55'; g.fillRect(0, 0, W, H);
    const bands = [[1.1, '#b5a27a', 0.4], [1.015, '#efe2b6', 0.25], [0.93, '#e2dba8', 1], [0.8, '#b4deaf', 1], [0.68, '#82d0b2', 1], [0.55, '#55bcae', 1], [0.42, '#319fa3', 1], [0.29, '#20828c', 1]];
    g.filter = 'blur(2.5px)';
    for (const [f, col, w] of bands) { contour(f, w); g.fillStyle = col; g.fill(); }
    g.filter = 'none';
    // sand ribs in the shallows
    g.lineCap = 'round';
    for (let k = 0; k < 90; k++) {
      const a = R() * Math.PI * 2, f = R.range(0.72, 0.97), [x, z] = rim(a, f), len = R.range(14, 42);
      g.strokeStyle = R() < 0.6 ? 'rgba(255,250,214,.55)' : 'rgba(120,190,160,.38)'; g.lineWidth = R.range(1.4, 3);
      g.beginPath(); g.moveTo(px(x) - Math.sin(a) * len, py(z) - Math.cos(a) * len);
      g.quadraticCurveTo(px(x) + R.range(-5, 5), py(z) + R.range(-5, 5), px(x) + Math.sin(a) * len, py(z) + Math.cos(a) * len); g.stroke();
    }
    // darker silt pools and grit
    for (let k = 0; k < 26; k++) {
      const a = R() * Math.PI * 2, f = R.range(0.1, 0.5), [x, z] = rim(a, f);
      g.fillStyle = 'rgba(22,108,120,.55)'; g.beginPath(); g.ellipse(px(x), py(z), R.range(14, 52), R.range(8, 22), R.range(-0.4, 0.4), 0, 7); g.fill();
    }
    for (let k = 0; k < 420; k++) {
      const a = R() * Math.PI * 2, f = Math.sqrt(R()) * 1.08, [x, z] = rim(a, f), r = R.range(0.8, 2.8);
      g.fillStyle = f > 0.7 ? R.pick(['#d7c79a', '#f7efc9', '#b7a57e', '#c9d8ac']) : R.pick(['#5fc4b4', '#8ddcc2', '#1f7c86', '#3aa8a4']);
      g.beginPath(); g.ellipse(px(x), py(z), r * 1.3, r, R() * 3, 0, 7); g.fill();
    }
    // a light web of painted caustics over the slope
    g.strokeStyle = 'rgba(224,255,236,.34)'; g.lineWidth = 2;
    for (let k = 0; k < 60; k++) {
      const a = R() * Math.PI * 2, f = R.range(0.3, 0.86), [x, z] = rim(a, f); let X = px(x), Y = py(z);
      g.beginPath(); g.moveTo(X, Y);
      for (let s = 0; s < 3; s++) { const dx = R.range(-26, 26), dy = R.range(-16, 16); g.quadraticCurveTo(X + dx * 0.5 + R.range(-8, 8), Y + dy * 0.5 + R.range(-8, 8), X + dx, Y + dy); X += dx; Y += dy; }
      g.stroke();
    }
    // the damp earth lip
    for (let k = 0; k < 180; k++) {
      const a = R() * Math.PI * 2, f = R.range(1.02, 1.16), [x, z] = rim(a, f), r = R.range(3, 13);
      g.fillStyle = R.pick(['#6fa54c', '#7dbb4a', '#a9d85c', '#5f8f49', '#9c8a60']);
      g.beginPath(); g.ellipse(px(x), py(z), r * 1.5, r, R() * 3, 0, 7); g.fill();
    }
  }, { repeat: false });
  {
    // the even fan, plus a finer one across the spillway so the drop under the cheeks is not a quarter-metre facet
    const fan = Array.from({ length: 80 }, (_, s) => (s / 80) * Math.PI * 2);
    for (let d = deg(96); d < deg(142); d += deg(1.5)) if (fan.every((q) => Math.abs(q - d) > deg(0.5))) fan.push(d);
    fan.sort((a, b) => a - b);
    const seg = fan.length, rings = [0.03, 0.12, 0.22, 0.32, 0.42, 0.52, 0.62, 0.7, 0.78, 0.84, 0.89, 0.93, 0.965, 0.985, 1.0, 1.02, 1.05, 1.08, 1.12, 1.15];
    const pos = [], uv = [], idx = [];
    const c = bedUV(pond.x, pond.z);
    pos.push(pond.x, bedAt(pond.x, pond.z), pond.z); uv.push(c[0], c[1]);
    for (const f of rings) for (let s = 0; s < seg; s++) {
      let [x, z] = rim(fan[s], f);
      z = clamp(z, Z_MIN, Z_MAX);
      pos.push(x, bedAt(x, z), z); const q = bedUV(x, z); uv.push(q[0], q[1]);
    }
    for (let s = 0; s < seg; s++) idx.push(0, 1 + (s + 1) % seg, 1 + s);
    for (let r = 0; r < rings.length - 1; r++) for (let s = 0; s < seg; s++) {
      const a = 1 + r * seg + s, b = 1 + r * seg + (s + 1) % seg, c2 = a + seg, d = b + seg; idx.push(a, b, c2, b, d, c2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const bed = new THREE.Mesh(g, ctx.toon({ map: bedTex, side: THREE.FrontSide }));
    bed.name = 'pond-bed'; bed.receiveShadow = true; bed.castShadow = false;
    ctx.softEdge(bed);
    group.add(bed);
  }

  /* ---------- pebbles: smooth, gently dented ellipsoids ---------- */
  const pebbleGeo = (detail, seed, dent = 0.1) => {
    let g = new THREE.IcosahedronGeometry(1, detail); g.deleteAttribute('normal'); g.deleteAttribute('uv');
    g = mergeVertices(g, 1e-4);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 1 + dent * (Math.sin(x * 2.1 + seed) * 0.6 + Math.sin(y * 2.7 + seed * 1.7) * 0.5 + Math.sin(z * 3.1 + seed * 0.6) * 0.5);
      // a flatter sole and a slight crown: river stones sit, they do not balance
      p.setXYZ(i, x * k, (y < 0 ? y * 0.75 : y) * k, z * k);
    }
    g.computeVertexNormals(); return g;
  };
  const knocked = (g, seed) => { // a few flat planes, so a boulder has shoulders rather than an egg's curve
    const R = ctx.seeded('knock' + seed), planes = Array.from({ length: 5 }, () => { const n = new THREE.Vector3(R.range(-1, 1), R.range(0.1, 0.9), R.range(-1, 1)).normalize(); return { n, d: R.range(0.68, 0.84) }; });
    const p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); for (const q of planes) { const e = v.dot(q.n) - q.d; if (e > 0) v.addScaledVector(q.n, -e * 0.92); } p.setXYZ(i, v.x, v.y, v.z); }
    g.computeVertexNormals(); return g;
  };
  const PEB = { s: [0, 1, 2, 3].map((i) => pebbleGeo(1, i * 2.3 + 0.4, 0.09)), m: [0, 1, 2].map((i) => pebbleGeo(2, i * 3.1 + 1.2, 0.1)), l: [0, 1, 2].map((i) => knocked(pebbleGeo(3, i * 1.9 + 2.7, 0.1), i)) };
  const STONE_TONES = ['#e8e5da', '#d8d6cc', '#c3c6c0', '#d9cdb6', '#b3bfba', '#cbc3b2', '#f1ecdc', '#a9b0ad'].map(C);
  const BOULDER_TONES = ['#c9ccc4', '#b7bdb8', '#d6d3c8', '#aab4b0'].map(C);
  const mossLit = C(P.mossLit), mossMid = C(P.moss);
  const wetTint = C('#6f9d9a');
  const stones = new Soup(), sunken = new Soup();
  const placed = [], caps = [];
  const clearOf = (x, z, r, k = 0.72) => placed.every((q) => Math.hypot(q[0] - x, q[1] - z) > (q[2] + r) * k);
  /** o: {tone, tint, tintK, sy, sx, sz, sink, yaw, y, cap, soup, clampZ, at}. at: [x,z] draws it there instead, while x,z still count for clearOf.
   *  A rim stone in the spillway's mouth makes all its rng draws and keeps its place in `placed`, but is not drawn: the rest of the pond stays identical. */
  function stone(x, z, r, o = {}) {
    const R = rng;
    const sy = o.sy ?? R.range(0.5, 0.72), sx = o.sx ?? R.range(1.05, 1.4), sz = o.sz ?? R.range(0.8, 1.05);
    if (o.clampZ !== false) z = Math.min(z, Z_MAX - r * Math.max(sx, sz) * 0.8);
    const sink = o.sink ?? 0.32, yaw = o.yaw ?? R() * 6.28;
    const seat = [x, z, r * Math.max(sx, sz)], dropped = !o.soup && !o.at && inMouth(x, z, seat[2]);
    if (o.at) [x, z] = o.at;
    const y = (o.y ?? groundAt(x, z)) + r * sy * (1 - sink) * 0.75;
    const list = r > 0.26 ? PEB.l : r > 0.13 ? PEB.m : PEB.s;
    const tone = (o.tone ?? R.pick(STONE_TONES)).clone();
    if (o.tint) tone.lerp(o.tint, o.tintK ?? 0.4);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(R.range(-0.08, 0.08), yaw, R.range(-0.08, 0.08), 'YXZ')), new THREE.Vector3(r * sx, r * sy, r * sz));
    const wetLine = WATER.y + 0.035, shade = tone.clone().lerp(wetTint, 0.55);
    const soup = o.soup ?? stones;
    soup.mute = dropped; soup.add(R.pick(list), m, (px, py) => (py < wetLine ? shade : tone)); soup.mute = false;
    placed.push(seat);
    if (o.cap) { const d = R.range(1.9, 3.9), k = r * R.range(0.28, 0.42); caps.push({ dropped, x: x + Math.cos(d) * k, y: y + r * sy * 0.5, z: z + Math.sin(d) * k * 0.7 - 0.16 * r, r: r * R.range(0.6, 0.76), h: r * sy * R.range(0.42, 0.52), tiltX: Math.sin(d) * 0.34, tiltZ: -Math.cos(d) * 0.34 }); }
  }

  // Deliberate clusters: anchor boulders, each with its attendants. Angles: 0=+x (east), 90=+z (front), 180=west, 270=north.
  const CL = [
    { a: 178, big: [0.47, 0.36, 0.26], f: 1.09, moss: 0.95 },   // west end, the dark mossy shoulder behind the reeds
    { a: 203, big: [0.36, 0.26], f: 1.08, moss: 0.8 },
    { a: 312, big: [0.4, 0.3, 0.22], f: 1.09, moss: 0.72 }, // north-east
    { a: 345, big: [0.3, 0.2], f: 1.06, moss: 0.4 },
    { a: 38, big: [0.34, 0.24, 0.17], f: 1.04, moss: 0.5 },   // front right
    { a: 118, big: [0.28, 0.2, 0.15], f: 1.03, moss: 0.65, flank: [[SLOT.x[0] - 0.17, SLOT.z[0] + 0.01], [SLOT.x[1] + 0.11, SLOT.z[0] + 0.17]] },  // front left: stood in the spillway, so its two big stones now flank the mouth
    { a: 77, big: [0.2, 0.14], f: 1.02, moss: 0.2 },
    { a: 228, big: [0.24, 0.17], f: 1.07, moss: 0.6 },
  ];
  for (const c of CL) {
    c.big.forEach((r, i) => {
      const a = deg(c.a) + (i ? rng.range(-0.2, 0.2) + i * 0.09 * rng.sign() : 0), f = c.f + (i ? rng.range(-0.1, 0.03) : 0);
      const [x, z] = rim(a, f);
      if (Math.abs(x - SL.x) < 0.75 + r && z < 9) return;
      stone(x, z, r, { sy: rng.range(0.62, 0.8), sink: 0.3, sx: rng.range(1, 1.25), tone: rng.pick(BOULDER_TONES), cap: r > 0.17 && c.moss > 0.45, at: c.flank?.[i] });
    });
  }
  // lip of the cascade: a row of cobbles with gaps for the water to run between
  {
    const nx = -SL.tz, nz = SL.tx, W2 = SL.w / 2 + 0.05;
    const row = [[-1.28, 0.2], [-1.0, 0.15], [-0.62, 0.105], [-0.25, 0.085], [0.2, 0.095], [0.6, 0.12], [1.02, 0.17], [1.34, 0.21]];
    for (const [k, r] of row) {
      const x = SL.x + nx * k * W2 + SL.tx * 0.04, z = SL.z + nz * k * W2 + SL.tz * 0.04;
      stone(x, z, r, { y: Math.min(0.05, groundAt(x, z)), sy: 0.6, sink: 0.62, sx: 1.1, sz: 0.9, tone: STONE_TONES[(Math.abs(k * 7) | 0) % 5] });
    }
  }
  // the shingle ring: mostly small, in drifts, thick near the clusters
  {
    const N = 235;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + rng.range(-0.02, 0.02);
      const drift = 0.5 + 0.5 * Math.sin(a * 5 + 0.8) * Math.sin(a * 3 + 2.1);
      if (rng() > 0.35 + drift * 0.65) continue;
      const q = rng(), r = q < 0.62 ? rng.range(0.042, 0.075) : q < 0.9 ? rng.range(0.075, 0.115) : rng.range(0.115, 0.17);
      const f = rng.range(0.965, 1.13);
      const [x, z] = rim(a, f);
      if (z + r > Z_MAX || z < Z_MIN + r * 0.5) continue;
      const near = streamDist(x, z); if (near.d < near.s.w / 2 + r * 0.7) continue;
      if (!clearOf(x, z, r)) continue;
      stone(x, z, r, { sy: rng.range(0.42, 0.62) });
    }
    // a little pale pebble beach on the sunny east side, reaching into the water
    for (let i = 0; i < 46; i++) {
      const a = deg(rng.range(-28, 26)), f = rng.range(0.9, 1.04), r = rng.range(0.04, 0.095);
      const [x, z] = rim(a, f); if (!clearOf(x, z, r, 0.85)) continue;
      stone(x, z, r, { sy: 0.45, tone: STONE_TONES[(i * 3) % 4 === 0 ? 6 : (i % 2) * 3], sink: 0.25 });
    }
  }
  // along the stream: bank pebbles in runs, one side leading the other
  for (let i = 8; i < samples.lip - 1; i += 1) {
    const s = samples[i];
    for (const side of [-1, 1]) {
      const run = Math.sin(s.d * 3.7 + side * 1.3) + Math.sin(s.d * 8.1 + side * 2.2) * 0.5;
      if (run < -0.25 || rng() > 0.62) continue;
      const r = (run > 0.8 ? rng.range(0.085, 0.15) : rng.range(0.04, 0.085)) * (s.cz < 6.8 ? 0.85 : 1);
      const off = s.w / 2 + r * rng.range(0.55, 1.5);
      const x = s.x - s.tz * off * side, z = s.z + s.tx * off * side;
      if (!clearOf(x, z, r, 0.8)) continue;
      if (Math.hypot(x - 1.2, z - 7.45) < 0.32 && r > 0.08) continue; // the bicycle leans here
      stone(x, z, r, { sy: rng.range(0.4, 0.6), y: s.y - 0.05 });
    }
  }
  // inside the basin
  for (let i = 0; i < 34; i++) {
    const a = rng() * Math.PI * 2, f = i < 10 ? rng.range(0.75, 0.92) : Math.sqrt(rng.range(0.03, 0.72)), r = rng.range(0.05, 0.17);
    const [x, z] = rim(a, f); if (!clearOf(x, z, r)) continue;
    stone(x, z, r, { soup: sunken, y: bedAt(x, z), sy: 0.5, sink: 0.45, tint: C('#8fdcc8'), tintK: 0.25 + (1 - f) * 0.3, tone: rng.pick(STONE_TONES), clampZ: false });
  }
  // a few larger drowned stones, off-centre, for the fish to pass
  for (const [a, f, r] of [[deg(250), 0.42, 0.3], [deg(20), 0.5, 0.24], [deg(150), 0.55, 0.22]]) {
    const [x, z] = rim(a, f);
    stone(x, z, r, { soup: sunken, y: bedAt(x, z), sy: 0.6, sink: 0.45, tint: C('#7fd0c0'), tintK: 0.34, clampZ: false });
  }

  /* wet strip under the stream */
  {
    const pos = [], col = [], idx = [], asp = C('#3c5560'), core = C('#3d6068'), sand = C('#8c9a7a'), rows = [[-1.28, 0], [-0.9, 1], [0.9, 1], [1.28, 0]];
    for (let i = 0; i <= samples.end; i += 1) {
      const s = samples[i], k = sstep(6.7, 7.6, s.cz);
      rows.forEach(([u, g]) => {
        const hw = s.w / 2 + 0.03, x = s.x - s.tz * hw * u, z = s.z + s.tx * hw * u;
        const y = g ? s.y - 0.028 : Math.min(-0.02, s.y - 0.05);
        pos.push(x, y, z); const c = (g ? core : asp).clone().lerp(sand, k * 0.45); col.push(c.r, c.g, c.b);
      });
    }
    const n = rows.length, cnt = samples.end;
    for (let i = 0; i < cnt; i++) for (let j = 0; j < n - 1; j++) { const a = i * n + j, b = a + 1, c = a + n, d = c + 1; idx.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    fixUp(g);
    sunken.add(g, null, 'attr');
  }
  function fixUp(g) {
    // keep the winding facing up; a strip that flips turns black under the cel ramp
    const n = g.attributes.normal; let sum = 0; for (let i = 0; i < n.count; i++) sum += n.getY(i);
    if (sum < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); }
  }

  const finishSoup = (soup, name, mat, { cast = true, receive = true, soft = false, geo = null } = {}) => {
    const m = new THREE.Mesh(geo ?? soup.geometry(), mat); m.name = name; m.castShadow = cast; m.receiveShadow = receive;
    if (soft) ctx.softEdge(m); group.add(m); return m;
  };

  /* ---------- the spring: broken asphalt lifted around the crack ---------- */
  {
    const N = 8, top = C(P.asphalt), top2 = C('#7c8085'), side = C('#b4ad9c'), side2 = C('#95917f'), toStream = Math.atan2(dir0.y, dir0.x);
    const wedge = (x) => Math.abs(Math.atan2(Math.sin(x - toStream), Math.cos(x - toStream)));
    let ang = 1.1;
    for (let k = 0; k < N; k++) {
      const span = ((Math.PI * 2) / N) * rng.range(0.78, 0.98), ri = rng.range(0.47, 0.56), ro = ri + rng.range(0.42, 0.68), mid = ang + span / 2;
      ang += (Math.PI * 2) / N;
      if (wedge(mid) < 0.5) continue; // the downstream shard is gone: that is where the water leaves
      const out = [], st = 4;
      for (let i = 0; i <= st; i++) { const a = -span / 2 + (span * i) / st, r = ro * rng.range(0.92, 1.06); out.push([Math.cos(a) * r, Math.sin(a) * r]); }
      for (let i = st; i >= 0; i--) { const a = -span / 2 + (span * i) / st, r = ri * rng.range(0.86, 1.14); out.push([Math.cos(a) * r, Math.sin(a) * r]); }
      const tilt = rng.range(0.26, 0.5), m = new THREE.Matrix4();
      m.multiplyMatrices(new THREE.Matrix4().makeTranslation(SP[0], 0, SP[1]), new THREE.Matrix4().makeRotationY(-mid));
      m.multiply(new THREE.Matrix4().makeTranslation(ro, 0.03, 0)).multiply(new THREE.Matrix4().makeRotationZ(-tilt)).multiply(new THREE.Matrix4().makeTranslation(-ro, 0, 0));
      const tc = k % 3 ? top : top2;
      stones.add(kit.plate(out, [], 0, 0.17), m, (x, y, z, nx, ny) => (ny > 0.6 ? tc : ny < -0.4 ? side2 : side));
    }
    for (let k = 0; k < 15; k++) {
      const a = rng() * 6.28, r = rng.range(0.74, 1.3), q = rng.range(0.05, 0.13);
      if (wedge(a) < 0.45) continue;
      stones.add(kit.chip(kit.box(q * 1.6, q * 0.6, q), q * 0.25, rng), M4([SP[0] + Math.cos(a) * r, q * 0.25, SP[1] + Math.sin(a) * r], [rng.range(-0.3, 0.3), rng() * 6, rng.range(-0.3, 0.3)]), (x, y, z, nx, ny) => (ny > 0.6 ? top : side));
    }
    // the throat of the spring
    const c0 = C('#1f7f88'), c1 = C('#3b4c52');
    const pts = kit.circlePts(0, 0, 0.5, 18, rng, 0.08).map(([x, z]) => new THREE.Vector2(x, z));
    const shp = new THREE.ShapeGeometry(new THREE.Shape(pts)); shp.rotateX(Math.PI / 2); fixFlat(shp);
    sunken.add(shp, M4([SP[0], 0.014, SP[1]]), (x, y, z) => (Math.hypot(x - SP[0], z - SP[1]) < 0.28 ? c0 : c1));
    for (let k = 0; k < 10; k++) { const a = rng() * 6.28, r = rng.range(0.38, 0.62), [x, z] = [SP[0] + Math.cos(a) * r, SP[1] + Math.sin(a) * r]; stone(x, z, rng.range(0.035, 0.07), { y: 0.02, sy: 0.55, clampZ: false }); }
  }
  function fixFlat(g) { const n = g.attributes.normal; let flip = 0; for (let i = 0; i < n.count; i++) flip += n.getY(i); if (flip < 0) { for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0); const ix = g.index; if (ix) { const a = ix.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } } } return g; }

  /* ---------- water meshes ---------- */
  const pondGeo = kit.waterDisc(pond.rx, pond.rz, 80, 14, 0, rng);
  {
    const p = pondGeo.attributes.position, sh = pondGeo.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z / pond.rz, x / pond.rx), e = edge(a) * 1.006;
      const f0 = 1 - sh.getX(i), f1 = 1 - Math.pow(1 - f0, 2.4), k = f0 > 0 ? (f1 / f0) * e : 0;
      // Across the spillway this is no shore: no bright rim, no half-opaque edge, the disc just runs on into the film. river.js tucks the film
      // 3 cm under the disc's edge, and two water layers stacked that wide paint a stripe, so the disc's last rings stop just past the film's start.
      const wx = x * k + pond.x, wz = z * k, mouth = z > 0 ? mouthX(wx) : 0, chan = z > 0 && f1 > 0.98 ? sstep(SLOT.x[0] + 0.12, SLOT.x[0] + 0.22, wx) * (1 - sstep(SLOT.x[1] - 0.25, SLOT.x[1] - 0.15, wx)) : 0;
      p.setXYZ(i, x * k, 0, wz - 0.02 * chan);
      sh.setX(i, Math.max(Math.pow(1 - f1, 0.42), mouth * 0.24));
    }
  }
  // the stock glint threshold paints wide white patches over a small shallow pond; here it is raised to leave fine points
  const fineGlints = (m, lo, hi) => { m.fragmentShader = m.fragmentShader.replace('smoothstep(.86,.90,', `smoothstep(${lo},${hi},`); return m; };
  // the stock shader holds alpha at .5 along the shore and paints a bright rim: on a film this thin, that is two opaque stripes
  const thinFilm = (m, edgeAlpha, rim) => { m.fragmentShader = m.fragmentShader.replace('mix(.5,uOpacity,', `mix(${edgeAlpha},uOpacity,`).replace('rim*.55', `rim*${rim}`); return m; };
  const pondMat = fineGlints(ctx.water({ shallow: '#b4f6e4', deep: '#35bdb6', opacity: 0.44, scale: 4.2 }), '1.26', '1.33');
  const pondMesh = new THREE.Mesh(pondGeo, pondMat); pondMesh.name = 'pond-water';
  pondMesh.position.set(pond.x, WATER.y, pond.z); pondMesh.renderOrder = 2; ctx.noOutline(pondMesh); group.add(pondMesh);

  {
    const rows = [[-1, 0, -0.02], [-0.66, 0.52, -0.004], [0, 1, 0], [0.66, 0.52, -0.004], [1, 0, -0.02]];
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= samples.end; i++) {
      const s = samples[i];
      rows.forEach(([u, shore, dy]) => {
        const hw = (s.w / 2) * (1 + 0.05 * Math.sin(s.d * 5.3 + u * 2) * Math.abs(u));
        const foam = sstep(0.0, 0.25, s.u) * (1 - sstep(0.8, 1, s.u)) * (1 - 0.55 * Math.abs(Math.sin(u * 2.6 + 0.4)) * Math.sin(i * 1.7) ** 2);
        pos.push(s.x - s.tz * hw * u, s.y + dy, s.z + s.tx * hw * u); uv.push(lerp(shore, 0.1, foam), 0);
      });
    }
    const n = rows.length;
    for (let i = 0; i < samples.end; i++) for (let j = 0; j < n - 1; j++) { const a = i * n + j, b = a + 1, c = a + n, d = c + 1; idx.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    const m = new THREE.Mesh(g, thinFilm(fineGlints(ctx.water({ shallow: '#c4eee6', deep: '#6cc9c2', hi: '#dcf4ec', opacity: 0.34, scale: 5.4 }), '1.26', '1.33'), '.2', '.26'));
    m.material.side = THREE.DoubleSide; m.name = 'stream-water'; m.renderOrder = 2; ctx.noOutline(m); group.add(m);
  }

  /* ---------- plants ---------- */
  // petal: base at origin, runs along +z, bends by curl (+ droops); four strips across, uv.x across, uv.y along
  const petal = (l, w, curl = 0, pitch = 0, nz = 3, cup = 0.3) => {
    const pos = [], uv = [], idx = [], cols = [-1, -0.45, 0, 0.45, 1];
    let y = 0, z = 0, a = -pitch;
    for (let i = 0; i <= nz; i++) {
      const t = i / nz, hw = (w / 2) * (Math.pow(Math.sin(Math.PI * Math.min(0.97, 0.12 + t * 0.85)), 0.8));
      cols.forEach((c) => { pos.push(c * hw, y + Math.abs(c) * Math.abs(c) * hw * cup, z); uv.push(c * 0.5 + 0.5, t); });
      a += curl / nz; y -= Math.sin(a) * (l / nz); z += Math.cos(a) * (l / nz);
    }
    const n = cols.length;
    for (let i = 0; i < nz; i++) for (let j = 0; j < n - 1; j++) { const p = i * n + j, q = p + 1, r = p + n, s = r + 1; idx.push(p, r, q, q, r, s); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
  };
  const plantMat = ctx.toon({ vertexColors: true, side: THREE.DoubleSide, translucent: 0.85 });
  const gradCol = (lo, hi, h) => { const a = C(lo), b = C(hi), t = new THREE.Color(); return (x, y) => t.copy(a).lerp(b, clamp(y / h)).clone(); };

  // cattails and reeds
  const reedGeo = (() => {
    const s = new Soup(), R = ctx.seeded('reeds');
    for (let i = 0; i < 13; i++) {
      const h = R.range(0.7, 1.35), w = R.range(0.045, 0.075), a = R() * 6.28, r = Math.sqrt(R()) * 0.19;
      const g = kit.blade(h, w, R.range(0.12, 0.42), 4);
      s.add(g, M4([Math.cos(a) * r, 0, Math.sin(a) * r], [R.range(-0.05, 0.05), R() * 6.28, 0]), gradCol(R() < 0.5 ? P.leafDeep : P.fern, R() < 0.4 ? P.leafGold : P.leafLit, h), { perVertex: true });
    }
    const brown = C('#94603c'), brownLit = C('#b98452'), stem = gradCol(P.leafDeep, P.leafMid, 1.3);
    for (let i = 0; i < 3; i++) {
      const h = R.range(1.15, 1.55), a = (i / 3) * 6.28 + R(), r = R.range(0.04, 0.14), lean = [R.range(-0.05, 0.05), 0, R.range(-0.05, 0.05)], top = h + 0.02;
      const m = M4([Math.cos(a) * r, 0, Math.sin(a) * r], lean);
      s.add(kit.cylBase(0.01, 0.018, h, 4, true), m, stem, { perVertex: true });
      const head = kit.sphere(1, 7, 6); head.scale(0.034, 0.15, 0.034); head.translate(0, top - 0.2, 0);
      s.add(head, m, (x, y) => (y > top - 0.22 ? brownLit : brown));
      s.add(kit.cylBase(0.003, 0.008, 0.13, 3, true).translate(0, top - 0.06, 0), m, brownLit);
    }
    return s.geometry();
  })();

  // irises: sword fans with a few open blooms
  const bloom = (s, m, hi, lo) => {
    const yel = C(P.flowerYellow), wht = C(P.flowerWhite), t = new THREE.Color();
    const fallCol = (x, y, z, nx, ny, nz, u, v) => {
      const c = Math.abs(u - 0.5);
      if (v > 0.18 && v < 0.7 && c < 0.08) return yel;
      if (v < 0.36 && c < 0.3) return wht;
      return t.copy(hi).lerp(lo, sstep(0.3, 0.95, v)).clone();
    };
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * 6.28;
      s.add(petal(0.27, 0.21, 1.75, 0.62, 3, 0.2), m.clone().multiply(M4([0, 0.02, 0], [0, a, 0])), fallCol, { perVertex: true });
      s.add(petal(0.2, 0.15, -0.7, 1.05, 3, 0.35), m.clone().multiply(M4([0, 0.02, 0], [0, a + 1.05, 0])), (x, y, z, nx, ny, nz, u, v) => t.copy(lo).lerp(hi, sstep(0.05, 0.6, v)).clone(), { perVertex: true });
    }
  };
  const irisGeo = (() => {
    const s = new Soup(), R = ctx.seeded('iris');
    const fan = (yaw, n, off) => {
      for (let i = 0; i < n; i++) {
        const h = R.range(0.55, 0.95) * (1 - Math.abs(i - n / 2) * 0.09), a = (i - (n - 1) / 2) * 0.13;
        const g = kit.blade(h, 0.1, 0.06 + Math.abs(a) * 0.5, 4);
        s.add(g, M4([off[0] + (i - n / 2) * 0.02, 0, off[1]], [a * 0.9, yaw + (a < 0 ? Math.PI : 0), 0]), gradCol(P.leafDeep, P.leafLit, h), { perVertex: true });
      }
    };
    fan(0.3, 6, [0, 0]); fan(1.9, 5, [0.12, 0.09]); fan(-1.0, 5, [-0.13, 0.05]);
    const stem = gradCol(P.leafDeep, P.leafMid, 1);
    [[0.06, 0.98, 0.02, '#c6a2ff', '#8a5fe0'], [-0.1, 0.84, 0.1, '#a9c9ff', '#6d8fe8'], [0.14, 0.72, -0.1, '#d9bcff', '#9a6be6']].forEach(([x, h, z, hi, lo]) => {
      s.add(kit.tube([[x * 0.3, 0, z * 0.3], [x * 0.7, h * 0.6, z * 0.7], [x, h, z]], 0.014, 0.01, 4, 6), null, stem, { perVertex: true });
      bloom(s, M4([x, h, z], [R.range(-0.25, 0.25), 0, R.range(-0.25, 0.25)], 0.95), C(hi), C(lo));
    });
    return s.geometry();
  })();

  const instanced = (geo, list, name) => {
    const m = new THREE.InstancedMesh(geo, plantMat, list.length); m.name = name; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = true;
    m.userData.list = list; ctx.softEdge(m); group.add(m); return m;
  };
  const rimP = (d, f) => rim(deg(d), f);
  const REEDS = [[172, 1.03, 1.1], [186, 0.98, 1.2], [198, 1.04, 1.0], [214, 0.99, 0.9], [160, 1.0, 0.82], [294, 1.03, 0.82], [326, 0.97, 1.02], [334, 1.08, 1.1], [352, 1.05, 0.78], [226, 1.06, 0.8]]
    .map(([a, f, s]) => { const [x, z] = rimP(a, f); return { x, z, s, yaw: rng() * 6.28, ph: rng() * 6.28, y: groundAt(x, z) - 0.02 }; });
  const IRIS_AT = [[FLOWER_SPOTS[3][0], FLOWER_SPOTS[3][2], 1.05], [FLOWER_SPOTS[2][0], FLOWER_SPOTS[2][2] + 0.12, 1.0], [...rimP(146, 1.02), 0.92], [...rimP(22, 1.05), 0.88], [...rimP(62, 1.04), 0.8], [...rimP(246, 1.08), 0.86]]
    .map(([x, z, s]) => { z = Math.min(z, Z_MAX - 0.12); return { x, z, s, yaw: rng() * 6.28, ph: rng() * 6.28, y: groundAt(x, z) - 0.01 }; });
  const reedMesh = instanced(reedGeo, REEDS, 'reeds');
  const irisMesh = instanced(irisGeo, IRIS_AT, 'iris');

  // moss cushions, tufts and ferns that bed the stones in
  const low = new Soup();
  {
    const moundOf = (detail) => { let g = new THREE.IcosahedronGeometry(1, detail); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g, 1e-4); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const k = 1 + 0.18 * Math.sin(p.getX(i) * 4 + p.getZ(i) * 3); p.setXYZ(i, p.getX(i) * k, Math.max(p.getY(i), -0.15), p.getZ(i) * k); } g.computeVertexNormals(); return g; };
    const moundL = moundOf(2), moundS = moundOf(1);
    const cushion = (x, z, r, y) => {
      const tone = rng.pick([mossMid, mossMid, C('#6fb24c'), C('#93c95a')]);
      low.add(r > 0.14 ? moundL : moundS, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng() * 6, 0)), new THREE.Vector3(r * rng.range(1, 1.5), r * rng.range(0.34, 0.52), r)), tone);
    };
    const tuft = (x, z, h, y, n = 7) => {
      for (let i = 0; i < n; i++) {
        const b = kit.blade(h * rng.range(0.6, 1.1), 0.05, h * 0.4, 3);
        low.add(b, M4([x + rng.range(-0.07, 0.07), y, z + rng.range(-0.07, 0.07)], [rng.range(-0.1, 0.1), rng() * 6.28, 0]), gradCol(P.fern, rng() < 0.5 ? P.grassLit : P.leafLit, h), { perVertex: false });
      }
    };
    const capGeo = (() => { let g = new THREE.IcosahedronGeometry(1, 2); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g, 1e-4); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)), k = 1 + 0.16 * Math.sin(a * 3 + 1) + 0.09 * Math.sin(a * 7); p.setXYZ(i, p.getX(i) * k, p.getY(i), p.getZ(i) * k); } g.computeVertexNormals(); return g; })();
    for (const c of caps) { low.mute = c.dropped; low.add(capGeo, new THREE.Matrix4().compose(new THREE.Vector3(c.x, c.y, c.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(c.tiltX, 0, c.tiltZ)), new THREE.Vector3(c.r * 1.15, c.h, c.r)), rng() < 0.5 ? mossLit : mossMid); }
    low.mute = false;
    for (let i = 0; i < 20; i++) {
      const a = rng() * 6.28, f = rng.range(1.03, 1.17), [x, z] = rim(a, f), r = rng.range(0.08, 0.2);
      if (z + r > Z_MAX || z - r < Z_MIN - 0.02) continue;
      if (streamDist(x, z).d < 0.55) continue;
      low.mute = inMouth(x, z, r * 1.5); cushion(x, z, r, 0.07); low.mute = false;
    }
    for (let i = 0; i < 30; i++) {
      const a = rng() * 6.28, f = rng.range(1.02, 1.15), [x, z] = rim(a, f);
      if (z > Z_MAX - 0.08 || z < Z_MIN + 0.05 || streamDist(x, z).d < 0.5) continue;
      low.mute = inMouth(x, z, 0.2); tuft(x, z, rng.range(0.22, 0.42), 0.05); low.mute = false;
    }
    for (let i = 6; i < samples.lip; i += 3) {
      const s = samples[i], side = rng.sign(), off = s.w / 2 + rng.range(0.1, 0.28), x = s.x - s.tz * off * side, z = s.z + s.tx * off * side;
      if (rng() < 0.3) cushion(x, z, rng.range(0.06, 0.13), s.y - 0.04);
      else if (s.cz > 6.9 || rng() < 0.4) tuft(x, z, rng.range(0.14, 0.26), s.y - 0.05, 5);
    }
    // ferns tucked behind the big west and north-east stones
    for (const [a, f, s] of [[182, 1.14, 1.1], [172, 1.16, 0.9], [318, 1.14, 0.9], [204, 1.13, 0.8]]) {
      const [x, z] = rimP(a, f);
      for (let i = 0; i < 5; i++) low.add(kit.frond(0.62 * s, 5, 0.2), M4([x, 0.05, z], [0, (i / 6) * 6.28 + rng() * 0.4, 0]), gradCol(P.fern, P.leafLit, 0.3), { perVertex: true });
    }
  }
  finishSoup(low, 'rim-plants', plantMat, { cast: false, soft: true });
  finishSoup(stones, 'stones', ctx.toon({ vertexColors: true, moss: 0.42 }), { cast: true });
  finishSoup(sunken, 'sunken-stones', ctx.toon({ vertexColors: true }), { cast: false, soft: true });

  /* ---------- lily pads, lily flowers, water weeds: one CPU-animated mesh ---------- */
  const dyn = new Soup(), rigid = [], bendy = [];
  const padGeo = (r) => {
    const n = 16, notch = 0.32, pos = [];
    const y = (rr) => 0.012 * rr * rr;
    for (let i = 0; i < n; i++) {
      const a0 = notch + ((6.28 - notch * 2) * i) / n, a1 = notch + ((6.28 - notch * 2) * (i + 1)) / n;
      const r0 = 1 + 0.05 * Math.sin(i * 2.3), r1 = 1 + 0.05 * Math.sin((i + 1) * 2.3);
      const p = (a, q) => [Math.cos(a) * q, y(q) * 4, Math.sin(a) * q];
      pos.push(0, 0.004, 0, ...p(a1, 0.62 * r1), ...p(a0, 0.62 * r0));
      pos.push(...p(a0, 0.62 * r0), ...p(a1, 0.62 * r1), ...p(a1, r1));
      pos.push(...p(a0, 0.62 * r0), ...p(a1, r1), ...p(a0, r0));
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.scale(r, r, r); g.computeVertexNormals();
    const nn = g.attributes.normal; for (let i = 0; i < nn.count; i++) if (nn.getY(i) < 0) nn.setXYZ(i, -nn.getX(i), -nn.getY(i), -nn.getZ(i));
    return g;
  };
  const skyward = (g, k) => { const n = g.attributes.normal, v = new THREE.Vector3(); for (let i = 0; i < n.count; i++) { v.fromBufferAttribute(n, i); v.y += k; v.normalize(); n.setXYZ(i, v.x, v.y, v.z); } return g; };
  const padA = C('#55bd5c'), padB = C('#4cb35e'), padC = C('#86d666'), padD = C('#37a064');
  const addPad = (x, z, r, yaw, flower) => {
    const start = dyn.verts, seedA = rng() * 6.28;
    dyn.add(padGeo(r), M4([0, 0, 0], [0, yaw, 0]), (px, py, pz) => {
      const d = Math.hypot(px, pz) / r, ang = Math.atan2(pz, px) + seedA, stripe = Math.sin(ang * 8) > 0;
      return d > 0.9 ? padD : d < 0.18 ? padC : stripe ? padA : padB;
    });
    if (flower === 'open') {
      const m = M4([r * 0.1, 0.02, -r * 0.05]), out = C('#ffd4e4'), mid = C('#ffb4d0'), core = C('#ff8fbe'), yel = C(P.flowerYellow), root = C('#ffeef2');
      const tmp = new THREE.Color();
      const ring = (n, l, w, tilt, c, h, off = 0) => { for (let i = 0; i < n; i++) { const g = petal(l, w, -0.35, tilt, 3, 0.35); skyward(g, 1.4); g.rotateY((i / n) * 6.28 + off); g.translate(0, h, 0); dyn.add(g, m, (px, py, pz, nx, ny, nz, u, v) => tmp.copy(root).lerp(c, sstep(0.15, 0.85, v)).clone(), { perVertex: true }); } };
      ring(9, 0.27, 0.14, 0.12, out, 0, 0); ring(8, 0.22, 0.125, 0.55, mid, 0.01, 0.2); ring(6, 0.16, 0.1, 0.95, core, 0.015, 0.1);
      dyn.add(kit.cylBase(0.045, 0.03, 0.045, 7), m, yel);
    } else if (flower === 'bud') {
      const m = M4([r * 0.2, 0.0, r * 0.1], [0.12, 0, 0.1]), a = C('#ffa4c6'), b = C('#6fcb6a');
      for (let i = 0; i < 5; i++) { const g = petal(0.27, 0.14, -0.55, 0.85, 3, 0.3); g.rotateY((i / 5) * 6.28); dyn.add(g, m, (px, py) => (py > 0.07 ? a : b), { perVertex: true }); }
    }
    rigid.push({ start, end: dyn.verts, x, z, ph: rng() * 6.28, r });
  };
  const notOnDrip = (x, z) => Math.hypot(x - 3.0, z - 10.2) > 0.6 && Math.hypot(x - 0.4, z - 9.6) > 0.6;
  {
    const clusters = [
      { c: [3.75, 10.75], n: [[0, 0, 0.44, 'open'], [0.68, -0.28, 0.33, 0], [-0.62, 0.1, 0.36, 0], [0.26, 0.5, 0.26, 'bud'], [-0.2, -0.6, 0.3, 0], [0.98, 0.26, 0.24, 0]] },
      { c: [-0.2, 10.15], n: [[0, 0, 0.4, 'open'], [0.56, 0.32, 0.3, 0], [0.42, -0.42, 0.26, 0], [-0.1, 0.62, 0.24, 'bud']] },
      { c: [2.4, 8.95], n: [[0, 0, 0.3, 0], [0.5, 0.14, 0.24, 0], [0.86, -0.1, 0.2, 'open']] },
    ];
    for (const cl of clusters) for (const [dx, dz, r, fl] of cl.n) {
      const x = cl.c[0] + dx, z = cl.c[1] + dz;
      if (!notOnDrip(x, z) || polar(x, z).f > 0.95) continue;
      addPad(x, z, r, rng() * 6.28, fl);
    }
  }
  for (const p of rigid) { // pads are modelled at the origin; move them to their place
    for (let i = p.start; i < p.end; i++) { dyn.p[i * 3] += p.x; dyn.p[i * 3 + 1] += WATER.y + 0.016; dyn.p[i * 3 + 2] += p.z; }
  }
  const weedPal = [C(P.leafDeep), C(P.leafShade), C('#3fb07a'), C('#58c07a')];
  for (let i = 0; i < 15; i++) {
    const a = rng() * 6.28, f = rng.range(0.42, 0.86), [x, z] = rim(a, f), y0 = bedAt(x, z), n = rng.int(3, 5), col = rng.pick(weedPal);
    for (let k = 0; k < n; k++) {
      const h = Math.max(0.12, -0.11 - y0) * rng.range(0.7, 1), b = kit.blade(h, rng.range(0.05, 0.08), h * 0.2, 6), start = dyn.verts;
      dyn.add(b, M4([x + rng.range(-0.08, 0.08), y0, z + rng.range(-0.08, 0.08)], [0, rng() * 6.28, 0]), col);
      bendy.push({ start, end: dyn.verts, y0, h, ph: rng() * 6.28 + x });
    }
  }
  const dynGeo = dyn.geometry();
  const dynBase = dynGeo.attributes.position.array.slice();
  // petals are seen from both faces; three flips the normal on back faces, which turns the inner ring black under the cel ramp
  const dynMat = ctx.toon({ vertexColors: true, side: THREE.DoubleSide, translucent: 0.5 });
  {
    const inner = dynMat.onBeforeCompile, key = dynMat.customProgramCacheKey();
    dynMat.onBeforeCompile = (sh, r) => { inner(sh, r); sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', '')); };
    dynMat.customProgramCacheKey = () => key + '|oneface';
  }
  const dynMesh = finishSoup(dyn, 'lilies-weeds', dynMat, { cast: false, soft: true, geo: dynGeo });
  dynMesh.frustumCulled = false;

  /* ---------- koi: one merged, CPU-skinned mesh; the tail is hinged at the peduncle ---------- */
  const KOI = [
    { base: '#fff4e2', blots: ['#ee5a25', '#ee5a25', '#f47a2c'], head: null, L: 0.66 },
    { base: '#ff8a2e', blots: ['#fff0d8', '#ffc24a'], head: null, L: 0.56 },
    { base: '#ffe9c8', blots: ['#dc3f26', '#30414a'], head: '#dc3f26', L: 0.6 },
    { base: '#ffcf57', blots: ['#fff0c0', '#ffa63a'], head: null, L: 0.52 },
    { base: '#fff8ee', blots: ['#f0602a'], head: '#e8462a', L: 0.48 },
    { base: '#f4622a', blots: ['#30414a', '#ffe7c4'], head: null, L: 0.58 },
  ];
  const koiRows = KOI.length + 1;
  const koiTex = ctx.canvasTexture(512, 7 * 64, (g, W, H) => {
    const R = ctx.seeded('koi'), rh = H / koiRows;
    KOI.forEach((k, r) => {
      const y0 = r * rh;
      g.save(); g.beginPath(); g.rect(0, y0, W, rh); g.clip();
      g.fillStyle = k.base; g.fillRect(0, y0, W, rh);
      for (let b = 0; b < 7; b++) {
        g.fillStyle = k.blots[b % k.blots.length];
        const u = R.range(0.06, 0.8) * W, v = R.range(0.22, 0.78) * rh; // patches sit on the back (v≈.5)
        g.beginPath(); g.ellipse(u, y0 + v, R.range(30, 72), R.range(9, 18), 0, 0, 7); g.fill();
        g.beginPath(); g.ellipse(u + R.range(-20, 20), y0 + v + R.range(-8, 8), R.range(14, 34), R.range(7, 12), 0, 0, 7); g.fill();
      }
      if (k.head) { g.fillStyle = k.head; g.beginPath(); g.ellipse(W * 0.885, y0 + rh * 0.5, 30, 15, 0, 0, 7); g.fill(); }
      // pale belly
      g.fillStyle = 'rgba(255,250,236,.9)'; g.fillRect(0, y0, W, rh * 0.12); g.fillRect(0, y0 + rh * 0.88, W, rh * 0.12);
      // eyes
      g.fillStyle = '#20303a'; for (const v of [0.27, 0.73]) { g.beginPath(); g.arc(W * 0.915, y0 + rh * v, 5.5, 0, 7); g.fill(); }
      g.restore();
    });
    // fin swatches, one per fish, in the last row
    const fw = W / KOI.length, y = (koiRows - 1) * rh;
    KOI.forEach((k, i) => { const gr = g.createLinearGradient(0, y, 0, y + rh); gr.addColorStop(0, '#fffaf0'); gr.addColorStop(1, k.blots[0]); g.fillStyle = gr; g.fillRect(i * fw, y, fw, rh); });
  }, { repeat: false, filter: false });
  koiTex.generateMipmaps = false; koiTex.minFilter = THREE.LinearFilter;

  const fishPos = [], fishNor = [], fishUV = [], fishKind = [], fishIdx = [];
  const fishRanges = [];
  {
    const pushTri = (a, b, c, na, nb, nc, ua, ub, uc, kind, fi) => {
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const fn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      if (fn[0] * na[0] + fn[1] * na[1] + fn[2] * na[2] < 0) { [b, c] = [c, b]; [nb, nc] = [nc, nb]; [ub, uc] = [uc, ub]; }
      for (const [p, n, u] of [[a, na, ua], [b, nb, ub], [c, nc, uc]]) { fishPos.push(...p); fishNor.push(...n); fishUV.push(...u); fishKind.push(kind); fishIdx.push(fi); }
    };
    KOI.forEach((k, fi) => {
      const start = fishPos.length / 3, rows = 14, seg = 10, vTop = 1 - fi / koiRows, vH = 1 / koiRows;
      const ring = [];
      for (let r = 0; r <= rows; r++) {
        const t = r / rows, z = 0.5 - t * 0.78, q = Math.pow(Math.sin(Math.PI * Math.pow(t * 0.9 + 0.09, 0.62)), 0.85);
        const w = 0.118 * q + 0.008, h = 0.135 * q + 0.01, row = [];
        for (let s = 0; s <= seg; s++) {
          const an = (s / seg) * Math.PI * 2, nx = Math.sin(an), ny = -Math.cos(an);
          const P_ = [nx * w, ny * h * (ny < 0 ? 0.85 : 1), z], Nn = [nx / w, ny / h, 0.0], l = Math.hypot(...Nn);
          row.push({ p: P_, n: Nn.map((c) => c / l), u: [lerp(0.99, 0.01, t), vTop - vH * (s / seg)] });
        }
        ring.push(row);
      }
      for (let r = 0; r < rows; r++) for (let s = 0; s < seg; s++) {
        const a = ring[r][s], b = ring[r][s + 1], c = ring[r + 1][s], d = ring[r + 1][s + 1];
        pushTri(a.p, b.p, c.p, a.n, b.n, c.n, a.u, b.u, c.u, 0, fi); pushTri(b.p, d.p, c.p, b.n, d.n, c.n, b.u, d.u, c.u, 0, fi);
      }
      const finU = [(fi + 0.5) / KOI.length, 1 / koiRows - 0.01 - 0.04], finT = [(fi + 0.5) / KOI.length, 0.012];
      // crossed, forked tail: two sheets so it reads from above and from the side
      for (const roll of [0.85, -0.85]) {
        const q = (y, z) => [Math.sin(roll) * y, Math.cos(roll) * y, z], nr = [Math.cos(roll), -Math.sin(roll), 0];
        const root0 = q(0.016, -0.26), root1 = q(-0.016, -0.26), hi = q(0.15, -0.56), md = q(0, -0.45), lo = q(-0.15, -0.56), ha = q(0.08, -0.44), la = q(-0.08, -0.44);
        pushTri(root0, ha, md, nr, nr, nr, finU, finT, finU, 1, fi); pushTri(ha, hi, md, nr, nr, nr, finT, finT, finU, 1, fi);
        pushTri(root1, md, la, nr, nr, nr, finU, finU, finT, 1, fi); pushTri(la, md, lo, nr, nr, nr, finT, finU, finT, 1, fi);
        pushTri(root0, root1, md, nr, nr, nr, finU, finU, finU, 1, fi);
      }
      // dorsal fin
      { const n = [1, 0, 0], a = [0, 0.13, 0.14], b = [0, 0.195, 0.03], c = [0, 0.14, -0.05], d = [0, 0.085, -0.14]; pushTri(a, b, c, n, n, n, finU, finT, finU, 0, fi); pushTri(a, c, d, n, n, n, finU, finU, finU, 0, fi); }
      // pectoral and ventral fins, flared flat so they show from above
      for (const side of [1, -1]) for (const [z, len, wide, kind] of [[0.26, 0.2, 0.1, side > 0 ? 2 : 3], [-0.02, 0.12, 0.06, 0]]) {
        const n = [0, 1, 0], a = [side * 0.09, -0.05, z], b = [side * (0.09 + len), -0.07, z - wide * 1.3], c = [side * (0.09 + len * 0.55), -0.06, z - wide * 1.9], d = [side * 0.085, -0.05, z - wide * 1.3];
        pushTri(a, b, c, n, n, n, finU, finT, finT, kind, fi); pushTri(a, c, d, n, n, n, finU, finT, finU, kind, fi);
      }
      fishRanges.push([start, fishPos.length / 3]);
    });
  }
  const fishGeo = new THREE.BufferGeometry();
  fishGeo.setAttribute('position', new THREE.Float32BufferAttribute(fishPos.slice(), 3).setUsage(THREE.DynamicDrawUsage));
  fishGeo.setAttribute('normal', new THREE.Float32BufferAttribute(fishNor.slice(), 3).setUsage(THREE.DynamicDrawUsage));
  fishGeo.setAttribute('uv', new THREE.Float32BufferAttribute(fishUV, 2));
  const fishMesh = new THREE.Mesh(fishGeo, ctx.toon({ map: koiTex, side: THREE.DoubleSide, emissive: '#ffffff', emissiveMap: koiTex, emissiveIntensity: 0.2, translucent: 0.25 }));
  fishMesh.name = 'koi'; fishMesh.castShadow = false; fishMesh.receiveShadow = false; fishMesh.frustumCulled = false; ctx.softEdge(fishMesh);
  group.add(fishMesh);

  // closed-form paths, in the unit disc of the swimmable ellipse. Each is a steady loop (r1) carrying a slower wander (r2):
  // keep r1·|w1| > 1.5·r2·hypot(w2, w3), so the path speed never reaches zero and a fish never has to reverse on the spot.
  // The loops all run the same way in separate lanes, which keeps crossings rare and slow. Paired fish share a path;
  // lag·(minimum speed) > |ofs| keeps the follower from ever landing on its leader.
  const SWIM = 0.58; // bed is below -0.3 inside this radius
  const paths = [
    { r1: 0.38, r2: 0.11, w1: 0.2, w2: -0.31, w3: 0.23, p1: 0.2, p2: 1.1, p3: 2.2, lag: 0, ofs: [0, 0] },
    { r1: 0.38, r2: 0.11, w1: 0.2, w2: -0.31, w3: 0.23, p1: 0.2, p2: 1.1, p3: 2.2, lag: 3.4, ofs: [0.025, -0.035] },
    { r1: 0.27, r2: 0.1, w1: 0.23, w2: 0.27, w3: -0.17, p1: 2.9, p2: 0.4, p3: 4.1, lag: 0, ofs: [0, 0] },
    { r1: 0.42, r2: 0.09, w1: 0.17, w2: 0.25, w3: 0.31, p1: 4.4, p2: 3.2, p3: 0.9, lag: 0, ofs: [0, 0] },
    { r1: 0.42, r2: 0.09, w1: 0.17, w2: 0.25, w3: 0.31, p1: 4.4, p2: 3.2, p3: 0.9, lag: 4.1, ofs: [-0.025, 0.025] },
    { r1: 0.17, r2: 0.09, w1: 0.26, w2: -0.2, w3: 0.25, p1: 5.6, p2: 2.1, p3: 5.0, lag: 0, ofs: [0, 0] },
  ];
  const BEAT = [3.1, 3.1, 3.0, 3.0, 3.0, 3.0]; // tail rate, rad/s: constant, so the phase stays proportional to t at any uptime
  const DEPTH = [0, 0.05, 0.03, 0.08, 0.016, 0.064]; // fixed swim depths: fish that cross read as passing over one another
  const rawPath = (i, t) => {
    const q = paths[i], T = t - q.lag;
    return [q.r1 * Math.cos(q.w1 * T + q.p1) + q.r2 * Math.cos(q.w2 * T + q.p2) + q.ofs[0], q.r1 * Math.sin(q.w1 * T + q.p1) + q.r2 * Math.sin(q.w3 * T + q.p3) + q.ofs[1]];
  };
  // d(rawPath)/dt in metres per second
  const pathTangent = (i, t) => {
    const q = paths[i], T = t - q.lag;
    return [(-q.r1 * q.w1 * Math.sin(q.w1 * T + q.p1) - q.r2 * q.w2 * Math.sin(q.w2 * T + q.p2)) * pond.rx, (q.r1 * q.w1 * Math.cos(q.w1 * T + q.p1) + q.r2 * q.w3 * Math.cos(q.w3 * T + q.p3)) * pond.rz];
  };
  const swimAt = (t, out) => {
    const n = paths.length, raw = paths.map((_, i) => rawPath(i, t));
    // stateless, loose separation; radius measured in metres, not disc units. It is zero at d = 0, where (ax, az) / d
    // flips as two fish cross, and stays gentle enough on both slopes that it can only bend a crossing, never jump it.
    for (let i = 0; i < n; i++) {
      let dx = 0, dz = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const ax = (raw[i][0] - raw[j][0]) * pond.rx, az = (raw[i][1] - raw[j][1]) * pond.rz, d = Math.hypot(ax, az) + 1e-4;
        const push = sstep(0, 0.45, d) * sstep(0.95, 0.45, d) * 0.08; dx += (ax / d) * push; dz += (az / d) * push;
      }
      let u = raw[i][0] + dx / pond.rx, v = raw[i][1] + dz / pond.rz;
      const f = Math.hypot(u, v); if (f > SWIM) { const k = SWIM + (1 - Math.exp(-(f - SWIM) * 4)) * 0.05; u *= k / f; v *= k / f; }
      out[i * 2] = u; out[i * 2 + 1] = v;
    }
    return out;
  };
  const sw = new Float32Array(paths.length * 2);
  const fPos = fishGeo.attributes.position, fNor = fishGeo.attributes.normal;
  function updateFish(t) {
    swimAt(t, sw);
    KOI.forEach((k, i) => {
      const x = pond.x + sw[i * 2] * pond.rx, z = pond.z + sw[i * 2 + 1] * pond.rz;
      // heading looks one second ahead along the path, so the body starts into a turn before the path does
      const [vx, vz] = pathTangent(i, t), [ax, az] = pathTangent(i, t + 1), speed = Math.hypot(vx, vz);
      const yaw = Math.atan2(vx + ax, vz + az), cy = Math.cos(yaw), sy = Math.sin(yaw), L = k.L;
      const y = -0.2 - DEPTH[i] + 0.035 * Math.sin(t * 0.37 + i * 2.1);
      const ph = t * BEAT[i] * (1 + 0.05 * i) + i * 1.7 + 1.4 * Math.sin(t * 0.31 + i); // speed may only scale amp and flex: never multiply t by it
      const amp = 0.05 + clamp(speed) * 0.05;
      const flex = Math.sin(ph - 1.1) * (0.3 + clamp(speed) * 0.35), cf = Math.cos(flex), sf = Math.sin(flex);
      const paddle = Math.sin(ph * 0.4 + i) * 0.5 + 0.5;
      const [a, b] = fishRanges[i];
      for (let v = a; v < b; v++) {
        let px = fishPos[v * 3], py = fishPos[v * 3 + 1], pz = fishPos[v * 3 + 2];
        let nx = fishNor[v * 3], ny = fishNor[v * 3 + 1], nz = fishNor[v * 3 + 2];
        const kind = fishKind[v];
        if (kind === 1) { // tail hinge
          const dz = pz + 0.26, tx = px * cf + dz * sf, tz = -px * sf + dz * cf; px = tx; pz = tz - 0.26;
          const tn = nx * cf + nz * sf; nz = -nx * sf + nz * cf; nx = tn;
        } else if (kind >= 2) { // pectorals fold in as it glides
          const s = kind === 2 ? 1 : -1, q = Math.abs(px) - 0.09; px -= s * q * paddle * 0.45; pz -= q * paddle * 0.4;
        }
        const back = clamp((0.5 - Math.max(pz, -0.28)) / 0.78);
        px += amp * back * back * Math.sin(ph + (Math.max(pz, -0.28)) * 5.0);
        px *= L; py *= L; pz *= L;
        fPos.setXYZ(v, x + px * cy + pz * sy, y + py, z - px * sy + pz * cy);
        fNor.setXYZ(v, nx * cy + nz * sy, ny, -nx * sy + nz * cy);
      }
    });
    fPos.needsUpdate = true; fNor.needsUpdate = true;
  }

  /* ---------- flecks: drifting dashes, spring rings, cascade foam, glints — one instanced 4-point shard ---------- */
  const shard = (() => {
    const pos = [], l = 0.5, w = 0.5, in_ = 0.14;
    const rimPts = [[0, l], [in_, in_], [w, 0], [in_, -in_], [0, -l], [-in_, -in_], [-w, 0], [-in_, in_]];
    for (let i = 0; i < 8; i++) { const a = rimPts[i], b = rimPts[(i + 1) % 8]; pos.push(0, 0, 0, b[0], 0, b[1], a[0], 0, a[1]); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); return g;
  })();
  const N_FLOW = 28, RING_N = 5, N_RING = 3 * RING_N, N_GLINT = 16, N_FLECK = N_FLOW + N_RING + N_GLINT, N_FOAM = 44;
  const flecks = new THREE.InstancedMesh(shard, new THREE.MeshBasicMaterial({ color: '#f6fff4', transparent: true, opacity: 0.92, depthWrite: false, side: THREE.DoubleSide }), N_FLECK);
  flecks.name = 'flecks'; flecks.frustumCulled = false; flecks.renderOrder = 3; flecks.castShadow = false; ctx.noOutline(flecks); group.add(flecks);
  const foamMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(0.5, 9).rotateX(-Math.PI / 2), flecks.material, N_FOAM);
  foamMesh.name = 'cascade-foam'; foamMesh.frustumCulled = false; foamMesh.renderOrder = 3; foamMesh.castShadow = false; ctx.noOutline(foamMesh); group.add(foamMesh);
  const fm = new THREE.Matrix4(), fq = new THREE.Quaternion(), fp = new THREE.Vector3(), fs = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  const setFleck = (mesh, i, x, y, z, yaw, sx, sz) => { fp.set(x, y, z); fq.setFromAxisAngle(UP, yaw); fs.set(Math.max(sx, 1e-4), 1, Math.max(sz, 1e-4)); fm.compose(fp, fq, fs); mesh.setMatrixAt(i, fm); };
  const streamAt = (d) => { // sample by distance past the spring
    const end = samples[samples.end].d; const q = clamp(d, 0, end); let lo = 0, hi = samples.end;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (samples[m].d < q) lo = m; else hi = m; }
    return samples[lo];
  };
  const glintSpots = Array.from({ length: N_GLINT }, (_, i) => { const a = hash(i, 3) * 6.28, f = Math.sqrt(hash(i, 5)) * 0.9, [x, z] = rim(a, f); return { x, z, p: 1.8 + hash(i, 7) * 2.2, h: hash(i, 9), s: 0.12 + hash(i, 11) * 0.14 }; });
  const streamLen = samples[samples.lip].d;
  const footX = SE.x, footZ = SE.z;
  function updateFlecks(t) {
    let i = 0;
    for (let k = 0; k < N_FLOW; k++, i++) {
      const h = hash(k, 1), speed = 0.42 + h * 0.3, d = frac(hash(k, 2) + (t * speed) / streamLen) * streamLen + 0.05;
      const s = streamAt(d), lat = (hash(k, 4) - 0.5) * 0.78 * s.w + Math.sin(t * 1.3 + k) * 0.015;
      const fade = sstep(0, 0.5, d) * (1 - sstep(streamLen - 0.4, streamLen, d));
      setFleck(flecks, i, s.x - s.tz * lat, s.y + 0.012, s.z + s.tx * lat, Math.atan2(s.tx, s.tz), 0.028 * fade, (0.13 + h * 0.16) * fade);
    }
    for (let r = 0; r < 3; r++) {
      const q = frac(t * 0.36 + r / 3), rad = 0.07 + q * 0.33, fade = sstep(0, 0.2, q) * (1 - q);
      for (let k = 0; k < RING_N; k++, i++) {
        const a = (k / RING_N) * 6.28 + r * 0.7 + Math.sin(t * 0.7 + k) * 0.08;
        setFleck(flecks, i, SP[0] + Math.cos(a) * rad, 0.066, SP[1] + Math.sin(a) * rad, -a, 0.062 * fade, (0.2 + rad * 0.7) * fade * 0.66);
      }
    }
    // foam: a crescent gathers at the foot of the fall, flecks peel off it and melt into the pond
    const w = SE.w * 0.62, nx = -SE.tz, nz = SE.tx;
    for (let k = 0; k < N_FOAM; k++) {
      const h = hash(k, 13), u = hash(k, 15) * 2 - 1, p = frac(t * (0.3 + h * 0.34) + hash(k, 17));
      const arc = (1 - u * u) * 0.14, drift = k < 16 ? 0.05 * p : p * (0.5 + h * 0.3);
      const along = arc + drift - 0.08, lat = u * w * (1 + (k < 16 ? 0 : p * 0.5));
      const sz = (k < 16 ? 0.16 + 0.11 * h : 0.05 + 0.08 * h) * Math.sin(Math.PI * clamp(p * 1.05 + 0.02));
      setFleck(foamMesh, k, footX + nx * lat + SE.tx * along, WATER.y + 0.012, footZ + nz * lat + SE.tz * along, h * 6.28, sz, sz * (0.72 + h * 0.2));
    }
    foamMesh.instanceMatrix.needsUpdate = true;
    for (const g of glintSpots) {
      const q = Math.max(0, Math.sin((t / g.p + g.h) * 6.283)), a = q * q * q * q * q * q;
      const sz = g.s * a; setFleck(flecks, i++, g.x, WATER.y + 0.016, g.z, 0.78, sz * 0.75, sz * 1.5);
    }
    flecks.instanceMatrix.needsUpdate = true;
  }

  /* ---------- animation ---------- */
  const im = new THREE.Matrix4(), iq = new THREE.Quaternion(), ip = new THREE.Vector3(), is = new THREE.Vector3(), ie = new THREE.Euler();
  const swayPlants = (mesh, t) => {
    mesh.userData.list.forEach((p, i) => {
      const g = ctx.wind(t, p.x, p.z), a = g * 0.055 + 0.012 * Math.sin(t * 1.9 + p.ph);
      ie.set(a * 0.6, p.yaw, a * 0.9 + 0.01 * Math.sin(t * 1.3 + p.ph * 2), 'XZY');
      iq.setFromEuler(ie); ip.set(p.x, p.y, p.z); is.setScalar(p.s); im.compose(ip, iq, is); mesh.setMatrixAt(i, im);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  const dPos = dynGeo.attributes.position;
  dPos.setUsage(THREE.DynamicDrawUsage);
  const updateDyn = (t) => {
    const a = dPos.array;
    for (const p of rigid) {
      const bob = 0.009 * Math.sin(t * 0.9 + p.ph) + 0.005 * Math.sin(t * 1.7 + p.ph * 1.7);
      const tx = 0.022 * Math.sin(t * 0.7 + p.ph * 2.3), tz = 0.022 * Math.sin(t * 0.83 + p.ph * 1.3);
      const yaw = 0.05 * Math.sin(t * 0.21 + p.ph), c = Math.cos(yaw), s = Math.sin(yaw);
      for (let v = p.start; v < p.end; v++) {
        const j = v * 3, dx = dynBase[j] - p.x, dz = dynBase[j + 2] - p.z;
        a[j] = p.x + dx * c + dz * s; a[j + 2] = p.z - dx * s + dz * c;
        a[j + 1] = dynBase[j + 1] + bob + dx * tx + dz * tz;
      }
    }
    for (const w of bendy) {
      const sx = 0.075 * Math.sin(t * 0.8 + w.ph) + 0.03 * Math.sin(t * 1.9 + w.ph * 2), sz = 0.06 * Math.sin(t * 0.67 + w.ph * 1.3);
      for (let v = w.start; v < w.end; v++) {
        const j = v * 3, q = (dynBase[j + 1] - w.y0) / w.h, k = q * q;
        a[j] = dynBase[j] + sx * k; a[j + 2] = dynBase[j + 2] + sz * k;
      }
    }
    dPos.needsUpdate = true;
  };

  // ripples: one per 1.5 s bucket, jittered inside it (so 1–2 s apart on average); the bucket index seeds time and place
  const PERIOD = 1.5; let lastK = -1;
  const update = (t) => {
    const k = Math.floor(t / PERIOD);
    if (k !== lastK && t - k * PERIOD >= hash(k, 19) * 0.5) {
      lastK = k;
      const a = hash(k, 21) * 6.283, f = 0.25 + Math.sqrt(hash(k, 23)) * 0.65, [x, z] = rim(a, f);
      ctx.addRipple(x, z);
    }
    updateFish(t); updateFlecks(t); updateDyn(t);
    swayPlants(reedMesh, t); swayPlants(irisMesh, t);
  };
  update(0);
  return { group, update };
}
