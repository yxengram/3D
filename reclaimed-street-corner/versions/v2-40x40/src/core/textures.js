import * as THREE from 'three';
import { P } from './palette.js';
import { SUN_DIR } from './layout.js';

let rs = 1234;
const R = () => { rs = (rs * 1664525 + 1013904223) >>> 0; return rs / 4294967296; };

/** Create a repeat-wrapped sRGB CanvasTexture by drawing in draw(ctx2d,w,h). */
export function canvasTexture(w, h, draw, { srgb = true, repeat = true, filter = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: false });
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (filter) { t.anisotropy = 4; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; }
  return t;
}

const speckle = (g, w, h, n, colors, rMin, rMax, a) => {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[(R() * colors.length) | 0]; g.globalAlpha = a * (0.4 + R() * 0.6);
    const x = R() * w, y = R() * h, r = rMin + R() * (rMax - rMin);
    for (const [dx, dy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) {
      g.beginPath(); g.ellipse(x + dx, y + dy, r, r * (0.5 + R() * 0.5), R() * 3, 0, 6.3); g.fill();
    }
  }
  g.globalAlpha = 1;
};
const crack = (g, x, y, len, col, lw) => {
  g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.moveTo(x, y); let a = R() * 6.28;
  for (let i = 0; i < len; i++) { a += (R() - 0.5) * 1.1; x += Math.cos(a) * 14; y += Math.sin(a) * 14; g.lineTo(x, y); }
  g.stroke();
};
const fill = (g, w, h, c) => { g.fillStyle = c; g.fillRect(0, 0, w, h); };

const makers = {
  concrete: (g, w, h) => { fill(g, w, h, '#fff'); speckle(g, w, h, 60, ['#ecebe4', '#f2f0e9', '#e4e3dc'], 30, 110, 0.3); speckle(g, w, h, 400, ['#bdbdb4', '#f6f3ea'], 1, 3, 0.5); for (let i = 0; i < 5; i++) crack(g, R() * w, R() * h, 12, 'rgba(90,95,95,.5)', 1.3); },
  asphalt: (g, w, h) => { fill(g, w, h, '#fff'); speckle(g, w, h, 40, ['#dcdde0', '#c9cbd0'], 40, 120, 0.4); speckle(g, w, h, 1600, ['#9a9da4', '#ffffff', '#b8bac0'], 0.8, 2.2, 0.7); },
  tile: (g, w, h) => { fill(g, w, h, '#e7efe9'); const n = 4, s = w / n; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { g.fillStyle = `hsl(${150 + R() * 18},${16 + R() * 10}%,${82 + R() * 9}%)`; g.fillRect(x * s + 2, y * s + 2, s - 4, s - 4); } g.strokeStyle = 'rgba(120,135,130,.8)'; g.lineWidth = 3; for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, h); g.moveTo(0, i * s); g.lineTo(w, i * s); g.stroke(); } },
  moss: (g, w, h) => { fill(g, w, h, '#ffffff'); speckle(g, w, h, 240, ['#e4f6c0', '#c2e49a', '#a7d486'], 8, 34, 0.55); },
  rust: (g, w, h) => { fill(g, w, h, '#fff'); speckle(g, w, h, 90, ['#f2c9a8', '#d99a78', '#ffe0c8', '#b97a60'], 12, 60, 0.6); speckle(g, w, h, 500, ['#a2604a', '#ffd9c0'], 1, 3, 0.6); },
  wood: (g, w, h) => { fill(g, w, h, '#f4e4cf'); for (let y = 0; y < h; y += 4 + R() * 7) { g.strokeStyle = `rgba(120,85,55,${0.15 + R() * 0.35})`; g.lineWidth = 1 + R() * 2; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w * .3, y + R() * 8 - 4, w * .6, y + R() * 8 - 4, w, y); g.stroke(); } },
  soil: (g, w, h) => { fill(g, w, h, '#fff'); speckle(g, w, h, 70, ['#e8d9c6', '#cdb9a2'], 20, 70, 0.45); speckle(g, w, h, 700, ['#b89e86', '#fff2df', '#8f7a68'], 1, 4, 0.55); },
  plaster: (g, w, h) => { fill(g, w, h, '#fff'); speckle(g, w, h, 45, ['#f4efe4', '#fbf8ef', '#ece6d9'], 40, 130, 0.3); for (let i = 0; i < 3; i++) crack(g, R() * w, R() * h, 9, 'rgba(120,115,100,.45)', 1); },
};
const cache = new Map();
export function surfaceTexture(name) {
  if (!makers[name]) return null;
  if (!cache.has(name)) cache.set(name, canvasTexture(512, 512, makers[name]));
  return cache.get(name);
}

/** Tileable RGBA value-noise (R: low freq, G: mid, B: high, A: cellular-ish). Sampled in shaders as uNoise. */
export function noiseTexture(size = 256) {
  const octave = (cells) => {
    const g = new Float32Array(cells * cells).map(() => R());
    const smooth = (t) => t * t * (3 - 2 * t);
    return (u, v) => {
      const x = u * cells, y = v * cells, i = Math.floor(x), j = Math.floor(y), fx = smooth(x - i), fy = smooth(y - j);
      const at = (a, b) => g[((a % cells) + cells) % cells + (((b % cells) + cells) % cells) * cells];
      return (at(i, j) * (1 - fx) + at(i + 1, j) * fx) * (1 - fy) + (at(i, j + 1) * (1 - fx) + at(i + 1, j + 1) * fx) * fy;
    };
  };
  const o = [4, 8, 16, 32, 64].map(octave);
  const d = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size, k = (x + y * size) * 4;
    const a = o[0](u, v) * .55 + o[1](u, v) * .3 + o[2](u, v) * .15;
    const b = o[1](u, v) * .55 + o[2](u, v) * .3 + o[3](u, v) * .15;
    const c = o[2](u, v) * .5 + o[3](u, v) * .3 + o[4](u, v) * .2;
    d[k] = a * 255; d[k + 1] = b * 255; d[k + 2] = c * 255; d[k + 3] = o[3](u, v) * 255;
  }
  const t = new THREE.DataTexture(d, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}

/** Sky backdrop: screen-fixed painted gradient with crisp anime cumulus kept clear of the model's silhouette. The sun's glow is sunGlow(). */
export function skyTexture() {
  return canvasTexture(2048, 1280, (g, w, h) => {
    const l = g.createLinearGradient(0, 0, 0, h);
    l.addColorStop(0, P.skyTop); l.addColorStop(0.5, P.skyMid); l.addColorStop(0.82, '#e6f6ec'); l.addColorStop(1, P.skyLow);
    g.fillStyle = l; g.fillRect(0, 0, w, h);
    const cloud = (cx, base, width, height) => {
      const puffs = [];
      for (let i = 0; i < 15; i++) {
        const u = i / 14, x = cx + (u - 0.5) * width + (R() - 0.5) * width * 0.04, env = Math.pow(Math.sin(Math.PI * u), 0.75);
        puffs.push([x, base - env * height * (0.25 + R() * 0.32), (0.22 + 0.5 * env) * height * (0.65 + R() * 0.35)]);
      }
      const draw = (color, dy) => {
        g.save(); g.fillStyle = color; g.filter = 'blur(4px)';
        for (const [x, y, r] of puffs) { g.beginPath(); g.arc(x, y + dy, r, 0, 6.3); g.fill(); }
        for (let i = 0; i < 7; i++) { // a soft rounded belly instead of a ruled bottom edge
          const u = i / 6, x = cx + (u - 0.5) * width * 0.86, r = height * (0.16 + 0.1 * Math.sin(Math.PI * u) + R() * 0.05);
          g.beginPath(); g.ellipse(x, base + dy - r * 0.4, r * 1.9, r, 0, 0, 6.3); g.fill();
        }
        g.restore();
      };
      draw('#b9e6ec', 0); draw('#ffffff', -13);
    };
    cloud(w * 0.1, h * 0.71, 430, 120); cloud(w * 0.89, h * 0.62, 340, 90); cloud(w * 0.05, h * 0.3, 210, 46); cloud(w * 0.96, h * 0.86, 380, 80);
  }, { repeat: false, filter: false });
}

/**
 * The sun's glow over the sky: the sky's own canvas `screen` composite, as a camera-fixed layer so it can follow the real sun.
 * It draws first in the opaque queue, straight after the background, so all geometry and the mist cover it; on the noOutline
 * layer the ink pass never sees it. Call .aim(camera) before each render.
 */
export function sunGlow(sky) {
  const u = { tSky: { value: sky }, uXf: { value: sky.matrix }, uC: { value: new THREE.Vector2() }, uK: { value: new THREE.Vector2() }, uI: { value: 1 } };
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: /* glsl */`
      uniform sampler2D tSky; uniform mat3 uXf; uniform vec2 uC,uK; uniform float uI; varying vec2 vUv;
      void main(){
        vec4 s=texture2D(tSky,(uXf*vec3(vUv,1.)).xy);
        vec3 b=sRGBTransferOETF(s).rgb, g=vec3(1.,.941,.784)*.75*uI*max(0.,1.-length((vUv-uC)*uK));
        gl_FragColor=vec4(sRGBTransferEOTF(vec4(1.-(1.-b)*(1.-g),1.)).rgb-s.rgb,1.);
      }`,
    blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false,
  }));
  glow.frustumCulled = false; glow.renderOrder = -1000; glow.layers.set(1);
  const sunH = Math.hypot(SUN_DIR[0], SUN_DIR[2]), RADIUS = 0.62, TOP = 0.9, SWING = 0.3; // hero is side-lit from the right, so it gets the full swing
  glow.aim = (camera) => {
    camera.updateMatrixWorld();
    const e = camera.matrixWorld.elements, rl = Math.hypot(e[0], e[2]) || 1, rx = e[0] / rl, rz = e[2] / rl; // camera right, flat
    const side = (rx * SUN_DIR[0] + rz * SUN_DIR[2]) / sunH, ahead = (rz * SUN_DIR[0] - rx * SUN_DIR[2]) / sunH;
    u.uC.value.set(0.5 + SWING * side, (TOP - sky.offset.y) / sky.repeat.y);
    u.uK.value.set(camera.aspect, 1).multiplyScalar(sky.repeat.y / RADIUS);
    u.uI.value = THREE.MathUtils.smoothstep(ahead, -1, 0); // with the sun behind the camera there is nothing to glow
  };
  return glow;
}
