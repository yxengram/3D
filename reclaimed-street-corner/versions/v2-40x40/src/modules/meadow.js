// meadow.js — the low front of the v2 ring: playground, glasshouse, sunflower patch, street relics, wildflower drifts.
// Everything here sits between the hero camera and the corner, so it stays low, airy and readable from above.
//
// Technique notes
//  · All static pieces go through one Batch, so the prop count does not turn into draw calls.
//  · Foliage is written straight into buffers with the clump normal in the `normal` attribute (same idea as the banyan's aShell):
//    the cel terminator then falls across a whole mass rather than leaf by leaf. leafMat keeps back faces from flipping that normal.
//  · Sway is CPU-side and closed-form in t: stems shear about their base by rewriting two matrix elements per instance,
//    flower heads translate by the same shear at their height. Nothing is allocated per frame, frozen ?t= frames are valid.
//  · Moving meshes do not cast. One invisible static proxy (layer 1, so the ink pass skips it) keeps their shadows in the baked map.
const TAU = Math.PI * 2;
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const lerp = (a, b, t) => a + (b - a) * t;

export function build(ctx) {
  const { THREE, layout, P, kit } = ctx;
  const { MEADOW, FLOWER_SPOTS, SUN_DIR, pointInPoly, riverOutline, GROVE, GROUND } = layout;
  const rng = ctx.rng, V = THREE.Vector3, Q = THREE.Quaternion;
  const group = new THREE.Group(); group.name = 'meadow';
  const GY = GROUND.soilY;
  const UP = new V(0, 1, 0), SUN = new V(...SUN_DIR);
  const tv = (p) => (p.isVector3 ? p.clone() : new V(p[0], p[1], p[2]));
  const col = (c) => new THREE.Color(c);
  const FONT = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans CJK JP","Yu Gothic","Meiryo","Microsoft YaHei",sans-serif';

  // ---------------------------------------------------------------- exclusion tests
  const riverPoly = riverOutline(0.6);
  const inRiver = (x, z, m = 0.6) => {
    if (pointInPoly(x, z, riverPoly)) return true;
    for (let a = 0; a < 8; a++) if (pointInPoly(x + Math.cos(a * 0.785) * m, z + Math.sin(a * 0.785) * m, riverPoly)) return true;
    return false;
  };
  const nearTrunk = (x, z, m = 1.0) => GROVE.some((t) => Math.hypot(x - t.x, z - t.z) < m);
  const onPlinth = (x, z, m = 0.25) => Math.abs(x) < layout.BASE.half - m && Math.abs(z) < layout.BASE.half - m;

  // ---------------------------------------------------------------- shared materials
  const peelTex = ctx.canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    const r = ctx.seeded('peel');
    const flake = (x, y, s) => {
      const n = 10 + Math.floor(r() * 6), pts = [];
      for (let i = 0; i < n; i++) { const a = (i / n) * TAU, q = s * (0.5 + r() * 0.75); pts.push([Math.cos(a) * q * 1.35, Math.sin(a) * q * 0.85]); }
      const rot = r() * 3, cr = Math.cos(rot), sr = Math.sin(rot);
      const path = (k, ox, oy) => { g.beginPath(); pts.forEach(([a, b], i) => { const px = x + ox + (a * cr - b * sr) * k, py = y + oy + (a * sr + b * cr) * k; i ? g.lineTo(px, py) : g.moveTo(px, py); }); g.closePath(); g.fill(); };
      for (const [ox, oy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) {
        g.fillStyle = '#fff8ea'; path(1.12, ox, oy);
        g.fillStyle = '#d99a72'; path(1, ox, oy);
        g.fillStyle = '#a9603f'; path(0.55, ox, oy);
      }
    };
    for (let i = 0; i < 30; i++) flake(r() * w, r() * h, 12 + r() * r() * 66);
  });
  const peel = ctx.toon({ color: '#ffffff', map: peelTex, vertexColors: true, side: THREE.DoubleSide });
  peel.userData.uv = 0.62;

  const ATLAS = { phone: [0, 0, 512, 112], notice: [512, 0, 200, 256], post: [720, 0, 300, 112], times: [720, 120, 300, 136], park: [0, 120, 500, 240], plate: [0, 372, 500, 120] };
  const atlas = ctx.canvasTexture(1024, 512, (g) => {
    g.fillStyle = '#d9d6cb'; g.fillRect(0, 0, 1024, 512);
    const c = (name, fn) => { const [x, y, w, h] = ATLAS[name]; g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.translate(x, y); fn(w, h); g.restore(); };
    const text = (s, x, y, size, color, weight = 700, align = 'center') => { g.fillStyle = color; g.font = `${weight} ${size}px ${FONT}`; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(s, x, y); };
    c('phone', (w, h) => {
      g.fillStyle = '#4c9a7d'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#efeadb'; g.fillRect(0, h - 12, w, 12);
      text('でんわ', w / 2 + 34, h / 2 - 4, 72, '#f6f1df', 800);
      g.strokeStyle = '#f6f1df'; g.lineWidth = 15; g.lineCap = 'round';
      g.beginPath(); g.arc(112, 74, 48, Math.PI * 1.12, Math.PI * 1.88); g.stroke();
      g.fillStyle = '#f6f1df'; g.fillRect(58, 56, 24, 26); g.fillRect(142, 56, 24, 26);
      g.fillStyle = 'rgba(160,96,64,.5)'; g.fillRect(400, 0, 7, 60); g.fillRect(24, 0, 5, 38);
    });
    c('notice', (w, h) => {
      g.fillStyle = '#f1ead6'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#c8705e'; g.lineWidth = 8; g.strokeRect(12, 12, w - 24, h - 24);
      text('故障中', w / 2, 86, 54, '#c8503f', 800);
      text('ご不便を', w / 2, 158, 28, '#6c7078', 500); text('おかけします', w / 2, 196, 26, '#6c7078', 500);
      g.fillStyle = 'rgba(200,180,120,.35)'; g.fillRect(0, h - 70, w, 70);
    });
    c('post', (w, h) => { g.fillStyle = '#f1ead6'; g.fillRect(0, 0, w, h); text('郵 便', w / 2, h / 2 + 2, 74, '#c6463a', 800); });
    c('times', (w, h) => {
      g.fillStyle = '#efeadb'; g.fillRect(0, 0, w, h); text('取集時刻', w / 2, 30, 34, '#5c6a70', 800);
      g.strokeStyle = '#9aa6a6'; g.lineWidth = 3; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(24, 66 + i * 24); g.lineTo(w - 24, 66 + i * 24); g.stroke(); }
      text('10:30', 84, 80, 22, '#8b8f8a', 500); text('15:00', 216, 80, 22, '#8b8f8a', 500);
    });
    c('park', (w, h) => {
      g.fillStyle = '#e8dfc4'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#5fa58a'; g.fillRect(0, 0, w, 56);
      text('ひだまり児童公園', w / 2, 30, 40, '#fbf6e6', 800);
      g.strokeStyle = '#b5522f'; g.lineWidth = 7; g.lineCap = 'round';
      g.beginPath(); g.moveTo(70, 190); g.lineTo(105, 90); g.lineTo(195, 90); g.lineTo(230, 190); g.moveTo(135, 90); g.lineTo(135, 165); g.moveTo(165, 90); g.lineTo(165, 165); g.moveTo(125, 165); g.lineTo(175, 165); g.stroke();
      g.fillStyle = '#e0c25a'; g.beginPath(); g.arc(340, 150, 56, Math.PI, 0); g.fill(); g.fillStyle = '#d0473a'; g.fillRect(278, 150, 124, 16);
      text('みんな なかよく', w / 2, 208, 28, '#6e5038', 600);
      g.fillStyle = 'rgba(125,187,74,.45)'; g.beginPath(); g.ellipse(40, h, 120, 66, 0, 0, TAU); g.ellipse(w - 10, 20, 90, 60, 0, 0, TAU); g.fill();
    });
    c('plate', (w, h) => {
      g.fillStyle = '#f4f1e6'; g.fillRect(0, 0, w, h); g.strokeStyle = '#6f9fb0'; g.lineWidth = 7; g.strokeRect(9, 9, w - 18, h - 18);
      text('第二温室', w / 2, 46, 48, '#3f7f8a', 800); text('緑丘園芸組合', w / 2, 88, 24, '#6f9fb0', 600);
    });
  }, { repeat: false });
  const signMat = ctx.toon({ color: '#ffffff', map: atlas, vertexColors: true });
  const decal = (w, h, name) => {
    const [x, y, pw, ph] = ATLAS[name], g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (x + uv.getX(i) * pw) / 1024, 1 - (y + (1 - uv.getY(i)) * ph) / 512);
    return g;
  };

  const glassMat = ctx.toon({ color: '#ffffff', vertexColors: true, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false, dapple: false });
  const leafMat = (() => {
    const m = ctx.toon({ color: '#ffffff', side: THREE.DoubleSide, vertexColors: true, translucent: 0.8 });
    const base = m.onBeforeCompile, key = m.customProgramCacheKey();
    m.onBeforeCompile = (s, r) => {
      base(s, r);
      s.fragmentShader = s.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
    };
    m.customProgramCacheKey = () => key + '|clump';
    return m;
  })();
  const headMat = ctx.toon({ color: '#ffffff', side: THREE.DoubleSide, vertexColors: true, translucent: 0.7 });

  // ---------------------------------------------------------------- geometry helpers
  const st = ctx.batch(), gl = ctx.batch(), thin = ctx.batch(), proxy = [];
  const bar = (a, b, r, radial = 6, open = false) => {
    const A = tv(a), B = tv(b), d = B.clone().sub(A), L = d.length(), g = kit.cyl(r, r, L, radial, open);
    g.applyQuaternion(new Q().setFromUnitVectors(UP, d.normalize())); g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2); return g;
  };
  const sq = (a, b, t) => {
    const A = tv(a), B = tv(b), d = B.clone().sub(A), L = d.length(), g = kit.box(t, L, t);
    g.applyQuaternion(new Q().setFromUnitVectors(UP, d.normalize())); g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2); return g;
  };
  const frame = (x, z, yaw = 0, y = 0, rx = 0, rz = 0) => {
    const m = kit.xf({ pos: [x, y, z], rot: [rx, yaw, rz] });
    return { m, add(g, mat = 'flat', color) { st.add(g, mat, { matrix: m, color }); }, p(a, b, c) { return new V(a, b, c).applyMatrix4(m); }, d(a, b, c) { return new V(a, b, c).transformDirection(m); } };
  };
  const W0 = frame(0, 0); // world-space frame
  const fine = (g, color, m = null) => thin.add(g, 'flat', m ? { matrix: m, color } : { color });
  const paintGeo = (g, c) => {
    const k = col(c), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = k.r; a[i * 3 + 1] = k.g; a[i * 3 + 2] = k.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
  };

  // Leaf buffer: non-indexed triangles with the clump normal already in `normal`.
  const newBuf = () => ({ p: [], n: [], c: [] });
  const _a = new V(), _b = new V(), _s = new V();
  const pushV = (buf, x, y, z, sh, c) => { buf.p.push(x, y, z); buf.n.push(sh.x, sh.y, sh.z); buf.c.push(c.r, c.g, c.b); };
  /** Ovate leaf from p toward tip, broad side perpendicular to shell. c0 at the base, c1 at the tip. */
  function leaf(buf, p, tip, shell, l, w, c0, c1) {
    _a.copy(tip).normalize(); _b.crossVectors(shell, _a); if (_b.lengthSq() < 1e-5) _b.set(1, 0, 0); _b.normalize();
    const fold = w * 0.16, q = (t, k) => [p.x + _a.x * l * t + _b.x * w * k + shell.x * fold * Math.abs(k), p.y + _a.y * l * t + _b.y * w * k + shell.y * fold * Math.abs(k), p.z + _a.z * l * t + _b.z * w * k + shell.z * fold * Math.abs(k)];
    const B = q(0, 0), L = q(0.42, -0.5), R = q(0.42, 0.5), M = q(0.5, 0), T = q(1, 0), mid = c0.clone().lerp(c1, 0.5);
    const tri = (a, ca, b, cb, c, cc) => { pushV(buf, a[0], a[1], a[2], shell, ca); pushV(buf, b[0], b[1], b[2], shell, cb); pushV(buf, c[0], c[1], c[2], shell, cc); };
    tri(B, c0, L, mid, M, mid); tri(B, c0, M, mid, R, mid); tri(L, mid, T, c1, M, mid); tri(M, mid, T, c1, R, mid);
  }
  /** Blunt-tipped outline for cosmos, daisies and sunflower leaves: a fan of four triangles from the base. */
  function petal(buf, p, tip, shell, l, w, c0, c1) {
    _a.copy(tip).normalize(); _b.crossVectors(shell, _a); if (_b.lengthSq() < 1e-5) _b.set(1, 0, 0); _b.normalize();
    const q = (t, k) => [p.x + _a.x * l * t + _b.x * w * k, p.y + _a.y * l * t + _b.y * w * k, p.z + _a.z * l * t + _b.z * w * k];
    const B = q(0, 0), L = q(0.5, -0.46), TL = q(0.9, -0.36), T = q(1.02, 0), TR = q(0.9, 0.36), R = q(0.5, 0.46), mid = c0.clone().lerp(c1, 0.6);
    const tri = (a, ca, b, cb, c, cc) => { pushV(buf, a[0], a[1], a[2], shell, ca); pushV(buf, b[0], b[1], b[2], shell, cb); pushV(buf, c[0], c[1], c[2], shell, cc); };
    tri(B, c0, L, mid, TL, c1); tri(B, c0, TL, c1, T, c1); tri(B, c0, T, c1, TR, c1); tri(B, c0, TR, c1, R, mid);
  }
  const GREENS = [P.leafDeep, P.leafMid, P.leafMid, P.leafLit, P.leafGold].map(col);
  const VINE = [P.ivy, P.ivy, P.ivyLit, P.leafMid].map(col);
  const toneOf = (pal, k) => pal[Math.max(0, Math.min(pal.length - 1, Math.floor(k * pal.length)))];
  const _d = new V();
  /** Ellipsoidal shell of leaves whose normals follow the ellipsoid. */
  function clump(buf, c, rx, ry, rz, n, { pal = GREENS, s = [0.15, 0.26], hemi = false, inner = 0.62, droop = 0.45 } = {}) {
    for (let i = 0; i < n; i++) {
      _d.set(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1); if (_d.lengthSq() > 1 || _d.lengthSq() < 0.01) { i--; continue; }
      _d.normalize(); if (hemi) _d.y = Math.abs(_d.y);
      const r = inner + (1 - inner) * Math.sqrt(rng());
      const p = new V(c.x + _d.x * rx * r, c.y + _d.y * ry * r, c.z + _d.z * rz * r);
      const shell = new V(_d.x / rx, _d.y / ry + 0.25 / ry, _d.z / rz).normalize();
      const tip = new V(rng() - 0.5, -droop * rng(), rng() - 0.5); tip.addScaledVector(shell, -tip.dot(shell) * 0.8);
      const k = 0.5 + _d.y * 0.42 + (rng() - 0.5) * 0.3, t = toneOf(pal, k), l = rng.range(s[0], s[1]);
      leaf(buf, p, tip, shell, l, l * 0.62, t.clone().multiplyScalar(0.8), t);
    }
  }
  /** Small flower pressed onto a foliage shell. */
  function bloom(buf, p, shell, r, petals, c, eye) {
    const t = new V().crossVectors(shell, Math.abs(shell.y) > 0.9 ? _s.set(1, 0, 0) : UP).normalize(), o = new V().crossVectors(shell, t), off = rng() * TAU;
    for (let i = 0; i < petals; i++) {
      const a = off + (i / petals) * TAU, tip = new V().addScaledVector(t, Math.cos(a)).addScaledVector(o, Math.sin(a));
      petal(buf, p, tip, shell, r, r * 0.8, c.clone().lerp(eye, 0.3), c);
    }
  }
  function bloomsOn(buf, c, rx, ry, rz, n, palette, r = [0.08, 0.13]) {
    for (let i = 0; i < n; i++) {
      _d.set(rng() * 2 - 1, rng() * 0.9 + 0.05, rng() * 2 - 1).normalize();
      const p = new V(c.x + _d.x * rx * 1.02, c.y + _d.y * ry * 1.02, c.z + _d.z * rz * 1.02), shell = new V(_d.x / rx, _d.y / ry, _d.z / rz).normalize();
      bloom(buf, p, shell, rng.range(r[0], r[1]), 5, col(rng.pick(palette)), col(P.flowerYellow));
    }
  }
  const leafMesh = (buf, { shadow = true } = {}) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(buf.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(buf.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(buf.c, 3));
    const m = new THREE.Mesh(g, leafMat); m.castShadow = shadow; m.receiveShadow = true;
    ctx.softEdge(m); return m;
  };
  const staticLeaves = newBuf();
  /** Vine tube through pts, with leaves strung along it. World coordinates. */
  function vine(pts, r, leaves, { pal = VINE, s = [0.12, 0.2], color = '#4f8f52', blooms = 0, colors = null } = {}) {
    const P3 = pts.map(tv);
    W0.add(kit.tube(P3, r, r * 0.55, 4, Math.max(6, P3.length * 2), { capEnds: false }), 'flat', color);
    const curve = new THREE.CatmullRomCurve3(P3);
    for (let i = 0; i < leaves; i++) {
      const u = rng(), p = curve.getPointAt(u), tan = curve.getTangentAt(u), shell = new V(rng() - 0.5, 0.7, rng() - 0.5).normalize();
      const tip = new V(rng() - 0.5, -0.35, rng() - 0.5).addScaledVector(tan, 0.4).normalize(), l = rng.range(s[0], s[1]), t = rng.pick(pal);
      p.addScaledVector(tip, r);
      leaf(staticLeaves, p, tip, shell, l, l * 0.8, t.clone().multiplyScalar(0.82), t);
    }
    for (let i = 0; i < blooms; i++) {
      const p = curve.getPointAt(rng()); p.x += rng.range(-0.1, 0.1); p.z += rng.range(-0.1, 0.1);
      bloom(staticLeaves, p, new V(rng() - 0.5, 0.6, rng() - 0.5).normalize(), rng.range(0.07, 0.11), 5, col(rng.pick(colors || [P.flowerBlue, P.flowerPurple, P.flowerWhite])), col(P.flowerYellow));
    }
  }
  const pad = (x, y, z, rx, ry, rz, color = P.moss) => { const g = kit.sphere(1, 9, 6); g.scale(rx, ry, rz); g.translate(x, y, z); W0.add(g, 'flat', color); };
  const dirt = (x, z, rx, rz, color = '#b49a6a', y = GY + 0.025) => {
    const o = kit.jag(kit.circlePts(0, 0, 1, 16, rng, 0.22).map(([a, b]) => [x + a * rx, z + b * rz]), 0.5, 0.14, rng);
    W0.add(kit.plate(o, null, y, 0.12), 'flat', color);
  };

  // ---------------------------------------------------------------- sway bookkeeping
  const sways = [];
  /** Instances are binned into wind cells; each frame one shear per cell. amp = shear per unit height. */
  const makeSway = (cell, amp, jitter = 0) => {
    const ids = new Map(), cx = [], cz = [];
    const s = { kx: null, kz: null, sets: [], cell, amp, jitter,
      id(x, z) { const k = `${Math.floor(x / cell)},${Math.floor(z / cell)}`; if (!ids.has(k)) { ids.set(k, cx.length); cx.push((Math.floor(x / cell) + 0.5) * cell); cz.push((Math.floor(z / cell) + 0.5) * cell); } return ids.get(k); },
      seal() { s.kx = new Float32Array(cx.length); s.kz = new Float32Array(cx.length); },
      step(t) {
        for (let g = 0; g < cx.length; g++) {
          const w = ctx.wind(t, cx[g], cz[g]), e = 0.5 + w;
          s.kx[g] = e * amp * 0.72 + Math.sin(t * 0.83 + g * 1.9) * amp * 0.16;
          s.kz[g] = e * amp * -0.36 + Math.sin(t * 1.3 + cx[g]) * amp * 0.16;
        }
        for (let w = 0; w < s.sets.length; w++) {
          const q = s.sets[w], a = q.attr.array;
          for (let i = 0; i < q.n; i++) {
            const g = q.g[i], o = i * 16; let kx = s.kx[g], kz = s.kz[g];
            if (jitter) { const j = Math.sin(t * 1.7 + q.ph[i]) * jitter; kx += j; kz -= j * 0.6; }
            if (q.h) { a[o + 12] = q.b0[i] + kx * q.h[i]; a[o + 14] = q.b1[i] + kz * q.h[i]; }
            else { a[o + 4] = q.b0[i] + kx * a[o + 5]; a[o + 6] = q.b1[i] + kz * a[o + 5]; }
          }
          q.attr.needsUpdate = true;
        }
      },
    };
    sways.push(s); return s;
  };
  /** Register an InstancedMesh. items[i] has x,z (wind cell), and h when it is a head riding the shear at height h. */
  const swayInst = (s, mesh, items, heads = false) => {
    const n = mesh.count, a = mesh.instanceMatrix.array, b0 = new Float32Array(n), b1 = new Float32Array(n), g = new Uint16Array(n), ph = new Float32Array(n), h = heads ? new Float32Array(n) : null;
    items.forEach((it, i) => {
      const o = i * 16; b0[i] = a[o + (heads ? 12 : 4)]; b1[i] = a[o + (heads ? 14 : 6)]; g[i] = s.id(it.sx ?? it.x, it.sz ?? it.z); ph[i] = it.ph ?? (it.x * 2.3 + it.z * 3.1);
      if (heads) h[i] = it.h;
    });
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    s.sets.push({ attr: mesh.instanceMatrix, n, g, ph, b0, b1, h });
  };
  const instanced = (geo, mat, items, { soft = true } = {}) => {
    const m = new THREE.InstancedMesh(geo, mat, items.length);
    items.forEach((it, i) => { m.setMatrixAt(i, it.m); m.setColorAt(i, it.c); });
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.frustumCulled = false; m.castShadow = false; m.receiveShadow = true;
    if (soft) ctx.softEdge(m);
    group.add(m); return m;
  };
  const instM = (x, y, z, q, s) => new THREE.Matrix4().compose(new V(x, y, z), q, typeof s === 'number' ? new V(s, s, s) : s);
  const yawQ = (a) => new Q().setFromAxisAngle(UP, a);

  // ---------------------------------------------------------------- grass bookkeeping (drawn at the end)
  const tufts = [];
  const grassC = [P.leafDeep, '#4fae59', P.leafMid, P.grass, P.grass, P.grassLit].map(col);
  const tuft = (x, z, h) => tufts.push({ x, z, m: instM(x, GY - 0.02, z, new Q().setFromEuler(new THREE.Euler(rng.range(-0.12, 0.12), rng() * TAU, rng.range(-0.12, 0.12), 'YXZ')), new V(h * rng.range(0.85, 1.25), h, h * rng.range(0.85, 1.25))), c: rng.pick(grassC).clone().multiplyScalar(rng.range(0.92, 1.08)) });
  const tuftsAround = (x, z, r, n, h = [0.35, 0.8]) => { for (let i = 0; i < n; i++) { const a = rng() * TAU, q = r * (0.75 + rng() * 0.6); tuft(x + Math.cos(a) * q, z + Math.sin(a) * q, rng.range(h[0], h[1])); } };

  // ================================================================ PLAYGROUND
  const Zp = MEADOW.playground, RUST2 = '#c98a62';
  const SWING = { x: -16.95, z: 15.5, yaw: 0.09, W: 2.05, H: 2.62, splay: 0.86 };
  const SAND = { x: -14.45, z: 18.55, w: 2.3, d: 1.75 };
  const DOME = { x: -17.95, z: 18.15, r: 1.36 };
  const SLIDE = { x: -18.75, z: 10.25, yaw: -0.03 };
  const inSand = (x, z, m = 0) => Math.abs(x - SAND.x) < SAND.w / 2 + m && Math.abs(z - SAND.z) < SAND.d / 2 + m;

  // --- swing
  const chainLink = (() => { const g = kit.torus(0.05, 0.012, 3, 7); g.scale(0.72, 1.4, 1); return g; })();
  const chainGeos = (a, b) => {
    const A = tv(a), B = tv(b), d = B.clone().sub(A), L = d.length(), n = Math.round(L / 0.14), q0 = new Q().setFromUnitVectors(UP, d.clone().normalize()), out = [];
    for (let i = 0; i < n; i++) {
      const g = chainLink.clone(), tw = new Q().setFromAxisAngle(UP, (i % 2) * Math.PI / 2 + 0.2);
      g.applyQuaternion(tw.premultiply(q0)); const p = A.clone().lerp(B, (i + 0.5) / n); g.translate(p.x, p.y, p.z); out.push(g);
    }
    return out;
  };
  const seatGeos = (cx, tilt = 0) => {
    const parts = [];
    const add = (g, c) => parts.push(paintGeo(g, c));
    const y = -2.14;
    for (const s of [-1, 1]) for (const g of chainGeos([cx + s * 0.235, -0.03, 0], [cx + s * 0.235, y + 0.05, 0])) add(g, P.rust);
    const plank = kit.box(0.62, 0.05, 0.19, 3, 1, 1); plank.translate(cx, y, 0); add(plank, P.wood);
    for (const s of [-1, 1]) { const st2 = kit.box(0.05, 0.075, 0.23); st2.translate(cx + s * 0.235, y - 0.005, 0); add(st2, P.rustDark); const ring = kit.torus(0.045, 0.012, 3, 7); ring.rotateY(Math.PI / 2); ring.translate(cx + s * 0.235, y + 0.06, 0); add(ring, P.rust); }
    return parts;
  };
  {
    const { x, z, yaw, W, H, splay } = SWING, f = frame(x, z, yaw);
    for (const s of [-1, 1]) {
      for (const k of [-1, 1]) {
        f.add(bar([s * W, H, 0], [s * (W + 0.14), -0.08, k * splay], 0.058, 7), peel, '#a4cccb');
        const foot = kit.cylBase(0.15, 0.2, 0.17, 8); foot.translate(s * (W + 0.14), -0.04, k * splay); f.add(foot, 'concrete');
      }
      f.add(bar([s * (W + 0.05), 1.0, -splay * 0.62], [s * (W + 0.05), 1.0, splay * 0.62], 0.032, 6), 'rust', '#ffffff');
      const g = kit.box(0.09, 0.26, 0.26); g.rotateX(Math.PI / 4); g.translate(s * W, H - 0.04, 0); f.add(g, 'rust');
    }
    f.add(bar([-W - 0.16, H + 0.02, 0], [W + 0.16, H + 0.02, 0], 0.064, 8), 'rust');
    for (const s of [-1, 1]) { const c = kit.cyl(0.075, 0.075, 0.03, 8); c.rotateZ(Math.PI / 2); c.translate(s * (W + 0.17), H + 0.02, 0); f.add(c, 'flat', P.rustDark); }
    // hanger eyes on the beam
    for (const cx of [-1.03, 1.03]) for (const s of [-1, 1]) {
      const e = kit.torus(0.075, 0.018, 4, 9); e.rotateY(Math.PI / 2); e.translate(cx + s * 0.235, H - 0.045, 0); f.add(e, 'rust');
    }
    // moving seat, pivot on the beam
    const seatA = new THREE.Mesh(kit.merge(seatGeos(0)), ctx.surface('flat', { vertexColors: true }));
    seatA.position.copy(f.p(-1.03, H - 0.06, 0)); seatA.rotation.order = 'YXZ'; seatA.rotation.y = yaw; seatA.castShadow = false; seatA.receiveShadow = true; group.add(seatA);
    SWING.seat = seatA;
    proxy.push((() => { const g = kit.box(0.6, 0.05, 0.2); g.translate(-1.03, 0.46, 0); g.applyMatrix4(f.m); return g; })());
    // still seat, tangled in a morning glory that has kept it from moving for years
    const bm = kit.xf({ pos: [1.03, H - 0.06, 0], rot: [0.05, 0.3, 0.02] }), pieces = kit.merge(seatGeos(0));
    pieces.applyMatrix4(bm); st.add(pieces, 'flat', { matrix: f.m });
    const cxp = (u, s) => f.p(1.03 + s * 0.235 + Math.cos(u * 26) * 0.05, H - 0.1 - u * 2.05, 0.14 * u + Math.sin(u * 26) * 0.05);
    vine(Array.from({ length: 13 }, (_, i) => cxp(i / 12, 1)), 0.016, 42, { blooms: 8, s: [0.11, 0.18] });
    vine(Array.from({ length: 9 }, (_, i) => cxp(0.42 + (i / 8) * 0.58, -1)), 0.014, 18, { blooms: 3, s: [0.1, 0.16] });
    vine([f.p(W + 0.14, 0, splay), f.p(W + 0.12, 0.7, splay * 0.72), f.p(W + 0.05, 1.5, splay * 0.42), f.p(W + 0.03, 2.2, splay * 0.15), f.p(W - 0.3, H + 0.1, 0.05), f.p(W - 0.9, H + 0.08, 0)], 0.02, 46, { blooms: 7 });
    dirt(...[f.p(-1.03, 0, 0)].map((p) => [p.x, p.z])[0], 0.75, 1.5);
    dirt(...[f.p(1.03, 0, 0)].map((p) => [p.x, p.z])[0], 0.62, 1.15, '#a79763');
  }

  // --- slide
  {
    const { x, z, yaw } = SLIDE, f = frame(x, z, yaw), Y = 1.92, PAINT = '#d7836b', RAIL = '#a4cccb';
    const plat = kit.box(0.72, 0.06, 0.72); plat.translate(0, Y, 0); f.add(plat, peel, RAIL);
    for (const [a, b] of [[-0.33, -0.33], [-0.33, 0.33], [0.33, -0.33], [0.33, 0.33]]) {
      f.add(bar([a, -0.08, b], [a, Y + 0.72, b], 0.042, 7), peel, RAIL);
      const c = kit.cylBase(0.11, 0.14, 0.12, 8); c.translate(a, -0.04, b); f.add(c, 'concrete');
    }
    // canopy hoop and hand rails
    for (const b of [-0.33, 0.33]) f.add(kit.tube([[-0.33, Y + 0.72, b], [-0.2, Y + 0.84, b], [0.2, Y + 0.84, b], [0.33, Y + 0.72, b]], 0.03, 0.03, 5, 8), peel, RAIL);
    f.add(bar([-0.33, Y + 0.35, -0.33], [0.33, Y + 0.35, -0.33], 0.024, 5), peel, RAIL);
    f.add(bar([-0.33, Y + 0.7, -0.33], [-0.33, Y + 0.7, 0.33], 0.024, 5), peel, RAIL);
    f.add(bar([-0.33, Y + 0.35, -0.33], [-0.33, Y + 0.35, 0.33], 0.024, 5), peel, RAIL);
    // ladder down +z
    const L = 1.25;
    for (const s of [-0.26, 0.26]) f.add(bar([s, Y + 0.06, 0.34], [s, -0.08, 0.34 + L], 0.032, 6), peel, RAIL);
    for (let i = 1; i <= 6; i++) { const u = i / 7; f.add(bar([-0.26, lerp(Y, -0.08, u), lerp(0.34, 0.34 + L, u)], [0.26, lerp(Y, -0.08, u), lerp(0.34, 0.34 + L, u)], 0.022, 5), 'rust'); }
    // chute
    const curve = new THREE.CatmullRomCurve3([[0.34, Y + 0.02], [0.72, Y - 0.08], [1.45, 1.28], [2.2, 0.66], [2.85, 0.4], [3.35, 0.34], [3.72, 0.38]].map(([a, b]) => new V(a, b, 0)));
    const N = 22, S = curve.getSpacedPoints(N);
    const sweep = (section) => {
      const pos = [], idx = [], m = section.length;
      S.forEach((p, i) => {
        const a = S[Math.max(0, i - 1)], b = S[Math.min(N, i + 1)], t = b.clone().sub(a).normalize(), nx = -t.y, ny = t.x;
        for (const [u, v] of section) pos.push(p.x + nx * v, p.y + ny * v, u);
      });
      for (let i = 0; i < N; i++) for (let j = 0; j < m - 1; j++) { const A = i * m + j, B = A + m; idx.push(A, A + 1, B, B, A + 1, B + 1); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
    };
    f.add(sweep([[-0.27, 0], [-0.13, 0], [0, 0], [0.13, 0], [0.27, 0]]), peel, '#e9dfbe');
    for (const s of [-1, 1]) {
      f.add(sweep([[s * 0.27, 0], [s * 0.285, 0.1], [s * 0.3, 0.19]]), peel, PAINT);
      f.add(sweep([[s * 0.3, 0.19], [s * 0.325, 0.215], [s * 0.35, 0.19]]), peel, PAINT);
      f.add(sweep([[s * 0.35, 0.19], [s * 0.335, 0.08], [s * 0.32, -0.04]]), peel, PAINT);
    }
    f.add(sweep([[-0.32, -0.04], [0.32, -0.04]]), 'rust');
    for (const u of [0.42, 0.74]) {
      const p = curve.getPointAt(u);
      for (const s of [-1, 1]) { f.add(bar([p.x, p.y - 0.03, s * 0.24], [p.x + 0.03, -0.08, s * 0.32], 0.034, 6), 'rust'); const c = kit.cylBase(0.09, 0.12, 0.1, 7); c.translate(p.x + 0.03, -0.04, s * 0.32); f.add(c, 'concrete'); }
      f.add(bar([p.x + 0.01, p.y * 0.45, -0.28], [p.x + 0.01, p.y * 0.45, 0.28], 0.02, 5), 'rust');
    }
    // the foot of the slide ends in soft dust and clover
    const end = f.p(3.8, 0, 0); dirt(end.x, end.z, 0.75, 0.6);
    const a = f.p(0.33, 0, 0.33), b = f.p(0.33, Y + 0.6, 0.33);
    vine([a, f.p(0.46, 0.8, 0.4), f.p(0.3, 1.4, 0.36), f.p(0.36, Y - 0.05, 0.38), b], 0.02, 34, { blooms: 5, colors: [P.flowerWhite, P.bougainLit] });
    vine([f.p(2.0, 0, 0.32), f.p(2.0, 0.62, 0.36), f.p(1.7, 1.12, 0.3), f.p(1.25, 1.42, 0.05), f.p(0.9, 1.72, -0.28)], 0.016, 24, { blooms: 3 });
  }

  // --- climbing dome
  {
    const { x, z, r } = DOME, rings = [[12, 0], [12, 0.42], [12, 0.84], [6, 1.2], [1, 1.5708]], nodes = [];
    rings.forEach(([n, el], i) => { const row = []; for (let k = 0; k < n; k++) { const a = ((k + (i % 2) * 0.5) / n) * TAU; row.push(new V(x + Math.cos(a) * Math.cos(el) * r, Math.sin(el) * r * 1.02, z + Math.sin(a) * Math.cos(el) * r)); } nodes.push(row); });
    const TONES = ['#d7836b', '#e0c25a', '#6f9fa8', '#e0c25a'];
    nodes.forEach((row, i) => {
      const c = TONES[i % 4], n = row.length;
      if (n > 1) row.forEach((p, k) => fine(bar(p, row[(k + 1) % n], i === 0 ? 0.052 : 0.04, 6, true), rng() < 0.28 ? RUST2 : c));
      row.forEach((p) => { const s = kit.sphere(0.06, 6, 4); s.translate(p.x, p.y, p.z); fine(s, P.rust); });
      if (i < nodes.length - 1) for (const q of nodes[i + 1]) {
        const near = [...row].sort((a, b) => a.distanceTo(q) - b.distanceTo(q)).slice(0, nodes[i + 1].length === 1 ? 6 : 2);
        for (const p of near) fine(bar(p, q, 0.038, 6, true), rng() < 0.28 ? RUST2 : c);
      }
    });
    nodes[0].forEach((p, k) => { if (k % 3 === 0) { const c = kit.cylBase(0.1, 0.13, 0.1, 7); c.translate(p.x, -0.04, p.z); W0.add(c, 'concrete'); } });
    const A = nodes[0][8], B = nodes[1][8], C2 = nodes[2][9], D = nodes[3][4], E = nodes[4][0];
    vine([A, B, C2, D, E.clone().add(new V(0.05, 0.06, 0))], 0.022, 60, { blooms: 8 });
    vine([nodes[0][2], nodes[1][2], nodes[2][1], nodes[2][0]], 0.018, 28, { blooms: 4, colors: [P.flowerYellow, P.flowerWhite] });
    const buf = staticLeaves; clump(buf, new V(x + 0.15, 0.38, z + 0.1), 0.85, 0.42, 0.8, 110, { s: [0.14, 0.24] });
    tuftsAround(x, z, r * 0.7, 28, [0.35, 0.7]); tuftsAround(x, z, r, 30, [0.4, 0.85]);
  }

  // --- spring riders
  const coil = (cx, cz, h, r, turns, lean) => { const pts = []; const n = Math.round(turns * 9); for (let i = 0; i <= n; i++) { const a = (i / n) * turns * TAU, y = 0.02 + (i / n) * h; pts.push([cx + Math.cos(a) * r + lean[0] * y, y, cz + Math.sin(a) * r + lean[1] * y]); } return kit.tube(pts, 0.024, 0.024, 4, n * 2, { capEnds: false }); };
  const riderBase = (x, z, c) => {
    const g = kit.cylBase(0.42, 0.47, 0.13, 12); g.translate(x, -0.04, z); W0.add(g, 'concrete');
    W0.add(coil(x, z, 0.46, 0.105, 4.5, [0.09, 0.03]), 'rust');
    const a = kit.cylBase(0.15, 0.17, 0.04, 8); a.translate(x, 0.08, z); W0.add(a, 'flat', P.rustDark);
    const b = kit.cylBase(0.13, 0.15, 0.04, 8); b.translate(x + 0.04, 0.47, z + 0.012); W0.add(b, 'flat', c);
  };
  { // faded chick
    const x = -13.95, z = 12.85, Y = '#e8cf7a', f = frame(x + 0.05, z, 0.5, 0.56, 0.03, -0.1);
    riderBase(x, z, Y);
    const body = kit.sphere(1, 16, 11); body.scale(0.44, 0.32, 0.29); body.translate(0, 0.28, 0); f.add(body, peel, Y);
    const head = kit.sphere(0.215, 14, 10); head.translate(0.34, 0.64, 0); f.add(head, peel, Y);
    const neck = kit.cyl(0.13, 0.2, 0.22, 10); neck.rotateZ(-0.34); neck.translate(0.26, 0.47, 0); f.add(neck, peel, Y);
    const beak = kit.cyl(0.0, 0.09, 0.16, 8); beak.rotateZ(-Math.PI / 2); beak.translate(0.57, 0.62, 0); f.add(beak, peel, '#dc8f4a');
    const tail = kit.cyl(0.02, 0.15, 0.3, 8); tail.rotateZ(0.82); tail.translate(-0.46, 0.44, 0); f.add(tail, peel, Y);
    for (const s of [-1, 1]) {
      const w = kit.sphere(1, 10, 7); w.scale(0.25, 0.1, 0.05); w.rotateZ(0.32); w.translate(-0.05, 0.32, s * 0.285); f.add(w, peel, '#dfbf62');
      const e = kit.sphere(0.03, 7, 5); e.translate(0.42, 0.7, s * 0.175); f.add(e, 'flat', P.ink);
      const p = bar([0.12, 0.05, s * 0.2], [0.12, 0.05, s * 0.38], 0.02, 5); f.add(p, 'rust');
    }
    f.add(bar([0.25, 0.68, -0.32], [0.25, 0.68, 0.32], 0.024, 6), 'rust');
    for (const s of [-1, 1]) { const k = kit.sphere(0.04, 6, 5); k.translate(0.25, 0.68, s * 0.33); f.add(k, 'flat', '#6f9fa8'); }
    const crest = kit.sphere(1, 8, 6); crest.scale(0.1, 0.075, 0.03); crest.translate(0.34, 0.86, 0); f.add(crest, peel, P.fadedRed);
    const saddle = kit.sphere(1, 12, 6); saddle.scale(0.2, 0.05, 0.2); saddle.translate(-0.08, 0.59, 0); f.add(saddle, peel, '#c8705e');
    tuftsAround(x, z, 0.62, 18, [0.3, 0.62]);
  }
  { // faded pony
    const x = -13.75, z = 14.6, Y = '#d9806b', f = frame(x + 0.05, z, -0.75, 0.56, 0.02, 0.07);
    riderBase(x, z, Y);
    const body = new THREE.CapsuleGeometry(0.21, 0.5, 6, 14); body.rotateZ(Math.PI / 2); body.translate(0, 0.27, 0); f.add(body, peel, Y);
    f.add(kit.tube([[0.27, 0.33, 0], [0.41, 0.56, 0], [0.46, 0.74, 0]], 0.145, 0.105, 10, 8), peel, Y);
    const head = new THREE.CapsuleGeometry(0.1, 0.2, 5, 12); head.rotateZ(1.2); head.translate(0.58, 0.77, 0); f.add(head, peel, Y);
    for (const s of [-1, 1]) {
      const ear = kit.cyl(0, 0.045, 0.13, 6); ear.translate(0.46, 0.93, s * 0.05); f.add(ear, peel, Y);
      const e = kit.sphere(0.024, 7, 5); e.translate(0.6, 0.82, s * 0.086); f.add(e, 'flat', P.ink);
      f.add(bar([0.45, 0.62, s * 0.08], [0.45, 0.62, s * 0.3], 0.022, 6), 'rust');
      const k = kit.sphere(0.036, 6, 5); k.translate(0.45, 0.62, s * 0.31); f.add(k, 'flat', '#e0c25a');
      for (const a of [-1, 1]) f.add(kit.tube([[a * 0.25, 0.14, s * 0.13], [a * 0.3, -0.02, s * 0.15], [a * 0.26, -0.12, s * 0.15]], 0.06, 0.045, 7, 5), peel, Y);
    }
    f.add(kit.tube([[0.25, 0.53, 0], [0.34, 0.78, 0], [0.43, 0.96, 0], [0.54, 0.97, 0]], 0.05, 0.03, 6, 10), peel, '#ecdfbc');
    f.add(kit.tube([[-0.43, 0.34, 0], [-0.58, 0.28, 0], [-0.62, 0.08, 0]], 0.05, 0.022, 6, 7), peel, '#ecdfbc');
    const saddle = kit.sphere(1, 12, 6); saddle.scale(0.22, 0.055, 0.2); saddle.translate(-0.05, 0.49, 0); f.add(saddle, peel, '#6f9fa8');
    tuftsAround(x, z, 0.6, 16, [0.3, 0.6]);
  }

  // --- sandbox and the bucket somebody meant to come back for
  {
    const { x, z, w, d } = SAND, f = frame(x, z, 0.04), T = 0.15, H = 0.22;
    for (const [a, b, l, along] of [[0, -d / 2, w + T, 1], [0, d / 2, w + T, 1], [-w / 2, 0, d + T, 0], [w / 2, 0, d + T, 0]]) {
      const g = along ? kit.boxBase(l, H, T) : kit.boxBase(T, H, l); g.translate(a, -0.03, b); kit.chip(g, 0.012, rng); f.add(g, 'flat', '#b98f5e');
    }
    const nx = 14, nz = 11, sg = new THREE.PlaneGeometry(w, d, nx, nz); sg.rotateX(-Math.PI / 2);
    const p = sg.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const a = p.getX(i), b = p.getZ(i), e = Math.min(1, Math.min(w / 2 - Math.abs(a), d / 2 - Math.abs(b)) / 0.35);
      p.setY(i, 0.13 + (0.03 * Math.sin(a * 3.1 + 1) * Math.cos(b * 2.7) + 0.05 * Math.exp(-((a + 0.35) ** 2 + (b - 0.1) ** 2) / 0.16)) * e);
    }
    sg.computeVertexNormals(); f.add(sg, 'flat', '#efdcae');
    const pts = [[0.001, -0.14], [0.1, -0.14], [0.115, -0.13], [0.165, 0.14], [0.18, 0.15], [0.183, 0.17], [0.165, 0.17], [0.15, 0.14], [0.1, -0.11], [0.001, -0.11]].map(([a, b]) => new THREE.Vector2(a, b));
    const bucket = new THREE.LatheGeometry(pts, 14), bx = 0.44, bz = -0.26, m = kit.xf({ pos: [bx, 0.26, bz], rot: [1.02, 0.7, 0.14] });
    bucket.applyMatrix4(m); f.add(bucket, 'flat', '#6fb4c2');
    const handle = kit.tube([[-0.175, 0.15, 0], [-0.13, 0.3, 0], [0, 0.37, 0], [0.13, 0.3, 0], [0.175, 0.15, 0]], 0.012, 0.012, 4, 10); handle.applyMatrix4(m); f.add(handle, 'flat', '#e0c25a');
    const inner = kit.cyl(0.15, 0.15, 0.01, 12); inner.translate(0, 0.1, 0); inner.applyMatrix4(m); f.add(inner, 'flat', '#3f7f92');
    // spade stuck in the mound
    const sm = kit.xf({ pos: [-0.38, 0.2, 0.12], rot: [0.26, 0.5, -0.34] });
    const shaft = bar([0, 0.05, 0], [0, 0.42, 0], 0.016, 5); shaft.applyMatrix4(sm); f.add(shaft, 'flat', P.fadedYellow);
    const grip = kit.box(0.1, 0.022, 0.025); grip.translate(0, 0.43, 0); grip.applyMatrix4(sm); f.add(grip, 'flat', P.fadedYellow);
    const blade = kit.box(0.1, 0.13, 0.012); blade.translate(0, 0, 0); blade.applyMatrix4(sm); f.add(blade, 'flat', '#6f9fb0');
    for (const [a, b] of [[-0.9, -0.62], [0.95, 0.55], [-0.2, 0.68], [0.88, -0.66]]) { const c = f.p(a, 0, b); tuftsAround(c.x, c.z, 0.14, 5, [0.22, 0.42]); }
  }

  // --- fence: pipe rails and pickets, bent up and outward where roots have shouldered under it
  const fenceRun = (pts, bends, { h = 1.05, gaps = [], tone = '#9cc0ae', endPost = true } = {}) => {
    const A = tv([pts[0][0], 0, pts[0][1]]), B = tv([pts[1][0], 0, pts[1][1]]), L = A.distanceTo(B), dir = B.clone().sub(A).normalize(), out = new V(dir.z, 0, -dir.x);
    const at = (s) => {
      let lift = 0, lean = 0, push = 0;
      for (const b of bends) { const e = Math.exp(-(((s - b.s) / b.w) ** 2)); lift += b.lift * e; lean += b.lean * e; push += b.push * e; }
      return { lift, lean, push };
    };
    const pt = (s, y) => { const q = at(s); return A.clone().addScaledVector(dir, s).addScaledVector(out, q.push + q.lean * y).setY(y + q.lift * (1 - y * 0.25)); };
    const inGap = (s) => gaps.some(([a, b]) => s > a && s < b);
    // rails run the whole of each solid stretch and end on a post, so no length of fence is left hanging off a gap
    const spans = []; { let s0 = 0; for (const [a, b] of gaps) { spans.push([s0, a]); s0 = b; } spans.push([s0, L]); }
    const railSeg = (y, r) => { for (const [a, b] of spans) { const n = Math.max(1, Math.round((b - a) / 0.3)), seg = []; for (let i = 0; i <= n; i++) seg.push(pt(a + ((b - a) * i) / n, y)); fine(kit.tube(seg, r, r, 5, seg.length * 2), tone); } };
    railSeg(h, 0.034); railSeg(0.18, 0.028);
    const stops = [...spans.flat()].filter((s) => endPost || s < L);
    for (let s = 0; s <= L; s += 0.22) {
      if (inGap(s) || rng() < 0.05) continue;
      const near = Math.round(s / 1.76) * 1.76, post = Math.abs(s - near) < 0.11;
      const top = post ? h + 0.1 : h, a = pt(s, post ? -0.06 : 0.18), b = pt(s, top), paint = post ? '#7fa79a' : (rng() < 0.3 ? RUST2 : tone);
      if (stops.some((e) => Math.abs(s - e) < 0.13)) continue; // that spot belongs to a stop post, planted below with no rng
      fine(bar(a, b, post ? 0.046 : 0.021, post ? 6 : 4, !post), paint);
      if (post) { const c = kit.sphere(0.06, 6, 4); c.translate(b.x, b.y, b.z); fine(c, P.rust); }
    }
    for (const s of stops) { // feet on the ground even where a root has lifted the rail
      const b = pt(s, h + 0.1), c = kit.sphere(0.06, 6, 4); c.translate(b.x, b.y, b.z);
      fine(bar(pt(s, 0).setY(-0.06), b, 0.046, 6, false), '#7fa79a'); fine(c, P.rust);
    }
    return { pt, L };
  };
  const ROOT = '#7a6048';
  const root = (pts, r0, r1) => W0.add(kit.tube(pts, r0, r1, 6, pts.length * 3), 'flat', ROOT);
  {
    const west = fenceRun([[-19.45, 16.6], [-19.45, 8.75]], [{ s: 4.25, w: 1.0, lift: 0.36, lean: 0.34, push: 0.26 }, { s: 6.6, w: 0.55, lift: 0.1, lean: -0.1, push: 0.0 }], { gaps: [[4.45, 4.95]], endPost: false }); // its far end meets the north run's first post
    const north = fenceRun([[-19.3, 8.62], [-13.05, 8.62]], [{ s: 3.1, w: 0.8, lift: 0.3, lean: -0.22, push: -0.08 }], { gaps: [[4.0, 5.2]] });
    fenceRun([[-12.98, 12.4], [-12.98, 16.0]], [{ s: 1.9, w: 0.7, lift: 0.1, lean: -0.32, push: 0.08 }], { h: 0.95 });
    fenceRun([[-19.4, 17.0], [-19.4, 19.55]], [{ s: 1.6, w: 0.8, lift: 0.0, lean: -0.5, push: -0.05 }], { h: 0.95 });
    // roots running out from the camphor, humping up under the rails
    root([[-17.2, 0.02, 12.1], [-17.9, 0.08, 12.25], [-18.7, 0.2, 12.28], [-19.45, 0.34, 12.32], [-19.95, 0.05, 12.2]], 0.11, 0.05);
    root([[-17.1, 0.0, 12.6], [-18.1, 0.06, 12.95], [-18.9, 0.12, 12.72], [-19.5, 0.28, 12.5]], 0.075, 0.035);
    root([[-16.75, 0.0, 11.7], [-16.5, 0.08, 10.6], [-16.25, 0.22, 9.5], [-16.2, 0.3, 8.65], [-16.1, 0.02, 8.15]], 0.09, 0.04);
    const p1 = west.pt(4.25, 0.9), p2 = north.pt(3.1, 0.9);
    vine([[-19.5, 0.05, 11.2], [-19.55, 0.5, 11.6], p1.clone(), [-19.75, 1.0, 13.1], [-19.5, 0.95, 14.4]], 0.018, 56, { blooms: 8 });
    vine([[-17.2, 0.05, 8.5], [-16.9, 0.75, 8.62], p2.clone(), [-15.4, 1.0, 8.6], [-14.4, 0.9, 8.62]], 0.018, 46, { blooms: 6, colors: [P.flowerWhite, P.bougainLit] });
    vine([[-12.95, 0.05, 15.6], [-13, 0.7, 15.2], [-13, 0.95, 14.2], [-12.95, 0.85, 13.2]], 0.016, 30, { blooms: 4 });
    // park name board at the gate gap
    const f = frame(-13.5, 9.1, 0.34, 0.02, 0, 0.04);
    for (const s of [-0.62, 0.62]) { f.add(bar([s, -0.1, 0], [s, 1.42, 0], 0.04, 6), 'rust'); }
    const board = kit.box(1.5, 0.76, 0.05); board.translate(0, 1.02, 0); f.add(board, 'flat', '#a87c52');
    const face = decal(1.42, 0.68, 'park'); face.translate(0, 1.02, 0.03); f.add(face, signMat);
    const roof = kit.box(1.62, 0.05, 0.16); roof.translate(0, 1.43, 0); f.add(roof, 'flat', '#7fa79a');
    vine([f.p(-0.62, 0, 0.05), f.p(-0.66, 0.55, 0.08), f.p(-0.5, 1.0, 0.08), f.p(-0.68, 1.4, 0.02)], 0.014, 20, { blooms: 2 });
  }
  // wild grass reclaiming the lot: dense around the iron, thin on the bare places
  {
    const blocked = (x, z) => inSand(x, z, 0.1) || nearTrunk(x, z, 0.5) || inRiver(x, z, 0.5) || !onPlinth(x, z, 0.2);
    let n = 0;
    for (let i = 0; i < 6000 && n < 440; i++) {
      const x = rng.range(Zp.x[0], Zp.x[1]), z = rng.range(Zp.z[0], Zp.z[1]);
      if (blocked(x, z)) continue;
      const a = Math.sin(x * 1.3 + z * 0.4) + Math.sin(z * 1.1 - x * 0.5 + 2), lx = (x - SWING.x) / 2.4, lz = (z - SWING.z) / 1.5, bare = (Math.abs(lx) < 0.72 && Math.abs(lz) < 1.05) ? 0.35 : 1;
      if (rng() > (0.34 + 0.22 * a) * bare) continue;
      tuft(x, z, rng.range(0.34, 0.78) * (0.92 + 0.2 * Math.max(0, a))); n++;
    }
    const f = frame(SWING.x, SWING.z, SWING.yaw);
    for (const s of [-1, 1]) for (const k of [-1, 1]) { const c = f.p(s * (SWING.W + 0.14), 0, k * SWING.splay); tuftsAround(c.x, c.z, 0.26, 10, [0.45, 0.85]); }
    const g = frame(SLIDE.x, SLIDE.z, SLIDE.yaw);
    for (const [a, b] of [[0.33, 0.33], [0.33, -0.33], [-0.33, 0.33], [-0.33, -0.33], [2, 0.3], [3, -0.32], [0, 1.6]]) { const c = g.p(a, 0, b); tuftsAround(c.x, c.z, 0.26, 9, [0.42, 0.8]); }
  }

  // ================================================================ GLASSHOUSE
  const GH = { X0: 3.6, X1: 9.0, Z0: 13.5, Z1: 18.1, EY: 1.62, RY: 2.46, KY: 0.36, nx: 5, nz: 4 };
  GH.ZM = (GH.Z0 + GH.Z1) / 2; GH.bx = (GH.X1 - GH.X0) / GH.nx; GH.bz = (GH.Z1 - GH.Z0) / GH.nz;
  const HOLES = [{ x: 5.0, z: 16.72, r: 0.72 }, { x: 7.3, z: 14.72, r: 0.66 }];
  const inHole = (x, z, m = 0) => HOLES.some((h) => Math.hypot(x - h.x, (z - h.z) * 0.92) < h.r + m);
  const slope = (x, s, side) => [x, lerp(GH.EY, GH.RY, s), side < 0 ? lerp(GH.Z0, GH.ZM, s) : lerp(GH.Z1, GH.ZM, s)];
  const paneShard = (o, ex, ey, w, h, kind) => {
    // o corner, ex/ey plane axes; kind 0 full pane with a star crack hole, 1..4 a corner shard
    const n = new V().crossVectors(ex, ey).normalize(), m = new THREE.Matrix4().makeBasis(ex, ey, n).setPosition(o);
    let pts;
    if (kind === 0) pts = [[0, 0], [w, 0], [w, h * 0.62], [w * 0.74, h * 0.48], [w * 0.8, h * 0.82], [w * 0.5, h * 0.6], [w * 0.36, h], [0, h]];
    else {
      const a = rng.range(0.55, 0.95), b = rng.range(0.5, 0.95), q = [[0, 0], [w * a, 0], [w * a * 0.66, h * b * 0.26], [w * a * 0.42, h * b * 0.2], [w * a * 0.3, h * b * 0.62], [0, h * b]];
      pts = q.map(([x, y]) => [(kind === 2 || kind === 3) ? w - x : x, (kind === 3 || kind === 4) ? h - y : y]);
    }
    const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))), g = new THREE.ShapeGeometry(shape); g.applyMatrix4(m);
    gl.add(g, glassMat, { color: rng() < 0.3 ? '#d9fff0' : '#a8ece4' });
    if (kind === 0 || rng() < 0.5) { // bright diagonal glint
      const t = rng.range(0.15, 0.5), s = new THREE.ShapeGeometry(new THREE.Shape([[w * t, 0.02], [w * (t + 0.09), 0.02], [w * (t + 0.02), h * 0.36], [w * (t - 0.07), h * 0.36]].map(([x, y]) => new THREE.Vector2(x, y))));
      s.applyMatrix4(m); s.translate(n.x * 0.006, n.y * 0.006, n.z * 0.006); gl.add(s, glassMat, { color: '#ffffff' });
    }
  };
  {
    const { X0, X1, Z0, Z1, ZM, EY, RY, KY, nx, nz, bx, bz } = GH;
    const WHITE = '#f6f3e8', WHITE2 = '#e3e5da', STAIN = '#cfa488';
    const mem = (a, b, t = 0.062, c = WHITE) => fine(sq(a, b, t * 1.12), c);
    // knee wall on all sides, broken where the plants pushed out, door gap on the +x gable
    const wall = (ax, az, bx2, bz2, y = KY) => {
      const horizontal = Math.abs(bx2 - ax) > Math.abs(bz2 - az), l = horizontal ? bx2 - ax : bz2 - az;
      const g = horizontal ? kit.boxBase(Math.abs(l), y + 0.12, 0.17, 6, 1, 1) : kit.boxBase(0.17, y + 0.12, Math.abs(l), 1, 1, 6);
      kit.chip(g, 0.014, rng); g.translate((ax + bx2) / 2, -0.1, (az + bz2) / 2); W0.add(g, 'concrete');
      const cap = horizontal ? kit.box(Math.abs(l) + 0.05, 0.035, 0.23) : kit.box(0.23, 0.035, Math.abs(l) + 0.05); cap.translate((ax + bx2) / 2, y + 0.03, (az + bz2) / 2); W0.add(cap, 'flat', P.concreteLit);
    };
    wall(X0, Z0, X1, Z0); wall(X0, Z1, 5.85, Z1); wall(7.05, Z1, X1, Z1); wall(X0, Z0, X0, Z1); wall(X1, Z0, X1, ZM - 0.52); wall(X1, ZM + 0.52, X1, Z1);
    for (const [x, y] of [[5.98, 0.16], [6.14, 0.08], [6.88, 0.14]]) { const g = kit.rock(0.15, rng, 0.8); g.translate(x, y, Z1 + rng.range(-0.1, 0.2)); W0.add(g, 'concrete'); }
    // columns, plates and rails on the long walls
    for (const z of [Z0, Z1]) {
      for (let i = 0; i <= nx; i++) { const x = X0 + i * bx; mem([x, KY, z], [x, EY, z], 0.078); }
      const breakX = z === Z1 ? [5.85, 7.05] : null;
      for (let i = 0; i < nx; i++) {
        const a = X0 + i * bx, b = a + bx;
        mem([a, EY, z], [b, EY, z], 0.074); mem([a, KY + 0.05, z], [b, KY + 0.05, z], 0.058);
        const skip = breakX && a < breakX[1] && b > breakX[0];
        if (!skip) mem([a, 1.0, z], [b, 1.0, z], 0.04, WHITE2);
        if (!skip || rng() < 0.3) for (const t of [0.5]) if (rng() > 0.16) mem([lerp(a, b, t), KY + 0.05, z], [lerp(a, b, t), EY, z], 0.034, WHITE2);
        for (const [y0, y1] of [[KY + 0.08, 1.0], [1.0, EY]]) for (const k of [0, 0.5]) {
          if (rng() < 0.3 && !skip) paneShard(new V(a + k * bx + 0.02, y0, z), new V(1, 0, 0), new V(0, 1, 0), bx / 2 - 0.04, y1 - y0 - 0.02, rng() < 0.15 ? 0 : rng.int(1, 4));
        }
      }
    }
    // gables
    for (const x of [X0, X1]) {
      const door = x === X1;
      for (let k = 0; k <= nz; k++) {
        const z = Z0 + k * bz, top = lerp(EY, RY, 1 - Math.abs(z - ZM) / (ZM - Z0));
        if (door && k === 2) { mem([x, EY + 0.25, z], [x, top, z], 0.05); continue; }
        mem([x, KY, z], [x, top, z], k === 0 || k === nz ? 0.078 : 0.066);
      }
      for (let k = 0; k < nz; k++) {
        const a = Z0 + k * bz, b = a + bz;
        if (!(door && (k === 1 || k === 2))) { mem([x, 1.0, a], [x, 1.0, b], 0.04, WHITE2); mem([x, EY, a], [x, EY, b], 0.05); }
        for (let r = 0; r < 2; r++) if (rng() < 0.32 && !(door && (k === 1 || k === 2))) {
          const y0 = r ? 1.0 : KY + 0.08, y1 = r ? EY : 1.0; paneShard(new V(x, y0, a + 0.02), new V(0, 0, 1), new V(0, 1, 0), bz - 0.04, y1 - y0 - 0.02, rng.int(1, 4));
        }
      }
    }
    // door on the +x gable, hanging ajar, with a fan light above
    {
      const hz = ZM + 0.52, dy = 2.02, lz = ZM - 0.52;
      mem([X1, 0, lz], [X1, dy, lz], 0.07); mem([X1, 0, hz], [X1, dy, hz], 0.07); mem([X1, dy, lz], [X1, dy, hz], 0.07);
      const arc = []; for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI; arc.push([X1, dy + Math.sin(a) * 0.36, ZM + Math.cos(a) * 0.52]); }
      fine(kit.tube(arc, 0.03, 0.03, 5, 16), WHITE);
      for (const a of [0.5, 1.05, 1.57, 2.09, 2.64]) mem([X1, dy, ZM], [X1, dy + Math.sin(a) * 0.36, ZM + Math.cos(a) * 0.52], 0.024);
      paneShard(new V(X1 - 0.005, dy, ZM - 0.48), new V(0, 0, 1), new V(0, 1, 0), 0.5, 0.3, 1);
      const f = frame(X1, hz, -2.2, 0.02), W = 1.0, H = 1.96;
      for (const [a, b] of [[[0, 0, 0], [W, 0, 0]], [[0, H, 0], [W, H, 0]], [[0, 0, 0], [0, H, 0]], [[W, 0, 0], [W, H, 0]], [[0, 0.95, 0], [W, 0.95, 0]], [[W / 2, 0.95, 0], [W / 2, H, 0]]]) fine(sq(a, b, 0.06), WHITE, f.m);
      const lower = kit.box(W, 0.8, 0.02); lower.translate(W / 2, 0.45, 0); f.add(lower, 'flat', WHITE2);
      const handle = kit.sphere(0.04, 6, 5); handle.translate(W - 0.08, 1.02, 0.05); f.add(handle, 'flat', P.rust);
      paneShard(f.p(W / 2 + 0.02, 1.0, 0), f.d(1, 0, 0), f.d(0, 1, 0), W / 2 - 0.04, 0.9, 0);
      const pl = decal(0.64, 0.155, 'plate'); pl.rotateY(Math.PI / 2); pl.translate(X1 + 0.05, 1.8, ZM + 0.84); W0.add(pl, signMat);
      const bk = kit.box(0.02, 0.17, 0.66); bk.translate(X1 + 0.038, 1.8, ZM + 0.84); W0.add(bk, 'flat', P.rustDark);
    }
    // roof: rafters, ridge, purlins. Rafters round the two holes are torn and bent upward by what came through.
    const slopeRun = (x, side, t, c) => {
      const steps = 4; let lastOK = true;
      for (let i = 0; i < steps; i++) {
        const a = slope(x, i / steps, side), b = slope(x, (i + 1) / steps, side), mx = (a[0] + b[0]) / 2, mz = (a[2] + b[2]) / 2;
        if (inHole(mx, mz)) {
          if (lastOK) { const dx = rng.range(-0.15, 0.15); mem(a, [a[0] + dx, a[1] + 0.3, a[2] + side * rng.range(-0.28, -0.06)], t * 0.85, STAIN); }
          lastOK = false; continue;
        }
        if (!lastOK) { const dx = rng.range(-0.1, 0.1); mem([a[0] + dx, a[1] + 0.26, a[2] + side * 0.16], a, t * 0.85, STAIN); }
        lastOK = true; mem(a, b, t, c);
      }
    };
    for (let i = 0; i <= nx; i++) {
      const x = X0 + i * bx; slopeRun(x, -1, 0.066, WHITE); slopeRun(x, 1, 0.066, WHITE);
      if (i < nx) { const xm = x + bx / 2; for (const side of [-1, 1]) if (rng() > 0.25) slopeRun(xm, side, 0.032, WHITE2); }
      if (i > 0 && i < nx) for (const z of [Z0, Z1]) { // cast iron eave brackets
        const s = z === Z0 ? 1 : -1;
        fine(kit.tube([[x, EY - 0.34, z], [x, EY - 0.16, z + s * 0.05], [x, EY - 0.02, z + s * 0.18], [x, EY + 0.1, z + s * 0.38]], 0.024, 0.024, 4, 7), WHITE);
      }
    }
    mem([X0 - 0.06, RY + 0.02, ZM], [X1 + 0.06, RY + 0.02, ZM], 0.08);
    for (let i = 0; i <= 14; i++) { const x = lerp(X0 + 0.05, X1 - 0.05, i / 14), r = kit.torus(0.065, 0.014, 3, 8); r.translate(x, RY + 0.125, ZM); fine(r, WHITE); }
    mem([X0, RY + 0.195, ZM], [X1, RY + 0.195, ZM], 0.022);
    for (const x of [X0 - 0.04, X1 + 0.04]) { const s = kit.sphere(0.07, 8, 6); s.translate(x, RY + 0.25, ZM); W0.add(s, 'flat', WHITE); const c = kit.cylBase(0, 0.035, 0.19, 6); c.translate(x, RY + 0.3, ZM); W0.add(c, 'flat', WHITE); const n = kit.cylBase(0.045, 0.06, 0.16, 8); n.translate(x, RY + 0.08, ZM); W0.add(n, 'flat', WHITE2); }
    for (const side of [-1, 1]) for (const s of [0.34, 0.68]) for (let i = 0; i < nx; i++) {
      const a = slope(X0 + i * bx, s, side), b = slope(X0 + (i + 1) * bx, s, side);
      if (inHole((a[0] + b[0]) / 2, a[2], 0.1) || rng() < 0.14) continue;
      mem(a, b, 0.036, WHITE2);
    }
    // remaining roof panes
    for (const side of [-1, 1]) for (let i = 0; i < nx * 2; i++) for (let r = 0; r < 3; r++) {
      const x = X0 + (i / 2) * bx, s0 = r * 0.34, s1 = Math.min(1, s0 + 0.34), o = new V(...slope(x + 0.02, s0 + 0.01, side)), up = new V(...slope(x + 0.02, s1 - 0.01, side));
      if (rng() > 0.17 || inHole(x + bx / 4, o.z, 0.2)) continue;
      const h = up.distanceTo(o); paneShard(o, new V(1, 0, 0), up.sub(o).normalize(), bx / 2 - 0.04, h, rng() < 0.12 ? 0 : rng.int(1, 4));
    }
    // an opened roof vent, propped on its rack
    { const a = slope(X0 + bx, 0.68, -1), b = slope(X0 + 2 * bx, 0.68, -1), out = [0, 0.3, -0.34];
      const add = (p) => [p[0] + out[0], p[1] + out[1], p[2] + out[2]], r0 = slope(X0 + bx, 1, -1), r1 = slope(X0 + 2 * bx, 1, -1);
      mem(r0, add(a), 0.04); mem(r1, add(b), 0.04); mem(add(a), add(b), 0.04); mem([(r0[0] + r1[0]) / 2, r0[1], r0[2]], [(a[0] + b[0]) / 2 + out[0], a[1] + out[1], a[2] + out[2]], 0.024, WHITE2);
      mem(a, add(a), 0.022, P.rust); paneShard(tv(add(a)), new V(1, 0, 0), new V(...r0).sub(tv(add(a))).normalize(), bx - 0.03, 0.42, 1); }

    // floor: earth, brick aisle
    W0.add(kit.plate([[X0 + 0.08, Z0 + 0.08], [X1 - 0.08, Z0 + 0.08], [X1 - 0.08, Z1 - 0.08], [X0 + 0.08, Z1 - 0.08]], null, GY + 0.02, 0.1), 'flat', '#8a6a4c');
    for (let i = 0; i < 12; i++) for (let k = 0; k < 3; k++) {
      if (rng() < 0.13) continue;
      const g = kit.box(0.42, 0.05, 0.3); kit.chip(g, 0.008, rng); g.rotateY(rng.range(-0.05, 0.05)); g.translate(X0 + 0.3 + i * 0.46 + (k % 2) * 0.12, GY + 0.05 + rng.range(-0.008, 0.01), ZM - 0.32 + k * 0.32); W0.add(g, 'flat', rng.pick(['#c48a68', '#b97b5c', '#cf9a74']));
    }
    // staging benches
    const benchTop = 0.8, TER = ['#c8744a', '#d68a5c', '#bb6a44'];
    const pot = (x, y, z, r, tilt = 0, yaw = 0, flat = false) => {
      const h = r * 1.2, m = kit.xf({ pos: [x, y, z], rot: [tilt, yaw, flat ? 0.1 : 0] }), c = rng.pick(TER);
      const a = kit.cylBase(r, r * 0.68, h, 8, true); a.applyMatrix4(m); W0.add(a, 'flat', c);
      const rim = kit.cylBase(r * 1.1, r * 1.1, h * 0.22, 8, true); rim.translate(0, h * 0.8, 0); rim.applyMatrix4(m); W0.add(rim, 'flat', c);
      const lip = kit.torus(r * 1.05, r * 0.06, 3, 8); lip.rotateX(Math.PI / 2); lip.translate(0, h, 0); lip.applyMatrix4(m); W0.add(lip, 'flat', c);
      const soil = kit.cyl(r * 1.02, r * 1.02, 0.01, 8); soil.translate(0, h * 0.88, 0); soil.applyMatrix4(m); W0.add(soil, 'flat', tilt ? '#6d5438' : P.soilDark);
    };
    const benchAt = (z) => {
      const x0 = X0 + 0.3, x1 = X1 - 0.34, y = benchTop;
      for (const dz of [-0.28, -0.1, 0.08, 0.26]) { const g = kit.box(x1 - x0, 0.035, 0.15); g.translate((x0 + x1) / 2, y, z + dz); W0.add(g, 'flat', '#c9a06c'); }
      for (let i = 0; i <= 3; i++) { const x = lerp(x0 + 0.1, x1 - 0.1, i / 3); for (const dz of [-0.31, 0.31]) W0.add(sq([x, GY - 0.02, z + dz], [x, y - 0.02, z + dz], 0.045), 'flat', P.metalDark); W0.add(sq([x, y - 0.05, z - 0.33], [x, y - 0.05, z + 0.33], 0.04), 'flat', P.metalDark); W0.add(sq([x, 0.3, z - 0.31], [x, 0.3, z + 0.31], 0.03), 'flat', P.metalDark); }
      W0.add(sq([x0, 0.3, z - 0.31], [x1, 0.3, z - 0.31], 0.024), 'flat', P.metalDark);
      let x = x0 + 0.2;
      while (x < x1 - 0.1) {
        const r = rng.range(0.11, 0.17), zz = z + rng.range(-0.18, 0.18);
        if (rng() > 0.16) {
          pot(x, y + 0.018, zz, r);
          const k = rng(), c = new V(x, y + r * 1.2 + 0.1, zz);
          if (k < 0.5) { clump(staticLeaves, c, 0.2, 0.17, 0.2, 18, { s: [0.09, 0.15], hemi: true }); if (k < 0.3) bloomsOn(staticLeaves, c, 0.2, 0.17, 0.2, 4, [P.red, P.bougainLit, P.flowerWhite], [0.05, 0.07]); }
          else if (k < 0.75) for (let i = 0; i < 6; i++) { const a = rng() * TAU; leaf(staticLeaves, c.clone().setY(y + r * 1.1), new V(Math.cos(a), 1.5, Math.sin(a)), new V(0, 1, 0), 0.26, 0.05, col(P.leafDeep), col(P.grass)); }
        }
        x += r * 2 + rng.range(0.06, 0.2);
      }
    };
    benchAt(Z0 + 0.5); benchAt(Z1 - 0.5);
    // stacked empties, a dropped pot, and a watering can on the aisle
    for (let i = 0; i < 4; i++) pot(3.98, GY + 0.04 + i * 0.075, ZM - 0.52, 0.14);
    pot(5.32, GY + 0.1, ZM + 0.05, 0.14, 1.3, 0.8);
    for (let i = 0; i < 4; i++) { const g = kit.box(rng.range(0.08, 0.14), 0.02, rng.range(0.06, 0.1)); g.rotateY(rng() * 3); g.translate(5.5 + rng.range(-0.2, 0.3), GY + 0.09, ZM + rng.range(-0.1, 0.2)); W0.add(g, 'flat', TER[0]); }
    { const f = frame(6.72, ZM - 0.2, 0.7, GY + 0.08);
      const body = kit.cylBase(0.13, 0.15, 0.27, 12); f.add(body, 'rust', '#c9b39a');
      const lid = kit.cyl(0.135, 0.135, 0.015, 12); lid.translate(0, 0.28, 0); f.add(lid, 'flat', P.metalDark);
      f.add(kit.tube([[0.13, 0.05, 0], [0.26, 0.16, 0], [0.36, 0.36, 0]], 0.03, 0.02, 5, 6), 'rust', '#c9b39a');
      const rose = kit.cylBase(0.065, 0.02, 0.05, 8); rose.rotateZ(-0.5); rose.translate(0.37, 0.36, 0); f.add(rose, 'rust');
      f.add(kit.tube([[-0.14, 0.05, 0], [-0.25, 0.2, 0], [-0.12, 0.33, 0], [0.08, 0.3, 0]], 0.012, 0.012, 4, 9), 'flat', P.metalDark); }

    // tomato canes along the benches: stakes, stems, fruit
    const TOM = ['#e05a3f', '#ee7a45', '#d9473a', '#f0a24a', '#a9cf5a'];
    const tomato = (p, r) => { const g = kit.sphere(r, 6, 4); g.scale(1, 0.9, 1); g.translate(p.x, p.y, p.z); W0.add(g, 'flat', rng.pick(TOM)); };
    const cane = (x, z, top) => {
      W0.add(bar([x + 0.04, GY, z], [x + 0.03, top, z + 0.02], 0.014, 4, true), 'flat', '#c9a877');
      const pts = []; for (let i = 0; i <= 6; i++) { const u = i / 6; pts.push([x + Math.sin(u * 7 + x) * 0.05, GY + u * (top - GY), z + Math.cos(u * 7 + x) * 0.05]); }
      W0.add(kit.tube(pts, 0.024, 0.012, 4, 12, { capEnds: false }), 'flat', '#4f8f52');
      const seg = Math.ceil(top / 0.5);
      for (let i = 0; i < seg; i++) {
        const u = (i + 0.6) / seg, c = new V(x + rng.range(-0.08, 0.08), lerp(0.55, top, u), z + rng.range(-0.08, 0.08));
        clump(staticLeaves, c, rng.range(0.27, 0.36), 0.28, rng.range(0.27, 0.36), 30, { s: [0.13, 0.22], inner: 0.45 });
        for (let f = 0, n = rng.int(2, 5); f < n; f++) tomato(new V(c.x + rng.range(-0.26, 0.26), c.y - rng.range(0.05, 0.3), c.z + rng.range(-0.26, 0.26)), rng.range(0.05, 0.075));
      }
    };
    const shakyTop = () => rng.range(1.35, 1.7);
    for (const x of [4.0, 6.5, 8.3]) { cane(x, Z1 - 0.32 - rng.range(0, 0.1), shakyTop()); }
    for (const x of [4.7, 6.05, 8.5]) { cane(x, Z0 + 0.3 + rng.range(0, 0.1), shakyTop()); }

    // the two great plants that broke the roof: thick stems up through the holes
    HOLES.forEach((h, i) => {
      for (let k = 0; k < 3; k++) {
        const a = rng() * TAU, base = [h.x + Math.cos(a) * 0.32, GY - 0.02, h.z + Math.sin(a) * 0.24];
        W0.add(kit.tube([base, [h.x + Math.cos(a + 1) * 0.3, 0.9, h.z + Math.sin(a + 1) * 0.22], [h.x + Math.cos(a + 2) * 0.2, 1.7, h.z + Math.sin(a + 2) * 0.16], [h.x + Math.cos(a + 3) * 0.3, 2.4, h.z + Math.sin(a + 3) * 0.2]], 0.05, 0.02, 5, 12), 'flat', i ? '#5a9652' : '#6d9a4f');
      }
      clump(staticLeaves, new V(h.x, 1.25, h.z), 0.62, 0.62, 0.58, 120, { s: [0.16, 0.26], inner: 0.5 });
      clump(staticLeaves, new V(h.x, 0.5, h.z), 0.62, 0.4, 0.5, 60, { s: [0.16, 0.24], inner: 0.5, hemi: true });
    });
    // burst out of the south wall where the knee wall gave way
    { const c = new V(6.42, 0.62, Z1 + 0.05);
      clump(staticLeaves, c, 0.92, 0.62, 0.56, 170, { s: [0.15, 0.25] });
      bloomsOn(staticLeaves, c, 0.92, 0.62, 0.56, 34, [P.bougainLit, P.bougain, P.flowerWhite, P.sunGold], [0.09, 0.13]);
      vine([[6.0, 0.2, Z1 + 0.3], [5.6, 0.1, Z1 + 0.5], [5.1, 0.05, Z1 + 0.42]], 0.016, 20, { blooms: 4, colors: [P.bougainLit, P.flowerWhite] });
      for (const [x, z] of [[5.6, 18.3], [7.3, 18.35], [6.4, 18.5]]) tuftsAround(x, z, 0.24, 6, [0.3, 0.6]); }
    // climbers on the outside of the frame
    vine([[X0, 0.1, Z1], [X0 + 0.02, 0.9, Z1 + 0.04], [X0 + 0.04, EY, Z1], [X0 + 0.5, lerp(EY, RY, 0.3), Z1 - 0.72], [X0 + 0.42, RY - 0.14, ZM + 0.42]], 0.02, 56, { blooms: 8, colors: [P.bougainLit, P.flowerWhite] });
    vine([[X1, 0.1, Z0], [X1 + 0.02, 1, Z0 + 0.03], [X1, EY, Z0 + 0.06], [X1 - 0.4, lerp(EY, RY, 0.4), Z0 + 0.9], [X1 - 0.3, RY, ZM]], 0.02, 46, { blooms: 6 });
    vine([[X1, 0.1, Z1], [X1 + 0.03, 0.9, Z1 + 0.02], [X1, 1.55, Z1], [8.0, 1.66, Z1 + 0.02], [7.1, 1.6, Z1]], 0.018, 40, { blooms: 6, colors: [P.flowerYellow, P.flowerWhite] });
    // grass working along the wall feet
    for (let i = 0; i < 70; i++) { const t = rng(), s = rng.int(0, 3), o = rng.range(0.1, 0.38); const [x, z] = [[lerp(X0, X1, t), Z0 - o], [lerp(X0, X1, t), Z1 + o], [X0 - o, lerp(Z0, Z1, t)], [X1 + o, lerp(Z0, Z1, t)]][s]; tuft(x, z, rng.range(0.3, 0.62)); }
    for (let i = 0; i < 26; i++) { const x = rng.range(X0 + 0.3, X1 - 0.3), z = rng() < 0.5 ? rng.range(Z0 + 0.15, ZM - 0.55) : rng.range(ZM + 0.55, Z1 - 0.15); tuft(x, z, rng.range(0.3, 0.55)); }
  }

  // What burst through the roof: a loose heap of lobes slumped over the torn glazing, each mesh pivoted at its hole.
  const plumes = [];
  const slopeY = (z) => lerp(GH.RY, GH.EY, Math.abs(z - GH.ZM) / (GH.ZM - GH.Z0));
  HOLES.forEach((h, i) => {
    const buf = newBuf(), base = slopeY(h.z), out = Math.sign(h.z - GH.ZM), lobes = [[0, 0.3, 0, 0.56, 0.38, 0.5, 86]];
    for (let k = 0, n = 6; k < n; k++) {
      const a = (k / n) * TAU + rng.range(-0.3, 0.3), q = rng.range(0.42, 0.74), r = rng.range(0.24, 0.4), dz = Math.sin(a) * q * 0.9;
      lobes.push([Math.cos(a) * q * 1.15, (-dz * out) * 0.36 + 0.1 + rng.range(-0.02, 0.1), dz, r * 1.2, r * 0.72, r, 34]);
    }
    lobes.push([rng.range(-0.18, 0.18), 0.7, rng.range(-0.12, 0.12), 0.36, 0.24, 0.32, 38]);
    for (const [x, y, z, rx, ry, rz, n] of lobes) {
      const c = new V(x, y, z); clump(buf, c, rx, ry, rz, n, { s: [0.13, 0.22], inner: 0.6 });
      bloomsOn(buf, c, rx, ry, rz, Math.round(n * 0.2), i ? [P.flowerWhite, P.sunGold, P.flowerYellow, P.flowerWhite] : [P.bougainLit, P.bougain, P.flowerWhite, P.bougainLit], [0.07, 0.105]);
    }
    const m = leafMesh(buf, { shadow: false }); m.position.set(h.x, base, h.z); group.add(m);
    plumes.push({ m, x: h.x, z: h.z, ph: i * 2.1 });
    const pg = kit.sphere(1, 8, 6); pg.scale(0.95, 0.34, 0.8); pg.translate(h.x, base + 0.16, h.z); proxy.push(pg);
    // sprays arching out of the heap
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU + 0.4 + i, o = new V(h.x + Math.cos(a) * 0.14, base + 0.2, h.z + Math.sin(a) * 0.12), t = new V(h.x + Math.cos(a) * 0.72, base + rng.range(0.62, 0.86), h.z + Math.sin(a) * 0.62), e = new V(h.x + Math.cos(a) * 1.02, base + rng.range(0.38, 0.6), h.z + Math.sin(a) * 0.86);
      vine([o, o.clone().lerp(t, 0.55).setY(t.y - 0.02), t, e], 0.016, 16, { s: [0.11, 0.17], blooms: 4, colors: i ? [P.flowerWhite, P.flowerYellow] : [P.bougainLit, P.flowerWhite] });
    }
    // runners slipping down the panes from the heap
    for (const dx of [-0.75, 0.2, 0.85]) {
      const x0 = h.x + dx * 0.7, z0 = h.z + out * 0.3, z1 = h.z + out * rng.range(0.7, 1.05), x1 = x0 + rng.range(-0.25, 0.25), z2 = (out > 0 ? Math.min(z1 + 0.3, GH.Z1 - 0.02) : Math.max(z1 - 0.3, GH.Z0 + 0.02));
      vine([[x0, slopeY(z0) + 0.1, z0], [(x0 + x1) / 2, slopeY((z0 + z1) / 2) + 0.05, (z0 + z1) / 2], [x1, slopeY(z1) + 0.04, z1], [x1 + 0.08, slopeY(z2) + 0.03, z2]], 0.016, 26, { blooms: 6, colors: i ? [P.flowerWhite, P.flowerYellow] : [P.bougainLit, P.flowerWhite], s: [0.11, 0.18] });
    }
  });

  // ================================================================ SUNFLOWERS
  {
    const Z = MEADOW.sunflowers, plants = [], clearSpot = FLOWER_SPOTS[10];
    const ok = (x, z) => !inRiver(x, z, 0.55) && !nearTrunk(x, z, 0.72) && Math.hypot(x - clearSpot[0], z - clearSpot[2]) > 0.62 && z < 19.72;
    const step = 0.5;
    for (let j = 0, zz = Z.z[0] + 0.1; zz < Z.z[1] + 0.05; zz += step * 0.9, j++) for (let xx = Z.x[0] + (j % 2) * step * 0.5; xx < Z.x[1]; xx += step) {
      const x = xx + rng.range(-0.2, 0.2), z = zz + rng.range(-0.17, 0.17), edge = Math.min(x - Z.x[0], Z.x[1] - x);
      if (!ok(x, z) || (edge < 0.7 && rng() > edge / 0.7 + 0.25)) continue;
      const north = clamp01((Z.z[1] - z) / (Z.z[1] - Z.z[0]));
      plants.push({ x, z, s: lerp(0.72, 1.14, north) * rng.range(0.92, 1.08) * (0.86 + 0.14 * clamp01(edge / 1.2)) });
    }
    // stem with broad leaves, built 2 units tall, uniform scale per plant
    const H = 2;
    const sg = (() => {
      const buf = newBuf(), r = ctx.seeded('sfleaf');
      const dark = col('#2f8a5a'), mid = col('#4fae59'), lit = col('#7fcf55');
      for (let i = 0; i < 9; i++) {
        const u = 0.22 + (i / 8) * 0.68, a = i * 2.4 + r() * 0.5, l = lerp(0.56, 0.3, u) * (0.9 + r() * 0.25), out = new V(Math.cos(a), 0, Math.sin(a));
        const shell = out.clone().multiplyScalar(0.7).setY(0.9).normalize(), tip = out.clone().setY(lerp(-0.38, 0.1, u)).normalize();
        petal(buf, new V(out.x * 0.03, u * H, out.z * 0.03), tip, shell, l, l * 0.86, dark, r() < 0.5 ? mid : lit);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(buf.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(buf.n, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(buf.c, 3));
      const stem = paintGeo(kit.tube([[0, -0.02, 0], [0.012, H * 0.5, -0.01], [0, H, 0]], 0.032, 0.022, 5, 4, { capEnds: false }), '#5a9e4e');
      return kit.merge([stem, g]);
    })();
    // head, face toward +y
    const hg = (() => {
      const buf = newBuf(), r = ctx.seeded('sfhead'), up = new V(0, 1, 0);
      const pB = col('#ee9a1e'), pT = col('#ffc53a'), fB = col('#ffb42c'), fT = col('#ffe066');
      for (const [n, rad, l, w, y, c0, c1, off] of [[11, 0.13, 0.27, 0.135, -0.012, pB, pT, 0.5], [11, 0.13, 0.22, 0.13, 0.004, fB, fT, 0]]) {
        for (let i = 0; i < n; i++) {
          const a = ((i + off) / n) * TAU + (r() - 0.5) * 0.08, d = new V(Math.cos(a), 0.1 + r() * 0.05, Math.sin(a));
          leaf(buf, new V(d.x * rad, y, d.z * rad), d, up, l * (0.92 + r() * 0.16), w, c0, c1);
        }
      }
      // disc: greenish eye, dark seed ring, warm rim
      const rings = [[0, 0.05, '#8f9a3e'], [0.05, 0.045, '#8f7a34'], [0.085, 0.04, '#5a3a26'], [0.135, 0.025, '#6e4a2a'], [0.165, 0.002, '#a06a2c']], seg = 8;
      for (let k = 0; k < rings.length - 1; k++) {
        const [r0, y0, c0] = rings[k], [r1, y1, c1] = rings[k + 1], C0 = col(c0), C1 = col(c1);
        for (let i = 0; i < seg; i++) {
          const a = (i / seg) * TAU, b = ((i + 1) / seg) * TAU, p = (rr, yy, aa) => [Math.cos(aa) * rr, yy, Math.sin(aa) * rr];
          const A = p(r0, y0, a), B = p(r0, y0, b), Cc = p(r1, y1, a), D = p(r1, y1, b), tri = (x, cx, y, cy, z, cz) => { pushV(buf, ...x, up, cx); pushV(buf, ...y, up, cy); pushV(buf, ...z, up, cz); };
          if (r0 > 0) tri(A, C0, B, C0, D, C1); tri(A, C0, D, C1, Cc, C1);
        }
      }
      // green back: sepals and cup, read from the shaded side
      const sepalB = col('#3f9a5c'), sepalT = col('#7fcf55'), down = new V(0, -1, 0);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU, d = new V(Math.cos(a), -0.28, Math.sin(a)); leaf(buf, new V(d.x * 0.05, -0.05, d.z * 0.05), d, down, 0.27, 0.13, sepalB, sepalT); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(buf.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(buf.n, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(buf.c, 3));
      const cup = paintGeo(kit.cylBase(0.17, 0.05, 0.1, 9, true).translate(0, -0.1, 0), '#4fae59');
      const neck = paintGeo(kit.tube([[0, -0.1, 0], [0, -0.2, 0.02], [0, -0.32, 0.1]], 0.026, 0.022, 3, 3, { capEnds: false }), '#5a9e4e');
      return kit.merge([g, cup, neck]);
    })();
    const sway = makeSway(1.5, 0.05, 0.007), stemItems = [], headItems = [];
    const aim = new V(SUN.x, 0.74, 0.2).normalize(), tints = ['#ffffff', '#ffffff', '#fff2cc', '#ffe0a8'].map(col), hq = new Q();
    for (const p of plants) {
      const h = H * p.s, nod = new V(aim.x + rng.range(-0.2, 0.2), aim.y, aim.z + rng.range(-0.14, 0.14)).normalize();
      hq.setFromUnitVectors(UP, nod);
      const hx = p.x + nod.x * 0.14, hz = p.z + nod.z * 0.14, hy = h + 0.1;
      stemItems.push({ x: p.x, z: p.z, ph: p.x * 3.1 + p.z * 2.3, m: instM(p.x, GY - 0.02, p.z, yawQ(rng() * TAU), p.s), c: col('#ffffff').multiplyScalar(rng.range(0.93, 1.07)) });
      headItems.push({ x: hx, z: hz, sx: p.x, sz: p.z, ph: p.x * 3.1 + p.z * 2.3, h: hy, m: instM(hx, hy + GY, hz, hq.clone(), rng.range(1.0, 1.28)), c: rng.pick(tints) });
      const d = kit.ico(0.24, 0); d.scale(1, 0.4, 1); d.translate(hx, hy, hz); proxy.push(d);
      proxy.push(bar([p.x, 0, p.z], [p.x, h, p.z], 0.1, 3, true));
    }
    const stems = instanced(sg, leafMat, stemItems), heads = instanced(hg, headMat, headItems, { soft: false });
    swayInst(sway, stems, stemItems); swayInst(sway, heads, headItems, true);
    // a dark bank of lower leaves, so the gold stands on shade instead of on bare stalks
    const low = [P.leafShade, P.leafDeep, P.leafDeep, P.leafMid].map(col);
    for (let i = 0; i < 22; i++) { const x = rng.range(Z.x[0] + 0.3, Z.x[1] - 0.2), z = rng.range(Z.z[0] + 0.25, Z.z[1] - 0.2); if (ok(x, z)) clump(staticLeaves, new V(x, 0.38, z), rng.range(0.55, 0.8), rng.range(0.28, 0.42), rng.range(0.42, 0.6), 28, { pal: low, s: [0.2, 0.32], inner: 0.5, hemi: true }); }
    // skirts of grass at the foot of the patch
    for (let i = 0; i < 90; i++) { const x = rng.range(Z.x[0] - 0.4, Z.x[1] + 0.5), z = rng() < 0.6 ? rng.range(16.7, 17.3) : rng.range(19.1, 19.7); if (!inRiver(x, z, 0.35) && !nearTrunk(x, z, 0.4)) tuft(x, z, rng.range(0.32, 0.66)); }
  }

  // ================================================================ STREET RELICS
  const slab = (x, z, w, d, yaw) => { const f = frame(x, z, yaw); const g = kit.boxBase(w, 0.2, d, 3, 1, 3); kit.chip(g, 0.02, rng); g.translate(0, -0.09, 0); f.add(g, 'concrete'); };
  { // phone box: the lamp is long dead, the phone is out of order, the morning glory has moved in
    const { x, z } = MEADOW.phoneBox, yaw = 0.42, f = frame(x, z, yaw, 0.11, 0.012, -0.05), W = 0.5, H = 2.06, G = '#4c9a7d', FR = '#e6e8dc', CREAM = '#efeadb';
    slab(x, z, 1.3, 1.3, yaw);
    const post = (a, b) => { const g = kit.boxBase(0.08, H, 0.08); g.translate(a, 0, b); f.add(g, 'flat', FR); };
    post(-W, -W); post(W, -W); post(-W, W); post(W, W);
    const floor = kit.boxBase(1.06, 0.05, 1.06); f.add(floor, 'flat', P.concreteMid);
    for (const y of [0.16, 0.98, H - 0.03]) for (const [a, b, c, d] of [[-W, -W, W, -W], [-W, -W, -W, W], [W, -W, W, W]]) f.add(sq([a, y, b], [c, y, d], 0.05), 'flat', FR);
    f.add(sq([-W, H - 0.03, W], [W, H - 0.03, W], 0.05), 'flat', FR);
    const backWall = kit.box(1.0, H - 0.1, 0.03); backWall.translate(0, H / 2, -W + 0.01); f.add(backWall, 'flat', P.concreteLit);
    for (const [a, b, rot] of [[W, 0, 1], [-W, 0, 1]]) { const k = kit.boxBase(rot ? 0.03 : 1, 0.16, rot ? 1 : 0.03); k.translate(a, 0, b); f.add(k, 'flat', G); }
    // glass on both sides, one cracked through
    paneShard(f.p(W, 1.0, -W + 0.05), f.d(0, 0, 1), f.d(0, 1, 0), 0.9, 0.98, 0);
    paneShard(f.p(W, 0.18, -W + 0.05), f.d(0, 0, 1), f.d(0, 1, 0), 0.9, 0.78, 1);
    paneShard(f.p(-W, 1.0, -W + 0.05), f.d(0, 0, 1), f.d(0, 1, 0), 0.9, 0.98, 2);
    paneShard(f.p(-W, 0.18, -W + 0.05), f.d(0, 0, 1), f.d(0, 1, 0), 0.9, 0.78, 0);
    // folding door, jammed part open
    { const m = new THREE.Matrix4().multiplyMatrices(f.m, kit.xf({ pos: [-W, 0.03, W], rot: [0, 0.62, 0] })), add = (g, c = FR) => st.add(g, 'flat', { matrix: m, color: c }), L = 0.98, Hd = H - 0.1;
      for (const [a, b] of [[[0, 0, 0], [0, Hd, 0]], [[L, 0, 0], [L, Hd, 0]], [[0, Hd, 0], [L, Hd, 0]], [[0, 0.04, 0], [L, 0.04, 0]], [[0, 0.95, 0], [L, 0.95, 0]]]) add(sq(a, b, 0.05));
      add(bar([L - 0.08, 0.7, 0.04], [L - 0.08, 1.2, 0.04], 0.012, 5), P.metal);
      const kk = kit.boxBase(L, 0.15, 0.02); kk.translate(L / 2, 0.02, 0); add(kk, G);
      const o = new V(0.03, 0.98, 0).applyMatrix4(m), ex = new V(1, 0, 0).transformDirection(m), ey = new V(0, 1, 0).transformDirection(m);
      paneShard(o, ex, ey, L - 0.06, 0.82, 2);
      paneShard(new V(0.03, 0.18, 0).applyMatrix4(m), ex, ey, L - 0.06, 0.74, 0); }
    // head: sign band on all four sides, cap, ventilator
    const band = kit.boxBase(1.08, 0.25, 1.08); band.translate(0, H, 0); f.add(band, 'flat', G);
    for (const [ang, a, b] of [[0, 0, 0.547], [Math.PI / 2, 0.547, 0], [Math.PI, 0, -0.547], [-Math.PI / 2, -0.547, 0]]) {
      const d = decal(1.04, 0.226, 'phone'); d.rotateY(ang); d.translate(a, H + 0.125, b); f.add(d, signMat);
    }
    const cap = kit.boxBase(1.2, 0.055, 1.2); cap.translate(0, H + 0.25, 0); f.add(cap, 'flat', CREAM);
    const dome = kit.sphere(1, 12, 6); dome.scale(0.58, 0.13, 0.58); dome.translate(0, H + 0.3, 0); f.add(dome, 'flat', G);
    // shelf, telephone, handset dangling on its cord, tag
    const shelf = kit.box(0.82, 0.04, 0.34); shelf.translate(0, 0.98, -W + 0.2); f.add(shelf, 'flat', P.metal);
    const tel = kit.boxBase(0.34, 0.42, 0.2); tel.translate(0, 1.02, -W + 0.15); f.add(tel, 'flat', '#5aa582');
    const face = kit.box(0.24, 0.13, 0.012); face.translate(0, 1.14, -W + 0.255); f.add(face, 'flat', '#d9d6cb');
    for (let i = 0; i < 9; i++) { const k = kit.box(0.044, 0.024, 0.012); k.translate(-0.066 + (i % 3) * 0.066, 1.1 + Math.floor(i / 3) * 0.036, -W + 0.262); f.add(k, 'flat', P.metalDark); }
    f.add(kit.tube([[0.13, 1.2, -W + 0.26], [0.2, 0.86, -W + 0.3], [0.09, 0.56, -W + 0.3], [0.05, 0.42, -W + 0.34]], 0.009, 0.009, 4, 12), 'flat', P.ink);
    const hs = new THREE.CapsuleGeometry(0.03, 0.2, 3, 7); hs.translate(0.05, 0.3, -W + 0.35); f.add(hs, 'flat', '#5aa582');
    const tag = decal(0.2, 0.25, 'notice'); tag.translate(0, 1.62, -W + 0.03); f.add(tag, signMat);
    // moss and creepers
    const R = f.p(0, H + 0.42, 0);
    pad(R.x + 0.16, R.y - 0.08, R.z + 0.12, 0.3, 0.09, 0.27, P.moss); pad(R.x - 0.26, R.y - 0.1, R.z - 0.16, 0.22, 0.06, 0.24, P.mossDeep);
    clump(staticLeaves, new V(R.x + 0.26, R.y - 0.06, R.z + 0.18), 0.44, 0.17, 0.4, 66, { pal: VINE, s: [0.12, 0.19], hemi: true, inner: 0.7, droop: 0.9 });
    const c0 = f.p(W, 0, W), c1 = f.p(W + 0.04, 1.0, W + 0.04);
    vine([c0, c1, f.p(W + 0.02, 1.7, W + 0.03), f.p(W, H + 0.12, W + 0.04), f.p(W - 0.25, H + 0.32, W - 0.05), f.p(0.1, H + 0.4, 0.2)], 0.022, 64, { blooms: 9 });
    vine([f.p(-W, 0, -W), f.p(-W - 0.04, 0.9, -W - 0.03), f.p(-W - 0.03, 1.5, -W), f.p(-W, H + 0.1, -W - 0.04), f.p(-0.2, H + 0.38, -0.2)], 0.018, 38, { blooms: 3 });
    vine([f.p(W, H + 0.27, 0.1), f.p(W + 0.09, H + 0.08, 0.0), f.p(W + 0.11, H - 0.3, -0.1), f.p(W + 0.08, H - 0.64, -0.06)], 0.012, 14, {});
    const inner = f.p(0.12, 0.06, -0.1); clump(staticLeaves, inner.clone().setY(0.28), 0.32, 0.22, 0.3, 26, { s: [0.1, 0.17], hemi: true });
    tuftsAround(x, z, 0.74, 20, [0.32, 0.72]);
  }
  { // round iron post box on a stump of concrete
    const { x, z } = MEADOW.postBox, yaw = 0.58, f = frame(x, z, yaw, 0.1, -0.05, 0.05), RED = P.red, DK = '#a8392f', R = 0.27;
    { const g = kit.boxBase(0.74, 0.17, 0.74, 2, 1, 2); kit.chip(g, 0.022, rng); const m = kit.xf({ pos: [x, -0.05, z], rot: [0, yaw, 0] }); st.add(g, 'concrete', { matrix: m }); }
    const prof = [[0.001, 0], [R + 0.05, 0], [R + 0.05, 0.05], [R + 0.01, 0.09], [R, 0.14], [R, 1.0], [R + 0.03, 1.02], [R + 0.035, 1.06], [R + 0.02, 1.08], [R - 0.02, 1.1]].map(([a, b]) => new THREE.Vector2(a, b));
    f.add(new THREE.LatheGeometry(prof, 18), peel, RED);
    const capPts = []; for (let i = 0; i <= 7; i++) { const a = (i / 7) * Math.PI / 2; capPts.push(new THREE.Vector2(Math.cos(a) * (R + 0.015) + 0.001, 1.1 + Math.sin(a) * 0.22)); }
    f.add(new THREE.LatheGeometry(capPts, 18), peel, RED);
    const knob = kit.sphere(0.032, 7, 5); knob.translate(0, 1.33, 0); f.add(knob, 'flat', DK);
    const band = kit.torus(R + 0.012, 0.012, 4, 18); band.rotateX(Math.PI / 2); band.translate(0, 0.55, 0); f.add(band, 'flat', DK);
    // letter slot with a hood, on the camera side
    const hood = kit.box(0.34, 0.04, 0.11); hood.translate(0, 0.98, R + 0.045); hood.rotateX(0); f.add(hood, 'flat', DK);
    const slot = kit.box(0.26, 0.05, 0.02); slot.translate(0, 0.92, R + 0.005); f.add(slot, 'flat', P.ink);
    const pl = decal(0.34, 0.13, 'post'); pl.translate(0, 0.8, R + 0.026); f.add(pl, signMat);
    const plb = kit.box(0.36, 0.15, 0.02); plb.translate(0, 0.8, R + 0.008); f.add(plb, 'flat', P.rust);
    // collection door, lock
    const door = kit.box(0.3, 0.36, 0.024); door.translate(0, 0.36, R + 0.002); f.add(door, peel, RED);
    const lock = kit.cyl(0.03, 0.03, 0.03, 8); lock.rotateX(Math.PI / 2); lock.translate(0.09, 0.42, R + 0.02); f.add(lock, 'flat', P.metal);
    const tp = decal(0.22, 0.1, 'times'); tp.translate(-0.01, 0.46, R + 0.016); f.add(tp, signMat);
    const top = f.p(0, 1.32, 0);
    pad(top.x, top.y - 0.04, top.z, 0.2, 0.09, 0.19, P.moss); pad(top.x + 0.09, top.y - 0.08, top.z + 0.1, 0.16, 0.08, 0.16, P.mossLit);
    const hel = []; for (let i = 0; i <= 18; i++) { const u = i / 18, a = u * 8.6 + 1.2, r = R + 0.03; hel.push(f.p(Math.cos(a) * r, 0.04 + u * 1.26, Math.sin(a) * r)); }
    vine(hel, 0.016, 56, { s: [0.1, 0.17], blooms: 6, colors: [P.flowerWhite, P.flowerYellow] });
    clump(staticLeaves, top.clone().setY(top.y - 0.03), 0.28, 0.08, 0.27, 28, { pal: VINE, s: [0.09, 0.15], hemi: true, inner: 0.85 });
    tuftsAround(x, z, 0.46, 14, [0.28, 0.58]);
  }

  // ================================================================ ORCHARD PATH + WILDFLOWERS
  // Same polyline as the stepping stones ground.js lays; only its end points are in the layout contract.
  const orch = [MEADOW.orchardPath.from, [8.55, 9.6], [9.1, 10.9], [9.55, 12.2], [9.85, 13.3], [10.35, 15.2], [10.15, 16.8], MEADOW.orchardPath.to];
  const orchLen = orch.slice(1).map((q, i) => Math.hypot(q[0] - orch[i][0], q[1] - orch[i][1])), orchTotal = orchLen.reduce((a, b) => a + b, 0);
  const pathAt = (u) => {
    let d = clamp01(u) * orchTotal, i = 0; while (i < orchLen.length - 1 && d > orchLen[i]) d -= orchLen[i++];
    const a = orch[i], b = orch[i + 1], t = d / orchLen[i], nx = (b[1] - a[1]) / orchLen[i], nz = -(b[0] - a[0]) / orchLen[i];
    return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), nx, nz];
  };
  const pathDist = (x, z) => { let best = 9; for (let i = 0; i < orchLen.length; i++) { const a = orch[i], b = orch[i + 1], ux = b[0] - a[0], uz = b[1] - a[1], t = clamp01(((x - a[0]) * ux + (z - a[1]) * uz) / (orchLen[i] * orchLen[i])); best = Math.min(best, Math.hypot(x - a[0] - ux * t, z - a[1] - uz * t)); } return best; };
  const inGH = (x, z, m = 0.12) => x > GH.X0 - m && x < GH.X1 + m && z > GH.Z0 - m && z < GH.Z1 + m;
  const KIOSK = layout.STREET.kiosk, TL = layout.STREET.trafficLight;
  const relicHit = (x, z) => Math.hypot(x - KIOSK.x, z - KIOSK.z) < 1.5 || Math.hypot(x - TL.x, z - TL.z) < 0.5 || Math.hypot(x - MEADOW.phoneBox.x - 0.2, z - MEADOW.phoneBox.z - 0.4) < 1.15 || Math.hypot(x - MEADOW.postBox.x, z - MEADOW.postBox.z - 0.3) < 0.82 || (x > 12.0 && z < 7);
  const wildOK = (x, z) => !inGH(x, z) && !relicHit(x, z) && !inRiver(x, z, 0.3) && !nearTrunk(x, z, 0.35) && onPlinth(x, z, 0.28) && !inSand(x, z, 0.1) && z > 8.2 && pathDist(x, z) > 0.46;
  const wild = [];
  const scatter = (cx, cz, r, n, kind, h) => {
    for (let i = 0, tries = 0; i < n && tries < n * 5; tries++) {
      const a = rng() * TAU, q = r * Math.sqrt(rng()) * (0.7 + 0.5 * rng()), x = cx + Math.cos(a) * q, z = cz + Math.sin(a) * q;
      if (!wildOK(x, z)) continue;
      wild.push({ x, z, kind: typeof kind === 'function' ? kind() : kind, h: rng.range(h[0], h[1]) }); i++;
    }
  };
  const mix = (p) => () => (rng() < p ? 0 : 1); // 0 cosmos, 1 daisy
  for (let i = 0; i < 12; i++) { // drifts both sides of the path, thinning toward the far end of each drift
    const u = (i + rng.range(0.1, 0.9)) / 12, [px, pz, nx, nz] = pathAt(u), s = i % 2 ? 1 : -1, off = rng.range(0.85, 1.55);
    scatter(px + nx * s * off, pz + nz * s * off, rng.range(0.6, 0.95), rng.int(10, 15), mix(i % 3 === 0 ? 0.3 : 0.72), [0.55, 1.0]);
  }
  scatter(FLOWER_SPOTS[9][0], FLOWER_SPOTS[9][2], 0.62, 16, mix(0.5), [0.42, 0.56]);
  scatter(FLOWER_SPOTS[10][0], FLOWER_SPOTS[10][2], 0.62, 16, mix(0.85), [0.8, 0.98]);
  scatter(FLOWER_SPOTS[11][0], FLOWER_SPOTS[11][2], 0.85, 20, mix(0.8), [0.6, 0.8]);
  scatter(FLOWER_SPOTS[12][0], FLOWER_SPOTS[12][2], 0.8, 18, mix(0.45), [0.44, 0.6]);
  scatter(-15.4, 13.6, 1.1, 10, 1, [0.32, 0.5]); scatter(-18.3, 14.1, 0.8, 10, 1, [0.32, 0.5]); scatter(-15.8, 10.9, 0.8, 8, mix(0.3), [0.4, 0.6]);
  scatter(2.8, 15.8, 0.75, 12, mix(0.7), [0.5, 0.85]); scatter(10.4, 15.6, 0.7, 9, 1, [0.35, 0.5]);
  {
    const sway = makeSway(2.5, 0.075, 0.012), stemItems = [], cosmosItems = [], daisyItems = [];
    const TIPS = [[0, 1, 0.04], [0.17, 0.76, 0.02], [-0.14, 0.62, -0.05]];
    const stemGeo = (() => {
      const buf = newBuf(), up = new V(0.1, 1, 0.1).normalize(), a = col('#3f9a5c'), b = col('#6fbb55');
      const parts = [];
      const strip = (from, to, w) => { const g = kit.blade(from.distanceTo(to), w, 0, 1); g.applyQuaternion(new Q().setFromUnitVectors(UP, to.clone().sub(from).normalize())); g.translate(from.x, from.y, from.z); return g; };
      for (const rot of [0, Math.PI / 2]) { const g = strip(new V(0, -0.02, 0), new V(...TIPS[0]), 0.042); g.rotateY(rot); parts.push(g); }
      parts.push(strip(new V(0.02, 0.36, 0), new V(...TIPS[1]), 0.03), strip(new V(-0.02, 0.28, 0), new V(...TIPS[2]), 0.03));
      const r = ctx.seeded('wildleaf');
      for (let i = 0; i < 5; i++) { const y = 0.14 + i * 0.13, an = i * 2.1; leaf(buf, new V(0, y, 0), new V(Math.cos(an), 0.55, Math.sin(an)), up, 0.26 * (1.1 - y * 0.6), 0.075, a, r() < 0.5 ? b : a); }
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(buf.p, 3)); lg.setAttribute('normal', new THREE.Float32BufferAttribute(buf.n, 3)); lg.setAttribute('color', new THREE.Float32BufferAttribute(buf.c, 3));
      const stems = kit.merge(parts); paintGeo(stems, '#57a452'); const n = stems.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, up.x, up.y, up.z);
      return kit.merge([stems, lg]);
    })();
    const headGeo = (pet, r, w, eyeR, eyeC) => {
      const buf = newBuf(), up = new V(0, 1, 0), white = col('#ffffff'), soft = col('#f0e6e4');
      for (let i = 0; i < pet; i++) { const a = (i / pet) * TAU, d = new V(Math.cos(a), 0.16, Math.sin(a)); petal(buf, new V(d.x * eyeR * 0.5, 0, d.z * eyeR * 0.5), d, up, r, w, soft, white); }
      const e = col(eyeC), seg = 6; for (let i = 0; i < seg; i++) { const a = (i / seg) * TAU, b = ((i + 1) / seg) * TAU; pushV(buf, 0, 0.022, 0, up, e); pushV(buf, Math.cos(b) * eyeR, 0.012, Math.sin(b) * eyeR, up, e); pushV(buf, Math.cos(a) * eyeR, 0.012, Math.sin(a) * eyeR, up, e); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(buf.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(buf.n, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(buf.c, 3)); return g;
    };
    const COS = ['#ff9ac6', '#f76fa8', '#fbf6e6', '#e45fae', '#ffc2dd', '#ff9ac6'].map(col), DAI = ['#ffffff', '#fbf6e6', '#fff0b8', '#c9dcff'].map(col);
    const tilt = new Q();
    for (const w of wild) {
      const yaw = rng() * TAU, cy = Math.cos(yaw), sy = Math.sin(yaw), ph = w.x * 2.7 + w.z * 1.9;
      stemItems.push({ x: w.x, z: w.z, ph, m: instM(w.x, GY - 0.02, w.z, yawQ(yaw), new V(w.h * 0.9, w.h, w.h * 0.9)), c: col('#ffffff').multiplyScalar(rng.range(0.9, 1.1)) });
      const n = w.kind ? rng.int(1, 2) : rng.int(2, 3), tint = rng.pick(w.kind ? DAI : COS);
      for (let i = 0; i < n; i++) {
        const [a, b, c] = TIPS[i], lx = a * w.h * 0.9, lz = c * w.h * 0.9, X = w.x + lx * cy + lz * sy, Z = w.z - lx * sy + lz * cy, Y = b * w.h;
        tilt.setFromUnitVectors(UP, new V(SUN.x * 0.5 + rng.range(-0.3, 0.3), 1, SUN.z * 0.2 + rng.range(-0.25, 0.35)).normalize());
        (w.kind ? daisyItems : cosmosItems).push({ x: X, z: Z, sx: w.x, sz: w.z, ph, h: Y, m: instM(X, Y + GY - 0.02, Z, tilt.clone(), rng.range(0.85, 1.2)), c: i ? tint.clone().multiplyScalar(0.97) : tint });
      }
    }
    const stems = instanced(stemGeo, leafMat, stemItems);
    const cosmos = instanced(headGeo(8, 0.122, 0.1, 0.034, '#ffcf3f'), headMat, cosmosItems);
    const daisies = instanced(headGeo(10, 0.09, 0.05, 0.044, '#ffc72e'), headMat, daisyItems);
    swayInst(sway, stems, stemItems); swayInst(sway, cosmos, cosmosItems, true); swayInst(sway, daisies, daisyItems, true);
  }
  // thin ribbons of tall grass that keep the drifts from reading as a flower bed
  for (let i = 0; i < 80; i++) { const [px, pz, nx, nz] = pathAt(rng()), s = rng.sign(), o = rng.range(0.5, 1.8), x = px + nx * s * o, z = pz + nz * s * o; if (wildOK(x, z)) tuft(x, z, rng.range(0.32, 0.7)); }

  // ================================================================ GRASS
  {
    const r = ctx.seeded('meadowtuft'), parts = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + r() * 0.5, g = kit.blade(r.range(0.72, 1.02), r.range(0.1, 0.15), r.range(0.14, 0.34), 2);
      g.rotateY(a); g.translate(Math.sin(a) * 0.05, 0, Math.cos(a) * 0.05); parts.push(g);
    }
    const g = kit.merge(parts), p = g.attributes.position, n = g.attributes.normal, c = new Float32Array(p.count * 3); g.computeBoundingBox();
    const top = g.boundingBox.max.y, up = new V(0.14, 1, 0.1).normalize();
    for (let i = 0; i < p.count; i++) { const t = p.getY(i) / top, k = 0.5 + 0.64 * t * t; c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = k; n.setXYZ(i, up.x, up.y, up.z); }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    const items = tufts.filter((t) => onPlinth(t.x, t.z, 0.18) && !inRiver(t.x, t.z, 0.25));
    const mesh = instanced(g, leafMat, items), sway = makeSway(3.5, 0.05);
    swayInst(sway, mesh, items);
  }

  // ================================================================ ASSEMBLY
  for (const s of sways) s.seal();
  const fol = leafMesh(staticLeaves, { shadow: true }); group.add(fol);
  const solids = st.build({ castShadow: true, receiveShadow: true }); group.add(solids);
  const iron = thin.build({ castShadow: true, receiveShadow: true }); ctx.softEdge(iron); group.add(iron);
  const glass = gl.build({ castShadow: false, receiveShadow: false }); ctx.noOutline(glass); group.add(glass);
  const shadowOnly = new THREE.Mesh(kit.merge(proxy), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  shadowOnly.castShadow = true; shadowOnly.receiveShadow = false; shadowOnly.renderOrder = -1; ctx.noOutline(shadowOnly); group.add(shadowOnly);

  const seat = SWING.seat, T = 2.85, W2 = TAU / T; // period of a 2.1 m pendulum
  return {
    group,
    update(t) {
      for (let i = 0; i < sways.length; i++) sways[i].step(t);
      // the seat keeps a small breath of motion: amplitude drifts with the slow gust envelope
      const env = 0.035 + 0.05 * (0.5 + 0.5 * Math.sin(t * 0.17 + 1.1)) * (0.6 + 0.4 * Math.sin(t * 0.071 + 0.4));
      seat.rotation.x = env * Math.sin(W2 * t + 0.6);
      seat.rotation.z = 0.012 * Math.sin(W2 * 0.5 * t + 1.7);
      for (let i = 0; i < plumes.length; i++) {
        const p = plumes[i], w = ctx.wind(t, p.x, p.z);
        p.m.rotation.x = (0.5 + w) * -0.022 + Math.sin(t * 1.2 + p.ph) * 0.008;
        p.m.rotation.z = (0.5 + w) * -0.03 + Math.sin(t * 0.9 + p.ph) * 0.01;
      }
    },
  };
}
