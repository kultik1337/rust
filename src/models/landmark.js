import * as THREE from 'three';
import { MAT } from './materials.js';

// A tall procedural stone beacon that acts as a landmark in the big world: it is
// visible from far away and its crystal glows at night. Returns a group with
// userData.beaconLight (a PointLight to modulate by time of day) and a collider
// radius so the player can't walk through it.
export function makeBeacon() {
  const g = new THREE.Group();
  const stone = MAT.rock(0x8f897e);
  const H = 26;
  const tiers = 7;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const r = 2.6 * (1 - t) + 0.7;
    const h = H / tiers;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r, h + 0.15, 8), stone);
    seg.position.y = i * h + h / 2;
    seg.rotation.y = i * 0.4;
    seg.castShadow = true; seg.receiveShadow = true;
    g.add(seg);
    // Ledges between tiers.
    if (i < tiers - 1) {
      const ledge = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r * 0.9, 0.2, 8), stone);
      ledge.position.y = (i + 1) * h;
      g.add(ledge);
    }
  }

  // Glowing crystal on top.
  const crystalMat = new THREE.MeshStandardMaterial({
    color: 0x123033, emissive: 0x3fe0ff, emissiveIntensity: 3.5, roughness: 0.3, metalness: 0.1,
  });
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(1.3, 0), crystalMat);
  crystal.position.y = H + 1.4;
  crystal.castShadow = true;
  g.add(crystal);

  const light = new THREE.PointLight(0x5fe6ff, 0, 90, 2);
  light.position.y = H + 1.4;
  g.add(light);

  // A few floating shards orbiting the crystal.
  const shards = new THREE.Group();
  shards.position.y = H + 1.4;
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), crystalMat);
    const a = (i / 5) * Math.PI * 2;
    s.position.set(Math.cos(a) * 2.2, Math.sin(a * 2) * 0.6, Math.sin(a) * 2.2);
    shards.add(s);
  }
  g.add(shards);

  g.userData = {
    type: 'landmark', name: 'The Beacon',
    beaconLight: light, crystal, shards,
    collider: { radius: 2.4, height: H },
  };
  return g;
}
