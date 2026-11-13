// Art museum — exterior, lobby, modern-painting gallery. All lighting is baked: every surface is an unlit material
// (albedo texture × lightmap), so the page runs without a single real-time light or shadow map.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { makeMaterials, skyUniforms, SKY_GLSL } from './materials.js';
import { Controls } from './controls.js';

const Q = new URLSearchParams(location.search);
const SHOT = Q.has('shot');
if (SHOT) document.body.classList.add('shot');
const BASE = Q.get('assets') || 'assets';
const INLINE = window.__ASSETS || null;                         // single-file build: every asset as a data URI
const url = (p) => (INLINE && INLINE[p]) || `${BASE}/${p}`;
const B = (p) => new THREE.Vector3(p[0], p[2], -p[1]);          // Blender (x, y, z up) -> three (x, y up, z)
const canvas = document.getElementById('c');

// Tone curve: Khronos "neutral" without its toe. The stock toe subtracts up to 0.04 from every channel, which crushes and
// over-saturates the dim, baked interiors; here values below 0.76 pass through unchanged and only highlights roll off.
THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace('vec3 CustomToneMapping( vec3 color ) { return color; }', /* glsl */`
vec3 CustomToneMapping( vec3 color ) {
  color *= toneMappingExposure;
  float peak = max( color.r, max( color.g, color.b ) );
  const float s = 0.76; if ( peak < s ) return color;
  float d = 1.0 - s; float np = 1.0 - d * d / ( peak + d - s );
  color *= np / peak;
  float g = 1.0 - 1.0 / ( 0.15 * ( peak - np ) + 1.0 );
  return mix( color, vec3( np ), g );
}`);

async function main() {
  const t0 = performance.now();
  if (location.protocol === 'file:' && !INLINE) throw new Error('这个页面需要通过网页服务器打开（或改用单文件版 艺术博物馆.html）');
  // High-density screens supersample anyway: skipping 4x MSAA there quarters the frame buffer. ?aa=1 / ?aa=0 overrides.
  const AA = Q.has('aa') ? Q.get('aa') !== '0' : (window.devicePixelRatio || 1) < 1.75;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: AA, powerPreference: 'high-performance', stencil: false }); }
  catch (e) { throw new Error('此浏览器或显卡不支持 WebGL2'); }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = { soft: THREE.CustomToneMapping, agx: THREE.AgXToneMapping, aces: THREE.ACESFilmicToneMapping, neutral: THREE.NeutralToneMapping, none: THREE.NoToneMapping }[Q.get('tm') || 'soft'];
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.08, 2400);
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  // ---------------------------------------------------------------------------------------------- loading
  const manager = new THREE.LoadingManager();
  const bar = document.getElementById('bar');
  manager.onProgress = (_, n, total) => { if (bar) bar.style.transform = `scaleX(${n / total})`; };
  const texLoader = new THREE.TextureLoader(manager);
  const loadTex = (p) => new Promise((res) => { if (INLINE && !INLINE[p]) return res(null); texLoader.load(url(p), res, undefined, () => { console.warn('missing texture', p); res(null); }); });
  let J;
  if (INLINE) J = INLINE['scene.json'];
  else { const r = await fetch(url('scene.json')); if (!r.ok) throw new Error('scene.json ' + r.status); J = await r.json(); }
  const gltfP = new Promise((res, rej) => {
    const loader = new GLTFLoader(manager);
    if (INLINE) loader.parse(Uint8Array.from(atob(INLINE['scene.glb']), (c) => c.charCodeAt(0)).buffer, '', res, rej); else loader.load(url('scene.glb'), res, undefined, () => rej(new Error('scene.glb')));
  });
  const texNames = [...new Set(Object.values(J.mats).map((m) => m.tex).filter(Boolean))];
  const [gltf, texs, lms, sky, treeline] = await Promise.all([gltfP, Promise.all(texNames.map(loadTex)), Promise.all(Object.keys(J.lm).map((z) => loadTex(J.lm[z].file))), loadTex('tex/sky.webp'), loadTex('tex/treeline.webp')]);
  const tex = {}; texNames.forEach((n, i) => { tex[n] = texs[i]; });
  const lm = {}; Object.keys(J.lm).forEach((z, i) => { lm[z] = lms[i]; });
  for (const t of Object.values(tex)) if (t) { t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  for (const t of Object.values(lm)) if (t) { t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.channel = 1; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }

  // ---------------------------------------------------------------------------------------------- sky, fog, far scenery
  const sun = B(J.sun).normalize();
  if (sky) { sky.colorSpace = THREE.SRGBColorSpace; sky.wrapS = THREE.RepeatWrapping; sky.wrapT = THREE.ClampToEdgeWrapping; sky.generateMipmaps = false; sky.minFilter = THREE.LinearFilter; }
  skyUniforms.uSky.value = sky; skyUniforms.uHasSky.value = sky ? 1 : 0; skyUniforms.uSun.value.copy(sun);
  const SKY_GAIN = skyUniforms.uSkyGain.value, HAZE = new THREE.Color(0.80, 0.84, 0.90).multiplyScalar(SKY_GAIN * 0.82);
  skyUniforms.uHaze.value.copy(HAZE);
  scene.fog = new THREE.Fog(HAZE.clone(), 260, 1100);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1800, 48, 24), new THREE.ShaderMaterial({
    uniforms: skyUniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }',
    fragmentShader: `${SKY_GLSL} varying vec3 vDir; void main(){ gl_FragColor = vec4(skyColor(normalize(vDir), 1.0), 1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`,
  }));
  dome.renderOrder = -10; dome.frustumCulled = false; scene.add(dome);
  const RING = new THREE.Color(1.5, 1.6, 1.5); let ring = null;
  if (treeline) {
    treeline.colorSpace = THREE.SRGBColorSpace; treeline.wrapS = THREE.RepeatWrapping; treeline.repeat.set(6, 1); treeline.anisotropy = maxAniso;
    ring = new THREE.Mesh(new THREE.CylinderGeometry(330, 330, 34, 64, 1, true), new THREE.MeshBasicMaterial({ map: treeline, transparent: true, alphaTest: 0.08, side: THREE.BackSide, depthWrite: false, color: RING.clone() }));
    ring.position.y = 16.5; ring.renderOrder = -5; scene.add(ring);
  }

  // ---------------------------------------------------------------------------------------------- materials + meshes
  const M = makeMaterials({ J, tex, lm, renderer, B });
  const root = gltf.scene; scene.add(root);
  let water = null; const stats = { meshes: 0 }, medMeshes = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const [name, zone] = o.material.name.split('@'); const z = zone || (o.name.match(/^(ext|lobby|gallery)/) || [])[1] || o.parent.name.split('_')[0];
    o.material = M.get(name, z); o.userData.zone = z; o.userData.mat = name; stats.meshes++;
    o.matrixAutoUpdate = false; o.updateMatrix();
    if (J.mats[name].kind === 'decal' || J.mats[name].kind === 'glass') o.renderOrder = 5;
    if (name === 'water') water = o;
    if (z === 'med') medMeshes.push(o);
  });
  // The medieval hall can only be seen from inside it or from the lobby (through its doorway). Everywhere else it is not drawn at all
  // and a dark panel stands in the doorway, so the exterior and the modern gallery cost exactly what they did before the hall existed.
  let medPlug = null;
  if (J.zones.med && J.portals && J.portals.med) {
    const q = J.portals.med, zb = J.zones.med;
    medPlug = new THREE.Mesh(new THREE.PlaneGeometry(q[1] - q[0] + 0.9, 3.8), new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(0.004, 0.009, 0.010), fog: false }));
    medPlug.rotation.y = Math.PI / 2; medPlug.position.set(zb[3] + 0.06, 1.9, -(q[0] + q[1]) / 2); scene.add(medPlug);
    for (const m of medMeshes) m.visible = false;                 // starts hidden: nothing of the hall is uploaded to the GPU until it is needed
    medPlug.userData.door = new THREE.Box3(new THREE.Vector3(zb[3] - 0.2, 0, -q[1] - 0.5), new THREE.Vector3(J.zones.lobby[0] + 0.2, 3.9, -q[0] + 0.5));
  }
  // Its textures (about 65 MB) are uploaded one per frame once the visitor starts walking, so there is no hitch at the doorway and
  // someone who only orbits the exterior never pays for them.
  const medWarm = []; let warmStarted = false;
  const frustum = new THREE.Frustum(), pv = new THREE.Matrix4();
  // reflecting pool: planar reflection at reduced resolution, only rendered while the pool can be in view
  if (water) {
    water.geometry.computeBoundingBox(); const bb = water.geometry.boundingBox; const size = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
    const mirror = new Reflector(new THREE.PlaneGeometry(size.x, size.z), { textureWidth: 768, textureHeight: 512, multisample: 4, clipBias: 0.003, shader: M.waterShader });
    mirror.rotation.x = -Math.PI / 2; mirror.position.copy(c); mirror.material.uniforms.uTime = M.time; scene.add(mirror);
    water.visible = false; M.mirror = mirror;
  }
  M.captureEnv(scene);                                             // one-off cube maps for the polished floors
  canvas.addEventListener('webglcontextrestored', () => requestAnimationFrame(() => M.captureEnv(scene)));

  // ---------------------------------------------------------------------------------------------- controls, views, exposure
  const ctl = new Controls({ camera, dom: canvas, J, B });
  const EXPO = { ext: 0.23, lobby: 0.62, gallery: 0.95, med: 1.55 };
  for (const k of Object.keys(EXPO)) if (Q.has('exp_' + k)) EXPO[k] = +Q.get('exp_' + k);
  const ROOMS = ['gallery', 'med'].filter((r) => J.zones[r]);          // rooms entered from the lobby through one doorway each
  const zoneOf = (p) => {   // soft membership of the camera in the interior zones -> exposure; hard label -> tab
    const inBox = (b, m) => { const dx = Math.max(b[0] - p.x, p.x - b[3], 0), dz = Math.max(b[1] + p.z, -p.z - b[4], 0), dy = Math.max(p.y - b[5], 0); return 1 - Math.min(1, Math.hypot(dx, dz, dy) / m); };
    const y = -p.z, w = {}; let sum = 0, zone = null;
    for (const r of ROOMS) {
      const b = J.zones[r], q = (J.portals || {})[r]; let g = inBox(b, 3);
      const outside = p.x < b[0] || p.x > b[3];
      if (outside && q) g *= 1 - Math.min(1, Math.max(q[0] - y, y - q[1], 0));        // a room only "leaks" into the lobby through its doorway
      w[r] = g; sum += g; if (g > 0 && p.x > b[0] - 0.2 && p.x < b[3] + 0.2) zone = r;
    }
    if (sum > 1) for (const r of ROOMS) w[r] /= sum;
    const l = inBox(J.zones.lobby, 5) * (1 - Math.min(1, sum));
    return { w, l, e: Math.max(0, 1 - Math.min(1, sum) - l), zone: zone || (l >= 0.5 ? 'lobby' : 'plaza') };
  };
  let expo = EXPO.ext;
  const ui = setupUI(ctl);

  // ---- size: CSS box and drawing buffer come from the same element; pixel ratio is re-read on every resize
  const DPR_CAP = Q.has('dpr') ? +Q.get('dpr') : 2;
  let dprMax = Math.min(window.devicePixelRatio || 1, DPR_CAP), dpr = dprMax, pendingDpr = 0;
  function resize() {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    dprMax = Math.min(window.devicePixelRatio || 1, DPR_CAP); dpr = Math.min(dpr, dprMax);
    renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  resize(); window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(() => { resize(); if (SHOT) step(0); }).observe(canvas);

  function step(dt, noRender) {
    M.time.value += dt; ctl.update(dt);
    const z = zoneOf(camera.position); let target = z.e * EXPO.ext + z.l * EXPO.lobby; for (const r of ROOMS) target += z.w[r] * EXPO[r];
    if (SHOT || dt === 0 || ctl.jumped) { expo = target; ctl.jumped = false; } else expo += (target - expo) * (1 - Math.exp(-dt * 2.2));
    renderer.toneMappingExposure = expo;
    // Each zone was lit for its own exposure. Seen from another zone it is pulled part of the way back (like the eye's local
    // adaptation), so the plaza is not a white-out from the lobby and the lobby is not a black box from the plaza.
    const k = (zn) => Math.pow(EXPO[zn] / expo, 0.4), ge = k('ext');
    M.setZoneGain({ ext: ge, lobby: k('lobby'), gallery: k('gallery'), med: k('med') });
    skyUniforms.uSkyGain.value = SKY_GAIN * ge; skyUniforms.uHaze.value.copy(HAZE).multiplyScalar(ge); scene.fog.color.copy(HAZE).multiplyScalar(ge);
    if (ring) ring.material.color.copy(RING).multiplyScalar(ge);
    const low = camera.position.y < 3.0;                             // eye level: trees stay solid; orbit: a tree in the lens' way dissolves
    M.treeFade.value.set(low ? 0.5 : 7.0, low ? 1.3 : 10.5);
    if (M.mirror) M.mirror.visible = z.e > 0.35 || z.l > 0.3;       // never needed from inside the galleries
    if (medPlug) {
      const lb = J.zones.lobby, p = camera.position, near = p.x > lb[0] - 1 && p.x < lb[3] + 6 && -p.z > lb[1] - 6 && -p.z < lb[4] + 1 && p.y < lb[5];
      let show = z.w.med > 0;
      if (!show && near) { pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pv); show = frustum.intersectsBox(medPlug.userData.door); }   // from the lobby: only while the doorway is in view
      if (show === medPlug.visible) { medPlug.visible = !show; for (const m of medMeshes) m.visible = show; }
      if (!warmStarted && (ctl.mode === 'walk' || show)) {
        warmStarted = true; const seen = new Set();
        for (const m of medMeshes) for (const k of ['map', 'lightMap', 'alphaMap']) { const t = m.material[k]; if (t && !seen.has(t)) { seen.add(t); medWarm.push(t); } }
      }
      if (medWarm.length && !noRender) renderer.initTexture(medWarm.pop());
    }
    ui.sync(z.zone);
    if (!noRender) renderer.render(scene, camera);
  }

  // ---- resolution governor: lower the pixel ratio when the frame rate stays clearly below the display's, try going back up later
  let last = performance.now(), best = 1 / 30, avg = 0, slow = 0, good = 0, grace = 30, retryAt = 0, retryWait = 20;
  document.addEventListener('visibilitychange', () => { grace = 30; });
  function frame(now) {
    if (pendingDpr) { dpr = pendingDpr; pendingDpr = 0; resize(); }           // resize right before drawing: no blank frame
    const raw = (now - last) / 1000, dt = Math.min(0.1, raw); last = now;
    if (ctl.jumped) grace = 30;
    step(dt);
    if (!SHOT && !Q.has('dpr')) {
      if (raw >= 0.1 || grace > 0) { grace--; } else {
        best = Math.max(1 / 240, Math.min(best, dt)); avg = avg ? avg + (dt - avg) * 0.1 : dt;
        const limit = Math.max(1.4 * best, 0.020);
        if (avg > limit) { slow++; good = 0; } else { slow = 0; good++; }
        if (slow > 45 && dpr > 1) { pendingDpr = Math.max(1, dpr - 0.25); slow = 0; grace = 20; retryAt = now + retryWait * 1000; retryWait = Math.min(240, retryWait * 2); }
        else if (good > 300 && dpr < dprMax && now > retryAt) { pendingDpr = Math.min(dprMax, dpr + 0.25); good = 0; grace = 20; }
      }
    }
    requestAnimationFrame(frame);
  }
  ctl.setView(Q.get('view') || 'exterior', true); step(0);
  window.__museum = { renderer, scene, camera, ctl, step, stats, J, M, EXPO, loadMs: Math.round(performance.now() - t0), get dpr() { return dpr; },
    setCam(pos, look, fov) { ctl.freeze(B(pos), B(look), fov); step(0); }, setView(v) { ctl.setView(v, true); step(0); } };
  document.body.classList.add('ready'); window.__ready = true;
  if (!SHOT) requestAnimationFrame((n) => { last = n; requestAnimationFrame(frame); });
}

// ------------------------------------------------------------------------------------------------ minimal UI: three tabs + one hint line
function setupUI(ctl) {
  const tabs = [...document.querySelectorAll('#tabs button')], hint = document.getElementById('hint');
  const HINT = { exterior: '拖动环视建筑 · 滚轮或双指缩放', walk: '拖动转向 · 点击地面或按 WASD 行走 · 滚轮拉近' };
  let shown = null, timer = 0, curTab = null;
  const show = (k) => { if (shown === k || SHOT) return; shown = k; hint.textContent = HINT[k]; hint.classList.add('on'); clearTimeout(timer); timer = setTimeout(() => hint.classList.remove('on'), 6500); };
  tabs.forEach((b) => b.addEventListener('click', (e) => { ctl.setView(b.dataset.view); if (e.detail > 0) b.blur(); }));     // mouse clicks give the keyboard back to the scene
  window.addEventListener('keydown', (e) => { if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return; const v = { 1: 'exterior', 2: 'lobby', 3: 'gallery', 4: 'medieval' }[e.key]; if (v) ctl.setView(v); });
  if (SHOT) document.getElementById('ui').style.display = 'none';
  return { sync(zone) {
    const cur = ctl.mode === 'orbit' ? 'exterior' : zone === 'med' ? 'medieval' : zone;
    if (cur !== curTab) { curTab = cur; tabs.forEach((b) => { const on = b.dataset.view === cur; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }); }
    show(ctl.mode === 'orbit' ? 'exterior' : 'walk');
  } };
}

main().catch((e) => {
  console.error(e); document.body.classList.add('fail');
  const el = document.getElementById('hint'); if (el) { el.textContent = '加载失败：' + (e && e.message ? e.message : e); el.classList.add('on'); }
});
