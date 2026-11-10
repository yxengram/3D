import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SUN_DIR, BASE, HERO_CAM, BUILDING, TREE, TOWN, RAIL, STREET, WRECK, MEADOW, GROVE, CANOPIES, BUILDINGS, buildingBox, WOODS, RING_ZONES, RING_ROADS } from './core/layout.js';
import { P } from './core/palette.js';
import { shared, initShared } from './core/toon.js';
import { bakeGobo } from './core/gobo.js';
import { skyTexture, sunGlow, nightSky } from './core/textures.js';
import { createPost } from './core/post.js';
import { makeCtx } from './core/ctx.js';

// Literal imports keep this bundleable into a single file.
const MODULES = {
  base: () => import('./modules/base.js'),
  ground: () => import('./modules/ground.js'),
  building: () => import('./modules/building.js'),
  interior: () => import('./modules/interior.js'),
  banyan: () => import('./modules/banyan.js'),
  street: () => import('./modules/street.js'),
  wreck: () => import('./modules/wreck.js'),
  water: () => import('./modules/water.js'),
  atmos: () => import('./modules/atmos.js'),
  rail: () => import('./modules/rail.js'),
  town: () => import('./modules/town.js'),
  river: () => import('./modules/river.js'),
  meadow: () => import('./modules/meadow.js'),
  grove: () => import('./modules/grove.js'),
  outskirts: () => import('./modules/outskirts.js'),
  west: () => import('./modules/west.js'),
  north: () => import('./modules/north.js'),
  east: () => import('./modules/east.js'),
  south: () => import('./modules/south.js'),
  woods: () => import('./modules/woods.js'),
  night: () => import('./modules/night.js'), // last: it reads the lamps the others registered
};

const Q = new URLSearchParams(location.search);
const CAMS = { // pos, target. Test/verification viewpoints only; the shipped page starts at hero.
  hero: [HERO_CAM.pos, HERO_CAM.target],
  // the whole 80×80 model; `low` and `lowback` sit below the plinth top, level with its side walls
  front: [[8, 26, 172], [-1, 4, 0]],
  east: [[172, 26, -6], [0, 4, -3]],
  top: [[18, 252, 44], [-1, 0, 0]],
  back: [[-122, 62, -136], [-1, 3, -1]],
  west: [[-172, 30, 8], [0, 4, -3]],
  low: [[100, -3.6, 112], [0, -1.2, 0]],
  lowback: [[-100, -3.6, -108], [0, -1.2, 0]],
  // the original corner
  shop: [[-2.2, 2.2, 9.5], [-3.8, 1.6, -3.5]],
  collapse: [[12, 8.5, 12], [-3.2, 4.2, -3.2]],
  street: [[9.9, 2.3, 12.4], [0, 2.2, 3]],
  pond: [[6.2, 3.6, 12.9], [1.5, 0.2, 9.5]],
  corner: [[14, 7, 14], [6, 2, 4]],
  // the v2 ring
  rail: [[32, 10, 8], [15, 1.5, -3]],
  station: [[26, 7, -22], [14, 2, -9]],
  town: [[-7, 6, 11.5], [-15.5, 3, -2]],
  platform: [[6.5, 6.5, 2.5], [13, 1, -1.5]],
  bathhouse: [[-30, 14, -30], [-15, 4, -14]],
  backlot: [[8, 16, -34], [-4, 2, -15]],
  river: [[-17, 10, 31], [-6, -0.2, 16]],
  waterfall: [[-30, 3, 52], [-14.8, -3.5, 40]],
  playground: [[-6, 8, 26], [-16, 1.5, 13]],
  meadow: [[22, 7, 28], [7, 1, 15]],
  // the v3 ring
  shotengai: [[-20.6, 4.8, 7.2], [-37, 1.8, 3.6]],
  shotengai2: [[-42, 7.5, 1.2], [-24, 2, 5.4]],
  shrine: [[-21, 13, -26], [-33, 4.5, -34]],
  houses: [[5.6, 9.5, -16.5], [5.4, 2, -37]],
  works: [[39, 10, -28], [29, 2.5, -36]],
  farm: [[21, 12, -9], [34.5, 2, -19]],
  paddies: [[47, 13, -2], [33, 0.4, -1.5]],
  school: [[14, 6.5, 33.4], [-1, 2, 37]],
  gas: [[34, 8, 47], [33.5, 1.5, 26.4]],
  level: [[11, 9, 36], [16.8, 0.5, 31]],
  railN: [[25, 7, -22], [16.8, 0.5, -29.5]],
  canalS: [[-5, 10, 31], [-16.5, -0.4, 30]],
  waterfall2: [[-9, -2.5, 58], [-14.8, -3.5, 40]],
  watermill: [[-11.5, 5.5, 21], [-20.5, 1.8, 27.2]],
  ringNE: [[80, 38, -80], [30, 2, -30]],
  ringNW: [[-80, 38, -80], [-30, 2, -30]],
  ringSW: [[-80, 38, 80], [-30, 2, 30]],
  ringSE: [[80, 38, 80], [30, 2, 30]],
};


let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: Q.has('shot') });
} catch (e) { // no WebGL: leave a quiet painted backdrop rather than an unexplained blank page
  document.body.style.background = `linear-gradient(${P.skyTop},${P.skyMid} 60%,${P.skyLow})`;
  throw e;
}
const MAX_PR = 2; let pixelRatio = Math.min(devicePixelRatio, MAX_PR);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
document.body.appendChild(renderer.domElement);

initShared();
const goboT0 = performance.now();
shared.uGobo.value = bakeGobo();
const goboMs = Math.round(performance.now() - goboT0);

const scene = new THREE.Scene();
const sky = skyTexture();
scene.background = sky;
const glow = sunGlow(sky);
scene.add(glow);
glow.material.userData.nightKeep = true;
const stars = nightSky(sky);
scene.add(stars);

// How far the viewer can get: everything else about the far plane follows from these.
const HERO_DIST = Math.hypot(...HERO_CAM.pos.map((c, i) => c - HERO_CAM.target[i]));
const MAX_DIST = HERO_DIST * 2.3, PAN_HALF = BASE.half * 0.9;
const MODEL_R = Math.hypot(BASE.half, BASE.half, 26); // plinth corners plus the banyan's crown
const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 1, MAX_DIST);
camera.layers.enable(1); camera.layers.enable(2);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08;
/** Pull the far plane out to cover a viewer at distance d with the target anywhere in the pan box. Returns d. */
const setReach = (d) => { camera.far = d + PAN_HALF * Math.SQRT2 + MODEL_R; camera.updateProjectionMatrix(); return d; };
controls.maxDistance = setReach(MAX_DIST);
controls.rotateSpeed = 0.7; controls.zoomSpeed = 0.8; controls.panSpeed = 0.7;

// Keep the whole model in frame in narrow windows: hold the horizontal view instead of the vertical one. The sky covers the window.
const fitCamera = () => {
  const aspect = innerWidth / innerHeight, base = Math.tan(THREE.MathUtils.degToRad(15));
  camera.aspect = aspect;
  camera.fov = aspect >= 1.4 ? 30 : Math.min(50, THREE.MathUtils.radToDeg(2 * Math.atan((base * 1.4) / aspect)));
  camera.updateProjectionMatrix();
  const skyAspect = sky.image.width / sky.image.height;
  sky.repeat.set(Math.min(1, aspect / skyAspect), Math.min(1, skyAspect / aspect));
  sky.offset.set((1 - sky.repeat.x) / 2, (1 - sky.repeat.y) / 2);
  sky.updateMatrix();
};
fitCamera();

// The fov cap stops holding the plinth's width on a phone: back off along the view ray instead. Only placement does this: a resize re-places the camera only while nobody has touched it.
const dollyToFit = () => {
  const t = controls.target, d = camera.position.distanceTo(t), halfW = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect * 0.97;
  camera.lookAt(t); camera.updateMatrixWorld();
  let s = 1;
  for (const x of [-BASE.half, BASE.half]) for (const z of [-BASE.half, BASE.half]) for (const y of [0, -BASE.height]) {
    const v = new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse);
    s = Math.max(s, 1 + (Math.abs(v.x) / halfW + v.z) / d);
  }
  camera.position.sub(t).multiplyScalar(s).add(t);
};

// ── Camera limits ─────────────────────────────────────────────────────────────────────────────────────
// OrbitControls always owns the user's ideal pose. Each limit below acts on it without a teleport:
//   floor     stops a downward tilt, and lifts the shown camera for the render only where the plinth passes under it. The orbit never loses elevation it had, so
//             a low orbit rises at a corner and comes back down after it; the slab solid catches what still gets past the rim;
//   pan box   moves camera and target together, so panning stays a translation;
//   solids    slide the camera out along its view ray, for the render only. Input handlers run update() between
//             frames, so camera.position holds the user's pose at all times outside frame()'s render, and the
//             push leaves their zoom distance alone, except when a dolly in or out crosses a solid: then the zoom
//             jumps across it in one frame, and a long hold moves the user's radius in with it. Nothing in the
//             updaters reads the camera's position.
const MIN_DIST = 12, MAX_POLAR = Math.PI * 0.575, FLOOR_Y = 2.0;
const PAN_BOX = new THREE.Box3(new THREE.Vector3(-PAN_HALF, -1, -PAN_HALF), new THREE.Vector3(PAN_HALF, 10, PAN_HALF));
const SKIN = 1.7, LEAF = 0.8; // clearance past the near plane; how far leaves overshoot a canopy lobe
// Where the ray first enters a solid's unpadded body: a number, or Infinity when the ray never touches it (null-free, so a miss compares large).
const bodyEnterBox = (o, d, body) => {
  let t0 = -Infinity, t1 = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (o[i] < body[i][0] || o[i] > body[i][1]) return Infinity; continue; }
    const a = (body[i][0] - o[i]) / d[i], b = (body[i][1] - o[i]) / d[i];
    t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b));
  }
  return t0 <= t1 ? t0 : Infinity;
};
// Does the stretch of the ray from a to b touch this unpadded body? (a === b asks about one point.)
const bodyOnRayBox = (o, d, body, a, b) => {
  let t0 = a, t1 = b;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (o[i] < body[i][0] || o[i] > body[i][1]) return false; continue; }
    const p = (body[i][0] - o[i]) / d[i], q = (body[i][1] - o[i]) / d[i];
    t0 = Math.max(t0, Math.min(p, q)); t1 = Math.min(t1, Math.max(p, q));
  }
  return t0 <= t1;
};
const solidBox = (x, y, z) => {
  const lo = [x[0] - SKIN, y[0] - SKIN, z[0] - SKIN], hi = [x[1] + SKIN, y[1] + SKIN, z[1] + SKIN], body = [x, y, z];
  return Object.assign((o, d, s, chained = false) => { // far exit of the ray o+d*s when the point at s is inside it, or when chained by the rule above clearRadius, else -1
    let e = Infinity, entry = Infinity;
    if (chained) { entry = bodyEnterBox(o, d, body); if (entry >= s && entry !== Infinity) return -1; }
    for (let i = 0; i < 3; i++) {
      const p = o[i] + d[i] * s, inset = chained && entry === Infinity ? CHAIN_INSET : 0;
      if (p <= lo[i] + inset || p >= hi[i] - inset) return -1;
      if (d[i]) e = Math.min(e, ((d[i] > 0 ? hi[i] : lo[i]) - o[i]) / d[i]);
    }
    return e;
  }, { onRay: (o, d, a, b) => bodyOnRayBox(o, d, body, a, b) });
};
const solidLobe = ([cx, cy, cz, rxz, ry]) => {
  const c = [cx, cy, cz], r = [rxz + SKIN + LEAF, ry + SKIN + LEAF, rxz + SKIN + LEAF];
  const onRay = (o, d, a, b) => { // the crown itself, leaves included
    let A = 0, B = 0, Q = 0;
    for (let i = 0; i < 3; i++) { const u = (o[i] - c[i]) / (r[i] - SKIN), v = d[i] / (r[i] - SKIN); A += v * v; B += u * v; Q += u * u; }
    const D = B * B - A * (Q - 1);
    if (D <= 0) return false;
    const w = Math.sqrt(D);
    return (-B + w) / A >= a && (-B - w) / A <= b;
  };
  return Object.assign((o, d, s, chained = false) => {
    let a = 0, b = 0, q = 0, h = 0;
    for (let i = 0; i < 3; i++) { const u = (o[i] - c[i]) / r[i], v = d[i] / r[i]; a += v * v; b += u * v; q += u * u; }
    let inset = 0;
    if (chained) { // does the ray enter the crown itself (leaves included), and where? Past the camera and it is behind the lens, so it costs nothing.
      let A = 0, B = 0, Q = 0;
      for (let i = 0; i < 3; i++) { const u = (o[i] - c[i]) / (r[i] - SKIN), v = d[i] / (r[i] - SKIN); A += v * v; B += u * v; Q += u * u; }
      const D = B * B - A * (Q - 1);
      if (D > 0) { const entry = (-B - Math.sqrt(D)) / A; if (entry >= s) return -1; } else inset = CHAIN_INSET;
    }
    for (let i = 0; i < 3; i++) { const p = (o[i] + d[i] * s - c[i]) / (r[i] - inset); h += p * p; }
    return h >= 1 ? -1 : (-b + Math.sqrt(b * b - a * (q - 1))) / a;
  }, { onRay });
};
// Tops stop SLAB_GAP under the resting floor: a shallow ray leaves the slab far away, so the orbit must not graze it.
const SLAB_GAP = 0.5, slab = solidBox([-BASE.half, BASE.half], [-BASE.height, FLOOR_Y - SKIN - SLAB_GAP], [-BASE.half, BASE.half]);
const post = ({ x, z }, r, top) => solidBox([x - r, x + r], [-BASE.height, top], [z - r, z + r]);
const zone = ({ x, z }, top, pad = 0) => solidBox([x[0] - pad, x[1] + pad], [-BASE.height, top], [z[0] - pad, z[1] + pad]);
const BRIDGE = WRECK.footbridge, VINES = 1; // what hangs off the building's walls
const LOT = { w: TOWN.backLot.x[0] + 0.14, n: TOWN.backLot.z[0] + 0.14, e: 1.36, s: -13.35, wallT: 0.16 }; // town.js's wall lines
const lotWall = (x, z, top) => solidBox([x[0] - LOT.wallT, x[1] + LOT.wallT], [-BASE.height, top], [z[0] - LOT.wallT, z[1] + LOT.wallT]);
// Eaves past the wall line, as a footprint pad: the overhangs the housekit specs give (es, ef, eb), and what the rendered thatch measures; a cottage's timber lean-tos run 1.5 past the wall.
const EAVE = { house: 0.6, cottage: 1.5, gasstation: 0.1, firetower: 0.1, watertower: 0.1, workshop: 0.2, warehouse: 0.2 };
// The shotengai's arcade spans the carriageway and both sidewalks from the road's centre line. Its roof runs y 5.4 at the eaves to 6.9 at the ridge. The solid stops short of the
// eaves' underside, so a viewer can still stand under the arcade (padded, it starts at y 5.0) and look down the street, while a pose in or just over the roof is pushed clear.
const ARCADE = (() => { const r = RING_ROADS.find((q) => q.id === 'shotengai'), xs = r.pts.map((p) => p[0]), zc = r.pts[0][1]; return { x: [Math.min(...xs), Math.max(...xs)], y: [6.7, 6.95], z: [zc - r.w / 2 - r.walk[0], zc + r.w / 2 + r.walk[1]] }; })();
const SOLIDS = [
  slab,
  zone(BUILDING, 12, VINES), post(TREE, TREE.trunkR + 0.6, TREE.crownBaseY + 4),
  zone(TOWN.row, TOWN.row.maxH), zone(TOWN.bathhouse, TOWN.bathhouse.maxH), post(TOWN.chimney, 0.8, TOWN.chimney.height),
  zone(MEADOW.greenhouse, MEADOW.greenhouse.maxH), post(MEADOW.phoneBox, 0.7, 2.6), post(STREET.kiosk, 1.4, 3),
  ...RAIL.train.cars.map((c) => solidBox([RAIL.tracks[0] - 1.5, RAIL.tracks[0] + 1.5], [-BASE.height, RAIL.maxHeight + (c.tilt ? 1.4 : 0)], c.z)), // the derailed car has a roof garden
  solidBox([WRECK.car.x - 1.3, WRECK.car.x + 1.3], [-BASE.height, 1.9], [WRECK.car.z - 2.4, WRECK.car.z + 2.4]),
  solidBox([...BRIDGE.x].sort((a, b) => a - b), [BRIDGE.deckY - BRIDGE.deckT, BRIDGE.deckY + 1.1], BRIDGE.z),
  zone(BRIDGE.stairs, BRIDGE.deckY), solidBox([BRIDGE.x[0] - 1, BRIDGE.x[0]], [-BASE.height, BRIDGE.deckY], [BRIDGE.z[0], -3.4]), // west and east flights
  post(BRIDGE.pier, 0.7, BRIDGE.deckY), post(BRIDGE.pier2, 0.7, BRIDGE.deckY),
  ...GROVE.map((t) => post(t, t.trunkR + 0.2, t.lobes[0][1])),
  ...CANOPIES.map(solidLobe),
  zone(MEADOW.sunflowers, 2.8),
  lotWall([LOT.w, LOT.e], [LOT.n, LOT.n], 1.4), lotWall([LOT.w, LOT.e], [LOT.s, LOT.s], 1.35), lotWall([LOT.e, LOT.e], [LOT.n, LOT.s], 1.4), lotWall([LOT.w, LOT.w], [LOT.n, LOT.s], 1.15),
  solidBox([-0.7, 1.55], [-BASE.height, 3], [-19.05, -15.95]), // the vending-machine shed at the east end of the lot
  // v3 ring: every entry comes straight from the layout, so a moved building moves its solid. WOODS crowns are already in CANOPIES.
  ...BUILDINGS.map((b) => zone(buildingBox(b, EAVE[b.kind] ?? EAVE.house), b.elev + b.h)),
  ...WOODS.map((t) => post(t, t.trunkR + 0.2, t.lobes[0][1])),
  zone(RING_ZONES.shrineHill, RING_ZONES.shrineHill.y),
  zone(RING_ZONES.orchard, 3), // the pear trellis stands at about y 2.9
  zone(RING_ZONES.bamboo, 11), // the culms' tips reach y 11; the grove has no crowns in CANOPIES for the camera to stop at
  solidBox(ARCADE.x, ARCADE.y, ARCADE.z),
];
// A solid's skin is clearance for the near plane, and the camera looks back along the ray, so a solid whose body lies wholly behind it costs nothing. Chaining on those skins carries a
// shallow ray along a whole row of neighbours, so past the first exit such a solid is ignored, one the ray only grazes must hold the camera properly inside to count, and the chain stops short of a far one.
const CHAIN_INSET = 1.1, CHAIN_REACH = 14;
/** Smallest radius >= s along the ray from o through d that sits clear of the solids the pose is in, and of any it would then be inside. */
const PUSH_SPEED = (r) => 20 + r * 0.6; // units a second
const bodyOnRay = (o, d, a, b) => SOLIDS.some((solid) => solid.onRay(o, d, a, b));
// How far the user may dolly past a held camera before it jumps across, as a fraction of the shown radius: about five wheel notches at any distance.
const DEAD_ZOOM = 0.2;
const clearRadius = (o, d, s) => {
  let c = s;
  for (const exit of SOLIDS) c = Math.max(c, exit(o, d, s));
  const reach = c + CHAIN_REACH;
  for (let moved = c > s, pass = 0; moved && pass < 12; pass++) {
    moved = false;
    for (const exit of SOLIDS) { const e = exit(o, d, c, true); if (e > c && e < reach) { c = e; moved = true; } }
  }
  return c;
};
/** Critically damped follow: eases in and out, stable at any dt, holds still at dt 0. */
const follow = (cur, want, vel, tau, dt) => {
  const w = 2 / tau, x = w * dt, k = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x), c = cur - want, j = (vel.v + w * c) * dt;
  vel.v = (vel.v - w * j) * k;
  return want + (c + j) * k;
};

// Verification viewpoints land exactly where they say: limits stay off for ?shot, and after ?cam= or setCam until someone touches the controls.
const SHOT = Q.has('shot');
let held = false, push = 0, lift = 0, lastPhi = 0, release = 0, panSlack = 0, minDist0 = MIN_DIST, userR = 0, touched = false;
const pushVel = { v: 0 }, liftVel = { v: 0 }, ray = new THREE.Vector3(), offset = new THREE.Vector3(), sph = new THREE.Spherical(), rayA = [0, 0, 0], tgtA = [0, 0, 0];
const userPos = camera.position.clone(), shownPos = camera.position.clone();
const boxed = new THREE.Vector3(), clamped = new THREE.Vector3(), bounds = new THREE.Box3();
const hold = () => { held = true; push = 0; pushVel.v = 0; lift = 0; liftVel.v = 0; controls.minDistance = 0; controls.maxDistance = Infinity; controls.maxPolarAngle = Math.PI; };
const engage = () => { // ease from wherever a verification view left the camera
  held = false; lift = 0; liftVel.v = 0; lastPhi = 0; release = 1; userR = camera.position.distanceTo(controls.target);
  controls.maxDistance = setReach(Math.max(MAX_DIST, userR));
  panSlack = PAN_BOX.distanceToPoint(controls.target) * 1.01;
  minDist0 = Math.min(MIN_DIST, camera.position.distanceTo(controls.target));
};
controls.addEventListener('start', () => { touched = true; if (held && !SHOT) engage(); });

function steerCamera(dt) {
  const target = controls.target, pos = camera.position;
  if (held) { controls.update(); userPos.copy(pos); return; }

  release = Math.max(0, release - dt / 0.6);
  controls.minDistance = THREE.MathUtils.lerp(MIN_DIST, minDist0, release);
  controls.update();

  // Pan box: same delta on camera and target, so the view translates and never pivots.
  bounds.copy(PAN_BOX).expandByScalar(panSlack * release).clampPoint(target, clamped);
  boxed.subVectors(target, clamped);
  target.sub(boxed); pos.sub(boxed);

  // A tilt up while lifted starts from where the camera visibly is, with no dead drag.
  offset.subVectors(pos, target); sph.setFromVector3(offset);
  if (lift > 0 && sph.phi < lastPhi - 1e-4) { sph.phi = Math.max(1e-3, sph.phi - lift); lift = 0; liftVel.v = 0; offset.setFromSpherical(sph); pos.copy(target).add(offset); }
  lastPhi = sph.phi;
  let r = sph.radius;

  // Floor: over the plinth, slab and skin included, the shown camera stops FLOOR_Y up; past that the limit relaxes to the free sky below it.
  // The limit only stops a downward tilt, and never sits tighter than the pose, so an orbit keeps its elevation. Where the pose is under the limit the shown camera rises to it, for this
  // frame only. That lift starts at once at the floor and only eases a pose well under it (in low past the rim).
  const edge = Math.max(Math.abs(pos.x), Math.abs(pos.z)) - BASE.half, over = 1 - THREE.MathUtils.smoothstep(edge, SKIN, 9);
  const floorPhi = Math.acos(THREE.MathUtils.clamp((FLOOR_Y - target.y) / (r + push), -1, 1));
  const limit = THREE.MathUtils.lerp(MAX_POLAR, Math.min(MAX_POLAR, floorPhi), over), wantLift = Math.max(0, sph.phi - limit);
  controls.maxPolarAngle = Math.max(limit, sph.phi);
  if (wantLift > lift) {
    const under = (wantLift - lift) * (r + push), tau = 0.01 + 0.13 * THREE.MathUtils.smoothstep(under, 0.3, 1.5);
    lift = Math.min(follow(lift, wantLift, liftVel, tau, dt), wantLift);
  } else lift = Math.max(0, follow(lift, wantLift, liftVel, 0.12, dt));
  ray.setFromSphericalCoords(1, sph.phi - lift, sph.theta);

  if (push > 0 && r > userR * 1.0001) { // dollying out while pushed starts from where the camera visibly is, with no dead zoom
    const k = (userR + push) / userR; offset.multiplyScalar(k); r *= k; push = 0; pushVel.v = 0;
    pos.copy(target).add(offset);
  }
  ray.toArray(rayA); target.toArray(tgtA);
  const dolly = Math.abs(r - userR) > userR * 1e-4;
  let want = clearRadius(tgtA, rayA, r) - r;
  const keep = push + userR - r; // keep: the push that leaves the shown radius where it was
  if (keep > push && want > push) { // an inward step into a solid goes straight into the push, so the view stops rather than bounces
    if (want <= keep) { push = want; pushVel.v = 0; } else push = keep;
  }
  // A dolly in that the solids are holding back: after DEAD_ZOOM of it, move the user's own radius in to the next place the camera can stand, so the zoom comes back to life.
  // Nothing about the user's pose is lost that they did not ask for: they were heading that way, and a dolly out starts from wherever the camera visibly is.
  if (r < userR * 0.9999 && r < (r + push) * (1 - DEAD_ZOOM) && bodyOnRay(tgtA, rayA, r, r + push)) {
    const shown = r + push, stop = controls.minDistance;
    for (let s = r; s >= stop; s -= Math.max(0.5, s * 0.02)) {
      const land = clearRadius(tgtA, rayA, s);
      if (land < shown - 0.5 && bodyOnRay(tgtA, rayA, land, shown) && !bodyOnRay(tgtA, rayA, land, land)) {
        offset.multiplyScalar(s / r); pos.copy(target).add(offset);
        r = s; push = want = land - s; pushVel.v = 0;
        break;
      }
    }
  }
  // A dolly never carries the push through a body: where the way from here to the wanted radius crosses one, it goes across in one frame.
  // A wheel-in that makes the push rise keeps the speed cap, and orbits and pans are left to the ease below: there want can fall and rise from frame to frame, and a cut would be a whip.
  if (dolly && (want < push || r > userR) && Math.abs(want - push) > 1e-3 && bodyOnRay(tgtA, rayA, Math.min(r + want, r + push), Math.max(r + want, r + push)) && !bodyOnRay(tgtA, rayA, r + want, r + want)) { push = want; pushVel.v = 0; }
  // The push may ease in fast, but not faster than this: a wanted value that leaps never becomes a leap on screen.
  const rising = want > push, maxStep = PUSH_SPEED(r) * dt;
  let next = Math.max(0, follow(push, want, pushVel, rising ? 0.1 : 0.32, dt));
  if (next - push > maxStep) { next = push + maxStep; pushVel.v = PUSH_SPEED(r); }
  push = next;
  userR = r; userPos.copy(pos);
  pos.copy(target).addScaledVector(ray, r + push);
  if (lift > 0) camera.lookAt(target);
}

// From far away the near plane can follow the model out, which is what keeps a 24-bit depth buffer precise at 2× hero. Anywhere over the plinth it stays at 1,
// so close views are untouched. The box leaves room for birds and spray; 0.6 keeps the plane in front of the box's corners at the frame's edge.
const NEAR_BOX = new THREE.Box3(new THREE.Vector3(-BASE.half - 14, -BASE.height - 4, -BASE.half - 14), new THREE.Vector3(BASE.half + 14, 46, BASE.half + 14));
const fitNear = () => { const n = Math.max(1, NEAR_BOX.distanceToPoint(camera.position) * 0.6); if (n !== camera.near) { camera.near = n; camera.updateProjectionMatrix(); } };

const aim = (name) => {
  const [p, t] = CAMS[name] || CAMS.hero;
  camera.position.set(...p); controls.target.set(...t);
  if (!CAMS[name] || name === 'hero') dollyToFit();
  const reach = setReach(Math.max(MAX_DIST, camera.position.distanceTo(controls.target) * 1.05)); // a very narrow window fits from further out than MAX_DIST
  controls.maxDistance = held ? Infinity : reach;
  controls.update();
};
const setCam = (name) => { hold(); aim(name); };
if (SHOT || Q.has('cam')) setCam(Q.get('cam') || 'hero');
else { controls.minDistance = MIN_DIST; controls.maxPolarAngle = MAX_POLAR; aim('hero'); }

// Light rig: warm sun + cool sky fill. Sun intensity ≈ π → albedo at full light.
const sun = new THREE.DirectionalLight(P.sunPale, 2.45);

// The sun's frustum is fitted around SHADOW_BOUNDS, the world box that casts or receives shadow. It is the only thing to edit when the model's extents change:
// the sun's position, the map's half-width, near and far all follow. `node tools/shadow-fit.mjs` prints the box the finished scene's vertices really need.
// Measured with the finished ring: the real vertices reach y -9 to 21.9 and past ±40.6 only with hanging roots and vines, all of which the rolled square still holds, with about 1.5 to spare.
const SHADOW_BOUNDS = { xz: BASE.half + 0.3, y: [-BASE.height - 0.6, Math.max(...CANOPIES.map(([, y, , , ry]) => y + ry)) - 0.2] };
// Measured with tools/gpumem.mjs at 2880×1800 with the ring still empty: 1166 MB at 6144, 1294 MB at 8192. The ring's atlas and geometry are projected at about 210 MB more,
// so 8192 would land near 1.5 GB against the 1.4 GB budget and 6144 near 1.38 GB. With the rolled box a texel is 0.0154 units; v2's was 0.0123.
const SHADOW_RES = Math.min(6144, renderer.capabilities.maxTextureSize);
const fitShadow = ({ xz, y: [lo, hi] }) => {
  const centre = new THREE.Vector3(0, (lo + hi) / 2, 0), toSun = new THREE.Vector3(...SUN_DIR), corners = [];
  for (const x of [-xz, xz]) for (const z of [-xz, xz]) for (const y of [lo, hi]) corners.push(new THREE.Vector3(x, y, z).sub(centre));
  const m = new THREE.Matrix4().lookAt(toSun, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
  const X = new THREE.Vector3().setFromMatrixColumn(m, 0), Y = new THREE.Vector3().setFromMatrixColumn(m, 1);
  // The sun's azimuth runs along the plinth's diagonal, so an upright map holds it as a diamond. Rolling the map about the sun's axis wastes far less of it.
  let best = { half: Infinity };
  for (let deg = 0; deg < 90; deg++) {
    const c = Math.cos(THREE.MathUtils.degToRad(deg)), s = Math.sin(THREE.MathUtils.degToRad(deg));
    const half = Math.max(...corners.map((p) => Math.max(Math.abs(p.dot(X) * c + p.dot(Y) * s), Math.abs(p.dot(Y) * c - p.dot(X) * s))));
    if (half < best.half) best = { half, up: Y.clone().multiplyScalar(c).addScaledVector(X, -s) };
  }
  const reach = Math.max(...corners.map((p) => Math.abs(p.dot(toSun))));
  return { centre, toSun, up: best.up, half: best.half, dist: reach + 8, near: 8, far: 2 * reach + 8 };
};
const SHADOW = fitShadow(SHADOW_BOUNDS);
sun.position.copy(SHADOW.centre).addScaledVector(SHADOW.toSun, SHADOW.dist);
sun.target.position.copy(SHADOW.centre);
sun.castShadow = true;
sun.shadow.camera.up.copy(SHADOW.up);
sun.shadow.mapSize.set(SHADOW_RES, SHADOW_RES);
Object.assign(sun.shadow.camera, { left: -SHADOW.half, right: SHADOW.half, top: SHADOW.half, bottom: -SHADOW.half, near: SHADOW.near, far: SHADOW.far });
sun.shadow.camera.updateProjectionMatrix(); // three only does this when it creates the map itself, and the map is made below
sun.shadow.bias = -0.046 / (SHADOW.far - SHADOW.near); sun.shadow.normalBias = 0.035; sun.shadow.radius = 1.2; // bias is in depth-range units: 0.046 world units
// three's default target pairs the depth map with a full RGBA8 colour buffer nothing ever reads. One channel saves 3 bytes a texel, about 200 MB at 8192.
sun.shadow.map = new THREE.WebGLRenderTarget(SHADOW_RES, SHADOW_RES, { format: THREE.RedFormat, type: THREE.UnsignedByteType });
sun.shadow.map.texture.name = 'sun.shadowColor';
sun.shadow.map.depthTexture = Object.assign(new THREE.DepthTexture(SHADOW_RES, SHADOW_RES, THREE.FloatType), { name: 'sun.shadowMap', format: THREE.DepthFormat, compareFunction: THREE.LessEqualCompare, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight('#b6ecf2', '#7fb4b4', 1.5);
scene.add(hemi);

const updaters = [];
const only = Q.get('only')?.split(',');
const stats = { modules: {}, errors: [], loadMs: { gobo: goboMs, modules: {} } };
// Imports may race; builds may not. They share caches (textures, materials, shader programs), so they run one at a time in MODULES order.
const names = Object.keys(MODULES).filter((k) => !only || only.includes(k));
const loadT0 = performance.now();
const imported = await Promise.all(names.map(async (name) => {
  const t0 = performance.now();
  try { return { mod: await MODULES[name](), ms: performance.now() - t0 }; } catch (error) { return { error, ms: performance.now() - t0 }; }
}));
stats.loadMs.importAll = Math.round(performance.now() - loadT0);
for (const [i, name] of names.entries()) {
  const t0 = performance.now();
  try {
    if (imported[i].error) throw imported[i].error;
    const res = await imported[i].mod.build(makeCtx(name, { scene, camera, renderer }));
    if (res?.group) scene.add(res.group);
    if (res?.update) updaters.push({ name, update: res.update });
    stats.modules[name] = 'ok';
  } catch (e) {
    console.error(`module ${name} failed:`, e); stats.errors.push(`${name}: ${e.message}`); stats.modules[name] = 'FAILED';
  }
  stats.loadMs.modules[name] = { import: Math.round(imported[i].ms), build: Math.round(performance.now() - t0) };
}
stats.loadMs.buildAll = Math.round(performance.now() - loadT0 - stats.loadMs.importAll);

// Lights must stay in the render list during the layered ink passes, or every material recompiles per frame.
scene.traverse((o) => { if (o.isLight) o.layers.enableAll(); });

// ── Night ─────────────────────────────────────────────────────────────────────────────────────────────
// One number, 0 by day and 1 at night, eased over a few seconds. The moon stands where the sun does, so the baked shadow map and the leaf dapples serve both.
// Lit materials follow the two lights; unlit ones (water, mist, shafts, spray) are multiplied by shared.uUnlit; the bounce-light emissives and the backlit leaf glow by uEmis and uBack.
// No UI: N, or a double click / double tap, switches; ?night starts there.
const DAY = { sun: sun.color.clone(), sunI: sun.intensity, sky: hemi.color.clone(), ground: hemi.groundColor.clone(), hemiI: hemi.intensity };
const DUSK = { sun: new THREE.Color('#ff9d5c'), sky: new THREE.Color('#8f8fd0'), ground: new THREE.Color('#6a6f9c') };
const NIGHT = { sun: new THREE.Color('#a9c4ff'), sunI: 1.18, sky: new THREE.Color('#3857a8'), ground: new THREE.Color('#1c3170'), hemiI: 1.08, emis: [0.2, 0.28, 0.48], back: [0.1, 0.17, 0.34], unlit: [0.2, 0.3, 0.48] };
const NIGHT_SECONDS = 2.8, lerp3 = (v, to, e) => v.set(1 + (to[0] - 1) * e, 1 + (to[1] - 1) * e, 1 + (to[2] - 1) * e);
const via = (c, a, mid, b, e) => (e < 0.5 ? c.lerpColors(a, mid, e * 2 * 0.55) : c.lerpColors(a, mid, 0.55).lerp(b, e * 2 - 1)); // through a brief dusk
let nightTarget = Q.has('night') && Q.get('night') !== '0' ? 1 : 0, nightRaw = -1, nightE = 0;
let composer = null;
const localLights = [];
scene.traverse((o) => { if (o.isPointLight || o.isSpotLight) localLights.push({ light: o, base: o.intensity }); });
const applyNight = (raw) => {
  nightRaw = raw; const e = nightE = raw * raw * (3 - 2 * raw);
  via(sun.color, DAY.sun, DUSK.sun, NIGHT.sun, e); sun.intensity = THREE.MathUtils.lerp(DAY.sunI, NIGHT.sunI, e);
  via(hemi.color, DAY.sky, DUSK.sky, NIGHT.sky, e); via(hemi.groundColor, DAY.ground, DUSK.ground, NIGHT.ground, e); hemi.intensity = THREE.MathUtils.lerp(DAY.hemiI, NIGHT.hemiI, e);
  shared.uNight.value = e; lerp3(shared.uEmis.value, NIGHT.emis, e); lerp3(shared.uBack.value, NIGHT.back, e); lerp3(shared.uUnlit.value, NIGHT.unlit, e);
  for (const l of localLights) l.light.intensity = l.base * (1 - 0.62 * e); // the rooms' warm fill is daylight bounced indoors; a little of it stays
  composer?.setNight(e);
};
const setNight = (on, instant = false) => { nightTarget = on ? 1 : 0; if (instant) applyNight(nightTarget); };
const toggleNight = () => { nightTarget = 1 - nightTarget; };
addEventListener('keydown', (e) => { if ((e.key === 'n' || e.key === 'N') && !e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat) toggleNight(); });
{ // two quick taps in one place, with no drag between them; a pinch or an orbit never counts
  const el = renderer.domElement; let downAt = 0, downX = 0, downY = 0, lastTap = -1e9, lastX = 0, lastY = 0, fingers = 0;
  el.addEventListener('pointerdown', (e) => { fingers++; downAt = e.timeStamp; downX = e.clientX; downY = e.clientY; if (fingers > 1) lastTap = -1e9; });
  el.addEventListener('pointercancel', () => { fingers = Math.max(0, fingers - 1); lastTap = -1e9; });
  el.addEventListener('pointerup', (e) => {
    fingers = Math.max(0, fingers - 1);
    if ((e.pointerType === 'mouse' && e.button !== 0) || e.timeStamp - downAt > 260 || Math.hypot(e.clientX - downX, e.clientY - downY) > 8) { lastTap = -1e9; return; }
    if (e.timeStamp - lastTap < 400 && Math.hypot(e.clientX - lastX, e.clientY - lastY) < 36) { lastTap = -1e9; toggleNight(); } else { lastTap = e.timeStamp; lastX = e.clientX; lastY = e.clientY; }
  });
}
// Every unlit material takes the night tint at the very end of its fragment shader. Night's own lights (userData.nightKeep) and depth-only helpers are left alone.
{
  const done = new Set(), END = /}\s*$/, tint = '  gl_FragColor.rgb*=uUnlit;\n}', gone = '  gl_FragColor.rgb*=uUnlit*(1.-uNight);\n}'; // sunlit dust has no business in the dark
  scene.traverse((o) => {
    for (const m of [].concat(o.material || [])) {
      if (done.has(m)) continue; done.add(m);
      if (m.userData.nightKeep || m.colorWrite === false) continue;
      if (m.isShaderMaterial && !m.isRawShaderMaterial) {
        if (!m.fragmentShader.includes('gl_FragColor') || m.fragmentShader.includes('uUnlit')) continue;
        m.uniforms.uUnlit = shared.uUnlit; m.uniforms.uNight = shared.uNight;
        m.fragmentShader = m.fragmentShader.replace(/void\s+main\s*\(/, 'uniform vec3 uUnlit; uniform float uNight;\nvoid main(').replace(END, o.name === 'dust' ? gone : tint);
        m.needsUpdate = true;
      } else if (m.isMeshBasicMaterial || m.isSpriteMaterial || m.isPointsMaterial || m.isLineBasicMaterial) {
        const before = m.onBeforeCompile, key = m.customProgramCacheKey();
        m.onBeforeCompile = (sh, r) => {
          before.call(m, sh, r); sh.uniforms.uUnlit = shared.uUnlit;
          sh.fragmentShader = sh.fragmentShader.replace(/void\s+main\s*\(/, 'uniform vec3 uUnlit;\nvoid main(').replace(END, tint);
        };
        m.customProgramCacheKey = () => `${key}|unlit|${before.toString()}`;
        m.needsUpdate = true;
      }
    }
  });
}

composer = createPost(renderer, scene, camera);
applyNight(nightTarget);
const applySize = () => {
  renderer.setPixelRatio(pixelRatio); composer.setPixelRatio(pixelRatio);
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
};
// A phone turned on its side: the pose was fitted to the old shape. Re-place it (idempotent, so a resize that fires repeatedly lands once), but never after someone has moved the camera.
let placedAspect = camera.aspect;
addEventListener('resize', () => {
  fitCamera(); applySize();
  if (!held && !touched && Math.abs(camera.aspect / placedAspect - 1) > 0.02) { placedAspect = camera.aspect; aim('hero'); }
});
renderer.domElement.addEventListener('webglcontextrestored', () => { renderer.shadowMap.needsUpdate = true; });

// Shadows are effectively static: bake once (moving things use gobo dapples, not the shadow map).
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;

// Slow GPU: quietly trade resolution for smoothness. Once the rate recovers step back up, and stop trying if that costs another drop.
const TOP_PR = pixelRatio;
let span0 = performance.now(), spanN = 0, calm = 0, steppedUp = false, stayDown = false, queuedPR = 0;
function adaptResolution(now, gap) {
  if (gap > 500) { span0 = now; spanN = 0; calm = 0; return; } // a hidden tab or a load hitch says nothing about the GPU
  spanN++;
  const span = (now - span0) / 1000;
  if (span < 4) return;
  const fps = spanN / span;
  spanN = 0;
  if (fps < 32 && pixelRatio > 1) {
    queuedPR = Math.max(1, pixelRatio - 0.5); calm = 0; stayDown = steppedUp;
  } else if (fps > 55 && pixelRatio < TOP_PR && !stayDown) {
    if (++calm === 2) { queuedPR = Math.min(TOP_PR, pixelRatio + 0.5); calm = 0; steppedUp = true; }
  } else calm = 0;
  span0 = performance.now();
}

let last = performance.now();
let frozen = Q.has('t') ? parseFloat(Q.get('t')) : null, t = frozen ?? 0;
function frame(stepDt) {
  const now = performance.now(), gap = now - last, dt = Math.min(gap / 1000, 0.05); last = now;
  // Resizing the canvas blanks it, so a step in resolution happens here, in the same task as the frame that repaints it.
  if (queuedPR) { pixelRatio = queuedPR; queuedPR = 0; applySize(); }
  t = frozen ?? t + dt;
  shared.uTime.value = t;
  for (const u of updaters) { try { u.update(t, dt); } catch (e) { console.error(u.name, e); updaters.splice(updaters.indexOf(u), 1); } }
  if (nightRaw !== nightTarget) applyNight(nightTarget > nightRaw ? Math.min(nightTarget, nightRaw + dt / NIGHT_SECONDS) : Math.max(nightTarget, nightRaw - dt / NIGHT_SECONDS));
  steerCamera(stepDt ?? dt);
  shownPos.copy(camera.position);
  fitNear();
  glow.aim(camera); glow.material.uniforms.uI.value *= 1 - nightE;
  stars.aim(camera, nightE, t, renderer.domElement.height);
  composer.render(dt);
  camera.position.copy(userPos);
  if (frozen === null) adaptResolution(now, gap);
}
renderer.setAnimationLoop(() => frame());

// Verification hook (no visible UI). Not used by the page itself.
// constrain(true) runs the normal camera limits, even under ?shot; step(dt) then advances them by dt.
// With the limits on, camera.position reads the user's pose; shown is the pose the frame was drawn from.
window.__diorama = { scene, camera, controls, renderer, stats, sun, setNight, toggleNight, night: () => nightE, shadow: SHADOW, shown: shownPos, setCam, CAMS, THREE, constrain: (on) => { if (on) engage(); else hold(); }, freeze: (v) => { frozen = v; }, step: (dt, n = 1) => { for (let i = 0; i < n; i++) { const f = frozen; frozen = (f ?? t) + dt; frame(dt); } } };
requestAnimationFrame(() => requestAnimationFrame(() => { window.__ready = true; }));
