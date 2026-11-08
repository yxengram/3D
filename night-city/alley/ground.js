import * as THREE from 'three';
import { surfaceMaterial } from './assets.js';
import { fillUniforms, fillUniformsGLSL, fillLightingGLSL } from './lights.js';

const GROUND_GLSL = /* glsl */ `
  uniform sampler2D tReflect;
  uniform mat4 uReflMatrix;
  uniform float uTime;
  uniform float uRain;
  uniform float uReflStrength;
  uniform vec4 uAlley; // x: half width, y: z start, z: z end
  varying vec3 vGPos;

  float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  vec2 gHash2(vec2 p) {
    return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
  }
  float gNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(gHash(i), gHash(i + vec2(1, 0)), u.x), mix(gHash(i + vec2(0, 1)), gHash(i + vec2(1, 1)), u.x), u.y);
  }
  float gFbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * gNoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
    return v;
  }

  float puddleMask(vec3 p) {
    float n = gFbm(p.xz * 0.42) * 0.8 + gFbm(p.xz * 2.1) * 0.2;
    float m = smoothstep(0.5, 0.56, n);
    // water collects along the base of the walls inside the alley
    float inAlley = step(uAlley.z, p.z) * step(p.z, uAlley.y);
    float gutter = smoothstep(uAlley.x - 0.55, uAlley.x - 0.1, abs(p.x)) * inAlley;
    m = max(m, gutter * smoothstep(0.3, 0.45, gFbm(p.xz * 1.3 + 4.0)));
    return m;
  }

  // Expanding rings from raindrops hitting the water; returns a slope in world xz.
  vec2 ripples(vec2 p, float t) {
    vec2 grad = vec2(0.0);
    const float cell = 0.32;
    vec2 g = floor(p / cell);
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 c = g + vec2(i, j);
        vec2 h = gHash2(c);
        float phase = fract(t * (0.8 + 0.5 * h.y) + h.x * 9.0);
        vec2 center = (c + 0.15 + 0.7 * gHash2(c + floor(t * (0.8 + 0.5 * h.y) + h.x * 9.0))) * cell;
        vec2 d = p - center;
        float r = length(d);
        float x = r - phase * cell * 1.1;
        float ring = exp(-x * x * 1400.0) * (1.0 - phase) * (1.0 - phase);
        grad += d / max(r, 1e-4) * sin(x * 160.0) * ring;
      }
    }
    return grad;
  }
`;

export class WetGround {
  constructor({ renderer, textures, alley }) {
    this.renderer = renderer;
    this.alley = alley;
    const set = textures.asphalt_02;
    const size = new THREE.Vector2(140, 150);
    const geo = new THREE.PlaneGeometry(size.x, size.y, 1, 1);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, -30);

    const mat = surfaceMaterial(set, { repeat: 1, normalScale: 1.2 });
    for (const t of [mat.map, mat.normalMap, mat.roughnessMap, mat.aoMap]) t.repeat.set(size.x / set.size, size.y / set.size);
    mat.envMapIntensity = 0.15;
    mat.color.setScalar(0.9);

    this.reflectRT = new THREE.WebGLRenderTarget(16, 16, {
      type: THREE.HalfFloatType,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.uniforms = {
      tReflect: { value: this.reflectRT.texture },
      uReflMatrix: { value: new THREE.Matrix4() },
      uTime: { value: 0 },
      uRain: { value: 1 },
      uReflStrength: { value: 2.0 },
      uAlley: { value: new THREE.Vector4(alley.halfWidth, alley.zStart, alley.zEnd, 0) },
    };

    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms, fillUniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGPos;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvGPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${GROUND_GLSL}\n${fillUniformsGLSL}`)
        .replace('#include <aomap_fragment>', `${fillLightingGLSL('vGPos')}\n#include <aomap_fragment>`)
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          float pud = puddleMask(vGPos);
          float inAlleyG = step(uAlley.z, vGPos.z) * step(vGPos.z, uAlley.y);
          float wallAO = mix(1.0, smoothstep(0.0, 0.6, uAlley.x - abs(vGPos.x)), inAlleyG);
          diffuseColor.rgb *= mix(0.42, 0.12, pud) * mix(0.55, 1.0, wallAO);`
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          roughnessFactor = mix(clamp(roughnessFactor * 0.42, 0.08, 1.0), 0.015, pud);`
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          {
            vec2 rip = ripples(vGPos.xz, uTime) * uRain;
            vec2 rip2 = ripples(vGPos.xz * 1.37 + 3.1, uTime * 1.13 + 0.5) * uRain;
            vec3 wn = normalize(vec3(-(rip.x + rip2.x) * 0.22, 1.0, -(rip.y + rip2.y) * 0.22));
            vec3 waterN = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
            normal = normalize(mix(normal, waterN, pud));
          }`
        )
        .replace(
          '#include <opaque_fragment>',
          `{
            vec3 Nw = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
            vec3 Vw = normalize(cameraPosition - vGPos);
            float NdV = clamp(dot(Nw, Vw), 0.0, 1.0);
            float fres = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
            vec4 rc = uReflMatrix * vec4(vGPos, 1.0);
            vec2 ruv = rc.xy / rc.w + Nw.xz * mix(0.05, 0.025, pud);
            float rough = clamp(roughnessFactor, 0.0, 1.0);
            float lod = rough * 6.0;
            float streak = rough * 0.11 + 0.002;
            vec3 refl = vec3(0.0);
            float wsum = 0.0;
            for (int i = -5; i <= 5; i++) {
              float o = float(i) / 5.0;
              float w = exp(-o * o * 2.5);
              refl += textureLod(tReflect, ruv + vec2(0.0, o * streak), lod).rgb * w;
              wsum += w;
            }
            refl /= wsum;
            // reflections skip the fog pass, so mute them a little toward the haze colour
            refl = mix(refl, vec3(0.03, 0.025, 0.05), 0.18);
            float amount = fres * uReflStrength * mix(0.55, 1.0, pud) * mix(0.6, 1.0, wallAO);
            outgoingLight += refl * amount;
          }
          #include <opaque_fragment>`
        );
    };
    mat.customProgramCacheKey = () => 'wet-ground';

    this.material = mat;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.name = 'ground';
    this.mesh.userData.dynamic = true;

    this.mirrorCamera = new THREE.PerspectiveCamera();
  }

  setSize(width, height) {
    this.reflectRT.setSize(Math.max(2, Math.round(width * 0.4)), Math.max(2, Math.round(height * 0.4)));
  }

  // Render the scene mirrored about the ground plane (y = 0) into reflectRT.
  render(scene, camera, hidden = []) {
    const cam = this.mirrorCamera;
    const camPos = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
    const rot = new THREE.Matrix4().extractRotation(camera.matrixWorld);
    const look = new THREE.Vector3(0, 0, -1).applyMatrix4(rot).add(camPos);
    const up = new THREE.Vector3(0, 1, 0).applyMatrix4(rot);

    cam.position.set(camPos.x, -camPos.y, camPos.z);
    cam.up.set(up.x, -up.y, up.z);
    cam.lookAt(look.x, -look.y, look.z);
    cam.far = camera.far;
    cam.updateMatrixWorld();
    cam.projectionMatrix.copy(camera.projectionMatrix);

    this.uniforms.uReflMatrix.value
      .set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(cam.projectionMatrix)
      .multiply(cam.matrixWorldInverse);

    // Oblique near plane so that nothing below the ground ends up in the reflection.
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0).applyMatrix4(cam.matrixWorldInverse);
    const clip = new THREE.Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const pm = cam.projectionMatrix;
    const q = new THREE.Vector4(
      (Math.sign(clip.x) + pm.elements[8]) / pm.elements[0],
      (Math.sign(clip.y) + pm.elements[9]) / pm.elements[5],
      -1,
      (1 + pm.elements[10]) / pm.elements[14]
    );
    clip.multiplyScalar(2 / clip.dot(q));
    pm.elements[2] = clip.x;
    pm.elements[6] = clip.y;
    pm.elements[10] = clip.z + 1 - 0.003;
    pm.elements[14] = clip.w;
    cam.projectionMatrixInverse.copy(pm).invert();

    const renderer = this.renderer;
    const prevTarget = renderer.getRenderTarget();
    const vis = hidden.map((o) => o.visible);
    this.mesh.visible = false;
    hidden.forEach((o) => (o.visible = false));

    renderer.setRenderTarget(this.reflectRT);
    renderer.clear();
    renderer.render(scene, cam);

    hidden.forEach((o, i) => (o.visible = vis[i]));
    this.mesh.visible = true;
    renderer.setRenderTarget(prevTarget);
  }
}
