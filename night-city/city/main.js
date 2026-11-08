import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { PITCH } from './config.js';
import { loadTextures, pbr } from './textures.js';
import { createFacadeMaterials } from './facade.js';
import { makeSignAtlas, makeStoreTexture, makeSolarTexture, makeAdAtlas, AD_COUNT } from './canvas.js';
import { loadTreeModels, buildTrees } from './trees.js';
import { buildCity } from './buildings.js';
import { buildStreets } from './streets.js';
import { buildSky } from './sky.js';
import { buildScreens } from './screens.js';
import { createPost } from './post.js';

// Fog that is denser and warmer near the ground: street light scattered in the air above the city.
// Replaces three's fog chunks, so every material that supports fog picks it up.
THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorld;
#endif`;
THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogWorld = (inverse(viewMatrix) * mvPosition).xyz;
#endif`;
THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogWorld;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif`;
THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  // only over the city itself, fading out across the suburbs
  float lowHaze = exp( - max( vFogWorld.y, 0.0 ) / 80.0 ) * ( 1.0 - smoothstep( 400.0, 1000.0, length( vFogWorld.xz ) ) );
  fogFactor = clamp( fogFactor * ( 0.8 + 0.5 * lowHaze ), 0.0, 1.0 );
  vec3 hazeColor = mix( fogColor, vec3( 0.16, 0.09, 0.07 ), lowHaze * 0.5 );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, hazeColor, fogFactor );
#endif`;

const params = new URLSearchParams(location.search);
const loadingEl = document.getElementById('loading');
const loadingText = document.getElementById('loading-text');
const loadingBar = document.getElementById('loading-bar');
const nextTask = () => new Promise((r) => setTimeout(r, 0));

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = Number(params.get('exposure') || 1.0);
document.body.appendChild(renderer.domElement);

const FOG_COLOR = new THREE.Color(0x150f2b);
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(FOG_COLOR, 0.0011);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.5, 6000);
camera.position.set(430, 230, 430);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 50, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.35;
controls.minDistance = 4;
controls.maxDistance = 1400;
controls.maxPolarAngle = Math.PI * 0.495;

// ---------- assets ----------
const progress = [0, 0];
const showProgress = () => (loadingBar.style.width = `${Math.round(((progress[0] + progress[1]) / 2) * 100)}%`);
const treeManager = new THREE.LoadingManager();
treeManager.onProgress = (_url, loaded, total) => {
  progress[1] = loaded / Math.max(total, 1);
  showProgress();
};
const treeModelsJob = loadTreeModels(treeManager);
const { tex, env } = await loadTextures(renderer, (p) => {
  progress[0] = p;
  showProgress();
});
const treeModels = await treeModelsJob;
scene.environment = env;
scene.environmentIntensity = 0.5;
scene.add(new THREE.HemisphereLight(0x3a4bb0, 0x1a0c18, 0.45));
const moonLight = new THREE.DirectionalLight(0x8fa2ff, 0.5);
moonLight.position.set(-1300, 950, -1700).normalize();
scene.add(moonLight);

loadingText.textContent = '正在建造城市…';
await nextTask();

// ---------- buildings ----------
const signs = makeSignAtlas();
const facades = createFacadeMaterials(tex);
const city = buildCity({ signs });

const mats = {
  concrete: pbr(tex.concrete_wall_006, { color: 0x9c9ca2 }),
  stone: pbr(tex.white_sandstone_blocks_02, { color: 0xe2d4ba }),
  roof: pbr(tex.tarred_gravel, { color: 0xb4b4b4 }),
  roofLight: pbr(tex.gravel_concrete, { color: 0xaaa69e }),
  slab: pbr(tex.square_concrete_pavers, { color: 0x8e8e93 }),
  path: pbr(tex.square_concrete_pavers, { color: 0xb6b2aa }),
  park: pbr(tex.aerial_grass_rock, { color: 0x8aa27c }),
  hvac: pbr(tex.metal_plate_02, { color: 0xc8ccd2, metalness: 0.5 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x6e747c, roughness: 0.48, metalness: 0.8 }),
  railing: new THREE.MeshStandardMaterial({ color: 0x8fa2b8, roughness: 0.3, metalness: 0.15, transparent: true, opacity: 0.38 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x1d1f26, roughness: 0.6, metalness: 0.3 }),
  white: new THREE.MeshStandardMaterial({ color: 0xd8dadf, roughness: 0.6 }),
  tank: new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 0.9 }),
  solar: new THREE.MeshStandardMaterial({ map: makeSolarTexture(), roughness: 0.18, metalness: 0.4 }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
  store: new THREE.MeshBasicMaterial({ vertexColors: true, map: makeStoreTexture() }),
  paint: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }),
  sign: signMaterial(),
  led: ledMaterial(),
};

// neon signs; a few of them flicker in bursts like a failing tube
function signMaterial() {
  const m = new THREE.MeshBasicMaterial({ map: signs.tex, color: new THREE.Color(2.2, 2.2, 2.2) });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = facades.shared.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aFlick;\nvarying float vFlick;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFlick = aFlick;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFlick;\nuniform float uTime;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        if (vFlick > 0.0) {
          float tt = uTime + vFlick * 7.3;
          float burst = step(0.8, fract(tt * 0.09 + vFlick * 0.37));
          float blink = step(0.45, fract(sin(floor(tt * 14.0) * 12.9898 + vFlick) * 43758.5453));
          diffuseColor.rgb *= mix(1.0, 0.08 + 0.92 * blink, burst);
        }`);
  };
  m.customProgramCacheKey = () => 'city-sign';
  return m;
}

// colour waves running up the landmark's LED fins
function ledMaterial() {
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = facades.shared.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLedPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvLedPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLedPos;\nuniform float uTime;')
      .replace('#include <map_fragment>', `
        float around = atan(vLedPos.z, vLedPos.x) * 0.159;
        float wave = fract(vLedPos.y * 0.011 - uTime * 0.16 + around);
        vec3 hue = 0.5 + 0.5 * cos(6.2831 * (wave * 0.6 + uTime * 0.03 + vec3(0.0, 0.33, 0.67)));
        float pulse = smoothstep(0.0, 0.06, wave) * (1.0 - smoothstep(0.35, 0.7, wave));
        diffuseColor.rgb = hue * (0.25 + 3.4 * pulse);`);
  };
  m.customProgramCacheKey = () => 'city-led';
  return m;
}
for (const [k, m] of Object.entries(facades.mats)) mats['f_' + k] = m;

// merge each material bucket into a single mesh: a few dozen draw calls for the whole city
for (const [k, list] of Object.entries(city.buckets)) {
  if (!mats[k]) {
    console.warn('no material for bucket', k);
    continue;
  }
  const geo = mergeGeometries(list.map((g) => (g.index ? g : mergeVertices(g))));
  list.forEach((g) => g.dispose());
  scene.add(new THREE.Mesh(geo, mats[k]));
}

const streets = buildStreets({ scene, tex });
const trees = buildTrees({ renderer, scene, models: treeModels, spots: [...streets.trees, ...city.treeSpots] });
const sky = buildSky({ scene, fogColor: FOG_COLOR, landmarkTop: city.landmarkTop, antennaTips: city.antennaTips });
const screens = buildScreens({ scene, spots: city.screenSpots, adTex: makeAdAtlas(), adCount: AD_COUNT });
const post = createPost(renderer, scene, camera);

// ---------- camera presets ----------
const VIEWS = {
  Digit1: [[430, 230, 430], [0, 50, 0], true],
  Digit2: [[PITCH / 2 + 3, 4, 150], [PITCH / 2 - 1, 3.8, 120], false],
  Digit3: [[-95, 135, 120], [0, 105, 0], false],
  Digit4: [[70, city.landmarkTop + 30, 85], [0, city.landmarkTop - 20, 0], false],
};
let fly = null;
function flyTo([p, t, rotate]) {
  fly = {
    p0: camera.position.clone(), t0: controls.target.clone(),
    p1: new THREE.Vector3(...p), t1: new THREE.Vector3(...t),
    start: performance.now(), dur: 2200, rotate,
  };
  controls.autoRotate = false;
}
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') controls.autoRotate = !controls.autoRotate;
  if (VIEWS[e.code]) flyTo(VIEWS[e.code]);
});

// ---------- resolution: adapts to keep the frame rate smooth ----------
const maxScale = Math.min(window.devicePixelRatio, Number(params.get('scale') || 1.5));
let scale = Math.min(maxScale, 1.25);
function resize() {
  renderer.setPixelRatio(scale);
  renderer.setSize(window.innerWidth, window.innerHeight);
  post.setSize(window.innerWidth, window.innerHeight, scale);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
resize();
window.addEventListener('resize', resize);

// compile every shader in parallel (scene renders into an HDR target, so compile those variants)
loadingText.textContent = '正在编译着色器…';
await nextTask();
renderer.setRenderTarget(post.composer.renderTarget1);
await renderer.compileAsync(scene, camera);
renderer.setRenderTarget(null);

const clock = new THREE.Clock();
let frames = 0;
let frameTime = 0;
let lastCheck = 0;
let shown = false;

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (fly) {
    const k = Math.min(1, (performance.now() - fly.start) / fly.dur);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    camera.position.lerpVectors(fly.p0, fly.p1, e);
    controls.target.lerpVectors(fly.t0, fly.t1, e);
    if (k >= 1) {
      controls.autoRotate = fly.rotate;
      fly = null;
    }
  }

  facades.shared.uTime.value = t;
  streets.update(dt, t);
  sky.update(dt, t);
  screens.update(t);
  controls.update();
  trees.update(camera);
  post.render(t);

  if (!shown) {
    shown = true;
    loadingEl.style.opacity = '0';
    setTimeout(() => loadingEl.remove(), 900);
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
