import * as THREE from 'three';
import { HALF, rand, rr, pick } from './config.js';

const BEAM_VS = /* glsl */ `
  varying float vT;
  varying vec3 vNormal;
  varying vec3 vView;
  uniform float uLength;
  void main() {
    vT = -position.y / uLength;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalMatrix * normal;
    vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;
const BEAM_FS = /* glsl */ `
  uniform vec3 color;
  uniform float uStrength;
  varying float vT;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float facing = abs(dot(normalize(vNormal), normalize(vView)));
    float a = pow(1.0 - vT, 2.0) * pow(facing, 2.0) * uStrength;
    gl_FragColor = vec4(color, a);
  }
`;
// soft additive light cone with its apex at the origin, pointing down -y
function beam(radius, length, color, strength) {
  const geo = new THREE.ConeGeometry(radius, length, 32, 1, true);
  geo.translate(0, -length / 2, 0);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { color: { value: new THREE.Color(...color) }, uLength: { value: length }, uStrength: { value: strength } },
    vertexShader: BEAM_VS,
    fragmentShader: BEAM_FS,
  });
  return new THREE.Mesh(geo, mat);
}

export function buildSky({ scene, fogColor, landmarkTop, antennaTips }) {
  const updaters = [];

  // ---------- sky gradient ----------
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(3500, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, depthTest: false,
      uniforms: {
        top: { value: new THREE.Color(0x010209) },
        mid: { value: new THREE.Color(0x0b1236) },
        horizon: { value: fogColor.clone().multiplyScalar(1.6) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 top; uniform vec3 mid; uniform vec3 horizon;
        varying vec3 vDir;
        void main() {
          float h = vDir.y;
          vec3 c = mix(horizon, mid, smoothstep(0.0, 0.22, h));
          c = mix(c, top, smoothstep(0.22, 0.75, h));
          if (h < 0.0) c = horizon;
          gl_FragColor = vec4(c, 1.0);
        }`,
    })
  );
  sky.renderOrder = -1000;
  scene.add(sky);

  // ---------- stars and moon ----------
  {
    const count = 3000;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = rand() * Math.PI * 2;
      const y = rr(0.08, 1);
      const r = Math.sqrt(1 - y * y);
      pos.set([Math.cos(theta) * r * 3000, y * 3000, Math.sin(theta) * r * 3000], i * 3);
      const b = rr(0.3, 1);
      col.set([b, b, b * rr(0.9, 1.1)], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const stars = new THREE.Points(g, new THREE.PointsMaterial({
      size: 1.6, sizeAttenuation: false, vertexColors: true, fog: false, transparent: true, opacity: 0.9, depthWrite: false,
    }));
    stars.renderOrder = -999;
    scene.add(stars);
  }
  const moon = new THREE.Mesh(new THREE.SphereGeometry(55, 32, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.5, 1.3), fog: false }));
  moon.position.set(-1300, 950, -1700);
  moon.renderOrder = -999;
  scene.add(moon);

  // ---------- clouds lit from below by the city ----------
  const cloudUniforms = { uTime: { value: 0 } };
  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(3300, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, transparent: true,
      uniforms: cloudUniforms,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec3 vDir;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
        }
        float fbm(vec2 p) {
          float v = 0.0, a = 0.5;
          for (int i = 0; i < 6; i++) { v += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; }
          return v;
        }
        void main() {
          vec3 d = normalize(vDir);
          if (d.y < 0.02) discard;
          vec2 uv = d.xz / (d.y + 0.12) * 0.55 + vec2(uTime * 0.004, uTime * 0.0015);
          float n = fbm(uv * 1.4);
          float density = smoothstep(0.48, 0.82, n) * smoothstep(0.02, 0.16, d.y);
          // underside glow from the city: warm and purple near the horizon, fading overhead
          vec3 glow = mix(vec3(0.22, 0.11, 0.2), vec3(0.05, 0.05, 0.09), smoothstep(0.05, 0.55, d.y));
          vec3 col = glow * (0.6 + 0.6 * smoothstep(0.5, 0.9, n));
          gl_FragColor = vec4(col, density * 0.8);
        }`,
    })
  );
  clouds.renderOrder = -998;
  scene.add(clouds);
  updaters.push((dt, t) => (cloudUniforms.uTime.value = t));

  // ---------- endless suburbs beyond the city ----------
  {
    const count = 7000;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const tones = [[1, 0.7, 0.35], [1, 0.85, 0.6], [0.8, 0.9, 1]];
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2;
      const r = HALF * 1.08 + Math.pow(rand(), 1.6) * 2300;
      pos.set([Math.cos(a) * r, rr(0.5, 4), Math.sin(a) * r], i * 3);
      const tone = pick(tones);
      const b = rr(0.25, 0.8) * (1 - (r - HALF) / 2800);
      col.set([tone[0] * b, tone[1] * b, tone[2] * b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.8, sizeAttenuation: false, vertexColors: true, fog: false })));
  }

  // ---------- aircraft crossing the sky with navigation lights ----------
  // Per plane: red port light, green starboard light, white tail light, two white strobes, red belly beacon.
  const PLANES = 4;
  const LIGHTS = 6;
  const planePos = new Float32Array(PLANES * LIGHTS * 3);
  const planeCol = new Float32Array(PLANES * LIGHTS * 3);
  const planeGeo = new THREE.BufferGeometry();
  planeGeo.setAttribute('position', new THREE.BufferAttribute(planePos, 3));
  planeGeo.setAttribute('color', new THREE.BufferAttribute(planeCol, 3));
  const planePts = new THREE.Points(planeGeo, new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, vertexColors: true, fog: false }));
  planePts.frustumCulled = false;
  scene.add(planePts);
  const planes = Array.from({ length: PLANES }, () => ({}));
  const spawn = (p, fresh) => {
    const a = rand() * Math.PI * 2;
    const start = new THREE.Vector3(Math.cos(a) * 2600, rr(480, 900), Math.sin(a) * 2600);
    const target = new THREE.Vector3(rr(-600, 600), start.y, rr(-600, 600));
    p.dir = target.sub(start).setY(0).normalize();
    p.pos = start;
    if (fresh) p.pos.addScaledVector(p.dir, rr(0, 3000));
    p.speed = rr(65, 90);
    p.phase = rand() * 10;
  };
  planes.forEach((p) => spawn(p, true));
  const local = [[-14, 0, 0], [14, 0, 0], [0, 0.5, -16], [-14, 0, 0.2], [14, 0, 0.2], [0, -1.2, 0]];
  updaters.push((dt, t) => {
    planes.forEach((p, i) => {
      p.pos.addScaledVector(p.dir, p.speed * dt);
      if (p.pos.length() > 2800) spawn(p, false);
      const right = new THREE.Vector3(-p.dir.z, 0, p.dir.x);
      const strobe = (t + p.phase) % 1.2 < 0.06 || ((t + p.phase) % 1.2 > 0.16 && (t + p.phase) % 1.2 < 0.22) ? 9 : 0;
      const beacon = (t * 1.1 + p.phase) % 1 < 0.15 ? 5 : 0.05;
      const colors = [[4, 0.15, 0.1], [0.15, 4, 0.5], [2.5, 2.5, 2.5], [strobe, strobe, strobe], [strobe, strobe, strobe], [beacon, 0.1, 0.05]];
      for (let k = 0; k < LIGHTS; k++) {
        const [lx, ly, lz] = local[k];
        const o = (i * LIGHTS + k) * 3;
        planePos[o] = p.pos.x + right.x * lx + p.dir.x * lz;
        planePos[o + 1] = p.pos.y + ly;
        planePos[o + 2] = p.pos.z + right.z * lx + p.dir.z * lz;
        planeCol.set(colors[k], o);
      }
    });
    planeGeo.attributes.position.needsUpdate = true;
    planeGeo.attributes.color.needsUpdate = true;
  });

  // ---------- helicopter circling the landmark with a searchlight ----------
  {
    const heli = new THREE.Group();
    const light = beam(24, 320, [0.85, 0.92, 1.0], 0.12);
    light.rotation.x = 0.55;
    heli.add(light);
    const hp = new Float32Array(9);
    const hc = new Float32Array(9);
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.BufferAttribute(hp, 3));
    hg.setAttribute('color', new THREE.BufferAttribute(hc, 3));
    const hpts = new THREE.Points(hg, new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, vertexColors: true, fog: false }));
    hpts.frustumCulled = false;
    scene.add(heli, hpts);
    updaters.push((dt, t) => {
      const a = t * 0.07;
      const r = 260;
      heli.position.set(Math.cos(a) * r, 230 + Math.sin(t * 0.3) * 8, Math.sin(a) * r);
      heli.rotation.y = -a + Math.sin(t * 0.25) * 0.6;
      const tail = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
      const right = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const pts = [heli.position.clone().addScaledVector(right, 2), heli.position.clone().addScaledVector(right, -2), heli.position.clone().addScaledVector(tail, -7)];
      const blink = (t % 1) < 0.12 ? 6 : 0.05;
      const cols = [[0.2, 4, 0.6], [4, 0.2, 0.1], [blink, blink, blink]];
      pts.forEach((p, k) => {
        hp.set([p.x, p.y, p.z], k * 3);
        hc.set(cols[k], k * 3);
      });
      hg.attributes.position.needsUpdate = true;
      hg.attributes.color.needsUpdate = true;
    });
  }

  // ---------- searchlights on top of the landmark ----------
  const beams = [];
  for (let i = 0; i < 2; i++) {
    const pivot = new THREE.Group();
    pivot.position.set(0, landmarkTop + 6, 0);
    const b = beam(30, 1000, [0.55, 0.8, 1.0], 0.28);
    b.rotation.x = Math.PI - 0.45;
    pivot.add(b);
    scene.add(pivot);
    beams.push(pivot);
  }
  updaters.push((dt, t) => beams.forEach((b, i) => (b.rotation.y = t * 0.35 + i * Math.PI)));

  // ---------- red aviation beacons on masts and spires ----------
  const beaconMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.15, 0.1) });
  const beacons = new THREE.InstancedMesh(new THREE.SphereGeometry(0.7, 10, 8), beaconMat, antennaTips.length);
  const dummy = new THREE.Object3D();
  antennaTips.forEach((p, i) => {
    dummy.position.copy(p);
    dummy.updateMatrix();
    beacons.setMatrixAt(i, dummy.matrix);
  });
  scene.add(beacons);
  updaters.push((dt, t) => {
    const on = Math.sin(t * 3) > 0.2;
    beaconMat.color.setRGB(on ? 4 : 0.25, on ? 0.15 : 0.01, on ? 0.1 : 0.01);
  });

  return {
    update(dt, t) {
      for (const u of updaters) u(dt, t);
    },
  };
}
