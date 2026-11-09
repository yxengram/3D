// woods — everything that grows or hangs across the outer ring and doesn't belong to a house: the 25 big ring trees, the bamboo and the scrub lot,
// overgrown hedges and verges along the ring roads, and the utility poles with their sagging, partly fallen wires.
//
// How it stays inside 24 draws: a canopy is not a mesh per tree but a few hundred *clump* instances, one InstancedMesh per species. A clump is a prototype (a dark core wrapped in
// leaf sprays). Its leaves carry a shell normal and a tone; the vertex shader turns those into a flat colour band from the sun, a per-instance lobe direction and a per-instance shade,
// so every tree keeps its own silhouette, its clumps follow layout's lobes exactly, and each clump sways rigidly about the twig that holds it. Canopies never cast; the gobo draws their shade.

export function build(ctx) {
  const { THREE, layout, P, kit } = ctx;
  const { WOODS, CANOPIES, RING_ROADS, RING_ZONES, BUILDINGS, buildingBox, inBuilding, roadDist, RAIL, RIVER, CROSSINGS, TORII, BASE, CORE, SUN_DIR, riverOutline, pointInPoly } = layout;
  const rng = ctx.rng, V = THREE.Vector3, Color = THREE.Color, TAU = Math.PI * 2;
  const SUN = new V(...SUN_DIR), MOSS_DIR = new V(-SUN.x, 0.22, -SUN.z).normalize();
  const group = new THREE.Group(); group.name = 'woods';
  const lerp = (a, b, t) => a + (b - a) * t, clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x)), smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const C = (h) => new Color(h), mix = (a, b, t) => C(a).lerp(C(b), t);
  const hash = (i, j, k) => { const h = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453; return h - Math.floor(h); };
  function vnoise(x, y, z) {
    const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z); let u = x - i, v = y - j, w = z - k; u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v); w = w * w * (3 - 2 * w);
    const m = lerp; return m(m(m(hash(i, j, k), hash(i + 1, j, k), u), m(hash(i, j + 1, k), hash(i + 1, j + 1, k), u), v), m(m(hash(i, j, k + 1), hash(i + 1, j, k + 1), u), m(hash(i, j + 1, k + 1), hash(i + 1, j + 1, k + 1), u), v), w);
  }
  const GA = Math.PI * (3 - Math.sqrt(5));
  const fib = (k, n) => { const y = 1 - (2 * (k + 0.5)) / n, r = Math.sqrt(1 - y * y), a = k * GA; return new V(Math.cos(a) * r, y, Math.sin(a) * r); };

  // ---------------------------------------------------------------- free ground: one test for everything planted or stood on the ring
  const GS = 0.05, walkOf = (r, side) => r.walk[side < 0 ? 0 : 1] || 0;
  const riverPoly = riverOutline(0.5), othersZones = Object.entries(RING_ZONES).filter(([k]) => k !== 'bamboo' && k !== 'scrub').map(([, z]) => z);
  const inRect = (r, x, z, m = 0) => x > r.x[0] - m && x < r.x[1] + m && z > r.z[0] - m && z < r.z[1] + m;
  const nearRiver = (x, z, m) => { if (z < 12) return false; if (pointInPoly(x, z, riverPoly)) return true; for (let a = 0; a < 8; a++) if (pointInPoly(x + Math.cos(a * 0.785) * m, z + Math.sin(a * 0.785) * m, riverPoly)) return true; return false; };
  const onAnyRoad = (x, z, m, except) => RING_ROADS.some((r) => r !== except && roadDist(x, z, r) < m + Math.max(r.walk[0], r.walk[1]));
  /** Keep-out for anything grown or stood on the ring. edge: margin to the plinth edge, which crumbles up to 2.3 inward. */
  const free = (x, z, pad = 0.3, { road = true, edge = 2.5, except = null } = {}) => {
    const m = Math.max(Math.abs(x), Math.abs(z));
    if (m < CORE.half + 0.5 || m > BASE.half - edge) return false;
    if (x > RAIL.bed.x[0] - 0.9 && x < RAIL.bed.x[1] + 0.9) return false;
    if (nearRiver(x, z, pad + 0.6) || inBuilding(x, z, pad)) return false;
    if (othersZones.some((r) => inRect(r, x, z, pad))) return false;
    if (Math.hypot(x - CROSSINGS.canal.x, z - CROSSINGS.canal.z) < CROSSINGS.canal.length / 2 + 1.2) return false;
    if (inRect(TORII.stair, x, z, 0.8) || Math.hypot(x - TORII.x, z - TORII.z) < 2.6) return false;
    if (WOODS.some((t) => Math.hypot(x - t.x, z - t.z) < t.trunkR + 0.5)) return false;
    return !(road && onAnyRoad(x, z, 0.08, except));
  };
  /** A strip in front of every building's door side stays clear. */
  const frontOf = (b) => { const a = b.yaw, fx = Math.sin(a), fz = Math.cos(a), bx = buildingBox(b, 0); return { x: [Math.min(bx.x[0], bx.x[0] + fx * 2.6, bx.x[1] + fx * 2.6), Math.max(bx.x[1], bx.x[0] + fx * 2.6, bx.x[1] + fx * 2.6)], z: [Math.min(bx.z[0], bx.z[0] + fz * 2.6, bx.z[1] + fz * 2.6), Math.max(bx.z[1], bx.z[0] + fz * 2.6, bx.z[1] + fz * 2.6)] }; };
  const FRONTS = BUILDINGS.map(frontOf), hedgeOK = (x, z) => free(x, z, 0.3, { road: false }) && !FRONTS.some((r) => inRect(r, x, z, 0.05)) && !onAnyRoad(x, z, 0.05, null);

  // ---------------------------------------------------------------- bark, as grove.js: indexed tubes with painted bands and a moss field
  const BARK = {
    cedar: { lit: C('#c08a66'), mid: C('#9a6a4e'), deep: C('#6e4b42'), groove: C('#4d3a3a') }, zelkova: { lit: C('#d2c3a8'), mid: C('#a8a08c'), deep: C('#7f7b70'), groove: C('#5e5c58') },
    camphor: { lit: C('#e0c096'), mid: C('#b18f6e'), deep: C('#8a6f60'), groove: C('#64524e') }, cherry: { lit: C('#a98088'), mid: C('#7f5a62'), deep: C('#5a4352'), groove: C('#3f3244') },
    persimmon: { lit: C('#8c7a66'), mid: C('#6a5a50'), deep: C('#4c4240'), groove: C('#36302f') }, pine: { lit: C('#c48a62'), mid: C('#8f5e48'), deep: C('#6a4a44'), groove: C('#45363a') },
  };
  const tmpC = new Color();
  const barkColor = (p, n, ridge, o) => { const pal = o.pal, s = n.dot(SUN), nz = vnoise(p.x * 1.3, p.y * 0.6, p.z * 1.3), v = 0.46 + ridge * 0.36 + s * 0.2 + (nz - 0.5) * 0.46 + (o.lift || 0); return tmpC.copy(v > 0.66 ? pal.lit : v > 0.42 ? pal.mid : v > 0.24 ? pal.deep : pal.groove); };
  const mossField = (p, n, o) => n.dot(MOSS_DIR) * 0.34 + Math.max(n.y, 0) * 0.3 + (vnoise(p.x * 0.9 + 9, p.y * 0.5, p.z * 0.9) - 0.5) * 1.6 + (o.moss ?? 0) + 0.2 * Math.exp(-Math.max(0, p.y - (o.g ?? 0)) / 0.9);
  const MOSS_T = 0.66;
  class Bark {
    constructor() { this.pos = []; this.col = []; this.moss = []; this.idx = []; }
    tube(pts, rs, o = {}) {
      const cp = []; for (const q of pts) { const p = q instanceof V ? q.clone() : new V(...q); if (!cp.length || cp[cp.length - 1].distanceTo(p) > 0.02) cp.push(p); }
      if (cp.length < 2) return;
      const { radial = 6, step = 0.5, seg = 0, flute = 0, lobes = 3, twist = 1, lump = 0.05 } = o;
      const curve = new THREE.CatmullRomCurve3(cp, false, 'centripetal'); curve.arcLengthDivisions = Math.max(30, cp.length * 6);
      const len = curve.getLength(), n = seg || Math.max(2, Math.ceil(len / step)), fr = curve.computeFrenetFrames(n, false), perCP = rs.length === cp.length && rs.length !== 2;
      const base = this.pos.length / 3, ph = rng() * 6.28, ph2 = rng() * 6.28, P0 = new V(), N = new V(), Q = new V();
      for (let i = 0; i <= n; i++) {
        const u = i / n; curve.getPointAt(u, P0);
        let r; if (perCP) { const f = curve.getUtoTmapping(u) * (cp.length - 1), a = Math.min(Math.floor(f), cp.length - 2); r = lerp(rs[a], rs[a + 1], f - a); } else r = lerp(rs[0], rs[1], u);
        for (let j = 0; j < radial; j++) {
          const a = (j / radial) * TAU, c = Math.cos(a), s = Math.sin(a); N.copy(fr.normals[i]).multiplyScalar(c).addScaledVector(fr.binormals[i], s);
          const ridge = flute ? Math.cos(lobes * a + twist * u * 6.28 + ph) : 0, R = r * (1 + flute * ridge + lump * Math.sin(u * len * 1.7 + ph2 + a));
          Q.copy(P0).addScaledVector(N, R); this.pos.push(Q.x, Q.y, Q.z);
          const K = barkColor(Q, N, ridge, o); this.col.push(K.r, K.g, K.b); this.moss.push(mossField(Q, N, o));
        }
      }
      for (let i = 0; i < n; i++) for (let j = 0; j < radial; j++) { const a = base + i * radial + j, b = base + i * radial + (j + 1) % radial, c = a + radial, d = b + radial; this.idx.push(a, c, b, b, c, d); }
    }
    mesh(mat) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.col), 3)); g.setAttribute('aMoss', new THREE.BufferAttribute(new Float32Array(this.moss), 1));
      g.setIndex(this.idx); g.computeVertexNormals(); const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; return m;
    }
  }
  const barkMat = (() => {
    const m = ctx.toon({ vertexColors: true, moss: 0.5 }), base = m.onBeforeCompile, key = m.customProgramCacheKey();
    const glc = (c) => `vec3(${c.r.toFixed(4)},${c.g.toFixed(4)},${c.b.toFixed(4)})`;
    m.onBeforeCompile = (s, r) => {
      base(s, r);
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute float aMoss;\nvarying float vMoss;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvMoss=aMoss;');
      s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vMoss;').replace('#include <color_fragment>', `#include <color_fragment>
        { float mo=vMoss+(texture2D(uNoise,vec2(vWPos.x,vWPos.y)*.31).r+texture2D(uNoise,vec2(vWPos.z,vWPos.y)*.37).g-1.)*.34; float a=max(fwidth(mo),.002);
          diffuseColor.rgb=mix(diffuseColor.rgb,${glc(C(P.mossDeep).lerp(C(P.moss), 0.45))},smoothstep(${MOSS_T.toFixed(2)}-a,${MOSS_T.toFixed(2)}+a,mo));
          diffuseColor.rgb=mix(diffuseColor.rgb,${glc(C(P.moss))},smoothstep(${(MOSS_T + 0.2).toFixed(2)}-a,${(MOSS_T + 0.2).toFixed(2)}+a,mo)); }`);
    };
    m.customProgramCacheKey = () => key + '|woodsbark'; return m;
  })();
  const bark = new Bark(), curveOf = (pts) => new THREE.CatmullRomCurve3(pts, false, 'centripetal');

  // ---------------------------------------------------------------- foliage shader: a colour band per leaf, from shell normal, tone and instance
  const GLSLV = /* glsl */`attribute vec3 aShell; attribute float aTone; attribute float aKind; attribute vec4 iInfo; uniform vec3 uRamp[15]; uniform vec4 uBands; uniform vec3 uSunDir;`;
  function foliageMat(ramps, { dapple = false, translucent = 1, bands = [0.86, 0.71, 0.55, 0.41], glowCap = 0 } = {}) {
    const m = ctx.toon({ color: '#ffffff', side: THREE.DoubleSide, vertexColors: true, dapple, translucent }), base = m.onBeforeCompile, key = m.customProgramCacheKey();
    const flat = new Float32Array(45); for (let k = 0; k < 3; k++) for (let b = 0; b < 5; b++) { const c = (ramps[k] || ramps[0])[b]; flat[(k * 5 + b) * 3] = c.r; flat[(k * 5 + b) * 3 + 1] = c.g; flat[(k * 5 + b) * 3 + 2] = c.b; }
    const uRamp = { value: flat }, uBands = { value: new THREE.Vector4(...bands) };
    m.onBeforeCompile = (s, r) => {
      base(s, r); s.uniforms.uRamp = uRamp; s.uniforms.uBands = uBands;
      if (glowCap) s.fragmentShader = s.fragmentShader.replace('.,1.),1.6);', `.,1.),1.6); b=min(b,${glowCap.toFixed(3)});`);   // the backlight term tops out here, so a near view into the sun keeps the petals' colour
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\n' + GLSLV).replace('#include <color_vertex>', /* glsl */`#include <color_vertex>
        mat3 im_=mat3(instanceMatrix);
        vec3 wS_=normalize(mat3(modelMatrix)*(im_*(aShell/vec3(dot(im_[0],im_[0]),dot(im_[1],im_[1]),dot(im_[2],im_[2])))));
        wS_=normalize(mix(wS_,iInfo.xyz,.34));
        float v_=dot(wS_,uSunDir)*.5+.5+aTone+iInfo.w;
        int b_=v_>uBands.x?0:v_>uBands.y?1:v_>uBands.z?2:v_>uBands.w?3:4;
        vColor.rgb*=uRamp[int(aKind+.5)*5+b_];`).replace('#include <normal_vertex>', 'transformedNormal=normalize(mat3(viewMatrix)*wS_);\n#include <normal_vertex>');
      s.fragmentShader = s.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
    };
    m.customProgramCacheKey = () => key + '|woodsfoliage' + glowCap; return m;
  }

  /** Leaf prototype under construction: sprays (star polygons fanned from their base) and cores, in the prototype's own space. */
  class Proto {
    constructor() { this.pos = []; this.col = []; this.shell = []; this.tone = []; this.kind = []; this.idx = []; }
    vert(p, c, shell, tone, kind) { this.pos.push(p.x, p.y, p.z); this.col.push(c, c, c * 0.97); this.shell.push(shell.x, shell.y, shell.z); this.tone.push(tone); this.kind.push(kind); return this.pos.length / 3 - 1; }
    spray(p, shell, tip, s, outline, tone, kind, camber = 0.05, gr = [0.76, 1.06]) {
      const T = tip.clone().normalize(), U = shell.clone().addScaledVector(T, -shell.dot(T)).normalize(), B = new V().crossVectors(U, T), q = new V();
      const v0 = this.vert(p, gr[0], shell, tone, kind);
      const zs = outline.map((o) => o[1]), zm = Math.max(...zs, 0.001);
      const ids = outline.map(([x, z]) => { q.copy(p).addScaledVector(B, x * s).addScaledVector(U, camber * s * Math.abs(x) * 2).addScaledVector(T, z * s); return this.vert(q, lerp(gr[0] + 0.12, gr[1], clamp(z / zm)), shell, tone, kind); });
      for (let i = 0; i + 1 < ids.length; i++) this.idx.push(v0, ids[i], ids[i + 1]);
    }
    /** Dark inner mass the sprays are pinned to. */
    core(cx, cy, cz, r, ry, tone = -0.68, w = 8, h = 5, kind = 0) {
      const g = kit.sphere(1, w, h), p = g.attributes.position, base = this.pos.length / 3, N = new V(), Q = new V();
      for (let i = 0; i < p.count; i++) {
        N.fromBufferAttribute(p, i); const k = 0.8 + 0.5 * vnoise(N.x * 1.4 + cx, N.y * 1.4, N.z * 1.4);
        Q.set(cx + N.x * r * k, cy + N.y * ry * k, cz + N.z * r * k); this.vert(Q, 0.86 + 0.14 * N.dot(SUN), N, tone, kind);
      }
      for (let i = 0; i < g.index.count; i++) this.idx.push(base + g.index.getX(i));
    }
    geometry() {
      const g = new THREE.BufferGeometry(), n = this.pos.length / 3;
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(Array.from({ length: n * 3 }, (_, i) => (i % 3 === 1 ? 1 : 0)), 3));
      g.setAttribute('aShell', new THREE.Float32BufferAttribute(this.shell, 3)); g.setAttribute('aTone', new THREE.Float32BufferAttribute(this.tone, 1)); g.setAttribute('aKind', new THREE.Float32BufferAttribute(this.kind, 1));
      g.setIndex(this.idx); return g;
    }
  }
  // spray outlines: [x, z], z from the twig to the tip, fanned from the twig
  const OUT = {
    broad: [[-0.42, 0.24], [-0.52, 0.72], [-0.15, 0.62], [0, 1.2], [0.15, 0.62], [0.52, 0.72], [0.42, 0.24]],
    fine: [[-0.28, 0.3], [-0.42, 0.78], [-0.1, 0.58], [0, 1.22], [0.1, 0.58], [0.42, 0.78], [0.28, 0.3]],
    needle: [[-0.06, 0.3], [-0.2, 0.98], [-0.05, 0.62], [0, 1.28], [0.05, 0.62], [0.2, 0.98], [0.06, 0.3]],
    star: [[-0.5, 0.56], [-0.1, 0.36], [-0.28, 1.0], [0, 0.46], [0.28, 1.0], [0.1, 0.36], [0.5, 0.56]],
    lance: [[-0.2, 0.34], [-0.15, 0.7], [0, 1.02], [0.15, 0.7], [0.2, 0.34]],
    puff: [[-0.5, 0.04], [-0.4, 0.34], [-0.12, 0.42], [0.08, 0.52], [0.36, 0.34], [0.5, 0.08], [0.42, -0.26], [0.16, -0.4], [-0.1, -0.5], [-0.38, -0.32], [-0.5, 0.04]],
    blade: [[-0.09, 0.3], [-0.08, 0.72], [0, 1.06], [0.08, 0.72], [0.09, 0.3]],
  };
  /** A round clump in unit space. */
  function sphereProto({ n, outline, size, core = 0.68, minY = -0.75, kindOf = () => 0, toneJit = 0.03, seed = 0, tipOut = [0.05, 0.75], extra = null, coreKind = 0 }) {
    const p = new Proto(), R = ctx.seeded('proto' + seed);
    for (let k = 0; k < n; k++) {
      const d = fib(k, n); if (d.y < minY) continue; d.x += R.range(-0.05, 0.05); d.y += R.range(-0.05, 0.05); d.z += R.range(-0.05, 0.05); d.normalize();
      const bump = 0.96 + 0.26 * (vnoise(d.x * 2.6 + seed, d.y * 2.6, d.z * 2.6) - 0.5), q = d.clone().multiplyScalar(bump), shell = d.clone();
      const dx = new V(0, -1, 0).addScaledVector(shell, shell.y).normalize(); if (dx.lengthSq() < 0.5) dx.set(R() - 0.5, 0, R() - 0.5).normalize();
      dx.applyAxisAngle(shell, Math.abs(shell.y) > 0.72 ? R() * TAU : R.range(-1.1, 1.1));
      const kd = kindOf(k, d, R), tip = dx.clone().multiplyScalar(0.8).addScaledVector(shell, R.range(tipOut[0], tipOut[1])).normalize();
      p.spray(q, shell, tip, size * R.range(0.84, 1.18), Array.isArray(outline) ? outline : outline(kd), R.range(-toneJit, toneJit) + (kd === 2 ? 0 : (vnoise(d.x * 3 + 7, d.y * 3, d.z * 3) - 0.5) * 0.08), kd);
    }
    if (core > 0) p.core(0, 0, 0, core, core * 0.9, -0.68, 7, 5, coreKind);
    if (extra) extra(p, R);
    return p.geometry();
  }
  /** A cedar bough-tier: a scalloped, drooping cone skirt around the trunk, in unit space. */
  function cedarProto(n, size) {
    const p = new Proto(), R = ctx.seeded('cedar-tier');
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU * 7.03 + R() * 0.3, v = Math.pow((k + 0.5) / n, 0.6);
      const sc = 1 + 0.17 * Math.cos(a * 7 + 1.2), r = v * sc, y = lerp(0.52, -0.42, v) - 0.05 * Math.sin(a * 3);
      const out = new V(Math.cos(a), 0, Math.sin(a)), shell = out.clone().multiplyScalar(0.72).add(new V(0, 0.72, 0)).normalize();
      const tip = out.clone().multiplyScalar(0.62).add(new V(R.range(-0.12, 0.12), -0.8, R.range(-0.12, 0.12))).normalize();
      p.spray(new V(out.x * r, y, out.z * r), shell, tip, size * R.range(0.82, 1.18), OUT.needle, R.range(-0.03, 0.03) + (v - 0.5) * 0.08, R() < 0.05 ? 1 : 0, 0.03, [0.7, 1.08]);
    }
    // dark inner cone, closed underneath so nothing of the sky shows through a skirt
    const base = p.pos.length / 3, RAD = 12; const top = p.vert(new V(0, 0.6, 0), 0.7, new V(0, 1, 0), -0.46, 0);
    for (let j = 0; j < RAD; j++) { const a = (j / RAD) * TAU; p.vert(new V(Math.cos(a) * 0.82, -0.36, Math.sin(a) * 0.82), 0.72, new V(Math.cos(a), 0.2, Math.sin(a)).normalize(), -0.46, 0); }
    for (let j = 0; j < RAD; j++) p.idx.push(top, base + 1 + j, base + 1 + (j + 1) % RAD);
    return p.geometry();
  }

  // ---------------------------------------------------------------- species
  const LEAF = (a, b, c, d, e) => [C(a), C(b), C(c), C(d), C(e)];
  const FOL = {
    cedar: foliageMat([LEAF('#6aa36a', '#3b8366', '#226a63', '#16535a', '#0e3b4a'), LEAF('#b38a56', '#96703f', '#6f5a48', '#4e4a4c', '#3a3a44')], { translucent: 0.3, bands: [0.86, 0.72, 0.56, 0.4] }),
    zelkova: foliageMat([LEAF('#cfe679', '#a2d95f', '#6dbb57', '#3a9460', '#22705f'), LEAF('#e7e283', '#c9dc66', '#9dc65b', '#5da05c', '#3a7e5d')], { translucent: 1.05 }),
    camphor: foliageMat([[C(P.leafLit).lerp(C(P.leafGold), 0.35).multiplyScalar(0.8), C(P.leafMid).multiplyScalar(0.86), C('#2b8f58'), C('#17705f'), C('#0f4f5a')], LEAF('#b8e266', '#8cd05a', '#57ae58', '#2f8a5e', '#1b6a5e')], { translucent: 0.9 }),
    cherry: foliageMat([LEAF('#b7df73', '#82c45e', '#4fa25f', '#2a8063', '#185c5c'), LEAF('#d0a35e', '#bd8a55', '#94744f', '#62684f', '#3f5550')], { translucent: 1 }),
    bloom: foliageMat([LEAF('#b7df73', '#82c45e', '#4fa25f', '#2a8063', '#185c5c'), [mix(P.flowerWhite, P.bougainLit, 0.14), mix(P.flowerWhite, P.bougainLit, 0.36), mix(P.flowerWhite, P.bougainLit, 0.6), C('#dba0c0'), C('#a884bc')]], { translucent: 1.15, bands: [0.8, 0.64, 0.48, 0.34], glowCap: 0.38 }),
    persimmon: foliageMat([LEAF('#a9c966', '#6ca657', '#3f8a56', '#2a6a58', '#1b4d4f'), LEAF('#efc160', '#e09a44', '#c1743c', '#7f6048', '#4e564e'), LEAF('#ffb04a', '#f88b2e', '#d9682a', '#a85030', '#7a3f30')], { translucent: 0.8 }),
    pine: foliageMat([LEAF('#9ccf7c', '#62ad70', '#357f68', '#1d6660', '#124551'), LEAF('#c5de78', '#8bbf6a', '#5a9a66', '#2f7a64', '#1c5a5a')], { translucent: 0.55, bands: [0.82, 0.66, 0.5, 0.36] }),
    hedge: foliageMat([[C(P.leafLit).lerp(C(P.leafMid), 0.45), C(P.leafMid).lerp(C(P.leafDeep), 0.3), C(P.leafDeep), C(P.leafShade), C('#14555a')], [mix(P.flowerWhite, P.bougainLit, 0.4), C(P.bougainLit), mix(P.bougain, P.leafShade, 0.2), mix(P.bougain, P.leafShade, 0.55), C(P.leafShade)]], { dapple: true, translucent: 0.7 }),
    grass: foliageMat([[C(P.grassLit), C(P.grass), C(P.fern), C(P.leafDeep), C(P.leafShade)]], { dapple: true, translucent: 0.9, bands: [0.78, 0.62, 0.46, 0.3] }),
    gold: foliageMat([LEAF('#b8e266', '#7fcf55', '#4fb56a', '#2f9a63', '#1d6f66'), LEAF('#ffe36a', '#ffd257', '#e0b54a', '#a99a58', '#6e8460')], { dapple: true, translucent: 0.9, bands: [0.78, 0.62, 0.46, 0.3] }),
    ivy: foliageMat([[C(P.ivyLit), C(P.ivy), C(P.leafDeep), C(P.leafShade), C('#14555a')], [C(P.ivyRed), mix(P.ivyRed, P.rust, 0.5), C(P.rustDark), C(P.leafShade), C('#14555a')]], { dapple: true, translucent: 0.8 }),
    bamboo: foliageMat([LEAF('#5b9d70', '#3f8866', '#2b705d', '#1c5a56', '#123f4b'), LEAF('#9ccb80', '#7ab673', '#569b69', '#2f7a5f', '#1b5a55')], { translucent: 0.2, bands: [0.82, 0.66, 0.5, 0.36] }),
  };
  const PROTO = {
    zelkova: () => sphereProto({ n: 30, outline: OUT.fine, size: 0.62, seed: 11, core: 0.56, kindOf: (k, d, R) => (d.y > 0.2 && R() < 0.16 ? 1 : 0), tipOut: [0.15, 0.9] }),
    camphor: () => sphereProto({ n: 30, outline: OUT.broad, size: 0.68, seed: 12, core: 0.56, kindOf: (k, d, R) => (d.y > 0.35 && R() < 0.12 ? 1 : 0), tipOut: [0.05, 0.6] }),
    cherry: () => sphereProto({ n: 30, outline: OUT.fine, size: 0.62, seed: 13, core: 0.52, minY: -0.55, kindOf: (k, d, R) => (R() < 0.1 ? 1 : 0) }),
    bloom: () => sphereProto({ n: 40, outline: (kd) => (kd ? OUT.puff : OUT.fine), size: 0.46, seed: 14, core: 0.52, coreKind: 1, minY: -0.65, kindOf: (k, d, R) => (R() < 0.8 ? 1 : 0), toneJit: 0.05 }),
    persimmon: () => sphereProto({
      n: 26, outline: OUT.broad, size: 0.6, seed: 15, core: 0.44, minY: -0.6, kindOf: (k, d, R) => (R() < 0.15 ? 1 : 0),
      extra: (p, R) => { for (let i = 0; i < 5; i++) { const a = R() * TAU, c = new V(Math.cos(a) * 0.86, -0.28 - R() * 0.42, Math.sin(a) * 0.86); const g = kit.ico(1, 0), q = g.attributes.position, base = p.pos.length / 3, N = new V(), Q = new V(), rr = 0.21; for (let v = 0; v < q.count; v++) { N.fromBufferAttribute(q, v); Q.set(c.x + N.x * rr, c.y + N.y * rr * 0.88, c.z + N.z * rr); p.vert(Q, 1, N, 0.06, 2); p.idx.push(base + v); } } },
    }),
    pine: () => sphereProto({ n: 74, outline: OUT.star, size: 0.4, seed: 16, core: 0.4, minY: -0.5, kindOf: (k, d, R) => (d.y > 0.4 && R() < 0.1 ? 1 : 0), tipOut: [0.7, 1.05] }),
    hedge: () => sphereProto({ n: 20, outline: OUT.broad, size: 0.64, seed: 17, core: 0.52, minY: -0.35, kindOf: (k, d, R) => (d.y > 0 && R() < 0.05 ? 1 : 0), tipOut: [0.1, 0.8] }),
  };

  // ---------------------------------------------------------------- instancing and sway
  const clumps = { cedar: [], zelkova: [], camphor: [], cherry: [], bloom: [], persimmon: [], pine: [] };
  const dummy = new THREE.Object3D();
  /** Instance list → InstancedMesh with iInfo. Each item: {pos, quat?, sc:[x,y,z], out:V, shade, color?}. */
  function instMesh(list, geo, mat, { soft = true, shadow = false, receive = false, dynamic = false } = {}) {
    if (!list.length) return null;
    const n = list.length, g = geo, info = new Float32Array(n * 4), m = new THREE.InstancedMesh(g, mat, n), white = C('#ffffff');
    list.forEach((c, i) => {
      dummy.position.copy(c.pos); dummy.quaternion.copy(c.quat || dummy.quaternion.identity()); dummy.scale.set(...c.sc); dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix); m.setColorAt(i, c.color || white);
      info[i * 4] = c.out.x; info[i * 4 + 1] = c.out.y; info[i * 4 + 2] = c.out.z; info[i * 4 + 3] = c.shade || 0;
    });
    g.setAttribute('iInfo', new THREE.InstancedBufferAttribute(info, 4));
    if (dynamic) m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.castShadow = shadow; m.receiveShadow = receive; if (soft) ctx.softEdge(m); group.add(m);
    return m;
  }
  const swayMeshes = [];
  const swayed = (m, list, wKey = 0) => { if (m) swayMeshes.push({ m, list, base: Float32Array.from(m.instanceMatrix.array), wKey }); return m; };

  // ---------------------------------------------------------------- trees
  const q0 = new THREE.Quaternion(), e0 = new THREE.Euler();
  const quatY = (y, tx = 0, tz = 0) => new THREE.Quaternion().setFromEuler(e0.set(tx, y, tz, 'YXZ'));
  const cStats = { culled: 0, total: 0, cedarTiers: 0 };
  const inHouse = (cx, cy, cz, rx, ry, pad = 0.8) => BUILDINGS.some((b) => { const r = buildingBox(b, pad + rx * 0.72); return cx > r.x[0] && cx < r.x[1] && cz > r.z[0] && cz < r.z[1] && cy - ry * 0.7 < b.elev + b.h + 0.35; });
  /** Canopy shade: is this point in the sun's way of a lobe of another tree? (Their canopies cast nothing into the shadow map.) */
  const shadedByOthers = (p, own) => {
    for (const l of CANOPIES) {
      if (own.includes(l)) continue; const [x, y, z, r, ry] = l; if (Math.abs(x - p.x) + Math.abs(z - p.z) > 16) continue;
      const dx = x - p.x, dy = (y - p.y) * (r / ry), dz = z - p.z, sy = SUN.y * (r / ry), sl = Math.hypot(SUN.x, sy, SUN.z), t = (dx * SUN.x + dy * sy + dz * SUN.z) / sl;
      if (t > 0 && dx * dx + dy * dy + dz * dz - t * t < r * r * 0.7) return true;
    }
    return false;
  };
  function addLimb(tr, pts, r0, r1, o = {}) {
    bark.tube(pts, [r0, r1], { pal: tr.pal, g: tr.g, radial: 5, step: 0.8, flute: 0.1, lobes: 3, twist: 1, moss: -0.08, ...o });
    const c = curveOf(pts), n = Math.max(3, Math.ceil(c.getLength() / 0.7));
    for (let k = 1; k <= n; k++) { const s = k / n; tr.samples.push({ p: c.getPointAt(s), r: lerp(r0, r1, s) }); }
    return c;
  }
  function limbCurve(S, E, wob, rise = 1.7) {
    const d = new V().subVectors(E, S), side = new V(-d.z, 0, d.x).normalize(), ph = rng() * 6.28, pts = [];
    for (const s of [0, 0.25, 0.5, 0.75, 1]) { const q = new V(lerp(S.x, E.x, s), S.y + (E.y - S.y) * (1 - Math.pow(1 - s, rise)), lerp(S.z, E.z, s)); q.addScaledVector(side, Math.sin(s * 5 + ph) * wob * Math.sin(s * Math.PI)); q.y += Math.sin(s * 7.5 + ph * 2) * wob * 0.3 * Math.sin(s * Math.PI); pts.push(q); }
    return pts;
  }
  function trunkTube(tr, top, fork, wide, flare = 0.85, o = {}) {
    const { T, g, axis } = tr, pts = [], rs = [], r = T.trunkR;
    for (let y = g - 0.5; y < top; y += 0.6) { pts.push(axis(y)); rs.push(r * wide * (1 + flare * Math.exp(-(y - g) / 0.55) + 0.14 * Math.exp(-Math.pow((y - fork) / 0.7, 2))) * lerp(1, 0.25, smooth(fork - 0.8, top, y))); }
    bark.tube(pts, rs, { pal: tr.pal, g, radial: 8, step: 0.5, flute: 0.12, lobes: 4, twist: 0.8, lump: 0.05, moss: 0.04, ...o });
  }
  /** Buttress: pours off the trunk and into the soil. Kept short: it stops where the free ground does. */
  function surfaceRoot(tr, a0, len, r0, h0 = 1.1) {
    const { axis, T, g } = tr, r = T.trunkR; let c = axis(g + h0 * 0.8);
    const pts = [new V(c.x + Math.cos(a0) * r * 0.2, g + h0, c.z + Math.sin(a0) * r * 0.2)]; c = axis(g + h0 * 0.4);
    pts.push(new V(c.x + Math.cos(a0) * r * 1.05, g + h0 * 0.42, c.z + Math.sin(a0) * r * 1.05)); c = axis(g + 0.1);
    let x = c.x + Math.cos(a0) * r * 1.75, z = c.z + Math.sin(a0) * r * 1.75, a = a0; pts.push(new V(x, g + 0.08, z));
    for (let w = 0, i = 0; w < len; w += 0.6, i++) { a += rng.range(-0.4, 0.4); const nx = x + Math.cos(a) * 0.55, nz = z + Math.sin(a) * 0.55; if (!free(nx, nz, 0.05, { road: false, edge: 1.4 })) break; x = nx; z = nz; pts.push(new V(x, g + 0.02 - (i > 1 ? (i - 1) * 0.05 : 0), z)); }
    if (pts.length > 3) { const e = pts[pts.length - 1]; pts.push(new V(e.x + Math.cos(a) * 0.2, g - 0.3, e.z + Math.sin(a) * 0.2)); }
    bark.tube(pts, [r0, 0.04], { pal: tr.pal, g, radial: 4, step: 0.6, flute: 0.1, lobes: 2, twist: 0.8, moss: -0.12 });
  }
  function growVase(tr, forkK, limbsN, rise, reach, wob) {
    const { T, LOBES, axis, g, s } = tr, L0 = LOBES[0], r = T.trunkR, fork = g + forkK * s;
    trunkTube(tr, fork + 0.8, fork, 1.15);
    const ends = [];
    for (const L of LOBES.slice(1)) ends.push({ E: L.c.clone().add(new V(0, -L.ry * 0.25, 0)), r: r * 0.6, L });
    for (let i = 0; i < limbsN; i++) { const a = (i / limbsN) * TAU + tr.seed + rng.range(-0.2, 0.2), rr = L0.r * reach * rng.range(0.85, 1.05); ends.push({ E: new V(L0.c.x + Math.cos(a) * rr, L0.c.y + L0.ry * rng.range(-0.15, 0.25), L0.c.z + Math.sin(a) * rr), r: r * 0.5, L: L0 }); }
    ends.forEach((e, i) => {
      if (inHouse(e.E.x, e.E.y, e.E.z, 0.5, 0.5)) return;   // a house stands where this limb would go: the tree grows round it
      const a = Math.atan2(e.E.z - T.z, e.E.x - T.x), S = axis(fork - 0.35 + i * 0.1).add(new V(Math.cos(a) * r * 0.4, 0, Math.sin(a) * r * 0.4));
      const c = addLimb(tr, [axis(S.y - 1), ...limbCurve(S, e.E, wob, rise)], e.r, 0.07, { radial: 5 });
      for (const f of [0.55, 0.78]) { const p = c.getPointAt(f), aa = a + rng.sign() * rng.range(0.6, 1.2), rr = e.L.r * rng.range(0.4, 0.7), E2 = new V(e.L.c.x + Math.cos(aa) * rr, lerp(p.y, e.L.c.y, 0.6) + rng.range(-0.2, 0.5), e.L.c.z + Math.sin(aa) * rr); if (inHouse(E2.x, E2.y, E2.z, 0.5, 0.5)) continue; addLimb(tr, limbCurve(p, E2, wob * 0.6, rise), lerp(e.r, 0.07, f) * 0.66, 0.045, { radial: 3, step: 1.1, flute: 0 }); }
    });
  }
  function growCedar(tr) {
    const { T, LOBES, axis, g, s } = tr, L = LOBES[0], top = L.c.y + L.ry + 0.8 * s, r = T.trunkR, pts = [], rs = [];
    for (let y = g - 0.5; y < top; y += 0.7) { pts.push(axis(y)); rs.push(lerp(r * 1.15, 0.05, Math.pow(Math.max(0, y - g) / (top - g), 0.86)) * (1 + 0.8 * Math.exp(-(y - g) / 0.5))); }
    bark.tube(pts, rs, { pal: tr.pal, g, radial: 8, step: 0.7, flute: 0.14, lobes: 6, twist: 0.25, lump: 0.02, moss: 0.05 });
    for (let k = 0; k < 2; k++) { const y = g + rng.range(1.4, L.c.y - L.ry - g - 0.3 > 1.4 ? L.c.y - L.ry - g : 1.8), a = rng() * TAU, st = axis(y); bark.tube([st, st.clone().add(new V(Math.cos(a) * 0.5, -0.02, Math.sin(a) * 0.5)), st.clone().add(new V(Math.cos(a) * 0.95, -0.2, Math.sin(a) * 0.95))], [0.05, 0.015], { pal: tr.pal, g, radial: 3, step: 0.5, lift: -0.2 }); }   // dead lower snags
    const n = Math.round(9 + 2 * s), lo = L.c.y - L.ry * 0.98, hi = top - 0.1;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), y = lerp(lo, hi, Math.pow(u, 0.94));
      const prof = u < 0.22 ? lerp(0.8, 1.02, u / 0.22) : Math.pow(1 - (u - 0.22) / 0.78, 0.74) * 1.02 + 0.03, rad = L.r * prof * (1 + (vnoise(u * 9, T.x, 0) - 0.5) * 0.16), ht = lerp(1.55, 0.75, u) * s;
      const c = axis(y), shade = lerp(-0.1, 0.08, u) + (i % 2 ? -0.03 : 0.03);
      clumps.cedar.push({ pos: c, quat: quatY(rng() * TAU, rng.range(-0.03, 0.03), rng.range(-0.03, 0.03)), sc: [rad, ht, rad], out: new V(rng.range(-0.1, 0.1), 0.6, rng.range(-0.1, 0.1)).normalize(), shade, pivot: c.clone(), amp: lerp(0.006, 0.03, u * u), tree: tr.i, ph: rng() * 6.28, f: rng.range(0.9, 1.4), color: new Color(1, 1, 1).multiplyScalar(rng.range(0.96, 1.05)) });
    }
    cStats.cedarTiers += n;
  }
  function growPine(tr) {
    const { T, LOBES, axis, g, s } = tr, L0 = LOBES[0], r = T.trunkR, H = L0.c.y + L0.ry * 0.55 - g, top = g + H, pts = [], rs = [];
    for (let y = g - 0.5; y < top; y += 0.5) { pts.push(axis(y)); rs.push(lerp(r * 1.2, 0.08, Math.pow(Math.max(0, y - g) / H, 0.9)) * (1 + 0.7 * Math.exp(-(y - g) / 0.5))); }
    bark.tube(pts, rs, { pal: tr.pal, g, radial: 7, step: 0.5, flute: 0.14, lobes: 5, twist: 1.6, lump: 0.08, moss: 0 });
    const pad = (c, rc, h, lobe) => {
      if (inHouse(c.x, c.y, c.z, rc, h)) { cStats.total++; cStats.culled++; cStats.byTree = cStats.byTree || {}; cStats.byTree[tr.T.kind + '@' + tr.T.x + ',' + tr.T.z] = (cStats.byTree[tr.T.kind + '@' + tr.T.x + ',' + tr.T.z] || 0) + 1; return; }
      const up = axis(clamp(c.y - 0.5, g + 0.8, top - 0.2)), c2 = addLimb(tr, limbCurve(up, c.clone().add(new V(0, -h * 0.5, 0)), 0.12, 0.8), lerp(r * 0.55, 0.1, clamp((c.y - g) / H)), 0.05, { radial: 5, flute: 0.08 });
      const piv = c2.getPointAt(0.85); pushClump('pine', tr, c, rc, h, lobe, piv, 0.02, 0);
    };
    LOBES.forEach((L, li) => {
      const n = li ? 3 : 7;
      for (let i = 0; i < n; i++) {
        const u = n > 1 ? i / (n - 1) : 0.4, a = tr.seed + i * 2.4 + li * 1.1, rad = L.r * lerp(0.84, li ? 0.4 : 0.22, Math.pow(u, 1.1)), y = L.c.y + L.ry * lerp(li ? -0.55 : -0.72, li ? 0.4 : 0.72, u);
        pad(new V(L.c.x + Math.cos(a) * rad, y, L.c.z + Math.sin(a) * rad), lerp(1.42, 0.86, u) * s, lerp(0.56, 0.42, u) * s, L);
      }
    });
    pad(new V(L0.c.x + 0.2 * s, L0.c.y + L0.ry * 0.92, L0.c.z + 0.1 * s), 1.05 * s, 0.42 * s, L0);
  }
  function pushClump(key, tr, c, rc, rcy, L, pivot, amp, tone = 0, bloom = false) {
    cStats.total++;
    if (inHouse(c.x, c.y, c.z, rc, rcy)) { cStats.culled++; cStats.byTree = cStats.byTree || {}; cStats.byTree[tr.T.kind + '@' + tr.T.x + ',' + tr.T.z] = (cStats.byTree[tr.T.kind + '@' + tr.T.x + ',' + tr.T.z] || 0) + 1; return null; }
    const out = new V(c.x - L.c.x, (c.y - L.c.y) * 1.4, c.z - L.c.z).normalize();
    const h = clamp((c.y - tr.lo) / (tr.hi - tr.lo));
    const own = tr.CL.some((o) => { const dx = o.x - c.x, dy = o.y - c.y, dz = o.z - c.z, t = dx * SUN.x + dy * SUN.y + dz * SUN.z; if (t < 0.5 * rc) return false; const d2 = dx * dx + dy * dy + dz * dz - t * t, R = o.r * 0.8; return d2 < R * R; });
    const shaded = own || shadedByOthers(c, tr.T.lobes);
    const shade = (h - 0.5) * 0.16 + (shaded ? -0.2 : 0) + tone - Math.max(0, -out.y) * 0.12;
    const item = { pos: c.clone(), quat: quatY(rng() * TAU, rng.range(-0.2, 0.2), rng.range(-0.2, 0.2)), sc: [rc, rcy, rc], out, shade, pivot: pivot.clone(), amp, tree: tr.i, ph: rng() * 6.28, f: rng.range(0.9, 1.5), color: tr.tint.clone().multiplyScalar(rng.range(0.96, 1.05)) };
    tr.CL.push({ x: c.x, y: c.y, z: c.z, r: rc });
    clumps[key].push(item); return item;
  }
  function growCanopy(tr, key, S) {
    const { T, LOBES, s } = tr; let idxKey = key;
    for (const L of LOBES) {
      const base = lerp(S.clumpR[0], S.clumpR[1], 0.5) * s, n = Math.max(4, Math.round((S.fill * L.r * L.ry) / (base * base))), shift = rng() * 6;
      for (let k = 0; k < n; k++) {
        const d = fib(k, n).applyAxisAngle(new V(0, 1, 0), shift); if (d.y < S.minY) continue;
        const rc = base * rng.range(0.8, 1.2), c = new V(L.c.x + d.x * Math.max(0.4, L.r - rc * 0.72), L.c.y + d.y * Math.max(0.3, L.ry - rc * 0.78), L.c.z + d.z * Math.max(0.4, L.r - rc * 0.72));
        c.x += rng.range(-0.25, 0.25); c.y += rng.range(-0.15, 0.15); c.z += rng.range(-0.25, 0.25);
        let best = null, bd = 1e9; for (const b of tr.samples) { const q = b.p.distanceToSquared(c) + (b.p.y > c.y ? 2.5 : 0); if (q < bd) { bd = q; best = b; } }
        const piv = best.p.clone(), mid = piv.clone().lerp(c, 0.55); mid.y -= 0.12; mid.x += rng.range(-0.2, 0.2); mid.z += rng.range(-0.2, 0.2);
        if (pushClump(tr.bloom && rng() < tr.bloom ? 'bloom' : idxKey, tr, c, rc, rc * rng.range(0.74, 0.88), L, piv, S.amp)) bark.tube([best.p, mid, c], [Math.min(best.r * 0.7, 0.08), 0.02], { pal: tr.pal, g: tr.g, radial: 3, step: 1.2, moss: -0.2, lift: -0.2 });
      }
    }
  }
  const SP = {
    zelkova: { clumpR: [1.02, 1.26], fill: 3.5, minY: -0.5, amp: 0.03 }, camphor: { clumpR: [1.2, 1.55], fill: 5.2, minY: -0.75, amp: 0.024 },
    cherry: { clumpR: [0.92, 1.18], fill: 4.0, minY: -0.5, amp: 0.03 }, persimmon: { clumpR: [0.72, 1.0], fill: 3.4, minY: -0.65, amp: 0.028 },
  };
  const cherriesInBloom = new Set(WOODS.filter((t) => t.kind === 'cherry').filter((_, i) => i % 7 === 0 || i % 7 === 2 || i % 7 === 3 || i % 7 === 5).map((t) => t));   // of the seven: first, third, fourth and sixth
  const statics = ctx.batch();
  const trees = WOODS.map((T, i) => {
    const g = T.elev + GS, seed = rng() * 6.28, s = T.s, inPaddy = inRect(RING_ZONES.paddies, T.x, T.z);
    const wobbly = T.kind === 'persimmon' ? 0.16 : T.kind === 'pine' ? 0 : 0.05, lx = rng.range(-0.012, 0.012), lz = rng.range(-0.012, 0.012);
    const H = T.lobes[0][1] - g, bend = T.kind === 'pine' ? rng.range(0.5, 0.8) * rng.sign() : 0, bdir = rng() * TAU;
    const axis = (y) => { const k = T.kind === 'pine' ? Math.sin(((y - g) / H) * Math.PI * 1.3) : 0, dx = Math.cos(bdir) * bend * k, dz = Math.sin(bdir) * bend * k; return new V(T.x + dx + lx * y + wobbly * Math.sin(y * 0.9 + seed), y, T.z + dz + lz * y + wobbly * Math.cos(y * 0.7 + seed)); };
    const LOBES = T.lobes.map(([x, y, z, r, ry], j) => ({ c: new V(x, y, z), r, ry, i: j }));
    const lo = Math.min(...LOBES.map((l) => l.c.y - l.ry)), hi = Math.max(...LOBES.map((l) => l.c.y + l.ry));
    const bloomed = T.kind === 'cherry' && cherriesInBloom.has(T);
    const tr = { T, i, s, g, axis, LOBES, lo, hi, pal: BARK[T.kind], samples: [], seed, CL: [], tint: new Color(1, 1, 1).lerp(mix(P.leafGold, P.leafDeep, rng()), 0.1), bloom: bloomed ? 0.72 : 0 };
    if (T.kind === 'cedar') growCedar(tr);
    else if (T.kind === 'pine') growPine(tr);
    else {
      if (T.kind === 'zelkova') growVase(tr, 1.7, 7, 1.15, 0.72, 0.24);
      else if (T.kind === 'camphor') growVase(tr, 2.1, 4, 1.5, 0.56, 0.32);
      else if (T.kind === 'cherry') growVase(tr, 1.35, 5, 0.75, 0.84, 0.3);
      else growVase(tr, 1.15, 4, 1.05, 0.72, 0.42);
      growCanopy(tr, T.kind, SP[T.kind]);
    }
    // roots
    const n = T.kind === 'cedar' ? 6 : 5, rr = T.trunkR;
    if (!inPaddy) for (let k = 0; k < n; k++) surfaceRoot(tr, (k / n) * 6.283 + rng.range(-0.25, 0.25), rng.range(0.7, 1.6) * s, rr * rng.range(0.4, 0.56), rng.range(0.7, 1.3) * (T.kind === 'camphor' ? 1.3 : 1));
    // heaved earth around the foot
    if (!inPaddy) {
      const R = (1.0 + T.trunkR * 2.4) * 1.05, rings = 5, seg = 18, pos = [], idx = [], moundH = 0.18 + T.trunkR * 0.5;
      const heave = (r, a) => moundH * Math.exp(-(r / R) * (r / R) * 2.6) * (1 + 0.28 * Math.sin(a * 5 + seed));
      pos.push(T.x, g + heave(0, 0), T.z);
      for (let a = 1; a <= rings; a++) for (let j = 0; j < seg; j++) {
        const f = a / rings, an = (j / seg) * TAU; let r = R * Math.pow(f, 0.8) * (0.8 + 0.4 * vnoise(Math.cos(an) * 1.6 + seed, Math.sin(an) * 1.6, 2)); const rx = Math.cos(an), rz = Math.sin(an);
        const toEdge = (d, c) => (Math.abs(d) < 1e-6 ? 1e9 : ((d > 0 ? BASE.half - 0.1 : -BASE.half + 0.1) - c) / d); r = Math.min(r, toEdge(rx, T.x), toEdge(rz, T.z));
        pos.push(T.x + rx * r, g + heave(r, an) * (1 - f * f) + (a === rings ? -0.12 : 0) - 0.015, T.z + rz * r);
      }
      for (let j = 0; j < seg; j++) idx.push(0, 1 + (j + 1) % seg, 1 + j);
      for (let a = 0; a < rings - 1; a++) for (let j = 0; j < seg; j++) { const q = 1 + a * seg + j, b = 1 + a * seg + (j + 1) % seg, c = q + seg, d = b + seg; idx.push(q, b, c, b, d, c); }
      const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); m.setIndex(idx); m.computeVertexNormals(); statics.add(m, 'soil');
    }
    return tr;
  });
  group.userData.cStats = cStats;
  cStats.dropped = 0;

  // shimenawa on the great cedar by the shrine: straw rope and paper streamers, long unattended
  {
    const shrine = BUILDINGS.find((b) => b.kind === 'shrine'), tr = trees.filter((t) => t.T.kind === 'cedar').sort((a, b) => Math.hypot(a.T.x - shrine.x, a.T.z - shrine.z) - Math.hypot(b.T.x - shrine.x, b.T.z - shrine.z))[0];
    const y = tr.g + 1.9, c = tr.axis(y), R = tr.T.trunkR * 1.24, pts = [];
    for (let i = 0; i <= 22; i++) { const a = (i / 22) * TAU; pts.push(new V(c.x + Math.cos(a) * R, y + Math.sin(a * 2) * 0.04 - Math.cos(a - 0.9) * 0.05, c.z + Math.sin(a) * R)); }
    statics.add(kit.tube(pts, 0.1, 0.1, 5, 44), 'flat', { color: '#c9b583' });
    for (const a of [0.3, 1.5, 3.0, 4.4]) { const x = c.x + Math.cos(a) * (R + 0.08), z = c.z + Math.sin(a) * (R + 0.08); for (let k = 0; k < 3; k++) statics.add(kit.box(0.1, 0.14, 0.012), 'flat', { pos: [x + Math.sin(a) * 0.04 * (k % 2 ? 1 : -1), y - 0.16 - k * 0.12, z - Math.cos(a) * 0.04 * (k % 2 ? 1 : -1)], rot: [0, 1.57 - a, 0], color: k === 2 ? '#d9d3bd' : '#efe9d4' }); }
  }
  // ---------------------------------------------------------------- road geometry helpers
  const roads = RING_ROADS.map((r) => { let L = 0; const segs = r.pts.slice(1).map((b, i) => { const a = r.pts[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]), o = { a, b, len, L0: L }; L += len; return o; }); return { r, segs, L }; });
  const roadAt = ({ segs }, s) => { let k = segs.length - 1; for (let i = 0; i < segs.length; i++) if (s < segs[i].L0 + segs[i].len) { k = i; break; } const q = segs[k], t = clamp((s - q.L0) / q.len), tx = (q.b[0] - q.a[0]) / q.len, tz = (q.b[1] - q.a[1]) / q.len; return { x: q.a[0] + (q.b[0] - q.a[0]) * t, z: q.a[1] + (q.b[1] - q.a[1]) * t, tx, tz, nx: -tz, nz: tx }; };
  const sideWalk = (R, p, side) => { const w = R.r.walk; return (side * (p.nx + p.nz) < 0 ? w[0] : w[1]) || 0; };
  const yawTo = (dx, dz) => Math.atan2(dx, dz);

  // ---------------------------------------------------------------- bamboo
  const bambooL = [], BZ = RING_ZONES.bamboo;
  {
    for (let z = BZ.z[0] + 0.25; z < BZ.z[1] - 0.2; z += 0.82) for (let x = BZ.x[0] + 0.3; x < BZ.x[1] - 0.15; x += 0.82) {
      const jx = x + rng.range(-0.34, 0.34), jz = z + rng.range(-0.34, 0.34);
      const edgeD = Math.min(jx - BZ.x[0], BZ.x[1] - jx, jz - BZ.z[0], BZ.z[1] - jz) + (vnoise(jx * 0.6 + 4, 3, jz * 0.6) - 0.5) * 1.3;   // the grove thins to single culms at its rim, unevenly, so the stems read
      const dens = (vnoise(jx * 0.42, 3, jz * 0.42) * 1.2 + 0.3) * lerp(0.1, 1, smooth(0, 2.2, edgeD));
      if (rng() > dens * 1.5 || inBuilding(jx, jz, 0.28)) continue;
      // irregular crown: tall and short patches, shorter at the rim, so the top edge is ragged
      const patch = clamp((vnoise(jx * 0.7 + 11, 9, jz * 0.7) - 0.22) / 0.56), H = lerp(0.66, 1.08, patch) * rng.range(0.88, 1.06) * lerp(0.78, 1, smooth(0, 2.2, edgeD)), tilt = rng.range(0.012, 0.075), az = rng() * TAU;
      bambooL.push({ pos: new V(jx, GS - 0.02, jz), quat: new THREE.Quaternion().setFromEuler(e0.set(Math.sin(az) * tilt, rng() * TAU, Math.cos(az) * tilt, 'YXZ')), sc: [H, H, H], out: new V(0, 1, 0), shade: (vnoise(jx * 0.9, 8, jz * 0.9) - 0.5) * 0.14, H, pivot: new V(jx, GS, jz), amp: rng.range(0.006, 0.013), ph: rng() * 6.28, f: rng.range(0.8, 1.3), color: new Color(1, 1, 1).lerp(C('#bcd7a0'), rng() < 0.12 ? 0.4 : rng() * 0.1), free: true });
    }
    const HT = 9.6, NODE = 8;
    // culm: open internodes, so each node is a hard dark line and the cel light runs down the jade skin
    const culmP = [], culmN = [], culmC = [], idx = [], bendAt = (u) => u * u * 1.5, rAt = (u) => lerp(0.085, 0.03, Math.pow(u, 0.8)), RAD = 4;
    const JADE = C('#3c8664'), JADE_HI = C('#86bc7d');
    for (let n = 0; n < NODE; n++) {
      const u0 = n / NODE, u1 = (n + 1) / NODE, ba = culmP.length / 3;
      for (const [u, c] of [[u0 + 0.004, JADE_HI], [u1, JADE]]) for (let j = 0; j < RAD; j++) { const a = (j / RAD) * TAU, r = rAt(u), cx = bendAt(u); culmP.push(cx + Math.cos(a) * r, u * HT, Math.sin(a) * r); culmN.push(Math.cos(a), 0, Math.sin(a)); culmC.push(c.r, c.g, c.b); }
      for (let j = 0; j < RAD; j++) { const a = ba + j, b = ba + (j + 1) % RAD, c = a + RAD, d = b + RAD; idx.push(a, c, b, b, c, d); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(culmP, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(culmN, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(culmC, 3)); g.setIndex(idx);
    const culmMat = ctx.toon({ vertexColors: true, dapple: true });
    const culmM = new THREE.InstancedMesh(g, culmMat, bambooL.length);
    culmM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    bambooL.forEach((c, i) => { dummy.position.copy(c.pos); dummy.quaternion.copy(c.quat); dummy.scale.set(...c.sc); dummy.updateMatrix(); culmM.setMatrixAt(i, dummy.matrix); culmM.setColorAt(i, c.color); });
    culmM.castShadow = false; culmM.receiveShadow = true; group.add(culmM);
    swayed(culmM, bambooL);
    // leaves: drooping fans on side branches up the top half
    const p = new Proto(), R = ctx.seeded('bamboo-leaf');
    for (let lv = 0; lv < 6; lv++) {
      const u = lerp(0.5, 1, lv / 5), y = u * HT;
      for (let b = 0; b < 2; b++) {
        const a = lv * 1.15 + b * Math.PI + R() * 0.5, len = lerp(1.05, 0.42, Math.pow(u, 1.6)) * R.range(0.85, 1.15), out = new V(Math.cos(a), 0, Math.sin(a)), o = new V(bendAt(u), y, 0);
        for (let k = 0; k < 3; k++) {
          const f = (k + 0.6) / 3, q = o.clone().addScaledVector(out, len * f).add(new V(0, 0.22 * f - 0.32 * f * f, 0)), shell = new V(out.x * 0.55, 0.8, out.z * 0.55).normalize();
          const tip = out.clone().multiplyScalar(R.range(0.3, 0.95)).add(new V(R.range(-0.5, 0.5), -R.range(0.3, 1), R.range(-0.5, 0.5))).normalize();
          // dark at the twig, lighter only toward the tips; the outermost sprays of the top levels take the light ramp
          p.spray(q, shell, tip, R.range(0.56, 0.82), OUT.blade, R.range(-0.05, 0.05) + (u - 0.7) * 0.1, u > 0.8 && k === 2 ? 1 : 0, 0.02, [0.62, 1.2]);
        }
      }
    }
    swayed(instMesh(bambooL, p.geometry(), FOL.bamboo, { dynamic: true }), bambooL);
    // a still caster for the moving grove: bamboo isn't in CANOPIES, so the gobo doesn't shade under it. Depth-only, nothing visible.
    const proxy = []; for (const c of bambooL) { for (const [uu, rr] of [[0.74, 1.05]]) proxy.push(kit.ico(rr * c.H, 0).translate(c.pos.x + bendAt(uu) * 0.5, uu * HT * c.H, c.pos.z)); proxy.push(kit.box(0.12, HT * c.H * 0.9, 0.12).translate(c.pos.x, HT * c.H * 0.45, c.pos.z)); }
    const proxyM = new THREE.Mesh(kit.merge(proxy), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })); proxyM.castShadow = true; group.add(ctx.noOutline(proxyM));
    // floor: old leaf-fall, shoots and a few dead, split culms lying where they came down, a yotsume fence along the east
    const LIT = ['#c9b56a', '#b49d5a', '#d8c47a', '#a39150'];
    for (let i = 0; i < 26; i++) { const x = rng.range(BZ.x[0] + 0.3, BZ.x[1] - 0.2), z = rng.range(BZ.z[0] + 0.3, BZ.z[1] - 0.2); if (inBuilding(x, z, 0.2)) continue; const h = rng.range(0.28, 0.7); statics.add(kit.cylBase(0.01, 0.075, h, 5), 'flat', { pos: [x, GS - 0.02, z], rot: [rng.range(-0.1, 0.1), rng() * 6, rng.range(-0.1, 0.1)], color: rng() < 0.5 ? '#8f7a56' : '#6e8452' }); }
    for (let i = 0; i < 7; i++) { const a = rng() * TAU, L = rng.range(3.2, 5.8), x = rng.range(BZ.x[0] + 1.2, BZ.x[1] - 1.2), z = rng.range(BZ.z[0] + 1.2, BZ.z[1] - 1.2), tx = x + Math.cos(a) * L, tz = z + Math.sin(a) * L; if (!inRect(BZ, tx, tz, -0.2)) continue; statics.add(kit.tube([[x, 0.13, z], [lerp(x, tx, 0.5), 0.24 + rng.range(0, 0.3), lerp(z, tz, 0.5)], [tx, 0.1, tz]], 0.075, 0.035, 5, 8), 'flat', { color: rng.pick(LIT) }); }
    for (let z = BZ.z[0] + 0.5; z < BZ.z[1] - 0.2; z += 1.6) { const x = BZ.x[1] + 0.1 + rng.range(-0.06, 0.06), tilt = rng.range(-0.07, 0.07); statics.add(kit.cylBase(0.06, 0.07, 1.25, 6), 'flat', { pos: [x, GS - 0.04, z], rot: [0, 0, tilt], color: '#b89a6a' }); }
    for (const h of [0.45, 0.8, 1.12]) statics.add(kit.tube([[BZ.x[1] + 0.1, h, BZ.z[0] + 0.45], [BZ.x[1] + 0.13, h - 0.08, lerp(BZ.z[0], BZ.z[1], 0.5)], [BZ.x[1] + 0.09, h + 0.03, BZ.z[1] - 0.25]], 0.04, 0.04, 5, 20), 'flat', { color: '#c0a16a' });
  }

  // ---------------------------------------------------------------- hedges, bushes, verges
  const hedgeL = [], tuftL = [], rodL = [];
  const bushAt = (x, z, r, h, ground = GS, tone = 0) => { hedgeL.push({ pos: new V(x, ground + h * 0.5, z), quat: quatY(rng() * TAU), sc: [r, h * 0.62, r], out: new V(rng.range(-0.2, 0.2), 1, rng.range(-0.2, 0.2)).normalize(), shade: tone + rng.range(-0.03, 0.03), color: new Color(1, 1, 1).multiplyScalar(rng.range(0.92, 1.06)) }); };
  const tuftAt = (x, z, s, kind = 0, ground = GS) => { (kind ? rodL : tuftL).push({ pos: new V(x, ground - 0.01, z), quat: quatY(rng() * TAU, rng.range(-0.08, 0.08), rng.range(-0.08, 0.08)), sc: [s, s * rng.range(0.8, 1.25), s], out: new V(0, 1, 0), shade: rng.range(-0.06, 0.06), color: new Color(1, 1, 1).multiplyScalar(rng.range(0.92, 1.06)), pivot: new V(x, ground, z), amp: rng.range(0.03, 0.07), ph: rng() * 6.28, f: rng.range(1, 1.8), free: true }); };
  for (const R of roads) for (const side of [-1, 1]) {
    let s = rng.range(0, 3);
    while (s < R.L - 0.5) {
      const run = rng.range(2.4, 7.5), gap = rng.range(1.4, 6.5);
      if (rng() < 0.44) for (let u = 0; u < run; u += rng.range(1.05, 1.4)) {
        const p = roadAt(R, s + u), off = R.r.w / 2 + sideWalk(R, p, side) + rng.range(0.55, 0.95), x = p.x + p.nx * side * off, z = p.z + p.nz * side * off;
        if (hedgeOK(x, z)) { const h = rng.range(0.75, 1.3); hedgeL.push({ pos: new V(x, GS + h * 0.42, z), quat: quatY(yawTo(p.tx, p.tz) + rng.range(-0.18, 0.18), rng.range(-0.05, 0.05), rng.range(-0.05, 0.05)), sc: [rng.range(0.55, 0.78), h * 0.6, rng.range(0.8, 1.02)], out: new V(side * p.nx * 0.3, 1, side * p.nz * 0.3).normalize(), shade: rng.range(-0.08, 0.04), color: new Color(1, 1, 1).multiplyScalar(rng.range(0.92, 1.06)) }); }
      }
      s += run + gap;
    }
    for (let u = rng.range(0, 1); u < R.L; u += rng.range(1.5, 3.0)) {
      const p = roadAt(R, u), off = R.r.w / 2 + sideWalk(R, p, side) + rng.range(0.08, 0.85), x = p.x + p.nx * side * off, z = p.z + p.nz * side * off;
      if (hedgeOK(x, z)) tuftAt(x, z, rng.range(0.85, 1.35), rng() < 0.14 ? 1 : 0);
    }
  }
  // the scrub lot: a vacant plot going back to bushes, goldenrod and young trees
  {
    const Z = RING_ZONES.scrub, W = Z.x[1] - Z.x[0], DD = Z.z[1] - Z.z[0];
    for (let i = 0; i < 14; i++) { const x = Z.x[0] + 0.5 + rng() * (W - 1), z = Z.z[0] + 0.6 + rng() * (DD - 1.2), r = rng.range(0.7, 1.2), h = rng.range(0.9, 1.6), m = rng.int(1, 3); for (let k = 0; k < m; k++) { const a = rng() * TAU; bushAt(x + (k ? Math.cos(a) * r * 0.65 : 0), z + (k ? Math.sin(a) * r * 0.65 : 0), r * rng.range(0.7, 1), h * rng.range(0.8, 1), GS, rng.range(-0.05, 0.05)); } }
    for (let i = 0; i < 22; i++) { const x = Z.x[0] + 0.3 + rng() * (W - 0.6), z = Z.z[0] + 0.3 + rng() * (DD - 0.6); tuftAt(x, z, rng.range(1, 1.5), rng() < 0.42 ? 1 : 0); }
    const SAPS = 7, kinds = ['zelkova', 'camphor', 'cherry', 'zelkova', 'persimmon', 'camphor', 'cherry'];
    for (let i = 0; i < SAPS; i++) {
      const u = (i + 0.5) / SAPS, x = lerp(Z.x[0] + 0.7, Z.x[1] - 0.7, rng()), z = lerp(Z.z[0] + 0.8, Z.z[1] - 0.8, u) + rng.range(-0.5, 0.5), H = rng.range(2.6, 4.4), lean = [rng.range(-0.1, 0.1), rng.range(-0.1, 0.1)], kind = kinds[i];
      const a = new V(x, GS - 0.2, z), m = new V(x + lean[0] * H * 0.5, H * 0.55, z + lean[1] * H * 0.5), e = new V(x + lean[0] * H, H, z + lean[1] * H);
      bark.tube([a, m, e], [0.09, 0.03], { pal: BARK[kind], g: GS, radial: 4, step: 0.9, moss: -0.2 });
      const nC = rng.int(2, 3);
      for (let k = 0; k < nC; k++) { const b = k * 2.1 + rng() * 2, o = k ? rng.range(0.4, 0.75) : 0, c = new V(e.x + Math.cos(b) * o, e.y + (k ? -rng.range(0.1, 0.6) : 0.1), e.z + Math.sin(b) * o), rc = rng.range(0.62, 0.88); clumps[kind].push({ pos: c, quat: quatY(rng() * TAU, rng.range(-0.2, 0.2), rng.range(-0.2, 0.2)), sc: [rc, rc * 0.82, rc], out: new V(rng.range(-0.3, 0.3), 1, rng.range(-0.3, 0.3)).normalize(), shade: rng.range(-0.04, 0.05), pivot: m.clone(), amp: 0.05, free: true, ph: rng() * 6.28, f: rng.range(1, 1.5), color: C('#ffffff') }); }
    }
    // the old plot's edge: leaning rusted posts, a line of sagging wire, a faded land-for-sale board. Keeps off the rail shoulder
    const pEdge = []; for (let z = Z.z[0] + 0.5; z < Z.z[1]; z += 2.4) pEdge.push([Z.x[0] + 0.28 + rng.range(-0.08, 0.08), z, rng.range(-0.11, 0.11), rng.range(-0.1, 0.1)]);
    for (const [x, z, a, b] of pEdge) statics.add(kit.cylBase(0.035, 0.05, 1.2, 5), 'flat', { pos: [x, GS - 0.1, z], rot: [a, 0, b], color: P.rust });
    for (let i = 0; i + 1 < pEdge.length; i++) { const A = pEdge[i], B = pEdge[i + 1]; for (const h of [0.55, 0.92]) statics.add(kit.tube([[A[0], h, A[1]], [(A[0] + B[0]) / 2, h - 0.14, (A[1] + B[1]) / 2], [B[0], h, B[1]]], 0.012, 0.012, 3, 6), 'flat', { color: P.metalDark }); }
    const sx = Z.x[0] + 0.55, sz = lerp(Z.z[0], Z.z[1], 0.62), board = ctx.canvasTexture(128, 160, (g, w, h) => { g.fillStyle = '#e8e0cf'; g.fillRect(0, 0, w, h); g.fillStyle = '#b5522f'; g.fillRect(6, 6, w - 12, 32); g.fillStyle = '#efe7d4'; g.font = 'bold 26px sans-serif'; g.textAlign = 'center'; g.fillText('売 地', w / 2, 32); g.fillStyle = '#4a5a64'; g.font = 'bold 20px sans-serif'; g.fillText('現 況', w / 2, 74); g.font = '15px sans-serif'; g.fillText('空 地 ・ 要 相 談', w / 2, 104); g.fillStyle = 'rgba(120,110,90,.4)'; g.fillRect(14, 120, w - 28, 8); g.fillRect(14, 136, w - 50, 6); });
    statics.add(kit.box(0.9, 1.15, 0.03), ctx.toon({ map: board, color: '#ffffff' }), { pos: [sx, 1.45, sz], rot: [0.02, 1.1, 0.06] });
    for (const dx of [-0.32, 0.34]) statics.add(kit.cylBase(0.04, 0.05, 1.6, 5), 'flat', { pos: [sx + dx * 0.45, GS - 0.05, sz + dx * 0.9], rot: [0, 0, 0.06], color: '#8b6d4a' });
  }

  // ---------------------------------------------------------------- utility poles and wires
  const cable = '#2b3a42', comm = '#1f2a30', STEM = C('#d4d2c6');
  /** One pole, base at the origin, crossarm along local x, in the same language as street.js's pole. */
  function poleGeo(withTr) {
    const parts = [], add = (g, c, o = {}) => { const q = g.index ? g.toNonIndexed() : g; q.applyMatrix4(kit.xf(o)); const col = new Color(c), a = new Float32Array(q.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) { a[i] = col.r; a[i + 1] = col.g; a[i + 2] = col.b; } q.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(q); };
    const H = POLE.H; add(kit.cylBase(0.092, 0.17, H, 8), STEM, { pos: [0, -0.3, 0] }); add(kit.cylBase(0.32, 0.38, 0.1, 7), P.concreteMid, { pos: [0, -0.04, 0] });
    add(kit.sphere(0.1, 6, 4), '#9a9c95', { pos: [0, H - 0.3, 0], scale: [1, 0.6, 1] });
    for (let k = 0; k < 5; k++) add(kit.cylBase(0.178 + k * -0.004, 0.182 + k * -0.004, 0.3, 8, true), k % 2 ? '#2f2a26' : P.flowerYellow, { pos: [0, 0.1 + k * 0.3, 0] });
    for (const y of [3.1, 4.8, 6.2]) add(kit.cylBase(0.15 - y * 0.008, 0.15 - y * 0.008, 0.03, 8), '#a9aba4', { pos: [0, y, 0] });
    for (let i = 0; i < 6; i++) { const a = i % 2 ? 2.4 : -0.4, y = 2.8 + i * 0.68, r = 0.17 - (y / H) * 0.08; add(kit.box(0.2, 0.024, 0.024), P.rust, { pos: [Math.cos(a) * (r + 0.09), y, Math.sin(a) * (r + 0.09)], rot: [0, -a, 0] }); }
    const arm = (y, L, ins, tiltZ) => {
      add(kit.box(L, 0.08, 0.095), '#7e8c86', { pos: [0, y, 0], rot: [0, 0, tiltZ] });
      add(kit.box(L * 0.98, 0.013, 0.115), '#677572', { pos: [0, y + 0.045, 0], rot: [0, 0, tiltZ] });
      for (const s of [-1, 1]) add(kit.box(0.42, 0.02, 0.02), P.rust, { pos: [s * L * 0.2, y - 0.17, 0.05], rot: [0, 0, s * 0.9] });
      for (const px of ins) add(kit.cylBase(0.042, 0.062, 0.16, 5, true), '#ece7d7', { pos: [px, y + 0.03, 0] });
    };
    arm(POLE.y1, 2.1, [-0.9, 0, 0.9], 0.03); arm(POLE.y2, 1.5, [-0.6, 0.6], -0.06);
    add(kit.box(0.16, 0.05, 0.05), P.metalDark, { pos: [0.11, POLE.yC, POLE.zC] });
    if (withTr) {
      const y = POLE.yT; add(kit.cylBase(0.27, 0.27, 0.86, 9), '#8fa09a', { pos: [0.36, y, 0] }); add(kit.cylBase(0.3, 0.3, 0.04, 9), P.metalDark, { pos: [0.36, y + 0.84, 0] });
      add(kit.cylBase(0.05, 0.3, 0.1, 9), '#7a8a84', { pos: [0.36, y + 0.88, 0] }); add(kit.cylBase(0.285, 0.285, 0.05, 9), P.rust, { pos: [0.36, y + 0.05, 0] });
      for (let i = 0; i < 5; i++) { const a = (i / 5) * 3.1 + 1.6; add(kit.box(0.03, 0.62, 0.04), '#7a8a84', { pos: [0.36 + Math.cos(a) * 0.285, y + 0.42, Math.sin(a) * 0.285], rot: [0, -a, 0] }); }
      add(kit.box(0.5, 0.05, 0.05), P.metalDark, { pos: [0.14, y + 0.45, 0] });
      for (const dx of [-0.12, 0.12]) add(kit.cylBase(0.03, 0.05, 0.14, 5), '#ece7d7', { pos: [0.36 + dx, y + 0.95, 0] });
    }
    return kit.merge(parts);
  }
  const POLE = { H: 8.2, y1: 7.5, y2: 6.72, yC: 5.55, zC: 0.16, yT: 5.2, armW: [[-0.9, 0.15], [0, 0.15], [0.9, 0.15]], armL: [[-0.6, 0.15], [0.6, 0.15]] };
  const poleMat = ctx.toon({ vertexColors: true, moss: 0.3 });
  const poles = [], poleKeyOf = (x, z) => `${x.toFixed(1)},${z.toFixed(1)}`;
  const clearPoleTop = (x, z) => !inBuilding(x, z, 0.5);
  for (const R of roads) {
    const pref = rng.sign(), list = [];
    for (let s = rng.range(2.5, 5); s < R.L - 2; s += rng.range(10.5, 14)) {
      let placed = null;
      for (const ds of [0, 1.2, -1.2, 2.4, -2.4, 3.6, -3.6, 5]) { for (const side of [pref, -pref]) {
        const p = roadAt(R, clamp(s + ds, 0.5, R.L - 0.5)), w = sideWalk(R, p, side), off = R.r.w / 2 + (w ? 0.3 : rng.range(0.35, 0.7)), x = p.x + p.nx * side * off, z = p.z + p.nz * side * off;
        if (!free(x, z, 0.65, { road: false, edge: 1.2 })) continue;
        if (roadDist(x, z, R.r) < 0.2 || RING_ROADS.some((o) => o !== R.r && roadDist(x, z, o) < 0.3)) continue;
        const lean = rng() < 0.16 ? rng.range(0.1, 0.2) : rng.range(0.02, 0.075), la = rng() * TAU, yaw = Math.atan2(-p.nz, p.nx) + rng.range(-0.05, 0.05);
        const m = new THREE.Matrix4().compose(new V(x, w ? 0.12 : GS, z), new THREE.Quaternion().setFromAxisAngle(new V(Math.cos(la), 0, Math.sin(la)), lean).multiply(new THREE.Quaternion().setFromAxisAngle(new V(0, 1, 0), yaw)), new V(1, 1, 1));
        const top = new V(0, POLE.H, 0).applyMatrix4(m); if (!clearPoleTop(top.x, top.z) || Math.max(Math.abs(top.x), Math.abs(top.z)) > BASE.half - 0.4 || !free(top.x, top.z, 0.3, { road: false, edge: 0.3 })) continue;
        if (list.some((q) => Math.hypot(q.x - x, q.z - z) < 7)) continue;
        placed = { x, z, m, R, side }; break;
      } if (placed) break; }
      if (placed) list.push(placed);
    }
    poles.push(...list); R.poles = list;
  }
  const trOK = (p, i) => ((i * 7 + 2) % 3 === 0);
  const poleAB = [poles.filter((p, i) => !trOK(p, i)), poles.filter(trOK)];
  poleAB.forEach((list, tr) => { if (!list.length) return; const m = new THREE.InstancedMesh(poleGeo(!!tr), poleMat, list.length); list.forEach((p, i) => m.setMatrixAt(i, p.m)); m.castShadow = true; m.receiveShadow = true; group.add(m); });
  poles.forEach((p, i) => { p.tr = trOK(p, i); p.w = (a, c) => new V(a[0], c[0], c[1]).applyMatrix4(p.m); });
  const anchors = (p) => [p.w([-0.9], [POLE.y1 + 0.17, 0]), p.w([0], [POLE.y1 + 0.17, 0]), p.w([0.9], [POLE.y1 + 0.17, 0]), p.w([-0.6], [POLE.y2 + 0.17, 0]), p.w([0.6], [POLE.y2 + 0.17, 0]), p.w([0.22], [POLE.yC, POLE.zC])];
  const wireSeg = 10, wireTube = (a, b, sag, r = 0.024, seg = wireSeg, col = cable) => { const pts = []; for (let i = 0; i <= seg; i++) { const u = i / seg; pts.push(new V(lerp(a.x, b.x, u), lerp(a.y, b.y, u) - sag * 4 * u * (1 - u), lerp(a.z, b.z, u))); } statics.add(kit.tube(pts, r, r, 3, seg), 'flat', { color: col }); return pts; };
  const wiresHit = (a, b) => { for (let i = 1; i < 12; i++) { const u = i / 12, x = lerp(a.x, b.x, u), z = lerp(a.z, b.z, u), y = lerp(a.y, b.y, u); if (BUILDINGS.some((q) => { const r = buildingBox(q, 0.1); return x > r.x[0] && x < r.x[1] && z > r.z[0] && z < r.z[1] && y < q.elev + q.h + 1.2; })) return true; if (WOODS.some((t) => Math.hypot(x - t.x, z - t.z) < t.trunkR + 0.3)) return true; } return false; };
  const vineLeaves = [], curtains = [], VINE = C(P.ivy);
  const vineAdd = (p, n, s = 1, kind = 0) => vineLeaves.push({ pos: p.clone(), quat: new THREE.Quaternion().setFromUnitVectors(new V(0, 1, 0), n.clone().normalize()).multiply(quatY(rng() * TAU)), sc: [s, s, s], out: n.clone().normalize(), shade: rng.range(-0.05, 0.06), color: new Color(1, 1, 1), kind });
  const curtainAdd = (p, len) => curtains.push({ pos: p.clone(), quat: quatY(rng() * TAU), sc: [rng.range(0.85, 1.2), len, rng.range(0.85, 1.2)], out: new V(rng.range(-0.3, 0.3), 0.8, rng.range(-0.3, 0.3)).normalize(), shade: rng.range(-0.1, 0.05), pivot: p.clone(), amp: 0.09, ph: rng() * 6.28, f: rng.range(1.1, 1.8), free: true, color: new Color(1, 1, 1) });
  /** Span between two poles: three on the top arm, two on the lower arm, the comm cable below them. Each span is one of: whole, one wire down, two down, or vine-laced. */
  function span(a, b) {
    const A = anchors(a), B = anchors(b), L = Math.hypot(a.x - b.x, a.z - b.z), roll = rng(), down = new Set(); if (roll < 0.27) { down.add(rng.pick([0, 2])); if (roll < 0.09) down.add(rng.pick([4, 5])); }
    for (const k of [0, 2, 4, 5]) {
      const a0 = A[k], b0 = B[k], sag = (k === 5 ? 0.075 : 0.05) * L * rng.range(0.85, 1.25);
      if (k === 5 && rng() < 0.18) continue;   // the comm cable is often just gone
      if (wiresHit(a0, b0)) continue;
      if (down.has(k)) { dropWire(a0, b0, L, k); continue; }
      const pts = wireTube(a0, b0, sag, k === 5 ? 0.034 : 0.024, wireSeg, k === 5 ? comm : cable);
      if (k === 0 && a.vine && rng() < 0.6) laceWire(pts, a, L);   // vines reach along the outer top wire
    }
    return true;
  }
  /** A wire let go at one end: it hangs from the good pole to the ground, then lies in the verge in a loose coil, and a vine has climbed it. */
  function dropWire(a0, b0, L, k) {
    const d = new V().subVectors(b0, a0).setY(0).normalize(), n = new V(-d.z, 0, d.x), side = rng.sign(); let far = null;
    for (let tries = 0; tries < 8 && !far; tries++) { const u = rng.range(0.4, 0.78), q = new V(lerp(a0.x, b0.x, u) + n.x * side * rng.range(0.5, 1.8), GS, lerp(a0.z, b0.z, u) + n.z * side * rng.range(0.5, 1.8)); if (free(q.x, q.z, 0.15, { road: false, edge: 1 })) far = q; }
    if (!far) { wireTube(a0, b0, 0.05 * L); return; }
    const mid = new V().lerpVectors(a0, far, 0.5); mid.y = Math.max(a0.y * 0.38, 2.4);
    const curve = new THREE.CatmullRomCurve3([a0, new V().lerpVectors(a0, mid, 0.5).setY(lerp(a0.y, mid.y, 0.62)), mid, new V().lerpVectors(mid, far, 0.7).setY(0.3), far.clone().add(new V(d.x * 0.02, 0.07, d.z * 0.02)), far.clone().add(new V(d.x * 0.5 + n.x * 0.2, 0.07, d.z * 0.5 + n.z * 0.2))], false, 'centripetal');
    cStats.dropped++;
    const pts = curve.getPoints(12); statics.add(kit.tube(pts, 0.024, 0.024, 3, 12), 'flat', { color: cable });
    const end = pts[pts.length - 1], cpts = Array.from({ length: 9 }, (_, i) => new V(end.x + Math.cos(i * 1.4) * (0.06 + i * 0.03), 0.09, end.z + Math.sin(i * 1.4) * (0.06 + i * 0.03)));
    statics.add(kit.tube([end, ...cpts], 0.03, 0.022, 3, 10), 'flat', { color: cable });
    for (let i = 2; i < pts.length; i += 2) { const p = pts[i], t = pts[Math.min(i + 1, pts.length - 1)].clone().sub(pts[i - 1]).normalize(), nn = new V(rng() - 0.5, 0.6, rng() - 0.5).cross(t).normalize(); vineAdd(p.clone().addScaledVector(nn, 0.1), nn, rng.range(0.85, 1.25), rng() < 0.12 ? 1 : 0); }
    tuftAt(end.x, end.z, 1.1, 0);
  }
  function laceWire(pts, a, L) {
    for (let i = 1; i < pts.length - 1; i += 1) { if (rng() < 0.55) { const p = pts[i], t = pts[i + 1].clone().sub(pts[i - 1]).normalize(), nn = new V(rng() - 0.5, 0.2 + rng(), rng() - 0.5).cross(t).normalize(); vineAdd(p.clone().addScaledVector(nn, 0.07), nn, rng.range(0.75, 1.15)); } }
    for (let i = 2; i < pts.length - 1; i += 3) if (rng() < 0.6) curtainAdd(pts[i].clone().add(new V(0, -0.02, 0)), rng.range(0.9, 2.6));
  }
  // vines climb a share of the poles, a few are smothered in kudzu
  poles.forEach((p, i) => {
    const r = rng(); p.vine = r < 0.62; p.kudzu = r < 0.2;
    if (!p.vine) return;
    const up = new V(0, 1, 0).transformDirection(p.m).normalize(), base = new V(0, 0, 0).applyMatrix4(p.m), h = p.kudzu ? rng.range(6.4, 7.6) : rng.range(3, 6.6), turns = h * 0.55, ph = rng() * TAU, pts = [];
    for (let k = 0; k <= 20; k++) { const u = k / 20, a = ph + u * turns * TAU, y = u * h, r0 = 0.2 - (y / POLE.H) * 0.09; pts.push(new V(Math.cos(a) * r0, y, Math.sin(a) * r0).applyMatrix4(p.m)); if (k && k % 2 === 0) { const n = new V(Math.cos(a), 0.3, Math.sin(a)).transformDirection(p.m); vineAdd(pts[k].clone().addScaledVector(n, 0.05), n, rng.range(0.78, 1.2), rng() < 0.1 ? 1 : 0); } }
    statics.add(kit.tube(pts, 0.04, 0.02, 3, 20), 'flat', { color: P.mossDeep });
    if (p.kudzu) { for (let k = 0, y = 0.7; k < 7 && y < h + 0.2; k++, y += rng.range(0.7, 1.15)) { const a = k * 2.4 + rng() * 1.2, o = rng.range(0.16, 0.42), c = base.clone().addScaledVector(up, y).add(new V(Math.cos(a) * o, 0, Math.sin(a) * o)), rr = rng.range(0.56, 0.86) * lerp(1.2, 0.7, k / 6), ry = rr * rng.range(1.15, 1.6); hedgeL.push({ pos: c, quat: quatY(rng() * TAU, rng.range(-0.15, 0.15), rng.range(-0.15, 0.15)), sc: [rr, ry, rr], out: new V(Math.cos(a), 0.4, Math.sin(a)).normalize(), shade: rng.range(-0.1, 0.08), color: new Color(1, 1, 1).lerp(VINE, 0.1) }); } for (let k = 0; k < 4; k++) { const a = rng() * TAU; curtainAdd(base.clone().addScaledVector(up, h - rng.range(0, 1)).add(new V(Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6)), rng.range(1, 1.9)); } }
  });
  for (const R of roads) { const list = R.poles || []; for (let i = 0; i + 1 < list.length; i++) span(list[i], list[i + 1]); }
  // junctions: the first pole of each road picks up from the nearest pole on another road
  for (const R of roads) { const list = R.poles || []; if (!list.length) continue; for (const p of [list[0], list[list.length - 1]]) { let best = null, bd = 18; for (const q of poles) { if (q.R === R) continue; const d = Math.hypot(p.x - q.x, p.z - q.z); if (d > 4 && d < bd) { bd = d; best = q; } } if (best && rng() < 0.75) span(p, best); } }
  // service drops: a thin line from some poles to the nearest eave
  for (const p of poles) {
    if (rng() > 0.5) continue;
    let best = null, bd = 6.5; for (const b of BUILDINGS) { const r = buildingBox(b, 0), cx = clamp(p.x, r.x[0], r.x[1]), cz = clamp(p.z, r.z[0], r.z[1]), d = Math.hypot(cx - p.x, cz - p.z); if (d > 0.4 && d < bd) { bd = d; best = { b, cx, cz }; } }
    if (!best) continue;
    const a = anchors(p)[5], e = new V(best.cx + (best.cx - p.x) * 0.02, best.b.elev + best.b.h * rng.range(0.56, 0.7), best.cz + (best.cz - p.z) * 0.02);
    wireTube(a, e, 0.06 * Math.hypot(a.x - e.x, a.z - e.z), 0.018, 8, comm);
  }

  // ---------------------------------------------------------------- petals on the ground, a few falling; persimmons underfoot
  const petalGeo = (() => { const p = new Proto(); const n = new V(0, 1, 0); p.spray(new V(0, 0, 0), n, new V(1, 0, 0.2).normalize(), 0.09, OUT.lance, 0, 0, 0.1, [1, 1]); return p.geometry(); })();
  const bloomers = trees.filter((t) => t.T.kind === 'cherry' && t.bloom);
  const PETAL = kit.leaf(0.11, 0.08, 0.05);
  for (const tr of bloomers) { const L = tr.LOBES[0]; for (let i = 0; i < 200; i++) { const a = rng() * TAU, r = Math.sqrt(rng()) * L.r * 1.05, x = L.c.x + Math.cos(a) * r, z = L.c.z + Math.sin(a) * r; if (!free(x, z, 0, { road: false, edge: 0.6 })) continue; statics.add(PETAL, 'flat', { pos: [x, GS + 0.018 + (rng() * 0.012), z], rot: [0, rng() * 6, 0], color: rng.pick(['#ffe4ef', '#ffc6dd', '#f7b8d2', '#ffd9e8']) }); } }
  for (const tr of trees.filter((t) => t.T.kind === 'persimmon')) for (let i = 0; i < 11; i++) { const a = rng() * TAU, r = rng.range(0.8, 2.2) * tr.s, x = tr.T.x + Math.cos(a) * r, z = tr.T.z + Math.sin(a) * r; if (free(x, z, 0, { road: false, edge: 0.6 })) statics.add(kit.sphere(0.17, 6, 4), 'flat', { pos: [x, GS + 0.1, z], scale: [1, 0.74, 1], color: rng() < 0.4 ? '#a85030' : '#f08a30' }); }
  const FALL = []; for (const tr of bloomers) { const L = tr.LOBES[0]; for (let i = 0; i < 18; i++) { const a = rng() * TAU, r = rng.range(0.4, 1) * L.r; FALL.push({ x: L.c.x + Math.cos(a) * r, z: L.c.z + Math.sin(a) * r, top: L.c.y - L.ry * rng.range(0, 0.9), bot: tr.g, per: rng.range(7, 13), ph: rng() * 20, dx: rng.range(-1.8, -0.5), dz: rng.range(0.2, 1.6), w: rng.range(1.4, 2.4), spin: rng.range(1.4, 2.6) }); } }
  const fallMesh = FALL.length ? new THREE.InstancedMesh(petalGeo.clone().deleteAttribute('aShell'), ctx.toon({ color: '#ffffff', side: THREE.DoubleSide, vertexColors: true, dapple: false, translucent: 0.45 }), FALL.length) : null;
  if (fallMesh) { fallMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); fallMesh.frustumCulled = false; fallMesh.castShadow = false; fallMesh.receiveShadow = false; const pc = [C('#ffe4ef'), C('#ffc6dd'), C('#f7b8d2')]; FALL.forEach((_, i) => fallMesh.setColorAt(i, pc[i % 3])); ctx.softEdge(fallMesh); group.add(fallMesh); }
  const fallDummy = new THREE.Object3D();

  // ---------------------------------------------------------------- the low planting's instance meshes
  const LEAFG = (() => { const p = new Proto(), up = new V(0, 1, 0); p.spray(new V(0, 0, 0), up, new V(1, 0, 0), 0.34, OUT.broad, 0, 0, 0.06); p.spray(new V(0, 0, 0), up, new V(-0.5, 0, 0.8).normalize(), 0.28, OUT.broad, 0, 0, 0.06); return p.geometry(); })();
  // kind per instance: ivy turned red on a few, by a tweak of the leaf ramp attribute (kept simple: per-instance aKind copies)
  if (vineLeaves.length) { const g = LEAFG.clone(); g.setAttribute('aKind', LEAFG.attributes.aKind); instMesh(vineLeaves, g, FOL.ivy, { receive: false }); }
  const CURTAIN = (() => { const p = new Proto(), R = ctx.seeded('curtain'), up = new V(0.2, 0.5, 0.2).normalize(); for (let k = 0; k < 14; k++) { const y = -k / 13, a = k * 2.3, out = new V(Math.cos(a), 0, Math.sin(a)); p.spray(new V(out.x * 0.05, y, out.z * 0.05), out.clone().add(up).normalize(), new V(out.x * 0.5, -0.9, out.z * 0.5).normalize(), R.range(0.22, 0.32), OUT.broad, R.range(-0.04, 0.05) + (y + 0.5) * 0.06, 0, 0.06); } return p.geometry(); })();
  swayed(instMesh(curtains, CURTAIN, FOL.ivy, { dynamic: true }), curtains);
  if (hedgeL.length) instMesh(hedgeL, PROTO.hedge(), FOL.hedge, {});
  const TUFT = (() => { const p = new Proto(), R = ctx.seeded('tuft'); for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU + R(), L = R.range(0.46, 1), out = new V(Math.cos(a) * 0.5, 0.9, Math.sin(a) * 0.5).normalize(), v = new V(Math.cos(a) * R.range(0.04, 0.12), 0, Math.sin(a) * R.range(0.04, 0.12)); const s = new V(out.x * 0.9, 0.9, out.z * 0.9).normalize(), w = R.range(0.1, 0.17); const base = p.pos.length / 3; p.vert(v.clone().add(new V(-w * Math.sin(a), 0, w * Math.cos(a))), 0.72, s, 0, 0); p.vert(v.clone().add(new V(w * Math.sin(a), 0, -w * Math.cos(a))), 0.72, s, 0, 0); p.vert(v.clone().addScaledVector(out, L).add(new V(0, 0.16, 0)), 1.08, s, R.range(-0.03, 0.05), R() < 0.1 ? 0 : 0); p.vert(v.clone().add(new V(Math.cos(a) * 0.2, L * 0.55, Math.sin(a) * 0.2)), 1.0, s, 0, 0); p.idx.push(base, base + 1, base + 3, base, base + 3, base + 2, base + 1, base + 2, base + 3); } return p.geometry(); })();
  swayed(instMesh(tuftL, TUFT, FOL.grass, { dynamic: true, receive: true }), tuftL);
  const GOLDEN = (() => { const p = new Proto(), R = ctx.seeded('goldenrod'); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + R(), L = R.range(0.9, 1.6), out = new V(Math.cos(a) * 0.32, 1, Math.sin(a) * 0.32).normalize(), v0 = new V(Math.cos(a) * R.range(0.02, 0.07), 0, Math.sin(a) * R.range(0.02, 0.07)), side = new V(-Math.sin(a), 0, Math.cos(a)); const base = p.pos.length / 3, top = v0.clone().addScaledVector(out, L); p.vert(v0.clone().addScaledVector(side, 0.035), 0.8, out, 0, 0); p.vert(v0.clone().addScaledVector(side, -0.035), 0.8, out, 0, 0); p.vert(top.clone().addScaledVector(side, 0.02), 1, out, 0, 0); p.vert(top.clone().addScaledVector(side, -0.02), 1, out, 0, 0); p.idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2); for (let k = 0; k < 5; k++) { const u = lerp(0.6, 1, k / 4), q = v0.clone().addScaledVector(out, L * u).add(new V(side.x * (k % 2 ? 0.18 : -0.18) * (1 - u + 0.4), 0, side.z * (k % 2 ? 0.18 : -0.18) * (1 - u + 0.4))); p.spray(q, new V(side.x, 1, side.z).normalize(), new V(out.x, 0.8, out.z).add(new V(side.x * (k % 2 ? 1 : -1) * 0.9, 0, side.z * (k % 2 ? 1 : -1) * 0.9)).normalize(), R.range(0.22, 0.3), OUT.lance, R.range(-0.03, 0.06), 1, 0.02, [1, 1.08]); } } return p.geometry(); })();
  swayed(instMesh(rodL, GOLDEN, FOL.gold, { dynamic: true, receive: true }), rodL);

  const fallUpdate = (t) => {
    if (!fallMesh) return;
    for (let i = 0; i < FALL.length; i++) {
      const f = FALL[i], u = ((t + f.ph) % f.per) / f.per, e = u * u * 0.3 + u * 0.7;
      fallDummy.position.set(f.x + f.dx * e * 2 + Math.sin(t * f.w * 0.5 + f.ph) * 0.4, lerp(f.top, f.bot, e), f.z + f.dz * e * 2 + Math.cos(t * f.w * 0.4 + f.ph) * 0.3);
      fallDummy.rotation.set(Math.sin(t * f.spin) * 1.1, t * f.spin * 0.7, Math.cos(t * f.spin * 0.8) * 0.9);
      fallDummy.scale.setScalar(smooth(0, 0.07, u) * (1 - smooth(0.93, 1, u)) + 1e-4); fallDummy.updateMatrix(); fallMesh.setMatrixAt(i, fallDummy.matrix);
    }
    fallMesh.instanceMatrix.needsUpdate = true;
  };

  // ---------------------------------------------------------------- assemble
  for (const key of Object.keys(clumps)) swayed(instMesh(clumps[key], key === 'cedar' ? cedarProto(54, 0.58) : PROTO[key](), FOL[key], { dynamic: true }), clumps[key]);
  group.add(bark.mesh(barkMat));
  group.add(statics.build());
  const windT = new Float32Array(trees.length);
  /** Rigid sway of every instance about its own pivot, written straight into the instance buffer (small-angle rotation: a few degrees at most). */
  const swayAll = (t) => {
    for (let i = 0; i < trees.length; i++) windT[i] = ctx.wind(t, trees[i].T.x, trees[i].T.z);
    for (const { m, list, base } of swayMeshes) {
      const a = m.instanceMatrix.array;
      for (let i = 0; i < list.length; i++) {
        const c = list[i], o = i * 16, w = c.free ? ctx.wind(t, c.pivot.x, c.pivot.z) : windT[c.tree], w2 = Math.sin(t * c.f + c.ph) * 0.3, ax = (w * 0.7 + w2) * c.amp, az = (-w + w2 * 0.6) * c.amp, px = c.pivot.x, py = c.pivot.y, pz = c.pivot.z;
        for (let k = 0; k < 3; k++) { const x = base[o + k * 4], y = base[o + k * 4 + 1], z = base[o + k * 4 + 2]; a[o + k * 4] = x - az * y; a[o + k * 4 + 1] = az * x + y - ax * z; a[o + k * 4 + 2] = ax * y + z; }
        const x = base[o + 12] - px, y = base[o + 13] - py, z = base[o + 14] - pz; a[o + 12] = px + x - az * y; a[o + 13] = py + az * x + y - ax * z; a[o + 14] = pz + ax * y + z;
      }
      m.instanceMatrix.needsUpdate = true;
    }
  };
  const update = (t) => { swayAll(t); fallUpdate(t); };
  update(0);
  return { group, update };
}
