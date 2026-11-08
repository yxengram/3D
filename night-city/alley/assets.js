import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MODEL_IDS = [
  'WetFloorSign_01', 'utility_box_02', 'utility_box_01', 'cardboard_box_01', 'trashbag', 'metal_trash_can',
  'street_lamp_02', 'industrial_wall_lamp', 'security_light', 'pull_chain_light_socket', 'exterior_aircon_unit',
  'modular_fire_escape', 'modular_airduct_rectangular_01', 'modular_industrial_pipes_01',
  'rollershutter_door', 'rollershutter_window_01', 'modular_urban_apartments_facade', 'water_manhole_cover',
  'plastic_crate_01', 'barrel_03', 'potted_plant_02', 'street_rat', 'wooden_crate_02', 'old_tyre',
];

// Real-world size of each scanned texture in metres (from Poly Haven).
export const TEXTURE_SIZES = {
  asphalt_02: 3,
  brick_wall_001: 3,
  medieval_red_brick: 2,
  painted_plaster_wall: 2,
  worn_plaster_wall: 1.8,
  concrete_wall_006: 2,
};

export async function loadAssets(renderer, onProgress) {
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => onProgress(loaded / Math.max(total, 1));

  const gltfLoader = new GLTFLoader(manager);
  const texLoader = new THREE.TextureLoader(manager);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const models = {};
  const modelJobs = MODEL_IDS.map(async (id) => {
    models[id] = await gltfLoader.loadAsync(`./assets/models/${id}/${id}.gltf`);
  });

  const textures = {};
  const texJobs = Object.keys(TEXTURE_SIZES).map(async (id) => {
    const load = async (name, srgb) => {
      const t = await texLoader.loadAsync(`./assets/textures/${id}/${name}.jpg`);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = aniso;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    const [map, normal, arm] = await Promise.all([load('diff', true), load('nor_gl', false), load('arm', false)]);
    textures[id] = { map, normal, arm, size: TEXTURE_SIZES[id] };
  });

  await Promise.all([...modelJobs, ...texJobs]);
  return { models, textures };
}

// A PBR material from a Poly Haven texture set. `repeat` is texture repeats per UV unit.
// glTF meshes expect flipY = false; plain three.js geometry expects flipY = true.
export function surfaceMaterial(set, { repeat = 1, flipY = true, color = 0xffffff, normalScale = 1, roughness = 1 } = {}) {
  const prep = (t) => {
    const c = t.clone();
    c.flipY = flipY;
    c.repeat.set(repeat, repeat);
    c.needsUpdate = true;
    return c;
  };
  return new THREE.MeshStandardMaterial({
    color,
    map: prep(set.map),
    normalMap: prep(set.normal),
    normalScale: new THREE.Vector2(normalScale, flipY ? normalScale : -normalScale),
    roughnessMap: prep(set.arm),
    aoMap: prep(set.arm),
    roughness,
    metalness: 0,
  });
}

// Index the meshes/groups of a glTF scene by node name.
export function indexNodes(gltf) {
  const map = {};
  gltf.scene.traverse((o) => {
    if (o.name && !(o.name in map)) map[o.name] = o;
  });
  return map;
}
