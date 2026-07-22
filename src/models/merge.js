import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Collapse a multi-mesh group into one mesh per material by baking each child's
// local transform into a cloned geometry and merging. A pine tree goes from
// ~6 draw calls to 2 (bark + needles), which is the single biggest win for the
// forest performance problem. userData (colliders, harvest data) is preserved.
export function mergeByMaterial(group) {
  group.updateMatrixWorld(true);
  const buckets = new Map();
  group.traverse((o) => {
    if (!o.isMesh) return;
    const key = o.material.uuid;
    const geo = o.geometry.clone();
    geo.applyMatrix4(o.matrixWorld);      // group is at the origin during build
    // Keep only the attributes every primitive shares so the merge is valid.
    for (const name of Object.keys(geo.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') geo.deleteAttribute(name);
    }
    if (!buckets.has(key)) buckets.set(key, { material: o.material, geos: [] });
    buckets.get(key).geos.push(geo);
  });

  const out = new THREE.Group();
  for (const { material, geos } of buckets.values()) {
    let merged = null;
    try { merged = geos.length > 1 ? mergeGeometries(geos, false) : geos[0]; } catch (e) { merged = null; }
    if (!merged) {
      for (const g of geos) { const m = new THREE.Mesh(g, material); m.castShadow = true; m.receiveShadow = true; out.add(m); }
      continue;
    }
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true; mesh.receiveShadow = true;
    out.add(mesh);
  }
  out.userData = group.userData;
  return out;
}
