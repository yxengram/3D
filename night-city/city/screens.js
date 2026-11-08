import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Animated LED video walls: each cycles through the adverts with a wipe, scanlines and a visible pixel grid.
export function buildScreens({ scene, spots: chosen, adTex, adCount }) {
  if (!chosen.length) return { update() {} };

  const geos = chosen.map((s, i) => {
    const g = new THREE.PlaneGeometry(s.w, s.h);
    g.translate(0, s.y0 + s.h / 2, s.nOff);
    g.rotateY(s.a);
    g.translate(s.x, 0, s.z);
    g.setAttribute('aIdx', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(i), 1));
    return g;
  });
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, tAds: { value: null } }]);
  uniforms.tAds.value = adTex;
  const mat = new THREE.ShaderMaterial({
    uniforms,
    fog: true,
    vertexShader: /* glsl */ `
      attribute float aIdx;
      varying vec2 vUv;
      varying float vIdx;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv;
        vIdx = aIdx;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform sampler2D tAds;
      varying vec2 vUv;
      varying float vIdx;
      #include <fog_pars_fragment>
      vec3 ad(float k, vec2 uv) {
        float i = mod(floor(k), ${adCount.toFixed(1)});
        vec2 cell = vec2(mod(i, 2.0), floor(i / 2.0));
        return texture2D(tAds, vec2((cell.x + uv.x) / 2.0, 1.0 - (cell.y + 1.0 - uv.y) / ${(adCount / 2).toFixed(1)})).rgb;
      }
      void main() {
        float tt = uTime + vIdx * 2.9;
        float slot = floor(tt / 8.0);
        float local = fract(tt / 8.0);
        vec2 zoom = (vUv - 0.5) * (1.0 - 0.06 * local) + 0.5;
        vec3 now = ad(slot + vIdx * 1.7, zoom);
        vec3 next = ad(slot + 1.0 + vIdx * 1.7, vUv);
        float wipe = smoothstep(0.88, 1.0, local);
        vec3 col = mix(now, next, step(vUv.x, wipe));
        col += vec3(0.6, 0.9, 1.0) * 0.6 * (1.0 - smoothstep(0.0, 0.015, abs(vUv.x - wipe))) * step(0.001, wipe);
        col *= 0.9 + 0.1 * sin(vUv.y * 50.0 - uTime * 5.0);
        vec2 grid = vUv * vec2(192.0, 108.0);
        vec2 cellF = abs(fract(grid) - 0.5);
        float dots = 1.0 - smoothstep(0.3, 0.5, max(cellF.x, cellF.y));
        float fw = max(fwidth(grid.x), fwidth(grid.y));
        col *= mix(0.5 + 0.5 * dots, 0.78, smoothstep(0.3, 1.0, fw));
        gl_FragColor = vec4(col * 2.3, 1.0);
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
  geos.forEach((g) => g.dispose());
  scene.add(mesh);
  return {
    update(t) {
      uniforms.uTime.value = t;
    },
  };
}
