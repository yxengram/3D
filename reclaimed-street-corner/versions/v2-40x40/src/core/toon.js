// Central cel-shading. Everything opaque should come from here so that sun dapples, moss overlay,
// and the gradient ramp are consistent across modules.
import * as THREE from 'three';
import { SUN_DIR } from './layout.js';
import { noiseTexture } from './textures.js';

export const shared = {
  uTime: { value: 0 },
  uGobo: { value: null },
  uNoise: { value: null },
  uSunDir: { value: new THREE.Vector3(...SUN_DIR) },
  uRip: { value: Array.from({ length: 10 }, () => new THREE.Vector3(0, 0, -100)) }, // x,z,startTime
};
export const CANOPY_PLANE_Y = 15, GOBO_SIZE = 64; // gobo covers ±32 units

let gradient;
function gradientMap() {
  if (gradient) return gradient;
  // dotNL*.5+.5 → ramp. Faces turned away from the sun get NO direct light (no acne, clean cel terminator).
  const ramp = [0, 0, 0, 0, 165, 225, 255, 255];
  const d = new Uint8Array(ramp.flatMap((v) => [v, v, v, 255]));
  gradient = new THREE.DataTexture(d, 8, 1, THREE.RGBAFormat);
  gradient.magFilter = gradient.minFilter = THREE.NearestFilter; gradient.needsUpdate = true;
  return gradient;
}

const PARS = /* glsl */`
uniform sampler2D uGobo, uNoise; uniform float uTime; uniform vec3 uSunDir;
varying vec3 vWPos; varying vec3 vWNorm;
float dappleMask(vec3 p){
  float t=(${CANOPY_PLANE_Y.toFixed(1)}-p.y)/uSunDir.y;
  vec2 q=p.xz+uSunDir.xz*t;
  vec2 s=vec2(sin(uTime*.61+q.y*.22)+.5*sin(uTime*1.27+q.x*.5),cos(uTime*.47+q.x*.26)+.5*sin(uTime*1.1+q.y*.43))*.24;
  vec2 uv=q/${GOBO_SIZE.toFixed(1)}+.5;
  float wall=1.-smoothstep(.25,.6,abs(vWNorm.y));                     // walls always catch leaf-light, in finer spots
  vec2 fu=(q*(1.+.6*wall))/${GOBO_SIZE.toFixed(1)}+.5;
  float cover=texture2D(uGobo,uv).r;
  float f=.5*texture2D(uGobo,fu+s/${GOBO_SIZE.toFixed(1)}).g+.5*texture2D(uGobo,fu-s*1.35/${GOBO_SIZE.toFixed(1)}).b;
  float rim=smoothstep(11.,17.,max(abs(p.x),abs(p.z)));               // out in the open ring, walls obey the real sky,
  float ring=smoothstep(.4,.6,rim+(texture2D(uNoise,q*.23).r-.5)*6.*rim*(1.-rim)); // handing over along leaf-sized spots, never a ruled line
  return smoothstep(.56-.13*wall,.60-.13*wall,f+(1.-cover)*.9*(1.-wall*(1.-ring)));
}`;

/**
 * toon(opts): MeshToonMaterial with shared gradient and scene-wide features.
 *  Standard fields: color,map,side,transparent,opacity,emissive,emissiveIntensity,vertexColors…
 *  dapple (default true): tree-canopy light gobo applied to the sun term.
 *  moss (0..1, default 0): world-space green overlay on upward-facing surfaces.
 *  translucent (0..2, default 0): backlit glow when looking toward the sun (leaves, petals, thin cloth).
 */
export function toon(opts = {}) {
  const { dapple = true, moss = 0, translucent = 0, ...std } = opts;
  const m = new THREE.MeshToonMaterial({ gradientMap: gradientMap(), ...std });
  const key = `${dapple ? 1 : 0}|${moss.toFixed(2)}|${translucent.toFixed(2)}`;
  m.customProgramCacheKey = () => key;
  m.onBeforeCompile = (s) => {
    s.uniforms.uGobo = shared.uGobo; s.uniforms.uNoise = shared.uNoise;
    s.uniforms.uTime = shared.uTime; s.uniforms.uSunDir = shared.uSunDir;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWNorm;')
      .replace('#include <project_vertex>', /* glsl */`#include <project_vertex>
        vec4 wp_=vec4(transformed,1.); vec3 wn_=objectNormal;
        #ifdef USE_INSTANCING
          wp_=instanceMatrix*wp_; wn_=mat3(instanceMatrix)*wn_;
        #endif
        wp_=modelMatrix*wp_; vWPos=wp_.xyz; vWNorm=normalize(mat3(modelMatrix)*wn_);`);
    let light = THREE.ShaderChunk.lights_fragment_begin;
    if (dapple) {
      const needle = 'vDirectionalShadowCoord[ i ] ) : 1.0;';
      if (!light.includes(needle)) console.error('toon: lights chunk changed');
      light = light.replace(needle, needle + '\n directLight.color *= dappleMask(vWPos);');
    }
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\n' + PARS)
      .replace('#include <lights_fragment_begin>', light);
    if (moss > 0) {
      s.fragmentShader = s.fragmentShader.replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
        {
          float up=clamp(vWNorm.y,0.,1.);
          bool top=up>.55;
          vec2 q=top?vWPos.xz:vec2(vWPos.x+vWPos.z,vWPos.y*1.3);
          float n1=texture2D(uNoise,q*.055).r, n2=texture2D(uNoise,q*.19).g;
          float n=n1*.68+n2*.32;
          float th=${(0.76 - moss * 0.52).toFixed(3)};
          float creep=step(vWPos.y-n*1.2-(n2-.5)*1.4,.5);                // walls only get moss near the ground / ledges, to a torn cel edge
          float mask=top?1.:creep*step(-.25,vWNorm.y);
          float t=smoothstep(th,th+.012,n)*mask;
          vec3 mc=mix(vec3(.10,.30,.09),vec3(.30,.56,.09),smoothstep(.42,.60,n2));
          diffuseColor.rgb=mix(diffuseColor.rgb,mc,t);
        }`);
    }
    if (translucent > 0) {
      s.fragmentShader = s.fragmentShader.replace('#include <opaque_fragment>', /* glsl */`
        { vec3 V=normalize(cameraPosition-vWPos); float b=pow(clamp(dot(-V,uSunDir)*.5+.5,0.,1.),1.6);
          outgoingLight+=(diffuseColor.rgb*vec3(1.1,1.05,.55)+vec3(.20,.24,.03))*b*${translucent.toFixed(2)}; }
        #include <opaque_fragment>`);
    }
  };
  return m;
}

export function initShared() { shared.uNoise.value = noiseTexture(256); }
