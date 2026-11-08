// wreck — the half-sunk car, the snapped footbridge, and the hanging wires the vines use as a trellis.
// Static geometry goes through two batches (`hard` is inked, `soft` is foliage with no ink). Everything that moves lives in
// two merged meshes whose vertices are rewritten in update(), one strand at a time, so hundreds of strands cost two draws.
export function build(ctx) {
  const { THREE, layout, P, kit } = ctx;
  const { WRECK, WIRES, wirePoint, FLOWER_SPOTS } = layout;
  const V3 = THREE.Vector3, M4 = THREE.Matrix4;
  const rng = ctx.rng;
  const group = new THREE.Group(); group.name = 'wreck';
  const hard = ctx.batch(), soft = ctx.batch();
  const leafMat = ctx.toon({ vertexColors: true, side: THREE.DoubleSide, translucent: 0.85 });

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const greens = [P.leafMid, P.leafLit, P.ivy, P.ivyLit, P.leafDeep, P.fern];
  const LEAF = kit.leaf(1, 0.56, 0.35);
  const PETALS = { w: kit.flower(1, 6), f: kit.flower(1, 5) };
  const DOT = new THREE.OctahedronGeometry(1, 0);
  const signMat = ctx.toon({ map: signTexture(), vertexColors: true });

  /** Hermite through [x,y] keys with Catmull-Rom tangents. */
  function curve1D(keys) {
    const n = keys.length, m = keys.map((k, i) => {
      const a = keys[Math.max(0, i - 1)], b = keys[Math.min(n - 1, i + 1)];
      return (b[1] - a[1]) / (b[0] - a[0]);
    });
    return (x) => {
      if (x <= keys[0][0]) return keys[0][1];
      if (x >= keys[n - 1][0]) return keys[n - 1][1];
      let i = 0; while (x > keys[i + 1][0]) i++;
      const [x0, y0] = keys[i], [x1, y1] = keys[i + 1], h = x1 - x0, t = (x - x0) / h, t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * m[i + 1];
    };
  }
  /** Straight round bar between two points. */
  function rod(a, b, r, seg = 6) {
    const A = new V3(...a), B = new V3(...b), d = B.clone().sub(A), l = d.length();
    const g = kit.cyl(r, r, l, seg);
    g.applyMatrix4(new M4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), d.clone().normalize())));
    g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2); return g;
  }
  function flip(g) {
    const i = g.index; if (i) for (let k = 0; k < i.count; k += 3) { const a = i.getX(k); i.setX(k, i.getX(k + 1)); i.setX(k + 1, a); }
    const n = g.attributes.normal; for (let k = 0; k < n.count; k++) n.setXYZ(k, -n.getX(k), -n.getY(k), -n.getZ(k));
    return g;
  }
  /** Rough little cuboid; the corners are chipped so nothing reads as a primitive. */
  const cbox = (w, h, d, amt = 0.02, s = 2) => kit.chip(kit.box(w, h, d, s, s, s), amt, rng);
  /** Lumpy smooth blob, for leaf masses and moss cushions. */
  function lump(rx, ry, rz = rx, seg = 14) {
    const g = new THREE.SphereGeometry(1, seg, Math.ceil(seg * 0.66)), p = g.attributes.position, a = rng() * 6, b = rng() * 6;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 1 + 0.13 * Math.sin(x * 3.1 + a) * Math.cos(z * 2.7 + b) + 0.09 * Math.sin(y * 4.3 + x * 2 + b);
      p.setXYZ(i, x * k * rx, y * k * ry, z * k * rz);
    }
    g.computeVertexNormals(); return g;
  }

  // ---------- foliage helpers ----------
  const S = (geo, o, color = '#ffffff') => soft.add(geo, leafMat, { ...o, color });
  const _x = new V3(), _y = new V3(), _z = new V3();
  function leafM(p, tip, nor, s) {
    _z.copy(tip).normalize(); _x.crossVectors(nor, _z); if (_x.lengthSq() < 1e-5) _x.set(1, 0, 0); _x.normalize(); _y.crossVectors(_z, _x);
    return new M4().makeBasis(_x, _y, _z).scale(new V3(s, s, s)).setPosition(p);
  }
  const put = (add, p, tip, nor, s, color) => add(LEAF, { matrix: leafM(p, tip, nor, s) }, color);
  const rdir = (bias = 0) => { const a = rng() * 6.283, y = rng() * 2 - 1 + bias, r = Math.sqrt(Math.max(0, 1 - Math.min(1, y * y))); return new V3(Math.cos(a) * r, clamp(y, -1, 1), Math.sin(a) * r).normalize(); };

  // ---------- shell foliage: the banyan recipe, for every bush here: the car's shrub, the deck bushes, the hump under the snapped cable ----------
  // Leaves are lit by a smooth clump normal, so the cel terminator draws a few readable masses instead of a lit/shade coin toss per leaf.
  const SUN = new V3(...layout.SUN_DIR);
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
  const SHELL_TONE = [[0.72, new THREE.Color(P.leafLit).lerp(new THREE.Color(P.leafMid), 0.35).multiplyScalar(0.8)], [0.6, new THREE.Color(P.leafMid).multiplyScalar(0.8)], [0.4, new THREE.Color(P.leafDeep).multiplyScalar(0.92)], [-9, new THREE.Color(P.leafShade)]];
  const fr = ctx.seeded('car-shrub'), shrubs = [], shrubList = [];
  /** Same call as bush(): queues a clump. Leaves are placed by shrubLeaves() once every clump of one plant is known. */
  function shrub(c, rx, ry, n, opts = {}) {
    const { body = P.leafDeep, size = [0.17, 0.27], core = 0.86, loose = 0.14 } = opts;
    S(lump(rx * core, ry * core, rx * core, 10), { pos: [c.x, c.y, c.z] }, body);
    for (let i = n * 6; i > 0; i--) rng(); // the old per-leaf bush drew these: keeps everything built after it where it was
    shrubs.push({ c: c.clone(), r: new V3(rx, ry, rx), n: n * 2, size: size.map((v) => v * 0.65), loose });
  }
  /** Skins the queued clumps as one plant around heart, then clears the queue. All plants end up in one instanced mesh, built by shrubMesh(). */
  function shrubLeaves(heart) {
    const local = (p, c) => new V3((p.x - c.c.x) / c.r.x, (p.y - c.c.y) / c.r.y, (p.z - c.c.z) / c.r.z);
    const shaded = (p) => shrubs.some((c) => { // does the ray to the sun cross this clump?
      const o = local(p, c), d = new V3(SUN.x / c.r.x, SUN.y / c.r.y, SUN.z / c.r.z), b = o.dot(d), k = o.lengthSq() - 1;
      return k > 0 && b < 0 && b * b - d.lengthSq() * k > 0;
    });
    const list = shrubList;
    for (const c of shrubs) for (let i = 0; i < c.n; i++) {
      const y = 1 - (2 * (i + 0.5)) / c.n, k = Math.sqrt(1 - y * y), a = i * 2.39996 + fr() * 0.4, d = new V3(Math.cos(a) * k, y, Math.sin(a) * k);
      if (y < -0.6 && fr() < 0.4) continue;
      const bump = 1 + c.loose * 2 * (fr() - 0.5) + 0.12 * Math.sin(d.x * 4 + c.c.x * 5) * Math.sin(d.y * 4 + 1) * Math.sin(d.z * 4 + c.c.z * 5);
      const p = new V3(c.c.x + d.x * c.r.x * bump, c.c.y + d.y * c.r.y * bump, c.c.z + d.z * c.r.z * bump);
      if (shrubs.some((o) => o !== c && local(p, o).lengthSq() < 0.7)) continue;
      const crease = Math.min(...shrubs.filter((o) => o !== c).map((o) => local(p, o).lengthSq()));
      const shell = new V3(d.x / c.r.x, d.y / c.r.y, d.z / c.r.z).normalize().lerp(new V3(p.x - heart.x, (p.y - heart.y) * 1.2, p.z - heart.z).normalize(), 0.45).normalize();
      const dn = new V3(0, -1, 0).addScaledVector(shell, shell.y).normalize();
      dn.applyAxisAngle(shell, Math.abs(shell.y) > 0.72 ? fr() * 6.283 : fr.range(-1.1, 1.1));
      const tip = dn.multiplyScalar(0.8).addScaledVector(shell, fr.range(0.05, 0.75)).normalize();
      const patch = Math.sin(p.x * 3.7 + 1) * Math.sin(p.y * 3.1 + 0.6) * Math.sin(p.z * 3.9 + 2), hid = shaded(p.clone().addScaledVector(shell, 0.1));
      let t = shell.dot(SUN) * 0.5 + 0.5 + patch * 0.1 + fr.range(-0.03, 0.03) - Math.max(0, -shell.y) * 0.16;
      if (crease < 1.3) t -= 0.14 * (1.3 - crease) / 0.5;
      if (hid) { t = Math.min(t, 0.5) + fr.range(-0.1, 0.06); shell.addScaledVector(SUN, -(shell.dot(SUN) + 0.1)).normalize(); }
      list.push({ p, shell, tip, s: fr.range(...c.size), tone: SHELL_TONE.find(([min]) => t > min)[1] });
    }
    shrubs.length = 0;
  }
  function shrubMesh() {
    const list = shrubList, heart = new V3(); for (const l of list) heart.add(l.p); heart.divideScalar(list.length);
    // Unit-length ovate leaf, four triangles. Base dark, tip light, so overlaps stay legible inside one tone band.
    const g = new THREE.BufferGeometry(), w = 0.64, b = 0.08, n = list.length;
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -w / 2, b, 0.3, -w * 0.4, b, 0.68, 0, 0, 1, w * 0.4, b, 0.68, w / 2, b, 0.3], 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute([0.72, 0.74, 0.72, 0.92, 0.92, 0.9, 1, 1, 0.98, 1.05, 1.05, 1, 1, 1, 0.98, 0.92, 0.92, 0.9], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(18).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(12).fill(0), 2));
    g.setIndex([0, 2, 1, 0, 3, 2, 0, 4, 3, 0, 5, 4]);
    const mesh = new THREE.InstancedMesh(g, shellMat, n), m = new M4(), T = new V3(), U = new V3(), B = new V3(), shells = new Float32Array(n * 3);
    list.forEach((l, i) => {
      T.copy(l.tip); U.copy(l.shell).addScaledVector(T, -l.shell.dot(T)).normalize(); B.crossVectors(U, T).normalize();
      m.makeBasis(B, U, T).scale(new V3(l.s, l.s, l.s)); m.setPosition(l.p.x - heart.x, l.p.y - heart.y, l.p.z - heart.z);
      mesh.setMatrixAt(i, m); mesh.setColorAt(i, l.tone); shells[i * 3] = l.shell.x; shells[i * 3 + 1] = l.shell.y; shells[i * 3 + 2] = l.shell.z;
    });
    g.setAttribute('aShell', new THREE.InstancedBufferAttribute(shells, 3));
    mesh.position.copy(heart); mesh.castShadow = true; mesh.receiveShadow = false;
    group.add(ctx.softEdge(mesh));
  }
  function bloom(add, p, color, r = 0.09, stem = true) {
    const m = kit.xf({ pos: [p.x, p.y, p.z], rot: [rng.range(-0.35, 0.35), rng() * 6, rng.range(-0.35, 0.35)], scale: r });
    add(PETALS[r > 0.1 ? 'w' : 'f'], { matrix: m }, color);
    add(DOT, { pos: [p.x, p.y + r * 0.2, p.z], scale: r * 0.3 }, color === P.flowerYellow ? P.sunWarm : P.flowerYellow);
    if (stem) add(kit.tube([[p.x, p.y, p.z], [p.x + rng.range(-0.04, 0.04), p.y - 0.1, p.z + rng.range(-0.04, 0.04)], [p.x + rng.range(-0.06, 0.06), p.y - 0.22, p.z + rng.range(-0.06, 0.06)]], 0.008, 0.012, 3, 3, { capEnds: false }), {}, P.leafMid);
  }
  function tuft(add, x, y, z, h = 0.34, n = 6, cols = [P.grass, P.grassLit, P.leafMid]) {
    for (let i = 0; i < n; i++) {
      const g = kit.blade(h * rng.range(0.6, 1.1), 0.04, h * rng.range(0.15, 0.5), 2);
      add(g, { pos: [x + rng.range(-0.1, 0.1), y, z + rng.range(-0.1, 0.1)], rot: [0, rng() * 6.283, 0] }, rng.pick(cols));
    }
  }
  /** Ivy scattered flat onto a surface patch. o=origin, u/v span the patch, n=normal. */
  function ivyOn(o, u, v, n, count, add = S) {
    for (let i = 0; i < count; i++) {
      const a = rng(), b = rng(), f = 1 - Math.abs(a - 0.5) * 1.3;
      const p = new V3(...o).addScaledVector(new V3(...u), a).addScaledVector(new V3(...v), b * f).addScaledVector(new V3(...n), rng.range(0.01, 0.07));
      const nor = new V3(...n).add(new V3(rng() - 0.5, rng() - 0.2, rng() - 0.5).multiplyScalar(0.6)).normalize();
      put(add, p, new V3(rng() - 0.5, -0.8, rng() - 0.5), nor, rng.range(0.15, 0.25), rng.pick(greens));
    }
  }

  /** Thin moss sheet over a height function. mask(x,z)>0 is covered; its edge is where the carpet tucks under the surface. */
  function carpet(nx, nz, x0, x1, z0, z1, surf, mask, thick, o = {}) {
    const pos = [], idx = [], ms = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = lerp(x0, x1, i / nx), z = lerp(z0, z1, j / nz), m = mask(x, z); ms.push(m);
      pos.push(x, surf(x, z) + (m > 0 ? thick * Math.pow(smooth(0, 0.32, m), 0.6) : -0.016), z);
    }
    const id = (i, j) => j * (nx + 1) + i;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      if (Math.max(ms[id(i, j)], ms[id(i + 1, j)], ms[id(i, j + 1)], ms[id(i + 1, j + 1)]) < 0) continue;
      idx.push(id(i, j), id(i, j + 1), id(i + 1, j), id(i + 1, j), id(i, j + 1), id(i + 1, j + 1));
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    soft.add(g, 'mossy', o);
  }

  // ---------- sway: one merged mesh, rewritten per strand ----------
  class Sway {
    constructor() { this.strands = []; }
    strand(pivot, len, amp) {
      const s = { pivot, len, amp, parts: [], ph: rng() * 6.283 };
      s.add = (geo, o = {}, color = '#ffffff') => {
        const g = geo.index ? geo.toNonIndexed() : geo.clone();
        if (!g.attributes.normal) g.computeVertexNormals();
        g.applyMatrix4(kit.xf(o));
        const c = new THREE.Color(color), n = g.attributes.position.count, arr = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
        g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
        s.parts.push(g);
      };
      this.strands.push(s); return s;
    }
    build(material) {
      const geos = [], ranges = []; let start = 0;
      for (const s of this.strands) {
        const cnt = s.parts.reduce((a, g) => a + g.attributes.position.count, 0);
        if (!cnt) continue;
        ranges.push({ start, end: start + cnt, s }); start += cnt; geos.push(...s.parts);
      }
      if (!geos.length) { this.update = () => {}; return new THREE.Group(); }
      const g = kit.merge(geos), pos = g.attributes.position; pos.setUsage(THREE.DynamicDrawUsage);
      const base = pos.array.slice(), w = new Float32Array(pos.count);
      for (const { start: a, end: b, s } of ranges) for (let i = a; i < b; i++) {
        const d = Math.hypot(base[i * 3] - s.pivot[0], base[i * 3 + 1] - s.pivot[1], base[i * 3 + 2] - s.pivot[2]);
        w[i] = s.amp * Math.pow(Math.min(1.2, d / s.len), 1.6);
      }
      g.computeBoundingSphere(); g.boundingSphere.radius += 1;
      const mesh = new THREE.Mesh(g, material); mesh.castShadow = false; mesh.receiveShadow = true;
      this.update = (t) => {
        for (const { start: a, end: b, s } of ranges) {
          const gust = ctx.wind(t, s.pivot[0], s.pivot[2]);
          const gx = gust * 0.72 + 0.28 * Math.sin(t * 1.9 + s.ph), gz = 0.45 * Math.sin(t * 1.33 + s.ph * 1.7) + 0.3 * gust;
          const arr = pos.array;
          for (let i = a; i < b; i++) { arr[i * 3] = base[i * 3] + w[i] * gx; arr[i * 3 + 2] = base[i * 3 + 2] + w[i] * gz; }
        }
        pos.needsUpdate = true;
      };
      return mesh;
    }
  }
  const swaySoft = new Sway(), swayHard = new Sway();

  /** Hanging vine: thin stem, leaves down its length, optional flower at the tip. All in one strand. */
  function vine(top, len, opts = {}) {
    const { amp = 0.12, leafEvery = 0.1, r = 0.014, tip = null, drift = 0.1, cols = greens, size = [0.14, 0.22] } = opts;
    const st = swaySoft.strand(top, Math.max(len, 0.4), amp);
    const pts = [new V3(...top)], seg = Math.max(3, Math.round(len / 0.3));
    for (let i = 1; i <= seg; i++) {
      const l = pts[i - 1];
      pts.push(new V3(l.x + rng.range(-drift, drift), top[1] - (len * i) / seg, l.z + rng.range(-drift, drift)));
    }
    st.add(kit.tube(pts, r, r * 0.55, 4, seg * 2, { capEnds: false }), {}, P.leafDeep);
    const curve = new THREE.CatmullRomCurve3(pts), n = Math.max(2, Math.round(len / leafEvery));
    for (let i = 0; i < n; i++) {
      const t = (i + rng() * 0.6) / n, p = curve.getPoint(Math.min(t, 1)), a = i * 2.4 + rng() * 0.8;
      const tipd = new V3(Math.cos(a), -0.75, Math.sin(a)), nor = new V3(Math.cos(a) * 0.5, 1, Math.sin(a) * 0.5).normalize();
      put(st.add, p, tipd, nor, rng.range(...size) * (1 - t * 0.35), rng.pick(cols));
    }
    if (tip) bloom(st.add, pts[pts.length - 1], tip, 0.075, false);
    return st;
  }

  buildCar();
  buildBridge();
  buildWires();
  shrubMesh();

  // ---------- assemble ----------
  const hardGroup = hard.build({ castShadow: true, receiveShadow: true });
  const softGroup = soft.build({ castShadow: true, receiveShadow: true });
  ctx.softEdge(softGroup);
  group.add(hardGroup, softGroup);
  const swayA = swaySoft.build(leafMat); ctx.softEdge(swayA); group.add(swayA);
  const swayB = swayHard.build(ctx.toon({ vertexColors: true })); group.add(swayB);

  return { group, update(t) { swaySoft.update(t); swayHard.update(t); } };

  // ====================================================================================================================
  //  CAR — local frame: +z nose, +y up, +x the side the cameras see (east). y=0 is where the tyres would stand.
  // ====================================================================================================================
  function buildCar() {
    const car = WRECK.car, CAR_LEVEL = 0.67;           // the mound surface the sink is measured from
    const carM = kit.xf({ pos: [car.x, CAR_LEVEL - car.sink, car.z], rot: [car.pitch, car.yaw, 0] });
    const inv = carM.clone().invert();
    const C = (o = {}) => carM.clone().multiply(kit.xf(o));
    const cp = (x, y, z) => new V3(x, y, z).applyMatrix4(carM);
    const toLocal = (x, z) => { const v = new V3(x, 0.6, z).applyMatrix4(inv); return [v.x, v.z]; };

    const halfW = curve1D([[-2, 0.42], [-1.985, 0.58], [-1.93, 0.72], [-1.8, 0.82], [-1.5, 0.875], [-0.8, 0.9], [0.2, 0.9], [1.0, 0.885], [1.45, 0.85], [1.75, 0.79], [1.9, 0.7], [1.975, 0.56], [2, 0.36]]);
    const shoulder = curve1D([[-2, 0.56], [-1.88, 0.66], [-1.5, 0.75], [0, 0.78], [1.4, 0.74], [1.85, 0.64], [2, 0.54]]);
    const under = curve1D([[-2, 0.47], [-1.9, 0.36], [-1.6, 0.28], [1.6, 0.28], [1.88, 0.35], [2, 0.46]]);
    const tubTop = curve1D([[-2, 0.6], [-1.96, 0.72], [-1.84, 0.84], [-1.6, 0.9], [-1.3, 0.88], [0.8, 0.88], [1.04, 0.985], [1.3, 0.94], [1.6, 0.87], [1.82, 0.78], [1.94, 0.7], [2, 0.58]]);
    const cabTop = curve1D([[-1.78, 0.86], [-1.5, 1.08], [-1.08, 1.34], [-0.7, 1.43], [-0.1, 1.46], [0.32, 1.41], [0.62, 1.23], [1.02, 0.97], [1.2, 0.86]]);
    const NT = 2.9, NB = 4.2, NC = 3.1, CABK = 0.93, CAB0 = -1.72, CAB1 = 1.12, CABY = 0.72;
    const crown = (x, z) => 0.055 * smooth(1.05, 1.3, z) * (1 - smooth(1.8, 1.97, z)) * Math.exp(-(((Math.abs(x) - 0.6) / 0.17) ** 2));

    /** v∈[0,1] goes around the section: 0 keel, .25 east shoulder, .5 centreline top, .75 west shoulder. */
    function tubPoint(z, v, off = 0) {
      const phi = v * Math.PI * 2 - Math.PI / 2, c = Math.cos(phi), s = Math.sin(phi);
      const W = halfW(z) + off, Sh = shoulder(z), up = s >= 0, n = up ? NT : NB;
      const x = W * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
      const y = Sh + (up ? tubTop(z) - Sh + off : Sh - under(z) + off) * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
      return [x, y + (up ? crown(x, z) : 0), z];
    }
    /** a∈[0,1] over the greenhouse: 0 east belt, .5 roof centre, 1 west belt. */
    function cabPoint(z, a, off = 0) {
      const phi = a * Math.PI, c = Math.cos(phi), s = Math.sin(phi), W = halfW(z) * CABK + off;
      return [W * Math.sign(c) * Math.pow(Math.abs(c), 2 / NC), CABY + (cabTop(z) - CABY + off) * Math.pow(Math.abs(s), 2 / NC), z];
    }
    const cabHeight = (x, z) => { const W = halfW(z) * CABK, q = Math.min(1, Math.abs(x) / W); return CABY + (cabTop(z) - CABY) * Math.pow(1 - q ** NC, 1 / NC); };
    const cabHeightHood = (x, z) => { const Sh = shoulder(z), q = Math.min(1, Math.abs(x) / halfW(z)); return Sh + (tubTop(z) - Sh) * Math.pow(1 - q ** NT, 1 / NT) + crown(x, z); };
    const sideX = (y, z) => { const Sh = shoulder(z), f = clamp((Sh - y) / (Sh - under(z))); return halfW(z) * Math.pow(1 - f ** NB, 1 / NB); };

    const ARCH = [[1.22, 0.33, 0.43], [-1.24, 0.33, 0.43]];
    const WIN = { // windows in (z,a) space; the constant-a lines follow the roof contour, so rectangles here read as rounded glass.
      screen: { z: [0.4, 0.98], a: [0.235, 0.765] }, rear: { z: [-1.58, -1.02], a: [0.235, 0.765] },
      eastF: { z: [-0.05, 0.86], a: [0.03, 0.2] }, eastR: { z: [-1.2, -0.17], a: [0.03, 0.2] },
      westF: { z: [-0.05, 0.86], a: [0.8, 0.97] }, westR: { z: [-1.2, -0.17], a: [0.8, 0.97] },
    };
    const inWin = (z, a) => Object.values(WIN).some((w) => z > w.z[0] && z < w.z[1] && a > w.a[0] && a < w.a[1]);
    const toUV = (z, v, top) => [(z + 2) / 4, (top ? 0.5 : 0) + v * 0.5];

    /** Grid surface over zs × vs. keep(zMid,vMid,p) drops quads, so openings stay real holes with clean edges. */
    function sheet(zs, vs, fn, keep, top, inward = false) {
      const pos = [], uv = [], idx = [], W = vs.length;
      for (const z of zs) for (const v of vs) { const p = fn(z, v); pos.push(...p); uv.push(...toUV(z, v, top)); }
      const ctrl = (i, j) => [pos[(i * W + j) * 3], pos[(i * W + j) * 3 + 1], pos[(i * W + j) * 3 + 2]];
      for (let i = 0; i < zs.length - 1; i++) for (let j = 0; j < W - 1; j++) {
        const c = [ctrl(i, j), ctrl(i + 1, j), ctrl(i, j + 1), ctrl(i + 1, j + 1)];
        const mid = [0, 1, 2].map((k) => (c[0][k] + c[1][k] + c[2][k] + c[3][k]) / 4);
        if (!keep((zs[i] + zs[i + 1]) / 2, (vs[j] + vs[j + 1]) / 2, mid)) continue;
        const a = i * W + j, b = a + W, d = a + 1, e = b + 1;
        if (inward) idx.push(a, b, d, d, b, e); else idx.push(a, d, b, d, e, b);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals(); return g;
    }

    const span = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => lerp(a, b, i / n));
    const uniq = (l) => [...new Set(l.map((v) => +v.toFixed(4)))].sort((a, b) => a - b);
    // Rows are spaced evenly in height, not in angle, so the wheel arches get usable resolution on the flanks.
    const rowsLow = span(0.03, 1, 13).map((f) => Math.asin(Math.pow(f, NB / 2)) / (Math.PI * 2));
    const rowsTop = span(0, 1, 11).map((f) => Math.asin(Math.pow(f, NT / 2)) / (Math.PI * 2));
    const vsTub = uniq([0, ...rowsLow.map((v) => 0.25 - v), ...rowsTop.map((v) => 0.25 + v), ...rowsTop.map((v) => 0.75 - v), ...rowsLow.map((v) => 0.75 + v), 1]);
    const zsTub = uniq([-2, -1.995, -1.98, -1.95, -1.91, -1.86, ...span(-1.8, -0.72, 18), ...span(-0.6, 0.6, 6), ...span(0.72, 1.76, 17), 1.82, 1.87, 1.91, 1.945, 1.97, 1.985, 1.995, 2]);

    // Wheel-arch cut: vertices near the circle are snapped to it, so the opening is round rather than stair-stepped.
    function tubFn(off) {
      return (z, v) => {
        const p = tubPoint(z, v, off);
        if (Math.abs(p[0]) > 0.42 && p[1] < 0.85) for (const [cz, cy, r] of ARCH) {
          const d = Math.hypot(p[2] - cz, p[1] - cy);
          if (Math.abs(d - r) < 0.05 && d > 0.01) { p[2] = cz + ((p[2] - cz) * r) / d; p[1] = cy + ((p[1] - cy) * r) / d; }
        }
        return p;
      };
    }
    const keepTub = (z, v, p) => {
      if (Math.abs(p[0]) > 0.42) for (const [cz, cy, r] of ARCH) if (Math.hypot(p[2] - cz, p[1] - cy) < r - 0.002) return false;
      return !(z > CAB0 + 0.1 && z < CAB1 - 0.14 && v > 0.27 && v < 0.73);
    };
    const paint = bodyTexture();
    const bodyMat = ctx.toon({ map: paint, moss: 0.2, vertexColors: true });
    hard.add(sheet(zsTub, vsTub, tubFn(0), keepTub, false), bodyMat, { matrix: carM });
    const liner = '#31494e';
    // The tub stays open underneath; a plain inner shell is all that ever shows through the windows.
    for (const [w, h, d, x, y, z] of [[1.7, 0.04, 3.0, 0, 0.4, -0.2], [0.04, 0.46, 1.6, 0.84, 0.62, 0], [0.04, 0.46, 1.6, -0.84, 0.62, 0], [0.04, 0.22, 2.4, 0.84, 0.75, -0.4], [0.04, 0.22, 2.4, -0.84, 0.75, -0.4], [1.7, 0.5, 0.04, 0, 0.64, -1.6], [1.7, 0.56, 0.04, 0, 0.66, 1.03]])
      hard.add(kit.box(w, h, d), 'flat', { matrix: C({ pos: [x, y, z] }), color: liner });

    const zsCab = uniq([...span(CAB0, CAB1, 34), ...Object.values(WIN).flatMap((w) => w.z)]);
    const asCab = uniq([...span(0, 1, 24), ...Object.values(WIN).flatMap((w) => w.a)]);
    const keepCab = (z, a) => !inWin(z, a);
    hard.add(sheet(zsCab, asCab, (z, a) => cabPoint(z, a), keepCab, true), bodyMat, { matrix: carM });
    hard.add(sheet(zsCab, asCab, (z, a) => cabPoint(z, a, -0.035), keepCab, true, true), 'flat', { matrix: carM, color: liner });

    // Glass reuses the same grid, in the holes only, and its canvas decides what's left of each pane.
    const glassGeo = sheet(zsCab, asCab, (z, a) => cabPoint(z, a, -0.012), (z, a) => inWin(z, a), true).applyMatrix4(carM);
    { const uv = glassGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, (uv.getY(i) - 0.5) * 2); }
    const glassMat = ctx.toon({ map: glassTexture(), transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.95, dapple: false });
    const glass = new THREE.Mesh(glassGeo, glassMat); glass.renderOrder = 2;
    ctx.noOutline(glass); group.add(glass);

    // Window rubbers follow the same param rectangles.
    const rubber = '#39505a', chrome = '#c8d3cf', paintLip = '#57868c';
    for (const w of Object.values(WIN)) {
      const pts = [], step = 0.12, push = (z, a) => pts.push(cabPoint(z, a, 0.006));
      const [z0, z1] = w.z, [a0, a1] = w.a;
      for (let z = z0; z < z1; z += step) push(z, a0);
      for (let a = a0; a < a1; a += 0.03) push(z1, a);
      for (let z = z1; z > z0; z -= step) push(z, a1);
      for (let a = a1; a > a0; a -= 0.03) push(z0, a);
      pts.push(pts[0]);
      hard.add(kit.tube(pts, 0.017, 0.017, 4, pts.length * 3, { capEnds: false }), 'flat', { matrix: carM, color: rubber });
    }

    // Wheels: arches first, then tyre, rim and cap.
    const tyre = new THREE.LatheGeometry([[0.2, -0.105], [0.27, -0.112], [0.32, -0.08], [0.335, 0], [0.32, 0.08], [0.27, 0.112], [0.2, 0.105]].map(([x, y]) => new THREE.Vector2(x, y)), 14);
    const rim = new THREE.LatheGeometry([[0.0, 0.12], [0.07, 0.118], [0.1, 0.09], [0.13, 0.085], [0.2, 0.105], [0.2, -0.1]].map(([x, y]) => new THREE.Vector2(x, y)), 12);
    for (const [cz, side, steer, sq] of [[1.22, 1, 0.28, 0.93], [-1.24, 1, 0, 0.9], [1.22, -1, 0.24, 0.96], [-1.24, -1, 0, 0.92]]) {
      const x = side * 0.74, m = C({ pos: [x, 0.3, cz], rot: [0, steer, 0] }).multiply(new M4().makeRotationZ(-Math.PI / 2 * side));
      hard.add(tyre, 'flat', { matrix: m.clone().multiply(new M4().makeScale(sq, 1, 1)), color: '#3d474b' });
      hard.add(rim, 'rust', { matrix: m.clone().multiply(new M4().makeScale(sq, 1, 1)) });
      for (let i = 0; i < 4; i++) { const a = (i / 4) * 6.283 + 0.4; hard.add(kit.cyl(0.02, 0.02, 0.05, 6), 'flat', { matrix: m.clone().multiply(kit.xf({ pos: [Math.cos(a) * 0.14, 0.1, Math.sin(a) * 0.14] })), color: P.metalDark }); }
      // Wheel well and the flared lip.
      hard.add(flip(kit.cyl(0.445, 0.445, 0.44, 16, true).rotateZ(Math.PI / 2)), 'flat', { matrix: C({ pos: [side * 0.64, 0.33, cz] }), color: '#2d4348' });
      const lip = [];
      for (let k = -2; k <= 12; k++) {
        const th = (k / 10) * Math.PI, y = 0.33 + 0.435 * Math.sin(th), z = cz + 0.435 * Math.cos(th);
        lip.push([side * (sideX(y, z) + 0.008), y, z]);
      }
      hard.add(kit.tube(lip, 0.03, 0.03, 5, 28), side > 0 && cz > 0 ? 'rust' : 'flat', { matrix: carM, color: side > 0 && cz > 0 ? '#ffffff' : paintLip });
    }

    // Front end.
    const lens = new THREE.SphereGeometry(0.135, 12, 6, 0, 6.283, 0, 1.15).rotateX(Math.PI / 2).scale(1, 1, 0.55);
    for (const s of [1, -1]) {
      const pos = [s * 0.56, 0.68, 1.885], rot = [-0.08, s * 0.32, 0];
      hard.add(kit.cylBase(0.17, 0.19, 0.2, 14).rotateX(Math.PI / 2).translate(0, 0, -0.14), 'flat', { matrix: C({ pos, rot }), color: '#86baba' });
      hard.add(kit.torus(0.155, 0.028, 6, 18), 'flat', { matrix: C({ pos, rot }), color: chrome });
      if (s > 0) {
        hard.add(lens, 'flat', { matrix: C({ pos, rot }), color: '#f7efc0' });
      } else { // the west lamp is smashed: dark bowl and a toothy rim of glass
        hard.add(kit.cyl(0.13, 0.13, 0.03, 12).rotateX(Math.PI / 2).translate(0, 0, 0.0), 'flat', { matrix: C({ pos, rot }), color: '#2d4348' });
        for (let i = 0; i < 6; i++) { const a = rng() * 6.28; hard.add(kit.leaf(0.09, 0.07, 0), 'flat', { matrix: C({ pos, rot }).multiply(kit.xf({ pos: [Math.cos(a) * 0.13, Math.sin(a) * 0.13, 0.02], rot: [Math.PI / 2, 0, a + 1.57] })), color: '#d7ecdc' }); }
      }
      hard.add(cbox(0.13, 0.07, 0.06, 0.004, 1), 'flat', { matrix: C({ pos: [s * 0.6, 0.5, 1.9], rot: [0, s * 0.42, 0] }), color: s > 0 ? P.sunWarm : '#c98f4a' });
    }
    // Grille.
    const gr = new THREE.Shape(); gr.absellipse(0, 0, 0.3, 0.115, 0, Math.PI * 2);
    hard.add(new THREE.ExtrudeGeometry(gr, { depth: 0.1, bevelEnabled: false, curveSegments: 10 }), 'flat', { matrix: C({ pos: [0, 0.62, 1.91] }), color: '#2d4348' });
    hard.add(kit.torus(1, 0.034, 5, 22).scale(0.3, 0.115, 1), 'flat', { matrix: C({ pos: [0, 0.62, 2.015] }), color: chrome });
    for (let i = -1; i <= 1; i++) hard.add(rod([-0.27 + Math.abs(i) * 0.05, 0.62 + i * 0.05, 2.02], [0.27 - Math.abs(i) * 0.05, 0.62 + i * 0.05, 2.02], 0.012, 4), 'flat', { matrix: carM, color: chrome });
    hard.add(kit.cyl(0.055, 0.055, 0.02, 10).rotateX(Math.PI / 2), 'flat', { matrix: C({ pos: [0, 0.8, 1.93], rot: [-0.8, 0, 0] }), color: P.rustLit });
    // Bumpers. The front one has dropped at its east end.
    hard.add(kit.tube([[-0.9, 0.44, 1.56], [-0.86, 0.45, 1.82], [-0.52, 0.45, 2.02], [0, 0.44, 2.09], [0.5, 0.42, 2.03], [0.8, 0.36, 1.88], [0.92, 0.28, 1.72]], 0.052, 0.046, 7, 30), 'flat', { matrix: carM, color: chrome });
    for (const x of [-0.36, 0.34]) hard.add(lump(0.05, 0.11, 0.05, 8), 'flat', { matrix: C({ pos: [x, 0.43, 2.09] }), color: chrome });
    hard.add(kit.tube([[-0.9, 0.46, -1.6], [-0.84, 0.46, -1.86], [-0.5, 0.46, -2.03], [0, 0.46, -2.08], [0.5, 0.46, -2.03], [0.84, 0.46, -1.86], [0.9, 0.46, -1.6]], 0.05, 0.05, 7, 28), 'rust', { matrix: carM });
    for (const s of [1, -1]) hard.add(lump(0.11, 0.07, 0.04, 8), 'flat', { matrix: C({ pos: [s * 0.6, 0.72, -1.96] }), color: P.red });
    // Plate from the sign atlas.
    const plate = new THREE.PlaneGeometry(0.42, 0.17); remap(plate, 0.0, 0.0, 0.25, 0.25);
    hard.add(cbox(0.45, 0.2, 0.02, 0.003, 1), 'flat', { matrix: C({ pos: [0.02, 0.385, 2.1], rot: [0.05, 0, -0.05] }), color: P.metalDark });
    hard.add(plate, signMat, { matrix: C({ pos: [0.02, 0.385, 2.114], rot: [0.05, 0, -0.05] }) });

    // Trim on the visible flank, and small hardware.
    const belt = []; for (let z = -1.55; z < 0.55; z += 0.2) belt.push([sideX(0.7, z) + 0.012, 0.7, z]);
    belt.push([0.93, 0.62, 0.72], [0.96, 0.46, 0.8]); // chrome strip has sprung loose
    hard.add(kit.tube(belt, 0.014, 0.014, 4, 26), 'flat', { matrix: carM, color: chrome });
    for (const [z, s] of [[-0.02, 1], [-0.02, -1]]) hard.add(lump(0.018, 0.018, 0.075, 6), 'flat', { matrix: C({ pos: [s * (sideX(0.74, z) + 0.022), 0.74, z] }), color: chrome });
    const mir = [0.86, 0.9, 0.86];
    hard.add(rod([0.8, 0.86, 0.86], mir, 0.012, 4), 'flat', { matrix: carM, color: chrome });
    hard.add(lump(0.05, 0.05, 0.03, 8), 'flat', { matrix: C({ pos: [0.9, 0.93, 0.86], rot: [0, 0.3, 0.5] }), color: chrome });
    { const w = []; for (let a = 0.34; a <= 0.56; a += 0.04) w.push(cabPoint(0.9 - (a - 0.34) * 1.3, a, 0.02)); hard.add(kit.tube(w, 0.008, 0.008, 3, 12, { capEnds: false }), 'flat', { matrix: carM, color: '#39505a' }); }
    hard.add(kit.tube([[0.72, 0.85, -1.5], [0.76, 1.12, -1.58], [0.84, 1.36, -1.56], [0.98, 1.5, -1.5]], 0.007, 0.005, 3, 10, { capEnds: false }), 'flat', { matrix: carM, color: P.metalDark });

    // Cabin: enough to reward looking through the missing glass.
    for (const [x, z] of [[0.4, -0.2], [-0.4, -0.2]]) {
      hard.add(cbox(0.58, 0.16, 0.56, 0.01), 'flat', { matrix: C({ pos: [x, 0.5, z] }), color: '#b88a5e' });
      hard.add(cbox(0.56, 0.62, 0.15, 0.012), 'flat', { matrix: C({ pos: [x, 0.84, z - 0.3], rot: [0.14, 0, 0] }), color: '#b88a5e' });
      hard.add(cbox(0.3, 0.17, 0.12, 0.01), 'flat', { matrix: C({ pos: [x, 1.2, z - 0.33] }), color: '#9f7650' });
    }
    hard.add(cbox(1.5, 0.5, 0.45, 0.012), 'flat', { matrix: C({ pos: [0, 0.68, -1.15] }), color: '#9f7650' });
    hard.add(cbox(1.6, 0.2, 0.3, 0.008), 'flat', { matrix: C({ pos: [0, 0.82, 0.86], rot: [-0.2, 0, 0] }), color: '#4a6468' });
    hard.add(kit.torus(0.14, 0.014, 5, 16), 'flat', { matrix: C({ pos: [-0.4, 0.94, 0.56], rot: [0.5, 0, 0] }), color: '#d4c9a8' });
    hard.add(rod([-0.4, 0.92, 0.6], [-0.4, 0.82, 0.8], 0.016, 5), 'flat', { matrix: carM, color: P.metalDark });

    // ---------- the mound ----------
    const moundH = (x, z) => {
      const [lx, lz] = toLocal(x, z);
      const dx = Math.max(Math.abs(lx) - 0.86, 0), dz = Math.max(Math.abs(lz) - 2.02, 0), d = Math.hypot(dx * 1.0, dz * 1.25);
      const level = lerp(0.74, 0.23, smooth(-1.5, 1.05, lz)) + (lx < 0 ? 0.17 : 0) * smooth(0, -0.7, lx) + 0.06 * Math.sin(lz * 1.7 + 1.1);
      let h = level * Math.pow(1 - smooth(0, 1.2, d), 1.25);
      h += 0.045 * Math.sin(x * 2.3 + 1.2) * Math.sin(z * 1.9 + 0.4) * smooth(0.02, 0.3, h);
      h += 0.024 * Math.sin(x * 4.9 - z * 3.3) * smooth(0.04, 0.3, h);
      h += 0.3 * Math.exp(-((x - 10.75) ** 2 * 2.4 + (z - 3.95) ** 2 * 2.0));   // little hump where the dead wire lands
      h *= 1 - smooth(11.45, 11.98, x); h *= smooth(8.45, 8.95, x);
      return h - 0.02;
    };
    {
      const nx = 34, nz = 72, x0 = 8.4, x1 = 12, z0 = -3.6, z1 = 5.2, pos = [], idx = [];
      for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const x = lerp(x0, x1, i / nx), z = lerp(z0, z1, j / nz); pos.push(x, moundH(x, z), z); }
      const id = (i, j) => j * (nx + 1) + i;
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        const ys = [id(i, j), id(i + 1, j), id(i, j + 1), id(i + 1, j + 1)].map((k) => pos[k * 3 + 1]);
        if (Math.max(...ys) < 0.03) continue;
        const [cx, cz] = toLocal(pos[id(i, j) * 3], pos[id(i, j) * 3 + 2]);
        if (Math.abs(cx) < 0.74 && Math.abs(cz) < 1.8) continue;
        idx.push(id(i, j), id(i, j + 1), id(i + 1, j), id(i + 1, j), id(i, j + 1), id(i + 1, j + 1));
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
      hard.add(g, 'soil');
    }
    // Scatter on the mound: stones, broken kerb, tufts and small flowers, kept off the visible door.
    const onMound = (fn, n) => {
      for (let i = 0, k = 0; i < n && k < n * 8; k++) {
        const x = rng.range(8.8, 11.9), z = rng.range(-3.4, 4.9), [lx, lz] = toLocal(x, z);
        if (Math.abs(lx) < 0.98 && Math.abs(lz) < 2.12) continue;
        const y = moundH(x, z); if (y < 0.04) continue;
        fn(x, y, z); i++;
      }
    };
    onMound((x, y, z) => hard.add(kit.rock(rng.range(0.06, 0.15), rng, 0.7), 'concreteClean', { pos: [x, y + 0.02, z], rot: [rng(), rng() * 6, rng()], color: '#d8d4c8' }), 22);
    onMound((x, y, z) => tuft(S, x, y, z, rng.range(0.18, 0.32), 5), 44);
    onMound((x, y, z) => bloom(S, new V3(x, y + rng.range(0.16, 0.27), z), rng.pick([P.flowerYellow, P.flowerWhite, P.flowerYellow, P.bougainLit]), 0.075), 22);
    onMound((x, y, z) => { for (let i = 0; i < 4; i++) S(kit.frond(rng.range(0.45, 0.7), 6, 0.2), { pos: [x, y, z], rot: [rng.range(-0.3, 0.15), rng() * 6.283, 0] }, rng.pick([P.fern, P.leafMid, P.leafDeep])); }, 9);
    // Moss cushions lapping up the sill.
    for (let i = 0; i < 12; i++) {
      const lz = rng.range(-1.9, 0.5), x = sideX(0.34, lz) + 0.03, p = cp(x, lerp(0.52, 0.42, (lz + 1.9) / 2.4), lz);
      soft.add(lump(rng.range(0.14, 0.26), rng.range(0.07, 0.13), rng.range(0.14, 0.3), 8), 'mossy', { pos: [p.x, p.y, p.z] });
    }

    // ---------- soil heaped on the roof ----------
    const heapT = (lx, lz) => {
      const ex = (lx - 0.02) / 0.66, ez = (lz + 0.42) / 0.98, th = Math.atan2(ez, ex);
      const q = Math.hypot(ex, ez) / (1 + 0.12 * Math.sin(3 * th + 0.7) + 0.08 * Math.sin(5 * th + 2.0) + 0.04 * Math.sin(9 * th));
      return 1 - q * q;
    };
    const heapY = (lx, lz) => {
      const t = heapT(lx, lz), roof = Math.abs(lx) < halfW(lz) * CABK ? cabHeight(lx, lz) : CABY;
      return roof + (t > 0 ? 0.33 * Math.pow(t, 0.7) + 0.03 * Math.sin(lx * 7 + 1) * Math.sin(lz * 6 + 2) * t : -0.07);
    };
    {
      const nx = 28, nz = 34, pos = [], idx = [], X0 = -1, X1 = 1, Z0 = -1.72, Z1 = 0.84;
      for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const x = lerp(X0, X1, i / nx), z = lerp(Z0, Z1, j / nz); pos.push(x, heapY(x, z), z); }
      const id = (i, j) => j * (nx + 1) + i;
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        const t = Math.max(...[[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]].map(([a, b]) => heapT(lerp(X0, X1, a / nx), lerp(Z0, Z1, b / nz))));
        if (t < -0.25) continue;
        idx.push(id(i, j), id(i, j + 1), id(i + 1, j), id(i + 1, j), id(i, j + 1), id(i + 1, j + 1));
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
      hard.add(g, 'soil', { matrix: carM });
    }
    // Roots draped from the heap down over the flanks, tying the soil to the mound.
    for (const [z, a, side] of [[-1.3, 0.3, 1], [0.16, 0.28, 1], [-0.1, 0.3, 1], [-0.75, 0.7, -1], [0.05, 0.72, -1]]) {
      const pts = [];
      for (let k = 0; k <= 4; k++) { const aa = lerp(a, side > 0 ? 0.015 : 0.985, k / 4); pts.push(cabPoint(z + Math.sin(k * 1.7 + z) * 0.05, aa, 0.018)); }
      for (let y = 0.7; y > 0.2; y -= 0.17) { const zz = z + rng.range(-0.08, 0.08); pts.push([side * (sideX(y, zz) + 0.02), y, zz]); }
      hard.add(kit.tube(pts, 0.024, 0.008, 4, 20), 'flat', { matrix: carM, color: P.woodDark });
    }

    // ---------- what grows on it ----------
    const fs = FLOWER_SPOTS[4];
    shrub(cp(-0.24, 1.88, -0.72), 0.42, 0.3, 64);
    shrub(cp(0.24, 1.86, -0.34), 0.34, 0.26, 50, { body: P.fern });
    shrub(cp(0.2, 1.8, -0.98), 0.26, 0.2, 30);
    shrub(cp(-0.3, 1.78, -0.1), 0.24, 0.17, 26, { body: P.leafMid });
    shrub(cp(0.02, 1.78, 0.1), 0.17, 0.13, 16, { body: P.leafMid });
    // A leggy young shrub gives the car its own small silhouette, thin stems and loose leaf sprays rather than a lollipop.
    {
      const r = cp(-0.2, 1.8, -0.82);
      const stems = [[0.32, 0.92, 0.1], [-0.3, 0.8, -0.12], [0.08, 1.14, -0.2], [-0.42, 0.58, 0.2]];
      for (const [dx, h, dz] of stems) {
        const t = [[r.x, r.y - 0.1, r.z], [r.x + dx * 0.3, r.y + h * 0.45, r.z + dz * 0.3], [r.x + dx, r.y + h, r.z + dz]];
        hard.add(kit.tube(t, 0.03, 0.009, 5, 10), 'flat', { color: P.woodDark });
        shrub(new V3(t[2][0], t[2][1] + 0.02, t[2][2]), rng.range(0.24, 0.31), rng.range(0.17, 0.23), 48, { body: P.leafDeep, core: 0.42, loose: 0.55 });
      }
    }
    // Blooms clustered on the FLOWER_SPOTS entry: the insects loiter here.
    const flowers = [P.flowerWhite, P.flowerYellow, P.bougainLit, P.flowerPurple, P.flowerWhite, P.bougain];
    for (let i = 0; i < 34; i++) {
      const a = rng() * 6.283, r = Math.sqrt(rng()) * 0.62;
      bloom(S, new V3(fs[0] + Math.cos(a) * r * 1.1, fs[1] + rng.range(-0.3, 0.2) - r * 0.25, fs[2] + Math.sin(a) * r * 1.3), rng.pick(flowers), rng.range(0.085, 0.125));
    }
    for (let i = 0; i < 16; i++) { // wildflowers and grass along the heap's rim
      const a = rng() * 6.283, lx = 0.02 + Math.cos(a) * 0.56, lz = -0.42 + Math.sin(a) * 0.84, h = heapY(lx, lz);
      const p = cp(lx, h + 0.02, lz);
      tuft(S, p.x, p.y - 0.02, p.z, rng.range(0.22, 0.4), 4);
      if (i % 2) bloom(S, new V3(p.x, p.y + rng.range(0.2, 0.34), p.z), rng.pick(flowers), 0.08);
    }
    // Moss cushions: over the hood seam, the cowl, and spilling across the windscreen base.
    const hoodMask = (x, z) => {
      const scarf = 1.3 - z + 0.13 * Math.sin(x * 5.2 + 1) + 0.09 * Math.sin(x * 11 + z * 6) + 0.05 * Math.sin(z * 15 + x * 3);
      const isle = (cx, cz, r) => r - Math.hypot((x - cx) * 1.15, z - cz) + 0.05 * Math.sin(x * 23 + 2 * z) + 0.04 * Math.sin(z * 31 - x * 7);
      return Math.max(scarf, isle(0.46, 1.6, 0.13), isle(-0.28, 1.56, 0.17), isle(-0.66, 1.34, 0.1), isle(0.1, 1.78, 0.07)) * (1 - smooth(0.74, 0.86, Math.abs(x))) - 0.01;
    };
    carpet(38, 24, -0.86, 0.86, 0.98, 1.88, cabHeightHood, hoodMask, 0.05, { matrix: carM });
    for (let i = 0; i < 8; i++) { const x = rng.range(-0.7, 0.7), z = rng.range(1.0, 1.65), p = cp(x, cabHeightHood(x, z), z); tuft(S, p.x, p.y, p.z, 0.16, 3, [P.mossLit, P.grass]); }

    // Ferns push out through the front wheel arches; these move.
    for (const [side, n] of [[1, 9], [-1, 5]]) for (let i = 0; i < n; i++) {
      const pivot = cp(side * 0.7, 0.3, 1.22 + rng.range(-0.16, 0.16)), yaw = side * Math.PI / 2 + rng.range(-1.0, 1.0), len = rng.range(0.7, 1.1);
      const st = swaySoft.strand([pivot.x, pivot.y, pivot.z], len, 0.05);
      st.add(kit.frond(len, 7, 0.24), { pos: [pivot.x, pivot.y, pivot.z], rot: [rng.range(-0.95, -0.4), yaw + car.yaw, 0] }, rng.pick([P.fern, P.leafMid, P.leafLit, P.leafLit]));
    }
    // And more from the rear quarter window, which has lost its glass.
    shrub(cp(0.62, 0.92, -0.72), 0.3, 0.2, 30, { body: P.fern, size: [0.14, 0.2] });
    shrubLeaves(cp(-0.2, 2.25, -0.82));
    for (let i = 0; i < 6; i++) {
      const pivot = cp(0.6, 0.86, -0.72 + rng.range(-0.3, 0.3)), len = rng.range(0.45, 0.7);
      const st = swaySoft.strand([pivot.x, pivot.y, pivot.z], len, 0.04);
      st.add(kit.frond(len, 6, 0.2), { pos: [pivot.x, pivot.y, pivot.z], rot: [rng.range(-0.3, 0.1), Math.PI / 2 + car.yaw + rng.range(-0.8, 0.8), 0] }, rng.pick([P.fern, P.leafMid]));
    }
    // Vines off the heap's edge across the east windows.
    for (const [z, a, len] of [[-0.3, 0.2, 0.42], [0.42, 0.2, 0.3], [-0.95, 0.2, 0.5], [-1.45, 0.2, 0.42]]) {
      const c = cabPoint(z, a, 0.05), p = cp(...c); vine([p.x, p.y, p.z], len, { amp: 0.035, drift: 0.04, size: [0.12, 0.18], leafEvery: 0.075 });
    }

    /** Sun-bleached paint, hand-laid: canvas x=length, canvas rows cover the tub then the greenhouse. */
    function bodyTexture() {
      const rr = ctx.seeded('wreck-paint');
      return ctx.canvasTexture(2048, 1024, (g, w, h) => {
        const X = (z) => ((z + 2) / 4) * w, Yt = (v) => h - v * 0.5 * h, Yc = (a) => h * 0.5 - a * 0.5 * h;
        const blotch = (x, y, rx, ry, col, n = 16) => {
          g.fillStyle = col; g.beginPath();
          for (let i = 0; i < n; i++) { const a = (i / n) * 6.283, k = rr.range(0.55, 1.2); g.lineTo(x + Math.cos(a) * rx * k, y + Math.sin(a) * ry * k); }
          g.closePath(); g.fill();
        };
        const rust = (x, y, rx, ry) => {
          blotch(x, y, rx * 1.2, ry * 1.2, '#c97a55');
          blotch(x, y, rx, ry, P.rust);
          blotch(x + rx * 0.1, y, rx * 0.62, ry * 0.6, P.rustDark);
          for (let i = 0; i < 5; i++) blotch(x + rr.range(-1.6, 1.6) * rx, y + rr.range(-1.5, 1.5) * ry, rr.range(4, 12), rr.range(3, 9), P.rust, 7);
        };
        // Tub.
        g.fillStyle = '#7fb6b6'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#a4d0c5'; g.fillRect(0, Yt(0.62), w, Yt(0.38) - Yt(0.62));      // bleached hood and deck
        g.fillStyle = '#5f949c'; g.fillRect(0, Yt(0.16), w, Yt(0));                    // grimy east skirt
        g.fillRect(0, Yt(1), w, Yt(0.84) - Yt(1));
        for (const v of [0.215, 0.785]) { g.fillStyle = '#f1e8cf'; g.fillRect(0, Yt(v) - 11, w, 22); g.fillStyle = '#c96a4f'; g.fillRect(0, Yt(v) + 11, w, 7); }
        // Panel seams.
        g.strokeStyle = '#3b6168'; g.lineWidth = 4;
        const seam = (pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); };
        for (const zz of [-0.14, 0.92]) { seam([[X(zz), Yt(0.05)], [X(zz), Yt(0.3)]]); seam([[X(zz), Yt(0.7)], [X(zz), Yt(0.95)]]); }
        seam([[X(0.98), Yt(0.33)], [X(1.8), Yt(0.33)], [X(1.92), Yt(0.5)], [X(1.8), Yt(0.67)], [X(0.98), Yt(0.67)]]);
        seam([[X(-1.62), Yt(0.33)], [X(-1.9), Yt(0.36)], [X(-1.9), Yt(0.64)], [X(-1.62), Yt(0.67)]]);
        g.lineWidth = 3; seam([[X(-0.14), Yt(0.1)], [X(0.92), Yt(0.1)]]); seam([[X(-0.14), Yt(0.9)], [X(0.92), Yt(0.9)]]);
        // Rust, weighted to the east flank and the arches where it belongs.
        for (const [z, v, rx, ry] of [[0.68, 0.15, 90, 50], [1.62, 0.16, 62, 40], [-0.62, 0.12, 110, 52], [-1.72, 0.18, 70, 44], [0.2, 0.08, 120, 26], [1.72, 0.3, 44, 30], [1.12, 0.36, 50, 22], [-1.7, 0.42, 60, 28], [1.42, 0.62, 56, 26], [0.4, 0.86, 90, 40], [-0.9, 0.9, 80, 40], [1.75, 0.82, 44, 34]]) rust(X(z), Yt(v), rx, ry);
        g.strokeStyle = 'rgba(125,58,42,.55)'; g.lineCap = 'round';
        for (let i = 0; i < 26; i++) { const x = X(rr.range(-1.8, 1.8)), y = Yt(rr.range(0.18, 0.235)), l = rr.range(18, 70); g.lineWidth = rr.range(2.5, 6); seam([[x, y], [x + rr.range(-3, 3), y + l]]); }
        // Greenhouse: cream, streaked at the window corners.
        g.fillStyle = '#ece4cc'; g.fillRect(0, 0, w, h * 0.5);
        g.fillStyle = '#d3cbb2'; g.fillRect(0, Yc(0.34), w, Yc(0.2) - Yc(0.34)); g.fillRect(0, Yc(0.8), w, Yc(0.66) - Yc(0.8));
        for (const [z, a, rx, ry] of [[0.92, 0.21, 40, 34], [-0.11, 0.1, 30, 58], [-1.23, 0.1, 38, 54], [1.02, 0.5, 70, 20], [0.36, 0.26, 44, 22], [-1.6, 0.4, 60, 30], [0.92, 0.8, 34, 38], [-0.11, 0.9, 26, 46]]) rust(X(z), Yc(a), rx, ry);
        g.lineWidth = 4; g.strokeStyle = 'rgba(125,58,42,.5)';
        for (const [z, a] of [[0.4, 0.02], [-0.11, 0.02], [-0.7, 0.02], [-1.2, 0.02]]) seam([[X(z), Yc(a) - 34], [X(z) + 2, Yc(a) + 36]]);
      }, { repeat: false });
    }
    /** Shares the greenhouse UVs. Alpha is what remains of each pane. */
    function glassTexture() {
      const rr = ctx.seeded('wreck-glass');
      return ctx.canvasTexture(2048, 512, (g, w, h) => {
        const X = (z) => ((z + 2) / 4) * w, Yc = (a) => h - a * h;
        g.clearRect(0, 0, w, h);
        const rect = (W) => [X(W.z[0]), Yc(W.a[1]), X(W.z[1]) - X(W.z[0]), Yc(W.a[0]) - Yc(W.a[1])];
        for (const W of Object.values(WIN)) {
          const [x, y, ww, hh] = rect(W);
          g.fillStyle = 'rgba(176,232,226,.62)'; g.fillRect(x, y, ww, hh);
          g.save(); g.beginPath(); g.rect(x, y, ww, hh); g.clip();
          g.fillStyle = 'rgba(255,255,255,.42)';
          for (const f of [0.2, 0.62]) { g.beginPath(); g.moveTo(x + ww * f, y + hh); g.lineTo(x + ww * (f + 0.1), y + hh); g.lineTo(x + ww * (f + 0.34), y); g.lineTo(x + ww * (f + 0.24), y); g.fill(); }
          g.restore();
        }
        const star = (cx, cy, r, n, close = true) => {
          g.save(); g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; g.beginPath();
          for (let i = 0; i < n; i++) { const a = (i / n) * 6.283, k = i % 2 ? rr.range(0.3, 0.6) : rr.range(0.8, 1.25); g.lineTo(cx + Math.cos(a) * r * 1.5 * k, cy + Math.sin(a) * r * k); }
          if (close) g.closePath(); g.fill(); g.restore();
          g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 3;
          for (let i = 0; i < 12; i++) {
            const a = rr() * 6.283; let x = cx + Math.cos(a) * r * 1.4 * 0.7, y = cy + Math.sin(a) * r * 0.7; g.beginPath(); g.moveTo(x, y);
            for (let k = 0; k < 4; k++) { x += Math.cos(a + rr.range(-0.4, 0.4)) * rr.range(30, 66); y += Math.sin(a + rr.range(-0.4, 0.4)) * rr.range(14, 38); g.lineTo(x, y); }
            g.stroke();
          }
        };
        const ws = rect(WIN.screen); star(ws[0] + ws[2] * 0.42, ws[1] + ws[3] * 0.72, ws[3] * 0.28, 16);
        const wr = rect(WIN.rear); star(wr[0] + wr[2] * 0.5, wr[1] + wr[3] * 0.4, wr[3] * 0.34, 14);
        const wf = rect(WIN.westF); star(wf[0] + wf[2] * 0.6, wf[1] + wf[3] * 0.5, wf[3] * 0.26, 12);
        const clearTo = (W, keep) => { // only a jagged sill of glass survives
          const [x, y, ww, hh] = rect(W); g.save(); g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; g.beginPath();
          g.moveTo(x - 4, y - 4); g.lineTo(x + ww + 4, y - 4); g.lineTo(x + ww + 4, y + hh * keep);
          for (let i = 1; i < 12; i++) g.lineTo(x + ww * (1 - i / 12), y + hh * (keep + (i % 2 ? 0.2 : -0.08) * rr.range(0.4, 1.1)));
          g.lineTo(x - 4, y + hh * keep); g.closePath(); g.fill(); g.restore();
        };
        clearTo(WIN.eastF, 0.72); clearTo(WIN.eastR, 0.9); clearTo(WIN.westR, 0.7);
      }, { repeat: false });
    }
  }

  // ====================================================================================================================
  //  FOOTBRIDGE
  // ====================================================================================================================
  function remap(geo, u0, v0, u1, v1) { // plane uv 0..1 → sign-atlas rectangle
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, lerp(u0, u1, uv.getX(i)), lerp(v0, v1, uv.getY(i)));
  }
  function signTexture() {
    const rr = ctx.seeded('wreck-sign');
    return ctx.canvasTexture(1024, 512, (g, w) => {
      const JP = '"Hiragino Kaku Gothic ProN","Hiragino Sans","Noto Sans CJK JP","Yu Gothic",sans-serif';
      g.fillStyle = P.concreteMid; g.fillRect(0, 0, w, 512);
      // Banner, canvas rows 0..256.
      g.fillStyle = '#f0e8d0'; g.fillRect(0, 0, w, 256);
      g.fillStyle = '#6f9fb0'; g.fillRect(0, 0, w, 34); g.fillRect(0, 222, w, 34);
      g.fillStyle = '#fff6df'; g.fillRect(0, 34, w, 6); g.fillRect(0, 216, w, 6);
      g.fillStyle = '#c8604f'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 138px ${JP}`;
      [...'交通安全'].forEach((ch, i) => g.fillText(ch, 150 + i * 192, 130));
      g.fillStyle = 'rgba(240,232,208,.55)';                                     // sun has eaten the paint in flakes
      for (let i = 0; i < 90; i++) { g.beginPath(); g.ellipse(rr() * w, 40 + rr() * 176, rr.range(4, 30), rr.range(2, 10), rr() * 3, 0, 6.3); g.fill(); }
      const streak = (x, l, wd) => { g.fillStyle = 'rgba(158,78,48,.5)'; g.fillRect(x, 0, wd, l); g.fillStyle = 'rgba(158,78,48,.26)'; g.fillRect(x - wd, 0, wd * 3, l * 0.55); };
      for (let i = 0; i < 12; i++) streak(rr() * w, rr.range(30, 150), rr.range(3, 7));
      for (const x of [22, 502, 1000]) for (const y of [16, 240]) { g.fillStyle = '#b5522f'; g.beginPath(); g.arc(x, y, 11, 0, 6.3); g.fill(); }
      // Number plate, u 0..0.25, v 0..0.25 → canvas x 0..256, y 384..512.
      g.fillStyle = '#efe6b8'; g.fillRect(0, 384, 256, 128);
      g.strokeStyle = '#5f7a5a'; g.lineWidth = 7; g.strokeRect(5, 389, 246, 118);
      g.fillStyle = '#4f7255'; g.textBaseline = 'alphabetic'; g.font = `700 32px ${JP}`; g.fillText('緑ヶ丘 50', 128, 430);
      g.font = `800 66px ${JP}`; g.fillText('2-71', 128, 498);
      g.fillStyle = 'rgba(181,82,47,.65)'; g.beginPath(); g.ellipse(210, 492, 44, 22, 0.3, 0, 6.3); g.fill();
    }, { repeat: false });
  }

  function buildBridge() {
    const F = WRECK.footbridge, [zN, zS] = F.z, Y = F.deckY, TH = F.deckT, HINGE = 6.9, STAIR = F.stairs;
    const about = (x, y, a) => new M4().makeTranslation(x, y, 0).multiply(new M4().makeRotationZ(a)).multiply(new M4().makeTranslation(-x, -y, 0));
    const M0 = new M4(), M1 = about(HINGE, Y - TH, 0.115), M2 = about(1.6, Y, -0.032);   // M1 is the sagging free end, M2 the stub
    const with_ = (M, o) => M.clone().multiply(kit.xf(o));
    const wp = (M, x, y, z) => new V3(x, y, z).applyMatrix4(M);
    const RAIL = '#6fa6a0', RAIL2 = '#8fbdb1', STEEL = '#5a7476';

    // ---- deck ----
    const crack = kit.jag([[HINGE, zS], [HINGE + 0.1, -8.9], [HINGE - 0.06, -9.5], [HINGE + 0.05, zN]], 0.2, 0.07, rng, false);
    const breakE = [[5.12, zN], [5.2, -9.7], [5.0, -9.42], [5.24, -9.1], [5.06, -8.82], [5.46, -8.55], [5.3, -8.28], [5.62, zS]];
    const breakJ = kit.jag(breakE, 0.13, 0.05, rng, false).map(([x, z]) => [Math.max(5.0, x), z]);
    const eastEnd = kit.jag([[11.97, zS], [11.97, zN]], 0.3, 0.04, rng, false).map(([x, z]) => [Math.min(11.98, x), z]);
    const pave = '#c79f8c';
    function deck(outline, topOutline, M, x0, x1) {
      hard.add(kit.plate(outline, [], Y - 0.05, 0.27), 'concrete', { matrix: M });
      hard.add(kit.plate(topOutline, [], Y, 0.05), 'concrete', { matrix: M, color: pave });
      hard.add(cbox(x1 - x0, 0.15, 1.46, 0.012), 'concreteClean', { matrix: with_(M, { pos: [(x0 + x1) / 2, Y - TH + 0.075, (zN + zS) / 2] }), color: '#c6c5bb' });
      for (const z of [zN + 0.02, zS - 0.02]) hard.add(cbox(x1 - x0, 0.09, 0.09, 0.008), 'concreteClean', { matrix: with_(M, { pos: [(x0 + x1) / 2, Y - 0.21, z] }), color: '#eae6da' });
    }
    deck([...eastEnd, ...[...crack].reverse()], [[11.9, zN + 0.05], [11.9, zS - 0.05], ...crack.map(([x, z]) => [x + 0.06, clamp(z, zN + 0.05, zS - 0.05)])], M0, HINGE + 0.08, 11.9);
    const crack2 = crack.map(([x, z]) => [x - 0.03, z]);
    deck([...crack2, ...breakJ], [...crack2.map(([x, z]) => [x - 0.05, clamp(z, zN + 0.05, zS - 0.05)]), ...kit.jag([[5.42, zN + 0.05], [5.5, -9.6], [5.3, -9.3], [5.56, -9.0], [5.4, -8.75], [5.76, -8.5], [5.86, zS - 0.05]], 0.14, 0.06, rng, false)], M1, 5.5, HINGE - 0.12);
    const stubBreak = kit.jag([[2.96, zS], [2.82, -8.42], [3.06, -8.72], [2.9, -9.05], [3.1, -9.4], [2.84, -9.72], [3.02, zN]], 0.13, 0.05, rng, false);
    deck([[1.62, zN], [1.62, zS], ...stubBreak], [[1.64, zN + 0.05], [1.64, zS - 0.05], ...stubBreak.map(([x, z]) => [x - 0.2, clamp(z, zN + 0.05, zS - 0.05)])], M2, 1.64, 2.74);

    // ---- kerbs & railings ----
    const curb = (x0, x1, z, M) => hard.add(cbox(x1 - x0, 0.3, 0.17, 0.016, 3), 'concrete', { matrix: with_(M, { pos: [(x0 + x1) / 2, Y + 0.15, z] }) });
    const zcN = zN + 0.09, zcS = zS - 0.09;
    curb(HINGE + 0.08, 11.95, zcN, M0); curb(HINGE + 0.08, STAIR.x[0], zcS, M0); curb(STAIR.x[1], 11.95, zcS, M0);
    curb(5.32, HINGE - 0.06, zcN, M1); curb(5.86, HINGE - 0.06, zcS, M1);
    curb(1.64, 2.86, zcN, M2); curb(1.64, 2.7, zcS, M2);
    const H0 = Y + 0.3, H1 = Y + 1.05;
    function railing(x0, x1, z, M, { missing = [] } = {}) {
      const posts = Math.max(1, Math.round((x1 - x0) / 1.05));
      for (let i = 0; i < posts; i++) {
        const a = lerp(x0, x1, i / posts), b = lerp(x0, x1, (i + 1) / posts), col = rng() < 0.32 ? null : rng.pick([RAIL, RAIL, RAIL2]);
        const skip = missing.some(([p, q]) => a < q && b > p), surf = col ? 'flat' : 'rust', o = col ? { color: col } : {};
        hard.add(rod([a, H0 - 0.05, z], [a, H1 + 0.03, z], 0.036, 6), surf, { matrix: M, ...o });
        hard.add(lump(0.044, 0.03, 0.044, 6), surf, { matrix: with_(M, { pos: [a, H1 + 0.04, z] }), ...o });
        if (skip) continue;
        hard.add(rod([a, H1, z], [b, H1, z], 0.03, 6), surf, { matrix: M, ...o });
        hard.add(rod([a, H0 + 0.07, z], [b, H0 + 0.07, z], 0.016, 5), surf, { matrix: M, ...o });
        for (let x = a + 0.15; x < b - 0.06; x += 0.15) if (rng() > 0.08) hard.add(rod([x, H0 + 0.07, z], [x, H1, z], 0.0125, 4), surf, { matrix: M, ...o });
      }
      hard.add(rod([x1, H0 - 0.05, z], [x1, H1 + 0.03, z], 0.036, 6), 'flat', { matrix: M, color: RAIL });
    }
    railing(HINGE + 0.15, 11.9, zcN, M0, { missing: [[8.6, 9.3]] });
    railing(HINGE + 0.15, STAIR.x[0] + 0.02, zcS, M0);
    railing(STAIR.x[1], 11.9, zcS, M0);
    railing(5.5, HINGE - 0.15, zcN, M1);
    railing(6.0, HINGE - 0.15, zcS, M1);
    railing(1.72, 2.72, zcN, M2);
    railing(1.72, 2.52, zcS, M2);

    // Torn-loose top rail on the north side, curling out past the break.
    hard.add(kit.tube([[5.5, H1, zcN], [5.1, H1 - 0.02, zcN], [4.72, H1 - 0.2, zcN + 0.1], [4.5, H1 - 0.6, zcN + 0.24], [4.52, H1 - 0.95, zcN + 0.26]], 0.03, 0.03, 6, 22), 'rust', { matrix: M1 });
    hard.add(kit.tube([[5.5, H0 + 0.07, zcN], [5.2, H0 + 0.05, zcN], [4.98, H0 - 0.18, zcN + 0.05], [4.92, H0 - 0.5, zcN + 0.1]], 0.016, 0.016, 5, 16), 'rust', { matrix: M1 });
    // The south railing dangles off the free end as a whole bent panel, and it swings a little.
    {
      const pv = wp(M1, 6.0, H1, zcS);
      const st = swayHard.strand([pv.x, pv.y, pv.z], 2.3, 0.05);
      const A = [[6.0, H1, zcS], [5.66, H1 - 0.02, zcS + 0.02], [5.34, H1 - 0.3, zcS + 0.12], [5.22, H1 - 0.95, zcS + 0.2], [5.2, H1 - 1.7, zcS + 0.22], [5.26, H1 - 2.2, zcS + 0.2]].map((p) => wp(M1, ...p));
      const B = [[6.0, H0 + 0.07, zcS], [5.86, H0 + 0.05, zcS + 0.04], [5.76, H0 - 0.2, zcS + 0.12], [5.78, H0 - 0.8, zcS + 0.2], [5.82, H0 - 1.3, zcS + 0.22]].map((p) => wp(M1, ...p));
      st.add(kit.tube(A, 0.03, 0.03, 6, 26), {}, P.rust);
      st.add(kit.tube(B, 0.017, 0.017, 5, 20), {}, P.rustDark);
      const ca = new THREE.CatmullRomCurve3(A), cb = new THREE.CatmullRomCurve3(B);
      for (let i = 1; i < 10; i++) {
        if (i === 6) continue;
        const a = ca.getPoint(i / 10.5).toArray(), b = cb.getPoint(i / 10).toArray();
        st.add(rod(a, b, 0.0125, 4), {}, i % 3 ? RAIL : P.rust);
      }
      st.add(kit.tube([[5.2, H1 - 2.2, zcS + 0.2], [5.3, H1 - 2.28, zcS + 0.15], [5.35, H1 - 2.1, zcS + 0.1]].map((p) => wp(M1, ...p)), 0.016, 0.01, 4, 8), {}, P.rustDark);
      const pv2 = wp(M2, 2.52, H1, zcS), st2 = swayHard.strand([pv2.x, pv2.y, pv2.z], 1.3, 0.035);
      const A2 = [[2.52, H1, zcS], [2.78, H1 - 0.06, zcS + 0.04], [2.96, H1 - 0.5, zcS + 0.1], [2.98, H1 - 1.2, zcS + 0.14]].map((p) => wp(M2, ...p));
      const B2 = [[2.52, H0 + 0.07, zcS], [2.6, H0 - 0.02, zcS + 0.05], [2.66, H0 - 0.5, zcS + 0.1]].map((p) => wp(M2, ...p));
      st2.add(kit.tube(A2, 0.03, 0.03, 6, 18), {}, P.rust); st2.add(kit.tube(B2, 0.016, 0.016, 5, 12), {}, P.rustDark);
      const cA2 = new THREE.CatmullRomCurve3(A2), cB2 = new THREE.CatmullRomCurve3(B2);
      for (let i = 1; i < 5; i++) st2.add(rod(cA2.getPoint(i / 6).toArray(), cB2.getPoint(i / 5).toArray(), 0.0125, 4), {}, RAIL);
    }

    // ---- the banner panel, on the south face where the cameras can read it ----
    {
      const bx = 8.22, by = Y + 0.7, bz = zS + 0.075, W = 2.34, H = 0.62, rot = [0, 0, -0.022];
      const sh = new THREE.Shape([[-W / 2, -H / 2 + 0.2], [-W / 2 + 0.1, -H / 2 + 0.13], [-W / 2 + 0.15, -H / 2 + 0.17], [-W / 2 + 0.3, -H / 2 + 0.03], [-W / 2 + 0.42, -H / 2], [W / 2, -H / 2], [W / 2, H / 2], [-W / 2, H / 2]].map(([x, y]) => new THREE.Vector2(x, y)));
      const g = new THREE.ShapeGeometry(sh), p = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + W / 2) / W, 0.5 + (0.5 * (p.getY(i) + H / 2)) / H);
      hard.add(g, signMat, { pos: [bx, by, bz], rot });
      const fr = 'rust';
      hard.add(cbox(W + 0.06, 0.04, 0.05, 0.003, 3), fr, { pos: [bx, by + H / 2 + 0.01, bz - 0.02], rot });
      hard.add(cbox(W - 0.4, 0.035, 0.05, 0.003, 3), fr, { pos: [bx + 0.2, by - H / 2 - 0.016, bz - 0.02], rot });
      hard.add(cbox(0.04, H, 0.05, 0.003, 2), fr, { pos: [bx + W / 2 + 0.01, by, bz - 0.02], rot });
      hard.add(cbox(W, H, 0.03, 0.002, 1), 'flat', { pos: [bx, by, bz - 0.03], rot, color: '#7b8b86' });
      for (const x of [-0.8, 0.1, 0.9]) hard.add(rod([bx + x, by + 0.2, bz - 0.02], [bx + x, by + 0.2, bz - 0.17], 0.02, 5), 'rust', {});
    }

    // ---- the east end sits at the diorama's edge: a clean sawn section, rebar stubs flush with it ----
    for (const z of [-9.75, -9.3, -8.85, -8.4]) for (const y of [Y - 0.12, Y - 0.3]) hard.add(kit.cyl(0.024, 0.024, 0.05, 5).rotateZ(Math.PI / 2), 'rust', { pos: [11.965, y, z] });

    // ---- snapped end: rebar, broken lumps, hanging slabs ----
    function rebars(xBase, M, dirX, list) {
      for (const [z, y, reach, drop] of list) {
        const j = rng.range(-0.1, 0.1);
        hard.add(kit.tube([[xBase + 0.5 * -dirX, y, z], [xBase, y, z], [xBase + dirX * reach * 0.55, y - drop * 0.14, z + j * 0.5], [xBase + dirX * reach * 0.9, y - drop * 0.55, z + j], [xBase + dirX * reach, y - drop, z + j * 1.3]], 0.024, 0.02, 5, 14), 'rust', { matrix: M });
      }
    }
    const R = [];
    for (let z = zN + 0.22; z < zS - 0.1; z += 0.27) for (const y of [Y - 0.1, Y - 0.3]) R.push([z + rng.range(-0.05, 0.05), y, rng.range(0.28, 0.9), rng.range(0.1, 0.85)]);
    rebars(5.34, M1, -1, R);
    for (const [x, z, s] of [[5.34, -9.78, 1], [5.2, -8.9, 1.3], [5.44, -8.5, 0.9], [5.32, -9.3, 1.1], [5.6, -8.22, 0.9]]) hard.add(kit.rock(0.24 * s, rng, 0.75, 1), 'concrete', { matrix: with_(M1, { pos: [x, Y - TH + 0.08, z], rot: [rng(), rng() * 6, rng()] }) });
    for (const x of [5.42, 5.66]) hard.add(rod([x, Y - 0.2, zN + 0.2], [x, Y - 0.2, zS - 0.2], 0.018, 4), 'rust', { matrix: M1 });
    const S2 = [];
    for (let z = zN + 0.24; z < zS - 0.1; z += 0.34) for (const y of [Y - 0.1, Y - 0.3]) S2.push([z + rng.range(-0.04, 0.04), y, rng.range(0.2, 0.6), rng.range(0.05, 0.45)]);
    rebars(2.92, M2, 1, S2);
    for (const [x, z, s] of [[2.9, -9.3, 1], [2.86, -8.6, 1.2], [2.82, -9.8, 0.8]]) hard.add(kit.rock(0.22 * s, rng, 0.75, 1), 'concrete', { matrix: with_(M2, { pos: [x, Y - TH + 0.08, z], rot: [rng(), rng() * 6, rng()] }) });

    const slab = (w, d, th, amt = 0.1) => kit.plate(kit.jag([[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]], 0.24, amt, rng), [], th / 2, th);
    // Hanging slabs, held by their reinforcement.
    {
      const a = wp(M1, 4.86, Y - 1.3, -9.55), r1 = wp(M1, 5.1, Y - 0.2, -9.72), r2 = wp(M1, 5.1, Y - 0.2, -9.32);
      hard.add(slab(1.3, 0.92, 0.26), 'concrete', { pos: a.toArray(), rot: [0.1, 0.22, 1.2] });
      hard.add(kit.tube([r1.toArray(), [a.x + 0.24, a.y + 0.74, a.z - 0.2], [a.x + 0.1, a.y + 0.3, a.z - 0.18]], 0.024, 0.024, 5, 12), 'rust', {});
      hard.add(kit.tube([r2.toArray(), [a.x + 0.26, a.y + 0.72, a.z + 0.18], [a.x + 0.1, a.y + 0.3, a.z + 0.18]], 0.024, 0.024, 5, 12), 'rust', {});
      const b = wp(M1, 5.02, Y - 0.62, -8.72);
      hard.add(slab(0.72, 0.62, 0.22), 'concrete', { pos: b.toArray(), rot: [-0.3, 0, 0.72] });
      hard.add(kit.tube([wp(M1, 5.28, Y - 0.2, -8.74).toArray(), [b.x + 0.1, b.y + 0.24, b.z - 0.05]], 0.022, 0.022, 5, 6), 'rust', {});
    }
    // Fallen deck on the road: slabs stacked and tilted, reinforcing still in them.
    for (const [x, y, z, w, d, th, rot] of [[4.4, 0.46, -9.1, 1.5, 1.2, 0.3, [0.14, 0.5, 0.52]], [5.52, 0.2, -9.86, 1.1, 0.9, 0.26, [-0.12, 1.4, -0.14]], [3.86, 0.17, -8.1, 0.76, 0.66, 0.2, [0.08, 2.2, 0.08]], [5.3, 0.17, -8.1, 0.56, 0.5, 0.18, [0.1, 0.3, -0.1]]]) {
      hard.add(slab(w, d, th), 'concrete', { pos: [x, y, z], rot });
      hard.add(cbox(w * 0.7, 0.04, d * 0.5, 0.01), 'concrete', { pos: [x, y + th * 0.55, z], rot, color: pave });
    }
    hard.add(kit.tube([[4.2, 0.7, -8.8], [3.9, 1.02, -8.6], [3.62, 1.08, -8.52], [3.44, 0.9, -8.56]], 0.022, 0.018, 5, 12), 'rust');
    hard.add(kit.tube([[4.6, 0.72, -9.4], [4.4, 1.12, -9.46], [4.32, 1.34, -9.6]], 0.022, 0.018, 5, 10), 'rust');
    hard.add(kit.tube([[5.7, 0.36, -9.6], [6.1, 0.72, -9.5], [6.2, 0.86, -9.3]], 0.022, 0.018, 5, 10), 'rust');
    for (let i = 0; i < 26; i++) {
      const x = rng.range(3.5, 6.7), z = rng.range(-10.8, -7.6);
      hard.add(kit.rock(rng.range(0.07, 0.2), rng, 0.72), 'concrete', { pos: [x, 0.05, z], rot: [rng(), rng() * 6, rng()] });
      if (i % 2) tuft(S, x + 0.1, 0.02, z - 0.1, rng.range(0.24, 0.42), 4);
    }

    // ---- wall stub bolted to the building ----
    {
      const X = 1.62;
      hard.add(cbox(0.1, 1.22, 2.26, 0.006, 2), 'rust', { pos: [X, Y - 0.06, (zN + zS) / 2] });
      for (let i = 0; i < 6; i++) for (const y of [Y + 0.42, Y - 0.56]) {
        const z = lerp(zN + 0.1, zS - 0.1, i / 5);
        hard.add(kit.cyl(0.05, 0.05, 0.05, 6).rotateZ(Math.PI / 2), 'flat', { pos: [X + 0.07, y, z], color: STEEL });
        hard.add(kit.cyl(0.024, 0.024, 0.1, 6).rotateZ(Math.PI / 2), 'rust', { pos: [X + 0.11, y, z] });
      }
      for (const z of [-9.7, -8.5]) {
        hard.add(cbox(0.12, 0.62, 0.3, 0.006, 1), 'rust', { pos: [X + 0.08, 3.46, z] });
        hard.add(rod([X + 0.1, 3.42, z], [2.7, Y - TH + 0.02, z], 0.05, 6), 'flat', { color: STEEL });
        hard.add(rod([X + 0.1, 3.42, z], [X + 0.1 + 0.44, 3.42 + 0.3, z], 0.054, 6), 'rust', {});
        hard.add(cbox(0.3, 0.05, 0.16, 0.004, 1), 'rust', { pos: [2.66, Y - TH - 0.04, z] });
      }
    }

    // ---- pier ----
    const PX = F.pier.x, PZ = F.pier.z;
    const prism = (pts, depth, xCenter, zCenter, bevel = 0.05) => {
      const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b))), { depth: depth - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: 3 });
      g.translate(0, 0, -(depth - bevel * 2) / 2); g.rotateY(-Math.PI / 2); g.translate(xCenter, 0, zCenter); return g;
    };
    hard.add(prism([[-0.42, 0], [0.42, 0], [0.42, 2.95], [0.96, 3.66], [0.96, 4.08], [-0.96, 4.08], [-0.96, 3.66], [-0.42, 2.95]], 0.76, PX, PZ), 'concrete');
    hard.add(cbox(1.2, 0.34, 1.36, 0.03), 'concrete', { pos: [PX, 0.17, PZ] });
    for (const z of [-0.7, 0.7]) hard.add(cbox(0.4, 0.07, 0.36, 0.004, 1), 'rust', { pos: [PX, 4.13, PZ + z] });
    hard.add(cbox(0.14, 2.4, 0.03, 0.01, 2), 'concreteClean', { pos: [PX + 0.38, 2.0, PZ + 0.3], color: '#8e9490' });        // old water stain
    hard.add(cbox(0.4, 0.7, 0.03, 0.03, 2), 'concreteClean', { pos: [PX + 0.05, 1.7, PZ + 0.43], color: '#a2a59c' });        // spalled cover
    for (const dx of [-0.08, 0.06, 0.18]) hard.add(kit.tube([[PX + dx, 1.3, PZ + 0.45], [PX + dx + 0.01, 1.7, PZ + 0.47], [PX + dx, 2.1, PZ + 0.45]], 0.02, 0.02, 4, 6), 'rust');
    hard.add(rod([PX - 0.1, 1.55, PZ + 0.46], [PX + 0.26, 1.55, PZ + 0.46], 0.014, 4), 'rust');
    hard.add(rod([PX - 0.1, 1.86, PZ + 0.46], [PX + 0.26, 1.86, PZ + 0.46], 0.014, 4), 'rust');

    // ---- stairs ----
    const n = 16, rise = Y / n, run = (STAIR.z[1] - STAIR.z[0]) / n, cheek = 0.17;
    const stairY = (z) => Y * (1 - (z - STAIR.z[0]) / (STAIR.z[1] - STAIR.z[0]));
    {
      const pts = [[STAIR.z[0], Y]]; let z = STAIR.z[0], y = Y;
      for (let i = 0; i < n; i++) { z += run; pts.push([z, y]); y -= rise; pts.push([z, y]); }
      pts.push([STAIR.z[1], -0.1], [STAIR.z[1] - 0.46, -0.1], [STAIR.z[0], Y - 0.62]);
      const steps = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b))), { depth: STAIR.x[1] - STAIR.x[0] - cheek * 2, bevelEnabled: false });
      steps.rotateY(-Math.PI / 2).translate(STAIR.x[1] - cheek, 0, 0);
      hard.add(steps, 'concrete');
      // Nosing strips, a pale line on each step so the flight reads from far away.
      for (let i = 0; i < n; i++) {
        const zz = STAIR.z[0] + run * (i + 1), yy = Y - rise * i;
        if (i % 5 === 3) continue;
        hard.add(cbox(STAIR.x[1] - STAIR.x[0] - cheek * 2 - 0.04, 0.035, 0.05, 0.004, 2), 'concreteClean', { pos: [(STAIR.x[0] + STAIR.x[1]) / 2, yy - 0.01, zz - 0.02], color: '#f3eede' });
      }
      const ch = (x0) => {
        const top = kit.jag([[STAIR.z[1] + 0.02, 0.5], [STAIR.z[1] - 0.5, 0.56], [STAIR.z[0] - 0.02, Y + 0.42]], 0.5, 0.025, rng, false);
        const g = new THREE.ExtrudeGeometry(new THREE.Shape([[STAIR.z[1] + 0.02, -0.1], ...top, [STAIR.z[0] - 0.02, Y - 0.62], [STAIR.z[1] - 0.5, -0.1]].map(([a, b]) => new THREE.Vector2(a, b))), { depth: cheek, bevelEnabled: false });
        g.rotateY(-Math.PI / 2).translate(x0 + cheek, 0, 0); return g;
      };
      hard.add(ch(STAIR.x[0]), 'concrete'); hard.add(ch(STAIR.x[1] - cheek), 'concrete');
      for (const x of [STAIR.x[0] + cheek / 2, STAIR.x[1] - cheek / 2]) {
        const brk = x < 10.4;   // the west handrail gave up halfway
        const z0 = STAIR.z[0], z1 = STAIR.z[1] - 0.25, zEnd = brk ? lerp(z0, z1, 0.62) : z1, yAt = (z) => stairY(z) + 1.02;
        hard.add(rod([x, yAt(z0), z0], [x, yAt(zEnd), zEnd], 0.03, 6), brk ? 'rust' : 'flat', brk ? {} : { color: RAIL });
        for (let z = z0 + 0.6; z < zEnd + 0.01; z += 0.9) hard.add(rod([x, stairY(z) + 0.42, z], [x, yAt(z) + 0.02, z], 0.024, 5), rng() < 0.4 ? 'rust' : 'flat', { color: RAIL });
        if (brk) hard.add(kit.tube([[x, yAt(zEnd), zEnd], [x - 0.08, yAt(zEnd) - 0.14, zEnd + 0.26], [x - 0.3, yAt(zEnd) - 0.4, zEnd + 0.46], [x - 0.44, yAt(zEnd) - 0.72, zEnd + 0.5]], 0.03, 0.03, 6, 14), 'rust');
      }
      // Mid-flight support.
      const zc = -5.95, top = stairY(zc) - 0.58;
      hard.add(cbox(0.56, top, 0.5, 0.02), 'concrete', { pos: [10.45, top / 2, zc] });
      hard.add(cbox(1.4, 0.24, 0.62, 0.02), 'concrete', { pos: [10.45, top - 0.02, zc], rot: [-0.72, 0, 0] });
      hard.add(cbox(0.9, 0.26, 0.86, 0.02), 'concrete', { pos: [10.45, 0.13, zc] });
    }

    // ---- moss, ivy, vines ----
    const mossy = (x, y, z, r, flat = 0.4, M = M0) => { const p = wp(M, x, y, z); soft.add(lump(r, r * flat, r * rng.range(0.9, 1.5), 9), 'mossy', { pos: p.toArray(), rot: [0, rng() * 6, 0], color: rng.pick(['#ffffff', '#ffffff', '#d9f0a8']) }); };
    const deckTop = (x) => Y + 0.002 - (x < HINGE ? (HINGE - x) * Math.tan(0.115) : 0);
    const deckMask = (x, z) => {
      const m = 0.42 * Math.sin(x * 1.7 + 0.4) + 0.3 * Math.sin(z * 3.1 + x * 0.6) + 0.2 * Math.sin(x * 4.3 - z * 2.1) + 0.1 * Math.sin(x * 9 + z * 7) + (Math.abs(z + 9.1) - 0.55) * 1.1;
      return Math.min(m, x - 5.95);
    };
    carpet(84, 18, 5.9, 11.9, zN + 0.18, zS - 0.18, (x) => deckTop(x), deckMask, 0.05);
    // A curtain of moss down the south face, with a scalloped top and bottom.
    {
      const n = 62, rows = 5, pos = [], idx = [];
      for (let i = 0; i <= n; i++) {
        const x = lerp(5.92, 9.46, i / n), M = x < HINGE ? M1 : M0;
        const g = Math.sin(x * 1.31 + 0.5) + 0.6 * Math.sin(x * 3.7 + 1.1), a = smooth(-0.35, 0.3, g), mid = Y - 0.18;
        const top = lerp(mid, Y - 0.05 - 0.08 * Math.abs(Math.sin(x * 4.7 + 0.7)) - 0.05 * Math.abs(Math.sin(x * 11.3)), a);
        const low = lerp(mid, Y - 0.29 - 0.1 * Math.pow(Math.abs(Math.sin(x * 3.3 + 1)), 2) - 0.09 * Math.abs(Math.sin(x * 8.9)), a);
        const row = [[top, zS - 0.005], [lerp(top, low, 0.12), zS + 0.05], [lerp(top, low, 0.6), zS + 0.062], [low + 0.03, zS + 0.05], [low, zS + 0.0]];
        for (const [y, z] of row) pos.push(...wp(M, x, y, z).toArray());
      }
      for (let i = 0; i < n; i++) for (let j = 0; j < rows - 1; j++) { const a = i * rows + j, b = a + rows; idx.push(a, a + 1, b, b, a + 1, b + 1); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      soft.add(g, 'mossy', { color: '#e9f6b4' });
    }
    for (let i = 0; i < 18; i++) { const z = rng.range(zN + 0.3, zS - 0.3), x = rng.range(5.7, 11.8), p = wp(x < HINGE ? M1 : M0, x, Y + 0.02, z); tuft(S, p.x, p.y, p.z, rng.range(0.22, 0.42), 5); if (i % 3 === 0) bloom(S, new V3(p.x, p.y + 0.3, p.z), rng.pick([P.flowerYellow, P.flowerWhite]), 0.07); }
    for (const [x, z, a, b, c] of [[9.1, -9.72, 0.42, 0.3, 40], [7.4, -9.76, 0.3, 0.22, 26], [10.9, -9.7, 0.34, 0.26, 28], [6.3, -9.72, 0.26, 0.18, 20]]) {
      const M = x < HINGE ? M1 : M0, p = wp(M, x, Y + a * 0.5, z); shrub(p, a, b, c); shrubLeaves(p.clone().setY(p.y - b * 0.5));
      for (let i = 0; i < 5; i++) S(kit.frond(rng.range(0.5, 0.8), 6, 0.2), { pos: [p.x, Y, p.z], rot: [rng.range(-0.3, 0.05), rng() * 6.283, 0] }, rng.pick([P.fern, P.leafMid]));
    }
    // Vines along the free span. Spacing is uneven on purpose: curtains and gaps.
    for (let x = 5.55; x < 9.6; x += rng.range(0.08, 0.34)) {
      if (x > 7.1 && x < 7.7) continue;
      const M = x < HINGE ? M1 : M0, p = wp(M, x, Y - 0.2, zS + 0.07);
      vine(p.toArray(), rng.range(0.5, 2.3) * (x < 6.5 ? 1.15 : 0.9), { amp: 0.18, tip: rng() < 0.2 ? P.flowerWhite : null });
    }
    for (let x = 5.5; x < 11.6; x += rng.range(0.3, 0.8)) { const M = x < HINGE ? M1 : M0, p = wp(M, x, Y - 0.2, zN - 0.07); vine(p.toArray(), rng.range(0.4, 1.8), { amp: 0.16, leafEvery: 0.13 }); }
    for (const z of [-9.9, -9.56, -9.16, -8.72]) { const p = wp(M1, 5.2, Y - 0.2, z); vine(p.toArray(), rng.range(0.8, 1.9), { amp: 0.18 }); }
    for (const z of [-9.8, -9.4, -8.9, -8.4]) { const p = wp(M2, 2.8, Y - 0.2, z); vine(p.toArray(), rng.range(0.6, 1.5), { amp: 0.16 }); }
    for (let x = 1.9; x < 2.8; x += 0.26) { const p = wp(M2, x, Y - 0.2, zS + 0.06); vine(p.toArray(), rng.range(0.4, 1.2), { amp: 0.14 }); }
    carpet(14, 12, 1.7, 2.72, zN + 0.18, zS - 0.18, (x) => Y + 0.002 - (x - 1.6) * Math.tan(0.032), (x, z) => 0.3 * Math.sin(x * 3.3 + 1) + 0.3 * Math.sin(z * 4.1 + x) + (Math.abs(z + 9.1) - 0.5) * 0.9, 0.04);
    for (const [x, w] of [[6.05, 0.7], [7.25, 0.5], [8.9, 0.5]]) ivyOn([x, Y + 0.3 - (x < HINGE ? (HINGE - x) * 0.1 : 0), zS + 0.01], [w, 0, 0], [0, -0.5, 0], [0, 0, 1], 26);
    // Over the rail, across the banner's east end.
    for (const [x, l] of [[9.26, 0.62], [9.12, 0.42], [8.96, 0.26]]) vine([x, H1 + 0.02, zS + 0.07], l, { amp: 0.05, drift: 0.05 });

    // Ivy up the pier and over the stair cheeks, with visible stems.
    ivyOn([PX + 0.39, 0.15, PZ - 0.45], [0, 3.0, 0], [0, 0, 0.9], [1, 0, 0], 130);
    ivyOn([PX - 0.4, 0.15, PZ + 0.44], [0, 2.7, 0], [0.8, 0, 0], [0, 0, 1], 54);
    hard.add(kit.tube([[PX + 0.4, 0.1, PZ + 0.1], [PX + 0.41, 1.0, PZ - 0.1], [PX + 0.41, 2.0, PZ + 0.12], [PX + 0.41, 3.0, PZ - 0.08]], 0.03, 0.012, 5, 18), 'flat', { color: P.woodDark });
    ivyOn([STAIR.x[1] + 0.005, 4.5, STAIR.z[0] + 0.1], [0, -3.0, 3.05], [0, -0.82, 0], [1, 0, 0], 140);
    ivyOn([STAIR.x[1] + 0.005, 1.2, STAIR.z[1] - 1.1], [0, -1.1, 1.0], [0, -0.7, 0], [1, 0, 0], 50);
    for (const [z, l] of [[-7.6, 1.4], [-6.9, 1.9], [-6.1, 1.1], [-5.3, 0.9], [-4.6, 0.6]]) vine([STAIR.x[1] + 0.05, stairY(z) + 0.4, z], l, { amp: 0.07, drift: 0.05 });
    for (const [z, l] of [[-7.4, 2.1], [-6.6, 1.5], [-5.2, 1.0]]) vine([STAIR.x[0] - 0.05, stairY(z) - 0.1, z], l, { amp: 0.08, drift: 0.06 });

    // Green coming down the flight, edges first.
    for (let i = 0; i < n; i++) {
      const zz = STAIR.z[0] + run * (i + 0.5), yy = Y - rise * i, cx = STAIR.x[0] + cheek + 0.1;
      if (i % 2 === 0) mossy(STAIR.x[0] + cheek + rng.range(0.06, 0.2), yy + 0.005, zz, rng.range(0.09, 0.15), 0.2);
      if (i % 3 === 1) mossy(STAIR.x[1] - cheek - rng.range(0.06, 0.2), yy + 0.005, zz, rng.range(0.08, 0.14), 0.2);
      if (i % 4 === 2) tuft(S, cx + rng.range(0, 1.3), yy, zz, 0.24, 4);
      if (i % 5 === 1) for (let k = 0; k < 3; k++) S(kit.frond(rng.range(0.42, 0.62), 6, 0.18), { pos: [STAIR.x[1] - cheek - 0.1, yy, zz], rot: [rng.range(-0.3, 0.05), -1.57 + rng.range(-1, 1), 0] }, rng.pick([P.fern, P.leafMid]));
    }
    for (const [x, z] of [[10.0, -3.15], [11.1, -3.1], [10.6, -3.25], [11.5, -3.45], [9.35, -3.5]]) tuft(S, x, 0.06, z, 0.4, 7);
  }

  // ====================================================================================================================
  //  WIRES — the cables never move (birds sit on them). Only what hangs off them does.
  // ====================================================================================================================
  function buildWires() {
    const CABLE = '#2b3a42', porcelain = '#e9e6d6', flowers = [P.bougain, P.bougainLit, P.flowerWhite, P.flowerYellow, P.bougainLit];
    WIRES.forEach((w, wi) => {
      const pts = Array.from({ length: 61 }, (_, i) => wirePoint(w, i / 60));
      hard.add(kit.tube(pts, 0.024, 0.024, 5, 72), 'flat', { color: CABLE });
      // Wall anchors. They stand just proud of the masonry on the east and south walls.
      const onEast = w.b[0] > 1.4 && w.b[0] < 1.7, onSouth = Math.abs(w.b[2] - 0.55) < 0.1;
      if (onEast || onSouth) {
        const [x, y, z] = w.b, n = onEast ? [1, 0, 0] : [0, 0, 1], wall = [x - n[0] * 0.14, y, z - n[2] * 0.14];
        hard.add(rod(wall, [x + n[0] * 0.05, y + 0.02, z + n[2] * 0.05], 0.02, 5), 'rust');
        hard.add(lump(0.06, 0.075, 0.06, 8), 'flat', { pos: [x + n[0] * 0.02, y, z + n[2] * 0.02], color: porcelain });
        hard.add(kit.cyl(0.074, 0.074, 0.018, 8), 'flat', { pos: [x + n[0] * 0.02, y + 0.05, z + n[2] * 0.02], color: porcelain });
      }
      if (w.trellis) trellis(w, wi, flowers);
    });
    // The snapped cable: a frayed tail curling onto the soil hump, and the root of the vine that climbs it.
    const w4 = WIRES.find((w) => w.b[1] < 1), [ex, ey, ez] = w4.b;
    hard.add(kit.tube([[ex, ey, ez], [ex + 0.12, ey - 0.14, ez + 0.04], [ex + 0.2, ey - 0.24, ez - 0.06], [ex + 0.08, ey - 0.3, ez - 0.16], [ex - 0.04, ey - 0.27, ez - 0.1]], 0.023, 0.02, 5, 16), 'flat', { color: CABLE });
    for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.4; hard.add(kit.tube([[ex - 0.04, ey - 0.27, ez - 0.1], [ex - 0.08 + Math.cos(a) * 0.05, ey - 0.25, ez - 0.1 + Math.sin(a) * 0.05], [ex - 0.12 + Math.cos(a) * 0.1, ey - 0.2 + i * 0.012, ez - 0.1 + Math.sin(a) * 0.1]], 0.008, 0.005, 3, 6), 'rust'); }
    shrub(new V3(ex + 0.06, 0.34, ez - 0.05), 0.42, 0.3, 54);
    shrub(new V3(ex - 0.42, 0.2, ez + 0.22), 0.26, 0.18, 26, { body: P.leafMid });
    shrubLeaves(new V3(ex - 0.04, 0.16, ez + 0.02));
    for (let i = 0; i < 7; i++) { const a = rng() * 6.283; bloom(S, new V3(ex + Math.cos(a) * 0.4, 0.56 + rng() * 0.2, ez + Math.sin(a) * 0.3), rng.pick(flowers), 0.08); }
  }
  function trellis(w, wi, flowers) {
    const climbing = w.b[1] < 1, pAt = (u) => new V3(...wirePoint(w, clamp(u))), L = pAt(0).distanceTo(pAt(1)) + w.sag * 0.9;
    const frame = (u) => {
      const T = pAt(u + 0.01).sub(pAt(u - 0.01)).normalize(), N = new V3().crossVectors(T, new V3(0, 1, 0));
      if (N.lengthSq() < 1e-4) N.set(1, 0, 0); N.normalize(); return { T, N, B: new V3().crossVectors(T, N) };
    };
    const u0 = climbing ? 0.1 : 0.03, u1 = climbing ? 0.985 : 0.97, steps = Math.round(L / 0.11);
    const density = (u) => 0.5 + 0.5 * Math.sin(u * (climbing ? 11 : 15) + wi * 1.3);
    for (let k = 0; k < 3; k++) {
      const pts = [];
      for (let i = 0; i <= steps; i++) {
        const u = lerp(u0, u1, i / steps), f = frame(u), a = u * L * (3.4 + k * 0.7) + k * 2.09, r = 0.04 + 0.016 * Math.sin(u * 31 + k);
        pts.push(pAt(u).addScaledVector(f.N, Math.cos(a) * r).addScaledVector(f.B, Math.sin(a) * r));
      }
      const r0 = climbing ? (k === 0 ? 0.012 : 0.01) : 0.018, r1 = climbing ? (k === 0 ? 0.034 : 0.022) : 0.012;
      S(kit.tube(pts, r0, r1, 4, steps, { capEnds: false }), {}, k ? P.ivy : P.leafDeep);
    }
    const nLeaf = Math.round(L / 0.028);
    for (let i = 0; i < nLeaf; i++) {
      const u = rng.range(u0, u1), d = density(u);
      if (rng() > 0.2 + 0.8 * d * d) continue;
      const f = frame(u), a = rng() * 6.283, out = f.N.clone().multiplyScalar(Math.cos(a)).addScaledVector(f.B, Math.sin(a));
      const p = pAt(u).addScaledVector(out, rng.range(0.03, 0.1));
      put(S, p, out.clone().add(new V3(rng.range(-0.4, 0.4), -0.55, rng.range(-0.4, 0.4))), new V3(out.x * 0.5, 1, out.z * 0.5).normalize(), rng.range(0.14, 0.24), rng.pick(greens));
      if (rng() < 0.05) bloom(S, p.clone().addScaledVector(out, 0.05), rng.pick(flowers), 0.07, false);
    }
    const nHang = Math.round(L * 2.6);
    for (let i = 0; i < nHang; i++) {
      const u = rng.range(u0 + 0.02, u1 - 0.01), d = density(u), top = pAt(u);
      if (rng() > 0.25 + 0.75 * d) continue;
      let len = rng.range(0.25, 0.7) + d * rng.range(0, 0.85);
      if (top.z < -7.7) len = Math.min(len, 0.75);        // stay clear of the bridge stub under it
      len = Math.min(len, Math.max(0.12, top.y - 0.35));
      vine(top.toArray(), len, { amp: 0.035 + len * 0.05, drift: 0.05, tip: rng() < 0.55 ? rng.pick(flowers) : null, leafEvery: 0.095, size: [0.13, 0.2] });
    }
  }
}
