// The grove: camphors, ginkgos and a canal willow that give the new ground its dappled shade, with shrubs and hydrangeas at their feet.

export function build(ctx) {
  const { THREE, layout, P, kit } = ctx;
  let rng = ctx.rng;   // the willow swaps in a stream of its own while it grows: see the tree loop
  const { GROVE, CANOPIES, SUN_DIR, RAIL, GROUND, RIVER, MEADOW, TOWN, pointInPoly, riverOutline } = layout;
  const V = THREE.Vector3, Color = THREE.Color;
  const SUN = new V(...SUN_DIR), MOSS_DIR = new V(-SUN.x, 0.22, -SUN.z).normalize();
  const group = new THREE.Group(); group.name = 'grove';
  const sways = [];
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const C = (h) => new Color(h);
  const tmpC = new Color();

  // ---------------------------------------------------------------- noise
  const hash = (i, j, k) => { const h = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453; return h - Math.floor(h); };
  function vnoise(x, y, z) {
    const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z);
    let u = x - i, v = y - j, w = z - k; u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v); w = w * w * (3 - 2 * w);
    const m = (a, b, t) => a + (b - a) * t;
    return m(m(m(hash(i, j, k), hash(i + 1, j, k), u), m(hash(i, j + 1, k), hash(i + 1, j + 1, k), u), v),
      m(m(hash(i, j, k + 1), hash(i + 1, j, k + 1), u), m(hash(i, j + 1, k + 1), hash(i + 1, j + 1, k + 1), u), v), w);
  }

  // ---------------------------------------------------------------- ground
  const riverPoly = riverOutline(0.22);   // river.js's own stations: on the willow's bend the coarser outlines are centimetres off
  const inRiver = (x, z) => pointInPoly(x, z, riverPoly);
  /** Distance to the canal wall, either side of it. */
  const bankDist = (x, z) => {
    let best = 1e9;
    for (let i = 0, j = riverPoly.length - 1; i < riverPoly.length; j = i++) {
      const [ax, az] = riverPoly[j], [bx, bz] = riverPoly[i], dx = bx - ax, dz = bz - az, t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1));
      best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
    }
    return best;
  };
  // The bridge as river.js builds it: [across, along] in its own frame, and its deck profile.
  const BR = RIVER.bridge, BA = BR.length / 2, BW = BR.width / 2, brC = Math.cos(BR.yaw), brS = Math.sin(BR.yaw);
  const brLocal = (x, z) => { const dx = x - BR.x, dz = z - BR.z; return [dx * brC - dz * brS, dx * brS + dz * brC]; };
  const deckY = (b) => 0.13 + 0.87 * Math.pow(Math.cos((Math.PI * clamp(b / BA, -1, 1)) / 2), 1.3);
  const onBridge = (x, z, m) => { const [a, b] = brLocal(x, z); return Math.abs(a) < BW + m && Math.abs(b) < BA + m; };
  const PARAPET = 0.64;                                        // post, cap stone and finial above the deck
  const LANTERN = [[BW + 0.42, 2.0], [-BW - 0.42, -2.05]].map(([a, b]) => ({ x: BR.x + a * brC + b * brS, z: BR.z - a * brS + b * brC, top: deckY(b) + 1.42 }));
  const inBed = (x) => x > RAIL.bed.x[0] && x < RAIL.bed.x[1];
  const baseY = (x) => (inBed(x) ? RAIL.bed.y : GROUND.soilY);
  const offPlinth = (x, z) => Math.abs(x) > 19.6 || Math.abs(z) > 19.6;
  const nearRiver = (x, z, m = 0.42) => { // m clears the coping, whose stones run 0.31 back from the wall
    if (z < 12 || inRiver(x, z)) return z >= 12;
    for (let a = 0; a < 8; a++) if (inRiver(x + Math.cos(a * 0.785) * m, z + Math.sin(a * 0.785) * m)) return true;
    return false;
  };
  // what is left of the lost path on the far bank, ground.js's lostTail: its stepping stones stay above the willow's mound and roots
  const LOST_TAIL = [[-6.95, 18.05], [-7.5, 18.75], [-8.35, 19.35]];
  const onTail = (x, z, m) => {
    for (let i = 1; i < LOST_TAIL.length; i++) {
      const [ax, az] = LOST_TAIL[i - 1], [bx, bz] = LOST_TAIL[i], dx = bx - ax, dz = bz - az, t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz));
      if (Math.hypot(x - ax - dx * t, z - az - dz * t) < m) return true;
    }
    return false;
  };
  const blocked = (x, z) => offPlinth(x, z) || nearRiver(x, z) || onBridge(x, z, 0.3) || onTail(x, z, 0.36);
  // The rail ginkgo stands between the two rails of track 1. rail.js keeps the east rail on its line and shoulders the west one aside and up; this follows
  // its railPath, so the roots heave the ballast and the earth stays under the steel. The band is wider than the rail because the mound mesh is coarse.
  const GAUGE = 1.07, RAIL_FOOT = RAIL.bed.y + 0.12, RAIL_BAND = 0.35, railTree = GROVE.find((t) => t.kind === 'ginkgo' && inBed(t.x));
  const railLines = (z) => { const f = Math.exp(-(((z - railTree.z) / 1.25) ** 2)), c = RAIL.tracks[1]; return [[c + GAUGE / 2, RAIL_FOOT], [c - GAUGE / 2 - f * 0.5, RAIL_FOOT + f * 0.16]]; };
  /** Highest the ground may stand here: just under the rail foot on the band, then a bank up and away from it. */
  const railCap = (x, z) => Math.min(...railLines(z).map(([rx, foot]) => foot - 0.035 + 0.7 * Math.max(0, Math.abs(x - rx) - RAIL_BAND)));
  const onRail = (x, z) => railLines(z).some(([rx]) => Math.abs(x - rx) < 0.3);

  // ---------------------------------------------------------------- bark
  const WARM = C('#8a6a4a');
  const PAL = {
    camphor: { lit: C('#e0c096'), mid: C('#b89674').lerp(WARM, 0.1), deep: C('#8a6f60'), groove: C('#64524e'), young: C('#a98a66') },
    ginkgo: { lit: C('#eedcb8'), mid: C('#c8b296'), deep: C('#9c8a7c'), groove: C('#736662'), young: C('#c8b08a') },
    willow: { lit: C('#d8c096'), mid: C('#ab9676'), deep: C('#7f7264'), groove: C('#5e5856'), young: C('#c2c068') },
  };
  function barkColor(p, n, ridge, o) {
    const pal = o.pal, s = n.dot(SUN), nz = vnoise(p.x * 1.3, p.y * 0.6, p.z * 1.3);
    const v = 0.46 + ridge * 0.36 + s * 0.2 + (nz - 0.5) * 0.46 + (o.lift || 0);
    if (o.young) tmpC.copy(pal.young).lerp(pal.deep, clamp(0.5 - v));
    else tmpC.copy(v > 0.66 ? pal.lit : v > 0.42 ? pal.mid : v > 0.24 ? pal.deep : pal.groove);
    return tmpC;
  }
  /** Stored per vertex, thresholded per pixel: crisp painted patches on the shaded side, thicker near the ground. */
  const mossField = (p, n, o) => n.dot(MOSS_DIR) * 0.34 + Math.max(n.y, 0) * 0.3 + (vnoise(p.x * 0.9 + 9, p.y * 0.5, p.z * 0.9) - 0.5) * 1.6 + (vnoise(p.x * 2.1, p.y * 1.7 + 4, p.z * 2.1) - 0.5) * 0.4 + (o.moss ?? 0) + 0.2 * Math.exp(-Math.max(0, p.y - (o.g ?? 0)) / 0.9);
  const MOSS_T = 0.66;

  /** Accumulates tubes into one indexed mesh; colours are per-vertex bands. */
  class Bark {
    constructor() { this.pos = []; this.col = []; this.moss = []; this.idx = []; }
    /** rs: [r0,r1] over arc length, or one radius per control point. o: pal, radial, step, seg, flute, lobes, twist, lump, moss, lift, young, g. */
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
          const K = barkColor(Q, N, ridge, o); this.col.push(K.r, K.g, K.b); this.moss.push(mossField(Q, N, o));
        }
      }
      for (let i = 0; i < n; i++) for (let j = 0; j < radial; j++) {
        const a = base + i * radial + j, b = base + i * radial + (j + 1) % radial, c = a + radial, d = b + radial;
        this.idx.push(a, c, b, b, c, d);
      }
    }
    mesh(mat) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.col), 3));
      g.setAttribute('aMoss', new THREE.BufferAttribute(new Float32Array(this.moss), 1));
      g.setIndex(this.idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true;
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
        { float mo=vMoss+(texture2D(uNoise,vec2(vWPos.x,vWPos.y)*.31).r+texture2D(uNoise,vec2(vWPos.z,vWPos.y)*.37).g-1.)*.34;
          float a=max(fwidth(mo),.002);
          diffuseColor.rgb=mix(diffuseColor.rgb,${glc(C(P.mossDeep).lerp(C(P.moss), 0.45))},smoothstep(${MOSS_T.toFixed(2)}-a,${MOSS_T.toFixed(2)}+a,mo));
          diffuseColor.rgb=mix(diffuseColor.rgb,${glc(C(P.moss))},smoothstep(${(MOSS_T + 0.2).toFixed(2)}-a,${(MOSS_T + 0.2).toFixed(2)}+a,mo)); }`);
    };
    m.customProgramCacheKey = () => key + '|grovebark';
    return m;
  })();
  const bark = new Bark();
  const curveOf = (pts) => new THREE.CatmullRomCurve3(pts, false, 'centripetal');

  // ---------------------------------------------------------------- leaf materials and shapes
  /** Toon material lit by the smooth clump normal, so the cel terminator draws broad masses. */
  const shellMat = (opts) => {
    const m = ctx.toon({ color: '#ffffff', side: THREE.DoubleSide, vertexColors: true, ...opts });
    const baseCompile = m.onBeforeCompile, key = m.customProgramCacheKey();
    m.onBeforeCompile = (s, r) => {
      baseCompile(s, r);
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aShell;')
        .replace('#include <normal_vertex>', 'transformedNormal=normalize(mat3(viewMatrix)*aShell);\n#include <normal_vertex>');
      s.fragmentShader = s.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
    };
    m.customProgramCacheKey = () => key + '|shell';
    return m;
  };
  const leafMat = shellMat({ dapple: false, translucent: 1 });
  const willowMat = shellMat({ dapple: false, translucent: 0.5 });
  const lowLeafMat = shellMat({ dapple: true, translucent: 0.7 });   // under a canopy: takes the moving light spots
  const coreMat = ctx.toon({ vertexColors: true, dapple: false, translucent: 0.7 });

  function mkLeafGeo(verts, cols, idx) {
    const g = new THREE.BufferGeometry(), n = verts.length / 3;
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(Array.from({ length: n * 3 }, (_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(n * 2).fill(0), 2));
    g.setIndex(idx); return g;
  }
  const ovate = (l, w, c = 0.05) => mkLeafGeo(
    [0, 0, 0, -w / 2, c, l * 0.3, -w * 0.4, c, l * 0.68, 0, 0, l, w * 0.4, c, l * 0.68, w / 2, c, l * 0.3],
    [0.72, 0.74, 0.72, 0.92, 0.92, 0.9, 1, 1, 0.98, 1.06, 1.06, 1, 1, 1, 0.98, 0.92, 0.92, 0.9],
    [0, 2, 1, 0, 3, 2, 0, 4, 3, 0, 5, 4]);
  // Ginkgo fan: widest at low shoulders, a rounded outer edge, one shallow notch. Green at the stalk, warm at the rim, so each leaf turns from its edge inward.
  const fan = (l, w, c = 0.04) => mkLeafGeo(
    [0, 0, 0, -w * 0.5, c, l * 0.64, -w * 0.4, c, l * 0.9, -w * 0.16, c, l, 0, c * 0.5, l * 0.82, w * 0.16, c, l, w * 0.4, c, l * 0.9, w * 0.5, c, l * 0.64],
    [0.74, 0.84, 0.56, 0.96, 0.98, 0.8, 1.02, 1, 0.84, 1.08, 1.02, 0.84, 0.98, 0.96, 0.8, 1.08, 1.02, 0.84, 1.02, 1, 0.84, 0.96, 0.98, 0.8],
    [0, 2, 1, 0, 3, 2, 0, 4, 3, 0, 5, 4, 0, 6, 5, 0, 7, 6]);
  const lance = (l, w, c = 0.02) => mkLeafGeo(
    [0, 0, 0, -w / 2, c, l * 0.34, -w * 0.36, c, l * 0.64, 0, 0, l, w * 0.36, c, l * 0.64, w / 2, c, l * 0.34],
    [0.76, 0.78, 0.72, 0.94, 0.94, 0.9, 1, 1, 0.98, 1.08, 1.08, 1, 1, 1, 0.98, 0.94, 0.94, 0.9],
    [0, 2, 1, 0, 3, 2, 0, 4, 3, 0, 5, 4]);

  // ---------------------------------------------------------------- species
  const bands = (t, cols, out) => { for (let i = 0; i < t.length; i++) if (cols.v > t[i]) return out.copy(cols.c[i]); return out.copy(cols.c[t.length]); };
  const CAMPHOR_C = [C(P.leafLit).lerp(C(P.leafGold), 0.35).multiplyScalar(0.8), C(P.leafMid).multiplyScalar(0.86), C('#2b8f58'), C('#17705f'), C('#0f4f5a')];
  const WILLOW_C = [C(P.leafLit).lerp(C(P.leafGold), 0.3).multiplyScalar(0.82), C(P.leafLit).lerp(C(P.leafMid), 0.6).multiplyScalar(0.82), C(P.leafMid).lerp(C(P.leafDeep), 0.4).multiplyScalar(0.9), C(P.leafDeep), C(P.leafShade)];
  const GOLD = [ // [inner, turning, rim] × [lit, mid, deep, shade]
    [C('#dcea72'), C('#ffe66e'), C('#ffd257')],
    [C('#b4da60'), C('#f6d656'), C('#f7bb4b')],
    [C('#71bd60'), C('#c9b850'), C('#d99d47')],
    [C('#2f8f6c'), C('#5e9c62'), C('#9c8a58')],
  ];
  const SPECIES = {
    camphor: {
      pal: PAL.camphor, clumpK: 0.45, clumpMin: 0.95, clumpMax: 1.5, fill: 3.1, dens: 15, sats: 0.46, coreK: 0.64, K: 5, amp: 0.03, leafS: [0.82, 1.22],
      geo: ovate(0.5, 0.33), coreTop: C(P.leafDeep).multiplyScalar(0.62), coreBot: C('#0f4a56'),
      tone: (v, info, out) => out.copy(v > 0.9 ? CAMPHOR_C[0] : v > 0.77 ? CAMPHOR_C[1] : v > 0.6 ? CAMPHOR_C[2] : v > 0.43 ? CAMPHOR_C[3] : CAMPHOR_C[4]),
      young: 0.05,
    },
    ginkgo: {
      pal: PAL.ginkgo, clumpK: 0.42, clumpMin: 0.82, clumpMax: 1.15, fill: 2.5, dens: 16, sats: 0.3, coreK: 0.5, K: 5, amp: 0.036, leafS: [1, 1.45], keep: (l) => (l.dim ? 0.58 : 0.74),
      geo: fan(0.44, 0.62), coreTop: C('#a9ad52'), coreBot: C('#2d7a66'),
      tone: (v, info, out) => {
        const row = v > 0.76 ? 0 : v > 0.58 ? 1 : v > 0.42 ? 2 : 3;
        const turn = info.turn > 0.66 ? 2 : info.turn > 0.36 ? 1 : 0;
        return out.copy(GOLD[row][turn]);
      },
      young: 0,
    },
    willow: {
      pal: PAL.willow, clumpK: 0.42, clumpMin: 0.85, clumpMax: 1.1, fill: 3.0, dens: 13, sats: 0.1, coreK: 0, K: 3, amp: 0.022, leafS: [0.85, 1.2],
      geo: lance(0.44, 0.14),
      tone: (v, info, out) => out.copy(v > 0.86 ? WILLOW_C[0] : v > 0.7 ? WILLOW_C[1] : v > 0.54 ? WILLOW_C[2] : v > 0.4 ? WILLOW_C[3] : WILLOW_C[4]),
      young: 0,
    },
  };

  // ---------------------------------------------------------------- trees: wood
  const heaveAt = (tr, x, z) => { // height of the ground the roots have lifted
    const d = Math.hypot(x - tr.foot.x, z - tr.foot.z) / tr.moundR;
    const h = tr.moundH * Math.exp(-d * d * 2.6) * (1 + 0.28 * Math.sin(Math.atan2(z - tr.foot.z, x - tr.foot.x) * 5 + tr.seed));
    return tr.T === railTree ? Math.min(h, railCap(x, z) - tr.g) : h;
  };
  /** A root keeps to y, but ducks under the rail rather than through it. */
  const rootY = (tr, x, z, y, r) => (tr.T === railTree ? Math.min(y, railCap(x, z) - r) : y);
  function addLimb(tr, pts, r0, r1, o = {}) {
    bark.tube(pts, [r0, r1], { pal: tr.pal, g: tr.g, radial: 7, step: 0.42, flute: 0.1, lobes: 3, twist: 1, moss: -0.08, ...o });
    const c = curveOf(pts), n = Math.max(4, Math.ceil(c.getLength() / 0.4));
    for (let k = 2; k <= n; k++) { const s = k / n; tr.samples.push({ p: c.getPointAt(s), r: lerp(r0, r1, s) }); }
    return c;
  }
  function limbCurve(S, E, wob, rise = 1.7) {
    const d = new V().subVectors(E, S), side = new V(-d.z, 0, d.x).normalize(), ph = rng() * 6.28, pts = [];
    for (const s of [0, 0.16, 0.34, 0.52, 0.7, 0.86, 1]) {
      const q = new V(lerp(S.x, E.x, s), S.y + (E.y - S.y) * (1 - Math.pow(1 - s, rise)), lerp(S.z, E.z, s));
      q.addScaledVector(side, Math.sin(s * 5 + ph) * wob * Math.sin(s * Math.PI));
      q.y += Math.sin(s * 7.5 + ph * 2) * wob * 0.3 * Math.sin(s * Math.PI);
      pts.push(q);
    }
    return pts;
  }
  /** Root pouring off the trunk, snaking through the heaved ground, half buried. */
  function surfaceRoot(tr, a0, len, r0, h0 = 1.1) {
    const { axis, T, g } = tr, r = T.trunkR, dir = (a) => [Math.cos(a), Math.sin(a)];
    let [dx, dz] = dir(a0), c = axis(g + h0);
    const pts = [new V(c.x + dx * r * 0.2, g + h0 + 0.3, c.z + dz * r * 0.2)], rs = [r0 * 0.1];   // starts buried in the trunk, so no cut end shows
    c = axis(g + h0 * 0.55); pts.push(new V(c.x + dx * r * 1.0, g + h0 * 0.55, c.z + dz * r * 1.0)); rs.push(r0 * 0.9);
    c = axis(g + 0.2); pts.push(new V(c.x + dx * r * 1.75, g + 0.2 + heaveAt(tr, c.x + dx * r * 1.75, c.z + dz * r * 1.75) * 0.8, c.z + dz * r * 1.75)); rs.push(r0);
    let x = pts[2].x, z = pts[2].z, a = a0, walked = 0, i = 0;
    const ph = rng() * 6.28, head = pts.length, stepL = 0.46;
    while (walked < len) {
      a += rng.range(-0.42, 0.42) + (a0 - a) * 0.2;
      [dx, dz] = dir(a);
      const nx = x + dx * stepL, nz = z + dz * stepL;
      if (blocked(nx, nz)) break;
      x = nx; z = nz; walked += stepL; i++;
      const u = walked / len, sink = u > 0.8 ? (u - 0.8) * 0.5 : 0;
      pts.push(new V(x, g + heaveAt(tr, x, z) + 0.05 + Math.max(0, Math.sin(i * 1.1 + ph)) * 0.09 * (1 - u) - sink, z));
      rs.push(0);
    }
    const nWalk = pts.length - head;
    for (let k = 0; k < nWalk; k++) rs[head + k] = lerp(r0, 0.03, Math.pow((k + 1) / nWalk, 0.8));
    for (let k = 2; k < pts.length; k++) pts[k].y = rootY(tr, pts[k].x, pts[k].z, pts[k].y, rs[k]);
    if (T.kind === 'willow') { pts.push(new V(x + dx * 0.1, g - 0.08, z + dz * 0.1)); rs.push(0.02); }   // stopped short of the bank, the bridge or the stones: it dives, no cut end shows
    bark.tube(pts, rs, { pal: tr.pal, g, radial: 6, step: 0.32, flute: 0.1, lobes: 2, twist: 0.8, moss: -0.12 });
    // a thin side root off the middle
    if (pts.length > 7) {
      const k = 4 + rng.int(0, 2), s = pts[k], a2 = a0 + rng.sign() * rng.range(0.6, 1.1), q = [s];
      let sx = s.x, sz = s.z, b = a2;
      for (let j = 0; j < 4; j++) { b += rng.range(-0.4, 0.4); sx += Math.cos(b) * 0.36; sz += Math.sin(b) * 0.36; if (blocked(sx, sz)) break; q.push(new V(sx, rootY(tr, sx, sz, g + heaveAt(tr, sx, sz) + 0.03 - j * 0.015, 0.04), sz)); }
      if (q.length > 2 && T.kind === 'willow') { const e = q[q.length - 1]; q.push(new V(e.x + Math.cos(b) * 0.1, g - 0.08, e.z + Math.sin(b) * 0.1)); }
      if (q.length > 2) bark.tube(q, [Math.max(rs[k] * 0.55, 0.04), 0.02], { pal: tr.pal, g, radial: 4, step: 0.36, moss: -0.1 });
    }
  }
  function trunkTube(tr, top, fork, wide, flare = 0.85) {
    const { T, g, axis } = tr, pts = [], rs = [], r = T.trunkR;
    for (let y = g - 0.15; y < top; y += 0.5) {
      pts.push(axis(y));
      rs.push(r * wide * (1 + flare * Math.exp(-(y - g) / 0.55) + 0.14 * Math.exp(-Math.pow((y - fork) / 0.7, 2))) * lerp(1, 0.2, smooth(fork - 0.8, top, y)));
    }
    bark.tube(pts, rs, { pal: tr.pal, g, radial: 12, step: 0.22, flute: 0.12, lobes: tr.S === SPECIES.ginkgo ? 5 : 4, twist: tr.S === SPECIES.ginkgo ? 0.35 : 0.8, lump: 0.05, moss: 0.04 });
  }

  function growCamphor(tr) {
    const { T, LOBES, axis } = tr, H = LOBES[0].c.y, fork = H * 0.38, r = T.trunkR;
    trunkTube(tr, fork + 0.9, fork, 1.18);
    const L0 = LOBES[0];
    const ends = [];
    for (const L of LOBES.slice(1)) ends.push({ E: L.c.clone().add(new V(0, -L.ry * 0.3, 0)), r: r * 0.62, L });
    const base = Math.atan2(LOBES[1].c.z - T.z, LOBES[1].c.x - T.x);
    for (const da of [1.05, 3.4, 4.9]) {
      const a = base + da + rng.range(-0.2, 0.2);
      ends.push({ E: new V(L0.c.x + Math.cos(a) * L0.r * 0.56, L0.c.y - L0.ry * 0.08, L0.c.z + Math.sin(a) * L0.r * 0.56), r: r * 0.56, L: L0 });
    }
    ends.push({ E: L0.c.clone().add(new V(0, L0.ry * 0.32, 0)), r: r * 0.6, L: L0 });
    ends.forEach((e, i) => {
      const a = Math.atan2(e.E.z - T.z, e.E.x - T.x), S = axis(fork - 0.5 + i * 0.22).add(new V(Math.cos(a) * r * 0.42, 0, Math.sin(a) * r * 0.42));
      const c = addLimb(tr, [axis(S.y - 1.3), ...limbCurve(S, e.E, 0.32, 1.5)], e.r, 0.08, { radial: 8 });
      for (const s of [0.5, 0.68]) { // forks that spread the wood through the lobe
        const f = c.getPointAt(s), aa = a + rng.sign() * rng.range(0.7, 1.3), rr = e.L.r * rng.range(0.42, 0.68);
        const E = new V(e.L.c.x + Math.cos(aa) * rr, lerp(f.y, e.L.c.y, 0.6) + rng.range(-0.2, 0.5), e.L.c.z + Math.sin(aa) * rr);
        addLimb(tr, limbCurve(f, E, 0.2, 1.4), lerp(e.r, 0.08, s) * 0.7, 0.05, { radial: 5, step: 0.5, flute: 0.06 });
      }
    });
  }
  function growGinkgo(tr) {
    const { T, LOBES, axis } = tr, L0 = LOBES[0], top = L0.c.y + L0.ry * 0.5, r = T.trunkR, g = tr.g;
    // the leader runs right through the crown, tapering to a whip
    const pts = [], rs = [];
    for (let y = g - 0.15; y < top; y += 0.6) { pts.push(axis(y)); rs.push(lerp(r * 1.3, 0.05, Math.pow(Math.max(0, y - g) / (top - g), 0.82)) * (1 + 0.7 * Math.exp(-(y - g) / 0.5))); }
    bark.tube(pts, rs, { pal: tr.pal, g, radial: 12, step: 0.24, flute: 0.13, lobes: 5, twist: 0.3, lump: 0.03, moss: 0 });
    { const c = curveOf(pts); for (let k = 8; k <= 40; k++) { const s = k / 40; tr.samples.push({ p: c.getPointAt(s), r: lerp(r, 0.05, s) }); } }
    // ascending tiers, in a spiral, longest low in the crown
    const lo = L0.c.y - L0.ry * 0.92, hi = L0.c.y + L0.ry * 0.5, n = 10;
    for (let i = 0; i < n; i++) {
      const y0 = lerp(lo, hi, (i + 0.3) / n), a = i * 2.4 + tr.seed, f = (y0 - L0.c.y) / L0.ry, reach = L0.r * Math.sqrt(Math.max(0.1, 1 - f * f * 0.75)) * rng.range(0.72, 0.92);
      const S = axis(y0), E = new V(S.x + Math.cos(a) * reach, y0 + reach * rng.range(0.42, 0.72), S.z + Math.sin(a) * reach);
      { const q = Math.hypot((E.x - L0.c.x) / L0.r, (E.y - L0.c.y) / L0.ry, (E.z - L0.c.z) / L0.r); if (q > 0.78) E.lerp(L0.c, 1 - 0.78 / q); }
      const b = addLimb(tr, limbCurve(S, E, 0.16, 1.15), lerp(r * 0.5, 0.1, i / n), 0.035, { radial: 5, step: 0.5, flute: 0.05 });
      const f2 = b.getPointAt(0.55), aa = a + rng.sign() * 0.7;
      addLimb(tr, [f2, f2.clone().add(new V(Math.cos(aa) * reach * 0.22, reach * 0.14, Math.sin(aa) * reach * 0.22)), f2.clone().add(new V(Math.cos(aa) * reach * 0.42, reach * 0.34, Math.sin(aa) * reach * 0.42))], 0.05, 0.025, { radial: 5, step: 0.5, flute: 0 });
    }
    for (const L of LOBES.slice(1)) {
      const S = axis(L.c.y - 1.2), E = L.c.clone().add(new V(0, L.ry * 0.1, 0));
      addLimb(tr, limbCurve(S, E, 0.2, 1.2), r * 0.44, 0.04, { radial: 7 });
    }
  }
  function growWillow(tr) {
    const { T, LOBES, axis, g } = tr, L = LOBES[0], fork = g + 2.5, r = T.trunkR;
    trunkTube(tr, fork + 0.5, fork, 1.32, 0.55);
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05 + 0.4 + rng.range(-0.2, 0.2), S = axis(fork - 0.5 + i * 0.12).add(new V(Math.cos(a) * r * 0.6, 0, Math.sin(a) * r * 0.6));
      const rise = new V(T.x + Math.cos(a) * L.r * 0.34, L.c.y + L.ry * 0.42, T.z + Math.sin(a) * L.r * 0.34);
      const E = new V(T.x + Math.cos(a) * L.r * 0.82, L.c.y + L.ry * 0.12, T.z + Math.sin(a) * L.r * 0.82);
      const mid = S.clone().lerp(rise, 0.5).add(new V(Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2));
      addLimb(tr, [axis(S.y - 1.2), S, mid, rise, rise.clone().lerp(E, 0.55).add(new V(0, 0.12, 0)), E], r * 0.7, 0.04, { radial: 7, step: 0.3, flute: 0.12, lump: 0.1 });
    }
  }

  // ---------------------------------------------------------------- trees: canopies
  const GA = Math.PI * (3 - Math.sqrt(5));
  const fib = (k, n) => { const y = 1 - (2 * (k + 0.5)) / n, r = Math.sqrt(1 - y * y), a = k * GA; return new V(Math.cos(a) * r, y, Math.sin(a) * r); };
  /** Sun blocked by a lobe of another tree (their canopies cast nothing into the shadow map). */
  const shadedByOthers = (p, own) => {
    for (const l of CANOPIES) {
      if (own.includes(l)) continue;
      const [x, y, z, r, ry] = l, dx = x - p.x, dy = (y - p.y) * (r / ry), dz = z - p.z, sy = SUN.y * (r / ry);
      const sl = Math.hypot(SUN.x, sy, SUN.z), t = (dx * SUN.x + dy * sy + dz * SUN.z) / sl;
      if (t > 0 && dx * dx + dy * dy + dz * dz - t * t < r * r * 0.7) return true;
    }
    return false;
  };
  const coreParts = [];
  const dX = new V(), dT = new V(), dU = new V(), dB = new V(), mScale = new V();
  const instM = new THREE.Matrix4();

  /** One InstancedMesh of leaves, optionally pivoted for sway. Each leaf: {p, shell, tip, s, tone}. */
  function mkLeaves(list, geo, mat, pivot = null, amp = 0) {
    if (!list.length) return null;
    const n = list.length, g = new THREE.BufferGeometry(), o = pivot || new V();
    for (const k of ['position', 'normal', 'uv', 'color']) g.setAttribute(k, geo.attributes[k]);
    g.setIndex(geo.index);
    const shell = new Float32Array(n * 3), mesh = new THREE.InstancedMesh(g, mat, n);
    list.forEach((l, i) => {
      dT.copy(l.tip); dU.copy(l.shell).addScaledVector(dT, -l.shell.dot(dT)).normalize(); dB.crossVectors(dU, dT).normalize();
      instM.makeBasis(dB, dU, dT).scale(mScale.set(l.s, l.s, l.s)); instM.setPosition(l.p.x - o.x, l.p.y - o.y, l.p.z - o.z);
      mesh.setMatrixAt(i, instM); mesh.setColorAt(i, l.tone);
      shell[i * 3] = l.shell.x; shell[i * 3 + 1] = l.shell.y; shell[i * 3 + 2] = l.shell.z;
    });
    g.setAttribute('aShell', new THREE.InstancedBufferAttribute(shell, 3));
    mesh.position.copy(o); mesh.castShadow = false; mesh.receiveShadow = false;
    ctx.softEdge(mesh); group.add(mesh);
    if (pivot) sways.push({ o: mesh, amp, x: o.x, z: o.z, ph: rng() * 6.28, f: rng.range(0.9, 1.5) });
    return mesh;
  }
  function pushCore(cc, r, ry, seed, cTop, cBot, w = 7, h = 5) {
    const g = kit.sphere(1, w, h).scale(r, ry, r).translate(cc.x, cc.y, cc.z);
    const pa = g.attributes.position, col = new Float32Array(pa.count * 3);
    for (let i = 0; i < pa.count; i++) {
      const k = 0.8 + 0.5 * vnoise(pa.getX(i) * 1.3 + seed, pa.getY(i) * 1.3, pa.getZ(i) * 1.3);
      pa.setXYZ(i, cc.x + (pa.getX(i) - cc.x) * k, cc.y + (pa.getY(i) - cc.y) * k, cc.z + (pa.getZ(i) - cc.z) * k);
      const f = smooth(0.1, 0.72, ((pa.getX(i) - cc.x) / r * SUN.x + (pa.getY(i) - cc.y) / ry * SUN.y + (pa.getZ(i) - cc.z) / r * SUN.z) * 0.5 + 0.5), q = tmpC.copy(cBot).lerp(cTop, f);
      col[i * 3] = q.r; col[i * 3 + 1] = q.g; col[i * 3 + 2] = q.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); coreParts.push(g);
  }

  function growCanopy(tr) {
    const { T, S, LOBES } = tr, clumps = [], lowest = Math.min(...LOBES.map((l) => l.c.y - l.ry));
    for (const L of LOBES) {
      const base = clamp(Math.sqrt(L.r * L.ry) * S.clumpK, S.clumpMin, S.clumpMax), n = Math.round((S.fill * L.r * L.ry) / (base * base)), shift = rng() * 6;
      for (let k = 0; k < n; k++) {
        const d = fib(k, n).applyAxisAngle(new V(0, 1, 0), shift);
        if (d.y < -0.8) continue;
        const rc = base * rng.range(0.82, 1.2);
        const c = new V(L.c.x + d.x * Math.max(0.4, L.r - rc * 0.72), L.c.y + d.y * Math.max(0.3, L.ry - rc * 0.78), L.c.z + d.z * Math.max(0.4, L.r - rc * 0.72));
        c.x += rng.range(-0.25, 0.25); c.y += rng.range(-0.18, 0.18); c.z += rng.range(-0.25, 0.25);
        clumps.push({ c, r: rc, ry: rc * rng.range(0.72, 0.86), lobe: L, dead: false, seed: rng() * 50 });
      }
    }
    const treeC = new V(T.x, LOBES[0].c.y, T.z);
    for (const c of clumps.slice()) { // small satellites break the round lobes into an irregular edge
      const out = new V(c.c.x - treeC.x, (c.c.y - treeC.y) * 0.5, c.c.z - treeC.z).normalize();
      for (let i = 0; i < 2; i++) {
        if (rng() > S.sats) continue;
        const d = out.clone().add(new V(rng.range(-0.9, 0.9), rng.range(-0.7, 0.35), rng.range(-0.9, 0.9))).normalize(), rc = rng.range(0.5, 0.8);
        const q = c.c.clone().addScaledVector(d, c.r * 0.9).setY(c.c.y + d.y * c.ry * 0.9);
        if (q.y < lowest + 0.3) continue;
        clumps.push({ c: q, r: rc, ry: rc * rng.range(0.72, 0.9), lobe: c.lobe, dead: false, seed: rng() * 50 });
      }
    }
    for (const a of clumps) for (const b of clumps) {
      if (a === b || a.dead || b.dead || a.r > b.r) continue;
      if (a.c.distanceTo(b.c) < (b.r - a.r) + 0.42 * a.r) a.dead = true;
    }
    const CL = clumps.filter((c) => !c.dead);
    for (const c of CL) c.near = CL.filter((o) => o !== c && o.c.distanceTo(c.c) < o.r + c.r + 0.3);
    const inside = (c, p, k) => { const dx = (p.x - c.c.x) / c.r, dy = (p.y - c.c.y) / c.ry, dz = (p.z - c.c.z) / c.r; return dx * dx + dy * dy + dz * dz < k * k; };
    tr.CL = CL;

    // twigs and pivots
    for (const c of CL) {
      let best = null, bd = 1e9;
      for (const b of tr.samples) { const d = b.p.distanceToSquared(c.c) + (b.p.y > c.c.y ? 4 : 0); if (d < bd) { bd = d; best = b; } }
      c.pivot = best.p.clone();
      const end = c.c.clone(), mid = best.p.clone().lerp(end, 0.55); mid.y -= 0.14; mid.x += rng.range(-0.25, 0.25); mid.z += rng.range(-0.25, 0.25);
      bark.tube([best.p, mid, end], [Math.min(best.r * 0.7, 0.09), 0.02], { pal: tr.pal, g: tr.g, radial: 4, step: 0.6, moss: -0.2, lift: -0.2 });
    }
    // inner cores
    if (S !== SPECIES.willow) for (const c of CL) pushCore(c.c, c.r * S.coreK, c.ry * S.coreK, c.seed, S.coreTop, S.coreBot);

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
    const K = Math.min(S.K, CL.length), cent = Array.from({ length: K }, (_, i) => CL[Math.floor((i / K) * CL.length)].c.clone());
    for (let it = 0; it < 8; it++) {
      const sum = cent.map(() => [new V(), 0]);
      for (const c of CL) { let b = 0, bd = 1e9; cent.forEach((q, i) => { const d = q.distanceToSquared(c.c); if (d < bd) { bd = d; b = i; } }); c.g = b; sum[b][0].add(c.c); sum[b][1]++; }
      sum.forEach(([s, n], i) => { if (n) cent[i].copy(s).divideScalar(n); });
    }
    const buckets = Array.from({ length: K }, () => []);
    const hLo = lowest, hHi = Math.max(...LOBES.map((l) => l.c.y + l.ry)), all = [];
    const YOUNG = C('#b8e266'), YOUNG_DIM = C('#6cc05a');
    for (const c of CL) {
      const n = Math.round(4 * Math.PI * c.r * c.ry * S.dens), lobeC = c.lobe.c;
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
        const shad = occluded(p.clone().addScaledVector(shell, 0.25)) || shadedByOthers(p, T.lobes);
        const h = clamp((p.y - hLo) / (hHi - hLo)), lift = vnoise(p.x * 0.4, p.y * 0.4, p.z * 0.4) - 0.5;
        let crease = 9; for (const o of c.near) { const dx = (p.x - o.c.x) / o.r, dy = (p.y - o.c.y) / o.ry, dz = (p.z - o.c.z) / o.r; crease = Math.min(crease, dx * dx + dy * dy + dz * dz); }
        if (crease < 1.04 && rng() < 0.6) continue;   // down in the seam between clumps: never seen
        let v = shell.dot(SUN) * 0.5 + 0.5 + (h - 0.5) * 0.12 + lift * 0.14 + rng.range(-0.03, 0.03);
        v -= Math.max(0, -shell.y) * 0.16;
        if (crease < 1.3) v -= 0.13 * (1.3 - crease) / 0.49;
        if (shad) { v = Math.min(v, 0.5) - 0.05; shell.addScaledVector(SUN, -(shell.dot(SUN) + 0.1)).normalize(); }
        dX.set(0, -1, 0).addScaledVector(shell, shell.y).normalize();
        if (dX.lengthSq() < 0.5) dX.set(rng() - 0.5, 0, rng() - 0.5).normalize();
        dX.applyAxisAngle(shell, Math.abs(shell.y) > 0.72 ? rng() * 6.28 : rng.range(-1.1, 1.1));
        const tip = dX.clone().multiplyScalar(0.8).addScaledVector(shell, rng.range(0.05, 0.75)).normalize();
        const outer = shell.dot(new V(p.x - treeC.x, (p.y - treeC.y) * 0.6, p.z - treeC.z).normalize());
        // ginkgo: gold creeps in from the crown's outer rim and the clump tops, gathered by low-frequency noise
        const turn = outer * 0.46 + h * 0.28 + (1 - (crease < 1.3 ? (1.3 - crease) / 0.49 : 0)) * 0.1 + (vnoise(p.x * 0.55 + 31, p.y * 0.55, p.z * 0.55) - 0.5) * 1.1;
        const leaf = { p, shell, tip, s: rng.range(S.leafS[0], S.leafS[1]), tone: S.tone(v, { turn }, new Color()), young: outer * 0.5 + (vnoise(p.x * 0.7 + 31, p.y * 0.7, p.z * 0.7) - 0.5) * 1.5, dim: v < 0.57 };
        if (S.keep && hash(k, c.seed, 5.3) > S.keep(leaf)) continue;   // thinned after every draw, so the leaves left and the trees after them stay put
        buckets[c.g].push(leaf); all.push(leaf);
      }
    }
    if (S.young > 0) {
      const sc = all.map((l) => l.young).sort((a, b) => b - a), cut = sc[Math.floor(sc.length * S.young)];
      for (const l of all) if (l.young > cut) l.tone.lerp(l.dim ? YOUNG_DIM : YOUNG, l.dim ? 0.42 : 0.6);
    }
    buckets.forEach((b, i) => {
      const cs = CL.filter((c) => c.g === i); if (!cs.length) return;
      const piv = new V(); for (const c of cs) piv.add(c.pivot); piv.divideScalar(cs.length);
      mkLeaves(b, S.geo, S === SPECIES.willow ? willowMat : leafMat, piv, S.amp);
    });
  }

  // ---------------------------------------------------------------- willow strands
  // Each strand is a chain of instanced segments, so the lower ends trail behind the gust while the crown stays put.
  const SEG = 0.46, strands = { list: [], pts: null, mesh: null, count: 0, weight: null };
  const segGeo = (() => {
    const pos = [], col = [], idx = [], n = 6;
    const push = (x, y, z, k) => { pos.push(x, y, z); col.push(k, k, k * 0.96); return pos.length / 3 - 1; };
    // stem: one flat ribbon
    const a = push(-0.016, 0, 0, 0.8), b = push(0.016, 0, 0, 0.8), c = push(-0.012, -SEG, 0, 0.8), d = push(0.012, -SEG, 0, 0.8);
    idx.push(a, c, b, b, c, d);
    for (let i = 0; i < n; i++) {
      const y = -((i + 0.2) / n) * SEG, az = i * 2.4 + 0.4, l = 0.3 + (i % 2) * 0.05, w = 0.085;
      const dir = new V(Math.cos(az) * 0.56, -0.83, Math.sin(az) * 0.56).normalize(), side = new V(-Math.sin(az), 0, Math.cos(az));
      const o = new V(Math.cos(az) * 0.01, y, Math.sin(az) * 0.01), q = (t, s) => o.clone().addScaledVector(dir, l * t).addScaledVector(side, w * s);
      const v0 = q(0, 0), v1 = q(0.42, -0.5), v2 = q(0.42, 0.5), v3 = q(1, 0);
      const i0 = push(v0.x, v0.y, v0.z, 0.76), i1 = push(v1.x, v1.y, v1.z, 0.96), i2 = push(v2.x, v2.y, v2.z, 0.96), i3 = push(v3.x, v3.y, v3.z, 1.08);
      idx.push(i0, i1, i2, i1, i3, i2);
    }
    return mkLeafGeo(pos, col, idx);
  })();
  function growStrands(tr) {
    const { T, LOBES } = tr, L = LOBES[0], c = L.c, rPts = [], recs = [], shellOut = [];
    const WC = [C(P.leafLit).lerp(C(P.leafGold), 0.3).multiplyScalar(0.82), C(P.leafLit).lerp(C(P.leafMid), 0.6).multiplyScalar(0.82), C(P.leafMid).lerp(C(P.leafDeep), 0.4).multiplyScalar(0.9), C(P.leafDeep).multiplyScalar(0.92), C(P.leafDeep).lerp(C(P.leafShade), 0.6)];
    const SWAY_M = 0.45;
    /** Height of the stone a strand hanging at (x,z) must stay above, -9 where there is none. m: room left for the sway. */
    const strandCeil = (x, z, m) => {
      const [a, b] = brLocal(x, z); let y = -9;
      if (Math.abs(a) < BW + m && Math.abs(b) < BA + m) y = deckY(b) + PARAPET;
      for (const l of LANTERN) if (Math.hypot(x - l.x, z - l.z) < 0.42 + m) y = Math.max(y, l.top);
      return y;
    };
    /** Where the tips of a strand may come down to: to the water over the open canal, clear of its walls and the outfall's boulders; else above the bank. */
    const WATER_TIP = RIVER.y + 0.05, LOWEST = RIVER.y + 0.22;   // the fall's last point stays over LOWEST: the last leaves hang 0.19 past it
    const tipFloor = (x, z) => {
      if (!inRiver(x, z)) return rng.range(0.9, 1.5);
      return z < 19.3 && bankDist(x, z) > 0.6 ? WATER_TIP : rng.range(0.42, 0.7);
    };
    const addStrand = (az, phi0, reach, tipY, inner, lockV) => {
      const poly = [], cx = Math.cos(az), sz = Math.sin(az);
      const phiEnd = 1.5;
      for (let ph = phi0; ph < phiEnd; ph += 0.1) poly.push(new V(c.x + Math.sin(ph) * cx * L.r * reach, c.y + Math.cos(ph) * L.ry * 1.03, c.z + Math.sin(ph) * sz * L.r * reach));
      const e = poly[poly.length - 1], arcN = poly.length, fall = e.y - tipY;
      if (fall < 0.6) return;
      for (let u = 0.06; u <= 1.001; u += 0.06) poly.push(new V(e.x + cx * (0.42 * Math.sqrt(u) - 0.22 * u * u) * reach, e.y - fall * u, e.z + sz * (0.42 * Math.sqrt(u) - 0.22 * u * u) * reach));
      // resample to equal segments
      const out = [poly[0].clone()]; let need = SEG, arcK = 0;
      for (let i = 1; i < poly.length; i++) {
        let a = poly[i - 1].clone(); const b = poly[i]; let d = a.distanceTo(b);
        while (d >= need) { a = a.lerp(b, need / d); out.push(a.clone()); d = a.distanceTo(b); need = SEG; if (i <= arcN) arcK = out.length - 1; }
        need -= d;
      }
      // The bridge shortens whatever hangs over it, all the way along the fall, since the fall drifts outward. Each strand stops at its own height, so there is no clipped hem.
      const nAll = out.length, lift = rng.range(0, 0.55);
      let nearB = false;
      for (let k = 1; k < out.length; k++) {
        nearB = nearB || strandCeil(out[k].x, out[k].z, SWAY_M + 0.4) > -9;
        if (out[k].y < Math.max(LOWEST, strandCeil(out[k].x, out[k].z, SWAY_M) + 0.42 + lift)) { out.length = k; break; }
      }
      const n = out.length; if (n < 3) return;
      arcK = Math.min(arcK, n - 1);
      const start = rPts.length; for (const p of out) rPts.push(p.x, p.y, p.z);
      const out0 = new V(cx, 0.22, sz).normalize();
      // the sway is shared out over the free length, so a shortened strand swings no further for it; beside the bridge it stays inside SWAY_M
      const free = (n - arcK) / Math.max(1, nAll - arcK);
      recs.push({ start, n, arcK, x: e.x, z: e.z, ph: rng() * 6.28, f: rng.range(0.8, 1.3), amp: rng.range(0.34, 0.6) * (inner ? 0.6 : 1) * free * (nearB ? 0.62 : 1), inner, out0, lockV, cx, sz });
    };
    const locks = 22;
    for (let i = 0; i < locks; i++) {
      const az = ((i + rng.range(-0.3, 0.3)) / locks) * 6.283, lockLen = rng.range(0, 1), m = rng.int(4, 7), lockV = rng.range(-0.08, 0.08);
      for (let j = 0; j < m; j++) {
        const a = az + rng.range(-0.13, 0.13), reach = rng.range(1, 1.08), far = L.r * reach + 0.2 * reach;   // the fall ends here in plan
        const floor = tipFloor(c.x + Math.cos(a) * far, c.z + Math.sin(a) * far), tip = Math.max(floor, lerp(floor + 0.1, 2.2, Math.pow(rng(), 1.6) * (1 - lockLen * 0.7) * (floor < 0 ? 0.3 : 1)));
        addStrand(a, rng.range(0.1, 1.15), reach, tip, false, lockV);
      }
    }
    for (let i = 0; i < 30; i++) addStrand(rng() * 6.283, rng.range(0.7, 1.2), rng.range(0.62, 0.78), rng.range(1.2, 2.6), true, 0);
    const rest = new Float32Array(rPts); strands.pts = rest; strands.list = recs;
    let total = 0; for (const r of recs) total += r.n - 1;
    const g = new THREE.BufferGeometry();
    for (const k of ['position', 'normal', 'uv', 'color']) g.setAttribute(k, segGeo.attributes[k]);
    g.setIndex(segGeo.index);
    const mesh = new THREE.InstancedMesh(g, willowMat, total), shell = new Float32Array(total * 3), cc = new Color();
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const arr = mesh.instanceMatrix.array, A = new V(), B = new V(), Xc = new V(), Zc = new V(), Dd = new V(); let idx = 0;
    for (const r of recs) {
      r.first = idx;
      for (let k = 0; k < r.n - 1; k++, idx++) {
        const u = k / (r.n - 1), oA = r.start + k * 3, oB = oA + 3;
        A.set(rest[oA], rest[oA + 1], rest[oA + 2]); B.set(rest[oB], rest[oB + 1], rest[oB + 2]);
        Dd.subVectors(B, A).normalize();
        Xc.set(rng() - 0.5, rng() - 0.5, rng() - 0.5).cross(Dd).normalize(); Zc.crossVectors(Xc, Dd).normalize();
        const sc = lerp(1.08, 0.66, Math.pow(u, 1.5)), o = idx * 16;
        arr[o] = Xc.x * sc; arr[o + 1] = Xc.y * sc; arr[o + 2] = Xc.z * sc; arr[o + 3] = 0;
        arr[o + 4] = -Dd.x; arr[o + 5] = -Dd.y; arr[o + 6] = -Dd.z; arr[o + 7] = 0;
        arr[o + 8] = Zc.x * sc; arr[o + 9] = Zc.y * sc; arr[o + 10] = Zc.z * sc; arr[o + 11] = 0;
        arr[o + 12] = A.x; arr[o + 13] = A.y; arr[o + 14] = A.z; arr[o + 15] = 1;
        // shell: outward on the fall, following the dome on the arc
        const dy = (A.y - c.y) / L.ry, up = clamp(dy, 0, 1), sh = dX.set(r.cx * (1 - up * 0.7), 0.2 + up * 0.9, r.sz * (1 - up * 0.7)).normalize();
        let v = sh.dot(SUN) * 0.5 + 0.5 + r.lockV + (A.y / 6 - 0.45) * 0.34 + rng.range(-0.03, 0.03);
        const shaded = shadedByOthers(A, T.lobes);
        if (r.inner || shaded) { v = Math.min(v, 0.46) - 0.08; sh.addScaledVector(SUN, -(sh.dot(SUN) + 0.1)).normalize(); }
        cc.copy(v > 0.86 ? WC[0] : v > 0.72 ? WC[1] : v > 0.56 ? WC[2] : v > 0.42 ? WC[3] : WC[4]);
        mesh.setColorAt(idx, cc);
        shell[idx * 3] = sh.x; shell[idx * 3 + 1] = sh.y; shell[idx * 3 + 2] = sh.z;
      }
    }
    g.setAttribute('aShell', new THREE.InstancedBufferAttribute(shell, 3));
    mesh.castShadow = false; mesh.receiveShadow = false; mesh.frustumCulled = false;
    ctx.softEdge(mesh); group.add(mesh); strands.mesh = mesh; strands.count = total;
  }
  function swayStrands(t) {
    const { mesh, pts, list } = strands, arr = mesh.instanceMatrix.array;
    for (let s = 0; s < list.length; s++) {
      const r = list[s], rn = r.n, first = r.first, st = r.start, kA = r.arcK;
      let px = pts[st], py = pts[st + 1], pz = pts[st + 2];
      for (let k = 0; k < rn - 1; k++) {
        const q = st + (k + 1) * 3, f = k + 1 - kA, w = f <= 0 ? 0 : (f / (rn - kA)), w2 = w * Math.sqrt(w) * r.amp;
        const a = t * r.f + r.ph - k * 0.32, gust = ctx.wind(t - k * 0.13, r.x, r.z);
        const nx = pts[q] + (gust * 0.72 + Math.sin(a) * 0.4) * w2, nz = pts[q + 2] + (-gust * 0.62 + Math.cos(a * 0.8) * 0.4) * w2, ny = pts[q + 1];
        const o = (first + k) * 16, dx = nx - px, dy = ny - py, dz = nz - pz, l = 1 / Math.sqrt(dx * dx + dy * dy + dz * dz);
        arr[o + 4] = -dx * l; arr[o + 5] = -dy * l; arr[o + 6] = -dz * l;
        arr[o + 12] = px; arr[o + 13] = py; arr[o + 14] = pz;
        px = nx; py = ny; pz = nz;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- build the five trees
  const statics = ctx.batch();
  const WILLOW_FOOT = [0, 0.34], WILLOW_DRAWS = 14998;   // draws the willow used to take from the module's stream: spent here, so the planting, litter and fans after it stay put
  const trees = GROVE.map((T, i) => {
    const willow = T.kind === 'willow', mainRng = rng;
    if (willow) rng = ctx.seeded('grove-willow');   // the bank and the bridge decide how much of it grows, and nothing after it should hear about that
    const S = SPECIES[T.kind], g = baseY(T.x), seed = rng() * 6.28;
    const lean = willow ? [-0.05, -0.06] : [rng.range(-0.012, 0.012), rng.range(-0.012, 0.012)];
    const lx = lean[0], lz = lean[1];
    // The crown stands on the contract's point, 0.39 from the canal wall and over the head of the washing stair. No flare fits there, so the foot stands back
    // on solid ground between the wall and the lost path's stones, and the trunk leans out over the water from it.
    const foot = willow ? { x: T.x + WILLOW_FOOT[0], z: T.z + WILLOW_FOOT[1] } : T;
    const axis = (y) => {
      const e = willow ? Math.sin(clamp(y / 5) * Math.PI) * 2.0 : y, f = willow ? 1 - smooth(0, 2.8, y) : 0;
      return new V(T.x + (foot.x - T.x) * f + lx * e + 0.05 * Math.sin(y * 0.8 + seed), y, T.z + (foot.z - T.z) * f + lz * e + 0.05 * Math.cos(y * 0.66 + seed));
    };
    const LOBES = T.lobes.map(([x, y, z, r, ry], j) => ({ c: new V(x, y, z), r, ry, i: j }));
    const tr = { T, S, g, axis, foot, LOBES, pal: S.pal, samples: [], seed, i, moundR: willow ? 1.7 : 1.5 + T.trunkR * 3.4, moundH: willow ? 0.24 : 0.2 + T.trunkR * 0.55 };
    if (T.kind === 'camphor') growCamphor(tr);
    else if (T.kind === 'ginkgo') growGinkgo(tr);
    else growWillow(tr);
    // roots
    const n = T.kind === 'willow' ? 7 : 8, rr = T.trunkR;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * 6.283 + rng.range(-0.25, 0.25);
      surfaceRoot(tr, a, tr.moundR * rng.range(0.9, 1.55), rr * rng.range(0.42, 0.6), rng.range(0.7, 1.5) * (T.kind === 'camphor' ? 1.3 : 1));
    }
    growCanopy(tr);
    if (willow) { growStrands(tr); rng = mainRng; for (let k = 0; k < WILLOW_DRAWS; k++) rng(); }
    return tr;
  });

  // Ground other modules have laid out: no old paving under it. The test is on the slab's whole footprint, and the draws for a slab left out still happen.
  const zoneHas = (zone, x, z, m) => x > zone.x[0] - m && x < zone.x[1] + m && z > zone.z[0] - m && z < zone.z[1] + m;
  const foreignZone = (x, z) => [MEADOW.playground, TOWN.yard, TOWN.row, TOWN.backLot, TOWN.bathhouse].some((zone) => zoneHas(zone, x, z, 0.5));

  // heaved earth around each foot
  for (const tr of trees) {
    const { T, g, foot: F } = tr, R = tr.moundR * 1.1, rings = 7, seg = 28, pos = [], idx = [], tight = T.kind === 'willow';
    pos.push(F.x, g + heaveAt(tr, F.x, F.z), F.z);
    const spoke = Array.from({ length: seg }, (_, j) => { // each spoke stops short of the plinth edge, the canal bank and the bridge
      const a = (j / seg) * 6.283; let r = tight ? 0.15 : 0.6;
      while (r < R && !blocked(F.x + Math.cos(a) * (r + 0.15), F.z + Math.sin(a) * (r + 0.15))) r += 0.15;
      const k = 0.78 + 0.4 * vnoise(Math.cos(a) * 1.6 + tr.seed, Math.sin(a) * 1.6, 2);
      return r * (tight ? Math.min(k, 1) : k);
    });
    for (let i = 1; i <= rings; i++) for (let j = 0; j < seg; j++) {
      const a = (j / seg) * 6.283, f = i / rings, r = spoke[j] * Math.pow(f, 0.8), x = F.x + Math.cos(a) * r, z = F.z + Math.sin(a) * r;
      const y = g + heaveAt(tr, x, z) * (1 - f * f * f) + (i === rings ? -0.1 : 0) + (vnoise(x * 1.7, 3, z * 1.7) - 0.5) * 0.06 * (1 - smooth(5 / 7, 6 / 7, f));
      pos.push(x, T === railTree ? Math.min(y, railCap(x, z)) : y, z);
    }
    for (let j = 0; j < seg; j++) idx.push(0, 1 + (j + 1) % seg, 1 + j);
    for (let i = 0; i < rings - 1; i++) for (let j = 0; j < seg; j++) {
      const a = 1 + i * seg + j, b = 1 + i * seg + (j + 1) % seg, c = a + seg, d = b + seg; idx.push(a, b, c, b, d, c);
    }
    const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); m.setIndex(idx); m.computeVertexNormals();
    statics.add(m, 'soil');
    if (inBed(T.x)) { // ballast shoved aside by the roots
      for (let i = 0; i < 46; i++) {
        const a = rng() * 6.283, r = tr.moundR * rng.range(0.6, 1.5), x = T.x + Math.cos(a) * r, z = T.z + Math.sin(a) * r;
        if (blocked(x, z)) continue;
        const rock = kit.rock(rng.range(0.1, 0.2), rng, 0.72, 0), rot = [rng(), rng() * 6, rng()], color = rng.pick(['#a8a8a0', '#8f9490', '#b9b4a6']);
        if (!onRail(x, z)) statics.add(rock, 'flat', { pos: [x, g + heaveAt(tr, x, z) + 0.05, z], rot, color });
      }
    } else if (T.kind !== 'willow') { // paving tipped up by the roots
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * 6.283 + rng.range(-0.3, 0.3), r = tr.moundR * rng.range(0.92, 1.3), x = T.x + Math.cos(a) * r, z = T.z + Math.sin(a) * r;
        if (blocked(x + Math.cos(a) * 0.5, z + Math.sin(a) * 0.5)) continue;
        const s = kit.chip(kit.box(rng.range(0.6, 0.95), 0.12, rng.range(0.5, 0.8), 2, 1, 2), 0.03, rng);
        const rot = [Math.sin(a) * -rng.range(0.25, 0.5), -a + 1.57, Math.cos(a) * rng.range(0.25, 0.5)];
        if (!foreignZone(x, z)) statics.add(s, 'concrete', { pos: [x, g + heaveAt(tr, x, z) + 0.1, z], rot });
      }
    }
  }

  // shimenawa on the old yard camphor: straw rope and paper streamers, long unattended
  {
    const tr = trees[1], { axis, T } = tr, y = 2.0, c = axis(y), R = T.trunkR * 1.34, pts = [];
    for (let i = 0; i <= 28; i++) { const a = (i / 28) * 6.283; pts.push(new V(c.x + Math.cos(a) * R, y + Math.sin(a * 2) * 0.03 - Math.cos(a - 0.9) * 0.05, c.z + Math.sin(a) * R)); }
    statics.add(kit.tube(pts, 0.09, 0.09, 6, 56), 'flat', { color: '#c9b583' });
    const twist = []; for (let i = 0; i <= 84; i++) { const u = (i / 84) * 6.283, a = u * 9; twist.push(new V(c.x + Math.cos(u) * (R + Math.cos(a) * 0.075), y + Math.sin(u * 2) * 0.03 - Math.cos(u - 0.9) * 0.05 + Math.sin(a) * 0.075, c.z + Math.sin(u) * (R + Math.cos(a) * 0.075))); }
    statics.add(kit.tube(twist, 0.022, 0.022, 4, 110), 'flat', { color: '#9c8558' });
    for (const a of [0.2, 1.3, 2.6]) { // zigzag shide facing the yard
      const x = c.x + Math.cos(a) * (R + 0.07), z = c.z + Math.sin(a) * (R + 0.07);
      for (let k = 0; k < 3; k++) statics.add(kit.box(0.09, 0.13, 0.012), 'flat', { pos: [x + Math.sin(a) * 0.035 * (k % 2 ? 1 : -1), y - 0.14 - k * 0.11, z - Math.cos(a) * 0.035 * (k % 2 ? 1 : -1)], rot: [0, 1.57 - a, 0], color: k === 2 ? '#d9d3bd' : '#efe9d4' });
    }
  }

  // ---------------------------------------------------------------- shrubs and hydrangeas
  const shrubLeaves = [], hydLeaves = [], florets = [], floretRng = ctx.seeded('grove-florets');
  const SHR = [C(P.leafLit).lerp(C(P.leafMid), 0.5), C(P.leafMid).lerp(C(P.leafDeep), 0.4), C(P.leafDeep), C(P.leafShade)];
  const HYD = [C('#6cc25f'), C('#359a60'), C('#1d7866'), C('#135a60')];
  const shrubCoreTop = C(P.leafDeep).multiplyScalar(0.7), shrubCoreBot = C('#0f4a56');
  const HUES = [ // lit, mid, shade
    [C('#b9d6ff'), C(P.flowerBlue), C('#5a7fd0')], [C('#c6c0ff'), C('#94a0f6'), C('#6767c8')],
    [C('#e0c0ff'), C(P.flowerPurple), C('#8058bc')], [C('#ffcbe2'), C('#f09cc8'), C('#b866a8')],
  ];
  function dome(cc, r, ry, dens, leafS, push, tones, g) {
    const n = Math.round(2 * Math.PI * r * ry * dens);
    for (let k = 0; k < n; k++) {
      const d = fib(k, n * 2); d.y = Math.abs(d.y) - 0.12;
      const bump = 1 + 0.26 * (vnoise(d.x * 2.4 + cc.x, d.y * 2.4, d.z * 2.4 + cc.z) - 0.5);
      const p = new V(cc.x + d.x * r * bump, Math.max(g + 0.06, cc.y + d.y * ry * bump), cc.z + d.z * r * bump);
      const shell = new V(d.x / r, d.y / ry, d.z / r).normalize();
      dX.set(0, -1, 0).addScaledVector(shell, shell.y).normalize();
      if (dX.lengthSq() < 0.5) dX.set(rng() - 0.5, 0, rng() - 0.5).normalize();
      dX.applyAxisAngle(shell, Math.abs(shell.y) > 0.72 ? rng() * 6.28 : rng.range(-1.1, 1.1));
      const tip = dX.clone().multiplyScalar(0.8).addScaledVector(shell, rng.range(0.1, 0.7)).normalize();
      const v = shell.dot(SUN) * 0.5 + 0.5 + (vnoise(p.x * 0.8, p.y * 0.8, p.z * 0.8) - 0.5) * 0.2 + rng.range(-0.03, 0.03);
      push.push({ p, shell, tip, s: rng.range(leafS[0], leafS[1]), tone: (v > 0.76 ? tones[0] : v > 0.58 ? tones[1] : v > 0.42 ? tones[2] : tones[3]).clone() });
    }
    pushCore(cc, r * 0.62, ry * 0.62, cc.x, shrubCoreTop, shrubCoreBot, 6, 4);
  }
  function shrub(x, z, r, h) {
    const g = baseY(x), m = rng.int(2, 3);
    for (let i = 0; i < m; i++) {
      const a = (i / m) * 6.283 + rng() * 2, rr = r * rng.range(0.58, 0.72), o = i === 0 ? 0 : r * 0.5;
      dome(new V(x + Math.cos(a) * o, g + h * 0.42, z + Math.sin(a) * o), rr, h * rng.range(0.5, 0.62), 15, [0.72, 1.02], shrubLeaves, SHR, g);
    }
  }
  function hydrangea(x, z, r, heads, hue) {
    const g = baseY(x), m = rng.int(2, 3), h = 0.86;
    for (let i = 0; i < m; i++) {
      const a = (i / m) * 6.283 + rng() * 2, o = i === 0 ? 0 : r * 0.52;
      dome(new V(x + Math.cos(a) * o, g + h * 0.46, z + Math.sin(a) * o), r * rng.range(0.6, 0.74), h * rng.range(0.54, 0.64), 8, [0.72, 1], hydLeaves, HYD, g);
    }
    for (let i = 0; i < heads; i++) {
      const d = fib(i, heads * 2), rh = rng.range(0.2, 0.28), q = new V(x + d.x * r * 0.86, g + 0.42 + d.y * h * 0.72, z + d.z * r * 0.86);
      const H = HUES[(hue + (rng() < 0.3 ? 1 : 0)) % HUES.length];
      pushCore(q, rh * 0.82, rh * 0.74, q.x, H[2], H[2].clone().lerp(C('#2f5f78'), 0.35), 6, 4);
      const n = 36;
      for (let k = 0, kept = 0; k < n; k++) {
        const e = fib(k, n); if (e.y < -0.55) continue;
        const r = kept++ < 20 ? rng : floretRng;   // only the first 20 draw from the module's stream, so the shrubs, litter and fans after them stay put
        const shell = e.clone(), p = q.clone().addScaledVector(e, rh * r.range(0.92, 1.06)); p.y -= e.y * rh * 0.1;
        const v = shell.dot(SUN) * 0.5 + 0.5 + r.range(-0.05, 0.05), tip = dX.set(r() - 0.5, r() - 0.5, r() - 0.5).cross(shell).normalize().clone();
        florets.push({ p, shell: shell.lerp(new V(0, 1, 0), 0.2).normalize(), tip, s: r.range(0.62, 0.86), tone: (v > 0.74 ? H[0] : v > 0.4 ? H[1] : H[1].clone().lerp(H[2], 0.6)).clone().lerp(H[1], r() * 0.3) });
      }
    }
  }
  const floretGeo = mkLeafGeo( // four-petalled floret, drawn as a pinched square
    [0, 0, 0, -0.07, 0, 0.03, 0, 0.02, -0.02, 0.07, 0, 0.03, 0, 0.02, 0.11, 0, 0, -0.07],
    [0.9, 0.9, 0.94, 1.05, 1.05, 1, 1, 1, 1, 1.05, 1.05, 1, 1.05, 1.05, 1, 1.05, 1.05, 1], [0, 1, 4, 0, 4, 3, 0, 3, 5, 0, 5, 1]);
  // camphor by the playground
  hydrangea(-15.6, 10.9, 0.95, 7, 0); shrub(-17.9, 13.3, 0.9, 0.8); shrub(-17.8, 11.1, 0.7, 0.6);
  // camphor in the yards
  hydrangea(-16.7, -7.9, 1.0, 8, 1); hydrangea(-19.0, -8.0, 0.8, 5, 3); shrub(-18.9, -10.4, 0.85, 0.75);
  // ginkgo on the old track: only tough scrub gets a hold in the ballast
  shrub(16.8, -17.9, 0.6, 0.6); shrub(16.8, -15.2, 0.55, 0.5); shrub(19.35, -17.7, 0.42, 0.5);
  // ginkgo in the back lot
  hydrangea(-8.6, -14.6, 1.0, 8, 0); shrub(-5.0, -15.3, 0.85, 0.72); shrub(-7.7, -17.6, 0.75, 0.62);
  // the south bank: a hydrangea at the bridge's foot, under the willow's east curtain; a shrub on the strip between the canal and the sunflowers
  hydrangea(-6.35, 19.0, 0.85, 6, 2); shrub(-1.75, 16.75, 0.6, 0.5);

  // ---------------------------------------------------------------- ginkgo litter and a few falling fans
  const litterGeo = fan(0.38, 0.54, 0.02);
  const LIT = [C('#ffd658'), C('#f7bd4c'), C('#eec84e'), C('#e6aa48'), C('#d3cc55')];
  {
    const list = [], gink = trees.filter((t) => t.T.kind === 'ginkgo');
    for (const tr of gink) {
      const { T, g } = tr, drift = new V(-SUN.x, 0, -SUN.z).normalize();
      for (let i = 0; i < 620; i++) {
        const a = rng() * 6.283, r = Math.pow(rng(), 0.62) * 5.6;
        const x = T.x + Math.cos(a) * r * 1.05 + drift.x * 0.4, z = T.z + Math.sin(a) * r * 0.95 + drift.z * 0.4;
        if (Math.abs(x) > 19.7 || Math.abs(z) > 19.7) continue;
        if (Math.hypot(x - T.x, z - T.z) < T.trunkR * 1.3) continue;
        const y = g + heaveAt(tr, x, z) * 1.02 + 0.045 + rng() * 0.05;
        const yaw = rng() * 6.283;
        const leaf = { p: new V(x, y, z), shell: new V(rng.range(-0.22, 0.22), 1, rng.range(-0.22, 0.22)).normalize(), tip: new V(Math.cos(yaw), 0, Math.sin(yaw)), s: rng.range(0.7, 1.05), tone: rng.pick(LIT).clone().lerp(C('#ffe68a'), rng() * 0.2) };
        if (hash(i, T.x, 8.1) < 0.75) list.push(leaf);
      }
    }
    mkLeaves(list, litterGeo, lowLeafMat).receiveShadow = true;
  }
  const FALL = [], fallDummy = new THREE.Object3D();
  for (const tr of trees) {
    if (tr.T.kind !== 'ginkgo') continue;
    const L = tr.LOBES[0];
    for (let i = 0; i < 9; i++) {
      const a = rng() * 6.283, r = rng.range(0.6, 1) * L.r;
      FALL.push({ T: tr.T, L, a, x: L.c.x + Math.cos(a) * r, z: L.c.z + Math.sin(a) * r, top: L.c.y - L.ry * rng.range(0.3, 0.8), bot: tr.g - 0.3, per: rng.range(9, 15), ph: rng() * 20, dx: rng.range(-1.6, -0.4), dz: rng.range(0.2, 1.4), w: rng.range(1.6, 2.6), spin: rng.range(1.2, 2.4), s: rng.range(0.9, 1.2), air: 0 });
    }
  }
  const fallMesh = new THREE.InstancedMesh(litterGeo.clone().translate(0, 0, -0.19), ctx.toon({ color: '#ffffff', side: THREE.DoubleSide, vertexColors: true, dapple: false, translucent: 1 }), FALL.length);
  fallMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); fallMesh.castShadow = false; fallMesh.frustumCulled = false;
  FALL.forEach((_, i) => fallMesh.setColorAt(i, LIT[i % 3]));
  ctx.softEdge(fallMesh); group.add(fallMesh);

  /** Where fan f is, s seconds into its fall. */
  const fanAt = (f, s, out) => {
    const u = s / f.per, e = u * u * 0.3 + u * 0.7;
    return out.set(f.x + f.dx * e * 2 + Math.sin(s * f.w * 0.5 + f.ph) * 0.42, lerp(f.top, f.bot, e), f.z + f.dz * e * 2 + Math.cos(s * f.w * 0.4 + f.ph) * 0.3);
  };
  /**
   * Fans need the finished scene, so this runs on the first update. The ground under both ginkgos is voxelised from whatever stands still (the same rule as the
   * survey in atmos.js; of the grove's own wood and clump cores only what stands near the ground, as a fan starts among the rest). Each fan is flown through it: one that comes down on a surface
   * rests there; one that drifts into the side of something, over the edge or through its own trunk tries another spawn. A fixed list, so no first-frame t leaks in.
   */
  function settleFans() {
    const CELL = 0.2, X0 = -14, Y0 = -0.4, Z0 = -21, NX = 180, NY = 47, NZ = 65, EMPTY = -9;
    const top = new Float32Array(NX * NY * NZ).fill(EMPTY);
    const at = (x, y, z) => { const i = Math.floor((x - X0) / CELL), j = Math.floor((y - Y0) / CELL), k = Math.floor((z - Z0) / CELL); return i < 0 || j < 0 || k < 0 || i >= NX || j >= NY || k >= NZ ? -1 : i + NX * (k + NZ * j); };
    const tri = (w, a, b, c, yMax) => {
      const ax = w[a], ay = w[a + 1], az = w[a + 2], bx = w[b], by = w[b + 1], bz = w[b + 2], cx = w[c], cy = w[c + 1], cz = w[c + 2];
      if (Math.max(ax, bx, cx) < X0 || Math.min(ax, bx, cx) > X0 + NX * CELL || Math.max(az, bz, cz) < Z0 || Math.min(az, bz, cz) > Z0 + NZ * CELL || Math.min(ay, by, cy) > yMax) return;
      const n = Math.min(400, Math.ceil(Math.max(Math.hypot(bx - ax, by - ay, bz - az), Math.hypot(cx - ax, cy - ay, cz - az), Math.hypot(cx - bx, cy - by, cz - bz)) / (CELL * 0.6)));
      for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
        const u = i / n, v = j / n, r = 1 - u - v, y = ay * r + by * u + cy * v, q = at(ax * r + bx * u + cx * v, y, az * r + bz * u + cz * v);
        if (q >= 0 && y > top[q]) top[q] = y;
      }
    };
    const scan = (o, yMax) => {
      const g = o.geometry, p = g.attributes.position, ix = g.index, e = o.matrixWorld.elements, w = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        w[i * 3] = e[0] * x + e[4] * y + e[8] * z + e[12]; w[i * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; w[i * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      }
      for (let i = 0, nt = ix ? ix.count : p.count; i + 2 < nt; i += 3) tri(w, 3 * (ix ? ix.getX(i) : i), 3 * (ix ? ix.getX(i + 1) : i + 1), 3 * (ix ? ix.getX(i + 2) : i + 2), yMax);
    };
    const standsStill = (o) => !o.isInstancedMesh && o.geometry.attributes.position.usage !== THREE.DynamicDrawUsage;
    const opaque = (o) => !o.layers.isEnabled(1) && !(Array.isArray(o.material) ? o.material[0] : o.material).transparent;
    const walk = (o) => {
      if (o.name === 'atmos' || !o.visible || (o !== ctx.scene && o.position.lengthSq() > 0)) return;
      if (o.isMesh && standsStill(o) && opaque(o)) scan(o, o === woodMesh || o === coreMesh ? 2 : Y0 + NY * CELL);
      o.children.forEach(walk);
    };
    ctx.scene.updateMatrixWorld(true); walk(ctx.scene);

    /** Top of the solid that (x,y,z) is inside, or EMPTY. */
    const surface = (x, y, z) => {
      let q = at(x, y, z), h = EMPTY;
      for (let yy = y; q >= 0 && top[q] > EMPTY; yy += CELL, q = at(x, yy, z)) h = top[q];
      return h;
    };
    /** Height of the first thing under y in this column; with no ground module loaded, the plinth. */
    const below = (x, y, z) => {
      for (let yy = y; yy > Y0; yy -= CELL) { const h = surface(x, yy, z); if (h > EMPTY) return h; }
      return baseY(x);
    };
    const RING = Array.from({ length: 8 }, (_, i) => [Math.cos(i * 0.785) * 0.3, Math.sin(i * 0.785) * 0.3]), p = new V();
    const fly = (f) => {
      const N = 150;
      for (let i = 0; i <= N; i++) {
        const s = (i / N) * f.per; fanAt(f, s, p);
        if (Math.abs(p.x) > 19.5 || Math.abs(p.z) > 19.5 || Math.hypot(p.x - f.T.x, p.z - f.T.z) < f.T.trunkR * 2 + 0.2) return false;
        const h = Math.max(p.y <= baseY(p.x) ? baseY(p.x) : EMPTY, surface(p.x, p.y, p.z));
        for (const [dx, dz] of [[0.16, 0], [-0.16, 0], [0, 0.16], [0, -0.16]]) if (surface(p.x + dx, p.y, p.z + dz) - p.y > 0.26) return false;   // walked into a side
        if (h === EMPTY) continue;
        if (i === 0 || h > RAIL.maxHeight || h - p.y > 0.26) return false;
        const e = (f.top - h - 0.05) / (f.top - f.bot), u = (Math.sqrt(0.49 + 1.2 * e) - 0.7) / 0.6;
        fanAt(f, u * f.per, p);
        let low = 0;
        for (const [dx, dz] of RING) { const b = below(p.x + dx, h + 0.5, p.z + dz); if (b > h + 0.1) return false; if (b < h - 0.1) low++; }
        if (low > 2 || Math.abs(below(p.x, h + 0.5, p.z) - h) > 0.1) return false;   // a fan lies flat: it needs somewhere level to lie
        f.air = u * f.per;
        return true;
      }
      return false;
    };
    for (const f of FALL) {
      const x0 = f.x, z0 = f.z;
      for (let i = 0; i < 240 && !fly(f); i++) {
        const a = f.a + (i + 1) * GA, r = (0.6 + 0.4 * ((i * 0.618) % 1)) * f.L.r;
        f.x = f.L.c.x + Math.cos(a) * r; f.z = f.L.c.z + Math.sin(a) * r;
      }
      if (!f.air) { f.x = x0; f.z = z0; }   // nowhere to land: this fan stays on the tree
    }
  }

  // ---------------------------------------------------------------- assemble
  const coreMesh = new THREE.Mesh(kit.merge(coreParts), coreMat); coreMesh.castShadow = false; coreMesh.receiveShadow = false; group.add(ctx.softEdge(coreMesh));
  mkLeaves(shrubLeaves, ovate(0.3, 0.2), lowLeafMat);
  mkLeaves(hydLeaves, ovate(0.52, 0.4), lowLeafMat);
  mkLeaves(florets, floretGeo, lowLeafMat);
  group.add(statics.build());
  const woodMesh = bark.mesh(barkMat); group.add(woodMesh);

  const sway = (t) => {
    for (const s of sways) {
      const w = ctx.wind(t, s.x, s.z), w2 = Math.sin(t * s.f + s.ph) * 0.3;
      s.o.rotation.x = (w * 0.7 + w2) * s.amp;
      s.o.rotation.z = (-w + w2 * 0.6) * s.amp;
    }
    swayStrands(t);
  };
  const REST = 1.8;   // seconds a fan lies where it landed, the last of them fading
  let settled = false;
  const update = (t) => {
    sway(t);
    if (!settled) { settled = true; settleFans(); }
    for (let i = 0; i < FALL.length; i++) {
      const f = FALL[i], l = (t + f.ph) % (f.air + REST), s = Math.min(l, f.air), tumble = 1 - smooth(f.air - 0.9, f.air, s);
      fanAt(f, s, fallDummy.position);
      fallDummy.rotation.set(Math.sin(s * f.spin) * 1.1 * tumble, s * f.spin * 0.7, Math.cos(s * f.spin * 0.8) * 0.9 * tumble);
      fallDummy.scale.setScalar(f.air ? f.s * smooth(0, 0.6, l) * (1 - smooth(f.air + 0.8, f.air + REST, l)) + 1e-4 : 0);
      fallDummy.updateMatrix(); fallMesh.setMatrixAt(i, fallDummy.matrix);
    }
    fallMesh.instanceMatrix.needsUpdate = true;
  };
  sway(0);   // the fans wait for the first real frame: other modules are still building
  return { group, update };
}
