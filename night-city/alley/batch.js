import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Merges all static meshes under `root` that share a material into a single mesh,
// turning hundreds of kit pieces and props into a handful of draw calls.
export function batchStatic(root) {
  root.updateMatrixWorld(true);
  const groups = new Map();
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.userData.dynamic) return;
    if (Array.isArray(o.material)) return;
    for (let p = o.parent; p; p = p.parent) if (p.userData.dynamic) return;
    const attrs = Object.keys(o.geometry.attributes).sort().join(',');
    const key = `${o.material.uuid}|${attrs}|${o.layers.mask}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  });

  let merged = 0;
  for (const meshes of groups.values()) {
    if (meshes.length < 2) continue;
    const indexed = meshes.every((m) => m.geometry.index);
    const geos = meshes.map((m) => {
      let g = m.geometry.clone();
      if (!indexed && g.index) g = g.toNonIndexed();
      for (const name of Object.keys(g.morphAttributes)) delete g.morphAttributes[name];
      g.applyMatrix4(m.matrixWorld);
      return g;
    });
    const geometry = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!geometry) continue;
    const mesh = new THREE.Mesh(geometry, meshes[0].material);
    mesh.layers.mask = meshes[0].layers.mask;
    mesh.castShadow = meshes.some((m) => m.castShadow);
    mesh.receiveShadow = true;
    mesh.name = `batch:${meshes[0].material.name || meshes[0].name}`;
    root.add(mesh);
    for (const m of meshes) m.parent.remove(m);
    merged += meshes.length;
  }
  return merged;
}
