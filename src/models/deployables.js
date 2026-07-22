import * as THREE from 'three';
import { MAT } from './materials.js';

// Placeable functional objects. Fire-emitting ones expose userData.fire
// { light, flame, particles } so systems can animate flicker and toggle on/off.

function shadowize(o) { o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; }

function fireCluster(scale = 1) {
  const g = new THREE.Group();
  const flameMat = new THREE.MeshStandardMaterial({ color: 0x1a0d04, emissive: 0xff6a12, emissiveIntensity: 4, roughness: 1 });
  const flames = [];
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.12 * scale * (1 - i * 0.15), 0.4 * scale * (1 - i * 0.1), 7), flameMat);
    f.position.set((Math.random() - 0.5) * 0.1, 0.2 * scale + i * 0.05, (Math.random() - 0.5) * 0.1);
    g.add(f); flames.push(f);
  }
  const light = new THREE.PointLight(0xff8a3a, 8 * scale, 22 * scale, 2);
  light.position.y = 0.5 * scale;
  light.castShadow = true;
  light.shadow.mapSize.set(512, 512);
  g.add(light);
  g.userData.fireParts = { flames, light, mat: flameMat };
  return g;
}

export function makeCampfire() {
  const g = new THREE.Group();
  const stoneMat = MAT.rock(0x77726a);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.14 + Math.random() * 0.05), stoneMat);
    s.position.set(Math.cos(a) * 0.5, 0.1, Math.sin(a) * 0.5);
    s.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    g.add(s);
  }
  const logMat = MAT.wood(0x4a3320);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI;
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6), logMat);
    log.rotation.set(Math.PI / 2, a, 0);
    log.position.y = 0.12;
    g.add(log);
  }
  const fire = fireCluster(1);
  g.add(fire);
  g.userData = {
    type: 'deployable', deployable: 'campfire', interact: 'cook',
    fire: fire.userData.fireParts, warmth: 12, warmthRadius: 7,
    slots: 2, aabbs: [{ cx: 0, cy: 0.2, cz: 0, hx: 0.6, hy: 0.2, hz: 0.6 }],
  };
  return shadowize(g);
}

export function makeFurnace() {
  const g = new THREE.Group();
  const mat = MAT.rock(0x6b6660);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 1.1, 10), mat);
  body.position.y = 0.55;
  g.add(body);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.55, 0.4, 10), mat);
  top.position.y = 1.2;
  g.add(top);
  // Glowing mouth.
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x120a05, emissive: 0xff5a10, emissiveIntensity: 3.5, roughness: 1 }));
  mouth.position.set(0, 0.45, 0.6);
  g.add(mouth);
  const light = new THREE.PointLight(0xff6a1a, 5, 14, 2);
  light.position.set(0, 0.5, 0.9);
  g.add(light);
  g.userData = {
    type: 'deployable', deployable: 'furnace', interact: 'smelt',
    fire: { flames: [mouth], light, mat: mouth.material }, warmth: 8, warmthRadius: 5,
    slots: 3, aabbs: [{ cx: 0, cy: 0.6, cz: 0, hx: 0.65, hy: 0.6, hz: 0.65 }],
  };
  return shadowize(g);
}

export function makeSleepingBag() {
  const g = new THREE.Group();
  const mat = MAT.cloth(0x9a3b2a);
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 2.0), mat);
  pad.position.y = 0.06;
  g.add(pad);
  const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.16, 0.4), MAT.cloth(0xb8a884));
  pillow.position.set(0, 0.14, -0.75);
  g.add(pillow);
  // Rolled-back top blanket.
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.9, 8), mat);
  roll.rotation.z = Math.PI / 2;
  roll.position.set(0, 0.18, 0.8);
  g.add(roll);
  g.userData = {
    type: 'deployable', deployable: 'sleepingBag', interact: 'setspawn',
    aabbs: [],
  };
  return shadowize(g);
}

export function makeStorageBox() {
  const g = new THREE.Group();
  const mat = MAT.wood(0x8a5f30);
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.6, 0.6), mat);
  body.position.y = 0.3;
  g.add(body);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.12, 0.62), MAT.wood(0x6f4a24));
  lid.position.y = 0.64;
  g.add(lid);
  // Metal bands.
  const band = MAT.darkMetal();
  for (const x of [-0.35, 0.35]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.64, 0.64), band);
    b.position.set(x, 0.32, 0);
    g.add(b);
  }
  g.userData = {
    type: 'deployable', deployable: 'box', interact: 'storage',
    slots: 18, aabbs: [{ cx: 0, cy: 0.35, cz: 0, hx: 0.52, hy: 0.35, hz: 0.32 }],
  };
  return shadowize(g);
}

export const DEPLOYABLE_MODELS = {
  campfire: makeCampfire,
  furnace: makeFurnace,
  sleepingBag: makeSleepingBag,
  box: makeStorageBox,
};
