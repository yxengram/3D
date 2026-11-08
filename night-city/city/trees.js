import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Scanned trees from Poly Haven, thinned out for real time with tools/reduce_tree.py.
//   height: metres at scale 1;  near: how many of the closest trees are drawn as real meshes;
//   warm: orange street-lamp light falling on the canopy
const SPECIES = {
  street: { url: './assets/trees/street_tree/tree.gltf', height: 8.5, near: 30, warm: 0.3 },
  park: { url: './assets/trees/park_tree/tree.gltf', height: 13, near: 10, warm: 0.12 },
  bush: { url: './assets/trees/bush_tree/tree.gltf', height: 6, near: 16, warm: 0.12 },
};
const NEAR_DIST = 70; // closer than this a tree is a real mesh, further away a billboard (impostor)

// Impostor atlas: each tree is photographed from 8 directions at 2 heights.
const COLS = 8;
const ROWS = 2;
const FRAME = 256;
const ELEV = [0.1, 0.72]; // camera elevation of each row, radians

export function loadTreeModels(manager) {
  const loader = new GLTFLoader(manager);
  return Promise.all(
    Object.entries(SPECIES).map(async ([kind, sp]) => [kind, (await loader.loadAsync(sp.url)).scene])
  ).then(Object.fromEntries);
}

// Bake the model's parts into model space: trunk base at the origin, `height` metres tall.
function prepare(root, height, warm) {
  root.updateMatrixWorld(true);
  const parts = [];
  root.traverse((o) => {
    if (o.isMesh) parts.push({ geo: o.geometry.clone().applyMatrix4(o.matrixWorld), mat: o.material });
  });
  const box = new THREE.Box3();
  for (const p of parts) {
    p.geo.computeBoundingBox();
    box.union(p.geo.boundingBox);
  }
  // centre of the trunk where it meets the ground
  let bx = 0, bz = 0, n = 0;
  const lowY = box.min.y + (box.max.y - box.min.y) * 0.03;
  for (const p of parts) {
    const pos = p.geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) < lowY) {
        bx += pos.getX(i);
        bz += pos.getZ(i);
        n++;
      }
    }
  }
  const s = height / (box.max.y - box.min.y);
  const m = new THREE.Matrix4().makeScale(s, s, s).multiply(new THREE.Matrix4().makeTranslation(-bx / n, -box.min.y, -bz / n));
  for (const p of parts) {
    p.geo.applyMatrix4(m);
    p.geo.computeBoundingSphere();
    p.mat = treeMaterial(p.mat, warm);
  }
  const sphere = new THREE.Box3().setFromPoints(parts.flatMap((p) => {
    p.geo.computeBoundingBox();
    return [p.geo.boundingBox.min, p.geo.boundingBox.max];
  })).getBoundingSphere(new THREE.Sphere());
  return { parts, sphere };
}

// The scanned leaves are real geometry, so no transparency is needed; street lamps add a warm glow.
function treeMaterial(src, warm) {
  const m = src.clone();
  m.transparent = false;
  m.alphaTest = 0;
  m.depthWrite = true;
  m.side = THREE.DoubleSide;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uWarm = { value: new THREE.Color(1.0, 0.6, 0.28).multiplyScalar(warm) };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uWarm;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uWarm;');
  };
  m.customProgramCacheKey = () => 'tree-' + warm;
  return m;
}

// Render the tree from COLS x ROWS directions into one texture, lit like the city.
function bakeImpostor(renderer, cityScene, tree) {
  const tmp = new THREE.Scene();
  tmp.environment = cityScene.environment;
  tmp.environmentIntensity = cityScene.environmentIntensity;
  cityScene.children.filter((o) => o.isLight).forEach((l) => tmp.add(l.clone()));
  for (const p of tree.parts) tmp.add(new THREE.Mesh(p.geo, p.mat));

  const { center, radius: R } = tree.sphere;
  const cam = new THREE.OrthographicCamera(-R, R, R, -R, 0.1, R * 6);
  const frameRT = new THREE.WebGLRenderTarget(FRAME, FRAME, { type: THREE.HalfFloatType, samples: 4 });
  const atlas = new THREE.WebGLRenderTarget(FRAME * COLS, FRAME * ROWS, {
    type: THREE.HalfFloatType,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
  });
  const copy = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: { map: { value: frameRT.texture } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D map; varying vec2 vUv; void main() { gl_FragColor = texture2D(map, vUv); }',
      blending: THREE.NoBlending,
      depthTest: false,
      depthWrite: false,
    })
  );
  copy.frustumCulled = false;
  const copyCam = new THREE.Camera();

  const prevTarget = renderer.getRenderTarget();
  const prevColor = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  const prevAutoClear = renderer.autoClear;
  renderer.autoClear = false;
  renderer.setClearColor(0x000000, 0);
  renderer.setRenderTarget(atlas);
  renderer.clear();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const az = (c / COLS) * Math.PI * 2;
      const el = ELEV[r];
      cam.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(R * 3).add(center);
      cam.lookAt(center);
      renderer.setRenderTarget(frameRT);
      renderer.clear();
      renderer.render(tmp, cam);
      atlas.viewport.set(c * FRAME, r * FRAME, FRAME, FRAME);
      renderer.setRenderTarget(atlas);
      renderer.render(copy, copyCam);
    }
  }
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevColor, prevAlpha);
  renderer.autoClear = prevAutoClear;
  frameRT.dispose();
  copy.geometry.dispose();
  copy.material.dispose();
  return atlas.texture;
}

const IMPOSTOR_VS = /* glsl */ `
  uniform vec3 uCenter;
  uniform float uRadius;
  uniform float uNearDist;
  varying vec2 vUv;
  varying vec4 vFrame; // azimuth frame a, frame b, blend between them, blend between rows
  #include <fog_pars_vertex>
  void main() {
    vec3 base = instanceMatrix[3].xyz;
    float s = length(instanceMatrix[0].xyz);
    vec3 axisX = instanceMatrix[0].xyz / s;
    float cy = axisX.x, sy = -axisX.z; // cos / sin of the tree's yaw
    vec3 centre = base + vec3(cy * uCenter.x + sy * uCenter.z, uCenter.y, -sy * uCenter.x + cy * uCenter.z) * s;
    vec3 toCam = normalize(cameraPosition - centre);
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
    vec3 up = cross(toCam, right);
    vec3 wp = centre + (right * position.x + up * position.y) * uRadius * s;
    // which baked view matches the direction we look at the tree from (in the tree's own frame)
    vec2 local = vec2(cy * toCam.x - sy * toCam.z, sy * toCam.x + cy * toCam.z);
    float f = mod(atan(local.x, local.y) / 6.2831853 * ${COLS}.0 + ${COLS}.0, ${COLS}.0);
    float el = asin(clamp(toCam.y, -1.0, 1.0));
    vFrame = vec4(floor(f), mod(floor(f) + 1.0, ${COLS}.0), fract(f), clamp((el - ${ELEV[0]}) / ${ELEV[1] - ELEV[0]}, 0.0, 1.0));
    vUv = position.xy * 0.5 + 0.5;
    vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    // the closest trees are drawn as real meshes instead
    if (length(cameraPosition - base) < uNearDist) gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
    #include <fog_vertex>
  }
`;

const IMPOSTOR_FS = /* glsl */ `
  uniform sampler2D uAtlas;
  varying vec2 vUv;
  varying vec4 vFrame;
  #include <fog_pars_fragment>
  vec4 view(float col, float row) {
    return texture2D(uAtlas, vec2((col + vUv.x) / ${COLS}.0, (row + vUv.y) / ${ROWS}.0));
  }
  void main() {
    vec4 low = mix(view(vFrame.x, 0.0), view(vFrame.y, 0.0), vFrame.z);
    vec4 high = mix(view(vFrame.x, 1.0), view(vFrame.y, 1.0), vFrame.z);
    vec4 c = mix(low, high, vFrame.w);
    if (c.a < 0.3) discard;
    // colours were rendered over black, so un-premultiply; alpha to coverage smooths the edges
    float a = clamp((c.a - 0.3) / max(fwidth(c.a), 1e-3) + 0.5, 0.0, 1.0);
    gl_FragColor = vec4(c.rgb / c.a, a);
    #include <fog_fragment>
  }
`;

// spots: [{ kind, x, y, z, s }] -> real meshes near the camera, impostors everywhere else.
export function buildTrees({ renderer, scene, models, spots }) {
  const dummy = new THREE.Object3D();
  const groups = [];
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  for (const [kind, sp] of Object.entries(SPECIES)) {
    const list = spots.filter((p) => p.kind === kind);
    if (!list.length) continue;
    const tree = prepare(models[kind], sp.height, sp.warm);
    const atlas = bakeImpostor(renderer, scene, tree);

    // one matrix per tree: position, random yaw, scale
    const matrices = new Float32Array(list.length * 16);
    const pos = new Float32Array(list.length * 3);
    list.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, rnd() * Math.PI * 2, 0);
      dummy.scale.setScalar(p.s);
      dummy.updateMatrix();
      dummy.matrix.toArray(matrices, i * 16);
      pos.set([p.x, p.y, p.z], i * 3);
    });

    const uniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { uAtlas: { value: null }, uCenter: { value: tree.sphere.center }, uRadius: { value: tree.sphere.radius }, uNearDist: { value: 0 } },
    ]);
    uniforms.uAtlas.value = atlas;
    const impostors = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({ uniforms, vertexShader: IMPOSTOR_VS, fragmentShader: IMPOSTOR_FS, fog: true, alphaToCoverage: true }),
      list.length
    );
    impostors.instanceMatrix.array.set(matrices);
    impostors.frustumCulled = false;
    scene.add(impostors);

    const near = tree.parts.map((p) => {
      const m = new THREE.InstancedMesh(p.geo, p.mat, sp.near);
      m.count = 0;
      m.frustumCulled = false;
      scene.add(m);
      return m;
    });
    groups.push({ sp, list, matrices, pos, uniforms, near, order: new Uint32Array(list.length), dist: new Float32Array(list.length) });
  }

  const last = new THREE.Vector3(Infinity, 0, 0);
  return {
    update(camera) {
      if (camera.position.distanceToSquared(last) < 0.01) return;
      last.copy(camera.position);
      const { x, y, z } = camera.position;
      for (const g of groups) {
        let n = 0;
        for (let i = 0; i < g.list.length; i++) {
          const dx = g.pos[i * 3] - x, dy = g.pos[i * 3 + 1] - y, dz = g.pos[i * 3 + 2] - z;
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d < NEAR_DIST) {
            g.dist[i] = d;
            g.order[n++] = i;
          }
        }
        const idx = Array.from(g.order.subarray(0, n)).sort((a, b) => g.dist[a] - g.dist[b]);
        const count = Math.min(n, g.sp.near);
        // impostors take over beyond the last real tree
        g.uniforms.uNearDist.value = n > count ? (g.dist[idx[count - 1]] + g.dist[idx[count]]) / 2 : NEAR_DIST;
        for (const m of g.near) {
          for (let k = 0; k < count; k++) m.instanceMatrix.array.set(g.matrices.subarray(idx[k] * 16, idx[k] * 16 + 16), k * 16);
          m.count = count;
          m.instanceMatrix.needsUpdate = true;
        }
      }
    },
  };
}
