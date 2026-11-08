import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SUN_DIR, BASE } from './core/layout.js';
import { P } from './core/palette.js';
import { shared, initShared } from './core/toon.js';
import { bakeGobo } from './core/gobo.js';
import { skyTexture } from './core/textures.js';
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
};

const Q = new URLSearchParams(location.search);
const CAMS = { // pos, target. Test/verification viewpoints only; the shipped page starts at hero.
  hero: [[45, 26, 51.5], [0, 6.9, 0]],
  front: [[4, 9, 58], [-1, 8.2, 0]],
  east: [[58, 10, -3], [0, 8, -3]],
  top: [[8, 78, 16], [-1, 5, 0]],
  back: [[-42, 22, -47], [-1, 8.2, -1]],
  low: [[30, -1.6, 33], [0, 0.2, 0]],
  lowback: [[-30, -1.6, -32], [0, 0.2, 0]],
  shop: [[-2.2, 2.2, 9.5], [-3.8, 1.6, -3.5]],
  collapse: [[12, 8.5, 12], [-3.2, 4.2, -3.2]],
  street: [[12, 2.2, 15], [0, 2.2, 3]],
  pond: [[8, 3.2, 17], [1.5, 0.2, 9.5]],
  corner: [[14, 7, 14], [6, 2, 4]],
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
scene.background = skyTexture();

const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 1, 400);
camera.layers.enable(1); camera.layers.enable(2);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.minDistance = 12; controls.maxDistance = 120;
controls.cursor.set(0, 6, 0); controls.maxTargetRadius = 11; // panning can't lose the model
controls.maxPolarAngle = Math.PI * 0.62;
controls.rotateSpeed = 0.7; controls.zoomSpeed = 0.8; controls.panSpeed = 0.7;
const setCam = (name) => { const [p, t] = CAMS[name] || CAMS.hero; camera.position.set(...p); controls.target.set(...t); controls.update(); };
setCam(Q.get('cam') || 'hero');

// Light rig: warm sun + cool sky fill. Sun intensity ≈ π → albedo at full light.
const sun = new THREE.DirectionalLight(P.sunPale, 2.45);
sun.position.set(...SUN_DIR.map((c) => c * 60)).add(new THREE.Vector3(0, 5, 0));
sun.target.position.set(0, 5, 0);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -27, right: 27, top: 27, bottom: -27, near: 10, far: 110 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.035; sun.shadow.radius = 1.2;
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
// Keep the whole model in frame in narrow windows: hold the horizontal view instead of the vertical one.
const fitCamera = () => {
  const aspect = innerWidth / innerHeight, base = Math.tan(THREE.MathUtils.degToRad(15));
  camera.aspect = aspect;
  camera.fov = aspect >= 1.4 ? 30 : Math.min(50, THREE.MathUtils.radToDeg(2 * Math.atan((base * 1.4) / aspect)));
  camera.updateProjectionMatrix();
};
fitCamera();
const applySize = () => {
  renderer.setPixelRatio(pixelRatio); composer.setPixelRatio(pixelRatio);
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
};
addEventListener('resize', () => { fitCamera(); applySize(); });
renderer.domElement.addEventListener('webglcontextrestored', () => { renderer.shadowMap.needsUpdate = true; });

// Shadows are effectively static: bake once (moving things use gobo dapples, not the shadow map).
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;

let last = performance.now(), slowT = 0, slowN = 0;
let frozen = Q.has('t') ? parseFloat(Q.get('t')) : null, t = frozen ?? 0;
function frame() {
  const now = performance.now(), dt = Math.min((now - last) / 1000, 0.05); last = now;
  t = frozen ?? t + dt;
  shared.uTime.value = t;
  for (const u of updaters) { try { u.update(t, dt); } catch (e) { console.error(u.name, e); updaters.splice(updaters.indexOf(u), 1); } }
  controls.update();
  // Stay above the plinth's top when orbiting low across it.
  if (Math.abs(camera.position.x) < 12.5 && Math.abs(camera.position.z) < 12.5 && camera.position.y < 0.4) camera.position.y = 0.4;
  composer.render(dt);
  // Slow GPU: quietly trade resolution for smoothness.
  if (frozen === null && pixelRatio > 1) {
    slowT += dt; slowN++;
    if (slowT > 4) { if (slowN / slowT < 32) { pixelRatio = Math.max(1, pixelRatio - 0.5); applySize(); } slowT = 0; slowN = 0; }
  }
}
renderer.setAnimationLoop(frame);

// Verification hook (no visible UI). Not used by the page itself.
window.__diorama = { scene, camera, controls, renderer, stats, setCam, CAMS, THREE, freeze: (v) => { frozen = v; }, step: (dt, n = 1) => { for (let i = 0; i < n; i++) { const f = frozen; frozen = (f ?? t) + dt; frame(); } } };
requestAnimationFrame(() => requestAnimationFrame(() => { window.__ready = true; }));
