import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BLOCKS, BLOCK, ROAD, PITCH, HALF, LANES, PARKING_LANE, roadCenter, blockCenter, inIntersection, rand, rr, pick } from './config.js';

const CAR_COUNT = 900;
const CAR_COLORS = [0x1a1a1f, 0x2b2f3a, 0x8a8f98, 0x7a1010, 0x0f2a55, 0xd8a400, 0xe8e8ea, 0x3d4a3a];

export function buildStreets({ scene, tex }) {
  const dummy = new THREE.Object3D();
  const updaters = [];

  function instanced(geo, mat, items, setter, colorOf) {
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    items.forEach((it, i) => {
      dummy.position.set(0, 0, 0);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      setter(it, dummy);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      if (colorOf) mesh.setColorAt(i, colorOf(it, i));
    });
    scene.add(mesh);
    return mesh;
  }

  // ---------- road surface: 30 m aerial asphalt for the big picture, 3 m scan for close-ups ----------
  {
    const macro = tex.aerial_asphalt_01, detail = tex.asphalt_02;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, {
        uMacro: { value: macro.map }, uMacroArm: { value: macro.arm },
        uDetail: { value: detail.map }, uDetailN: { value: detail.normal }, uDetailArm: { value: detail.arm },
      });
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGPos;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvGPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vGPos;
          uniform sampler2D uMacro, uMacroArm, uDetail, uDetailN, uDetailArm;`)
        .replace('#include <map_fragment>', `
          vec2 gp = vec2(vGPos.x, -vGPos.z);
          vec3 macroC = texture2D(uMacro, gp / 30.0).rgb;
          vec3 detailC = texture2D(uDetail, gp / 3.0).rgb;
          diffuseColor.rgb = macroC * (0.35 + 1.3 * dot(detailC, vec3(0.3333))) * 0.42;`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = clamp(0.5 * texture2D(uMacroArm, gp / 30.0).g + 0.5 * texture2D(uDetailArm, gp / 3.0).g, 0.4, 1.0) * 0.82;`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          vec3 dn = texture2D(uDetailN, gp / 3.0).xyz * 2.0 - 1.0;
          normal = normalize((viewMatrix * vec4(normalize(vec3(dn.x, dn.z, -dn.y)), 0.0)).xyz);`);
    };
    mat.customProgramCacheKey = () => 'city-asphalt';
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), mat);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
  }

  // ---------- lane markings ----------
  // Each road has a double yellow centre line, dashed lane lines, parking edge lines and stop lines.
  const flat = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const yellow = [];
  const white = [];
  const segLen = PITCH - ROAD - 11;
  for (let r = 0; r <= BLOCKS; r++) {
    const rc = roadCenter(r);
    for (let k = 0; k < BLOCKS; k++) {
      const mid = blockCenter(k);
      for (const axis of [0, 1]) {
        const at = (along, off, len, wid, list) => list.push({ axis, along, off: rc + off, len, wid });
        for (const s of [-1, 1]) {
          at(mid, s * 0.14, segLen, 0.12, yellow);
          at(mid, s * 4.65, segLen, 0.13, white);
          for (let d = -segLen / 2 + 2; d < segLen / 2 - 2; d += 9) at(mid + d, s * 2.35, 3, 0.12, white);
        }
      }
    }
  }
  // stop lines across the incoming half of each road, just before the crosswalk
  for (let i = 0; i <= BLOCKS; i++) {
    for (let j = 0; j <= BLOCKS; j++) {
      const X = roadCenter(i), Z = roadCenter(j);
      for (const s of [-1, 1]) {
        white.push({ axis: 0, along: X - s * (ROAD / 2 + 4.3), off: Z + s * 2.35, len: 0.45, wid: 4.6 });
        white.push({ axis: 1, along: Z + s * (ROAD / 2 + 4.3), off: X + s * 2.35, len: 0.45, wid: 4.6 });
      }
    }
  }
  const placeLine = (l, d) => {
    if (l.axis === 0) d.position.set(l.along, 0.03, l.off);
    else {
      d.position.set(l.off, 0.03, l.along);
      d.rotation.y = Math.PI / 2;
    }
    d.scale.set(l.len, 1, l.wid);
  };
  instanced(flat, new THREE.MeshBasicMaterial({ color: 0x7a5f1c }), yellow, placeLine);
  instanced(flat, new THREE.MeshBasicMaterial({ color: 0x6a6a6c }), white, placeLine);

  // zebra crossings
  const stripes = [];
  for (let i = 0; i <= BLOCKS; i++) {
    for (let j = 0; j <= BLOCKS; j++) {
      const ix = roadCenter(i), iz = roadCenter(j);
      for (let s = -ROAD / 2 + 1; s <= ROAD / 2 - 1; s += 1.3) {
        for (const side of [-1, 1]) {
          stripes.push([ix + side * (ROAD / 2 + 2.2), iz + s, 0]);
          stripes.push([ix + s, iz + side * (ROAD / 2 + 2.2), Math.PI / 2]);
        }
      }
    }
  }
  instanced(new THREE.PlaneGeometry(3, 0.65).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x77777a }), stripes, ([x, z, rot], d) => {
    d.position.set(x, 0.035, z);
    d.rotation.y = rot;
  });

  // ---------- street lamps with light pools, and street trees ----------
  const lamps = [];
  const trees = [];
  const kiosks = [];
  for (let r = 0; r <= BLOCKS; r++) {
    const rc = roadCenter(r);
    for (let t = -HALF; t <= HALF; t += 16) {
      for (const s of [-1, 1]) {
        if (!inIntersection(t, 1.5)) {
          lamps.push([t, rc + s * (ROAD / 2 + 0.7), 0, -s]);
          lamps.push([rc + s * (ROAD / 2 + 0.7), t, -s, 0]);
        }
        if (!inIntersection(t + 8, 2.5)) {
          trees.push([t + 8, rc + s * (ROAD / 2 + 1.6)]);
          trees.push([rc + s * (ROAD / 2 + 1.6), t + 8]);
        }
        if (!inIntersection(t + 4, 3) && rand() < 0.09) {
          kiosks.push([t + 4, rc + s * (ROAD / 2 + 1.5), 0]);
        }
        if (!inIntersection(t + 12, 3) && rand() < 0.09) {
          kiosks.push([rc + s * (ROAD / 2 + 1.5), t + 12, 1]);
        }
      }
    }
  }
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2c33, roughness: 0.45, metalness: 0.8 });
  instanced(new THREE.CylinderGeometry(0.12, 0.18, 8.2, 8), poleMat, lamps, ([x, z], d) => d.position.set(x, 4.1, z));
  instanced(new THREE.BoxGeometry(0.14, 0.14, 1.8), poleMat, lamps, ([x, z, dx, dz], d) => {
    d.position.set(x + dx * 0.9, 8.1, z + dz * 0.9);
    d.rotation.y = Math.atan2(dx, dz);
  });
  instanced(new THREE.BoxGeometry(0.5, 0.18, 1.0), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.0, 0.9) }), lamps, ([x, z, dx, dz], d) => {
    d.position.set(x + dx * 1.8, 8.0, z + dz * 1.8);
    d.rotation.y = Math.atan2(dx, dz);
  });
  const poolTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  instanced(new THREE.PlaneGeometry(14, 14).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({
    map: poolTex, color: 0xffa04a, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false,
  }), lamps, ([x, z, dx, dz], d) => d.position.set(x + dx * 3, 0.06, z + dz * 3));

  // tree pits with cast-iron grates (the trees themselves are real models, see trees.js)
  instanced(new THREE.BoxGeometry(1.5, 0.04, 1.5), new THREE.MeshStandardMaterial({ color: 0x15130f, roughness: 0.7, metalness: 0.5 }), trees, ([x, z], d) => d.position.set(x, 0.41, z));
  const streetTrees = trees.map(([x, z]) => ({ kind: 'street', x, y: 0.4, z, s: rr(0.85, 1.15) }));

  // backlit advertising kiosks on the pavements
  const kioskColors = [[2.6, 2.4, 2.1], [2.2, 1.0, 2.2], [0.9, 2.0, 2.6], [2.6, 1.6, 0.7], [1.2, 2.5, 1.4]];
  instanced(new THREE.BoxGeometry(1.25, 1.9, 0.22), new THREE.MeshBasicMaterial(), kiosks, ([x, z, axis], d) => {
    d.position.set(x, 1.4, z);
    d.rotation.y = axis ? 0 : Math.PI / 2;
  }, () => new THREE.Color(...pick(kioskColors)));
  instanced(new THREE.BoxGeometry(1.4, 2.4, 0.18), poleMat, kiosks, ([x, z, axis], d) => {
    d.position.set(x, 1.2, z);
    d.rotation.y = axis ? 0 : Math.PI / 2;
    d.scale.set(1, 1, 0.8);
  });

  // ---------- traffic lights ----------
  // Four signal masts per crossing; masts over the east-west road control x traffic, the others z traffic.
  const signals = [];
  for (let i = 0; i <= BLOCKS; i++) {
    for (let j = 0; j <= BLOCKS; j++) {
      const X = roadCenter(i), Z = roadCenter(j);
      const c = ROAD / 2 + 0.9;
      const offset = (i + j) * 1.7;
      signals.push({ x: X + c, z: Z + c, dx: 0, dz: -1, axis: 0, offset });
      signals.push({ x: X - c, z: Z - c, dx: 0, dz: 1, axis: 0, offset });
      signals.push({ x: X - c, z: Z + c, dx: 1, dz: 0, axis: 1, offset });
      signals.push({ x: X + c, z: Z - c, dx: -1, dz: 0, axis: 1, offset });
    }
  }
  const sigMat = new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.5, metalness: 0.7 });
  instanced(new THREE.CylinderGeometry(0.11, 0.14, 6.6, 8), sigMat, signals, (s, d) => d.position.set(s.x, 3.3, s.z));
  instanced(new THREE.BoxGeometry(0.1, 0.1, 5.2), sigMat, signals, (s, d) => {
    d.position.set(s.x + s.dx * 2.6, 6.45, s.z + s.dz * 2.6);
    d.rotation.y = Math.atan2(s.dx, s.dz);
  });
  instanced(new THREE.BoxGeometry(0.42, 1.15, 0.36), sigMat, signals, (s, d) => d.position.set(s.x + s.dx * 5, 6.05, s.z + s.dz * 5));
  const lampGeo = new THREE.SphereGeometry(0.13, 10, 8);
  const signalLamps = [0.36, 0, -0.36].map((dy) =>
    instanced(lampGeo, new THREE.MeshBasicMaterial(), signals, (s, d) => d.position.set(s.x + s.dx * 5, 6.05 + dy, s.z + s.dz * 5), () => new THREE.Color(0, 0, 0))
  );
  const ON = [new THREE.Color(6, 0.25, 0.12), new THREE.Color(6, 3.2, 0.3), new THREE.Color(0.25, 6, 2.0)];
  const OFF = [new THREE.Color(0.08, 0.01, 0.01), new THREE.Color(0.08, 0.05, 0.01), new THREE.Color(0.01, 0.07, 0.03)];
  let lastPhaseKey = '';
  updaters.push((dt, t) => {
    // only push new colours when a light changes (every second is plenty)
    const key = Math.floor(t);
    if (key === lastPhaseKey) return;
    lastPhaseKey = key;
    signals.forEach((s, k) => {
      const p = (t + s.offset) % 26;
      // axis 0: green 0-11, amber 11-13, red after; axis 1 is the mirror image
      const q = s.axis === 0 ? p : (p + 13) % 26;
      const state = q < 11 ? 2 : q < 13 ? 1 : 0;
      for (let lamp = 0; lamp < 3; lamp++) signalLamps[lamp].setColorAt(k, lamp === state ? ON[lamp] : OFF[lamp]);
    });
    signalLamps.forEach((m) => (m.instanceColor.needsUpdate = true));
  });

  // ---------- traffic ----------
  // low-poly sedan: side profile extruded across the width; length along z, wheels on the ground at y = 0
  const extrudeX = (shape, width) => {
    const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 4 });
    g.rotateY(-Math.PI / 2);
    g.translate(width / 2, 0, 0);
    return g;
  };
  const bodyGeo = extrudeX(new THREE.Shape()
    .moveTo(-2.2, 0.3).lineTo(-2.26, 0.62).lineTo(-2.08, 0.88).lineTo(-1.25, 0.94)
    .lineTo(-0.72, 1.36).lineTo(0.34, 1.39).lineTo(1.0, 0.96).lineTo(2.05, 0.84)
    .lineTo(2.26, 0.58).lineTo(2.2, 0.3).closePath(), 1.78);
  const cabinGeo = extrudeX(new THREE.Shape()
    .moveTo(-1.18, 0.95).lineTo(-0.7, 1.33).lineTo(0.32, 1.36).lineTo(0.94, 0.97).closePath(), 1.82);
  const wheelGeo = mergeGeometries([[1.35, 0.86], [1.35, -0.86], [-1.35, 0.86], [-1.35, -0.86]].map(([z, x]) =>
    new THREE.CylinderGeometry(0.33, 0.33, 0.24, 12).rotateZ(Math.PI / 2).translate(x, 0.33, z)));
  const paint = new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0.75 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x0b0e14, roughness: 0.08, metalness: 0.9 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.7 });
  const pair = (w, h, d, gap) => mergeGeometries([
    new THREE.BoxGeometry(w, h, d).translate(-gap, 0, 0),
    new THREE.BoxGeometry(w, h, d).translate(gap, 0, 0),
  ]);

  // parked cars along the kerbs
  const parked = [];
  for (let r = 0; r <= BLOCKS; r++) {
    const rc = roadCenter(r);
    for (let t = -HALF + 3; t <= HALF; t += 6.2) {
      if (inIntersection(t, 7)) continue;
      for (const s of [-1, 1]) {
        if (rand() < 0.22) parked.push({ axis: 0, x: t, z: rc + s * PARKING_LANE, rot: s > 0 ? Math.PI / 2 : -Math.PI / 2 });
        if (rand() < 0.22) parked.push({ axis: 1, x: rc - s * PARKING_LANE, z: t, rot: s > 0 ? 0 : Math.PI });
      }
    }
  }
  parked.forEach((p) => (p.rot += rr(-0.03, 0.03)));
  const placeParked = (p, d) => {
    d.position.set(p.x, 0, p.z);
    d.rotation.y = p.rot;
  };
  instanced(bodyGeo, paint, parked, placeParked, () => new THREE.Color(pick(CAR_COLORS)));
  instanced(cabinGeo, glassMat, parked, placeParked);
  instanced(wheelGeo, tireMat, parked, placeParked);

  // moving traffic in two lanes each way
  const cars = [];
  for (let k = 0; k < CAR_COUNT; k++) {
    cars.push({
      axis: rand() < 0.5 ? 0 : 1,
      rc: roadCenter(Math.floor(rand() * (BLOCKS + 1))),
      dir: rand() < 0.5 ? 1 : -1,
      lane: pick(LANES),
      t: rr(-HALF, HALF),
      speed: rr(18, 40),
    });
  }
  const carBody = new THREE.InstancedMesh(bodyGeo, paint, CAR_COUNT);
  for (let k = 0; k < CAR_COUNT; k++) carBody.setColorAt(k, new THREE.Color(pick(CAR_COLORS)));
  const carCabin = new THREE.InstancedMesh(cabinGeo, glassMat, CAR_COUNT);
  const carWheels = new THREE.InstancedMesh(wheelGeo, tireMat, CAR_COUNT);
  const headLights = new THREE.InstancedMesh(pair(0.42, 0.16, 0.1, 0.62), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.5, 3.3, 2.8) }), CAR_COUNT);
  const tailLights = new THREE.InstancedMesh(pair(0.46, 0.14, 0.1, 0.62), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.5, 0.1, 0.1) }), CAR_COUNT);
  const carParts = [
    [carBody, new THREE.Matrix4()],
    [carCabin, new THREE.Matrix4()],
    [carWheels, new THREE.Matrix4()],
    [headLights, new THREE.Matrix4().makeTranslation(0, 0.7, 2.22)],
    [tailLights, new THREE.Matrix4().makeTranslation(0, 0.78, -2.24)],
  ];
  for (const [m] of carParts) {
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    scene.add(m);
  }
  const tmp = new THREE.Matrix4();
  updaters.push((dt) => {
    cars.forEach((c, k) => {
      c.t += c.dir * c.speed * dt;
      if (c.t > HALF) c.t -= 2 * HALF;
      if (c.t < -HALF) c.t += 2 * HALF;
      if (c.axis === 0) {
        dummy.position.set(c.t, 0, c.rc + c.dir * c.lane);
        dummy.rotation.set(0, c.dir > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
      } else {
        dummy.position.set(c.rc - c.dir * c.lane, 0, c.t);
        dummy.rotation.set(0, c.dir > 0 ? 0 : Math.PI, 0);
      }
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      for (const [mesh, off] of carParts) mesh.setMatrixAt(k, tmp.multiplyMatrices(dummy.matrix, off));
    });
    for (const [mesh] of carParts) mesh.instanceMatrix.needsUpdate = true;
  });

  return {
    trees: streetTrees,
    update(dt, t) {
      for (const u of updaters) u(dt, t);
    },
  };
}
