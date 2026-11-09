import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SUN_DIR, BASE, HERO_CAM, BUILDING, TREE, TOWN, RAIL, STREET, WRECK, MEADOW, GROVE, CANOPIES } from './core/layout.js';
import { P } from './core/palette.js';
import { shared, initShared } from './core/toon.js';
import { bakeGobo } from './core/gobo.js';
import { skyTexture, sunGlow } from './core/textures.js';
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
};

const Q = new URLSearchParams(location.search);
const CAMS = { // pos, target. Test/verification viewpoints only; the shipped page starts at hero.
  hero: [HERO_CAM.pos, HERO_CAM.target],
  front: [[4, 12, 82], [-1, 7, 0]],
  east: [[82, 13, -3], [0, 7, -3]],
  top: [[10, 118, 24], [-1, 4, 0]],
  back: [[-58, 32, -66], [-1, 6, -1]],
  west: [[-80, 18, 6], [0, 6, -3]],
  low: [[46, -2.2, 52], [0, 0.2, 0]],
  lowback: [[-46, -2.2, -50], [0, 0.2, 0]],
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
  waterfall: [[-8, -1.5, 36], [-11, -1.5, 20]],
  playground: [[-6, 8, 26], [-16, 1.5, 13]],
  meadow: [[22, 7, 28], [7, 1, 15]],
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
shared.uGobo.value = bakeGobo();

const scene = new THREE.Scene();
const sky = skyTexture();
scene.background = sky;
const glow = sunGlow(sky);
scene.add(glow);

const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 1, 400);
camera.layers.enable(1); camera.layers.enable(2);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.maxDistance = 190;
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

// The fov cap stops holding the plinth's width on a phone: back off along the view ray instead. Only placement does this, never a resize.
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
//   floor     tightens maxPolarAngle, so the orbit itself stays above the plinth; the slab solid catches what still gets past the rim;
//   pan box   moves camera and target together, so panning stays a translation;
//   solids    slide the camera out along its view ray, for the render only. Input handlers run update() between
//             frames, so camera.position holds the user's pose at all times outside frame()'s render, and the
//             push never eats their zoom distance. Nothing in the updaters reads the camera's position.
const MIN_DIST = 12, MAX_POLAR = Math.PI * 0.62, FLOOR_Y = 2.0;
const PAN_BOX = new THREE.Box3(new THREE.Vector3(-16, -1, -16), new THREE.Vector3(16, 10, 16));
const SKIN = 1.7, LEAF = 0.8; // clearance past the near plane; how far leaves overshoot a canopy lobe
const solidBox = (x, y, z) => {
  const lo = [x[0] - SKIN, y[0] - SKIN, z[0] - SKIN], hi = [x[1] + SKIN, y[1] + SKIN, z[1] + SKIN];
  return (o, d, s) => { // far exit of the ray o+d*s when the point at s is inside, else -1
    let e = Infinity;
    for (let i = 0; i < 3; i++) {
      const p = o[i] + d[i] * s;
      if (p <= lo[i] || p >= hi[i]) return -1;
      if (d[i]) e = Math.min(e, ((d[i] > 0 ? hi[i] : lo[i]) - o[i]) / d[i]);
    }
    return e;
  };
};
const solidLobe = ([cx, cy, cz, rxz, ry]) => {
  const c = [cx, cy, cz], r = [rxz + SKIN + LEAF, ry + SKIN + LEAF, rxz + SKIN + LEAF];
  return (o, d, s) => {
    let a = 0, b = 0, q = 0;
    for (let i = 0; i < 3; i++) { const u = (o[i] - c[i]) / r[i], v = d[i] / r[i]; a += v * v; b += u * v; q += u * u; }
    return a * s * s + 2 * b * s + q >= 1 ? -1 : (-b + Math.sqrt(b * b - a * (q - 1))) / a;
  };
};
// Tops stop SLAB_GAP under the resting floor: a shallow ray leaves the slab far away, so the orbit must not graze it.
const SLAB_GAP = 0.5, slab = solidBox([-BASE.half, BASE.half], [-BASE.height, FLOOR_Y - SKIN - SLAB_GAP], [-BASE.half, BASE.half]);
const post = ({ x, z }, r, top) => solidBox([x - r, x + r], [-BASE.height, top], [z - r, z + r]);
const zone = ({ x, z }, top, pad = 0) => solidBox([x[0] - pad, x[1] + pad], [-BASE.height, top], [z[0] - pad, z[1] + pad]);
const BRIDGE = WRECK.footbridge, VINES = 1; // what hangs off the building's walls
const LOT = { w: TOWN.backLot.x[0] + 0.14, n: TOWN.backLot.z[0] + 0.14, e: 1.36, s: -13.35, wallT: 0.16 }; // town.js's wall lines
const lotWall = (x, z, top) => solidBox([x[0] - LOT.wallT, x[1] + LOT.wallT], [-BASE.height, top], [z[0] - LOT.wallT, z[1] + LOT.wallT]);
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
];
/** Smallest radius >= s along the ray from o through d that sits clear of every solid. */
const clearRadius = (o, d, s) => {
  for (let moved = true, pass = 0; moved && pass < 12; pass++) {
    moved = false;
    for (const exit of SOLIDS) { const e = exit(o, d, s); if (e > s) { s = e; moved = true; } }
  }
  return s;
};
/** Critically damped follow: eases in and out, stable at any dt, holds still at dt 0. */
const follow = (cur, want, vel, tau, dt) => {
  const w = 2 / tau, x = w * dt, k = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x), c = cur - want, j = (vel.v + w * c) * dt;
  vel.v = (vel.v - w * j) * k;
  return want + (c + j) * k;
};

// Verification viewpoints land exactly where they say: limits stay off for ?shot, and after ?cam= or setCam until someone touches the controls.
const SHOT = Q.has('shot');
let held = false, push = 0, polar = MAX_POLAR, release = 0, panSlack = 0, minDist0 = MIN_DIST, userR = 0;
const pushVel = { v: 0 }, polarVel = { v: 0 }, ray = new THREE.Vector3(), rayA = [0, 0, 0], tgtA = [0, 0, 0];
const userPos = camera.position.clone(), shownPos = camera.position.clone();
const boxed = new THREE.Vector3(), clamped = new THREE.Vector3(), bounds = new THREE.Box3();
const hold = () => { held = true; push = 0; pushVel.v = 0; controls.minDistance = 0; controls.maxPolarAngle = Math.PI; };
const engage = () => { // ease from wherever a verification view left the camera
  held = false; polar = MAX_POLAR; polarVel.v = 0; release = 1; userR = camera.position.distanceTo(controls.target);
  panSlack = PAN_BOX.distanceToPoint(controls.target) * 1.01;
  minDist0 = Math.min(MIN_DIST, camera.position.distanceTo(controls.target));
};
controls.addEventListener('start', () => { if (held && !SHOT) engage(); });

function steerCamera(dt) {
  const target = controls.target, pos = camera.position;
  if (held) { controls.update(); userPos.copy(pos); return; }

  release = Math.max(0, release - dt / 0.6);
  controls.minDistance = THREE.MathUtils.lerp(MIN_DIST, minDist0, release);
  // Floor: over the plinth, slab and skin included, the shown camera stops FLOOR_Y up; past that the limit relaxes to the free sky below it.
  // The limit never sits looser than the pose, so the lift starts at once. It holds tight at the floor and only eases a pose well under it (in low past the rim).
  const edge = Math.max(Math.abs(pos.x), Math.abs(pos.z)) - BASE.half, over = 1 - THREE.MathUtils.smoothstep(edge, SKIN, 9);
  const userNow = pos.distanceTo(target), posePhi = Math.acos(THREE.MathUtils.clamp((pos.y - target.y) / userNow, -1, 1));
  const floorPhi = Math.acos(THREE.MathUtils.clamp((FLOOR_Y - target.y) / (userNow + push), -1, 1));
  const wantPolar = THREE.MathUtils.lerp(MAX_POLAR, Math.min(MAX_POLAR, floorPhi), over);
  if (wantPolar < polar) {
    const under = (posePhi - wantPolar) * (userNow + push), tau = 0.01 + 0.13 * THREE.MathUtils.smoothstep(under, 0.3, 1.5);
    polar = Math.min(follow(polar, wantPolar, polarVel, tau, dt), Math.max(wantPolar, posePhi));
  } else { polar = wantPolar; polarVel.v = 0; }
  controls.maxPolarAngle = polar;

  controls.update();

  // Pan box: same delta on camera and target, so the view translates and never pivots.
  bounds.copy(PAN_BOX).expandByScalar(panSlack * release).clampPoint(target, clamped);
  boxed.subVectors(target, clamped);
  target.sub(boxed); pos.sub(boxed);

  ray.subVectors(pos, target);
  let r = ray.length(); ray.divideScalar(r);
  if (push > 0 && r > userR * 1.0001) { // dollying out while pushed starts from where the camera visibly is, with no dead zoom
    r *= (userR + push) / userR; push = 0; pushVel.v = 0;
    pos.copy(target).addScaledVector(ray, r);
  }
  ray.toArray(rayA); target.toArray(tgtA);
  const want = clearRadius(tgtA, rayA, r) - r, keep = push + userR - r; // keep: the push that leaves the shown radius where it was
  if (keep > push && want > push) { // an inward step into a solid goes straight into the push, so the view stops rather than bounces
    if (want <= keep) { push = want; pushVel.v = 0; } else push = keep;
  }
  push = Math.max(0, follow(push, want, pushVel, want > push ? 0.1 : 0.32, dt));
  userR = r; userPos.copy(pos);
  pos.addScaledVector(ray, push);
}

const aim = (name) => {
  const [p, t] = CAMS[name] || CAMS.hero;
  camera.position.set(...p); controls.target.set(...t);
  if (!CAMS[name] || name === 'hero') dollyToFit();
  controls.update();
};
const setCam = (name) => { hold(); aim(name); };
if (SHOT || Q.has('cam')) setCam(Q.get('cam') || 'hero');
else { controls.minDistance = MIN_DIST; controls.maxPolarAngle = MAX_POLAR; aim('hero'); }

// Light rig: warm sun + cool sky fill. Sun intensity ≈ π → albedo at full light.
const sun = new THREE.DirectionalLight(P.sunPale, 2.45);
sun.position.set(...SUN_DIR.map((c) => c * 60)).add(new THREE.Vector3(0, 5, 0));
sun.target.position.set(0, 5, 0);
sun.castShadow = true;
const shadowSize = Math.min(4960, renderer.capabilities.maxTextureSize);
sun.shadow.mapSize.set(shadowSize, shadowSize);
// Fits every caster's and receiver's vertices with a margin (x, y within ±29; depth 38.8..82.3): anything past far would lose its shadow.
const SHADOW = { half: 30.5, near: 36, far: 85 };
Object.assign(sun.shadow.camera, { left: -SHADOW.half, right: SHADOW.half, top: SHADOW.half, bottom: -SHADOW.half, near: SHADOW.near, far: SHADOW.far });
sun.shadow.bias = -0.046 / (SHADOW.far - SHADOW.near); sun.shadow.normalBias = 0.035; sun.shadow.radius = 1.2; // bias is in depth-range units: 0.046 world units
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight('#b6ecf2', '#7fb4b4', 1.5));

const updaters = [];
const only = Q.get('only')?.split(',');
const stats = { modules: {}, errors: [] };
await Promise.all(Object.entries(MODULES).filter(([k]) => !only || only.includes(k)).map(async ([name, load]) => {
  try {
    const mod = await load();
    const res = await mod.build(makeCtx(name, { scene, camera, renderer }));
    if (res?.group) scene.add(res.group);
    if (res?.update) updaters.push({ name, update: res.update });
    stats.modules[name] = 'ok';
  } catch (e) {
    console.error(`module ${name} failed:`, e); stats.errors.push(`${name}: ${e.message}`); stats.modules[name] = 'FAILED';
  }
}));

// Lights must stay in the render list during the layered ink passes, or every material recompiles per frame.
scene.traverse((o) => { if (o.isLight) o.layers.enableAll(); });

const composer = createPost(renderer, scene, camera);
const applySize = () => {
  renderer.setPixelRatio(pixelRatio); composer.setPixelRatio(pixelRatio);
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
};
addEventListener('resize', () => { fitCamera(); applySize(); });
renderer.domElement.addEventListener('webglcontextrestored', () => { renderer.shadowMap.needsUpdate = true; });

// Shadows are effectively static: bake once (moving things use gobo dapples, not the shadow map).
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;

// Slow GPU: quietly trade resolution for smoothness. Once the rate recovers step back up, and stop trying if that costs another drop.
const TOP_PR = pixelRatio;
let span0 = performance.now(), spanN = 0, calm = 0, steppedUp = false, stayDown = false;
function adaptResolution(now, gap) {
  if (gap > 500) { span0 = now; spanN = 0; calm = 0; return; } // a hidden tab or a load hitch says nothing about the GPU
  spanN++;
  const span = (now - span0) / 1000;
  if (span < 4) return;
  const fps = spanN / span;
  spanN = 0;
  if (fps < 32 && pixelRatio > 1) {
    pixelRatio = Math.max(1, pixelRatio - 0.5); applySize(); calm = 0; stayDown = steppedUp;
  } else if (fps > 55 && pixelRatio < TOP_PR && !stayDown) {
    if (++calm === 2) { pixelRatio = Math.min(TOP_PR, pixelRatio + 0.5); applySize(); calm = 0; steppedUp = true; }
  } else calm = 0;
  span0 = performance.now();
}

let last = performance.now();
let frozen = Q.has('t') ? parseFloat(Q.get('t')) : null, t = frozen ?? 0;
function frame(stepDt) {
  const now = performance.now(), gap = now - last, dt = Math.min(gap / 1000, 0.05); last = now;
  t = frozen ?? t + dt;
  shared.uTime.value = t;
  for (const u of updaters) { try { u.update(t, dt); } catch (e) { console.error(u.name, e); updaters.splice(updaters.indexOf(u), 1); } }
  steerCamera(stepDt ?? dt);
  shownPos.copy(camera.position);
  glow.aim(camera);
  composer.render(dt);
  camera.position.copy(userPos);
  if (frozen === null) adaptResolution(now, gap);
}
renderer.setAnimationLoop(() => frame());

// Verification hook (no visible UI). Not used by the page itself.
// constrain(true) runs the normal camera limits, even under ?shot; step(dt) then advances them by dt.
// With the limits on, camera.position reads the user's pose; shown is the pose the frame was drawn from.
window.__diorama = { scene, camera, controls, renderer, stats, shown: shownPos, setCam, CAMS, THREE, constrain: (on) => { if (on) engage(); else hold(); }, freeze: (v) => { frozen = v; }, step: (dt, n = 1) => { for (let i = 0; i < n; i++) { const f = frozen; frozen = (f ?? t) + dt; frame(dt); } } };
requestAnimationFrame(() => requestAnimationFrame(() => { window.__ready = true; }));
