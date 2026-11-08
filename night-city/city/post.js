import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// HDR scene with 4x MSAA -> bloom -> tone mapping -> vignette and film grain.
export function createPost(renderer, scene, camera) {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.7, 0.5, 0.8);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float uTime;
      uniform vec2 uRes;
      varying vec2 vUv;
      float rnd(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        vec3 c = texture2D(tDiffuse, vUv).rgb;
        vec2 d = vUv - 0.5;
        c *= 1.0 - 0.32 * smoothstep(0.12, 0.7, dot(d, d) * 2.2);
        c += (rnd(vUv * uRes + fract(uTime * 7.3) * 91.0) - 0.5) * 0.022;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  composer.addPass(grade);

  return {
    composer,
    bloom,
    setSize(width, height, ratio) {
      composer.setPixelRatio(ratio);
      composer.setSize(width, height);
      grade.uniforms.uRes.value.set(width * ratio, height * ratio);
    },
    render(time) {
      grade.uniforms.uTime.value = time;
      composer.render();
    },
  };
}
