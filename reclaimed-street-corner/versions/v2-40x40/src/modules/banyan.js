// The old banyan: fused trunk strands, gripping roots, limbs, aerial-root curtains, swaying anime canopy.

export function build(ctx) {
  const { THREE, layout, P, kit } = ctx;
  const { TREE, BUILDING, SUN_DIR, pointInPoly, HERO_CAM, TOWN, GROVE, WRECK, GROUND } = layout;
  let rng = ctx.rng; // swapped for a side stream around the v2 reach, so the hand-tuned trunk and rooms keep every draw they had
  const V = THREE.Vector3, Color = THREE.Color;
  const SUN = new V(...SUN_DIR), MOSS_DIR = new V(-SUN.x, 0.22, -SUN.z).normalize();
  const group = new THREE.Group(); group.name = 'banyan';
  const sways = [];
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const SL = BUILDING.slabs;

  // ---------------------------------------------------------------- noise
  const hash = (i, j, k) => { const h = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453; return h - Math.floor(h); };
  function vnoise(x, y, z) {
    const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z);
    let u = x - i, v = y - j, w = z - k; u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v); w = w * w * (3 - 2 * w);
    const m = (a, b, t) => a + (b - a) * t;
    return m(m(m(hash(i, j, k), hash(i + 1, j, k), u), m(hash(i, j + 1, k), hash(i + 1, j + 1, k), u), v),
      m(m(hash(i, j, k + 1), hash(i + 1, j, k + 1), u), m(hash(i, j + 1, k + 1), hash(i + 1, j + 1, k + 1), u), v), w);
  }

  // ---------------------------------------------------------------- bark
  const WARM = new Color('#8a6a4a'), MOSS_T = 0.66;
  const BARK = {
    lit: new Color('#e2c294').lerp(WARM, 0.1), mid: new Color('#b39272').lerp(WARM, 0.1), deep: new Color('#83695a').lerp(WARM, 0.3), groove: new Color('#5e4a42'),
  };
  BARK.young = new Color('#c79a6c').lerp(BARK.mid, 0.35).lerp(BARK.deep, 0.5);
  const tmpC = new Color();
  function barkColor(p, n, ridge, o) {
    const s = n.dot(SUN);
    const nz = vnoise(p.x * 1.1, p.y * 0.55, p.z * 1.1);
    const v = 0.46 + ridge * 0.34 + s * 0.2 + (nz - 0.5) * 0.5 + (o.lift || 0);
    if (o.young) tmpC.copy(BARK.young).lerp(BARK.deep, clamp(0.5 - v));
    else tmpC.copy(v > 0.66 ? BARK.lit : v > 0.42 ? BARK.mid : v > 0.24 ? BARK.deep : BARK.groove);
    return tmpC;
  }
  /** Moss field. Stored per vertex and thresholded per pixel, so patches keep a crisp painted edge however long the triangles are. */
  const mossField = (p, n, o) => n.dot(MOSS_DIR) * 0.34 + Math.max(n.y, 0) * 0.3 + (vnoise(p.x * 0.8 + 9, p.y * 0.5, p.z * 0.8) - 0.5) * 1.7 + (vnoise(p.x * 2, p.y * 1.7 + 4, p.z * 2) - 0.5) * 0.4 + (o.moss ?? 0);

  /** Accumulates tubes into one indexed mesh. Colors are per-vertex bands, so kit.merge/Batch are bypassed. */
  class Bark {
    constructor() { this.pos = []; this.col = []; this.moss = []; this.idx = []; }
    /** rs: [r0,r1] over arc length, or one radius per control point. o: radial, step, seg, flute, lobes, twist, lump, moss, lift, young. */
    tube(pts, rs, o = {}) {
      const cp = [];
      for (const q of pts) { const p = q instanceof V ? q.clone() : new V(...q); if (!cp.length || cp[cp.length - 1].distanceTo(p) > 0.02) cp.push(p); }
      if (cp.length < 2) return;
      const { radial = 6, step = 0.4, seg = 0, flute = 0, lobes = 3, twist = 1, lump = 0.05 } = o;
      const curve = new THREE.CatmullRomCurve3(cp, false, 'centripetal');
      curve.arcLengthDivisions = Math.max(60, cp.length * 12);
      const len = curve.getLength(), n = seg || Math.max(3, Math.ceil(len / step));
      const fr = curve.computeFrenetFrames(n, false), perCP = rs.length === cp.length && rs.length !== 2;
      const base = this.pos.length / 3, ph = rng() * 6.28, ph2 = rng() * 6.28, P0 = new V(), N = new V(), Q = new V();
      for (let i = 0; i <= n; i++) {
        const u = i / n; curve.getPointAt(u, P0);
        let r;
        if (perCP) { const f = curve.getUtoTmapping(u) * (cp.length - 1), a = Math.min(Math.floor(f), cp.length - 2); r = lerp(rs[a], rs[a + 1], f - a); } else r = lerp(rs[0], rs[1], u);
        for (let j = 0; j < radial; j++) {
          const a = (j / radial) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
          N.copy(fr.normals[i]).multiplyScalar(c).addScaledVector(fr.binormals[i], s);
          const ridge = flute ? Math.cos(lobes * a + twist * u * 6.28 + ph) : 0;
          const R = r * (1 + flute * ridge + lump * Math.sin(u * len * 1.7 + ph2 + a));
          Q.copy(P0).addScaledVector(N, R);
          this.pos.push(Q.x, Q.y, Q.z);
          const C = barkColor(Q, N, ridge, o); this.col.push(C.r, C.g, C.b); this.moss.push(mossField(Q, N, o));
        }
      }
      for (let i = 0; i < n; i++) for (let j = 0; j < radial; j++) {
        const a = base + i * radial + j, b = base + i * radial + (j + 1) % radial, c = a + radial, d = b + radial;
        this.idx.push(a, c, b, b, c, d);
      }
    }
    mesh(mat, { castShadow = true, receiveShadow = true, origin = null } = {}) {
      const g = new THREE.BufferGeometry();
      const pos = new Float32Array(this.pos);
      if (origin) for (let i = 0; i < pos.length; i += 3) { pos[i] -= origin.x; pos[i + 1] -= origin.y; pos[i + 2] -= origin.z; }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.col), 3));
      g.setAttribute('aMoss', new THREE.BufferAttribute(new Float32Array(this.moss), 1));
      g.setIndex(this.idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat); m.castShadow = castShadow; m.receiveShadow = receiveShadow;
      if (origin) m.position.copy(origin);
      return m;
    }
  }
  const barkMat = (() => {
    const m = ctx.toon({ vertexColors: true, moss: 0.5 });
    const baseCompile = m.onBeforeCompile, key = m.customProgramCacheKey();
    const glc = (c) => `vec3(${c.r.toFixed(4)},${c.g.toFixed(4)},${c.b.toFixed(4)})`;
    m.onBeforeCompile = (s, r) => {
      baseCompile(s, r);
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute float aMoss;\nvarying float vMoss;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMoss=aMoss;');
      s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vMoss;')
        .replace('#include <color_fragment>', `#include <color_fragment>
        { float mo=vMoss+(texture2D(uNoise,vec2(vWPos.x,vWPos.y)*.31).r+texture2D(uNoise,vec2(vWPos.z,vWPos.y)*.37).g-1.)*.34;  // world noise so contours ignore the mesh
          float a=max(fwidth(mo),.002);
          diffuseColor.rgb=mix(diffuseColor.rgb,${glc(new Color(P.mossDeep).lerp(new Color(P.moss), 0.45))},smoothstep(${MOSS_T.toFixed(2)}-a,${MOSS_T.toFixed(2)}+a,mo));
          diffuseColor.rgb=mix(diffuseColor.rgb,${glc(new Color(P.moss))},smoothstep(${(MOSS_T + 0.2).toFixed(2)}-a,${(MOSS_T + 0.2).toFixed(2)}+a,mo)); }`);
    };
    m.customProgramCacheKey = () => key + '|barkmoss';
    return m;
  })();
  const hairMat = ctx.toon({ vertexColors: true });
  const bark = new Bark();

  // ---------------------------------------------------------------- trunk axis, limbs
  const axisAt = (y) => new V(TREE.x + 0.2 * Math.sin(y * 0.42 + 0.6), y, TREE.z + 0.18 * Math.cos(y * 0.37));
  const LOBES = TREE.lobes.map(([x, y, z, r, ry], i) => ({ c: new V(x, y, z), r, ry, i, branch: null }));
  const LIMBS = [
    { lobes: [1], r: 0.56 }, { lobes: [2, 6], r: 0.6 }, { lobes: [3, 7], r: 0.58 }, { lobes: [4, 10], r: 0.58 },
    { lobes: [5, 11], r: 0.54 }, { lobes: [8, 0], r: 0.66 }, { lobes: [9], r: 0.46 },
  ];
  const branchSamples = []; // every bark point of limbs & branches: {p, r} used for sway pivots and root hangers
  function limbCurve(S, E, wob, rise = 1.7) {
    const d = new V().subVectors(E, S), side = new V(-d.z, 0, d.x).normalize(), ph = rng() * 6.28, pts = [];
    for (const s of [0, 0.12, 0.26, 0.42, 0.58, 0.74, 0.88, 1]) {
      const q = new V(lerp(S.x, E.x, s), S.y + (E.y - S.y) * (1 - Math.pow(1 - s, rise)), lerp(S.z, E.z, s));
      q.addScaledVector(side, Math.sin(s * 5 + ph) * wob * Math.sin(s * Math.PI));
      q.y += Math.sin(s * 7.5 + ph * 2) * wob * 0.3 * Math.sin(s * Math.PI);
      pts.push(q);
    }
    return pts;
  }
  const curveOf = (pts) => new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  for (const [i, L] of LIMBS.entries()) {
    const far = LOBES[L.lobes[L.lobes.length - 1]], near = L.lobes.length > 1 ? LOBES[L.lobes[0]] : null;
    const E = far.c.clone().add(new V(0, -0.8, 0));
    const a0 = Math.atan2(E.z - TREE.z, E.x - TREE.x), S = axisAt(9.8).add(new V(Math.cos(a0) * 0.6, 0, Math.sin(a0) * 0.6));
    // climb inside the roof hole, fork above the slab at crownBaseY
    const P1 = axisAt(TREE.crownBaseY).add(new V(Math.cos(a0) * 0.9, 0, Math.sin(a0) * 0.9));
    L.a0 = a0; L.pts = [S, ...limbCurve(P1, E, 0.55, 1.9)]; L.curve = curveOf(L.pts);
    far.branch = L.curve;
    bark.tube(L.pts, [L.r * 1.05, 0.14], { radial: 10, step: 0.3, flute: 0.14, lobes: 3, twist: 1.2, moss: -0.05 });
    for (let k = 3; k <= 30; k++) { const s = k / 30, p = L.curve.getPointAt(s); branchSamples.push({ p, r: lerp(L.r, 0.14, s), limb: i }); }
    if (near) {
      const f = L.curve.getPointAt(0.42), nE = near.c.clone().add(new V(0, -0.6, 0));
      const pts = limbCurve(f, nE, 0.4, 1.6); near.branch = curveOf(pts);
      bark.tube(pts, [L.r * 0.56, 0.1], { radial: 8, step: 0.3, flute: 0.1, lobes: 3, moss: -0.05 });
      for (let k = 2; k <= 20; k++) { const s = k / 20, p = near.branch.getPointAt(s); branchSamples.push({ p, r: lerp(L.r * 0.56, 0.1, s), limb: i }); }
    }
  }

  // ---------------------------------------------------------------- root walker
  const inRect = (x, z, m) => x > BUILDING.x[0] + m && x < BUILDING.x[1] - m && z > BUILDING.z[0] + m && z < BUILDING.z[1] - m;
  const solid = (lv, x, z) => {
    if (lv === 0) return true;
    if (!pointInPoly(x, z, SL[lv].outline)) return false;
    for (const h of SL[lv].holes) if (Math.hypot(x - h.x, z - h.z) < h.r + 0.05) return false;
    return true;
  };
  const topAt = (x, z) => { for (let l = 4; l >= 0; l--) if (inRect(x, z, -0.05) && solid(l, x, z)) return SL[l].y; return 0.1; };
  /** Walk across a floor from (x,z). At a collapse edge the root either pours onto the floor below (pour>0) or hooks over it. Returns [{p,lv,drop}]. */
  function walk(lv, x, z, heading, steps, stepLen = 0.5, wander = 0.42, pour = 0) {
    const out = []; let h = heading;
    for (let i = 0; i < steps; i++) {
      h += rng.range(-wander, wander) + (heading - h) * 0.16;
      let nx = x + Math.cos(h) * stepLen, nz = z + Math.sin(h) * stepLen;
      if (!inRect(nx, nz, 0.3)) { h += Math.PI * 0.45 * rng.sign(); heading = h; continue; }
      const ax = axisAt(SL[lv].y);
      if (Math.hypot(nx - ax.x, nz - ax.z) < 1.9) { heading += 0.4; continue; }
      if (!solid(lv, nx, nz)) {
        if (lv === 0) break;
        const y = SL[lv].y, dx = Math.cos(h), dz = Math.sin(h);
        out.push({ p: new V(x + dx * 0.16, y + 0.03, z + dz * 0.16), lv });
        const ex = nx - dx * 0.12, ez = nz - dz * 0.12;
        out.push({ p: new V(ex, y - 0.02, ez), lv, drop: true });
        out.push({ p: new V(ex + dx * 0.1, y - 0.34, ez + dz * 0.1), lv, drop: true });
        if (pour <= 0) { out.push({ p: new V(ex + dx * 0.06, y - rng.range(0.5, 0.95), ez + dz * 0.06), lv }); return out; }
        pour--;
        let drop = lv - 1, px = ex + dx * 0.12, pz = ez + dz * 0.12;
        while (drop > 0 && !solid(drop, px, pz)) drop--;
        const ly = SL[drop].y, sx = -dz * rng.range(0.16, 0.34) * rng.sign(), sz = dx * rng.range(0.16, 0.34);
        out.push({ p: new V(px + sx * 0.6 + dx * 0.1, lerp(y - 0.34, ly, 0.3), pz + sz * 0.6 + dz * 0.1), lv: drop, drop: true });
        out.push({ p: new V(px - sx * 0.5 + dx * 0.2, lerp(y - 0.34, ly, 0.66), pz - sz * 0.5 + dz * 0.2), lv: drop, drop: true });
        if (rng() < 0.2) return out; // dangling tip
        px += dx * 0.28; pz += dz * 0.28;
        out.push({ p: new V(px, ly + 0.26, pz), lv: drop, drop: true });
        nx = px + dx * 0.34; nz = pz + dz * 0.34;
        out.push({ p: new V(nx, ly + 0.05, nz), lv: drop });
        lv = drop; x = nx; z = nz; continue;
      }
      x = nx; z = nz;
      out.push({ p: new V(x, SL[lv].y + 0.05, z), lv });
    }
    return out;
  }
  const ROOT_O = { radial: 7, step: 0.24, flute: 0.1, lobes: 2, twist: 0.8, moss: 0.04 };
  function sideRoots(path, r, n) {
    for (let k = 0; k < n && path.length > 4; k++) {
      const i = rng.int(1, path.length - 3), a = path[i], b = path[i + 1], h = Math.atan2(b.p.z - a.p.z, b.p.x - a.p.x) + rng.sign() * rng.range(0.5, 1.1);
      const w = walk(a.lv, a.p.x, a.p.z, h, rng.int(3, 7), 0.42, 0.5);
      if (w.length < 2) continue;
      bark.tube([a.p, ...w.map((q) => q.p)], [r, 0.025], { radial: 5, step: 0.26, moss: 0.05 });
    }
  }
  /** Root leaving the trunk at slab level lv, spanning to the hole rim then walking on. */
  function slabRoot(lv, ang, steps, r0, pour = 0, ring0 = 1.1) {
    const y = SL[lv].y, ax = axisAt(y), hole = lv > 0 ? SL[lv].holes[0].r : 2.2;
    const dx = Math.cos(ang), dz = Math.sin(ang), at = (rr, yy) => new V(ax.x + dx * rr, yy, ax.z + dz * rr);
    const head = [axisAt(y + 2.1).add(new V(dx * ring0, 0, dz * ring0)), at(ring0 + 0.32, y + 1.25), at(lerp(ring0, hole, 0.62), y + 0.5), at(hole - 0.02, y + 0.22), at(hole + 0.28, y + 0.05)];
    const w = walk(lv, ax.x + dx * (hole + 0.28), ax.z + dz * (hole + 0.28), ang, steps, 0.46, 0.34, pour);
    const pts = [...head, ...w.map((q) => q.p)], n = pts.length;
    const rs = pts.map((_, i) => Math.max(r0 * Math.pow(1 - i / (n - 1), 1.05) + 0.022, w[i - head.length]?.drop ? 0.1 : 0));
    bark.tube(pts, rs, ROOT_O);
    // a thin second root braided around each long drop
    for (let i = 0; i + 3 < w.length; i++) if (w[i].drop && w[i + 1].drop && w[i + 2].drop && w[i + 3].drop) {
      const c = curveOf([w[i].p, w[i + 1].p, w[i + 2].p, w[i + 3].p]), br = [], ph = rng() * 6.28;
      for (let k = 0; k <= 12; k++) { const u = k / 12, q = c.getPointAt(u), e = 0.13 * Math.sin(u * Math.PI); br.push(new V(q.x + Math.cos(u * 11 + ph) * e, q.y, q.z + Math.sin(u * 11 + ph) * e)); }
      bark.tube(br, [0.05, 0.03], { radial: 5, step: 0.14, young: true });
      i += 3;
    }
    sideRoots(w, r0 * 0.34, Math.min(3, Math.floor(steps / 3)));
  }

  // ---------------------------------------------------------------- trunk strands
  const smoothUp = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const MAIN = 13;
  const ringAt = (y) => 0.94 + 0.95 * Math.exp(-y / 0.8) + 0.26 * Math.exp(-Math.pow((y - 10.9) / 0.9, 2));
  const TW = 0.235;
  for (let i = 0; i < MAIN; i++) {
    const a0 = (i / MAIN) * Math.PI * 2 + rng.range(-0.12, 0.12), rMain = rng.range(0.44, 0.62);
    // floor root (tip → trunk)
    const ax = axisAt(0.2), root = walk(0, ax.x + Math.cos(a0) * 3, ax.z + Math.sin(a0) * 3, a0, rng.int(6, 12), 0.55, 0.36);
    const rootPts = root.map((q) => q.p).reverse();
    const pts = [...rootPts], rs = rootPts.map((_, k) => lerp(0.03, 0.3, k / Math.max(1, rootPts.length - 1)));
    const flare = [[3.0, 0.24, 0.33], [2.45, 0.42, 0.42], [1.95, 0.82, rMain * 0.95]];
    for (const [rr, y, r] of flare) { const a = a0 + TW * y, c = axisAt(y); pts.push(new V(c.x + Math.cos(a) * rr, y, c.z + Math.sin(a) * rr)); rs.push(r); }
    // rise
    for (let y = 1.5; y < 10.4; y += 0.75) {
      const a = a0 + TW * y, c = axisAt(y), R = ringAt(y) + 0.05 * Math.sin(y * 1.3 + a0 * 3);
      pts.push(new V(c.x + Math.cos(a) * R, y, c.z + Math.sin(a) * R)); rs.push(rMain * (1 + 0.1 * Math.sin(y * 0.9 + i)));
    }
    // follow nearest limb, spiralling around it
    const aTop = a0 + TW * 10.4; let best = LIMBS[0], bd = 9;
    for (const L of LIMBS) { let d = Math.abs(Math.atan2(Math.sin(aTop - L.a0), Math.cos(aTop - L.a0))); if (L === LIMBS[6]) d += 0.5; if (d < bd) { bd = d; best = L; } }
    const sEnd = rng.range(0.28, 0.62), q0 = a0 * 3, dT = new V(), e1 = new V(), e2 = new V();
    for (let k = 1; k <= 7; k++) {
      const s = (k / 7) * sEnd, c = best.curve.getPointAt(s), rl = lerp(best.r, 0.2, s), q = q0 + s * 7;
      best.curve.getTangentAt(s, dT); e1.crossVectors(dT, new V(0, 1, 0.01)).normalize(); e2.crossVectors(dT, e1);
      pts.push(c.clone().addScaledVector(e1, Math.cos(q) * rl * 0.95).addScaledVector(e2, Math.sin(q) * rl * 0.95));
      rs.push(lerp(rMain * 0.8, 0.05, Math.pow(k / 7, 1.4)));
    }
    bark.tube(pts, rs, { radial: 12, step: 0.2, flute: 0.075, lobes: 3, twist: 2.4, moss: 0.02 });
    sideRoots(root, 0.13, 2);
  }
  // heart of the trunk (fills the gaps between strands)
  { const pts = [], rs = []; for (let y = 0.1; y <= 12.9; y += 1.0) { pts.push(axisAt(y)); rs.push(lerp(1.12, 0.98, y / 11) * (1 - smoothUp(10.2, 12.9, y) * 0.86)); }
    bark.tube(pts, rs, { radial: 14, step: 0.6, flute: 0.1, lobes: 5, twist: 1.5, lift: -0.2, moss: -0.2 }); }
  // thin creepers wrapping the other way, so the bundle reads as twined, not combed
  for (let i = 0; i < 16; i++) {
    const y0 = rng.range(0.4, 7), y1 = y0 + rng.range(2.4, 6), a0 = rng() * 6.28, tw = -rng.range(0.28, 0.55), pts = [], rs = [], r = rng.range(0.1, 0.2);
    for (let y = y0; y <= Math.min(y1, 11); y += 0.45) {
      const f = (y - y0) / (y1 - y0), bulge = Math.sin(f * Math.PI), a = a0 + tw * y, c = axisAt(y), R = ringAt(y) + 0.1 + bulge * 0.44;
      pts.push(new V(c.x + Math.cos(a) * R, y, c.z + Math.sin(a) * R)); rs.push(r * (0.25 + bulge));
    }
    bark.tube(pts, rs, { radial: 6, step: 0.22, moss: 0.08 });
  }

  // ---------------------------------------------------------------- roots over the floors
  const collapse = Math.atan2(4.5, 3.5);                     // from the trunk toward the fallen +x+z corner
  for (let lv = 1; lv <= 4; lv++) {
    const n = 6 + (lv === 4 ? 3 : 0), pours = 3;
    for (let i = 0; i < n; i++) {
      const fan = lerp(-1.3, 1.3, (i + rng.range(0.1, 0.9)) / n);
      const a = i < n - 2 ? collapse + fan : rng() * 6.28;
      slabRoot(lv, a, rng.int(5, 11), rng.range(0.2, 0.34), i % 2 === 0 && i < pours * 2 ? 1 : 0);
    }
  }
  // two roots escape the ground floor: through the east wall hole, over the shop sill
  bark.tube([[-3.2, 0.5, -5.3], [-1.2, 0.24, -5.2], [0.5, 0.24, -5.0], [1.25, 0.44, -4.9], [1.8, 0.46, -4.8], [2.35, 0.22, -4.6], [3.0, 0.14, -4.3], [3.5, 0.05, -3.9]], [0.26, 0.03], ROOT_O);
  bark.tube([[-4.3, 0.6, -3.7], [-3.9, 0.26, -1.8], [-3.6, 0.3, -0.2], [-3.5, 0.5, 0.55], [-3.35, 0.3, 1.1], [-3.0, 0.16, 1.75], [-2.5, 0.05, 2.35]], [0.22, 0.03], ROOT_O);

  // ---------------------------------------------------------------- aerial roots on the walls
  // Routes follow the piers between openings (see BUILDING and the facade window bands). [u,y]: u = x on the south face, z on the east.
  const S_OPS = [[-9.6, -0.8, 0.4, 2.5], [-7.5, -5.6, 3.2, 5], [-10.35, -9.05, 3.7, 5.02], [-4.3, -3, 3.7, 5.02], [-2.45, -1.25, 3.7, 5.02], [-10.35, -9.05, 5.72, 7.76], [-7.95, -6.65, 6.4, 7.72], [-10.35, -9.05, 9.1, 10.42], [-7.95, -6.75, 9.1, 10.42]];
  const E_OPS = [[-6.5, -3.6, 0.3, 2.45], [-10.3, -8.3, 1.06, 2.36], [-7.6, -6.4, 3.7, 5.02], [-5, -3.9, 3.7, 5.02], [-10.2, -8.9, 6.4, 7.72], [-7.6, -6.4, 6.4, 7.72], [-10.4, -9.4, 9.1, 10.42], [-10.1, -8.1, 3.9, 4.75]];
  const hitsOp = (ops, u, y, m) => ops.some(([u0, u1, y0, y1]) => u > u0 - m && u < u1 + m && y > y0 - m && y < y1 + m);
  const southAt = ([x, y], r) => new V(x, y, BUILDING.z[1] + 0.1 + r * 0.7);
  const eastAt = ([z, y], r) => new V(BUILDING.x[1] + 0.1 + r * 0.7, y, z);
  const nearestBranch = (x, y, z) => { let b = null, bd = 1e9; for (const q of branchSamples) { if (q.p.y > y + 4.2) continue; const d = q.p.distanceToSquared(new V(x, q.p.y, z)) + Math.pow(q.p.y - y - 2, 2) * 0.08; if (d < bd) { bd = d; b = q; } } return b.p; };
  const WALL_O = { radial: 7, step: 0.2, flute: 0.09, lobes: 2, twist: 1.2, moss: -0.22 };
  function groundFingers(p, r, away) {
    for (let i = 0; i < 3; i++) {
      const a = away + (i - 1) * rng.range(0.7, 1.1), l = rng.range(0.5, 1.05), q = new V(p.x + Math.cos(a) * l, 0.1, p.z + Math.sin(a) * l);
      bark.tube([new V(p.x, 0.5, p.z), new V(p.x + Math.cos(a) * l * 0.35, 0.2, p.z + Math.sin(a) * l * 0.35), q], [r, 0.02], { radial: 5, step: 0.14, moss: -0.05 });
    }
  }
  function wallRoot(path, at, ops, r0, r1, { hang = true, foot = null, comp = 2 } = {}) {
    const n = path.length, rs = path.map((_, i) => lerp(r0, r1, i / (n - 1)));
    const pts = path.map((q, i) => at(q, rs[i])), prs = [...rs];
    if (hang) {
      const top = pts[0], from = nearestBranch(top.x, top.y, top.z);
      const mid = new V(lerp(top.x, from.x, 0.22), lerp(top.y, from.y, 0.5), lerp(top.z, from.z, 0.22));
      pts.unshift(from, mid); prs.unshift(r0 * 0.7, r0 * 0.8);
    }
    bark.tube(pts, prs, WALL_O);
    if (foot != null) groundFingers(pts[pts.length - 1], r1 * 0.72, foot);
    // companions wander off the main root and rejoin it
    const c2 = new THREE.CatmullRomCurve3(path.map(([u, y]) => new V(u, y, 0)), false, 'centripetal');
    for (let c = 0; c < comp; c++) {
      const i0 = rng.range(0, 0.45), i1 = i0 + rng.range(0.3, 0.55), m = 16, amp = rng.range(0.1, 0.2) * rng.sign(), ph = rng() * 6, cp = [];
      let clear = true;
      for (let k = 0; k <= m; k++) {
        const u = lerp(i0, Math.min(i1, 1), k / m), q = c2.getPointAt(u), w = Math.sin((k / m) * Math.PI), tu = q.x + amp * w * (1 + 0.4 * Math.sin(k * 0.9 + ph));
        if (hitsOp(ops, tu, q.y, 0.1)) clear = false;
        cp.push(at([tu, q.y], lerp(r0, r1, u) * 0.9));
      }
      if (!clear) continue;
      bark.tube(cp, [0.03, 0.09, 0.03].flatMap((v, i, a) => (i < 2 ? Array.from({ length: 8 }, (_, k) => lerp(v, a[i + 1], k / 8)) : [v])), { radial: 5, step: 0.2, moss: -0.08 });
    }
  }
  const S1 = [[-9.6, 11.72], [-10.2, 10.9], [-10.66, 10.0], [-10.7, 7.5], [-10.58, 5.3], [-10.68, 3.0], [-10.55, 1.2], [-10.45, 0.14]];
  const S2 = [[-8.4, 10.45], [-8.5, 9.1], [-8.3, 7.4], [-8.55, 5.6], [-8.25, 4.0], [-8.45, 2.92], [-9.25, 2.76], [-9.8, 2.64], [-9.95, 2.1], [-9.98, 1.0], [-9.85, 0.14]];
  const S3 = [[-6.5, 8.25], [-6.25, 7.7], [-6.1, 6.5], [-5.25, 5.3], [-5.2, 4.2], [-5.05, 3.25], [-4.6, 2.78], [-3.2, 2.76], [-2.0, 2.72], [-0.74, 2.72], [-0.52, 1.6], [-0.46, 0.14]];
  const E1 = [[-9.6, 11.72], [-9.15, 10.7], [-8.75, 9.3], [-8.42, 8.0], [-8.3, 6.9], [-8.05, 5.6], [-7.92, 4.8], [-7.95, 3.4], [-8.02, 2.2], [-7.95, 1.1], [-7.9, 0.14]];
  const E2 = [[-8.2, 10.1], [-8.05, 9.0], [-8.2, 7.7], [-8.1, 6.6], [-7.98, 5.1]];
  const E3 = [[-6.55, 8.1], [-6.2, 7.8], [-6.06, 6.4], [-6.12, 5.1], [-6.15, 3.7], [-6.7, 3.05], [-6.85, 1.8], [-6.8, 0.14]];
  wallRoot(S1, southAt, S_OPS, 0.08, 0.2, { foot: 1.4 });
  wallRoot(S2, southAt, S_OPS, 0.08, 0.19, { foot: 1.7 });
  wallRoot(S3, southAt, S_OPS, 0.07, 0.17, { foot: 1.5 });
  wallRoot(E1, eastAt, E_OPS, 0.08, 0.2, { foot: 0.1 });
  wallRoot(E2, eastAt, E_OPS, 0.07, 0.1, { comp: 1 });
  wallRoot(E3, eastAt, E_OPS, 0.07, 0.17, { foot: -0.2 });
  // the anchor over the fallen corner has no wall left: it hangs free, then lands on the broken wall head and joins the fascia root
  { const top = new V(-1.2, 10.2, 0.72), from = nearestBranch(top.x, top.y, top.z);
    const line = [from, new V(lerp(top.x, from.x, 0.3), lerp(top.y, from.y, 0.55), lerp(top.z, from.z, 0.3)), top, new V(-1.85, 8.9, 1.0), new V(-1.3, 7.5, 0.76), new V(-1.95, 6.1, 1.02), new V(-1.4, 4.7, 0.8), southAt([-1.14, 3.4], 0.1), southAt([-0.86, 2.76], 0.12)];
    bark.tube(line, [0.05, 0.13], { ...WALL_O, moss: -0.4 });
    const c = curveOf(line), br = [], ph = rng() * 6;
    for (let k = 4; k <= 26; k++) { const u = k / 30, q = c.getPointAt(u), w = 0.12 * Math.sin(((k - 4) / 22) * Math.PI); br.push(new V(q.x + Math.cos(u * 26 + ph) * w, q.y, q.z + Math.sin(u * 26 + ph) * w)); }
    bark.tube(br, [0.03, 0.05], { radial: 5, step: 0.2, young: true, moss: -0.4 }); }
  // a pillar root: an old limb propped on the sidewalk
  { const x = -7.7, z = 1.45, from = nearestBranch(x, 12, z);
    bark.tube([from, new V(lerp(from.x, x, 0.45) + 0.5, lerp(from.y, 0.5, 0.2), lerp(from.z, z, 0.5)), new V(x + 0.34, 6.8, z + 0.1), new V(x - 0.16, 3.6, z - 0.08), new V(x, 0.5, z)], [0.06, 0.15], WALL_O);
    groundFingers(new V(x, 0.5, z), 0.11, 1.2); }

  // ---------------------------------------------------------------- v2: the long reach over the wider plinth
  // Four limbs of their own leave the crown base for the outer lobes (back and left). They stay long and low, sagging between
  // the roof and the crown, fork inside their lobes, and let down pillar roots that land in the back yards.
  const rng0 = rng; rng = ctx.seeded('banyan:reach');
  const REACH = [
    { lobe: 12, r: 0.66, sag: 0.62, forks: [[-13.2, 13.2, -9.3], [-17.2, 14.3, -6.9], [-15.3, 13.9, -2.8]] },
    { lobe: 13, r: 0.6, sag: 0.66, forks: [[-13.9, 13.3, -10.5], [-9.5, 13.5, -15.3], [-13.5, 14.0, -14.9]] },
    { lobe: 14, r: 0.64, sag: 0.56, forks: [[-5.9, 13.3, -13.4], [-1.8, 13.6, -17.3], [1.6, 13.5, -13.0]] },
    { lobe: 15, r: 0.58, sag: 0.5, forks: [[2.8, 13.1, -14.6], [9.2, 13.4, -14.2], [7.6, 13.8, -10.7]] },
  ];
  const reach = [];
  function reachCurve(S, E, sag, wob) {
    const d = new V().subVectors(E, S), side = new V(-d.z, 0, d.x).normalize(), ph = rng() * 6.28, pts = [];
    for (const s of [0, 0.1, 0.22, 0.36, 0.5, 0.64, 0.78, 0.9, 1]) {
      const q = new V(lerp(S.x, E.x, s), S.y + (E.y - S.y) * (1 - Math.pow(1 - s, 2.1)) - sag * Math.pow(Math.sin(s * Math.PI), 2), lerp(S.z, E.z, s));
      q.addScaledVector(side, Math.sin(s * 4.6 + ph) * wob * Math.sin(s * Math.PI));
      pts.push(q);
    }
    return pts;
  }
  const REACH_R = [1.12, 1.02, 0.96, 0.86, 0.76, 0.66, 0.56, 0.47, 0.34, 0.07];
  const sampleReach = (curve, n, r0, r1, limb) => { for (let k = 2; k <= n; k++) { const s = k / n, p = curve.getPointAt(s), q = { p, r: lerp(r0, r1, s), limb, v2: true, s }; branchSamples.push(q); reach.push(q); } };
  for (const [i, L] of REACH.entries()) {
    const C = LOBES[L.lobe], a0 = Math.atan2(C.c.z - TREE.z, C.c.x - TREE.x), out = new V(Math.cos(a0), 0, Math.sin(a0));
    const E = C.c.clone().addScaledVector(out, C.r * 0.22).add(new V(0, -0.9, 0));
    const S = axisAt(9.6).addScaledVector(out, 0.62), P1 = axisAt(TREE.crownBaseY).addScaledVector(out, 0.95);
    const pts = [S, ...reachCurve(P1, E, L.sag, 0.7)], curve = curveOf(pts);
    L.curve = curve; L.a0 = a0; C.branch = curve;
    bark.tube(pts, REACH_R.map((k) => k * L.r), { radial: 9, step: 0.42, flute: 0.13, lobes: 3, twist: 1.6, moss: 0.02, lift: 0.08 });
    sampleReach(curve, 46, L.r, L.r * 0.3, i);
    for (const t of L.forks) {
      const f = reach.filter((q) => q.limb === i && q.s > 0.34).reduce((a, b) => (b.p.distanceToSquared(new V(...t)) < a.p.distanceToSquared(new V(...t)) ? b : a));
      const fp = limbCurve(f.p, new V(...t), 0.28, 1.5), fc = curveOf(fp), r0 = Math.min(f.r * 0.72, 0.27);
      bark.tube(fp, [r0, 0.03], { radial: 7, step: 0.42, flute: 0.1, lobes: 3, moss: 0, lift: 0.08 });
      sampleReach(fc, 18, r0, 0.03, i);
    }
    // strands of the trunk run out along each limb, so it grows from the bundle instead of plugging into it
    for (let k = 0; k < 3; k++) {
      const a1 = a0 + (k - 1) * 0.62, sp = [], rs = [], r = rng.range(0.28, 0.4), sEnd = rng.range(0.16, 0.34), q0 = a0 * 3 + k * 2.1;
      for (let y = 6.9; y < 10.3; y += 0.8) { const a = a1 - TW * (10.3 - y), c = axisAt(y); sp.push(new V(c.x + Math.cos(a) * ringAt(y), y, c.z + Math.sin(a) * ringAt(y))); rs.push(r * smoothUp(6.9, 8.6, y) + 0.03); }
      const dT = new V(), e1 = new V(), e2 = new V();
      for (let j = 1; j <= 6; j++) {
        const s = (j / 6) * sEnd, c = curve.getPointAt(s), rl = lerp(L.r, L.r * 0.7, s / 0.34), q = q0 + s * 8;
        curve.getTangentAt(s, dT); e1.crossVectors(dT, new V(0, 1, 0.01)).normalize(); e2.crossVectors(dT, e1);
        sp.push(c.clone().addScaledVector(e1, Math.cos(q) * rl * 0.95).addScaledVector(e2, Math.sin(q) * rl * 0.95));
        rs.push(lerp(r * 0.8, 0.04, Math.pow(j / 6, 1.4)));
      }
      bark.tube(sp, rs, { radial: 7, step: 0.4, flute: 0.07, lobes: 3, twist: 1.6, moss: 0.02 });
    }
  }
  // Pillar roots: columns let down from the limbs, thickening toward the ground as old banyan props do. [x, z, footR]
  const PROPS = [
    [-12.7, -9.3, 0.33], [-9.4, -13.6, 0.31], [-10.7, -15.5, 0.21],
    [-2.15, -13.05, 0.34], [-1.5, -16.7, 0.24], [1.7, -13.0, 0.23], [10.1, -14.1, 0.28],
  ];
  const propTufts = [], props = new Bark(), sento = TOWN.bathhouse;
  // The back-lot block walls as town.js lays them out. The south wall is open at its gate and where the pillar at x -9.4 has shoved it apart.
  const LOT = { w: TOWN.backLot.x[0] + 0.14, n: TOWN.backLot.z[0] + 0.14, e: 1.36, s: -13.35 };
  const wallRun = (off, t, t0, t1, gaps = []) => Math.abs(off) < 0.3 && t > t0 - 0.3 && t < t1 + 0.3 && !gaps.some(([a, b]) => t > a && t < b);
  const lotWall = (x, z) => wallRun(z - LOT.s, x, LOT.w, LOT.e, [[-9.9, -8.55], [-2.68, -1.42]]) || wallRun(x - LOT.e, z, LOT.n, LOT.s, [[-18.6, -16.9]]) || wallRun(x - LOT.w, z, LOT.n, LOT.s) || wallRun(z - LOT.n, x, LOT.w, LOT.e)
    || Math.hypot(x + 2.0, z + 13.76) < 0.5 || Math.hypot(x + 1.5, z + 13.9) < 0.5;  // ...and the drum lying just inside the gate
  const walled = (x, z) => inRect(x, z, -0.3) || (x > sento.x[0] - 0.3 && x < sento.x[1] + 0.3 && z > sento.z[0] - 0.3 && z < sento.z[1] + 0.3) || x > layout.RAIL.platform.x[0] - 0.3 || lotWall(x, z);
  function propRoot(x, z, r) {
    let top = null, bd = 1e9;
    for (const q of reach) { const d = Math.hypot(q.p.x - x, q.p.z - z) + (q.r < 0.1 ? 0.8 : 0); if (d < bd) { bd = d; top = q; } }
    const T = top.p, H = T.y - 1.5, ph = rng() * 6.28, ph2 = rng() * 6.28;
    const rAt = (y) => r * (0.46 + 0.54 * Math.pow(clamp(1 - y / H), 1.3)) + r * 0.42 * Math.exp(-y / 0.7);
    const pts = [T.clone(), new V(lerp(T.x, x, 0.55), T.y - 0.45, lerp(T.z, z, 0.55)), new V(lerp(T.x, x, 0.92), H + 0.25, lerp(T.z, z, 0.92))];
    const rs = [Math.min(top.r * 0.85, r * 0.52), r * 0.46, r * 0.47];
    for (const f of [0.14, 0.32, 0.5, 0.68, 0.84, 0.94]) {
      const y = H * (1 - f), e = 0.14 * Math.sin(f * Math.PI);
      pts.push(new V(x + Math.sin(f * 5 + ph) * e, y, z + Math.cos(f * 4.4 + ph) * e)); rs.push(rAt(y));
    }
    pts.push(new V(x, 0.3, z), new V(x, -0.08, z)); rs.push(rAt(0.3), rAt(0));
    props.tube(pts, rs, { radial: 9, step: 0.6, flute: 0.13, lobes: 3, twist: 1.3, lump: 0.04, moss: 0.04, lift: 0.17 });
    const col = curveOf(pts);
    // younger roots twine down the column; on the stoutest a second root joins it from further along the limb
    for (let c = 0; c < 2; c++) {
      const u0 = rng.range(0.1, 0.32), u1 = rng.range(0.74, 0.96), p0 = rng() * 6.28, turns = rng.range(1.2, 2.2) * (c ? -1 : 1), hp = [], hr = [];
      for (let k = 0; k <= 16; k++) {
        const f = k / 16, q = col.getPointAt(lerp(u0, u1, f)), a = p0 + f * turns * 6.28, R = rAt(q.y) * 1.02 + 0.02;
        hp.push(new V(q.x + Math.cos(a) * R, q.y, q.z + Math.sin(a) * R)); hr.push(0.035 + 0.05 * Math.sin(f * Math.PI));
      }
      props.tube(hp, hr, { radial: 5, step: 0.4, young: true, moss: 0.05 });
    }
    if (r >= 0.27) {
      const others = reach.filter((q) => q.r > 0.12 && q.p.distanceTo(T) > 1.3 && q.p.distanceTo(T) < 3.2);
      if (others.length) {
        const o = rng.pick(others).p, yJ = H * rng.range(0.42, 0.6), J = new V(x + 0.05, yJ, z);
        props.tube([o.clone(), new V(lerp(o.x, x, 0.5), o.y - 0.5, lerp(o.z, z, 0.5)), new V(lerp(o.x, x, 0.86), lerp(o.y, yJ, 0.5), lerp(o.z, z, 0.86)), J], [0.09, 0.13], { radial: 6, step: 0.6, flute: 0.1, lobes: 2, moss: 0.04, lift: 0.17 });
      }
    }
    // buttress spurs where the column takes the ground
    for (let i = 0, n = rng.int(5, 6); i < n; i++) {
      const a = ph2 + (i / n) * 6.28 + rng.range(-0.3, 0.3), c = Math.cos(a), s = Math.sin(a);
      let l = rng.range(0.8, 1.5) * (r / 0.3 + 0.35), b = rng.range(-0.34, 0.34) * l;
      // spurs stop short of the walls around them. The whole run is tested, not just the tip: a wall is thinner than a long spur. One with no room at all is left out (the throwaway Bark keeps the rng stream).
      const blocked = () => [[0.3, 0.2], [0.52, 0.4], [0.67, 0.7], [0.82, 1], [1, 1.5]].some(([f, k]) => walled(x + c * l * f - s * b * k, z + s * l * f + c * b * k));
      while (l > 0.45 && blocked()) { l *= 0.85; b *= 0.85; }
      (blocked() ? new Bark() : props).tube([new V(x + c * r * 0.3, 1.25, z + s * r * 0.3), new V(x + c * r * 1.05, 0.5, z + s * r * 1.05), new V(x + c * l * 0.52 - s * b * 0.4, 0.2, z + s * l * 0.52 + c * b * 0.4), new V(x + c * l * 0.82 - s * b, 0.08, z + s * l * 0.82 + c * b), new V(x + c * l - s * b * 1.5, -0.08, z + s * l + c * b * 1.5)], [r * 0.2, r * 0.46, r * 0.3, r * 0.2, 0.05], { radial: 6, step: 0.24, flute: 0.08, lobes: 2, moss: 0.1, lift: 0.17 });
    }
    for (let i = rng.int(2, 3); i > 0; i--) propTufts.push(col.getPointAt(rng.range(0.3, 0.9)));
  }
  for (const [x, z, r] of PROPS) propRoot(x, z, r);
  rng = rng0;

  // ---------------------------------------------------------------- canopy: sub-clumps
  const clumps = [];
  const GA = Math.PI * (3 - Math.sqrt(5));
  const fib = (k, n) => { const y = 1 - (2 * (k + 0.5)) / n, r = Math.sqrt(1 - y * y), a = k * GA; return new V(Math.cos(a) * r, y, Math.sin(a) * r); };
  for (const L of LOBES) {
    const base = clamp(Math.sqrt(L.r * L.ry) * 0.42, 1.15, 2.3);
    const n = Math.round((3.1 * L.r * L.ry) / (base * base));
    const shift = rng() * 6;
    for (let k = 0; k < n; k++) {
      const d = fib(k, n).applyAxisAngle(new V(0, 1, 0), shift);
      if (d.y < -0.8) continue;
      const rc = base * rng.range(0.82, 1.2);
      const c = new V(L.c.x + d.x * Math.max(0.4, L.r - rc * 0.72), L.c.y + d.y * Math.max(0.3, L.ry - rc * 0.78), L.c.z + d.z * Math.max(0.4, L.r - rc * 0.72));
      c.x += rng.range(-0.3, 0.3); c.y += rng.range(-0.2, 0.2); c.z += rng.range(-0.3, 0.3);
      clumps.push({ c, r: rc, ry: rc * rng.range(0.72, 0.86), lobe: L, dead: false, seed: rng() * 50 });
    }
  }
  // small satellites break the round lobes into an irregular crown edge
  for (const c of clumps.slice()) {
    const out = new V(c.c.x - TREE.x, (c.c.y - 15) * 0.5, c.c.z - TREE.z).normalize();
    for (let i = 0; i < 2; i++) {
      if (rng() > 0.42) continue;
      const d = out.clone().add(new V(rng.range(-0.9, 0.9), rng.range(-0.7, 0.35), rng.range(-0.9, 0.9))).normalize(), rc = rng.range(0.62, 1.0);
      const q = c.c.clone().addScaledVector(d, c.r * 0.9).setY(c.c.y + d.y * c.ry * 0.9);
      if (q.y < 12.6) continue;
      clumps.push({ c: q, r: rc, ry: rc * rng.range(0.72, 0.9), lobe: c.lobe, dead: false, seed: rng() * 50 });
    }
  }
  // bridges along the outer limbs: without them the new lobes read as separate trees from above
  { const R = ctx.seeded('banyan:bridges');
    for (const [x, y, z, r, i] of [[1.9, 14.4, -13.9, 1.9, 14], [3.1, 14.9, -11.2, 1.6, 15], [-6.9, 14.5, -14.6, 2.0, 13], [-13.9, 14.6, -9.6, 1.8, 12], [-16.2, 14.0, -1.8, 1.5, 12]])
      clumps.push({ c: new V(x, y, z), r, ry: r * 0.74, lobe: LOBES[i], dead: false, seed: R() * 50 }); }
  // cull clumps buried in others
  for (const a of clumps) for (const b of clumps) {
    if (a === b || a.dead || b.dead || a.r > b.r) continue;
    if (a.c.distanceTo(b.c) < (b.r - a.r) + 0.42 * a.r) a.dead = true;
  }
  // sky gaps where the gobo already opens clearings for the sunbeams
  for (const sh of layout.SHAFTS) {
    const b = new V(...sh.bottom);
    for (const c of clumps) {
      const q = c.c.clone().sub(b), t = q.dot(SUN), d = q.addScaledVector(SUN, -t).length();
      if (t > 0 && d < 0.45 + c.r * 0.5) c.dead = true;
    }
  }
  // ...and a few peepholes at lobe seams along the main view axis, so sky shows through the crown from front-right and back-left
  { const v = new V(...HERO_CAM.target).sub(new V(...HERO_CAM.pos)).normalize(), r = v.clone().cross(new V(0, 1, 0)).normalize(), u = r.clone().cross(v), C = new V(-4, 16, -4);
    for (const [a, b, k] of [[-6.2, 0.9, 1.2], [5.9, 0.5, 1.2], [0.6, 2.2, 1.0]]) {
      const o = C.clone().addScaledVector(r, a).addScaledVector(u, b);
      for (const c of clumps) { const q = c.c.clone().sub(o); q.addScaledVector(v, -q.dot(v)); if (q.length() < c.r * k) c.dead = true; }
    } }
  const CL = clumps.filter((c) => !c.dead);
  const inside = (c, p, k) => { const dx = (p.x - c.c.x) / c.r, dy = (p.y - c.c.y) / c.ry, dz = (p.z - c.c.z) / c.r; return dx * dx + dy * dy + dz * dz < k * k; };
  for (const c of CL) c.near = CL.filter((o) => o !== c && o.c.distanceTo(c.c) < o.r + c.r + 0.3);

  // real sky holes: through-lines threaded between the inner cores at lobe seams, along the sun and the two main view axes
  const CORE_K = 0.62, HOLES = [];
  const lineDist = (q, o, d) => { const x = q.x - o.x, y = q.y - o.y, z = q.z - o.z, t = x * d.x + y * d.y + z * d.z; return Math.sqrt(Math.max(0, x * x + y * y + z * z - t * t)); };
  { const seams = [];
    for (const a of CL) for (const b of a.near) if (a.lobe.i < b.lobe.i) seams.push(a.c.clone().lerp(b.c, a.r / (a.r + b.r)));
    const pick = (dirOf, n, R, keep = () => true, pad = 0, wood = false) => {
      const ranked = seams.filter((o) => keep(o, dirOf(o))).map((o) => {
        const d = dirOf(o); let g = 9, blockers = 0, limbs = 0;
        for (const c of CL) { const e = lineDist(c.c, o, d) - c.r * CORE_K; g = Math.min(g, e); if (e < R) blockers++; }
        if (wood) for (const q of branchSamples) if (lineDist(q.p, o, d) - q.r < R + pad) limbs++; // leaves can be cut from a tunnel, limbs can't
        return { o, d, g, blockers, limbs };
      }).sort((a, b) => a.limbs - b.limbs || a.blockers - b.blockers || b.g - a.g);
      let got = 0;
      for (const r of ranked) {
        if (got >= n) break;
        if (!wood && HOLES.some((h) => lineDist(r.o, h.o, h.d) < 3 || h.o.distanceTo(r.o) < 3)) continue;
        HOLES.push({ o: r.o, d: r.d, R, pad }); got++;
      }
    };
    const fromCam = (C) => (o) => o.clone().sub(C).normalize();
    const towardSun = (E) => (o) => o.clone().sub(E).normalize().dot(SUN) > 0.86;
    for (const [E, n] of [[new V(-5, 3, 6), 2], [new V(-1, 11.5, -1), 2]]) pick(fromCam(E), n, 0.9, towardSun(E)); // under the crown, looking at the sun
    // default view: a hole has to be crown all round (else it's a bite out of the rim) with sky behind it (the view looks down, so a low line
    // ends on the town instead). Leaves reach ~0.7 across a tunnel this long, hence the pad. It may cross a sun hole: they only meet in passing.
    const framed = (o, d) => {
      const e1 = new V(-d.z, 0, d.x).normalize(), e2 = e1.clone().cross(d), t = Math.min(...[[o.x, d.x], [o.z, d.z]].map(([p, q]) => (Math.sign(q) * layout.BASE.half - p) / q));
      if (o.y + d.y * t < 12) return false;
      for (let a = 0; a < 12; a++) { const q = o.clone().addScaledVector(e1, Math.cos(a * 0.5236) * 2.8).addScaledVector(e2, Math.sin(a * 0.5236) * 2.8); if (!CL.some((c) => lineDist(c.c, q, d) < c.r)) return false; }
      return true;
    };
    const hero = fromCam(new V(...HERO_CAM.pos));
    pick(hero, 1, 0.8, framed, 0.4, true);
    const first = HOLES[HOLES.length - 1];
    pick(hero, 1, 0.8, (o, d) => framed(o, d) && lineDist(o, first.o, first.d) > 8, 0.4, true); // well apart: two side by side stare back like eyes
    const second = HOLES[HOLES.length - 1];
    pick(fromCam(new V(-58, 32, -66)), 2, 0.85);                 // from behind
    // The tunnels above only choose where a hero gap sits (their wide radius keeps limbs out). Cut that wide they read as machine-punched discs, so they are cut far narrower.
    for (const [h, r, ph] of [[first, 1.05, 1.3], [second, 0.78, 1.6]]) {
      const e1 = new V(-h.d.z, 0, h.d.x).normalize();
      h.glimpse = { r, e1, e2: e1.clone().cross(h.d), dist: h.o.distanceTo(new V(...HERO_CAM.pos)), ph };
    }
  }
  const nearChimney = (p, m) => p.y < TOWN.chimney.height + 0.6 && Math.hypot(p.x - TOWN.chimney.x, p.z - TOWN.chimney.z) < m; // lobe 13's edge stops short of the stack
  // A glimpse's outline is the same few uneven lobes all the way down the line, widened with depth so they stay registered from the hero camera; a noise that
  // varied along the line would be averaged away, since the sky shows only where every layer is open. Near the rim leaves are kept or dropped by hash, so the edge is leaf-sized.
  const glimpseEdge = (h, p) => {
    const G = h.glimpse, x = p.x - h.o.x, y = p.y - h.o.y, z = p.z - h.o.z, a = Math.atan2(x * G.e2.x + y * G.e2.y + z * G.e2.z, x * G.e1.x + y * G.e1.y + z * G.e1.z);
    const lobes = 1 + 0.34 * Math.sin(2 * a + G.ph) + 0.26 * Math.sin(3 * a + G.ph * 2.1) + 0.2 * Math.sin(5 * a + G.ph * 3.7);
    return G.r * lobes * (1 + (x * h.d.x + y * h.d.y + z * h.d.z) / G.dist) + (hash(p.x * 5.3, p.y * 5.3, p.z * 5.3) - 0.5) * 0.7;
  };
  const inHole = (p, m = 0) => {
    for (const h of HOLES) {
      if (lineDist(p, h.o, h.d) < (h.glimpse ? glimpseEdge(h, p) : h.R * (0.55 + 0.95 * vnoise(p.x * 0.8 + 7, p.y * 0.8, p.z * 0.8)) + m + h.pad)) return true;
    }
    return false;
  };

  // branches into each clump
  for (const c of CL) {
    let best = null, bd = 1e9;
    for (const b of branchSamples) { const d = b.p.distanceToSquared(c.c) + (b.p.y > c.c.y ? 4 : 0); if (d < bd) { bd = d; best = b; } }
    c.pivot = best.p.clone();
    const end = c.c.clone(), mid = best.p.clone().lerp(end, 0.55); mid.y -= 0.18; mid.x += rng.range(-0.3, 0.3); mid.z += rng.range(-0.3, 0.3);
    // twigs that would cross a sky hole are dropped: only real limbs show through it. A throwaway Bark keeps the rng stream.
    const open = HOLES.some((h) => lineDist(end, h.o, h.d) < h.R + h.pad + 0.9 || lineDist(mid, h.o, h.d) < h.R + h.pad + 0.5);
    (open ? new Bark() : bark).tube([best.p, mid, end], [Math.min(best.r * 0.7, 0.2), 0.03], { radial: 5, step: 0.5, moss: -0.1 });
  }

  // static inner cores
  const coreMat = ctx.toon({ vertexColors: true, dapple: false, translucent: 0.7 });
  const holed = (c) => HOLES.some((h) => lineDist(c.c, h.o, h.d) < c.r * CORE_K + (h.glimpse ? h.glimpse.r * 1.5 : h.R * 1.5 + h.pad) + 0.3) || nearChimney(c.c, c.r * CORE_K * 1.3 + 0.8);
  { const parts = [], cTop = new Color(P.leafMid).multiplyScalar(0.62), cBot = new Color(P.leafShade).lerp(new Color('#14535c'), 0.35);
    for (const c of CL) {
      if (holed(c)) continue;
      const g = kit.sphere(1, 9, 7).scale(c.r * CORE_K, c.ry * CORE_K, c.r * CORE_K).translate(c.c.x, c.c.y, c.c.z);
      const pa = g.attributes.position, col = new Float32Array(pa.count * 3);
      for (let i = 0; i < pa.count; i++) { // lumpy, so a core glimpsed through the leaves never reads as a ball
        const k = 0.8 + 0.5 * vnoise(pa.getX(i) * 1.3 + c.seed, pa.getY(i) * 1.3, pa.getZ(i) * 1.3);
        pa.setXYZ(i, c.c.x + (pa.getX(i) - c.c.x) * k, c.c.y + (pa.getY(i) - c.c.y) * k, c.c.z + (pa.getZ(i) - c.c.z) * k);
      }
      for (let i = 0; i < pa.count; i++) { const f = smoothUp(0.1, 0.72, ((pa.getX(i) - c.c.x) / c.r * SUN.x + (pa.getY(i) - c.c.y) / c.ry * SUN.y + (pa.getZ(i) - c.c.z) / c.r * SUN.z) * 0.5 + 0.5), q = tmpC.copy(cBot).lerp(cTop, f); col[i * 3] = q.r; col[i * 3 + 1] = q.g; col[i * 3 + 2] = q.b; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3)); parts.push(g);
    }
    const m = new THREE.Mesh(kit.merge(parts), coreMat); m.castShadow = false; m.receiveShadow = false;
    group.add(ctx.softEdge(m));
  }

  // ---------------------------------------------------------------- canopy: leaf shells
  const leafMat = (() => {
    const m = ctx.toon({ color: '#ffffff', side: THREE.DoubleSide, vertexColors: true, dapple: false, translucent: 1 });
    const baseCompile = m.onBeforeCompile, key = m.customProgramCacheKey();
    m.onBeforeCompile = (s, r) => {
      baseCompile(s, r);
      // Light each leaf with the smooth clump normal, so the cel terminator draws big readable masses instead of confetti.
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aShell;')
        .replace('#include <normal_vertex>', 'transformedNormal=normalize(mat3(viewMatrix)*aShell);\n#include <normal_vertex>');
      s.fragmentShader = s.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
    };
    m.customProgramCacheKey = () => key + '|shell';
    return m;
  })();
  // Broad ovate leaf: same four triangles as kit.leaf, rounder outline. Base dark, tip light, so overlaps stay legible inside one band.
  const leafGeo = new THREE.BufferGeometry();
  { const l = 0.54, w = 0.38, c = 0.05;
    leafGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -w / 2, c, l * 0.3, -w * 0.4, c, l * 0.68, 0, 0, l, w * 0.4, c, l * 0.68, w / 2, c, l * 0.3], 3));
    leafGeo.setAttribute('color', new THREE.Float32BufferAttribute([0.72, 0.74, 0.72, 0.92, 0.92, 0.9, 1, 1, 0.98, 1.05, 1.05, 1, 1, 1, 0.98, 0.92, 0.92, 0.9], 3));
    leafGeo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(18).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    leafGeo.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(12).fill(0), 2));
    leafGeo.setIndex([0, 2, 1, 0, 3, 2, 0, 4, 3, 0, 5, 4]); }
  const LC = {
    gold: new Color(P.leafGold).multiplyScalar(0.92), lit: new Color(P.leafLit).lerp(new Color(P.leafGold), 0.22).multiplyScalar(0.9),
    mid: new Color(P.leafMid), deep: new Color(P.leafDeep), shade: new Color(P.leafShade),
  };
  function leafTone(v, out) {
    return out.copy(v > 0.895 ? LC.gold : v > 0.745 ? LC.lit : v > 0.565 ? LC.mid : v > 0.41 ? LC.deep : LC.shade);
  }
  const occluded = (p) => {
    for (const c of CL) {
      const dx = c.c.x - p.x, dy = c.c.y - p.y, dz = c.c.z - p.z, t = dx * SUN.x + dy * SUN.y + dz * SUN.z;
      if (t < 0.4) continue;
      const d2 = dx * dx + dy * dy + dz * dz - t * t, R = c.r * 0.8;
      if (d2 < R * R) return true;
    }
    return false;
  };

  // sway groups by k-means over clumps
  const K = 38, cent = Array.from({ length: K }, (_, i) => CL[Math.floor((i / K) * CL.length)].c.clone());
  for (let it = 0; it < 8; it++) {
    const sum = cent.map(() => [new V(), 0]);
    for (const c of CL) { let b = 0, bd = 1e9; cent.forEach((q, i) => { const d = q.distanceToSquared(c.c); if (d < bd) { bd = d; b = i; } }); c.g = b; sum[b][0].add(c.c); sum[b][1]++; }
    sum.forEach(([s, n], i) => { if (n) cent[i].copy(s).divideScalar(n); });
  }
  const buckets = Array.from({ length: K }, () => []);
  const DENS = 19, INNER_THIN = 0.3;
  const mkLeaf = (list, p, shell, tip, s, tone, young = 0, dim = false) => list.push({ p, shell, tip, s, tone, young, dim });
  const YOUNG = new Color('#dcf36a'), YOUNG_DIM = new Color('#8edc4c'), crownC = new V(TREE.x, 15, TREE.z);
  const dX = new V(), dT = new V(), dU = new V(), dB = new V();
  for (const c of CL) {
    const n = Math.round(4 * Math.PI * c.r * c.ry * DENS), lobeC = c.lobe.c;
    for (let k = 0; k < n; k++) {
      const d = fib(k, n); d.x += rng.range(-0.05, 0.05); d.y += rng.range(-0.05, 0.05); d.z += rng.range(-0.05, 0.05); d.normalize();
      const bump = 1 + 0.3 * (vnoise(d.x * 2.6 + c.seed, d.y * 2.6, d.z * 2.6) - 0.5);
      const p = new V(c.c.x + d.x * c.r * bump, c.c.y + d.y * c.ry * bump, c.c.z + d.z * c.r * bump);
      let cull = false; for (const o of c.near) if (inside(o, p, 0.9)) { cull = true; break; }
      if (cull) continue;
      if (d.y < -0.55 && rng() < 0.4) continue;
      const nC = new V(d.x / c.r, d.y / c.ry, d.z / c.r).normalize();
      const nL = new V(p.x - lobeC.x, (p.y - lobeC.y) * 1.4, p.z - lobeC.z).normalize();
      const shell = nC.clone().lerp(nL, 0.28).normalize();
      const shad = occluded(p.clone().addScaledVector(shell, 0.25));
      const h = clamp((p.y - 12) / 10), lift = (vnoise(p.x * 0.33, p.y * 0.33, p.z * 0.33) - 0.5);
      let crease = 9; for (const o of c.near) { const dx = (p.x - o.c.x) / o.r, dy = (p.y - o.c.y) / o.ry, dz = (p.z - o.c.z) / o.r; crease = Math.min(crease, dx * dx + dy * dy + dz * dz); }
      let v = shell.dot(SUN) * 0.5 + 0.5 + (h - 0.5) * 0.1 + lift * 0.14 + rng.range(-0.03, 0.03);
      v -= Math.max(0, -shell.y) * 0.16;
      if (crease < 1.3) v -= 0.13 * (1.3 - crease) / 0.49;
      if (shad) { v = Math.min(v, 0.5) - 0.05; shell.addScaledVector(SUN, -(shell.dot(SUN) + 0.1)).normalize(); }
      // tip runs down the surface like a shingle, lifted off it a little
      dX.set(0, -1, 0).addScaledVector(shell, shell.y).normalize();
      if (dX.lengthSq() < 0.5) dX.set(rng() - 0.5, 0, rng() - 0.5).normalize();
      dX.applyAxisAngle(shell, Math.abs(shell.y) > 0.72 ? rng() * 6.28 : rng.range(-1.1, 1.1));
      const tip = dX.clone().multiplyScalar(0.8).addScaledVector(shell, rng.range(0.05, 0.75)).normalize();
      const s = rng.range(0.8, 1.3);
      if (inHole(p, 0.3) || nearChimney(p, 0.8)) continue;
      // young flush: the outer lip of a clump, gathered into tufts by low-frequency noise so it reads as sprigs, not specks
      const outer = shell.dot(new V(p.x - crownC.x, (p.y - crownC.y) * 0.5, p.z - crownC.z).normalize());
      const buried = CL.some((o) => o !== c && o.c.y < p.y - 0.3 && Math.hypot(p.x - o.c.x, p.z - o.c.z) < o.r * 0.85); // another clump underneath: only ever seen as flecks through gaps
      if ((outer < -0.12 || (buried && shad)) && hash(p.x * 3.1, p.y * 3.1, p.z * 3.1) < INNER_THIN) continue;  // inner leaves: the core behind them does the same job
      const young = outer < 0.3 || buried ? -9 : outer * 0.5 + (1 - Math.abs(nC.y + 0.3)) * 0.6 + Math.min(crease, 2) * 0.12 + (vnoise(p.x * 0.62 + 31, p.y * 0.62, p.z * 0.62) - 0.5) * 1.5;
      mkLeaf(buckets[c.g], p, shell, tip, s, leafTone(v, new Color()), young, v < 0.565);
    }
  }

  // what hanging things must stop above, by plan position
  const row = TOWN.row, yard = TOWN.bathhouse, deck = WRECK.footbridge, road = GROUND.road.xArm.x;
  const floorAt = (x, z) => {
    let f = 0.06;
    if (inRect(x, z, -0.45)) f = topAt(x, z) + 0.3;
    if (x < row.x[1] + 0.4 && z > row.z[0] - 0.4 && z < row.z[1] + 0.4) f = Math.max(f, row.maxH + 0.6);
    if (x < yard.x[1] + 0.4 && z < yard.z[1] + 0.4) f = Math.max(f, yard.maxH + 0.6);
    if (x > road[0] - 0.2 && x < road[1] + 0.2) f = Math.max(f, 5.4);
    if (x > deck.x[1] - 0.4 && z > deck.z[0] - 0.4 && z < deck.z[1] + 0.4) f = Math.max(f, deck.deckY + 0.5);
    for (const t of GROVE) for (const [lx, ly, lz, r, ry] of t.lobes) {
      const d = Math.hypot(x - lx, z - lz) / (r + 0.3);
      if (d < 1) f = Math.max(f, ly + (ry + 0.2) * Math.sqrt(1 - d * d));
    }
    return f;
  };
  // hanging sprays: airy strings of separate leaves below the crown edge
  const sprayBuckets = Array.from({ length: 6 }, () => []);
  { const tc = new V(TREE.x, 14, TREE.z), lows = CL.filter((c) => Math.hypot(c.c.x - tc.x, c.c.z - tc.z) > 4 && c.c.y < 16.6);
    for (const c of lows) {
      for (let j = rng.int(1, 3); j > 0; j--) {
        const a = rng() * 6.28, q = new V(c.c.x + Math.cos(a) * c.r * 0.8, c.c.y - c.ry * rng.range(0.55, 0.8), c.c.z + Math.sin(a) * c.r * 0.8);
        if (q.x > 1.2 && q.z > -1) continue;
        const out = new V(q.x - tc.x, 0, q.z - tc.z).normalize(), len = Math.min(rng.range(0.9, 2.3), q.y - floorAt(q.x, q.z) - 0.1), step = 0.27, segs = Math.round(len / step), swing = rng.range(0.25, 0.6);
        if (len < 0.5) continue;
        const b = sprayBuckets[Math.floor(((Math.atan2(out.z, out.x) + Math.PI) / 6.2832) * 6) % 6];
        const shade0 = occluded(q);
        for (let i = 0; i < segs; i++) {
          const t = i / segs, sd = i % 2 ? 1 : -1, side = new V(-out.z, 0, out.x).multiplyScalar(sd);
          const p = q.clone().addScaledVector(out, swing * Math.sin(t * 1.8)).addScaledVector(side, 0.05); p.y -= len * t;
          const tip = side.clone().multiplyScalar(0.62).add(new V(0, -1, 0)).addScaledVector(out, 0.2).normalize();
          const shell = out.clone().add(new V(0, 0.3, 0)).normalize();
          const v = shell.dot(SUN) * 0.5 + 0.5 + (shade0 ? -0.12 : 0.02) + rng.range(-0.04, 0.04);
          if (!inHole(p, 0.3)) mkLeaf(b, p, shell, tip, lerp(0.86, 0.5, t), leafTone(v, new Color()), hash(q.x, q.z, j) > 0.55 && t > 0.4 ? 9 : -9);
        }
      }
    }
  }

  // ~12% of the crown takes the young tint. It shifts each leaf's band rather than replacing it, so the light masses stay clean;
  // the translucency term scales with base colour, so these are what glow when looking toward the sun.
  { const all = [...buckets, ...sprayBuckets].flat(), sc = all.map((l) => l.young).sort((a, b) => b - a), cut = sc[Math.floor(sc.length * 0.12)];
    for (const l of all) if (l.young > cut) l.tone.lerp(l.dim ? YOUNG_DIM : YOUNG, l.dim ? 0.5 : 0.62); }

  // young shoots and little epiphyte tufts on the bark, so the wood below the crown is alive too
  const tufts = [];
  { const tone = [new Color(P.leafMid), new Color(P.fern), new Color(P.leafDeep), new Color(P.ivyLit)];
    const spots = branchSamples.filter((q) => !q.v2 && q.p.y < 14.2 && rng() < 0.2).map((q) => q.p.clone().add(new V(0, q.r * 0.8, 0)));
    for (let lv = 1; lv <= 4; lv++) for (let i = 0; i < 7; i++) { const a = rng() * 6.28, c = axisAt(SL[lv].y + rng.range(0.1, 1.4)), R = ringAt(c.y) + 0.55; spots.push(new V(c.x + Math.cos(a) * R, c.y, c.z + Math.sin(a) * R)); }
    for (const q of spots) for (let i = rng.int(5, 11); i > 0; i--) {
      const a = rng() * 6.28, up = new V(Math.cos(a) * 0.7, rng.range(0.5, 1.1), Math.sin(a) * 0.7).normalize();
      const shell = new V(Math.cos(a) * 0.3, 1, Math.sin(a) * 0.3).normalize(), v = rng.int(0, 3); // canopy shade: never takes direct sun
      shell.addScaledVector(SUN, -(shell.dot(SUN) + 0.1)).normalize();
      mkLeaf(tufts, q.clone().addScaledVector(up, rng.range(0, 0.22)), shell, up, rng.range(0.55, 0.9), tone[v]);
    } }

  const mkGroup = (list, pivot, amp) => {
    if (!list.length) return;
    const n = list.length, g = new THREE.BufferGeometry();
    for (const k of ['position', 'normal', 'uv', 'color']) g.setAttribute(k, leafGeo.attributes[k]);
    g.setIndex(leafGeo.index);
    const shell = new Float32Array(n * 3);
    const mesh = new THREE.InstancedMesh(g, leafMat, n), m = new THREE.Matrix4();
    list.forEach((l, i) => {
      dT.copy(l.tip); dU.copy(l.shell).addScaledVector(dT, -l.shell.dot(dT)).normalize(); dB.crossVectors(dU, dT).normalize();
      m.makeBasis(dB, dU, dT).scale(new V(l.s, l.s, l.s)); m.setPosition(l.p.x - pivot.x, l.p.y - pivot.y, l.p.z - pivot.z);
      mesh.setMatrixAt(i, m); mesh.setColorAt(i, l.tone); shell[i * 3] = l.shell.x; shell[i * 3 + 1] = l.shell.y; shell[i * 3 + 2] = l.shell.z;
    });
    g.setAttribute('aShell', new THREE.InstancedBufferAttribute(shell, 3));
    mesh.position.copy(pivot); mesh.castShadow = false; mesh.receiveShadow = false;
    ctx.softEdge(mesh); group.add(mesh);
    sways.push({ o: mesh, amp, x: pivot.x, z: pivot.z, ph: rng() * 6.28, f: rng.range(0.9, 1.5) });
    return mesh;
  };
  buckets.forEach((b, i) => {
    const cs = CL.filter((c) => c.g === i); if (!cs.length) return;
    const piv = new V(); for (const c of cs) piv.add(c.pivot); piv.divideScalar(cs.length);
    mkGroup(b, piv, 0.034);
  });
  sprayBuckets.forEach((b) => {
    if (!b.length) return;
    const piv = new V(); for (const l of b) piv.add(l.p); piv.divideScalar(b.length); piv.y += 1.5;
    mkGroup(b, piv, 0.04);
  });

  mkGroup(tufts, axisAt(11), 0.004);
  { const R = ctx.seeded('banyan:reach-tufts'), list = [], tone = [new Color(P.leafMid), new Color(P.fern), new Color(P.leafDeep), new Color(P.ivyLit)];
    const spots = [...reach.filter((q) => q.p.y < 14.4 && R() < 0.1).map((q) => q.p.clone().add(new V(0, q.r * 0.8, 0))), ...propTufts];
    for (const q of spots) for (let i = R.int(5, 10); i > 0; i--) {
      const a = R() * 6.28, up = new V(Math.cos(a) * 0.7, R.range(0.5, 1.1), Math.sin(a) * 0.7).normalize();
      const shell = new V(Math.cos(a) * 0.3, 1, Math.sin(a) * 0.3).normalize();
      shell.addScaledVector(SUN, -(shell.dot(SUN) + 0.1)).normalize();
      mkLeaf(list, q.clone().addScaledVector(up, R.range(0, 0.22)), shell, up, R.range(0.55, 0.9), tone[R.int(0, 3)]);
    }
    const piv = new V(); for (const l of list) piv.add(l.p); piv.divideScalar(list.length);
    mkGroup(list, piv, 0.002); }

  // ---------------------------------------------------------------- free-hanging aerial curtains (sway)
  rng = ctx.seeded('banyan:curtains'); // leaf counts above must not reshuffle the strands around the rooms
  const curtains = [];
  const hangers = branchSamples.filter((q) => !q.v2 && q.p.y < 15.2 && Math.hypot(q.p.x - TREE.x, q.p.z - TREE.z) > 3.2);
  const hairO = { radial: 5, step: 0.3, young: true, lift: -0.04 };
  /** free: a long draping strand that swings wide and twines; otherwise a tight one hugging a facade. */
  function hair(B, top, x, z, bottom, r, conv = null, free = true, opt = hairO, root = null) {
    const len = top.y - bottom, ph = rng() * 6.28, w = free ? rng.range(0.25, 0.6) : rng.range(0.1, 0.26), pts = root ? [root, top.clone()] : [top.clone()];
    const m = free ? 12 : 7, f = free ? 1 + len * 0.16 : 1;   // long strands get more swings rather than one big S
    for (let k = 1; k <= m; k++) {
      const t = k / m, e = conv ? smoothUp(0.35, 0.8, t) : 0, a = w * t * (1 - e * 0.72);
      const xt = x + Math.sin(t * 5 * f + ph) * a + (conv ? (conv[0] - x) * e : 0), zt = z + Math.cos(t * 4.2 * f + ph) * a + (conv ? (conv[1] - z) * e : 0);
      pts.push(new V(xt, top.y - len * t, zt));
    }
    B.tube(pts, [r, 0.012], opt);
  }
  for (let c = 0; c < 12; c++) {
    const seed = Math.floor(((c + rng()) / 12) * hangers.length), B = new Bark(), tops = [];
    let conv = null;
    for (let i = 0; i < 13; i++) {
      const h = hangers[Math.min(hangers.length - 1, Math.max(0, seed + rng.int(-6, 6)))];
      const x = h.p.x + rng.range(-0.3, 0.3), z = h.p.z + rng.range(-0.3, 0.3), inB = inRect(x, z, -0.25);
      const floor = topAt(x, z) + 0.3, long = rng() < 0.2;
      let bottom = Math.max(floor, long ? floor + rng.range(0, 1.6) : h.p.y - rng.range(1.4, 5));
      if (!inB) {
        if (z < 2.6 && x > -9.9 && x < -0.5) bottom = Math.max(bottom, 3.1);
        if (x < 3.3 && x > 1 && z > -6.8 && z < -3.3) bottom = Math.max(bottom, 2.8);
        if (z > 2.2 || x > 3.2) bottom = Math.max(bottom, rng.range(4.5, 8.5));   // no lone poles over the road
      }
      if (inB) bottom = Math.max(bottom, h.p.y - rng.range(1.2, 4.2));
      if (x > -3.3 && z > -3.3) bottom = Math.max(bottom, 8);   // nothing crosses the collapse opening
      if (h.p.y - bottom < 0.7) continue;
      const pair = rng() < 0.35 && conv && Math.hypot(conv[0] - x, conv[1] - z) < 0.9; // some strands drift together and merge lower down
      hair(B, h.p, x, z, bottom, long ? rng.range(0.085, 0.12) : rng.range(0.05, 0.085), pair ? conv : null);
      conv = [x + rng.range(-0.1, 0.1), z + rng.range(-0.1, 0.1)];
      tops.push(h.p);
    }
    if (!tops.length) continue;
    const piv = new V(); for (const t of tops) piv.add(t); piv.divideScalar(tops.length);
    curtains.push({ B, piv, amp: 0.016 });
  }
  // thin strands that hang off the facades beside the old roots, stopping above every opening
  const clearTo = (ops, u, y) => { let b = 0.5; for (const [u0, u1, y0, y1] of ops) if (u > u0 - 0.16 && u < u1 + 0.16) { if (y >= y0 - 0.1 && y <= y1 + 0.1) return 99; if (y1 < y) b = Math.max(b, y1 + 0.14); } return b; };
  for (const [paths, ops, at, onRoot] of [[[S1, S2, S3], S_OPS, (u, y) => new V(u, y, 0.84), southAt], [[E1, E3], E_OPS, (u, y) => new V(1.84, y, u), eastAt]]) {
    const B = new Bark(), tops = [];
    for (const path of paths) for (let i = 0; i < 8; i++) {
      const k = rng.int(0, Math.min(5, path.length - 2)), q = path[k], u = q[0] + rng.range(-0.5, 0.5), y = q[1] - rng.range(0, 0.6);
      const stop = clearTo(ops, u, y), bottom = Math.max(stop, y - rng.range(1.2, 3.6));
      if (stop > 50 || y - bottom < 0.7) continue;
      const top = at(u, y); hair(B, top, top.x, top.z, bottom, rng.range(0.04, 0.065), null, false, hairO, onRoot(path[Math.max(0, k - 1)], 0.1)); tops.push(top); // peels off the wall root above it
    }
    const piv = new V(); for (const t of tops) piv.add(t); piv.divideScalar(tops.length); piv.y += 2;
    curtains.push({ B, piv, amp: 0.006 });
  }
  // the outer limbs let down their own curtains. Every strand stops short of what the ring has built below it.
  { rng = ctx.seeded('banyan:reach-hair');
    const LONG_O = { radial: 5, step: 0.46, young: true, lift: -0.04 };
    const spots = reach.filter((q) => q.p.y < 15.4 && !inRect(q.p.x, q.p.z, -0.8));
    for (let L = 0; L < REACH.length; L++) {
      const mine = spots.filter((q) => q.limb === L), B = new Bark(), tops = [];
      let conv = null;
      for (let i = 0; i < 15 && mine.length; i++) {
        const h = rng.pick(mine), x = h.p.x + rng.range(-0.35, 0.35), z = h.p.z + rng.range(-0.35, 0.35), f = floorAt(x, z), toGround = rng() < 0.2;
        if (Math.hypot(x - TOWN.chimney.x, z - TOWN.chimney.z) < 1.1) continue;
        const bottom = Math.max(f + rng.range(0, 0.5), toGround ? 0 : h.p.y - rng.range(2.2, 7.5));
        if (h.p.y - bottom < 1) continue;
        const pair = rng() < 0.35 && conv && Math.hypot(conv[0] - x, conv[1] - z) < 0.9;
        hair(B, h.p, x, z, bottom, toGround ? rng.range(0.085, 0.125) : rng.range(0.05, 0.08), pair ? conv : null, true, LONG_O);
        conv = [x + rng.range(-0.1, 0.1), z + rng.range(-0.1, 0.1)];
        tops.push(h.p);
      }
      if (!tops.length) continue;
      const piv = new V(); for (const t of tops) piv.add(t); piv.divideScalar(tops.length);
      curtains.push({ B, piv, amp: 0.012 });
    } }
  for (const { B, piv, amp } of curtains) {
    const m = B.mesh(hairMat, { castShadow: false, receiveShadow: false, origin: piv });
    ctx.softEdge(m); group.add(m);
    sways.push({ o: m, amp, x: piv.x, z: piv.z, ph: rng() * 6.28, f: rng.range(0.7, 1.2) });
  }

  // ---------------------------------------------------------------- assemble bark
  group.add(bark.mesh(barkMat));
  group.add(props.mesh(barkMat));

  const update = (t) => {
    for (const s of sways) {
      const w = ctx.wind(t, s.x, s.z), w2 = Math.sin(t * s.f + s.ph) * 0.3;
      s.o.rotation.x = (w * 0.7 + w2) * s.amp;
      s.o.rotation.z = (-w + w2 * 0.6) * s.amp;
    }
  };
  return { group, update };
}
