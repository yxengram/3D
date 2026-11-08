import * as THREE from 'three';
import { lightUniforms, lightUniformsGLSL } from './lights.js';

const LIGHT_SUM_GLSL = /* glsl */ `
  vec3 lightAt(vec3 p) {
    vec3 sum = vec3(0.0);
    for (int i = 0; i < MAX_LIGHTS; i++) {
      if (i >= uLightCount) break;
      vec3 d = p - uLightPos[i];
      float dist2 = dot(d, d);
      float att = 1.0 / (dist2 + 0.4);
      vec4 spot = uLightSpot[i];
      if (spot.w > -1.5) {
        float cd = dot(normalize(d), spot.xyz);
        att *= smoothstep(spot.w, uLightInner[i], cd);
      }
      sum += uLightCol[i] * att;
    }
    return sum;
  }
`;

export class Rain {
  constructor({ count = 16000, splashCount = 520, bounds }) {
    this.group = new THREE.Group();
    this.group.name = 'rain';
    this.group.userData.dynamic = true;
    this.bounds = bounds; // {halfWidth, zStart, zEnd}

    this.uniforms = {
      ...lightUniforms,
      uTime: { value: 0 },
      uCamPos: { value: new THREE.Vector3() },
      uBox: { value: new THREE.Vector3(16, 14, 34) },
      uWind: { value: new THREE.Vector3(0.6, 0, -0.3) },
      uSpeed: { value: 9.5 },
      uLen: { value: 0.42 },
      uWidth: { value: 0.0055 },
      uIntensity: { value: 1 },
      uAmbient: { value: new THREE.Color(0.05, 0.05, 0.075) },
    };

    this.streaks = this.#makeStreaks(count);
    this.splashes = this.#makeSplashes(splashCount);
    this.group.add(this.streaks, this.splashes);
  }

  #makeStreaks(count) {
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const offsets = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    const box = this.uniforms.uBox.value;
    for (let i = 0; i < count; i++) {
      offsets[i * 3] = Math.random() * box.x;
      offsets[i * 3 + 1] = Math.random() * box.y;
      offsets[i * 3 + 2] = Math.random() * box.z;
      seeds[i] = Math.random();
    }
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 3));
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    geo.instanceCount = count;

    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        ${lightUniformsGLSL}
        uniform float uTime;
        uniform vec3 uCamPos;
        uniform vec3 uBox;
        uniform vec3 uWind;
        uniform float uSpeed;
        uniform float uLen;
        uniform float uWidth;
        attribute vec3 aOffset;
        attribute float aSeed;
        varying vec2 vUv;
        varying vec3 vLight;
        varying float vFade;
        ${LIGHT_SUM_GLSL}
        void main() {
          float speed = uSpeed * (0.8 + 0.4 * aSeed);
          vec3 vel = vec3(uWind.x, -speed, uWind.z);
          vec3 boxMin = uCamPos - uBox * vec3(0.5, 0.35, 0.5);
          vec3 p = boxMin + mod(aOffset + vel * uTime - boxMin, uBox);
          vec3 axis = normalize(vel);
          vec3 toCam = normalize(uCamPos - p);
          vec3 side = normalize(cross(axis, toCam));
          float camDist = length(uCamPos - p);
          float len = uLen * (0.7 + 0.6 * aSeed);
          // widen far drops a little so they stay at least about a pixel wide
          float width = uWidth * (1.0 + camDist * 0.12);
          vec3 wp = p + side * position.x * width + axis * (position.y - 0.5) * len;
          vLight = lightAt(p);
          vFade = smoothstep(0.6, 2.6, camDist) * (1.0 - smoothstep(uBox.z * 0.32, uBox.z * 0.5, camDist)) / (1.0 + camDist * 0.08);
          vUv = vec2(position.x + 0.5, position.y);
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uAmbient;
        uniform float uIntensity;
        varying vec2 vUv;
        varying vec3 vLight;
        varying float vFade;
        void main() {
          float across = 1.0 - abs(vUv.x * 2.0 - 1.0);
          float along = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.6, vUv.y);
          float a = across * along * vFade * uIntensity;
          gl_FragColor = vec4((uAmbient + vLight * 0.04) * a, 1.0);
        }
      `,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    return mesh;
  }

  #makeSplashes(count) {
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1], 3));
    geo.setIndex([0, 2, 1, 0, 3, 2]);
    const seeds = new Float32Array(count * 2);
    for (let i = 0; i < count * 2; i++) seeds[i] = Math.random();
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 2));
    geo.instanceCount = count;

    this.splashUniforms = {
      ...this.uniforms,
      uArea: { value: new THREE.Vector4(this.bounds.halfWidth - 0.05, this.bounds.zStart, this.bounds.zEnd, 11) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.splashUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        ${lightUniformsGLSL}
        uniform float uTime;
        uniform vec3 uCamPos;
        uniform vec4 uArea; // x: half width, y: z start, z: z end, w: radius around camera
        attribute vec2 aSeed;
        varying vec2 vUv;
        varying float vPhase;
        varying vec3 vLight;
        varying float vFade;
        float h1(float n) { return fract(sin(n) * 43758.5453); }
        ${LIGHT_SUM_GLSL}
        void main() {
          float period = 0.45 + aSeed.y * 0.35;
          float tt = uTime / period + aSeed.x * 17.0;
          float cycle = floor(tt);
          vPhase = fract(tt);
          float r1 = h1(cycle * 12.9898 + aSeed.x * 78.233);
          float r2 = h1(cycle * 39.3468 + aSeed.y * 11.135);
          float x = (r1 * 2.0 - 1.0) * uArea.x;
          float z = uCamPos.z - uArea.w * 0.15 - r2 * uArea.w * 1.6;
          z = clamp(z, uArea.z, uArea.y);
          vec3 p = vec3(x, 0.012, z);
          float size = 0.015 + 0.05 * vPhase;
          vec3 wp = p + position * size;
          vUv = position.xz;
          vLight = lightAt(p + vec3(0.0, 0.05, 0.0));
          float d = length(uCamPos - p);
          vFade = (1.0 - smoothstep(6.0, 16.0, d)) * smoothstep(0.4, 1.0, d);
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uAmbient;
        uniform float uIntensity;
        varying vec2 vUv;
        varying float vPhase;
        varying vec3 vLight;
        varying float vFade;
        void main() {
          float r = length(vUv);
          float ring = smoothstep(0.72, 0.88, r) * (1.0 - smoothstep(0.88, 1.0, r));
          float a = ring * pow(1.0 - vPhase, 3.0) * vFade * uIntensity;
          gl_FragColor = vec4((uAmbient * 0.5 + vLight * 0.035) * a, 1.0);
        }
      `,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    return mesh;
  }

  update(time, camera) {
    this.uniforms.uTime.value = time;
    this.uniforms.uCamPos.value.copy(camera.position);
  }

  set intensity(v) {
    this.uniforms.uIntensity.value = v;
  }
  get intensity() {
    return this.uniforms.uIntensity.value;
  }
}
