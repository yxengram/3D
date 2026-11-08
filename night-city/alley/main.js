import * as THREE from 'three';
import { loadAssets } from './assets.js';
import { buildWorld, ALLEY } from './world.js';
import { WetGround } from './ground.js';
import { Rain } from './rain.js';
import { PostFX } from './post.js';
import { CameraRig } from './camera.js';
import { batchStatic } from './batch.js';
import { updateLightUniforms } from './lights.js';
import { RainAudio } from './audio.js';

const params = new URLSearchParams(location.search);
const loadingEl = document.getElementById('loading');
const barEl = document.getElementById('loading-bar');
const textEl = document.getElementById('loading-text');
const fadeEl = document.getElementById('fade');
const uiEl = document.getElementById('ui');
const nextTask = () => new Promise((r) => setTimeout(r, 0));

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = Number(params.get('exposure') || 1.0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false; // lights and buildings never move: shadow maps are rendered once
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.05, 400);
camera.rotation.order = 'YXZ';
camera.layers.enable(1); // layer 1: small props left out of the ground reflection

const assets = await loadAssets(renderer, (p) => (barEl.style.width = `${Math.round(p * 100)}%`));
textEl.textContent = '正在搭建场景…';
await nextTask();

const world = buildWorld({ scene, assets });
const ground = new WetGround({ renderer, textures: assets.textures, alley: ALLEY });
scene.add(ground.mesh);
batchStatic(world.root);
world.afterBatch();

const rain = new Rain({ bounds: ALLEY });
scene.add(rain.group);
scene.add(new THREE.HemisphereLight(0x5a4a8a, 0x120c14, 0.4));

const post = new PostFX(renderer);
const pmrem = new THREE.PMREMGenerator(renderer);
// Placeholder environment with the same layout as the real one, so shaders compile with env maps enabled.
scene.environment = pmrem.fromScene(new THREE.Scene(), 0, 0.1, 10).texture;
scene.environmentIntensity = 1.1;

const rig = new CameraRig(camera, renderer.domElement, {
  zStart: ALLEY.zStart - 1.2,
  zEnd: ALLEY.zEnd + 1,
  halfWidth: ALLEY.halfWidth,
  onLoop(reset) {
    fadeEl.style.opacity = '1';
    setTimeout(() => {
      reset();
      fadeEl.style.opacity = '0';
    }, 1000);
  },
});

// optional camera pinning, e.g. alley.html?walk=0&z=-10&yaw=0.4&pitch=0.1
if (params.get('walk') === '0') rig.walking = false;
if (params.has('z')) rig.z = rig.zSmooth = Number(params.get('z'));
if (params.has('x')) rig.x = rig.xSmooth = Number(params.get('x'));
if (params.has('yaw')) rig.yaw = rig.yawSmooth = Number(params.get('yaw'));
if (params.has('pitch')) rig.pitch = rig.pitchSmooth = Number(params.get('pitch'));

// ---------- resolution: adapts to keep the frame rate smooth ----------
const maxScale = Math.min(window.devicePixelRatio, Number(params.get('scale') || 1.5));
let scale = Math.min(maxScale, 1.25);
function resize() {
  renderer.setPixelRatio(scale);
  renderer.setSize(window.innerWidth, window.innerHeight);
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  post.setSize(size.x, size.y);
  ground.setSize(size.x, size.y);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
resize();
window.addEventListener('resize', resize);

// ---------- controls ----------
const audio = new RainAudio();
let rainTarget = 1;
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR') rainTarget = rainTarget > 0.5 ? 0 : 1;
  if (e.code === 'KeyM') audio.toggle();
  if (e.code === 'KeyH') uiEl.classList.toggle('hidden');
});

// Compile every shader in parallel before the first frame. Everything renders into HDR targets,
// so compile the render-target variants.
textEl.textContent = '正在编译着色器…';
await nextTask();
rig.update(0.016, 0);
camera.updateMatrixWorld();
updateLightUniforms();
renderer.setRenderTarget(post.sceneRT);
await renderer.compileAsync(scene, camera);
renderer.setRenderTarget(null);

// Reflection probe: capture the lit alley once for reflections on glass, metal and wet walls.
{
  const cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
  const cubeCam = new THREE.CubeCamera(0.1, 300, cubeRT);
  cubeCam.position.set(0, 2.2, -18);
  rain.group.visible = false;
  renderer.shadowMap.needsUpdate = true;
  cubeCam.update(renderer, scene);
  rain.group.visible = true;
  const placeholder = scene.environment;
  scene.environment = pmrem.fromCubemap(cubeRT.texture).texture;
  placeholder.dispose();
  cubeRT.dispose();
}

function frame(dt, t) {
  rig.update(dt, t);
  camera.updateMatrixWorld();
  world.update(dt, t);
  updateLightUniforms();

  rain.intensity += (rainTarget - rain.intensity) * (1 - Math.exp(-dt * 1.5));
  rain.update(t, camera);
  ground.uniforms.uTime.value = t;
  ground.uniforms.uRain.value = rain.intensity;
  audio.setIntensity(rain.intensity);

  ground.render(scene, camera, [rain.group]);
  post.render(scene, camera, dt, t);
}

const clock = new THREE.Clock();
let frames = 0;
let frameTime = 0;
let lastCheck = 0;
let shown = false;

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  frame(dt, t);

  if (!shown) {
    shown = true;
    loadingEl.style.opacity = '0';
    setTimeout(() => loadingEl.remove(), 1300);
  }

  // every 2 s: lower the internal resolution below ~50 fps, raise it again above ~75 fps
  frames++;
  frameTime += dt;
  if (t - lastCheck > 2 && frames > 20) {
    const avg = frameTime / frames;
    if (avg > 1 / 50 && scale > 0.7) {
      scale = Math.max(0.7, scale - 0.1);
      resize();
    } else if (avg < 1 / 75 && scale < maxScale) {
      scale = Math.min(maxScale, scale + 0.1);
      resize();
    }
    frames = 0;
    frameTime = 0;
    lastCheck = t;
  }
});
