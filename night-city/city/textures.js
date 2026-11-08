import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

// Scanned CC0 texture sets from Poly Haven (see assets/CREDITS.md) and their real-world size in metres.
const SETS = {
  concrete_tile_facade: 2.09,
  exterior_wall_cladding_03: 1.96,
  exterior_wall_cladding_02: 1.99,
  beige_wall_002: 3,
  rectangular_facade_tiles_02: 2.11,
  white_sandstone_blocks_02: 2,
  brick_wall_001: 3,
  concrete_wall_006: 2,
  tarred_gravel: 2.2,
  gravel_concrete: 2.12,
  aerial_asphalt_01: 30,
  asphalt_02: 3,
  square_concrete_pavers: 1.8,
  aerial_grass_rock: 15,
  metal_plate_02: 2,
};

export async function loadTextures(renderer, onProgress) {
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => onProgress(loaded / Math.max(total, 1));
  const loader = new THREE.TextureLoader(manager);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const tex = {};
  const jobs = Object.entries(SETS).map(async ([id, size]) => {
    const load = async (name, srgb) => {
      const t = await loader.loadAsync(`./assets/textures/${id}/${name}.jpg`);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = aniso;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    const [map, normal, arm] = await Promise.all([load('diff', true), load('nor_gl', false), load('arm', false)]);
    tex[id] = { map, normal, arm, size };
  });

  // Night-time city HDRI, used only for reflections. Its brightly lit pavement would make every
  // glass tower look like it stands on a floodlit plaza, so the lower hemisphere is dimmed.
  const hdrJob = new RGBELoader(manager)
    .setDataType(THREE.FloatType)
    .loadAsync('./assets/hdri/shanghai_bund_1k.hdr')
    .then((hdr) => {
      const { data, width, height } = hdr.image;
      for (let y = Math.floor(height * 0.5); y < height; y++) {
        const k = 0.12 + 0.5 * Math.max(0, 1 - (y - height * 0.5) / (height * 0.06));
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          data[i] *= k;
          data[i + 1] *= k;
          data[i + 2] *= k;
        }
      }
      hdr.needsUpdate = true;
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      return hdr;
    });

  const [, hdr] = await Promise.all([Promise.all(jobs), hdrJob]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(hdr).texture;
  hdr.dispose();
  pmrem.dispose();
  return { tex, env };
}

// UVs in metres, projected along each vertex's dominant normal axis ("box mapping").
// Geometry must already be in world space.
export function boxUV(geo) {
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  const uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ay >= ax && ay >= az) uv.setXY(i, p.getX(i), -p.getZ(i));
    else if (ax >= az) uv.setXY(i, -p.getZ(i) * Math.sign(n.getX(i)), p.getY(i));
    else uv.setXY(i, p.getX(i) * Math.sign(n.getZ(i)), p.getY(i));
  }
  uv.needsUpdate = true;
  return geo;
}

// A PBR material for box-mapped geometry: textures repeat once per real-world texture size.
export function pbr(set, { color = 0xffffff, roughness = 1, metalness = 0, normalScale = 1 } = {}) {
  const prep = (t) => {
    const c = t.clone();
    c.repeat.set(1 / set.size, 1 / set.size);
    c.needsUpdate = true;
    return c;
  };
  return new THREE.MeshStandardMaterial({
    color,
    map: prep(set.map),
    normalMap: prep(set.normal),
    normalScale: new THREE.Vector2(normalScale, normalScale),
    roughnessMap: prep(set.arm),
    roughness,
    metalness,
  });
}
