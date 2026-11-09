// ctx: everything a scene module receives. See MODULE_GUIDE.md.
import * as THREE from 'three';
import * as layout from './layout.js';
import { P } from './palette.js';
import * as kit from './kit.js';
import { toon, shared } from './toon.js';
import { canvasTexture, surfaceTexture } from './textures.js';
import { waterMaterial, causticMaterial, addRipple } from './water.js';

export function seeded(str) {
  let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  let a = h >>> 0;
  const r = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  r.range = (lo, hi) => lo + r() * (hi - lo);
  r.int = (lo, hi) => Math.floor(lo + r() * (hi - lo + 1));
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.sign = () => (r() < 0.5 ? -1 : 1);
  return r;
}

// Named surfaces. World-tiling UV scale `uv` (texture repeats per unit), default moss amount.
const SURFACES = {
  flat: { color: '#ffffff' },
  concrete: { tex: 'concrete', uv: 0.22, color: P.concrete, moss: 0.5 },
  concreteClean: { tex: 'concrete', uv: 0.22, color: P.concrete },
  plaster: { tex: 'plaster', uv: 0.2, color: P.plaster, moss: 0.34 },
  asphalt: { tex: 'asphalt', uv: 0.18, color: P.asphalt, moss: 0.34 },
  tile: { tex: 'tile', uv: 0.45, color: '#ffffff', moss: 0.42 },
  rust: { tex: 'rust', uv: 0.8, color: P.rust },
  wood: { tex: 'wood', uv: 0.6, color: P.wood },
  soil: { tex: 'soil', uv: 0.3, color: P.soil, moss: 0.5 },
  mossy: { tex: 'moss', uv: 0.5, color: P.moss },
};

const matCache = new Map();
export function surface(name, { vertexColors = false, ...over } = {}) {
  const key = name + (vertexColors ? '|vc' : '') + JSON.stringify(over);
  if (matCache.has(key)) return matCache.get(key);
  const s = SURFACES[name];
  if (!s) throw new Error(`unknown surface "${name}" (have ${Object.keys(SURFACES).join(', ')})`);
  const m = toon({ color: s.color, map: s.tex ? surfaceTexture(s.tex) : null, moss: s.moss || 0, vertexColors, ...over });
  m.userData.uv = s.uv || 0; m.name = name;
  matCache.set(key, m);
  return m;
}

/** Batch: merge many parts into one mesh per material. */
export class Batch {
  constructor() { this.parts = new Map(); }
  /** @param geometry BufferGeometry  @param material surface name, or a Material
   *  @param o {pos:[x,y,z], rot:[x,y,z], scale, matrix, color}  color tints via vertex colors. */
  add(geometry, material = 'flat', o = {}) {
    const g = (geometry.index ? geometry.toNonIndexed() : geometry.clone());
    if (!g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(kit.xf(o));
    if (o.matrix == null && (o.scale !== undefined) && Array.isArray(o.scale)) g.computeVertexNormals();
    const c = new THREE.Color(o.color ?? '#ffffff');
    const n = g.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    const key = typeof material === 'string' ? material : material.uuid;
    if (!this.parts.has(key)) this.parts.set(key, { material, geos: [] });
    this.parts.get(key).geos.push(g);
    return this;
  }
  /** Returns a Group holding one merged Mesh per material. */
  build({ castShadow = true, receiveShadow = true } = {}) {
    const group = new THREE.Group();
    for (const { material, geos } of this.parts.values()) {
      let m;
      if (typeof material === 'string') m = surface(material, { vertexColors: true });
      else { m = material; if (!m.vertexColors) { m = m.clone(); m.onBeforeCompile = material.onBeforeCompile; m.customProgramCacheKey = material.customProgramCacheKey; m.vertexColors = true; } }
      const g = kit.merge(geos);
      if (m.userData?.uv) kit.worldUV(g, m.userData.uv);
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = castShadow; mesh.receiveShadow = receiveShadow;
      group.add(mesh);
    }
    return group;
  }
}

export function makeCtx(moduleName, extras = {}) {
  return {
    THREE, layout, P, kit, shared, name: moduleName,
    rng: seeded(moduleName),
    seeded,
    toon, surface,
    batch: () => new Batch(),
    canvasTexture,
    water: waterMaterial, caustic: causticMaterial, addRipple,
    time: () => shared.uTime.value,
    /** Exclude a transparent object (and subtree) from outlines entirely (water, glass, shafts, particles, mist). */
    noOutline(o) { o.traverse((c) => c.layers.set(1)); return o; },
    /** Opaque object that must occlude outlines but draw none itself (dense leaves, grass, tiny petals). */
    softEdge(o) { o.traverse((c) => c.layers.set(2)); return o; },
    /** Shared gust signal in [-1,1], coherent across the scene, drifting with x,z. */
    wind(t, x = 0, z = 0) {
      const a = t * 0.9 - x * 0.09 + z * 0.06;
      return 0.55 * Math.sin(a) + 0.3 * Math.sin(a * 2.17 + 1.3) + 0.15 * Math.sin(a * 3.9 + 0.4);
    },
    ...extras,
  };
}
