import * as THREE from 'three';

// Lights that glow in the fog and light up the rain. Shared by the scatter pass and the rain shader.
export const MAX_LIGHTS = 32;

const entries = [];

export const lightUniforms = {
  uLightCount: { value: 0 },
  uLightPos: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3()) },
  uLightCol: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3()) },
  // xyz = spot direction, w = cos(outer angle); w < -1.5 marks a point light
  uLightSpot: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4(0, -1, 0, -2)) },
  uLightInner: { value: new Array(MAX_LIGHTS).fill(1) },
};

// strength scales how much the light shows up in the haze relative to its real intensity
export function registerHaze(light, strength = 1) {
  if (entries.length >= MAX_LIGHTS) {
    console.warn('haze light limit reached');
    return;
  }
  entries.push({ light, strength });
}

const tmpPos = new THREE.Vector3();
const tmpTarget = new THREE.Vector3();

export function updateLightUniforms() {
  updateFillUniforms();
  const u = lightUniforms;
  let n = 0;
  for (const { light, strength } of entries) {
    if (!light.visible || light.intensity <= 0) continue;
    light.getWorldPosition(tmpPos);
    u.uLightPos.value[n].copy(tmpPos);
    const k = light.intensity * strength;
    u.uLightCol.value[n].set(light.color.r * k, light.color.g * k, light.color.b * k);
    if (light.isSpotLight) {
      light.target.getWorldPosition(tmpTarget);
      const dir = tmpTarget.sub(tmpPos).normalize();
      u.uLightSpot.value[n].set(dir.x, dir.y, dir.z, Math.cos(light.angle));
      u.uLightInner.value[n] = Math.cos(light.angle * (1 - light.penumbra));
    } else {
      u.uLightSpot.value[n].set(0, -1, 0, -2);
      u.uLightInner.value[n] = 1;
    }
    n++;
  }
  u.uLightCount.value = n;
}

// ---------- cheap diffuse-only fill lights (neon and sign spill) ----------
// Full three.js lights cost a GGX evaluation per pixel each; sign light only needs coloured diffuse spill,
// since the glossy highlights already come from the planar reflection of the glowing sign itself.
export const MAX_FILL = 20;
const fills = [];
export const fillUniforms = {
  uFillCount: { value: 0 },
  uFillPos: { value: Array.from({ length: MAX_FILL }, () => new THREE.Vector3()) },
  uFillCol: { value: Array.from({ length: MAX_FILL }, () => new THREE.Vector3()) },
};

export function registerFill(obj, strength = 1) {
  if (fills.length >= MAX_FILL) {
    console.warn('fill light limit reached');
    return;
  }
  fills.push({ obj, strength });
}

function updateFillUniforms() {
  const u = fillUniforms;
  let n = 0;
  for (const { obj, strength } of fills) {
    if (!obj.visible || obj.intensity <= 0) continue;
    obj.getWorldPosition(u.uFillPos.value[n]);
    const k = obj.intensity * strength;
    u.uFillCol.value[n].set(obj.color.r * k, obj.color.g * k, obj.color.b * k);
    n++;
  }
  u.uFillCount.value = n;
}

export const fillUniformsGLSL = /* glsl */ `
  #define MAX_FILL ${MAX_FILL}
  uniform int uFillCount;
  uniform vec3 uFillPos[MAX_FILL];
  uniform vec3 uFillCol[MAX_FILL];
`;

// Inject before <aomap_fragment> in a MeshStandardMaterial; worldPos is a world-space position varying.
export const fillLightingGLSL = (worldPos) => /* glsl */ `
  {
    vec3 fN = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
    for (int i = 0; i < MAX_FILL; i++) {
      if (i >= uFillCount) break;
      vec3 Ld = uFillPos[i] - ${worldPos};
      float d2 = dot(Ld, Ld);
      float ndl = max(dot(fN, Ld * inversesqrt(d2)), 0.0);
      reflectedLight.directDiffuse += uFillCol[i] * (ndl / (d2 + 0.3)) * BRDF_Lambert(material.diffuseColor);
    }
  }
`;

// GLSL declarations matching lightUniforms
export const lightUniformsGLSL = /* glsl */ `
  #define MAX_LIGHTS ${MAX_LIGHTS}
  uniform int uLightCount;
  uniform vec3 uLightPos[MAX_LIGHTS];
  uniform vec3 uLightCol[MAX_LIGHTS];
  uniform vec4 uLightSpot[MAX_LIGHTS];
  uniform float uLightInner[MAX_LIGHTS];
`;
