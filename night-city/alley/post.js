import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { lightUniforms, lightUniformsGLSL } from './lights.js';

const QUAD_VS = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Fog with closed-form single scattering from every registered light (no ray marching, no noise).
// For a point light, the in-scattered radiance along a ray integrates to (atan(b) - atan(a)) / d,
// where d is the closest distance between the ray and the light. Spot lights restrict that integral
// to the part of the ray inside the light cone.
const SCATTER_FS = /* glsl */ `
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform mat4 uProjInv;
  uniform mat4 uCamWorld;
  uniform vec3 uCamPos;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform float uMistDensity;
  uniform float uMistHeight;
  uniform float uSkyDistance;
  uniform float uMaxDistance;
  uniform float uHaloFalloff;
  uniform float uScatter;
  uniform float uTime;
  ${lightUniformsGLSL}
  varying vec2 vUv;

  float h3(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise3(vec3 x) {
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }

  float segScatter(vec3 O, vec3 D, vec3 P, float ta, float tb) {
    float t0 = dot(P - O, D);
    float d = max(length(O + D * t0 - P), 0.12);
    return (atan((tb - t0) / d) - atan((ta - t0) / d)) / d;
  }

  // Part [t0, t1] of the ray segment [0, L] that lies inside the forward cone (apex A, axis V).
  vec2 coneInterval(vec3 O, vec3 D, vec3 A, vec3 V, float cosA, float L) {
    vec3 co = O - A;
    float c2 = cosA * cosA;
    float dv = dot(D, V);
    float cov = dot(co, V);
    float a = dv * dv - c2;
    float b = 2.0 * (dv * cov - c2 * dot(D, co));
    float c = cov * cov - c2 * dot(co, co);
    float lo = 0.0, hi = L;
    if (abs(dv) < 1e-5) {
      if (cov <= 0.0) return vec2(1.0, 0.0);
    } else if (dv > 0.0) {
      lo = max(lo, -cov / dv);
    } else {
      hi = min(hi, -cov / dv);
    }
    if (abs(a) < 1e-6) return vec2(1.0, 0.0);
    float h = b * b - 4.0 * a * c;
    if (h < 0.0) {
      if (a > 0.0) return vec2(lo, hi);
      return vec2(1.0, 0.0);
    }
    float sq = sqrt(h);
    float t1 = (-b - sq) / (2.0 * a);
    float t2 = (-b + sq) / (2.0 * a);
    if (t1 > t2) { float tmp = t1; t1 = t2; t2 = tmp; }
    if (a < 0.0) {
      lo = max(lo, t1);
      hi = min(hi, t2);
    } else {
      if (cov + (t2 + 1.0) * dv > 0.0) lo = max(lo, t2);
      else hi = min(hi, t1);
    }
    return vec2(lo, hi);
  }

  void main() {
    vec3 col = texture2D(tColor, vUv).rgb;
    float depth = texture2D(tDepth, vUv).x;
    vec4 vp = uProjInv * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vp /= vp.w;
    vec3 wp = (uCamWorld * vec4(vp.xyz, 1.0)).xyz;
    vec3 O = uCamPos;
    vec3 D = normalize(wp - O);
    bool sky = depth > 0.99999;
    float L = sky ? uSkyDistance : min(length(wp - O), uMaxDistance);

    // uniform haze + ground-hugging mist (exponential height falloff, integrated analytically)
    float od = uFogDensity * L;
    float H = uMistHeight;
    float mist = abs(D.y) < 1e-3
      ? uMistDensity * exp(-O.y / H) * L
      : uMistDensity * H * (exp(-O.y / H) - exp(-(O.y + D.y * L) / H)) / D.y;
    float trans = exp(-(od + mist));
    vec3 result = col * trans + uFogColor * (1.0 - trans);

    vec3 ins = vec3(0.0);
    for (int i = 0; i < MAX_LIGHTS; i++) {
      if (i >= uLightCount) break;
      vec3 P = uLightPos[i];
      vec4 spot = uLightSpot[i];
      float s = 0.0;
      if (spot.w < -1.5) {
        s = segScatter(O, D, P, 0.0, L);
      } else {
        vec2 a = coneInterval(O, D, P, spot.xyz, spot.w, L);
        vec2 b = coneInterval(O, D, P, spot.xyz, uLightInner[i], L);
        if (a.y > a.x) s += segScatter(O, D, P, a.x, a.y);
        if (b.y > b.x) s += segScatter(O, D, P, b.x, b.y);
        s *= 0.5;
      }
      float tc = clamp(dot(P - O, D), 0.0, L);
      float dist = length(O + D * tc - P);
      // light reaching the fog is itself attenuated: keeps halos local instead of a uniform veil
      ins += uLightCol[i] * s * exp(-uFogDensity * tc - uHaloFalloff * max(dist - 0.4, 0.0));
    }
    // drifting wisps, evaluated once per pixel a few metres along the ray
    vec3 wp2 = O + D * min(L, 7.0);
    float wisp = 0.5 + noise3(wp2 * vec3(0.55, 0.8, 0.55) + vec3(uTime * 0.05, -uTime * 0.35, uTime * 0.1));
    result += ins * uScatter * wisp;
    gl_FragColor = vec4(result, 1.0);
  }
`;

// Keeps a smoothed autofocus distance in a 1x1 target, measured at the screen centre.
const FOCUS_FS = /* glsl */ `
  uniform sampler2D tDepth;
  uniform sampler2D tPrev;
  uniform float uNear;
  uniform float uFar;
  uniform float uBlend;
  uniform vec2 uCenter;
  varying vec2 vUv;
  float dist(vec2 uv) {
    float z = texture2D(tDepth, uv).x * 2.0 - 1.0;
    return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear));
  }
  void main() {
    float d = 0.0;
    d += dist(uCenter);
    d += dist(uCenter + vec2(0.04, 0.0));
    d += dist(uCenter - vec2(0.04, 0.0));
    d += dist(uCenter + vec2(0.0, 0.05));
    d += dist(uCenter - vec2(0.0, 0.05));
    float target = clamp(d / 5.0, 2.0, 30.0);
    float prev = texture2D(tPrev, vec2(0.5)).r;
    if (prev <= 0.0) prev = target;
    gl_FragColor = vec4(mix(prev, target, uBlend), 0.0, 0.0, 1.0);
  }
`;

// Single-pass gather bokeh (after Dennis Gustafsson, "Bokeh depth of field in a single pass").
const DOF_FS = /* glsl */ `
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform sampler2D tFocus;
  uniform vec2 uTexel;
  uniform float uNear;
  uniform float uFar;
  uniform float uMaxBlur;
  uniform float uAperture;
  uniform float uRadScale;
  varying vec2 vUv;
  const float GOLDEN_ANGLE = 2.39996323;
  float dist(vec2 uv) {
    float z = texture2D(tDepth, uv).x * 2.0 - 1.0;
    return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear));
  }
  float blurSize(float d, float focus) {
    float coc = clamp((1.0 / focus - 1.0 / d) * uAperture, -1.0, 1.0);
    return abs(coc) * uMaxBlur;
  }
  void main() {
    float focus = texture2D(tFocus, vec2(0.5)).r;
    float centerDepth = dist(vUv);
    float centerSize = blurSize(centerDepth, focus);
    vec3 color = texture2D(tColor, vUv).rgb;
    float tot = 1.0;
    float radius = uRadScale;
    for (float ang = 0.0; radius < uMaxBlur; ang += GOLDEN_ANGLE) {
      vec2 tc = vUv + vec2(cos(ang), sin(ang)) * uTexel * radius;
      vec3 sampleColor = texture2D(tColor, tc).rgb;
      float sampleDepth = dist(tc);
      float sampleSize = blurSize(sampleDepth, focus);
      if (sampleDepth > centerDepth) sampleSize = clamp(sampleSize, 0.0, centerSize * 2.0);
      float m = smoothstep(radius - 0.5, radius + 0.5, sampleSize);
      color += mix(color / tot, sampleColor, m);
      tot += 1.0;
      radius += uRadScale / radius;
    }
    gl_FragColor = vec4(color / tot, 1.0);
  }
`;

// Tone mapping comes from three's prefix (renderer.toneMapping), applied via the include chunks.
const FINAL_FS = /* glsl */ `
  uniform sampler2D tColor;
  uniform vec2 uRes;
  uniform float uTime;
  uniform float uVignette;
  uniform float uGrain;
  uniform float uCA;
  uniform float uFade;
  varying vec2 vUv;
  float rnd(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    vec2 d = vUv - 0.5;
    float r2 = dot(d, d);
    vec2 off = d * r2 * uCA;
    vec3 c = vec3(texture2D(tColor, vUv - off).r, texture2D(tColor, vUv).g, texture2D(tColor, vUv + off).b);
    float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = max(mix(vec3(lum), c, 1.12), 0.0);
    // cool, slightly lifted shadows
    c += vec3(0.004, 0.003, 0.012) * (1.0 - smoothstep(0.0, 0.25, lum));
    c *= 1.0 - uVignette * smoothstep(0.05, 0.55, r2 * 1.8);
    c *= 1.0 - uFade;
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    float g = rnd(vUv * uRes + fract(uTime * 7.31) * 113.0) - 0.5;
    gl_FragColor.rgb += g * uGrain;
  }
`;

export class PostFX {
  constructor(renderer, { samples = 4 } = {}) {
    this.renderer = renderer;
    const depthTexture = new THREE.DepthTexture(1, 1);
    depthTexture.type = THREE.FloatType;
    this.sceneRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples, depthTexture });
    const plain = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.scatterRT = plain();
    this.dofRT = plain();
    this.focusRT = [0, 1].map(() => new THREE.WebGLRenderTarget(1, 1, { type: THREE.FloatType, depthBuffer: false }));
    this.focusIndex = 0;

    this.scatter = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: {
        ...lightUniforms,
        tColor: { value: this.sceneRT.texture },
        tDepth: { value: depthTexture },
        uProjInv: { value: new THREE.Matrix4() },
        uCamWorld: { value: new THREE.Matrix4() },
        uCamPos: { value: new THREE.Vector3() },
        uFogColor: { value: new THREE.Color(0.016, 0.012, 0.028) },
        uFogDensity: { value: 0.011 },
        uMistDensity: { value: 0.025 },
        uMistHeight: { value: 1.4 },
        uSkyDistance: { value: 35 },
        uMaxDistance: { value: 70 },
        uHaloFalloff: { value: 0.11 },
        uScatter: { value: 0.0034 },
        uTime: { value: 0 },
      },
      vertexShader: QUAD_VS,
      fragmentShader: SCATTER_FS,
      depthTest: false,
      depthWrite: false,
    }));

    this.focus = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: {
        tDepth: { value: depthTexture },
        tPrev: { value: null },
        uNear: { value: 0.1 },
        uFar: { value: 100 },
        uBlend: { value: 0.1 },
        uCenter: { value: new THREE.Vector2(0.5, 0.48) },
      },
      vertexShader: QUAD_VS,
      fragmentShader: FOCUS_FS,
      depthTest: false,
      depthWrite: false,
    }));

    this.dof = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.scatterRT.texture },
        tDepth: { value: depthTexture },
        tFocus: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uNear: { value: 0.1 },
        uFar: { value: 100 },
        uMaxBlur: { value: 12 },
        uAperture: { value: 2.2 },
        uRadScale: { value: 1.8 },
      },
      vertexShader: QUAD_VS,
      fragmentShader: DOF_FS,
      depthTest: false,
      depthWrite: false,
    }));

    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.85, 0.65, 1.15);

    this.final = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.dofRT.texture },
        uRes: { value: new THREE.Vector2() },
        uTime: { value: 0 },
        uVignette: { value: 0.45 },
        uGrain: { value: 0.035 },
        uCA: { value: 0.012 },
        uFade: { value: 0 },
      },
      vertexShader: QUAD_VS,
      fragmentShader: FINAL_FS,
      depthTest: false,
      depthWrite: false,
    }));
  }

  setSize(width, height) {
    this.width = width;
    this.height = height;
    this.sceneRT.setSize(width, height);
    this.scatterRT.setSize(width, height);
    this.dofRT.setSize(width, height);
    this.bloom.setSize(width, height);
    const u = this.dof.material.uniforms;
    u.uTexel.value.set(1 / width, 1 / height);
    u.uMaxBlur.value = Math.max(6, 13 * (height / 1080));
    this.final.material.uniforms.uRes.value.set(width, height);
  }

  render(scene, camera, dt, time) {
    const r = this.renderer;

    r.setRenderTarget(this.sceneRT);
    r.render(scene, camera);

    const su = this.scatter.material.uniforms;
    su.uProjInv.value.copy(camera.projectionMatrixInverse);
    su.uCamWorld.value.copy(camera.matrixWorld);
    su.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
    su.uTime.value = time;
    r.setRenderTarget(this.scatterRT);
    this.scatter.render(r);

    const fu = this.focus.material.uniforms;
    const prev = this.focusRT[this.focusIndex];
    const next = this.focusRT[1 - this.focusIndex];
    fu.tPrev.value = prev.texture;
    fu.uNear.value = camera.near;
    fu.uFar.value = camera.far;
    fu.uBlend.value = 1 - Math.exp(-dt * 2.2);
    r.setRenderTarget(next);
    this.focus.render(r);
    this.focusIndex = 1 - this.focusIndex;

    const du = this.dof.material.uniforms;
    du.tFocus.value = next.texture;
    du.uNear.value = camera.near;
    du.uFar.value = camera.far;
    r.setRenderTarget(this.dofRT);
    this.dof.render(r);

    // bloom is composited additively into its input
    this.bloom.render(r, null, this.dofRT, dt, false);

    this.final.material.uniforms.uTime.value = time;
    r.setRenderTarget(null);
    this.final.render(r);
  }
}
