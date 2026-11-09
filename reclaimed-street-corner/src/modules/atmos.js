// atmos.js — light and air: Tyndall beams, dust, dandelion fluff, butterflies, dragonflies, swallows on the wires,
// water drips, falling leaves, faint mist and the fall's haze, over the whole 80×80 plinth. Nothing here casts shadows; the whole
// group lives on the no-outline layer.
//
// Everything is a closed-form function of t (seeded itineraries, no integration), so a frozen ?t= renders the true
// pose for that moment and any moment can be sought directly. Only ripple triggers compare against the previous frame.
const TAU = Math.PI * 2;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const u = clamp01((x - a) / (b - a)); return u * u * (3 - 2 * u); };
const lerp = (a, b, u) => a + (b - a) * u;
const hash = (n, s = 0) => { const x = Math.sin(n * 127.1 + s * 311.7 + 1.3) * 43758.5453; return x - Math.floor(x); };
const angLerp = (a, b, u) => { const d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI; return a + d * u; };

// Wider beams slanting through canopy gaps onto the street, along SUN_DIR: foot [x,y,z], radius at foot / at top.
const STREET_BEAMS = [
  { foot: [-1.1, 0.0, 4.9], r0: 1.6, r1: 1.3 },   // grazes the front canopy lobes, lands on the bend of the road
  { foot: [5.7, 0.0, -2.2], r0: 1.35, r1: 1.1 },  // down the x-arm, past the east facade
  { foot: [3.1, 0.0, 6.4], r0: 1.0, r1: 0.85 },   // narrow one by the crossing
];
// Beams stop inside the crown's reach: taller ones would poke past the canopy into open sky, where no beam can exist.
const BEAM_TOP_Y = 11.5, STREET_BEAM_TOP_Y = 6.5;
// Beams through the ring's canopies. Each starts from a point well inside a lobe, so its top is in leaves by construction, and drops
// along the sun to `footY`. src: [GROVE index or -1 for the banyan, lobe index]; at: offset in lobe radii (keep its length under ~.85).
const CANOPY_BEAMS = [
  { src: [0, 1], at: [0.36, 0, -0.35], footY: 0.05, r0: 1.0, r1: 0.72 },    // camphor, onto the playground grass
  { src: [0, 0], at: [0.63, 0.09, -0.37], footY: 0.05, r0: 0.72, r1: 0.55 }, // camphor, a narrower one beside it
  { src: [3, 1], at: [0.1, 0.47, 0.21], footY: 0.05, r0: 0.95, r1: 0.7 },    // back-lot ginkgo, onto the plots
  { src: [2, 0], at: [0.51, -0.16, -0.3], footY: 0.28, r0: 0.95, r1: 0.72 }, // station ginkgo, across the first car's roof
  { src: [4, 0], at: [0.38, 0.13, -0.31], footY: 0.1, r0: 0.72, r1: 0.5 },   // willow, a little gold onto the sunflowers
  { src: [-1, 13], at: [0.7, -0.25, -0.45], footY: 0.05, r0: 1.05, r1: 0.8 }, // banyan's back reach, into the yards past the chimney side
];
let ringBoxes = null;
const ringSolids = (layout) => (ringBoxes ??= layout.BUILDINGS.map((b) => { const r = layout.buildingBox(b); return [r.x, r.z, b.elev + b.h]; }));
/** Would the sun reach (x,y,z)? Analytic against every canopy ellipsoid and the big solids, so the ring's motes keep to the open light. */
function sunlit(layout, x, y, z) {
  const [sx, sy, sz] = layout.SUN_DIR, { BUILDING, TOWN, RAIL } = layout, carX = [RAIL.tracks[0] - 1.1, RAIL.tracks[0] + 1.1];
  // Each solid as a box from the ground to `h`: does the ray's run up to height h cross its footprint?
  const boxes = [[BUILDING.x, BUILDING.z, BUILDING.levelY[4]], [TOWN.row.x, TOWN.row.z, TOWN.row.maxH], [TOWN.bathhouse.x, TOWN.bathhouse.z, TOWN.bathhouse.maxH], ...RAIL.train.cars.map((c) => [carX, c.z, RAIL.maxHeight]), ...ringSolids(layout)];
  for (const [bx, bz, h] of boxes) {
    if (y >= h) continue;
    const reach = (h - y) / sy;
    let t0 = 0, t1 = reach;
    for (const [o, d, r] of [[x, sx, bx], [z, sz, bz]]) {
      const a = (r[0] - o) / d, b = (r[1] - o) / d;
      t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b));
    }
    if (t0 <= t1) return false;
  }
  for (const [lx, ly, lz, rxz, ry] of layout.CANOPIES) {
    const px = (x - lx) / rxz, py = (y - ly) / ry, pz = (z - lz) / rxz, dx = sx / rxz, dy = sy / ry, dz = sz / rxz;
    const a = dx * dx + dy * dy + dz * dz, b = px * dx + py * dy + pz * dz, c = px * px + py * py + pz * pz - 1;
    if (c < 0 || (b < 0 && b * b >= a * c)) return false;
  }
  return true;
}
// Open air of the ring: [x0,x1, z0,z1, y0,y1, dust, fluff].
const AIR_ZONES = [
  [3.0, 12.0, 9.0, 19.5, 0.4, 3.2, 70, 6],      // meadow and greenhouse
  [-5.5, 2.4, 16.6, 19.6, 0.5, 3.0, 36, 3],     // sunflowers
  [-11.5, 0.0, 12.8, 18.0, 0.1, 2.4, 44, 4],    // along the canal
  [12.2, 19.5, 11.5, 19.5, 0.5, 3.6, 44, 3],    // the open end of the line
  [12.2, 19.5, -8.0, 11.0, 3.6, 5.2, 34, 3],    // over the train roofs
  [-19.5, -12.8, 8.4, 19.5, 0.4, 3.0, 36, 3],   // playground
  [-19.5, -11.0, 1.0, 8.0, 0.4, 3.2, 26, 3],    // road west
  [-11.5, 2.8, -19.6, -11.6, 0.4, 3.6, 40, 2],  // back lot
];

/** The new ring's open air, from the layout: down the two long streets and the south road, over the paddies and fields, and a little pollen under each cherry. Same row shape as AIR_ZONES. */
function ringAirZones(layout) {
  const { RING_ROADS, RING_ZONES, WOODS } = layout, road = (id) => RING_ROADS.find((r) => r.id === id);
  const lane = (id, dust, fluff) => { const r = road(id), xs = r.pts.map((p) => p[0]), zs = r.pts.map((p) => p[1]), m = r.w / 2 + 0.4; return [Math.min(...xs) - m, Math.max(...xs) + m, Math.min(...zs) - m, Math.max(...zs) + m, 0.4, 3.6, dust, fluff]; };
  const field = ({ x, z }, y1, dust, fluff) => [x[0], x[1], z[0], z[1], 0.6, y1, dust, fluff];
  return [
    lane('shotengai', 40, 3), lane('north', 40, 3), lane('ringS', 46, 3),
    field(RING_ZONES.paddies, 2.8, 30, 3), field(RING_ZONES.kitchenFields, 2.6, 16, 1), field(RING_ZONES.orchard, 2.8, 14, 1), field(RING_ZONES.schoolYard, 2.6, 14, 2),
    ...WOODS.filter((t) => t.kind === 'cherry').map((t) => { const [lx, ly, lz, r, ry] = t.lobes[0]; return [lx - r - 0.8, lx + r + 0.8, lz - r - 0.8, lz + r + 0.8, 0.6, ly - ry * 0.4, 14, 1]; }),
  ];
}

export function build(ctx) {
  const group = new ctx.THREE.Group();
  group.name = 'atmos';
  const updaters = [], settle = [];   // settle: jobs that need the finished scene, run once at the first update
  const beams = buildBeams(ctx, group, updaters);
  buildDust(ctx, group, updaters, beams);
  buildFluff(ctx, group, updaters, beams);
  buildButterflies(ctx, group, updaters, settle);
  buildDragonflies(ctx, group, updaters);
  buildBirds(ctx, group, updaters);
  buildDrips(ctx, group, updaters, settle);
  buildLeaves(ctx, group, updaters, settle);
  buildMist(ctx, group);
  buildSprayHaze(ctx, group);
  ctx.noOutline(group);
  // Opaque fliers must still block the scenery's ink lines, or a line drawn behind them shows through the body.
  for (const n of ['birdBodies', 'birdHeads', 'birdWings', 'butterflyWings', 'butterflyBodies', 'dragonflyBodies', 'leaves', 'ginkgoLeaves']) ctx.softEdge(group.getObjectByName(n));
  return {
    group,
    update(t) {
      if (settle.length) settleOnScene(ctx, group, settle.splice(0));
      for (const u of updaters) u(t);
    },
  };
}

/* ---------------------------------------------------------------- scene survey ---------------------------------------- */

/**
 * Vertical rays against the finished scene. A Raycaster costs ~25 ms per ray here and butterflies alone want hundreds, so
 * every column is answered in one pass over the triangles. Returns, per [x,z], the sorted y of each opaque surface over it.
 *
 * Only what stands still counts, or the answer would depend on the t of the first frame and on which module updated first:
 * no instanced foliage, no pivoted sway group (they alone sit off the origin), no rewritten vertices. And no layer 1: water,
 * glass and light are nothing a drop can hang from or a butterfly can stand on.
 */
function surveyColumns(ctx, skip, cols) {
  const { THREE, scene } = ctx;
  const CELL = 0.8, ORIGIN = ctx.layout.BASE.half + 1, N = Math.ceil((ORIGIN * 2) / CELL), grid = new Array(N * N);
  const cell = (v) => Math.max(0, Math.min(N - 1, Math.floor((v + ORIGIN) / CELL)));
  cols.forEach(([x, z], i) => { (grid[cell(x) + cell(z) * N] ||= []).push(i); });
  const hits = cols.map(() => []);
  const tri = (ax, ay, az, bx, by, bz, cx, cy, cz) => {
    const x0 = cell(Math.min(ax, bx, cx)), x1 = cell(Math.max(ax, bx, cx)), z0 = cell(Math.min(az, bz, cz)), z1 = cell(Math.max(az, bz, cz));
    for (let gz = z0; gz <= z1; gz++) for (let gx = x0; gx <= x1; gx++) {
      const list = grid[gx + gz * N];
      if (!list) continue;
      const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(det) < 1e-9) return;   // edge-on to a vertical ray
      for (const i of list) {
        const [x, z] = cols[i], u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det, v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det;
        if (u >= 0 && v >= 0 && u + v <= 1) hits[i].push(u * ay + v * by + (1 - u - v) * cy);
      }
    }
  };
  const scan = (o) => {
    const g = o.geometry, p = g.attributes.position, ix = g.index, nv = p.count, nt = ix ? ix.count : nv, e = o.matrixWorld.elements;
    const w = new Float32Array(nv * 3);
    for (let i = 0; i < nv; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      w[i * 3] = e[0] * x + e[4] * y + e[8] * z + e[12]; w[i * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; w[i * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    }
    for (let i = 0; i + 2 < nt; i += 3) {
      const a = 3 * (ix ? ix.getX(i) : i), b = 3 * (ix ? ix.getX(i + 1) : i + 1), c = 3 * (ix ? ix.getX(i + 2) : i + 2);
      tri(w[a], w[a + 1], w[a + 2], w[b], w[b + 1], w[b + 2], w[c], w[c + 1], w[c + 2]);
    }
  };
  const standsStill = (o) => !o.isInstancedMesh && o.geometry.attributes.position.usage !== THREE.DynamicDrawUsage;
  const opaque = (o) => !o.layers.isEnabled(1) && !(Array.isArray(o.material) ? o.material[0] : o.material).transparent;
  scene.updateMatrixWorld(true);
  const walk = (o) => {
    if (o === skip || !o.visible || (o !== scene && o.position.lengthSq() > 0)) return;
    if (o.isMesh && standsStill(o) && opaque(o)) scan(o);
    o.children.forEach(walk);
  };
  walk(scene);
  for (const h of hits) h.sort((a, b) => a - b);
  return hits;
}

function settleOnScene(ctx, group, jobs) {
  const hits = surveyColumns(ctx, group, jobs.flatMap((j) => j.cols));
  let at = 0;
  for (const j of jobs) j.done(hits.slice(at, at += j.cols.length));
}

/* ---------------------------------------------------------------- shared bits ---------------------------------------- */

function dynamicInstanced(ctx, geo, mat, count, name) {
  const { THREE } = ctx;
  const m = new THREE.InstancedMesh(geo, mat, count);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; m.name = name;
  return m;
}

function pointScale(ctx) {
  const { THREE, renderer, camera } = ctx;
  const v = new THREE.Vector2();
  const uPx = { value: 800 }, uDpr = { value: 1 };
  const sync = () => {
    renderer.getDrawingBufferSize(v);
    uPx.value = v.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    uDpr.value = renderer.getPixelRatio();
  };
  sync();
  return { uPx, uDpr, sync };
}

/** Colour every triangle by its centroid so that patches stay crisp, cel-style. */
function paintTris(ctx, g, fn) {
  const { THREE } = ctx;
  const geo = g.index ? g.toNonIndexed() : g;
  const p = geo.attributes.position, c = new Float32Array(p.count * 3), col = new THREE.Color();
  for (let i = 0; i < p.count; i += 3) {
    const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    col.set(fn(x, y, z));
    for (let k = 0; k < 3; k++) { c[(i + k) * 3] = col.r; c[(i + k) * 3 + 1] = col.g; c[(i + k) * 3 + 2] = col.b; }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}

const ellipsoid = (ctx, rx, ry, rz, pos, ws = 8, hs = 6) => ctx.kit.sphere(1, ws, hs).scale(rx, ry, rz).translate(...pos);

/* ---------------------------------------------------------------- 1. Tyndall beams ------------------------------------ */

function buildBeams(ctx, group, updaters) {
  const { THREE, layout, P, shared } = ctx;
  const V = THREE.Vector3;
  const SUN = new V(...layout.SUN_DIR);
  const { BUILDING } = layout, { levelY } = BUILDING;

  // layout.SHAFTS[i].top is only a nominal 8 units up the sun that knows nothing of slabs or leaves, so real tops are derived here:
  // a shaft runs up along the sun until a slab really stops it, otherwise to the canopy gap banyan keeps open above each one.
  const clearLength = (b, margin) => {
    for (let i = 1; i < levelY.length; i++) {
      if (levelY[i] <= b.y + 0.2) continue;
      const t = (levelY[i] - 0.26 - b.y) / SUN.y;
      if (layout.onSlab(i, b.x + SUN.x * t, b.z + SUN.z * t, margin)) return t;
    }
    return (BEAM_TOP_Y - b.y) / SUN.y;
  };
  const beams = [];
  for (const s of layout.SHAFTS) {
    const bottom = new V(...s.bottom), len = clearLength(bottom, 0.55);
    beams.push({ bottom, len, r0: s.r0, r1: s.r1, street: false, capped: len < (BEAM_TOP_Y - bottom.y) / SUN.y - 0.01 });
  }
  for (const s of STREET_BEAMS) {
    const bottom = new V(...s.foot);
    beams.push({ bottom, len: (STREET_BEAM_TOP_Y - bottom.y) / SUN.y, r0: s.r0, r1: s.r1, street: true, capped: false });
  }
  for (const s of CANOPY_BEAMS) {
    const [tree, lobe] = s.src, [lx, ly, lz, rxz, ry] = tree < 0 ? layout.TREE.lobes[lobe] : layout.GROVE[tree].lobes[lobe];
    const top = new V(lx + s.at[0] * rxz, ly + s.at[1] * ry, lz + s.at[2] * rxz), len = (top.y - s.footY) / SUN.y;
    beams.push({ bottom: top.clone().addScaledVector(SUN, -len), len, r0: s.r0, r1: s.r1, street: true, canopy: true, capped: false });
  }

  // Nested frusta, all merged in one mesh: additive light doesn't care about draw order.
  const SEG = 28, ROWS = 3;
  const pos = [], nor = [], uv = [], info = [], room = [], idx = [];
  const add = (b, id, k, soft, gain) => {
    const u = new V(0, 1, 0).cross(SUN).normalize(), w = new V().crossVectors(SUN, u).normalize();
    const base = pos.length / 3;
    for (let i = 0; i <= ROWS; i++) {
      const f = i / ROWS, c = b.bottom.clone().addScaledVector(SUN, b.len * f), r = lerp(b.r0, b.r1, f) * k;
      for (let j = 0; j <= SEG; j++) {
        const a = (j / SEG) * TAU, n = u.clone().multiplyScalar(Math.cos(a)).addScaledVector(w, Math.sin(a));
        const q = c.clone().addScaledVector(n, r);
        pos.push(q.x, q.y, q.z); nor.push(n.x, n.y, n.z); uv.push(j / SEG, f); info.push(id, b.len, soft, gain); room.push(b.street ? 0 : 1);
      }
    }
    for (let i = 0; i < ROWS; i++) for (let j = 0; j < SEG; j++) {
      const a = base + i * (SEG + 1) + j, c = a + SEG + 1;
      idx.push(a, a + 1, c, a + 1, c + 1, c);
    }
  };
  beams.forEach((b, id) => {
    if (b.canopy) { add(b, id, 1, 0.14, 0.035); add(b, id, 0.58, 0.14, 0.07); }
    else if (b.street) { add(b, id, 1, 0.16, 0.03); add(b, id, 0.6, 0.14, 0.03); }
    else { add(b, id, 1, 0.07, 0.02); add(b, id, 0.56, 0.05, 0.12); add(b, id, 0.27, 0.07, 0.34); }   // faint sheath round a hard core
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aInfo', new THREE.Float32BufferAttribute(info, 4));
  g.setAttribute('aRoom', new THREE.Float32BufferAttribute(room, 1));
  g.setIndex(idx);

  const sway = new Float32Array(beams.length).fill(1);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
    uniforms: {
      uTime: shared.uTime, uNoise: shared.uNoise, uSway: { value: sway }, uAxis: { value: SUN.clone() },
      cGold: { value: new THREE.Color(P.sunGold) }, cPale: { value: new THREE.Color(P.sunPale) },
      uBox: { value: new THREE.Vector4(BUILDING.x[0], BUILDING.z[0], BUILDING.x[1], BUILDING.z[1]) }, uRoof: { value: levelY[levelY.length - 1] },
    },
    vertexShader: /* glsl */`
      attribute vec4 aInfo; attribute float aRoom; uniform float uSway[${beams.length}];
      varying vec3 vN,vV,vI,vW; varying vec2 vUv; varying float vRoom;
      void main(){
        vUv=uv; vN=normal; vI=vec3(aInfo.y,aInfo.z,aInfo.w*uSway[int(aInfo.x+.5)]); vRoom=aRoom;
        vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; vV=cameraPosition-w.xyz; gl_Position=projectionMatrix*viewMatrix*w;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime,uRoof; uniform vec3 uAxis,cGold,cPale; uniform vec4 uBox; uniform sampler2D uNoise;
      varying vec3 vN,vV,vI,vW; varying vec2 vUv; varying float vRoom;
      void main(){
        vec3 V=normalize(vV-uAxis*dot(vV,uAxis));          // view seen across the axis: the shell's silhouette is exact
        float c=clamp(dot(normalize(vN),V),0.,1.);
        float d=sqrt(1.-c*c);                              // 0 on the axis, 1 on the silhouette
        float edge=smoothstep(1.,1.-vI.y,d);
        float L=vI.x, s=vUv.y*L, far=min(L*.34,4.2);
        float ends=smoothstep(0.,.8,s)*(1.-smoothstep(L-far,L,s));
        float a=texture2D(uNoise,vec2(vUv.x,s*.018-uTime*.0045)).r;
        float b=texture2D(uNoise,vec2(vUv.x+.37,s*.05-uTime*.019)).g;
        float streak=.85+.4*smoothstep(.4,.6,a)+.25*smoothstep(.45,.65,b);
        float open=(1.+.55*(1.-smoothstep(1.5,5.,s)))*(1.-.92*smoothstep(4.5,8.5,s)); // richest in the rooms, calm outside: no veil
        vec3 col=mix(cGold,cPale,.25+.75*smoothstep(.15,.8,vUv.y));
        float lens=smoothstep(4.,12.,length(vV));          // near the lens a beam is only a veil over everything behind it
        float side=smoothstep(.35,.88,length(cross(normalize(vV),uAxis))); // a beam reads side-on; end-on it would only be haze
        vec2 o=max(uBox.xy-vW.xz,vW.xz-uBox.zw);           // a room's shaft spends itself indoors: past the walls it must not fog the facades
        float past=max(smoothstep(-.15,.55,max(o.x,o.y)),smoothstep(.1,.6,vW.y-uRoof));
        float outdoors=1.-.8*past*vRoom;
        gl_FragColor=vec4(col,edge*ends*streak*open*lens*side*outdoors*vI.z);
      }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'beams'; mesh.renderOrder = 20; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
  group.add(mesh);
  group.add(buildFootGlow(ctx, beams, sway));
  updaters.push((t) => {
    for (let i = 0; i < beams.length; i++) {
      const b = beams[i], w = ctx.wind(t, b.bottom.x, b.bottom.z), slow = Math.sin(t * 0.37 + i * 2.1);
      sway[i] = 0.84 + 0.17 * w + 0.07 * slow;
    }
  });
  return beams;
}

/** Soft pool of light where each room shaft lands: the beam's slanted footprint on the floor or on the indoor water. */
function buildFootGlow(ctx, beams, sway) {
  const { THREE, layout, P, shared } = ctx;
  const SUN = layout.SUN_DIR, h = Math.hypot(SUN[0], SUN[2]), ax = [SUN[0] / h, SUN[2] / h], stretch = 1 / SUN[1];
  const pos = [], uv = [], aI = [], aG = [], idx = [];
  beams.forEach((b, id) => {
    if (b.street) return;
    const wet = b.bottom.y < 1;   // indoor water already carries its own sparkle: half the pool or it reads as a white patch
    const y = (wet ? layout.WATER.indoorY : b.bottom.y) + 0.035, r = b.r0 * 1.12, base = pos.length / 3;
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const along = u * r * stretch, across = v * r;
      pos.push(b.bottom.x + ax[0] * along - ax[1] * across, y, b.bottom.z + ax[1] * along + ax[0] * across);
      uv.push(u, v); aI.push(id); aG.push(wet ? 0.5 : 1);
    }
    idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aI', new THREE.Float32BufferAttribute(aI, 1));
  g.setAttribute('aG', new THREE.Float32BufferAttribute(aG, 1));
  g.setIndex(idx); g.computeVertexNormals();
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: shared.uTime, uNoise: shared.uNoise, uSway: { value: sway }, cGlow: { value: new THREE.Color(P.sunGold) } },
    vertexShader: /* glsl */`
      attribute float aI,aG; uniform float uSway[${beams.length}]; varying vec2 vUv; varying vec3 vW; varying float vS;
      void main(){ vUv=uv; vS=aG*uSway[int(aI+.5)]; vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform sampler2D uNoise; uniform vec3 cGlow; varying vec2 vUv; varying vec3 vW; varying float vS;
      void main(){
        float d=length(vUv);
        float n=texture2D(uNoise,vW.xz*.09+vec2(uTime*.012,-uTime*.009)).g;
        float a=smoothstep(1.,.78,d)*.2+smoothstep(.8,.2,d)*.14;
        gl_FragColor=vec4(cGlow,a*(.72+.6*n)*vS);
      }`,
  });
  const m = new THREE.Mesh(g, mat);
  m.name = 'footGlow'; m.renderOrder = 19; m.frustumCulled = false;
  return m;
}

/* ---------------------------------------------------------------- 2. dust + dandelion fluff ---------------------------- */

function buildDust(ctx, group, updaters, beams) {
  const { THREE, P, shared } = ctx;
  const rng = ctx.seeded('atmos-dust'), SUN = new THREE.Vector3(...ctx.layout.SUN_DIR);
  const u = new THREE.Vector3(0, 1, 0).cross(SUN).normalize(), w = new THREE.Vector3().crossVectors(SUN, u).normalize();
  const A = [], B = [], O = [], Q = [];
  const { layout } = ctx;
  const scatter = (b, n, reach) => {
    const a = b.bottom, t = b.bottom.clone().addScaledVector(SUN, Math.min(b.len, reach));
    for (let i = 0; i < n; i++) {
      const ang = rng() * TAU, r = Math.sqrt(rng()) * lerp(b.r0, b.r1, 0.3) * 0.82;
      A.push(a.x, a.y, a.z); B.push(t.x, t.y, t.z);
      const o = u.clone().multiplyScalar(Math.cos(ang) * r).addScaledVector(w, Math.sin(ang) * r);
      O.push(o.x, o.y, o.z);
      Q.push(rng(), rng.range(0.004, 0.016) * rng.sign(), rng(), rng() < 0.1 ? rng.range(0.055, 0.08) : rng.range(0.028, 0.05));
    }
  };
  for (const b of beams) {
    if (b.canopy) scatter(b, 70, 7);
    else if (b.street) scatter(b, 110, 7);
    else scatter(b, b.capped ? 130 : 220, 7.5);
  }
  // The ring's open air: slower, sparser, each mote wandering down a short stretch of the breeze. Shade gets none.
  for (const [x0, x1, z0, z1, y0, y1, n] of AIR_ZONES) {
    for (let i = 0, tries = 0; i < n && tries < n * 12; tries++) {
      const x = rng.range(x0, x1), y = rng.range(y0, y1), z = rng.range(z0, z1), dx = rng.range(-5, -2), dz = rng.range(1, 4), dy = rng.range(-0.1, 0.5);
      if (Math.abs(x + dx) > 19.6 || Math.abs(z + dz) > 19.6 || !sunlit(layout, x, y, z) || !sunlit(layout, x + dx, y + dy, z + dz)) continue;
      A.push(x, y, z); B.push(x + dx, y + dy, z + dz); O.push(0, 0, 0);
      Q.push(rng(), rng.range(0.006, 0.016) * rng.sign(), rng(), rng() < 0.1 ? rng.range(0.05, 0.07) : rng.range(0.026, 0.044));
      i++;
    }
  }
  // v3: the ring's streets and fields, after the v2 zones so their random stream stays as it was.
  const RING_LIMIT = layout.BASE.half - 0.4;
  for (const [x0, x1, z0, z1, y0, y1, n] of ringAirZones(layout)) {
    for (let i = 0, tries = 0; i < n && tries < n * 12; tries++) {
      const x = rng.range(x0, x1), y = rng.range(y0, y1), z = rng.range(z0, z1), dx = rng.range(-5, -2), dz = rng.range(1, 4), dy = rng.range(-0.1, 0.5);
      if (Math.abs(x) > RING_LIMIT || Math.abs(z) > RING_LIMIT || Math.abs(x + dx) > RING_LIMIT || Math.abs(z + dz) > RING_LIMIT || !sunlit(layout, x, y, z) || !sunlit(layout, x + dx, y + dy, z + dz)) continue;
      A.push(x, y, z); B.push(x + dx, y + dy, z + dz); O.push(0, 0, 0);
      Q.push(rng(), rng.range(0.006, 0.016) * rng.sign(), rng(), rng() < 0.1 ? rng.range(0.05, 0.07) : rng.range(0.026, 0.044));
      i++;
    }
  }
  const g = new THREE.BufferGeometry();
  const count = A.length / 3;
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute('aA', new THREE.Float32BufferAttribute(A, 3));
  g.setAttribute('aB', new THREE.Float32BufferAttribute(B, 3));
  g.setAttribute('aO', new THREE.Float32BufferAttribute(O, 3));
  g.setAttribute('aQ', new THREE.Float32BufferAttribute(Q, 4));
  const scale = pointScale(ctx);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
    uniforms: { uTime: shared.uTime, uPx: scale.uPx, uDpr: scale.uDpr, cDust: { value: new THREE.Color(P.sunPale) } },
    vertexShader: /* glsl */`
      attribute vec3 aA,aB,aO; attribute vec4 aQ; uniform float uTime,uPx,uDpr; varying float vB;
      void main(){
        float s=fract(aQ.x+uTime*aQ.y), ph=aQ.z*6.2831853;
        vec3 p=mix(aA,aB,s)+aO*(.92+.12*sin(uTime*.2+ph));
        p+=vec3(sin(uTime*.31+ph),.7*sin(uTime*.23+ph*2.),cos(uTime*.27+ph*3.))*.14;
        float tw=.5+.5*sin(uTime*(.9+aQ.z*2.3)+ph*7.); tw*=tw;
        vB=(.35+tw*1.25)*smoothstep(0.,.07,s)*(1.-smoothstep(.9,1.,s));
        vec4 mv=viewMatrix*vec4(p,1.);
        gl_Position=projectionMatrix*mv;
        // A mote is a fraction of a pixel long before the hero distance, but a point can't draw smaller than the floor. So under the floor it
        // dims by the area it no longer covers (ratio of natural size to floor, squared): from far off a swarm melts into its beam. Close up px>floor and nothing changes.
        float px=aQ.w*(.75+.45*tw)*uPx/-mv.z, floorPx=1.6*uDpr;
        float cover=clamp(px/floorPx,0.,1.);
        vB*=cover*cover;
        gl_PointSize=clamp(px,floorPx,5.*uDpr);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 cDust; varying float vB;
      void main(){ float d=length(gl_PointCoord-.5)*2.; float a=smoothstep(1.,.28,d); if(a<=.003) discard; gl_FragColor=vec4(cDust*1.05,a*vB*.55); }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.name = 'dust'; pts.frustumCulled = false; pts.renderOrder = 21;
  group.add(pts);
  updaters.push(scale.sync);
}

function buildFluff(ctx, group, updaters, beams) {
  const { THREE, layout, shared } = ctx;
  const rng = ctx.seeded('atmos-fluff'), SUN = new THREE.Vector3(...layout.SUN_DIR);
  const tex = ctx.canvasTexture(128, 128, (g, w) => {
    // A dandelion achene: spray of hair-fine rays around a pale seed, short stalk below.
    const c = w / 2;
    g.lineCap = 'round';
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * TAU + (i % 2) * 0.05, r = 42 + (i % 3) * 7;
      const grad = g.createLinearGradient(c, c, c + Math.cos(a) * r, c + Math.sin(a) * r);
      grad.addColorStop(0, 'rgba(255,255,255,.95)'); grad.addColorStop(1, 'rgba(255,255,255,.55)');
      g.strokeStyle = grad; g.lineWidth = 2.3;
      g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.9)';
      g.beginPath(); g.arc(c + Math.cos(a) * r, c + Math.sin(a) * r, 2.1, 0, TAU); g.fill();
    }
    const halo = g.createRadialGradient(c, c, 0, c, c, 44);
    halo.addColorStop(0, 'rgba(255,255,255,.75)'); halo.addColorStop(0.45, 'rgba(255,255,255,.22)'); halo.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = halo; g.fillRect(0, 0, w, w);
    g.fillStyle = '#d9b77a'; g.beginPath(); g.ellipse(c, c + 13, 3.2, 8, 0, 0, TAU); g.fill();
    g.fillStyle = '#fffbe9'; g.beginPath(); g.arc(c, c, 5, 0, TAU); g.fill();
  }, { repeat: false });

  const H = [], D = [], Q = [];
  const push = (x, y, z, dx, dy, dz, phase, rate, size) => { H.push(x, y, z); D.push(dx, dy, dz); Q.push(phase, rate, size, rng()); };
  // Indoors: loitering in each room's shaft.
  for (const b of beams) {
    if (b.street) continue;
    for (let i = 0; i < 5; i++) {
      const s = rng.range(0.45, 2.1), p = b.bottom.clone().addScaledVector(SUN, s / SUN.y);
      p.x += rng.range(-1, 1) * b.r0 * 0.9; p.z += rng.range(-1, 1) * b.r0 * 0.9;
      push(p.x, p.y, p.z, rng.range(-0.9, 0.9), rng.range(-0.25, 0.35), rng.range(-0.9, 0.9), rng(), rng.range(0.012, 0.022), rng.range(0.17, 0.25));
    }
  }
  // Outdoors: drifting down the street on the breeze.
  for (let i = 0; i < 22; i++) {
    const arm = rng() < 0.62, x = arm ? rng.range(-11, 8) : rng.range(2.5, 11), z = arm ? rng.range(1, 11) : rng.range(-10, 2);
    push(x, rng.range(0.7, 5.5), z, rng.range(-4.5, -1.5), rng.range(-0.3, 1.2), rng.range(1, 3.5), rng(), rng.range(0.016, 0.03), rng.range(0.19, 0.28));
  }
  // And across the ring, only where the sun actually reaches, each seed kept over the plinth for its whole drift.
  for (const [x0, x1, z0, z1, y0, y1, , n] of AIR_ZONES) {
    for (let i = 0, tries = 0; i < n && tries < n * 20; tries++) {
      const x = rng.range(x0, x1), y = rng.range(y0, y1) + 0.5, z = rng.range(z0, z1), dx = rng.range(-3.6, -1.5), dy = rng.range(-0.2, 0.9), dz = rng.range(1, 3);
      if (Math.abs(x) + Math.abs(dx) > 19.4 || Math.abs(z) + Math.abs(dz) > 19.4 || !sunlit(layout, x, y, z)) continue;
      push(x, y, z, dx, dy, dz, rng(), rng.range(0.014, 0.026), rng.range(0.19, 0.28));
      i++;
    }
  }
  for (const [x0, x1, z0, z1, y0, y1, , n] of ringAirZones(layout)) {
    const LIM = layout.BASE.half - 0.6;
    for (let i = 0, tries = 0; i < n && tries < n * 20; tries++) {
      const x = rng.range(x0, x1), y = rng.range(y0, y1) + 0.5, z = rng.range(z0, z1), dx = rng.range(-3.6, -1.5), dy = rng.range(-0.2, 0.9), dz = rng.range(1, 3);
      if (Math.abs(x) + Math.abs(dx) > LIM || Math.abs(z) + Math.abs(dz) > LIM || !sunlit(layout, x, y, z)) continue;
      push(x, y, z, dx, dy, dz, rng(), rng.range(0.014, 0.026), rng.range(0.19, 0.28));
      i++;
    }
  }
  const g = new THREE.BufferGeometry(), count = H.length / 3;
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute('aH', new THREE.Float32BufferAttribute(H, 3));
  g.setAttribute('aD', new THREE.Float32BufferAttribute(D, 3));
  g.setAttribute('aQ', new THREE.Float32BufferAttribute(Q, 4));
  const scale = pointScale(ctx);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: true,
    uniforms: { uTime: shared.uTime, uPx: scale.uPx, uDpr: scale.uDpr, uMap: { value: tex } },
    vertexShader: /* glsl */`
      attribute vec3 aH,aD; attribute vec4 aQ; uniform float uTime,uPx,uDpr; varying float vA,vR;
      void main(){
        float u=fract(aQ.x+uTime*aQ.y), ph=aQ.w*6.2831853;
        vec3 p=aH+aD*(u-.5)*2.;
        p+=vec3(sin(uTime*.42+ph),.6*sin(uTime*.6+ph*2.),cos(uTime*.35+ph*3.))*.22;
        vA=smoothstep(0.,.1,u)*(1.-smoothstep(.88,1.,u));
        vR=.42*sin(uTime*.5+ph)+.18*sin(uTime*1.3+ph*2.);
        vec4 mv=viewMatrix*vec4(p,1.);
        gl_Position=projectionMatrix*mv;
        // Same idea as the dust, but a seed reads as a seed only while it has room to show its hairs: under about 7 css px it is just a white dot, so it fades out instead.
        float px=aQ.z*uPx/-mv.z;
        vA*=smoothstep(.16,.82,px/(7.*uDpr));
        gl_PointSize=clamp(px,3.2*uDpr,64.*uDpr);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap; varying float vA,vR;
      void main(){
        vec2 q=gl_PointCoord-.5; float c=cos(vR),s=sin(vR); q=mat2(c,-s,s,c)*q+.5;
        vec4 m=texture2D(uMap,q); float a=m.a*vA; if(a<.01) discard;
        gl_FragColor=vec4(m.rgb*1.04,a*.82);
      }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.name = 'fluff'; pts.frustumCulled = false; pts.renderOrder = 22;
  group.add(pts);
  updaters.push(scale.sync);
}

/* ---------------------------------------------------------------- 3. butterflies + dragonflies ------------------------- */

function buildButterflies(ctx, group, updaters, settle) {
  const { THREE, layout, P, kit } = ctx;
  const rng = ctx.seeded('atmos-butterfly');
  const { RIVER, GROVE, MEADOW, RAIL, TOWN, BUILDING, STREET } = layout;
  // The blooms, plus two stops on the canal banks: butterflies follow the water from the sunflowers to the bridge.
  const bank = (i, side) => {
    const c = RIVER.center, a = c[i - 1], b = c[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz), w = lerp(RIVER.width[0], RIVER.width[1], i / (c.length - 1)) / 2 + 0.75;
    return [c[i][0] - (dz / l) * w * side, 0.35, c[i][1] + (dx / l) * w * side];
  };
  const S = [...layout.FLOWER_SPOTS, bank(2, 1), bank(4, -1)];
  const indoors = (i) => layout.insideBuilding(S[i][0], S[i][2]);
  // Commutes keep to one side of a wall and don't run through the poles at the street corner, the trunks, the glasshouse or the train.
  const poles = [STREET.trafficLight, STREET.utilityPole, ...GROVE];
  const passesPole = (a, b) => poles.some(({ x, z }) => {
    const dx = b[0] - a[0], dz = b[2] - a[2], u = clamp01(((x - a[0]) * dx + (z - a[2]) * dz) / (dx * dx + dz * dz));
    return Math.hypot(a[0] + dx * u - x, a[2] + dz * u - z) < 1;
  });
  const carX = [RAIL.tracks[0] - 1.1, RAIL.tracks[0] + 1.1], cars = RAIL.train.cars.map((c) => [carX, c.z]);
  const WALLS = [[BUILDING.x, BUILDING.z], [MEADOW.greenhouse.x, MEADOW.greenhouse.z], [TOWN.row.x, TOWN.row.z], [TOWN.bathhouse.x, TOWN.bathhouse.z], ...cars];
  const passesWall = (a, b) => {
    for (let i = 0; i <= 24; i++) {
      const x = lerp(a[0], b[0], i / 24), z = lerp(a[2], b[2], i / 24);
      for (const [wx, wz] of WALLS) if (x > wx[0] - 0.4 && x < wx[1] + 0.4 && z > wz[0] - 0.4 && z < wz[1] + 0.4) return true;
    }
    return false;
  };
  const REACH = 9.5;   // a commute is a stroll between neighbours, not a trek across the model
  const near = (i) => S.map((s, k) => [Math.hypot(s[0] - S[i][0], s[2] - S[i][2]), k])
    .filter(([d, k]) => k !== i && d < REACH && indoors(k) === indoors(i) && !passesPole(S[i], S[k]) && (indoors(i) || !passesWall(S[i], S[k])))
    .sort((a, b) => a[0] - b[0]).map(([, k]) => k);
  const spot = (i, r = 0.25) => [S[i][0] + rng.range(-r, r), S[i][1] + 0.08, S[i][2] + rng.range(-r, r)];

  // Heading is keyed along each flight this many seconds apart: yaw between two fixed keys can't turn faster than 1.5π / gap (~9 rad/s),
  // however the wander doubles back. A heading read straight off the path spins through a half turn in one frame wherever the path nearly stops.
  const HEADING_GAP = 0.5;
  // Each butterfly commutes around a small cluster of neighbouring blooms.
  const COLORS = ['#ffe25a', P.flowerWhite, '#ff9c3f', '#6db3ff', '#ffe25a', '#ffffff', '#ffffff', '#ff9c3f', '#ffe25a', '#6db3ff', '#ffe25a', P.flowerWhite, '#6db3ff', '#ffe25a'];
  const HOMES = [0, 2, 3, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16];
  const flies = HOMES.map((home, n) => {
    const nb = near(home), ring = [home, nb[0] ?? home, nb[1] ?? home];
    const spread = nb.length ? 0.25 : 1.3;   // a lone patch: it wanders round the one clump instead
    const legs = []; let clock = 0, first = spot(home, spread), at = first;
    const count = 14;
    for (let k = 0; k < count; k++) {
      const to = k === count - 1 ? first : spot(ring[rng.int(0, 2)], spread);
      const d = Math.hypot(to[0] - at[0], to[2] - at[2]);
      const rest = rng.range(2, 6.5), fly = Math.max(3.4, d / rng.range(0.8, 1.2)) + rng.range(0.5, 2.5);
      const lift = 0.5 + d * 0.18 + rng.range(0, 0.5), side = rng.range(-1, 1) * (0.3 + d * 0.16);
      const dx = to[0] - at[0], dz = to[2] - at[2], l = Math.hypot(dx, dz) || 1;
      const ctrl = [(at[0] + to[0]) / 2 - (dz / l) * side, Math.max(at[1], to[1]) + lift, (at[2] + to[2]) / 2 + (dx / l) * side];
      legs.push({ t0: clock, rest, fly, a: at, b: to, c: ctrl, yawRest: rng() * TAU, s: rng() * 100, hover: true, keys: Math.round(fly / HEADING_GAP) });
      clock += rest + fly; at = to;
    }
    return { legs, period: clock, phase: rng() * clock, color: COLORS[n], seed: rng() * 100, s: n === 5 || n === 11 ? 0.66 : 0.76 };
  });

  // Rests land on what is really there: the highest surface among a few columns round each spot. No surface near (a ring bloom is
  // instanced, swaying foliage, which the survey leaves out): it loiters on the wing instead, see pose().
  const REACH_DOWN = 0.35, REACH_UP = 0.2, PROBE = [[0, 0], [0.13, 0], [-0.13, 0], [0, 0.13], [0, -0.13], [0.09, 0.09], [-0.09, -0.09]];
  const legsAll = flies.flatMap((f) => f.legs);
  settle.push({
    cols: legsAll.flatMap((l) => PROBE.map(([dx, dz]) => [l.a[0] + dx, l.a[2] + dz])),
    done(hits) {
      legsAll.forEach((l, i) => {
        let best = -Infinity, bx = 0, bz = 0;
        PROBE.forEach(([dx, dz], k) => {
          const ys = hits[i * PROBE.length + k];
          for (let n = ys.length - 1; n >= 0; n--) {
            if (ys[n] > l.a[1] + REACH_UP) continue;
            if (ys[n] >= l.a[1] - REACH_DOWN && ys[n] > best) { best = ys[n]; bx = dx; bz = dz; }
            break;
          }
        });
        if (best === -Infinity) return;
        l.hover = false; l.a[0] += bx; l.a[1] = best + 0.035; l.a[2] += bz;
      });
      // A loiter carries straight on from the flight in: its loop starts along the heading that flight arrived on.
      for (const { legs } of flies) legs.forEach((l, k) => {
        const from = legs[(k + legs.length - 1) % legs.length];
        if (l.hover) l.yawRest = Math.atan2(l.a[0] - from.c[0], l.a[2] - from.c[2]);
      });
    },
  });

  const bez = (a, c, b, u, out) => {
    const v = 1 - u;
    out[0] = v * v * a[0] + 2 * u * v * c[0] + u * u * b[0];
    out[1] = v * v * a[1] + 2 * u * v * c[1] + u * u * b[1];
    out[2] = v * v * a[2] + 2 * u * v * c[2] + u * u * b[2];
  };
  const wander = (l, uu, tt, o) => {
    bez(l.a, l.c, l.b, uu, o);
    const e = Math.sin(Math.PI * clamp01(uu));
    o[0] += e * 0.42 * (Math.sin(tt * 1.7 + l.s) + 0.5 * Math.sin(tt * 3.1 + l.s * 2));
    o[1] += e * 0.22 * Math.sin(tt * 2.6 + l.s * 3) + e * 0.05 * Math.sin(tt * 34 + l.s);
    o[2] += e * 0.42 * (Math.cos(tt * 1.4 + l.s) + 0.5 * Math.sin(tt * 2.7 + l.s * 4));
  };
  /** Where a flight is `s` seconds after take-off, at absolute time tt. */
  const flown = (l, s, tt, o) => { const v = clamp01(s / l.fly); wander(l, smooth(0, 1, v) * 0.5 + v * 0.5, tt, o); };
  const k0 = [0, 0, 0], k1 = [0, 0, 0];
  /** Heading key n of flight i: the rest yaws at either end, between them the direction of the half second of path around the key. */
  const headingKey = (f, i, n, tStart) => {
    const l = f.legs[i], s = (n / l.keys) * l.fly;
    if (n <= 0) return l.yawRest;
    if (n >= l.keys) return f.legs[(i + 1) % f.legs.length].yawRest;
    flown(l, s - HEADING_GAP / 2, tStart + s - HEADING_GAP / 2, k0); flown(l, s + HEADING_GAP / 2, tStart + s + HEADING_GAP / 2, k1);
    return Math.atan2(k1[0] - k0[0], k1[2] - k0[2]);
  };
  const LOITER_LAP = 3.5;   // seconds a circle round the bloom takes, near enough: a rest fits a whole number of them
  const pose = (f, t, out) => {
    const tm = ((t + f.phase) % f.period + f.period) % f.period;
    let i = 0; while (i < f.legs.length - 1 && tm >= f.legs[i + 1].t0) i++;
    const l = f.legs[i], tl = tm - l.t0;
    if (tl < l.rest) {
      const fade = smooth(0, 0.45, tl) * smooth(l.rest, l.rest - 0.45, tl);
      out.rest = 1; out.yaw = l.yawRest; out.pitch = -0.12;
      out.p[0] = l.a[0]; out.p[1] = l.a[1]; out.p[2] = l.a[2];
      if (!l.hover) { out.flap = lerp(1.0, lerp(1.32, 0.3, smooth(-0.55, 0.65, Math.sin(t * 0.8 + f.seed))), fade); return; }
      // Whole turns of a small circle through the spot, entered and left along yawRest. Its heading is exact, so the yaw needs no easing.
      const s = tl / l.rest, turn = (s + smooth(0, 1, s)) * 0.5 * TAU * Math.max(1, Math.round(l.rest / LOITER_LAP)), side = l.s % 2 < 1 ? 1 : -1, r = 0.22 + 0.1 * (l.s % 1);
      out.yaw = l.yawRest + side * turn;
      out.p[0] += side * r * (Math.cos(l.yawRest) - Math.cos(out.yaw)) + fade * 0.05 * Math.sin(t * 2.3 + l.s);
      out.p[1] += fade * (0.14 + 0.06 * Math.sin(t * 3.7 + l.s * 2));   // up clear of the bloom heads
      out.p[2] += side * r * (Math.sin(out.yaw) - Math.sin(l.yawRest)) + fade * 0.05 * Math.cos(t * 1.9 + l.s * 3);
      out.pitch = lerp(-0.12, -0.36, fade);
      out.flap = lerp(1.0, 0.62 + 0.86 * Math.sin(t * 38 + f.seed * 7), fade);
      return;
    }
    const s = tl - l.rest, v = s / l.fly, env = Math.sin(Math.PI * v), key = v * l.keys, n = Math.floor(key);
    flown(l, s, t, out.p);
    out.rest = 0;
    out.yaw = angLerp(headingKey(f, i, n, t - s), headingKey(f, i, n + 1, t - s), smooth(0, 1, key - n));
    out.pitch = lerp(-0.12, -0.5, env);
    const lim = smooth(0, 0.05, v) * smooth(1, 0.94, v);
    out.flap = lerp(1.0, 0.62 + 0.86 * Math.sin(t * 38 + f.seed * 7), lim);
  };

  // Wing: forewing + hindwing outline in XZ, root at origin, span +x, forward +z.
  const outline = [[0, 0.1], [0.1, 0.2], [0.22, 0.27], [0.33, 0.26], [0.36, 0.18], [0.27, 0.08], [0.17, 0.015], [0.26, -0.05], [0.27, -0.14], [0.2, -0.22], [0.1, -0.22], [0.03, -0.12], [0, -0.04]];
  const sh = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, z)));
  const wing = new THREE.ShapeGeometry(sh, 1).rotateX(Math.PI / 2);
  { const p = wing.attributes.position, uv = wing.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 0.37, (p.getZ(i) + 0.23) / 0.51); }
  const wingTex = ctx.canvasTexture(128, 128, (g, w) => {
    const X = (x) => (x / 0.37) * w, Y = (z) => (1 - (z + 0.23) / 0.51) * w; // canvas y is flipped against uv.v
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, w);
    g.lineJoin = 'round';
    g.beginPath(); outline.forEach(([x, z], i) => (i ? g.lineTo(X(x), Y(z)) : g.moveTo(X(x), Y(z)))); g.closePath();
    g.strokeStyle = '#3a3440'; g.lineWidth = 9; g.stroke();
    g.fillStyle = '#fffdf2';
    for (const [x, z, r] of [[0.31, 0.2, 5], [0.27, 0.13, 4], [0.24, 0.24, 4], [0.23, -0.12, 4], [0.17, -0.19, 4]]) { g.beginPath(); g.arc(X(x), Y(z), r, 0, TAU); g.fill(); }
    g.fillStyle = 'rgba(58,52,64,.8)'; g.beginPath(); g.arc(X(0.16), Y(0.13), 7, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(58,52,64,.35)'; g.lineWidth = 2.5;
    for (const [x, z] of [[0.3, 0.1], [0.25, 0.22], [0.2, -0.15], [0.14, -0.2]]) { g.beginPath(); g.moveTo(X(0), Y(0.02)); g.lineTo(X(x), Y(z)); g.stroke(); }
  }, { repeat: false });
  const wingMat = ctx.toon({ map: wingTex, side: THREE.DoubleSide, dapple: false, translucent: 0.7 });
  const wings = dynamicInstanced(ctx, wing, wingMat, flies.length * 2, 'butterflyWings');
  const col = new THREE.Color();
  flies.forEach((f, i) => { col.set(f.color); wings.setColorAt(i * 2, col); wings.setColorAt(i * 2 + 1, col); });
  wings.instanceColor.needsUpdate = true;

  const body = kit.merge([
    ellipsoid(ctx, 0.028, 0.028, 0.15, [0, 0, -0.03], 6, 4),
    ellipsoid(ctx, 0.032, 0.032, 0.036, [0, 0.004, 0.12], 6, 4),
    kit.tube([[0.01, 0.02, 0.15], [0.05, 0.08, 0.24], [0.1, 0.1, 0.3]], 0.0085, 0.0065, 3, 4),
    kit.tube([[-0.01, 0.02, 0.15], [-0.05, 0.08, 0.24], [-0.1, 0.1, 0.3]], 0.0085, 0.0065, 3, 4),
  ]);
  const bodies = dynamicInstanced(ctx, body, ctx.toon({ color: '#463a40', dapple: false }), flies.length, 'butterflyBodies');
  group.add(wings, bodies);

  const m = new THREE.Matrix4(), m2 = new THREE.Matrix4(), rz = new THREE.Matrix4(), e = new THREE.Euler(0, 0, 0, 'YXZ'), q = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const st = { p: [0, 0, 0], yaw: 0, pitch: 0, flap: 0, rest: 0 };
  updaters.push((t) => {
    for (let i = 0; i < flies.length; i++) {
      const f = flies[i];
      pose(f, t, st);
      e.set(st.pitch, st.yaw, 0); q.setFromEuler(e); v.fromArray(st.p);
      one.setScalar(f.s);
      m.compose(v, q, one);
      bodies.setMatrixAt(i, m);
      rz.makeRotationZ(st.flap); m2.multiplyMatrices(m, rz); wings.setMatrixAt(i * 2, m2);
      rz.makeRotationZ(Math.PI - st.flap); m2.multiplyMatrices(m, rz); wings.setMatrixAt(i * 2 + 1, m2);
    }
    bodies.instanceMatrix.needsUpdate = true; wings.instanceMatrix.needsUpdate = true;
  });
}

function buildDragonflies(ctx, group, updaters) {
  const { THREE, layout, P, kit, shared } = ctx;
  const rng = ctx.seeded('atmos-dragonfly'), pond = layout.WATER.pond, S = layout.FLOWER_SPOTS;
  const { RIVER, GROVE, RING_ZONES } = layout, willow = GROVE.find((g) => g.kind === 'willow');
  const COLORS = ['#e8523a', '#25b8a8', '#e8523a', '#3f8fe0', '#25b8a8', '#e8523a', '#3f8fe0', '#e8523a', '#25b8a8'];
  // A stretch of the canal, by index along its centre line. Each flier keeps to its own reach, so a dart never crosses the bridge or the willow's strands.
  const canal = (i0, i1, r = rng) => () => {
    for (;;) {
      const f = r.range(i0, i1), i = Math.floor(f), u = f - i, a = RIVER.center[i], b = RIVER.center[i + 1];
      const x = lerp(a[0], b[0], u) + r.range(-0.6, 0.6), z = lerp(a[1], b[1], u) + r.range(-0.6, 0.6);
      if (Math.hypot(x - willow.x, z - willow.z) < 3.2 || Math.hypot(x - RIVER.bridge.x, z - RIVER.bridge.z) < 3) continue;
      return [x, RIVER.y + r.range(0.55, 1.5), z];
    }
  };
  // The canal head stops short of the weir: past a line square to the reach, a body length beyond the slot's furthest corner, which
  // also leaves the sluice frame on the slot's edge behind. One straight line, so a dart between two points past it stays past it too.
  // And high enough that the narrow head's bank stones (tops ~.3) pass under the body. Re-rolls take their own stream: the shared one
  // must not shift the fliers built after this one.
  const headReach = canal(0, 1.6), reroll = canal(0, 1.6, ctx.seeded('atmos-dragonfly-head')), [c0, c1] = RIVER.center, slot = RIVER.weirSlot;
  const reachL = Math.hypot(c1[0] - c0[0], c1[1] - c0[1]), downX = (c1[0] - c0[0]) / reachL, downZ = (c1[1] - c0[1]) / reachL;
  const pastWeir = Math.max(...slot.x.flatMap((x) => slot.z.map((z) => x * downX + z * downZ))) + 0.8;
  const canalHead = () => { let p = headReach(); while (p[0] * downX + p[2] * downZ < pastWeir || p[1] < 0.6) p = reroll(); return p; };
  // Over the open water of the paddies only: the persimmons that stand in that zone have crowns down to these heights, and a dart is a straight line.
  const clearOfCrowns = (p) => layout.CANOPIES.every(([lx, ly, lz, rxz, ry]) => Math.hypot((p[0] - lx) / (rxz + 0.5), (p[1] - ly) / (ry + 0.5), (p[2] - lz) / (rxz + 0.5)) > 1);
  const paddyHop = () => { const { x, z } = RING_ZONES.paddies; for (let n = 0; n < 40; n++) { const p = [rng.range(x[0] + 1, x[1] - 1), rng.range(2.2, 3.2), rng.range(z[0] + 1, z[1] - 1)]; if (clearOfCrowns(p)) return p; } return [(x[0] + x[1]) / 2, 2.6, (z[0] + z[1]) / 2]; };
  const place = [
    () => [pond.x + rng.range(-0.9, 0.9) * pond.rx, rng.range(0.45, 1.25), pond.z + rng.range(-0.85, 0.85) * pond.rz],
    () => [pond.x + rng.range(-0.8, 0.8) * pond.rx, rng.range(0.5, 1.5), pond.z + rng.range(-0.9, 0.9) * pond.rz],
    // Only S[2]: S[5] lies behind the traffic-light pole and the kiosk. High enough to dart over the reeds at the pond's rim.
    () => { const s = S[2]; return [s[0] + rng.range(-1.1, 1.1), s[1] + rng.range(1, 1.5), s[2] + rng.range(-1.1, 1.1)]; },
    () => { const s = S[rng.pick([0, 1])]; return [s[0] + rng.range(-1.1, 1.1), s[1] + rng.range(0.4, 1.2), s[2] + rng.range(-1.1, 1.1)]; },
    canalHead,          // canal head, below the weir
    canal(3.4, 5.4),    // the western reach, down to the outfall
    // Over the wild end of the line; high enough to clear the grass heads.
    () => { const s = S[rng.pick([12, 13])]; return [s[0] + rng.range(-1.4, 1.4), s[1] + rng.range(1.1, 2), s[2] + rng.range(-1.4, 1.4)]; },
    // v3: the flooded paddies. The steps climb toward +x, so they keep above the highest bund. Added last: the fliers before them keep their random stream.
    ...[0, 1].map(() => paddyHop),
  ];
  const PADDY_FROM = 7;   // the paddy fliers' darts check the crowns as well as their stops
  const flies = COLORS.map((c, n) => {
    const legs = []; let clock = 0; const first = place[n](); let at = first, yaw = rng() * TAU;
    const count = 26;
    for (let k = 0; k < count; k++) {
      let to = k === count - 1 ? first : place[n]();
      if (n >= PADDY_FROM && k !== count - 1) for (let tries = 0; tries < 12 && !clearOfCrowns([(at[0] + to[0]) / 2, (at[1] + to[1]) / 2, (at[2] + to[2]) / 2]); tries++) to = place[n]();
      const hop = Math.hypot(to[0] - at[0], to[1] - at[1], to[2] - at[2]);
      const hover = rng() < 0.3 ? rng.range(2.2, 4.5) : rng.range(0.5, 1.8), dart = Math.max(rng.range(0.28, 0.5), hop / 6);
      const ny = Math.atan2(to[0] - at[0], to[2] - at[2]);
      legs.push({ t0: clock, hover, dart, a: at, b: to, yaw0: yaw, yaw1: ny, s: rng() * 50 });
      clock += hover + dart; at = to; yaw = ny;
    }
    return { legs, period: clock, phase: rng() * clock, seed: rng() * 50, color: c };
  });

  // Body along +z.
  const segs = [];
  for (let i = 0; i < 7; i++) segs.push(kit.cyl(0.021 - i * 0.0012, 0.023 - i * 0.0012, 0.072, 5).rotateX(Math.PI / 2).translate(0, 0, -0.1 - i * 0.076));
  const body = paintTris(ctx, kit.merge([
    ellipsoid(ctx, 0.05, 0.052, 0.09, [0, 0, 0.03], 6, 5),
    ellipsoid(ctx, 0.047, 0.04, 0.038, [0, 0.008, 0.135], 6, 4),
    ...segs,
  ]), (x, y, z) => {
    if (z > 0.115) return Math.abs(x) > 0.012 ? '#6a2f2f' : '#ffffff';
    if (z < -0.08) return (Math.floor((-z + 0.02) / 0.076) % 2 === 0) ? '#ffffff' : '#c8c8c8';
    return '#ffffff';
  });
  const bodies = dynamicInstanced(ctx, body, ctx.toon({ vertexColors: true, dapple: false }), flies.length, 'dragonflyBodies');
  const col = new THREE.Color();
  flies.forEach((f, i) => { bodies.setColorAt(i, col.set(f.color)); });
  bodies.instanceColor.needsUpdate = true;

  // Clear wing: narrow ellipse, root at origin, span +x.
  const WL = 0.36, WC = 0.05, N = 12, wp = [0, 0, 0], wu = [0.5, 0.5], wi = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU, x = WL / 2 + Math.cos(a) * WL / 2, z = Math.sin(a) * WC * (1 - 0.25 * Math.cos(a));
    wp.push(x, 0, z); wu.push(0.5 + Math.cos(a) / 2, 0.5 + Math.sin(a) / 2);
  }
  wp[0] = WL / 2; for (let i = 0; i < N; i++) wi.push(0, 1 + i, 1 + (i + 1) % N);
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
  wg.setAttribute('uv', new THREE.Float32BufferAttribute(wu, 2));
  wg.setIndex(wi);
  const wingMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: shared.uTime, cA: { value: new THREE.Color('#bdf7ff') }, cB: { value: new THREE.Color('#ffd9f2') }, cC: { value: new THREE.Color(P.sunPale) } },
    vertexShader: /* glsl */`
      varying vec2 vUv; varying float vP;
      void main(){ vUv=uv; vec4 w=modelMatrix*instanceMatrix*vec4(position,1.); vP=dot(w.xyz,vec3(3.1,5.3,4.7)); gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform vec3 cA,cB,cC; varying vec2 vUv; varying float vP;
      void main(){
        vec2 q=(vUv-.5)*2.; float e=length(q);
        float sh=.5+.5*sin(vP+uTime*19.+q.x*5.);
        vec3 col=mix(mix(cA,cB,sh),cC,smoothstep(.72,.96,e));
        float a=.34+.26*sh+.34*smoothstep(.7,.95,e);
        gl_FragColor=vec4(col*1.15,a);
      }`,
  });
  const wings = dynamicInstanced(ctx, wg, wingMat, flies.length * 4, 'dragonflyWings');
  wings.renderOrder = 6;
  group.add(bodies, wings);

  const m = new THREE.Matrix4(), m2 = new THREE.Matrix4(), rz = new THREE.Matrix4(), ry = new THREE.Matrix4(), tr = new THREE.Matrix4();
  const e = new THREE.Euler(0, 0, 0, 'YXZ'), q = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  updaters.push((t) => {
    for (let i = 0; i < flies.length; i++) {
      const f = flies[i], tm = ((t + f.phase) % f.period + f.period) % f.period;
      let k = 0; while (k < f.legs.length - 1 && tm >= f.legs[k + 1].t0) k++;
      const l = f.legs[k], tl = tm - l.t0;
      let x, y, z, yaw, pitch = -0.08, roll = 0;
      if (tl < l.hover) {
        const fade = smooth(0, 0.25, tl) * smooth(l.hover, l.hover - 0.25, tl);
        x = l.a[0] + fade * 0.035 * Math.sin(t * 7.3 + l.s); y = l.a[1] + fade * 0.05 * Math.sin(t * 5.1 + l.s * 2); z = l.a[2] + fade * 0.035 * Math.cos(t * 6.1 + l.s * 3);
        yaw = l.yaw0 + 0.08 * Math.sin(t * 1.3 + l.s);
      } else {
        const u = smooth(0, 1, (tl - l.hover) / l.dart);
        x = lerp(l.a[0], l.b[0], u); y = lerp(l.a[1], l.b[1], u); z = lerp(l.a[2], l.b[2], u);
        yaw = angLerp(l.yaw0, l.yaw1, smooth(0, 0.35, u));
        pitch = 0.22 * Math.sin(Math.PI * u); roll = 0.3 * Math.sin(Math.PI * u) * Math.sign(Math.sin(l.s));
      }
      e.set(pitch, yaw, roll); q.setFromEuler(e); v.set(x, y, z);
      m.compose(v, q, one);
      bodies.setMatrixAt(i, m);
      for (let w = 0; w < 4; w++) {
        const left = w % 2 === 1, front = w < 2;
        const flap = 0.08 + 0.42 * Math.sin(t * 61 + w * 2.1 + f.seed);
        const sweep = (front ? 0.14 : -0.22);
        tr.makeTranslation(0, 0.05, front ? 0.075 : 0.0);
        rz.makeRotationZ(left ? Math.PI - flap : flap);
        ry.makeRotationY(left ? -sweep : sweep);
        m2.multiplyMatrices(m, tr).multiply(ry).multiply(rz);
        wings.setMatrixAt(i * 4 + w, m2);
      }
    }
    bodies.instanceMatrix.needsUpdate = true; wings.instanceMatrix.needsUpdate = true;
  });
}

/* ---------------------------------------------------------------- 4. swallows ------------------------------------------ */

function buildBirds(ctx, group, updaters) {
  const { THREE, layout, kit } = ctx;
  const V = THREE.Vector3;
  const NAVY = '#2c4468', NAVY2 = '#233656', CREAM = '#f6efdd', RUST = '#cc5a3a';
  const { RAIL, GROVE, TOWN, MEADOW, BASE, BUILDINGS, RING_ZONES, WOODS, CORE } = layout;
  // rail.js doesn't export its catenary, so these two copy its messenger wires over the first track, either side of the third mast.
  // Seats stay on the stretches its vines leave bare (past u=.62 on the first, before u=.3 on the second) and between the droppers.
  const T0 = RAIL.tracks[0];
  const perchWires = [...layout.WIRES.filter((w) => w.perch), { a: [T0, 4.82, 4.4], b: [T0 + 0.1, 4.62, 15.6], sag: 0.7, perch: true }, { a: [T0, 4.82, -5.6], b: [T0, 4.82, 4.4], sag: 0.45, perch: true }];

  // Geometry: a swallow, a bit oversized. Forward +z, body centre at origin, feet at FOOT.
  const tailL = kit.leaf(0.36, 0.07, 0.1).rotateY(Math.PI - 0.14).translate(0.018, 0.02, -0.17);
  const tailR = kit.leaf(0.36, 0.07, 0.1).rotateY(Math.PI + 0.14).translate(-0.018, 0.02, -0.17);
  const bodyGeo = paintTris(ctx, kit.merge([
    ellipsoid(ctx, 0.125, 0.13, 0.235, [0, 0, 0], 10, 7),
    tailL, tailR,
    kit.tube([[0.04, -0.09, 0.04], [0.045, -0.17, 0.05]], 0.012, 0.01, 3, 2),
    kit.tube([[-0.04, -0.09, 0.04], [-0.045, -0.17, 0.05]], 0.012, 0.01, 3, 2),
  ]), (x, y, z) => {
    if (y < -0.1 && Math.abs(z) < 0.1 && Math.abs(x) < 0.07) return '#6e5a50';
    if (z < -0.22) return NAVY2;
    return y < -0.012 ? CREAM : NAVY;
  });
  const headGeo = paintTris(ctx, kit.merge([
    ellipsoid(ctx, 0.105, 0.1, 0.11, [0, 0, 0.02], 8, 6),
    kit.cyl(0.0, 0.034, 0.11, 5).rotateX(Math.PI / 2).translate(0, -0.012, 0.165),
    ellipsoid(ctx, 0.021, 0.021, 0.017, [0.088, 0.024, 0.065], 5, 3),
    ellipsoid(ctx, 0.021, 0.021, 0.017, [-0.088, 0.024, 0.065], 5, 3),
  ]), (x, y, z) => {
    if (z > 0.125) return '#e9a63f';
    if (Math.abs(x) > 0.07 && y > 0.0 && z > 0.04) return '#1c2530';
    if (y < -0.03) return z > 0.05 ? RUST : CREAM;
    return z > 0.1 && y < 0.03 ? RUST : NAVY;
  });
  // Long scimitar wing: root at origin, span +x, swept back.
  const wo = [[0, 0.075], [0.14, 0.08], [0.28, 0.035], [0.42, -0.05], [0.52, -0.15], [0.38, -0.11], [0.25, -0.1], [0.12, -0.09], [0, -0.08]];
  const wingGeo = new THREE.ShapeGeometry(new THREE.Shape(wo.map(([x, z]) => new THREE.Vector2(x, z))), 1).rotateX(Math.PI / 2);
  const wingG = paintTris(ctx, wingGeo, (x, y, z) => (z < -0.06 - x * 0.12 ? NAVY2 : NAVY));

  const mat = ctx.toon({ vertexColors: true, dapple: false, side: THREE.DoubleSide });
  const COUNT = 7;   // 4 that use the wires, 3 that keep to the sky (WHEEL)
  const bodies = dynamicInstanced(ctx, bodyGeo, mat, COUNT, 'birdBodies');
  const heads = dynamicInstanced(ctx, headGeo, mat, COUNT, 'birdHeads');
  const wings = dynamicInstanced(ctx, wingG, mat, COUNT * 2, 'birdWings');
  group.add(bodies, heads, wings);

  // Seated nose-up, so the feet are not simply below the body: it is the rotated foot that has to sit on the wire.
  const FOOT = [0, -0.17, 0.05], SEAT_PITCH = -0.42, SEAT_NECK = 0.38;
  const footY = FOOT[1] * Math.cos(SEAT_PITCH) - FOOT[2] * Math.sin(SEAT_PITCH), footZ = FOOT[1] * Math.sin(SEAT_PITCH) + FOOT[2] * Math.cos(SEAT_PITCH);
  const perchOf = (wireI, u, flip) => {
    const w = perchWires[wireI], a = layout.wirePoint(w, u), b = layout.wirePoint(w, Math.min(1, u + 0.02));
    const tx = b[0] - a[0], tz = b[2] - a[2], l = Math.hypot(tx, tz) || 1;
    let fx = -tz / l, fz = tx / l;
    if ((fx + fz) * flip < 0) { fx = -fx; fz = -fz; }   // seated across the wire
    const yaw = Math.atan2(fx, fz);
    return { w, u, fx, fz, yaw, foot: [Math.sin(yaw) * footZ, footY, Math.cos(yaw) * footZ] };
  };
  const hopPoint = (pc, du, out) => {
    const q = layout.wirePoint(pc.w, clamp01(pc.u + du));
    out[0] = q[0] - pc.foot[0]; out[1] = q[1] - pc.foot[1]; out[2] = q[2] - pc.foot[2];
    return out;
  };

  // period, perch time, phase offset (so bird 0 is on the wire from t=0 to t≈30), fly-by?
  const BIRDS = [
    { T: 78, perch: 34, offset: 4, wires: [[1, 0.3], [0, 0.42], [1, 0.66], [2, 0.38]], seed: 11, arrive: 8.7 },
    { T: 104, perch: 42, offset: -22, wires: [[0, 0.3], [1, 0.5], [2, 0.5], [1, 0.33]], seed: 23, arrive: 9.5 },
    { T: 131, perch: 26, offset: -71, wires: [[2, 0.3], [1, 0.38], [0, 0.22]], seed: 37, arrive: 8.1 },
    { T: 96, perch: 40, offset: -9, wires: [[2, 0.44], [4, 0.78], [3, 0.19]], seed: 53, arrive: 8.6 },   // the one that keeps to the railway
  ];
  // Each swallow's flights end on a square just inside the box the near plane leaves free of clipping (BASE.half + 14), so a far end sits over the plinth's rim or past
  // a corner. Bézier curves stay in the hull of their control points, so the whole flight stays inside if the ends do. The longer run keeps the old calm speed.
  const LEAVE = 8.8, FLYBY = 12.5, EDGE = BASE.half + 12;
  const cubic = (p0, p1, p2, p3, u, o) => {
    const v = 1 - u, a = v * v * v, b = 3 * u * v * v, c = 3 * u * u * v, d = u * u * u;
    for (let i = 0; i < 3; i++) o[i] = a * p0[i] + b * p1[i] + c * p2[i] + d * p3[i];
  };
  const offBase = (a, y) => { const c = Math.cos(a), s = Math.sin(a), k = EDGE / Math.max(Math.abs(c), Math.abs(s)); return [c * k, y, s * k]; };
  // What a swallow has to stay clear of: the leaning poles and the signal arm, the block, the bridge, the crowns, the chimney, the railway.
  const { STREET, BUILDING, WIRES, CANOPIES, HERO_CAM } = layout, TLS = STREET.trafficLight, UP = STREET.utilityPole, LAMP = STREET.lamp, tlTop = WIRES[1].b;
  const STICKS = [
    [[TLS.x, 0, TLS.z], tlTop],
    [[lerp(TLS.x, tlTop[0], 0.88), 5.3, lerp(TLS.z, tlTop[2], 0.88)], [TLS.armToward[0], 5.46, TLS.armToward[1]]],
    [[UP.x, 0, UP.z], [UP.x, UP.height, UP.z]],
    [[LAMP.x, 0, LAMP.z], WIRES[3].a],
    [[TOWN.chimney.x, 0, TOWN.chimney.z], [TOWN.chimney.x, TOWN.chimney.height + 1, TOWN.chimney.z]],
    [[RAIL.signal.x, 0, RAIL.signal.z], [RAIL.signal.x, 4.8, RAIL.signal.z]],
    ...GROVE.map((g) => [[g.x, 0, g.z], [g.x, g.lobes[0][1], g.z]]),
    ...WOODS.map((g) => [[g.x, g.elev, g.z], [g.x, g.lobes[0][1], g.z]]),
    // catenary masts and their arms, and the snapped wire that hangs off the third one
    ...[-18.6, -5.6, 4.4, 15.6].flatMap((z) => [[[19.42, 0, z], [19.5, 5.7, z]], [[19.5, 5.2, z], [14.9, 5.1, z]]]),
    [[18.2, 4.5, 4.4], [18.4, 2.9, 7.2], 0.7], [[18.4, 2.9, 7.2], [18.7, 0.4, 7.4], 0.7],
  ];
  const STICK_CLEAR = 1.3;
  const stickDist = (p, [a, b]) => {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], k = clamp01(((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1] + (p[2] - a[2]) * d[2]) / (d[0] * d[0] + d[1] * d[1] + d[2] * d[2]));
    return Math.hypot(p[0] - a[0] - d[0] * k, p[1] - a[1] - d[1] * k, p[2] - a[2] - d[2] * k);
  };
  // The close viewpoints looking in over the ring, copied from main.js CAMS (rail, meadow, station, playground, backlot, bathhouse, river,
  // waterfall; hero has its own test in planArc). Far ends now lie out past them: a swallow may pass one, but not across the lens.
  // The test cams inside the ring stay out of this: the wires' seats and the skim lane run right past them, so most would leave some flight with no clear line.
  // The v3 ring viewpoints join them (shotengai2, shrine, works, paddies, school, gas, level, railN, canalS, waterfall2, watermill): those look across the outer ring, where a far end or the skim lane can pass.
  const VIEWS = [[32, 10, 8], [22, 7, 28], [26, 7, -22], [-6, 8, 26], [8, 16, -34], [-30, 14, -30], [-17, 10, 31], [-30, 3, 52],
    [-42, 7.5, 1.2], [-21, 13, -26], [39, 10, -28], [47, 13, -2], [14, 6.5, 33.4], [34, 8, 47], [11, 9, 36], [25, 7, -22], [-5, 10, 31], [-9, -2.5, 58], [-11.5, 5.5, 21]], VIEW_CLEAR = 5.5;
  // Every ring roof, as it stands, plus a wingspan and the shrine hill with its pavilions; `CORE.half` is the old edge, past which only the ring's roofs are in the way.
  const RING_ROOFS = BUILDINGS.map((b) => ({ ...layout.buildingBox(b, 1.1), top: b.elev + b.h + 1.3 })), HILL = RING_ZONES.shrineHill;
  const H = layout.BASE.half + 0.5, inBox = (v, r, m = 0) => v > r[0] - m && v < r[1] + m;
  const freeAt = (p, seat) => {
    const [x, y, z] = p;
    if (x < BUILDING.x[1] + 1 && z < BUILDING.z[1] + 1 && y < 13) return false;
    if (x > 1.5 && z < -7.4 && z > -11 && y < 6) return false;   // footbridge
    if (x > 8.7 && z < -2.8 && z > -8.6 && y < 5.6) return false;  // its stairs
    if (Math.abs(x) < H && Math.abs(z) < H) {                      // the ring, all kept low
      if (y < 2) return false;
      if (Math.max(Math.abs(x), Math.abs(z)) > CORE.half - 1) {
        for (const r of RING_ROOFS) if (y < r.top && inBox(x, r.x) && inBox(z, r.z)) return false;
        if (y < HILL.y + 1.4 && inBox(x, HILL.x, 0.8) && inBox(z, HILL.z, 0.8)) return false;
      }
      if (inBox(x, TOWN.row.x, 0.8) && z < TOWN.row.z[1] + 0.8 && y < TOWN.row.maxH + 1.2) return false;
      if (inBox(x, MEADOW.greenhouse.x, 0.6) && inBox(z, MEADOW.greenhouse.z, 0.6) && y < MEADOW.greenhouse.maxH + 0.8) return false;
      if (inBox(x, MEADOW.playground.x) && inBox(z, MEADOW.playground.z) && y < MEADOW.playground.maxH + 0.8) return false;
      if (x > RAIL.platform.x[0] - 0.5 && x < RAIL.tracks[0] + 1.4 && z > -16.4 && z < 11.8 && y < RAIL.maxHeight + 0.8) return false;  // cars, platform
      // The contact wires: a bird crosses them only in the last few metres to its own seat.
      const dSeat = seat ? Math.hypot(x - seat[0], y - seat[1], z - seat[2]) : 99;
      if (x > RAIL.tracks[0] - 1.2 && x < RAIL.tracks[1] + 1 && y > 3.2 && y < 5.5 && dSeat > 5.5) return false;
    }
    for (const c of VIEWS) if (Math.hypot(x - c[0], y - c[1], z - c[2]) < VIEW_CLEAR) return false;
    for (const st of STICKS) if (stickDist(p, st) < (st[2] ?? STICK_CLEAR)) return false;
    for (const [lx, ly, lz, rxz, ry] of CANOPIES) if (Math.hypot((x - lx) / rxz, (y - ly) / ry, (z - lz) / rxz) < 1.05) return false;
    return true;
  };
  const probe = [0, 0, 0];
  const pathFree = (ctrl, seat) => { for (let i = 0; i <= 96; i++) { cubic(ctrl[0], ctrl[1], ctrl[2], ctrl[3], i / 96, probe); if (!freeAt(probe, seat)) return false; } return true; };
  // Plans are pure functions of the cycle, so a frozen frame gets the same one. Kept per bird because each search walks the path.
  // A search can cost several ms, so the idle frames do them ahead of need (see warmPlans). They are generators so that work can stop between candidate paths.
  const keep = (b, key, plan) => {
    if (b.plans.size > 8) for (const k of b.plans.keys()) if ((k >> 4) < (key >> 4) - 1) b.plans.delete(k);
    if (b.plans.size > 32) b.plans.clear();
    b.plans.set(key, plan); return plan;
  };
  const run = (search) => { let r = search.next(); while (!r.done) r = search.next(); return r.value; };
  const arc = (b, n, s, pc, p, arriving) => b.plans.get(n * 16 + s) ?? keep(b, n * 16 + s, run(searchArc(b, n, s, pc, p, arriving)));
  const skim = (b, n) => b.plans.get(n * 16 + 15) ?? keep(b, n * 16 + 15, run(searchSkim(b, n)));
  const searchArc = function* (b, n, s, pc, p, arriving) {
    // The wire end runs square to the wire, along the seat: in from behind the bird, out past its beak.
    const dir = arriving ? -1 : 1, fx = pc.fx * dir, fz = pc.fz * dir;
    let last = null;
    for (let i = 0; i < 96; i++) {
      // Dips under the wire as swallows do; with the signal arm in the way, the later tries come in over it instead.
      const nearP = [p[0] + fx * 2.6, p[1] + (i < 48 ? (arriving ? -1.3 : -1.0) : 1.7), p[2] + fz * 2.6];
      // Far end somewhere over the open east/south side: the block and the canopy fill the rest of the compass.
      const key = n + i * 7.31, ang = lerp(-0.85, 2.45, hash(key, s + b.seed)), far = offBase(ang, 22 + hash(key, s + 3) * 12);
      if (Math.hypot(far[0] - HERO_CAM.pos[0], far[1] - HERO_CAM.pos[1], far[2] - HERO_CAM.pos[2]) < 44) continue;   // never straight at the lens
      const d = [far[0] - p[0], far[2] - p[2]], l = Math.hypot(d[0], d[1]) || 1; d[0] /= l; d[1] /= l;
      if (d[0] * fx + d[1] * fz < 0.2) continue;   // that far end would make the curve double back through the wire
      for (const bow of [5, -5, 0, 9, -9]) {
        const midP = [lerp(far[0], p[0], 0.55) + bow * d[1], lerp(far[1], p[1], 0.8) - 1.2, lerp(far[2], p[2], 0.55) - bow * d[0]];
        last = arriving ? [far, midP, nearP, p] : [p, nearP, midP, far];
        if (pathFree(last, p)) return last;
        yield;
      }
    }
    return last;
  };
  const searchSkim = function* (b, n) {   // false: no clear line this cycle, and the street just stays quiet
    let last = null;
    for (let i = 0; i < 30; i++) {
      const key = n + i * 3.73, lane = [0, -1.6, 1.6, -3.2, 3.2, -4.8][i % 6];   // sidesteps across the line of travel
      const A = offBase(lerp(-0.75, -0.15, hash(key, b.seed + 17)), 13), B = offBase(lerp(1.9, 2.5, hash(key, b.seed + 18)), 15);
      const m1 = [8.5 + lane * 0.65, 6.8 + hash(key, 3) * 2, 1.5 + lane * 0.76], m2 = [1.5 + lane * 0.65, 5.2 + hash(key, 4) * 2, 7.5 + lane * 0.76];  // skims the street corner
      last = [A, m1, m2, B];
      if (pathFree(last)) return last;
      yield;
    }
    return false;
  };

  const HOP_EVERY = 9.5, HOP_AT = 4, HOP_TIME = 0.34;   // a window opens with the bird just landed, so hops come later in it
  const hopOff = (b, i) => (i === 0 ? 0 : 0.016 * Math.sin(i * 2.4 + b.seed));
  const seatDu = (b, lt) => { const k = Math.floor(lt / HOP_EVERY); return lerp(hopOff(b, k), hopOff(b, k + 1), smooth(HOP_AT, HOP_AT + HOP_TIME, lt - k * HOP_EVERY)); };
  const FAR_FADE = 0.1;   // share of a flight spent growing out of, or shrinking into, the distance

  const S = { p: [0, 0, 0], q: [0, 0, 0], yaw: 0, pitch: 0, roll: 0, fold: 1, flap: 0, head: 0, neck: 0, scale: 1, hidden: false, perched: false };
  for (const b of BIRDS) { b.plans = new Map(); b.seats = new Map(); }
  const seatAt = new Array(3).fill(0);
  const pick = (b, k) => {
    const L = b.wires.length, key = (((k % L) + L) % L) * 2 + ((k + b.seed) % 3 === 1 ? 1 : 0);
    let pc = b.seats.get(key);
    if (!pc) { const w = b.wires[key >> 1]; pc = perchOf(w[0], w[1], key & 1 ? -1 : 1); b.seats.set(key, pc); }
    return pc;
  };
  const flight = (b, t, st, ctrl, u, yawEnd, foldAmt) => {
    cubic(ctrl[0], ctrl[1], ctrl[2], ctrl[3], u, st.p); cubic(ctrl[0], ctrl[1], ctrl[2], ctrl[3], Math.min(1, u + 0.012), st.q);
    const dx = st.q[0] - st.p[0], dy = st.q[1] - st.p[1], dz = st.q[2] - st.p[2], h = Math.hypot(dx, dz);
    st.yaw = h > 1e-5 ? Math.atan2(dx, dz) : yawEnd;
    st.pitch = Math.max(-0.7, Math.min(0.5, -Math.atan2(dy, h)));
    const glide = smooth(-0.3, 0.3, Math.sin(t * 1.15 + b.seed));
    st.flap = lerp(0.12, 0.08 + 0.72 * Math.sin(t * 24 + b.seed), glide);
    st.fold = foldAmt; st.neck = -st.pitch * 0.4;
  };
  // The next search still to do for any bird: this cycle's flights and the next cycle's, with the same inputs evalBird will give them. Plans depend only on the cycle, so finding one early changes nothing.
  const WARM_MS = 0.4;
  const hasSkim = (b) => b.T - b.arrive - b.perch - LEAVE > FLYBY + 2;
  const nextSearch = (t) => {
    for (const b of BIRDS) {
      const n0 = Math.floor((t + b.offset + b.T * 100) / b.T);
      for (let n = n0; n < n0 + 2; n++) {
        const leave = n * 16 + 5, arrive = n * 16 + 9, line = n * 16 + 15;
        if (!b.plans.has(leave)) { const pc = pick(b, n); return { b, key: leave, search: searchArc(b, n, 5, pc, hopPoint(pc, seatDu(b, b.perch), [0, 0, 0]), false) }; }
        if (!b.plans.has(arrive)) { const pc = pick(b, n + 1); return { b, key: arrive, search: searchArc(b, n, 9, pc, hopPoint(pc, 0, [0, 0, 0]), true) }; }
        if (hasSkim(b) && !b.plans.has(line)) return { b, key: line, search: searchSkim(b, n) };
      }
    }
    return null;
  };
  let warmJob = null;
  const warmPlans = (t) => {
    const t0 = performance.now();
    do {
      warmJob ||= nextSearch(t);
      if (!warmJob) return;
      const r = warmJob.search.next();
      if (r.done) { if (!warmJob.b.plans.has(warmJob.key)) keep(warmJob.b, warmJob.key, r.value); warmJob = null; }
    } while (performance.now() - t0 < WARM_MS);
  };
  const evalBird = (b, t, st) => {
    const tt = t + b.offset + b.T * 100, n = Math.floor(tt / b.T), lt = tt - n * b.T;
    const pc = pick(b, n), next = pick(b, n + 1);
    st.hidden = false; st.perched = false; st.head = 0; st.roll = 0; st.scale = 1;
    if (lt < b.perch) {
      // On the wire: little head turns, the odd hop.
      st.perched = true;
      const f = lt - Math.floor(lt / HOP_EVERY) * HOP_EVERY;
      hopPoint(pc, seatDu(b, lt), st.p);
      st.p[1] += 0.14 * Math.sin(Math.PI * clamp01((f - HOP_AT) / HOP_TIME));
      st.yaw = pc.yaw; st.pitch = SEAT_PITCH; st.fold = 1; st.flap = 0;
      if (lt > b.perch - 0.6) st.fold = 1 - smooth(b.perch - 0.6, b.perch, lt) * 0.5;
      const hk = Math.floor(lt / 1.35), hf = lt - hk * 1.35;
      const look = (i) => (hash(i, b.seed) < 0.45 ? 0 : (hash(i, b.seed + 1) - 0.5) * 2.1);
      st.head = lerp(look(hk - 1), look(hk), smooth(0, 0.16, hf)) * smooth(0, 0.5, lt) * smooth(b.perch, b.perch - 0.5, lt);
      st.neck = SEAT_NECK;
      return;
    }
    if (lt < b.perch + LEAVE) {
      // Leaves from wherever the last hop put it, wings already half open from the end of the perch.
      const v = (lt - b.perch) / LEAVE, ctrl = arc(b, n, 5, pc, hopPoint(pc, seatDu(b, b.perch), seatAt), false);
      flight(b, t, st, ctrl, Math.pow(v, 1.55), pc.yaw, 0.5 * (1 - smooth(0, 0.07, v)));
      const blend = smooth(0, 0.14, v);
      st.yaw = angLerp(pc.yaw, st.yaw, blend); st.pitch = lerp(SEAT_PITCH, st.pitch, blend); st.neck = lerp(SEAT_NECK, -st.pitch * 0.4, blend);
      st.scale = 1 - smooth(1 - FAR_FADE, 1, v);
      return;
    }
    if (lt > b.T - b.arrive) {
      const v = (lt - (b.T - b.arrive)) / b.arrive, ctrl = arc(b, n, 9, next, hopPoint(next, 0, seatAt), true);
      flight(b, t, st, ctrl, 1 - Math.pow(1 - v, 1.65), next.yaw, smooth(0.93, 1, v));
      const blend = smooth(0.82, 1, v);
      st.yaw = angLerp(st.yaw, next.yaw, blend); st.pitch = lerp(st.pitch, SEAT_PITCH - 0.45 * Math.sin(Math.PI * smooth(0.8, 1, v)), blend); st.neck = lerp(-st.pitch * 0.4, SEAT_NECK, blend);
      st.scale = smooth(0, FAR_FADE, v);
      return;
    }
    // Away. Once per cycle the swallow skims the street without stopping.
    const mid = (b.perch + LEAVE + b.T - b.arrive) / 2, v = (lt - (mid - FLYBY / 2)) / FLYBY;
    if (v > 0 && v < 1 && b.T - b.arrive - b.perch - LEAVE > FLYBY + 2) {
      const line = skim(b, n);
      if (line) {
        flight(b, t, st, line, v, 0, 0);
        st.scale = smooth(0, FAR_FADE, v) * (1 - smooth(1 - FAR_FADE, 1, v));
        return;
      }
    }
    st.hidden = true;
  };

  // Three swallows that never come down: slow figure-eights over the whole plinth, high above every crown and well inside the near plane's box. Closed form in t: a heading is the direction a
  // moment of the curve runs along, and the bank is how fast that heading is turning.
  const H_B = BASE.half;
  const WHEEL = [
    { P: 66, ph: 0.4, seed: 71, y: 33, dy: 3, at: (th) => [0.9 * H_B * Math.sin(th), -0.2 * H_B + 0.5 * H_B * Math.sin(2 * th + 1.1)] },
    { P: 82, ph: 2.3, seed: 83, y: 37, dy: 4, at: (th) => [-0.28 * H_B + 0.55 * H_B * Math.cos(2 * th + 0.3), 0.85 * H_B * Math.sin(th)] },
    { P: 58, ph: 4.6, seed: 97, y: 29, dy: 2, at: (th) => [0.15 * H_B + 0.6 * H_B * Math.cos(th), 0.1 * H_B + 0.58 * H_B * Math.sin(th)] },
  ];
  const wheelAt = (w, tt, o) => { const th = (tt / w.P) * TAU + w.ph, [x, z] = w.at(th); o[0] = x; o[1] = w.y + w.dy * Math.sin(th * 3 + w.seed); o[2] = z; };
  const evalWheel = (w, t, st) => {
    wheelAt(w, t, st.p); wheelAt(w, t + 0.4, st.q);
    const dx = st.q[0] - st.p[0], dz = st.q[2] - st.p[2], h = Math.hypot(dx, dz), a = [0, 0, 0], b = [0, 0, 0];
    wheelAt(w, t - 0.5, a); wheelAt(w, t + 0.9, b);
    const turn = ((Math.atan2(b[0] - st.q[0], b[2] - st.q[2]) - Math.atan2(st.p[0] - a[0], st.p[2] - a[2]) + Math.PI * 3) % TAU) - Math.PI;
    st.yaw = Math.atan2(dx, dz); st.pitch = Math.max(-0.45, Math.min(0.45, -Math.atan2(st.q[1] - st.p[1], h)));
    st.roll = Math.max(-0.75, Math.min(0.75, -turn * 2.2));
    const glide = smooth(-0.15, 0.45, Math.sin(t * 0.6 + w.seed));
    st.flap = lerp(0.14, 0.08 + 0.7 * Math.sin(t * 22 + w.seed), glide);
    st.fold = 0; st.neck = 0; st.head = 0; st.scale = 1.18; st.hidden = false; st.perched = false;
  };

  // Wing poses: spread (flapping about the body axis), or folded along the back toward the tail.
  const qFoldR = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.06, 1.47, 0.32, 'YXZ'));
  const qFoldL = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.06, -1.47, Math.PI - 0.32, 'YXZ'));
  const qs = new THREE.Quaternion(), qz = new THREE.Quaternion(), zAxis = new V(0, 0, 1);
  const m = new THREE.Matrix4(), m2 = new THREE.Matrix4(), mq = new THREE.Matrix4(), tr = new THREE.Matrix4();
  const e = new THREE.Euler(0, 0, 0, 'YXZ'), q = new THREE.Quaternion(), v = new V(), one = new V(1, 1, 1), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  updaters.push((t) => {
    warmPlans(t);
    for (let i = 0; i < COUNT; i++) {
      if (i < BIRDS.length) evalBird(BIRDS[i], t, S); else evalWheel(WHEEL[i - BIRDS.length], t, S);
      if (S.hidden || S.scale < 0.002) {
        bodies.setMatrixAt(i, zero); heads.setMatrixAt(i, zero); wings.setMatrixAt(i * 2, zero); wings.setMatrixAt(i * 2 + 1, zero);
        continue;
      }
      e.set(S.pitch, S.yaw, S.roll); q.setFromEuler(e); v.fromArray(S.p);
      m.compose(v, q, one.setScalar(S.scale));
      bodies.setMatrixAt(i, m);
      tr.makeTranslation(0, 0.078, 0.215);
      mq.makeRotationFromEuler(e.set(S.neck, S.head, 0, 'YXZ'));
      m2.multiplyMatrices(m, tr).multiply(mq);
      heads.setMatrixAt(i, m2);
      tr.makeTranslation(0.05, 0.075, 0.07);
      qs.setFromAxisAngle(zAxis, S.flap); qs.slerp(qFoldR, S.fold);
      m2.multiplyMatrices(m, tr).multiply(mq.makeRotationFromQuaternion(qs));
      wings.setMatrixAt(i * 2, m2);
      tr.makeTranslation(-0.05, 0.075, 0.07);
      qz.setFromAxisAngle(zAxis, Math.PI - S.flap); qz.slerp(qFoldL, S.fold);
      m2.multiplyMatrices(m, tr).multiply(mq.makeRotationFromQuaternion(qz));
      wings.setMatrixAt(i * 2 + 1, m2);
    }
    bodies.instanceMatrix.needsUpdate = true; heads.instanceMatrix.needsUpdate = true; wings.instanceMatrix.needsUpdate = true;
  });
}

/* ---------------------------------------------------------------- 5. water drips --------------------------------------- */

function buildDrips(ctx, group, updaters, settle) {
  const { THREE, layout, kit, shared } = ctx;
  const rng = ctx.seeded('atmos-drips');
  const SWELL = 1.5, G = 7.5, SPLASH = 0.5, BITS = 5;
  const drips = layout.DRIPS.map((d) => {
    const land = []; let c = rng.range(0, 7);
    for (let k = 0; k < 16; k++) { land.push(c); c += rng.range(4, 11); }
    return { from: [...d.to], to: [...d.to], onWater: d.onWater, live: false, fall: 0, land, period: c, last: null, s: rng() * 50 };
  });
  // Each drop hangs from whatever is really overhead, looking up from where it lands. Nothing there: that drop doesn't exist.
  const CLUTTER = 0.5;   // ignore floor litter just above the landing
  settle.push({
    cols: drips.map((d) => [d.to[0], d.to[2]]),
    done(hits) {
      drips.forEach((d, i) => {
        const ys = hits[i], y = ys.find((h) => h > d.to[1] + CLUTTER);
        if (y === undefined) return;
        const floor = ys.filter((h) => h < y).pop();
        if (floor !== undefined && (!d.onWater || floor > d.to[1] + 0.04)) { d.to[1] = floor; d.onWater = false; }
        d.from[1] = y - 0.01; d.live = true; d.fall = Math.sqrt((2 * (d.from[1] - d.to[1])) / G);
      });
    },
  });
  // Teardrop, tip up, centred on the belly.
  const geo = kit.sphere(1, 8, 6);
  { const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i), k = y > 0 ? Math.pow(1 - y, 0.75) / Math.sqrt(Math.max(1e-3, 1 - y * y)) : 1; p.setXYZ(i, p.getX(i) * k, y > 0 ? y * 1.9 : y, p.getZ(i) * k); } geo.computeVertexNormals(); }
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uSun: shared.uSunDir, cBody: { value: new THREE.Color('#a6ece4') }, cRim: { value: new THREE.Color('#fbfff4') } },
    vertexShader: /* glsl */`
      varying vec3 vN,vV;
      void main(){ mat4 M=modelMatrix*instanceMatrix; vec4 w=M*vec4(position,1.); vN=normalize(mat3(M)*normal); vV=cameraPosition-w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uSun,cBody,cRim; varying vec3 vN,vV;
      void main(){
        vec3 N=normalize(vN),V=normalize(vV);
        float f=smoothstep(.45,.75,1.-max(dot(N,V),0.));
        vec3 col=mix(cBody,cRim,f);
        float h=smoothstep(.93,.96,dot(N,normalize(uSun+V)));
        gl_FragColor=vec4(col+h*1.2,.82+.18*f);
      }`,
  });
  const total = drips.length * (1 + BITS);
  const mesh = dynamicInstanced(ctx, geo, mat, total, 'drops');
  mesh.renderOrder = 7;
  group.add(mesh);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0), m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
  updaters.push((t) => {
    for (let i = 0; i < drips.length; i++) {
      const d = drips[i];
      if (!d.live) { mesh.setMatrixAt(i, zero); for (let b = 0; b < BITS; b++) mesh.setMatrixAt(drips.length + i * BITS + b, zero); continue; }
      const tm = ((t % d.period) + d.period) % d.period, cycles = Math.floor(t / d.period);
      let k = 0; while (k < d.land.length && d.land[k] < tm) k++;      // k = next landing in this loop
      const stamp = cycles * d.land.length + k;
      if (d.last !== null && stamp > d.last && d.onWater) ctx.addRipple(d.to[0], d.to[2]);
      d.last = stamp;
      const next = k < d.land.length ? d.land[k] : d.land[0] + d.period, prev = k > 0 ? d.land[k - 1] : d.land[d.land.length - 1] - d.period;
      const u = next - tm, base = 0.058;
      if (u < d.fall) {
        const a = d.fall - u, y = d.from[1] - 0.5 * G * a * a, sp = G * a;
        const st = 1 + Math.min(0.9, sp * 0.13);
        v.set(d.from[0], y, d.from[2]); s.set(base / Math.sqrt(st), base * st, base / Math.sqrt(st)); q.identity();
        mesh.setMatrixAt(i, m.compose(v, q, s));
      } else if (u < d.fall + SWELL) {
        const g = 1 - (u - d.fall) / SWELL, r = base * (0.3 + 0.82 * g * g);
        v.set(d.from[0], d.from[1] - r * 0.7 + 0.01 * Math.sin(t * 6 + d.s) * g, d.from[2]); s.set(r, r * (0.95 + 0.4 * g), r); q.identity();
        mesh.setMatrixAt(i, m.compose(v, q, s));
      } else mesh.setMatrixAt(i, zero);
      const a = tm - prev;
      for (let b = 0; b < BITS; b++) {
        const id = drips.length + i * BITS + b;
        if (a < SPLASH) {
          const h = hash(b, i + Math.floor(prev)), ang = (b / BITS) * TAU + h * 1.2, sp = d.onWater ? 0.7 : 1.05, vy = 1.5 + h * 1.0, tt = a;
          const x = d.to[0] + Math.cos(ang) * sp * tt, z = d.to[2] + Math.sin(ang) * sp * tt, y = d.to[1] + 0.02 + vy * tt - 0.5 * 9 * tt * tt;
          dir.set(Math.cos(ang) * sp, vy - 9 * tt, Math.sin(ang) * sp).normalize(); q.setFromUnitVectors(up, dir);
          const r = 0.024 * (1 - a / SPLASH * 0.6);
          v.set(x, Math.max(d.to[1], y), z); s.set(r, r * 1.5, r);
          mesh.setMatrixAt(id, y < d.to[1] && a > 0.1 ? zero : m.compose(v, q, s));
        } else mesh.setMatrixAt(id, zero);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
}

/* ---------------------------------------------------------------- 7. falling leaves ------------------------------------ */

function buildLeaves(ctx, group, updaters, settle) {
  const { THREE, P, kit, layout } = ctx;
  const rng = ctx.seeded('atmos-leaves');
  const COLORS = [P.leafGold, P.leafLit, P.leafMid, P.sunWarm, P.ivyRed, P.leafGold];
  // Each leaf lets go from under a real canopy lobe and must come down in the open, clear of the block, the bridge and the water.
  const { TREE, WRECK, BUILDING, GROVE, WATER } = layout, deck = WRECK.footbridge, LIMIT = layout.BASE.half - 0.6, canalPoly = layout.riverOutline(0.6);
  const nearBlock = (x, z) => x < BUILDING.x[1] + 1 && z < BUILDING.z[1] + 1 && x > BUILDING.x[0] - 1 && z > BUILDING.z[0] - 1;  // spiral radius + leaf size off the walls
  const wet = (x, z) => layout.pointInPoly(x, z, canalPoly) || Math.hypot((x - WATER.pond.x) / (WATER.pond.rx + 0.3), (z - WATER.pond.z) / (WATER.pond.rz + 0.3)) < 1;
  const pickLeaf = (lobes, color, opts = {}) => {
    const { drift = 1, fan = false, rate = 1, gap = [9, 24] } = opts;
    for (;;) {
      const [lx, ly, lz, rxz, ry] = rng.pick(lobes), a = rng() * TAU, r = Math.sqrt(rng()) * rxz * 0.85;
      const x = lx + Math.cos(a) * r, z = lz + Math.sin(a) * r, dx = rng.range(-2.4, -0.4) * drift, dz = rng.range(0.4, 2.0) * drift, ex = x + dx, ez = z + dz;
      if (nearBlock(x, z) || nearBlock(ex, ez) || nearBlock((x + ex) / 2, (z + ez) / 2)) continue;
      if (Math.abs(ex) > LIMIT || Math.abs(ez) > LIMIT || Math.abs(x) > LIMIT || Math.abs(z) > LIMIT || wet(ex, ez)) continue;
      if (Math.max(z, ez) > deck.z[0] - 1 && Math.min(z, ez) < deck.z[1] + 1 && Math.max(x, ex) > deck.stubX[0] - 1) continue;
      const y0 = ly - ry * Math.sqrt(1 - (r / rxz) * (r / rxz)) - 0.15, fall = (y0 / rate) * rng.range(0.95, 1.3);   // from the crown's underside
      return {
        x, z, y0, y1: 0.14, dx, dz, fall, period: fall + rng.range(gap[0], gap[1]), phase: rng() * 40, fan, on: true,
        turns: rng.range(1.6, 3.2) * rng.sign(), rad: rng.range(0.3, 0.7), s: rng() * 50, size: rng.range(0.9, 1.25), color,
      };
    }
  };
  // Several candidates per leaf: the finished scene decides which paths are really clear of roofs, the rest are never seen.
  const pool = (n, make) => Array.from({ length: n * 4 }, (_, i) => Object.assign(make(i), { want: i % n }));
  const camphor = GROVE.filter((g) => g.kind === 'camphor').flatMap((g) => g.lobes), willow = GROVE.filter((g) => g.kind === 'willow').flatMap((g) => g.lobes), ginkgo = GROVE.filter((g) => g.kind === 'ginkgo').flatMap((g) => g.lobes);
  const GOLD = ['#ffd84f', '#f7c52e', '#ffe27a'];
  const groups = [
    pool(14, (i) => pickLeaf(TREE.lobes, COLORS[i % COLORS.length])),
    pool(5, (i) => pickLeaf(camphor, [P.leafMid, P.leafGold, P.sunWarm][i % 3], { rate: 0.9 })),
    pool(2, (i) => pickLeaf(willow, P.leafGold, { drift: 0.6, rate: 0.7 })),
    // grove.js already rains ginkgo fans under its own crowns. These few are the ones the wind takes out over the ring, on a slower rhythm.
    pool(4, (i) => pickLeaf(ginkgo, GOLD[i % 3], { drift: 2.1, fan: true, rate: 0.72, gap: [18, 40] })),
  ];
  const leaves = groups.flat();
  const endOf = (l) => { const a = l.turns * TAU + l.s; return [l.x + l.dx + Math.cos(a) * l.rad, l.z + l.dz + Math.sin(a) * l.rad]; };
  const PROBES = 7, along = (l, k) => { const u = (k + 1) / (PROBES + 1); return [l.x + l.dx * u, l.z + l.dz * u]; };
  settle.push({
    cols: leaves.flatMap((l) => [endOf(l), ...Array.from({ length: PROBES }, (_, k) => along(l, k))]),
    done(hits) {
      const below = (ys, y) => { for (let n = ys.length - 1; n >= 0; n--) if (ys[n] < y) return ys[n]; return -Infinity; };
      const yAt = (l, k) => lerp(l.y0, l.y1, k / (PROBES + 1));
      leaves.forEach((l, i) => {
        const at = i * (PROBES + 1);
        l.y1 = Math.max(below(hits[at], l.y0 - 0.5), -0.2) + 0.05;
        l.on = l.y1 < 7.4 && !wet(...endOf(l));   // not on another crown: that is a leaf nobody would see land. The survey can't see water.
        // Over each stretch of its path the column must be empty between the heights the leaf passes through there.
        for (let k = 1; k <= PROBES && l.on; k++) {
          const hi = yAt(l, k - 1) + 0.2, lo = Math.max(yAt(l, k + 1) - 0.2, l.y1 + 0.3);
          if (hits[at + k].some((h) => h > lo && h < hi)) l.on = false;
        }
      });
      for (const g of groups) {
        const seen = new Set();
        for (const l of g) { if (l.on && !seen.has(l.want)) seen.add(l.want); else l.on = false; }
      }
    },
  });
  const blade = kit.leaf(0.38, 0.22, 0.3).translate(0, 0, -0.19);
  // A ginkgo fan: short stalk, broad scalloped blade with the notch in the middle.
  const fanShape = new THREE.Shape();
  { const R = 0.27, pts = [[0, 0]]; for (let i = 0; i <= 12; i++) { const a = -1.12 + (i / 12) * 2.24, notch = 1 - 0.3 * Math.exp(-a * a * 90), lip = 1 + 0.035 * Math.sin(i * 2.2); pts.push([Math.sin(a) * R * notch * lip, Math.cos(a) * R * notch * lip]); } fanShape.setFromPoints(pts.map(([x, y]) => new THREE.Vector2(x, y))); }
  const fanBlade = new THREE.ShapeGeometry(fanShape, 1).rotateX(Math.PI / 2).translate(0, 0, 0.1);
  const fan = kit.merge([fanBlade.index ? fanBlade.toNonIndexed() : fanBlade, kit.box(0.014, 0.008, 0.14).translate(0, 0, 0.05).toNonIndexed()]);
  const mat = ctx.toon({ side: THREE.DoubleSide, dapple: false, translucent: 0.8 });
  const plain = groups.slice(0, 3).flat(), gold = groups[3];
  const mesh = dynamicInstanced(ctx, blade, mat, plain.length, 'leaves'), fans = dynamicInstanced(ctx, fan, mat, gold.length, 'ginkgoLeaves');
  const col = new THREE.Color();
  plain.forEach((l, i) => mesh.setColorAt(i, col.set(l.color)));
  gold.forEach((l, i) => fans.setColorAt(i, col.set(l.color)));
  mesh.instanceColor.needsUpdate = true; fans.instanceColor.needsUpdate = true;
  group.add(mesh, fans);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0), m = new THREE.Matrix4(), e = new THREE.Euler(0, 0, 0, 'YXZ'), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
  // Past the fall (lt > l.fall, u held at 1) a leaf lies where it touched down for LIE seconds, the last of them shrinking away.
  const LIE = 2.8, SHRINK = 0.7;   // gap[0] leaves room for this before the next fall starts
  const place = (t, l, target, i) => {
    const lt = (((t + l.phase) % l.period) + l.period) % l.period;
    if (!l.on || lt > l.fall + LIE) { target.setMatrixAt(i, zero); return; }
    const u = Math.min(1, lt / l.fall), a = u * l.turns * TAU + l.s, loose = smooth(1, 0.8, u);   // it settles flat onto y1 over the end of the fall
    const gust = ctx.wind(t, l.x, l.z) * 0.18 * Math.sin(Math.PI * u);
    v.set(l.x + l.dx * u + Math.cos(a) * l.rad + gust, lerp(l.y0, l.y1, u) + 0.12 * Math.sin(a * 2) * loose, l.z + l.dz * u + Math.sin(a) * l.rad);
    e.set(0.65 * Math.cos(a) * loose, -a + 1.2, 0.55 * Math.sin(a * 1.3) * loose); q.setFromEuler(e);
    const f = smooth(0, 0.04, u) * smooth(l.fall + LIE, l.fall + LIE - SHRINK, lt) * l.size;
    target.setMatrixAt(i, m.compose(v, q, s.setScalar(f)));
  };
  updaters.push((t) => {
    for (let i = 0; i < plain.length; i++) place(t, plain[i], mesh, i);
    for (let i = 0; i < gold.length; i++) place(t, gold[i], fans, i);
    mesh.instanceMatrix.needsUpdate = true; fans.instanceMatrix.needsUpdate = true;
  });
}

/* ---------------------------------------------------------------- 6. mist ---------------------------------------------- */

function buildMist(ctx, group) {
  const { THREE, P, shared } = ctx;
  const rng = ctx.seeded('atmos-mist');
  const N = 14, pos = [], uv = [], C = [], Q = [], idx = [], SPAN = ctx.layout.BASE.half / 20;   // authored for ±20: it stays behind and beside whatever the plinth has grown to
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU + rng.range(-0.2, 0.2), r = rng.range(32, 45) * SPAN, y = i % 2 ? rng.range(-7.5, -3.6) : rng.range(-1.5, 9);
    const w = rng.range(18, 32) * Math.sqrt(SPAN), h = w * rng.range(0.28, 0.4), sp = rng.range(0.006, 0.014) * rng.sign(), op = rng.range(0.14, 0.2), s = rng() * 10;
    const base = pos.length / 3;
    for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      pos.push(cx, cy, 0); uv.push(cx * 0.5 + 0.5, cy * 0.5 + 0.5); C.push(a, r, y, sp); Q.push(w, h, op, s);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aC', new THREE.Float32BufferAttribute(C, 4));
  g.setAttribute('aQ', new THREE.Float32BufferAttribute(Q, 4));
  g.setIndex(idx);
  // Blended, but queued with the opaques and ahead of them: painted straight onto the sky, so it can never veil the model.
  const mat = new THREE.ShaderMaterial({
    transparent: false, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    uniforms: { uTime: shared.uTime, uNoise: shared.uNoise, cMist: { value: new THREE.Color('#fbfff6') }, cWarm: { value: new THREE.Color(P.skyLow) } },
    vertexShader: /* glsl */`
      attribute vec4 aC,aQ; uniform float uTime; varying vec2 vUv; varying float vA,vS;
      void main(){
        vUv=uv; vS=aQ.w;
        float a=aC.x+uTime*aC.w;
        vec3 c=vec3(cos(a)*aC.y,aC.z+.5*sin(uTime*.05+aQ.w),sin(a)*aC.y);
        // Stays behind or beside the model: anything drifting to the camera's side of the plinth dissolves.
        float front=length(cameraPosition-c)-length(cameraPosition-vec3(0.,2.,0.));
        vA=aQ.z*smoothstep(-12.,8.,front);
        vec3 R=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]);
        vec3 w=c+R*position.x*aQ.x+vec3(0.,1.,0.)*position.y*aQ.y;
        gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform sampler2D uNoise; uniform vec3 cMist,cWarm; varying vec2 vUv; varying float vA,vS;
      void main(){
        vec2 q=vUv*2.-1.; float d=length(q);
        float n=texture2D(uNoise,vUv*vec2(.5,.22)+vec2(uTime*.0035+vS,vS*.37)).r;
        float a=smoothstep(1.,.15,d)*smoothstep(.22,.62,n+.18*(1.-d));
        if(a*vA<.002) discard;
        gl_FragColor=vec4(mix(cMist,cWarm,.3),a*vA);
      }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'mist'; mesh.frustumCulled = false; mesh.renderOrder = -5;
  group.add(mesh);
}

/**
 * The cool breath of the fall against the wall, between the rim and river.js's own mist puffs (y < -5): a few very faint, wide
 * sheets that hang under the outfall. Drawn ahead of the falling water and cut off below the rim, so it never greys the ground.
 */
function buildSprayHaze(ctx, group) {
  const { THREE, layout, shared } = ctx;
  const rng = ctx.seeded('atmos-haze'), { x: ox, z } = layout.RIVER.outfall, cx = (ox[0] + ox[1]) / 2, DROP = layout.BASE.height;
  const pos = [], uv = [], A = [], B = [], idx = [];
  const N = 6;
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1), c = [cx + rng.range(-1.1, 1.1), lerp(-1.5, -DROP * 0.82, u), z + rng.range(0.7, 1.9)], w = lerp(2.3, 4.2, u) * rng.range(0.9, 1.15), h = lerp(1.2, 2.2, u), base = pos.length / 3;
    for (const [qx, qy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { pos.push(qx, qy, 0); uv.push(qx * 0.5 + 0.5, qy * 0.5 + 0.5); A.push(c[0], c[1], c[2], w); B.push(h, rng.range(0.07, 0.11), rng() * 10, rng.range(0.1, 0.2)); }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aA', new THREE.Float32BufferAttribute(A, 4));
  g.setAttribute('aB', new THREE.Float32BufferAttribute(B, 4));
  g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
    uniforms: { uTime: shared.uTime, uNoise: shared.uNoise, cHaze: { value: new THREE.Color('#e4fbf2') } },
    vertexShader: /* glsl */`
      attribute vec4 aA,aB; uniform float uTime; varying vec2 vUv; varying float vO,vS,vY;
      void main(){
        vUv=uv; vS=aB.z;
        vec3 R=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]);
        vec3 c=aA.xyz+vec3(sin(uTime*aB.w+aB.z)*.22,.12*sin(uTime*.31+aB.z*2.),cos(uTime*aB.w*.8+aB.z)*.12);
        vec3 w=c+R*position.x*aA.w+vec3(0.,1.,0.)*position.y*aB.x;
        vY=w.y; vO=aB.y;
        gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform sampler2D uNoise; uniform vec3 cHaze; varying vec2 vUv; varying float vO,vS,vY;
      void main(){
        vec2 q=vUv*2.-1.; float d=length(q*vec2(1.,1.15));
        float n=texture2D(uNoise,vUv*vec2(.42,.3)+vec2(vS*.13,vS*.07-uTime*.006)).r;
        float a=smoothstep(1.,.25,d)*smoothstep(.2,.6,n+.2*(1.-d))*(1.-smoothstep(-1.5,-.55,vY));
        if(a*vO<.002) discard;
        gl_FragColor=vec4(cHaze,a*vO);
      }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'sprayHaze'; mesh.frustumCulled = false; mesh.renderOrder = 3;
  group.add(mesh);
}
