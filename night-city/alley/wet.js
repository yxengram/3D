import * as THREE from 'three';
import { fillUniforms, fillUniformsGLSL, fillLightingGLSL } from './lights.js';

export const wetUniforms = {
  uWetness: { value: 1 },
};

const NOISE = /* glsl */ `
  float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float wNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(wHash(i), wHash(i + vec2(1, 0)), u.x), mix(wHash(i + vec2(0, 1)), wHash(i + vec2(1, 1)), u.x), u.y);
  }
`;

// Makes a MeshStandardMaterial look rain-soaked: darker albedo, glossier surface,
// fully wet on top faces and with dripping streaks on vertical faces.
// porosity: how much the surface darkens when wet (brick/plaster high, metal/plastic low).
// All wet materials share one shader program; the per-material settings are uniforms.
export function wetify(material, { porosity = 0.5, gloss = 0.6, streaks = 1 } = {}) {
  if (!material || !material.isMeshStandardMaterial || material.userData.wet) return material;
  material.userData.wet = true;
  const params = { value: new THREE.Vector3(porosity, gloss, streaks) };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWetness = wetUniforms.uWetness;
    shader.uniforms.uWetParams = params;
    Object.assign(shader.uniforms, fillUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWetPos;\nvarying vec3 vWetN;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vWetPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWetN = normalize(mat3(modelMatrix) * objectNormal);`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWetPos;\nvarying vec3 vWetN;\nuniform float uWetness;\nuniform vec3 uWetParams;\n${fillUniformsGLSL}\n${NOISE}`)
      .replace('#include <aomap_fragment>', `${fillLightingGLSL('vWetPos')}\n#include <aomap_fragment>`)
      .replace(
        '#include <lights_physical_fragment>',
        `{
          vec3 wn = normalize(vWetN);
          float up = clamp(wn.y, 0.0, 1.0);
          float vertical = 1.0 - abs(wn.y);
          vec2 sp = vec2((vWetPos.x + vWetPos.z) * 7.0, vWetPos.y * 0.35);
          float streak = smoothstep(0.35, 0.85, wNoise(sp) * 0.7 + wNoise(sp * vec2(2.3, 1.7)) * 0.3);
          float wet = uWetness * clamp(0.45 + 0.55 * up + vertical * streak * uWetParams.z * 0.55, 0.0, 1.0);
          diffuseColor.rgb *= mix(1.0, 1.0 - uWetParams.x * 0.55, wet);
          roughnessFactor = mix(roughnessFactor, roughnessFactor * (1.0 - uWetParams.y), wet);
        }
        #include <lights_physical_fragment>`
      );
  };
  material.customProgramCacheKey = () => 'wet';
  material.needsUpdate = true;
  return material;
}
