import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { rand } from './config.js';

// Facade styles. Everything except the wall surface is procedural, so frames stay crisp at any distance.
//   wall:   scanned texture set used between the windows
//   cell:   window module size in metres [width, floor height]; rooms span `roomCells` modules
//   win:    window opening inside a module, as fractions [x0, y0, x1, y1]
//   frame:  [frame width (m), panes across, transom height (fraction, 0 = none), stone sill (0/1)]
//   room:   [depth (m), chance a room is lit, chance of blinds, chance of curtains]
//   lights: palette of interior light colours (linear RGB), picked 40/40/20
const WARM = [1.0, 0.7, 0.42];
const NEUTRAL = [1.0, 0.9, 0.76];
const COOL = [0.78, 0.9, 1.0];
const TV = [0.55, 0.7, 1.0];

export const STYLES = {
  office: {
    wall: 'concrete_tile_facade', tint: [0.95, 0.97, 1.0], cell: [2.5, 3.5], roomCells: 2,
    win: [0.1, 0.17, 0.9, 0.86], frame: [0.06, 2, 0.74, 0], frameColor: [0.05, 0.055, 0.06],
    room: [5.5, 0.36, 0.45, 0.0], lights: [NEUTRAL, COOL, WARM],
  },
  office2: {
    wall: 'rectangular_facade_tiles_02', tint: [1, 1, 1], cell: [2.6, 3.6], roomCells: 2,
    win: [0.17, 0.22, 0.83, 0.84], frame: [0.07, 2, 0, 1], frameColor: [0.1, 0.09, 0.08],
    room: [5, 0.38, 0.4, 0.1], lights: [NEUTRAL, WARM, COOL],
  },
  glass: {
    wall: 'concrete_tile_facade', tint: [0.5, 0.53, 0.58], cell: [1.6, 3.6], roomCells: 3,
    win: [0.0, 0.19, 1.0, 1.0], frame: [0.05, 1, 0, 0], frameColor: [0.17, 0.19, 0.22], spandrel: 1,
    room: [7, 0.42, 0.3, 0.0], lights: [COOL, NEUTRAL, WARM],
  },
  ribbon: {
    wall: 'exterior_wall_cladding_03', tint: [0.86, 0.88, 0.92], cell: [3.0, 3.6], roomCells: 2,
    win: [0.0, 0.42, 1.0, 0.93], frame: [0.05, 2, 0, 0], frameColor: [0.09, 0.1, 0.11],
    room: [5.5, 0.42, 0.5, 0.0], lights: [COOL, NEUTRAL, WARM],
  },
  resi: {
    wall: 'exterior_wall_cladding_02', tint: [1, 1, 1], cell: [3.0, 3.0], roomCells: 1,
    win: [0.22, 0.22, 0.78, 0.84], frame: [0.06, 2, 0, 1], frameColor: [0.8, 0.78, 0.73],
    room: [4, 0.4, 0.15, 0.55], lights: [WARM, NEUTRAL, TV],
  },
  resi2: {
    wall: 'beige_wall_002', tint: [0.92, 0.86, 0.78], cell: [3.0, 3.0], roomCells: 1,
    win: [0.24, 0.24, 0.76, 0.82], frame: [0.07, 2, 0.7, 1], frameColor: [0.28, 0.21, 0.16],
    room: [4, 0.42, 0.15, 0.6], lights: [WARM, WARM, TV],
  },
  brick: {
    wall: 'brick_wall_001', tint: [0.95, 0.92, 0.9], cell: [3.0, 3.0], roomCells: 1,
    win: [0.24, 0.2, 0.76, 0.8], frame: [0.06, 2, 0.72, 1], frameColor: [0.82, 0.8, 0.76],
    room: [4, 0.4, 0.2, 0.5], lights: [WARM, NEUTRAL, TV],
  },
  deco: {
    wall: 'white_sandstone_blocks_02', tint: [0.95, 0.88, 0.76], cell: [2.5, 3.5], roomCells: 2,
    win: [0.22, 0.2, 0.78, 0.8], frame: [0.06, 2, 0.72, 1], frameColor: [0.08, 0.07, 0.05],
    room: [5, 0.4, 0.3, 0.3], lights: [WARM, NEUTRAL, COOL],
  },
};

const VERTEX_DECL = /* glsl */ `
  attribute float seed;
  varying vec3 vFPos;
  varying vec3 vFN;
  varying vec2 vCell;
  varying float vSeed;
`;

const VERTEX_MAIN = /* glsl */ `
  vFPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vFN = normalize(mat3(modelMatrix) * objectNormal);
  vCell = uv;
  vSeed = seed;
`;

const FRAGMENT_DECL = /* glsl */ `
  varying vec3 vFPos;
  varying vec3 vFN;
  varying vec2 vCell;
  varying float vSeed;
  uniform sampler2D uWallMap;
  uniform sampler2D uWallNormal;
  uniform sampler2D uWallArm;
  uniform vec3 uWallTint;
  uniform float uWallSize;
  uniform vec3 uCell;
  uniform vec4 uWin;
  uniform vec4 uFrame;
  uniform vec3 uFrameColor;
  uniform vec4 uRoom;
  uniform float uSpandrel;
  uniform vec3 uLightA;
  uniform vec3 uLightB;
  uniform vec3 uLightC;
  uniform float uTime;
  uniform float uWindowGain;

  float fHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  vec3 fHash3(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yxz + 33.33);
    return fract((p3.xxy + p3.yzz) * p3.zyx);
  }
  // box-filtered step / pulse: anti-aliased edges that fade to their average when far away
  float fStep(float e, float x, float w) { return clamp((x - e) / w + 0.5, 0.0, 1.0); }
  float fPulse(float a, float b, float x, float w) { return fStep(a, x, w) - fStep(b, x, w); }
`;

// Computes albedo, roughness, metalness, world normal and emissive for the facade.
const FRAGMENT_FACADE = /* glsl */ `
  vec3 fN = normalize(vFN);
  vec3 fAlbedo = vec3(0.04);
  float fRough = 0.9;
  float fMetal = 0.0;
  vec3 fNW = fN;
  vec3 fEmit = vec3(0.0);
  if (abs(fN.y) < 0.5) {
    vec3 fV = normalize(vFPos - cameraPosition);
    vec3 fT = normalize(cross(vec3(0.0, 1.0, 0.0), fN));
    vec3 fB = vec3(0.0, 1.0, 0.0);
    vec2 cellId = floor(vCell);
    vec2 f = fract(vCell);
    vec2 fw = max(fwidth(vCell), vec2(1e-4));

    // wall surface from the scanned texture, in metres along the facade
    vec2 wuv = vCell * uCell.xy / uWallSize;
    vec3 wall = texture2D(uWallMap, wuv).rgb * uWallTint;
    float wallRough = texture2D(uWallArm, wuv).g;
    vec3 wn = texture2D(uWallNormal, wuv).xyz * 2.0 - 1.0;

    // window opening, frame, glazing bars, sill
    float frW = uFrame.x / uCell.x;
    float frH = uFrame.x / uCell.y;
    float win = fPulse(uWin.x, uWin.z, f.x, fw.x) * fPulse(uWin.y, uWin.w, f.y, fw.y);
    float inner = fPulse(uWin.x + frW, uWin.z - frW, f.x, fw.x) * fPulse(uWin.y + frH, uWin.w - frH, f.y, fw.y);
    float bars = 0.0;
    for (int k = 1; k < 4; k++) {
      if (float(k) >= uFrame.y) break;
      float xm = mix(uWin.x, uWin.z, float(k) / uFrame.y);
      bars = max(bars, fPulse(xm - frW * 0.5, xm + frW * 0.5, f.x, fw.x));
    }
    if (uFrame.z > 0.0) {
      float ym = mix(uWin.y, uWin.w, uFrame.z);
      bars = max(bars, fPulse(ym - frH * 0.5, ym + frH * 0.5, f.y, fw.y));
    }
    float pane = inner * (1.0 - bars);
    float frame = clamp(win - pane, 0.0, 1.0);
    float sill = uFrame.w * fPulse(uWin.y - 0.045, uWin.y, f.y, fw.y) * fPulse(uWin.x - 0.04, uWin.z + 0.04, f.x, fw.x);
    float spandrel = uSpandrel * (1.0 - fStep(uWin.y, f.y, fw.y));
    // rain streaks of grime running down from the window corners
    float drip = fPulse(uWin.x, uWin.z, f.x, fw.x) * (1.0 - fStep(uWin.y, f.y, fw.y));
    drip *= 0.5 + 0.5 * sin(vCell.x * 41.0 + cellId.y * 3.1);
    wall *= 1.0 - 0.2 * drip * (1.0 - spandrel);

    // ---- the room behind the glass (interior mapping) ----
    float roomCells = uCell.z;
    float roomX = floor(vCell.x / roomCells);
    vec2 roomId = vec2(roomX, cellId.y);
    vec3 rnd = fHash3(roomId + vSeed * vec2(1.731, 0.917));
    float floorRnd = fHash(vec2(cellId.y, vSeed * 3.17));
    // rooms switch their lights on and off every minute or two
    float epoch = floor(uTime / (60.0 + rnd.z * 140.0) + rnd.y * 9.0);
    float litRnd = fHash(roomId * 1.37 + vec2(epoch * 0.71, vSeed));
    float chance = floorRnd < 0.12 ? 0.92 : (floorRnd > 0.88 ? 0.04 : uRoom.y);
    float lit = step(litRnd, chance);
    vec3 lightCol = rnd.y < 0.4 ? uLightA : (rnd.y < 0.8 ? uLightB : uLightC);
    float gain = (0.55 + 0.75 * rnd.x) * uWindowGain;

    vec3 rd = vec3(dot(fV, fT), dot(fV, fB), dot(fV, fN));
    rd.z = min(rd.z, -0.03);
    float W = uCell.x * roomCells;
    float H = uCell.y;
    float D = uRoom.x * (0.75 + 0.5 * rnd.z);
    vec3 p0 = vec3((vCell.x - roomX * roomCells) * uCell.x, f.y * H, 0.0);
    vec3 tt = vec3(
      rd.x > 0.0 ? (W - p0.x) / rd.x : p0.x / max(-rd.x, 1e-4),
      rd.y > 0.0 ? (H - p0.y) / rd.y : p0.y / max(-rd.y, 1e-4),
      -D / rd.z);
    float t = min(tt.x, min(tt.y, tt.z));
    vec3 hp = p0 + rd * t;
    vec3 wallC = mix(vec3(0.8, 0.74, 0.64), vec3(0.62, 0.67, 0.75), fract(rnd.y * 5.3));
    vec3 roomCol;
    float edge;
    if (t == tt.z) {
      vec2 buv = vec2(hp.x / W, hp.y / H);
      roomCol = wallC;
      float deskX = 0.2 + fract(rnd.x * 3.1) * 0.6;
      roomCol *= 1.0 - 0.75 * step(buv.y, 0.3) * step(abs(buv.x - deskX), 0.22);
      float art = step(abs(buv.y - 0.62), 0.11) * step(abs(buv.x - 0.5 + (rnd.z - 0.5) * 0.4), 0.12) * step(0.45, rnd.x);
      roomCol = mix(roomCol, vec3(0.25 + rnd.z * 0.5, 0.3, 0.55 - rnd.x * 0.3), art);
      edge = min(min(hp.x, W - hp.x), min(hp.y, H - hp.y));
    } else if (t == tt.x) {
      roomCol = wallC * 0.8;
      edge = min(min(-hp.z, D + hp.z), min(hp.y, H - hp.y));
    } else if (rd.y > 0.0) {
      roomCol = vec3(0.88);
      edge = min(min(hp.x, W - hp.x), min(-hp.z, D + hp.z));
    } else {
      roomCol = mix(vec3(0.34, 0.23, 0.15), vec3(0.27, 0.28, 0.31), fract(rnd.y * 7.7));
      edge = min(min(hp.x, W - hp.x), min(-hp.z, D + hp.z));
    }
    vec3 lamp = vec3(W * 0.5, H - 0.08, -D * 0.5);
    float dl = length(hp - lamp);
    float illum = (0.3 + 1.5 / (1.0 + dl * dl * 0.3)) * (0.55 + 0.45 * smoothstep(0.0, 0.7, edge));
    float onCeiling = (t == tt.y && rd.y > 0.0) ? 1.0 : 0.0;
    float fixture = onCeiling * step(abs(hp.x - lamp.x), 0.4) * step(abs(hp.z - lamp.z), 0.28);
    vec3 interiorLit = (roomCol * illum + fixture * 1.6) * lightCol * gain;
    vec3 interiorDark = roomCol * illum * vec3(0.01, 0.012, 0.018);
    float tv = step(0.95, rnd.z) * (0.65 + 0.35 * sin(uTime * 7.0 + rnd.x * 40.0) * sin(uTime * 2.3 + rnd.y * 9.0));
    interiorDark += vec3(0.08, 0.13, 0.32) * tv * illum;
    vec3 interior = mix(interiorDark, interiorLit, lit);

    // blinds pulled down from the top, or curtains drawn in from the sides
    vec2 pf = vec2((f.x - uWin.x) / (uWin.z - uWin.x), (f.y - uWin.y) / (uWin.w - uWin.y));
    if (rnd.z < uRoom.z) {
      float coverage = 0.15 + fract(rnd.x * 7.13) * 0.75;
      float cov = fStep(1.0 - coverage, pf.y, fw.y * 2.0);
      float slats = (uWin.w - uWin.y) * H / 0.09;
      float slat = mix(0.5 + 0.5 * smoothstep(0.15, 0.55, fract(pf.y * slats)), 0.75, smoothstep(0.3, 0.8, fw.y * slats));
      vec3 blind = mix(vec3(0.012), lightCol * gain * 0.6, lit) * slat;
      interior = mix(interior, blind, cov * 0.92);
    } else if (rnd.z > 1.0 - uRoom.w) {
      float cw = 0.14 + 0.3 * fract(rnd.x * 3.7);
      float cur = max(1.0 - fStep(cw, pf.x, fw.x * 2.0), fStep(1.0 - cw, pf.x, fw.x * 2.0));
      float fold = mix(0.72 + 0.28 * sin(pf.x * 70.0), 0.86, smoothstep(0.02, 0.06, fw.x));
      vec3 cloth = mix(vec3(0.62, 0.3, 0.2), vec3(0.78, 0.7, 0.56), fract(rnd.y * 11.0));
      interior = mix(interior, mix(cloth * 0.012, cloth * lightCol * gain * 0.8 * fold, lit), cur);
    }
    // far away a window is a few pixels at most: use its average instead of a flickering detail
    float farMix = smoothstep(0.22, 0.6, max(fw.x, fw.y));
    vec3 avgRoom = mix(vec3(0.008, 0.01, 0.016), lightCol * gain * 0.6, lit);
    interior = mix(interior, avgRoom, farMix);

    float NdV = clamp(dot(fN, -fV), 0.0, 1.0);
    float fres = 0.04 + 0.96 * pow(1.0 - NdV, 5.0);

    // compose the layers
    fAlbedo = wall;
    fRough = wallRough;
    fNW = normalize(fT * wn.x + fB * wn.y + fN * wn.z);
    fAlbedo = mix(fAlbedo, vec3(0.022, 0.026, 0.034), spandrel);
    fRough = mix(fRough, 0.1, spandrel);
    fMetal = mix(fMetal, 0.6, spandrel);
    fAlbedo = mix(fAlbedo, vec3(0.5, 0.48, 0.45), sill);
    fAlbedo = mix(fAlbedo, uFrameColor, frame);
    fRough = mix(fRough, 0.38, frame);
    fMetal = mix(fMetal, 0.7, frame);
    float smoothSurface = max(max(spandrel, frame), pane);
    fNW = normalize(mix(fNW, fN, smoothSurface));
    fAlbedo = mix(fAlbedo, vec3(0.008, 0.01, 0.012), pane);
    fRough = mix(fRough, 0.035, pane);
    fMetal = mix(fMetal, 0.0, pane);
    fEmit = interior * pane * (1.0 - fres);
    // warm light from the street lamps washing up the lower floors
    fEmit += fAlbedo * vec3(1.0, 0.62, 0.32) * 0.3 * exp(-max(vFPos.y - 4.5, 0.0) / 7.0) * (1.0 - pane);
  }
  diffuseColor.rgb = fAlbedo;
`;

function rgb(a) {
  return new THREE.Vector3(a[0], a[1], a[2]);
}

// One MeshStandardMaterial per style; they all share a single shader program.
export function createFacadeMaterials(tex) {
  const shared = { uTime: { value: 0 }, uWindowGain: { value: 0.95 } };
  const mats = {};
  for (const [name, S] of Object.entries(STYLES)) {
    const set = tex[S.wall];
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
    const uniforms = {
      uWallMap: { value: set.map },
      uWallNormal: { value: set.normal },
      uWallArm: { value: set.arm },
      uWallTint: { value: rgb(S.tint) },
      uWallSize: { value: set.size },
      uCell: { value: new THREE.Vector3(S.cell[0], S.cell[1], S.roomCells) },
      uWin: { value: new THREE.Vector4(...S.win) },
      uFrame: { value: new THREE.Vector4(...S.frame) },
      uFrameColor: { value: rgb(S.frameColor) },
      uRoom: { value: new THREE.Vector4(...S.room) },
      uSpandrel: { value: S.spandrel || 0 },
      uLightA: { value: rgb(S.lights[0]) },
      uLightB: { value: rgb(S.lights[1]) },
      uLightC: { value: rgb(S.lights[2]) },
    };
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, shared, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${VERTEX_DECL}`)
        .replace('#include <project_vertex>', `#include <project_vertex>\n${VERTEX_MAIN}`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${FRAGMENT_DECL}`)
        .replace('#include <map_fragment>', FRAGMENT_FACADE)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = fRough;')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = fMetal;')
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize((viewMatrix * vec4(fNW, 0.0)).xyz);')
        .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance = fEmit;');
    };
    m.customProgramCacheKey = () => 'city-facade';
    mats[name] = m;
  }
  return { mats, shared };
}

// ---------- geometry ----------
// UVs are in window-module units: x = module index along the facade, y = floor index.
// Integer offsets per building keep floors aligned; `seed` makes each building and side unique.
export function facadeBox(style, w, h, d, rot = 0) {
  const S = STYLES[style];
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const seeds = new Float32Array(uv.count);
  const floors = h / S.cell[1];
  const uo = Math.floor(rand() * 50);
  const vo = Math.floor(rand() * 50);
  const seed = rand() * 997;
  for (let f = 0; f < 6; f++) {
    const span = f < 2 ? d : w;
    const n = Math.max(1, Math.round(span / S.cell[0]));
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      seeds[i] = seed + f * 17.3;
      uv.setXY(i, uv.getX(i) * n + uo, uv.getY(i) * floors + vo);
    }
  }
  g.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
  g.translate(0, h / 2, 0);
  if (rot) g.rotateY(rot);
  return g;
}

// Round or faceted (flat = true) tower section.
export function facadeCyl(style, rt, rb, h, seg, flat = false) {
  const S = STYLES[style];
  let g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, false);
  const uv = g.attributes.uv;
  const r = (rt + rb) / 2;
  const n = flat
    ? seg * Math.max(1, Math.round((2 * r * Math.sin(Math.PI / seg)) / S.cell[0]))
    : Math.max(1, Math.round((2 * Math.PI * r) / S.cell[0]));
  const floors = h / S.cell[1];
  const uo = Math.floor(rand() * 50);
  const vo = Math.floor(rand() * 50);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * n + uo, uv.getY(i) * floors + vo);
  g.setAttribute('seed', new THREE.BufferAttribute(new Float32Array(uv.count).fill(rand() * 997), 1));
  if (flat) {
    g = g.toNonIndexed();
    g.computeVertexNormals();
    g = mergeVertices(g);
  }
  g.translate(0, h / 2, 0);
  return g;
}
