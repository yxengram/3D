// Runtime materials. Everything is unlit: 'lit' surfaces are MeshBasicMaterial (albedo × baked lightmap); glass, water and
// polished floors add a view-dependent term (sky / pre-captured cube map / planar mirror) on top of the baked light.
import * as THREE from 'three';

export const skyUniforms = {
  uSky: { value: null }, uHasSky: { value: 0 }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uSkyGain: { value: 5.2 },
  uHaze: { value: new THREE.Color(1, 1, 1) }, uSkyRot: { value: -0.092 },
};
// Sky strip: u = azimuth, v = elevation (0 horizon .. 1 zenith). Below the horizon everything is haze.
export const SKY_GLSL = /* glsl */`
uniform sampler2D uSky; uniform float uHasSky; uniform vec3 uSun; uniform float uSkyGain; uniform vec3 uHaze; uniform float uSkyRot;
vec3 skyColor(vec3 d, float disc) {
  float e = asin(clamp(d.y, -1.0, 1.0)) / 1.5707963;
  float u = atan(d.z, d.x) / 6.2831853 + uSkyRot;
  vec3 c = uHasSky > 0.5 ? texture2D(uSky, vec2(u, clamp(e, 0.004, 0.996))).rgb * uSkyGain
                         : mix(vec3(0.78, 0.84, 0.92), vec3(0.20, 0.40, 0.78), pow(clamp(e, 0.0, 1.0), 0.55)) * uSkyGain;
  float warm = clamp((c.r - c.b) / max(c.r, 1e-3) * 2.0, 0.0, 1.0);                                // the strip is a golden-hour sky all round:
  c = mix(c, vec3(dot(c, vec3(0.3, 0.6, 0.1))) * vec3(1.03, 1.0, 0.95), 0.5 * warm);               // calm the warm cast to match a 30-degree sun
  c = mix(c, vec3(0.0065, 0.0908, 0.3325) * uSkyGain, smoothstep(0.58, 0.80, e));                  // clouds fade out before the pole (no pinch)
  c = mix(uHaze, c, smoothstep(-0.01, 0.07, e));
  float s = max(dot(d, uSun), 0.0);
  c += vec3(1.0, 0.90, 0.76) * uSkyGain * (pow(s, 28.0) * 0.30 + pow(s, 400.0) * 1.2 + smoothstep(0.99990, 0.99997, s) * 60.0 * disc);
  return c;
}`;

const GLOW = { laylight: 2.4, lamp: 5.0 };
const GAIN = { tree_a: 3.1, tree_b: 3.1, tree_c: 3.1, gfx_name: 1.0 };

export function makeMaterials({ J, tex, lm, renderer, B }) {
  const cache = new Map(), time = { value: 0 }, litByZone = { ext: [], lobby: [], gallery: [] }, cutouts = [], treeFade = { value: new THREE.Vector2(6, 12) };
  const env = {};
  for (const z of ['lobby', 'gallery']) {
    const b = J.zones[z];
    env[z] = { uEnv: { value: null }, uEnvOn: { value: 0 }, uBoxMin: { value: new THREE.Vector3(b[0], b[2], -b[4]) }, uBoxMax: { value: new THREE.Vector3(b[3], b[5], -b[1]) },
      uEnvPos: { value: new THREE.Vector3((b[0] + b[3]) / 2, 1.9, -(b[1] + b[4]) / 2) } };
  }
  const lin = (c) => new THREE.Color().setRGB(c[0], c[1], c[2]);
  function alphaOnly(t) {
    const img = t.image, w = img.width, h = img.height, c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0); const px = g.getImageData(0, 0, w, h).data, a = new Uint8Array(w * h);
    for (let i = 0; i < a.length; i++) a[i] = px[i * 4 + 3];
    const r = new THREE.DataTexture(a, w, h, THREE.RedFormat, THREE.UnsignedByteType); r.unpackAlignment = 1; r.flipY = false; r.generateMipmaps = true;
    r.minFilter = THREE.LinearMipmapLinearFilter; r.magFilter = THREE.LinearFilter; r.anisotropy = t.anisotropy; r.needsUpdate = true; t.dispose();
    return r;
  }

  function glass(d, opts) {
    return new THREE.ShaderMaterial({
      uniforms: { ...skyUniforms, uFront: { value: opts.front }, uBack: { value: opts.back }, uTint: { value: new THREE.Color(...opts.tint) }, uTa: { value: opts.alpha },
        uUseSky: { value: opts.sky }, uRoom: { value: new THREE.Color(...(opts.room || [0.5, 0.5, 0.5])) } },
      transparent: opts.alpha < 1, depthWrite: opts.alpha >= 1, side: THREE.DoubleSide,
      vertexShader: 'varying vec3 vWPos; varying vec3 vN; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWPos = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `${SKY_GLSL}
        uniform float uFront, uBack, uTa, uUseSky; uniform vec3 uTint, uRoom; varying vec3 vWPos; varying vec3 vN;
        void main(){
          vec3 V = normalize(vWPos - cameraPosition); vec3 N = normalize(vN); float front = gl_FrontFacing ? 1.0 : 0.0; if (!gl_FrontFacing) N = -N;
          float f = 0.05 + 0.95 * pow(1.0 - max(dot(-V, N), 0.0), 5.0);
          vec3 R = reflect(V, N);
          vec3 refl = uUseSky > 0.5 ? mix(uHaze * 0.55, skyColor(vec3(R.x, abs(R.y), R.z), 0.0), smoothstep(-0.25, 0.05, R.y)) : uRoom;
          float k = f * mix(uBack, uFront, front);
          float a = clamp(k + uTa, 0.0, 1.0);
          gl_FragColor = vec4((refl * k + uTint * uTa) / max(k + uTa, 1e-3), a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
  }

  function lawnNoise(m) {   // a large lawn with one small tile reads as a flat slab: add free large-scale tonal variation from world position
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vWxz;').replace('#include <project_vertex>', '#include <project_vertex>\nvWxz = (modelMatrix * vec4(transformed, 1.0)).xz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        varying vec2 vWxz;
        float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }`)
        .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= 1.0 + 0.16 * (vnoise(vWxz / 35.0) + 0.5 * vnoise(vWxz / 11.0) - 0.75);');
    };
    m.customProgramCacheKey = () => 'lawn-macro';
  }

  function reflective(m, d) {
    const e = env[d.env];
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, e, { uReflect: { value: d.reflect }, uLod: { value: d.env === 'lobby' ? 1.6 : 2.6 } });
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos; uniform samplerCube uEnv; uniform vec3 uBoxMin, uBoxMax, uEnvPos; uniform float uReflect, uLod, uEnvOn;')
        .replace('#include <envmap_fragment>', /* glsl */`{
          vec3 V = normalize(vWPos - cameraPosition); vec3 R = reflect(V, vec3(0.0, 1.0, 0.0));
          vec3 tm = max((uBoxMax - vWPos) / R, (uBoxMin - vWPos) / R); float tt = min(min(tm.x, tm.y), tm.z);   // box-projected cube map
          vec3 envc = textureLod(uEnv, vWPos + R * tt - uEnvPos, uLod).rgb;
          float f = (0.04 + 0.96 * pow(1.0 - max(-V.y, 0.0), 5.0)) * uReflect * uEnvOn;
          outgoingLight = outgoingLight * (1.0 - f) + envc * f;
        }`);
    };
    m.customProgramCacheKey = () => 'refl-' + d.env;
    return m;
  }

  function get(name, zone) {
    const key = name + '@' + zone; if (cache.has(key)) return cache.get(key);
    const d = J.mats[name]; const t = d.tex ? tex[d.tex] : null; let m;
    const pic = d.tex && /^(art|gfx)\//.test(d.tex);
    if (t && (pic || d.kind === 'cutout')) { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; }
    switch (d.kind) {
      case 'lit': {
        const L = lm[zone];
        m = new THREE.MeshBasicMaterial({ color: t ? (d.tint ? lin(d.tint) : 0xffffff) : lin(d.color), map: t, lightMap: L || null, lightMapIntensity: L ? J.lm[zone].range * Math.PI : 1 });
        if (d.reflect) reflective(m, d);
        if (name === 'lawn') lawnNoise(m);
        if (L && litByZone[zone]) litByZone[zone].push(m);
        break;
      }
      case 'emit': m = new THREE.MeshBasicMaterial({ color: lin(d.color).multiplyScalar(GLOW[name] || 2), fog: false }); break;
      case 'glass':
        m = name === 'glass' ? glass(d, { front: 1.0, back: 0.10, tint: [0.03, 0.05, 0.05], alpha: 0.10, sky: 1 })
                             : glass(d, { front: 0.55, back: 0.55, tint: [0.25, 0.3, 0.28], alpha: 0.10, sky: 0, room: [0.9, 0.88, 0.82] });
        break;
      case 'unlit':
        m = name === 'glass_dark' ? glass(d, { front: 0.9, back: 0.9, tint: [0.035, 0.045, 0.05], alpha: 1.0, sky: 1 }) : new THREE.MeshBasicMaterial({ color: lin(d.color) });
        break;
      case 'cutout':
        m = new THREE.MeshBasicMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide, color: new THREE.Color().setScalar(GAIN[name] || 3), visible: !!t });
        m.userData.gain = GAIN[name] || 3; cutouts.push(m);
        m.onBeforeCompile = (sh) => {   // a whole tree dissolves (screen-door dither) when the camera comes close to its trunk, so the orbit view never sits inside a crown
          sh.uniforms.uFade = treeFade;   // the trunk position rides in the spare second UV set (Blender x, 1 - y)
          sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vTrunk;')
            .replace('#include <project_vertex>', '#include <project_vertex>\n#ifdef USE_UV1\n vTrunk = vec2(uv1.x, uv1.y - 1.0);\n#else\n vTrunk = (modelMatrix * vec4(transformed, 1.0)).xz;\n#endif');
          sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vTrunk; uniform vec2 uFade;')
            .replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
              { float fade = smoothstep(uFade.x, uFade.y, distance(cameraPosition.xz, vTrunk));
                float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
                if (fade < n) discard; }`);
        };
        m.customProgramCacheKey = () => 'cutout-fade2';
        break;
      case 'decal': {   // lettering: one flat colour + coverage, so only the alpha channel is kept on the GPU (1 byte per texel instead of 4)
        const a = t ? alphaOnly(t) : null;
        m = new THREE.MeshBasicMaterial({ color: lin(d.color).multiplyScalar(GAIN[name] || 1), alphaMap: a, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, visible: !!t });
        m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <alphamap_fragment>', '#ifdef USE_ALPHAMAP\n diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).r;\n#endif'); };
        m.customProgramCacheKey = () => 'decal-r';
        break;
      }
      default: m = new THREE.MeshBasicMaterial({ color: 0x223036 });   // ghost surfaces replaced at runtime (water)
    }
    m.name = key; cache.set(key, m); return m;
  }

  // still water: planar mirror with slow ripples, Fresnel against a dark bed
  const waterShader = {
    name: 'PoolShader',
    uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, uTime: { value: 0 } },
    vertexShader: 'uniform mat4 textureMatrix; varying vec4 vUv4; varying vec3 vWPos; void main(){ vUv4 = textureMatrix * vec4(position, 1.0); vec4 w = modelMatrix * vec4(position, 1.0); vWPos = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: /* glsl */`uniform sampler2D tDiffuse; uniform float uTime; varying vec4 vUv4; varying vec3 vWPos;
      void main(){
        vec2 p = vWPos.xz; float t = uTime;
        vec2 n = vec2(sin(p.x * 3.7 + p.y * 1.3 + t * 0.9) + 0.7 * sin(p.y * 7.1 - p.x * 2.2 - t * 1.3) + 0.5 * sin((p.x * 1.7 + p.y) * 5.5 + t * 1.9),
                      sin(p.y * 4.3 - p.x * 1.1 - t * 0.8) + 0.7 * sin(p.x * 6.4 + p.y * 2.9 + t * 1.1) + 0.5 * sin((p.x - p.y * 1.4) * 4.5 - t * 1.6));
        vec3 V = normalize(vWPos - cameraPosition);
        float kd = 1.0 / (1.0 + 0.08 * distance(cameraPosition, vWPos));
        vec4 uv = vUv4; uv.xy += n * 0.0012 * kd * uv.w;
        vec3 refl = texture2DProj(tDiffuse, uv).rgb;
        float m = mix(0.12, 1.0, pow(1.0 - max(-V.y, 0.0), 2.5));
        vec3 col = mix(vec3(0.035, 0.06, 0.065), refl, m);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  };

  const base = new Map();
  function setZoneGain(g) {
    for (const z of Object.keys(litByZone)) for (const m of litByZone[z]) { if (!base.has(m)) base.set(m, m.lightMapIntensity); m.lightMapIntensity = base.get(m) * g[z]; }
    for (const m of cutouts) m.color.setScalar(m.userData.gain * g.ext);
  }
  const api = { get, time, waterShader, mirror: null, env, treeFade, setZoneGain,
    captureEnv(scene) {
      const was = api.mirror ? api.mirror.visible : false; if (api.mirror) api.mirror.visible = false;
      setZoneGain({ ext: 1, lobby: 1, gallery: 1 }); for (const z of Object.keys(env)) env[z].uEnvOn.value = 0;
      for (const z of Object.keys(env)) {
        if (env[z].rt) env[z].rt.dispose();
        const rt = new THREE.WebGLCubeRenderTarget(z === 'lobby' ? 256 : 128, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
        const cam = new THREE.CubeCamera(0.05, 600, rt); cam.position.copy(env[z].uEnvPos.value); cam.update(renderer, scene);
        env[z].rt = rt; env[z].uEnv.value = rt.texture;
      }
      for (const z of Object.keys(env)) env[z].uEnvOn.value = 1;
      if (api.mirror) api.mirror.visible = was;
    } };
  return api;
}
